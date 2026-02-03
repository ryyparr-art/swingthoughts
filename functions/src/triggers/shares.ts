/**
 * Share Triggers
 * 
 * Handles: onShareCreated
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { createNotificationDocument, getUserData } from "../notifications/helpers";

export const onShareCreated = onDocumentCreated(
  "shares/{shareId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const share = snap.data();
      if (!share) return;

      const { userId, postId, postAuthorId } = share;
      if (!userId || !postId || !postAuthorId) { console.log("⛔ Share missing required fields"); return; }

      const userData = await getUserData(userId);
      if (!userData) { console.log("⚠️ User not found"); return; }

      await createNotificationDocument({
        userId: postAuthorId, type: "share",
        actorId: userId, actorName: userData.displayName || "Someone",
        actorAvatar: userData.avatar, postId,
        message: `${userData.displayName || "Someone"} shared your Swing Thought`,
      });

      console.log("✅ Share notification created");
    } catch (error) { console.error("🔥 onShareCreated failed:", error); }
  }
);