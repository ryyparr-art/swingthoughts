/**
 * Like Triggers
 * 
 * Handles: onLikeCreated, onCommentLikeCreated
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { createNotificationDocument, getUserData } from "../notifications/helpers";

export const onLikeCreated = onDocumentCreated(
  "likes/{likeId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const like = snap.data();
      if (!like) return;

      const { userId, postId, postAuthorId } = like;
      if (!userId || !postId || !postAuthorId) { console.log("⛔ Like missing required fields"); return; }

      console.log("👍 New like from", userId, "on post by", postAuthorId);

      const userData = await getUserData(userId);
      if (!userData) { console.log("⚠️ User not found"); return; }

      await createNotificationDocument({
        userId: postAuthorId, type: "like",
        actorId: userId, actorName: userData.displayName || "Someone",
        actorAvatar: userData.avatar, postId,
        message: `${userData.displayName || "Someone"} landed a dart on your Swing Thought`,
      });

      console.log("✅ Like notification created");
    } catch (error) {
      console.error("🔥 onLikeCreated failed:", error);
    }
  }
);

export const onCommentLikeCreated = onDocumentCreated(
  "comment_likes/{likeId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const like = snap.data();
      if (!like) return;

      const { userId, commentId, commentAuthorId, postId } = like;
      if (!userId || !commentId || !commentAuthorId) { console.log("⛔ Comment like missing required fields"); return; }

      console.log("👍 New comment like from", userId, "on comment by", commentAuthorId);

      const userData = await getUserData(userId);
      if (!userData) { console.log("⚠️ User not found"); return; }

      await createNotificationDocument({
        userId: commentAuthorId, type: "comment_like",
        actorId: userId, actorName: userData.displayName || "Someone",
        actorAvatar: userData.avatar, postId, commentId,
        message: `${userData.displayName || "Someone"} landed a dart on your comment`,
      });

      console.log("✅ Comment like notification created");
    } catch (error) {
      console.error("🔥 onCommentLikeCreated failed:", error);
    }
  }
);