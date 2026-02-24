/**
 * Outing Launch — Callable Cloud Function
 *
 * Creates the outing document and one round document per group.
 * Sends round_invite notifications to group markers.
 *
 * Called from the client after OutingReview → "Launch Outing".
 *
 * File: functions/src/outings/outingLaunch.ts
 */

import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { sendRoundNotification } from "../notifications/roundNotifications";

const db = admin.firestore();

// ============================================================================
// TYPES (mirrors client outingTypes.ts)
// ============================================================================

interface OutingPlayer {
  playerId: string;
  displayName: string;
  avatar?: string;
  isGhost: boolean;
  handicapIndex: number;
  courseHandicap: number;
  tee: any; // TeeOption — full tee data for round creation
  teeName: string;
  slopeRating: number;
  courseRating: number;
  groupId?: string | null;
  isGroupMarker: boolean;
  contactInfo?: string;
  contactType?: "phone" | "email";
}

interface OutingGroup {
  groupId: string;
  name: string;
  playerIds: string[];
  markerId: string;
  roundId?: string | null;
  startingHole: number;
  status: "pending" | "live" | "complete";
}

interface LaunchOutingRequest {
  /** Outing metadata */
  parentType: "casual" | "league" | "invitational" | "tour";
  parentId?: string | null;
  courseId: number;
  courseName: string;
  holeCount: 9 | 18;
  nineHoleSide?: "front" | "back";
  formatId: string;
  groupSize: number;
  roundType?: "on_premise" | "simulator";
  privacy?: "public" | "private" | "partners";
  /** Location */
  location?: { city: string; state: string; latitude?: number; longitude?: number };
  regionKey?: string;
  /** Roster and groups */
  roster: OutingPlayer[];
  groups: OutingGroup[];
}

// ============================================================================
// HELPER: Build playing order for a starting hole
// ============================================================================

function buildPlayingOrder(startingHole: number, totalHoles: number, baseHole: number = 1): number[] {
  const order: number[] = [];
  for (let i = 0; i < totalHoles; i++) {
    const hole = ((startingHole - baseHole + i) % totalHoles) + baseHole;
    order.push(hole);
  }
  return order;
}

// ============================================================================
// CALLABLE: launchOuting
// ============================================================================

export const launchOuting = onCall(
  { maxInstances: 10, region: "us-east1" },
  async (request) => {
    // ── Auth check ──
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Must be signed in.");

    const data = request.data as LaunchOutingRequest;

    // ── Validate ──
    if (!data.roster || data.roster.length < 2) {
      throw new HttpsError("invalid-argument", "Outing requires at least 2 players.");
    }
    if (!data.groups || data.groups.length === 0) {
      throw new HttpsError("invalid-argument", "Outing requires at least 1 group.");
    }
    if (!data.courseId || !data.courseName) {
      throw new HttpsError("invalid-argument", "Course info is required.");
    }

    // Verify all groups have a marker
    for (const group of data.groups) {
      if (!group.markerId) {
        throw new HttpsError("invalid-argument", `Group "${group.name}" has no designated scorer.`);
      }
      const markerPlayer = data.roster.find((p) => p.playerId === group.markerId);
      if (markerPlayer?.isGhost) {
        throw new HttpsError("invalid-argument", `Group "${group.name}" scorer cannot be a guest player.`);
      }
    }

    const organizerPlayer = data.roster.find((p) => p.playerId === uid);
    const organizerName = organizerPlayer?.displayName || "Unknown";

    logger.info(`🚀 Launching outing at ${data.courseName} — ${data.roster.length} players, ${data.groups.length} groups`);

    try {
      // ══════════════════════════════════════════════════════════════
      // 1. CREATE ROUND DOCUMENTS (one per group)
      // ══════════════════════════════════════════════════════════════

      const roundIds: string[] = [];
      const groupsWithRounds: OutingGroup[] = [];

      for (const group of data.groups) {
        const groupPlayers = data.roster.filter((p) => group.playerIds.includes(p.playerId));
        const marker = groupPlayers.find((p) => p.playerId === group.markerId);
        if (!marker) {
          logger.error(`No marker found for group ${group.name}`);
          continue;
        }

        // Build hole data from marker's tee
        const markerTee = marker.tee;
        const allHoles = markerTee?.holes || [];
        const baseHole = data.holeCount === 9 && data.nineHoleSide === "back" ? 10 : 1;
        const playingOrder = buildPlayingOrder(group.startingHole, data.holeCount, baseHole);
        const holePars = playingOrder.map((h: number) => allHoles[h - 1]?.par || 4);
        const holeDetails = playingOrder.map((h: number) => ({
          par: allHoles[h - 1]?.par || 4,
          yardage: allHoles[h - 1]?.yardage || 0,
          handicap: allHoles[h - 1]?.handicap ?? null,
        }));

        // Build players array in the round doc format (matches existing PlayerSlot)
        const roundPlayers = groupPlayers.map((p) => ({
          playerId: p.playerId,
          displayName: p.displayName,
          avatar: p.avatar || null,
          isGhost: p.isGhost,
          isMarker: p.playerId === group.markerId,
          handicapIndex: p.handicapIndex,
          courseHandicap: p.courseHandicap,
          teeName: p.teeName,
          slopeRating: p.slopeRating,
          courseRating: p.courseRating,
          teamId: null,
          contactInfo: p.contactInfo || null,
          contactType: p.contactType || null,
        }));

        const roundDoc = {
          markerId: group.markerId,
          status: "live",
          courseId: data.courseId,
          courseName: data.courseName,
          holeCount: data.holeCount,
          nineHoleSide: data.holeCount === 9 ? (data.nineHoleSide || null) : null,
          formatId: data.formatId,
          players: roundPlayers,
          teams: null,
          currentHole: 1,
          holeData: {},
          liveScores: {},
          holePars,
          holeDetails,
          playingOrder,
          startingHole: group.startingHole,
          leagueId: null,
          leagueWeek: null,
          regionKey: data.regionKey || null,
          location: data.location || null,
          startedAt: admin.firestore.FieldValue.serverTimestamp(),
          roundType: data.roundType || "on_premise",
          isSimulator: data.roundType === "simulator",
          privacy: data.privacy || "public",
          markerTransferRequest: null,
          // Outing fields — links this round to the outing
          outingId: null, // Will be set after outing doc is created
          groupId: group.groupId,
          groupName: group.name,
        };

        const roundRef = await db.collection("rounds").add(roundDoc);
        roundIds.push(roundRef.id);

        groupsWithRounds.push({
          ...group,
          roundId: roundRef.id,
          status: "live",
        });

        logger.info(`✅ Round ${roundRef.id} created for ${group.name} (marker: ${marker.displayName})`);
      }

      // ══════════════════════════════════════════════════════════════
      // 2. CREATE OUTING DOCUMENT
      // ══════════════════════════════════════════════════════════════

      const outingDoc = {
        organizerId: uid,
        organizerName,
        status: "live",
        parentType: data.parentType,
        parentId: data.parentId || null,
        courseId: data.courseId,
        courseName: data.courseName,
        holeCount: data.holeCount,
        nineHoleSide: data.holeCount === 9 ? (data.nineHoleSide || null) : null,
        formatId: data.formatId,
        groupSize: data.groupSize,
        roster: data.roster.map((p) => ({
          playerId: p.playerId,
          displayName: p.displayName,
          avatar: p.avatar || null,
          isGhost: p.isGhost,
          handicapIndex: p.handicapIndex,
          courseHandicap: p.courseHandicap,
          teeName: p.teeName,
          slopeRating: p.slopeRating,
          courseRating: p.courseRating,
          groupId: p.groupId || null,
          isGroupMarker: p.isGroupMarker,
          contactInfo: p.contactInfo || null,
          contactType: p.contactType || null,
        })),
        groups: groupsWithRounds.map((g) => ({
          groupId: g.groupId,
          name: g.name,
          playerIds: g.playerIds,
          markerId: g.markerId,
          roundId: g.roundId,
          startingHole: g.startingHole,
          status: g.status,
        })),
        roundIds,
        location: data.location || null,
        regionKey: data.regionKey || null,
        groupsComplete: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        launchedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const outingRef = await db.collection("outings").add(outingDoc);
      const outingId = outingRef.id;

      logger.info(`✅ Outing ${outingId} created — ${roundIds.length} rounds`);

      // ══════════════════════════════════════════════════════════════
      // 3. BACKFILL outingId ON ROUND DOCUMENTS
      // ══════════════════════════════════════════════════════════════

      const batch = db.batch();
      for (const rid of roundIds) {
        batch.update(db.collection("rounds").doc(rid), { outingId });
      }
      await batch.commit();

      logger.info(`✅ Backfilled outingId on ${roundIds.length} round docs`);

      // ══════════════════════════════════════════════════════════════
      // 4. NOTIFY GROUP MARKERS
      // ══════════════════════════════════════════════════════════════

      for (const group of groupsWithRounds) {
        // Skip the organizer — they launched it, they know
        if (group.markerId === uid) continue;

        const markerPlayer = data.roster.find((p) => p.playerId === group.markerId);
        if (!markerPlayer || markerPlayer.isGhost) continue;

        try {
          await sendRoundNotification({
            type: "round_invite",
            recipientUserId: group.markerId,
            roundId: group.roundId!,
            courseName: data.courseName,
            markerName: organizerName,
            markerId: uid,
            markerAvatar: organizerPlayer?.avatar,
            message: `${organizerName} started a group outing at ${data.courseName} — you're scoring for ${group.name}! 🏌️`,
            navigationTarget: "scoring",
          });
        } catch (err) {
          logger.error(`Failed to notify marker ${group.markerId}:`, err);
        }
      }

      // Also notify non-marker on-platform players
      const markerIds = new Set(data.groups.map((g) => g.markerId));
      const otherPlayers = data.roster.filter(
        (p) => !p.isGhost && p.playerId !== uid && !markerIds.has(p.playerId)
      );

      for (const player of otherPlayers) {
        const playerGroup = groupsWithRounds.find((g) =>
          g.playerIds.includes(player.playerId)
        );
        if (!playerGroup) continue;

        try {
          await sendRoundNotification({
            type: "round_invite",
            recipientUserId: player.playerId,
            roundId: playerGroup.roundId!,
            courseName: data.courseName,
            markerName: organizerName,
            markerId: uid,
            markerAvatar: organizerPlayer?.avatar,
            message: `${organizerName} started a group outing at ${data.courseName} — you're in ${playerGroup.name}`,
            navigationTarget: "round",
          });
        } catch (err) {
          logger.error(`Failed to notify player ${player.playerId}:`, err);
        }
      }

      logger.info(`✅ Outing launch complete — ${outingId}`);

      return {
        success: true,
        outingId,
        roundIds,
        // Return the organizer's round ID so the client can navigate to their scorecard
        organizerRoundId: groupsWithRounds.find((g) => g.markerId === uid)?.roundId || roundIds[0],
      };

    } catch (err) {
      logger.error("Outing launch failed:", err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", "Failed to launch outing. Please try again.");
    }
  }
);