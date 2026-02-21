/**
 * Round Triggers — Cloud Functions for multiplayer round lifecycle
 *
 * onRoundUpdated:
 *   Triggers on ANY update to rounds/{roundId}.
 *
 *   Live round events (checked on every update):
 *   - Marker Transfer: notifies new marker + other players when markerId changes
 *   - Transfer Request: notifies current marker when a player requests scoring
 *
 *   Completion events (status changes to "complete"):
 *   - Creates individual score docs per player (fires existing onScoreCreated pipeline)
 *   - Sets isGhost flag on ghost score docs (existing triggers early-return on ghosts)
 *   - Sends ghost invite SMS/email if contact info provided
 *   - Sends round_complete notifications to on-platform players
 *   - Writes feedActivity items for round completion
 *   - Auto-creates league score docs if round is league-linked
 *   - Updates recentPlayedWith cache
 *
 * File: functions/src/triggers/rounds.ts
 */

import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { sendGhostInvite } from "../invites/ghostInvite";
import { sendRoundNotification } from "../notifications/roundNotifications";

const db = admin.firestore();

// ============================================================================
// TYPES (mirrors client-side scoringTypes.ts)
// ============================================================================

interface PlayerSlot {
  playerId: string;
  displayName: string;
  avatar?: string;
  isGhost: boolean;
  isMarker: boolean;
  handicapIndex: number;
  courseHandicap: number;
  teeName: string;
  slopeRating: number;
  courseRating: number;
  teamId?: string;
  contactInfo?: string;
  contactType?: "phone" | "email";
}

interface HolePlayerData {
  strokes: number;
  fir?: boolean | null;
  gir?: boolean | null;
  dtp?: number | null;
}

interface MarkerTransferRequest {
  requestedBy: string;
  requestedByName: string;
  requestedAt: admin.firestore.Timestamp;
  status: "pending" | "approved" | "declined";
  expiresAt: admin.firestore.Timestamp;
}

interface RoundData {
  markerId: string;
  status: "live" | "complete" | "abandoned";
  courseId: number;
  courseName: string;
  holeCount: 9 | 18;
  formatId: string;
  players: PlayerSlot[];
  teams?: { id: string; name: string; playerIds: string[] }[];
  currentHole: number;
  holeData: Record<string, Record<string, HolePlayerData>>;
  liveScores: Record<string, any>;
  /** Par values per hole from marker's tee */
  holePars?: number[];
  leagueId?: string;
  leagueWeek?: number;
  regionKey?: string;
  location?: { city: string; state: string; latitude?: number; longitude?: number };
  startedAt: admin.firestore.Timestamp;
  completedAt?: admin.firestore.Timestamp;
  roundType?: "on_premise" | "simulator";
  isSimulator?: boolean;
  privacy?: "public" | "private" | "partners";
  roundDescription?: string;
  roundImageUrl?: string;
  markerTransferRequest?: MarkerTransferRequest | null;
}

// ============================================================================
// onRoundUpdated — main trigger
// ============================================================================

export const onRoundUpdated = onDocumentUpdated(
  "rounds/{roundId}",
  async (event) => {
    const before = event.data?.before.data() as RoundData | undefined;
    const after = event.data?.after.data() as RoundData | undefined;
    const roundId = event.params.roundId;

    if (!before || !after) return;

    // ══════════════════════════════════════════════════════════════
    // MARKER TRANSFER — runs on ANY update while round is live
    // ══════════════════════════════════════════════════════════════

    // ── Marker changed: notify new marker + other players ──────
    if (
      before.markerId &&
      after.markerId &&
      before.markerId !== after.markerId &&
      after.status === "live"
    ) {
      const oldMarkerName =
        after.players.find((p) => p.playerId === before.markerId)?.displayName ||
        "The previous scorekeeper";
      const newMarkerName =
        after.players.find((p) => p.playerId === after.markerId)?.displayName ||
        "A player";

      logger.info(
        `🔄 Marker transferred in round ${roundId}: ${before.markerId} → ${after.markerId}`
      );

      // Notify the NEW marker
      try {
        await sendRoundNotification({
          type: "marker_transfer",
          recipientUserId: after.markerId,
          roundId,
          courseName: after.courseName,
          markerName: oldMarkerName,
          message: `You're now the scorekeeper for the round at ${after.courseName}! 🏌️`,
          navigationTarget: "scoring",
        });
      } catch (err) {
        logger.error(`Marker transfer notification failed for new marker:`, err);
      }

      // Notify other on-platform players (not old or new marker)
      const otherPlayers = after.players.filter(
        (p) =>
          !p.isGhost &&
          p.playerId !== before.markerId &&
          p.playerId !== after.markerId
      );

      for (const player of otherPlayers) {
        try {
          await sendRoundNotification({
            type: "marker_transfer",
            recipientUserId: player.playerId,
            roundId,
            courseName: after.courseName,
            markerName: newMarkerName,
            message: `${newMarkerName} is now the scorekeeper for the round at ${after.courseName}`,
            navigationTarget: "round",
          });
        } catch (err) {
          logger.error(
            `Marker transfer notification failed for ${player.displayName}:`,
            err
          );
        }
      }

      logger.info(`✅ Sent marker transfer notifications for round ${roundId}`);
    }

    // ── New transfer request: notify current marker ────────────
    const beforeReq = before.markerTransferRequest;
    const afterReq = after.markerTransferRequest;

    if (
      !beforeReq &&
      afterReq?.status === "pending" &&
      after.status === "live"
    ) {
      logger.info(
        `📩 Marker transfer requested by ${afterReq.requestedByName} in round ${roundId}`
      );

      try {
        await sendRoundNotification({
          type: "marker_transfer_request",
          recipientUserId: after.markerId,
          roundId,
          courseName: after.courseName,
          markerName: afterReq.requestedByName,
          message: `${afterReq.requestedByName} wants to take over scoring. Approve?`,
          navigationTarget: "scoring",
        });

        logger.info(
          `✅ Sent transfer request notification to marker ${after.markerId}`
        );
      } catch (err) {
        logger.error(`Transfer request notification failed:`, err);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // ROUND COMPLETED — status changed to "complete"
    // ══════════════════════════════════════════════════════════════

    if (before.status !== "complete" && after.status === "complete") {
      logger.info(
        `Round ${roundId} completed — processing ${after.players.length} players`
      );

      // Format & simulator eligibility
      const HANDICAP_ELIGIBLE_FORMATS = [
        "stroke_play",
        "individual_stableford",
        "par_bogey",
      ];
      const isSimulator =
        after.isSimulator === true || after.roundType === "simulator";
      const countsForHandicap =
        !isSimulator && HANDICAP_ELIGIBLE_FORMATS.includes(after.formatId);
      const isLeaderboardEligible = countsForHandicap;

      const batch = db.batch();
      const scoreDocIds: string[] = [];

      // ── 1. Create individual score docs per player ────────────
      for (const player of after.players) {
        try {
          const {
            holeScores,
            adjScores,
            holeStats,
            grossScore,
            netScore,
            totalPar,
            scoreToPar,
          } = buildPlayerScoreData(player, after);

          const scoreRef = db.collection("scores").doc();
          const scoreData: Record<string, any> = {
            // Link to round
            roundId,
            // Player info
            userId: player.isGhost
              ? `ghost_${player.playerId}`
              : player.playerId,
            displayName: player.displayName,
            avatar: player.avatar || null,
            // Ghost flags
            isGhost: player.isGhost,
            ghostName: player.isGhost ? player.displayName : null,
            markedBy: after.markerId,
            // Course info
            courseId: after.courseId,
            courseName: after.courseName,
            tees: player.teeName,
            courseRating: player.courseRating,
            slopeRating: player.slopeRating,
            // Handicap
            handicapIndex: player.handicapIndex,
            courseHandicap: player.courseHandicap,
            // Scores
            holeScores,
            adjScores,
            grossScore,
            netScore,
            totalPar,
            scoreToPar,
            // Stats
            holeStats,
            fairwaysHit: holeStats.fir.filter(
              (v: boolean | null) => v === true
            ).length,
            fairwaysPossible: holeStats.fir.filter(
              (v: boolean | null) => v !== null
            ).length,
            greensInRegulation: holeStats.gir.filter(
              (v: boolean | null) => v === true
            ).length,
            // Format
            formatId: after.formatId,
            // Eligibility flags
            countsForHandicap,
            isLeaderboardEligible,
            isSimulator,
            // Description & image (from round)
            roundDescription: after.roundDescription || null,
            roundImageUrl: after.roundImageUrl || null,
            // Skip thought creation in onScoreCreated
            skipThought: true,
            // League (if applicable)
            leagueId: after.leagueId || null,
            leagueWeek: after.leagueWeek || null,
            // Team
            teamId: player.teamId || null,
            // Location & region
            regionKey: after.regionKey || null,
            location: after.location || null,
            geohash: null,
            // Metadata
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            source: "multiplayer_round",
            holeCount: after.holeCount,
            userName: player.displayName,
          };

          batch.set(scoreRef, scoreData);
          scoreDocIds.push(scoreRef.id);

          logger.info(
            `Score doc ${scoreRef.id} created for ${player.displayName} (ghost: ${player.isGhost})`
          );
        } catch (err) {
          logger.error(
            `Error creating score for ${player.displayName}:`,
            err
          );
        }
      }

      // ── 2. Commit all score docs ──────────────────────────────
      try {
        await batch.commit();
        logger.info(
          `Committed ${scoreDocIds.length} score docs for round ${roundId}`
        );
      } catch (err) {
        logger.error(`Batch commit failed for round ${roundId}:`, err);
        return;
      }

      // ── 3. Send ghost invites ─────────────────────────────────
      const ghostPlayers = after.players.filter(
        (p) => p.isGhost && p.contactInfo
      );
      for (const ghost of ghostPlayers) {
        try {
          await sendGhostInvite({
            roundId,
            ghostName: ghost.displayName,
            contactInfo: ghost.contactInfo!,
            contactType: ghost.contactType || "phone",
            courseName: after.courseName,
            grossScore: calculateGrossScore(ghost, after),
            markerName:
              after.players.find((p) => p.isMarker)?.displayName || "A friend",
          });
        } catch (err) {
          logger.error(
            `Ghost invite failed for ${ghost.displayName}:`,
            err
          );
        }
      }

      // ── 4. Send round_complete notifications ──────────────────
      const onPlatformPlayers = after.players.filter(
        (p) => !p.isGhost && !p.isMarker
      );
      const roundPlayerIds = after.players
        .filter((p) => !p.isGhost)
        .map((p) => p.playerId);

      for (const player of onPlatformPlayers) {
        try {
          const others = after.players.filter(
            (p) => p.playerId !== player.playerId
          );
          const namedPlayer = others.find((p) => !p.isGhost) || others[0];
          const remainingCount = others.length - 1;
          let withString = "";
          if (namedPlayer) {
            withString = ` with ${namedPlayer.displayName}`;
            if (remainingCount === 1) {
              const third = others.find(
                (p) => p.playerId !== namedPlayer.playerId
              );
              withString += ` & ${third?.displayName || "1 other"}`;
            } else if (remainingCount > 1) {
              withString += ` & ${remainingCount} other${remainingCount > 1 ? "s" : ""}`;
            }
          }

          const grossScore = calculateGrossScore(player, after);

          await sendRoundNotification({
            type: "round_complete",
            recipientUserId: player.playerId,
            roundId,
            courseName: after.courseName,
            grossScore,
            markerName:
              after.players.find((p) => p.isMarker)?.displayName || "Unknown",
            message: `Your round at ${after.courseName}${withString} is complete — you shot ${grossScore}.`,
            navigationTarget: "profile",
            navigationUserId: player.playerId,
            navigationTab: "rounds",
            roundPlayerIds,
          });
        } catch (err) {
          logger.error(
            `Notification failed for ${player.displayName}:`,
            err
          );
        }
      }

      // ── 5. Create league scores (if league-linked) ────────────
      if (after.leagueId && after.leagueWeek) {
        await createLeagueScores(roundId, after);
      }

      // ── 6. Write feedActivity items ───────────────────────────
      await writeFeedActivity(roundId, after);

      // ── 7. Update recentPlayedWith cache on user docs ─────────
      await updateRecentPlayedWith(after.players);

      logger.info(`Round ${roundId} processing complete`);
      return;
    }
  }
);

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Build per-player score arrays from round holeData.
 */
function buildPlayerScoreData(
  player: PlayerSlot,
  round: RoundData
): {
  holeScores: (number | null)[];
  adjScores: (number | null)[];
  holeStats: { fir: (boolean | null)[]; gir: (boolean | null)[] };
  grossScore: number;
  netScore: number;
  totalPar: number;
  scoreToPar: number;
} {
  const holeScores: (number | null)[] = [];
  const adjScores: (number | null)[] = [];
  const firArr: (boolean | null)[] = [];
  const girArr: (boolean | null)[] = [];

  let grossScore = 0;
  let netScore = 0;
  let totalPar = 0;

  for (let h = 1; h <= round.holeCount; h++) {
    const hData = round.holeData[String(h)]?.[player.playerId];

    if (hData) {
      holeScores.push(hData.strokes);
      grossScore += hData.strokes;

      // Calculate adjusted score (simplified — strokes received based on course handicap)
      // Full calculation would use stroke index from tee data
      adjScores.push(hData.strokes); // Placeholder — real adj calc needs hole SI

      firArr.push(hData.fir ?? null);
      girArr.push(hData.gir ?? null);
    } else {
      holeScores.push(null);
      adjScores.push(null);
      firArr.push(null);
      girArr.push(null);
    }

    // Par — we don't have it directly, but the marker's tee has it
    // For score doc purposes, we'll compute on the client or use a default
    totalPar += 4; // Placeholder — overridden by client-side calculation
  }

  netScore = grossScore - player.courseHandicap;
  const scoreToPar = grossScore - totalPar;

  return {
    holeScores,
    adjScores,
    holeStats: { fir: firArr, gir: girArr },
    grossScore,
    netScore,
    totalPar,
    scoreToPar,
  };
}

/**
 * Calculate gross score for a player from round holeData.
 */
function calculateGrossScore(player: PlayerSlot, round: RoundData): number {
  let total = 0;
  for (let h = 1; h <= round.holeCount; h++) {
    const strokes = round.holeData[String(h)]?.[player.playerId]?.strokes;
    if (strokes) total += strokes;
  }
  return total;
}

/**
 * Create league score documents for league-linked rounds.
 * Only creates for on-platform players who are members of the league.
 */
async function createLeagueScores(
  roundId: string,
  round: RoundData
): Promise<void> {
  if (!round.leagueId || !round.leagueWeek) return;

  const leagueRef = db.collection("leagues").doc(round.leagueId);
  const leagueDoc = await leagueRef.get();
  if (!leagueDoc.exists) return;

  const membersSnap = await leagueRef.collection("members").get();
  const memberIds = new Set(membersSnap.docs.map((d) => d.id));

  const batch = db.batch();

  for (const player of round.players) {
    if (player.isGhost) continue;
    if (!memberIds.has(player.playerId)) continue;

    const grossScore = calculateGrossScore(player, round);
    const netScore = grossScore - player.courseHandicap;

    const leagueScoreRef = leagueRef
      .collection("scores")
      .doc(`${round.leagueWeek}_${player.playerId}`);

    batch.set(leagueScoreRef, {
      userId: player.playerId,
      displayName: player.displayName,
      avatar: player.avatar || null,
      week: round.leagueWeek,
      courseId: round.courseId,
      courseName: round.courseName,
      tees: player.teeName,
      courseRating: player.courseRating,
      slopeRating: player.slopeRating,
      handicapIndex: player.handicapIndex,
      courseHandicap: player.courseHandicap,
      grossScore,
      netScore,
      scoreToPar: grossScore - (round.holeCount === 18 ? 72 : 36), // Approx
      teamId: player.teamId || null,
      roundId,
      formatId: round.formatId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "multiplayer_round",
    });
  }

  try {
    await batch.commit();
    logger.info(
      `League scores created for league ${round.leagueId} week ${round.leagueWeek}`
    );
  } catch (err) {
    logger.error(`League score creation failed:`, err);
  }
}

/**
 * Write feedActivity items for round completion.
 */
async function writeFeedActivity(
  roundId: string,
  round: RoundData
): Promise<void> {
  const batch = db.batch();
  const now = Date.now();

  // Build player summaries for the activity card
  const playerSummaries = round.players.map((p) => {
    const grossScore = calculateGrossScore(p, round);
    const totalPar = round.holePars
      ? round.holePars
          .slice(0, round.holeCount)
          .reduce((s: number, par: number) => s + par, 0)
      : round.holeCount === 18
        ? 72
        : 36;
    return {
      playerId: p.playerId,
      displayName: p.displayName,
      avatar: p.avatar || null,
      isGhost: p.isGhost,
      grossScore,
      netScore: grossScore - p.courseHandicap,
      scoreToPar: grossScore - totalPar,
      courseHandicap: p.courseHandicap,
    };
  });

  const sorted = [...playerSummaries].sort((a, b) => a.netScore - b.netScore);
  const winnerName = sorted[0]?.displayName || null;

  for (const player of round.players) {
    if (player.isGhost) continue;

    const activityRef = db.collection("feedActivity").doc();
    batch.set(activityRef, {
      activityType: "round_complete",
      userId: player.playerId,
      displayName: player.displayName,
      avatar: player.avatar || null,
      roundId,
      courseId: round.courseId,
      courseName: round.courseName,
      holeCount: round.holeCount,
      grossScore: calculateGrossScore(player, round),
      playerCount: round.players.length,
      formatId: round.formatId,
      isSimulator: round.isSimulator || false,
      privacy: round.privacy || "public",
      // Group context for the feed activity card
      playerSummaries: sorted,
      winnerName,
      roundDescription: round.roundDescription || null,
      roundImageUrl: round.roundImageUrl || null,
      // Region & location
      regionKey: round.regionKey || null,
      location: round.location || null,
      timestamp: now,
      createdAt: admin.firestore.Timestamp.fromMillis(now),
      ttl: admin.firestore.Timestamp.fromMillis(
        now + 30 * 24 * 60 * 60 * 1000
      ),
    });
  }

  try {
    await batch.commit();
    logger.info(`Feed activity written for round ${roundId}`);
  } catch (err) {
    logger.error(`Feed activity write failed for round ${roundId}:`, err);
  }
}

/**
 * Update recentPlayedWith cache on each on-platform player's user doc.
 * Stores up to 10 most recent co-players, newest first.
 */
async function updateRecentPlayedWith(players: PlayerSlot[]): Promise<void> {
  const onPlatform = players.filter((p) => !p.isGhost);
  if (onPlatform.length < 2) return;

  for (const player of onPlatform) {
    const coPlayerIds = onPlatform
      .filter((p) => p.playerId !== player.playerId)
      .map((p) => p.playerId);

    if (coPlayerIds.length === 0) continue;

    try {
      const userRef = db.collection("users").doc(player.playerId);
      const userDoc = await userRef.get();
      const existing: string[] = userDoc.data()?.recentPlayedWith || [];

      // Prepend new co-players, deduplicate, cap at 10
      const updated = [
        ...coPlayerIds,
        ...existing.filter((id) => !coPlayerIds.includes(id)),
      ].slice(0, 10);

      await userRef.update({ recentPlayedWith: updated });
    } catch (err) {
      logger.error(
        `recentPlayedWith update failed for ${player.playerId}:`,
        err
      );
    }
  }
}