/**
 * OPTIMIZED Algorithmic Feed Utility
 * 
 * Key optimizations:
 * - Batch user profile fetching
 * - Parallel query execution
 * - Early limits to reduce data fetching
 * - Cached lowman checks
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

  // Step 2: Gather feed items IN PARALLEL with limits
  const [
    ownItems,
    partnerItems,
    nearbyLowmanItems,
    courseItems,
  ] = await Promise.all([
    getUserOwnActivity(context),
    getPartnerActivity(context),
    getNearbyLowmanActivity(context),
    getUserCoursesActivity(context),
  ]);

  const allItems: FeedItem[] = [
    ...ownItems,
    ...partnerItems,
    ...nearbyLowmanItems,
    ...courseItems,
  ];

  // Only fetch more if we don't have enough
  if (allItems.length < maxItems) {
    const [
      partnersPartnerItems,
      localItems,
    ] = await Promise.all([
      getPartnersPartnerActivity(context),
      getLocalAreaActivity(context),
    ]);

    allItems.push(...partnersPartnerItems, ...localItems);
  }

  // Fill with global if still not enough
  if (allItems.length < maxItems) {
    const globalItems = await getGlobalActivity(context, allItems.length);
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
/* OPTIMIZED LAYER FUNCTIONS                                        */
/* ================================================================ */

async function getUserOwnActivity(context: UserContext): Promise<FeedItem[]> {
  const items: FeedItem[] = [];

  // Parallel fetch
  const [postsSnap, scoresSnap] = await Promise.all([
    getDocs(query(
      collection(db, "thoughts"),
      where("userId", "==", context.userId),
      orderBy("createdAt", "desc"),
      limit(5) // Reduce from 10
    )),
    getDocs(query(
      collection(db, "scores"),
      where("userId", "==", context.userId),
      orderBy("createdAt", "desc"),
      limit(3) // Reduce from 5
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
      caption: data.caption || data.content || "",
      createdAt: data.createdAt,
      taggedCourses: data.taggedCourses || [],
      relevanceScore: 60,
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
      relevanceScore: isLowman ? 62 : 58,
      relevanceReason: isLowman ? "Your new lowman!" : "Your score",
    });
  });

  return items;
}

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
      limit(15) // Reduce from 20
    )),
    getDocs(query(
      collection(db, "scores"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(15) // Reduce from 20
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
      relevanceScore: isLowman ? 98 : 95,
      relevanceReason: isLowman ? "Partner's new lowman!" : "Partner posted score",
    });
  });

  return items;
}

async function getNearbyLowmanActivity(context: UserContext): Promise<FeedItem[]> {
  if (!context.location?.city || !context.location?.state) return [];

  const items: FeedItem[] = [];

  const localUsersSnap = await getDocs(query(
    collection(db, "users"),
    where("currentCity", "==", context.location.city),
    where("currentState", "==", context.location.state),
    limit(20) // Add limit
  ));

  const localUserIds: string[] = [];
  localUsersSnap.forEach((doc) => {
    if (doc.id !== context.userId) {
      localUserIds.push(doc.id);
    }
  });

  if (localUserIds.length === 0) return [];

  const batch = localUserIds.slice(0, 10);
  const scoresSnap = await getDocs(query(
    collection(db, "scores"),
    where("userId", "in", batch),
    orderBy("createdAt", "desc"),
    limit(10) // Reduce from 20
  ));

  const userIds = new Set<string>();
  const courseIds = new Set<number>();
  scoresSnap.forEach((doc) => {
    userIds.add(doc.data().userId);
    courseIds.add(doc.data().courseId);
  });

  const [profiles, lowmanData] = await Promise.all([
    batchGetUserProfiles(Array.from(userIds)),
    batchCheckLowman(Array.from(courseIds)),
  ]);

  scoresSnap.forEach((doc) => {
    const data = doc.data();
    const lowman = lowmanData.get(data.courseId);
    const isLowman = !lowman || data.netScore < lowman.netScore;

    if (isLowman && context.location) {
      const profile = profiles.get(data.userId)!;
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
        isLowman: true,
        createdAt: data.createdAt,
        relevanceScore: 96,
        relevanceReason: `🏆 Nearby lowman: ${context.location.city}, ${context.location.state}`,
      });
    }
  });

  return items;
}

async function getUserCoursesActivity(context: UserContext): Promise<FeedItem[]> {
  const allCourses = [
    ...context.playerCourses,
    ...context.memberCourses,
  ];

  if (allCourses.length === 0) return [];

  const uniqueCourses = Array.from(new Set(allCourses)).slice(0, 10); // Limit courses
  const items: FeedItem[] = [];

  const batch = uniqueCourses.slice(0, 10);
  const scoresSnap = await getDocs(query(
    collection(db, "scores"),
    where("courseId", "in", batch),
    orderBy("createdAt", "desc"),
    limit(20) // Reduce from 30
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
      relevanceScore: 85,
      relevanceReason: isLowman ? "Lowman at your course" : "Score at your course",
    });
  });

  return items;
}

async function getPartnersPartnerActivity(context: UserContext): Promise<FeedItem[]> {
  // Simplified - skip for now to speed up initial load
  return [];
}

async function getLocalAreaActivity(context: UserContext): Promise<FeedItem[]> {
  // Simplified - skip for now
  return [];
}

async function getGlobalActivity(
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
    items.push({
      type: "post",
      id: doc.id,
      userId: data.userId,
      userName: profile.displayName,
      userAvatar: profile.avatar,
      imageUrl: data.imageUrl,
      caption: data.caption || data.content || "",
      createdAt: data.createdAt,
      taggedCourses: data.taggedCourses || [],
      relevanceScore: 30,
      relevanceReason: "Global activity",
    });
  });

  scoresSnap.forEach((doc) => {
    const data = doc.data();
    if (data.userId === context.userId) return;

    const profile = profiles.get(data.userId)!;
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
      relevanceScore: 25,
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