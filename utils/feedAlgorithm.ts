/**
 * OPTIMIZED Algorithmic Feed Utility with Jr User Type Priority
 * 
 * Priority Structure:
 * 1. Partners (100 pts) - ALWAYS #1, any partner activity
 * 2. Nearby Users (85-95 pts) - Same city → nearby cities, Jr → PGA → Course → Golfer
 * 3. Your Courses (80-85 pts) - Activity at your courses, Jr players first
 * 4. Your Own Activity (60-70 pts) - Limited to 2 posts + 2 scores
 * 5. Global Fallback (30-50 pts) - Jr → PGA → Course → Golfer priority
 * 
 * Key optimizations:
 * - Batch user profile fetching
 * - Parallel query execution
 * - Early limits to reduce data fetching
 * - Cached lowman checks
 * - Geographic expansion for nearby users
 */

import { db } from "@/constants/firebaseConfig";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

export interface FeedPost {
  type: "post";
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  imageUrl?: string;
  videoUrl?: string;
  videoThumbnailUrl?: string;
  caption: string;
  createdAt: Timestamp;
  taggedCourses?: { courseId: number; courseName: string }[];
  relevanceScore: number;
  relevanceReason: string;
}

export interface FeedScore {
  type: "score";
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  courseId: number;
  courseName: string;
  grossScore: number;
  netScore: number;
  par: number;
  isLowman?: boolean;
  createdAt: Timestamp;
  relevanceScore: number;
  relevanceReason: string;
}

export type FeedItem = FeedPost | FeedScore;

interface UserContext {
  userId: string;
  userType: string; // Jr, Golfer, PGA Professional, Course
  partnerIds: string[];
  partnersPartnerIds: string[];
  playerCourses: number[];
  memberCourses: number[];
  playedCourses: number[];
  location?: {
    city: string;
    state: string;
    country?: string;
  };
}

// Global caches
const userProfileCache = new Map<string, any>();
const lowmanCache = new Map<number, any>();

// User type priority for Jr users
const USER_TYPE_PRIORITY = {
  "Junior": 4,
  "PGA Professional": 3,
  "Course": 2,
  "Golfer": 1,
};

/* ================================================================ */
/* MAIN FEED GENERATION - OPTIMIZED                                 */
/* ================================================================ */

export async function generateAlgorithmicFeed(
  userId: string,
  maxItems: number = 50
): Promise<FeedItem[]> {
  console.log("🎯 Generating algorithmic feed for user:", userId);

  // Step 1: Build user context
  const context = await buildUserContext(userId);

  // Step 2: Gather feed items with NEW PRIORITY
  const [
    partnerItems,         // Priority 1: Partners (100 pts)
    nearbyUserItems,      // Priority 2: Nearby users with expansion (85-95 pts)
    courseItems,          // Priority 3: Your courses (80-85 pts)
    ownItems,             // Priority 4: Your own activity (60-70 pts) - REDUCED
  ] = await Promise.all([
    getPartnerActivity(context),
    getNearbyUsersWithExpansion(context), // NEW: Expands geographically
    getUserCoursesActivity(context),
    getUserOwnActivity(context), // Now limited to 2+2
  ]);

  const allItems: FeedItem[] = [
    ...partnerItems,
    ...nearbyUserItems,
    ...courseItems,
    ...ownItems,
  ];

  // Fill with global if still not enough (with Jr priority)
  if (allItems.length < maxItems) {
    const globalItems = await getGlobalActivityWithPriority(context, allItems.length);
    allItems.push(...globalItems);
  }

  // Deduplicate and sort
  const deduped = deduplicateItems(allItems);
  const sorted = deduped.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return b.createdAt.toMillis() - a.createdAt.toMillis();
  });

  const finalFeed = sorted.slice(0, maxItems);

  console.log("✅ Feed generated:", {
    total: finalFeed.length,
    posts: finalFeed.filter((i) => i.type === "post").length,
    scores: finalFeed.filter((i) => i.type === "score").length,
    userType: context.userType,
  });

  return finalFeed;
}

/* ================================================================ */
/* OPTIMIZED HELPER: BATCH USER PROFILES                            */
/* ================================================================ */

async function batchGetUserProfiles(userIds: string[]): Promise<Map<string, any>> {
  const profiles = new Map<string, any>();
  const toFetch: string[] = [];

  // Check cache first
  for (const userId of userIds) {
    if (userProfileCache.has(userId)) {
      profiles.set(userId, userProfileCache.get(userId));
    } else {
      toFetch.push(userId);
    }
  }

  // Batch fetch remaining
  if (toFetch.length > 0) {
    const fetchPromises = toFetch.map(async (userId) => {
      const userDoc = await getDoc(doc(db, "users", userId));
      const profile = {
        displayName: userDoc.data()?.displayName || "Unknown",
        avatar: userDoc.data()?.avatar,
        userType: userDoc.data()?.userType || "Golfer",
      };
      userProfileCache.set(userId, profile);
      return { userId, profile };
    });

    const results = await Promise.all(fetchPromises);
    results.forEach(({ userId, profile }) => {
      profiles.set(userId, profile);
    });
  }

  return profiles;
}

/* ================================================================ */
/* OPTIMIZED HELPER: BATCH LOWMAN CHECKS                            */
/* ================================================================ */

async function batchCheckLowman(courseIds: number[]): Promise<Map<number, any>> {
  const lowmanData = new Map<number, any>();
  const toFetch: number[] = [];

  // Check cache
  for (const courseId of courseIds) {
    if (lowmanCache.has(courseId)) {
      lowmanData.set(courseId, lowmanCache.get(courseId));
    } else {
      toFetch.push(courseId);
    }
  }

  // Batch fetch
  if (toFetch.length > 0) {
    const fetchPromises = toFetch.map(async (courseId) => {
      const leaderDoc = await getDoc(doc(db, "course_leaders", String(courseId)));
      const data = leaderDoc.exists() ? leaderDoc.data()?.lowman?.[0] : null;
      lowmanCache.set(courseId, data);
      return { courseId, data };
    });

    const results = await Promise.all(fetchPromises);
    results.forEach(({ courseId, data }) => {
      lowmanData.set(courseId, data);
    });
  }

  return lowmanData;
}

/* ================================================================ */
/* USER TYPE PRIORITY HELPER                                        */
/* ================================================================ */

function getUserTypePriorityBoost(
  targetUserType: string,
  viewerUserType: string
): number {
  // Only boost if viewer is Jr
  if (viewerUserType !== "Junior") return 0;
  
  const priority = USER_TYPE_PRIORITY[targetUserType as keyof typeof USER_TYPE_PRIORITY] || 0;
  
  // Jr users get +10 boost, PGA +7, Course +4, Golfer +0
  if (targetUserType === "Junior") return 10;
  if (targetUserType === "PGA Professional") return 7;
  if (targetUserType === "Course") return 4;
  return 0;
}

/* ================================================================ */
/* OPTIMIZED: USER CONTEXT BUILDER                                  */
/* ================================================================ */

async function buildUserContext(userId: string): Promise<UserContext> {
  const userDoc = await getDoc(doc(db, "users", userId));
  if (!userDoc.exists()) {
    throw new Error("User not found");
  }

  const userData = userDoc.data();

  // Run these in parallel
  const [partnerIds, playedCourses] = await Promise.all([
    getPartnerIds(userId),
    getPlayedCourses(userId),
  ]);

  // Only get partners' partners if we have partners (avoid unnecessary work)
  const partnersPartnerIds = partnerIds.length > 0 
    ? await getPartnersPartnerIds(partnerIds.slice(0, 10), userId) // Limit to first 10
    : [];

  const context: UserContext = {
    userId,
    userType: userData.userType || "Golfer",
    partnerIds,
    partnersPartnerIds,
    playerCourses: userData.playerCourses || [],
    memberCourses: userData.declaredMemberCourses || [],
    playedCourses,
    location: {
      city: userData.currentCity || userData.city,
      state: userData.currentState || userData.state,
      country: userData.country || "USA",
    },
  };

  console.log("👤 User context:", {
    userType: context.userType,
    partners: context.partnerIds.length,
    partnersPartners: context.partnersPartnerIds.length,
    playerCourses: context.playerCourses.length,
    memberCourses: context.memberCourses.length,
    playedCourses: context.playedCourses.length,
  });

  return context;
}

async function getPartnerIds(userId: string): Promise<string[]> {
  const [snap1, snap2] = await Promise.all([
    getDocs(query(collection(db, "partners"), where("user1Id", "==", userId))),
    getDocs(query(collection(db, "partners"), where("user2Id", "==", userId))),
  ]);

  const partnerIds = new Set<string>();
  snap1.forEach((doc) => partnerIds.add(doc.data().user2Id));
  snap2.forEach((doc) => partnerIds.add(doc.data().user1Id));

  return Array.from(partnerIds);
}

async function getPartnersPartnerIds(
  partnerIds: string[],
  excludeUserId: string
): Promise<string[]> {
  if (partnerIds.length === 0) return [];

  const partnersPartnerIds = new Set<string>();

  // Parallel fetch partner's partners
  const partnerPartnerPromises = partnerIds.map((partnerId) => getPartnerIds(partnerId));
  const allPartnerPartners = await Promise.all(partnerPartnerPromises);

  allPartnerPartners.forEach((partnerPartners) => {
    partnerPartners.forEach((id) => {
      if (id !== excludeUserId && !partnerIds.includes(id)) {
        partnersPartnerIds.add(id);
      }
    });
  });

  return Array.from(partnersPartnerIds);
}

async function getPlayedCourses(userId: string): Promise<number[]> {
  const scoresSnap = await getDocs(
    query(collection(db, "scores"), where("userId", "==", userId), limit(100))
  );

  const courseIds = new Set<number>();
  scoresSnap.forEach((doc) => {
    const data = doc.data();
    if (data.courseId) courseIds.add(data.courseId);
  });

  return Array.from(courseIds);
}

/* ================================================================ */
/* PRIORITY 1: PARTNER ACTIVITY (100 pts)                          */
/* ================================================================ */

async function getPartnerActivity(context: UserContext): Promise<FeedItem[]> {
  if (context.partnerIds.length === 0) return [];

  const items: FeedItem[] = [];
  const batch = context.partnerIds.slice(0, 10); // Limit to 10 partners

  // Parallel fetch
  const [postsSnap, scoresSnap] = await Promise.all([
    getDocs(query(
      collection(db, "thoughts"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(20)
    )),
    getDocs(query(
      collection(db, "scores"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(20)
    )),
  ]);

  // Batch get user profiles
  const userIds = new Set<string>();
  postsSnap.forEach((doc) => userIds.add(doc.data().userId));
  scoresSnap.forEach((doc) => userIds.add(doc.data().userId));
  const profiles = await batchGetUserProfiles(Array.from(userIds));

  // Batch get lowman data
  const courseIds = scoresSnap.docs.map((doc) => doc.data().courseId);
  const lowmanData = await batchCheckLowman(courseIds);

  postsSnap.forEach((doc) => {
    const data = doc.data();
    const profile = profiles.get(data.userId)!;

    items.push({
      type: "post",
      id: doc.id,
      userId: data.userId,
      userName: profile.displayName,
      userAvatar: profile.avatar,
      imageUrl: data.imageUrl,
      videoUrl: data.videoUrl,
      videoThumbnailUrl: data.videoThumbnailUrl,
      caption: data.caption || data.content || "",
      createdAt: data.createdAt,
      taggedCourses: data.taggedCourses || [],
      relevanceScore: 100,
      relevanceReason: "Partner posted",
    });
  });

  scoresSnap.forEach((doc) => {
    const data = doc.data();
    const profile = profiles.get(data.userId)!;
    const lowman = lowmanData.get(data.courseId);
    const isLowman = !lowman || data.netScore < lowman.netScore;

    items.push({
      type: "score",
      id: doc.id,
      userId: data.userId,
      userName: profile.displayName,
      userAvatar: profile.avatar,
      courseId: data.courseId,
      courseName: data.courseName,
      grossScore: data.grossScore,
      netScore: data.netScore,
      par: data.par,
      isLowman,
      createdAt: data.createdAt,
      relevanceScore: isLowman ? 100 : 98,
      relevanceReason: isLowman ? "Partner's new lowman!" : "Partner posted score",
    });
  });

  return items;
}

/* ================================================================ */
/* PRIORITY 2: NEARBY USERS WITH EXPANSION (85-95 pts)             */
/* ================================================================ */

async function getNearbyUsersWithExpansion(context: UserContext): Promise<FeedItem[]> {
  if (!context.location?.city || !context.location?.state) return [];

  const items: FeedItem[] = [];
  
  // Step 1: Same city
  const sameCityUsers = await getNearbyUsersByLocation(
    context.location.city,
    context.location.state,
    context
  );
  
  items.push(...sameCityUsers);
  
  // Step 2: If not enough, expand to same state (different cities)
  if (items.length < 15) {
    console.log("📍 Expanding to nearby cities in", context.location.state);
    const statewideUsers = await getNearbyUsersByState(
      context.location.state,
      context.location.city, // Exclude current city
      context
    );
    items.push(...statewideUsers);
  }
  
  console.log("🌍 Nearby users found:", items.length);
  return items;
}

async function getNearbyUsersByLocation(
  city: string,
  state: string,
  context: UserContext
): Promise<FeedItem[]> {
  const items: FeedItem[] = [];

  const localUsersSnap = await getDocs(query(
    collection(db, "users"),
    where("currentCity", "==", city),
    where("currentState", "==", state),
    limit(30)
  ));

  const localUserIds: string[] = [];
  localUsersSnap.forEach((doc) => {
    if (doc.id !== context.userId) {
      localUserIds.push(doc.id);
    }
  });

  if (localUserIds.length === 0) return [];

  // Get posts and scores from nearby users
  const batch = localUserIds.slice(0, 10);
  const [postsSnap, scoresSnap] = await Promise.all([
    getDocs(query(
      collection(db, "thoughts"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(15)
    )),
    getDocs(query(
      collection(db, "scores"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(15)
    )),
  ]);

  const userIds = new Set<string>();
  const courseIds = new Set<number>();
  postsSnap.forEach((doc) => userIds.add(doc.data().userId));
  scoresSnap.forEach((doc) => {
    userIds.add(doc.data().userId);
    courseIds.add(doc.data().courseId);
  });

  const [profiles, lowmanData] = await Promise.all([
    batchGetUserProfiles(Array.from(userIds)),
    batchCheckLowman(Array.from(courseIds)),
  ]);

  // Process posts
  postsSnap.forEach((doc) => {
    const data = doc.data();
    const profile = profiles.get(data.userId)!;
    const priorityBoost = getUserTypePriorityBoost(profile.userType, context.userType);

    items.push({
      type: "post",
      id: doc.id,
      userId: data.userId,
      userName: profile.displayName,
      userAvatar: profile.avatar,
      imageUrl: data.imageUrl,
      videoUrl: data.videoUrl,
      videoThumbnailUrl: data.videoThumbnailUrl,
      caption: data.caption || data.content || "",
      createdAt: data.createdAt,
      taggedCourses: data.taggedCourses || [],
      relevanceScore: 90 + priorityBoost,
      relevanceReason: `Nearby in ${city}, ${state}`,
    });
  });

  // Process scores
  scoresSnap.forEach((doc) => {
    const data = doc.data();
    const profile = profiles.get(data.userId)!;
    const lowman = lowmanData.get(data.courseId);
    const isLowman = !lowman || data.netScore < lowman.netScore;
    const priorityBoost = getUserTypePriorityBoost(profile.userType, context.userType);

    items.push({
      type: "score",
      id: doc.id,
      userId: data.userId,
      userName: profile.displayName,
      userAvatar: profile.avatar,
      courseId: data.courseId,
      courseName: data.courseName,
      grossScore: data.grossScore,
      netScore: data.netScore,
      par: data.par,
      isLowman,
      createdAt: data.createdAt,
      relevanceScore: (isLowman ? 95 : 88) + priorityBoost,
      relevanceReason: isLowman 
        ? `🏆 Nearby lowman: ${city}, ${state}`
        : `Nearby score: ${city}, ${state}`,
    });
  });

  return items;
}

async function getNearbyUsersByState(
  state: string,
  excludeCity: string,
  context: UserContext
): Promise<FeedItem[]> {
  const items: FeedItem[] = [];

  // Get users in same state but different city
  const stateUsersSnap = await getDocs(query(
    collection(db, "users"),
    where("currentState", "==", state),
    limit(30)
  ));

  const stateUserIds: string[] = [];
  stateUsersSnap.forEach((doc) => {
    const data = doc.data();
    if (doc.id !== context.userId && data.currentCity !== excludeCity) {
      stateUserIds.push(doc.id);
    }
  });

  if (stateUserIds.length === 0) return [];

  const batch = stateUserIds.slice(0, 10);
  const [postsSnap, scoresSnap] = await Promise.all([
    getDocs(query(
      collection(db, "thoughts"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(10)
    )),
    getDocs(query(
      collection(db, "scores"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(10)
    )),
  ]);

  const userIds = new Set<string>();
  const courseIds = new Set<number>();
  postsSnap.forEach((doc) => userIds.add(doc.data().userId));
  scoresSnap.forEach((doc) => {
    userIds.add(doc.data().userId);
    courseIds.add(doc.data().courseId);
  });

  const [profiles, lowmanData] = await Promise.all([
    batchGetUserProfiles(Array.from(userIds)),
    batchCheckLowman(Array.from(courseIds)),
  ]);

  postsSnap.forEach((doc) => {
    const data = doc.data();
    const profile = profiles.get(data.userId)!;
    const priorityBoost = getUserTypePriorityBoost(profile.userType, context.userType);

    items.push({
      type: "post",
      id: doc.id,
      userId: data.userId,
      userName: profile.displayName,
      userAvatar: profile.avatar,
      imageUrl: data.imageUrl,
      videoUrl: data.videoUrl,
      videoThumbnailUrl: data.videoThumbnailUrl,
      caption: data.caption || data.content || "",
      createdAt: data.createdAt,
      taggedCourses: data.taggedCourses || [],
      relevanceScore: 85 + priorityBoost,
      relevanceReason: `Nearby in ${state}`,
    });
  });

  scoresSnap.forEach((doc) => {
    const data = doc.data();
    const profile = profiles.get(data.userId)!;
    const lowman = lowmanData.get(data.courseId);
    const isLowman = !lowman || data.netScore < lowman.netScore;
    const priorityBoost = getUserTypePriorityBoost(profile.userType, context.userType);

    items.push({
      type: "score",
      id: doc.id,
      userId: data.userId,
      userName: profile.displayName,
      userAvatar: profile.avatar,
      courseId: data.courseId,
      courseName: data.courseName,
      grossScore: data.grossScore,
      netScore: data.netScore,
      par: data.par,
      isLowman,
      createdAt: data.createdAt,
      relevanceScore: (isLowman ? 88 : 83) + priorityBoost,
      relevanceReason: isLowman 
        ? `🏆 Nearby lowman in ${state}`
        : `Nearby score in ${state}`,
    });
  });

  return items;
}

/* ================================================================ */
/* PRIORITY 3: YOUR COURSES ACTIVITY (80-85 pts)                   */
/* ================================================================ */

async function getUserCoursesActivity(context: UserContext): Promise<FeedItem[]> {
  const allCourses = [
    ...context.playerCourses,
    ...context.memberCourses,
  ];

  if (allCourses.length === 0) return [];

  const uniqueCourses = Array.from(new Set(allCourses)).slice(0, 10);
  const items: FeedItem[] = [];

  const batch = uniqueCourses.slice(0, 10);
  const scoresSnap = await getDocs(query(
    collection(db, "scores"),
    where("courseId", "in", batch),
    orderBy("createdAt", "desc"),
    limit(25)
  ));

  const userIds = new Set<string>();
  const courseIds = new Set<number>();
  scoresSnap.forEach((doc) => {
    const data = doc.data();
    if (data.userId !== context.userId) {
      userIds.add(data.userId);
      courseIds.add(data.courseId);
    }
  });

  const [profiles, lowmanData] = await Promise.all([
    batchGetUserProfiles(Array.from(userIds)),
    batchCheckLowman(Array.from(courseIds)),
  ]);

  scoresSnap.forEach((doc) => {
    const data = doc.data();
    if (data.userId === context.userId) return;

    const profile = profiles.get(data.userId)!;
    const lowman = lowmanData.get(data.courseId);
    const isLowman = !lowman || data.netScore < lowman.netScore;
    const priorityBoost = getUserTypePriorityBoost(profile.userType, context.userType);

    items.push({
      type: "score",
      id: doc.id,
      userId: data.userId,
      userName: profile.displayName,
      userAvatar: profile.avatar,
      courseId: data.courseId,
      courseName: data.courseName,
      grossScore: data.grossScore,
      netScore: data.netScore,
      par: data.par,
      isLowman,
      createdAt: data.createdAt,
      relevanceScore: (isLowman ? 85 : 80) + priorityBoost,
      relevanceReason: isLowman ? "Lowman at your course" : "Score at your course",
    });
  });

  return items;
}

/* ================================================================ */
/* PRIORITY 4: YOUR OWN ACTIVITY (60-70 pts) - REDUCED             */
/* ================================================================ */

async function getUserOwnActivity(context: UserContext): Promise<FeedItem[]> {
  const items: FeedItem[] = [];

  // REDUCED: 2 posts + 2 scores instead of 5+3
  const [postsSnap, scoresSnap] = await Promise.all([
    getDocs(query(
      collection(db, "thoughts"),
      where("userId", "==", context.userId),
      orderBy("createdAt", "desc"),
      limit(2) // REDUCED from 5
    )),
    getDocs(query(
      collection(db, "scores"),
      where("userId", "==", context.userId),
      orderBy("createdAt", "desc"),
      limit(2) // REDUCED from 3
    )),
  ]);

  const userProfile = await getUserProfile(context.userId);
  const courseIds = scoresSnap.docs.map((doc) => doc.data().courseId);
  const lowmanData = await batchCheckLowman(courseIds);

  postsSnap.forEach((doc) => {
    const data = doc.data();
    items.push({
      type: "post",
      id: doc.id,
      userId: data.userId,
      userName: userProfile.displayName,
      userAvatar: userProfile.avatar,
      imageUrl: data.imageUrl,
      videoUrl: data.videoUrl,
      videoThumbnailUrl: data.videoThumbnailUrl,
      caption: data.caption || data.content || "",
      createdAt: data.createdAt,
      taggedCourses: data.taggedCourses || [],
      relevanceScore: 65,
      relevanceReason: "Your post",
    });
  });

  scoresSnap.forEach((doc) => {
    const data = doc.data();
    const lowman = lowmanData.get(data.courseId);
    const isLowman = !lowman || data.netScore < lowman.netScore;

    items.push({
      type: "score",
      id: doc.id,
      userId: data.userId,
      userName: userProfile.displayName,
      userAvatar: userProfile.avatar,
      courseId: data.courseId,
      courseName: data.courseName,
      grossScore: data.grossScore,
      netScore: data.netScore,
      par: data.par,
      isLowman,
      createdAt: data.createdAt,
      relevanceScore: isLowman ? 70 : 62,
      relevanceReason: isLowman ? "Your new lowman!" : "Your score",
    });
  });

  return items;
}

/* ================================================================ */
/* PRIORITY 5: GLOBAL FALLBACK WITH JR PRIORITY (30-50 pts)        */
/* ================================================================ */

async function getGlobalActivityWithPriority(
  context: UserContext,
  currentItemCount: number
): Promise<FeedItem[]> {
  if (currentItemCount >= 30) return [];

  const items: FeedItem[] = [];
  const needed = Math.min(20, 50 - currentItemCount);

  const [postsSnap, scoresSnap] = await Promise.all([
    getDocs(query(
      collection(db, "thoughts"),
      orderBy("createdAt", "desc"),
      limit(Math.ceil(needed / 2))
    )),
    getDocs(query(
      collection(db, "scores"),
      orderBy("createdAt", "desc"),
      limit(Math.floor(needed / 2))
    )),
  ]);

  const userIds = new Set<string>();
  postsSnap.forEach((doc) => {
    if (doc.data().userId !== context.userId) {
      userIds.add(doc.data().userId);
    }
  });
  scoresSnap.forEach((doc) => {
    if (doc.data().userId !== context.userId) {
      userIds.add(doc.data().userId);
    }
  });

  const profiles = await batchGetUserProfiles(Array.from(userIds));

  postsSnap.forEach((doc) => {
    const data = doc.data();
    if (data.userId === context.userId) return;

    const profile = profiles.get(data.userId)!;
    const priorityBoost = getUserTypePriorityBoost(profile.userType, context.userType);

    items.push({
      type: "post",
      id: doc.id,
      userId: data.userId,
      userName: profile.displayName,
      userAvatar: profile.avatar,
      imageUrl: data.imageUrl,
      videoUrl: data.videoUrl,
      videoThumbnailUrl: data.videoThumbnailUrl,
      caption: data.caption || data.content || "",
      createdAt: data.createdAt,
      taggedCourses: data.taggedCourses || [],
      relevanceScore: 35 + priorityBoost,
      relevanceReason: "Global activity",
    });
  });

  scoresSnap.forEach((doc) => {
    const data = doc.data();
    if (data.userId === context.userId) return;

    const profile = profiles.get(data.userId)!;
    const priorityBoost = getUserTypePriorityBoost(profile.userType, context.userType);

    items.push({
      type: "score",
      id: doc.id,
      userId: data.userId,
      userName: profile.displayName,
      userAvatar: profile.avatar,
      courseId: data.courseId,
      courseName: data.courseName,
      grossScore: data.grossScore,
      netScore: data.netScore,
      par: data.par,
      createdAt: data.createdAt,
      relevanceScore: 30 + priorityBoost,
      relevanceReason: "Global score",
    });
  });

  return items;
}

/* ================================================================ */
/* HELPER FUNCTIONS                                                 */
/* ================================================================ */

async function getUserProfile(userId: string): Promise<any> {
  if (userProfileCache.has(userId)) {
    return userProfileCache.get(userId);
  }

  const userDoc = await getDoc(doc(db, "users", userId));
  const profile = {
    displayName: userDoc.data()?.displayName || "Unknown",
    avatar: userDoc.data()?.avatar,
    userType: userDoc.data()?.userType || "Golfer",
  };

  userProfileCache.set(userId, profile);
  return profile;
}

function deduplicateItems(items: FeedItem[]): FeedItem[] {
  const seen = new Map<string, FeedItem>();

  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.set(item.id, item);
    } else {
      const existing = seen.get(item.id)!;
      if (item.relevanceScore > existing.relevanceScore) {
        seen.set(item.id, item);
      }
    }
  }

  return Array.from(seen.values());
}