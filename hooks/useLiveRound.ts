/**
 * useLiveRound — Real-time Firestore listener for a live round
 *
 * Powers both the marker's scorecard and spectator views.
 * Listens to rounds/{roundId} via onSnapshot for real-time updates.
 *
 * Usage:
 *   const { round, isLoading, error } = useLiveRound(roundId);
 *   const { activeRound } = useActiveRound(userId); // check if user is in a live round
 *
 * File: hooks/useLiveRound.ts
 */

import type {
    PlayerSlot,
    RoundData
} from "@/components/scoring/scoringTypes";
import { db } from "@/constants/firebaseConfig";
import {
    collection,
    doc,
    limit,
    onSnapshot,
    orderBy,
    query,
    where
} from "firebase/firestore";
import { useEffect, useState } from "react";

// ============================================================================
// useLiveRound — Listen to a specific round
// ============================================================================

interface UseLiveRoundReturn {
  /** The full round document data */
  round: RoundData | null;
  /** Whether the initial load is in progress */
  isLoading: boolean;
  /** Error message if the listener fails */
  error: string | null;
  /** Whether the round is still live */
  isLive: boolean;
  /** Convenience: current hole the marker is on */
  currentHole: number;
  /** Convenience: sorted leaderboard based on format */
  leaderboard: LeaderboardEntry[];
}

export interface LeaderboardEntry {
  playerId: string;
  displayName: string;
  avatar?: string;
  isGhost: boolean;
  thru: number;
  grossScore: number;
  netScore: number;
  scoreToPar: number;
  /** Format-specific display value */
  displayValue: string;
  /** For sorting: lower is better for strokes, higher for points/skins */
  sortValue: number;
}

export function useLiveRound(roundId: string | null): UseLiveRoundReturn {
  const [round, setRound] = useState<RoundData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId) {
      setRound(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const roundRef = doc(db, "rounds", roundId);
    const unsub = onSnapshot(
      roundRef,
      (snap) => {
        if (snap.exists()) {
          setRound(snap.data() as RoundData);
        } else {
          setRound(null);
          setError("Round not found");
        }
        setIsLoading(false);
      },
      (err) => {
        console.error("useLiveRound error:", err);
        setError(err.message);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [roundId]);

  // ── Derived state ────────────────────────────────────────
  const isLive = round?.status === "live";
  const currentHole = round?.currentHole ?? 1;

  // ── Build leaderboard from liveScores ────────────────────
  const leaderboard: LeaderboardEntry[] = (() => {
    if (!round?.liveScores || !round?.players) return [];

    const format = round.formatId;
    const isPointsBased = format === "stableford" || format === "better_ball_stableford" || format === "best_ball_stableford";
    const isSkins = format === "skins";
    const isMatchPlay = format === "match_play" || format === "better_ball_match" || format === "foursome_match" || format === "greensome_match";

    return round.players
      .map((player: PlayerSlot) => {
        const live = round.liveScores[player.playerId];
        if (!live) {
          return {
            playerId: player.playerId,
            displayName: player.displayName,
            avatar: player.avatar,
            isGhost: player.isGhost,
            thru: 0,
            grossScore: 0,
            netScore: 0,
            scoreToPar: 0,
            displayValue: "-",
            sortValue: 0,
          };
        }

        let displayValue: string;
        let sortValue: number;

        if (isPointsBased) {
          const pts = live.stablefordPoints ?? 0;
          displayValue = `${pts} pts`;
          sortValue = -pts; // negate so sort ascending works (higher points = better)
        } else if (isSkins) {
          const skins = live.skinsWon ?? 0;
          displayValue = `${skins} skin${skins !== 1 ? "s" : ""}`;
          sortValue = -skins;
        } else if (isMatchPlay) {
          displayValue = live.matchResult ?? "AS";
          sortValue = -(live.holesWon ?? 0) + (live.holesLost ?? 0);
        } else {
          // Stroke play (default)
          const toPar = live.scoreToPar;
          displayValue = toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : `${toPar}`;
          sortValue = live.currentGross;
        }

        return {
          playerId: player.playerId,
          displayName: player.displayName,
          avatar: player.avatar,
          isGhost: player.isGhost,
          thru: live.thru ?? live.holesCompleted ?? 0,
          grossScore: live.currentGross ?? 0,
          netScore: live.currentNet ?? 0,
          scoreToPar: live.scoreToPar ?? 0,
          displayValue,
          sortValue,
        };
      })
      .sort((a, b) => a.sortValue - b.sortValue);
  })();

  return {
    round,
    isLoading,
    error,
    isLive,
    currentHole,
    leaderboard,
  };
}

// ============================================================================
// useActiveRound — Check if user is in any live round
// ============================================================================

interface UseActiveRoundReturn {
  /** The active round ID (if any) */
  activeRoundId: string | null;
  /** Basic info for the FAB display */
  activeRoundInfo: {
    courseName: string;
    playerCount: number;
    currentHole: number;
    formatId: string;
  } | null;
  /** Whether the check is loading */
  isChecking: boolean;
}

export function useActiveRound(userId: string | null): UseActiveRoundReturn {
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [activeRoundInfo, setActiveRoundInfo] = useState<UseActiveRoundReturn["activeRoundInfo"]>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (!userId) {
      setActiveRoundId(null);
      setActiveRoundInfo(null);
      setIsChecking(false);
      return;
    }

    // Listen for live rounds where the user is a player
    // We query rounds where status is "live" and check players client-side
    // (Firestore can't query array-of-objects by nested field without a flat index)
    const roundsRef = collection(db, "rounds");
    const q = query(
      roundsRef,
      where("status", "==", "live"),
      orderBy("startedAt", "desc"),
      limit(10)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        let found = false;

        for (const docSnap of snap.docs) {
          const data = docSnap.data() as RoundData;
          const isPlayer = data.players?.some((p) => p.playerId === userId);

          if (isPlayer) {
            setActiveRoundId(docSnap.id);
            setActiveRoundInfo({
              courseName: data.courseName || "Live Round",
              playerCount: data.players?.length || 0,
              currentHole: data.currentHole || 1,
              formatId: data.formatId || "stroke_play",
            });
            found = true;
            break;
          }
        }

        if (!found) {
          setActiveRoundId(null);
          setActiveRoundInfo(null);
        }

        setIsChecking(false);
      },
      (err) => {
        console.error("useActiveRound error:", err);
        setIsChecking(false);
      }
    );

    return () => unsub();
  }, [userId]);

  return { activeRoundId, activeRoundInfo, isChecking };
}

// ============================================================================
// useRoundChat — Listen to round chat messages
// ============================================================================

export interface ChatMessage {
  id: string;
  userId: string;
  displayName: string;
  avatar?: string;
  content: string;
  createdAt: any;
}

interface UseRoundChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  sendMessage: (userId: string, displayName: string, avatar: string | undefined, content: string) => Promise<void>;
}

export function useRoundChat(roundId: string | null): UseRoundChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!roundId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    const messagesRef = collection(db, "rounds", roundId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "asc"), limit(200));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const msgs: ChatMessage[] = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as ChatMessage[];
        setMessages(msgs);
        setIsLoading(false);
      },
      (err) => {
        console.error("useRoundChat error:", err);
        setIsLoading(false);
      }
    );

    return () => unsub();
  }, [roundId]);

  const sendMessage = async (
    userId: string,
    displayName: string,
    avatar: string | undefined,
    content: string
  ) => {
    if (!roundId || !content.trim()) return;

    const { addDoc, serverTimestamp } = await import("firebase/firestore");
    const messagesRef = collection(db, "rounds", roundId, "messages");

    await addDoc(messagesRef, {
      userId,
      displayName,
      avatar: avatar || null,
      content: content.trim(),
      createdAt: serverTimestamp(),
    });
  };

  return { messages, isLoading, sendMessage };
}