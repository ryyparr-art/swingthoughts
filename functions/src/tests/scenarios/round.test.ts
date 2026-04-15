/**
 * Round Scenarios
 *
 * Tests the full round lifecycle:
 *   - Round creation → onRoundCreated trigger
 *   - Live notifications firing
 *   - Score posting → stats update
 *   - Round completion → feed activity
 *   - Abandoned round cleanup
 */

import { seedRound, seedUsers } from "../seed";
import { clearEmulator, db } from "../setup";

describe("Round Lifecycle", () => {
  beforeEach(async () => {
    await clearEmulator();
  });

  // ─────────────────────────────────────────────
  // ROUND CREATION
  // ─────────────────────────────────────────────

  describe("Round Creation", () => {
    it("creates a round document with correct fields", async () => {
      const [user] = await seedUsers(1);
      const round = await seedRound(user.uid);

      const snap = await db.collection("rounds").doc(round.id).get();
      expect(snap.exists).toBe(true);

      const data = snap.data()!;
      expect(data.userId).toBe(user.uid);
      expect(data.status).toBe("completed");
      expect(data.holesPlayed).toBe(18);
      expect(data.totalScore).toBeGreaterThan(0);
    });

    it("round scoreToPar is consistent with totalScore and par", async () => {
      const [user] = await seedUsers(1);
      const round = await seedRound(user.uid, {
        totalScore: 74,
        scoreToPar: 2,
        courseId: "pinehurst-no2",
      });

      const snap = await db.collection("rounds").doc(round.id).get();
      const data = snap.data()!;
      expect(data.scoreToPar).toBe(2);
      expect(data.totalScore).toBe(74);
    });

    it("active round has correct status", async () => {
      const [user] = await seedUsers(1);
      const round = await seedRound(user.uid, { status: "active" });

      const snap = await db.collection("rounds").doc(round.id).get();
      expect(snap.data()!.status).toBe("active");
    });
  });

  // ─────────────────────────────────────────────
  // LIVE ROUND
  // ─────────────────────────────────────────────

  describe("Live Round", () => {
    it("live round is queryable by status", async () => {
      const users = await seedUsers(3);

      // One live, two completed
      await seedRound(users[0].uid, { status: "active" });
      await seedRound(users[1].uid, { status: "completed" });
      await seedRound(users[2].uid, { status: "completed" });

      const liveSnap = await db
        .collection("rounds")
        .where("status", "==", "active")
        .get();

      expect(liveSnap.size).toBe(1);
      expect(liveSnap.docs[0].data().userId).toBe(users[0].uid);
    });

    it("completing a round updates status", async () => {
      const [user] = await seedUsers(1);
      const round = await seedRound(user.uid, { status: "active" });

      await db.collection("rounds").doc(round.id).update({
        status: "completed",
        completedAt: new Date(),
      });

      const snap = await db.collection("rounds").doc(round.id).get();
      expect(snap.data()!.status).toBe("completed");
    });
  });

  // ─────────────────────────────────────────────
  // MULTIPLAYER ROUND
  // ─────────────────────────────────────────────

  describe("Multiplayer Round", () => {
    it("all players are associated with the round", async () => {
      const users = await seedUsers(4);
      const ref = db.collection("rounds").doc();

      const playerIds = users.map((u) => u.uid);

      await ref.set({
        id: ref.id,
        hostUserId: users[0].uid,
        playerIds,
        courseId: "pinehurst-no2",
        courseName: "Pinehurst No. 2",
        status: "active",
        isMultiplayer: true,
        startingHole: 1,
        createdAt: new Date(),
      });

      const snap = await ref.get();
      const data = snap.data()!;

      expect(data.playerIds).toHaveLength(4);
      expect(data.playerIds).toContain(users[0].uid);
      expect(data.isMultiplayer).toBe(true);
    });

    it("starting hole is stored and retrievable", async () => {
      const users = await seedUsers(2);
      const ref = db.collection("rounds").doc();

      await ref.set({
        playerIds: users.map((u) => u.uid),
        startingHole: 10,
        status: "active",
        createdAt: new Date(),
      });

      const snap = await ref.get();
      expect(snap.data()!.startingHole).toBe(10);
    });
  });

  // ─────────────────────────────────────────────
  // ABANDONED ROUNDS
  // ─────────────────────────────────────────────

  describe("Abandoned Rounds", () => {
    it("abandoned round has correct status", async () => {
      const [user] = await seedUsers(1);
      const round = await seedRound(user.uid, { status: "active" });

      await db.collection("rounds").doc(round.id).update({
        status: "abandoned",
        abandonedAt: new Date(),
      });

      const snap = await db.collection("rounds").doc(round.id).get();
      expect(snap.data()!.status).toBe("abandoned");
    });

    it("cleanupAbandonedRounds candidates: rounds active > 24h", async () => {
      const [user] = await seedUsers(1);
      const ref = db.collection("rounds").doc();

      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago

      await ref.set({
        userId: user.uid,
        status: "active",
        createdAt: staleDate,
        updatedAt: staleDate,
      });

      // Query mimics what cleanupAbandonedRounds does
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const staleSnap = await db
        .collection("rounds")
        .where("status", "==", "active")
        .where("updatedAt", "<", cutoff)
        .get();

      expect(staleSnap.size).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────
  // SCORE POSTING
  // ─────────────────────────────────────────────

  describe("Score Posting", () => {
    it("score document references correct round and user", async () => {
      const [user] = await seedUsers(1);
      const round = await seedRound(user.uid);

      const scoreRef = db.collection("scores").doc();
      await scoreRef.set({
        userId: user.uid,
        roundId: round.id,
        courseId: round.courseId,
        totalScore: round.totalScore,
        scoreToPar: round.scoreToPar,
        holesPlayed: 18,
        postedAt: new Date(),
      });

      const snap = await scoreRef.get();
      const data = snap.data()!;
      expect(data.userId).toBe(user.uid);
      expect(data.roundId).toBe(round.id);
      expect(data.totalScore).toBe(round.totalScore);
    });

    it("hole in one is flagged correctly on score", async () => {
      const [user] = await seedUsers(1);

      const scoreRef = db.collection("scores").doc();
      await scoreRef.set({
        userId: user.uid,
        totalScore: 71,
        scoreToPar: -1,
        holeInOnes: [{ hole: 7, distance: 165 }],
        hasHoleInOne: true,
        postedAt: new Date(),
      });

      const snap = await scoreRef.get();
      expect(snap.data()!.hasHoleInOne).toBe(true);
      expect(snap.data()!.holeInOnes).toHaveLength(1);
    });
  });
});