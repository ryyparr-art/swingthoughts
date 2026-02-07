/**
 * Avatar Sync Trigger
 * 
 * Handles: onUserUpdated (avatar changes)
 * When a user's avatar field changes, updates the denormalized avatar
 * across all collections that store it:
 *   - thoughts (field: avatar)
 *   - threads (field: participantAvatars map)
 *   - notifications (field: actorAvatar)
 *   - leaderboards (nested topScores/topScores18/topScores9 arrays, field: userAvatar)
 *   - leagues (nested members & scores subcollections)
 *   - tournament chat messages (subcollection)
 */

import { getFirestore } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

const db = getFirestore();

/**
 * Firestore batches max at 500 writes.
 * This helper commits in chunks.
 */
async function batchUpdate(
  refs: FirebaseFirestore.DocumentReference[],
  field: string,
  value: string
): Promise<number> {
  let updated = 0;
  const BATCH_SIZE = 499;

  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const chunk = refs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((ref) => batch.update(ref, { [field]: value }));
    await batch.commit();
    updated += chunk.length;
  }

  return updated;
}

/**
 * Update userAvatar in a scores array (topScores, topScores18, topScores9)
 * Returns the updated array, or null if no changes were needed
 */
function updateScoresArray(
  scores: any[] | undefined,
  userId: string,
  newAvatar: string
): any[] | null {
  if (!scores || !Array.isArray(scores)) return null;

  let changed = false;
  const updated = scores.map((score: any) => {
    if (score.userId === userId && score.userAvatar !== newAvatar) {
      changed = true;
      return { ...score, userAvatar: newAvatar };
    }
    return score;
  });

  return changed ? updated : null;
}

export const onUserUpdated = onDocumentUpdated(
  "users/{userId}",
  async (event) => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after) return;

      const userId = event.params.userId;
      const oldAvatar = before.avatar || "";
      const newAvatar = after.avatar || "";

      // Only proceed if avatar actually changed
      if (oldAvatar === newAvatar) return;

      console.log(`🖼️ Avatar changed for user ${userId}`);
      console.log(`   Old: ${oldAvatar.substring(0, 80)}...`);
      console.log(`   New: ${newAvatar.substring(0, 80)}...`);

      let totalUpdated = 0;

      // ----------------------------------------------------------------
      // 1. THOUGHTS
      // ----------------------------------------------------------------
      const thoughtsSnap = await db
        .collection("thoughts")
        .where("userId", "==", userId)
        .get();

      if (!thoughtsSnap.empty) {
        const refs = thoughtsSnap.docs.map((d) => d.ref);
        const count = await batchUpdate(refs, "avatar", newAvatar);
        totalUpdated += count;
        console.log(`   ✅ Updated ${count} thoughts`);
      }

      // ----------------------------------------------------------------
      // 2. NOTIFICATIONS (where actorId matches)
      // ----------------------------------------------------------------
      const notificationsSnap = await db
        .collection("notifications")
        .where("actorId", "==", userId)
        .get();

      if (!notificationsSnap.empty) {
        const refs = notificationsSnap.docs.map((d) => d.ref);
        const count = await batchUpdate(refs, "actorAvatar", newAvatar);
        totalUpdated += count;
        console.log(`   ✅ Updated ${count} notifications`);
      }

      // ----------------------------------------------------------------
      // 3. THREADS (where user is a participant)
      // ----------------------------------------------------------------
      const threadsSnap = await db
        .collection("threads")
        .where("participants", "array-contains", userId)
        .get();

      if (!threadsSnap.empty) {
        const batch = db.batch();
        let threadCount = 0;

        for (const threadDoc of threadsSnap.docs) {
          const data = threadDoc.data();
          if (data.participantAvatars && userId in data.participantAvatars) {
            batch.update(threadDoc.ref, {
              [`participantAvatars.${userId}`]: newAvatar,
            });
            threadCount++;
          }
        }

        if (threadCount > 0) {
          await batch.commit();
          totalUpdated += threadCount;
          console.log(`   ✅ Updated ${threadCount} threads`);
        }
      }

      // ----------------------------------------------------------------
      // 4. LEADERBOARDS (nested score arrays with userAvatar field)
      // ----------------------------------------------------------------
      const leaderboardsSnap = await db.collection("leaderboards").get();
      let leaderboardCount = 0;

      for (const leaderboardDoc of leaderboardsSnap.docs) {
        const data = leaderboardDoc.data();
        const updateFields: Record<string, any> = {};

        // Check and update each scores array
        const topScoresUpdated = updateScoresArray(data.topScores, userId, newAvatar);
        const topScores18Updated = updateScoresArray(data.topScores18, userId, newAvatar);
        const topScores9Updated = updateScoresArray(data.topScores9, userId, newAvatar);

        if (topScoresUpdated) updateFields.topScores = topScoresUpdated;
        if (topScores18Updated) updateFields.topScores18 = topScores18Updated;
        if (topScores9Updated) updateFields.topScores9 = topScores9Updated;

        if (Object.keys(updateFields).length > 0) {
          await leaderboardDoc.ref.update(updateFields);
          leaderboardCount++;
        }
      }

      if (leaderboardCount > 0) {
        totalUpdated += leaderboardCount;
        console.log(`   ✅ Updated ${leaderboardCount} leaderboard entries`);
      }

      // ----------------------------------------------------------------
      // 5. LEAGUES - members subcollection
      // ----------------------------------------------------------------
      const leaguesSnap = await db.collection("leagues").get();

      let leagueMemberCount = 0;
      let leagueScoreCount = 0;

      for (const leagueDoc of leaguesSnap.docs) {
        // Update member doc
        const memberRef = leagueDoc.ref.collection("members").doc(userId);
        const memberSnap = await memberRef.get();

        if (memberSnap.exists) {
          await memberRef.update({ avatar: newAvatar });
          leagueMemberCount++;
        }

        // Update scores by this user
        const scoresSnap = await leagueDoc.ref
          .collection("scores")
          .where("userId", "==", userId)
          .get();

        if (!scoresSnap.empty) {
          const scoreBatch = db.batch();
          scoresSnap.docs.forEach((d) =>
            scoreBatch.update(d.ref, { avatar: newAvatar })
          );
          await scoreBatch.commit();
          leagueScoreCount += scoresSnap.size;
        }
      }

      if (leagueMemberCount > 0) {
        totalUpdated += leagueMemberCount;
        console.log(`   ✅ Updated ${leagueMemberCount} league memberships`);
      }
      if (leagueScoreCount > 0) {
        totalUpdated += leagueScoreCount;
        console.log(`   ✅ Updated ${leagueScoreCount} league scores`);
      }

      // ----------------------------------------------------------------
      // 6. TOURNAMENT CHAT MESSAGES
      // ----------------------------------------------------------------
      const tournamentsSnap = await db.collection("tournaments").get();

      let tournamentMsgCount = 0;

      for (const tournDoc of tournamentsSnap.docs) {
        // Check both "live" and "onpremise" chat subcollections
        for (const chatType of ["live", "onpremise"]) {
          const chatRef = tournDoc.ref.collection(chatType);
          const msgsSnap = await chatRef
            .where("userId", "==", userId)
            .get();

          if (!msgsSnap.empty) {
            const msgBatch = db.batch();
            msgsSnap.docs.forEach((d) =>
              msgBatch.update(d.ref, { avatar: newAvatar })
            );
            await msgBatch.commit();
            tournamentMsgCount += msgsSnap.size;
          }
        }
      }

      if (tournamentMsgCount > 0) {
        totalUpdated += tournamentMsgCount;
        console.log(`   ✅ Updated ${tournamentMsgCount} tournament chat messages`);
      }

      // ----------------------------------------------------------------
      // DONE
      // ----------------------------------------------------------------
      console.log(`🖼️ Avatar sync complete: ${totalUpdated} documents updated`);
    } catch (error) {
      console.error("🔥 onUserUpdated (avatar sync) failed:", error);
    }
  }
);