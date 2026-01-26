/**
 * SwingThoughts Leagues - Data Model
 * 
 * Firestore Collections:
 * - leagues/{leagueId} - Main league documents
 * - leagues/{leagueId}/members/{userIdId} - League members subcollection
 * - leagues/{leagueId}/scores/{scoreId} - League scores subcollection
 * - leagues/{leagueId}/weeks/{weekNumber} - Weekly results (optional, could be computed)
 * - league_applications/{applicationId} - Host applications
 */

import { Timestamp } from "firebase/firestore";

/* ================================================================ */
/* ENUMS                                                            */
/* ================================================================ */

/**
 * League competition format
 */
export type LeagueFormat = "stroke" | "2v2";

/**
 * How scores are calculated
 * - "app_handicap": Uses SwingThoughts user handicap for net score
 * - "commissioner_handicap": Commissioner manually sets handicaps per player
 */
export type ScoringMethod = "app_handicap" | "commissioner_handicap";

/**
 * How points are distributed each week
 * - "position": Points awarded by finishing position (1st: 10, 2nd: 8, etc.)
 * - "top_three": Only top 3 get points (1st: 10, 2nd: 5, 3rd: 2)
 * - "custom": Commissioner defines custom point values
 */
export type PointsSystem = "position" | "top_three" | "custom";

/**
 * League status
 */
export type LeagueStatus = "draft" | "upcoming" | "active" | "completed" | "cancelled";

/**
 * Member role in the league
 */
export type MemberRole = "commissioner" | "member";

/**
 * Member status
 */
export type MemberStatus = "active" | "inactive" | "removed";

/**
 * League application status
 */
export type ApplicationStatus = "pending" | "approved" | "rejected";

/* ================================================================ */
/* MAIN LEAGUE DOCUMENT                                             */
/* ================================================================ */

/**
 * Main league document - stored in leagues/{leagueId}
 */
export interface League {
  id: string;
  
  // Basic Info
  name: string;
  description?: string;
  logoUrl?: string;
  
  // Location (for discovery)
  regionKey: string;              // e.g., "US-NC-Davidson"
  location?: {
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
  };
  
  // Commissioner
  commissionerId: string;         // User ID of the commissioner
  commissionerName: string;       // Denormalized for display
  commissionerAvatar?: string;
  
  // Season Configuration
  seasonName?: string;            // e.g., "Spring 2026"
  seasonNumber?: number;          // For recurring leagues
  startDate: Timestamp;
  endDate: Timestamp;
  totalWeeks: number;             // 8, 12, 16, or custom
  currentWeek: number;            // 0 = not started, 1-N = active week
  
  // Format & Scoring
  format: LeagueFormat;
  scoringMethod: ScoringMethod;
  pointsSystem: PointsSystem;
  customPoints?: number[];        // If pointsSystem is "custom", array of points by position
  
  // Tiebreaker: "gross_score" | "head_to_head" | "recent_form"
  tiebreaker: "gross_score" | "head_to_head" | "recent_form";
  
  // Course Restrictions
  restrictCourses: boolean;       // If true, only specific courses count
  allowedCourseIds?: number[];    // Course IDs that count for this league
  allowedCourseNames?: string[];  // Denormalized for display
  
  // Elevated Matches
  hasElevatedMatches: boolean;
  elevatedWeeks?: number[];       // Which weeks are elevated
  elevatedMultiplier?: number;    // e.g., 1.5 or 2
  
  // Settings
  allowCasualScores: boolean;     // Can members post non-league scores to the league?
  weeklyDeadline?: string;        // e.g., "sunday_midnight" or specific day/time
  missedWeekPenalty: "zero_points" | "average_minus_two" | "none";
  
  // Privacy (for future)
  isPublic: boolean;              // Always true for MVP
  joinCode?: string;              // For private leagues (future)
  
  // Stats (denormalized for quick access)
  memberCount: number;
  maxMembers?: number;            // Optional cap
  
  // Status
  status: LeagueStatus;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/* ================================================================ */
/* LEAGUE MEMBER                                                    */
/* ================================================================ */

/**
 * League member - stored in leagues/{leagueId}/members/{userIdId}
 * Document ID is the user's UID for easy lookup
 */
export interface LeagueMember {
  userId: string;                  // Same as document ID
  
  // User Info (denormalized)
  displayName: string;
  avatar?: string;
  userType?: string;
  
  // League-specific
  role: MemberRole;
  status: MemberStatus;
  
  // Handicap (if commissioner-set)
  leagueHandicap?: number;        // Only used if scoringMethod is "commissioner_handicap"
  
  // Team (for 2v2 format)
  teamId?: string;
  teamName?: string;
  partnerId?: string;             // Partner's user ID in 2v2
  
  // Season Stats
  weeklyResults: WeeklyResult[];  // Array of results by week
  totalPoints: number;
  wins: number;
  losses: number;
  ties: number;
  roundsPlayed: number;
  averageGross?: number;
  averageNet?: number;
  bestGross?: number;
  bestNet?: number;
  
  // Standings
  currentRank?: number;           // Current position in standings
  previousRank?: number;          // Last week's position (for trend)
  
  // Metadata
  joinedAt: Timestamp;
  lastActiveAt?: Timestamp;
}

/**
 * Weekly result for a member
 */
export interface WeeklyResult {
  week: number;
  scoreId?: string;               // Reference to the score document
  grossScore?: number;
  netScore?: number;
  courseId?: number;
  courseName?: string;
  points: number;
  position?: number;              // Finishing position that week
  isElevated?: boolean;           // Was this an elevated week?
  submittedAt?: Timestamp;
}

/* ================================================================ */
/* LEAGUE SCORE                                                     */
/* ================================================================ */

/**
 * League score - stored in leagues/{leagueId}/scores/{scoreId}
 * Links to the main scores collection
 */
export interface LeagueScore {
  id: string;
  
  // User
  userIdId: string;
  displayName: string;
  avatar?: string;
  
  // Week
  week: number;
  isElevated: boolean;
  
  // Score Data
  mainScoreId?: string;           // Reference to scores/{scoreId} if linked
  courseId: number;
  courseName: string;
  grossScore: number;
  netScore: number;
  par: number;
  
  // Handicap used
  handicapUsed: number;           // Either app handicap or commissioner-set
  
  // Points (calculated after week closes)
  points?: number;
  position?: number;
  
  // For 2v2
  teamId?: string;
  partnerId?: string;
  partnerScoreId?: string;
  combinedScore?: number;         // Team combined score
  
  // Verification (optional)
  isVerified?: boolean;
  verifiedBy?: string;
  
  // Metadata
  submittedAt: Timestamp;
  processedAt?: Timestamp;        // When points were calculated
}

/* ================================================================ */
/* LEAGUE APPLICATION (HOST)                                        */
/* ================================================================ */

/**
 * Application to become a league host
 * Stored in league_applications/{applicationId}
 */
export interface LeagueApplication {
  id: string;
  
  // Applicant
  userIdId: string;
  displayName: string;
  avatar?: string;
  userType: string;
  email?: string;
  
  // Proposed League Details
  proposedName: string;
  proposedDescription?: string;
  proposedRegion: string;
  proposedFormat: LeagueFormat;
  proposedStartDate?: Timestamp;
  
  // Experience
  hasHostedBefore: boolean;
  hostingExperience?: string;     // Free text description
  expectedMemberCount?: number;
  
  // Status
  status: ApplicationStatus;
  reviewedBy?: string;            // Admin who reviewed
  reviewedAt?: Timestamp;
  rejectionReason?: string;
  
  // Metadata
  submittedAt: Timestamp;
}

/* ================================================================ */
/* STANDINGS & LEADERBOARD                                          */
/* ================================================================ */

/**
 * Computed standings entry (for display)
 */
export interface StandingsEntry {
  rank: number;
  previousRank?: number;
  trend: "up" | "down" | "same" | "new";
  
  userIdId: string;
  displayName: string;
  avatar?: string;
  
  // Stats
  totalPoints: number;
  roundsPlayed: number;
  wins: number;
  losses: number;
  
  // For display
  lastScore?: {
    gross: number;
    net: number;
    courseName: string;
  };
}

/**
 * Weekly standings (single week results)
 */
export interface WeeklyStandings {
  week: number;
  isElevated: boolean;
  deadline?: Timestamp;
  status: "upcoming" | "active" | "closed";
  entries: WeeklyStandingsEntry[];
}

export interface WeeklyStandingsEntry {
  position: number;
  userIdId: string;
  displayName: string;
  avatar?: string;
  grossScore?: number;
  netScore?: number;
  courseName?: string;
  points: number;
  hasSubmitted: boolean;
}

/* ================================================================ */
/* SCHEDULE                                                         */
/* ================================================================ */

/**
 * Schedule item for display
 */
export interface ScheduleItem {
  week: number;
  startDate: Timestamp;
  endDate: Timestamp;              // Deadline
  isElevated: boolean;
  status: "upcoming" | "active" | "closed";
  
  // For 2v2 matchups
  matchups?: Matchup[];
  
  // User's result (if closed)
  userResult?: {
    grossScore: number;
    netScore: number;
    points: number;
    position: number;
  };
}

/**
 * 2v2 Matchup
 */
export interface Matchup {
  team1: {
    teamId: string;
    teamName: string;
    player1Id: string;
    player1Name: string;
    player2Id: string;
    player2Name: string;
    combinedScore?: number;
    points?: number;
  };
  team2: {
    teamId: string;
    teamName: string;
    player1Id: string;
    player1Name: string;
    player2Id: string;
    player2Name: string;
    combinedScore?: number;
    points?: number;
  };
  winner?: "team1" | "team2" | "tie";
}

/* ================================================================ */
/* POINTS CONFIGURATION                                             */
/* ================================================================ */

/**
 * Default points by position (for "position" system)
 * Can be overridden by commissioner
 */
export const DEFAULT_POSITION_POINTS: Record<number, number> = {
  1: 10,
  2: 8,
  3: 6,
  4: 5,
  5: 4,
  6: 3,
  7: 2,
  8: 1,
  // 9+ get 0 points
};

/**
 * Top 3 only points
 */
export const TOP_THREE_POINTS: Record<number, number> = {
  1: 10,
  2: 5,
  3: 2,
};

/**
 * Get points for a position
 */
export function getPointsForPosition(
  position: number,
  system: PointsSystem,
  customPoints?: number[]
): number {
  if (system === "custom" && customPoints) {
    return customPoints[position - 1] || 0;
  }
  
  if (system === "top_three") {
    return TOP_THREE_POINTS[position] || 0;
  }
  
  // Default position-based
  return DEFAULT_POSITION_POINTS[position] || 0;
}

/* ================================================================ */
/* HELPER TYPES                                                     */
/* ================================================================ */

/**
 * League card for list display
 */
export interface LeagueCard {
  id: string;
  name: string;
  logoUrl?: string;
  commissionerName: string;
  location?: {
    city: string;
    state: string;
  };
  format: LeagueFormat;
  memberCount: number;
  status: LeagueStatus;
  currentWeek: number;
  totalWeeks: number;
  userRank?: number;              // Current user's rank (if member)
  userPoints?: number;            // Current user's points (if member)
}

/**
 * League invite
 */
export interface LeagueInvite {
  leagueId: string;
  leagueName: string;
  invitedBy: string;
  invitedByName: string;
  invitedAt: Timestamp;
}

/**
 * Create league form data
 */
export interface CreateLeagueFormData {
  // Step 1: Basic Info
  name: string;
  description?: string;
  logoUrl?: string;
  
  // Step 2: Season
  seasonName?: string;
  startDate: Date;
  totalWeeks: number;
  
  // Step 3: Format
  format: LeagueFormat;
  scoringMethod: ScoringMethod;
  
  // Step 4: Points
  pointsSystem: PointsSystem;
  customPoints?: number[];
  hasElevatedMatches: boolean;
  elevatedWeeks?: number[];
  elevatedMultiplier?: number;
  
  // Step 5: Courses
  restrictCourses: boolean;
  allowedCourseIds?: number[];
  
  // Step 6: Settings
  allowCasualScores: boolean;
  weeklyDeadline?: string;
  missedWeekPenalty: "zero_points" | "average_minus_two" | "none";
}