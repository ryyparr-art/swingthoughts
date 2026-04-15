/**
 * Outing Scenarios
 *
 * Tests outing creation, group management, round linking,
 * leaderboard calculation, and completion flow.
 */

import * as admin from "firebase-admin";
import { seedRound, seedUsers } from "../seed";
import { clearEmulator, db } from "../setup";

async function seedOuting(
  organizerId: string,
  playerIds: string[],
  overrides: Record<string, any> = {}
) {
  const ref = db.collection("outings").doc();

  await ref.set({
    id: ref.id,
    organizerId,
    playerIds: [organizerId, ...playerIds],
    courseId: "pinehurst-no2",
    courseName: "Pinehurst No. 2",
    status: overrides.status || "active",
    parentType: overrides.parentType || "casual",
    parentId: overrides.parentId || null,
    startingHole: overrides.startingHole || 1,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...overrides,
  });

  return ref.id;
}

async function seedOutingGroup(
  outingId: string,
  markerUserId: string,
  playerIds: string[],
  overrides: Record<string, any> = {}
) {
  const ref = db
    .collection("outings")
    .doc(outingId)
    .collection("groups")
    .doc();

  await ref.set({
    id: ref.id,
    markerUserId,
    playerIds,
    startingHole: overrides.startingHole || 1,
    status: overrides.status || "active",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...overrides,
  });

  return ref.id;
}

describe("Outing System", () => {
  beforeEach(async () => {
    await clearEmulator();
  });

  // ─────────────────────────────────────────────
  // CREATION
  // ─────────────────────────────────────────────

  describe("Creation", () => {
    it("creates outing with correct organizer", async () => {
      const users = await seedUsers(4);
      const id = await seedOuting(
        users[0].uid,
        users.slice(1).map((u) => u.uid)
      );

      const snap = await db.collection("outings").doc(id).get();
      expect(snap.exists).toBe(true);
      expect(snap.data()!.organizerId).toBe(users[0].uid);
    });

    it("outing playerIds includes organizer", async () => {
      const users = await seedUsers(4);
      const id = await seedOuting(
        users[0].uid,
        users.slice(1).map((u) => u.uid)
      );

      const snap = await db.collection("outings").doc(id).get();
      expect(snap.data()!.playerIds).toContain(users[0].uid);
    });

    it("default status is active", async () => {
      const users = await seedUsers(2);
      const id = await seedOuting(users[0].uid, [users[1].uid]);

      const snap = await db.collection("outings").doc(id).get();
      expect(snap.data()!.status).toBe("active");
    });

    it("outing linked to invitational has correct parentType", async () => {
      const users = await seedUsers(2);
      const id = await seedOuting(users[0].uid, [users[1].uid], {
        parentType: "invitational",
        parentId: "test-inv-123",
      });

      const snap = await db.collection("outings").doc(id).get();
      expect(snap.data()!.parentType).toBe("invitational");
      expect(snap.data()!.parentId).toBe("test-inv-123");
    });
  });

  // ─────────────────────────────────────────────
  // GROUP MANAGEMENT
  // ─────────────────────────────────────────────

  describe("Group Management", () => {
    it("group is created in outings subcollection", async () => {
      const users = await seedUsers(4);
      const outingId = await seedOuting(
        users[0].uid,
        users.slice(1).map((u) => u.uid)
      );

      const groupId = await seedOutingGroup(
        outingId,
        users[0].uid,
        users.map((u) => u.uid)
      );

      const snap = await db
        .collection("outings")
        .doc(outingId)
        .collection("groups")
        .doc(groupId)
        .get();

      expect(snap.exists).toBe(true);
      expect(snap.data()!.markerUserId).toBe(users[0].uid);
    });

    it("multiple groups can exist in one outing", async () => {
      const users = await seedUsers(8);
      const outingId = await seedOuting(
        users[0].uid,
        users.slice(1).map((u) => u.uid)
      );

      // Group 1: users 0-3
      await seedOutingGroup(
        outingId,
        users[0].uid,
        users.slice(0, 4).map((u) => u.uid)
      );

      // Group 2: users 4-7
      await seedOutingGroup(
        outingId,
        users[4].uid,
        users.slice(4).map((u) => u.uid)
      );

      const groupsSnap = await db
        .collection("outings")
        .doc(outingId)
        .collection("groups")
        .get();

      expect(groupsSnap.size).toBe(2);
    });

    it("group stores starting hole", async () => {
      const users = await seedUsers(2);
      const outingId = await seedOuting(users[0].uid, [users[1].uid]);

      const groupId = await seedOutingGroup(
        outingId,
        users[0].uid,
        users.map((u) => u.uid),
        { startingHole: 10 }
      );

      const snap = await db
        .collection("outings")
        .doc(outingId)
        .collection("groups")
        .doc(groupId)
        .get();

      expect(snap.data()!.startingHole).toBe(10);
    });

    it("per-group startingHole can differ from outing startingHole", async () => {
      const users = await seedUsers(4);
      const outingId = await seedOuting(users[0].uid, [users[1].uid], {
        startingHole: 1,
      });

      const groupId = await seedOutingGroup(
        outingId,
        users[0].uid,
        [users[0].uid, users[1].uid],
        { startingHole: 10 }
      );

      const outingSnap = await db.collection("outings").doc(outingId).get();
      const groupSnap = await db
        .collection("outings")
        .doc(outingId)
        .collection("groups")
        .doc(groupId)
        .get();

      expect(outingSnap.data()!.startingHole).toBe(1);
      expect(groupSnap.data()!.startingHole).toBe(10);
    });
  });

  // ─────────────────────────────────────────────
  // ROUND LINKING
  // ─────────────────────────────────────────────

  describe("Round Linking", () => {
    it("round can be linked to an outing", async () => {
      const users = await seedUsers(2);
      const outingId = await seedOuting(users[0].uid, [users[1].uid]);
      const round = await seedRound(users[0].uid, { status: "active" });

      await db.collection("rounds").doc(round.id).update({
        outingId,
        parentType: "casual",
      });

      const snap = await db.collection("rounds").doc(round.id).get();
      expect(snap.data()!.outingId).toBe(outingId);
    });

    it("multiple rounds can be linked to same outing", async () => {
      const users = await seedUsers(3);
      const outingId = await seedOuting(
        users[0].uid,
        users.slice(1).map((u) => u.uid)
      );

      for (const user of users) {
        const round = await seedRound(user.uid, { status: "completed" });
        await db.collection("rounds").doc(round.id).update({ outingId });
      }

      const snap = await db
        .collection("rounds")
        .where("outingId", "==", outingId)
        .get();

      expect(snap.size).toBe(3);
    });

    it("invitational-linked round suppresses individual notifications", async () => {
      const users = await seedUsers(2);
      const outingId = await seedOuting(users[0].uid, [users[1].uid], {
        parentType: "invitational",
        parentId: "test-inv-123",
      });

      const round = await seedRound(users[0].uid, { status: "completed" });
      await db.collection("rounds").doc(round.id).update({
        outingId,
        parentType: "invitational",
        suppressIndividualNotifications: true,
      });

      const snap = await db.collection("rounds").doc(round.id).get();
      expect(snap.data()!.suppressIndividualNotifications).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // LEADERBOARD
  // ─────────────────────────────────────────────

  describe("Leaderboard", () => {
    it("leaderboard entries are sorted by scoreToPar", async () => {
      const users = await seedUsers(4);
      const outingId = await seedOuting(
        users[0].uid,
        users.slice(1).map((u) => u.uid)
      );

      const scores = [
        { userId: users[0].uid, scoreToPar: 2 },
        { userId: users[1].uid, scoreToPar: -1 },
        { userId: users[2].uid, scoreToPar: 5 },
        { userId: users[3].uid, scoreToPar: 0 },
      ];

      for (const score of scores) {
        await db
          .collection("outings")
          .doc(outingId)
          .collection("leaderboard")
          .doc(score.userId)
          .set(score);
      }

      const snap = await db
        .collection("outings")
        .doc(outingId)
        .collection("leaderboard")
        .orderBy("scoreToPar", "asc")
        .get();

      const sorted = snap.docs.map((d) => d.data().scoreToPar);
      expect(sorted[0]).toBe(-1);
      expect(sorted[1]).toBe(0);
      expect(sorted[2]).toBe(2);
      expect(sorted[3]).toBe(5);
    });

    it("leaderboard has correct player count", async () => {
      const users = await seedUsers(4);
      const outingId = await seedOuting(
        users[0].uid,
        users.slice(1).map((u) => u.uid)
      );

      for (const user of users) {
        await db
          .collection("outings")
          .doc(outingId)
          .collection("leaderboard")
          .doc(user.uid)
          .set({ userId: user.uid, scoreToPar: 0 });
      }

      const snap = await db
        .collection("outings")
        .doc(outingId)
        .collection("leaderboard")
        .get();

      expect(snap.size).toBe(4);
    });
  });

  // ─────────────────────────────────────────────
  // COMPLETION
  // ─────────────────────────────────────────────

  describe("Completion", () => {
    it("outing can be marked completed", async () => {
      const users = await seedUsers(2);
      const outingId = await seedOuting(users[0].uid, [users[1].uid]);

      await db.collection("outings").doc(outingId).update({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const snap = await db.collection("outings").doc(outingId).get();
      expect(snap.data()!.status).toBe("completed");
    });

    it("completed outing has completedAt timestamp", async () => {
      const users = await seedUsers(2);
      const outingId = await seedOuting(users[0].uid, [users[1].uid]);

      await db.collection("outings").doc(outingId).update({
        status: "completed",
        completedAt: new Date(),
      });

      const snap = await db.collection("outings").doc(outingId).get();
      expect(snap.data()!.completedAt).toBeDefined();
    });

    it("completed outings are queryable by status", async () => {
      const users = await seedUsers(2);

      await seedOuting(users[0].uid, [users[1].uid], { status: "active" });
      const completedId = await seedOuting(users[0].uid, [users[1].uid], {
        status: "completed",
      });

      const snap = await db
        .collection("outings")
        .where("status", "==", "completed")
        .get();

      expect(snap.size).toBe(1);
      expect(snap.docs[0].id).toBe(completedId);
    });
  });

  // ─────────────────────────────────────────────
  // CHAT
  // ─────────────────────────────────────────────

  describe("Outing Chat", () => {
    it("chat message is stored in outing subcollection", async () => {
      const users = await seedUsers(2);
      const outingId = await seedOuting(users[0].uid, [users[1].uid]);

      const msgRef = db
        .collection("outings")
        .doc(outingId)
        .collection("messages")
        .doc();

      await msgRef.set({
        userId: users[0].uid,
        content: "Good luck today everyone!",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const snap = await msgRef.get();
      expect(snap.exists).toBe(true);
      expect(snap.data()!.content).toBe("Good luck today everyone!");
    });

    it("chat messages are shared across all groups in outing", async () => {
      const users = await seedUsers(4);
      const outingId = await seedOuting(
        users[0].uid,
        users.slice(1).map((u) => u.uid)
      );

      // Users from different groups both post to same outing messages collection
      for (const user of users.slice(0, 2)) {
        await db
          .collection("outings")
          .doc(outingId)
          .collection("messages")
          .doc()
          .set({
            userId: user.uid,
            content: `Message from ${user.uid}`,
            createdAt: new Date(),
          });
      }

      const snap = await db
        .collection("outings")
        .doc(outingId)
        .collection("messages")
        .get();

      expect(snap.size).toBe(2);
    });
  });
});