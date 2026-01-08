import AllCoursesLeaderboardModal from "@/components/modals/AllCoursesLeaderboardModal";
import BottomActionBar from "@/components/navigation/BottomActionBar";
import LowmanCarousel from "@/components/navigation/LowmanCarousel";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";
import { getNearbyCourses } from "@/utils/courseCache";
import { milesBetween } from "@/utils/geo";
import { soundPlayer } from "@/utils/soundPlayer";
import { batchGetUserProfiles } from "@/utils/userProfileHelpers";
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
  createdAt: any;
  userName?: string;
  userAvatar?: string | null;
  hadHoleInOne?: boolean;
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
  distance?: number; // ✅ Distance in miles from user
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
  const [pinnedCourseId, setPinnedCourseId] = useState<number | null>(null); // ✅ NEW: Track pinned course ID

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
    return raw as string || null;
  }, [params?.highlightUserId]);

  const highlightScoreId = useMemo(() => {
    let raw = params?.highlightScoreId;
    if (Array.isArray(raw)) raw = raw[0];
    return raw as string || null;
  }, [params?.highlightScoreId]);

  // ✅ CAROUSEL NAVIGATION PARAMS (separate from filter)
  const targetCourseId = useMemo(() => {
    // Prefer highlight params from notifications
    if (highlightCourseId) return highlightCourseId;
    
    // Only use for carousel navigation, not for filter
    if (filterType === "course" && filterCourseId) return null;
    let raw = params?.courseId;
    if (Array.isArray(raw)) raw = raw[0];
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [params?.courseId, filterType, filterCourseId, highlightCourseId]);

  const targetPlayerId = useMemo(() => {
    console.log("🔍 targetPlayerId calculation:", {
      highlightUserId,
      paramsPlayerId: params?.playerId,
      filterType,
      filterPlayerId,
    });
    
    // Prefer highlight params from notifications
    if (highlightUserId) {
      console.log("✅ Using highlightUserId:", highlightUserId);
      return highlightUserId;
    }
    
    // Get playerId from params (carousel navigation)
    let playerId = params?.playerId;
    if (Array.isArray(playerId)) playerId = playerId[0];
    
    console.log("📝 Extracted playerId from params:", playerId);
    
    // Don't use as target if it's being used as a filter
    if (filterType === "player" && filterPlayerId === playerId) {
      console.log("⚠️ Not using as target - it's a filter");
      return null;
    }
    
    console.log("✅ Final targetPlayerId:", playerId || null);
    return (playerId as string) || null;
  }, [params?.playerId, filterType, filterPlayerId, highlightUserId]);

  const shouldHighlight = !!(targetCourseId && targetPlayerId) || !!(highlightCourseId && highlightScoreId);

  console.log("✨ Filter type:", filterType);
  console.log("✨ shouldHighlight:", shouldHighlight, { 
    targetCourseId, 
    targetPlayerId,
    highlightCourseId,
    highlightUserId,
    highlightScoreId,
    calculation: {
      fromCarousel: !!(targetCourseId && targetPlayerId),
      fromNotification: !!(highlightCourseId && highlightScoreId)
    }
  });

  const listRef = useRef<FlatList<CourseBoard>>(null);
  const hasReordered = useRef(false);

  /* ---------------------- RESET REORDER FLAG ON PARAM CHANGE ---------------------- */

  useEffect(() => {
    hasReordered.current = false;
    console.log("🔄 Reset reorder flag - new navigation params");
  }, [targetCourseId, targetPlayerId, highlightCourseId, highlightScoreId]);

  /* ---------------------- LOAD USER LOCATION ---------------------- */

  useEffect(() => {
    const loadLocation = async () => {
      // Set label based on filter type
      if (filterType === "partnersOnly") {
        setLocationLabel("Partners");
        return;
      }
      
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const userData = snap.data();
        
        // Use currentCity/currentState (dynamic location for leaderboards)
        // Fall back to city/state for users not migrated yet
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
    soundPlayer.play('error');
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
        soundPlayer.play('error');
        setLoading(false);
        return;
      }

      let coursesToShow: any[] = [];
      let displayedIds: number[] = [];
      let allPartnerScoreDocs: any[] = [];

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
        
      } else if (filterType === "partnersOnly") {
        // ✅ PARTNERS ONLY FILTER
        console.log("🔍 Filter: Partners Only");
        
        // Get current user's partner IDs
        const partnerIds = await loadPartnerUserIds(uid);
        
        if (partnerIds.length === 0) {
          console.log("⚠️ User has no partners");
          setBoards([]);
          setDisplayedCourseIds([]);
          setLoading(false);
          return;
        }
        
        console.log(`📊 User has ${partnerIds.length} partners`);
        
        // Fetch scores from all partners (batch if >10 partners)
        allPartnerScoreDocs = [];
        
        for (let i = 0; i < partnerIds.length; i += 10) {
          const batch = partnerIds.slice(i, i + 10);
          const batchQuery = query(
            collection(db, "scores"),
            where("userId", "in", batch)
          );
          const batchSnap = await getDocs(batchQuery);
          batchSnap.forEach(doc => allPartnerScoreDocs.push(doc));
        }
        
        console.log(`📊 Fetched ${allPartnerScoreDocs.length} scores from partners`);
        
        // Extract unique courses
        const partnerCourses = new Map<number, string>();
        allPartnerScoreDocs.forEach((doc) => {
          const data = doc.data();
          if (!partnerCourses.has(data.courseId)) {
            partnerCourses.set(data.courseId, data.courseName);
          }
        });
        
        coursesToShow = Array.from(partnerCourses.entries()).map(([courseId, courseName]) => ({
          courseId,
          courseName,
          distance: 0
        }));
        
        displayedIds = Array.from(partnerCourses.keys());
        
        console.log("📊 Partners have scores at", displayedIds.length, "courses");
        
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
        
        // ✅ Get fresh nearby courses from Firestore (distances calculated on-the-fly)
        const nearbyCourses = await getNearbyCourses(uid, 50); // Within 50 miles
        console.log("📦 Found", nearbyCourses.length, "courses within 50 miles");
        
        coursesToShow = nearbyCourses;
        
        const highlightTarget = highlightCourseId || targetCourseId;
        
        if (highlightTarget && !coursesToShow.find(c => c.courseId === highlightTarget)) {
          console.log("🎯 Target course not in nearby courses, fetching it...");
          
          const allScoresSnap = await getDocs(query(collection(db, "scores")));
          let targetCourseName = "Unknown Course";
          
          allScoresSnap.forEach((d) => {
            const data = d.data();
            if (data.courseId === highlightTarget && data.courseName) {
              targetCourseName = data.courseName;
            }
          });
          
          // ✅ Add target course without duplicates
          coursesToShow = [
            { courseId: highlightTarget, courseName: targetCourseName, distance: 0 },
            ...coursesToShow.filter(c => c.courseId !== highlightTarget)
          ];
          
          console.log("✅ Added target course:", targetCourseName);
        }
        
        // ✅ Remove any duplicate courseIds
        const uniqueCourses = Array.from(
          new Map(coursesToShow.map(c => [c.courseId, c])).values()
        );
        
        // ✅ SORT BY DISTANCE (closest first)
        uniqueCourses.sort((a, b) => (a.distance || 999) - (b.distance || 999));
        
        displayedIds = uniqueCourses.map(c => c.courseId);
        coursesToShow = uniqueCourses;
        
        console.log("📍 Showing", coursesToShow.length, "nearby courses, sorted by distance");
        console.log("🏌️ Course order:", coursesToShow.map(c => `${c.courseName} (${c.distance}mi)`));
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
      
      const scores: Score[] = [];
      const userIds = new Set<string>();

      if (filterType === "partnersOnly") {
        // Use the partner scores we already fetched
        allPartnerScoreDocs.forEach((d) => {
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
      } else {
        const scoresQuery = filterType === "player" && filterPlayerId
          ? query(collection(db, "scores"), where("userId", "==", filterPlayerId))
          : query(collection(db, "scores"));
          
        const scoresSnap = await getDocs(scoresQuery);

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
      }


      /* ---- LOAD USER PROFILES WITH HELPER ---- */

      // ✅ USE HELPER FUNCTION - Handles deleted users automatically
      const profileMap = await batchGetUserProfiles(Array.from(userIds));
      const profiles: Record<string, UserProfile> = {};

      profileMap.forEach((profile, userId) => {
        profiles[userId] = {
          displayName: profile.displayName, // "[Deleted User]" if deleted
          avatar: profile.avatar,
          userType: profile.userType,
        };
      });

      /* ---- MERGE + FILTER OUT COURSE ACCOUNTS + HOLE-IN-ONE SCORES ---- */

      const merged = scores
        .filter((s) => profiles[s.userId]?.userType !== "Course")
        .filter((s) => s.hadHoleInOne !== true) // Filter out hole-in-one scores
        .filter((s) => s.grossScore != null && s.netScore != null) // Ensure scores exist
        .map((s) => ({
          ...s,
          userName: profiles[s.userId]?.displayName || "[Deleted User]",
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
          distance: course.distance, // ✅ Preserve distance from cached courses
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
          distance: course.distance, // ✅ Ensure distance is preserved
          scores: sorted.slice(0, 3),
        };
      });

      console.log("✅ Built leaderboards for", nextBoards.length, "courses");
      console.log("✅ Displayed course IDs:", displayedIds);

      // ============================================================
      // LOAD PINNED LEADERBOARD (ONLY FOR NEAR ME FILTER)
      // ============================================================
      
      if (filterType === "nearMe") {
        try {
          const userDoc = await getDoc(doc(db, "users", uid));
          const pinnedLeaderboard = userDoc.data()?.pinnedLeaderboard;
          
          if (pinnedLeaderboard) {
            console.log("📌 Found pinned leaderboard:", pinnedLeaderboard.courseName);
            
            // ✅ ALWAYS build pinned board (whether in top 3 or not)
            const pinnedCourseScores = merged.filter(s => s.courseId === pinnedLeaderboard.courseId);
            const sortedPinnedScores = pinnedCourseScores.sort((a, b) => a.netScore - b.netScore).slice(0, 3);
            
            const userData = userDoc.data();
            
            // Get course details
            let courseDetails: any = null;
            try {
              const coursesQuery = query(
                collection(db, "courses"),
                where("id", "==", pinnedLeaderboard.courseId)
              );
              const courseSnap = await getDocs(coursesQuery);
              if (!courseSnap.empty) {
                courseDetails = courseSnap.docs[0].data();
              }
            } catch (error) {
              console.log("⚠️ Could not fetch pinned course details");
            }
            
            const pinnedBoardData: CourseBoard = {
              courseId: pinnedLeaderboard.courseId,
              courseName: pinnedLeaderboard.courseName,
              scores: sortedPinnedScores,
              distance: courseDetails?.location?.latitude && courseDetails?.location?.longitude && userData
                ? milesBetween(
                    userData.currentLatitude || userData.latitude,
                    userData.currentLongitude || userData.longitude,
                    courseDetails.location.latitude,
                    courseDetails.location.longitude
                  )
                : undefined,
              location: courseDetails?.location ? {
                city: courseDetails.location.city,
                state: courseDetails.location.state,
              } : undefined,
            };
            
            setPinnedBoard(pinnedBoardData);
            
            // ✅ Filter out pinned from nextBoards and keep only top 2 others
            const boardsWithoutPinned = nextBoards.filter(b => b.courseId !== pinnedLeaderboard.courseId);
            const top2Boards = boardsWithoutPinned.slice(0, 2);
            
            setBoards(top2Boards);
            setDisplayedCourseIds(top2Boards.map(b => b.courseId));
            
            console.log("✅ Set pinned board at top, showing top 2 others below");
          } else {
            setPinnedBoard(null);
            // No pinned board, keep top 3 closest
            const top3Boards = nextBoards.slice(0, 3);
            setBoards(top3Boards);
            setDisplayedCourseIds(top3Boards.map(b => b.courseId));
          }
        } catch (error) {
          console.error("Error loading pinned board:", error);
          setPinnedBoard(null);
          setBoards(nextBoards);
          setDisplayedCourseIds(displayedIds);
        }
      } else {
        setPinnedBoard(null);
        setBoards(nextBoards);
        setDisplayedCourseIds(displayedIds);
      }
      setLoading(false);
    } catch (e) {
      console.error("Leaderboard error:", e);
      soundPlayer.play('error');
      setLoading(false);
    }
  };

  /* ---------------------- REORDER BOARDS WHEN TARGET CHANGES ---------------------- */

  useEffect(() => {
    const highlightTarget = highlightCourseId || targetCourseId;
    
    if (!shouldHighlight || !highlightTarget || !boards.length) return;
    if (hasReordered.current) return;

    const targetIdx = boards.findIndex((b) => b.courseId === highlightTarget);
    
    console.log("🔍 Checking reorder - targetIdx:", targetIdx, "current first:", boards[0]?.courseName);
    
    if (targetIdx < 0) {
      console.log("⚠️ Target course not found in current location's boards");
      console.log("⚠️ Target courseId:", highlightTarget, "Available:", boards.map(b => b.courseId));
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
        console.log("✅ Scrolled to top to show reordered board");
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

      // ✅ Check if this course is already pinned
      if (pinnedCourseId === courseId) {
        soundPlayer.play("error");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert("Already Pinned", `${courseName} is already your pinned leaderboard.`);
        return;
      }

      // ✅ If there's already a pinned course, ask for confirmation
      if (pinnedCourseId) {
        soundPlayer.play("click"); // Sound when opening alert
        Alert.alert(
          "Replace Pinned Leaderboard",
          `You can only pin 1 leaderboard. Replace your current pin with ${courseName}?`,
          [
            { 
              text: "Cancel", 
              style: "cancel",
              onPress: () => {
                soundPlayer.play("click");
              }
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
                console.log("✅ Replaced pinned leaderboard:", courseName);
                
                // Refresh to show pinned board
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
        console.log("✅ Pinned leaderboard:", courseName);
        
        // Refresh to show pinned board
        fetchLeaderboards();
      }
    } catch (error) {
      console.error("Error pinning course:", error);
      soundPlayer.play("error");
    }
  };

  /* ---------------------- INTERACTIONS ---------------------- */

  const goToPlayer = (userId: string) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/locker/${userId}`);
  };

  const goToCourse = (courseId: number) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/locker/course/${courseId}`);
  };

  const goToPostScore = (courseId: number) => {
    soundPlayer.play('click');
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
      ) : boards.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No Courses Found</Text>
          <Text style={styles.emptyStateText}>
            {filterType === "player" 
              ? `${filterPlayerName} hasn't posted any scores yet`
              : filterType === "partnersOnly"
              ? "You have no partners yet, or your partners haven't posted any scores"
              : "Set your location to see nearby courses and leaderboards"}
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
                      console.log("✅ Unpinned leaderboard");
                      
                      // Reload to show top 3
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
                  <Text style={styles.boardTitle}>
                    {pinnedBoard.courseName}
                  </Text>
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
                          <Image
                            source={LowLeaderTrophy}
                            style={styles.trophyIcon}
                          />
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
                    soundPlayer.play('click');
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
                {/* ✅ UPDATED: COURSE HEADER WITH PIN BUTTON - Matches modal styling */}
                <View style={styles.boardHeaderContainer}>
                  <TouchableOpacity 
                    onPress={() => goToCourse(item.courseId)}
                    style={styles.boardHeaderTouchable}
                  >
                    <View style={styles.boardHeader}>
                      <Text style={styles.boardTitle}>
                        {item.courseName}
                      </Text>
                      {item.location && (
                        <Text style={styles.boardSubtitle}>
                          {item.location.city}, {item.location.state}
                          {item.distance != null && ` • ${item.distance} mi`}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  {/* ✅ UPDATED: PIN BUTTON - Matches modal circular style */}
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

                    if (i === 0) {
                      console.log(`🏆 ${item.courseName} - Low Net: ${lowNet}, Player: ${s.userName}, Net: ${s.netScore}, isLowman: ${isLowman}`);
                    }

                    // Highlight logic:
                    // - If highlightScoreId is provided, only highlight that specific score
                    // - If highlightUserId is provided on the highlighted board, only highlight if they're in position 1
                    // - If targetPlayerId is provided on the highlighted board, only highlight if they're in position 1
                    const isTargetRow =
                      (highlightScoreId && s.scoreId === highlightScoreId) ||
                      (highlightUserId && s.userId === highlightUserId && isHighlightedBoard && i === 0) ||
                      (targetPlayerId && s.userId === targetPlayerId && isHighlightedBoard && i === 0);

                    if (isTargetRow) {
                      console.log("🎯 Highlighting row:", { 
                        userName: s.userName, 
                        courseId: item.courseId,
                        position: i + 1,
                        reason: highlightScoreId ? 'scoreId' : highlightUserId ? 'userId at pos 1' : 'targetPlayer at pos 1'
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
                        <Text style={styles.colScore}>{s.par || 72}</Text>
                        <View style={styles.colLow}>
                          {isLowman && (
                            <Image
                              source={LowLeaderTrophy}
                              style={styles.trophyIcon}
                            />
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
          // Refresh leaderboard when pin changes
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
  
  // ✅ UPDATED: Board header container - matches modal
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

  // ✅ UPDATED: Pin button styles - circular like modal
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