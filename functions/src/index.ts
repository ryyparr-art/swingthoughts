import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

initializeApp();
const db = getFirestore();

/**
 * COURSE LEADERS (LOWMAN CACHE)
 * --------------------------------------------------
 * ONE document per course
 * - Clients: READ only
 * - Cloud Functions: WRITE only
 * - Constant-time updates (cheap)
 */
export const onScoreCreated = onDocumentCreated(
  "scores/{scoreId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const score = snap.data();
      if (!score) return;

      const {
        userId,
        courseId,
        courseName,
        netScore,
        location, // { city, state, latitude?, longitude? }
      } = score;

      // Hard validation
      if (
        !userId ||
        courseId === undefined ||
        !courseName ||
        typeof netScore !== "number" ||
        !location ||
        !location.city ||
        !location.state
      ) {
        console.log("⛔ Score missing required fields", score);
        return;
      }

      // 🔑 FIX #1: Firestore document IDs MUST be strings
      const courseDocId = String(courseId);

      const leaderRef = db
        .collection("course_leaders")
        .doc(courseDocId);

      const leaderSnap = await leaderRef.get();

      // Fetch display name ONCE (cheap, 1 read)
      const userSnap = await db.collection("users").doc(userId).get();
      if (!userSnap.exists) {
        console.log("⛔ User not found:", userId);
        return;
      }

      const displayName =
        userSnap.data()?.displayName ??
        userSnap.data()?.userName ??
        "Player";

      const newLowman = {
        userId,
        displayName,
        netScore,
        achievedAt: Timestamp.now(),
      };

      // --------------------------------------------------
      // CASE 1: First score for this course
      // --------------------------------------------------
      if (!leaderSnap.exists) {
        await leaderRef.set({
          courseId,
          courseName,
          location: {
            city: location.city,
            state: location.state,
            latitude: location.latitude ?? null,
            longitude: location.longitude ?? null,
          },
          lowman: newLowman,
          stats: {
            totalScores: 1,
          },
          updatedAt: Timestamp.now(),
        });

        console.log(`🏆 First Lowman set for ${courseName}`);
        return;
      }

      // --------------------------------------------------
      // CASE 2: Existing course leader
      // --------------------------------------------------
      const leaderData = leaderSnap.data();
      const currentLowman = leaderData?.lowman;

      const updates: any = {
        "stats.totalScores": FieldValue.increment(1),
        updatedAt: Timestamp.now(),
      };

      // New lowman beats existing
      if (
        !currentLowman ||
        typeof currentLowman.netScore !== "number" ||
        netScore < currentLowman.netScore
      ) {
        updates.lowman = newLowman;

        console.log(
          `🏆 New Lowman at ${courseName}: ${displayName} (${netScore})`
        );
      }

      await leaderRef.update(updates);
    } catch (err) {
      console.error("🔥 onScoreCreated failed:", err);
    }
  }
);








