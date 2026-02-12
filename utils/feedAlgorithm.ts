/**
 * Feed Algorithm v4 — Strict Time Bracket System
 * 
 * Core Principle: RECENCY IS KING. Period.
 * 
 * How it works:
 * 1. Posts are assigned to TIME BRACKETS based on age
 * 2. Brackets are STRICT - posts NEVER cross brackets (no exceptions)
 * 3. Within each bracket: chronological order (newest first)
 * 4. Partner/Local posts get a small boost WITHIN their bracket only
 * 5. Self-posts are pushed to bottom of their bracket
 * 
 * Time Brackets:
 * - Bracket 1: 0-6hr (fresh content)
 * - Bracket 2: 6-24hr (today)
 * - Bracket 3: 1-3 days (recent)
 * - Bracket 4: 3-7 days (this week)
 * - Bracket 5: 7-14 days (last week)
 * - Bracket 6: 14+ days (archive)
 * 
 * NO SHUFFLE during generation. Shuffle happens in clubhouse WITHIN brackets.
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
  mediaAspectRatio?: number | null;
  
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
  taggedTournaments?: { tournamentId: string; name: string }[];
  taggedLeagues?: { leagueId: string; name: string }[];
  
  // Poll
  isPoll?: boolean;
  poll?: {
    question: string;
    options: Array<{ text: string; votes: number; voterIds?: string[] }>;
    totalVotes: number;
  };
  
  // Metadata
  createdAt: Timestamp;
  thoughtId?: string;
  lastActivityAt?: Timestamp;
  
  // Algorithm fields
  timeBracket: number;
  displayBracket: number;
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

// Simplified time brackets (6 brackets instead of 7)
const TIME_BRACKETS = {
  BRACKET_1: { max: 6 * 60 * 60 * 1000, label: "0-6hr" },            // 0-6 hours (fresh)
  BRACKET_2: { max: 24 * 60 * 60 * 1000, label: "6-24hr" },          // 6-24 hours (today)
  BRACKET_3: { max: 3 * 24 * 60 * 60 * 1000, label: "1-3d" },        // 1-3 days
  BRACKET_4: { max: 7 * 24 * 60 * 60 * 1000, label: "3-7d" },        // 3-7 days
  BRACKET_5: { max: 14 * 24 * 60 * 60 * 1000, label: "7-14d" },      // 7-14 days
  BRACKET_6: { max: Infinity, label: "14d+" },                        // 14+ days
};

// Within-bracket priority bonuses (used for sorting within same bracket)
const PRIORITY_BONUS = {
  partner: 100,        // Partner posts at top of bracket
  local: 50,           // Local posts next
  expanded: 25,        // Nearby posts
  global: 0,           // Everyone else
};

// Self-post penalty (pushes your posts to bottom of bracket)
const SELF_POST_PENALTY = -200;

/* ================================================================ */
/* SCORING FUNCTIONS                                                */
/* ================================================================ */

/**
 * Get time bracket (1-6) based on post age
 */
function getTimeBracket(createdAt: Timestamp): number {
  const now = Date.now();
  const postTime = createdAt.toMillis();
  const ageMs = now - postTime;
  
  if (ageMs < TIME_BRACKETS.BRACKET_1.max) return 1;  // 0-6hr
  if (ageMs < TIME_BRACKETS.BRACKET_2.max) return 2;  // 6-24hr
  if (ageMs < TIME_BRACKETS.BRACKET_3.max) return 3;  // 1-3d
  if (ageMs < TIME_BRACKETS.BRACKET_4.max) return 4;  // 3-7d
  if (ageMs < TIME_BRACKETS.BRACKET_5.max) return 5;  // 7-14d
  return 6;  // 14d+
}

/**
 * Get bracket label for debugging
 */
function getBracketLabel(bracket: number): string {
  const labels = ["", "0-6hr", "6-24hr", "1-3d", "3-7d", "7-14d", "14d+"];
  return labels[bracket] || "unknown";
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
 * Calculate within-bracket score
 * Higher = shown earlier within the same bracket
 * Primary: partner/local bonus
 * Secondary: recency (newer = higher timestamp = higher score)
 */
function calculateWithinBracketScore(
  proximityTier: ProximityTier,
  isPartner: boolean,
  isSelfPost: boolean,
  createdAtMs: number
): number {
  let score = 0;
  
  // Partner bonus (biggest boost)
  if (isPartner) {
    score += PRIORITY_BONUS.partner;
  }
  
  // Proximity bonus
  score += PRIORITY_BONUS[proximityTier];
  
  // Self-post penalty (pushes to bottom of bracket)
  if (isSelfPost) {
    score += SELF_POST_PENALTY;
  }
  
  // Add timestamp as tiebreaker (newer = higher)
  // Divide by 1000000 to keep it as a secondary factor
  score += createdAtMs / 1000000;
  
  return score;
}

/**
 * Get human-readable relevance reason
 */
function getRelevanceReason(
  proximityTier: ProximityTier,
  isPartner: boolean,
  isSelfPost: boolean
): string {
  if (isSelfPost) return "Your post";
  
  const parts: string[] = [];
  
  if (isPartner) parts.push("Partner");
  if (proximityTier === "local") parts.push("Local");
  else if (proximityTier === "expanded") parts.push("Nearby");
  
  return parts.length > 0 ? parts.join(" · ") : "";
}

/* ================================================================ */
/* MAIN FEED GENERATION                                             */
/* ================================================================ */

export async function generateAlgorithmicFeed(
  userId: string,
  regionKey: string,
  maxItems: number = 30
): Promise<FeedItem[]> {
  console.log("🚀 Feed v4 — Strict Time Bracket System");
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

  // Helper to process a post
  const processPost = (post: FeedPost, proximityTier: ProximityTier) => {
    if (seenIds.has(post.id)) return;
    seenIds.add(post.id);
    
    const isPartner = context.partnerIds.includes(post.userId);
    const isSelfPost = post.userId === context.userId;
    const timeBracket = getTimeBracket(post.createdAt);
    const displayBracket = timeBracket; // No promotion - strict brackets
    const withinBracketScore = calculateWithinBracketScore(
      proximityTier, 
      isPartner, 
      isSelfPost,
      post.createdAt.toMillis()
    );
    
    allItems.push({
      ...post,
      timeBracket,
      displayBracket,
      withinBracketScore,
      relevanceReason: getRelevanceReason(proximityTier, isPartner, isSelfPost),
    });
  };

  // Process all posts
  localPosts.forEach(post => processPost(post, "local"));
  expandedPosts.forEach(post => processPost(post, "expanded"));
  globalPosts.forEach(post => processPost(post, "global"));

  // Process course scores
  for (const score of coursePosts) {
    if (seenIds.has(score.id)) continue;
    seenIds.add(score.id);
    
    const isPartner = context.partnerIds.includes(score.userId);
    const isSelfPost = score.userId === context.userId;
    const timeBracket = getTimeBracket(score.createdAt);
    const displayBracket = timeBracket;
    const withinBracketScore = calculateWithinBracketScore(
      "local", 
      isPartner, 
      isSelfPost,
      score.createdAt.toMillis()
    );
    
    allItems.push({
      ...score,
      timeBracket,
      displayBracket,
      withinBracketScore,
      relevanceReason: isSelfPost ? "Your score" : (score.isLowman ? "🏆 Lowman" : ""),
    });
  }

  // Step 4: Sort by display bracket (primary), then within-bracket score (secondary)
  const sorted = allItems.sort((a, b) => {
    // Primary: lower display bracket = higher priority (newer brackets first)
    if (a.displayBracket !== b.displayBracket) {
      return a.displayBracket - b.displayBracket;
    }
    
    // Secondary: higher within-bracket score = higher priority
    return b.withinBracketScore - a.withinBracketScore;
  });

  // Step 5: Return top items
  const finalFeed = sorted.slice(0, maxItems);

  // Log bracket distribution
  const bracketCounts: Record<number, number> = {};
  finalFeed.forEach(item => {
    bracketCounts[item.displayBracket] = (bracketCounts[item.displayBracket] || 0) + 1;
  });
  
  console.log("✅ Feed v4 generated:", {
    total: finalFeed.length,
    brackets: Object.entries(bracketCounts)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([b, c]) => `${getBracketLabel(Number(b))}: ${c}`)
      .join(", "),
  });

  // Debug: Log first 10 items with their brackets
  console.log("📋 Top 10 feed items:");
  finalFeed.slice(0, 10).forEach((item, i) => {
    const ageHours = (Date.now() - item.createdAt.toMillis()) / (1000 * 60 * 60);
    console.log(`  ${i + 1}. [B${item.displayBracket}] ${item.relevanceReason || 'global'} - ${ageHours.toFixed(1)}h old - score: ${item.withinBracketScore.toFixed(0)}`);
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
    memberCourses: userData.memberCourses || [],
  };

  console.log("👤 User context:", {
    userId,
    regionKey,
    partners: partnerIds.length,
    courses: context.playerCourses.length + context.memberCourses.length,
  });

  return context;
}

async function getPartnerIds(userId: string): Promise<string[]> {
  const partnersSnap = await getDocs(
    query(
      collection(db, "partners"),
      where("users", "array-contains", userId),
      where("status", "==", "accepted")
    )
  );

  const partnerIds: string[] = [];
  partnersSnap.forEach((doc) => {
    const users = doc.data().users || [];
    users.forEach((id: string) => {
      if (id !== userId) partnerIds.push(id);
    });
  });

  return partnerIds;
}

/* ================================================================ */
/* FETCH FUNCTIONS                                                  */
/* ================================================================ */

async function fetchLocalPosts(context: UserContext): Promise<FeedPost[]> {
  if (!context.regionKey) return [];

  const postsSnap = await getDocs(
    query(
      collection(db, "thoughts"),
      where("regionKey", "==", context.regionKey),
      orderBy("createdAt", "desc"),
      limit(50)
    )
  );

  return processPosts(postsSnap, context);
}

async function fetchExpandedPosts(context: UserContext): Promise<FeedPost[]> {
  if (!context.geohash) return [];

  const geoPrefix = context.geohash.substring(0, 3);
  
  const postsSnap = await getDocs(
    query(
      collection(db, "thoughts"),
      where("geohash", ">=", geoPrefix),
      where("geohash", "<=", geoPrefix + "\uf8ff"),
      orderBy("geohash"),
      orderBy("createdAt", "desc"),
      limit(30)
    )
  );

  return processPosts(postsSnap, context);
}

async function fetchGlobalPosts(context: UserContext): Promise<FeedPost[]> {
  // Fetch partner posts (global reach for partners)
  const partnerPosts: FeedPost[] = [];
  
  if (context.partnerIds.length > 0) {
    // Firestore "in" queries limited to 30 items
    const partnerBatches = [];
    for (let i = 0; i < context.partnerIds.length; i += 30) {
      partnerBatches.push(context.partnerIds.slice(i, i + 30));
    }

    for (const batch of partnerBatches) {
      const postsSnap = await getDocs(
        query(
          collection(db, "thoughts"),
          where("userId", "in", batch),
          orderBy("createdAt", "desc"),
          limit(20)
        )
      );
      
      const posts = await processPosts(postsSnap, context);
      partnerPosts.push(...posts);
    }
  }

  // Fetch some recent global posts for discovery
  const globalSnap = await getDocs(
    query(
      collection(db, "thoughts"),
      orderBy("createdAt", "desc"),
      limit(20)
    )
  );
  
  const globalPosts = await processPosts(globalSnap, context);

  return [...partnerPosts, ...globalPosts];
}

async function fetchCoursePosts(context: UserContext): Promise<FeedScore[]> {
  const allCourses = [
    ...context.playerCourses,
    ...context.memberCourses,
  ];

  if (allCourses.length === 0) return [];

  // Limit to first 10 courses
  const coursesToFetch = allCourses.slice(0, 10);

  const scoresSnap = await getDocs(
    query(
      collection(db, "scores"),
      where("courseId", "in", coursesToFetch),
      orderBy("createdAt", "desc"),
      limit(20)
    )
  );

  // Collect unique user IDs and course IDs for batch fetching
  const userIdsNeedingProfiles = new Set<string>();
  const courseIds = new Set<number>();

  scoresSnap.forEach((docSnap) => {
    const data = docSnap.data();
    if (!data.displayName) {
      userIdsNeedingProfiles.add(data.userId);
    }
    courseIds.add(data.courseId);
  });

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
      mediaAspectRatio: data.mediaAspectRatio,
      
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
      taggedTournaments: data.taggedTournaments || [],
      taggedLeagues: data.taggedLeagues || [],
      
      // Poll
      isPoll: data.isPoll || false,
      poll: data.poll || null,
      
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
  
  // Sort bracket keys (1, 2, 3...) and shuffle within each
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