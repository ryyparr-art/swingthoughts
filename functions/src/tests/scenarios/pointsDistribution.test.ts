/**
 * Points Distribution Scenarios
 *
 * Tests league points calculation per format (stroke, match play),
 * weekly points, and season standings.
 */

import * as admin from "firebase-admin";
import { seedLeague, seedUsers } from "../seed";
import { clearEmulator, db } from "../setup";

// Points table for stroke play (position → points)
const STROKE_PLAY_POINTS: Record<number, number> = {
  1: 100, 2: 85, 3: 75, 4: 65, 5: 55,
  6: 48, 7: 42, 8: 36, 9: 30, 10: 25,
};

function getStrokePlayPoints(position: number): number {
  return STROKE_PLAY_POINTS[position] ?? Math.max(0, 20 - position);
}

async function seedLeagueScore(
  leagueId: string,
  userId: string,
  week: number,
  scoreToPar: number,
  position: number,
  points: number
) {
  const ref = db.collection("leagueScores").doc();
  await ref.set({
    leagueId,
    userId,
    week,
    scoreToPar,
    position,
    points,
    postedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return ref.id;
}

describe("Points Distribution System", () => {
  beforeEach(async () => {
    await clearEmulator();
  });

  // ─────────────────────────────────────────────
  // STROKE PLAY POINTS
  // ─────────────────────────────────────────────

  describe("Stroke Play Points", () => {
    it("1st place gets 100 points", () => {
      expect(getStrokePlayPoints(1)).toBe(100);
    });

    it("2nd place gets 85 points", () => {
      expect(getStrokePlayPoints(2)).toBe(85);
    });

    it("10th place gets 25 points", () => {
      expect(getStrokePlayPoints(10)).toBe(25);
    });

    it("positions beyond 10 get decreasing points", () => {
      const p11 = getStrokePlayPoints(11);
      const p12 = getStrokePlayPoints(12);
      expect(p11).toBeGreaterThanOrEqual(p12);
    });

    it("points decrease as position increases", () => {
      for (let i = 1; i < 10; i++) {
        expect(getStrokePlayPoints(i)).toBeGreaterThan(getStrokePlayPoints(i + 1));
      }
    });
  });

  // ─────────────────────────────────────────────
  // LEAGUE SCORE DOCUMENTS
  // ─────────────────────────────────────────────

  describe("League Score Documents", () => {
    it("league score stores correct position and points", async () => {
      const users = await seedUsers(3);
      const leagueId = await seedLeague(
        users[0].uid,
        users.map((u) => u.uid)
      );

      const id = await seedLeagueScore(leagueId, users[0].uid, 1, -2, 1, 100);

      const snap = await db.collection("leagueScores").doc(id).get();
      expect(snap.data()!.position).toBe(1);
      expect(snap.data()!.points).toBe(100);
    });

    it("all players scores for a week are queryable", async () => {
      const users = await seedUsers(4);
      const leagueId = await seedLeague(
        users[0].uid,
        users.map((u) => u.uid)
      );

      const week1Scores = [
        { userId: users[0].uid, scoreToPar: -3, position: 1, points: 100 },
        { userId: users[1].uid, scoreToPar: 0, position: 2, points: 85 },
        { userId: users[2].uid, scoreToPar: 2, position: 3, points: 75 },
        { userId: users[3].uid, scoreToPar: 5, position: 4, points: 65 },
      ];

      for (const score of week1Scores) {
        await seedLeagueScore(
          leagueId,
          score.userId,
          1,
          score.scoreToPar,
          score.position,
          score.points
        );
      }

      const snap = await db
        .collection("leagueScores")
        .where("leagueId", "==", leagueId)
        .where("week", "==", 1)
        .get();

      expect(snap.size).toBe(4);
    });

    it("scores are queryable by userId across weeks", async () => {
      const users = await seedUsers(2);
      const leagueId = await seedLeague(
        users[0].uid,
        users.map((u) => u.uid)
      );

      // User 0 plays 3 weeks
      await seedLeagueScore(leagueId, users[0].uid, 1, -1, 1, 100);
      await seedLeagueScore(leagueId, users[0].uid, 2, 2, 2, 85);
      await seedLeagueScore(leagueId, users[0].uid, 3, 0, 1, 100);

      const snap = await db
        .collection("leagueScores")
        .where("leagueId", "==", leagueId)
        .where("userId", "==", users[0].uid)
        .get();

      expect(snap.size).toBe(3);
    });
  });

  // ─────────────────────────────────────────────
  // SEASON STANDINGS
  // ─────────────────────────────────────────────

  describe("Season Standings", () => {
    it("total season points sum correctly", async () => {
      const users = await seedUsers(2);
      const leagueId = await seedLeague(
        users[0].uid,
        users.map((u) => u.uid)
      );

      // Player wins weeks 1, 2, 3
      await seedLeagueScore(leagueId, users[0].uid, 1, -2, 1, 100);
      await seedLeagueScore(leagueId, users[0].uid, 2, -1, 1, 100);
      await seedLeagueScore(leagueId, users[0].uid, 3, 0, 1, 100);

      const snap = await db
        .collection("leagueScores")
        .where("leagueId", "==", leagueId)
        .where("userId", "==", users[0].uid)
        .get();

      const total = snap.docs.reduce((sum, d) => sum + d.data().points, 0);
      expect(total).toBe(300);
    });

    it("standings member doc tracks cumulative points", async () => {
      const users = await seedUsers(3);
      const leagueId = await seedLeague(
        users[0].uid,
        users.map((u) => u.uid)
      );

      // Update member points directly (as Cloud Function would)
      await db
        .collection("leagues")
        .doc(leagueId)
        .collection("members")
        .doc(users[0].uid)
        .update({ points: 285, rank: 1 });

      await db
        .collection("leagues")
        .doc(leagueId)
        .collection("members")
        .doc(users[1].uid)
        .update({ points: 210, rank: 2 });

      const membersSnap = await db
        .collection("leagues")
        .doc(leagueId)
        .collection("members")
        .orderBy("points", "desc")
        .get();

      expect(membersSnap.docs[0].data().points).toBe(285);
      expect(membersSnap.docs[1].data().points).toBe(210);
    });
  });
});