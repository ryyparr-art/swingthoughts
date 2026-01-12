import { db } from "@/constants/firebaseConfig";
import { getCoursesInRegion } from "@/utils/courseHelpers";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where
} from "firebase/firestore";

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
  hadHoleInOne?: boolean;
}

// ✅ UPDATED: Added 9-hole and 18-hole specific fields
interface LeaderboardData {
  regionKey: string;
  courseId: number;
  courseName: string;
  topScores: Score[];  // Legacy field for backward compatibility
  topScores18?: Score[]; // ✅ 18-hole scores
  topScores9?: Score[];  // ✅ 9-hole scores
  lowNetScore: number | null;  // Legacy field
  lowNetScore18?: number | null; // ✅ 18-hole low net
  lowNetScore9?: number | null;  // ✅ 9-hole low net
  totalScores: number;  // Legacy field
  totalScores18?: number; // ✅ 18-hole count
  totalScores9?: number;  // ✅ 9-hole count
  lastUpdated: string;
  location?: {
    city?: string;
    state?: string;
  };
  holesInOne?: Array<{
    userId: string;
    displayName: string;
    hole: number;
    holeCount: number; // 9 or 18
    achievedAt: any;
    postId: string | null;
  }>;
}

/**
 * Get leaderboard document ID
 * Format: {regionKey}_{courseId}
 */
function getLeaderboardId(regionKey: string, courseId: number): string {
  return `${regionKey}_${courseId}`;
}

/**
 * Get all leaderboards in a region
 * 
 * @param regionKey Region key (e.g., "us_nc_triad")
 * @returns Array of leaderboard data
 */
export async function getLeaderboardsByRegion(
  regionKey: string
): Promise<LeaderboardData[]> {
  try {
    console.log("🔍 Fetching leaderboards for region:", regionKey);

    const leaderboardsQuery = query(
      collection(db, "leaderboards"),
      where("regionKey", "==", regionKey)
    );

    const leaderboardsSnap = await getDocs(leaderboardsQuery);

    const leaderboards: LeaderboardData[] = [];
    leaderboardsSnap.forEach((doc) => {
      leaderboards.push(doc.data() as LeaderboardData);
    });

    console.log(`✅ Found ${leaderboards.length} leaderboards in ${regionKey}`);
    return leaderboards;
  } catch (error) {
    console.error("❌ Error fetching leaderboards:", error);
    return [];
  }
}

/**
 * Get a specific leaderboard
 * 
 * @param regionKey Region key
 * @param courseId Course ID
 * @returns Leaderboard data or null
 */
export async function getLeaderboard(
  regionKey: string,
  courseId: number
): Promise<LeaderboardData | null> {
  try {
    const leaderboardId = getLeaderboardId(regionKey, courseId);
    const leaderboardDoc = await getDoc(doc(db, "leaderboards", leaderboardId));

    if (leaderboardDoc.exists()) {
      return leaderboardDoc.data() as LeaderboardData;
    }

    return null;
  } catch (error) {
    console.error("❌ Error fetching leaderboard:", error);
    return null;
  }
}

/**
 * Create an empty leaderboard for a course
 * Used when displaying courses with no scores yet
 * 
 * @param regionKey Region key
 * @param courseId Course ID
 * @param courseName Course name
 * @param location Course location
 * @returns Created leaderboard data
 */
export async function createEmptyLeaderboard(
  regionKey: string,
  courseId: number,
  courseName: string,
  location?: { city?: string; state?: string }
): Promise<LeaderboardData> {
  const leaderboardData: LeaderboardData = {
    regionKey,
    courseId,
    courseName,
    topScores: [],
    topScores18: [],
    topScores9: [],
    lowNetScore: null,
    lowNetScore18: null,
    lowNetScore9: null,
    totalScores: 0,
    totalScores18: 0,
    totalScores9: 0,
    lastUpdated: new Date().toISOString(),
    location,
  };

  const leaderboardId = getLeaderboardId(regionKey, courseId);

  try {
    await setDoc(doc(db, "leaderboards", leaderboardId), leaderboardData);
    console.log(`✅ Created empty leaderboard: ${courseName}`);
  } catch (error) {
    console.error("❌ Error creating empty leaderboard:", error);
  }

  return leaderboardData;
}

/**
 * Get leaderboards from multiple regions
 * Used for expanding search to nearby regions
 * 
 * @param regionKeys Array of region keys
 * @param limitPerRegion Limit per region
 * @returns Array of leaderboards
 */
export async function getLeaderboardsFromRegions(
  regionKeys: string[],
  limitPerRegion: number = 3
): Promise<LeaderboardData[]> {
  try {
    const allLeaderboards: LeaderboardData[] = [];

    for (const regionKey of regionKeys) {
      const leaderboards = await getLeaderboardsByRegion(regionKey);
      allLeaderboards.push(...leaderboards.slice(0, limitPerRegion));
    }

    return allLeaderboards;
  } catch (error) {
    console.error("❌ Error fetching leaderboards from regions:", error);
    return [];
  }
}

/**
 * Update a leaderboard with new scores
 * Separates 9-hole and 18-hole scores, maintains top 3 for each
 * ✅ Stores denormalized user data: userName, userAvatar, displayName
 * 
 * @param regionKey Region key
 * @param courseId Course ID
 * @param allScores All scores for this course (already enriched with user data)
 */
export async function updateLeaderboard(
  regionKey: string,
  courseId: number,
  allScores: Score[]
): Promise<void> {
  try {
    const leaderboardId = getLeaderboardId(regionKey, courseId);

    // Separate 18-hole and 9-hole scores
    const scores18 = allScores.filter(s => !s.hadHoleInOne && (!s.par || s.par >= 54)); // 18-hole scores (par 54+)
    const scores9 = allScores.filter(s => !s.hadHoleInOne && s.par && s.par < 54); // 9-hole scores (par < 54)

    // Sort by net score (lowest first)
    const sorted18 = [...scores18].sort((a, b) => a.netScore - b.netScore);
    const sorted9 = [...scores9].sort((a, b) => a.netScore - b.netScore);

    // Take top 3 for each
    const topScores18 = sorted18.slice(0, 3);
    const topScores9 = sorted9.slice(0, 3);

    // Calculate low net scores
    const lowNetScore18 = topScores18.length > 0 ? topScores18[0].netScore : null;
    const lowNetScore9 = topScores9.length > 0 ? topScores9[0].netScore : null;

    // Get course name
    const courseName = allScores[0]?.courseName || "Unknown Course";

    // Build leaderboard data with all fields
    const leaderboardData: LeaderboardData = {
      regionKey,
      courseId,
      courseName,
      
      // 18-hole data
      topScores18,
      lowNetScore18,
      totalScores18: scores18.length,
      
      // 9-hole data
      topScores9,
      lowNetScore9,
      totalScores9: scores9.length,
      
      // Legacy fields (use 18-hole for backward compatibility)
      topScores: topScores18,
      lowNetScore: lowNetScore18,
      totalScores: scores18.length,
      
      lastUpdated: new Date().toISOString(),
    };

    await setDoc(doc(db, "leaderboards", leaderboardId), leaderboardData);

    console.log(
      `✅ Updated leaderboard: ${courseName} (18h: ${topScores18.length}, 9h: ${topScores9.length})`
    );
  } catch (error) {
    console.error("❌ Error updating leaderboard:", error);
  }
}

/**
 * Hydrate leaderboards for a region
 * Creates empty leaderboard documents for all courses in the region
 * 
 * @param regionKey Region key
 * @returns Number of leaderboards created
 */
export async function hydrateLeaderboardsForRegion(
  regionKey: string
): Promise<number> {
  try {
    console.log("🔄 Hydrating leaderboards for region:", regionKey);

    // Get all courses in this region
    const courses = await getCoursesInRegion(regionKey);

    if (courses.length === 0) {
      console.log("⚠️ No courses found in region");
      return 0;
    }

    let createdCount = 0;

    for (const course of courses) {
      const leaderboardId = getLeaderboardId(regionKey, course.id);
      const existingDoc = await getDoc(doc(db, "leaderboards", leaderboardId));

      // Skip if leaderboard already exists
      if (existingDoc.exists()) continue;

      await createEmptyLeaderboard(
        regionKey,
        course.id,
        course.course_name,
        course.location
          ? { city: course.location.city, state: course.location.state }
          : undefined
      );

      createdCount++;
    }

    console.log(
      `✅ Hydrated ${createdCount} leaderboards for ${regionKey}`
    );
    return createdCount;
  } catch (error) {
    console.error("❌ Error hydrating leaderboards:", error);
    return 0;
  }
}

/**
 * Get leaderboards for display on main leaderboard screen
 * Handles:
 * - Fetching by region
 * - Creating empty boards if no courses cached
 * - Expanding to nearby regions if needed
 * 
 * @param regionKey User's region key
 * @param userLat User's latitude (for nearby region expansion)
 * @param userLon User's longitude
 * @param limit Number of leaderboards to return
 * @returns Array of leaderboard data or empty boards
 */
export async function getLeaderboardsForDisplay(
  regionKey: string,
  userLat: number,
  userLon: number,
  limitCount: number = 3
): Promise<LeaderboardData[]> {
  try {
    console.log(
      `🔍 Getting leaderboards for display: ${regionKey} (limit: ${limitCount})`
    );

    // Step 1: Try to get leaderboards from user's region
    let leaderboards = await getLeaderboardsByRegion(regionKey);

    if (leaderboards.length >= limitCount) {
      console.log(`✅ Found ${leaderboards.length} leaderboards in region`);
      return leaderboards.slice(0, limitCount);
    }

    // Step 2: Check if there are courses in this region (but no leaderboards yet)
    const courses = await getCoursesInRegion(regionKey);

    if (courses.length > 0) {
      console.log(
        `📦 Found ${courses.length} courses in region but no leaderboards`
      );

      // Create empty leaderboards for display
      const emptyBoards: LeaderboardData[] = [];

      for (let i = 0; i < Math.min(courses.length, limitCount); i++) {
        const course = courses[i];
        const emptyBoard = await createEmptyLeaderboard(
          regionKey,
          course.id,
          course.course_name,
          course.location
            ? { city: course.location.city, state: course.location.state }
            : undefined
        );
        emptyBoards.push(emptyBoard);
      }

      return emptyBoards;
    }

    // Step 3: No courses in region - need to hydrate from API
    console.log("⚠️ No courses in region, returning empty state");
    return [];
  } catch (error) {
    console.error("❌ Error getting leaderboards for display:", error);
    return [];
  }
}

/**
 * Rebuild leaderboards from all scores in database
 * Used for migration or manual refresh
 * ✅ NOW FETCHES: User profiles and includes tee data
 * 
 * @param regionKey Optional - rebuild only specific region
 * @returns Number of leaderboards rebuilt
 */
export async function rebuildLeaderboards(
  regionKey?: string
): Promise<number> {
  try {
    console.log("🔄 Rebuilding leaderboards...", regionKey || "all regions");

    // Get all scores
    let scoresQuery = query(collection(db, "scores"));

    if (regionKey) {
      scoresQuery = query(
        collection(db, "scores"),
        where("regionKey", "==", regionKey)
      );
    }

    const scoresSnap = await getDocs(scoresQuery);

    // Collect all user IDs for batch profile fetch
    const userIds = new Set<string>();
    scoresSnap.forEach((doc) => {
      const data = doc.data();
      if (data.userId) userIds.add(data.userId);
    });

    // ✅ Fetch all user profiles
    console.log(`📦 Fetching ${userIds.size} user profiles...`);
    const { batchGetUserProfiles } = await import("@/utils/userProfileHelpers");
    const profileMap = await batchGetUserProfiles(Array.from(userIds));

    // Group scores by regionKey + courseId
    const grouped: Record<
      string,
      { regionKey: string; courseId: number; scores: Score[] }
    > = {};

    scoresSnap.forEach((doc) => {
      const data = doc.data();

      // Skip if missing regionKey (shouldn't happen after migration)
      if (!data.regionKey) {
        console.log("⚠️ Score missing regionKey:", doc.id);
        return;
      }

      // Skip hole-in-one scores
      if (data.hadHoleInOne === true) return;

      // Skip course account scores
      const userProfile = profileMap.get(data.userId);
      if (userProfile?.userType === "Course") return;

      // ✅ Build score with denormalized user data and tee info
      const score: Score = {
        scoreId: doc.id,
        userId: data.userId,
        courseId: data.courseId,
        courseName: data.courseName,
        grossScore: data.grossScore,
        netScore: data.netScore,
        par: data.par,
        tees: data.tees || "Unknown",
        teePar: data.teePar || data.par,
        teeYardage: data.teeYardage || 0,
        createdAt: data.createdAt,
        userName: userProfile?.displayName || "[Deleted User]",
        userAvatar: userProfile?.avatar || null,
      };

      const key = `${data.regionKey}_${data.courseId}`;

      if (!grouped[key]) {
        grouped[key] = {
          regionKey: data.regionKey,
          courseId: data.courseId,
          scores: [],
        };
      }

      grouped[key].scores.push(score);
    });

    console.log(`📦 Found ${Object.keys(grouped).length} unique leaderboards`);

    let rebuiltCount = 0;

    for (const key in grouped) {
      const { regionKey: rKey, courseId, scores } = grouped[key];
      await updateLeaderboard(rKey, courseId, scores);
      rebuiltCount++;
    }

    console.log(`✅ Rebuilt ${rebuiltCount} leaderboards`);
    return rebuiltCount;
  } catch (error) {
    console.error("❌ Error rebuilding leaderboards:", error);
    return 0;
  }
}

/**
 * Get leaderboards where a specific player has a top 3 score
 * Used for player filter
 * 
 * @param userId Player's user ID
 * @param limitCount Number of leaderboards to return
 * @returns Array of leaderboards where player appears in top 3
 */
export async function getLeaderboardsByPlayer(
  userId: string,
  limitCount: number = 100
): Promise<LeaderboardData[]> {
  try {
    console.log("🔍 Fetching leaderboards for player:", userId);

    // Query all leaderboards (we'll filter client-side)
    const leaderboardsSnap = await getDocs(collection(db, "leaderboards"));

    const playerLeaderboards: LeaderboardData[] = [];

    leaderboardsSnap.forEach((doc) => {
      const data = doc.data() as LeaderboardData;
      
      // Check if player is in top 3 (check both topScores and topScores18)
      const topScoresToCheck = data.topScores18 || data.topScores || [];
      const hasPlayer = topScoresToCheck.some((score: Score) => score.userId === userId);
      
      if (hasPlayer) {
        playerLeaderboards.push(data);
      }
    });

    console.log(`✅ Found ${playerLeaderboards.length} leaderboards with player`);
    return playerLeaderboards.slice(0, limitCount);
  } catch (error) {
    console.error("❌ Error fetching player leaderboards:", error);
    return [];
  }
}

/**
 * Get leaderboards where any partner has a top 3 score
 * Used for partners filter
 * 
 * @param partnerIds Array of partner user IDs
 * @param limitCount Number of leaderboards to return
 * @returns Array of leaderboards where partners appear in top 3
 */
export async function getLeaderboardsByPartners(
  partnerIds: string[],
  limitCount: number = 100
): Promise<LeaderboardData[]> {
  try {
    console.log("🔍 Fetching leaderboards for partners:", partnerIds.length);

    if (partnerIds.length === 0) return [];

    // Query all leaderboards (we'll filter client-side)
    const leaderboardsSnap = await getDocs(collection(db, "leaderboards"));

    const partnerLeaderboards: LeaderboardData[] = [];

    leaderboardsSnap.forEach((doc) => {
      const data = doc.data() as LeaderboardData;
      
      // Check if any partner is in top 3 (check both topScores and topScores18)
      const topScoresToCheck = data.topScores18 || data.topScores || [];
      const hasPartner = topScoresToCheck.some((score: Score) => 
        partnerIds.includes(score.userId)
      );
      
      if (hasPartner) {
        partnerLeaderboards.push(data);
      }
    });

    console.log(`✅ Found ${partnerLeaderboards.length} leaderboards with partners`);
    return partnerLeaderboards.slice(0, limitCount);
  } catch (error) {
    console.error("❌ Error fetching partner leaderboards:", error);
    return [];
  }
}