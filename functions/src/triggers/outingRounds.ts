/**
 * Outing Round Triggers — Track group completion & finalize outings
 *
 * Listens for round completions on outing-linked rounds.
 * When a group's round completes:
 *   1. Increments groupsComplete on the outing doc
 *   2. Updates the group's status to "complete"
 *   3. When ALL groups complete →
 *      a. Marks outing as "complete" and builds final leaderboard
 *      b. Sends outing_complete push notifications to all participants
 *      c. Writes outing_complete feed activity cards
 *
 * This runs AFTER the existing onRoundUpdated trigger (which creates score docs, etc.)
 * so individual player scores are already processed.
 *
 * File: functions/src/triggers/outingRounds.ts
 */

import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { sendRoundNotification } from "../notifications/roundNotifications";

const db = admin.firestore();

// ============================================================================
// TYPES
// ============================================================================

interface LeaderboardEntry {
  playerId: string;
  displayName: string;
  avatar: string | null;
  isGhost: boolean;
  groupId: string;
  groupName: string;
  grossScore: number;
  netScore: number;
  scoreToPar: number;
  courseHandicap: number;
  thru: number;
  position: number;
}

// ============================================================================
// onOutingRoundUpdated — detect round completion for outing-linked rounds
// ============================================================================

export const onOutingRoundUpdated = onDocumentUpdated(
  "rounds/{roundId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const roundId = event.params.roundId;

    if (!before || !after) return;

    // Only care about outing-linked rounds
    const outingId = after.outingId;
    if (!outingId) return;

    // Only care about status changes to "complete"
    if (before.status === "complete" || after.status !== "complete") return;

    const groupId = after.groupId;
    if (!groupId) {
      logger.warn(`Round ${roundId} has outingId but no groupId`);
      return;
    }

    logger.info(`🏁 Outing round complete: round=${roundId}, outing=${outingId}, group=${groupId}`);

    try {
      // ── Get outing document ──
      const outingRef = db.collection("outings").doc(outingId);
      const outingSnap = await outingRef.get();

      if (!outingSnap.exists) {
        logger.error(`Outing ${outingId} not found for round ${roundId}`);
        return;
      }

      const outingData = outingSnap.data()!;
      const groups = outingData.groups || [];

      // ── Update the completed group's status ──
      const updatedGroups = groups.map((g: any) => {
        if (g.groupId === groupId) {
          return { ...g, status: "complete" };
        }
        return g;
      });

      const groupsComplete = (outingData.groupsComplete || 0) + 1;
      const totalGroups = groups.length;
      const allComplete = groupsComplete >= totalGroups;

      // ── Build update payload ──
      const updatePayload: Record<string, any> = {
        groups: updatedGroups,
        groupsComplete,
      };

      if (allComplete) {
        logger.info(`🎉 All ${totalGroups} groups complete for outing ${outingId} — finalizing`);

        updatePayload.status = "complete";
        updatePayload.completedAt = admin.firestore.FieldValue.serverTimestamp();

        // Build final leaderboard from all round documents
        let finalLeaderboard: LeaderboardEntry[] = [];
        try {
          finalLeaderboard = await buildFinalLeaderboard(outingData, updatedGroups);
          updatePayload.finalLeaderboard = finalLeaderboard;
          logger.info(`✅ Final leaderboard built with ${finalLeaderboard.length} entries`);
        } catch (err) {
          logger.error(`Failed to build final leaderboard for outing ${outingId}:`, err);
        }

        // Update outing doc first
        await outingRef.update(updatePayload);
        logger.info(`✅ Outing ${outingId} marked complete`);

        // ══════════════════════════════════════════════════════════════
        // OUTING COMPLETE — Send notifications + write feed cards
        // ══════════════════════════════════════════════════════════════

        if (finalLeaderboard.length > 0) {
          await sendOutingCompleteNotifications(
            outingId,
            outingData,
            updatedGroups,
            finalLeaderboard
          );

          await writeOutingFeedActivity(
            outingId,
            outingData,
            updatedGroups,
            finalLeaderboard
          );
        }
      } else {
        // Not all complete yet — just update progress
        await outingRef.update(updatePayload);
        logger.info(`✅ Outing ${outingId} updated — ${groupsComplete}/${totalGroups} groups complete`);
      }
    } catch (err) {
      logger.error(`Error processing outing round completion:`, err);
    }
  }
);

// ============================================================================
// HELPER: Build final leaderboard from all round documents
// ============================================================================

async function buildFinalLeaderboard(
  outingData: any,
  groups: any[]
): Promise<LeaderboardEntry[]> {
  const entries: LeaderboardEntry[] = [];

  for (const group of groups) {
    if (!group.roundId) continue;

    const roundSnap = await db.collection("rounds").doc(group.roundId).get();
    if (!roundSnap.exists) continue;

    const roundData = roundSnap.data()!;
    const players = roundData.players || [];
    const holeData = roundData.holeData || {};
    const holePars = roundData.holePars || [];
    const holeCount = roundData.holeCount || 18;

    for (const player of players) {
      let grossScore = 0;
      let totalPar = 0;
      let holesPlayed = 0;

      for (let h = 1; h <= holeCount; h++) {
        const pd = holeData[String(h)]?.[player.playerId];
        const par = holePars[h - 1] || 4;
        totalPar += par;

        if (pd?.strokes && pd.strokes > 0) {
          grossScore += pd.strokes;
          holesPlayed++;
        }
      }

      entries.push({
        playerId: player.playerId,
        displayName: player.displayName,
        avatar: player.avatar || null,
        isGhost: player.isGhost || false,
        groupId: group.groupId,
        groupName: group.name,
        grossScore,
        netScore: grossScore - (player.courseHandicap || 0),
        scoreToPar: grossScore - totalPar,
        courseHandicap: player.courseHandicap || 0,
        thru: holesPlayed,
        position: 0,
      });
    }
  }

  // Sort by net score ascending (lowest wins), gross as tiebreaker
  entries.sort((a, b) => a.netScore - b.netScore || a.grossScore - b.grossScore);

  // Assign positions with ties
  let currentPos = 1;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].netScore !== entries[i - 1].netScore) {
      currentPos = i + 1;
    }
    entries[i].position = currentPos;
  }

  return entries;
}

// ============================================================================
// Send outing_complete push notifications
// ============================================================================

async function sendOutingCompleteNotifications(
  outingId: string,
  outingData: any,
  groups: any[],
  leaderboard: LeaderboardEntry[]
): Promise<void> {
  const courseName = outingData.courseName;
  const playerCount = leaderboard.length;
  const winner = leaderboard[0];
  const organizerId = outingData.organizerId;

  // Build a map of playerId → their roundId (for navigation)
  const playerRoundMap: Record<string, string> = {};
  for (const group of groups) {
    if (!group.roundId) continue;
    for (const pid of group.playerIds || []) {
      playerRoundMap[pid] = group.roundId;
    }
  }

  for (const entry of leaderboard) {
    // Skip ghosts
    if (entry.isGhost) continue;
    // Skip organizer if they launched it (they already know)
    // Actually, still notify — they want to see the final result

    const roundId = playerRoundMap[entry.playerId];
    if (!roundId) continue;

    let message: string;

    if (entry.position === 1) {
      message = `You won the outing at ${courseName}! Net ${entry.netScore} 🏆`;
    } else if (entry.position <= 3) {
      message = `You finished ${ordinal(entry.position)} at the ${courseName} outing — Net ${entry.netScore}`;
    } else {
      message = `Outing at ${courseName} complete — you finished ${ordinal(entry.position)} of ${playerCount}`;
    }

    try {
      await sendRoundNotification({
        type: "outing_complete",
        recipientUserId: entry.playerId,
        roundId,
        courseName,
        message,
        navigationTarget: "round",
      });
    } catch (err) {
      logger.error(`Outing complete notification failed for ${entry.displayName}:`, err);
    }
  }

  // Notify organizer if they're NOT a player (spectator organizer)
  const organizerInLeaderboard = leaderboard.some((e) => e.playerId === organizerId);
  if (!organizerInLeaderboard && organizerId) {
    const firstRoundId = groups[0]?.roundId;
    if (firstRoundId) {
      try {
        await sendRoundNotification({
          type: "outing_complete",
          recipientUserId: organizerId,
          roundId: firstRoundId,
          courseName,
          message: `Your outing at ${courseName} is complete! ${winner.displayName} wins with Net ${winner.netScore} 🏆`,
          navigationTarget: "round",
        });
      } catch (err) {
        logger.error(`Outing complete notification failed for organizer:`, err);
      }
    }
  }

  logger.info(`✅ Outing complete notifications sent for outing ${outingId}`);
}

// ============================================================================
// Write outing_complete feed activity cards
// ============================================================================

async function writeOutingFeedActivity(
  outingId: string,
  outingData: any,
  groups: any[],
  leaderboard: LeaderboardEntry[]
): Promise<void> {
  const now = Date.now();
  const batch = db.batch();

  const winner = leaderboard[0];
  const topFive = leaderboard.slice(0, 5).map((e) => ({
    position: e.position,
    playerId: e.playerId,
    displayName: e.displayName,
    avatar: e.avatar,
    grossScore: e.grossScore,
    netScore: e.netScore,
    scoreToPar: e.scoreToPar,
    groupName: e.groupName,
  }));

  // Build a map of playerId → their roundId
  const playerRoundMap: Record<string, string> = {};
  for (const group of groups) {
    if (!group.roundId) continue;
    for (const pid of group.playerIds || []) {
      playerRoundMap[pid] = group.roundId;
    }
  }

  // One card per on-platform participant
  for (const entry of leaderboard) {
    if (entry.isGhost) continue;

    const roundId = playerRoundMap[entry.playerId];

    const activityRef = db.collection("feedActivity").doc();
    batch.set(activityRef, {
      activityType: "outing_complete",
      userId: entry.playerId,
      displayName: entry.displayName,
      avatar: entry.avatar,

      // Outing context
      outingId,
      roundId: roundId || null,
      courseId: outingData.courseId,
      courseName: outingData.courseName,
      holeCount: outingData.holeCount,
      formatId: outingData.formatId,
      playerCount: leaderboard.length,
      groupCount: groups.length,

      // Winner
      winner: {
        playerId: winner.playerId,
        displayName: winner.displayName,
        avatar: winner.avatar,
        netScore: winner.netScore,
        grossScore: winner.grossScore,
      },

      // This player's result
      myPosition: entry.position,
      myGross: entry.grossScore,
      myNet: entry.netScore,

      // Top 5 leaderboard snapshot
      topFive,

      // Full leaderboard for tap-to-expand
      finalLeaderboard: leaderboard.map((e) => ({
        position: e.position,
        playerId: e.playerId,
        displayName: e.displayName,
        avatar: e.avatar,
        grossScore: e.grossScore,
        netScore: e.netScore,
        scoreToPar: e.scoreToPar,
        groupName: e.groupName,
      })),

      // Feed metadata
      regionKey: outingData.regionKey || null,
      location: outingData.location || null,
      privacy: "public",
      timestamp: now,
      createdAt: admin.firestore.Timestamp.fromMillis(now),
      ttl: admin.firestore.Timestamp.fromMillis(now + 30 * 24 * 60 * 60 * 1000),
    });
  }

  try {
    await batch.commit();
    logger.info(`✅ Outing feed activity written for ${leaderboard.filter((e) => !e.isGhost).length} players`);
  } catch (err) {
    logger.error(`Outing feed activity write failed for outing ${outingId}:`, err);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}