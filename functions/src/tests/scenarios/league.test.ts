/**
 * League Scenarios
 *
 * Tests league creation, membership, scoring, and standings.
 */

import { seedLeague, seedRound, seedUsers } from "../seed";
import { clearEmulator, db } from "../setup";

describe("League System", () => {
  beforeEach(async () => {
    await clearEmulator();
  });

  describe("Creation", () => {
    it("creates league with correct commissioner", async () => {
      const users = await seedUsers(5);
      const leagueId = await seedLeague(
        users[0].uid,
        users.map((u) => u.uid)
      );

      const snap = await db.collection("leagues").doc(leagueId).get();
      expect(snap.exists).toBe(true);
      expect(snap.data()!.commissionerId).toBe(users[0].uid);
    });

    it("all members appear in members subcollection", async () => {
      const users = await seedUsers(5);
      const leagueId = await seedLeague(
        users[0].uid,
        users.map((u) => u.uid)
      );

      const membersSnap = await db
        .collection("leagues")
        .doc(leagueId)
        .collection("members")
        .get();

      expect(membersSnap.size).toBe(5);
    });

    it("commissioner has commissioner role in members", async () => {
      const users = await seedUsers(3);
      const leagueId = await seedLeague(
        users[0].uid,
        users.map((u) => u.uid)
      );

      const memberDoc = await db
        .collection("leagues")
        .doc(leagueId)
        .collection("members")
        .doc(users[0].uid)
        .get();

      expect(memberDoc.data()!.role).toBe("commissioner");
    });
  });

  describe("Membership", () => {
    it("member check works via subcollection doc exists", async () => {
      const users = await seedUsers(4);
      const memberIds = users.slice(0, 3).map((u) => u.uid);
      const nonMemberId = users[3].uid;

      const leagueId = await seedLeague(users[0].uid, memberIds);

      const memberDoc = await db
        .collection("leagues")
        .doc(leagueId)
        .collection("members")
        .doc(memberIds[1])
        .get();

      const nonMemberDoc = await db
        .collection("leagues")
        .doc(leagueId)
        .collection("members")
        .doc(nonMemberId)
        .get();

      expect(memberDoc.exists).toBe(true);
      expect(nonMemberDoc.exists).toBe(false);
    });
  });

  describe("League Status", () => {
    it("active league is queryable by status", async () => {
      const users = await seedUsers(3);
      await seedLeague(users[0].uid, users.map((u) => u.uid), {
        name: "Active League",
        status: "active",
      });
      await seedLeague(users[0].uid, users.map((u) => u.uid), {
        name: "Completed League",
        status: "completed",
      });

      const snap = await db
        .collection("leagues")
        .where("status", "==", "active")
        .get();

      expect(snap.size).toBe(1);
      expect(snap.docs[0].data().name).toBe("Active League");
    });
  });

  describe("Score Association", () => {
    it("league score references correct league and user", async () => {
      const users = await seedUsers(2);
      const leagueId = await seedLeague(
        users[0].uid,
        users.map((u) => u.uid)
      );
      const round = await seedRound(users[0].uid);

      const scoreRef = db.collection("scores").doc();
      await scoreRef.set({
        userId: users[0].uid,
        roundId: round.id,
        leagueId,
        totalScore: round.totalScore,
        scoreToPar: round.scoreToPar,
        week: 1,
        postedAt: new Date(),
      });

      const snap = await scoreRef.get();
      expect(snap.data()!.leagueId).toBe(leagueId);
      expect(snap.data()!.userId).toBe(users[0].uid);
    });
  });
});