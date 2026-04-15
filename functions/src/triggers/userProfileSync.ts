/**
 * User Profile Sync
 *
 * Cloud Function triggered when a user's document is updated.
 * Detects changes to denormalized profile fields and fans out
 * updates to all locations where they are displayed.
 *
 * Synced fields:
 *   - displayName (user's display name)
 *   - challengeBadges (up to 3 selected for display)
 *   - gameIdentity (user's golf tagline)
 *
 * Denormalized locations:
 *   1. thoughts (feed posts) — displayName, challengeBadges, gameIdentity
 *   2. messageThreads — participantDisplayNames + participantChallengeBadges maps
 *   3. league members — displayName, challengeBadges on member subdoc
 *   4. leaderboards — displayName, challengeBadges in topScores arrays
 *
 * File: functions/src/triggers/userProfileSync.ts
 */

import { getFirestore } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";

const db = getFirestore();

// ============================================================================
// TRIGGER: User doc updated → sync denormalized profile fields
// ============================================================================

export const onUserProfileChanged = onDocumentUpdated(
  "users/{userId}",
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!beforeData || !afterData) return;

    const userId = event.params.userId;

    // Detect what changed
    const beforeName: string = beforeData.displayName ?? "";
    const afterName: string = afterData.displayName ?? "";
    const nameChanged = beforeName !== afterName;

    const beforeBadges: string[] = beforeData.challengeBadges ?? [];
    const afterBadges: string[] = afterData.challengeBadges ?? [];
    const badgesChanged = !arraysEqual(beforeBadges, afterBadges);

    const beforeIdentity: string = beforeData.gameIdentity ?? "";
    const afterIdentity: string = afterData.gameIdentity ?? "";
    const identityChanged = beforeIdentity !== afterIdentity;

    // Nothing we care about changed
    if (!nameChanged && !badgesChanged && !identityChanged) return;

    const changes: string[] = [];
    if (nameChanged) changes.push(`displayName: "${beforeName}" → "${afterName}"`);
    if (badgesChanged) changes.push(`badges: [${beforeBadges}] → [${afterBadges}]`);
    if (identityChanged) changes.push(`identity: "${beforeIdentity}" → "${afterIdentity}"`);
    console.log(`🔄 Profile sync for ${userId}: ${changes.join(", ")}`);

    // Build the update payload for thoughts (includes all synced fields)
    const thoughtUpdates: Record<string, any> = {};
    if (nameChanged) thoughtUpdates.displayName = afterName;
    if (badgesChanged) thoughtUpdates.challengeBadges = afterBadges;
    if (identityChanged) thoughtUpdates.gameIdentity = afterIdentity;

    // Fan out all updates in parallel
    const tasks: Promise<void>[] = [];

    // Thoughts always get all changed fields
    if (Object.keys(thoughtUpdates).length > 0) {
      tasks.push(syncThoughts(userId, thoughtUpdates));
    }

    // displayName + badges fan out to additional locations
    if (nameChanged || badgesChanged) {
      tasks.push(syncMessageThreads(userId, nameChanged ? afterName : null, badgesChanged ? afterBadges : null));
      tasks.push(syncLeagueMembers(userId, nameChanged ? afterName : null, badgesChanged ? afterBadges : null));
      tasks.push(syncLeaderboards(userId, nameChanged ? afterName : null, badgesChanged ? afterBadges : null));
    }

    await Promise.all(tasks);

    console.log(`✅ Profile sync complete for ${userId}`);
  }
);

// ============================================================================
// SYNC: Thoughts (feed posts)
// ============================================================================

/**
 * Update denormalized profile fields on all thoughts authored by this user.
 * Accepts a flexible update payload so any combination of fields can be synced.
 *
 * Batch-queries the user's recent thoughts (last 200) to avoid
 * scanning every thought they've ever posted.
 */
async function syncThoughts(
  userId: string,
  updates: Record<string, any>
): Promise<void> {
  try {
    const thoughtsSnap = await db
      .collection("thoughts")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    if (thoughtsSnap.empty) return;

    const batch = db.batch();
    let count = 0;

    for (const thoughtDoc of thoughtsSnap.docs) {
      batch.update(thoughtDoc.ref, updates);
      count++;

      // Firestore batch limit is 500, commit early if needed
      if (count % 450 === 0) {
        await batch.commit();
        console.log(`  📝 Committed ${count} thought updates`);
      }
    }

    // Commit remaining
    if (count % 450 !== 0) {
      await batch.commit();
    }

    console.log(`  📝 Updated ${count} thoughts`);
  } catch (error) {
    console.error("Error syncing thoughts:", error);
  }
}

// ============================================================================
// SYNC: Message Threads
// ============================================================================

/**
 * Update displayName and/or challengeBadges in messageThreads
 * where this user is a participant.
 * Threads store participant metadata in maps keyed by userId.
 */
async function syncMessageThreads(
  userId: string,
  displayName: string | null,
  challengeBadges: string[] | null
): Promise<void> {
  try {
    const threadsSnap = await db
      .collection("messageThreads")
      .where("participantIds", "array-contains", userId)
      .get();

    if (threadsSnap.empty) return;

    const batch = db.batch();
    let count = 0;

    for (const threadDoc of threadsSnap.docs) {
      const updates: Record<string, any> = {};
      if (displayName !== null) {
        updates[`participantDisplayNames.${userId}`] = displayName;
      }
      if (challengeBadges !== null) {
        updates[`participantChallengeBadges.${userId}`] = challengeBadges;
      }
      batch.update(threadDoc.ref, updates);
      count++;
    }

    await batch.commit();
    console.log(`  💬 Updated ${count} message threads`);
  } catch (error) {
    console.error("Error syncing message threads:", error);
  }
}

// ============================================================================
// SYNC: League Members
// ============================================================================

/**
 * Update displayName and/or challengeBadges on all league member subdocs
 * for this user. Uses collection group query on "members" subcollections.
 */
async function syncLeagueMembers(
  userId: string,
  displayName: string | null,
  challengeBadges: string[] | null
): Promise<void> {
  try {
    // Read leagueIds[] from user doc — avoids collection group query across
    // all league member subcollections which is expensive at scale.
    const userSnap = await db.collection("users").doc(userId).get();
    const leagueIds: string[] = userSnap.data()?.leagueIds || [];

    if (leagueIds.length === 0) return;

    const batch = db.batch();
    let count = 0;

    await Promise.all(leagueIds.map(async (leagueId) => {
      const memberRef = db
        .collection("leagues")
        .doc(leagueId)
        .collection("members")
        .doc(userId);

      const memberSnap = await memberRef.get();
      if (!memberSnap.exists) return;

      const updates: Record<string, any> = {};
      if (displayName !== null) updates.displayName = displayName;
      if (challengeBadges !== null) updates.challengeBadges = challengeBadges;
      batch.update(memberRef, updates);
      count++;
    }));

    if (count > 0) await batch.commit();
    console.log(`  🏌️ Updated ${count} league member docs`);
  } catch (error) {
    console.error("Error syncing league members:", error);
  }
}

// ============================================================================
// SYNC: Leaderboards
// ============================================================================

/**
 * Update displayName and/or challengeBadges on all leaderboard docs
 * where this user has a top score.
 * Leaderboards store score arrays with denormalized user data.
 */
async function syncLeaderboards(
  userId: string,
  displayName: string | null,
  challengeBadges: string[] | null
): Promise<void> {
  try {
    // Read lowmanCourses[] from user doc — only fetch leaderboards this user
    // appears in as a top scorer, instead of scanning the entire collection.
    const userSnap = await db.collection("users").doc(userId).get();
    const lowmanCourses: string[] = userSnap.data()?.lowmanCourses || [];
    const regionKey: string | null = userSnap.data()?.regionKey || null;

    if (lowmanCourses.length === 0 || !regionKey) return;

    // Fetch only the specific leaderboard docs this user leads
    const leaderboardIds = lowmanCourses.map((cId) => `${regionKey}_${cId}`);
    const leaderboardSnaps = await Promise.all(
      leaderboardIds.map((lbId) => db.collection("leaderboards").doc(lbId).get())
    );

    const batch = db.batch();
    let count = 0;

    for (const lbDoc of leaderboardSnaps) {
      if (!lbDoc.exists) continue;
      const data = lbDoc.data()!;
      let changed = false;

      const updateScoreArray = (scores: any[]): any[] => {
        return scores.map((s: any) => {
          if (s.userId === userId) {
            changed = true;
            const updated = { ...s };
            if (displayName !== null) updated.displayName = displayName;
            if (challengeBadges !== null) updated.challengeBadges = challengeBadges;
            return updated;
          }
          return s;
        });
      };

      const updates: Record<string, any> = {};
      if (data.topScores?.length) updates.topScores = updateScoreArray(data.topScores);
      if (data.topScores18?.length) updates.topScores18 = updateScoreArray(data.topScores18);
      if (data.topScores9?.length) updates.topScores9 = updateScoreArray(data.topScores9);

      if (changed) {
        batch.update(lbDoc.ref, updates);
        count++;
      }
    }

    if (count > 0) await batch.commit();
    console.log(`  🏆 Updated ${count} leaderboard docs`);
  } catch (error) {
    console.error("Error syncing leaderboards:", error);
  }
}

// ============================================================================
// HELPER
// ============================================================================

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}