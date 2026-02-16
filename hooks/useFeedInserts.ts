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
import type { FeedInsert } from "@/utils/feedInsertTypes";
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
    // If filtered, loading, or no inserts, just return posts
    if (hasActiveFilters || inserts.length === 0 || thoughts.length === 0) {
      return thoughts.map((t) => ({ ...t, _feedItemType: "post" as const }));
    }

    // Filter out dismissed inserts
    const activeInserts = inserts.filter(
      (ins) => !dismissedKeys.has(ins.dismissKey)
    );

    if (activeInserts.length === 0) {
      return thoughts.map((t) => ({ ...t, _feedItemType: "post" as const }));
    }

    // Separate insert types
    const hio = activeInserts.find((ins) => ins.type === "hole_in_one");
    const activity = activeInserts.find((ins) => ins.type === "activity");
    const discoveries = activeInserts.filter((ins) => ins.type === "discovery");

    // Build the merged array
    const result: FeedListItem[] = [];
    let postIndex = 0;
    let discoveryIndex = 0;
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
        _insertId: `insert_${insert.type}_${insert.dismissKey}`,
      } as FeedListItem);
    };

    // Slot 1: First posts, then first discovery
    addPosts(FIRST_SLOT);
    if (discoveries[discoveryIndex]) {
      addInsert(discoveries[discoveryIndex]);
      discoveryIndex++;
    }

    // Slot 2: Next posts, then HIO (if available) or second discovery
    addPosts(SECOND_SLOT);
    if (hio && !hioInserted) {
      addInsert(hio);
      hioInserted = true;
    } else if (discoveries[discoveryIndex]) {
      addInsert(discoveries[discoveryIndex]);
      discoveryIndex++;
    }

    // Slot 3: Next posts, then activity carousel (if available) or next discovery
    addPosts(THIRD_SLOT);
    if (activity && !activityInserted) {
      addInsert(activity);
      activityInserted = true;
    } else if (discoveries[discoveryIndex]) {
      addInsert(discoveries[discoveryIndex]);
      discoveryIndex++;
    }

    // Remaining: alternate discoveries every SUBSEQUENT_GAP posts
    // Also insert activity/HIO here if they haven't been placed yet
    while (postIndex < thoughts.length) {
      addPosts(SUBSEQUENT_GAP);

      if (activity && !activityInserted) {
        addInsert(activity);
        activityInserted = true;
      } else if (hio && !hioInserted) {
        addInsert(hio);
        hioInserted = true;
      } else if (discoveryIndex < discoveries.length) {
        addInsert(discoveries[discoveryIndex]);
        discoveryIndex++;
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