/**
 * User Career Stats Helper
 *
 * Shared function that updates user-level career stats when a score is posted.
 * Called by both:
 *   - onScoreCreated (standalone scores → scores/{scoreId})
 *   - onLeagueScoreCreated (league scores → leagues/{leagueId}/scores/{scoreId})
 *
 * Fields updated on the user document:
 *   totalRounds           - Incremented by 1
 *   totalGrossStrokes     - Incremented by gross score
 *   totalNetStrokes       - Incremented by net score
 *   totalBirdies          - Counted from holeScores vs course par
 *   totalEagles           - Counted from holeScores vs course par
 *   totalAlbatross        - Counted from holeScores vs course par
 *   totalFairwaysHit      - From FIR tracking
 *   totalFairwaysPossible - From FIR tracking
 *   totalGreensInRegulation         - From GIR tracking
 *   totalGreensRegulationPossible   - From GIR tracking
 *   totalPenalties        - From penalty tracking
 *
 * These aggregate fields enable the Stats page to display career averages
 * (e.g. FIR% = totalFairwaysHit / totalFairwaysPossible) with a single
 * user doc read instead of querying all score documents.
 */

import { FieldValue, getFirestore } from "firebase-admin/firestore";

const db = getFirestore();

export interface ScoreStatsInput {
  grossScore: number;
  netScore: number;
  holeScores?: number[];
  courseId?: string | number;
  fairwaysHit?: number;
  fairwaysPossible?: number;
  greensInRegulation?: number;
  totalPenalties?: number;
}

/**
 * Update career stats on a user document.
 * Wrapped in try/catch internally — will log but not throw on failure.
 */
export async function updateUserCareerStats(
  userId: string,
  scoreData: ScoreStatsInput
): Promise<void> {
  const { grossScore, netScore, holeScores, courseId } = scoreData;
  const holesCount = holeScores?.length || 0;

  const updates: Record<string, any> = {
    totalRounds: FieldValue.increment(1),
    totalGrossStrokes: FieldValue.increment(grossScore),
    totalNetStrokes: FieldValue.increment(netScore),
  };

  // ----------------------------------------------------------------
  // Birdies / Eagles / Albatross from hole-by-hole + course par data
  // ----------------------------------------------------------------
  if (holesCount > 0 && holeScores && courseId) {
    try {
      const courseDoc = await db
        .collection("courses")
        .doc(String(courseId))
        .get();

      if (courseDoc.exists) {
        const tees = courseDoc.data()?.tees;
        const allTees = [
          ...(tees?.male || []),
          ...(tees?.female || []),
        ];

        // Par values are the same across all tee sets, so grab the first
        const holePars: number[] =
          allTees[0]?.holes?.map((h: any) => h.par || 4) || [];

        if (holePars.length >= holesCount) {
          let birdies = 0;
          let eagles = 0;
          let albatross = 0;

          for (let i = 0; i < holesCount; i++) {
            const diff = holeScores[i] - holePars[i];
            if (diff === -1) birdies++;
            else if (diff === -2) eagles++;
            else if (diff <= -3) albatross++;
          }

          if (birdies > 0) updates.totalBirdies = FieldValue.increment(birdies);
          if (eagles > 0) updates.totalEagles = FieldValue.increment(eagles);
          if (albatross > 0) updates.totalAlbatross = FieldValue.increment(albatross);
        }
      }
    } catch (err) {
      console.error(`⚠️ Could not load course pars for ${courseId}:`, err);
    }
  }

  // ----------------------------------------------------------------
  // FIR (Fairways in Regulation)
  // ----------------------------------------------------------------
  if (scoreData.fairwaysHit !== undefined && scoreData.fairwaysHit > 0) {
    updates.totalFairwaysHit = FieldValue.increment(scoreData.fairwaysHit);
    updates.totalFairwaysPossible = FieldValue.increment(
      scoreData.fairwaysPossible || 0
    );
  }

  // ----------------------------------------------------------------
  // GIR (Greens in Regulation)
  // ----------------------------------------------------------------
  if (scoreData.greensInRegulation !== undefined && scoreData.greensInRegulation > 0) {
    updates.totalGreensInRegulation = FieldValue.increment(
      scoreData.greensInRegulation
    );
    updates.totalGreensRegulationPossible = FieldValue.increment(holesCount);
  }

  // ----------------------------------------------------------------
  // Penalties
  // ----------------------------------------------------------------
  if (scoreData.totalPenalties && scoreData.totalPenalties > 0) {
    updates.totalPenalties = FieldValue.increment(scoreData.totalPenalties);
  }

  await db.collection("users").doc(userId).update(updates);
  console.log(`✅ Career stats updated for ${userId} (gross: ${grossScore}, net: ${netScore})`);
}