/**
 * rankingEngine.ts  (functions/src/utils/rankingEngine.ts)
 *
 * Pure ranking formula logic — no triggers, no side effects.
 * All Firestore writes go through the callers (triggers + backfill script).
 *
 * Formula summary:
 *   CourseAdjustedScore = (NetScore - Par) x (SlopeRating / 113)
 *   BasePoints          = max(0, 40 - CourseAdjustedScore)
 *   FieldMultiplier     = 1 + (FieldStrength / 100)
 *   FormatWeight        = 0.75 | 1.0 | 1.25 | 1.5 | 2.0   (event type)
 *   GameFormatWeight    = 0.65 – 1.0                        (game type)
 *   RoundPoints         = BasePoints x FieldMultiplier x FormatWeight x GameFormatWeight
 *   AdjustedPoints      = RoundPoints x RecencyWeight (decay over 52 weeks)
 *   PowerRating         = Sum(AdjustedPoints) / max(3, roundsInWindow)
 *
 * Match play exception:
 *   No stroke total available — flat points awarded based on result:
 *   Win = 35pts, Halve = 25pts, Loss = 15pts  (then x FieldMultiplier x FormatWeight x GameFormatWeight)
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

export type FormatType = "solo" | "casual" | "league" | "invitational" | "tour";

/**
 * Game format IDs — matches formatId values in RoundData / gameFormats constants.
 * No player is excluded for format choice — lesser formats get reduced weight, not zero.
 */
export type GameFormatType =
  // Full weight — stroke-based individual scoring
  | "stroke_play"
  | "stroke_play_with_skins"
  // Near-full — still individually meaningful
  | "stableford"
  // Better ball — individual scores tracked, best counts
  | "fourball"
  | "better_ball"
  // Match play — result-based, no stroke total
  | "match_play"
  | "singles_match_play"
  // Skins only
  | "skins"
  // Team scramble — least individual signal
  | "scramble"
  | "texas_scramble"
  // Alternate shot — shared score
  | "foursomes"
  | "alternate_shot"
  // Fallback for any unrecognised format
  | "unknown";

/** For match play: the outcome for this player */
export type MatchPlayResult = "win" | "halve" | "loss";

export interface PlayerRoundInput {
  userId: string;
  roundId: string;
  courseId: number;
  regionKey: string;
  netScore: number;
  par: number;
  slopeRating: number;
  courseRating: number | null;
  handicapIndex: number | null;
  fieldStrength: number;
  formatType: FormatType;
  /** Game format id from RoundData.formatId */
  gameFormatId: GameFormatType;
  /** Only required for match_play / singles_match_play */
  matchPlayResult?: MatchPlayResult;
  challengePoints: number;
  createdAt: Timestamp;
}

export interface PlayerRoundDoc extends PlayerRoundInput {
  roundPoints: number;
}

export interface WorldRankingDoc {
  userId: string;
  displayName: string;
  userAvatar: string | null;
  regionKey: string;
  powerRating: number;
  rank: number | null;
  roundsInWindow: number;
  totalRoundsAllTime: number;
  challengePoints: number;
  lastRoundAt: Timestamp;
  lastUpdated: Timestamp;
}

/* ================================================================ */
/* CONSTANTS                                                        */
/* ================================================================ */

/** Event-type weight — how competitive is the context? */
export const FORMAT_WEIGHTS: Record<FormatType, number> = {
  solo: 0.75,
  casual: 1.0,
  league: 1.25,
  invitational: 1.5,
  tour: 2.0,
};

/**
 * Game-format weight — how much individual signal does this format produce?
 *
 * Philosophy: nobody gets zero. Recreational golfers play all kinds of formats.
 * Scrambles and skins nights still tell us something about the player.
 * We just dial back the signal strength relative to clean stroke play.
 */
export const GAME_FORMAT_WEIGHTS: Record<GameFormatType, number> = {
  // Stroke-based individual — full signal
  stroke_play: 1.0,
  stroke_play_with_skins: 1.0,

  // Stableford — still individually meaningful, minor discount for non-stroke scoring
  stableford: 0.9,

  // Better ball / fourball — individual scores tracked, best ball counts
  fourball: 0.85,
  better_ball: 0.85,

  // Match play — result-based scoring, no stroke total
  match_play: 0.8,
  singles_match_play: 0.8,

  // Skins — gross/net score used as proxy; participation valued
  skins: 0.75,

  // Scramble — team score, least individual isolation
  scramble: 0.7,
  texas_scramble: 0.7,

  // Alternate shot — shared strokes, lowest individual signal
  foursomes: 0.65,
  alternate_shot: 0.65,

  // Unknown / future formats — treat conservatively
  unknown: 0.75,
};

/**
 * Flat base points for match play results (before field/format multipliers).
 * Replaces the score-based BasePoints calculation.
 */
const MATCH_PLAY_POINTS: Record<MatchPlayResult, number> = {
  win: 35,
  halve: 25,
  loss: 15,
};

const FULL_VALUE_WEEKS = 8;
const DECAY_WINDOW_WEEKS = 52;
const DECAY_DURATION = DECAY_WINDOW_WEEKS - FULL_VALUE_WEEKS; // 44 weeks
const MIN_ROUNDS_TO_RANK = 3;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/* ================================================================ */
/* FORMULA FUNCTIONS                                                */
/* ================================================================ */

/**
 * Derive an initial Power Rating seed from handicap index.
 * Used for field strength calculations before real ratings exist.
 * Never displayed to users directly.
 */
export function initialPowerRating(handicapIndex: number | null): number {
  if (handicapIndex == null) return 20;
  return Math.max(0, 50 - handicapIndex * 1.5);
}

/**
 * Synthetic field strength for solo rounds.
 * Harder course = higher field strength proxy.
 */
export function soloFieldStrength(slopeRating: number): number {
  return (slopeRating / 113) * 20;
}

/**
 * Apply recency decay to a round's points.
 * Full value for weeks 0-8, linear decay to 0 over weeks 9-52.
 */
export function applyDecay(points: number, createdAt: Timestamp): number {
  const now = Date.now();
  const ageMs = now - createdAt.toMillis();
  const ageWeeks = ageMs / MS_PER_WEEK;

  if (ageWeeks > DECAY_WINDOW_WEEKS) return 0;
  if (ageWeeks <= FULL_VALUE_WEEKS) return points;

  const decayFraction = (ageWeeks - FULL_VALUE_WEEKS) / DECAY_DURATION;
  return points * (1 - decayFraction);
}

/**
 * Normalise a raw formatId string from Firestore to our GameFormatType enum.
 * Safe to call with any string — unknown formats fall back to "unknown".
 */
export function normaliseGameFormatId(rawFormatId: string | undefined | null): GameFormatType {
  if (!rawFormatId) return "unknown";
  const known = Object.keys(GAME_FORMAT_WEIGHTS) as GameFormatType[];
  return known.includes(rawFormatId as GameFormatType)
    ? (rawFormatId as GameFormatType)
    : "unknown";
}

/**
 * Calculate raw round points (before decay).
 *
 * Match play formats bypass the score-based calculation entirely —
 * flat points are awarded based on win/halve/loss result.
 */
export function calculateRoundPoints(
  netScore: number,
  par: number,
  slopeRating: number,
  fieldStrength: number,
  formatType: FormatType,
  gameFormatId: GameFormatType = "stroke_play",
  matchPlayResult?: MatchPlayResult
): number {
  const fieldMultiplier = 1 + fieldStrength / 100;
  const formatWeight = FORMAT_WEIGHTS[formatType];
  const gameFormatWeight = GAME_FORMAT_WEIGHTS[gameFormatId];

  // Match play — flat points based on result, no score calculation
  const isMatchPlay = gameFormatId === "match_play" || gameFormatId === "singles_match_play";
  if (isMatchPlay) {
    const result = matchPlayResult ?? "loss"; // Conservative default if result unknown
    const basePoints = MATCH_PLAY_POINTS[result];
    return basePoints * fieldMultiplier * formatWeight * gameFormatWeight;
  }

  // All other formats — score-based calculation
  const courseAdjustedScore = (netScore - par) * (slopeRating / 113);
  const basePoints = Math.max(0, 40 - courseAdjustedScore);
  return basePoints * fieldMultiplier * formatWeight * gameFormatWeight;
}

/* ================================================================ */
/* FIELD STRENGTH HELPER                                           */
/* ================================================================ */

/**
 * Calculate field strength from a list of on-platform player IDs.
 * Reads worldRankings docs — falls back to handicap seed if not found.
 * Pass handicapMap for backfill scenarios where worldRankings don't exist yet.
 */
export async function calculateFieldStrength(
  playerIds: string[],
  handicapMap?: Record<string, number | null>
): Promise<number> {
  if (playerIds.length === 0) return 20;

  const db = getFirestore();
  const ratings: number[] = [];

  // Chunk to 30 for Firestore "in" limit
  const chunks: string[][] = [];
  for (let i = 0; i < playerIds.length; i += 30) {
    chunks.push(playerIds.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    const snaps = await db
      .collection("worldRankings")
      .where("userId", "in", chunk)
      .get();

    const foundIds = new Set<string>();
    snaps.forEach((doc) => {
      foundIds.add(doc.id);
      ratings.push((doc.data() as WorldRankingDoc).powerRating);
    });

    // For players not yet in worldRankings, use handicap seed
    for (const id of chunk) {
      if (!foundIds.has(id)) {
        const hcp = handicapMap?.[id] ?? null;
        ratings.push(initialPowerRating(hcp));
      }
    }
  }

  if (ratings.length === 0) return 20;
  return ratings.reduce((a, b) => a + b, 0) / ratings.length;
}

/* ================================================================ */
/* MAIN RANKING CALCULATION                                        */
/* ================================================================ */

/**
 * Recalculate a player's Power Rating from their playerRounds history.
 * Writes the result to worldRankings/{userId}.
 *
 * Returns the calculated powerRating, or null if < MIN_ROUNDS_TO_RANK.
 */
export async function calculatePlayerRanking(
  userId: string,
  displayName: string,
  userAvatar: string | null,
  regionKey: string
): Promise<number | null> {
  const db = getFirestore();
  const cutoff = Timestamp.fromMillis(Date.now() - DECAY_WINDOW_WEEKS * MS_PER_WEEK);

  // Fetch challengeBadges from user doc to surface on world rankings
  let challengeBadges: string[] = [];
  try {
    const userSnap = await db.collection("users").doc(userId).get();
    if (userSnap.exists) {
      challengeBadges = (userSnap.data() as any)?.earnedChallengeBadges || [];
    }
  } catch {
    // Non-critical — rankings will still write without badges
  }

  // Fetch all eligible rounds in the 52-week window
  const roundsSnap = await db
    .collection("playerRounds")
    .where("userId", "==", userId)
    .where("createdAt", ">=", cutoff)
    .get();

  if (roundsSnap.empty) {
    await db.collection("worldRankings").doc(userId).set({
      userId, displayName, userAvatar, regionKey,
      challengeBadges,
      powerRating: 0,
      rank: null,
      roundsInWindow: 0,
      totalRoundsAllTime: 0,
      challengePoints: 0,
      lastRoundAt: Timestamp.now(),
      lastUpdated: Timestamp.now(),
    }, { merge: true });
    return null;
  }

  let totalAdjustedPoints = 0;
  let totalAdjustedChallengePoints = 0;
  let roundsInWindow = 0;
  let latestRoundAt: Timestamp = Timestamp.fromMillis(0);

  roundsSnap.forEach((doc) => {
    const round = doc.data() as PlayerRoundDoc;
    const adjustedRound = applyDecay(round.roundPoints, round.createdAt);
    const adjustedChallenge = applyDecay(round.challengePoints || 0, round.createdAt);

    totalAdjustedPoints += adjustedRound;
    totalAdjustedChallengePoints += adjustedChallenge;
    roundsInWindow++;

    if (round.createdAt.toMillis() > latestRoundAt.toMillis()) {
      latestRoundAt = round.createdAt;
    }
  });

  const divisor = Math.max(MIN_ROUNDS_TO_RANK, roundsInWindow);
  const powerRating = parseFloat(
    ((totalAdjustedPoints + totalAdjustedChallengePoints) / divisor).toFixed(2)
  );

  const existingSnap = await db.collection("worldRankings").doc(userId).get();
  const existingRank = existingSnap.exists
    ? (existingSnap.data() as WorldRankingDoc).rank
    : null;
  const existingTotal = existingSnap.exists
    ? (existingSnap.data() as WorldRankingDoc).totalRoundsAllTime ?? 0
    : 0;

  await db.collection("worldRankings").doc(userId).set({
    userId, displayName, userAvatar, regionKey,
    challengeBadges,
    powerRating,
    rank: roundsInWindow >= MIN_ROUNDS_TO_RANK ? existingRank : null,
    roundsInWindow,
    totalRoundsAllTime: Math.max(existingTotal, roundsInWindow),
    challengePoints: parseFloat(totalAdjustedChallengePoints.toFixed(2)),
    lastRoundAt: latestRoundAt,
    lastUpdated: Timestamp.now(),
  });

  console.log(`✅ worldRankings updated: ${userId} → ${powerRating} (${roundsInWindow} rounds)`);
  return powerRating;
}