/**
 * useLeaderboardData Hook
 * 
 * Handles all leaderboard data fetching, processing, and caching.
 * Used by both:
 * 1. Leaderboard screen (full functionality)
 * 2. Background preload (nearMe only, for faster navigation)
 * 
 * Cache format:
 * {
 *   boards: CourseBoard[],
 *   pinnedBoard: CourseBoard | null,
 *   displayedCourseIds: number[]
 * }
 */

import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";

import { auth, db } from "@/constants/firebaseConfig";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
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

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

// Re-export Score type from leaderboardHelpers for consistency
export interface Score {
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
  displayName?: string;  // Used in UI
  userName?: string;     // From leaderboardHelpers
  userAvatar?: string | null;
}

export interface CourseBoard {
  courseId: number;
  courseName: string;
  scores: Score[];
  distance?: number;
  location?: {
    city?: string;
    state?: string;
  };
}

export interface LeaderboardCacheData {
  boards: CourseBoard[];
  pinnedBoard: CourseBoard | null;
  displayedCourseIds: number[];
}

export type FilterType = "nearMe" | "course" | "player" | "partnersOnly";
export type HoleCount = "9" | "18";

interface UseLeaderboardDataOptions {
  filterType: FilterType;
  filterCourseId?: number | null;
  filterCourseName?: string | null;
  filterPlayerId?: string | null;
  filterPlayerName?: string | null;
  holeCount: HoleCount;
}

interface UseLeaderboardDataReturn {
  boards: CourseBoard[];
  pinnedBoard: CourseBoard | null;
  displayedCourseIds: number[];
  loading: boolean;
  showingCached: boolean;
  refreshing: boolean;
  userRegionKey: string;
  pinnedCourseId: number | null;
  setPinnedCourseId: (id: number | null) => void;
  fetchLeaderboards: (isBackgroundRefresh?: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
  loadPinnedCourseId: () => Promise<void>;
}

/* ================================================================ */
/* HOOK                                                             */
/* ================================================================ */

export function useLeaderboardData({
  filterType,
  filterCourseId,
  filterCourseName,
  filterPlayerId,
  filterPlayerName,
  holeCount,
}: UseLeaderboardDataOptions): UseLeaderboardDataReturn {
  const { getCache, setCache } = useCache();

  // State
  const [boards, setBoards] = useState<CourseBoard[]>([]);
  const [pinnedBoard, setPinnedBoard] = useState<CourseBoard | null>(null);
  const [displayedCourseIds, setDisplayedCourseIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [showingCached, setShowingCached] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userRegionKey, setUserRegionKey] = useState("");
  const [pinnedCourseId, setPinnedCourseId] = useState<number | null>(null);

  /* ---------------------------------------------------------------- */
  /* LOAD USER REGION                                                 */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const loadUserRegion = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const userData = snap.data();
        setUserRegionKey(userData.regionKey || "");
      }
    };

    loadUserRegion();
  }, []);

  /* ---------------------------------------------------------------- */
  /* LOAD PINNED COURSE ID                                            */
  /* ---------------------------------------------------------------- */

  const loadPinnedCourseId = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadPinnedCourseId();
  }, [loadPinnedCourseId]);

  /* ---------------------------------------------------------------- */
  /* LOAD PARTNER USER IDS                                            */
  /* ---------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------- */
  /* FETCH WITH CACHE                                                 */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (userRegionKey) {
      fetchLeaderboardsWithCache();
    }
  }, [filterType, filterCourseId, filterPlayerId, userRegionKey, holeCount]);

  const fetchLeaderboardsWithCache = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      // Only use cache for "nearMe" view
      if (filterType === "nearMe" && userRegionKey) {
        const cached = await getCache(
          CACHE_KEYS.LEADERBOARD(uid, userRegionKey, holeCount),
          userRegionKey
        );

        if (cached && cached.boards) {
          console.log(`⚡ Using cached leaderboards (${holeCount}-hole)`);
          setBoards(cached.boards || []);
          setPinnedBoard(cached.pinnedBoard || null);
          setDisplayedCourseIds(cached.displayedCourseIds || []);
          setShowingCached(true);
          setLoading(false);
        }
      }

      // Fetch fresh data (always)
      await fetchLeaderboards(true);
    } catch (error) {
      console.error("❌ Leaderboard cache error:", error);
      await fetchLeaderboards();
    }
  };

  /* ---------------------------------------------------------------- */
  /* FETCH LEADERBOARDS (CORE LOGIC)                                  */
  /* ---------------------------------------------------------------- */

  const fetchLeaderboards = useCallback(async (isBackgroundRefresh: boolean = false) => {
    try {
      if (!isBackgroundRefresh) {
        setLoading(true);
      }

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
      const currentUserRegionKey = userData.regionKey;
      const userLat = userData.currentLatitude || userData.latitude;
      const userLon = userData.currentLongitude || userData.longitude;

      if (!currentUserRegionKey) {
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
        // SPECIFIC COURSE FILTER
        console.log("🔍 Filter: Specific Course -", filterCourseName);

        const course = await getCourseById(filterCourseId);

        if (!course) {
          console.log("⚠️ Course not found:", filterCourseId);
          setBoards([]);
          setDisplayedCourseIds([]);
          setShowingCached(false);
          setLoading(false);
          return;
        }

        const leaderboard = await getLeaderboard(course.regionKey, filterCourseId);

        if (leaderboard) {
          leaderboards = [leaderboard];
        } else {
          leaderboards = [
            {
              courseId: filterCourseId,
              courseName: filterCourseName || course.course_name,
              topScores18: [],
              topScores9: [],
              topScores: [],
              location: course.location
                ? { city: course.location.city, state: course.location.state }
                : undefined,
            },
          ];
        }

        displayedIds = [filterCourseId];
      } else if (filterType === "partnersOnly") {
        // PARTNERS ONLY FILTER
        console.log("🔍 Filter: Partners Only");

        const partnerIds = await loadPartnerUserIds(uid);

        if (partnerIds.length === 0) {
          console.log("⚠️ User has no partners");
          setBoards([]);
          setDisplayedCourseIds([]);
          setShowingCached(false);
          setLoading(false);
          return;
        }

        leaderboards = await getLeaderboardsByPartners(partnerIds);
        displayedIds = leaderboards.map((lb: any) => lb.courseId);

        console.log("📊 Partners have top scores at", displayedIds.length, "courses");
      } else if (filterType === "player" && filterPlayerId) {
        // SPECIFIC PLAYER FILTER
        console.log("🔍 Filter: Specific Player -", filterPlayerName);

        leaderboards = await getLeaderboardsByPlayer(filterPlayerId);
        displayedIds = leaderboards.map((lb: any) => lb.courseId);

        console.log("📊 Player has top scores at", displayedIds.length, "courses");
      } else {
        // NEAR ME (DEFAULT)
        console.log("🔍 Filter: Near Me");
        console.log(`🔍 Fetching leaderboards for region: ${currentUserRegionKey}`);

        leaderboards = await getLeaderboardsByRegion(currentUserRegionKey);

        console.log(`✅ Found ${leaderboards.length} leaderboards in ${currentUserRegionKey}`);

        // If no leaderboards, try to hydrate
        if (leaderboards.length === 0) {
          console.log("⚠️ No leaderboards in region, attempting hydration...");

          const hydrated = await hydrateLeaderboardsForRegion(currentUserRegionKey);

          if (hydrated > 0) {
            leaderboards = await getLeaderboardsByRegion(currentUserRegionKey);
            console.log(`✅ After hydration: ${leaderboards.length} leaderboards`);
          }
        }

        // Expand to nearby regions if needed
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
        setShowingCached(false);
        setLoading(false);
        return;
      }

      // ============================================================
      // CALCULATE DISTANCES & BUILD BOARDS
      // ============================================================

      const boardsWithDistance = await buildBoardsWithDistance(
        leaderboards,
        userLat,
        userLon,
        holeCount
      );

      console.log("✅ Built leaderboards with distances");

      // ============================================================
      // HANDLE PINNED LEADERBOARD (ONLY FOR NEAR ME)
      // ============================================================

      let finalBoards = boardsWithDistance;
      let finalPinnedBoard: CourseBoard | null = null;

      if (filterType === "nearMe") {
        const pinnedLeaderboard = userData.pinnedLeaderboard;

        if (pinnedLeaderboard?.courseId) {
          console.log("📌 Loading pinned leaderboard:", pinnedLeaderboard.courseName);

          const pinnedCourse = await getCourseById(pinnedLeaderboard.courseId);

          if (pinnedCourse) {
            const pinnedLB = await getLeaderboard(
              pinnedCourse.regionKey,
              pinnedLeaderboard.courseId
            );

            if (pinnedLB) {
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

              const pinnedScores =
                holeCount === "18"
                  ? (pinnedLB.topScores18 && pinnedLB.topScores18.length > 0)
                    ? pinnedLB.topScores18
                    : (pinnedLB.topScores || [])
                  : (pinnedLB.topScores9 || []);

              finalPinnedBoard = {
                courseId: pinnedLB.courseId,
                courseName: pinnedLB.courseName,
                scores: pinnedScores,
                distance: pinnedDistance,
                location: pinnedCourse.location
                  ? {
                      city: pinnedCourse.location.city,
                      state: pinnedCourse.location.state,
                    }
                  : undefined,
              };

              const boardsWithoutPinned = boardsWithDistance.filter(
                (b) => b.courseId !== pinnedLeaderboard.courseId
              );
              finalBoards = boardsWithoutPinned.slice(0, 2);

              console.log("✅ Set pinned board at top, showing top 2 others below");
            } else {
              finalPinnedBoard = {
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

              const boardsWithoutPinned = boardsWithDistance.filter(
                (b) => b.courseId !== pinnedLeaderboard.courseId
              );
              finalBoards = boardsWithoutPinned.slice(0, 2);
            }
          } else {
            finalPinnedBoard = null;
            finalBoards = boardsWithDistance.slice(0, 3);
          }
        } else {
          finalPinnedBoard = null;
          finalBoards = boardsWithDistance.slice(0, 3);
        }
      }

      // Update state
      setPinnedBoard(finalPinnedBoard);
      setBoards(finalBoards);
      setDisplayedCourseIds(finalBoards.map((b) => b.courseId));

      // Cache result (only for "nearMe")
      if (filterType === "nearMe" && currentUserRegionKey) {
        const cacheData: LeaderboardCacheData = {
          boards: finalBoards,
          pinnedBoard: finalPinnedBoard,
          displayedCourseIds: finalBoards.map((b) => b.courseId),
        };

        await setCache(
          CACHE_KEYS.LEADERBOARD(uid, currentUserRegionKey, holeCount),
          cacheData,
          currentUserRegionKey
        );
        console.log(`✅ Leaderboards cached (${holeCount}-hole)`);
      }

      setShowingCached(false);
      setLoading(false);
    } catch (e) {
      console.error("Leaderboard error:", e);
      soundPlayer.play("error");
      setShowingCached(false);
      setLoading(false);
    }
  }, [filterType, filterCourseId, filterCourseName, filterPlayerId, filterPlayerName, holeCount, setCache]);

  /* ---------------------------------------------------------------- */
  /* BUILD BOARDS WITH DISTANCE                                       */
  /* ---------------------------------------------------------------- */

  const buildBoardsWithDistance = async (
    leaderboards: any[],
    userLat: number | undefined,
    userLon: number | undefined,
    holeCount: HoleCount
  ): Promise<CourseBoard[]> => {
    const boardsWithDistance: CourseBoard[] = [];

    for (const leaderboard of leaderboards) {
      const courseQuery = query(
        collection(db, "courses"),
        where("id", "==", leaderboard.courseId)
      );
      const courseSnap = await getDocs(courseQuery);

      let distance: number | undefined;
      let location = leaderboard.location;

      if (!courseSnap.empty) {
        const courseData = courseSnap.docs[0].data();
        if (
          courseData.location?.latitude &&
          courseData.location?.longitude &&
          userLat &&
          userLon
        ) {
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

      const scores: Score[] =
        holeCount === "18"
          ? (leaderboard.topScores18 && leaderboard.topScores18.length > 0)
            ? leaderboard.topScores18
            : (leaderboard.topScores || [])
          : (leaderboard.topScores9 || []);

      boardsWithDistance.push({
        courseId: leaderboard.courseId,
        courseName: leaderboard.courseName,
        scores,
        distance,
        location,
      });
    }

    // Sort by distance (closest first)
    boardsWithDistance.sort((a, b) => (a.distance || 999) - (b.distance || 999));

    return boardsWithDistance;
  };

  /* ---------------------------------------------------------------- */
  /* PULL TO REFRESH                                                  */
  /* ---------------------------------------------------------------- */

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setShowingCached(false);
    await fetchLeaderboards();
    setRefreshing(false);
  }, [fetchLeaderboards]);

  return {
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
  };
}

/* ================================================================ */
/* STANDALONE PRELOAD FUNCTION                                      */
/* ================================================================ */

/**
 * Preload leaderboard data for background preloading.
 * Only preloads "nearMe" view since that's the default.
 * 
 * This function replicates the core fetch logic but is standalone
 * so it can be called from useBackgroundPreload without hooks.
 */
export async function preloadLeaderboardData(
  userId: string,
  regionKey: string,
  holeCount: HoleCount = "18",
  setCache: (key: string, data: any, regionKey?: string) => Promise<void>
): Promise<void> {
  try {
    console.log("🔄 Preloading leaderboard...");

    // Get user data for location
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) {
      console.log("⚠️ User not found for leaderboard preload");
      return;
    }

    const userData = userDoc.data();
    const userLat = userData.currentLatitude || userData.latitude;
    const userLon = userData.currentLongitude || userData.longitude;

    // Fetch leaderboards for region
    let leaderboards = await getLeaderboardsByRegion(regionKey);
    console.log(`📦 Found ${leaderboards.length} leaderboards in ${regionKey}`);

    if (leaderboards.length === 0) {
      const hydrated = await hydrateLeaderboardsForRegion(regionKey);
      if (hydrated > 0) {
        leaderboards = await getLeaderboardsByRegion(regionKey);
      }
    }

    // Expand to nearby regions if needed
    if (leaderboards.length < 3 && userLat && userLon) {
      const nearbyRegions = findNearestRegions(userLat, userLon, 3, 100);
      for (const { region } of nearbyRegions) {
        if (leaderboards.length >= 3) break;
        const moreBoards = await getLeaderboardsByRegion(region.key);
        leaderboards.push(...moreBoards);
      }
    }

    if (leaderboards.length === 0) {
      console.log("⚠️ No leaderboards to preload");
      return;
    }

    // Build boards with distance
    const boardsWithDistance: CourseBoard[] = [];

    for (const leaderboard of leaderboards) {
      const courseQuery = query(
        collection(db, "courses"),
        where("id", "==", leaderboard.courseId)
      );
      const courseSnap = await getDocs(courseQuery);

      let distance: number | undefined;
      let location = leaderboard.location;

      if (!courseSnap.empty) {
        const courseData = courseSnap.docs[0].data();
        if (
          courseData.location?.latitude &&
          courseData.location?.longitude &&
          userLat &&
          userLon
        ) {
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

      const scores: Score[] =
        holeCount === "18"
          ? (leaderboard.topScores18 && leaderboard.topScores18.length > 0)
            ? leaderboard.topScores18
            : (leaderboard.topScores || [])
          : (leaderboard.topScores9 || []);

      boardsWithDistance.push({
        courseId: leaderboard.courseId,
        courseName: leaderboard.courseName,
        scores,
        distance,
        location,
      });
    }

    // Sort by distance
    boardsWithDistance.sort((a, b) => (a.distance || 999) - (b.distance || 999));

    // Handle pinned leaderboard
    let finalBoards = boardsWithDistance;
    let finalPinnedBoard: CourseBoard | null = null;

    const pinnedLeaderboard = userData.pinnedLeaderboard;

    if (pinnedLeaderboard?.courseId) {
      const pinnedCourse = await getCourseById(pinnedLeaderboard.courseId);

      if (pinnedCourse) {
        const pinnedLB = await getLeaderboard(
          pinnedCourse.regionKey,
          pinnedLeaderboard.courseId
        );

        if (pinnedLB) {
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

          const pinnedScores: Score[] =
            holeCount === "18"
              ? (pinnedLB.topScores18 && pinnedLB.topScores18.length > 0)
                ? pinnedLB.topScores18
                : (pinnedLB.topScores || [])
              : (pinnedLB.topScores9 || []);

          finalPinnedBoard = {
            courseId: pinnedLB.courseId,
            courseName: pinnedLB.courseName,
            scores: pinnedScores,
            distance: pinnedDistance,
            location: pinnedCourse.location
              ? {
                  city: pinnedCourse.location.city,
                  state: pinnedCourse.location.state,
                }
              : undefined,
          };

          const boardsWithoutPinned = boardsWithDistance.filter(
            (b) => b.courseId !== pinnedLeaderboard.courseId
          );
          finalBoards = boardsWithoutPinned.slice(0, 2);
        } else {
          finalBoards = boardsWithDistance.slice(0, 3);
        }
      } else {
        finalBoards = boardsWithDistance.slice(0, 3);
      }
    } else {
      finalBoards = boardsWithDistance.slice(0, 3);
    }

    // Cache the result
    const cacheData: LeaderboardCacheData = {
      boards: finalBoards,
      pinnedBoard: finalPinnedBoard,
      displayedCourseIds: finalBoards.map((b) => b.courseId),
    };

    await setCache(
      CACHE_KEYS.LEADERBOARD(userId, regionKey, holeCount),
      cacheData,
      regionKey
    );

    console.log(`✅ Leaderboard preloaded: ${finalBoards.length} boards`);
  } catch (error) {
    console.log("⚠️ Leaderboard preload failed (non-critical):", error);
  }
}