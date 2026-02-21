/**
 * cleanupAbandonedRounds — Scheduled Cloud Function (v2)
 *
 * Runs every hour. Three cleanup tasks:
 *
 * 1. STALE LIVE ROUNDS — Mark as abandoned
 *    - status == "live" && startedAt < now - 12 hours
 *    - No score docs created, no feed activity
 *
 * 2. ORPHANED TRANSFER REQUESTS — Auto-approve
 *    - status == "live" && markerTransferRequest.status == "pending"
 *    - expiresAt < now - 10 minutes (both phones died scenario)
 *    - Transfers marker to the requester
 *
 * 3. DELETE ABANDONED ROUNDS — Permanent removal
 *    - status == "abandoned" && abandonedAt < now - 24 hours
 *    - Deletes the round doc + subcollections (chat messages)
 *    - No score docs exist for abandoned rounds, so no cascade needed
 *
 * File: functions/src/cleanupAbandonedRounds.ts
 */

import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";

const db = admin.firestore();

const STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000; // 12 hours
const TRANSFER_ORPHAN_MS = 10 * 60 * 1000; // 10 minutes past expiry
const ABANDONED_DELETE_MS = 24 * 60 * 60 * 1000; // 24 hours after abandonment

export const cleanupAbandonedRounds = onSchedule("every 1 hours", async () => {
  await cleanupStaleRounds();
  await cleanupOrphanedTransferRequests();
  await deleteAbandonedRounds();
});

// ============================================================================
// 1. STALE LIVE ROUNDS → mark abandoned
// ============================================================================

async function cleanupStaleRounds(): Promise<void> {
  const cutoff = admin.firestore.Timestamp.fromMillis(
    Date.now() - STALE_THRESHOLD_MS
  );

  try {
    const snap = await db
      .collection("rounds")
      .where("status", "==", "live")
      .where("startedAt", "<", cutoff)
      .get();

    if (snap.empty) {
      console.log("✅ No stale rounds to clean up");
      return;
    }

    console.log(`🧹 Found ${snap.size} stale round(s) to abandon`);

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

    if (batchCount > 0) batches.push(currentBatch);
    await Promise.all(batches.map((b) => b.commit()));

    console.log(`✅ Cleaned up ${snap.size} stale round(s)`);
  } catch (error) {
    console.error("❌ Error cleaning up stale rounds:", error);
  }
}

// ============================================================================
// 2. ORPHANED TRANSFER REQUESTS → auto-approve
// ============================================================================

async function cleanupOrphanedTransferRequests(): Promise<void> {
  try {
    // Query live rounds that have a pending transfer request
    const snap = await db
      .collection("rounds")
      .where("status", "==", "live")
      .where("markerTransferRequest.status", "==", "pending")
      .get();

    if (snap.empty) {
      console.log("✅ No orphaned transfer requests");
      return;
    }

    const now = Date.now();
    let cleaned = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const req = data.markerTransferRequest;
      if (!req?.expiresAt) continue;

      const expiresMs = req.expiresAt.toMillis?.() || req.expiresAt.seconds * 1000;
      const overdueMs = now - expiresMs;

      // Only auto-approve if > 10 minutes past expiry (client should have handled it)
      if (overdueMs < TRANSFER_ORPHAN_MS) continue;

      const minutesOverdue = Math.round(overdueMs / 60000);
      console.log(
        `  → Auto-approving transfer in round ${docSnap.id}: ${req.requestedByName} (${minutesOverdue}min overdue)`
      );

      // Transfer marker to the requester
      const updatedPlayers = (data.players || []).map((p: any) => ({
        ...p,
        isMarker: p.playerId === req.requestedBy,
      }));

      await docSnap.ref.update({
        markerId: req.requestedBy,
        markerTransferRequest: null,
        players: updatedPlayers,
      });

      cleaned++;
    }

    if (cleaned > 0) {
      console.log(`✅ Auto-approved ${cleaned} orphaned transfer request(s)`);
    }
  } catch (error) {
    console.error("❌ Error cleaning up orphaned transfers:", error);
  }
}

// ============================================================================
// 3. DELETE ABANDONED ROUNDS → permanent removal
// ============================================================================

async function deleteAbandonedRounds(): Promise<void> {
  const cutoff = admin.firestore.Timestamp.fromMillis(
    Date.now() - ABANDONED_DELETE_MS
  );

  try {
    const snap = await db
      .collection("rounds")
      .where("status", "==", "abandoned")
      .where("abandonedAt", "<", cutoff)
      .get();

    if (snap.empty) {
      console.log("✅ No abandoned rounds to delete");
      return;
    }

    console.log(`🗑️ Found ${snap.size} abandoned round(s) to delete`);

    let deleted = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();

      try {
        // Delete subcollections (chat messages)
        await deleteSubcollections(docSnap.ref);

        // Delete the round document
        await docSnap.ref.delete();

        console.log(
          `  → Deleted round ${docSnap.id} (${data.courseName || "unknown"}, abandoned by: ${data.abandonedBy || data.abandonReason || "unknown"})`
        );
        deleted++;
      } catch (err) {
        console.error(`  ❌ Failed to delete round ${docSnap.id}:`, err);
      }
    }

    console.log(`✅ Deleted ${deleted} abandoned round(s)`);
  } catch (error) {
    console.error("❌ Error deleting abandoned rounds:", error);
  }
}

/**
 * Delete all documents in all subcollections of a document.
 * Handles: rounds/{roundId}/messages (chat)
 */
async function deleteSubcollections(
  docRef: admin.firestore.DocumentReference
): Promise<void> {
  const subcollections = await docRef.listCollections();

  for (const subcol of subcollections) {
    const subDocs = await subcol.limit(500).get();

    if (subDocs.empty) continue;

    const batch = db.batch();
    subDocs.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    // If there were 500, there might be more — recurse
    if (subDocs.size === 500) {
      await deleteSubcollections(docRef);
      return; // Re-lists all subcollections, so no need to continue this loop
    }
  }
}