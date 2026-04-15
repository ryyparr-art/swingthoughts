/**
 * Leaderboard Scenarios
 *
 * Tests leaderboardId chain, score writes, lowman badge logic,
 * and course lookup fallback.
 */

import * as admin from "firebase-admin";
import { seedRound, seedUsers } from "../seed";
import { clearEmulator, db } from "../setup";

async function seedLeaderboard(courseId: string, leaderboardId: string) {
  const ref = db.collection("leaderboards").doc(leaderboardId);
  await ref.set({
    id: leaderboardId,
    courseId,
    courseName: "Test Course",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return leaderboardId;
}

async function seedCourse(
  courseId: string,
  leaderboardId: string,
  regionKey: string
) {
  const ref = db.collection("courses").doc(courseId);
  await ref.set({
    id: courseId,
    name: "Test Course",
    leaderboardId,
    regionKey,
    par: 72,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return courseId;
}

describe("Leaderboard System", () => {
  beforeEach(async () => {
    await clearEmulator();
  });

  // ─────────────────────────────────────────────
  // LEADERBOARD ID CHAIN
  // ─────────────────────────────────────────────

  describe("LeaderboardId Chain", () => {
    it("course doc has leaderboardId field", async () => {
      await seedCourse("pinehurst-no2", "lb-pinehurst-no2", "southeast");

      const snap = await db.collection("courses").doc("pinehurst-no2").get();
      expect(snap.data()!.leaderboardId).toBe("lb-pinehurst-no2");
    });

    it("course doc has regionKey field", async () => {
      await seedCourse("pinehurst-no2", "lb-pinehurst-no2", "southeast");

      const snap = await db.collection("courses").doc("pinehurst-no2").get();
      expect(snap.data()!.regionKey).toBe("southeast");
    });

    it("leaderboard is queryable by courseId", async () => {
      await seedCourse("pinehurst-no2", "lb-pinehurst-no2", "southeast");
      await seedLeaderboard("pinehurst-no2", "lb-pinehurst-no2");

      const snap = await db
        .collection("leaderboards")
        .where("courseId", "==", "pinehurst-no2")
        .get();

      expect(snap.size).toBe(1);
      expect(snap.docs[0].id).toBe("lb-pinehurst-no2");
    });

    it("score doc carries leaderboardId from round", async () => {
      const [user] = await seedUsers(1);
      await seedCourse("pinehurst-no2", "lb-pinehurst-no2", "southeast");
      await seedLeaderboard("pinehurst-no2", "lb-pinehurst-no2");

      const round = await seedRound(user.uid, { courseId: "pinehurst-no2" });

      const scoreRef = db.collection("scores").doc();
      await scoreRef.set({
        userId: user.uid,
        roundId: round.id,
        courseId: "pinehurst-no2",
        leaderboardId: "lb-pinehurst-no2",
        totalScore: round.totalScore,
        scoreToPar: round.scoreToPar,
        postedAt: new Date(),
      });

      const snap = await scoreRef.get();
      expect(snap.data()!.leaderboardId).toBe("lb-pinehurst-no2");
    });

    it("scores are queryable by leaderboardId", async () => {
      const users = await seedUsers(3);
      await seedLeaderboard("pinehurst-no2", "lb-pinehurst-no2");

      for (const user of users) {
        const round = await seedRound(user.uid, { courseId: "pinehurst-no2" });
        await db.collection("scores").doc().set({
          userId: user.uid,
          roundId: round.id,
          leaderboardId: "lb-pinehurst-no2",
          totalScore: round.totalScore,
          scoreToPar: round.scoreToPar,
          postedAt: new Date(),
        });
      }

      const snap = await db
        .collection("scores")
        .where("leaderboardId", "==", "lb-pinehurst-no2")
        .get();

      expect(snap.size).toBe(3);
    });
  });

  // ─────────────────────────────────────────────
  // LOWMAN BADGE
  // ─────────────────────────────────────────────

  describe("Lowman Badge Logic", () => {
    it("lowest scoreToPar on leaderboard is the lowman", async () => {
      const users = await seedUsers(4);
      await seedLeaderboard("pinehurst-no2", "lb-pinehurst-no2");

      const scores = [
        { userId: users[0].uid, scoreToPar: 3 },
        { userId: users[1].uid, scoreToPar: -2 },
        { userId: users[2].uid, scoreToPar: 0 },
        { userId: users[3].uid, scoreToPar: 1 },
      ];

      for (const score of scores) {
        await db.collection("scores").doc().set({
          ...score,
          leaderboardId: "lb-pinehurst-no2",
          postedAt: new Date(),
        });
      }

      const snap = await db
        .collection("scores")
        .where("leaderboardId", "==", "lb-pinehurst-no2")
        .orderBy("scoreToPar", "asc")
        .limit(1)
        .get();

      expect(snap.docs[0].data().userId).toBe(users[1].uid);
      expect(snap.docs[0].data().scoreToPar).toBe(-2);
    });

    it("scratch badge: scoreToPar === 0", async () => {
      const [user] = await seedUsers(1);

      const scoreRef = db.collection("scores").doc();
      await scoreRef.set({
        userId: user.uid,
        scoreToPar: 0,
        leaderboardId: "lb-pinehurst-no2",
        postedAt: new Date(),
      });

      const snap = await scoreRef.get();
      expect(snap.data()!.scoreToPar).toBe(0);
    });

    it("ace badge: score has holeInOnes array", async () => {
      const [user] = await seedUsers(1);

      const scoreRef = db.collection("scores").doc();
      await scoreRef.set({
        userId: user.uid,
        scoreToPar: -1,
        hasHoleInOne: true,
        holeInOnes: [{ hole: 3, distance: 142 }],
        leaderboardId: "lb-pinehurst-no2",
        postedAt: new Date(),
      });

      const snap = await scoreRef.get();
      expect(snap.data()!.hasHoleInOne).toBe(true);
      expect(snap.data()!.holeInOnes).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────
  // COURSE SELECTOR
  // ─────────────────────────────────────────────

  describe("Course Selector", () => {
    it("courses are queryable by regionKey", async () => {
      await seedCourse("pinehurst-no2", "lb-pinehurst-no2", "southeast");
      await seedCourse("bethpage-black", "lb-bethpage-black", "northeast");
      await seedCourse("torrey-pines-south", "lb-torrey-pines", "west");

      const snap = await db
        .collection("courses")
        .where("regionKey", "==", "southeast")
        .get();

      expect(snap.size).toBe(1);
      expect(snap.docs[0].id).toBe("pinehurst-no2");
    });

    it("multiple courses can share a regionKey", async () => {
      await seedCourse("pinehurst-no2", "lb-pinehurst-no2", "southeast");
      await seedCourse("pinehurst-no4", "lb-pinehurst-no4", "southeast");

      const snap = await db
        .collection("courses")
        .where("regionKey", "==", "southeast")
        .get();

      expect(snap.size).toBe(2);
    });
  });

  // ─────────────────────────────────────────────
  // SCORE ORDERING
  // ─────────────────────────────────────────────

  describe("Score Ordering", () => {
    it("leaderboard scores sorted by scoreToPar ascending", async () => {
      const users = await seedUsers(5);
      await seedLeaderboard("pinehurst-no2", "lb-pinehurst-no2");

      const scoreValues = [4, -3, 1, -1, 2];
      for (let i = 0; i < users.length; i++) {
        await db.collection("scores").doc().set({
          userId: users[i].uid,
          scoreToPar: scoreValues[i],
          leaderboardId: "lb-pinehurst-no2",
          postedAt: new Date(),
        });
      }

      const snap = await db
        .collection("scores")
        .where("leaderboardId", "==", "lb-pinehurst-no2")
        .orderBy("scoreToPar", "asc")
        .get();

      const sorted = snap.docs.map((d) => d.data().scoreToPar);
      expect(sorted).toEqual([-3, -1, 1, 2, 4]);
    });
  });
});