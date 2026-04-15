/**
 * Handicap Scenarios
 *
 * Tests USGA handicap calculation, course handicap per tee,
 * and differential tracking.
 */

import * as admin from "firebase-admin";
import { seedUsers } from "../seed";
import { clearEmulator, db } from "../setup";

// USGA course handicap formula
function calculateCourseHandicap(
  handicapIndex: number,
  slopeRating: number,
  courseRating: number,
  par: number
): number {
  return Math.round((handicapIndex * slopeRating) / 113 + (courseRating - par));
}

// USGA handicap differential formula
function calculateDifferential(
  adjustedGrossScore: number,
  courseRating: number,
  slopeRating: number
): number {
  return ((adjustedGrossScore - courseRating) * 113) / slopeRating;
}

describe("Handicap System", () => {
  beforeEach(async () => {
    await clearEmulator();
  });

  // ─────────────────────────────────────────────
  // USGA COURSE HANDICAP FORMULA
  // ─────────────────────────────────────────────

  describe("USGA Course Handicap Formula", () => {
    it("calculates course handicap correctly for standard slope", async () => {
      // Standard slope (113) — course handicap ≈ handicap index
      const result = calculateCourseHandicap(10.0, 113, 72.0, 72);
      expect(result).toBe(10);
    });

    it("calculates course handicap for high slope rating", async () => {
      // Handicap Index 15, Slope 140, CR 74.5, Par 72
      const result = calculateCourseHandicap(15.0, 140, 74.5, 72);
      // (15 * 140 / 113) + (74.5 - 72) = 18.58 + 2.5 = 21.08 → 21
      expect(result).toBe(21);
    });

    it("calculates course handicap for low slope rating", async () => {
      // Handicap Index 20, Slope 100, CR 69.0, Par 72
      const result = calculateCourseHandicap(20.0, 100, 69.0, 72);
      // (20 * 100 / 113) + (69 - 72) = 17.7 - 3 = 14.7 → 15
      expect(result).toBe(15);
    });

    it("scratch golfer (0.0 index) has course handicap near 0", async () => {
      const result = calculateCourseHandicap(0.0, 113, 72.0, 72);
      expect(result).toBe(0);
    });

    it("plus handicap produces negative course handicap on easy course", async () => {
      // Plus handicap (-2.0), standard slope, CR below par
      const result = calculateCourseHandicap(-2.0, 113, 70.0, 72);
      // (-2 * 113 / 113) + (70 - 72) = -2 + -2 = -4
      expect(result).toBe(-4);
    });
  });

  // ─────────────────────────────────────────────
  // HANDICAP DIFFERENTIAL
  // ─────────────────────────────────────────────

  describe("Handicap Differential", () => {
    it("calculates differential correctly", () => {
      // Score 85, CR 72.0, Slope 130
      const diff = calculateDifferential(85, 72.0, 130);
      // (85 - 72) * 113 / 130 = 13 * 113 / 130 = 11.3
      expect(diff).toBeCloseTo(11.3, 1);
    });

    it("under-par score produces negative differential", () => {
      // Score 70, CR 72.0, Slope 113
      const diff = calculateDifferential(70, 72.0, 113);
      expect(diff).toBeCloseTo(-2.0, 1);
    });

    it("differential is stored on score doc", async () => {
      const [user] = await seedUsers(1);

      const scoreRef = db.collection("scores").doc();
      const differential = calculateDifferential(85, 72.0, 130);

      await scoreRef.set({
        userId: user.uid,
        totalScore: 85,
        courseRating: 72.0,
        slopeRating: 130,
        differential,
        postedAt: new Date(),
      });

      const snap = await scoreRef.get();
      expect(snap.data()!.differential).toBeCloseTo(11.3, 1);
    });
  });

  // ─────────────────────────────────────────────
  // TEE SELECTION
  // ─────────────────────────────────────────────

  describe("Tee Selection", () => {
    it("course stores multiple tees with slope and rating", async () => {
      const courseRef = db.collection("courses").doc("pinehurst-no2");
      await courseRef.set({
        id: "pinehurst-no2",
        name: "Pinehurst No. 2",
        par: 70,
        tees: [
          { name: "Black", slope: 143, courseRating: 76.5, yardage: 7588 },
          { name: "Blue", slope: 135, courseRating: 74.1, yardage: 7051 },
          { name: "White", slope: 126, courseRating: 71.1, yardage: 6440 },
          { name: "Gold", slope: 118, courseRating: 68.5, yardage: 5926 },
        ],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const snap = await courseRef.get();
      expect(snap.data()!.tees).toHaveLength(4);
      expect(snap.data()!.tees[0].name).toBe("Black");
    });

    it("course handicap differs per tee for same handicap index", () => {
      const handicapIndex = 15.0;
      const par = 70;

      const blackTee = calculateCourseHandicap(handicapIndex, 143, 76.5, par);
      const whiteTee = calculateCourseHandicap(handicapIndex, 126, 71.1, par);

      expect(blackTee).toBeGreaterThan(whiteTee);
    });

    it("tee selection is stored on round doc", async () => {
      const [user] = await seedUsers(1);

      const roundRef = db.collection("rounds").doc();
      await roundRef.set({
        userId: user.uid,
        courseId: "pinehurst-no2",
        tee: "White",
        slopeRating: 126,
        courseRating: 71.1,
        courseHandicap: calculateCourseHandicap(15.0, 126, 71.1, 70),
        status: "active",
        createdAt: new Date(),
      });

      const snap = await roundRef.get();
      expect(snap.data()!.tee).toBe("White");
      expect(snap.data()!.slopeRating).toBe(126);
      expect(snap.data()!.courseHandicap).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────
  // HANDICAP INDEX TRACKING
  // ─────────────────────────────────────────────

  describe("Handicap Index Tracking", () => {
    it("user doc stores handicapIndex", async () => {
      const [user] = await seedUsers(1);

      const snap = await db.collection("users").doc(user.uid).get();
      expect(typeof snap.data()!.handicapIndex).toBe("number");
      expect(snap.data()!.handicapIndex).toBeGreaterThanOrEqual(0);
    });

    it("handicapIndex can be updated on user doc", async () => {
      const [user] = await seedUsers(1);

      await db.collection("users").doc(user.uid).update({
        handicapIndex: 12.4,
      });

      const snap = await db.collection("users").doc(user.uid).get();
      expect(snap.data()!.handicapIndex).toBe(12.4);
    });

    it("multiple differentials are stored for index calculation", async () => {
      const [user] = await seedUsers(1);

      const differentials = [8.5, 10.2, 9.1, 11.4, 7.8];
      for (const diff of differentials) {
        await db.collection("scores").doc().set({
          userId: user.uid,
          differential: diff,
          postedAt: new Date(),
        });
      }

      const snap = await db
        .collection("scores")
        .where("userId", "==", user.uid)
        .get();

      expect(snap.size).toBe(5);
      const diffs = snap.docs.map((d) => d.data().differential);
      expect(diffs).toContain(8.5);
    });
  });
});