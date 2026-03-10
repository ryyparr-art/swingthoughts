/**
 * leaderboardPlayers.ts  (functions/src/utils/leaderboardPlayers.ts)
 *
 * Admin SDK version — used by Cloud Functions (scores.ts, leaderboardHelpers.ts).
 * The client-side counterpart lives in the app at utils/leaderboardPlayers.ts
 * and uses the firebase/firestore client SDK for the read queries.
 *
 * Inverted index collection: one document per player per course.
 * Doc ID: {userId}_{courseId}
 *
 * Powers:
 *   - Player / Partners filter on leaderboard screen (no collection scan)
 *   - SwingThoughts World Ranking (future)
 */

import { getFirestore } from "firebase-admin/firestore";

/* ================================================================ */
/* DOCUMENT SHAPE                                                   */
/* ================================================================ */

export interface LeaderboardPlayerEntry {
  userId: string;
  courseId: number;
  displayName: string;
  userAvatar: string | null;
  courseName: string;
  regionKey: string;

  // Best scores at this course
  bestGrossScore: number;
  bestNetScore: number;
  bestScoreToPar: number;

  // Course difficulty at time of best round — inputs for world ranking formula
  courseRating: number | null;
  slopeRating: number | null;
  tees: string | null;
  handicapIndex: number | null;

  location?: { city?: string; state?: string } | null;

  // Volume + recency — ranking weight inputs
  totalRoundsAtCourse: number;
  firstRoundAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  lastRoundAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface UpsertLeaderboardPlayerInput {
  userId: string;
  courseId: number;
  courseName: string;
  regionKey: string;
  displayName: string;
  userAvatar: string | null;
  grossScore: number;
  netScore: number;
  scoreToPar: number;
  courseRating?: number | null;
  slopeRating?: number | null;
  tees?: string | null;
  handicapIndex?: number | null;
  createdAt: FirebaseFirestore.Timestamp;
  location?: { city?: string; state?: string } | null;
}

/* ================================================================ */
/* WRITE                                                            */
/* ================================================================ */

/**
 * Upsert a player's entry for a course.
 *
 * First round → creates document.
 * Subsequent rounds → updates display info + round count.
 *                     Updates scores/difficulty only on personal best.
 *
 * Non-throwing — errors are logged but never propagate so a failure
 * here never blocks the score write pipeline.
 */
export async function upsertLeaderboardPlayer(
  input: UpsertLeaderboardPlayerInput
): Promise<void> {
  try {
    const db = getFirestore();
    const docId = `${input.userId}_${input.courseId}`;
    const ref = db.collection("leaderboardPlayers").doc(docId);
    const existing = await ref.get();

    if (existing.exists) {
      const data = existing.data() as LeaderboardPlayerEntry;
      const isPersonalBest = input.netScore < data.bestNetScore;

      const update: Record<string, any> = {
        displayName: input.displayName,
        userAvatar: input.userAvatar,
        lastRoundAt: input.createdAt,
        totalRoundsAtCourse: (data.totalRoundsAtCourse || 0) + 1,
      };

      if (isPersonalBest) {
        update.bestNetScore = input.netScore;
        update.bestGrossScore = input.grossScore;
        update.bestScoreToPar = input.scoreToPar;
        if (input.courseRating != null) update.courseRating = input.courseRating;
        if (input.slopeRating != null) update.slopeRating = input.slopeRating;
        if (input.tees != null) update.tees = input.tees;
        if (input.handicapIndex != null) update.handicapIndex = input.handicapIndex;
      }

      await ref.update(update);
    } else {
      await ref.set({
        userId: input.userId,
        courseId: input.courseId,
        displayName: input.displayName,
        userAvatar: input.userAvatar,
        courseName: input.courseName,
        regionKey: input.regionKey,
        bestGrossScore: input.grossScore,
        bestNetScore: input.netScore,
        bestScoreToPar: input.scoreToPar,
        courseRating: input.courseRating ?? null,
        slopeRating: input.slopeRating ?? null,
        tees: input.tees ?? null,
        handicapIndex: input.handicapIndex ?? null,
        location: input.location ?? null,
        totalRoundsAtCourse: 1,
        firstRoundAt: input.createdAt,
        lastRoundAt: input.createdAt,
      });
    }

    console.log(`✅ leaderboardPlayers upserted: ${input.userId} @ ${input.courseName}`);
  } catch (error) {
    // Non-critical — never block the caller
    console.error("❌ leaderboardPlayers upsert failed (non-critical):", error);
  }
}