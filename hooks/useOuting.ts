/**
 * useOuting — Real-time listener for outing + linked rounds
 *
 * Provides live outing data, group statuses, and aggregated leaderboard.
 * Used by: OutingDashboard, OutingLeaderboard, app/outing/[outingId].tsx
 *
 * File: hooks/useOuting.ts
 *
 * STUB — Implementation in Phase 4
 */

import type { LiveScoreEntry } from "@/components/scoring/scoringTypes";
import type { OutingData, OutingLeaderboardEntry } from "@/constants/outingTypes";

export interface UseOutingResult {
  /** The outing document data */
  outing: OutingData | null;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: string | null;
  /** Live scores from all linked rounds, keyed by roundId → playerId → scores */
  allLiveScores: Record<string, Record<string, LiveScoreEntry>>;
  /** Computed leaderboard across all groups */
  leaderboard: OutingLeaderboardEntry[];
  /** Whether the current user is the organizer */
  isOrganizer: boolean;
  /** Whether the current user is a group marker */
  isGroupMarker: boolean;
  /** The current user's group ID (if participant) */
  myGroupId: string | null;
}

/**
 * Hook to subscribe to an outing and all its linked rounds in real-time.
 *
 * @param outingId - The outing document ID
 * @returns UseOutingResult with live data
 */
export function useOuting(outingId: string | null): UseOutingResult {
  // TODO: Phase 4 implementation
  // 1. Subscribe to outings/{outingId} doc
  // 2. When outing.roundIds changes, subscribe to each rounds/{roundId} doc
  // 3. Aggregate liveScores from all rounds
  // 4. Compute leaderboard via buildOutingLeaderboard()
  // 5. Determine current user's role (organizer, marker, player, spectator)

  return {
    outing: null,
    loading: true,
    error: null,
    allLiveScores: {},
    leaderboard: [],
    isOrganizer: false,
    isGroupMarker: false,
    myGroupId: null,
  };
}