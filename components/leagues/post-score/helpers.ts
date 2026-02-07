/**
 * Helper functions for League Post Score
 */

import { HoleInfo, League, TeeOption } from "./types";

/**
 * Get the number of holes for a league (supports both field names)
 */
export const getHolesCount = (leagueData?: League | null): number => {
  if (!leagueData) return 18;
  return leagueData.holes ?? leagueData.holesPerRound ?? 18;
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in miles
 */
export const haversine = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 3958.8; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

/**
 * Calculate Course Handicap using USGA formula:
 * Course Handicap = Handicap Index × (Slope Rating / 113)
 */
export const calculateCourseHandicap = (
  handicapIndex: number,
  slopeRating: number,
  holesCount: number = 18
): number => {
  let courseHandicap = handicapIndex * (slopeRating / 113);
  if (holesCount <= 9) {
    courseHandicap = courseHandicap / 2;
  }
  return Math.round(courseHandicap);
};

/**
 * Generate default holes when course data is not available
 */
export const generateDefaultHoles = (numHoles: number): HoleInfo[] => {
  const holes: HoleInfo[] = [];
  for (let i = 1; i <= numHoles; i++) {
    holes.push({
      holeNumber: i,
      par: 4,
      yardage: 400,
      handicap: i, // Default stroke index 1-18
    });
  }
  return holes;
};

/**
 * Get a color for tee based on tee name
 */
export const getTeeColor = (teeName: string): string => {
  const name = teeName.toLowerCase();
  if (name.includes("black")) return "#1a1a1a";
  if (name.includes("blue")) return "#1976D2";
  if (name.includes("white")) return "#FAFAFA";
  if (name.includes("gold")) return "#FFD700";
  if (name.includes("yellow")) return "#FFEB3B";
  if (name.includes("red")) return "#D32F2F";
  if (name.includes("green")) return "#388E3C";
  return "#9E9E9E"; // Default gray
};

/**
 * Extract and combine tees from course data
 * Returns all tees sorted by yardage (longest first)
 */
export const extractTees = (tees?: {
  male?: TeeOption[];
  female?: TeeOption[];
}): TeeOption[] => {
  const allTees: TeeOption[] = [];

  if (tees?.male) {
    for (const tee of tees.male) {
      allTees.push({ ...tee, source: "male" });
    }
  }

  if (tees?.female) {
    for (const tee of tees.female) {
      // Avoid duplicates (same tee name)
      const exists = allTees.some((t) => t.tee_name === tee.tee_name);
      if (!exists) {
        allTees.push({ ...tee, source: "female" });
      }
    }
  }

  // Sort by yardage descending (longest first)
  allTees.sort((a, b) => (b.total_yards || 0) - (a.total_yards || 0));

  return allTees;
};

/* ================================================================ */
/* SCORE CALCULATIONS                                               */
/* ================================================================ */

/**
 * Calculate front 9 score
 */
export const getFront9Score = (scores: (number | null)[]): number | null => {
  const front9 = scores.slice(0, 9);
  if (front9.some((s) => s === null)) return null;
  return front9.reduce((sum: number, s) => sum + (s || 0), 0);
};

/**
 * Calculate back 9 score
 */
export const getBack9Score = (
  scores: (number | null)[],
  holesCount: number
): number | null => {
  if (holesCount !== 18) return null;
  const back9 = scores.slice(9, 18);
  if (back9.some((s) => s === null)) return null;
  return back9.reduce((sum: number, s) => sum + (s || 0), 0);
};

/**
 * Calculate total score
 */
export const getTotalScore = (scores: (number | null)[]): number | null => {
  if (scores.some((s) => s === null)) return null;
  return scores.reduce((sum: number, s) => sum + (s || 0), 0);
};

/**
 * Calculate front 9 par
 */
export const getFront9Par = (holes: HoleInfo[]): number => {
  return holes.slice(0, 9).reduce((sum: number, h) => sum + h.par, 0);
};

/**
 * Calculate back 9 par
 */
export const getBack9Par = (holes: HoleInfo[], holesCount: number): number => {
  if (holesCount !== 18) return 0;
  return holes.slice(9, 18).reduce((sum: number, h) => sum + h.par, 0);
};

/**
 * Calculate total par
 */
export const getTotalPar = (holes: HoleInfo[], holesCount: number): number => {
  return holes.slice(0, holesCount).reduce((sum: number, h) => sum + h.par, 0);
};

/**
 * Calculate front 9 yardage
 */
export const getFront9Yardage = (holes: HoleInfo[]): number => {
  return holes.slice(0, 9).reduce((sum: number, h) => sum + h.yardage, 0);
};

/**
 * Calculate back 9 yardage
 */
export const getBack9Yardage = (holes: HoleInfo[], holesCount: number): number => {
  if (holesCount !== 18) return 0;
  return holes.slice(9, 18).reduce((sum: number, h) => sum + h.yardage, 0);
};

/**
 * Calculate total yardage
 */
export const getTotalYardage = (holes: HoleInfo[], holesCount: number): number => {
  return holes.slice(0, holesCount).reduce((sum: number, h) => sum + h.yardage, 0);
};

/* ================================================================ */
/* ADJUSTED SCORE (PER-HOLE NET) CALCULATIONS                       */
/* ================================================================ */

/**
 * Determine how many handicap strokes a player gets on a given hole.
 *
 * For an 18-hole round with courseHandicap = 20:
 *   - Every hole gets at least 1 stroke (18 strokes used)
 *   - The remaining 2 strokes go to the holes with the LOWEST stroke index (hardest)
 *   - So stroke index 1 and 2 each get an extra stroke (2 total)
 *
 * For a 9-hole round, stroke indexes are typically 1-9 and courseHandicap is halved.
 */
export const getStrokesForHole = (
  holeStrokeIndex: number | undefined,
  courseHandicap: number,
  holesCount: number
): number => {
  if (!holeStrokeIndex || holeStrokeIndex <= 0) return 0;
  if (courseHandicap <= 0) return 0;

  // For 9-hole rounds, stroke index ranges 1-9
  const maxIndex = holesCount === 9 ? 9 : 18;

  // How many full "passes" through all holes
  const fullPasses = Math.floor(courseHandicap / maxIndex);
  const remainder = courseHandicap % maxIndex;

  // Each hole gets fullPasses strokes, plus 1 more if its index <= remainder
  let strokes = fullPasses;
  if (holeStrokeIndex <= remainder) {
    strokes += 1;
  }

  return strokes;
};

/**
 * Calculate adjusted (net) score for a single hole
 */
export const getAdjustedScore = (
  grossScore: number | null,
  holeStrokeIndex: number | undefined,
  courseHandicap: number,
  holesCount: number
): number | null => {
  if (grossScore === null) return null;
  const strokes = getStrokesForHole(holeStrokeIndex, courseHandicap, holesCount);
  return grossScore - strokes;
};

/**
 * Calculate all adjusted scores for the round
 */
export const calculateAllAdjustedScores = (
  scores: (number | null)[],
  holes: HoleInfo[],
  courseHandicap: number,
  holesCount: number
): (number | null)[] => {
  return scores.map((score, idx) => {
    if (score === null) return null;
    const strokes = getStrokesForHole(holes[idx]?.handicap, courseHandicap, holesCount);
    return score - strokes;
  });
};

/**
 * Get front 9 adjusted score total
 */
export const getFront9AdjScore = (adjScores: (number | null)[]): number | null => {
  const front9 = adjScores.slice(0, 9);
  if (front9.some((s) => s === null)) return null;
  return front9.reduce((sum: number, s) => sum + (s || 0), 0);
};

/**
 * Get back 9 adjusted score total
 */
export const getBack9AdjScore = (
  adjScores: (number | null)[],
  holesCount: number
): number | null => {
  if (holesCount !== 18) return null;
  const back9 = adjScores.slice(9, 18);
  if (back9.some((s) => s === null)) return null;
  return back9.reduce((sum: number, s) => sum + (s || 0), 0);
};

/**
 * Get total adjusted score
 */
export const getTotalAdjScore = (adjScores: (number | null)[]): number | null => {
  if (adjScores.some((s) => s === null)) return null;
  return adjScores.reduce((sum: number, s) => sum + (s || 0), 0);
};

/* ================================================================ */
/* STAT CALCULATIONS (FIR / GIR / PNL)                              */
/* ================================================================ */

/**
 * Count fairways hit out of possible (excludes par 3s)
 */
export const countFairways = (
  fir: (boolean | null)[],
  holes: HoleInfo[],
  holesCount: number
): { hit: number; possible: number } => {
  let hit = 0;
  let possible = 0;
  for (let i = 0; i < holesCount; i++) {
    // Par 3s don't have fairways
    if (holes[i]?.par <= 3) continue;
    if (fir[i] !== null) {
      possible++;
      if (fir[i] === true) hit++;
    }
  }
  return { hit, possible };
};

/**
 * Count greens in regulation
 */
export const countGreens = (
  gir: (boolean | null)[],
  holesCount: number
): { hit: number; possible: number } => {
  let hit = 0;
  let possible = 0;
  for (let i = 0; i < holesCount; i++) {
    if (gir[i] !== null) {
      possible++;
      if (gir[i] === true) hit++;
    }
  }
  return { hit, possible };
};

/**
 * Count total penalties
 */
export const countPenalties = (
  pnl: (number | null)[],
  holesCount: number
): number => {
  let total = 0;
  for (let i = 0; i < holesCount; i++) {
    if (pnl[i] !== null && pnl[i]! > 0) {
      total += pnl[i]!;
    }
  }
  return total;
};

/**
 * Sum stats for a 9-hole slice
 */
export const getStatSliceCount = (
  arr: (boolean | null)[],
  start: number,
  end: number
): number => {
  let count = 0;
  for (let i = start; i < end; i++) {
    if (arr[i] === true) count++;
  }
  return count;
};

export const getPnlSliceCount = (
  arr: (number | null)[],
  start: number,
  end: number
): number => {
  let count = 0;
  for (let i = start; i < end; i++) {
    if (arr[i] !== null && arr[i]! > 0) count += arr[i]!;
  }
  return count;
};