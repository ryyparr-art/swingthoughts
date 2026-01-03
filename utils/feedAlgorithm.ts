/**
 * Algorithmic Feed Utility for Clubhouse
 * 
 * Generates a personalized feed combining posts and scores based on:
 * 1. Direct partners' activity
 * 2. Courses user plays/is member of
 * 3. Partners' partners activity
 * 4. Local area content
 * 5. Courses user has played
 * 6. Regional → State → National → Global content
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

/* ================================================================ */
/* MAIN FEED GENERATION                                             */
/* ================================================================ */

export async function generateAlgorithmicFeed(
  userId: string,
  maxItems: number = 50
): Promise<FeedItem[]> {
  console.log("🎯 Generating algorithmic feed for user:", userId);

  // Step 1: Build user context
  const context = await buildUserContext(userId);

  // Step 2: Gather all potential feed items
  const allItems: FeedItem[] = [];

  // Layer 0: User's own posts (VERY HIGH PRIORITY)
  console.log("📊 Layer 0: Your posts");
  const ownItems = await getUserOwnActivity(context);
  allItems.push(...ownItems);

  // Layer 1: Direct partners' activity (HIGHEST PRIORITY)
  console.log("📊 Layer 1: Direct partners");
  const partnerItems = await getPartnerActivity(context);
  allItems.push(...partnerItems);

  // Layer 1.5: Nearby lowman announcements (VERY HIGH - regardless of relationship)
  console.log("📊 Layer 1.5: Nearby lowman");
  const nearbyLowmanItems = await getNearbyLowmanActivity(context);
  allItems.push(...nearbyLowmanItems);

  // Layer 2: User's courses activity
  console.log("📊 Layer 2: User's courses");
  const courseItems = await getUserCoursesActivity(context);
  allItems.push(...courseItems);

  // Layer 3: Partners' partners activity
  console.log("📊 Layer 3: Partners' partners");
  const partnersPartnerItems = await getPartnersPartnerActivity(context);
  allItems.push(...partnersPartnerItems);

  // Layer 4: Local area content
  console.log("📊 Layer 4: Local area");
  const localItems = await getLocalAreaActivity(context);
  allItems.push(...localItems);

  // Layer 5: Courses user has played
  console.log("📊 Layer 5: Played courses");
  const playedCoursesItems = await getPlayedCoursesActivity(context);
  allItems.push(...playedCoursesItems);

  // Layer 6: Regional content (expand outward)
  console.log("📊 Layer 6: Regional/State/National");
  const regionalItems = await getRegionalActivity(context);
  allItems.push(...regionalItems);

  // Layer 7: Global fill
  console.log("📊 Layer 7: Global");
  const globalItems = await getGlobalActivity(context, allItems.length);
  allItems.push(...globalItems);

  // Step 3: Remove duplicates (prefer higher relevance score)
  const deduped = deduplicateItems(allItems);

  // Step 4: Sort by relevance score (higher = better) and recency
  const sorted = deduped.sort((a, b) => {
    // First by relevance score
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    // Then by recency
    return b.createdAt.toMillis() - a.createdAt.toMillis();
  });

  // Step 5: Return top N items
  const finalFeed = sorted.slice(0, maxItems);

  console.log("✅ Feed generated:", {
    total: finalFeed.length,
    posts: finalFeed.filter((i) => i.type === "post").length,
    scores: finalFeed.filter((i) => i.type === "score").length,
  });

  return finalFeed;
}

/* ================================================================ */
/* USER CONTEXT BUILDER                                             */
/* ================================================================ */

async function buildUserContext(userId: string): Promise<UserContext> {
  const userDoc = await getDoc(doc(db, "users", userId));
  if (!userDoc.exists()) {
    throw new Error("User not found");
  }

  const userData = userDoc.data();

  // Get direct partners
  const partnerIds = await getPartnerIds(userId);

  // Get partners' partners (2nd degree)
  const partnersPartnerIds = await getPartnersPartnerIds(partnerIds, userId);

  // Get courses user has scored at (played)
  const playedCourses = await getPlayedCourses(userId);

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

  // Get partners of each partner
  for (const partnerId of partnerIds.slice(0, 20)) {
    // Limit to first 20 partners
    const partnerPartners = await getPartnerIds(partnerId);
    partnerPartners.forEach((id) => {
      if (id !== excludeUserId && !partnerIds.includes(id)) {
        partnersPartnerIds.add(id);
      }
    });
  }

  return Array.from(partnersPartnerIds);
}

async function getPlayedCourses(userId: string): Promise<number[]> {
  const scoresQuery = query(collection(db, "scores"), where("userId", "==", userId));
  const scoresSnap = await getDocs(scoresQuery);

  const courseIds = new Set<number>();
  scoresSnap.forEach((doc) => {
    const data = doc.data();
    if (data.courseId) courseIds.add(data.courseId);
  });

  return Array.from(courseIds);
}

/* ================================================================ */
/* LAYER 0: USER'S OWN ACTIVITY                                      */
/* ================================================================ */

async function getUserOwnActivity(context: UserContext): Promise<FeedItem[]> {
  const items: FeedItem[] = [];

  // Get user's own posts
  const postsQuery = query(
    collection(db, "thoughts"),
    where("userId", "==", context.userId),
    orderBy("createdAt", "desc"),
    limit(10) // Limit to most recent 10 own posts
  );
  const postsSnap = await getDocs(postsQuery);

  const userProfile = await getUserProfile(context.userId);

  for (const doc of postsSnap.docs) {
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
      relevanceScore: 60, // Below nearby activity
      relevanceReason: "Your post",
    });
  }

  // Get user's own scores (recent)
  const scoresQuery = query(
    collection(db, "scores"),
    where("userId", "==", context.userId),
    orderBy("createdAt", "desc"),
    limit(5) // Limit to most recent 5 own scores
  );
  const scoresSnap = await getDocs(scoresQuery);

  for (const doc of scoresSnap.docs) {
    const data = doc.data();

    const isLowman = await checkIfLowman(data.courseId, data.netScore);

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
      relevanceScore: isLowman ? 62 : 58, // Your lowman/scores together
      relevanceReason: isLowman ? "Your new lowman!" : "Your score",
    });
  }

  return items;
}

/* ================================================================ */
/* LAYER 1: DIRECT PARTNERS ACTIVITY                                */
/* ================================================================ */

async function getPartnerActivity(context: UserContext): Promise<FeedItem[]> {
  if (context.partnerIds.length === 0) return [];

  const items: FeedItem[] = [];

  // Batch partners in groups of 10 (Firestore 'in' limit)
  for (let i = 0; i < context.partnerIds.length; i += 10) {
    const batch = context.partnerIds.slice(i, i + 10);

    // Get posts from partners
    const postsQuery = query(
      collection(db, "thoughts"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const postsSnap = await getDocs(postsQuery);

    for (const doc of postsSnap.docs) {
      const data = doc.data();
      const userProfile = await getUserProfile(data.userId);

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
        relevanceScore: 100, // HIGHEST
        relevanceReason: "Partner posted",
      });
    }

    // Get scores from partners
    const scoresQuery = query(
      collection(db, "scores"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const scoresSnap = await getDocs(scoresQuery);

    for (const doc of scoresSnap.docs) {
      const data = doc.data();
      const userProfile = await getUserProfile(data.userId);
      
      // Check if partner's score is a lowman
      const isLowman = await checkIfLowman(data.courseId, data.netScore);

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
        relevanceScore: isLowman ? 98 : 95, // Partner lowman very high, regular scores high
        relevanceReason: isLowman ? "Partner's new lowman!" : "Partner posted score",
      });
    }
  }

  return items;
}

/* ================================================================ */
/* LAYER 1.5: NEARBY LOWMAN ACTIVITY (ANYONE)                      */
/* ================================================================ */

async function getNearbyLowmanActivity(context: UserContext): Promise<FeedItem[]> {
  if (!context.location?.city || !context.location?.state) return [];

  const items: FeedItem[] = [];

  // Get ALL users in same city/state (including partners, anyone)
  const localUsersQuery = query(
    collection(db, "users"),
    where("currentCity", "==", context.location.city),
    where("currentState", "==", context.location.state)
  );
  const localUsersSnap = await getDocs(localUsersQuery);

  const localUserIds: string[] = [];
  localUsersSnap.forEach((doc) => {
    // Include EVERYONE nearby (even partners - dedupe will handle it)
    if (doc.id !== context.userId) {
      localUserIds.push(doc.id);
    }
  });

  // Get scores from nearby users - ONLY lowman scores
  for (let i = 0; i < localUserIds.slice(0, 50).length; i += 10) {
    const batch = localUserIds.slice(i, i + 10);

    const scoresQuery = query(
      collection(db, "scores"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const scoresSnap = await getDocs(scoresQuery);

    for (const doc of scoresSnap.docs) {
      const data = doc.data();
      const userProfile = await getUserProfile(data.userId);
      
      // Check if it's a lowman - ONLY add if it's a lowman
      const isLowman = await checkIfLowman(data.courseId, data.netScore);

      if (isLowman) {
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
          isLowman: true,
          createdAt: data.createdAt,
          relevanceScore: 96, // VERY HIGH - nearby lowman announcements!
          relevanceReason: `🏆 Nearby lowman: ${context.location.city}, ${context.location.state}`,
        });
      }
    }
  }

  return items;
}

/* ================================================================ */
/* LAYER 2: USER'S COURSES ACTIVITY                                 */
/* ================================================================ */

async function getUserCoursesActivity(context: UserContext): Promise<FeedItem[]> {
  const allCourses = [
    ...context.playerCourses,
    ...context.memberCourses,
  ];

  if (allCourses.length === 0) return [];

  const uniqueCourses = Array.from(new Set(allCourses));
  const items: FeedItem[] = [];

  // Get posts tagged at these courses (exclude own posts - they're in Layer 0)
  const postsSnap = await getDocs(collection(db, "thoughts"));
  for (const doc of postsSnap.docs) {
    const data = doc.data();
    
    // Skip own posts
    if (data.userId === context.userId) continue;
    
    const taggedCourses = data.taggedCourses || [];

    const isRelevant = taggedCourses.some((tc: any) =>
      uniqueCourses.includes(tc.courseId)
    );

    if (isRelevant) {
      const userProfile = await getUserProfile(data.userId);

      items.push({
        type: "post",
        id: doc.id,
        userId: data.userId,
        userName: userProfile.displayName,
        userAvatar: userProfile.avatar,
        imageUrl: data.imageUrl,
        caption: data.caption || data.content || "",
        createdAt: data.createdAt,
        taggedCourses: data.taggedCourses,
        relevanceScore: 85,
        relevanceReason: "Posted at your course",
      });
    }
  }

  // Get scores at these courses (exclude own scores - they're in Layer 0)
  for (let i = 0; i < uniqueCourses.length; i += 10) {
    const batch = uniqueCourses.slice(i, i + 10);

    const scoresQuery = query(
      collection(db, "scores"),
      where("courseId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    const scoresSnap = await getDocs(scoresQuery);

    for (const doc of scoresSnap.docs) {
      const data = doc.data();
      
      // Skip own scores
      if (data.userId === context.userId) continue;

      const userProfile = await getUserProfile(data.userId);

      // Check if it's a new lowman - don't boost here, Layer 4 handles nearby lowman
      const isLowman = await checkIfLowman(data.courseId, data.netScore);

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
        relevanceScore: 85, // Same as posts - all course activity equal
        relevanceReason: isLowman ? "Lowman at your course" : "Score at your course",
      });
    }
  }

  return items;
}

/* ================================================================ */
/* LAYER 3: PARTNERS' PARTNERS ACTIVITY                             */
/* ================================================================ */

async function getPartnersPartnerActivity(context: UserContext): Promise<FeedItem[]> {
  if (context.partnersPartnerIds.length === 0) return [];

  const items: FeedItem[] = [];

  // Limit to first 30 partners' partners
  const limitedIds = context.partnersPartnerIds.slice(0, 30);

  for (let i = 0; i < limitedIds.length; i += 10) {
    const batch = limitedIds.slice(i, i + 10);

    // Posts
    const postsQuery = query(
      collection(db, "thoughts"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const postsSnap = await getDocs(postsQuery);

    for (const doc of postsSnap.docs) {
      const data = doc.data();
      const userProfile = await getUserProfile(data.userId);

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
        relevanceScore: 75,
        relevanceReason: "Partner's partner posted",
      });
    }

    // Scores
    const scoresQuery = query(
      collection(db, "scores"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const scoresSnap = await getDocs(scoresQuery);

    for (const doc of scoresSnap.docs) {
      const data = doc.data();
      const userProfile = await getUserProfile(data.userId);

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
        createdAt: data.createdAt,
        relevanceScore: 70,
        relevanceReason: "Partner's partner scored",
      });
    }
  }

  return items;
}

/* ================================================================ */
/* LAYER 4: LOCAL AREA ACTIVITY                                     */
/* ================================================================ */

async function getLocalAreaActivity(context: UserContext): Promise<FeedItem[]> {
  if (!context.location?.city || !context.location?.state) return [];

  const items: FeedItem[] = [];

  // Get users in same city/state
  const localUsersQuery = query(
    collection(db, "users"),
    where("currentCity", "==", context.location.city),
    where("currentState", "==", context.location.state)
  );
  const localUsersSnap = await getDocs(localUsersQuery);

  const localUserIds: string[] = [];
  localUsersSnap.forEach((doc) => {
    if (
      doc.id !== context.userId &&
      !context.partnerIds.includes(doc.id) &&
      !context.partnersPartnerIds.includes(doc.id)
    ) {
      localUserIds.push(doc.id);
    }
  });

  // Get recent posts/scores from local users
  for (let i = 0; i < localUserIds.slice(0, 30).length; i += 10) {
    const batch = localUserIds.slice(i, i + 10);

    // Posts
    const postsQuery = query(
      collection(db, "thoughts"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const postsSnap = await getDocs(postsQuery);

    for (const doc of postsSnap.docs) {
      const data = doc.data();
      const userProfile = await getUserProfile(data.userId);

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
        relevanceScore: 75,
        relevanceReason: `Nearby: ${context.location.city}, ${context.location.state}`,
      });
    }

    // Scores (lowman already handled in Layer 1.5)
    const scoresQuery = query(
      collection(db, "scores"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    const scoresSnap = await getDocs(scoresQuery);

    for (const doc of scoresSnap.docs) {
      const data = doc.data();
      const userProfile = await getUserProfile(data.userId);
      
      // Check if it's a lowman
      const isLowman = await checkIfLowman(data.courseId, data.netScore);

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
        relevanceScore: 75, // Same as posts - nearby activity equal
        relevanceReason: isLowman 
          ? `Nearby score: ${context.location.city}, ${context.location.state}` 
          : `Nearby score: ${context.location.city}, ${context.location.state}`,
      });
    }
  }

  return items;
}

/* ================================================================ */
/* LAYER 5: PLAYED COURSES ACTIVITY                                 */
/* ================================================================ */

async function getPlayedCoursesActivity(context: UserContext): Promise<FeedItem[]> {
  // Get courses user has played but isn't a player/member of
  const playedOnly = context.playedCourses.filter(
    (courseId) =>
      !context.playerCourses.includes(courseId) &&
      !context.memberCourses.includes(courseId)
  );

  if (playedOnly.length === 0) return [];

  const items: FeedItem[] = [];

  // Get lowman scores at these courses
  for (let i = 0; i < playedOnly.length; i += 10) {
    const batch = playedOnly.slice(i, i + 10);

    const scoresQuery = query(
      collection(db, "scores"),
      where("courseId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const scoresSnap = await getDocs(scoresQuery);

    for (const doc of scoresSnap.docs) {
      const data = doc.data();
      if (data.userId === context.userId) continue;

      const isLowman = await checkIfLowman(data.courseId, data.netScore);

      if (isLowman) {
        // Only show lowman scores from played courses
        const userProfile = await getUserProfile(data.userId);

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
          isLowman: true,
          createdAt: data.createdAt,
          relevanceScore: 55,
          relevanceReason: "New lowman at course you've played",
        });
      }
    }
  }

  return items;
}

/* ================================================================ */
/* LAYER 6: REGIONAL ACTIVITY                                       */
/* ================================================================ */

async function getRegionalActivity(context: UserContext): Promise<FeedItem[]> {
  if (!context.location?.state) return [];

  const items: FeedItem[] = [];

  // Get users in same state (but different city)
  const stateUsersQuery = query(
    collection(db, "users"),
    where("currentState", "==", context.location.state)
  );
  const stateUsersSnap = await getDocs(stateUsersQuery);

  const stateUserIds: string[] = [];
  stateUsersSnap.forEach((doc) => {
    const data = doc.data();
    if (
      doc.id !== context.userId &&
      data.currentCity !== context.location?.city &&
      !context.partnerIds.includes(doc.id)
    ) {
      stateUserIds.push(doc.id);
    }
  });

  // Get recent activity from state users
  for (let i = 0; i < stateUserIds.slice(0, 20).length; i += 10) {
    const batch = stateUserIds.slice(i, i + 10);

    // Posts
    const postsQuery = query(
      collection(db, "thoughts"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const postsSnap = await getDocs(postsQuery);

    for (const doc of postsSnap.docs) {
      const data = doc.data();
      const userProfile = await getUserProfile(data.userId);

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
        relevanceScore: 50,
        relevanceReason: `State: ${context.location.state}`,
      });
    }

    // Scores
    const scoresQuery = query(
      collection(db, "scores"),
      where("userId", "in", batch),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const scoresSnap = await getDocs(scoresQuery);

    for (const doc of scoresSnap.docs) {
      const data = doc.data();
      const userProfile = await getUserProfile(data.userId);

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
        createdAt: data.createdAt,
        relevanceScore: 45,
        relevanceReason: `State score: ${context.location.state}`,
      });
    }
  }

  return items;
}

/* ================================================================ */
/* LAYER 7: GLOBAL ACTIVITY                                         */
/* ================================================================ */

async function getGlobalActivity(
  context: UserContext,
  currentItemCount: number
): Promise<FeedItem[]> {
  // Only fill if we don't have enough items
  if (currentItemCount >= 30) return [];

  const items: FeedItem[] = [];
  const needed = 50 - currentItemCount;

  // Get recent global posts
  const postsQuery = query(
    collection(db, "thoughts"),
    orderBy("createdAt", "desc"),
    limit(Math.ceil(needed / 2))
  );
  const postsSnap = await getDocs(postsQuery);

  for (const doc of postsSnap.docs) {
    const data = doc.data();
    if (data.userId === context.userId) continue;

    const userProfile = await getUserProfile(data.userId);

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
      relevanceScore: 30,
      relevanceReason: "Global activity",
    });
  }

  // Get recent global scores
  const scoresQuery = query(
    collection(db, "scores"),
    orderBy("createdAt", "desc"),
    limit(Math.floor(needed / 2))
  );
  const scoresSnap = await getDocs(scoresQuery);

  for (const doc of scoresSnap.docs) {
    const data = doc.data();
    if (data.userId === context.userId) continue;

    const userProfile = await getUserProfile(data.userId);

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
      createdAt: data.createdAt,
      relevanceScore: 25,
      relevanceReason: "Global score",
    });
  }

  return items;
}

/* ================================================================ */
/* HELPER FUNCTIONS                                                 */
/* ================================================================ */

const userProfileCache: Record<string, any> = {};

async function getUserProfile(userId: string): Promise<any> {
  if (userProfileCache[userId]) {
    return userProfileCache[userId];
  }

  const userDoc = await getDoc(doc(db, "users", userId));
  const profile = {
    displayName: userDoc.data()?.displayName || "Unknown",
    avatar: userDoc.data()?.avatar,
  };

  userProfileCache[userId] = profile;
  return profile;
}

async function checkIfLowman(courseId: number, netScore: number): Promise<boolean> {
  try {
    const leaderDoc = await getDoc(doc(db, "course_leaders", String(courseId)));
    if (!leaderDoc.exists()) return false;

    const leaderData = leaderDoc.data();
    const currentLowman = leaderData.lowman?.[0];

    if (!currentLowman) return true; // First score is lowman

    return netScore < currentLowman.netScore;
  } catch (error) {
    console.error("Error checking lowman:", error);
    return false;
  }
}

function deduplicateItems(items: FeedItem[]): FeedItem[] {
  const seen = new Map<string, FeedItem>();

  for (const item of items) {
    const key = item.id;

    if (!seen.has(key)) {
      seen.set(key, item);
    } else {
      // Keep item with higher relevance score
      const existing = seen.get(key)!;
      if (item.relevanceScore > existing.relevanceScore) {
        seen.set(key, item);
      }
    }
  }

  return Array.from(seen.values());
}