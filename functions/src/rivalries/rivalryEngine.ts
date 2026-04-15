/**
 * Rivalry Engine — Head-to-head tracking between players
 *
 * Called from:
 *   - rounds.ts step 8 (after updateRecentPlayedWith)
 *   - outingRounds.ts (after outing completion)
 *
 * For every pair of on-platform players:
 *   1. Increment sharedRoundCounts on both user docs
 *   2. Create rivalry doc on first shared round (always — no threshold gate)
 *   3. If rivalry exists → compute round winner → update record
 *   4. Detect status changes → return RivalryChange[] for feed cards
 *
 * Rivalry announcement (rivalry_formed feed card + notification) is suppressed
 * until sharedCount reaches RIVALRY_THRESHOLD. This ensures all matches are
 * recorded from day one, while the user-facing rivalry only surfaces once the
 * relationship is meaningful.
 *
 * Rivalry ID is deterministic: sorted userId pair → "abc_xyz"
 *
 * File: functions/src/rivalries/rivalryEngine.ts
 */

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

const db = admin.firestore();

/**
 * Number of shared rounds before the rivalry is ANNOUNCED
 * (feed card + notification). The doc is created on round 1.
 */
const RIVALRY_THRESHOLD = 3;

/** Max recent results stored on rivalry doc */
const MAX_RECENT_RESULTS = 10;

/** Max rivalry_update feed cards per outing per user (prevent spam) */
export const MAX_RIVALRY_CARDS_PER_EVENT = 3;

// ============================================================================
// TYPES
// ============================================================================

export interface PlayerResult {
  userId: string;
  displayName: string;
  avatar?: string | null;
  netScore: number;
  grossScore: number;
  isGhost: boolean;
}

export interface RivalryContext {
  roundId?: string;
  outingId?: string;
  courseId: number;
  courseName: string;
  date: admin.firestore.Timestamp;
  regionKey?: string | null;
  location?: any;
}

export interface RivalryChange {
  type:
    | "lead_change"
    | "streak_broken"
    | "streak_extended"
    | "rivalry_formed"
    | "belt_claimed"
    | "tied_up"
    | "milestone";
  rivalryId: string;
  playerA: { userId: string; displayName: string; avatar?: string | null };
  playerB: { userId: string; displayName: string; avatar?: string | null };
  triggeredBy: string;
  message: string;
  record: { wins: number; losses: number; ties: number };
  /** Priority for feed card ordering (lower = more important) */
  priority: number;
}

interface RivalryDoc {
  playerA: { userId: string; displayName: string; avatar?: string | null };
  playerB: { userId: string; displayName: string; avatar?: string | null };
  /** Top-level array for Firestore security rule queries */
  playerIds: string[];
  record: { wins: number; losses: number; ties: number };
  recentResults: any[];
  currentStreak: { playerId: string; count: number };
  longestStreak: { playerId: string; count: number };
  beltHolder: string | null;
  totalMatches: number;
  firstMatchDate: admin.firestore.Timestamp;
  lastMatchDate: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

// ============================================================================
// MAIN: processRivalries
// ============================================================================

/**
 * Process rivalries for all player pairs from a completed round/outing.
 *
 * @param players - Array of player results (scores for this round)
 * @param context - Round/outing context (courseId, courseName, etc.)
 * @returns Array of rivalry changes for feed cards + notifications
 */
export async function processRivalries(
  players: PlayerResult[],
  context: RivalryContext
): Promise<RivalryChange[]> {
  // Filter to on-platform only (no ghosts)
  const onPlatform = players.filter((p) => !p.isGhost && p.userId);

  if (onPlatform.length < 2) {
    logger.info("⏭️ Skipping rivalry processing — fewer than 2 on-platform players");
    return [];
  }

  const allChanges: RivalryChange[] = [];

  // Generate all unique pairs
  const pairs: [PlayerResult, PlayerResult][] = [];
  for (let i = 0; i < onPlatform.length; i++) {
    for (let j = i + 1; j < onPlatform.length; j++) {
      pairs.push([onPlatform[i], onPlatform[j]]);
    }
  }

  logger.info(`🤝 Processing ${pairs.length} player pairs for rivalries`);

  // Cap at 200 pairs for safety (20-player outing = 190 pairs)
  const cappedPairs = pairs.slice(0, 200);

  // ── Batch all sharedRoundCounts increments upfront ──────────────────────
  // Previously: 2 transactions per pair = 380 transactions for a 20-player outing.
  // Now: 1 write per user doc regardless of how many pairs they appear in.
  // Build a map of userId → { otherUserId → incrementBy } then apply in one
  // update per user using FieldValue.increment (no read required).
  const incrementMap = new Map<string, Record<string, number>>();
  for (const [p1, p2] of cappedPairs) {
    const [playerA, playerB] = p1.userId < p2.userId ? [p1, p2] : [p2, p1];
    if (!incrementMap.has(playerA.userId)) incrementMap.set(playerA.userId, {});
    if (!incrementMap.has(playerB.userId)) incrementMap.set(playerB.userId, {});
    incrementMap.get(playerA.userId)![playerB.userId] =
      (incrementMap.get(playerA.userId)![playerB.userId] || 0) + 1;
    incrementMap.get(playerB.userId)![playerA.userId] =
      (incrementMap.get(playerB.userId)![playerA.userId] || 0) + 1;
  }

  // Apply all increments — one write per user, no transactions needed
  const incrementTasks = Array.from(incrementMap.entries()).map(async ([userId, increments]) => {
    const updates: Record<string, any> = {};
    for (const [otherId, count] of Object.entries(increments)) {
      updates[`sharedRoundCounts.${otherId}`] = FieldValue.increment(count);
    }
    try {
      await db.collection("users").doc(userId).update(updates);
    } catch (err) {
      logger.warn(`sharedRoundCounts batch update failed for ${userId}:`, err);
    }
  });
  await Promise.all(incrementTasks);
  logger.info(`✅ sharedRoundCounts updated for ${incrementMap.size} users`);

  // ── Now read current sharedRoundCounts to determine rivalry thresholds ──
  // Read all affected user docs in parallel (one read per user, not per pair)
  const userIds = Array.from(incrementMap.keys());
  const userDocs = await Promise.all(
    userIds.map((uid) => db.collection("users").doc(uid).get())
  );
  const sharedCountCache = new Map<string, Record<string, number>>();
  userDocs.forEach((snap) => {
    if (snap.exists) {
      sharedCountCache.set(snap.id, snap.data()?.sharedRoundCounts || {});
    }
  });

  // ── Process each pair using cached counts (no more per-pair transactions) ──
  for (const [p1, p2] of cappedPairs) {
    try {
      const changes = await processPlayerPair(p1, p2, context, sharedCountCache);
      allChanges.push(...changes);
    } catch (err) {
      logger.error(
        `Rivalry processing failed for ${p1.displayName} vs ${p2.displayName}:`,
        err
      );
    }
  }

  logger.info(`✅ Rivalry processing complete — ${allChanges.length} changes detected`);
  return allChanges;
}

// ============================================================================
// Process a single player pair
// ============================================================================

async function processPlayerPair(
  p1: PlayerResult,
  p2: PlayerResult,
  context: RivalryContext,
  sharedCountCache: Map<string, Record<string, number>>
): Promise<RivalryChange[]> {
  // Deterministic rivalry ID: sorted by userId
  const [playerA, playerB] =
    p1.userId < p2.userId ? [p1, p2] : [p2, p1];

  const rivalryId = `${playerA.userId}_${playerB.userId}`;

  // ── 1. Read sharedCount from cache (already incremented by caller) ──
  const countsA = sharedCountCache.get(playerA.userId) || {};
  const countsB = sharedCountCache.get(playerB.userId) || {};
  const sharedCount = Math.max(
    countsA[playerB.userId] || 0,
    countsB[playerA.userId] || 0
  );

  // ── 2. Determine round winner ──
  const winnerId = determineWinner(playerA, playerB);

  // ── 3. Check if rivalry doc exists ──
  const rivalryRef = db.collection("rivalries").doc(rivalryId);
  const rivalrySnap = await rivalryRef.get();
  const rivalryExists = rivalrySnap.exists;

  // ── 4. Create or update rivalry doc ──
  // Always create from round 1 — no threshold gate here.
  // The RIVALRY_THRESHOLD only controls when rivalry_formed is announced.
  if (!rivalryExists) {
    return await createRivalry(
      rivalryId,
      playerA,
      playerB,
      winnerId,
      context,
      sharedCount
    );
  } else {
    const before = rivalrySnap.data() as RivalryDoc;
    return await updateRivalry(
      rivalryId,
      rivalryRef,
      before,
      playerA,
      playerB,
      winnerId,
      context,
      sharedCount
    );
  }
}

// ============================================================================
// Determine winner from net scores
// ============================================================================

function determineWinner(
  playerA: PlayerResult,
  playerB: PlayerResult
): string | "tie" {
  if (playerA.netScore < playerB.netScore) return playerA.userId;
  if (playerB.netScore < playerA.netScore) return playerB.userId;
  // Tie on net → compare gross
  if (playerA.grossScore < playerB.grossScore) return playerA.userId;
  if (playerB.grossScore < playerA.grossScore) return playerB.userId;
  return "tie";
}

// ============================================================================
// Create new rivalry doc (called on first shared round)
// ============================================================================

async function createRivalry(
  rivalryId: string,
  playerA: PlayerResult,
  playerB: PlayerResult,
  winnerId: string | "tie",
  context: RivalryContext,
  sharedCount: number
): Promise<RivalryChange[]> {
  const now = admin.firestore.Timestamp.now();

  const record = { wins: 0, losses: 0, ties: 0 };
  if (winnerId === playerA.userId) record.wins = 1;
  else if (winnerId === playerB.userId) record.losses = 1;
  else record.ties = 1;

  const resultEntry = {
    roundId: context.roundId || null,
    outingId: context.outingId || null,
    date: context.date,
    winnerId,
    courseId: context.courseId,
    courseName: context.courseName,
    playerANet: playerA.netScore,
    playerBNet: playerB.netScore,
    margin: Math.abs(playerA.netScore - playerB.netScore),
  };

  const rivalryDoc: RivalryDoc = {
    playerA: {
      userId: playerA.userId,
      displayName: playerA.displayName,
      avatar: playerA.avatar || null,
    },
    playerB: {
      userId: playerB.userId,
      displayName: playerB.displayName,
      avatar: playerB.avatar || null,
    },
    playerIds: [playerA.userId, playerB.userId],
    record,
    recentResults: [resultEntry],
    currentStreak: {
      playerId: winnerId !== "tie" ? winnerId : "",
      count: winnerId !== "tie" ? 1 : 0,
    },
    longestStreak: {
      playerId: winnerId !== "tie" ? winnerId : "",
      count: winnerId !== "tie" ? 1 : 0,
    },
    beltHolder: winnerId !== "tie" ? winnerId : null,
    totalMatches: 1,
    firstMatchDate: now,
    lastMatchDate: now,
    updatedAt: now,
  };

  await db.collection("rivalries").doc(rivalryId).set(rivalryDoc);
  logger.info(
    `🆕 Rivalry doc created: ${playerA.displayName} vs ${playerB.displayName} ` +
    `(shared rounds: ${sharedCount}, announcing: ${sharedCount >= RIVALRY_THRESHOLD})`
  );

  // Only announce the rivalry once the threshold is reached.
  // If this is round 1 or 2, the doc is silently created with no feed card
  // or notification — the rivalry will surface in the locker once it has
  // enough matches to be meaningful.
  if (sharedCount < RIVALRY_THRESHOLD) {
    return [];
  }

  return [
    {
      type: "rivalry_formed",
      rivalryId,
      playerA: {
        userId: playerA.userId,
        displayName: playerA.displayName,
        avatar: playerA.avatar,
      },
      playerB: {
        userId: playerB.userId,
        displayName: playerB.displayName,
        avatar: playerB.avatar,
      },
      triggeredBy: winnerId !== "tie" ? winnerId : playerA.userId,
      message: `New rivalry: ${playerA.displayName} vs ${playerB.displayName} (${sharedCount} rounds together)`,
      record,
      priority: 4,
    },
  ];
}

// ============================================================================
// Update existing rivalry doc + detect status changes
// ============================================================================

async function updateRivalry(
  rivalryId: string,
  rivalryRef: admin.firestore.DocumentReference,
  before: RivalryDoc,
  playerA: PlayerResult,
  playerB: PlayerResult,
  winnerId: string | "tie",
  context: RivalryContext,
  sharedCount: number
): Promise<RivalryChange[]> {
  const now = admin.firestore.Timestamp.now();
  const changes: RivalryChange[] = [];

  // ── Compute new record ──
  const newRecord = { ...before.record };
  if (winnerId === playerA.userId) newRecord.wins++;
  else if (winnerId === playerB.userId) newRecord.losses++;
  else newRecord.ties++;

  // ── New result entry ──
  const resultEntry = {
    roundId: context.roundId || null,
    outingId: context.outingId || null,
    date: context.date,
    winnerId,
    courseId: context.courseId,
    courseName: context.courseName,
    playerANet: playerA.netScore,
    playerBNet: playerB.netScore,
    margin: Math.abs(playerA.netScore - playerB.netScore),
  };

  const newRecent = [resultEntry, ...before.recentResults].slice(0, MAX_RECENT_RESULTS);

  // ── Streak tracking ──
  let newStreak = { ...before.currentStreak };
  if (winnerId === "tie") {
    // Tie doesn't break or extend streak
  } else if (winnerId === before.currentStreak.playerId) {
    newStreak.count++;
  } else {
    newStreak = { playerId: winnerId, count: 1 };
  }

  const newLongest =
    newStreak.count > before.longestStreak.count
      ? { ...newStreak }
      : before.longestStreak;

  // ── Belt holder (best record in last 5 matches) ──
  const last5 = newRecent.slice(0, 5);
  let aWinsLast5 = 0;
  let bWinsLast5 = 0;
  for (const r of last5) {
    if (r.winnerId === playerA.userId) aWinsLast5++;
    else if (r.winnerId === playerB.userId) bWinsLast5++;
  }
  const newBeltHolder =
    aWinsLast5 > bWinsLast5
      ? playerA.userId
      : bWinsLast5 > aWinsLast5
      ? playerB.userId
      : before.beltHolder;

  const totalMatches = before.totalMatches + 1;

  // ── Write update ──
  await rivalryRef.update({
    record: newRecord,
    recentResults: newRecent,
    currentStreak: newStreak,
    longestStreak: newLongest,
    beltHolder: newBeltHolder,
    totalMatches,
    lastMatchDate: now,
    updatedAt: now,
    // Keep player info fresh
    "playerA.displayName": playerA.displayName,
    "playerA.avatar": playerA.avatar || null,
    "playerB.displayName": playerB.displayName,
    "playerB.avatar": playerB.avatar || null,
  });

  // ── Status changes only surface once the rivalry is announced ──
  // Before the threshold, we track silently but generate no feed cards.
  if (sharedCount < RIVALRY_THRESHOLD) {
    logger.info(
      `📊 Silent rivalry update: ${playerA.displayName} vs ${playerB.displayName} ` +
      `(shared: ${sharedCount}/${RIVALRY_THRESHOLD}, totalMatches: ${totalMatches})`
    );
    return [];
  }

  // ══════════════════════════════════════════════════════════════
  // STATUS CHANGE DETECTION (only after rivalry is announced)
  // ══════════════════════════════════════════════════════════════

  const oldRecord = before.record;
  const pA = before.playerA;
  const pB = before.playerB;

  const beforeLead = getLeader(oldRecord);
  const afterLead = getLeader(newRecord);

  // ── rivalry_formed: fires exactly once when threshold is crossed ──
  // This handles the case where the doc was created silently on round 1
  // and sharedCount hits RIVALRY_THRESHOLD on a later updateRivalry call.
  if (sharedCount === RIVALRY_THRESHOLD) {
    changes.push({
      type: "rivalry_formed",
      rivalryId,
      playerA: pA,
      playerB: pB,
      triggeredBy: winnerId !== "tie" ? winnerId : pA.userId,
      message: `New rivalry: ${pA.displayName} vs ${pB.displayName} (${sharedCount} rounds together)`,
      record: newRecord,
      priority: 4,
    });
    // Return early — don't stack rivalry_formed with other change cards
    // on the same round. The other changes will appear next round.
    return changes;
  }

  // ── Lead change ──
  if (beforeLead !== afterLead && afterLead !== "tied") {
    const leader = afterLead === "A" ? pA : pB;
    const trailer = afterLead === "A" ? pB : pA;
    const leaderWins = afterLead === "A" ? newRecord.wins : newRecord.losses;
    const trailerWins = afterLead === "A" ? newRecord.losses : newRecord.wins;

    changes.push({
      type: "lead_change",
      rivalryId,
      playerA: pA,
      playerB: pB,
      triggeredBy: leader.userId,
      message: `${leader.displayName} takes the lead over ${trailer.displayName} (${leaderWins}-${trailerWins})`,
      record: newRecord,
      priority: 1,
    });
  }

  // ── Tied up ──
  if (beforeLead !== "tied" && afterLead === "tied") {
    const tiedBy = winnerId !== "tie" ? winnerId : pA.userId;
    const tiedName = tiedBy === pA.userId ? pA.displayName : pB.displayName;
    const otherName = tiedBy === pA.userId ? pB.displayName : pA.displayName;

    changes.push({
      type: "tied_up",
      rivalryId,
      playerA: pA,
      playerB: pB,
      triggeredBy: tiedBy,
      message: `${tiedName} ties it up with ${otherName} (${newRecord.wins}-${newRecord.losses})`,
      record: newRecord,
      priority: 3,
    });
  }

  // ── Streak broken ──
  if (
    before.currentStreak.count >= 3 &&
    winnerId !== "tie" &&
    winnerId !== before.currentStreak.playerId
  ) {
    const breakerName = winnerId === pA.userId ? pA.displayName : pB.displayName;
    const streakName =
      before.currentStreak.playerId === pA.userId ? pA.displayName : pB.displayName;

    changes.push({
      type: "streak_broken",
      rivalryId,
      playerA: pA,
      playerB: pB,
      triggeredBy: winnerId,
      message: `${breakerName} snaps ${streakName}'s ${before.currentStreak.count}-match streak`,
      record: newRecord,
      priority: 2,
    });
  }

  // ── Streak extended (4+) ──
  if (
    newStreak.count >= 4 &&
    newStreak.playerId === before.currentStreak.playerId &&
    newStreak.count > before.currentStreak.count
  ) {
    const streakName = newStreak.playerId === pA.userId ? pA.displayName : pB.displayName;

    changes.push({
      type: "streak_extended",
      rivalryId,
      playerA: pA,
      playerB: pB,
      triggeredBy: newStreak.playerId,
      message: `${streakName} extends winning streak to ${newStreak.count}`,
      record: newRecord,
      priority: 5,
    });
  }

  // ── Belt claimed ──
  if (newBeltHolder && newBeltHolder !== before.beltHolder && before.beltHolder) {
    const claimerName = newBeltHolder === pA.userId ? pA.displayName : pB.displayName;
    const loserName = before.beltHolder === pA.userId ? pA.displayName : pB.displayName;

    changes.push({
      type: "belt_claimed",
      rivalryId,
      playerA: pA,
      playerB: pB,
      triggeredBy: newBeltHolder,
      message: `${claimerName} claims the belt from ${loserName}`,
      record: newRecord,
      priority: 2,
    });
  }

  // ── Milestone (every 10 matches) ──
  if (totalMatches % 10 === 0) {
    changes.push({
      type: "milestone",
      rivalryId,
      playerA: pA,
      playerB: pB,
      triggeredBy: winnerId !== "tie" ? winnerId : pA.userId,
      message: `${pA.displayName} vs ${pB.displayName} reaches ${totalMatches} matches!`,
      record: newRecord,
      priority: 6,
    });
  }

  return changes;
}

// ============================================================================
// Write rivalry feed activity cards
// ============================================================================

/**
 * Write rivalry_update feed activity cards for detected changes.
 * Both players in each rivalry get a card (perspective-adjusted on client).
 * Caps at MAX_RIVALRY_CARDS_PER_EVENT per user.
 */
export async function writeRivalryFeedCards(
  changes: RivalryChange[],
  context: RivalryContext
): Promise<void> {
  if (changes.length === 0) return;

  const now = Date.now();
  const batch = db.batch();

  // Sort by priority (lower = more important)
  const sorted = [...changes].sort((a, b) => a.priority - b.priority);

  // Track cards per user to enforce cap
  const cardsPerUser: Record<string, number> = {};

  for (const change of sorted) {
    if (!shouldSkipCard(change.playerA.userId, cardsPerUser)) {
      const ref = db.collection("feedActivity").doc();
      batch.set(ref, buildRivalryFeedCard(change, change.playerA.userId, context, now));
      cardsPerUser[change.playerA.userId] = (cardsPerUser[change.playerA.userId] || 0) + 1;
    }

    if (!shouldSkipCard(change.playerB.userId, cardsPerUser)) {
      const ref = db.collection("feedActivity").doc();
      batch.set(ref, buildRivalryFeedCard(change, change.playerB.userId, context, now));
      cardsPerUser[change.playerB.userId] = (cardsPerUser[change.playerB.userId] || 0) + 1;
    }
  }

  try {
    await batch.commit();
    logger.info(`✅ Rivalry feed cards written for ${sorted.length} changes`);
  } catch (err) {
    logger.error("Rivalry feed card write failed:", err);
  }
}

function shouldSkipCard(userId: string, cardsPerUser: Record<string, number>): boolean {
  return (cardsPerUser[userId] || 0) >= MAX_RIVALRY_CARDS_PER_EVENT;
}

function buildRivalryFeedCard(
  change: RivalryChange,
  forUserId: string,
  context: RivalryContext,
  now: number
): Record<string, any> {
  return {
    activityType: "rivalry_update",
    userId: forUserId,
    displayName:
      forUserId === change.playerA.userId
        ? change.playerA.displayName
        : change.playerB.displayName,
    avatar:
      forUserId === change.playerA.userId
        ? change.playerA.avatar || null
        : change.playerB.avatar || null,

    rivalryId: change.rivalryId,
    changeType: change.type,
    message: change.message,

    playerA: change.playerA,
    playerB: change.playerB,

    // Record always from playerA perspective — client adjusts for viewer
    record: change.record,

    roundId: context.roundId || null,
    outingId: context.outingId || null,
    courseId: context.courseId,
    courseName: context.courseName,

    regionKey: context.regionKey || null,
    location: context.location || null,
    privacy: "public",
    timestamp: now,
    createdAt: admin.firestore.Timestamp.fromMillis(now),
    ttl: admin.firestore.Timestamp.fromMillis(now + 30 * 24 * 60 * 60 * 1000),
  };
}

// ============================================================================
// Send rivalry notifications (significant changes only)
// ============================================================================

/**
 * Send push notifications for significant rivalry changes.
 * Only: lead_change, belt_claimed, streak_broken, rivalry_formed
 */
export async function sendRivalryNotifications(
  changes: RivalryChange[],
  sendNotification: (params: any) => Promise<void>
): Promise<void> {
  const NOTIFIABLE_TYPES: Set<string> = new Set([
    "lead_change",
    "belt_claimed",
    "streak_broken",
    "rivalry_formed",
  ]);

  for (const change of changes) {
    if (!NOTIFIABLE_TYPES.has(change.type)) continue;

    for (const player of [change.playerA, change.playerB]) {
      try {
        await sendNotification({
          type: "rivalry_update",
          recipientUserId: player.userId,
          message: change.message,
          rivalryId: change.rivalryId,
          changeType: change.type,
          navigationTarget: "profile",
        });
      } catch (err) {
        logger.error(`Rivalry notification failed for ${player.displayName}:`, err);
      }
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Determine who leads from playerA's perspective.
 * Returns "A" | "B" | "tied"
 */
function getLeader(record: { wins: number; losses: number }): "A" | "B" | "tied" {
  if (record.wins > record.losses) return "A";
  if (record.losses > record.wins) return "B";
  return "tied";
}