import AllCoursesLeaderboardModal from "@/components/modals/AllCoursesLeaderboardModal";
import BottomActionBar from "@/components/navigation/BottomActionBar";
import LowmanCarousel from "@/components/navigation/LowmanCarousel";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";
import { getCourseById } from "@/utils/courseHelpers";
import { milesBetween } from "@/utils/geo";
import {
  getLeaderboard,
  getLeaderboardsByPartners,
  getLeaderboardsByPlayer,
  getLeaderboardsByRegion,
  hydrateLeaderboardsForRegion,
} from "@/utils/leaderboardHelpers";
import { findNearestRegions } from "@/utils/regionHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
const LowLeaderTrophy = require("@/assets/icons/LowLeaderTrophy.png");

import { Ionicons } from "@expo/vector-icons";
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";

import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/* ------------------------------------------------------------------ */
/* TYPES                                                              */
/* ------------------------------------------------------------------ */

interface Score {
  scoreId: string;
  userId: string;
  courseId: number;
  courseName: string;
  grossScore: number;
  netScore: number;
  par: number;
  tees: string;
  teePar: number;
  teeYardage: number;
  createdAt: any;
  userName?: string;
  userAvatar?: string | null;
}

interface CourseBoard {
  courseId: number;
  courseName: string;
  scores: Score[];
  distance?: number;
  location?: {
    city?: string;
    state?: string;
  };
}

/* ------------------------------------------------------------------ */

export default function LeaderboardScreen() {
  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<CourseBoard[]>([]);
  const [pinnedBoard, setPinnedBoard] = useState<CourseBoard | null>(null);
  const [locationLabel, setLocationLabel] = useState("Nearby");
  const [displayedCourseIds, setDisplayedCourseIds] = useState<number[]>([]);
  const [loadMoreModalVisible, setLoadMoreModalVisible] = useState(false);
  const [pinnedCourseId, setPinnedCourseId] = useState<number | null>(null);

  const LocationIcon = require("@/assets/icons/Location Near Me.png");

  const params = useLocalSearchParams();

  // ✅ FILTER PARAMS
  const filterType = useMemo(() => {
    let raw = params?.filterType;
    if (Array.isArray(raw)) raw = raw[0];
    return (raw as "nearMe" | "course" | "player" | "partnersOnly") || "nearMe";
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

  // ✅ HIGHLIGHT PARAMS (from notifications)
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

  // ✅ CAROUSEL NAVIGATION PARAMS
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

  const listRef = useRef<FlatList<CourseBoard>>(null);
  const hasReordered = useRef(false);

  /* ---------------------- RESET REORDER FLAG ON PARAM CHANGE ---------------------- */

  useEffect(() => {
    hasReordered.current = false;
  }, [targetCourseId, targetPlayerId, highlightCourseId, highlightScoreId]);

  /* ---------------------- LOAD USER LOCATION ---------------------- */

  useEffect(() => {
    const loadLocation = async () => {
      if (filterType === "partnersOnly") {
        setLocationLabel("Partners");
        return;
      }

      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const userData = snap.data();
        const city = userData.currentCity || userData.city;
        const state = userData.currentState || userData.state;

        if (city && state) {
          setLocationLabel(`${city}, ${state}`);
        }
      }
    };

    loadLocation();
  }, [filterType]);

  /* ---------------------- LOAD PARTNER USER IDS ---------------------- */

  const loadPartnerUserIds = async (userId: string): Promise<string[]> => {
    try {
      const partnersQuery1 = query(
        collection(db, "partners"),
        where("user1Id", "==", userId)
      );
      const partnersQuery2 = query(
        collection(db, "partners"),
        where("user2Id", "==", userId)
      );

      const [snap1, snap2] = await Promise.all([
        getDocs(partnersQuery1),
        getDocs(partnersQuery2),
      ]);

      const partnerIds = new Set<string>();

      snap1.forEach((doc) => {
        const data = doc.data();
        partnerIds.add(data.user2Id);
      });

      snap2.forEach((doc) => {
        const data = doc.data();
        partnerIds.add(data.user1Id);
      });

      return Array.from(partnerIds);
    } catch (error) {
      console.error("Error loading partners:", error);
      soundPlayer.play("error");
      return [];
    }
  };

  /* ---------------------- LOAD PINNED COURSE ID ---------------------- */

  useEffect(() => {
    loadPinnedCourseId();
  }, []);

  const loadPinnedCourseId = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        const pinned = userDoc.data()?.pinnedLeaderboard;
        if (pinned?.courseId) {
          setPinnedCourseId(pinned.courseId);
          console.log("📌 Loaded pinned course ID:", pinned.courseId);
        }
      }
    } catch (error) {
      console.error("Error loading pinned course ID:", error);
    }
  };

  /* ---------------------- FETCH LEADERBOARDS ---------------------- */

  useEffect(() => {
    fetchLeaderboards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterCourseId, filterPlayerId]);

  const fetchLeaderboards = async () => {
    try {
      setLoading(true);
      const uid = auth.currentUser?.uid;

      if (!uid) {
        console.log("❌ No user authenticated");
        soundPlayer.play("error");
        setLoading(false);
        return;
      }

      // Get user data
      const userDoc = await getDoc(doc(db, "users", uid));
      if (!userDoc.exists()) {
        console.log("❌ User document not found");
        setLoading(false);
        return;
      }

      const userData = userDoc.data();
      const userRegionKey = userData.regionKey;
      const userLat = userData.currentLatitude || userData.latitude;
      const userLon = userData.currentLongitude || userData.longitude;

      if (!userRegionKey) {
        console.log("⚠️ User has no regionKey - needs migration");
        setLoading(false);
        return;
      }

      let leaderboards: any[] = [];
      let displayedIds: number[] = [];

      // ============================================================
      // HANDLE DIFFERENT FILTER TYPES
      // ============================================================

      if (filterType === "course" && filterCourseId) {
        // ✅ SPECIFIC COURSE FILTER
        console.log("🔍 Filter: Specific Course -", filterCourseName);

        // Get course to find its regionKey
        const course = await getCourseById(filterCourseId);

        if (!course) {
          console.log("⚠️ Course not found:", filterCourseId);
          setBoards([]);
          setDisplayedCourseIds([]);
          setLoading(false);
          return;
        }

        // Fetch leaderboard from course's region
        const leaderboard = await getLeaderboard(course.regionKey, filterCourseId);

        if (leaderboard) {
          leaderboards = [leaderboard];
        } else {
          // No leaderboard exists - show empty state
          leaderboards = [
            {
              courseId: filterCourseId,
              courseName: filterCourseName || course.course_name,
              topScores: [],
              location: course.location
                ? { city: course.location.city, state: course.location.state }
                : undefined,
            },
          ];
        }

        displayedIds = [filterCourseId];
      } else if (filterType === "partnersOnly") {
        // ✅ PARTNERS ONLY FILTER
        console.log("🔍 Filter: Partners Only");

        const partnerIds = await loadPartnerUserIds(uid);

        if (partnerIds.length === 0) {
          console.log("⚠️ User has no partners");
          setBoards([]);
          setDisplayedCourseIds([]);
          setLoading(false);
          return;
        }

        console.log(`📊 User has ${partnerIds.length} partners`);

        // Query leaderboards where partners appear in top 3
        leaderboards = await getLeaderboardsByPartners(partnerIds);

        displayedIds = leaderboards.map((lb: any) => lb.courseId);

        console.log("📊 Partners have top scores at", displayedIds.length, "courses");
      } else if (filterType === "player" && filterPlayerId) {
        // ✅ SPECIFIC PLAYER FILTER
        console.log("🔍 Filter: Specific Player -", filterPlayerName);

        // Query leaderboards where player appears in top 3
        leaderboards = await getLeaderboardsByPlayer(filterPlayerId);

        displayedIds = leaderboards.map((lb: any) => lb.courseId);

        console.log("📊 Player has top scores at", displayedIds.length, "courses");
      } else {
        // ✅ NEAR ME (DEFAULT)
        console.log("🔍 Filter: Near Me");

        // Query leaderboards in user's region
        leaderboards = await getLeaderboardsByRegion(userRegionKey);

        console.log(`📦 Found ${leaderboards.length} leaderboards in ${userRegionKey}`);

        // If no leaderboards, try to hydrate
        if (leaderboards.length === 0) {
          console.log("⚠️ No leaderboards in region, attempting hydration...");

          const hydrated = await hydrateLeaderboardsForRegion(userRegionKey);

          if (hydrated > 0) {
            // Re-fetch after hydration
            leaderboards = await getLeaderboardsByRegion(userRegionKey);
            console.log(`✅ After hydration: ${leaderboards.length} leaderboards`);
          } else {
            console.log("⚠️ No courses to hydrate in region");
          }
        }

        // If still no leaderboards, expand to nearby regions
        if (leaderboards.length < 3 && userLat && userLon) {
          console.log("📍 Expanding to nearby regions...");

          const nearbyRegions = findNearestRegions(userLat, userLon, 3, 100);

          for (const { region } of nearbyRegions) {
            if (leaderboards.length >= 3) break;

            const moreBoards = await getLeaderboardsByRegion(region.key);
            leaderboards.push(...moreBoards);

            console.log(`✅ Added ${moreBoards.length} from ${region.displayName}`);
          }
        }

        displayedIds = leaderboards.map((lb: any) => lb.courseId);
      }

      console.log("📦 Total leaderboards to show:", leaderboards.length);

      if (leaderboards.length === 0) {
        console.log("⚠️ No leaderboards to display");
        setBoards([]);
        setDisplayedCourseIds([]);
        setLoading(false);
        return;
      }

      // ============================================================
      // CALCULATE DISTANCES & BUILD BOARDS
      // ============================================================

      const boardsWithDistance: CourseBoard[] = [];

      for (const leaderboard of leaderboards) {
        // Get course details for distance calculation
        const courseQuery = query(
          collection(db, "courses"),
          where("id", "==", leaderboard.courseId)
        );
        const courseSnap = await getDocs(courseQuery);

        let distance: number | undefined;
        let location = leaderboard.location;

        if (!courseSnap.empty) {
          const courseData = courseSnap.docs[0].data();
          if (courseData.location?.latitude && courseData.location?.longitude && userLat && userLon) {
            distance = milesBetween(
              userLat,
              userLon,
              courseData.location.latitude,
              courseData.location.longitude
            );
          }

          if (!location && courseData.location) {
            location = {
              city: courseData.location.city,
              state: courseData.location.state,
            };
          }
        }

        boardsWithDistance.push({
          courseId: leaderboard.courseId,
          courseName: leaderboard.courseName,
          scores: leaderboard.topScores || [],
          distance,
          location,
        });
      }

      // Sort by distance (closest first)
      boardsWithDistance.sort((a, b) => (a.distance || 999) - (b.distance || 999));

      console.log("✅ Built leaderboards with distances");

      // ============================================================
      // HANDLE PINNED LEADERBOARD (ONLY FOR NEAR ME)
      // ============================================================

      if (filterType === "nearMe") {
        const pinnedLeaderboard = userData.pinnedLeaderboard;

        if (pinnedLeaderboard?.courseId) {
          console.log("📌 Loading pinned leaderboard:", pinnedLeaderboard.courseName);

          // Get course to find its regionKey
          const pinnedCourse = await getCourseById(pinnedLeaderboard.courseId);

          if (pinnedCourse) {
            // Fetch pre-computed leaderboard
            const pinnedLB = await getLeaderboard(
              pinnedCourse.regionKey,
              pinnedLeaderboard.courseId
            );

            if (pinnedLB) {
              // Calculate distance
              let pinnedDistance: number | undefined;
              if (
                pinnedCourse.location?.latitude &&
                pinnedCourse.location?.longitude &&
                userLat &&
                userLon
              ) {
                pinnedDistance = milesBetween(
                  userLat,
                  userLon,
                  pinnedCourse.location.latitude,
                  pinnedCourse.location.longitude
                );
              }

              const pinnedBoardData: CourseBoard = {
                courseId: pinnedLB.courseId,
                courseName: pinnedLB.courseName,
                scores: pinnedLB.topScores || [],
                distance: pinnedDistance,
                location: pinnedCourse.location
                  ? {
                      city: pinnedCourse.location.city,
                      state: pinnedCourse.location.state,
                    }
                  : undefined,
              };

              setPinnedBoard(pinnedBoardData);

              // Remove pinned from main boards and keep top 2
              const boardsWithoutPinned = boardsWithDistance.filter(
                (b) => b.courseId !== pinnedLeaderboard.courseId
              );
              const top2Boards = boardsWithoutPinned.slice(0, 2);

              setBoards(top2Boards);
              setDisplayedCourseIds(top2Boards.map((b) => b.courseId));

              console.log("✅ Set pinned board at top, showing top 2 others below");
            } else {
              // No leaderboard for pinned course - create empty
              const pinnedBoardData: CourseBoard = {
                courseId: pinnedLeaderboard.courseId,
                courseName: pinnedLeaderboard.courseName,
                scores: [],
                location: pinnedCourse.location
                  ? {
                      city: pinnedCourse.location.city,
                      state: pinnedCourse.location.state,
                    }
                  : undefined,
              };

              setPinnedBoard(pinnedBoardData);

              const boardsWithoutPinned = boardsWithDistance.filter(
                (b) => b.courseId !== pinnedLeaderboard.courseId
              );
              const top2Boards = boardsWithoutPinned.slice(0, 2);

              setBoards(top2Boards);
              setDisplayedCourseIds(top2Boards.map((b) => b.courseId));
            }
          } else {
            // Pinned course not found
            setPinnedBoard(null);
            const top3Boards = boardsWithDistance.slice(0, 3);
            setBoards(top3Boards);
            setDisplayedCourseIds(top3Boards.map((b) => b.courseId));
          }
        } else {
          // No pinned board
          setPinnedBoard(null);
          const top3Boards = boardsWithDistance.slice(0, 3);
          setBoards(top3Boards);
          setDisplayedCourseIds(top3Boards.map((b) => b.courseId));
        }
      } else {
        // Other filters don't show pinned
        setPinnedBoard(null);
        setBoards(boardsWithDistance);
        setDisplayedCourseIds(displayedIds);
      }

      setLoading(false);
    } catch (e) {
      console.error("Leaderboard error:", e);
      soundPlayer.play("error");
      setLoading(false);
    }
  };

  /* ---------------------- REORDER BOARDS WHEN TARGET CHANGES ---------------------- */

  useEffect(() => {
    const highlightTarget = highlightCourseId || targetCourseId;

    if (!shouldHighlight || !highlightTarget || !boards.length) return;
    if (hasReordered.current) return;

    const targetIdx = boards.findIndex((b) => b.courseId === highlightTarget);

    if (targetIdx < 0) {
      hasReordered.current = true;
      return;
    }

    if (targetIdx === 0) {
      hasReordered.current = true;
      return;
    }

    const reordered = [...boards];
    const [targetBoard] = reordered.splice(targetIdx, 1);
    reordered.unshift(targetBoard);

    hasReordered.current = true;
    setBoards(reordered);
  }, [shouldHighlight, targetCourseId, highlightCourseId, boards]);

  /* ---------------------- SCROLL TO TOP AFTER REORDER ---------------------- */

  useEffect(() => {
    if (!shouldHighlight) return;
    if (loading) return;
    if (!boards.length) return;

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
  }, [shouldHighlight, loading, boards]);

  /* ---------------------- PIN/UNPIN HANDLERS ---------------------- */

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
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => {
                soundPlayer.play("click");
              },
            },
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

  /* ---------------------- INTERACTIONS ---------------------- */

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
    router.push({
      pathname: "/post-score",
      params: { courseId },
    });
  };

  /* ---------------------- RENDER ---------------------- */

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      <View style={styles.carouselWrapper}>
        <LowmanCarousel courseIds={displayedCourseIds} />
      </View>

      <TopNavBar />

      {/* LOCATION ROW */}
      <View style={styles.locationRow}>
        <Image source={LocationIcon} style={styles.locationIcon} />
        <Text style={styles.locationText}>{locationLabel}</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#0D5C3A" />
        </View>
      ) : boards.length === 0 && !pinnedBoard ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No Leaderboards Found</Text>
          <Text style={styles.emptyStateText}>
            {filterType === "player"
              ? `${filterPlayerName} hasn't made it to any top 3 leaderboards yet`
              : filterType === "partnersOnly"
              ? "Your partners haven't made it to any top 3 leaderboards yet"
              : filterType === "course"
              ? "No scores posted at this course yet"
              : "No courses found in your area. Try searching for a course!"}
          </Text>
        </View>
      ) : (
        <>
          {/* PINNED LEADERBOARD */}
          {pinnedBoard && filterType === "nearMe" && (
            <View style={styles.board}>
              {/* PINNED BADGE + UNPIN BUTTON */}
              <View style={styles.pinnedHeader}>
                <View style={styles.pinnedBadge}>
                  <Text style={styles.pinnedBadgeText}>📌 PINNED</Text>
                </View>
                <TouchableOpacity
                  style={styles.unpinButton}
                  onPress={async () => {
                    soundPlayer.play("click");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    try {
                      const uid = auth.currentUser?.uid;
                      if (!uid) return;

                      await updateDoc(doc(db, "users", uid), {
                        pinnedLeaderboard: null,
                      });

                      setPinnedBoard(null);
                      setPinnedCourseId(null);
                      fetchLeaderboards();
                    } catch (error) {
                      console.error("Error unpinning:", error);
                      soundPlayer.play("error");
                    }
                  }}
                >
                  <Ionicons name="close-circle" size={20} color="#666" />
                </TouchableOpacity>
              </View>

              {/* COURSE HEADER */}
              <TouchableOpacity onPress={() => goToCourse(pinnedBoard.courseId)}>
                <View style={styles.boardHeader}>
                  <Text style={styles.boardTitle}>{pinnedBoard.courseName}</Text>
                  {pinnedBoard.location && (
                    <Text style={styles.boardSubtitle}>
                      {pinnedBoard.location.city}, {pinnedBoard.location.state}
                      {pinnedBoard.distance && ` • ${pinnedBoard.distance.toFixed(1)} mi`}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>

              {/* COLUMN HEADER */}
              <View style={styles.rowHeader}>
                <Text style={styles.colPos}>POS</Text>
                <Text style={styles.colPlayer}>PLAYER</Text>
                <Text style={styles.colScore}>G</Text>
                <Text style={styles.colScore}>N</Text>
                <Text style={styles.colScore}>PAR</Text>
                <Text style={styles.colLow}>LOW</Text>
              </View>

              {/* ROWS */}
              {pinnedBoard.scores.length === 0 ? (
                <TouchableOpacity
                  style={styles.emptyRow}
                  onPress={() => goToPostScore(pinnedBoard.courseId)}
                >
                  <Text style={styles.emptyTitle}>No Scores Yet</Text>
                  <Text style={styles.emptyText}>
                    Be the first to post a score and obtain your achievement! ⛳
                  </Text>
                </TouchableOpacity>
              ) : (
                pinnedBoard.scores.map((s, i) => {
                  const lowNet = Math.min(...pinnedBoard.scores.map((x) => x.netScore));
                  const isLowman = s.netScore === lowNet;

                  return (
                    <View key={s.scoreId} style={styles.row}>
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

                        <Text style={styles.playerName} numberOfLines={1}>
                          {s.userName}
                        </Text>
                      </TouchableOpacity>

                      <Text style={styles.colScore}>{s.grossScore}</Text>
                      <Text style={[styles.colScore, isLowman && styles.lowNet]}>
                        {s.netScore}
                      </Text>
                      <Text style={styles.colScore}>{s.par || 72}</Text>
                      <View style={styles.colLow}>
                        {isLowman && (
                          <Image source={LowLeaderTrophy} style={styles.trophyIcon} />
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* REGULAR LEADERBOARDS */}
          <FlatList
            ref={listRef}
            data={boards}
            keyExtractor={(b, index) => `${b.courseId}-${index}`}
            contentContainerStyle={{ paddingBottom: 140 }}
            ListFooterComponent={
              filterType === "nearMe" && boards.length > 0 ? (
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
            renderItem={({ item }) => {
              const highlightTarget = highlightCourseId || targetCourseId;
              const isHighlightedBoard = shouldHighlight && item.courseId === highlightTarget;
              const isPinned = pinnedCourseId === item.courseId;

              return (
                <View style={styles.board}>
                  {/* COURSE HEADER WITH PIN BUTTON */}
                  <View style={styles.boardHeaderContainer}>
                    <TouchableOpacity
                      onPress={() => goToCourse(item.courseId)}
                      style={styles.boardHeaderTouchable}
                    >
                      <View style={styles.boardHeader}>
                        <Text style={styles.boardTitle}>{item.courseName}</Text>
                        {item.location && (
                          <Text style={styles.boardSubtitle}>
                            {item.location.city}, {item.location.state}
                            {item.distance != null && ` • ${item.distance.toFixed(1)} mi`}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>

                    {/* PIN BUTTON */}
                    {filterType !== "nearMe" && (
                      <TouchableOpacity
                        style={[styles.pinButton, isPinned && styles.pinButtonActive]}
                        onPress={() => handlePinCourse(item.courseId, item.courseName)}
                      >
                        <Ionicons
                          name={isPinned ? "pin" : "pin-outline"}
                          size={20}
                          color={isPinned ? "#FFD700" : "#666"}
                        />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* COLUMN HEADER */}
                  <View style={styles.rowHeader}>
                    <Text style={styles.colPos}>POS</Text>
                    <Text style={styles.colPlayer}>PLAYER</Text>
                    <Text style={styles.colScore}>G</Text>
                    <Text style={styles.colScore}>N</Text>
                    <Text style={styles.colScore}>PAR</Text>
                    <Text style={styles.colLow}>LOW</Text>
                  </View>

                  {/* ROWS */}
                  {item.scores.length === 0 ? (
                    <TouchableOpacity
                      style={styles.emptyRow}
                      onPress={() => goToPostScore(item.courseId)}
                    >
                      <Text style={styles.emptyTitle}>No Scores Yet</Text>
                      <Text style={styles.emptyText}>
                        Be the first to post a score and obtain your achievement! ⛳
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    item.scores.map((s, i) => {
                      const lowNet = Math.min(...item.scores.map((x) => x.netScore));
                      const isLowman = s.netScore === lowNet;

                      const isTargetRow =
                        (highlightScoreId && s.scoreId === highlightScoreId) ||
                        (highlightUserId &&
                          s.userId === highlightUserId &&
                          isHighlightedBoard &&
                          i === 0) ||
                        (targetPlayerId &&
                          s.userId === targetPlayerId &&
                          isHighlightedBoard &&
                          i === 0);

                      return (
                        <View
                          key={s.scoreId}
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
                              style={[
                                styles.playerName,
                                isTargetRow && styles.playerNameHighlighted,
                              ]}
                              numberOfLines={1}
                            >
                              {s.userName}
                            </Text>
                          </TouchableOpacity>

                          <Text style={styles.colScore}>{s.grossScore}</Text>
                          <Text style={[styles.colScore, isLowman && styles.lowNet]}>
                            {s.netScore}
                          </Text>
                          <Text style={styles.colScore}>{s.par || 72}</Text>
                          <View style={styles.colLow}>
                            {isLowman && (
                              <Image source={LowLeaderTrophy} style={styles.trophyIcon} />
                            )}
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              );
            }}
          />
        </>
      )}

      <BottomActionBar />
      <SwingFooter />

      {/* All Courses Leaderboard Modal */}
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

/* ------------------------------------------------------------------ */
/* STYLES                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  safeTop: { backgroundColor: "#0D5C3A" },
  carouselWrapper: { height: 50 },

  loading: { flex: 1, justifyContent: "center", alignItems: "center" },

  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0D5C3A",
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },

  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
  },
  locationIcon: {
    width: 22,
    height: 22,
    tintColor: "#B0433B",
  },
  locationText: {
    fontWeight: "800",
    fontSize: 15,
  },

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

  pinnedBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#0D5C3A",
    letterSpacing: 0.5,
  },

  unpinButton: {
    padding: 4,
  },

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

  boardHeaderTouchable: {
    flex: 1,
  },

  boardHeader: {
    padding: 12,
  },
  boardTitle: {
    fontWeight: "900",
    fontSize: 16,
    color: "#0D5C3A",
  },
  boardSubtitle: {
    fontWeight: "600",
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },

  pinButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#F0F0F0",
  },

  pinButtonActive: {
    backgroundColor: "#0D5C3A",
  },

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
  playerNameHighlighted: {
    color: "#C9A400",
    fontWeight: "900",
  },

  colPos: { width: 40, fontWeight: "800", textAlign: "center" },
  colPlayer: { flex: 1, fontWeight: "800" },
  colScore: { width: 44, textAlign: "center", fontWeight: "700" },
  colLow: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  playerCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },

  avatar: { width: 26, height: 26, borderRadius: 13 },
  avatarFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#CCC",
  },

  playerName: { fontWeight: "700", flexShrink: 1 },

  lowNet: { color: "#C9A400", fontWeight: "900" },
  trophyIcon: {
    width: 24,
    height: 24,
    resizeMode: "contain",
  },
  emptyRow: {
    padding: 24,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0D5C3A",
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    textAlign: "center",
  },

  loadMoreContainer: {
    padding: 16,
    paddingBottom: 40,
  },

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

  loadMoreText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFF",
    marginBottom: 4,
  },

  loadMoreSubtext: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFD700",
  },
});