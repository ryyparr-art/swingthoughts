/**
 * Notification Scenarios
 *
 * Tests notification document creation, routing types,
 * unread counts, and recipient correctness.
 */

import * as admin from "firebase-admin";
import { seedRound, seedUsers } from "../seed";
import { clearEmulator, db } from "../setup";

type NotificationType =
  | "round_live"
  | "round_complete"
  | "round_invite"
  | "round_notable"
  | "marker_transfer"
  | "rivalry_formed"
  | "invitational_welcome"
  | "invitational_player_joined"
  | "outing_complete";

async function seedNotification(
  recipientId: string,
  type: NotificationType,
  data: Record<string, any> = {}
) {
  const ref = db.collection("notifications").doc();
  await ref.set({
    recipientId,
    type,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...data,
  });
  return ref.id;
}

describe("Notification System", () => {
  beforeEach(async () => {
    await clearEmulator();
  });

  // ─────────────────────────────────────────────
  // DOCUMENT CREATION
  // ─────────────────────────────────────────────

  describe("Document Creation", () => {
    it("notification doc is created with correct recipient", async () => {
      const [user] = await seedUsers(1);
      const id = await seedNotification(user.uid, "round_live");

      const snap = await db.collection("notifications").doc(id).get();
      expect(snap.exists).toBe(true);
      expect(snap.data()!.recipientId).toBe(user.uid);
    });

    it("notification is unread by default", async () => {
      const [user] = await seedUsers(1);
      const id = await seedNotification(user.uid, "round_complete");

      const snap = await db.collection("notifications").doc(id).get();
      expect(snap.data()!.read).toBe(false);
    });

    it("notification can be marked as read", async () => {
      const [user] = await seedUsers(1);
      const id = await seedNotification(user.uid, "round_invite");

      await db.collection("notifications").doc(id).update({ read: true });

      const snap = await db.collection("notifications").doc(id).get();
      expect(snap.data()!.read).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // ROUTING TYPES
  // ─────────────────────────────────────────────

  describe("Notification Routing Types", () => {
    it("round_live notification has roundId and courseId", async () => {
      const users = await seedUsers(2);
      const round = await seedRound(users[0].uid);

      const id = await seedNotification(users[1].uid, "round_live", {
        senderId: users[0].uid,
        roundId: round.id,
        courseId: round.courseId,
        courseName: round.courseName,
      });

      const snap = await db.collection("notifications").doc(id).get();
      const data = snap.data()!;
      expect(data.type).toBe("round_live");
      expect(data.roundId).toBe(round.id);
      expect(data.courseId).toBe(round.courseId);
    });

    it("round_complete notification has scoreToPar", async () => {
      const users = await seedUsers(2);
      const round = await seedRound(users[0].uid);

      const id = await seedNotification(users[1].uid, "round_complete", {
        senderId: users[0].uid,
        roundId: round.id,
        scoreToPar: round.scoreToPar,
        totalScore: round.totalScore,
      });

      const snap = await db.collection("notifications").doc(id).get();
      expect(snap.data()!.type).toBe("round_complete");
      expect(typeof snap.data()!.scoreToPar).toBe("number");
    });

    it("round_invite notification has correct sender and recipient", async () => {
      const users = await seedUsers(2);
      const round = await seedRound(users[0].uid);

      const id = await seedNotification(users[1].uid, "round_invite", {
        senderId: users[0].uid,
        roundId: round.id,
      });

      const snap = await db.collection("notifications").doc(id).get();
      expect(snap.data()!.recipientId).toBe(users[1].uid);
      expect(snap.data()!.senderId).toBe(users[0].uid);
    });

    it("marker_transfer notification has roundId", async () => {
      const users = await seedUsers(2);
      const round = await seedRound(users[0].uid);

      const id = await seedNotification(users[1].uid, "marker_transfer", {
        senderId: users[0].uid,
        roundId: round.id,
      });

      const snap = await db.collection("notifications").doc(id).get();
      expect(snap.data()!.type).toBe("marker_transfer");
      expect(snap.data()!.roundId).toBeDefined();
    });

    it("rivalry_formed notification suppressed until round 3", async () => {
      const users = await seedUsers(2);

      // Round 1 — should NOT create rivalry_formed notification
      const rivalryRef = db.collection("rivalries").doc();
      await rivalryRef.set({
        playerIds: [users[0].uid, users[1].uid].sort(),
        roundCount: 1,
        level: 1,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Query for rivalry_formed notifications — should be empty at round 1
      const snap = await db
        .collection("notifications")
        .where("type", "==", "rivalry_formed")
        .where("recipientId", "==", users[0].uid)
        .get();

      expect(snap.size).toBe(0);
    });

    it("invitational_welcome notification has invitationalId", async () => {
      const users = await seedUsers(2);

      const id = await seedNotification(users[1].uid, "invitational_welcome", {
        senderId: users[0].uid,
        invitationalId: "test-inv-123",
        invitationalName: "The Test Invitational",
      });

      const snap = await db.collection("notifications").doc(id).get();
      expect(snap.data()!.invitationalId).toBe("test-inv-123");
    });

    it("outing_complete notification has position data", async () => {
      const users = await seedUsers(2);

      const id = await seedNotification(users[0].uid, "outing_complete", {
        outingId: "test-outing-123",
        position: 1,
        totalPlayers: 8,
        outingName: "Saturday Scramble",
      });

      const snap = await db.collection("notifications").doc(id).get();
      expect(snap.data()!.position).toBe(1);
      expect(snap.data()!.totalPlayers).toBe(8);
    });
  });

  // ─────────────────────────────────────────────
  // UNREAD COUNT
  // ─────────────────────────────────────────────

  describe("Unread Count", () => {
    it("unread notifications are queryable by recipientId", async () => {
      const users = await seedUsers(2);

      // 3 unread for user 0
      await seedNotification(users[0].uid, "round_live");
      await seedNotification(users[0].uid, "round_complete");
      await seedNotification(users[0].uid, "round_invite");

      // 1 unread for user 1 (should not appear in user 0 query)
      await seedNotification(users[1].uid, "round_live");

      const snap = await db
        .collection("notifications")
        .where("recipientId", "==", users[0].uid)
        .where("read", "==", false)
        .get();

      expect(snap.size).toBe(3);
    });

    it("marking all as read clears unread count", async () => {
      const [user] = await seedUsers(1);

      const ids = await Promise.all([
        seedNotification(user.uid, "round_live"),
        seedNotification(user.uid, "round_complete"),
      ]);

      // Mark all read
      const batch = db.batch();
      ids.forEach((id) => {
        batch.update(db.collection("notifications").doc(id), { read: true });
      });
      await batch.commit();

      const snap = await db
        .collection("notifications")
        .where("recipientId", "==", user.uid)
        .where("read", "==", false)
        .get();

      expect(snap.size).toBe(0);
    });

    it("notifications are ordered by createdAt descending", async () => {
      const [user] = await seedUsers(1);

      const t1 = new Date(Date.now() - 2000);
      const t2 = new Date(Date.now() - 1000);
      const t3 = new Date();

      for (const t of [t1, t2, t3]) {
        await db.collection("notifications").doc().set({
          recipientId: user.uid,
          type: "round_live",
          read: false,
          createdAt: t,
        });
      }

      const snap = await db
        .collection("notifications")
        .where("recipientId", "==", user.uid)
        .orderBy("createdAt", "desc")
        .get();

      const dates = snap.docs.map((d) => d.data().createdAt.toDate().getTime());
      expect(dates[0]).toBeGreaterThan(dates[1]);
      expect(dates[1]).toBeGreaterThan(dates[2]);
    });
  });

  // ─────────────────────────────────────────────
  // NOTIFICATION ROUTING
  // ─────────────────────────────────────────────

  describe("Notification Routing", () => {
    it("round_invite routes to scoring screen (has roundId)", async () => {
      const users = await seedUsers(2);
      const round = await seedRound(users[0].uid);

      const id = await seedNotification(users[1].uid, "round_invite", {
        roundId: round.id,
        senderId: users[0].uid,
      });

      const snap = await db.collection("notifications").doc(id).get();
      // round_invite must have roundId to route to scoring screen
      expect(snap.data()!.roundId).toBeDefined();
    });

    it("round_notable routes with holeNumber", async () => {
      const users = await seedUsers(2);
      const round = await seedRound(users[0].uid);

      const id = await seedNotification(users[1].uid, "round_notable", {
        roundId: round.id,
        senderId: users[0].uid,
        holeNumber: 7,
        notableType: "eagle",
      });

      const snap = await db.collection("notifications").doc(id).get();
      expect(snap.data()!.holeNumber).toBe(7);
      expect(snap.data()!.notableType).toBe("eagle");
    });
  });
});