/**
 * Hole-in-One Triggers
 * 
 * Handles: onHoleInOneCreated, onHoleInOneUpdated
 */

import { getFirestore } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { createNotificationDocument, getUserData } from "../notifications/helpers";

const db = getFirestore();

export const onHoleInOneCreated = onDocumentCreated(
  "hole_in_ones/{holeInOneId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const holeInOne = snap.data();
      if (!holeInOne) return;

      const { userId, verifierId, courseId, courseName, holeNumber, scoreId } = holeInOne;
      if (!userId || !verifierId) { console.log("⛔ Hole-in-one missing required fields"); return; }

      const userData = await getUserData(userId);
      const verifierData = await getUserData(verifierId);
      if (!userData || !verifierData) { console.log("⚠️ User data not found"); return; }

      let postId: string | undefined;
      if (scoreId) {
        const scoreSnap = await db.collection("scores").doc(scoreId).get();
        if (scoreSnap.exists) postId = scoreSnap.data()?.thoughtId;
      }

      await createNotificationDocument({
        userId, type: "holeinone_pending_poster",
        actorId: verifierId, actorName: verifierData.displayName || "Someone",
        actorAvatar: verifierData.avatar, postId, scoreId, courseId, courseName,
        message: `Your hole-in-one on hole ${holeNumber} is pending verification from ${verifierData.displayName || "Someone"}`,
      });

      await createNotificationDocument({
        userId: verifierId, type: "holeinone_verification_request",
        actorId: userId, actorName: userData.displayName || "Someone",
        actorAvatar: userData.avatar, scoreId, courseId, courseName,
        message: `${userData.displayName || "Someone"} needs you to verify their hole-in-one on hole ${holeNumber}`,
      });

      console.log("✅ Hole-in-one verification notifications created");
    } catch (error) { console.error("🔥 onHoleInOneCreated failed:", error); }
  }
);

export const onHoleInOneUpdated = onDocumentUpdated(
  "hole_in_ones/{holeInOneId}",
  async (event) => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after) return;

      const { userId, verifierId, courseId, courseName, holeNumber, scoreId } = after;
      if (!userId || !verifierId) { console.log("⛔ Hole-in-one missing required fields"); return; }

      const verifierData = await getUserData(verifierId);
      if (!verifierData) { console.log("⚠️ Verifier not found"); return; }

      let postId: string | undefined;
      if (scoreId) {
        const scoreSnap = await db.collection("scores").doc(scoreId).get();
        if (scoreSnap.exists) postId = scoreSnap.data()?.thoughtId;
      }

      if (before.status !== "verified" && after.status === "verified") {
        await createNotificationDocument({
          userId, type: "holeinone_verified",
          actorId: verifierId, actorName: verifierData.displayName || "Someone",
          actorAvatar: verifierData.avatar, postId, scoreId, courseId, courseName,
          message: `✅ ${verifierData.displayName || "Someone"} verified your hole-in-one on hole ${holeNumber}!`,
        });

        // Evaluate Ace Hunter challenge
        try {
          const { evaluateAceHunter } = await import("./challengeEvaluator");
          await evaluateAceHunter(userId);
        } catch (aceErr) {
          console.error("⚠️ Ace Hunter evaluation failed:", aceErr);
        }
      }

      if (before.status !== "denied" && after.status === "denied") {
        await createNotificationDocument({
          userId, type: "holeinone_denied",
          actorId: verifierId, actorName: verifierData.displayName || "Someone",
          actorAvatar: verifierData.avatar, postId, scoreId, courseId, courseName,
          message: `❌ ${verifierData.displayName || "Someone"} did not verify your hole-in-one on hole ${holeNumber}`,
        });
      }
    } catch (error) { console.error("🔥 onHoleInOneUpdated failed:", error); }
  }
);