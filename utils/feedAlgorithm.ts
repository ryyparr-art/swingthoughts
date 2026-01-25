/**
 * Feed Algorithm v2 — Recency + Proximity + Engagement + Shuffle
 * 
 * Key Changes from v1:
 * - Time is primary factor (recency-first)
 * - Proximity determines bonus and engagement weight
 * - Engagement scaled by proximity (local engagement matters more)
 * - Shuffle factor adds variety on each load
 * 
 * Formula:
 * Final Score = Time + Proximity + Relationship + (Engagement × Proximity Multiplier) + Shuffle
 * 
 * Scoring:
 * - Time: 0-1hr: 100, 1-6hr: 80, 6-24hr: 60, 1-3d: 40, 3-7d: 20, 7d+: 10
 * - Proximity: Local: +30, Expanded: +15, Global: +0
 * - Relationship: Partner: +10
 * - Engagement: (darts + comments×2) → 0: +0, 1-5: +5, 6-15: +10, 16-30: +15, 30+: +20
 * - Engagement Multiplier: Local: 100%, Expanded: 50%, Global: 25%
 * - Shuffle: Random +0 to +15
 * 
 * Cache Behavior (handled in clubhouse component):
 * - Cold start: Full shuffle
 * - Warm start: Top 3 preserved, positions 4+ shuffled
 * - Background refresh: Silent merge, no reorder
 * - Pull-to-refresh: Full reshuffle
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
  
  // User data (denormalized from Firestore)
  displayName: string;
  avatar?: string;
  handicap?: string;
  userType?: string;
  verified?: boolean;
  
  // Content
  content: string;
  caption?: string;
  postType?: string;
  
  // Media
  imageUrl?: string | null;
  imageUrls?: string[];
  imageCount?: number;
  videoUrl?: string | null;
  videoThumbnailUrl?: string | null;
  videoDuration?: number | null;
  videoTrimStart?: number | null;
  videoTrimEnd?: number | null;
  hasMedia?: boolean;
  mediaType?: string | null;
  
  // Engagement
  likes?: number;
  likedBy?: string[];
  comments?: number;
  engagementScore?: number;
  viewCount?: number;
  
  // Location/Region
  regionKey?: string;
  geohash?: string;
  location?: {
    city: string;
    state: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  
  // Tags
  taggedCourses?: { courseId: number | string; courseName: string }[];
  taggedPartners?: { userId: string; displayName: string }[];
  
  // Metadata
  createdAt: Timestamp;
  thoughtId?: string;
  lastActivityAt?: Timestamp;
  
  // Algorithm fields
  relevanceScore: number;
  relevanceReason: string;
}

export interface FeedScore {
  type: "score";
  id: string;
  userId: string;
  displayName: string;
  avatar?: string;
  userType?: string;
  courseId: number;
  courseName: string;
  grossScore: number;
  netScore: number;
  par: number;
  isLowman?: boolean;
  likes?: number;
  comments?: number;
  createdAt: Timestamp;
  relevanceScore: number;
  relevanceReason: string;
}

export type FeedItem = FeedPost | FeedScore;

interface UserContext {
  userId: string;
  regionKey: string;
  geohash?: string;
  userType: string;
  partnerIds: string[];
  playerCourses: number[];
  memberCourses: number[];
}

type ProximityTier = "local" | "expanded" | "global";

// Global caches
const userProfileCache = new Map<string, any>();
const lowmanCache = new Map<number, any>();

/* ================================================================ */
/* SCORING CONSTANTS                                                */
/* ================================================================ */

// Time score based on post age
const TIME_SCORES = {
  UNDER_1_HOUR: 100,
  UNDER_6_HOURS: 80,
  UNDER_24_HOURS: 60,
  UNDER_3_DAYS: 40,
  UNDER_7_DAYS: 20,
  OVER_7_DAYS: 10,
};

// Proximity bonus
const PROXIMITY_BONUS = {
  local: 30,
  expanded: 15,
  global: 0,
};

// Engagement multiplier by proximity
const ENGAGEMENT_MULTIPLIER = {
  local: 1.0,
  expanded: 0.5,
  global: 0.25,
};

// Relationship bonus
const RELATIONSHIP_BONUS = {
  partner: 10,
  none: 0,
};

// Engagement bonus thresholds (darts + comments×2)
const ENGAGEMENT_THRESHOLDS = [
  { min: 30, bonus: 20 },
  { min: 16, bonus: 15 },
  { min: 6, bonus: 10 },
  { min: 1, bonus: 5 },
  { min: 0, bonus: 0 },
];

// Shuffle range
const SHUFFLE_MAX = 15;

/* ================================================================ */
/* SCORING FUNCTIONS                                                */
/* ================================================================ */

/**
 * Calculate time score based on post age
 */
function getTimeScore(createdAt: Timestamp): number {
  const now = Date.now();
  const postTime = createdAt.toMillis();
  const ageMs = now - postTime;
  
  const ONE_HOUR = 60 * 60 * 1000;
  const SIX_HOURS = 6 * ONE_HOUR;
  const ONE_DAY = 24 * ONE_HOUR;
  const THREE_DAYS = 3 * ONE_DAY;
  const SEVEN_DAYS = 7 * ONE_DAY;
  
  if (ageMs < ONE_HOUR) return TIME_SCORES.UNDER_1_HOUR;
  if (ageMs < SIX_HOURS) return TIME_SCORES.UNDER_6_HOURS;
  if (ageMs < ONE_DAY) return TIME_SCORES.UNDER_24_HOURS;
  if (ageMs < THREE_DAYS) return TIME_SCORES.UNDER_3_DAYS;
  if (ageMs < SEVEN_DAYS) return TIME_SCORES.UNDER_7_DAYS;
  return TIME_SCORES.OVER_7_DAYS;
}

/**
 * Calculate base engagement bonus (before proximity multiplier)
 */
function getEngagementBonus(likes: number = 0, comments: number = 0): number {
  const engagementPoints = likes + (comments * 2);
  
  for (const threshold of ENGAGEMENT_THRESHOLDS) {
    if (engagementPoints >= threshold.min) {
      return threshold.bonus;
    }
  }
  return 0;
}

/**
 * Generate shuffle factor (0 to SHUFFLE_MAX)
 */
function getShuffleFactor(): number {
  return Math.floor(Math.random() * (SHUFFLE_MAX + 1));
}

/**
 * Determine proximity tier for a post
 */
function getProximityTier(
  postRegionKey: string | undefined,
  postGeohash: string | undefined,
  userRegionKey: string,
  userGeohash: string | undefined
): ProximityTier {
  // Same region = local
  if (postRegionKey && postRegionKey === userRegionKey) {
    return "local";
  }
  
  // Check geohash proximity (3-char prefix = ~150 mile radius)
  if (postGeohash && userGeohash) {
    const postPrefix = postGeohash.substring(0, 3);
    const userPrefix = userGeohash.substring(0, 3);
    if (postPrefix === userPrefix) {
      return "expanded";
    }
  }
  
  return "global";
}

/**
 * Calculate final score for a feed item
 */
function calculateFinalScore(
  createdAt: Timestamp,
  proximityTier: ProximityTier,
  isPartner: boolean,
  likes: number = 0,
  comments: number = 0
): { score: number; breakdown: string } {
  const timeScore = getTimeScore(createdAt);
  const proximityBonus = PROXIMITY_BONUS[proximityTier];
  const relationshipBonus = isPartner ? RELATIONSHIP_BONUS.partner : RELATIONSHIP_BONUS.none;
  const engagementBonus = getEngagementBonus(likes, comments);
  const scaledEngagement = Math.floor(engagementBonus * ENGAGEMENT_MULTIPLIER[proximityTier]);
  const shuffleFactor = getShuffleFactor();
  
  const finalScore = timeScore + proximityBonus + relationshipBonus + scaledEngagement + shuffleFactor;
  
  const breakdown = `T:${timeScore} P:${proximityBonus} R:${relationshipBonus} E:${scaledEngagement} S:${shuffleFactor}`;
  
  return { score: finalScore, breakdown };
}

/**
 * Get human-readable relevance reason
 */
function getRelevanceReason(
  proximityTier: ProximityTier,
  isPartner: boolean,
  engagementPoints: number
): string {
  const parts: string[] = [];
  
  if (isPartner) parts.push("Partner");
  
  if (proximityTier === "local") parts.push("Local");
  else if (proximityTier === "expanded") parts.push("Nearby");
  else parts.push("Global");
  
  if (engagementPoints >= 30) parts.push("🔥 Trending");
  else if (engagementPoints >= 16) parts.push("Popular");
  else if (engagementPoints >= 6) parts.push("Engaging");
  
  return parts.join(" · ");
}

/* ================================================================ */
/* MAIN FEED GENERATION                                             */
/* ================================================================ */

export async function generateAlgorithmicFeed(
  userId: string,
  regionKey: string,
  maxItems: number = 20
): Promise<FeedItem[]> {
  console.log("🚀 Feed v2 — Recency + Proximity + Engagement");
  console.log("📍 Region:", regionKey);

  // Step 1: Build user context
  const context = await buildUserContext(userId, regionKey);

  // Step 2: Fetch all content in parallel
  const [localPosts, expandedPosts, globalPosts, coursePosts] = await Promise.all([
    fetchLocalPosts(context),
    fetchExpandedPosts(context),
    fetchGlobalPosts(context),
    fetchCoursePosts(context),
  ]);

  // Step 3: Score all items
  const allItems: FeedItem[] = [];

  // Process local posts
  for (const post of localPosts) {
    const isPartner = context.partnerIds.includes(post.userId);
    const { score, breakdown } = calculateFinalScore(
      post.createdAt,
      "local",
      isPartner,
      post.likes,
      post.comments
    );
    
    allItems.push({
      ...post,
      relevanceScore: score,
      relevanceReason: getRelevanceReason("local", isPartner, (post.likes || 0) + (post.comments || 0) * 2),
    });
  }

  // Process expanded posts (skip duplicates)
  const localIds = new Set(localPosts.map(p => p.id));
  for (const post of expandedPosts) {
    if (localIds.has(post.id)) continue;
    
    const isPartner = context.partnerIds.includes(post.userId);
    const { score, breakdown } = calculateFinalScore(
      post.createdAt,
      "expanded",
      isPartner,
      post.likes,
      post.comments
    );
    
    allItems.push({
      ...post,
      relevanceScore: score,
      relevanceReason: getRelevanceReason("expanded", isPartner, (post.likes || 0) + (post.comments || 0) * 2),
    });
  }

  // Process global posts (skip duplicates)
  const seenIds = new Set([...localIds, ...expandedPosts.map(p => p.id)]);
  for (const post of globalPosts) {
    if (seenIds.has(post.id)) continue;
    
    const isPartner = context.partnerIds.includes(post.userId);
    const { score, breakdown } = calculateFinalScore(
      post.createdAt,
      "global",
      isPartner,
      post.likes,
      post.comments
    );
    
    allItems.push({
      ...post,
      relevanceScore: score,
      relevanceReason: getRelevanceReason("global", isPartner, (post.likes || 0) + (post.comments || 0) * 2),
    });
  }

  // Process course scores (skip duplicates)
  for (const score of coursePosts) {
    if (seenIds.has(score.id)) continue;
    
    const isPartner = context.partnerIds.includes(score.userId);
    const proximityTier = getProximityTier(undefined, undefined, context.regionKey, context.geohash);
    const { score: finalScore } = calculateFinalScore(
      score.createdAt,
      proximityTier,
      isPartner,
      score.likes,
      score.comments
    );
    
    allItems.push({
      ...score,
      relevanceScore: finalScore,
      relevanceReason: score.isLowman ? "🏆 Lowman at your course" : "Score at your course",
    });
  }

  // Step 4: Sort by final score (highest first)
  const sorted = allItems.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    // Tiebreaker: more recent first
    return b.createdAt.toMillis() - a.createdAt.toMillis();
  });

  // Step 5: Return top items
  const finalFeed = sorted.slice(0, maxItems);

  console.log("✅ Feed generated:", {
    total: finalFeed.length,
    local: localPosts.length,
    expanded: expandedPosts.length,
    global: globalPosts.length,
    courses: coursePosts.length,
  });

  return finalFeed;
}

/* ================================================================ */
/* CONTEXT BUILDER                                                  */
/* ================================================================ */

async function buildUserContext(
  userId: string,
  regionKey: string
): Promise<UserContext> {
  const userDoc = await getDoc(doc(db, "users", userId));
  if (!userDoc.exists()) {
    throw new Error("User not found");
  }

  const userData = userDoc.data();
  const partnerIds = await getPartnerIds(userId);

  const context: UserContext = {
    userId,
    regionKey,
    geohash: userData.geohash,
    userType: userData.userType || "Golfer",
    partnerIds,
    playerCourses: userData.playerCourses || [],
    memberCourses: userData.declaredMemberCourses || [],
  };

  console.log("👤 Context:", {
    regionKey: context.regionKey,
    partners: context.partnerIds.length,
    courses: context.playerCourses.length + context.memberCourses.length,
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

/* ================================================================ */
/* DATA FETCHERS                                                    */
/* ================================================================ */

/**
 * Fetch posts from user's region
 */
async function fetchLocalPosts(context: UserContext): Promise<FeedPost[]> {
  if (!context.regionKey) return [];

  const postsSnap = await getDocs(
    query(
      collection(db, "thoughts"),
      where("regionKey", "==", context.regionKey),
      orderBy("createdAt", "desc"),
      limit(30)
    )
  );

  return await processPosts(postsSnap, context);
}

/**
 * Fetch posts from expanded region (geohash prefix)
 */
async function fetchExpandedPosts(context: UserContext): Promise<FeedPost[]> {
  if (!context.geohash) return [];

  const geohashPrefix = context.geohash.substring(0, 3);
  const geohashEnd = geohashPrefix + "~";

  const postsSnap = await getDocs(
    query(
      collection(db, "thoughts"),
      where("geohash", ">=", geohashPrefix),
      where("geohash", "<=", geohashEnd),
      orderBy("geohash"),
      orderBy("createdAt", "desc"),
      limit(20)
    )
  );

  return await processPosts(postsSnap, context);
}

/**
 * Fetch global posts (fallback)
 */
async function fetchGlobalPosts(context: UserContext): Promise<FeedPost[]> {
  const postsSnap = await getDocs(
    query(
      collection(db, "thoughts"),
      orderBy("createdAt", "desc"),
      limit(15)
    )
  );

  return await processPosts(postsSnap, context);
}

/**
 * Fetch scores from user's courses
 */
async function fetchCoursePosts(context: UserContext): Promise<FeedScore[]> {
  const allCourses = [
    ...context.playerCourses,
    ...context.memberCourses,
  ];

  if (allCourses.length === 0) return [];

  const uniqueCourses = Array.from(new Set(allCourses)).slice(0, 10);

  const scoresSnap = await getDocs(
    query(
      collection(db, "scores"),
      where("courseId", "in", uniqueCourses),
      orderBy("createdAt", "desc"),
      limit(15)
    )
  );

  // Collect user IDs that need profile fetching
  const userIdsNeedingProfiles = new Set<string>();
  const courseIds = new Set<number>();

  scoresSnap.forEach((doc) => {
    const data = doc.data();
    if (!data.displayName) {
      userIdsNeedingProfiles.add(data.userId);
    }
    courseIds.add(data.courseId);
  });

  // Batch fetch missing profiles and lowman data
  const [profiles, lowmanData] = await Promise.all([
    userIdsNeedingProfiles.size > 0 
      ? batchGetUserProfiles(Array.from(userIdsNeedingProfiles))
      : new Map(),
    batchCheckLowman(Array.from(courseIds)),
  ]);

  const scores: FeedScore[] = [];

  scoresSnap.forEach((docSnap) => {
    const data = docSnap.data();

    // Skip scores that already have thought posts
    if (data.thoughtId) {
      return;
    }

    const profile = profiles.get(data.userId);
    const lowman = lowmanData.get(data.courseId);
    const isLowman = !lowman || data.netScore < lowman.netScore;

    scores.push({
      type: "score",
      id: docSnap.id,
      userId: data.userId,
      displayName: data.displayName || profile?.displayName || "Unknown",
      avatar: data.avatar || profile?.avatar,
      userType: data.userType || profile?.userType || "Golfer",
      courseId: data.courseId,
      courseName: data.courseName,
      grossScore: data.grossScore,
      netScore: data.netScore,
      par: data.par,
      isLowman,
      likes: data.likes || 0,
      comments: data.comments || 0,
      createdAt: data.createdAt,
      relevanceScore: 0, // Will be set in main function
      relevanceReason: "",
    });
  });

  return scores;
}

/* ================================================================ */
/* POST PROCESSOR                                                   */
/* ================================================================ */

async function processPosts(
  postsSnap: any,
  context: UserContext
): Promise<FeedPost[]> {
  // Collect user IDs that need profile fetching
  const userIdsNeedingProfiles = new Set<string>();
  const postData: Array<{ doc: any; data: any }> = [];

  postsSnap.forEach((doc: any) => {
    const data = doc.data();
    postData.push({ doc, data });
    
    if (!data.displayName) {
      userIdsNeedingProfiles.add(data.userId);
    }
  });

  // Batch fetch missing profiles
  const profiles = userIdsNeedingProfiles.size > 0
    ? await batchGetUserProfiles(Array.from(userIdsNeedingProfiles))
    : new Map();

  // Build feed posts
  const posts: FeedPost[] = [];

  for (const { doc, data } of postData) {
    const profile = profiles.get(data.userId);

    posts.push({
      type: "post",
      id: doc.id,
      userId: data.userId,
      
      // User data
      displayName: data.displayName || profile?.displayName || "Unknown",
      avatar: data.avatar || profile?.avatar,
      handicap: data.handicap || profile?.handicap,
      userType: data.userType || profile?.userType || "Golfer",
      verified: data.verified || profile?.verified || false,
      
      // Content
      content: data.content || data.caption || "",
      caption: data.caption || data.content || "",
      postType: data.postType,
      
      // Media
      imageUrl: data.imageUrl,
      imageUrls: data.imageUrls || [],
      imageCount: data.imageCount || 0,
      videoUrl: data.videoUrl,
      videoThumbnailUrl: data.videoThumbnailUrl,
      videoDuration: data.videoDuration,
      videoTrimStart: data.videoTrimStart,
      videoTrimEnd: data.videoTrimEnd,
      hasMedia: data.hasMedia || false,
      mediaType: data.mediaType,
      
      // Engagement
      likes: data.likes || 0,
      likedBy: data.likedBy || [],
      comments: data.comments || 0,
      engagementScore: data.engagementScore || 0,
      viewCount: data.viewCount || 0,
      
      // Location/Region
      regionKey: data.regionKey,
      geohash: data.geohash,
      location: data.location,
      
      // Tags
      taggedCourses: data.taggedCourses || [],
      taggedPartners: data.taggedPartners || [],
      
      // Metadata
      createdAt: data.createdAt,
      thoughtId: data.thoughtId,
      lastActivityAt: data.lastActivityAt,
      
      // Algorithm (placeholder - set in main function)
      relevanceScore: 0,
      relevanceReason: "",
    });
  }

  return posts;
}

/* ================================================================ */
/* HELPER FUNCTIONS                                                 */
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
        handicap: userDoc.data()?.handicap,
        verified: userDoc.data()?.verified || false,
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
/* SHUFFLE UTILITIES (for clubhouse component)                      */
/* ================================================================ */

/**
 * Shuffle array in place (Fisher-Yates)
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Apply warm start shuffle (preserve top 3, shuffle rest)
 */
export function warmStartShuffle<T>(items: T[]): T[] {
  if (items.length <= 3) return items;
  
  const top3 = items.slice(0, 3);
  const rest = items.slice(3);
  const shuffledRest = shuffleArray(rest);
  
  return [...top3, ...shuffledRest];
}

/**
 * Apply cold start shuffle (full shuffle)
 */
export function coldStartShuffle<T>(items: T[]): T[] {
  return shuffleArray(items);
}