/**
 * useRivalries Hook
 *
 * Fetches a user's rivalry docs from Firestore and computes three roles:
 *
 *   Nemesis  — closest competitive match (30-70% win rate, most matches)
 *   Threat   — someone within 2 wins of overtaking you
 *   Target   — someone you're trailing by ≤3 wins
 *   Rival    — fallback when rivalry exists but doesn't fit above roles
 *
 * Also generates engagement nudge items for the feed discovery carousel.
 *
 * Only rivalries with totalMatches >= RIVALRY_DISPLAY_THRESHOLD are shown.
 * This matches the server-side RIVALRY_THRESHOLD (3) so the locker only
 * surfaces rivalries that have been announced to the user.
 *
 * Usage:
 *   const { roles, nudges, loading } = useRivalries(userId);
 */

import { db } from "@/constants/firebaseConfig";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";

/** Must match RIVALRY_THRESHOLD in rivalryEngine.ts */
const RIVALRY_DISPLAY_THRESHOLD = 3;

// ============================================================================
// TYPES
// ============================================================================

export interface RivalryDoc {
  id: string;
  playerA: { userId: string; displayName: string; avatar?: string | null };
  playerB: { userId: string; displayName: string; avatar?: string | null };
  record: { wins: number; losses: number; ties: number };
  currentStreak: { playerId: string; count: number } | null;
  longestStreak: { playerId: string; count: number } | null;
  beltHolder: string | null;
  totalMatches: number;
  lastMatchDate: any;
  recentResults: any[];
}

export interface RivalRole {
  type: "nemesis" | "threat" | "target";
  label: string;
  emoji: string;
  rival: {
    userId: string;
    displayName: string;
    avatar?: string | null;
  };
  record: { myWins: number; theirWins: number; ties: number };
  totalMatches: number;
  detail: string;
  /** Full rivalry doc for detail modal */
  rivalryDoc: RivalryDoc;
}

export interface RivalryNudge {
  id: string;
  rivalryId: string;
  rivalName: string;
  rivalAvatar?: string | null;
  rivalUserId: string;
  message: string;
  emoji: string;
  priority: number;
}

interface UseRivalriesReturn {
  roles: RivalRole[];
  nudges: RivalryNudge[];
  rivalries: RivalryDoc[];
  loading: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

export function useRivalries(userId?: string): UseRivalriesReturn {
  const [rivalries, setRivalries] = useState<RivalryDoc[]>([]);
  const [roles, setRoles] = useState<RivalRole[]>([]);
  const [nudges, setNudges] = useState<RivalryNudge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    fetchRivalries(userId);
  }, [userId]);

  const fetchRivalries = async (uid: string) => {
    try {
      const rivalriesQuery = query(
        collection(db, "rivalries"),
        where("playerIds", "array-contains", uid)
      );

      const snap = await getDocs(rivalriesQuery);
      const docs: RivalryDoc[] = [];

      snap.forEach((d) => {
        docs.push({ id: d.id, ...d.data() } as RivalryDoc);
      });

      setRivalries(docs);
      setRoles(computeRoles(docs, uid));
      setNudges(generateNudges(docs, uid));
    } catch (err) {
      console.error("Failed to fetch rivalries:", err);
    } finally {
      setLoading(false);
    }
  };

  return { roles, nudges, rivalries, loading };
}

// ============================================================================
// COMPUTE ROLES
// ============================================================================

function computeRoles(rivalries: RivalryDoc[], userId: string): RivalRole[] {
  if (rivalries.length === 0) return [];

  const roles: RivalRole[] = [];

  // Normalize all rivalries to the viewing user's perspective.
  // Filter to announced rivalries only (totalMatches >= RIVALRY_DISPLAY_THRESHOLD).
  const perspectives = rivalries
    .filter((r) => r.totalMatches >= RIVALRY_DISPLAY_THRESHOLD)
    .map((r) => {
      const isPlayerA = r.playerA.userId === userId;
      const rival = isPlayerA ? r.playerB : r.playerA;
      const myWins = isPlayerA ? r.record.wins : r.record.losses;
      const theirWins = isPlayerA ? r.record.losses : r.record.wins;
      const ties = r.record.ties;
      const total = r.totalMatches;
      const winRate = total > 0 ? myWins / total : 0.5;

      return {
        doc: r,
        rival,
        myWins,
        theirWins,
        ties,
        total,
        winRate,
        margin: myWins - theirWins,
      };
    });

  if (perspectives.length === 0) return [];

  // ── Nemesis: closest competitive match (30-70% win rate, most matches) ──
  const nemesisCandidates = perspectives
    .filter((p) => p.winRate >= 0.3 && p.winRate <= 0.7)
    .sort((a, b) => {
      const aCloseness = Math.abs(a.winRate - 0.5);
      const bCloseness = Math.abs(b.winRate - 0.5);
      if (Math.abs(aCloseness - bCloseness) < 0.05) {
        return b.total - a.total;
      }
      return aCloseness - bCloseness;
    });

  if (nemesisCandidates.length > 0) {
    const n = nemesisCandidates[0];
    const streakDetail = getStreakDetail(n.doc, userId);
    roles.push({
      type: "nemesis",
      label: "Nemesis",
      emoji: "😈",
      rival: n.rival,
      record: { myWins: n.myWins, theirWins: n.theirWins, ties: n.ties },
      totalMatches: n.total,
      detail: streakDetail || `${n.myWins}-${n.theirWins} in ${n.total} matches`,
      rivalryDoc: n.doc,
    });
  }

  // ── Threat: you lead, but they're within 2 wins of catching you ──
  const usedIds = new Set(roles.map((r) => r.rival.userId));
  const threatCandidates = perspectives
    .filter(
      (p) =>
        !usedIds.has(p.rival.userId) &&
        p.margin > 0 &&
        p.margin <= 2
    )
    .sort((a, b) => a.margin - b.margin);

  if (threatCandidates.length > 0) {
    const t = threatCandidates[0];
    roles.push({
      type: "threat",
      label: "Threat",
      emoji: "🔥",
      rival: t.rival,
      record: { myWins: t.myWins, theirWins: t.theirWins, ties: t.ties },
      totalMatches: t.total,
      detail: `Trailing by ${t.margin}`,
      rivalryDoc: t.doc,
    });
    usedIds.add(t.rival.userId);
  }

  // ── Target: you're trailing by ≤3 wins ──
  const targetCandidates = perspectives
    .filter(
      (p) =>
        !usedIds.has(p.rival.userId) &&
        p.margin < 0 &&
        p.margin >= -3
    )
    .sort((a, b) => b.margin - a.margin);

  if (targetCandidates.length > 0) {
    const t = targetCandidates[0];
    roles.push({
      type: "target",
      label: "Target",
      emoji: "🎯",
      rival: t.rival,
      record: { myWins: t.myWins, theirWins: t.theirWins, ties: t.ties },
      totalMatches: t.total,
      detail: `${Math.abs(t.margin)} back`,
      rivalryDoc: t.doc,
    });
    usedIds.add(t.rival.userId);
  }

  // ── Fallback: rivalry exists but record is too lopsided for any named role ──
  // e.g. 0-3, 0-4, 4-0 — show it anyway so no real rivalry is silently hidden.
  // Uses the rivalry with the most matches. Label as "Rival" with target card style.
  if (roles.length === 0 && perspectives.length > 0) {
    const best = [...perspectives].sort((a, b) => b.total - a.total)[0];
    const streakDetail = getStreakDetail(best.doc, userId);
    roles.push({
      type: "target",
      label: "Rival",
      emoji: "⚔️",
      rival: best.rival,
      record: { myWins: best.myWins, theirWins: best.theirWins, ties: best.ties },
      totalMatches: best.total,
      detail: streakDetail || `${best.myWins}-${best.theirWins} in ${best.total} matches`,
      rivalryDoc: best.doc,
    });
  }

  return roles;
}

// ============================================================================
// GENERATE NUDGES (for feed engagement carousel)
// ============================================================================

function generateNudges(rivalries: RivalryDoc[], userId: string): RivalryNudge[] {
  const nudges: RivalryNudge[] = [];

  for (const r of rivalries) {
    const isPlayerA = r.playerA.userId === userId;
    const rival = isPlayerA ? r.playerB : r.playerA;
    const myWins = isPlayerA ? r.record.wins : r.record.losses;
    const theirWins = isPlayerA ? r.record.losses : r.record.wins;
    const margin = myWins - theirWins;

    // They can tie you (I lead by 1)
    if (margin === 1) {
      nudges.push({
        id: `nudge_tie_${r.id}`,
        rivalryId: r.id,
        rivalName: rival.displayName,
        rivalAvatar: rival.avatar,
        rivalUserId: rival.userId,
        message: `${rival.displayName.split(" ")[0]} can tie you next round`,
        emoji: "⚠️",
        priority: 1,
      });
    }

    // You can tie them (I trail by 1)
    if (margin === -1) {
      nudges.push({
        id: `nudge_catch_${r.id}`,
        rivalryId: r.id,
        rivalName: rival.displayName,
        rivalAvatar: rival.avatar,
        rivalUserId: rival.userId,
        message: `One win ties it with ${rival.displayName.split(" ")[0]}`,
        emoji: "💪",
        priority: 1,
      });
    }

    // Losing streak against them (3+)
    if (
      r.currentStreak &&
      r.currentStreak.playerId !== userId &&
      r.currentStreak.count >= 3
    ) {
      nudges.push({
        id: `nudge_streak_${r.id}`,
        rivalryId: r.id,
        rivalName: rival.displayName,
        rivalAvatar: rival.avatar,
        rivalUserId: rival.userId,
        message: `${rival.displayName.split(" ")[0]} has won ${r.currentStreak.count} straight`,
        emoji: "😤",
        priority: 2,
      });
    }

    // You hold the belt
    if (r.beltHolder === userId) {
      nudges.push({
        id: `nudge_belt_${r.id}`,
        rivalryId: r.id,
        rivalName: rival.displayName,
        rivalAvatar: rival.avatar,
        rivalUserId: rival.userId,
        message: `Defend your belt vs ${rival.displayName.split(" ")[0]}`,
        emoji: "🏅",
        priority: 3,
      });
    }

    // They hold the belt
    if (r.beltHolder && r.beltHolder !== userId && r.beltHolder === rival.userId) {
      nudges.push({
        id: `nudge_belt_take_${r.id}`,
        rivalryId: r.id,
        rivalName: rival.displayName,
        rivalAvatar: rival.avatar,
        rivalUserId: rival.userId,
        message: `Take the belt from ${rival.displayName.split(" ")[0]}`,
        emoji: "🥊",
        priority: 2,
      });
    }

    // Upcoming milestone
    const nextMilestone = Math.ceil(r.totalMatches / 10) * 10;
    if (nextMilestone - r.totalMatches <= 2 && r.totalMatches >= 8) {
      nudges.push({
        id: `nudge_milestone_${r.id}`,
        rivalryId: r.id,
        rivalName: rival.displayName,
        rivalAvatar: rival.avatar,
        rivalUserId: rival.userId,
        message: `${nextMilestone} matches with ${rival.displayName.split(" ")[0]} — almost there`,
        emoji: "🎯",
        priority: 4,
      });
    }
  }

  nudges.sort((a, b) => a.priority - b.priority);
  return nudges;
}

// ============================================================================
// HELPERS
// ============================================================================

function getStreakDetail(rivalry: RivalryDoc, userId: string): string | null {
  if (!rivalry.currentStreak || rivalry.currentStreak.count < 2) return null;
  const isMyStreak = rivalry.currentStreak.playerId === userId;
  const count = rivalry.currentStreak.count;
  return isMyStreak ? `${count} win streak` : `${count} match losing streak`;
}