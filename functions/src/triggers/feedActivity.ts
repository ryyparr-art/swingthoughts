/**
 * Feed Activity Writer
 *
 * Helper functions called from existing Cloud Function triggers
 * to write activity items to the `feedActivity` collection.
 *
 * These items are consumed by the client-side feedInsertProvider
 * to populate the "From the Field" activity carousel.
 *
 * Collection: feedActivity/{autoId}
 * TTL: 7 days (clean up via scheduled function or Firestore TTL policy)
 *
 * File: functions/src/feedActivity.ts
 */

import { FieldValue, getFirestore } from "firebase-admin/firestore";

const db = getFirestore();

// ============================================================================
// WRITE HELPERS
// ============================================================================

interface BaseActivityData {
  activityType: string;
  regionKey: string;
  createdAt: FieldValue;
  expiresAt: FieldValue; // for Firestore TTL
}

async function writeActivity(data: BaseActivityData & Record<string, any>): Promise<void> {
  try {
    await db.collection("feedActivity").add({
      ...data,
      createdAt: FieldValue.serverTimestamp(),
      // TTL: 7 days from now
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  } catch (err) {
    console.error(`⚠️ Failed to write feed activity (${data.activityType}):`, err);
  }
}

// ============================================================================
// PUBLIC API — called from existing triggers
// ============================================================================

/**
 * Call when a user earns a challenge badge.
 * Trigger: challengeEvaluator.ts → awardBadges()
 */
export async function writeBadgeEarnedActivity(
  userId: string,
  displayName: string,
  avatar: string | null,
  badgeId: string,
  badgeName: string,
  regionKey: string
): Promise<void> {
  await writeActivity({
    activityType: "badge_earned",
    userId,
    displayName,
    avatar,
    badgeId,
    badgeName,
    regionKey,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Call when a user claims a DTP pin.
 * Trigger: challengeEvaluator.ts → evaluateDTP()
 */
export async function writeDTPClaimedActivity(
  userId: string,
  displayName: string,
  avatar: string | null,
  courseName: string,
  hole: number,
  distance: number,
  regionKey: string
): Promise<void> {
  await writeActivity({
    activityType: "dtp_claimed",
    userId,
    displayName,
    avatar,
    courseName,
    hole,
    distance,
    regionKey,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Call when a user joins a league.
 * Trigger: onLeagueMemberAdded (or wherever member join is handled)
 */
export async function writeJoinedLeagueActivity(
  userId: string,
  displayName: string,
  avatar: string | null,
  leagueId: string,
  leagueName: string,
  leagueAvatar: string | null,
  regionKey: string
): Promise<void> {
  await writeActivity({
    activityType: "joined_league",
    userId,
    displayName,
    avatar,
    leagueId,
    leagueName,
    leagueAvatar,
    regionKey,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Call when someone posts a career-best round (partner only visibility).
 * Trigger: onScoreCreated — check if grossScore < user's previous best
 */
export async function writeLowRoundActivity(
  userId: string,
  displayName: string,
  avatar: string | null,
  score: number,
  courseName: string,
  scorePostId: string,
  regionKey: string
): Promise<void> {
  await writeActivity({
    activityType: "low_round",
    userId,
    displayName,
    avatar,
    score,
    courseName,
    scorePostId,
    regionKey,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Call when a new low leader is set at a course.
 * Trigger: onScoreCreated → leaderboard update logic
 */
export async function writeLowLeaderChangeActivity(
  userId: string,
  displayName: string,
  avatar: string | null,
  courseName: string,
  score: number,
  regionKey: string
): Promise<void> {
  await writeActivity({
    activityType: "low_leader_change",
    userId,
    displayName,
    avatar,
    courseName,
    score,
    regionKey,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Call when a user earns Scratch status (low leader at 2 courses).
 * Trigger: leaderboard update logic
 */
export async function writeScratchEarnedActivity(
  userId: string,
  displayName: string,
  avatar: string | null,
  courseNames: string[],
  regionKey: string
): Promise<void> {
  await writeActivity({
    activityType: "scratch_earned",
    userId,
    displayName,
    avatar,
    courseNames,
    regionKey,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Call when a user earns Ace status (low leader at 3 courses).
 * Trigger: leaderboard update logic
 */
export async function writeAceTierEarnedActivity(
  userId: string,
  displayName: string,
  avatar: string | null,
  courseNames: string[],
  regionKey: string
): Promise<void> {
  await writeActivity({
    activityType: "ace_tier_earned",
    userId,
    displayName,
    avatar,
    courseNames,
    regionKey,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: FieldValue.serverTimestamp(),
  });
}

/**
 * Call when a league week is finalized.
 * Trigger: onLeagueWeekFinalized
 */
export async function writeLeagueResultActivity(
  leagueId: string,
  leagueName: string,
  leagueAvatar: string | null,
  week: number,
  winnerName: string,
  winnerScore: number,
  regionKey: string
): Promise<void> {
  await writeActivity({
    activityType: "league_result",
    leagueId,
    leagueName,
    leagueAvatar,
    week,
    winnerName,
    winnerScore,
    regionKey,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: FieldValue.serverTimestamp(),
  });
}