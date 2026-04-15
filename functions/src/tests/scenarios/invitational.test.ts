/**
 * Invitational Scenarios
 *
 * Tests invitational lifecycle: creation, roster management,
 * status transitions, cancellation, and filtering.
 */

import { seedInvitational, seedUsers } from "../seed";
import { clearEmulator, db } from "../setup";

describe("Invitational System", () => {
  beforeEach(async () => {
    await clearEmulator();
  });

  describe("Creation", () => {
    it("creates invitational with correct host", async () => {
      const users = await seedUsers(5);
      const id = await seedInvitational(
        users[0].uid,
        users.slice(1).map((u) => u.uid)
      );

      const snap = await db.collection("invitationals").doc(id).get();
      expect(snap.exists).toBe(true);
      expect(snap.data()!.hostUserId).toBe(users[0].uid);
    });

    it("roster includes host + all invited players", async () => {
      const users = await seedUsers(5);
      const playerIds = users.slice(1).map((u) => u.uid);
      const id = await seedInvitational(users[0].uid, playerIds);

      const snap = await db.collection("invitationals").doc(id).get();
      const roster = snap.data()!.roster;

      expect(roster).toHaveLength(5); // host + 4 players
      expect(roster.find((r: any) => r.userId === users[0].uid)?.role).toBe("host");
    });

    it("default status is open", async () => {
      const users = await seedUsers(2);
      const id = await seedInvitational(users[0].uid, [users[1].uid]);

      const snap = await db.collection("invitationals").doc(id).get();
      expect(snap.data()!.status).toBe("open");
    });
  });

  describe("Status Transitions", () => {
    it("can transition open → active", async () => {
      const users = await seedUsers(2);
      const id = await seedInvitational(users[0].uid, [users[1].uid]);

      await db.collection("invitationals").doc(id).update({ status: "active" });

      const snap = await db.collection("invitationals").doc(id).get();
      expect(snap.data()!.status).toBe("active");
    });

    it("can transition active → completed", async () => {
      const users = await seedUsers(2);
      const id = await seedInvitational(users[0].uid, [users[1].uid], {
        status: "active",
      });

      await db.collection("invitationals").doc(id).update({ status: "completed" });

      const snap = await db.collection("invitationals").doc(id).get();
      expect(snap.data()!.status).toBe("completed");
    });

    it("can cancel an invitational", async () => {
      const users = await seedUsers(2);
      const id = await seedInvitational(users[0].uid, [users[1].uid]);

      await db.collection("invitationals").doc(id).update({ status: "cancelled" });

      const snap = await db.collection("invitationals").doc(id).get();
      expect(snap.data()!.status).toBe("cancelled");
    });
  });

  describe("Compete Tab Filtering", () => {
    it("cancelled invitationals are excluded from active query", async () => {
      const users = await seedUsers(3);

      await seedInvitational(users[0].uid, [users[1].uid], {
        name: "Active One",
        status: "open",
      });
      await seedInvitational(users[0].uid, [users[2].uid], {
        name: "Cancelled One",
        status: "cancelled",
      });

      const snap = await db.collection("invitationals").get();
      const visible = snap.docs
        .map((d) => d.data())
        .filter((d) => d.status !== "cancelled");

      expect(visible).toHaveLength(1);
      expect(visible[0].name).toBe("Active One");
    });

    it("completed invitationals do not appear in active list", async () => {
      const users = await seedUsers(2);

      await seedInvitational(users[0].uid, [users[1].uid], {
        name: "Done",
        status: "completed",
      });

      const snap = await db.collection("invitationals").get();
      const active = snap.docs
        .map((d) => d.data())
        .filter((d) => !["cancelled", "completed"].includes(d.status));

      expect(active).toHaveLength(0);
    });
  });

  describe("Roster Management", () => {
    it("player can accept an invitation", async () => {
      const users = await seedUsers(2);
      const id = await seedInvitational(users[0].uid, [users[1].uid], {
        rosterStatus: "invited",
      });

      const snap = await db.collection("invitationals").doc(id).get();
      const roster = snap.data()!.roster;

      // Simulate acceptance
      const updatedRoster = roster.map((r: any) =>
        r.userId === users[1].uid ? { ...r, status: "accepted" } : r
      );

      await db
        .collection("invitationals")
        .doc(id)
        .update({ roster: updatedRoster });

      const updated = await db.collection("invitationals").doc(id).get();
      const updatedPlayer = updated
        .data()!
        .roster.find((r: any) => r.userId === users[1].uid);

      expect(updatedPlayer.status).toBe("accepted");
    });

    it("playerCount reflects roster size", async () => {
      const users = await seedUsers(6);
      const id = await seedInvitational(
        users[0].uid,
        users.slice(1).map((u) => u.uid)
      );

      const snap = await db.collection("invitationals").doc(id).get();
      expect(snap.data()!.playerCount).toBe(6);
    });
  });
});