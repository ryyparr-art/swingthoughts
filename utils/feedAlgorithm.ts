/**
 * ULTRA-FAST Regional Feed Algorithm with Smart Expansion
 * 
 * Key Optimizations:
 * 1. Uses regionKey for instant regional queries (no city/state string matching)
 * 2. Leverages denormalized user data in posts (skip profile fetches)
 * 3. Smart regional expansion when content is sparse (regionKey → geohash)
 * 4. Shows important personal achievements (Lowman, Hole-in-One, etc)
 * 5. Parallel execution with reduced query count
 * 6. Supports AsyncStorage caching (handled in clubhouse component)
 * 
 * Priority Structure:
 * 1. Partners (100 pts) - Direct partner activity
 * 2. Regional (90 pts) - Same regionKey with smart expansion
 * 3. Your Important Achievements (85 pts) - Lowman, Hole-in-One, Scratch, Ace
 * 4. Your Courses (80 pts) - Activity at your courses
 * 5. Global Fallback (30-50 pts) - Jr → PGA → Course → Golfer priority
 * 
 * Performance Targets:
 * - Initial load (20 items): <500ms
 * - With cache: <50ms
 * - With expansion: <800ms
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
  
  // User data (denormalized from Firestore - matching create screen fields)
  displayName: string;       // Matches Firestore field (not userName)
  avatar?: string;           // Matches Firestore field (not userAvatar)
  handicap?: string;         // Matches Firestore field
  userType?: string;         // Matches Firestore field
  verified?: boolean;        // Matches Firestore field
  
  // Content
  content: string;           // Main content field (Firestore uses 'content')
  caption?: string;          // Alternative (for backwards compat)
  postType?: string;
  
  // Media
  imageUrl?: string | null;       // Single image (legacy)
  imageUrls?: string[];           // Multiple images array
  imageCount?: number;
  videoUrl?: string | null;
  videoThumbnailUrl?: string | null;
  videoDuration?: number | null;
  videoTrimStart?: number | null;
  videoTrimEnd?: number | null;
  hasMedia?: boolean;
  mediaType?: string | null;      // "images" | "video" | null
  
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
  displayName: string;      // Matches Firestore (not userName)
  avatar?: string;          // Matches Firestore (not userAvatar)
  userType?: string;
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
  regionKey: string;      // Regional key for fast queries
  geohash?: string;       // Geohash for geographic expansion
  userType: string;       // Jr, Golfer, PGA Professional, Course
  partnerIds: string[];
  playerCourses: number[];
  memberCourses: number[];
}

// Global caches
const userProfileCache = new Map<string, any>();
const lowmanCache = new Map<number, any>();

// User type priority
const USER_TYPE_PRIORITY = {
  "Junior": 4,
  "PGA Professional": 3,
  "Course": 2,
  "Golfer": 1,
};

/* ================================================================ */
/* MAIN FEED GENERATION - OPTIMIZED                                */
/* ================================================================ */

export async function generateAlgorithmicFeed(
  userId: string,
  regionKey: string,
  maxItems: number = 20  // Reduced default for faster initial load
): Promise<FeedItem[]> {
  console.log("🚀 Fast regional feed for:", regionKey);

  // Step 1: Build lightweight context
  const context = await buildLightweightContext(userId, regionKey);

  // Step 2: Parallel fetch - Partners + Regional + Personal Achievements
  const [partnerItems, regionalItems, personalItems, courseItems] = await Promise.all([
    getPartnerActivityFast(context),
    getRegionalActivityWithExpansion(context),  // ✅ Now with smart expansion
    getPersonalAchievements(context),           // ✅ NEW - Lowman, HIOs, etc
    getUserCoursesActivity(context),
  ]);

  const allItems: FeedItem[] = [
    ...partnerItems,
    ...regionalItems,
    ...personalItems,
    ...courseItems,
  ];

  // Fill with global if still not enough
  if (allItems.length < maxItems) {
    const globalItems = await getGlobalActivityWithPriority(context, allItems.length, maxItems);
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
    personal: personalItems.length,
    userType: context.userType,
  });

  return finalFeed;
}

/* ================================================================ */
/* LIGHTWEIGHT CONTEXT BUILDER                                      */
/* ================================================================ */

async function buildLightweightContext(
  userId: string,
  regionKey: string
): Promise<UserContext> {
  const userDoc = await getDoc(doc(db, "users", userId));
  if (!userDoc.exists()) {
    throw new Error("User not found");
  }

  const userData = userDoc.data();

  // Only fetch partner IDs - skip partner's partners for speed
  const partnerIds = await getPartnerIds(userId);

  const context: UserContext = {
    userId,
    regionKey,
    geohash: userData.geohash,
    userType: userData.userType || "Golfer",
    partnerIds: partnerIds.slice(0, 10), // Limit immediately
    playerCourses: userData.playerCourses || [],
    memberCourses: userData.declaredMemberCourses || [],
  };

  console.log("👤 User context:", {
    userType: context.userType,
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
/* USER TYPE PRIORITY HELPER                                        */
/* ================================================================ */

function getUserTypePriorityBoost(
  targetUserType: string,
  viewerUserType: string
): number {
  // Only boost if viewer is Jr
  if (viewerUserType !== "Junior") return 0;
  
  // Jr users get +10 boost, PGA +7, Course +4, Golfer +0
  if (targetUserType === "Junior") return 10;
  if (targetUserType === "PGA Professional") return 7;
  if (targetUserType === "Course") return 4;
  return 0;
}

/* ================================================================ */
/* HELPER: GET USER PROFILE                                         */
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

/* ================================================================ */
/* PRIORITY 1: PARTNER ACTIVITY (100 pts) - FAST                   */
/* ================================================================ */

async function getPartnerActivityFast(context: UserContext): Promise<FeedItem[]> {
  if (context.partnerIds.length === 0) return [];

  const items: FeedItem[] = [];

  // ONE query - recent posts from partners (denormalized data)
  const postsSnap = await getDocs(
    query(
      collection(db, "thoughts"),
      where("userId", "in", context.partnerIds),
      orderBy("createdAt", "desc"),
      limit(15)
    )
  );

  // Collect user IDs that need profile fetching (missing denormalized data)
  const userIdsNeedingProfiles = new Set<string>();
  const postData: Array<{ doc: any; data: any }> = [];

  postsSnap.forEach((doc) => {
    const data = doc.data();
    postData.push({ doc, data });
    
    // Only fetch profile if denormalized data is missing
    if (!data.displayName) {
      userIdsNeedingProfiles.add(data.userId);
    }
  });

  // Batch fetch missing profiles
  const profiles = userIdsNeedingProfiles.size > 0
    ? await batchGetUserProfiles(Array.from(userIdsNeedingProfiles))
    : new Map();

  // Build feed items with either denormalized or fetched data
  postData.forEach(({ doc, data }) => {
    const profile = profiles.get(data.userId);
    
    items.push({
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
      
      // Algorithm
      relevanceScore: 100,
      relevanceReason: "Partner activity",
    });
  });

  return items;
}

/* ================================================================ */
/* PRIORITY 2: REGIONAL ACTIVITY WITH SMART EXPANSION (90 pts)     */
/* ================================================================ */

async function getRegionalActivityWithExpansion(context: UserContext): Promise<FeedItem[]> {
  if (!context.regionKey) return [];

  const items: FeedItem[] = [];

  // Step 1: Try regionKey first (FAST)
  console.log("🎯 Fetching regional activity for:", context.regionKey);
  const regionalPosts = await getDocs(
    query(
      collection(db, "thoughts"),
      where("regionKey", "==", context.regionKey),
      orderBy("createdAt", "desc"),
      limit(20)
    )
  );

  // Collect user IDs that need profile fetching
  const userIdsNeedingProfiles = new Set<string>();
  const postData: Array<{ doc: any; data: any }> = [];

  regionalPosts.forEach((doc) => {
    const data = doc.data();
    // ✅ Users now see their own achievement posts in feed

    postData.push({ doc, data });
    
    // Only fetch profile if denormalized data is missing
    if (!data.displayName) {
      userIdsNeedingProfiles.add(data.userId);
    }
  });

  // Batch fetch missing profiles
  const profiles = userIdsNeedingProfiles.size > 0
    ? await batchGetUserProfiles(Array.from(userIdsNeedingProfiles))
    : new Map();

  // Build feed items
  postData.forEach(({ doc, data }) => {
    const profile = profiles.get(data.userId);
    const priorityBoost = getUserTypePriorityBoost(
      data.userType || profile?.userType || "Golfer",
      context.userType
    );

    items.push({
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
      
      // Algorithm
      relevanceScore: 90 + priorityBoost,
      relevanceReason: "Regional activity",
    });
  });

  // Step 2: If sparse (<10 items), expand using geohash prefix
  if (items.length < 10 && context.geohash) {
    console.log("📍 Expanding regionally with geohash prefix");
    
    // Use 3-char geohash prefix for ~150 mile radius
    const geohashPrefix = context.geohash.substring(0, 3);
    const geohashEnd = geohashPrefix + "~"; // Range query end
    
    const expandedPosts = await getDocs(
      query(
        collection(db, "thoughts"),
        where("geohash", ">=", geohashPrefix),
        where("geohash", "<=", geohashEnd),
        orderBy("geohash"),
        orderBy("createdAt", "desc"),
        limit(15)
      )
    );

    // Collect user IDs for expanded posts
    const expandedUserIds = new Set<string>();
    const expandedPostData: Array<{ doc: any; data: any }> = [];

    expandedPosts.forEach((doc) => {
      const data = doc.data();
      // ✅ Users now see their own posts in expanded results
      if (items.some(item => item.id === doc.id)) return; // Skip duplicates

      expandedPostData.push({ doc, data });
      
      if (!data.displayName) {
        expandedUserIds.add(data.userId);
      }
    });

    // Batch fetch profiles for expanded posts
    const expandedProfiles = expandedUserIds.size > 0
      ? await batchGetUserProfiles(Array.from(expandedUserIds))
      : new Map();

    expandedPostData.forEach(({ doc, data }) => {
      const profile = expandedProfiles.get(data.userId);
      const priorityBoost = getUserTypePriorityBoost(
        data.userType || profile?.userType || "Golfer",
        context.userType
      );

      items.push({
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
        
        // Algorithm
        relevanceScore: 85 + priorityBoost,
        relevanceReason: "Nearby region",
      });
    });
  }

  console.log("✅ Regional items found:", items.length);
  return items;
}

/* ================================================================ */
/* PRIORITY 3: PERSONAL ACHIEVEMENTS (85 pts)                       */
/* Only show important milestones: Lowman, Scratch, Ace, Hole-in-One */
/* ================================================================ */

async function getPersonalAchievements(context: UserContext): Promise<FeedItem[]> {
  const items: FeedItem[] = [];

  // Get recent posts from user with achievement types
  const postsSnap = await getDocs(
    query(
      collection(db, "thoughts"),
      where("userId", "==", context.userId),
      where("postType", "in", ["score", "holeinone"]), // Only achievement posts
      orderBy("createdAt", "desc"),
      limit(5)
    )
  );

  const userProfile = await getUserProfile(context.userId);

  postsSnap.forEach((doc) => {
    const data = doc.data();
    
    // Check if this is an important achievement post
    const isLowman = data.isLowman === true;
    const isHoleInOne = data.postType === "holeinone";
    const isScratch = data.netScore === data.par; // Shot par
    const isAce = data.grossScore && data.par && (data.grossScore <= data.par - 2); // 2+ under par
    
    // Only include if it's a significant achievement
    if (isLowman || isHoleInOne || isScratch || isAce) {
      let relevanceReason = "Your score";
      if (isHoleInOne) relevanceReason = "🎯 Your hole-in-one!";
      else if (isLowman) relevanceReason = "🏆 You're the Low Leader!";
      else if (isAce) relevanceReason = "🦅 You shot ace!";
      else if (isScratch) relevanceReason = "⚡ You shot scratch!";
      
      items.push({
        type: "post",
        id: doc.id,
        userId: data.userId,
        
        // User data
        displayName: data.displayName || userProfile.displayName,
        avatar: data.avatar || userProfile.avatar,
        handicap: data.handicap || userProfile.handicap,
        userType: data.userType || userProfile.userType,
        verified: data.verified || userProfile.verified || false,
        
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
        
        // Algorithm
        relevanceScore: isHoleInOne ? 90 : isLowman ? 88 : 85,
        relevanceReason,
      });
    }
  });

  console.log("🏆 Personal achievements found:", items.length);
  return items;
}

/* ================================================================ */
/* PRIORITY 4: YOUR COURSES ACTIVITY (80 pts)                      */
/* ================================================================ */

async function getUserCoursesActivity(context: UserContext): Promise<FeedItem[]> {
  const allCourses = [
    ...context.playerCourses,
    ...context.memberCourses,
  ];

  if (allCourses.length === 0) return [];

  const uniqueCourses = Array.from(new Set(allCourses)).slice(0, 10);
  const items: FeedItem[] = [];

  const scoresSnap = await getDocs(
    query(
      collection(db, "scores"),
      where("courseId", "in", uniqueCourses),
      orderBy("createdAt", "desc"),
      limit(15)
    )
  );

  // Collect unique user IDs that need profile fetching
  const userIdsNeedingProfiles = new Set<string>();
  const courseIds = new Set<number>();

  scoresSnap.forEach((doc) => {
    const data = doc.data();
    // ✅ Users now see their own scores at their courses
    
    // Only fetch profile if not denormalized
    if (!data.displayName) {
      userIdsNeedingProfiles.add(data.userId);
    }
    courseIds.add(data.courseId);
  });

  // Batch fetch only missing profiles
  const [profiles, lowmanData] = await Promise.all([
    userIdsNeedingProfiles.size > 0 
      ? batchGetUserProfiles(Array.from(userIdsNeedingProfiles))
      : new Map(),
    batchCheckLowman(Array.from(courseIds)),
  ]);

  scoresSnap.forEach((doc) => {
    const data = doc.data();

    // ✅ CRITICAL: Skip scores that already have thought posts
    // Regular users create thought posts when posting scores
    // Only create synthetic posts for scores WITHOUT thought posts (e.g., course users)
    if (data.thoughtId) {
      console.log(`⏭️  Skipping score ${doc.id} - already has thought post ${data.thoughtId}`);
      return;
    }

    // Use denormalized data if available, otherwise fetch
    const profile = profiles.get(data.userId);
    const displayName = data.displayName || profile?.displayName || "Unknown";
    const avatar = data.avatar || profile?.avatar;
    const userType = data.userType || profile?.userType || "Golfer";

    const lowman = lowmanData.get(data.courseId);
    const isLowman = !lowman || data.netScore < lowman.netScore;
    const priorityBoost = getUserTypePriorityBoost(userType, context.userType);

    items.push({
      type: "score",
      id: doc.id,
      userId: data.userId,
      displayName,
      avatar,
      userType,
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
/* PRIORITY 5: GLOBAL FALLBACK WITH JR PRIORITY (30-50 pts)        */
/* ================================================================ */

async function getGlobalActivityWithPriority(
  context: UserContext,
  currentItemCount: number,
  maxItems: number
): Promise<FeedItem[]> {
  if (currentItemCount >= maxItems * 0.75) return []; // Only fill if really needed

  const items: FeedItem[] = [];
  const needed = Math.min(10, maxItems - currentItemCount);

  const postsSnap = await getDocs(
    query(
      collection(db, "thoughts"),
      orderBy("createdAt", "desc"),
      limit(needed)
    )
  );

  // Collect user IDs that need profile fetching
  const userIdsNeedingProfiles = new Set<string>();
  const postData: Array<{ doc: any; data: any }> = [];

  postsSnap.forEach((doc) => {
    const data = doc.data();
    // ✅ Users can see their posts in global fallback

    postData.push({ doc, data });
    
    if (!data.displayName) {
      userIdsNeedingProfiles.add(data.userId);
    }
  });

  // Batch fetch missing profiles
  const profiles = userIdsNeedingProfiles.size > 0
    ? await batchGetUserProfiles(Array.from(userIdsNeedingProfiles))
    : new Map();

  // Build feed items
  postData.forEach(({ doc, data }) => {
    const profile = profiles.get(data.userId);
    const priorityBoost = getUserTypePriorityBoost(
      data.userType || profile?.userType || "Golfer",
      context.userType
    );

    items.push({
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
      
      // Algorithm
      relevanceScore: 35 + priorityBoost,
      relevanceReason: "Global activity",
    });
  });

  return items;
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
/* HELPER FUNCTIONS                                                 */
/* ================================================================ */

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