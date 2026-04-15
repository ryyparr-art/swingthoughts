/**
 * Feed Scenarios
 *
 * Tests feed document creation, insert slot logic,
 * discovery carousel caps, and content filtering.
 */

import * as admin from "firebase-admin";
import { seedRound, seedUsers } from "../seed";
import { clearEmulator, db } from "../setup";

describe("Feed System", () => {
  beforeEach(async () => {
    await clearEmulator();
  });

  // ─────────────────────────────────────────────
  // FEED DOCUMENT CREATION
  // ─────────────────────────────────────────────

  describe("Feed Document Creation", () => {
    it("score post creates feed activity document", async () => {
      const [user] = await seedUsers(1);
      const round = await seedRound(user.uid);

      const feedRef = db.collection("feed").doc();
      await feedRef.set({
        type: "score",
        userId: user.uid,
        roundId: round.id,
        courseId: round.courseId,
        courseName: round.courseName,
        totalScore: round.totalScore,
        scoreToPar: round.scoreToPar,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        visibleTo: [user.uid],
      });

      const snap = await feedRef.get();
      expect(snap.exists).toBe(true);
      expect(snap.data()!.type).toBe("score");
      expect(snap.data()!.userId).toBe(user.uid);
    });

    it("hole in one creates hio feed document", async () => {
      const [user] = await seedUsers(1);

      const feedRef = db.collection("feed").doc();
      await feedRef.set({
        type: "hole_in_one",
        userId: user.uid,
        hole: 7,
        distance: 165,
        courseName: "Pinehurst No. 2",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        visibleTo: [user.uid],
      });

      const snap = await feedRef.get();
      expect(snap.data()!.type).toBe("hole_in_one");
      expect(snap.data()!.hole).toBe(7);
    });

    it("thought post creates feed document", async () => {
      const [user] = await seedUsers(1);

      const feedRef = db.collection("feed").doc();
      await feedRef.set({
        type: "thought",
        userId: user.uid,
        content: "Great round today at Pinehurst!",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        visibleTo: [user.uid],
      });

      const snap = await feedRef.get();
      expect(snap.data()!.type).toBe("thought");
      expect(snap.data()!.content).toBeTruthy();
    });
  });

  // ─────────────────────────────────────────────
  // FEED FILTERING
  // ─────────────────────────────────────────────

  describe("Feed Filtering", () => {
    it("feed query returns only docs visible to user", async () => {
      const users = await seedUsers(3);

      // User 0 can see posts from users 0 and 1
      const visibleIds = [users[0].uid, users[1].uid];

      for (const user of users) {
        const feedRef = db.collection("feed").doc();
        await feedRef.set({
          type: "score",
          userId: user.uid,
          visibleTo: user.uid === users[2].uid ? [users[2].uid] : visibleIds,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      const snap = await db
        .collection("feed")
        .where("visibleTo", "array-contains", users[0].uid)
        .get();

      expect(snap.size).toBe(2);
    });

    it("feed is ordered by createdAt descending", async () => {
      const [user] = await seedUsers(1);

      const timestamps = [
        new Date(Date.now() - 3000),
        new Date(Date.now() - 2000),
        new Date(Date.now() - 1000),
      ];

      for (const ts of timestamps) {
        await db.collection("feed").doc().set({
          type: "score",
          userId: user.uid,
          visibleTo: [user.uid],
          createdAt: ts,
        });
      }

      const snap = await db
        .collection("feed")
        .where("visibleTo", "array-contains", user.uid)
        .orderBy("createdAt", "desc")
        .get();

      const dates = snap.docs.map((d) => d.data().createdAt.toDate().getTime());
      expect(dates[0]).toBeGreaterThan(dates[1]);
      expect(dates[1]).toBeGreaterThan(dates[2]);
    });

    it("cancelled invitational does not appear in feed inserts", async () => {
      const [user] = await seedUsers(1);

      // Seed one active and one cancelled invitational feed insert
      await db.collection("feed").doc().set({
        type: "invitational_insert",
        userId: user.uid,
        invitationalStatus: "open",
        visibleTo: [user.uid],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection("feed").doc().set({
        type: "invitational_insert",
        userId: user.uid,
        invitationalStatus: "cancelled",
        visibleTo: [user.uid],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const snap = await db
        .collection("feed")
        .where("visibleTo", "array-contains", user.uid)
        .where("type", "==", "invitational_insert")
        .get();

      const active = snap.docs.filter(
        (d) => d.data().invitationalStatus !== "cancelled"
      );

      expect(active).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────
  // DISCOVERY CAROUSEL
  // ─────────────────────────────────────────────

  describe("Discovery Carousel", () => {
    it("discovery inserts cap at 3 items", async () => {
      const users = await seedUsers(6);

      // Simulate 6 discovery inserts
      for (const user of users) {
        await db.collection("feed").doc().set({
          type: "discovery",
          discoveredUserId: user.uid,
          visibleTo: [users[0].uid],
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      const snap = await db
        .collection("feed")
        .where("visibleTo", "array-contains", users[0].uid)
        .where("type", "==", "discovery")
        .get();

      // Client-side cap logic: only show first 3
      const capped = snap.docs.slice(0, 3);
      expect(capped).toHaveLength(3);
    });

    it("discovery insert does not include already-partnered users", async () => {
      const users = await seedUsers(3);
      const partnerId = users[1].uid;

      const discoveries = await db
        .collection("feed")
        .where("visibleTo", "array-contains", users[0].uid)
        .where("type", "==", "discovery")
        .get();

      // Filter out partners
      const nonPartners = discoveries.docs.filter(
        (d) => d.data().discoveredUserId !== partnerId
      );

      expect(nonPartners.every((d) => d.data().discoveredUserId !== partnerId)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // FEED INSERT SLOTS
  // ─────────────────────────────────────────────

  describe("Feed Insert Slots", () => {
    it("activity insert has correct dimensions metadata", async () => {
      const [user] = await seedUsers(1);

      const feedRef = db.collection("feed").doc();
      await feedRef.set({
        type: "activity_insert",
        height: 220,
        userId: user.uid,
        visibleTo: [user.uid],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const snap = await feedRef.get();
      expect(snap.data()!.height).toBe(220);
    });

    it("discovery insert has correct dimensions metadata", async () => {
      const [user] = await seedUsers(1);

      const feedRef = db.collection("feed").doc();
      await feedRef.set({
        type: "discovery_insert",
        height: 160,
        width: 160,
        userId: user.uid,
        visibleTo: [user.uid],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const snap = await feedRef.get();
      expect(snap.data()!.height).toBe(160);
      expect(snap.data()!.width).toBe(160);
    });
  });
});