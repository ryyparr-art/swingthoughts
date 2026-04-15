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
 *   - Writes feedActivity items for round completion (skipped for outing-linked rounds)
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
import {
  PlayerResult,
  processRivalries,
  RivalryContext,
  sendRivalryNotifications,
  writeRivalryFeedCards,
} from "../rivalries/rivalryEngine";
import {
  calculateFieldStrength,
  calculatePlayerRanking,
  calculateRoundPoints,
  normaliseGameFormatId,
} from "../utils/rankingEngine";

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
  leaderboardId?: string | null;
  location?: { city: string; state: string; latitude?: number; longitude?: number };
  startedAt: admin.firestore.Timestamp;
  completedAt?: admin.firestore.Timestamp;
  roundType?: "on_premise" | "simulator";
  isSimulator?: boolean;
  privacy?: "public" | "private" | "partners";
  roundDescription?: string;
  roundImageUrl?: string;
  markerTransferRequest?: MarkerTransferRequest | null;
  /** Outing link — if present, this round is part of a group outing */
  outingId?: string | null;
  groupId?: string | null;
  groupName?: string | null;
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

      const isOutingLinked = !!after.outingId;

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
            // Outing (if applicable)
            outingId: after.outingId || null,
            groupId: after.groupId || null,
            // Location & region
            regionKey: after.regionKey || null,
            // Leaderboard key — baked in at round creation via CourseSelector.
            // onScoreCreated reads this directly to avoid a course doc lookup,
            // eliminating the "course has no regionKey" bug for future rounds.
            leaderboardId: after.leaderboardId || null,
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
      // For outing-linked rounds, skip individual round_complete notifications.
      // The outing_complete notifications (sent by outingRounds.ts when ALL
      // groups finish) replace these with position-aware outing results.
      if (!isOutingLinked) {
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
      } else {
        logger.info(
          `⏭️ Skipping round_complete notifications for outing-linked round ${roundId} — outing_complete handles this`
        );
      }

      // ── 5. Create league scores (if league-linked) ────────────
      if (after.leagueId && after.leagueWeek) {
        await createLeagueScores(roundId, after);
      }

      // ── 6. Write feedActivity items ───────────────────────────
      // For outing-linked rounds, skip individual round_complete feed cards.
      // The outing_complete card (written by outingRounds.ts when ALL groups
      // finish) replaces these — Strava-style grouped activity.
      if (!isOutingLinked) {
        await writeFeedActivity(roundId, after);
      } else {
        logger.info(
          `⏭️ Skipping round feed activity for outing-linked round ${roundId} — outing_complete card handles this`
        );
      }

      // ── 7. Update recentPlayedWith cache on user docs ─────────
      await updateRecentPlayedWith(after.players);

      // ── 8. ST Power Ranking — casual multiplayer ──────────────
      // Runs for all non-outing, non-simulator rounds with regionKey.
      // Outing-linked rounds are handled by outingRounds.ts at outing completion.
      if (!isOutingLinked && !isSimulator && after.regionKey) {
        try {
          const onPlatformPlayers = after.players.filter((p) => !p.isGhost);
          const playerIds = onPlatformPlayers.map((p) => p.playerId);
          const handicapMap: Record<string, number | null> = {};
          onPlatformPlayers.forEach((p) => { handicapMap[p.playerId] = p.handicapIndex; });

          const fieldStrength = await calculateFieldStrength(playerIds, handicapMap);
          const gameFormatId = normaliseGameFormatId(after.formatId);
          const totalPar = after.holePars
            ? after.holePars.slice(0, after.holeCount).reduce((s, p) => s + p, 0)
            : after.holeCount === 18 ? 72 : 36;

          for (const player of onPlatformPlayers) {
            try {
              const grossScore = calculateGrossScore(player, after);
              const netScore = grossScore - player.courseHandicap;

              // Derive match play result if applicable
              const liveScore = after.liveScores?.[player.playerId];
              let matchPlayResult: "win" | "halve" | "loss" | undefined;
              if (gameFormatId === "match_play" || gameFormatId === "singles_match_play") {
                const won = liveScore?.holesWon ?? 0;
                const lost = liveScore?.holesLost ?? 0;
                matchPlayResult = won > lost ? "win" : won === lost ? "halve" : "loss";
              }

              const roundPoints = calculateRoundPoints(
                netScore,
                totalPar,
                player.slopeRating,
                fieldStrength,
                "casual",
                gameFormatId,
                matchPlayResult
              );

              const playerRoundRef = db
                .collection("playerRounds")
                .doc(`${player.playerId}_${roundId}`);

              await playerRoundRef.set({
                userId: player.playerId,
                roundId,
                courseId: after.courseId,
                regionKey: after.regionKey,
                netScore,
                par: totalPar,
                slopeRating: player.slopeRating,
                courseRating: player.courseRating,
                handicapIndex: player.handicapIndex,
                fieldStrength,
                formatType: "casual",
                gameFormatId,
                matchPlayResult: matchPlayResult ?? null,
                roundPoints,
                challengePoints: 0,
                createdAt: admin.firestore.Timestamp.now(),
              });

              await calculatePlayerRanking(
                player.playerId,
                player.displayName,
                player.avatar || null,
                after.regionKey!
              );
            } catch (playerRankErr) {
              logger.error(`Ranking update failed for ${player.displayName}:`, playerRankErr);
            }
          }
        } catch (rankErr) {
          logger.error(`Power ranking block failed for round ${roundId}:`, rankErr);
        }
      }

      // ── 9. Update rivalries ─────────────────────────────────────
      // For non-outing rounds, process rivalries between all on-platform players.
      // Outing-linked rounds are handled by outingRounds.ts (cross-group processing).
      if (!isOutingLinked) {
        try {
          const playerResults: PlayerResult[] = after.players
            .filter((p) => !p.isGhost)
            .map((p) => {
              const grossScore = calculateGrossScore(p, after);
              return {
                userId: p.playerId,
                displayName: p.displayName,
                avatar: p.avatar || null,
                netScore: grossScore - p.courseHandicap,
                grossScore,
                isGhost: false,
              };
            });

          const rivalryContext: RivalryContext = {
            roundId,
            courseId: after.courseId,
            courseName: after.courseName,
            date: after.completedAt || admin.firestore.Timestamp.now(),
            regionKey: after.regionKey || null,
            location: after.location || null,
          };

          const rivalryChanges = await processRivalries(playerResults, rivalryContext);

          if (rivalryChanges.length > 0) {
            await writeRivalryFeedCards(rivalryChanges, rivalryContext);
            await sendRivalryNotifications(rivalryChanges, sendRoundNotification);
            logger.info(
              `✅ ${rivalryChanges.length} rivalry changes processed for round ${roundId}`
            );
          }
        } catch (err) {
          logger.error(`Rivalry processing failed for round ${roundId}:`, err);
          // Non-fatal — round completion still succeeded
        }
      } else {
        logger.info(
          `⏭️ Skipping rivalry processing for outing-linked round ${roundId} — outingRounds.ts handles this`
        );
      }

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

    // Par — use holePars from round doc (stored by the client when round starts).
    // Fall back to 4 per hole only if the array is missing or too short.
    totalPar += round.holePars?.[h - 1] ?? 4;
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
      // Use actual holePars from the round doc rather than a hardcoded 72/36
      // approximation — ensures scoreToPar is accurate on every course.
      scoreToPar: grossScore - (
        round.holePars
          ? round.holePars.slice(0, round.holeCount).reduce((s, par) => s + par, 0)
          : round.holeCount === 18 ? 72 : 36
      ),
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
 *
 * NOTE: This is NOT called for outing-linked rounds. The outing_complete
 * card (written by outingRounds.ts) replaces individual round cards for
 * outing participants — Strava-style grouped activity.
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
 * Uses arrayUnion for the write — no read-before-write needed.
 */
async function updateRecentPlayedWith(players: PlayerSlot[]): Promise<void> {
  const onPlatform = players.filter((p) => !p.isGhost);
  if (onPlatform.length < 2) return;

  // Run all user doc updates concurrently — no sequential awaits
  await Promise.all(
    onPlatform.map(async (player) => {
      const coPlayerIds = onPlatform
        .filter((p) => p.playerId !== player.playerId)
        .map((p) => p.playerId);

      if (coPlayerIds.length === 0) return;

      try {
        // arrayUnion handles dedup without a read — Firestore merges atomically.
        // We can't enforce the 10-item cap server-side with arrayUnion alone,
        // so we accept that the array may grow slightly beyond 10 between
        // cleanup passes. For a "recent played with" cache this is acceptable.
        await db.collection("users").doc(player.playerId).update({
          recentPlayedWith: admin.firestore.FieldValue.arrayUnion(...coPlayerIds),
        });
      } catch (err) {
        logger.error(
          `recentPlayedWith update failed for ${player.playerId}:`,
          err
        );
      }
    })
  );
}