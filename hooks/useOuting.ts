/**
 * useOuting — Real-time listener for outing + linked rounds
 *
 * Provides live outing data, group statuses, and aggregated leaderboard.
 * Used by: OutingLeaderboardFAB, OutingDashboard, app/outing/[outingId].tsx
 *
 * Subscribes to:
 *   1. outings/{outingId} — roster, groups, metadata
 *   2. rounds/{roundId} for each group — liveScores, status
 *
 * Computes cross-group leaderboard via buildOutingLeaderboard().
 *
 * File: hooks/useOuting.ts
 */

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/constants/firebaseConfig";
import { buildOutingLeaderboard } from "@/utils/outingHelpers";
import type { LiveScoreEntry } from "@/components/scoring/scoringTypes";
import type {
  OutingData,
  OutingGroup,
  OutingLeaderboardEntry,
  OutingPlayer,
} from "@/constants/outingTypes";

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
 */
export function useOuting(outingId: string | null): UseOutingResult {
  const currentUserId = auth.currentUser?.uid;

  const [outing, setOuting] = useState<OutingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allLiveScores, setAllLiveScores] = useState<
    Record<string, Record<string, LiveScoreEntry>>
  >({});

  // Track which roundIds we're currently listening to
  const [activeRoundIds, setActiveRoundIds] = useState<string[]>([]);

  // ── 1. Subscribe to outing document ──
  useEffect(() => {
    if (!outingId) {
      setOuting(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = onSnapshot(
      doc(db, "outings", outingId),
      (snap) => {
        if (!snap.exists()) {
          setOuting(null);
          setError("Outing not found");
          setLoading(false);
          return;
        }

        const data = snap.data() as OutingData;
        setOuting(data);
        setLoading(false);

        // Extract roundIds from groups
        const roundIds = (data.groups || [])
          .map((g: OutingGroup) => g.roundId)
          .filter(Boolean) as string[];

        setActiveRoundIds(roundIds);
      },
      (err) => {
        console.error("useOuting: Error listening to outing:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [outingId]);

  // ── 2. Subscribe to each round document for live scores ──
  useEffect(() => {
    if (activeRoundIds.length === 0) {
      setAllLiveScores({});
      return;
    }

    const unsubs: (() => void)[] = [];

    for (const rid of activeRoundIds) {
      const unsub = onSnapshot(
        doc(db, "rounds", rid),
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          const liveScores = data.liveScores || {};

          setAllLiveScores((prev) => ({
            ...prev,
            [rid]: liveScores,
          }));
        },
        (err) => {
          console.error(`useOuting: Error listening to round ${rid}:`, err);
        }
      );

      unsubs.push(unsub);
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [activeRoundIds]);

  // ── 3. Compute leaderboard ──
  const leaderboard = useMemo(() => {
    if (!outing) return [];
    return buildOutingLeaderboard(
      outing.roster || [],
      outing.groups || [],
      allLiveScores,
      outing.formatId || "stroke_play"
    );
  }, [outing, allLiveScores]);

  // ── 4. Determine current user's role ──
  const isOrganizer = outing?.organizerId === currentUserId;

  const isGroupMarker = useMemo(() => {
    if (!outing || !currentUserId) return false;
    return (outing.groups || []).some(
      (g: OutingGroup) => g.markerId === currentUserId
    );
  }, [outing, currentUserId]);

  const myGroupId = useMemo(() => {
    if (!outing || !currentUserId) return null;
    const group = (outing.groups || []).find((g: OutingGroup) =>
      g.playerIds.includes(currentUserId)
    );
    return group?.groupId || null;
  }, [outing, currentUserId]);

  return {
    outing,
    loading,
    error,
    allLiveScores,
    leaderboard,
    isOrganizer,
    isGroupMarker,
    myGroupId,
  };
}