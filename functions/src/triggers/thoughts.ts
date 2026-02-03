/**
 * Thought (Post) Triggers
 * 
 * Handles: onThoughtCreated
 * Sends partner_posted and mention_post notifications.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { createNotificationDocument, getUserData } from "../notifications/helpers";

export const onThoughtCreated = onDocumentCreated(
  "thoughts/{thoughtId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const thought = snap.data();
      if (!thought) return;

      const thoughtId = event.params.thoughtId;

      // Skip if created by onScoreCreated
      if (thought.createdByScoreFunction === true) {
        console.log("⏭️ Skipping partner_posted - thought created by score function");
        return;
      }

      const { userId, userName, displayName, userAvatar, avatar, taggedPartners } = thought;
      if (!userId) { console.log("⛔ Thought missing userId"); return; }

      const userData = await getUserData(userId);
      if (!userData) { console.log("⚠️ User not found"); return; }

      const actorName = userName || displayName || userData.displayName || "Someone";
      const actorAvatar = userAvatar || avatar || userData.avatar;

      // Partner notifications
      const partners = userData.partners || [];
      if (Array.isArray(partners) && partners.length > 0) {
        for (const partnerId of partners) {
          await createNotificationDocument({
            userId: partnerId, type: "partner_posted",
            actorId: userId, actorName, actorAvatar,
            postId: thoughtId,
            message: `${actorName} has a new Swing Thought`,
          });
        }
        console.log("✅ Sent partner_posted to", partners.length, "partners");
      }

      // Mention notifications
      if (taggedPartners && Array.isArray(taggedPartners) && taggedPartners.length > 0) {
        for (const tagged of taggedPartners) {
          const taggedUserId = typeof tagged === 'string' ? tagged : tagged.userId;
          if (!taggedUserId || partners.includes(taggedUserId)) continue;

          await createNotificationDocument({
            userId: taggedUserId, type: "mention_post",
            actorId: userId, actorName, actorAvatar,
            postId: thoughtId,
            message: `${actorName} tagged you in a Swing Thought`,
          });
        }
        console.log("✅ Sent mention_post notifications");
      }

      console.log("✅ Thought processing complete");
    } catch (error) {
      console.error("🔥 onThoughtCreated failed:", error);
    }
  }
);