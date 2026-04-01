/**
 * useFeedInserts Hook
 *
 * Manages feed insert cards (discovery carousels, activity carousel, HIO).
 * Fetches insert data, slots them between posts, handles dismissals.
 *
 * Usage:
 *   const { feedWithInserts, handleDismissInsert } = useFeedInserts({
 *     thoughts,
 *     currentUserId,
 *     currentUserData,
 *   });
 *
 *   <FlatList data={feedWithInserts} renderItem={renderFeedItem} />
 */

import type { Thought } from "@/utils/feedHelpers";
import {
  cleanupDismissKeys,
  fetchFeedInserts,
} from "@/utils/feedInsertProvider";
import type { FeedInsert, LiveOnCourseInsert } from "@/utils/feedInsertTypes";
import { useCallback, useEffect, useRef, useState } from "react";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

/**
 * Union type for FlatList data — either a regular post or a feed insert.
 * Uses a discriminant `_feedItemType` so renderItem can branch.
 */
export type FeedListItem =
  | (Thought & { _feedItemType: "post" })
  | (FeedInsert & { _feedItemType: "insert"; _insertId: string });

interface UseFeedInsertsOptions {
  thoughts: Thought[];
  currentUserId: string;
  currentUserData: any;
  loading: boolean;
  hasActiveFilters: boolean;
}

interface UseFeedInsertsReturn {
  feedWithInserts: FeedListItem[];
  handleDismissInsert: (dismissKey: string) => void;
  refreshInserts: () => Promise<void>;
}

/* ================================================================ */
/* SLOT CONFIGURATION                                               */
/* ================================================================ */

/**
 * How many posts between each insert slot.
 * Pattern: 3 → discovery → 4 → discovery/HIO → 4 → activity → 5 between remaining
 */
const FIRST_SLOT = 3;
const SECOND_SLOT = 4;
const THIRD_SLOT = 4;
const SUBSEQUENT_GAP = 5;

/* ================================================================ */
/* HOOK                                                             */
/* ================================================================ */

export function useFeedInserts({
  thoughts,
  currentUserId,
  currentUserData,
  loading,
  hasActiveFilters,
}: UseFeedInsertsOptions): UseFeedInsertsReturn {
  const [inserts, setInserts] = useState<FeedInsert[]>([]);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const hasFetchedRef = useRef(false);

  // ----------------------------------------------------------------
  // FETCH INSERTS (once per feed load)
  // ----------------------------------------------------------------

  useEffect(() => {
    if (!currentUserId || !currentUserData || loading || hasFetchedRef.current) return;
    if (hasActiveFilters) return; // Don't show inserts in filtered view

    hasFetchedRef.current = true;
    fetchInserts();
    cleanupDismissKeys(); // Best-effort cleanup of old dismiss keys
  }, [currentUserId, currentUserData, loading, hasActiveFilters]);

  // Reset fetch flag when userId changes (re-login)
  useEffect(() => {
    hasFetchedRef.current = false;
  }, [currentUserId]);

  const fetchInserts = async () => {
    try {
      const userData = currentUserData;
      if (!userData) return;

      // Fetch user's league memberships (not stored on user doc)
      let leagueIds: string[] = [];
      try {
        const { collectionGroup, getDocs, query, where } = await import("firebase/firestore");
        const { db } = await import("@/constants/firebaseConfig");
        const memberSnap = await getDocs(
          query(
            collectionGroup(db, "members"),
            where("userId", "==", currentUserId),
            where("status", "==", "active")
          )
        );
        leagueIds = memberSnap.docs
          .map((d) => d.ref.parent.parent?.id)
          .filter((id): id is string => !!id);
      } catch (err) {
        console.warn("⚠️ Could not fetch league memberships:", err);
      }

      const result = await fetchFeedInserts({
        userId: currentUserId,
        regionKey: userData.regionKey || "",
        partnerIds: userData.partners || [],
        activeChallenges: userData.activeChallenges || [],
        earnedChallengeBadges: userData.earnedChallengeBadges || [],
        leagueIds,
        playerCourses: userData.playerCourses || [],
      });

      console.log(`📌 Feed inserts loaded: ${result.length} items`);
      setInserts(result);
    } catch (err) {
      console.error("⚠️ Feed inserts fetch failed:", err);
    }
  };

  const refreshInserts = useCallback(async () => {
    hasFetchedRef.current = false;
    await fetchInserts();
  }, [currentUserId, currentUserData]);

  // ----------------------------------------------------------------
  // DISMISS
  // ----------------------------------------------------------------

  const handleDismissInsert = useCallback((dismissKey: string) => {
    if (!dismissKey) return; // live_on_course has no dismissKey
    setDismissedKeys((prev) => {
      const next = new Set(prev);
      next.add(dismissKey);
      return next;
    });
  }, []);

  // ----------------------------------------------------------------
  // MERGE: Slot inserts between posts
  // ----------------------------------------------------------------

  const feedWithInserts: FeedListItem[] = (() => {
    // If filtered, loading, or no posts, just return posts tagged as posts
    if (hasActiveFilters || thoughts.length === 0) {
      return thoughts.map((t) => ({ ...t, _feedItemType: "post" as const }));
    }

    // ── Separate insert types ────────────────────────────────────────
    const liveInsert = inserts.find(
      (ins): ins is LiveOnCourseInsert => ins.type === "live_on_course"
    );

    // Filter dismissed for everything except live (live is never dismissable)
    const activeInserts = inserts.filter((ins) => {
      if (ins.type === "live_on_course") return false; // handled separately above
      return !dismissedKeys.has((ins as any).dismissKey);
    });

    const hio = activeInserts.find((ins) => ins.type === "hole_in_one");
    const activity = activeInserts.find((ins) => ins.type === "activity");

    // Discovery inserts cycle — each subtype returned once by provider,
    // but we draw from the queue repeatedly to fill every discovery slot.
    const discoveries = activeInserts.filter((ins) => ins.type === "discovery");
    let discoveryIndex = 0;
    const nextDiscovery = () => {
      if (discoveries.length === 0) return null;
      return discoveries[discoveryIndex++ % discoveries.length];
    };

    // ── Helper to push a tagged insert ──────────────────────────────
    const result: FeedListItem[] = [];
    let postIndex = 0;
    let activityInserted = false;
    let hioInserted = false;

    const addPosts = (count: number) => {
      const end = Math.min(postIndex + count, thoughts.length);
      for (let i = postIndex; i < end; i++) {
        result.push({ ...thoughts[i], _feedItemType: "post" as const });
      }
      postIndex = end;
    };

    const addInsert = (insert: FeedInsert) => {
      result.push({
        ...insert,
        _feedItemType: "insert" as const,
        _insertId: `insert_${insert.type}_${(insert as any).dismissKey ?? "live"}`,
      } as FeedListItem);
    };

    // ── Slot 0: Live on Course (prepended before any posts) ──────────
    if (liveInsert) {
      addInsert(liveInsert);
    }

    // If no other inserts, just return posts after the live insert
    if (activeInserts.length === 0) {
      addPosts(thoughts.length);
      return result;
    }

    // ── Slot 1: 3 posts → first discovery ───────────────────────────
    addPosts(FIRST_SLOT);
    const d1 = nextDiscovery();
    if (d1) addInsert(d1);

    // ── Slot 2: 4 posts → HIO or next discovery ──────────────────────
    addPosts(SECOND_SLOT);
    if (hio && !hioInserted) {
      addInsert(hio);
      hioInserted = true;
    } else {
      const d2 = nextDiscovery();
      if (d2) addInsert(d2);
    }

    // ── Slot 3: 4 posts → activity or next discovery ─────────────────
    addPosts(THIRD_SLOT);
    if (activity && !activityInserted) {
      addInsert(activity);
      activityInserted = true;
    } else {
      const d3 = nextDiscovery();
      if (d3) addInsert(d3);
    }

    // ── Remaining: every SUBSEQUENT_GAP posts → cycling discovery ────
    // Activity / HIO also land here if not yet placed.
    while (postIndex < thoughts.length) {
      addPosts(SUBSEQUENT_GAP);

      if (activity && !activityInserted) {
        addInsert(activity);
        activityInserted = true;
      } else if (hio && !hioInserted) {
        addInsert(hio);
        hioInserted = true;
      } else {
        const dn = nextDiscovery();
        if (dn) addInsert(dn);
      }
    }

    return result;
  })();

  return {
    feedWithInserts,
    handleDismissInsert,
    refreshInserts,
  };
}