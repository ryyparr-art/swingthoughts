import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

initializeApp();
const db = getFirestore();

/**
 * COURSE LEADERS (LOWMAN CACHE)
 * --------------------------------------------------
 * Maintains one leaderboard doc per course
 * Clients READ only
 * Cloud Functions WRITE only
 */
export const onScoreCreated = onDocumentCreated(
  "scores/{scoreId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const score = snap.data();
    if (!score) return;

    const {
      userId,
      courseId,
      courseName,
      netScore,
      userName,
    } = score;

    if (!userId || !courseId || typeof netScore !== "number") return;

    const leaderRef = db.collection("course_leaders").doc(courseId);
    const leaderSnap = await leaderRef.get();

    // Build candidate lowman object
    const newLowman = {
      userId,
      userName: userName || "Player",
      netScore,
      scoreId: snap.id,
      achievedAt: FieldValue.serverTimestamp(),
    };

    // --------------------------------------------------
    // CASE 1: No leader exists yet → create it
    // --------------------------------------------------
    if (!leaderSnap.exists) {
      await leaderRef.set({
        courseId,
        courseName,
        lowman: newLowman,
        stats: {
          totalScores: 1,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });

      console.log(`🏆 First Lowman set for ${courseName}`);
      return;
    }

    const leaderData = leaderSnap.data();
    const currentLowman = leaderData?.lowman;

    // --------------------------------------------------
    // Always increment totalScores
    // --------------------------------------------------
    const updates: any = {
      "stats.totalScores": FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // --------------------------------------------------
    // CASE 2: New Lowman beats existing
    // --------------------------------------------------
    if (
      !currentLowman ||
      netScore < currentLowman.netScore
    ) {
      updates.lowman = newLowman;

      console.log(
        `🏆 New Lowman at ${courseName}: ${netScore}`
      );
    }

    await leaderRef.update(updates);
  }
);






