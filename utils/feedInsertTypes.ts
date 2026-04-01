/**
 * Feed Insert Types
 *
 * Defines data shapes for all feed insert cards:
 *   - Discovery carousels (horizontal scroll, multi-item)
 *   - Activity carousel ("From the Field" — swipeable cards)
 *   - Hole-in-One standalone card
 *   - Live on Course insert (slot 0, active rounds nearby)
 *
 * These get slotted between regular FeedPost items in the clubhouse.
 */

// ============================================================================
// LIVE ON COURSE
// ============================================================================

/** A single player card in the Live on Course insert. */
export interface LiveOnCoursePlayer {
  userId: string;
  displayName: string;
  avatar?: string | null;
  courseName: string;
  currentHole: number;
  /** scoreToPar from liveScores[markerId]. Positive = over, negative = under. */
  scoreToPar: number;
  roundId: string;
}

/**
 * Live on Course insert — occupies slot 0 in the feed.
 * Omitted entirely (not inserted) when players array is empty.
 * Never user-dismissable — no dismissKey.
 */
export interface LiveOnCourseInsert {
  type: "live_on_course";
  players: LiveOnCoursePlayer[];
}

// ============================================================================
// DISCOVERY CAROUSEL TYPES
// ============================================================================

export interface DiscoveryChallengeItem {
  id: string;
  name: string;
  earnedCount: number;
}

export interface DiscoveryLeagueItem {
  id: string;
  name: string;
  avatar?: string | null;
  format: string;
  holes: number;
  frequency: string;
  memberCount: number;
}

export interface DiscoveryCourseItem {
  courseId: number | string;
  name: string;
  avatar?: string | null;
  distance?: string;
  roundsPosted: number;
}

export interface DiscoveryPartnerItem {
  userId: string;
  displayName: string;
  avatar?: string | null;
  context: string;
}

export interface DiscoveryDTPItem {
  courseId: string;
  courseName: string;
  designatedHole?: number;
  currentDistance?: number;
  currentHolderName?: string;
  status: "unclaimed" | "beatable";
}

export interface DiscoveryRivalryNudgeItem {
  id: string;
  rivalryId: string;
  rivalUserId: string;
  rivalName: string;
  rivalAvatar?: string | null;
  message: string;
  emoji: string;
}

/** A golfer who recently scored at one of the user's player courses. */
export interface DiscoveryCoursePlayerItem {
  userId: string;
  displayName: string;
  avatar?: string | null;
  courseName: string;   // which of the user's courses they scored at
  netScore: number;
  grossScore: number;
}

/**
 * A single discovery carousel insert in the feed.
 */
export interface DiscoveryInsert {
  type: "discovery";
  subtype:
    | "challenges"
    | "leagues"
    | "courses"
    | "partners"
    | "dtp_pins"
    | "rivalry_nudges"
    | "course_players";
  title: string;
  items:
    | DiscoveryChallengeItem[]
    | DiscoveryLeagueItem[]
    | DiscoveryCourseItem[]
    | DiscoveryPartnerItem[]
    | DiscoveryDTPItem[]
    | DiscoveryRivalryNudgeItem[]
    | DiscoveryCoursePlayerItem[];
  dismissKey: string;
}

// ============================================================================
// ACTIVITY CARD TYPES
// ============================================================================

interface BaseActivity {
  id: string;
  timestamp: number;
}

export interface ActivityBadgeEarned extends BaseActivity {
  activityType: "badge_earned";
  userId: string;
  displayName: string;
  avatar?: string | null;
  badgeId: string;
  badgeName: string;
}

export interface ActivityDTPClaimed extends BaseActivity {
  activityType: "dtp_claimed";
  userId: string;
  displayName: string;
  avatar?: string | null;
  courseName: string;
  hole: number;
  distance: number;
}

export interface ActivityJoinedLeague extends BaseActivity {
  activityType: "joined_league";
  userId: string;
  displayName: string;
  avatar?: string | null;
  leagueId: string;
  leagueName: string;
  leagueAvatar?: string | null;
}

export interface ActivityChallengeProgress extends BaseActivity {
  activityType: "challenge_progress";
  badgeId: string;
  badgeName: string;
  progressPct: number;
  progressLabel: string;
}

export interface ActivityDTPAvailable extends BaseActivity {
  activityType: "dtp_available";
  courseId: string;
  courseName: string;
}

export interface ActivityLowRound extends BaseActivity {
  activityType: "low_round";
  userId: string;
  displayName: string;
  avatar?: string | null;
  score: number;
  courseName: string;
  scorePostId?: string;
}

export interface ActivityLowLeaderChange extends BaseActivity {
  activityType: "low_leader_change";
  userId: string;
  displayName: string;
  avatar?: string | null;
  courseName: string;
  score: number;
}

export interface ActivityScratchEarned extends BaseActivity {
  activityType: "scratch_earned";
  userId: string;
  displayName: string;
  avatar?: string | null;
  courseNames: string[];
}

export interface ActivityAceTierEarned extends BaseActivity {
  activityType: "ace_tier_earned";
  userId: string;
  displayName: string;
  avatar?: string | null;
  courseNames: string[];
}

export interface ActivityLeagueResult extends BaseActivity {
  activityType: "league_result";
  leagueId: string;
  leagueName: string;
  leagueAvatar?: string | null;
  week: number;
  winnerName: string;
  winnerScore: number;
}

export interface ActivityRoundComplete extends BaseActivity {
  activityType: "round_complete";
  userId: string;
  displayName: string;
  avatar?: string | null;
  roundId: string;
  courseId: number;
  courseName: string;
  holeCount: 9 | 18;
  formatId: string;
  playerCount: number;
  isSimulator: boolean;
  playerSummaries: {
    playerId: string;
    displayName: string;
    avatar?: string | null;
    isGhost: boolean;
    grossScore: number;
    netScore: number;
    scoreToPar: number;
    courseHandicap: number;
  }[];
  winnerName: string | null;
  roundDescription?: string | null;
  roundImageUrl?: string | null;
}

export interface ActivityRivalryUpdate extends BaseActivity {
  activityType: "rivalry_update";
  userId: string;
  displayName: string;
  avatar?: string | null;
  rivalryId: string;
  changeType:
    | "lead_change"
    | "streak_broken"
    | "streak_extended"
    | "rivalry_formed"
    | "belt_claimed"
    | "tied_up"
    | "milestone";
  message: string;
  playerA: { userId: string; displayName: string; avatar?: string | null };
  playerB: { userId: string; displayName: string; avatar?: string | null };
  record: { wins: number; losses: number; ties: number };
  courseId: number;
  courseName: string;
  roundId?: string | null;
  outingId?: string | null;
}

export interface ActivityOutingComplete extends BaseActivity {
  activityType: "outing_complete";
  userId: string;
  displayName: string;
  avatar?: string | null;
  outingId: string;
  roundId?: string | null;
  courseId: number;
  courseName: string;
  holeCount: number;
  formatId: string;
  playerCount: number;
  groupCount: number;
  winner: {
    playerId: string;
    displayName: string;
    avatar?: string | null;
    netScore: number;
    grossScore: number;
  };
  myPosition: number;
  myGross: number;
  myNet: number;
  topFive: {
    position: number;
    playerId: string;
    displayName: string;
    avatar?: string | null;
    grossScore: number;
    netScore: number;
    scoreToPar: number;
    groupName: string;
  }[];
  invitationalId?: string | null;
  invitationalRoundNumber?: number | null;
}

export type ActivityItem =
  | ActivityBadgeEarned
  | ActivityDTPClaimed
  | ActivityJoinedLeague
  | ActivityChallengeProgress
  | ActivityDTPAvailable
  | ActivityLowRound
  | ActivityLowLeaderChange
  | ActivityScratchEarned
  | ActivityAceTierEarned
  | ActivityLeagueResult
  | ActivityRoundComplete
  | ActivityRivalryUpdate
  | ActivityOutingComplete;

export interface ActivityInsert {
  type: "activity";
  title: string;
  items: ActivityItem[];
  dismissKey: string;
}

// ============================================================================
// HOLE-IN-ONE STANDALONE
// ============================================================================

export interface HoleInOneInsert {
  type: "hole_in_one";
  userId: string;
  displayName: string;
  avatar?: string | null;
  courseName: string;
  hole: number;
  verifiedBy: string;
  timestamp: number;
  dismissKey: string;
}

// ============================================================================
// UNION TYPE
// ============================================================================

export type FeedInsert =
  | LiveOnCourseInsert
  | DiscoveryInsert
  | ActivityInsert
  | HoleInOneInsert;

// ============================================================================
// HELPERS
// ============================================================================

export function discoveryDismissKey(subtype: string): string {
  return `feed_dismiss_discovery_${subtype}`;
}

export function activityDismissKey(): string {
  const today = new Date().toISOString().split("T")[0];
  return `feed_dismiss_activity_${today}`;
}

export function hioDismissKey(userId: string, timestamp: number): string {
  return `feed_dismiss_hio_${userId}_${timestamp}`;
}