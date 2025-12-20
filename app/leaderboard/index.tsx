import BottomActionBar from "@/components/navigation/BottomActionBar";
import LowmanCarousel from "@/components/navigation/LowmanCarousel";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";
import { getCachedCourses } from "@/utils/courseCache";

import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  createdAt: any;
  userName?: string;
  userAvatar?: string | null;
}

interface UserProfile {
  displayName?: string;
  avatar?: string | null;
  userType?: string;
}

interface CourseBoard {
  courseId: number;
  courseName: string;
  scores: Score[];
  location?: {
    city?: string;
    state?: string;
  };
}

/* ------------------------------------------------------------------ */

export default function LeaderboardScreen() {
  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<CourseBoard[]>([]);
  const [locationLabel, setLocationLabel] = useState("Nearby");
  const [displayedCourseIds, setDisplayedCourseIds] = useState<number[]>([]);

  const LocationIcon = require("@/assets/icons/Location Near Me.png");

  const params = useLocalSearchParams();

  // ✅ FILTER PARAMS
  const filterType = useMemo(() => {
    let raw = params?.filterType;
    if (Array.isArray(raw)) raw = raw[0];
    return (raw as "nearMe" | "course" | "player") || "nearMe";
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
    return raw as string || null;
  }, [params?.courseName]);

  const filterPlayerId = useMemo(() => {
    let raw = params?.playerId;
    if (Array.isArray(raw)) raw = raw[0];
    return raw as string || null;
  }, [params?.playerId]);

  const filterPlayerName = useMemo(() => {
    let raw = params?.playerName;
    if (Array.isArray(raw)) raw = raw[0];
    return raw as string || null;
  }, [params?.playerName]);

  // ✅ CAROUSEL NAVIGATION PARAMS (separate from filter)
  const targetCourseId = useMemo(() => {
    // Only use for carousel navigation, not for filter
    if (filterType === "course" && filterCourseId) return null;
    let raw = params?.courseId;
    if (Array.isArray(raw)) raw = raw[0];
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [params?.courseId, filterType, filterCourseId]);

  const targetPlayerId = useMemo(() => {
    // Only use for carousel navigation, not for filter
    if (filterType === "player" && filterPlayerId) return null;
    let playerId = params?.playerId;
    if (Array.isArray(playerId)) playerId = playerId[0];
    return (playerId as string) || null;
  }, [params?.playerId, filterType, filterPlayerId]);

  const shouldHighlight = !!(targetCourseId && targetPlayerId);

  console.log("✨ Filter type:", filterType);
  console.log("✨ shouldHighlight:", shouldHighlight, { targetCourseId, targetPlayerId });

  const listRef = useRef<FlatList<CourseBoard>>(null);
  const hasReordered = useRef(false);

  /* ---------------------- RESET REORDER FLAG ON PARAM CHANGE ---------------------- */

  useEffect(() => {
    hasReordered.current = false;
    console.log("🔄 Reset reorder flag - new navigation params");
  }, [targetCourseId, targetPlayerId]);

  /* ---------------------- LOAD USER LOCATION ---------------------- */

  useEffect(() => {
    const loadLocation = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const loc = snap.data().location;
        if (loc?.city && loc?.state) {
          setLocationLabel(`${loc.city}, ${loc.state}`);
        }
      }
    };

    loadLocation();
  }, []);

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
        setLoading(false);
        return;
      }

      let coursesToShow: any[] = [];
      let displayedIds: number[] = [];

      // ============================================================
      // HANDLE DIFFERENT FILTER TYPES
      // ============================================================

      if (filterType === "course" && filterCourseId) {
        // ✅ SPECIFIC COURSE FILTER
        console.log("🔍 Filter: Specific Course -", filterCourseName);
        
        coursesToShow = [{
          courseId: filterCourseId,
          courseName: filterCourseName || "Unknown Course",
          distance: 0
        }];
        
        displayedIds = [filterCourseId];
        
      } else if (filterType === "player" && filterPlayerId) {
        // ✅ SPECIFIC PLAYER FILTER
        console.log("🔍 Filter: Specific Player -", filterPlayerName);
        
        // Get all scores for this player
        const playerScoresQuery = query(
          collection(db, "scores"),
          where("userId", "==", filterPlayerId)
        );
        const playerScoresSnap = await getDocs(playerScoresQuery);
        
        const playerCourses = new Map<number, string>();
        playerScoresSnap.forEach((d) => {
          const data = d.data();
          if (!playerCourses.has(data.courseId)) {
            playerCourses.set(data.courseId, data.courseName);
          }
        });
        
        coursesToShow = Array.from(playerCourses.entries()).map(([courseId, courseName]) => ({
          courseId,
          courseName,
          distance: 0
        }));
        
        displayedIds = Array.from(playerCourses.keys());
        
        console.log("📊 Player has scores at", displayedIds.length, "courses");
        
      } else {
        // ✅ NEAR ME (DEFAULT)
        console.log("🔍 Filter: Near Me");
        
        const cachedCourses = await getCachedCourses(uid);
        
        // Handle carousel navigation (keep existing logic)
        coursesToShow = cachedCourses.slice(0, 3);
        
        if (targetCourseId && !coursesToShow.find(c => c.courseId === targetCourseId)) {
          console.log("🎯 Target course not in cached courses, fetching it...");
          
          const allScoresSnap = await getDocs(query(collection(db, "scores")));
          let targetCourseName = "Unknown Course";
          
          allScoresSnap.forEach((d) => {
            const data = d.data();
            if (data.courseId === targetCourseId && data.courseName) {
              targetCourseName = data.courseName;
            }
          });
          
          coursesToShow = [
            { courseId: targetCourseId, courseName: targetCourseName, distance: 0 },
            ...coursesToShow.slice(0, 2)
          ];
          
          console.log("✅ Added target course:", targetCourseName);
        }
        
        displayedIds = coursesToShow.map(c => c.courseId);
      }

      console.log("📦 Courses to show:", coursesToShow.length);
      console.log("📦 Course IDs:", displayedIds);

      if (coursesToShow.length === 0) {
        console.log("⚠️ No courses to display");
        setBoards([]);
        setDisplayedCourseIds([]);
        setLoading(false);
        return;
      }

      // ============================================================
      // LOAD SCORES
      // ============================================================
      
      const scoresQuery = filterType === "player" && filterPlayerId
        ? query(collection(db, "scores"), where("userId", "==", filterPlayerId))
        : query(collection(db, "scores"));
        
      const scoresSnap = await getDocs(scoresQuery);

      const scores: Score[] = [];
      const userIds = new Set<string>();

      scoresSnap.forEach((d) => {
        const data = d.data();
        scores.push({
          scoreId: d.id,
          userId: data.userId,
          courseId: data.courseId,
          courseName: data.courseName,
          grossScore: data.grossScore,
          netScore: data.netScore,
          par: data.par,
          createdAt: data.createdAt,
        });
        if (data.userId) userIds.add(data.userId);
      });

      /* ---- LOAD USER PROFILES ---- */

      const profiles: Record<string, UserProfile> = {};
      const ids = Array.from(userIds);

      for (let i = 0; i < ids.length; i += 10) {
        const batch = ids.slice(i, i + 10);
        const uq = query(collection(db, "users"), where("__name__", "in", batch));
        const us = await getDocs(uq);
        us.forEach((u) => {
          profiles[u.id] = u.data() as UserProfile;
        });
      }

      /* ---- MERGE + FILTER OUT COURSE ACCOUNTS ---- */

      const merged = scores
        .filter((s) => profiles[s.userId]?.userType !== "Course")
        .map((s) => ({
          ...s,
          userName: profiles[s.userId]?.displayName || "Player",
          userAvatar: profiles[s.userId]?.avatar ?? null,
        }));

      /* ---- GROUP BY DISPLAYED COURSES ---- */

      const grouped: Record<number, CourseBoard> = {};

      // Fetch course details from Firestore to get location info
      const courseDetailsMap: Record<number, any> = {};
      
      for (const course of coursesToShow) {
        try {
          const coursesQuery = query(
            collection(db, "courses"),
            where("id", "==", course.courseId)
          );
          const courseSnap = await getDocs(coursesQuery);
          
          if (!courseSnap.empty) {
            const courseData = courseSnap.docs[0].data();
            courseDetailsMap[course.courseId] = courseData;
          }
        } catch (error) {
          console.log("⚠️ Could not fetch details for course:", course.courseId);
        }
      }

      // Initialize boards for displayed courses
      coursesToShow.forEach((course) => {
        const courseDetails = courseDetailsMap[course.courseId];
        
        grouped[course.courseId] = {
          courseId: course.courseId,
          courseName: course.courseName,
          scores: [],
          location: courseDetails?.location ? {
            city: courseDetails.location.city,
            state: courseDetails.location.state,
          } : undefined,
        };
      });

      // Add scores to matching courses
      merged.forEach((s) => {
        if (grouped[s.courseId]) {
          grouped[s.courseId].scores.push(s);
        }
      });

      /* ---- SORT + TOP 3 PER COURSE ---- */

      const nextBoards: CourseBoard[] = coursesToShow.map((course) => {
        const board = grouped[course.courseId];
        const sorted = [...board.scores].sort((a, b) => a.netScore - b.netScore);
        
        return {
          ...board,
          scores: sorted.slice(0, 3),
        };
      });

      console.log("✅ Built leaderboards for", nextBoards.length, "courses");
      console.log("✅ Displayed course IDs:", displayedIds);

      setBoards(nextBoards);
      setDisplayedCourseIds(displayedIds);
      setLoading(false);
    } catch (e) {
      console.error("Leaderboard error:", e);
      setLoading(false);
    }
  };

  /* ---------------------- REORDER BOARDS WHEN TARGET CHANGES ---------------------- */

  useEffect(() => {
    if (!shouldHighlight || !targetCourseId || !boards.length) return;
    if (hasReordered.current) return;

    const targetIdx = boards.findIndex((b) => b.courseId === targetCourseId);
    
    console.log("🔍 Checking reorder - targetIdx:", targetIdx, "current first:", boards[0]?.courseName);
    
    if (targetIdx < 0) {
      console.log("⚠️ Target course not found in current location's boards");
      console.log("⚠️ Target courseId:", targetCourseId, "Available:", boards.map(b => b.courseId));
      hasReordered.current = true;
      return;
    }

    if (targetIdx === 0) {
      console.log("✅ Target already at position 0");
      hasReordered.current = true;
      return;
    }

    const reordered = [...boards];
    const [targetBoard] = reordered.splice(targetIdx, 1);
    reordered.unshift(targetBoard);

    console.log("🔄 Reordering boards - moving", targetBoard.courseName, "from index", targetIdx, "to position 0");
    hasReordered.current = true;
    setBoards(reordered);
  }, [shouldHighlight, targetCourseId, boards]);

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
        console.log("✅ Scrolled to top to show reordered board");
      } catch (err) {
        console.log("⚠️ Scroll error:", err);
      }
    }, 100);

    return () => clearTimeout(t);
  }, [shouldHighlight, loading, boards]);

  /* ---------------------- INTERACTIONS ---------------------- */

  const goToPlayer = (userId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/locker/${userId}`);
  };

  const goToCourse = (courseId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/course/${courseId}`);
  };

  const goToPostScore = (courseId: number) => {
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

      {/* LOCATION ROW - Static display, no Change button */}
      <View style={styles.locationRow}>
        <Image source={LocationIcon} style={styles.locationIcon} />
        <Text style={styles.locationText}>{locationLabel}</Text>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#0D5C3A" />
        </View>
      ) : boards.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No Courses Found</Text>
          <Text style={styles.emptyStateText}>
            {filterType === "player" 
              ? `${filterPlayerName} hasn't posted any scores yet`
              : "Set your location to see nearby courses and leaderboards"}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={boards}
          keyExtractor={(b) => String(b.courseId)}
          contentContainerStyle={{ paddingBottom: 140 }}
          renderItem={({ item }) => {
            return (
              <View style={styles.board}>
                {/* COURSE HEADER */}
                <TouchableOpacity onPress={() => goToCourse(item.courseId)}>
                  <View style={styles.boardHeader}>
                    <Text style={styles.boardTitle}>{item.courseName} Leaders</Text>
                    {item.location && (
                      <Text style={styles.boardSubtitle}>
                        {item.location.city}, {item.location.state}
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
                      shouldHighlight &&
                      targetCourseId === item.courseId &&
                      i === 0;

                    if (isTargetRow) {
                      console.log("🎯 Highlighting POS 1:", { 
                        userName: s.userName, 
                        courseId: item.courseId,
                        position: i + 1
                      });
                    }

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
                        <Text style={styles.colLow}>{isLowman ? "🏆" : ""}</Text>
                      </View>
                    );
                  })
                )}
              </View>
            );
          }}
        />
      )}

      <BottomActionBar />
      <SwingFooter />
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

  board: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#DDD",
    backgroundColor: "#FFF",
  },
  boardHeader: {
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#DDD",
  },
  boardTitle: {
    fontWeight: "900",
    fontSize: 18,
  },
  boardSubtitle: {
    fontWeight: "600",
    fontSize: 14,
    color: "#666",
    marginTop: 4,
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
    borderColor: "#C9A400",
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
  colLow: { width: 44, textAlign: "center" },

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
});

