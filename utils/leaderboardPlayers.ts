/**
 * leaderboardPlayers.ts  (utils/leaderboardPlayers.ts)
 *
 * Inverted index collection: one document per player per course.
 * Doc ID: {userId}_{courseId}
 *
 * Powers:
 *   - Player filter on leaderboard screen (no collection scan)
 *   - Partners filter on leaderboard screen (no collection scan)
 *   - SwingThoughts World Ranking (future)
 *
 * Write path (all three call upsertLeaderboardPlayer):
 *   1. onScoreCreated in scores.ts  — live writes going forward
 *   2. updateLeaderboard in leaderboardHelpers.ts — rebuild path
 *   3. rebuildLeaderboards() — backfill side effect via #2
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/constants/firebaseConfig";

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

  location?: { city?: string; state?: string };

  // Volume + recency — ranking weight inputs
  totalRoundsAtCourse: number;
  firstRoundAt: any;
  lastRoundAt: any;
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
  createdAt: any;
  location?: { city?: string; state?: string };
}

/* ================================================================ */
/* WRITE                                                            */
/* ================================================================ */

/**
 * Upsert a player's entry for a course.
 *
 * First round at this course → creates document.
 * Subsequent rounds → updates display info, round count, lastRoundAt.
 *                     Updates scores/difficulty only if this is a personal best.
 *
 * Non-throwing — errors are logged but never propagate so a failure
 * here never blocks the score write pipeline.
 */
export async function upsertLeaderboardPlayer(
  input: UpsertLeaderboardPlayerInput
): Promise<void> {
  try {
    const docId = `${input.userId}_${input.courseId}`;
    const ref = doc(db, "leaderboardPlayers", docId);
    const existing = await getDoc(ref);

    if (existing.exists()) {
      const data = existing.data() as LeaderboardPlayerEntry;
      const isPersonalBest = input.netScore < data.bestNetScore;

      const update: Partial<LeaderboardPlayerEntry> = {
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

      await setDoc(ref, update, { merge: true });
    } else {
      await setDoc(ref, {
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
      } as LeaderboardPlayerEntry);
    }

    console.log(`✅ leaderboardPlayers upserted: ${input.userId} @ ${input.courseName}`);
  } catch (error) {
    console.error("❌ leaderboardPlayers upsert failed (non-critical):", error);
  }
}

/* ================================================================ */
/* READ                                                             */
/* ================================================================ */

/**
 * All courseIds where a player has ever posted a score.
 */
export async function getCourseIdsForPlayer(userId: string): Promise<number[]> {
  try {
    const snap = await getDocs(
      query(collection(db, "leaderboardPlayers"), where("userId", "==", userId))
    );
    return snap.docs.map((d) => (d.data() as LeaderboardPlayerEntry).courseId);
  } catch (error) {
    console.error("❌ getCourseIdsForPlayer failed:", error);
    return [];
  }
}

/**
 * All courseIds where any of the given partners has ever posted a score.
 * Chunked to 30 per Firestore "in" limit.
 */
export async function getCourseIdsForPartners(partnerIds: string[]): Promise<number[]> {
  if (partnerIds.length === 0) return [];

  try {
    const chunks: string[][] = [];
    for (let i = 0; i < partnerIds.length; i += 30) {
      chunks.push(partnerIds.slice(i, i + 30));
    }

    const snaps = await Promise.all(
      chunks.map((chunk) =>
        getDocs(
          query(collection(db, "leaderboardPlayers"), where("userId", "in", chunk))
        )
      )
    );

    const courseIds = new Set<number>();
    for (const snap of snaps) {
      snap.docs.forEach((d) => {
        courseIds.add((d.data() as LeaderboardPlayerEntry).courseId);
      });
    }

    return Array.from(courseIds);
  } catch (error) {
    console.error("❌ getCourseIdsForPartners failed:", error);
    return [];
  }
}