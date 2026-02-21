/**
 * Handicap Calculator - GHIN-Style
 *
 * Calculates a user's Handicap Index using the same methodology as GHIN:
 * - Score Differential = (113 / Slope) × (Adjusted Gross - Course Rating)
 * - Uses best N of last 20 differentials (GHIN lookup table)
 * - 9-hole rounds use expected score modeling
 * - Updates immediately on every score post
 *
 * Stores history in: users/{userId}/handicapHistory/{docId}
 * Updates current index on: users/{userId}.handicap
 *
 * Triggers:
 * - onStandaloneScoreCreated: scores/{scoreId}
 * - onLeagueScoreCreated: leagues/{leagueId}/scores/{scoreId}
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

const db = getFirestore();

// ============================================================================
// GHIN LOOKUP TABLE
// ============================================================================

/**
 * GHIN uses a variable number of best differentials based on total rounds.
 * This table maps total rounds → how many lowest differentials to average.
 */
function getDifferentialsToUse(totalRounds: number): number {
  if (totalRounds < 3) return 0;  // Not enough rounds
  if (totalRounds <= 4) return 1;
  if (totalRounds <= 5) return 1;
  if (totalRounds <= 6) return 2;
  if (totalRounds <= 8) return 2;
  if (totalRounds <= 11) return 3;
  if (totalRounds <= 14) return 4;
  if (totalRounds <= 16) return 5;
  if (totalRounds <= 18) return 6;
  if (totalRounds === 19) return 7;
  return 8; // 20+
}

/**
 * GHIN applies an adjustment when fewer rounds are available.
 * This makes the index slightly more conservative with limited data.
 */
function getAdjustment(totalRounds: number): number {
  if (totalRounds === 3) return -2.0;
  if (totalRounds === 4) return -1.0;
  if (totalRounds === 5) return 0;
  if (totalRounds === 6) return -1.0;
  // 7+ rounds: no adjustment
  return 0;
}

// ============================================================================
// SCORE DIFFERENTIAL CALCULATION
// ============================================================================

interface DifferentialInput {
  grossScore: number;
  courseRating: number;
  slopeRating: number;
  holes: number; // 9 or 18
  currentHandicapIndex?: number; // needed for 9-hole expected score
}

interface DifferentialResult {
  differential: number;
  is9Hole: boolean;
  expectedBackNine?: number;
}

/**
 * Calculate the Score Differential for a round.
 *
 * 18-hole: (113 / Slope) × (Gross - Rating)
 * 9-hole:  Calculate 9-hole diff, add expected back-9 based on handicap index
 */
function calculateDifferential(input: DifferentialInput): DifferentialResult {
  const { grossScore, courseRating, slopeRating, holes, currentHandicapIndex } = input;

  // Sanity check: if gross score is way below course rating, likely a 9-hole score marked as 18
  if (holes === 18 && grossScore < courseRating * 0.75) {
    console.log(`⚠️ Suspicious score: ${grossScore} gross on ${courseRating} rated course — treating as 9-hole`);
    return calculateDifferential({ ...input, holes: 9 });
  }

  if (holes === 18) {
    // Standard 18-hole differential
    const differential = (113 / slopeRating) * (grossScore - courseRating);
    return {
      differential: Math.round(differential * 10) / 10, // Round to 1 decimal
      is9Hole: false,
    };
  }

  // 9-hole calculation with expected score modeling
  // Step 1: Calculate the 9-hole differential
  const nineHoleDiff = (113 / slopeRating) * (grossScore - courseRating);

  // Step 2: Calculate expected back-9 differential
  // GHIN uses the player's handicap index / 2 as the expected 9-hole differential
  // If no index yet, use the 9-hole differential itself (assumes consistent play)
  const expectedBackNine = currentHandicapIndex != null && currentHandicapIndex > 0
    ? currentHandicapIndex / 2
    : nineHoleDiff; // Mirror the front 9 if no index

  // Step 3: Combine into 18-hole equivalent differential
  const combinedDifferential = nineHoleDiff + expectedBackNine;

  return {
    differential: Math.round(combinedDifferential * 10) / 10,
    is9Hole: true,
    expectedBackNine: Math.round(expectedBackNine * 10) / 10,
  };
}

// ============================================================================
// HANDICAP INDEX CALCULATION
// ============================================================================

/**
 * Calculate the Handicap Index from a set of differentials.
 * Uses GHIN lookup table to determine how many best rounds to average.
 * Applies adjustment for limited data.
 * Caps at 54.0 (GHIN maximum).
 */
function calculateHandicapIndex(differentials: number[]): number | null {
  const totalRounds = differentials.length;
  const numToUse = getDifferentialsToUse(totalRounds);

  if (numToUse === 0) return null; // Not enough rounds

  // Sort ascending (lowest first)
  const sorted = [...differentials].sort((a, b) => a - b);

  // Take the best N
  const bestDiffs = sorted.slice(0, numToUse);

  // Average them
  const average = bestDiffs.reduce((sum, d) => sum + d, 0) / bestDiffs.length;

  // Apply adjustment for limited rounds
  const adjustment = getAdjustment(totalRounds);
  let index = average + adjustment;

  // GHIN caps at 54.0
  index = Math.min(index, 54.0);

  // Floor at 0 (can't have negative handicap in our system, but GHIN allows + handicaps)
  // Actually GHIN does allow + handicaps (better than scratch), so we'll allow negative
  // But we'll round to 1 decimal
  index = Math.round(index * 10) / 10;

  return index;
}

// ============================================================================
// RECALCULATE USER HANDICAP
// ============================================================================

/**
 * Recalculate a user's handicap from their last 20 rounds in handicapHistory.
 * Updates users/{userId}.handicap with the new index.
 */
async function recalculateHandicap(userId: string): Promise<number | null> {
  // Get last 20 rounds, ordered by date
  const historySnap = await db
    .collection("users")
    .doc(userId)
    .collection("handicapHistory")
    .orderBy("playedAt", "desc")
    .limit(20)
    .get();

  if (historySnap.empty) {
    console.log(`⚠️ No handicap history for user ${userId}`);
    return null;
  }

  const differentials = historySnap.docs.map((doc) => doc.data().differential as number);
  const newIndex = calculateHandicapIndex(differentials);

  if (newIndex === null) {
    console.log(`⚠️ Not enough rounds (${differentials.length}) to calculate handicap`);
    return null;
  }

  // Update user doc
  await db.collection("users").doc(userId).update({
    handicap: newIndex,
    handicapUpdatedAt: Timestamp.now(),
    handicapRoundsUsed: differentials.length,
  });

  console.log(`✅ Updated handicap for ${userId}: ${newIndex} (from ${differentials.length} rounds)`);
  return newIndex;
}

// ============================================================================
// PROCESS A SCORE INTO HANDICAP HISTORY
// ============================================================================

interface ScoreData {
  userId: string;
  grossScore: number;
  courseRating?: number;
  slopeRating?: number;
  courseId?: number | string;
  courseName?: string;
  tees?: string;
  holes?: number;
  holeCount?: number;
  holesPerRound?: number;
  createdAt?: any;
  postedAt?: any;
}

/**
 * Process a score document into a handicap history entry and recalculate.
 * Skips scores missing courseRating/slopeRating.
 */
async function processScoreForHandicap(
  scoreData: ScoreData,
  scoreId: string,
  source: "standalone" | "league",
  leagueId?: string
): Promise<void> {
  const {
    userId,
    grossScore,
    courseRating,
    slopeRating,
    courseId,
    courseName,
    tees,
  } = scoreData;

  // Determine hole count from various possible field names
  const holes = scoreData.holes || scoreData.holeCount || scoreData.holesPerRound || 18;

  // Validate required fields
  if (!userId) {
    console.log("⚠️ Score missing userId, skipping handicap");
    return;
  }

  if (typeof grossScore !== "number" || grossScore <= 0) {
    console.log("⚠️ Score missing/invalid grossScore, skipping handicap");
    return;
  }

  if (!courseRating || !slopeRating) {
    console.log(`⚠️ Score ${scoreId} missing courseRating/slopeRating, skipping handicap`);
    return;
  }

  if (slopeRating < 55 || slopeRating > 155) {
    console.log(`⚠️ Score ${scoreId} has invalid slope ${slopeRating}, skipping`);
    return;
  }

  // Check for duplicate — don't process same score twice
  const existingSnap = await db
    .collection("users")
    .doc(userId)
    .collection("handicapHistory")
    .where("scoreId", "==", scoreId)
    .where("source", "==", source)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    console.log(`⏭️ Score ${scoreId} already in handicap history`);
    return;
  }

  // Get user's current handicap for 9-hole expected score calc
  const userDoc = await db.collection("users").doc(userId).get();
  const currentHandicap = userDoc.exists ? (userDoc.data()?.handicap || null) : null;

  // Calculate differential
  const result = calculateDifferential({
    grossScore,
    courseRating,
    slopeRating,
    holes,
    currentHandicapIndex: currentHandicap,
  });

  // Determine played date
  const playedAt = scoreData.postedAt || scoreData.createdAt || Timestamp.now();

  // Store in handicap history
  await db
    .collection("users")
    .doc(userId)
    .collection("handicapHistory")
    .add({
      scoreId,
      source, // "standalone" or "league"
      leagueId: leagueId || null,
      courseId: courseId || null,
      courseName: courseName || null,
      tees: tees || null,
      grossScore,
      courseRating,
      slopeRating,
      holes,
      differential: result.differential,
      is9Hole: result.is9Hole,
      expectedBackNine: result.expectedBackNine || null,
      playedAt,
      createdAt: Timestamp.now(),
    });

  console.log(
    `📊 Handicap entry: ${courseName || "Unknown"} | ` +
    `Gross: ${grossScore} | Rating: ${courseRating}/${slopeRating} | ` +
    `Diff: ${result.differential}${result.is9Hole ? " (9-hole)" : ""}`
  );

  // Recalculate handicap index
  await recalculateHandicap(userId);
}

// ============================================================================
// CLOUD FUNCTION TRIGGERS
// ============================================================================

/**
 * Trigger: Standalone score created (scores/{scoreId})
 * Processes the score for handicap calculation.
 */
export const onHandicapScoreCreated = onDocumentCreated(
  {
    document: "scores/{scoreId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const data = snap.data();
      if (!data) return;

      const scoreId = event.params.scoreId;
      console.log(`🏌️ Processing standalone score ${scoreId} for handicap`);

      await processScoreForHandicap(data as ScoreData, scoreId, "standalone");
    } catch (error) {
      console.error("🔥 Error processing standalone score for handicap:", error);
    }
  }
);

/**
 * Trigger: League score created (leagues/{leagueId}/scores/{scoreId})
 * Processes the score for handicap calculation.
 */
export const onHandicapLeagueScoreCreated = onDocumentCreated(
  {
    document: "leagues/{leagueId}/scores/{scoreId}",
    region: "us-central1",
  },
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const data = snap.data();
      if (!data) return;

      const scoreId = event.params.scoreId;
      const leagueId = event.params.leagueId;
      console.log(`🏌️ Processing league score ${scoreId} (league: ${leagueId}) for handicap`);

      await processScoreForHandicap(data as ScoreData, scoreId, "league", leagueId);
    } catch (error) {
      console.error("🔥 Error processing league score for handicap:", error);
    }
  }
);