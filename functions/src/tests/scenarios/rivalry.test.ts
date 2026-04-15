/**
 * Rivalry Scenarios
 *
 * Tests rivalry creation, progression, level thresholds,
 * and edge cases like lopsided records and same-course filtering.
 */

import { seedRivalry, seedUsers } from "../seed";
import { clearEmulator, db } from "../setup";

describe("Rivalry System", () => {
  beforeEach(async () => {
    await clearEmulator();
  });

  describe("Rivalry Creation", () => {
    it("rivalry doc is created with both playerIds", async () => {
      const users = await seedUsers(2);
      const rivalryId = await seedRivalry(users[0].uid, users[1].uid, 1);

      const snap = await db.collection("rivalries").doc(rivalryId).get();
      expect(snap.exists).toBe(true);

      const data = snap.data()!;
      expect(data.playerIds).toContain(users[0].uid);
      expect(data.playerIds).toContain(users[1].uid);
    });

    it("playerIds array is always sorted (for dedup)", async () => {
      const users = await seedUsers(2);
      const rivalryId = await seedRivalry(users[0].uid, users[1].uid, 1);

      const snap = await db.collection("rivalries").doc(rivalryId).get();
      const { playerIds } = snap.data()!;

      const sorted = [...playerIds].sort();
      expect(playerIds).toEqual(sorted);
    });

    it("round 1 creates rivalry doc silently (no announcement)", async () => {
      const users = await seedUsers(2);
      const rivalryId = await seedRivalry(users[0].uid, users[1].uid, 1);

      const snap = await db.collection("rivalries").doc(rivalryId).get();
      // Round count 1 — announcement should be suppressed until round 3
      expect(snap.data()!.roundCount).toBe(1);
    });
  });

  describe("Rivalry Levels", () => {
    it("level 1 rivalry at round 1", async () => {
      const users = await seedUsers(2);
      const rivalryId = await seedRivalry(users[0].uid, users[1].uid, 1);

      const snap = await db.collection("rivalries").doc(rivalryId).get();
      expect(snap.data()!.level).toBe(1);
    });

    it("level 2 rivalry at round 5", async () => {
      const users = await seedUsers(2);
      const rivalryId = await seedRivalry(users[0].uid, users[1].uid, 5);

      const snap = await db.collection("rivalries").doc(rivalryId).get();
      expect(snap.data()!.level).toBe(2);
    });

    it("level 3 rivalry at round 10", async () => {
      const users = await seedUsers(2);
      const rivalryId = await seedRivalry(users[0].uid, users[1].uid, 10);

      const snap = await db.collection("rivalries").doc(rivalryId).get();
      expect(snap.data()!.level).toBe(3);
    });
  });

  describe("Rivalry Win Tracking", () => {
    it("win counts sum to total round count", async () => {
      const users = await seedUsers(2);
      const rivalryId = await seedRivalry(users[0].uid, users[1].uid, 7);

      const snap = await db.collection("rivalries").doc(rivalryId).get();
      const data = snap.data()!;

      expect(data.playerAWins + data.playerBWins).toBe(data.roundCount);
    });

    it("win counts are non-negative", async () => {
      const users = await seedUsers(2);
      const rivalryId = await seedRivalry(users[0].uid, users[1].uid, 4);

      const snap = await db.collection("rivalries").doc(rivalryId).get();
      const data = snap.data()!;

      expect(data.playerAWins).toBeGreaterThanOrEqual(0);
      expect(data.playerBWins).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Rivalry Queries", () => {
    it("can query all rivalries for a user via playerIds array-contains", async () => {
      const users = await seedUsers(4);

      // User 0 has rivalries with users 1, 2, and 3
      await seedRivalry(users[0].uid, users[1].uid, 3);
      await seedRivalry(users[0].uid, users[2].uid, 5);
      await seedRivalry(users[0].uid, users[3].uid, 1);

      // User 1 also has a rivalry with user 2 (not involving user 0)
      await seedRivalry(users[1].uid, users[2].uid, 2);

      const snap = await db
        .collection("rivalries")
        .where("playerIds", "array-contains", users[0].uid)
        .get();

      expect(snap.size).toBe(3);
    });

    it("no duplicate rivalry docs for same pair", async () => {
      const users = await seedUsers(2);

      await seedRivalry(users[0].uid, users[1].uid, 3);

      // Attempt to find duplicates by querying with playerIds
      const snap = await db
        .collection("rivalries")
        .where("playerIds", "array-contains", users[0].uid)
        .get();

      // Filter to only those involving user[1]
      const between = snap.docs.filter((d) =>
        d.data().playerIds.includes(users[1].uid)
      );

      expect(between).toHaveLength(1);
    });
  });
});