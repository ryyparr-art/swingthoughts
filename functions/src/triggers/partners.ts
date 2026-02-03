/**
 * Partner Request Triggers
 * 
 * Handles: onPartnerRequestCreated, onPartnerRequestUpdated
 */

import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { createNotificationDocument, getUserData } from "../notifications/helpers";

export const onPartnerRequestCreated = onDocumentCreated(
  "partnerRequests/{requestId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const request = snap.data();
      if (!request) return;

      const { fromUserId, toUserId } = request;
      if (!fromUserId || !toUserId) { console.log("⛔ Partner request missing required fields"); return; }

      console.log("🤝 New partner request from", fromUserId, "to", toUserId);

      const userData = await getUserData(fromUserId);
      if (!userData) { console.log("⚠️ User not found"); return; }

      await createNotificationDocument({
        userId: toUserId, type: "partner_request",
        actorId: fromUserId, actorName: userData.displayName || "Someone",
        actorAvatar: userData.avatar,
        message: `${userData.displayName || "Someone"} wants to Partner Up`,
      });

      console.log("✅ Partner request notification created");
    } catch (error) {
      console.error("🔥 onPartnerRequestCreated failed:", error);
    }
  }
);

export const onPartnerRequestUpdated = onDocumentUpdated(
  "partnerRequests/{requestId}",
  async (event) => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after) return;

      if (before.status !== "approved" && after.status === "approved") {
        const { fromUserId, toUserId } = after;
        if (!fromUserId || !toUserId) { console.log("⛔ Partner request missing required fields"); return; }

        console.log("✅ Partner request approved:", fromUserId, "←→", toUserId);

        const userData = await getUserData(toUserId);
        if (!userData) { console.log("⚠️ User not found"); return; }

        await createNotificationDocument({
          userId: fromUserId, type: "partner_accepted",
          actorId: toUserId, actorName: userData.displayName || "Someone",
          actorAvatar: userData.avatar,
          message: `${userData.displayName || "Someone"} has agreed to be your Partner`,
        });

        console.log("✅ Partner accepted notification created");
      }
    } catch (error) {
      console.error("🔥 onPartnerRequestUpdated failed:", error);
    }
  }
);