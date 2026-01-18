/**
 * useLeaderboard Hook
 *
 * Fetches and subscribes to live leaderboard data for a tournament.
 * Triggers a sync if data is stale (>60 minutes old).
 */

import { db } from "@/constants/firebaseConfig";
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, onSnapshot, Timestamp } from "firebase/firestore";
import { useEffect, useState, useCallback, useRef } from "react";

export interface LeaderboardPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  position: string;
  previousPosition: string | null;
  movement: "up" | "down" | "same" | "new";
  total: string;
  thru: string;
  currentRoundScore: string;
  isAmateur: boolean;
}

export interface LeaderboardData {
  tournId: string;
  tournamentName: string;
  year: number;
  orgId: string;
  status: string;
  roundId: number;
  roundStatus: string;
  cutLine: string | null;
  players: LeaderboardPlayer[];
  lastUpdated: Timestamp | null;
}

interface UseLeaderboardResult {
  leaderboard: LeaderboardData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isRefreshing: boolean;
}

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes

export function useLeaderboard(
  tournId: string | undefined,
  year: number | undefined,
  orgId: string = "1"
): UseLeaderboardResult {
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Track if we've already triggered a sync in this session
  const hasSyncedRef = useRef(false);
  const lastSyncAttemptRef = useRef<number>(0);

  // Function to trigger a manual sync via Cloud Function
  const triggerSync = useCallback(async () => {
    if (!tournId || !year) return;
    
    // Don't sync more than once per 5 minutes
    const now = Date.now();
    if (now - lastSyncAttemptRef.current < 5 * 60 * 1000) {
      console.log("🏌️ Skipping sync - too recent");
      return;
    }
    
    lastSyncAttemptRef.current = now;
    
    try {
      console.log("🏌️ Triggering leaderboard sync...");
      const functions = getFunctions();
      const syncLeaderboardManual = httpsCallable(functions, "syncLeaderboardManual");
      await syncLeaderboardManual({ tournId, year: year.toString(), orgId });
      console.log("🏌️ ✅ Leaderboard sync complete");
    } catch (err) {
      console.error("🏌️ ❌ Leaderboard sync failed:", err);
    }
  }, [tournId, year, orgId]);

  // Manual refresh function
  const refresh = useCallback(async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await triggerSync();
    } finally {
      setIsRefreshing(false);
    }
  }, [triggerSync, isRefreshing]);

  // Subscribe to leaderboard data
  useEffect(() => {
    if (!tournId || !year) {
      setLeaderboard(null);
      setLoading(false);
      return;
    }

    const docId = `${year}_${tournId}`;
    console.log(`🏌️ Subscribing to leaderboard: ${docId}`);

    const unsubscribe = onSnapshot(
      doc(db, "tournamentLeaderboards", docId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as LeaderboardData;
          setLeaderboard(data);
          setError(null);

          // Check if data is stale and trigger sync if needed
          if (!hasSyncedRef.current && data.lastUpdated) {
            const lastUpdatedMs = data.lastUpdated.toMillis();
            const isStale = Date.now() - lastUpdatedMs > STALE_THRESHOLD_MS;
            
            if (isStale) {
              console.log("🏌️ Leaderboard data is stale, triggering sync...");
              hasSyncedRef.current = true;
              triggerSync();
            }
          }
        } else {
          // No data exists, trigger initial sync
          if (!hasSyncedRef.current) {
            console.log("🏌️ No leaderboard data, triggering initial sync...");
            hasSyncedRef.current = true;
            triggerSync();
          }
          setLeaderboard(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("🏌️ Leaderboard subscription error:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => {
      console.log(`🏌️ Unsubscribing from leaderboard: ${docId}`);
      unsubscribe();
    };
  }, [tournId, year, triggerSync]);

  // Reset sync flag when tournament changes
  useEffect(() => {
    hasSyncedRef.current = false;
    lastSyncAttemptRef.current = 0;
  }, [tournId, year]);

  return {
    leaderboard,
    loading,
    error,
    refresh,
    isRefreshing,
  };
}