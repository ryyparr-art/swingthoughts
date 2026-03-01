/**
 * claimInviteCode
 *
 * Callable Cloud Function for claiming an invitational invite code.
 *
 * Flow:
 *   1. Authenticated user submits a 6-character invite code
 *   2. Search open/active invitationals for a ghost roster entry with that code
 *   3. Swap ghost entry with real user data (userId, displayName, avatar, handicap)
 *   4. Send a welcome notification to the user
 *   5. Return invitational name + ID so the client can navigate to it
 *
 * Separate from ghostInvite.ts which handles round score claiming via deep links.
 * This handles invitational roster claiming via short invite codes entered during onboarding.
 *
 * File: functions/src/invites/claimInviteCode.ts
 */

import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
    createNotificationDocument,
    generateGroupedMessage,
} from "../notifications/helpers";

const db = admin.firestore();

// ============================================================================
// TYPES
// ============================================================================

interface ClaimInviteCodeResult {
  success: boolean;
  invitationalId?: string;
  invitationalName?: string;
  error?: string;
}

// ============================================================================
// CALLABLE FUNCTION
// ============================================================================

export const claimInviteCode = onCall(
  async (request): Promise<ClaimInviteCodeResult> => {
    // ── Auth check ──────────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be signed in to claim an invite code."
      );
    }

    const uid = request.auth.uid;
    const code = (request.data.inviteCode || "").trim().toUpperCase();

    // ── Validate code format ────────────────────────────────
    if (!code || code.length !== 6) {
      return {
        success: false,
        error: "Invalid invite code. Please enter a 6-character code.",
      };
    }

    try {
      // ── Get claiming user's data ──────────────────────────
      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        return { success: false, error: "User profile not found." };
      }

      const userData = userDoc.data()!;

      // ── Search invitationals for matching code ────────────
      const invitationalsSnap = await db
        .collection("invitationals")
        .where("status", "in", ["open", "active"])
        .get();

      let matchedDocId: string | null = null;
      let matchedDocData: any = null;
      let matchedRosterIndex: number = -1;

      for (const invDoc of invitationalsSnap.docs) {
        const docData = invDoc.data();
        const roster: any[] = docData.roster || [];

        const idx = roster.findIndex(
          (entry: any) =>
            entry.isGhost === true &&
            entry.inviteCode === code &&
            entry.status !== "claimed"
        );

        if (idx !== -1) {
          matchedDocId = invDoc.id;
          matchedDocData = docData;
          matchedRosterIndex = idx;
          break;
        }
      }

      if (!matchedDocId || !matchedDocData || matchedRosterIndex === -1) {
        return {
          success: false,
          error: "Invite code not found or already claimed.",
        };
      }

      // ── Check if user is already on the roster ────────────
      const roster: any[] = matchedDocData.roster || [];
      const alreadyOnRoster = roster.some(
        (entry: any) => entry.userId === uid && !entry.isGhost
      );

      if (alreadyOnRoster) {
        return {
          success: false,
          error: "You're already in this invitational.",
        };
      }

      // ── Swap ghost entry with real user ───────────────────
      const updatedRoster = [...roster];
      updatedRoster[matchedRosterIndex] = {
        userId: uid,
        displayName: userData.displayName || "Unknown",
        avatar: userData.avatar || null,
        handicap: userData.handicapIndex || null,
        invitationalHandicap: null,
        status: "accepted",
        isGhost: false,
        ghostName: null,
        ghostPhone: null,
        inviteCode: null,
        ghostClaimToken: null,
      };

      // ── Update invitational document ──────────────────────
      await db.collection("invitationals").doc(matchedDocId).update({
        roster: updatedRoster,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const invitationalName = matchedDocData.name || "an invitational";
      const hostName = matchedDocData.hostName || "The host";
      const hostUserId = matchedDocData.hostUserId || null;
      const hostAvatar = matchedDocData.hostAvatar || null;

      logger.info(
        `Invite code ${code} claimed by user ${uid} for invitational ${matchedDocId} (${invitationalName})`
      );

      // ── Send welcome notification to joining player ───────
      await createNotificationDocument({
        userId: uid,
        type: "invitational_welcome",
        actorId: hostUserId,
        actorName: hostName,
        actorAvatar: hostAvatar,
        invitationalId: matchedDocId,
        message: generateGroupedMessage("invitational_welcome", hostName, 1, {
          invitationalName,
        }),
        navigationTarget: "invitational",
      });

      // ── Notify host that someone joined ───────────────────
      if (hostUserId && hostUserId !== uid) {
        await createNotificationDocument({
          userId: hostUserId,
          type: "invitational_player_joined",
          actorId: uid,
          actorName: userData.displayName || "A player",
          actorAvatar: userData.avatar || undefined,
          invitationalId: matchedDocId,
          message: generateGroupedMessage("invitational_player_joined", userData.displayName || "A player", 1, {
            invitationalName,
          }),
          navigationTarget: "invitational",
        });
      }

      return {
        success: true,
        invitationalId: matchedDocId,
        invitationalName,
      };
    } catch (error) {
      logger.error("claimInviteCode error:", error);
      return {
        success: false,
        error: "Something went wrong. Please try again.",
      };
    }
  }
);