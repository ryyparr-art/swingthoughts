/**
 * Cleanup Abandoned Rounds Scenarios
 *
 * Tests stale round detection, status updates,
 * and cleanup Cloud Function logic.
 */

import * as admin from "firebase-admin";
import { seedRound, seedUsers } from "../seed";
import { clearEmulator, db } from "../setup";

const ABANDONED_THRESHOLD_HOURS = 24;

async function seedStaleRound(userId: string, hoursAgo: number) {
  const staleDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  const ref = db.collection("rounds").doc();

  await ref.set({
    id: ref.id,
    userId,
    courseId: "pinehurst-no2",
    courseName: "Pinehurst No. 2",
    status: "active",
    createdAt: staleDate,
    updatedAt: staleDate,
  });

  return ref.id;
}

describe("Cleanup Abandoned Rounds", () => {
  beforeEach(async () => {
    await clearEmulator();
  });

  // ─────────────────────────────────────────────
  // STALE ROUND DETECTION
  // ─────────────────────────────────────────────

  describe("Stale Round Detection", () => {
    it("round active > 24h is a cleanup candidate", async () => {
      const [user] = await seedUsers(1);
      await seedStaleRound(user.uid, 25);

      const cutoff = new Date(
        Date.now() - ABANDONED_THRESHOLD_HOURS * 60 * 60 * 1000
      );

      const snap = await db
        .collection("rounds")
        .where("status", "==", "active")
        .where("updatedAt", "<", cutoff)
        .get();

      expect(snap.size).toBe(1);
    });

    it("round active < 24h is NOT a cleanup candidate", async () => {
      const [user] = await seedUsers(1);
      await seedStaleRound(user.uid, 12); // Only 12h old

      const cutoff = new Date(
        Date.now() - ABANDONED_THRESHOLD_HOURS * 60 * 60 * 1000
      );

      const snap = await db
        .collection("rounds")
        .where("status", "==", "active")
        .where("updatedAt", "<", cutoff)
        .get();

      expect(snap.size).toBe(0);
    });

    it("completed rounds are not cleanup candidates", async () => {
      const [user] = await seedUsers(1);
      const staleDate = new Date(Date.now() - 30 * 60 * 60 * 1000);

      const ref = db.collection("rounds").doc();
      await ref.set({
        userId: user.uid,
        status: "completed", // Already completed
        createdAt: staleDate,
        updatedAt: staleDate,
      });

      const cutoff = new Date(
        Date.now() - ABANDONED_THRESHOLD_HOURS * 60 * 60 * 1000
      );

      const snap = await db
        .collection("rounds")
        .where("status", "==", "active")
        .where("updatedAt", "<", cutoff)
        .get();

      expect(snap.size).toBe(0);
    });

    it("already abandoned rounds are not re-processed", async () => {
      const [user] = await seedUsers(1);
      const staleDate = new Date(Date.now() - 30 * 60 * 60 * 1000);

      const ref = db.collection("rounds").doc();
      await ref.set({
        userId: user.uid,
        status: "abandoned",
        createdAt: staleDate,
        updatedAt: staleDate,
      });

      const cutoff = new Date(
        Date.now() - ABANDONED_THRESHOLD_HOURS * 60 * 60 * 1000
      );

      const snap = await db
        .collection("rounds")
        .where("status", "==", "active")
        .where("updatedAt", "<", cutoff)
        .get();

      expect(snap.size).toBe(0);
    });
  });

  // ─────────────────────────────────────────────
  // CLEANUP EXECUTION
  // ─────────────────────────────────────────────

  describe("Cleanup Execution", () => {
    it("stale round is marked abandoned", async () => {
      const [user] = await seedUsers(1);
      const roundId = await seedStaleRound(user.uid, 25);

      // Simulate what cleanupAbandonedRounds does
      await db.collection("rounds").doc(roundId).update({
        status: "abandoned",
        abandonedAt: admin.firestore.FieldValue.serverTimestamp(),
        abandonReason: "timeout",
      });

      const snap = await db.collection("rounds").doc(roundId).get();
      expect(snap.data()!.status).toBe("abandoned");
      expect(snap.data()!.abandonReason).toBe("timeout");
    });

    it("multiple stale rounds all get cleaned up", async () => {
      const users = await seedUsers(3);

      const ids = await Promise.all([
        seedStaleRound(users[0].uid, 26),
        seedStaleRound(users[1].uid, 30),
        seedStaleRound(users[2].uid, 48),
      ]);

      const cutoff = new Date(
        Date.now() - ABANDONED_THRESHOLD_HOURS * 60 * 60 * 1000
      );

      const staleSnap = await db
        .collection("rounds")
        .where("status", "==", "active")
        .where("updatedAt", "<", cutoff)
        .get();

      // Simulate batch update
      const batch = db.batch();
      staleSnap.docs.forEach((d) => {
        batch.update(d.ref, {
          status: "abandoned",
          abandonedAt: new Date(),
          abandonReason: "timeout",
        });
      });
      await batch.commit();

      // Verify all are now abandoned
      for (const id of ids) {
        const snap = await db.collection("rounds").doc(id).get();
        expect(snap.data()!.status).toBe("abandoned");
      }
    });

    it("fresh active rounds are untouched by cleanup", async () => {
      const users = await seedUsers(2);

      // One stale, one fresh
      const staleId = await seedStaleRound(users[0].uid, 25);
      const freshRound = await seedRound(users[1].uid, { status: "active" });

      const cutoff = new Date(
        Date.now() - ABANDONED_THRESHOLD_HOURS * 60 * 60 * 1000
      );

      const staleSnap = await db
        .collection("rounds")
        .where("status", "==", "active")
        .where("updatedAt", "<", cutoff)
        .get();

      // Only stale round in cleanup candidates
      expect(staleSnap.size).toBe(1);
      expect(staleSnap.docs[0].id).toBe(staleId);

      // Fresh round still active
      const freshSnap = await db
        .collection("rounds")
        .doc(freshRound.id)
        .get();
      expect(freshSnap.data()!.status).toBe("active");
    });
  });

  // ─────────────────────────────────────────────
  // PAUSE ROUND
  // ─────────────────────────────────────────────

  describe("Pause Round", () => {
    it("paused round has paused status", async () => {
      const [user] = await seedUsers(1);
      const round = await seedRound(user.uid, { status: "active" });

      await db.collection("rounds").doc(round.id).update({
        status: "paused",
        pausedAt: new Date(),
      });

      const snap = await db.collection("rounds").doc(round.id).get();
      expect(snap.data()!.status).toBe("paused");
    });

    it("paused round can be resumed", async () => {
      const [user] = await seedUsers(1);
      const round = await seedRound(user.uid, { status: "active" });

      await db.collection("rounds").doc(round.id).update({
        status: "paused",
        pausedAt: new Date(),
      });

      await db.collection("rounds").doc(round.id).update({
        status: "active",
        resumedAt: new Date(),
      });

      const snap = await db.collection("rounds").doc(round.id).get();
      expect(snap.data()!.status).toBe("active");
    });

    it("paused round is not a cleanup candidate", async () => {
      const [user] = await seedUsers(1);
      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);

      const ref = db.collection("rounds").doc();
      await ref.set({
        userId: user.uid,
        status: "paused", // Paused, not active
        createdAt: staleDate,
        updatedAt: staleDate,
      });

      const cutoff = new Date(
        Date.now() - ABANDONED_THRESHOLD_HOURS * 60 * 60 * 1000
      );

      const snap = await db
        .collection("rounds")
        .where("status", "==", "active") // Only queries active
        .where("updatedAt", "<", cutoff)
        .get();

      expect(snap.size).toBe(0);
    });
  });
});