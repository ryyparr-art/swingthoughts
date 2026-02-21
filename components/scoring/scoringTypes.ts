/**
 * Types for Post Score — Multiplayer Extensions
 *
 * Extends the existing types.ts with multiplayer-specific types.
 * Used by: GroupSetup, FormatPicker, MultiplayerScorecard, LiveRoundViewer
 *
 * File: components/scoring/types.ts
 */

import type { TeeOption } from "@/components/leagues/post-score/types";

// ============================================================================
// PLAYER SLOT
// ============================================================================

/** A player in the group (on-platform user or ghost) */
export interface PlayerSlot {
  /** UserId for on-platform, generated UUID for ghosts */
  playerId: string;
  displayName: string;
  avatar?: string;

  /** true for non-platform users */
  isGhost: boolean;
  /** true for the round creator */
  isMarker: boolean;

  /** Handicap index (from profile for users, manual entry for ghosts) */
  handicapIndex: number;
  /** Calculated course handicap based on selected tee */
  courseHandicap: number;

  /** Selected tee for this player */
  tee: TeeOption;
  /** Tee name shorthand */
  teeName: string;
  /** Slope rating from their tee */
  slopeRating: number;
  /** Course rating from their tee */
  courseRating: number;

  /** Team assignment for team formats */
  teamId?: string;

  /** Ghost contact info for post-round invite */
  contactInfo?: string;
  /** "phone" | "email" */
  contactType?: "phone" | "email";
}

// ============================================================================
// TEAM
// ============================================================================

export interface RoundTeam {
  id: string;
  name: string;
  playerIds: string[];
}

// ============================================================================
// ROUND DATA (Firestore document shape)
// ============================================================================

export type RoundStatus = "live" | "complete" | "abandoned";

export interface LiveScoreEntry {
  holesCompleted: number;
  currentGross: number;
  currentNet: number;
  scoreToPar: number;
  thru: number;
  /** Format-specific fields */
  stablefordPoints?: number;
  holesWon?: number;
  holesLost?: number;
  holesHalved?: number;
  skinsWon?: number;
  matchResult?: string;
}

export interface HolePlayerData {
  strokes: number;
  fir?: boolean | null;
  gir?: boolean | null;
  dtp?: number | null;
}

export interface RoundData {
  markerId: string;
  status: RoundStatus;
  courseId: number;
  courseName: string;
  holeCount: 9 | 18;
  formatId: string;
  players: PlayerSlot[];
  teams?: RoundTeam[];
  currentHole: number;
  /** Map<holeNum (1-indexed string), Map<playerId, HolePlayerData>> */
  holeData: Record<string, Record<string, HolePlayerData>>;
  /** Map<playerId, LiveScoreEntry> */
  liveScores: Record<string, LiveScoreEntry>;
  leagueId?: string;
  leagueWeek?: number;
  regionKey?: string;
  location?: {
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
  };
  startedAt: any; // serverTimestamp
  completedAt?: any;
  privacy?: "public" | "private" | "partners";
  roundType?: "on_premise" | "simulator";
  isSimulator?: boolean;
  previousMarkerId?: string;
  markerTransferredAt?: any;
  markerTransferRequest?: {
    requestedBy: string;
    requestedByName: string;
    requestedAt: any;
    status: "pending" | "approved" | "declined";
    expiresAt: any;
  } | null;
  abandonedAt?: any;
  abandonedBy?: string;
}

// ============================================================================
// GROUP SETUP PROPS
// ============================================================================

export interface GroupSetupProps {
  /** The marker (current user) — pre-filled as Player 1 */
  marker: {
    userId: string;
    displayName: string;
    avatar?: string;
    handicapIndex: number;
  };
  /** Marker's pre-selected tee from the tee selection screen */
  markerTee: TeeOption;
  /** All available tees for the selected course */
  availableTees: TeeOption[];
  /** Course name for display */
  courseName: string;
  /** Hole count for handicap calculations */
  holeCount: 9 | 18;
  /** Called when group is confirmed — passes the player list */
  onConfirm: (players: PlayerSlot[]) => void;
  /** Called when user taps "Play Solo" */
  onPlaySolo: () => void;
  /** Called when user taps back */
  onBack: () => void;
  /** Called when marker changes their own tee */
  onMarkerTeeChange?: (tee: TeeOption) => void;
}

// ============================================================================
// FORMAT PICKER PROPS
// ============================================================================

export interface FormatPickerProps {
  /** Number of players in the group (determines which formats are available) */
  playerCount: number;
  /** Players in the group (for team assignment) */
  players: PlayerSlot[];
  /** Called when format is confirmed — passes format ID and optional teams */
  onConfirm: (formatId: string, teams?: RoundTeam[]) => void;
  /** Called when user taps back */
  onBack: () => void;
}

// ============================================================================
// SCREEN FLOW
// ============================================================================

/** Extended screen states for the post-score flow */
export type PostScoreScreen =
  | "course"
  | "tee"
  | "group"
  | "format"
  | "scorecard"
  | "summary";