/**
 * Points Distribution - FedEx Cup Style
 * 
 * Calculates weekly points for league members based on their finish position.
 * Uses two distribution curves modeled after the PGA Tour FedExCup system:
 * 
 * - REGULAR: Based on standard PGA Tour event payouts (top-heavy, 1st = 100%)
 * - ELEVATED: Based on Signature Event payouts (flatter, more competitive)
 * 
 * Points scale to the league's configured `pointsPerWeek` value.
 * Elevated weeks multiply `pointsPerWeek` by the league's multiplier (default 2x),
 * then apply the Signature Event distribution curve.
 * 
 * Every player who posts a score receives at least 1 point.
 */

// Regular event ratios (normalized to 1st = 1.0)
// Based on: 500, 300, 190, 135, 110, 100, 90, 85, 80, 75, 65, 60, 55, 50, 47, 44, 41, 38, 36, 34
const REGULAR_RATIOS = [
  1.000,  // 1st  - 500
  0.600,  // 2nd  - 300
  0.380,  // 3rd  - 190
  0.270,  // 4th  - 135
  0.220,  // 5th  - 110
  0.200,  // 6th  - 100
  0.180,  // 7th  - 90
  0.170,  // 8th  - 85
  0.160,  // 9th  - 80
  0.150,  // 10th - 75
  0.130,  // 11th - 65
  0.120,  // 12th - 60
  0.110,  // 13th - 55
  0.100,  // 14th - 50
  0.094,  // 15th - 47
  0.088,  // 16th - 44
  0.082,  // 17th - 41
  0.076,  // 18th - 38
  0.072,  // 19th - 36
  0.068,  // 20th - 34
];

// Elevated/Signature event ratios (normalized to 1st = 1.0)
// Based on: 700, 400, 350, 325, 300, 275, 250, 225, 175, 150, 135, 125, 115, 105, 95, 85, 80, 75, 70, 65
const ELEVATED_RATIOS = [
  1.000,  // 1st  - 700
  0.571,  // 2nd  - 400
  0.500,  // 3rd  - 350
  0.464,  // 4th  - 325
  0.429,  // 5th  - 300
  0.393,  // 6th  - 275
  0.357,  // 7th  - 250
  0.321,  // 8th  - 225
  0.250,  // 9th  - 175
  0.214,  // 10th - 150
  0.193,  // 11th - 135
  0.179,  // 12th - 125
  0.164,  // 13th - 115
  0.150,  // 14th - 105
  0.136,  // 15th - 95
  0.121,  // 16th - 85
  0.114,  // 17th - 80
  0.107,  // 18th - 75
  0.100,  // 19th - 70
  0.093,  // 20th - 65
];

export interface PointsResult {
  placement: number;
  points: number;
}

/**
 * Calculate points for each placement in a weekly result.
 * 
 * @param pointsPerWeek - The league's configured points for 1st place (e.g. 100)
 * @param totalPlayers - Number of players who posted scores this week
 * @param isElevated - Whether this is an elevated week
 * @param multiplier - Elevated week multiplier (default 2)
 * @returns Array of { placement, points } sorted by placement
 */
export function calculateWeeklyPoints(
  pointsPerWeek: number,
  totalPlayers: number,
  isElevated: boolean,
  multiplier: number = 2
): PointsResult[] {
  if (totalPlayers <= 0) return [];

  const maxPoints = isElevated ? pointsPerWeek * multiplier : pointsPerWeek;
  const ratios = isElevated ? ELEVATED_RATIOS : REGULAR_RATIOS;

  const results: PointsResult[] = [];

  for (let i = 0; i < totalPlayers; i++) {
    let ratio: number;

    if (i < ratios.length) {
      // Use the defined ratio for this placement
      ratio = ratios[i];
    } else {
      // Beyond defined ratios: extrapolate with gentle decay
      // Ensures last place still gets meaningful points
      const lastDefinedRatio = ratios[ratios.length - 1];
      const remainingPlaces = totalPlayers - ratios.length;
      const placesBeyond = i - ratios.length + 1;

      // Minimum ratio is 2% (last place always gets something)
      const minRatio = 0.02;
      const decay = (lastDefinedRatio - minRatio) / (remainingPlaces + 1);
      ratio = Math.max(lastDefinedRatio - (decay * placesBeyond), minRatio);
    }

    // Round to nearest whole number, minimum 1 point
    const points = Math.max(Math.round(maxPoints * ratio), 1);
    results.push({ placement: i + 1, points });
  }

  return results;
}

/**
 * Get points for a specific placement.
 * Convenience wrapper when you only need one placement's points.
 */
export function getPointsForPlacement(
  placement: number,
  pointsPerWeek: number,
  totalPlayers: number,
  isElevated: boolean,
  multiplier: number = 2
): number {
  const results = calculateWeeklyPoints(pointsPerWeek, totalPlayers, isElevated, multiplier);
  const result = results.find((r) => r.placement === placement);
  return result?.points || 1;
}