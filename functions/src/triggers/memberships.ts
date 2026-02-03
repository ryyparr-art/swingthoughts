/**
 * Course Membership Triggers
 * 
 * Handles: onMembershipCreated, onMembershipUpdated
 */

import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { createNotificationDocument } from "../notifications/helpers";

export const onMembershipCreated = onDocumentCreated(
  "course_memberships/{membershipId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const membership = snap.data();
      if (!membership) return;

      const { userId, courseId, courseName } = membership;
      if (!userId || !courseId) { console.log("⛔ Membership missing required fields"); return; }

      await createNotificationDocument({
        userId, type: "membership_submitted",
        courseId, courseName: courseName || "a course",
        message: `Your membership request for ${courseName || "a course"} has been submitted for review`,
      });
      console.log("✅ Membership submitted notification created");
    } catch (error) { console.error("🔥 onMembershipCreated failed:", error); }
  }
);

export const onMembershipUpdated = onDocumentUpdated(
  "course_memberships/{membershipId}",
  async (event) => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after) return;

      const { userId, courseId, courseName, status } = after;
      if (!userId || !courseId) { console.log("⛔ Membership missing required fields"); return; }

      if (before.status !== "approved" && status === "approved") {
        await createNotificationDocument({
          userId, type: "membership_approved",
          courseId, courseName: courseName || "the course",
          message: `Your membership at ${courseName || "the course"} has been verified!`,
        });
      }

      if (before.status !== "rejected" && status === "rejected") {
        const rejectionReason = after.rejectionReason || "";
        await createNotificationDocument({
          userId, type: "membership_rejected",
          courseId, courseName: courseName || "the course",
          message: rejectionReason
            ? `Your membership request for ${courseName || "the course"} was not approved. Reason: ${rejectionReason}`
            : `Your membership request for ${courseName || "the course"} was not approved`,
        });
      }
    } catch (error) { console.error("🔥 onMembershipUpdated failed:", error); }
  }
);