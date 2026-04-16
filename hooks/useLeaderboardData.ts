/**
 * useLeaderboardData Hook
 *
 * Optimizations vs previous version:
 *
 * 1. Single user doc read on mount — regionKey, lat/lon, and pinnedLeaderboard
 *    all come from one getDoc. fetchLeaderboards never reads the user doc;
 *    loadPinnedCourseId only re-reads after a pin/unpin action.
 *
 * 2. Batched course distance lookup — one where("id","in",[...]) query
 *    replaces N sequential getDocs calls in buildBoardsWithDistance.
 *    For 8 boards that's 7 fewer network round-trips before first render.
 *
 * 3. holeCount toggling is instant — raw leaderboard docs (containing both
 *    topScores9 and topScores18) are stored as rawBoards. boards and
 *    pinnedBoard are derived via useMemo, so switching 9↔18 is zero-cost.
 *
 * 4. useEffect dep array no longer includes holeCount for the same reason.
 *
 * 5. Boards with scores are always shown before empty boards (within
 *    distance ordering) so users see populated leaderboards first.
 */

import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  displayName?: string;
  userName?: string;
  userAvatar?: string | null;
  challengeBadges?: string[];
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
/* INTERNAL TYPE                                                    */
/* ================================================================ */

interface RawBoard {
  courseId: number;
  courseName: string;
  rawDoc: any;
  distance?: number;
  location?: { city?: string; state?: string };
}

/* ================================================================ */
/* MODULE-LEVEL HELPERS                                             */
/* ================================================================ */

function selectScores(rawDoc: any, holeCount: HoleCount): Score[] {
  if (holeCount === "18") {
    return rawDoc.topScores18?.length > 0 ? rawDoc.topScores18 : rawDoc.topScores || [];
  }
  return rawDoc.topScores9 || [];
}

function toBoard(raw: RawBoard, holeCount: HoleCount): CourseBoard {
  return {
    courseId: raw.courseId,
    courseName: raw.courseName,
    scores: selectScores(raw.rawDoc, holeCount),
    distance: raw.distance,
    location: raw.location,
  };
}

function hasScores(raw: RawBoard, holeCount: HoleCount): boolean {
  if (holeCount === "18") {
    return (raw.rawDoc.topScores18?.length > 0) || (raw.rawDoc.topScores?.length > 0);
  }
  return raw.rawDoc.topScores9?.length > 0;
}

/**
 * Sort boards: scored boards first (by distance), then empty boards (by distance).
 * Preserves the batched distance lookup performance from the previous version.
 */
function sortBoardsWithScoresFirst(boards: RawBoard[], holeCount: HoleCount): RawBoard[] {
  const withScores = boards.filter((b) => hasScores(b, holeCount)).sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
  const empty = boards.filter((b) => !hasScores(b, holeCount)).sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
  return [...withScores, ...empty];
}

/**
 * Batched course distance lookup — one where("id","in",[...]) query
 * replaces N sequential getDocs calls. No loop I/O.
 */
async function buildRawBoards(
  leaderboards: any[],
  userLat: number | undefined,
  userLon: number | undefined
): Promise<RawBoard[]> {
  if (leaderboards.length === 0) return [];

  const courseIds = leaderboards.map((lb) => lb.courseId);

  const chunks: number[][] = [];
  for (let i = 0; i < courseIds.length; i += 30) {
    chunks.push(courseIds.slice(i, i + 30));
  }

  const snaps = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(collection(db, "courses"), where("id", "in", chunk)))
    )
  );

  const courseMap = new Map<number, any>();
  for (const snap of snaps) {
    snap.docs.forEach((d) => {
      const data = d.data();
      courseMap.set(data.id, data);
    });
  }

  const result: RawBoard[] = leaderboards.map((lb) => {
    const cd = courseMap.get(lb.courseId);
    let distance: number | undefined;
    let location = lb.location;

    if (cd?.location?.latitude && cd?.location?.longitude && userLat && userLon) {
      distance = milesBetween(userLat, userLon, cd.location.latitude, cd.location.longitude);
    }
    if (!location && cd?.location) {
      location = { city: cd.location.city, state: cd.location.state };
    }

    return { courseId: lb.courseId, courseName: lb.courseName, rawDoc: lb, distance, location };
  });

  // Initial sort by distance — sortBoardsWithScoresFirst will re-sort with score priority
  result.sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
  return result;
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

  const [rawBoards, setRawBoards] = useState<RawBoard[]>([]);
  const [rawPinnedBoard, setRawPinnedBoard] = useState<RawBoard | null>(null);
  const [displayedCourseIds, setDisplayedCourseIds] = useState<number[]>([]);

  const [loading, setLoading] = useState(true);
  const [showingCached, setShowingCached] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [userRegionKey, setUserRegionKey] = useState("");
  const [pinnedCourseId, setPinnedCourseId] = useState<number | null>(null);

  const userDataRef = useRef<{
    regionKey: string;
    lat?: number;
    lon?: number;
    pinnedLeaderboard?: any;
  } | null>(null);

  /* ---------------------------------------------------------------- */
  /* Derived boards — instant on holeCount change                    */
  /* ---------------------------------------------------------------- */

  const boards = useMemo(
    () => rawBoards.map((rb) => toBoard(rb, holeCount)),
    [rawBoards, holeCount]
  );

  const pinnedBoard = useMemo(
    () => (rawPinnedBoard ? toBoard(rawPinnedBoard, holeCount) : null),
    [rawPinnedBoard, holeCount]
  );

  /* ---------------------------------------------------------------- */
  /* SINGLE USER DOC READ ON MOUNT                                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const loadUserData = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) return;

      const data = snap.data();
      const rk = data.regionKey || "";
      const lat = data.currentLatitude || data.latitude;
      const lon = data.currentLongitude || data.longitude;
      const pinned = data.pinnedLeaderboard || null;

      setUserRegionKey(rk);
      if (pinned?.courseId) setPinnedCourseId(pinned.courseId);
      userDataRef.current = { regionKey: rk, lat, lon, pinnedLeaderboard: pinned };
    };

    loadUserData();
  }, []);

  /* ---------------------------------------------------------------- */
  /* loadPinnedCourseId — only called after pin/unpin                */
  /* ---------------------------------------------------------------- */

  const loadPinnedCourseId = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) return;

      const pinned = snap.data()?.pinnedLeaderboard || null;
      setPinnedCourseId(pinned?.courseId ?? null);
      if (userDataRef.current) userDataRef.current.pinnedLeaderboard = pinned;
    } catch (error) {
      console.error("Error loading pinned course ID:", error);
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /* PARTNER IDS                                                      */
  /* ---------------------------------------------------------------- */

  const loadPartnerUserIds = async (userId: string): Promise<string[]> => {
    try {
      const [snap1, snap2] = await Promise.all([
        getDocs(query(collection(db, "partners"), where("user1Id", "==", userId))),
        getDocs(query(collection(db, "partners"), where("user2Id", "==", userId))),
      ]);
      const ids = new Set<string>();
      snap1.forEach((d) => ids.add(d.data().user2Id));
      snap2.forEach((d) => ids.add(d.data().user1Id));
      return Array.from(ids);
    } catch (error) {
      console.error("Error loading partners:", error);
      soundPlayer.play("error");
      return [];
    }
  };

  /* ---------------------------------------------------------------- */
  /* TRIGGER                                                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (userRegionKey) {
      fetchLeaderboardsWithCache();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterCourseId, filterPlayerId, userRegionKey]);

  const fetchLeaderboardsWithCache = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      if (filterType === "nearMe" && userRegionKey) {
        const cached = await getCache(
          CACHE_KEYS.LEADERBOARD(uid, userRegionKey, holeCount),
          userRegionKey
        );

        if (cached?.boards) {
          console.log(`⚡ Using cached leaderboards (${holeCount}-hole)`);
          setRawBoards(
            cached.boards.map((b: CourseBoard) => ({
              courseId: b.courseId,
              courseName: b.courseName,
              rawDoc: { topScores: b.scores, topScores18: b.scores, topScores9: b.scores },
              distance: b.distance,
              location: b.location,
            }))
          );
          if (cached.pinnedBoard) {
            setRawPinnedBoard({
              courseId: cached.pinnedBoard.courseId,
              courseName: cached.pinnedBoard.courseName,
              rawDoc: {
                topScores: cached.pinnedBoard.scores,
                topScores18: cached.pinnedBoard.scores,
                topScores9: cached.pinnedBoard.scores,
              },
              distance: cached.pinnedBoard.distance,
              location: cached.pinnedBoard.location,
            });
          }
          setDisplayedCourseIds(cached.displayedCourseIds || []);
          setShowingCached(true);
          setLoading(false);
        }
      }

      await fetchLeaderboards(true);
    } catch (error) {
      console.error("❌ Leaderboard cache error:", error);
      await fetchLeaderboards();
    }
  };

  /* ---------------------------------------------------------------- */
  /* FETCH LEADERBOARDS                                               */
  /* ---------------------------------------------------------------- */

  const fetchLeaderboards = useCallback(
    async (isBackgroundRefresh = false) => {
      try {
        if (!isBackgroundRefresh) setLoading(true);

        const uid = auth.currentUser?.uid;
        if (!uid) {
          console.log("❌ No user authenticated");
          soundPlayer.play("error");
          setLoading(false);
          return;
        }

        let ud = userDataRef.current;

        if (!ud?.regionKey) {
          const snap = await getDoc(doc(db, "users", uid));
          if (!snap.exists()) { setLoading(false); return; }
          const data = snap.data();
          ud = {
            regionKey: data.regionKey || "",
            lat: data.currentLatitude || data.latitude,
            lon: data.currentLongitude || data.longitude,
            pinnedLeaderboard: data.pinnedLeaderboard || null,
          };
          setUserRegionKey(ud.regionKey);
          if (ud.pinnedLeaderboard?.courseId) setPinnedCourseId(ud.pinnedLeaderboard.courseId);
          userDataRef.current = ud;
        }

        const { regionKey, lat: userLat, lon: userLon, pinnedLeaderboard } = ud;

        if (!regionKey) {
          console.log("⚠️ User has no regionKey");
          setLoading(false);
          return;
        }

        let leaderboards: any[] = [];
        let displayedIds: number[] = [];

        // ── FILTER ROUTING ──────────────────────────────────────────

        if (filterType === "course" && filterCourseId) {
          console.log("🔍 Filter: Specific Course -", filterCourseName);

          const snap = await getDocs(
            query(collection(db, "leaderboards"), where("courseId", "==", filterCourseId), limit(1))
          );

          if (!snap.empty) {
            leaderboards = [snap.docs[0].data()];
          } else {
            const course = await getCourseById(filterCourseId);
            leaderboards = [{
              courseId: filterCourseId,
              courseName: filterCourseName || course?.course_name || "Unknown Course",
              topScores18: [], topScores9: [], topScores: [],
              location: course?.location
                ? { city: course.location.city, state: course.location.state }
                : undefined,
            }];
          }
          displayedIds = [filterCourseId];

        } else if (filterType === "partnersOnly") {
          console.log("🔍 Filter: Partners Only");
          const partnerIds = await loadPartnerUserIds(uid);
          if (partnerIds.length === 0) {
            setRawBoards([]); setRawPinnedBoard(null); setDisplayedCourseIds([]);
            setShowingCached(false); setLoading(false);
            return;
          }
          leaderboards = await getLeaderboardsByPartners(partnerIds);
          displayedIds = leaderboards.map((lb: any) => lb.courseId);

        } else if (filterType === "player" && filterPlayerId) {
          console.log("🔍 Filter: Specific Player -", filterPlayerName);
          leaderboards = await getLeaderboardsByPlayer(filterPlayerId);
          displayedIds = leaderboards.map((lb: any) => lb.courseId);

        } else {
          // NEAR ME
          console.log("🔍 Filter: Near Me");
          leaderboards = await getLeaderboardsByRegion(regionKey);

          if (leaderboards.length === 0) {
            const hydrated = await hydrateLeaderboardsForRegion(regionKey);
            if (hydrated > 0) leaderboards = await getLeaderboardsByRegion(regionKey);
          }

          if (leaderboards.length < 3 && userLat && userLon) {
            const nearbyRegions = findNearestRegions(userLat, userLon, 3, 100);
            for (const { region } of nearbyRegions) {
              if (leaderboards.length >= 3) break;
              leaderboards.push(...(await getLeaderboardsByRegion(region.key)));
            }
          }

          displayedIds = leaderboards.map((lb: any) => lb.courseId);
        }

        console.log("📦 Total leaderboards to show:", leaderboards.length);

        if (leaderboards.length === 0) {
          setRawBoards([]); setRawPinnedBoard(null); setDisplayedCourseIds([]);
          setShowingCached(false); setLoading(false);
          return;
        }

        // ── BATCHED DISTANCE LOOKUP ──────────────────────────────────
        const rawBoardsList = await buildRawBoards(leaderboards, userLat, userLon);

        // ── SORT: scored boards first, then empty (within distance order)
        const sortedBoardsList = filterType === "nearMe"
          ? sortBoardsWithScoresFirst(rawBoardsList, holeCount)
          : rawBoardsList;

        // ── PINNED LEADERBOARD (nearMe only) ────────────────────────
        let finalRawBoards = sortedBoardsList;
        let finalRawPinned: RawBoard | null = null;

        if (filterType === "nearMe" && pinnedLeaderboard?.courseId) {
          const pinnedCourse = await getCourseById(pinnedLeaderboard.courseId);

          if (pinnedCourse) {
            const pinnedLB = await getLeaderboard(pinnedCourse.regionKey, pinnedLeaderboard.courseId);

            let pinnedDistance: number | undefined;
            if (pinnedCourse.location?.latitude && pinnedCourse.location?.longitude && userLat && userLon) {
              pinnedDistance = milesBetween(userLat, userLon, pinnedCourse.location.latitude, pinnedCourse.location.longitude);
            }

            finalRawPinned = {
              courseId: pinnedLeaderboard.courseId,
              courseName: pinnedLB?.courseName || pinnedLeaderboard.courseName,
              rawDoc: pinnedLB || { topScores18: [], topScores9: [], topScores: [] },
              distance: pinnedDistance,
              location: pinnedCourse.location
                ? { city: pinnedCourse.location.city, state: pinnedCourse.location.state }
                : undefined,
            };
          }

          finalRawBoards = sortedBoardsList
            .filter((b) => b.courseId !== pinnedLeaderboard.courseId)
            .slice(0, 2);
        } else if (filterType === "nearMe") {
          finalRawBoards = sortedBoardsList.slice(0, 3);
        }

        setRawBoards(finalRawBoards);
        setRawPinnedBoard(finalRawPinned);
        setDisplayedCourseIds(finalRawBoards.map((b) => b.courseId));

        // ── CACHE (nearMe only) ──────────────────────────────────────
        if (filterType === "nearMe" && regionKey) {
          const cacheData: LeaderboardCacheData = {
            boards: finalRawBoards.map((rb) => toBoard(rb, holeCount)),
            pinnedBoard: finalRawPinned ? toBoard(finalRawPinned, holeCount) : null,
            displayedCourseIds: finalRawBoards.map((b) => b.courseId),
          };
          await setCache(
            CACHE_KEYS.LEADERBOARD(uid, regionKey, holeCount),
            cacheData,
            regionKey
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
    },
    [filterType, filterCourseId, filterCourseName, filterPlayerId, filterPlayerName, setCache]
  );

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

export async function preloadLeaderboardData(
  userId: string,
  regionKey: string,
  holeCount: HoleCount = "18",
  setCache: (key: string, data: any, regionKey?: string) => Promise<void>
): Promise<void> {
  try {
    console.log("🔄 Preloading leaderboard...");

    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) return;

    const userData = userDoc.data();
    const userLat = userData.currentLatitude || userData.latitude;
    const userLon = userData.currentLongitude || userData.longitude;
    const pinnedLeaderboard = userData.pinnedLeaderboard || null;

    let leaderboards = await getLeaderboardsByRegion(regionKey);

    if (leaderboards.length === 0) {
      const hydrated = await hydrateLeaderboardsForRegion(regionKey);
      if (hydrated > 0) leaderboards = await getLeaderboardsByRegion(regionKey);
    }

    if (leaderboards.length < 3 && userLat && userLon) {
      const nearbyRegions = findNearestRegions(userLat, userLon, 3, 100);
      for (const { region } of nearbyRegions) {
        if (leaderboards.length >= 3) break;
        leaderboards.push(...(await getLeaderboardsByRegion(region.key)));
      }
    }

    if (leaderboards.length === 0) return;

    const rawBoardsList = await buildRawBoards(leaderboards, userLat, userLon);

    // Sort: scored boards first, then empty
    const sortedBoardsList = sortBoardsWithScoresFirst(rawBoardsList, holeCount);

    let finalRawBoards = sortedBoardsList;
    let finalRawPinned: RawBoard | null = null;

    if (pinnedLeaderboard?.courseId) {
      const pinnedCourse = await getCourseById(pinnedLeaderboard.courseId);
      if (pinnedCourse) {
        const pinnedLB = await getLeaderboard(pinnedCourse.regionKey, pinnedLeaderboard.courseId);
        let pinnedDistance: number | undefined;
        if (pinnedCourse.location?.latitude && pinnedCourse.location?.longitude && userLat && userLon) {
          pinnedDistance = milesBetween(userLat, userLon, pinnedCourse.location.latitude, pinnedCourse.location.longitude);
        }
        finalRawPinned = {
          courseId: pinnedLeaderboard.courseId,
          courseName: pinnedLB?.courseName || pinnedLeaderboard.courseName,
          rawDoc: pinnedLB || { topScores18: [], topScores9: [], topScores: [] },
          distance: pinnedDistance,
          location: pinnedCourse.location
            ? { city: pinnedCourse.location.city, state: pinnedCourse.location.state }
            : undefined,
        };
      }
      finalRawBoards = sortedBoardsList
        .filter((b) => b.courseId !== pinnedLeaderboard.courseId)
        .slice(0, 2);
    } else {
      finalRawBoards = sortedBoardsList.slice(0, 3);
    }

    const cacheData: LeaderboardCacheData = {
      boards: finalRawBoards.map((rb) => toBoard(rb, holeCount)),
      pinnedBoard: finalRawPinned ? toBoard(finalRawPinned, holeCount) : null,
      displayedCourseIds: finalRawBoards.map((b) => b.courseId),
    };

    await setCache(
      CACHE_KEYS.LEADERBOARD(userId, regionKey, holeCount),
      cacheData,
      regionKey
    );

    console.log(`✅ Leaderboard preloaded: ${finalRawBoards.length} boards`);
  } catch (error) {
    console.log("⚠️ Leaderboard preload failed (non-critical):", error);
  }
}