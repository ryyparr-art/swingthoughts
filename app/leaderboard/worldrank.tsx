/**
 * ST World Rankings (STWR)
 *
 * Full-screen leaderboard ordered by ST Power Rating.
 * Paginated 20 at a time from worldRankings collection.
 *
 * Features:
 * - Rank position, trend arrow, avatar, display name, badges, power rating
 * - Current user row highlighted + sticky footer if outside top 20
 * - Infinite scroll (load more)
 * - Pull-to-refresh
 * - Toggle back to course leaderboards via pill (router.replace)
 *
 * File: app/leaderboard/worldrank.tsx
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import {
  collection,
  doc,
  DocumentData,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryDocumentSnapshot,
  startAfter,
  where,
} from "firebase/firestore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";

import BadgeRow from "@/components/challenges/BadgeRow";
import BottomActionBar from "@/components/navigation/BottomActionBar";
import LowmanCarousel from "@/components/navigation/LowmanCarousel";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";

// ============================================================================
// TYPES
// ============================================================================

interface WorldRankEntry {
  userId: string;
  displayName: string;
  userAvatar: string | null;
  challengeBadges: string[];
  powerRating: number;
  rank: number;
  previousRating: number | null;
  roundsInWindow: number;
  isUnranked?: boolean;
}

const PAGE_SIZE = 20;

// Sentinel item used as section divider between ranked and unranked
const DIVIDER_ID = "__unranked_divider__";

// ============================================================================
// TREND ARROW
// ============================================================================

function TrendArrow({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) {
    return <Text style={styles.trendNew}>NEW</Text>;
  }
  const diff = current - previous;
  if (Math.abs(diff) < 0.1) {
    return <Ionicons name="remove" size={12} color="#999" />;
  }
  if (diff > 0) {
    return <Ionicons name="caret-up" size={12} color="#2E7D32" />;
  }
  return <Ionicons name="caret-down" size={12} color="#B0433B" />;
}

// ============================================================================
// RANK NUMBER — top 3 get gold/silver/bronze colour
// ============================================================================

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Text style={[styles.rankNum, styles.rank1]}>{rank}</Text>;
  if (rank === 2) return <Text style={[styles.rankNum, styles.rank2]}>{rank}</Text>;
  if (rank === 3) return <Text style={[styles.rankNum, styles.rank3]}>{rank}</Text>;
  return <Text style={styles.rankNum}>{rank}</Text>;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function WorldRankScreen() {
  const currentUserId = auth.currentUser?.uid ?? null;

  const [entries, setEntries] = useState<WorldRankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [myEntry, setMyEntry] = useState<WorldRankEntry | null>(null);
  const [myInList, setMyInList] = useState(false);

  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  // --------------------------------------------------------------------------
  // FETCH — ranked players first (ordered rank asc), then unranked appended
  // Pagination only applies to ranked section; unranked fetched once on load
  // --------------------------------------------------------------------------

  const lastUnrankedFetched = useRef(false);

  const fetchPage = useCallback(async (refresh = false) => {
    try {
      // --- Ranked players (rank != null) ---
      const q = refresh || !lastDocRef.current
        ? query(
            collection(db, "worldRankings"),
            where("rank", "!=", null),
            orderBy("rank", "asc"),
            limit(PAGE_SIZE)
          )
        : query(
            collection(db, "worldRankings"),
            where("rank", "!=", null),
            orderBy("rank", "asc"),
            startAfter(lastDocRef.current),
            limit(PAGE_SIZE)
          );

      const snap = await getDocs(q);
      const docs = snap.docs;

      const ranked: WorldRankEntry[] = docs.map((d) => {
        const data = d.data();
        return {
          userId: d.id,
          displayName: data.displayName || "Unknown",
          userAvatar: data.userAvatar || null,
          challengeBadges: data.challengeBadges || [],
          powerRating: data.powerRating ?? 0,
          rank: data.rank,
          previousRating: data.previousRating ?? null,
          roundsInWindow: data.roundsInWindow ?? 0,
          isUnranked: false,
        };
      });

      lastDocRef.current = docs.length > 0 ? docs[docs.length - 1] : null;
      const rankedHasMore = docs.length === PAGE_SIZE;
      setHasMore(rankedHasMore);

      // --- Unranked players (rank == null) — fetch once when ranked list exhausted ---
      let unranked: WorldRankEntry[] = [];
      if (!rankedHasMore && !lastUnrankedFetched.current) {
        lastUnrankedFetched.current = true;
        try {
          const unrankedSnap = await getDocs(
            query(
              collection(db, "worldRankings"),
              where("rank", "==", null),
              orderBy("powerRating", "desc"),
              limit(100)
            )
          );
          unranked = unrankedSnap.docs.map((d) => {
            const data = d.data();
            return {
              userId: d.id,
              displayName: data.displayName || "Unknown",
              userAvatar: data.userAvatar || null,
              challengeBadges: data.challengeBadges || [],
              powerRating: data.powerRating ?? 0,
              rank: 0, // sentinel — rendered differently
              previousRating: data.previousRating ?? null,
              roundsInWindow: data.roundsInWindow ?? 0,
              isUnranked: true,
            };
          });
        } catch (err) {
          console.error("STWR unranked fetch error:", err);
        }
      }

      return { ranked, unranked };
    } catch (err) {
      console.error("STWR fetch error:", err);
      return { ranked: [], unranked: [] };
    }
  }, []);

  const fetchMyEntry = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const snap = await getDoc(doc(db, "worldRankings", currentUserId));
      if (snap.exists()) {
        const data = snap.data();
        setMyEntry({
          userId: currentUserId,
          displayName: data.displayName || "You",
          userAvatar: data.userAvatar || null,
          challengeBadges: data.challengeBadges || [],
          powerRating: data.powerRating ?? 0,
          rank: data.rank,
          previousRating: data.previousRating ?? null,
          roundsInWindow: data.roundsInWindow ?? 0,
        });
      }
    } catch (err) {
      console.error("STWR my entry fetch error:", err);
    }
  }, [currentUserId]);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    lastDocRef.current = null;
    lastUnrankedFetched.current = false;
    const [result] = await Promise.all([fetchPage(true), fetchMyEntry()]);
    const divider: WorldRankEntry = {
      userId: DIVIDER_ID, displayName: "", userAvatar: null,
      challengeBadges: [], powerRating: 0, rank: 0,
      previousRating: null, roundsInWindow: 0, isUnranked: true,
    };
    const unrankedWithDivider = result.unranked.length > 0
      ? [divider, ...result.unranked]
      : [];
    setEntries([...result.ranked, ...unrankedWithDivider]);
    setLoading(false);
  }, [fetchPage, fetchMyEntry]);

  useEffect(() => {
    initialLoad();
  }, []);

  // Check if current user is visible in the loaded list
  useEffect(() => {
    if (!currentUserId) return;
    setMyInList(entries.some((e) => e.userId === currentUserId));
  }, [entries, currentUserId]);

  // --------------------------------------------------------------------------
  // REFRESH
  // --------------------------------------------------------------------------

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    lastDocRef.current = null;
    lastUnrankedFetched.current = false;
    const [result] = await Promise.all([fetchPage(true), fetchMyEntry()]);
    const divider: WorldRankEntry = {
      userId: DIVIDER_ID, displayName: "", userAvatar: null,
      challengeBadges: [], powerRating: 0, rank: 0,
      previousRating: null, roundsInWindow: 0, isUnranked: true,
    };
    const unrankedWithDivider = result.unranked.length > 0
      ? [divider, ...result.unranked]
      : [];
    setEntries([...result.ranked, ...unrankedWithDivider]);
    setRefreshing(false);
  }, [fetchPage, fetchMyEntry]);

  // --------------------------------------------------------------------------
  // LOAD MORE
  // --------------------------------------------------------------------------

  const onLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const result = await fetchPage(false);
    const divider: WorldRankEntry = {
      userId: DIVIDER_ID, displayName: "", userAvatar: null,
      challengeBadges: [], powerRating: 0, rank: 0,
      previousRating: null, roundsInWindow: 0, isUnranked: true,
    };
    const unrankedWithDivider = result.unranked.length > 0
      ? [divider, ...result.unranked]
      : [];
    setEntries((prev) => [...prev, ...result.ranked, ...unrankedWithDivider]);
    setLoadingMore(false);
  }, [loadingMore, hasMore, fetchPage]);

  // --------------------------------------------------------------------------
  // NAVIGATION
  // --------------------------------------------------------------------------

  const goToLeaderboards = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace("/leaderboard" as any);
  };

  const goToProfile = (userId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/profile/${userId}` as any);
  };

  const showInfo = () => {
    Alert.alert(
      "How ST World Rankings Work",
      "Your ST Power Rating is built from your performance across every round you post in the last 52 weeks. Stroke play carries the most weight, with other formats like scrambles and match play contributing at a reduced rate.\n\nThe context of your round matters too — league, invitational, and tour rounds are worth significantly more than casual or solo play.\n\nCompleting challenges also factors into your rating, rewarding well-rounded golfers who compete beyond just stroke play.\n\nRounds hold full value for 8 weeks then decay over 52, so recent form always matters most. Your Rank is simply where your Power Rating places you against every other player. You need at least 3 rounds in the window to earn an official ranking.",
      [{ text: "Got it", style: "default" }]
    );
  };

  // --------------------------------------------------------------------------
  // RENDER ROW
  // --------------------------------------------------------------------------

  const renderRow = useCallback(
    (entry: WorldRankEntry, isMyRow = false) => (
      <TouchableOpacity
        key={entry.userId}
        style={[styles.row, isMyRow && styles.myRow]}
        onPress={() => goToProfile(entry.userId)}
        activeOpacity={0.8}
      >
        {/* Rank + trend */}
        <View style={styles.rankCol}>
          {entry.isUnranked
            ? <Text style={styles.rankDash}>—</Text>
            : <RankBadge rank={entry.rank} />
          }
          <TrendArrow current={entry.powerRating} previous={entry.previousRating} />
        </View>

        {/* Avatar */}
        {entry.userAvatar ? (
          <ExpoImage
            source={{ uri: entry.userAvatar }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitial}>
              {(entry.displayName || "?").charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        {/* Name + badges */}
        <View style={styles.playerCell}>
          <Text
            style={[styles.playerName, isMyRow && styles.myPlayerName]}
            numberOfLines={1}
          >
            {entry.displayName}{isMyRow ? " (You)" : ""}
          </Text>
          {entry.challengeBadges?.length > 0 && (
            <BadgeRow challengeBadges={entry.challengeBadges} size={12} />
          )}
        </View>

        {/* Power rating */}
        <View style={styles.ratingCol}>
          <Text style={[styles.ratingValue, isMyRow && styles.myRatingValue]}>
            {entry.powerRating.toFixed(1)}
          </Text>
          <Text style={styles.ratingLabel}>STWR</Text>
        </View>
      </TouchableOpacity>
    ),
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: WorldRankEntry }) => {
      if (item.userId === DIVIDER_ID) {
        return (
          <View style={styles.sectionDivider}>
            <View style={styles.sectionDividerLine} />
            <Text style={styles.sectionDividerText}>UNRANKED</Text>
            <View style={styles.sectionDividerLine} />
          </View>
        );
      }
      return renderRow(item, item.userId === currentUserId);
    },
    [renderRow, currentUserId]
  );

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      <View style={styles.carouselWrapper}>
        <LowmanCarousel courseIds={[]} />
      </View>

      <TopNavBar />

      {/* Header */}
      <View style={styles.headerRow}>
        <Ionicons name="globe-outline" size={18} color="#0D5C3A" />
        <Text style={styles.headerTitle}>ST World Rankings</Text>

        {/* Info icon */}
        <TouchableOpacity
          onPress={showInfo}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="information-circle-outline" size={20} color="#8B7355" />
        </TouchableOpacity>

        {/* Toggle back pill */}
        <TouchableOpacity
          style={styles.boardsToggle}
          onPress={goToLeaderboards}
          activeOpacity={0.8}
        >
          <Ionicons name="trophy-outline" size={13} color="#F4EED8" />
          <Text style={styles.boardsToggleText}>BOARDS</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.subRow}>
        <Text style={styles.subText}>Updated weekly · Decays over 52 weeks</Text>
      </View>

      {/* Column headers */}
      <View style={styles.colHeader}>
        <Text style={[styles.colHeaderText, { width: 52 }]}>RANK</Text>
        <Text style={[styles.colHeaderText, { width: 36 }]}> </Text>
        <Text style={[styles.colHeaderText, { flex: 1 }]}>PLAYER</Text>
        <Text style={[styles.colHeaderText, { width: 60, textAlign: "right" }]}>RATING</Text>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#0D5C3A" />
          <Text style={styles.loadingText}>Loading World Rankings...</Text>
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No Rankings Yet</Text>
          <Text style={styles.emptyText}>
            Post rounds to build your ST Power Rating and appear on the world rankings.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.userId || DIVIDER_ID}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: myInList ? 140 : 220 }}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0D5C3A"
              colors={["#0D5C3A"]}
            />
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadMoreSpinner}>
                <ActivityIndicator size="small" color="#0D5C3A" />
              </View>
            ) : !hasMore && entries.length > 0 ? (
              <View style={styles.endOfList}>
                <Text style={styles.endOfListText}>· END OF RANKINGS ·</Text>
              </View>
            ) : null
          }
        />
      )}

      {/* Sticky my-rank footer */}
      {!loading && !myInList && myEntry && (
        <TouchableOpacity
          style={styles.stickyMyRank}
          onPress={() => goToProfile(myEntry.userId)}
          activeOpacity={0.9}
        >
          <View style={styles.stickyRankCol}>
            <Text style={styles.stickyRankNum}>#{myEntry.rank}</Text>
            <TrendArrow current={myEntry.powerRating} previous={myEntry.previousRating} />
          </View>

          {myEntry.userAvatar ? (
            <ExpoImage
              source={{ uri: myEntry.userAvatar }}
              style={styles.stickyAvatar}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.stickyAvatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {(myEntry.displayName || "?").charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <View style={styles.stickyPlayerCell}>
            <Text style={styles.stickyName} numberOfLines={1}>
              {myEntry.displayName}{" "}
              <Text style={styles.stickyYou}>(You)</Text>
            </Text>
            {myEntry.challengeBadges?.length > 0 && (
              <BadgeRow challengeBadges={myEntry.challengeBadges} size={10} />
            )}
          </View>

          <View style={styles.stickyRatingCol}>
            <Text style={styles.stickyRatingValue}>{myEntry.powerRating.toFixed(1)}</Text>
            <Text style={styles.stickyRatingLabel}>STWR</Text>
          </View>
        </TouchableOpacity>
      )}

      <BottomActionBar />
      <SwingFooter />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  safeTop: { backgroundColor: "#0D5C3A" },
  carouselWrapper: { height: 50 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    fontWeight: "800",
    fontSize: 15,
    color: "#1A1A1A",
  },
  boardsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#C5A55A",
  },
  boardsToggleText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#F4EED8",
    letterSpacing: 1.5,
  },

  subRow: { paddingHorizontal: 16, paddingBottom: 6 },
  subText: { fontSize: 11, color: "#8B7355", fontWeight: "600", letterSpacing: 0.3 },

  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#F0F0F0",
  },
  colHeaderText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#0D5C3A",
    letterSpacing: 1,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderColor: "#EEE",
    backgroundColor: "#FFF",
  },
  myRow: {
    backgroundColor: "#F0F7F1",
    borderLeftWidth: 3,
    borderLeftColor: "#0D5C3A",
  },

  rankCol: { width: 52, alignItems: "center", gap: 2 },
  rankNum: { fontSize: 15, fontWeight: "800", color: "#4A3628", textAlign: "center" },
  rank1: { color: "#C5A55A", fontWeight: "900" },
  rank2: { color: "#888" },
  rank3: { color: "#A0522D" },
  rankDash: { fontSize: 15, fontWeight: "700", color: "#BBB", textAlign: "center" },
  trendNew: { fontSize: 8, fontWeight: "900", color: "#0D5C3A", letterSpacing: 0.5 },

  avatar: { width: 26, height: 26, borderRadius: 13 },
  avatarFallback: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: "#0D5C3A",
    alignItems: "center", justifyContent: "center",
  },
  avatarInitial: { fontSize: 11, fontWeight: "700", color: "#F4EED8" },

  playerCell: {
    flex: 1, flexDirection: "row", alignItems: "center",
    gap: 8, minWidth: 0, marginLeft: 8,
  },
  playerName: { fontWeight: "700", fontSize: 14, flexShrink: 1, color: "#1A1A1A" },
  myPlayerName: { color: "#0D5C3A", fontWeight: "800" },

  ratingCol: { width: 60, alignItems: "flex-end" },
  ratingValue: { fontSize: 15, fontWeight: "900", color: "#4A3628" },
  myRatingValue: { color: "#0D5C3A" },
  ratingLabel: { fontSize: 8, fontWeight: "700", color: "#8B7355", letterSpacing: 1 },

  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  loadingText: { fontSize: 15, fontWeight: "700", color: "#0D5C3A" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyTitle: { fontSize: 22, fontWeight: "900", color: "#0D5C3A", marginBottom: 10 },
  emptyText: { fontSize: 15, color: "#666", textAlign: "center" },

  loadMoreSpinner: { paddingVertical: 20, alignItems: "center" },
  endOfList: { paddingVertical: 24, alignItems: "center" },
  endOfListText: { fontSize: 11, fontWeight: "700", color: "#8B7355", letterSpacing: 2 },

  stickyMyRank: {
    position: "absolute",
    bottom: 100,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#0D5C3A",
    borderTopWidth: 2,
    borderTopColor: "#C5A55A",
    gap: 8,
  },
  stickyRankCol: { width: 52, alignItems: "center", gap: 2 },
  stickyRankNum: { fontSize: 15, fontWeight: "900", color: "#C5A55A" },
  stickyAvatar: { width: 26, height: 26, borderRadius: 13 },
  stickyPlayerCell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  stickyName: { fontSize: 13, fontWeight: "700", color: "#F4EED8", flexShrink: 1 },
  stickyYou: { fontSize: 11, fontWeight: "600", color: "#C5A55A" },
  stickyRatingCol: { width: 60, alignItems: "flex-end" },
  stickyRatingValue: { fontSize: 15, fontWeight: "900", color: "#F4EED8" },
  stickyRatingLabel: { fontSize: 8, fontWeight: "700", color: "#C5A55A", letterSpacing: 1 },

  sectionDivider: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12, gap: 10,
    backgroundColor: "#F4EED8",
  },
  sectionDividerLine: { flex: 1, height: 1, backgroundColor: "#C5A55A" },
  sectionDividerText: { fontSize: 10, fontWeight: "900", color: "#8B7355", letterSpacing: 2 },
});