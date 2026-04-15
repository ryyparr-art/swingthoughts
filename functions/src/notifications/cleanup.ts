/**
 * Notification Cleanup
 * 
 * Scheduled function to remove old read notifications (older than 30 days).
 * Paginates in batches of 500 until all stale notifications are deleted.
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

const db = getFirestore();

export const cleanupOldNotifications = onSchedule(
  {
    schedule: "every 24 hours",
    region: "us-central1",
  },
  async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let totalDeleted = 0;

    // Paginate in batches of 500 until no stale notifications remain.
    // A 500-doc cap per run won't keep up at scale — paginating ensures
    // the collection stays clean regardless of notification volume.
    while (true) {
      const oldNotifications = await db
        .collection("notifications")
        .where("createdAt", "<", Timestamp.fromDate(thirtyDaysAgo))
        .where("read", "==", true)
        .limit(500)
        .get();

      if (oldNotifications.empty) break;

      const batch = db.batch();
      oldNotifications.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      totalDeleted += oldNotifications.size;
      console.log(`🧹 Deleted ${totalDeleted} old notifications so far...`);

      // If we got fewer than 500, we've cleared everything
      if (oldNotifications.size < 500) break;
    }

    console.log(`🧹 Cleanup complete — deleted ${totalDeleted} old notifications`);
  }
);