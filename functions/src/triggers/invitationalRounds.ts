/**
 * Invitational Round Management — Cloud Functions
 *
 * startInvitationalRound (callable):
 *   Host triggers from Schedule tab → "Start Round"
 *   1. Validates host + round status
 *   2. Creates backing outing doc with accepted roster players
 *   3. Updates invitational round status to "active" + stores outingId
 *   4. Groups: uses pre-assigned groups or creates a single default group
 *
 * File: functions/src/triggers/invitationalRounds.ts
 */

import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const db = admin.firestore();

// ============================================================================
// TYPES
// ============================================================================

interface StartRoundRequest {
  invitationalId: string;
  roundId: string; // the round's ID within the rounds array
}

interface RosterEntry {
  userId: string | null;
  displayName: string;
  avatar?: string;
  handicap?: number;
  invitationalHandicap: number | null;
  status: string;
  isGhost: boolean;
  ghostName?: string;
}

interface InvitationalRound {
  roundId: string;
  courseId: number | null;
  courseName: string;
  courseLocation: { city: string; state: string };
  date: admin.firestore.Timestamp;
  teeTime: string | null;
  format: string;
  scoringType: string;
  status: "upcoming" | "active" | "completed";
  outingId: string | null;
  groups: any[];
  roundNumber: number;
}

// ============================================================================
// startInvitationalRound — callable function
// ============================================================================

export const startInvitationalRound = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Must be logged in");
  }

  const { invitationalId, roundId } = request.data as StartRoundRequest;

  if (!invitationalId || !roundId) {
    throw new HttpsError("invalid-argument", "invitationalId and roundId required");
  }

  // ── 1. Load invitational ──
  const invRef = db.collection("invitationals").doc(invitationalId);
  const invSnap = await invRef.get();

  if (!invSnap.exists) {
    throw new HttpsError("not-found", "Invitational not found");
  }

  const invData = invSnap.data()!;

  // ── 2. Validate host ──
  if (invData.hostUserId !== uid) {
    throw new HttpsError("permission-denied", "Only the host can start rounds");
  }

  // ── 3. Find the round ──
  const rounds: InvitationalRound[] = invData.rounds || [];
  const roundIndex = rounds.findIndex((r) => r.roundId === roundId);

  if (roundIndex === -1) {
    throw new HttpsError("not-found", "Round not found in invitational");
  }

  const round = rounds[roundIndex];

  if (round.status !== "upcoming") {
    throw new HttpsError("failed-precondition", `Round is already ${round.status}`);
  }

  if (!round.courseId || !round.courseName) {
    throw new HttpsError("failed-precondition", "Round must have a course assigned");
  }

  // ── 4. Build player list from accepted roster ──
  const roster: RosterEntry[] = invData.roster || [];
  const activePlayers = roster.filter(
    (r) => r.status === "accepted" || r.status === "ghost"
  );

  if (activePlayers.length === 0) {
    throw new HttpsError("failed-precondition", "No accepted players on roster");
  }

  // ── 5. Build groups ──
  let groups: any[];

  if (round.groups && round.groups.length > 0) {
    // Pre-assigned groups from Manage Groups screen
    groups = round.groups;
  } else {
    // Default: single group with all players
    groups = [
      {
        groupId: `group_1`,
        name: "Group 1",
        playerIds: activePlayers.map((p) => p.userId || `ghost_${p.ghostName}`),
        teeTime: round.teeTime || null,
        startingHole: 1,
        status: "pending",
        roundId: null, // populated below
      },
    ];
  }

  // ── 6. Load course data for handicap calculations ──
  let courseData: any = null;
  try {
    const courseDoc = await db
      .collection("courses")
      .doc(String(round.courseId))
      .get();
    if (courseDoc.exists) {
      courseData = courseDoc.data();
    }
  } catch (err) {
    logger.warn(`Could not load course data for ${round.courseId}:`, err);
  }

  // ── 7. Create the backing outing doc ──
  const outingRef = db.collection("outings").doc();
  const outingId = outingRef.id;

  const outingData: Record<string, any> = {
    // Identity
    name: `${invData.name} — Round ${round.roundNumber}`,
    organizerId: uid,
    organizerName: invData.hostName || "Host",

    // Course
    courseId: round.courseId,
    courseName: round.courseName,
    courseLocation: round.courseLocation || null,

    // Format
    formatId: round.format === "stableford" ? "individual_stableford" : "stroke_play",
    scoringType: round.scoringType,
    holeCount: 18, // default, could be configurable later

    // Parent link — critical for completion triggers
    parentType: "invitational",
    parentId: invitationalId,
    parentRoundId: roundId,
    parentRoundNumber: round.roundNumber,

    // Schedule
    date: round.date,
    teeTime: round.teeTime || null,

    // Groups (populated with roundIds after creating round docs)
    groups: [],
    groupCount: groups.length,
    groupsComplete: 0,

    // Status
    status: "active",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await outingRef.set(outingData);
  logger.info(`✅ Outing ${outingId} created for invitational round ${round.roundNumber}`);

  // ── 8. Create round docs per group ──
  const updatedGroups: any[] = [];

  for (const group of groups) {
    // Get players for this group
    const groupPlayerIds = group.playerIds || [];
    const groupPlayers = activePlayers.filter((p) => {
      const pid = p.userId || `ghost_${p.ghostName}`;
      return groupPlayerIds.includes(pid);
    });

    // If no specific group assignment, put everyone in
    const playersForRound =
      groupPlayers.length > 0 ? groupPlayers : activePlayers;

    // Build player slots for the round doc
    const playerSlots = playersForRound.map((p, idx) => {
      // Use invitational handicap if manual method, otherwise SwingThoughts HCI
      const handicapIndex =
        invData.handicapMethod === "manual" && p.invitationalHandicap != null
          ? p.invitationalHandicap
          : p.handicap || 0;

      // Simplified course handicap calculation
      // Real calc needs slope/rating from the specific tee
      const courseHandicap = Math.round(handicapIndex);

      return {
        playerId: p.userId || `ghost_${p.ghostName || p.displayName}`,
        displayName: p.displayName || p.ghostName || "Unknown",
        avatar: p.avatar || null,
        isGhost: p.isGhost,
        isMarker: idx === 0, // first player is default marker
        handicapIndex,
        courseHandicap,
        teeName: "Default",
        slopeRating: courseData?.tees?.male?.[0]?.slope || 113,
        courseRating: courseData?.tees?.male?.[0]?.rating || 72,
      };
    });

    // Create the round doc
    const roundRef = db.collection("rounds").doc();
    const roundDoc: Record<string, any> = {
      // Players
      players: playerSlots,
      markerId: playerSlots[0]?.playerId || uid,

      // Course
      courseId: round.courseId,
      courseName: round.courseName,
      holeCount: 18,
      formatId: round.format === "stableford" ? "individual_stableford" : "stroke_play",

      // Score tracking
      currentHole: 1,
      holeData: {},
      liveScores: {},
      holePars: courseData?.tees?.male?.[0]?.holes?.map((h: any) => h.par || 4) || [],

      // Status
      status: "live",
      startedAt: admin.firestore.FieldValue.serverTimestamp(),

      // Links
      outingId,
      groupId: group.groupId,
      groupName: group.name,

      // Invitational context (for rivalry + completion processing)
      invitationalId,
      invitationalRoundId: roundId,
      invitationalRoundNumber: round.roundNumber,

      // Location
      regionKey: invData.regionKey || null,
      location: round.courseLocation || null,
    };

    await roundRef.set(roundDoc);
    logger.info(`✅ Round doc ${roundRef.id} created for group ${group.name}`);

    updatedGroups.push({
      ...group,
      roundId: roundRef.id,
      status: "active",
    });
  }

  // ── 9. Update outing with group roundIds ──
  await outingRef.update({ groups: updatedGroups });

  // ── 10. Update invitational round status ──
  const updatedRounds = [...rounds];
  updatedRounds[roundIndex] = {
    ...round,
    status: "active",
    outingId,
  };

  // Also update invitational status to "active" if it was "open"
  const invUpdate: Record<string, any> = {
    rounds: updatedRounds,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (invData.status === "open") {
    invUpdate.status = "active";
  }

  await invRef.update(invUpdate);

  logger.info(
    `✅ Invitational round ${round.roundNumber} started — outing ${outingId} with ${updatedGroups.length} group(s)`
  );

  return {
    success: true,
    outingId,
    groupCount: updatedGroups.length,
    playerCount: activePlayers.length,
  };
});