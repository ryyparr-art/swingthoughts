/**
 * Poll Vote Triggers
 *
 * Handles atomic updates to thought poll data when votes are
 * created, changed, or removed in the poll_votes collection.
 *
 * Document ID convention: {thoughtId}_{userId}
 *
 * poll_votes document shape:
 * {
 *   thoughtId: string,
 *   userId: string,
 *   optionIndex: number,
 *   optionText: string,
 *   displayName: string,
 *   userAvatar: string | null,
 *   createdAt: Timestamp,
 *   updatedAt?: Timestamp,
 * }
 *
 * thought.poll shape:
 * {
 *   question: string,
 *   options: [{ text: string, votes: number, voterIds: string[] }],
 *   totalVotes: number,
 *   createdAt: Timestamp,
 * }
 */

import { getFirestore } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } from "firebase-functions/v2/firestore";

const db = getFirestore();

/* ================================================================ */
/* VOTE CREATED                                                     */
/* ================================================================ */

export const onPollVoteCreated = onDocumentCreated(
  "poll_votes/{voteId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const vote = snap.data();
      const { thoughtId, userId, optionIndex } = vote;

      if (!thoughtId || !userId || optionIndex === undefined) {
        console.error("❌ Poll vote missing required fields:", vote);
        return;
      }

      const thoughtRef = db.doc(`thoughts/${thoughtId}`);

      await db.runTransaction(async (transaction) => {
        const thoughtDoc = await transaction.get(thoughtRef);
        if (!thoughtDoc.exists) {
          console.error(`❌ Thought ${thoughtId} not found`);
          return;
        }

        const thought = thoughtDoc.data()!;
        if (!thought.poll || !thought.poll.options) {
          console.error(`❌ Thought ${thoughtId} has no poll data`);
          return;
        }

        const options = [...thought.poll.options];

        if (optionIndex < 0 || optionIndex >= options.length) {
          console.error(`❌ Invalid optionIndex ${optionIndex} for poll with ${options.length} options`);
          return;
        }

        // Check if user already in voterIds (duplicate guard)
        const currentVoterIds = options[optionIndex].voterIds || [];
        if (currentVoterIds.includes(userId)) {
          console.warn(`⚠️ User ${userId} already voted for option ${optionIndex}`);
          return;
        }

        // Increment chosen option
        options[optionIndex] = {
          ...options[optionIndex],
          votes: (options[optionIndex].votes || 0) + 1,
          voterIds: [...currentVoterIds, userId],
        };

        transaction.update(thoughtRef, {
          "poll.options": options,
          "poll.totalVotes": (thought.poll.totalVotes || 0) + 1,
        });
      });

      console.log(`✅ Poll vote recorded: user ${userId} → option ${optionIndex} on thought ${thoughtId}`);
    } catch (error) {
      console.error("🔥 onPollVoteCreated error:", error);
    }
  }
);

/* ================================================================ */
/* VOTE UPDATED (user changed their vote)                           */
/* ================================================================ */

export const onPollVoteUpdated = onDocumentUpdated(
  "poll_votes/{voteId}",
  async (event) => {
    try {
      const before = event.data?.before?.data();
      const after = event.data?.after?.data();
      if (!before || !after) return;

      const { thoughtId, userId } = after;
      const oldIndex = before.optionIndex;
      const newIndex = after.optionIndex;

      // No change in option
      if (oldIndex === newIndex) return;

      if (!thoughtId || !userId || oldIndex === undefined || newIndex === undefined) {
        console.error("❌ Poll vote update missing required fields");
        return;
      }

      const thoughtRef = db.doc(`thoughts/${thoughtId}`);

      await db.runTransaction(async (transaction) => {
        const thoughtDoc = await transaction.get(thoughtRef);
        if (!thoughtDoc.exists) {
          console.error(`❌ Thought ${thoughtId} not found`);
          return;
        }

        const thought = thoughtDoc.data()!;
        if (!thought.poll || !thought.poll.options) {
          console.error(`❌ Thought ${thoughtId} has no poll data`);
          return;
        }

        const options = [...thought.poll.options];

        if (oldIndex < 0 || oldIndex >= options.length || newIndex < 0 || newIndex >= options.length) {
          console.error(`❌ Invalid option indices: ${oldIndex} → ${newIndex}`);
          return;
        }

        // Remove from old option
        const oldVoterIds = options[oldIndex].voterIds || [];
        options[oldIndex] = {
          ...options[oldIndex],
          votes: Math.max((options[oldIndex].votes || 0) - 1, 0),
          voterIds: oldVoterIds.filter((id: string) => id !== userId),
        };

        // Add to new option
        const newVoterIds = options[newIndex].voterIds || [];
        if (!newVoterIds.includes(userId)) {
          options[newIndex] = {
            ...options[newIndex],
            votes: (options[newIndex].votes || 0) + 1,
            voterIds: [...newVoterIds, userId],
          };
        }

        // totalVotes stays the same (vote moved, not added/removed)
        transaction.update(thoughtRef, {
          "poll.options": options,
        });
      });

      console.log(`✅ Poll vote changed: user ${userId} moved ${oldIndex} → ${newIndex} on thought ${thoughtId}`);
    } catch (error) {
      console.error("🔥 onPollVoteUpdated error:", error);
    }
  }
);

/* ================================================================ */
/* VOTE DELETED (user removed their vote)                           */
/* ================================================================ */

export const onPollVoteDeleted = onDocumentDeleted(
  "poll_votes/{voteId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const vote = snap.data();
      const { thoughtId, userId, optionIndex } = vote;

      if (!thoughtId || !userId || optionIndex === undefined) {
        console.error("❌ Deleted poll vote missing required fields");
        return;
      }

      const thoughtRef = db.doc(`thoughts/${thoughtId}`);

      await db.runTransaction(async (transaction) => {
        const thoughtDoc = await transaction.get(thoughtRef);
        if (!thoughtDoc.exists) {
          console.error(`❌ Thought ${thoughtId} not found`);
          return;
        }

        const thought = thoughtDoc.data()!;
        if (!thought.poll || !thought.poll.options) {
          console.error(`❌ Thought ${thoughtId} has no poll data`);
          return;
        }

        const options = [...thought.poll.options];

        if (optionIndex < 0 || optionIndex >= options.length) {
          console.error(`❌ Invalid optionIndex ${optionIndex} on delete`);
          return;
        }

        // Remove from option
        const currentVoterIds = options[optionIndex].voterIds || [];
        options[optionIndex] = {
          ...options[optionIndex],
          votes: Math.max((options[optionIndex].votes || 0) - 1, 0),
          voterIds: currentVoterIds.filter((id: string) => id !== userId),
        };

        transaction.update(thoughtRef, {
          "poll.options": options,
          "poll.totalVotes": Math.max((thought.poll.totalVotes || 0) - 1, 0),
        });
      });

      console.log(`✅ Poll vote removed: user ${userId} removed vote from option ${optionIndex} on thought ${thoughtId}`);
    } catch (error) {
      console.error("🔥 onPollVoteDeleted error:", error);
    }
  }
);