/**
 * challengeRankingPoints.ts
 *
 * Wires challenge badge awards into the ST Power Ranking system.
 *
 * When a badge is earned in challengeEvaluator.ts, call
 * writeChallengePointsForBadge(userId, badgeId) to write a synthetic
 * playerRounds doc. The ranking engine picks it up on the next
 * calculatePlayerRanking call and it decays on the same 52-week
 * schedule as round points.
 *
 * File: functions/src/utils/challengeRankingPoints.ts
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { calculatePlayerRanking } from "./rankingEngine";

const db = getFirestore();

// ============================================================================
// BADGE TIER MAP
// ============================================================================

/**
 * Maps each challenge badge ID to its raw challenge point value.
 * Formula from spec: ChallengePoints = ChallengeBaseValue × 0.25
 *
 * Tiers:
 *   Common   (base 2.5)  → 0.625 pts  — par3, fir, gir
 *   Rare     (base 7.5)  → 1.875 pts  — birdie_streak, iron_player, dtp
 *   Legendary (base 25.0) → 6.25 pts  — ace
 *
 * Cumulative tiers:
 *   Amateur (3 badges)      → Rare     → 1.875
 *   Next Tour Player (5)    → Legendary → 6.25
 *   Tour Player (7)         → Legendary → 6.25
 */
export const BADGE_CHALLENGE_POINTS: Record<string, number> = {
  // Individual badges
  par3:          0.625,   // Common
  fir:           0.625,   // Common
  gir:           0.625,   // Common
  birdie_streak: 1.875,   // Rare
  iron_player:   1.875,   // Rare
  dtp:           1.875,   // Rare
  ace:           6.25,    // Legendary

  // Cumulative tier badges
  tier_amateur:        1.875,  // Rare — 3 badges earned
  tier_next_tour:      6.25,   // Legendary — 5 badges earned
  tier_tour:           6.25,   // Legendary — 7 badges earned
};

// ============================================================================
// WRITE CHALLENGE POINTS
// ============================================================================

/**
 * Called by challengeEvaluator.ts when a badge is awarded.
 *
 * Writes a synthetic playerRounds doc with roundPoints=0 and the
 * badge's challengePoints value. The ranking engine sums these up
 * alongside real round docs, applying the same 52-week decay.
 *
 * Doc ID convention: {userId}_challenge_{badgeId}
 * If the player earns the same badge again (re-registration after
 * losing DTP), the doc is overwritten with a fresh timestamp —
 * effectively resetting the decay clock on that badge's contribution.
 */
export async function writeChallengePointsForBadge(
  userId: string,
  badgeId: string
): Promise<void> {
  const points = BADGE_CHALLENGE_POINTS[badgeId];
  if (!points) {
    console.log(`⚠️ No challenge points defined for badge: ${badgeId} — skipping`);
    return;
  }

  try {
    const docId = `${userId}_challenge_${badgeId}`;

    // Fetch user data for denormalization
    const userSnap = await db.collection("users").doc(userId).get();
    const userData = userSnap.data() ?? {};

    await db.collection("playerRounds").doc(docId).set({
      userId,
      // Synthetic round — no real course/score data
      roundId: `challenge_${badgeId}`,
      courseId: 0,
      regionKey: userData.regionKey ?? "",
      netScore: 0,
      par: 0,
      slopeRating: 113,
      courseRating: null,
      handicapIndex: userData.handicap ?? null,
      fieldStrength: 0,
      formatType: "solo",
      gameFormatId: "stroke_play",
      roundPoints: 0,
      challengePoints: points,
      createdAt: Timestamp.now(),
    });

    console.log(`🏆 Challenge points written: ${userId} +${points} (${badgeId})`);

    // Immediately recalculate ranking so powerRating reflects the new badge
    await calculatePlayerRanking(
      userId,
      userData.displayName || "",
      userData.avatar || null,
      userData.regionKey || ""
    );

  } catch (err) {
    // Non-critical — ranking will self-correct on next round
    console.error(`❌ Failed to write challenge points for ${userId} / ${badgeId}:`, err);
  }
}