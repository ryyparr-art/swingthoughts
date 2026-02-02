/**
 * Leaderboard Screen (Refactored)
 * 
 * Displays regional golf course leaderboards.
 * 
 * Architecture:
 * - useLeaderboardData hook handles all data fetching, processing, and caching
 * - This file handles UI rendering and interactions only
 * 
 * Features:
 * - Near Me view (default) with pinned leaderboard
 * - Filter by specific course, player, or partners
 * - 9-hole and 18-hole support
 * - Highlight scores from notifications
 * - Pull-to-refresh
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { auth, db } from "@/constants/firebaseConfig";
import {
  CourseBoard,
  FilterType,
  HoleCount,
  useLeaderboardData,
} from "@/hooks/useLeaderboardData";
import { soundPlayer } from "@/utils/soundPlayer";

// Components
import AllCoursesLeaderboardModal from "@/components/modals/AllCoursesLeaderboardModal";
import BottomActionBar from "@/components/navigation/BottomActionBar";
import LowmanCarousel from "@/components/navigation/LowmanCarousel";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";

const LowLeaderTrophy = require("@/assets/icons/LowLeaderTrophy.png");
const LocationIcon = require("@/assets/icons/Location Near Me.png");

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function LeaderboardScreen() {
  const params = useLocalSearchParams();
  const listRef = useRef<FlatList<CourseBoard>>(null);
  const hasReordered = useRef(false);

  /* ---------------------------------------------------------------- */
  /* PARSE URL PARAMS                                                 */
  /* ---------------------------------------------------------------- */

  const filterType = useMemo(() => {
    let raw = params?.filterType;
    if (Array.isArray(raw)) raw = raw[0];
    return (raw as FilterType) || "nearMe";
  }, [params?.filterType]);

  const filterCourseId = useMemo(() => {
    let raw = params?.courseId;
    if (Array.isArray(raw)) raw = raw[0];
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [params?.courseId]);

  const filterCourseName = useMemo(() => {
    let raw = params?.courseName;
    if (Array.isArray(raw)) raw = raw[0];
    return (raw as string) || null;
  }, [params?.courseName]);

  const filterPlayerId = useMemo(() => {
    let raw = params?.playerId;
    if (Array.isArray(raw)) raw = raw[0];
    return (raw as string) || null;
  }, [params?.playerId]);

  const filterPlayerName = useMemo(() => {
    let raw = params?.playerName;
    if (Array.isArray(raw)) raw = raw[0];
    return (raw as string) || null;
  }, [params?.playerName]);

  const holeCount = useMemo(() => {
    let raw = params?.holeCount;
    if (Array.isArray(raw)) raw = raw[0];
    return (raw as HoleCount) || "18";
  }, [params?.holeCount]);

  // Highlight params (from notifications)
  const highlightCourseId = useMemo(() => {
    let raw = params?.highlightCourseId;
    if (Array.isArray(raw)) raw = raw[0];
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [params?.highlightCourseId]);

  const highlightUserId = useMemo(() => {
    let raw = params?.highlightUserId;
    if (Array.isArray(raw)) raw = raw[0];
    return (raw as string) || null;
  }, [params?.highlightUserId]);

  const highlightScoreId = useMemo(() => {
    let raw = params?.highlightScoreId;
    if (Array.isArray(raw)) raw = raw[0];
    return (raw as string) || null;
  }, [params?.highlightScoreId]);

  // Carousel navigation params
  const targetCourseId = useMemo(() => {
    if (highlightCourseId) return highlightCourseId;
    if (filterType === "course" && filterCourseId) return null;
    let raw = params?.courseId;
    if (Array.isArray(raw)) raw = raw[0];
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [params?.courseId, filterType, filterCourseId, highlightCourseId]);

  const targetPlayerId = useMemo(() => {
    if (highlightUserId) return highlightUserId;
    let playerId = params?.playerId;
    if (Array.isArray(playerId)) playerId = playerId[0];
    if (filterType === "player" && filterPlayerId === playerId) return null;
    return (playerId as string) || null;
  }, [params?.playerId, filterType, filterPlayerId, highlightUserId]);

  const shouldHighlight =
    !!(targetCourseId && targetPlayerId) || !!(highlightCourseId && highlightScoreId);

  /* ---------------------------------------------------------------- */
  /* USE LEADERBOARD DATA HOOK                                        */
  /* ---------------------------------------------------------------- */

  const {
    boards,
    pinnedBoard,
    displayedCourseIds,
    loading,
    showingCached,
    refreshing,
    userRegionKey,
    pinnedCourseId,
    setPinnedCourseId,
    fetchLeaderboards,
    onRefresh,
    loadPinnedCourseId,
  } = useLeaderboardData({
    filterType,
    filterCourseId,
    filterCourseName,
    filterPlayerId,
    filterPlayerName,
    holeCount,
  });

  /* ---------------------------------------------------------------- */
  /* LOCAL STATE                                                      */
  /* ---------------------------------------------------------------- */

  const [locationLabel, setLocationLabel] = useState("Nearby");
  const [loadMoreModalVisible, setLoadMoreModalVisible] = useState(false);
  const [localBoards, setLocalBoards] = useState<CourseBoard[]>([]);

  // Sync boards to local state for reordering
  useEffect(() => {
    setLocalBoards(boards);
  }, [boards]);

  // Load location label
  useEffect(() => {
    const loadLocation = async () => {
      if (filterType === "partnersOnly") {
        setLocationLabel("Partners");
        return;
      }
      
      if (filterType === "player") {
        setLocationLabel(filterPlayerName || "Player");
        return;
      }
      
      if (filterType === "course") {
        setLocationLabel(filterCourseName || "Course");
        return;
      }

      // For "nearMe", get user's city/state
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
          const userData = snap.data();
          const city = userData.currentCity || userData.city;
          const state = userData.currentState || userData.state;

          if (city && state) {
            setLocationLabel(`${city}, ${state}`);
          } else {
            setLocationLabel("Nearby");
          }
        }
      } catch (error) {
        console.error("Error loading location:", error);
        setLocationLabel("Nearby");
      }
    };

    loadLocation();
  }, [filterType, filterPlayerName, filterCourseName]);

  /* ---------------------------------------------------------------- */
  /* RESET REORDER FLAG ON PARAM CHANGE                               */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    hasReordered.current = false;
  }, [targetCourseId, targetPlayerId, highlightCourseId, highlightScoreId]);

  /* ---------------------------------------------------------------- */
  /* REORDER BOARDS WHEN TARGET CHANGES                               */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const highlightTarget = highlightCourseId || targetCourseId;

    if (!shouldHighlight || !highlightTarget || !localBoards.length) return;
    if (hasReordered.current) return;

    const targetIdx = localBoards.findIndex((b) => b.courseId === highlightTarget);

    if (targetIdx < 0) {
      hasReordered.current = true;
      return;
    }

    if (targetIdx === 0) {
      hasReordered.current = true;
      return;
    }

    const reordered = [...localBoards];
    const [targetBoard] = reordered.splice(targetIdx, 1);
    reordered.unshift(targetBoard);

    hasReordered.current = true;
    setLocalBoards(reordered);
  }, [shouldHighlight, targetCourseId, highlightCourseId, localBoards]);

  /* ---------------------------------------------------------------- */
  /* SCROLL TO TOP AFTER REORDER                                      */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!shouldHighlight) return;
    if (loading) return;
    if (!localBoards.length) return;

    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToOffset({
          offset: 0,
          animated: true,
        });
      } catch (err) {
        console.log("⚠️ Scroll error:", err);
      }
    }, 100);

    return () => clearTimeout(t);
  }, [shouldHighlight, loading, localBoards]);

  /* ---------------------------------------------------------------- */
  /* PIN/UNPIN HANDLERS                                               */
  /* ---------------------------------------------------------------- */

  const handlePinCourse = async (courseId: number, courseName: string) => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      if (pinnedCourseId === courseId) {
        soundPlayer.play("error");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert("Already Pinned", `${courseName} is already your pinned leaderboard.`);
        return;
      }

      if (pinnedCourseId) {
        soundPlayer.play("click");
        Alert.alert(
          "Replace Pinned Leaderboard",
          `You can only pin 1 leaderboard. Replace your current pin with ${courseName}?`,
          [
            { text: "Cancel", style: "cancel", onPress: () => soundPlayer.play("click") },
            {
              text: "Replace",
              onPress: async () => {
                soundPlayer.play("click");
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

                await updateDoc(doc(db, "users", uid), {
                  pinnedLeaderboard: {
                    courseId,
                    courseName,
                    pinnedAt: new Date(),
                  },
                });

                setPinnedCourseId(courseId);
                fetchLeaderboards();
              },
            },
          ]
        );
      } else {
        soundPlayer.play("click");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        await updateDoc(doc(db, "users", uid), {
          pinnedLeaderboard: {
            courseId,
            courseName,
            pinnedAt: new Date(),
          },
        });

        setPinnedCourseId(courseId);
        fetchLeaderboards();
      }
    } catch (error) {
      console.error("Error pinning course:", error);
      soundPlayer.play("error");
    }
  };

  const handleUnpinCourse = async () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      await updateDoc(doc(db, "users", uid), {
        pinnedLeaderboard: null,
      });

      setPinnedCourseId(null);
      fetchLeaderboards();
    } catch (error) {
      console.error("Error unpinning:", error);
      soundPlayer.play("error");
    }
  };

  /* ---------------------------------------------------------------- */
  /* NAVIGATION                                                       */
  /* ---------------------------------------------------------------- */

  const goToPlayer = (userId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/locker/${userId}`);
  };

  const goToCourse = (courseId: number) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/locker/course/${courseId}`);
  };

  const goToPostScore = (courseId: number) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: "/post-score", params: { courseId } });
  };

  /* ---------------------------------------------------------------- */
  /* RENDER LEADERBOARD CARD                                          */
  /* ---------------------------------------------------------------- */

  const renderLeaderboardCard = (
    board: CourseBoard,
    isPinned: boolean = false
  ) => {
    const highlightTarget = highlightCourseId || targetCourseId;
    const isHighlightedBoard = shouldHighlight && board.courseId === highlightTarget;
    const isPinnedIcon = pinnedCourseId === board.courseId;

    return (
      <View style={styles.board} key={`board-${board.courseId}`}>
        {/* Pinned header */}
        {isPinned && (
          <View style={styles.pinnedHeader}>
            <View style={styles.pinnedBadge}>
              <Text style={styles.pinnedBadgeText}>📌 PINNED</Text>
            </View>
            <TouchableOpacity style={styles.unpinButton} onPress={handleUnpinCourse}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          </View>
        )}

        {/* Course header */}
        <View style={styles.boardHeaderContainer}>
          <TouchableOpacity
            onPress={() => goToCourse(board.courseId)}
            style={styles.boardHeaderTouchable}
          >
            <View style={styles.boardHeader}>
              <Text style={styles.boardTitle}>{board.courseName}</Text>
              {board.location && (
                <Text style={styles.boardSubtitle}>
                  {board.location.city}, {board.location.state}
                  {board.distance != null && ` • ${board.distance.toFixed(1)} mi`}
                </Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Pin button (only for non-nearMe filters) */}
          {filterType !== "nearMe" && !isPinned && (
            <TouchableOpacity
              style={[styles.pinButton, isPinnedIcon && styles.pinButtonActive]}
              onPress={() => handlePinCourse(board.courseId, board.courseName)}
            >
              <Ionicons
                name={isPinnedIcon ? "pin" : "pin-outline"}
                size={20}
                color={isPinnedIcon ? "#FFD700" : "#666"}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Column header */}
        <View style={styles.rowHeader}>
          <Text style={styles.colPos}>POS</Text>
          <Text style={styles.colPlayer}>PLAYER</Text>
          <Text style={styles.colScore}>G</Text>
          <Text style={styles.colScore}>N</Text>
          <Text style={styles.colScore}>PAR</Text>
          {holeCount === "18" && <Text style={styles.colLow}>LOW</Text>}
        </View>

        {/* Rows */}
        {board.scores.length === 0 ? (
          <TouchableOpacity
            style={styles.emptyRow}
            onPress={() => goToPostScore(board.courseId)}
          >
            <Text style={styles.emptyTitle}>No {holeCount}-Hole Scores Yet</Text>
            <Text style={styles.emptyText}>
              Be the first to post a {holeCount}-hole score
              {holeCount === "18" && " and obtain your achievement"}! ⛳
            </Text>
          </TouchableOpacity>
        ) : (
          board.scores.map((s, i) => {
            const lowNet = Math.min(...board.scores.map((x) => x.netScore));
            const isLowman = s.netScore === lowNet;

            const isTargetRow =
              (highlightScoreId && s.scoreId === highlightScoreId) ||
              (highlightUserId && s.userId === highlightUserId && isHighlightedBoard && i === 0) ||
              (targetPlayerId && s.userId === targetPlayerId && isHighlightedBoard && i === 0);

            return (
              <View
                key={`score-${board.courseId}-${s.scoreId}-${i}`}
                style={[styles.row, isTargetRow && styles.rowHighlighted]}
              >
                <Text style={styles.colPos}>{i + 1}</Text>

                <TouchableOpacity
                  style={styles.playerCell}
                  onPress={() => goToPlayer(s.userId)}
                  activeOpacity={0.85}
                >
                  {s.userAvatar ? (
                    <Image source={{ uri: s.userAvatar }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback} />
                  )}

                  <Text
                    style={[styles.playerName, isTargetRow && styles.playerNameHighlighted]}
                    numberOfLines={1}
                  >
                    {s.displayName || s.userName}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.colScore}>{s.grossScore}</Text>
                <Text style={[styles.colScore, isLowman && holeCount === "18" && styles.lowNet]}>
                  {s.netScore}
                </Text>
                <Text style={styles.colScore}>{s.par || 72}</Text>
                {holeCount === "18" && (
                  <View style={styles.colLow}>
                    {isLowman && <Image source={LowLeaderTrophy} style={styles.trophyIcon} />}
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>
    );
  };

  /* ---------------------------------------------------------------- */
  /* RENDER                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      <View style={styles.carouselWrapper}>
        <LowmanCarousel courseIds={displayedCourseIds} />
      </View>

      <TopNavBar />

      {/* Location row */}
      <View style={styles.locationRow}>
        <Image source={LocationIcon} style={styles.locationIcon} />
        <Text style={styles.locationText}>{locationLabel}</Text>
      </View>

      {/* 9-hole indicator */}
      {holeCount === "9" && (
        <View style={styles.holeCountBadge}>
          <Text style={styles.holeCountBadgeText}>9-HOLE SCORES 🏌️</Text>
        </View>
      )}

      {/* Cache indicator */}
      {showingCached && !loading && (
        <View style={styles.cacheIndicator}>
          <ActivityIndicator size="small" color="#0D5C3A" />
          <Text style={styles.cacheText}>Updating leaderboards...</Text>
        </View>
      )}

      {/* Loading state */}
      {loading && !showingCached ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#0D5C3A" />
          <Text style={styles.loadingText}>Compiling Leaderboards...</Text>
        </View>
      ) : localBoards.length === 0 && !pinnedBoard ? (
        /* Empty state */
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No Leaderboards Found</Text>
          <Text style={styles.emptyStateText}>
            {filterType === "player"
              ? `${filterPlayerName} hasn't made it to any top 3 ${holeCount}-hole leaderboards yet`
              : filterType === "partnersOnly"
              ? `Your partners haven't made it to any top 3 ${holeCount}-hole leaderboards yet`
              : filterType === "course"
              ? `No ${holeCount}-hole scores posted at this course yet`
              : "No courses found in your area. Try searching for a course!"}
          </Text>
        </View>
      ) : (
        <>
          {/* Pinned leaderboard */}
          {pinnedBoard && filterType === "nearMe" && renderLeaderboardCard(pinnedBoard, true)}

          {/* Regular leaderboards */}
          <FlatList
            ref={listRef}
            data={localBoards}
            keyExtractor={(b, index) => `${b.courseId}-${index}`}
            contentContainerStyle={{ paddingBottom: 140 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#0D5C3A"
                colors={["#0D5C3A"]}
              />
            }
            ListFooterComponent={
              filterType === "nearMe" && localBoards.length > 0 ? (
                <View style={styles.loadMoreContainer}>
                  <TouchableOpacity
                    style={styles.loadMoreButton}
                    onPress={() => {
                      soundPlayer.play("click");
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setLoadMoreModalVisible(true);
                    }}
                  >
                    <Text style={styles.loadMoreText}>🔍 Find More Courses</Text>
                    <Text style={styles.loadMoreSubtext}>
                      View all courses and pin your favorite
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null
            }
            renderItem={({ item }) => renderLeaderboardCard(item)}
          />
        </>
      )}

      <BottomActionBar />
      <SwingFooter />

      {/* All Courses Modal */}
      <AllCoursesLeaderboardModal
        visible={loadMoreModalVisible}
        onClose={() => setLoadMoreModalVisible(false)}
        onPinChange={() => {
          loadPinnedCourseId();
          fetchLeaderboards();
        }}
      />
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  safeTop: { backgroundColor: "#0D5C3A" },
  carouselWrapper: { height: 50 },

  cacheIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    backgroundColor: "#FFF3CD",
    borderBottomWidth: 1,
    borderBottomColor: "#FFECB5",
  },
  cacheText: { fontSize: 12, color: "#664D03", fontWeight: "600" },

  loading: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  loadingText: { fontSize: 16, fontWeight: "700", color: "#0D5C3A", letterSpacing: 0.5 },

  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyStateTitle: { fontSize: 24, fontWeight: "900", color: "#0D5C3A", marginBottom: 12 },
  emptyStateText: { fontSize: 16, color: "#666", textAlign: "center", marginBottom: 24 },

  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
  },
  locationIcon: { width: 22, height: 22, tintColor: "#B0433B" },
  locationText: { fontWeight: "800", fontSize: 15 },

  holeCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#FFD700",
    borderBottomWidth: 2,
    borderBottomColor: "#C9A400",
  },
  holeCountBadgeText: { fontSize: 13, fontWeight: "900", color: "#0D5C3A", letterSpacing: 1 },

  pinnedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: "#FFFEF7",
    borderBottomWidth: 1,
    borderBottomColor: "#FFD700",
  },
  pinnedBadge: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pinnedBadgeText: { fontSize: 11, fontWeight: "900", color: "#0D5C3A", letterSpacing: 0.5 },
  unpinButton: { padding: 4 },

  board: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#DDD",
    backgroundColor: "#FFF",
    borderRadius: 8,
  },

  boardHeaderContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#DDD",
    paddingRight: 12,
  },
  boardHeaderTouchable: { flex: 1 },
  boardHeader: { padding: 12 },
  boardTitle: { fontWeight: "900", fontSize: 16, color: "#0D5C3A" },
  boardSubtitle: { fontWeight: "600", fontSize: 14, color: "#666", marginTop: 4 },

  pinButton: { padding: 8, borderRadius: 20, backgroundColor: "#F0F0F0" },
  pinButtonActive: { backgroundColor: "#0D5C3A" },

  rowHeader: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#F0F0F0",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderColor: "#EEE",
  },
  rowHighlighted: {
    borderWidth: 3,
    borderColor: "#FFD700",
    borderRadius: 4,
    marginVertical: 2,
    backgroundColor: "#FFFEF5",
  },
  playerNameHighlighted: { color: "#C9A400", fontWeight: "900" },

  colPos: { width: 40, fontWeight: "800", textAlign: "center" },
  colPlayer: { flex: 1, fontWeight: "800" },
  colScore: { width: 44, textAlign: "center", fontWeight: "700" },
  colLow: { width: 44, alignItems: "center", justifyContent: "center" },
  playerCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },

  avatar: { width: 26, height: 26, borderRadius: 13 },
  avatarFallback: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#CCC" },
  playerName: { fontWeight: "700", flexShrink: 1 },

  lowNet: { color: "#C9A400", fontWeight: "900" },
  trophyIcon: { width: 24, height: 24, resizeMode: "contain" },

  emptyRow: { padding: 24, alignItems: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "900", color: "#0D5C3A", marginBottom: 6 },
  emptyText: { fontSize: 14, fontWeight: "600", color: "#666", textAlign: "center" },

  loadMoreContainer: { padding: 16, paddingBottom: 40 },
  loadMoreButton: {
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  loadMoreText: { fontSize: 18, fontWeight: "900", color: "#FFF", marginBottom: 4 },
  loadMoreSubtext: { fontSize: 13, fontWeight: "600", color: "#FFD700" },
});