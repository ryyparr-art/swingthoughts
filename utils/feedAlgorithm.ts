/**
 * Feed Algorithm v3 — Time Bracket System
 * 
 * Core Principle: Recency is king, with trending as the only exception
 * 
 * How it works:
 * 1. Posts are assigned to TIME BRACKETS based on age
 * 2. Brackets are STRICT - posts never cross brackets (except trending)
 * 3. TRENDING posts (30+ engagement) get promoted ONE bracket up
 * 4. Within each bracket, posts are sorted by bonuses + shuffle
 * 5. On refresh, cards shuffle WITHIN brackets only - feed stays chronological
 * 
 * Time Brackets:
 * - Bracket 1: 0-1hr
 * - Bracket 2: 1-6hr
 * - Bracket 3: 6-24hr
 * - Bracket 4: 1-3 days
 * - Bracket 5: 3-7 days
 * - Bracket 6: 7-14 days
 * - Bracket 7: 14+ days
 * 
 * Within-Bracket Bonuses:
 * - Local: +15
 * - Expanded: +8
 * - Partner: +5
 * - Engagement: +5 to +20
 * - Shuffle: 0-5
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
  timeBracket: number;
  displayBracket: number;  // After trending promotion
  withinBracketScore: number;
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
  timeBracket: number;
  displayBracket: number;
  withinBracketScore: number;
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
/* CONSTANTS                                                        */
/* ================================================================ */

// Time brackets
const TIME_BRACKETS = {
  BRACKET_1: { max: 1 * 60 * 60 * 1000, label: "0-1hr" },           // 0-1 hour
  BRACKET_2: { max: 6 * 60 * 60 * 1000, label: "1-6hr" },           // 1-6 hours
  BRACKET_3: { max: 24 * 60 * 60 * 1000, label: "6-24hr" },         // 6-24 hours
  BRACKET_4: { max: 3 * 24 * 60 * 60 * 1000, label: "1-3d" },       // 1-3 days
  BRACKET_5: { max: 7 * 24 * 60 * 60 * 1000, label: "3-7d" },       // 3-7 days
  BRACKET_6: { max: 14 * 24 * 60 * 60 * 1000, label: "7-14d" },     // 7-14 days
  BRACKET_7: { max: Infinity, label: "14d+" },                       // 14+ days
};

// Within-bracket bonuses
const PROXIMITY_BONUS = {
  local: 15,
  expanded: 8,
  global: 0,
};

const PARTNER_BONUS = 5;

// Engagement bonus thresholds (darts + comments×2)
const ENGAGEMENT_THRESHOLDS = [
  { min: 30, bonus: 20 },
  { min: 16, bonus: 15 },
  { min: 6, bonus: 10 },
  { min: 1, bonus: 5 },
  { min: 0, bonus: 0 },
];

// Trending threshold for bracket promotion
const TRENDING_THRESHOLD = 30;

// Shuffle range (small - only affects within-bracket order)
const SHUFFLE_MAX = 5;

/* ================================================================ */
/* SCORING FUNCTIONS                                                */
/* ================================================================ */

/**
 * Get time bracket (1-7) based on post age
 */
function getTimeBracket(createdAt: Timestamp): number {
  const now = Date.now();
  const postTime = createdAt.toMillis();
  const ageMs = now - postTime;
  
  if (ageMs < TIME_BRACKETS.BRACKET_1.max) return 1;
  if (ageMs < TIME_BRACKETS.BRACKET_2.max) return 2;
  if (ageMs < TIME_BRACKETS.BRACKET_3.max) return 3;
  if (ageMs < TIME_BRACKETS.BRACKET_4.max) return 4;
  if (ageMs < TIME_BRACKETS.BRACKET_5.max) return 5;
  if (ageMs < TIME_BRACKETS.BRACKET_6.max) return 6;
  return 7;
}

/**
 * Get bracket label for debugging
 */
function getBracketLabel(bracket: number): string {
  const labels = ["", "0-1hr", "1-6hr", "6-24hr", "1-3d", "3-7d", "7-14d", "14d+"];
  return labels[bracket] || "unknown";
}

/**
 * Calculate engagement points (darts + comments×2)
 */
function getEngagementPoints(likes: number = 0, comments: number = 0): number {
  return likes + (comments * 2);
}

/**
 * Check if post is trending (30+ engagement)
 */
function isTrending(likes: number = 0, comments: number = 0): boolean {
  return getEngagementPoints(likes, comments) >= TRENDING_THRESHOLD;
}

/**
 * Get engagement bonus for within-bracket scoring
 */
function getEngagementBonus(likes: number = 0, comments: number = 0): number {
  const points = getEngagementPoints(likes, comments);
  
  for (const threshold of ENGAGEMENT_THRESHOLDS) {
    if (points >= threshold.min) {
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
 * Calculate within-bracket score (determines order within same bracket)
 */
function calculateWithinBracketScore(
  proximityTier: ProximityTier,
  isPartner: boolean,
  likes: number = 0,
  comments: number = 0
): number {
  const proximityBonus = PROXIMITY_BONUS[proximityTier];
  const partnerBonus = isPartner ? PARTNER_BONUS : 0;
  const engagementBonus = getEngagementBonus(likes, comments);
  const shuffleFactor = getShuffleFactor();
  
  return proximityBonus + partnerBonus + engagementBonus + shuffleFactor;
}

/**
 * Get human-readable relevance reason
 */
function getRelevanceReason(
  proximityTier: ProximityTier,
  isPartner: boolean,
  likes: number = 0,
  comments: number = 0,
  wasPromoted: boolean = false
): string {
  const parts: string[] = [];
  
  if (wasPromoted) parts.push("🔥 Trending");
  if (isPartner) parts.push("Partner");
  
  if (proximityTier === "local") parts.push("Local");
  else if (proximityTier === "expanded") parts.push("Nearby");
  
  const engagementPoints = getEngagementPoints(likes, comments);
  if (!wasPromoted && engagementPoints >= 16) parts.push("Popular");
  else if (!wasPromoted && engagementPoints >= 6) parts.push("Engaging");
  
  return parts.length > 0 ? parts.join(" · ") : "";
}

/* ================================================================ */
/* MAIN FEED GENERATION                                             */
/* ================================================================ */

export async function generateAlgorithmicFeed(
  userId: string,
  regionKey: string,
  maxItems: number = 20
): Promise<FeedItem[]> {
  console.log("🚀 Feed v3 — Time Bracket System");
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

  // Step 3: Process and deduplicate all items
  const allItems: FeedItem[] = [];
  const seenIds = new Set<string>();

  // Process local posts
  for (const post of localPosts) {
    if (seenIds.has(post.id)) continue;
    seenIds.add(post.id);
    
    const isPartner = context.partnerIds.includes(post.userId);
    const trending = isTrending(post.likes, post.comments);
    const timeBracket = getTimeBracket(post.createdAt);
    const displayBracket = trending ? Math.max(1, timeBracket - 1) : timeBracket;
    const withinBracketScore = calculateWithinBracketScore("local", isPartner, post.likes, post.comments);
    
    allItems.push({
      ...post,
      timeBracket,
      displayBracket,
      withinBracketScore,
      relevanceReason: getRelevanceReason("local", isPartner, post.likes, post.comments, trending && timeBracket !== displayBracket),
    });
  }

  // Process expanded posts
  for (const post of expandedPosts) {
    if (seenIds.has(post.id)) continue;
    seenIds.add(post.id);
    
    const isPartner = context.partnerIds.includes(post.userId);
    const trending = isTrending(post.likes, post.comments);
    const timeBracket = getTimeBracket(post.createdAt);
    const displayBracket = trending ? Math.max(1, timeBracket - 1) : timeBracket;
    const withinBracketScore = calculateWithinBracketScore("expanded", isPartner, post.likes, post.comments);
    
    allItems.push({
      ...post,
      timeBracket,
      displayBracket,
      withinBracketScore,
      relevanceReason: getRelevanceReason("expanded", isPartner, post.likes, post.comments, trending && timeBracket !== displayBracket),
    });
  }

  // Process global posts
  for (const post of globalPosts) {
    if (seenIds.has(post.id)) continue;
    seenIds.add(post.id);
    
    const isPartner = context.partnerIds.includes(post.userId);
    const trending = isTrending(post.likes, post.comments);
    const timeBracket = getTimeBracket(post.createdAt);
    const displayBracket = trending ? Math.max(1, timeBracket - 1) : timeBracket;
    const withinBracketScore = calculateWithinBracketScore("global", isPartner, post.likes, post.comments);
    
    allItems.push({
      ...post,
      timeBracket,
      displayBracket,
      withinBracketScore,
      relevanceReason: getRelevanceReason("global", isPartner, post.likes, post.comments, trending && timeBracket !== displayBracket),
    });
  }

  // Process course scores
  for (const score of coursePosts) {
    if (seenIds.has(score.id)) continue;
    seenIds.add(score.id);
    
    const isPartner = context.partnerIds.includes(score.userId);
    const trending = isTrending(score.likes, score.comments);
    const timeBracket = getTimeBracket(score.createdAt);
    const displayBracket = trending ? Math.max(1, timeBracket - 1) : timeBracket;
    const withinBracketScore = calculateWithinBracketScore("local", isPartner, score.likes, score.comments);
    
    allItems.push({
      ...score,
      timeBracket,
      displayBracket,
      withinBracketScore,
      relevanceReason: score.isLowman ? "🏆 Lowman at your course" : "Score at your course",
    });
  }

  // Step 4: Sort by display bracket (primary), then within-bracket score (secondary)
  const sorted = allItems.sort((a, b) => {
    // Primary: lower display bracket = higher priority
    if (a.displayBracket !== b.displayBracket) {
      return a.displayBracket - b.displayBracket;
    }
    
    // Secondary: higher within-bracket score = higher priority
    if (a.withinBracketScore !== b.withinBracketScore) {
      return b.withinBracketScore - a.withinBracketScore;
    }
    
    // Tiebreaker: more recent first
    return b.createdAt.toMillis() - a.createdAt.toMillis();
  });

  // Step 5: Return top items
  const finalFeed = sorted.slice(0, maxItems);

  // Log bracket distribution
  const bracketCounts: Record<number, number> = {};
  finalFeed.forEach(item => {
    bracketCounts[item.displayBracket] = (bracketCounts[item.displayBracket] || 0) + 1;
  });
  
  console.log("✅ Feed generated:", {
    total: finalFeed.length,
    brackets: Object.entries(bracketCounts).map(([b, c]) => `${getBracketLabel(Number(b))}: ${c}`).join(", "),
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
      // Algorithm fields - set in main function
      timeBracket: 0,
      displayBracket: 0,
      withinBracketScore: 0,
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
      
      // Algorithm fields - set in main function
      timeBracket: 0,
      displayBracket: 0,
      withinBracketScore: 0,
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
 * Shuffle within brackets only - maintains chronological bracket order
 * Use this for warm start / pull-to-refresh
 */
export function shuffleWithinBrackets<T extends { displayBracket: number }>(items: T[]): T[] {
  // Group items by bracket
  const buckets = new Map<number, T[]>();
  
  for (const item of items) {
    const bracket = item.displayBracket;
    if (!buckets.has(bracket)) {
      buckets.set(bracket, []);
    }
    buckets.get(bracket)!.push(item);
  }
  
  // Sort bracket keys and shuffle within each
  const sortedBrackets = Array.from(buckets.keys()).sort((a, b) => a - b);
  const result: T[] = [];
  
  for (const bracket of sortedBrackets) {
    const bucketItems = buckets.get(bracket)!;
    const shuffled = shuffleArray(bucketItems);
    result.push(...shuffled);
  }
  
  return result;
}

/**
 * Apply warm start shuffle (preserve top 3, shuffle rest within brackets)
 */
export function warmStartShuffle<T extends { displayBracket: number }>(items: T[]): T[] {
  if (items.length <= 3) return items;
  
  const top3 = items.slice(0, 3);
  const rest = items.slice(3);
  const shuffledRest = shuffleWithinBrackets(rest);
  
  return [...top3, ...shuffledRest];
}

/**
 * Apply cold start shuffle (full shuffle within brackets)
 */
export function coldStartShuffle<T extends { displayBracket: number }>(items: T[]): T[] {
  return shuffleWithinBrackets(items);
}