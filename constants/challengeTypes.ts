/**
 * Challenge Types, Constants & Badge Configuration
 *
 * Shared definitions for the challenges system.
 * Used by: Challenges tab, Challenge detail screen, BadgeRow, seed script, Cloud Functions
 */

// ============================================================================
// HCI BRACKETS
// ============================================================================

export type HCIBracket = "elite" | "low" | "mid" | "high" | "beginner";

export const HCI_BRACKETS: { key: HCIBracket; label: string; min: number; max: number }[] = [
  { key: "elite", label: "Elite", min: 0, max: 5 },
  { key: "low", label: "Low", min: 6, max: 12 },
  { key: "mid", label: "Mid", min: 13, max: 20 },
  { key: "high", label: "High", min: 21, max: 30 },
  { key: "beginner", label: "Beginner", min: 31, max: 99 },
];

export function getHCIBracket(hci: number): HCIBracket {
  if (hci <= 5) return "elite";
  if (hci <= 12) return "low";
  if (hci <= 20) return "mid";
  if (hci <= 30) return "high";
  return "beginner";
}

// ============================================================================
// CHALLENGE TYPES
// ============================================================================

export type ChallengeType =
  | "par3"
  | "fir"
  | "gir"
  | "birdie_streak"
  | "iron_player"
  | "dtp"
  | "ace";

export interface ChallengeThresholds {
  elite: number;
  low: number;
  mid: number;
  high: number;
  beginner: number;
}

export interface ChallengeDefinition {
  id: string;
  type: ChallengeType;
  name: string;
  description: string;
  shortDescription: string;
  minSample: number;
  minSampleUnit: string; // "par 3 holes" | "rounds" | "round" | "consecutive rounds" | "pin" | "verified ace"
  isConsecutive: boolean;
  hasHCIScaling: boolean;
  thresholds: ChallengeThresholds;
  thresholdLabel: string; // "Avg ≤" | "FIR% ≥" | "GIR% ≥" etc.
  thresholdUnit: string; // "" | "%" | " consecutive" | "ft" etc.
  // Badge visuals
  badge: {
    iconType: "svg"; // all use custom SVG
    bgColor: string;
    iconColor: string;
  };
}

// ============================================================================
// CHALLENGE DEFINITIONS
// ============================================================================

export const CHALLENGES: ChallengeDefinition[] = [
  {
    id: "par3",
    type: "par3",
    name: "Par 3 Champion",
    description:
      "Prove your short game by averaging under your target score across 50 par 3 holes. Every par 3 you play counts toward your progress.",
    shortDescription: "Average under target on par 3 holes",
    minSample: 50,
    minSampleUnit: "par 3 holes",
    isConsecutive: false,
    hasHCIScaling: true,
    thresholds: { elite: 3.0, low: 3.3, mid: 3.5, high: 3.8, beginner: 4.0 },
    thresholdLabel: "Avg ≤",
    thresholdUnit: "",
    badge: { iconType: "svg", bgColor: "#0D5C3A", iconColor: "#FFF" },
  },
  {
    id: "fir",
    type: "fir",
    name: "Fairway Finder",
    description:
      "Keep it in the short grass. Maintain your target FIR% across 10 qualifying rounds. Only rounds where you track fairways count.",
    shortDescription: "Hit fairways consistently",
    minSample: 10,
    minSampleUnit: "rounds",
    isConsecutive: false,
    hasHCIScaling: true,
    thresholds: { elite: 70, low: 60, mid: 50, high: 40, beginner: 30 },
    thresholdLabel: "FIR% ≥",
    thresholdUnit: "%",
    badge: { iconType: "svg", bgColor: "#4CAF50", iconColor: "#FFF" },
  },
  {
    id: "gir",
    type: "gir",
    name: "GIR Master",
    description:
      "Hit more greens in regulation. Maintain your target GIR% across 10 qualifying rounds. Only rounds where you track greens count.",
    shortDescription: "Hit greens in regulation consistently",
    minSample: 10,
    minSampleUnit: "rounds",
    isConsecutive: false,
    hasHCIScaling: true,
    thresholds: { elite: 65, low: 55, mid: 45, high: 35, beginner: 25 },
    thresholdLabel: "GIR% ≥",
    thresholdUnit: "%",
    badge: { iconType: "svg", bgColor: "#1B5E20", iconColor: "#FFF" },
  },
  {
    id: "birdie_streak",
    type: "birdie_streak",
    name: "Birdie Streak",
    description:
      "Catch fire on the course. Make consecutive birdies (or better) in a single round. One hot streak is all it takes.",
    shortDescription: "Consecutive birdies in one round",
    minSample: 1,
    minSampleUnit: "round",
    isConsecutive: false,
    hasHCIScaling: true,
    thresholds: { elite: 4, low: 3, mid: 3, high: 2, beginner: 2 },
    thresholdLabel: "Streak ≥",
    thresholdUnit: " consecutive",
    badge: { iconType: "svg", bgColor: "#F57C00", iconColor: "#FFF" },
  },
  {
    id: "iron_player",
    type: "iron_player",
    name: "Iron Player",
    description:
      "Consistency is king. Break your target score in 5 consecutive 18-hole rounds. One bad round resets the counter.",
    shortDescription: "Break target score 5 rounds in a row",
    minSample: 5,
    minSampleUnit: "consecutive rounds",
    isConsecutive: true,
    hasHCIScaling: true,
    thresholds: { elite: 75, low: 80, mid: 90, high: 100, beginner: 110 },
    thresholdLabel: "Break",
    thresholdUnit: "",
    badge: { iconType: "svg", bgColor: "#333333", iconColor: "#FFD700" },
  },
  {
    id: "dtp",
    type: "dtp",
    name: "Closest to Pin",
    description:
      "A living challenge. Claim the pin on any course's designated par 3 by recording the closest distance-to-pin. But watch out — other golfers can take it from you.",
    shortDescription: "Hold the closest DTP on any course",
    minSample: 1,
    minSampleUnit: "pin",
    isConsecutive: false,
    hasHCIScaling: false,
    thresholds: { elite: 0, low: 0, mid: 0, high: 0, beginner: 0 }, // Not threshold-based
    thresholdLabel: "Hold ≥ 1",
    thresholdUnit: " pin",
    badge: { iconType: "svg", bgColor: "#D32F2F", iconColor: "#FFF" },
  },
  {
    id: "ace",
    type: "ace",
    name: "Ace Hunter",
    description:
      "The rarest badge in SwingThoughts. Record and verify a hole-in-one. There are no shortcuts.",
    shortDescription: "Verified hole-in-one",
    minSample: 1,
    minSampleUnit: "verified ace",
    isConsecutive: false,
    hasHCIScaling: false,
    thresholds: { elite: 1, low: 1, mid: 1, high: 1, beginner: 1 },
    thresholdLabel: "",
    thresholdUnit: "",
    badge: { iconType: "svg", bgColor: "#E8B800", iconColor: "#FFF" },
  },
];

// ============================================================================
// CUMULATIVE TIERS
// ============================================================================

export interface CumulativeTier {
  id: string;
  name: string;
  requiredBadges: number;
  badge: {
    bgColor: string;
    iconColor: string;
  };
}

export const CUMULATIVE_TIERS: CumulativeTier[] = [
  {
    id: "tier_amateur",
    name: "The Amateur",
    requiredBadges: 3,
    badge: { bgColor: "#CD7F32", iconColor: "#FFF" },
  },
  {
    id: "tier_next_tour",
    name: "The Next Tour Player",
    requiredBadges: 5,
    badge: { bgColor: "#8A9BAE", iconColor: "#FFF" },
  },
  {
    id: "tier_tour",
    name: "The Tour Player",
    requiredBadges: 7,
    badge: { bgColor: "#C5A55A", iconColor: "#FFF" },
  },
];

// ============================================================================
// PARTICIPANT PROGRESS
// ============================================================================

export interface ChallengeParticipant {
  registeredAt: any; // Timestamp
  hciBracket: HCIBracket;
  hciAtRegistration: number;
  targetThreshold: number;
  earned: boolean;
  earnedAt?: any; // Timestamp

  // Par 3 Champion
  totalPar3Holes?: number;
  totalPar3Score?: number;
  currentAverage?: number;

  // Fairway Finder
  qualifyingRounds?: number;
  totalFairwaysHit?: number;
  totalFairwaysPossible?: number;
  currentPercentage?: number;

  // GIR Master
  // (reuses qualifyingRounds)
  totalGreensHit?: number;
  totalGreensPossible?: number;
  // (reuses currentPercentage)

  // Birdie Streak
  bestStreak?: number;

  // Iron Player
  consecutiveCount?: number;
  targetScore?: number;

  // DTP
  pinsHeld?: number;
  coursesWithPins?: string[];

  // Ace Hunter
  verified?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

export function getChallengeById(id: string): ChallengeDefinition | undefined {
  return CHALLENGES.find((c) => c.id === id);
}

export function getThresholdForBracket(
  challenge: ChallengeDefinition,
  bracket: HCIBracket
): number {
  return challenge.thresholds[bracket];
}

export function getThresholdDisplay(
  challenge: ChallengeDefinition,
  bracket: HCIBracket
): string {
  if (!challenge.hasHCIScaling) {
    if (challenge.type === "dtp") return "Hold ≥ 1 pin";
    if (challenge.type === "ace") return "1 verified hole-in-one";
    return "";
  }

  const value = challenge.thresholds[bracket];

  switch (challenge.type) {
    case "par3":
      return `Avg ≤ ${value}`;
    case "fir":
      return `FIR ≥ ${value}%`;
    case "gir":
      return `GIR ≥ ${value}%`;
    case "birdie_streak":
      return `${value} consecutive birdies`;
    case "iron_player":
      return `Break ${value} in 5 consecutive rounds`;
    default:
      return `${value}`;
  }
}

/**
 * Count currently active (non-DTP) earned badges + DTP if held
 * Used for cumulative tier progression toward NEXT tier
 */
export function countActiveBadges(
  earnedBadges: string[],
  dtpPinsHeld: number
): number {
  let count = 0;
  for (const badge of earnedBadges) {
    // Skip cumulative tiers
    if (badge.startsWith("tier_")) continue;
    // DTP only counts if pins held > 0
    if (badge === "dtp") {
      if (dtpPinsHeld > 0) count++;
      continue;
    }
    count++;
  }
  return count;
}

/**
 * Check which cumulative tiers should be earned
 * Returns array of newly earned tier IDs
 */
export function checkCumulativeTiers(
  activeBadgeCount: number,
  alreadyEarnedTiers: string[]
): string[] {
  const newTiers: string[] = [];
  for (const tier of CUMULATIVE_TIERS) {
    if (
      activeBadgeCount >= tier.requiredBadges &&
      !alreadyEarnedTiers.includes(tier.id)
    ) {
      newTiers.push(tier.id);
    }
  }
  return newTiers;
}