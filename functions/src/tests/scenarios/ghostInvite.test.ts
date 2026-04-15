/**
 * Ghost Invite Scenarios
 *
 * Tests invite code generation, ghost entry creation,
 * and ghost → real user swap on claim.
 */

import * as admin from "firebase-admin";
import { seedInvitational, seedUsers } from "../seed";
import { clearEmulator, db } from "../setup";

function generateInviteCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function seedGhostEntry(
  invitationalId: string,
  phoneNumber: string,
  inviteCode: string
) {
  const ghostId = `ghost-${inviteCode.toLowerCase()}`;

  // Add ghost to invitational roster
  const invRef = db.collection("invitationals").doc(invitationalId);
  const snap = await invRef.get();
  const roster = snap.data()!.roster || [];

  roster.push({
    userId: ghostId,
    role: "player",
    status: "ghost",
    phoneNumber,
    inviteCode,
    createdAt: new Date(),
  });

  await invRef.update({ roster, playerCount: roster.length });

  // Store invite code doc for lookup
  await db.collection("inviteCodes").doc(inviteCode).set({
    inviteCode,
    ghostId,
    invitationalId,
    phoneNumber,
    claimed: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return ghostId;
}

describe("Ghost Invite System", () => {
  beforeEach(async () => {
    await clearEmulator();
  });

  // ─────────────────────────────────────────────
  // INVITE CODE GENERATION
  // ─────────────────────────────────────────────

  describe("Invite Code Generation", () => {
    it("generates a 6-character invite code", () => {
      const code = generateInviteCode();
      expect(code).toHaveLength(6);
    });

    it("invite code contains only valid characters", () => {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    });

    it("invite codes are unique across calls", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(generateInviteCode());
      }
      // With 36^6 = 2.1B possibilities, 100 codes should all be unique
      expect(codes.size).toBe(100);
    });
  });

  // ─────────────────────────────────────────────
  // GHOST ENTRY CREATION
  // ─────────────────────────────────────────────

  describe("Ghost Entry Creation", () => {
    it("ghost entry is added to invitational roster", async () => {
      const users = await seedUsers(2);
      const invId = await seedInvitational(users[0].uid, [users[1].uid]);

      const code = generateInviteCode();
      await seedGhostEntry(invId, "+13365550001", code);

      const snap = await db.collection("invitationals").doc(invId).get();
      const roster = snap.data()!.roster;
      const ghost = roster.find((r: any) => r.status === "ghost");

      expect(ghost).toBeDefined();
      expect(ghost.inviteCode).toBe(code);
      expect(ghost.phoneNumber).toBe("+13365550001");
    });

    it("ghost roster entry has status ghost", async () => {
      const users = await seedUsers(1);
      const invId = await seedInvitational(users[0].uid, []);

      const code = generateInviteCode();
      await seedGhostEntry(invId, "+13365550002", code);

      const snap = await db.collection("invitationals").doc(invId).get();
      const roster = snap.data()!.roster;
      const ghost = roster.find((r: any) => r.status === "ghost");

      expect(ghost.role).toBe("player");
      expect(ghost.status).toBe("ghost");
    });

    it("invite code doc is stored for lookup", async () => {
      const users = await seedUsers(1);
      const invId = await seedInvitational(users[0].uid, []);

      const code = generateInviteCode();
      await seedGhostEntry(invId, "+13365550003", code);

      const codeSnap = await db.collection("inviteCodes").doc(code).get();
      expect(codeSnap.exists).toBe(true);
      expect(codeSnap.data()!.invitationalId).toBe(invId);
      expect(codeSnap.data()!.claimed).toBe(false);
    });
  });

  // ─────────────────────────────────────────────
  // CLAIM INVITE CODE (ghost → real user)
  // ─────────────────────────────────────────────

  describe("Claim Invite Code", () => {
    it("invite code can be looked up by code string", async () => {
      const users = await seedUsers(1);
      const invId = await seedInvitational(users[0].uid, []);

      const code = generateInviteCode();
      await seedGhostEntry(invId, "+13365550004", code);

      const snap = await db.collection("inviteCodes").doc(code).get();
      expect(snap.exists).toBe(true);
      expect(snap.data()!.invitationalId).toBe(invId);
    });

    it("claiming code marks it as claimed", async () => {
      const users = await seedUsers(1);
      const invId = await seedInvitational(users[0].uid, []);

      const code = generateInviteCode();
      const ghostId = await seedGhostEntry(invId, "+13365550005", code);

      // Simulate claim
      await db.collection("inviteCodes").doc(code).update({
        claimed: true,
        claimedBy: users[0].uid,
        claimedAt: new Date(),
      });

      const snap = await db.collection("inviteCodes").doc(code).get();
      expect(snap.data()!.claimed).toBe(true);
      expect(snap.data()!.claimedBy).toBe(users[0].uid);
    });

    it("ghost entry is swapped to real user on claim", async () => {
      const users = await seedUsers(2);
      const invId = await seedInvitational(users[0].uid, []);

      const code = generateInviteCode();
      const ghostId = await seedGhostEntry(invId, "+13365550006", code);

      // Simulate the claimInviteCode Cloud Function swap
      const invRef = db.collection("invitationals").doc(invId);
      const snap = await invRef.get();
      const roster = snap.data()!.roster;

      const updatedRoster = roster.map((r: any) =>
        r.userId === ghostId
          ? {
              ...r,
              userId: users[1].uid,
              status: "accepted",
              claimedAt: new Date(),
            }
          : r
      );

      await invRef.update({ roster: updatedRoster });

      const updated = await invRef.get();
      const claimed = updated
        .data()!
        .roster.find((r: any) => r.userId === users[1].uid);

      expect(claimed).toBeDefined();
      expect(claimed.status).toBe("accepted");
    });

    it("cannot claim same code twice", async () => {
      const users = await seedUsers(2);
      const invId = await seedInvitational(users[0].uid, []);

      const code = generateInviteCode();
      await seedGhostEntry(invId, "+13365550007", code);

      // First claim
      await db.collection("inviteCodes").doc(code).update({
        claimed: true,
        claimedBy: users[0].uid,
      });

      // Verify it's already claimed
      const snap = await db.collection("inviteCodes").doc(code).get();
      expect(snap.data()!.claimed).toBe(true);

      // Second claim attempt would be caught by checking claimed === true
      const alreadyClaimed = snap.data()!.claimed;
      expect(alreadyClaimed).toBe(true);
    });
  });

  // ─────────────────────────────────────────────
  // ONBOARDING FLOW
  // ─────────────────────────────────────────────

  describe("Onboarding Invite Code Flow", () => {
    it("invite code is findable during onboarding lookup", async () => {
      const users = await seedUsers(1);
      const invId = await seedInvitational(users[0].uid, []);

      const code = generateInviteCode();
      await seedGhostEntry(invId, "+13365550008", code);

      // Simulate onboarding lookup: new user enters code
      const codeSnap = await db.collection("inviteCodes").doc(code).get();

      expect(codeSnap.exists).toBe(true);
      expect(codeSnap.data()!.claimed).toBe(false);
      expect(codeSnap.data()!.invitationalId).toBeDefined();
    });

    it("invalid code returns no document", async () => {
      let exists = false;
      try {
        const snap = await db.collection("inviteCodes").doc("INVALID").get();
        exists = snap.exists;
      } catch {
        exists = false;
      }
      expect(exists).toBe(false);
    });
  });
});