/**
 * Game Formats — Constants, Types & Scoring Logic
 *
 * Shared definitions for all golf game formats in SwingThoughts.
 * Used by: Leagues, Scorecards, Cups, Tours, Multiplayer
 *
 * Format categories:
 *   - Individual: Stroke Play, Stableford, Skins, Match Play, Duplicate
 *   - Two-Player Team: Better Ball (stroke/stableford/match), Foursome,
 *                       Greensome, 2-Man Scramble
 *   - Four-Player Team: Scramble, Best Ball (stroke/stableford)
 *   - Scoring Overlays: Low Scratch, Low Net
 *
 * File: constants/gameFormats.ts
 */

// ============================================================================
// ENUMS & CORE TYPES
// ============================================================================

/** Top-level format category */
export type FormatCategory = "individual" | "two_player_team" | "four_player_team";

/** Scoring method used to determine winner */
export type ScoringMethod =
  | "total_strokes"       // lowest total wins
  | "points"              // highest points wins (Stableford)
  | "holes_won"           // most holes won (Match Play, Skins)
  | "comparison"          // per-hole comparison across groups (Duplicate)
  | "net_strokes";        // lowest net total wins

/** How individual hole scores are resolved in team formats */
export type TeamScoreResolution =
  | "best_ball"           // take the best score among team members
  | "alternate_shot"      // one ball, players alternate
  | "scramble"            // all hit, pick best, all hit again
  | "greensome"           // both tee off, pick best drive, alternate from there
  | "individual";         // each player plays their own ball independently

/** Whether handicap adjustments apply */
export type HandicapMode = "scratch" | "net" | "both";

/** Hole-level result for match play formats */
export type HoleMatchResult = "win" | "loss" | "halve";

// ============================================================================
// FORMAT DEFINITION
// ============================================================================

export interface GameFormatDefinition {
  id: string;
  name: string;
  shortName: string;
  description: string;
  category: FormatCategory;
  scoringMethod: ScoringMethod;
  teamScoreResolution: TeamScoreResolution;
  handicapMode: HandicapMode;

  /** Number of players per team (1 for individual) */
  playersPerTeam: number;

  /** Number of teams in a standard match (2 for match play, null for open field) */
  teamsPerMatch: number | null;

  /** Whether holes can be "won" individually (match play, skins) */
  holeByHole: boolean;

  /** Whether the format supports 9-hole rounds */
  supports9Hole: boolean;

  /** Whether the format supports 18-hole rounds */
  supports18Hole: boolean;

  /** Whether this format can be used in leagues */
  availableInLeagues: boolean;

  /** Whether this format can be used in cups/tours */
  availableInCups: boolean;

  /** Whether this format can be used in casual/scorecard play */
  availableInScorecard: boolean;

  /** Icon name (Ionicons) for UI display */
  icon: string;

  /** Brief rules summary for display */
  rulesSummary: string;
}

// ============================================================================
// STABLEFORD POINTS TABLE
// ============================================================================

/**
 * Standard Stableford points relative to par.
 * Score relative to par → points awarded.
 */
export const STABLEFORD_POINTS: Record<number, number> = {
  [-3]: 5,  // Albatross (double eagle)
  [-2]: 4,  // Eagle
  [-1]: 3,  // Birdie
  [0]: 2,   // Par
  [1]: 1,   // Bogey
  [2]: 0,   // Double bogey or worse
};

/**
 * Get Stableford points for a hole.
 * Anything worse than double bogey = 0.
 */
export function getStablefordPoints(
  score: number,
  par: number,
  handicapStrokes?: number
): number {
  const netScore = handicapStrokes ? score - handicapStrokes : score;
  const relativeToPar = netScore - par;

  if (relativeToPar <= -3) return 5;
  if (relativeToPar === -2) return 4;
  if (relativeToPar === -1) return 3;
  if (relativeToPar === 0) return 2;
  if (relativeToPar === 1) return 1;
  return 0;
}

// ============================================================================
// FORMAT DEFINITIONS
// ============================================================================

export const GAME_FORMATS: GameFormatDefinition[] = [
  // ── Individual Formats ──────────────────────────────────────────

  {
    id: "stroke_play",
    name: "Stroke Play",
    shortName: "Stroke",
    description: "Count every stroke. Lowest total score wins.",
    category: "individual",
    scoringMethod: "total_strokes",
    teamScoreResolution: "individual",
    handicapMode: "both",
    playersPerTeam: 1,
    teamsPerMatch: null,
    holeByHole: false,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: true,
    availableInCups: true,
    availableInScorecard: true,
    icon: "golf-outline",
    rulesSummary:
      "Each player counts every stroke across all holes. The player with the fewest total strokes wins.",
  },
  {
    id: "stableford",
    name: "Stableford",
    shortName: "Stableford",
    description: "Points-based scoring. Higher is better.",
    category: "individual",
    scoringMethod: "points",
    teamScoreResolution: "individual",
    handicapMode: "both",
    playersPerTeam: 1,
    teamsPerMatch: null,
    holeByHole: false,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: true,
    availableInCups: true,
    availableInScorecard: true,
    icon: "star-outline",
    rulesSummary:
      "Points awarded per hole based on score relative to par: Bogey=1, Par=2, Birdie=3, Eagle=4, Albatross=5. Double bogey or worse=0. Highest total points wins.",
  },
  {
    id: "skins",
    name: "Skins",
    shortName: "Skins",
    description: "Win individual holes. Ties carry over.",
    category: "individual",
    scoringMethod: "holes_won",
    teamScoreResolution: "individual",
    handicapMode: "both",
    playersPerTeam: 1,
    teamsPerMatch: null,
    holeByHole: true,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: true,
    availableInCups: true,
    availableInScorecard: true,
    icon: "cash-outline",
    rulesSummary:
      "Each hole is worth one 'skin'. Lowest score on a hole wins the skin. If two or more players tie, the skin carries over to the next hole. Most skins wins.",
  },
  {
    id: "match_play",
    name: "Match Play",
    shortName: "Match",
    description: "Head-to-head. Win holes, not strokes.",
    category: "individual",
    scoringMethod: "holes_won",
    teamScoreResolution: "individual",
    handicapMode: "both",
    playersPerTeam: 1,
    teamsPerMatch: 2,
    holeByHole: true,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: true,
    availableInCups: true,
    availableInScorecard: true,
    icon: "people-outline",
    rulesSummary:
      "Two players compete hole by hole. Lowest score on a hole wins that hole. Ties halve the hole. Lead expressed as 'X up with Y to play'. Match can end early if lead is insurmountable.",
  },
  {
    id: "duplicate",
    name: "Duplicate",
    shortName: "Duplicate",
    description: "Compare scores on identical holes across groups.",
    category: "individual",
    scoringMethod: "comparison",
    teamScoreResolution: "individual",
    handicapMode: "scratch",
    playersPerTeam: 1,
    teamsPerMatch: null,
    holeByHole: true,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: false,
    availableInCups: true,
    availableInScorecard: false,
    icon: "copy-outline",
    rulesSummary:
      "Multiple groups play the same holes. Scores on each hole are compared across all groups. Points awarded based on how your score ranks against others on each hole.",
  },

  // ── Two-Player Team Formats ─────────────────────────────────────

  {
    id: "better_ball_stroke",
    name: "Better Ball (Stroke)",
    shortName: "BB Stroke",
    description: "Two-player team. Best individual score counts each hole.",
    category: "two_player_team",
    scoringMethod: "total_strokes",
    teamScoreResolution: "best_ball",
    handicapMode: "both",
    playersPerTeam: 2,
    teamsPerMatch: null,
    holeByHole: false,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: true,
    availableInCups: true,
    availableInScorecard: true,
    icon: "people-outline",
    rulesSummary:
      "Two players play their own balls. On each hole, the lower score of the two counts as the team score. Lowest total team score wins.",
  },
  {
    id: "better_ball_stableford",
    name: "Better Ball (Stableford)",
    shortName: "BB Stableford",
    description: "Two-player team. Best Stableford points count each hole.",
    category: "two_player_team",
    scoringMethod: "points",
    teamScoreResolution: "best_ball",
    handicapMode: "both",
    playersPerTeam: 2,
    teamsPerMatch: null,
    holeByHole: false,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: true,
    availableInCups: true,
    availableInScorecard: true,
    icon: "people-outline",
    rulesSummary:
      "Two players play their own balls. On each hole, the higher Stableford points of the two counts. Highest total team points wins.",
  },
  {
    id: "better_ball_match",
    name: "Better Ball (Match Play)",
    shortName: "BB Match",
    description: "Two-player teams. Best ball per hole in match play format.",
    category: "two_player_team",
    scoringMethod: "holes_won",
    teamScoreResolution: "best_ball",
    handicapMode: "both",
    playersPerTeam: 2,
    teamsPerMatch: 2,
    holeByHole: true,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: true,
    availableInCups: true,
    availableInScorecard: true,
    icon: "people-outline",
    rulesSummary:
      "Two teams of two. Each player plays their own ball. The best score from each team is compared hole by hole in match play format.",
  },
  {
    id: "foursome_match",
    name: "Foursome (Match Play)",
    shortName: "Foursome",
    description: "Alternate shot. One ball per team.",
    category: "two_player_team",
    scoringMethod: "holes_won",
    teamScoreResolution: "alternate_shot",
    handicapMode: "both",
    playersPerTeam: 2,
    teamsPerMatch: 2,
    holeByHole: true,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: false,
    availableInCups: true,
    availableInScorecard: true,
    icon: "swap-horizontal-outline",
    rulesSummary:
      "Two teams of two share one ball per team. Partners alternate shots — one tees off on odd holes, the other on even holes. Match play scoring.",
  },
  {
    id: "greensome_match",
    name: "Greensome (Match Play)",
    shortName: "Greensome",
    description: "Both tee off, pick best drive, alternate from there.",
    category: "two_player_team",
    scoringMethod: "holes_won",
    teamScoreResolution: "greensome",
    handicapMode: "both",
    playersPerTeam: 2,
    teamsPerMatch: 2,
    holeByHole: true,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: false,
    availableInCups: true,
    availableInScorecard: true,
    icon: "git-merge-outline",
    rulesSummary:
      "Both partners tee off. The team selects the best drive, then alternates shots from there until the ball is holed. Match play scoring between teams.",
  },
  {
    id: "two_man_scramble",
    name: "2-Man Scramble",
    shortName: "2-Man Scramble",
    description: "Both hit every shot. Pick the best each time.",
    category: "two_player_team",
    scoringMethod: "total_strokes",
    teamScoreResolution: "scramble",
    handicapMode: "both",
    playersPerTeam: 2,
    teamsPerMatch: null,
    holeByHole: false,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: true,
    availableInCups: true,
    availableInScorecard: true,
    icon: "shuffle-outline",
    rulesSummary:
      "Both players hit every shot. After each shot, the team picks the best result and both play from that spot. Lowest total team score wins.",
  },

  // ── Four-Player Team Formats ────────────────────────────────────

  {
    id: "scramble",
    name: "Scramble",
    shortName: "Scramble",
    description: "Four-player team. Pick the best shot every time.",
    category: "four_player_team",
    scoringMethod: "total_strokes",
    teamScoreResolution: "scramble",
    handicapMode: "both",
    playersPerTeam: 4,
    teamsPerMatch: null,
    holeByHole: false,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: true,
    availableInCups: true,
    availableInScorecard: true,
    icon: "shuffle-outline",
    rulesSummary:
      "All four players hit every shot. The team selects the best result after each shot, and all players play from that spot. Lowest total team score wins.",
  },
  {
    id: "best_ball_stroke",
    name: "Best Ball (Stroke Play)",
    shortName: "Best Ball Stroke",
    description: "Four-player team. Best individual score counts each hole.",
    category: "four_player_team",
    scoringMethod: "total_strokes",
    teamScoreResolution: "best_ball",
    handicapMode: "both",
    playersPerTeam: 4,
    teamsPerMatch: null,
    holeByHole: false,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: true,
    availableInCups: true,
    availableInScorecard: true,
    icon: "trophy-outline",
    rulesSummary:
      "All four players play their own ball. On each hole, the lowest score among the four counts as the team score. Lowest total team score wins.",
  },
  {
    id: "best_ball_stableford",
    name: "Best Ball (Stableford)",
    shortName: "Best Ball Stblfd",
    description: "Four-player team. Best Stableford points count each hole.",
    category: "four_player_team",
    scoringMethod: "points",
    teamScoreResolution: "best_ball",
    handicapMode: "both",
    playersPerTeam: 4,
    teamsPerMatch: null,
    holeByHole: false,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: true,
    availableInCups: true,
    availableInScorecard: true,
    icon: "trophy-outline",
    rulesSummary:
      "All four players play their own ball. On each hole, the highest Stableford points among the four counts. Highest total team points wins.",
  },

  // ── Scoring Overlays ────────────────────────────────────────────

  {
    id: "low_scratch_stroke",
    name: "Low Scratch (Stroke Play)",
    shortName: "Low Scratch",
    description: "Lowest gross score wins. No handicap adjustments.",
    category: "individual",
    scoringMethod: "total_strokes",
    teamScoreResolution: "individual",
    handicapMode: "scratch",
    playersPerTeam: 1,
    teamsPerMatch: null,
    holeByHole: false,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: true,
    availableInCups: true,
    availableInScorecard: true,
    icon: "ribbon-outline",
    rulesSummary:
      "Standard stroke play with no handicap adjustments. The player with the lowest gross score wins. Pure skill competition.",
  },
  {
    id: "low_net_stroke",
    name: "Low Net (Stroke Play)",
    shortName: "Low Net",
    description: "Lowest net score wins. Handicap adjusted.",
    category: "individual",
    scoringMethod: "net_strokes",
    teamScoreResolution: "individual",
    handicapMode: "net",
    playersPerTeam: 1,
    teamsPerMatch: null,
    holeByHole: false,
    supports9Hole: true,
    supports18Hole: true,
    availableInLeagues: true,
    availableInCups: true,
    availableInScorecard: true,
    icon: "calculator-outline",
    rulesSummary:
      "Standard stroke play with handicap adjustments. Each player's handicap strokes are distributed across holes by difficulty. Lowest net score wins.",
  },
];

// ============================================================================
// LOOKUP HELPERS
// ============================================================================

/** Get a format definition by ID */
export function getFormatById(id: string): GameFormatDefinition | undefined {
  return GAME_FORMATS.find((f) => f.id === id);
}

/** Get all formats for a given category */
export function getFormatsByCategory(category: FormatCategory): GameFormatDefinition[] {
  return GAME_FORMATS.filter((f) => f.category === category);
}

/** Get all formats available for leagues */
export function getLeagueFormats(): GameFormatDefinition[] {
  return GAME_FORMATS.filter((f) => f.availableInLeagues);
}

/** Get all formats available for cups/tours */
export function getCupFormats(): GameFormatDefinition[] {
  return GAME_FORMATS.filter((f) => f.availableInCups);
}

/** Get all formats available for casual scorecard play */
export function getScorecardFormats(): GameFormatDefinition[] {
  return GAME_FORMATS.filter((f) => f.availableInScorecard);
}

/** Get individual (non-team) formats */
export function getIndividualFormats(): GameFormatDefinition[] {
  return GAME_FORMATS.filter((f) => f.playersPerTeam === 1);
}

/** Get team formats (2+ players per team) */
export function getTeamFormats(): GameFormatDefinition[] {
  return GAME_FORMATS.filter((f) => f.playersPerTeam > 1);
}

/** Get formats grouped by category for picker UI */
export function getFormatsGrouped(): {
  label: string;
  category: FormatCategory;
  formats: GameFormatDefinition[];
}[] {
  return [
    {
      label: "Individual",
      category: "individual",
      formats: getFormatsByCategory("individual"),
    },
    {
      label: "Two-Player Team",
      category: "two_player_team",
      formats: getFormatsByCategory("two_player_team"),
    },
    {
      label: "Four-Player Team",
      category: "four_player_team",
      formats: getFormatsByCategory("four_player_team"),
    },
  ];
}

// ============================================================================
// SCORING LOGIC
// ============================================================================

/** Hole-level score data for a single player */
export interface HoleScore {
  hole: number;
  par: number;
  strokes: number;
  handicapStrokes?: number; // strokes received on this hole based on HCI
}

/** Player score data for a round */
export interface PlayerRoundScore {
  playerId: string;
  displayName: string;
  handicap?: number;
  holes: HoleScore[];
}

/** Team round data */
export interface TeamRoundScore {
  teamId: string;
  teamName: string;
  players: PlayerRoundScore[];
}

/** Result of scoring a round for an individual */
export interface IndividualResult {
  playerId: string;
  displayName: string;
  grossScore: number;
  netScore: number;
  stablefordPoints?: number;
  holesWon?: number;
  holesLost?: number;
  holesHalved?: number;
  skinsWon?: number;
  matchResult?: string; // e.g. "3&2", "1UP", "AS"
}

/** Result of scoring a round for a team */
export interface TeamResult {
  teamId: string;
  teamName: string;
  teamScore: number;       // gross or points depending on format
  teamNetScore?: number;
  playerResults: IndividualResult[];
  holesWon?: number;
  holesLost?: number;
  holesHalved?: number;
  matchResult?: string;
}

// ── Stroke Play ───────────────────────────────────────────────────

/** Calculate gross and net totals for stroke play */
export function scoreStrokePlay(player: PlayerRoundScore): IndividualResult {
  let gross = 0;
  let net = 0;

  for (const hole of player.holes) {
    gross += hole.strokes;
    net += hole.strokes - (hole.handicapStrokes || 0);
  }

  return {
    playerId: player.playerId,
    displayName: player.displayName,
    grossScore: gross,
    netScore: net,
  };
}

// ── Stableford ────────────────────────────────────────────────────

/** Calculate Stableford points for a round */
export function scoreStableford(
  player: PlayerRoundScore,
  useNet: boolean = true
): IndividualResult {
  let totalPoints = 0;
  let gross = 0;
  let net = 0;

  for (const hole of player.holes) {
    gross += hole.strokes;
    const hcpStrokes = useNet ? (hole.handicapStrokes || 0) : 0;
    net += hole.strokes - hcpStrokes;
    totalPoints += getStablefordPoints(hole.strokes, hole.par, hcpStrokes);
  }

  return {
    playerId: player.playerId,
    displayName: player.displayName,
    grossScore: gross,
    netScore: net,
    stablefordPoints: totalPoints,
  };
}

// ── Match Play ────────────────────────────────────────────────────

/** Score a match play round between two players */
export function scoreMatchPlay(
  playerA: PlayerRoundScore,
  playerB: PlayerRoundScore,
  useNet: boolean = true
): { resultA: IndividualResult; resultB: IndividualResult } {
  let aUp = 0;
  let aWon = 0;
  let bWon = 0;
  let halved = 0;
  const totalHoles = Math.min(playerA.holes.length, playerB.holes.length);

  for (let i = 0; i < totalHoles; i++) {
    const holeA = playerA.holes[i];
    const holeB = playerB.holes[i];

    const netA = holeA.strokes - (useNet ? (holeA.handicapStrokes || 0) : 0);
    const netB = holeB.strokes - (useNet ? (holeB.handicapStrokes || 0) : 0);

    if (netA < netB) {
      aUp++;
      aWon++;
    } else if (netB < netA) {
      aUp--;
      bWon++;
    } else {
      halved++;
    }

    // Check for early match end (dormie + lead)
    const holesRemaining = totalHoles - (i + 1);
    if (Math.abs(aUp) > holesRemaining) break;
  }

  const holesPlayed = aWon + bWon + halved;
  const holesRemaining = totalHoles - holesPlayed;

  const formatMatchResult = (lead: number, remaining: number): string => {
    if (lead === 0) return "AS"; // All Square
    const absLead = Math.abs(lead);
    if (remaining === 0) return `${absLead}UP`;
    return `${absLead}&${remaining}`;
  };

  const grossA = playerA.holes.reduce((s, h) => s + h.strokes, 0);
  const grossB = playerB.holes.reduce((s, h) => s + h.strokes, 0);
  const netTotalA = playerA.holes.reduce((s, h) => s + h.strokes - (h.handicapStrokes || 0), 0);
  const netTotalB = playerB.holes.reduce((s, h) => s + h.strokes - (h.handicapStrokes || 0), 0);

  return {
    resultA: {
      playerId: playerA.playerId,
      displayName: playerA.displayName,
      grossScore: grossA,
      netScore: netTotalA,
      holesWon: aWon,
      holesLost: bWon,
      holesHalved: halved,
      matchResult: aUp >= 0
        ? formatMatchResult(aUp, holesRemaining)
        : formatMatchResult(-aUp, holesRemaining),
    },
    resultB: {
      playerId: playerB.playerId,
      displayName: playerB.displayName,
      grossScore: grossB,
      netScore: netTotalB,
      holesWon: bWon,
      holesLost: aWon,
      holesHalved: halved,
      matchResult: aUp <= 0
        ? formatMatchResult(-aUp, holesRemaining)
        : formatMatchResult(aUp, holesRemaining),
    },
  };
}

// ── Skins ─────────────────────────────────────────────────────────

/** Score a skins game among multiple players */
export function scoreSkins(
  players: PlayerRoundScore[],
  useNet: boolean = true
): IndividualResult[] {
  const totalHoles = players[0]?.holes.length || 0;
  const skinCounts: Record<string, number> = {};

  for (const p of players) {
    skinCounts[p.playerId] = 0;
  }

  let carryOver = 0;

  for (let i = 0; i < totalHoles; i++) {
    const scores = players.map((p) => {
      const hole = p.holes[i];
      const net = hole.strokes - (useNet ? (hole.handicapStrokes || 0) : 0);
      return { playerId: p.playerId, net };
    });

    scores.sort((a, b) => a.net - b.net);

    // Check for outright winner
    if (scores.length >= 2 && scores[0].net < scores[1].net) {
      skinCounts[scores[0].playerId] += 1 + carryOver;
      carryOver = 0;
    } else {
      carryOver++;
    }
  }

  // If skins carry over past the last hole, they go unclaimed
  // (some rulesets redistribute — configurable in the future)

  return players.map((p) => {
    const gross = p.holes.reduce((s, h) => s + h.strokes, 0);
    const net = p.holes.reduce((s, h) => s + h.strokes - (h.handicapStrokes || 0), 0);

    return {
      playerId: p.playerId,
      displayName: p.displayName,
      grossScore: gross,
      netScore: net,
      skinsWon: skinCounts[p.playerId],
    };
  });
}

// ── Team: Best Ball ───────────────────────────────────────────────

/** Score a best ball (better ball) team round */
export function scoreBestBall(
  team: TeamRoundScore,
  scoringMethod: "total_strokes" | "points" = "total_strokes",
  useNet: boolean = true
): TeamResult {
  const totalHoles = team.players[0]?.holes.length || 0;
  let teamScore = 0;
  let teamNetScore = 0;

  const playerResults = team.players.map((p) => scoreStrokePlay(p));

  for (let i = 0; i < totalHoles; i++) {
    if (scoringMethod === "points") {
      // Best Stableford points on this hole
      let bestPoints = 0;
      for (const p of team.players) {
        const hole = p.holes[i];
        const hcpStrokes = useNet ? (hole.handicapStrokes || 0) : 0;
        const pts = getStablefordPoints(hole.strokes, hole.par, hcpStrokes);
        if (pts > bestPoints) bestPoints = pts;
      }
      teamScore += bestPoints;
    } else {
      // Best gross and net strokes on this hole
      let bestGross = Infinity;
      let bestNet = Infinity;
      for (const p of team.players) {
        const hole = p.holes[i];
        if (hole.strokes < bestGross) bestGross = hole.strokes;
        const net = hole.strokes - (useNet ? (hole.handicapStrokes || 0) : 0);
        if (net < bestNet) bestNet = net;
      }
      teamScore += bestGross;
      teamNetScore += bestNet;
    }
  }

  return {
    teamId: team.teamId,
    teamName: team.teamName,
    teamScore,
    teamNetScore: scoringMethod === "total_strokes" ? teamNetScore : undefined,
    playerResults,
  };
}

// ── Team: Scramble ────────────────────────────────────────────────

/**
 * Score a scramble round.
 * In a scramble, there's only one score per hole for the team.
 * Pass the team scores as a single PlayerRoundScore representing the team.
 */
export function scoreScramble(
  teamScores: PlayerRoundScore,
  teamId: string,
  teamName: string
): TeamResult {
  const result = scoreStrokePlay(teamScores);

  return {
    teamId,
    teamName,
    teamScore: result.grossScore,
    teamNetScore: result.netScore,
    playerResults: [result],
  };
}

// ============================================================================
// HANDICAP STROKE DISTRIBUTION
// ============================================================================

/**
 * Distribute handicap strokes across holes based on hole difficulty index.
 * Each hole has a stroke index (1-18), where 1 = hardest hole.
 * A player with handicap 10 gets 1 extra stroke on the 10 hardest holes.
 * A player with handicap 20 gets 1 extra stroke on all 18 + 1 on the 2 hardest.
 */
export function distributeHandicapStrokes(
  handicap: number,
  holeStrokeIndexes: number[] // stroke index for each hole (1-18)
): number[] {
  const strokes = new Array(holeStrokeIndexes.length).fill(0);

  if (handicap <= 0) return strokes;

  // Full passes through all holes
  const fullPasses = Math.floor(handicap / holeStrokeIndexes.length);
  const remainder = handicap % holeStrokeIndexes.length;

  // Give full passes to all holes
  for (let i = 0; i < strokes.length; i++) {
    strokes[i] = fullPasses;
  }

  // Distribute remainder to hardest holes first
  // Create sorted indices by stroke index (ascending = hardest first)
  const sortedIndices = holeStrokeIndexes
    .map((si, idx) => ({ si, idx }))
    .sort((a, b) => a.si - b.si);

  for (let i = 0; i < remainder; i++) {
    strokes[sortedIndices[i].idx]++;
  }

  return strokes;
}

// ============================================================================
// WINNER DETERMINATION
// ============================================================================

/** Determine ranking for stroke-based formats (lower is better) */
export function rankByStrokes(
  results: IndividualResult[],
  useNet: boolean = false
): IndividualResult[] {
  return [...results].sort((a, b) => {
    const scoreA = useNet ? a.netScore : a.grossScore;
    const scoreB = useNet ? b.netScore : b.grossScore;
    return scoreA - scoreB;
  });
}

/** Determine ranking for Stableford (higher is better) */
export function rankByStableford(results: IndividualResult[]): IndividualResult[] {
  return [...results].sort(
    (a, b) => (b.stablefordPoints || 0) - (a.stablefordPoints || 0)
  );
}

/** Determine ranking for Skins (most skins wins) */
export function rankBySkins(results: IndividualResult[]): IndividualResult[] {
  return [...results].sort(
    (a, b) => (b.skinsWon || 0) - (a.skinsWon || 0)
  );
}

/** Determine ranking for team stroke formats (lower is better) */
export function rankTeamsByStrokes(
  results: TeamResult[],
  useNet: boolean = false
): TeamResult[] {
  return [...results].sort((a, b) => {
    const scoreA = useNet ? (a.teamNetScore || a.teamScore) : a.teamScore;
    const scoreB = useNet ? (b.teamNetScore || b.teamScore) : b.teamScore;
    return scoreA - scoreB;
  });
}

/** Determine ranking for team points formats (higher is better) */
export function rankTeamsByPoints(results: TeamResult[]): TeamResult[] {
  return [...results].sort((a, b) => b.teamScore - a.teamScore);
}

// ============================================================================
// FORMAT DISPLAY HELPERS
// ============================================================================

/** Get human-readable label for a format category */
export function getCategoryLabel(category: FormatCategory): string {
  switch (category) {
    case "individual":
      return "Individual";
    case "two_player_team":
      return "Two-Player Team";
    case "four_player_team":
      return "Four-Player Team";
  }
}

/** Get a short description of team size for display */
export function getTeamSizeLabel(format: GameFormatDefinition): string {
  if (format.playersPerTeam === 1) return "Individual";
  return `${format.playersPerTeam}-Player Team`;
}

/** Get scoring method display label */
export function getScoringLabel(format: GameFormatDefinition): string {
  switch (format.scoringMethod) {
    case "total_strokes":
      return "Total Strokes (Low Wins)";
    case "net_strokes":
      return "Net Strokes (Low Wins)";
    case "points":
      return "Points (High Wins)";
    case "holes_won":
      return format.id === "skins" ? "Skins Won" : "Holes Won";
    case "comparison":
      return "Hole-by-Hole Comparison";
  }
}

/** Check if a format requires opponent/team pairing */
export function requiresPairing(format: GameFormatDefinition): boolean {
  return format.teamsPerMatch !== null || format.playersPerTeam > 1;
}

/** Check if a format uses Stableford scoring */
export function isStableford(format: GameFormatDefinition): boolean {
  return format.scoringMethod === "points";
}

/** Check if a format is match play based */
export function isMatchPlay(format: GameFormatDefinition): boolean {
  return format.scoringMethod === "holes_won" && format.id !== "skins";
}