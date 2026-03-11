/**
 * worldRankings.ts  (functions/src/triggers/worldRankings.ts)
 *
 * Scheduled weekly sort — runs every Sunday at 11pm EST.
 *
 * Responsibility:
 *   - Read all worldRankings docs
 *   - Snapshot previousRating = current powerRating (for trend arrow)
 *   - Assign rank positions to players with roundsInWindow >= 3
 *   - Players with < 3 rounds keep rank: null ("Unranked")
 *   - Batch write rank fields back in chunks of 500
 *
 * NOTE: This function only writes `rank` and `previousRating`.
 *       powerRating is kept current by calculatePlayerRanking (per-round).
 *       This just sorts and numbers the ranked players weekly.
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { WorldRankingDoc } from "../utils/rankingEngine";

const MIN_ROUNDS_TO_RANK = 3;
const BATCH_SIZE = 500;

export const weeklyRankingSort = onSchedule(
  {
    schedule: "0 23 * * 0", // Every Sunday at 11pm UTC (adjust for EST offset if needed)
    timeZone: "America/New_York",
    region: "us-central1",
  },
  async () => {
    const db = getFirestore();
    console.log("🏌️ weeklyRankingSort: starting...");

    // ── 1. Read all worldRankings docs ────────────────────────
    const snap = await db.collection("worldRankings").get();

    if (snap.empty) {
      console.log("weeklyRankingSort: no players found, exiting.");
      return;
    }

    const allPlayers: { id: string; data: WorldRankingDoc }[] = [];
    snap.forEach((doc) => {
      allPlayers.push({ id: doc.id, data: doc.data() as WorldRankingDoc });
    });

    console.log(`weeklyRankingSort: ${allPlayers.length} total players`);

    // ── 2. Split into ranked vs unranked ──────────────────────
    const ranked = allPlayers
      .filter((p) => p.data.roundsInWindow >= MIN_ROUNDS_TO_RANK && p.data.powerRating > 0)
      .sort((a, b) => b.data.powerRating - a.data.powerRating);

    const unranked = allPlayers.filter(
      (p) => p.data.roundsInWindow < MIN_ROUNDS_TO_RANK || p.data.powerRating <= 0
    );

    console.log(`weeklyRankingSort: ${ranked.length} ranked, ${unranked.length} unranked`);

    // ── 3. Build all writes ───────────────────────────────────
    type RankWrite = {
      id: string;
      rank: number | null;
      previousRating: number | null;
    };
    const writes: RankWrite[] = [];

    // Ranked players: assign position + snapshot previousRating
    ranked.forEach((player, index) => {
      writes.push({
        id: player.id,
        rank: index + 1,
        previousRating: player.data.powerRating ?? null,
      });
    });

    // Unranked: clear stale rank, snapshot previousRating
    unranked.forEach((player) => {
      const needsUpdate =
        player.data.rank !== null || player.data.powerRating > 0;
      if (needsUpdate) {
        writes.push({
          id: player.id,
          rank: null,
          previousRating: player.data.powerRating ?? null,
        });
      }
    });

    if (writes.length === 0) {
      console.log("weeklyRankingSort: no rank changes needed.");
      return;
    }

    // ── 4. Batch write in chunks of 500 ───────────────────────
    const now = Timestamp.now();
    let totalWritten = 0;

    for (let i = 0; i < writes.length; i += BATCH_SIZE) {
      const chunk = writes.slice(i, i + BATCH_SIZE);
      const batch = db.batch();

      for (const write of chunk) {
        const ref = db.collection("worldRankings").doc(write.id);
        batch.update(ref, {
          rank: write.rank,
          previousRating: write.previousRating,
          lastUpdated: now,
        });
      }

      await batch.commit();
      totalWritten += chunk.length;
      console.log(`weeklyRankingSort: committed ${totalWritten}/${writes.length} rank updates`);
    }

    console.log(
      `✅ weeklyRankingSort complete: #1 → ${ranked[0]?.data.displayName ?? "n/a"} (${ranked[0]?.data.powerRating ?? 0})`
    );
  }
);