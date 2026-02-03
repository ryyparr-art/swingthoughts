/**
 * Comment Triggers
 * 
 * Handles: onCommentCreated
 * Sends comment, reply, and mention_comment notifications.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { createNotificationDocument, getUserData } from "../notifications/helpers";

export const onCommentCreated = onDocumentCreated(
  "comments/{commentId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const comment = snap.data();
      if (!comment) return;

      const commentId = event.params.commentId;
      const { userId, postId, postAuthorId, taggedUsers, parentCommentId, parentCommentAuthorId } = comment;

      if (!userId || !postId || !postAuthorId) { console.log("⛔ Comment missing required fields"); return; }
      console.log("💬 New comment from", userId, "on post by", postAuthorId);

      const userData = await getUserData(userId);
      if (!userData) { console.log("⚠️ User not found"); return; }

      const actorName = userData.displayName || "Someone";
      const actorAvatar = userData.avatar;
      const notifiedUsers = new Set<string>();

      // Reply notification
      if (parentCommentId && parentCommentAuthorId && parentCommentAuthorId !== userId) {
        await createNotificationDocument({
          userId: parentCommentAuthorId, type: "reply",
          actorId: userId, actorName, actorAvatar, postId, commentId,
          message: `${actorName} replied to your comment`,
        });
        notifiedUsers.add(parentCommentAuthorId);
      }

      // Comment notification to post author
      if (!parentCommentId && postAuthorId !== userId && !notifiedUsers.has(postAuthorId)) {
        await createNotificationDocument({
          userId: postAuthorId, type: "comment",
          actorId: userId, actorName, actorAvatar, postId, commentId,
          message: `${actorName} weighed in on your Swing Thought`,
        });
        notifiedUsers.add(postAuthorId);
      }

      // Mention notifications
      if (taggedUsers && Array.isArray(taggedUsers)) {
        for (const taggedUserId of taggedUsers) {
          if (notifiedUsers.has(taggedUserId) || taggedUserId === userId) continue;
          await createNotificationDocument({
            userId: taggedUserId, type: "mention_comment",
            actorId: userId, actorName, actorAvatar, postId, commentId,
            message: `${actorName} tagged you in a comment`,
          });
          notifiedUsers.add(taggedUserId);
        }
      }

      console.log("✅ Comment processing complete");
    } catch (error) {
      console.error("🔥 onCommentCreated failed:", error);
    }
  }
);