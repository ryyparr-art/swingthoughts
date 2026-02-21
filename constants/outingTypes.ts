/**
 * Outing Types — Reusable Group Management Infrastructure
 *
 * These types define the outing system that powers all multi-group scoring:
 * casual outings, leagues, invitationals (cups), and tours (tournaments).
 *
 * The outing layer is context-agnostic — it manages groups, markers,
 * starting holes, and per-round leaderboards. Parent entities (leagues,
 * tours, etc.) handle scheduling, progression, and cumulative scoring.
 *
 * File: constants/outingTypes.ts
 */

// ============================================================================
// OUTING STATUS
// ============================================================================

export type OutingStatus = "draft" | "live" | "complete" | "cancelled";

export type OutingParentType = "casual" | "league" | "invitational" | "tour";

export type OutingGroupStatus = "pending" | "live" | "complete";

// ============================================================================
// OUTING PLAYER (roster item)
// ============================================================================

/** A player in the outing roster. Can be on-platform or ghost. */
export interface OutingPlayer {
  /** User ID for on-platform players, generated UUID for ghosts */
  playerId: string;
  displayName: string;
  avatar?: string;

  /** True for non-platform players */
  isGhost: boolean;
  /** Player handicap index */
  handicapIndex: number;

  /** Assigned group ID (null if unassigned) */
  groupId?: string | null;
  /** True if designated scorekeeper for their group */
  isGroupMarker: boolean;

  /** Ghost contact info for post-round invite */
  contactInfo?: string;
  /** "phone" | "email" */
  contactType?: "phone" | "email";
}

// ============================================================================
// OUTING GROUP
// ============================================================================

/** A scoring group within the outing. Maps 1:1 to a round document. */
export interface OutingGroup {
  /** Unique group identifier (e.g., "group_1") */
  groupId: string;
  /** Display name (e.g., "Group 1", "Hole 5 Start") */
  name: string;
  /** Player IDs assigned to this group */
  playerIds: string[];
  /** Player ID of group's scorekeeper (must be on-platform) */
  markerId: string;
  /** Linked round document ID (set on launch) */
  roundId?: string | null;
  /** Starting hole for this group (default 1, for shotgun starts) */
  startingHole: number;
  /** Group status */
  status: OutingGroupStatus;
}

// ============================================================================
// OUTING LEADERBOARD ENTRY
// ============================================================================

/** A single player's entry in the outing leaderboard */
export interface OutingLeaderboardEntry {
  playerId: string;
  displayName: string;
  avatar?: string;
  groupId: string;
  groupName: string;
  /** Gross score */
  grossScore: number;
  /** Net score (gross - course handicap) */
  netScore: number;
  /** Score relative to par */
  scoreToPar: number;
  /** Holes completed */
  thru: number;
  /** Format-specific score (stableford points, match result, etc.) */
  formatScore?: number;
  /** Position on leaderboard (1-indexed, with ties) */
  position: number;
}

// ============================================================================
// OUTING DATA (Firestore document shape: outings/{outingId})
// ============================================================================

export interface OutingData {
  /** User ID of the outing creator */
  organizerId: string;
  /** Organizer display name (for notifications/display) */
  organizerName: string;

  /** Outing status */
  status: OutingStatus;

  /** What created this outing */
  parentType: OutingParentType;
  /** Document ID of parent entity (null for casual) */
  parentId?: string | null;

  /** Golf course API ID */
  courseId: number;
  /** Display name of the course */
  courseName: string;
  /** Number of holes */
  holeCount: 9 | 18;
  /** Front or back nine (only if 9-hole) */
  nineHoleSide?: "front" | "back";

  /** Game format ID from gameFormats.ts */
  formatId: string;

  /** Target players per group (default 4) */
  groupSize: number;

  /** All players in the outing */
  roster: OutingPlayer[];
  /** Group assignments with markers */
  groups: OutingGroup[];
  /** Array of round IDs (one per group, set on launch) */
  roundIds: string[];

  /** Location metadata */
  location?: {
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
  };
  /** Region key for leaderboard bucketing */
  regionKey?: string;

  /** Frozen leaderboard (set on completion) */
  finalLeaderboard?: OutingLeaderboardEntry[];
  /** Number of groups completed (for progress tracking) */
  groupsComplete?: number;

  /** Timestamps */
  createdAt: any;
  launchedAt?: any;
  completedAt?: any;
}

// ============================================================================
// OUTING CREATION PARAMS
// ============================================================================

/** Params for creating a new outing (used by parent entities) */
export interface CreateOutingParams {
  organizerId: string;
  organizerName: string;
  parentType: OutingParentType;
  parentId?: string | null;
  courseId: number;
  courseName: string;
  holeCount: 9 | 18;
  nineHoleSide?: "front" | "back";
  formatId: string;
  groupSize?: number;
  roster: OutingPlayer[];
  location?: OutingData["location"];
  regionKey?: string;
}

// ============================================================================
// OUTING VALIDATION
// ============================================================================

export interface OutingValidationWarning {
  type: "no_marker" | "uneven_group" | "small_group" | "unassigned_players" | "ghost_marker";
  groupId?: string;
  message: string;
}