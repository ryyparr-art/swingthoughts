/**
 * Thread Cleanup Triggers
 * 
 * Handles: onThreadUpdated
 * Deletes thread when all participants have deleted it.
 */

import { getFirestore } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

const db = getFirestore();

export const onThreadUpdated = onDocumentUpdated(
  "threads/{threadId}",
  async (event) => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after) return;

      const threadId = event.params.threadId;
      const participants = after.participants || [];
      const deletedBy = after.deletedBy || [];

      const beforeDeletedBy = before.deletedBy || [];
      if (JSON.stringify(beforeDeletedBy) === JSON.stringify(deletedBy)) return;

      const allDeleted = participants.length > 0 && 
        participants.every((p: string) => deletedBy.includes(p));

      if (!allDeleted) return;

      console.log("🗑️ All participants deleted thread, performing full cleanup:", threadId);

      const messagesRef = db.collection("threads").doc(threadId).collection("messages");
      const messagesSnap = await messagesRef.get();

      const batch = db.batch();
      messagesSnap.docs.forEach((doc) => batch.delete(doc.ref));
      batch.delete(db.collection("threads").doc(threadId));
      await batch.commit();

      console.log(`✅ Thread ${threadId} fully deleted (${messagesSnap.size} messages removed)`);
    } catch (error) { console.error("🔥 onThreadUpdated (cleanup) failed:", error); }
  }
);