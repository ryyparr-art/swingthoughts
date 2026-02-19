/**
 * cleanupAbandonedRounds — Scheduled Cloud Function (v2)
 *
 * Runs every hour. Finds all rounds where:
 *   - status == "live"
 *   - startedAt < now - 12 hours
 *
 * Marks them as status: "abandoned". No score docs created,
 * no feed activity, no leaderboard entries.
 *
 * File: functions/src/cleanupAbandonedRounds.ts
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";

const db = admin.firestore();

const STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours

export const cleanupAbandonedRounds = onSchedule("every 1 hours", async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(
    Date.now() - STALE_THRESHOLD_MS
  );

  try {
    const staleRoundsQuery = db
      .collection("rounds")
      .where("status", "==", "live")
      .where("startedAt", "<", cutoff);

    const snap = await staleRoundsQuery.get();

    if (snap.empty) {
      console.log("✅ No stale rounds to clean up");
      return;
    }

    console.log(`🧹 Found ${snap.size} stale round(s) to abandon`);

    // Batch write for efficiency (max 500 per batch)
    const batches: admin.firestore.WriteBatch[] = [];
    let currentBatch = db.batch();
    let batchCount = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const startedAt = data.startedAt?.toMillis?.() || 0;
      const hoursOld = Math.round(
        (Date.now() - startedAt) / (60 * 60 * 1000)
      );

      console.log(
        `  → Abandoning round ${docSnap.id} (${data.courseName || "unknown"}, ${hoursOld}h old, marker: ${data.markerId})`
      );

      currentBatch.update(docSnap.ref, {
        status: "abandoned",
        abandonedAt: admin.firestore.FieldValue.serverTimestamp(),
        abandonReason: "stale_cleanup",
      });

      batchCount++;

      if (batchCount >= 500) {
        batches.push(currentBatch);
        currentBatch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      batches.push(currentBatch);
    }

    await Promise.all(batches.map((b) => b.commit()));

    console.log(`✅ Cleaned up ${snap.size} stale round(s)`);
  } catch (error) {
    console.error("❌ Error cleaning up abandoned rounds:", error);
  }
});