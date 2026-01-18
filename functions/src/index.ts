import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";

initializeApp();
const db = getFirestore();

// Initialize Expo SDK for push notifications
const expo = new Expo();

// ============================================================================
// SMART NOTIFICATION GROUPING CONFIG
// ============================================================================

// Time window for grouping (in milliseconds)
const GROUPING_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Notification types that should be grouped
const GROUPABLE_TYPES = {
  // Group by: postId (same post, multiple actors)
  POST_GROUPED: ["like", "comment", "comment_like", "share"],
  
  // Group by: actorId (same person, multiple actions)
  ACTOR_GROUPED: ["message"],
  
  // Never group (always create individual notifications)
  INDIVIDUAL: [
    "reply",
    "partner_request",
    "partner_accepted", 
    "mention_post",
    "mention_comment",
    "partner_posted",
    "partner_scored",
    "partner_lowman",
    "partner_holeinone",
    "holeinone_pending_poster",
    "holeinone_verification_request",
    "holeinone_verified",
    "holeinone_denied",
    "membership_submitted",
    "membership_approved",
    "membership_rejected",
    "trending",
    "system",
  ],
};

// ============================================================================
// HELPER: GET USER DATA
// ============================================================================

interface UserData {
  displayName?: string;
  avatar?: string;
  partners?: string[];
  handicap?: number;
  userType?: string;
  verified?: boolean;
  Badges?: any[];
}

async function getUserData(userId: string): Promise<UserData | null> {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return null;
    return userDoc.data() as UserData;
  } catch (error) {
    console.error("Error fetching user data:", error);
    return null;
  }
}

// ============================================================================
// HELPER: GENERATE GROUP KEY
// ============================================================================

function generateGroupKey(
  type: string,
  userId: string,
  postId?: string,
  commentId?: string,
  actorId?: string
): string {
  // Post-grouped types: same recipient + same post + same type
  if (GROUPABLE_TYPES.POST_GROUPED.includes(type)) {
    // For comment_like, group by commentId
    if (type === "comment_like" && commentId) {
      return `${userId}:${type}:comment:${commentId}`;
    }
    return `${userId}:${type}:post:${postId}`;
  }
  
  // Actor-grouped types: same recipient + same actor + same type
  if (GROUPABLE_TYPES.ACTOR_GROUPED.includes(type)) {
    return `${userId}:${type}:actor:${actorId}`;
  }
  
  // Individual types: unique key (won't match anything)
  return `${userId}:${type}:${Date.now()}:${Math.random()}`;
}

// ============================================================================
// HELPER: GENERATE GROUPED MESSAGE
// ============================================================================

function generateGroupedMessage(
  type: string,
  actorName: string,
  actorCount: number,
  extraData?: { courseName?: string; holeNumber?: number }
): string {
  const othersCount = actorCount - 1;
  const othersText = othersCount === 1 ? "1 other" : `${othersCount} others`;
  
  switch (type) {
    // Post interactions - GROUPED
    case "like":
      if (actorCount === 1) {
        return `${actorName} landed a dart on your Swing Thought`;
      }
      return `${actorName} and ${othersText} landed darts on your Swing Thought`;
    
    case "comment":
      if (actorCount === 1) {
        return `${actorName} weighed in on your Swing Thought`;
      }
      return `${actorName} and ${othersText} weighed in on your Swing Thought`;
    
    case "comment_like":
      if (actorCount === 1) {
        return `${actorName} landed a dart on your comment`;
      }
      return `${actorName} and ${othersText} landed darts on your comment`;
    
    case "share":
      if (actorCount === 1) {
        return `${actorName} shared your Swing Thought`;
      }
      return `${actorName} and ${othersText} shared your Swing Thought`;
    
    // Messages - GROUPED BY ACTOR
    case "message":
      if (actorCount === 1) {
        return `${actorName} left a note in your locker`;
      }
      return `${actorName} left you ${actorCount} notes in your locker`;
    
    // Partner interactions - NOT GROUPED (but included for completeness)
    case "reply":
      return `${actorName} replied to your comment`;
    
    case "partner_request":
      return `${actorName} wants to Partner Up`;
    
    case "partner_accepted":
      return `${actorName} has agreed to be your Partner`;
    
    case "partner_posted":
      return `${actorName} has a new Swing Thought`;
    
    case "partner_scored":
      return `${actorName} logged a round${extraData?.courseName ? ` at ${extraData.courseName}` : ""}`;
    
    case "partner_lowman":
      return `${actorName} became the low leader${extraData?.courseName ? ` @${extraData.courseName}` : ""}`;
    
    case "partner_holeinone":
      return `${actorName} hit a hole-in-one${extraData?.holeNumber ? ` on hole ${extraData.holeNumber}` : ""}${extraData?.courseName ? ` at ${extraData.courseName}` : ""}!`;
    
    // Mentions - NOT GROUPED
    case "mention_post":
      return `${actorName} tagged you in a Swing Thought`;
    
    case "mention_comment":
      return `${actorName} tagged you in a comment`;
    
    // Hole-in-one
    case "holeinone_pending_poster":
      return `Your hole-in-one is pending verification from ${actorName}`;
    
    case "holeinone_verification_request":
      return `${actorName} needs you to verify their hole-in-one`;
    
    case "holeinone_verified":
      return `✅ ${actorName} verified your hole-in-one!`;
    
    case "holeinone_denied":
      return `❌ ${actorName} did not verify your hole-in-one`;
    
    default:
      return `${actorName} interacted with you`;
  }
}

// ============================================================================
// HELPER: CREATE NOTIFICATION DOCUMENT (WITH SMART GROUPING)
// ============================================================================

interface CreateNotificationParams {
  userId: string;
  type: string;
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
  postId?: string;
  commentId?: string;
  courseId?: number;
  courseName?: string;
  scoreId?: string;
  message: string;
  regionKey?: string;
}

async function createNotificationDocument(params: CreateNotificationParams): Promise<void> {
  const {
    userId,
    type,
    actorId,
    actorName,
    actorAvatar,
    postId,
    commentId,
    courseId,
    courseName,
    scoreId,
    message,
    regionKey,
  } = params;

  // Skip if user is acting on their own content
  if (actorId && userId === actorId) return;

  const now = Timestamp.now();
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  );

  // Check if this notification type should be grouped
  const isGroupable = 
    GROUPABLE_TYPES.POST_GROUPED.includes(type) || 
    GROUPABLE_TYPES.ACTOR_GROUPED.includes(type);

  if (isGroupable && actorId) {
    // ============================================
    // SMART GROUPING LOGIC
    // ============================================
    const groupKey = generateGroupKey(type, userId, postId, commentId, actorId);
    const windowStart = new Date(Date.now() - GROUPING_WINDOW_MS);

    try {
      // Look for existing unread notification to update
      const existingQuery = await db
        .collection("notifications")
        .where("userId", "==", userId)
        .where("groupKey", "==", groupKey)
        .where("read", "==", false)
        .where("updatedAt", ">", Timestamp.fromDate(windowStart))
        .limit(1)
        .get();

      if (!existingQuery.empty) {
        // ============================================
        // UPDATE EXISTING NOTIFICATION
        // ============================================
        const existingDoc = existingQuery.docs[0];
        const existingData = existingDoc.data();

        // Check if this actor already exists
        const actors = existingData.actors || [];
        const actorExists = actors.some((a: any) => a.userId === actorId);

        let newActors = [...actors];
        let newActorCount = existingData.actorCount || 1;

        if (!actorExists) {
          // Add new actor to the front (most recent first)
          newActors = [
            {
              userId: actorId,
              displayName: actorName || "Someone",
              avatar: actorAvatar || null,
              timestamp: now,
            },
            ...actors.slice(0, 9), // Keep max 10 actors
          ];
          newActorCount = newActorCount + 1;
        } else if (GROUPABLE_TYPES.ACTOR_GROUPED.includes(type)) {
          // For actor-grouped (messages), increment count even if same actor
          newActorCount = newActorCount + 1;
        }

        // Generate updated message
        const updatedMessage = generateGroupedMessage(type, actorName || "Someone", newActorCount, { courseName });

        await existingDoc.ref.update({
          actors: newActors,
          actorCount: newActorCount,
          actorId: actorId, // Most recent actor
          actorName: actorName || "Someone",
          actorAvatar: actorAvatar || null,
          lastActorId: actorId,
          message: updatedMessage,
          updatedAt: now,
          read: false, // Reset to unread
        });

        console.log(`✅ Updated grouped notification ${existingDoc.id} (${newActorCount} actors)`);
        return;
      }
    } catch (error) {
      console.error("Error checking for existing notification:", error);
      // Fall through to create new notification
    }

    // ============================================
    // CREATE NEW GROUPED NOTIFICATION
    // ============================================
    const notificationData: any = {
      userId,
      type,
      actorId: actorId || null,
      actorName: actorName || "Someone",
      actorAvatar: actorAvatar || null,
      message,
      read: false,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      
      // Grouping fields
      groupKey,
      lastActorId: actorId,
      actors: [
        {
          userId: actorId,
          displayName: actorName || "Someone",
          avatar: actorAvatar || null,
          timestamp: now,
        },
      ],
      actorCount: 1,
    };

    if (postId) notificationData.postId = postId;
    if (commentId) notificationData.commentId = commentId;
    if (courseId) notificationData.courseId = courseId;
    if (courseName) notificationData.courseName = courseName;
    if (scoreId) notificationData.scoreId = scoreId;
    if (regionKey) notificationData.regionKey = regionKey;

    await db.collection("notifications").add(notificationData);
    console.log("✅ Created new grouped notification");
    return;
  }

  // ============================================
  // NON-GROUPED NOTIFICATION (Original behavior)
  // ============================================
  const notificationData: any = {
    userId,
    type,
    actorId: actorId || null,
    actorName: actorName || "System",
    actorAvatar: actorAvatar || null,
    message,
    read: false,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };

  if (postId) notificationData.postId = postId;
  if (commentId) notificationData.commentId = commentId;
  if (courseId) notificationData.courseId = courseId;
  if (courseName) notificationData.courseName = courseName;
  if (scoreId) notificationData.scoreId = scoreId;
  if (regionKey) notificationData.regionKey = regionKey;

  await db.collection("notifications").add(notificationData);
  console.log("✅ Created notification");
}

// ============================================================================
// 1. PUSH NOTIFICATIONS
// ============================================================================

export const sendPushNotification = onDocumentCreated(
  "notifications/{notificationId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const notification = snap.data();
      if (!notification) return;

      const { userId, type, message, read } = notification;

      if (read) {
        console.log("⏭️ Notification already read, skipping push");
        return;
      }

      const userDoc = await db.collection("users").doc(userId).get();

      if (!userDoc.exists) {
        console.log("⚠️ User not found:", userId);
        return;
      }

      const userData = userDoc.data();
      const expoPushToken = userData?.expoPushToken;

      if (!expoPushToken) {
        console.log("⚠️ No push token for user:", userId);
        return;
      }

      if (!Expo.isExpoPushToken(expoPushToken)) {
        console.error("❌ Invalid Expo push token:", expoPushToken);
        return;
      }

      // ✅ Count actual unread notifications for accurate badge
      const unreadSnapshot = await db
        .collection("notifications")
        .where("userId", "==", userId)
        .where("read", "==", false)
        .count()
        .get();
      
      const unreadCount = unreadSnapshot.data().count;
      console.log(`📊 Unread count for ${userId}: ${unreadCount}`);

      const pushMessage: ExpoPushMessage = {
        to: expoPushToken,
        sound: "default",
        title: "⛳ Swing Thoughts",
        body: message,
        data: {
          notificationId: event.params.notificationId,
          type,
          postId: notification.postId,
          commentId: notification.commentId,
          actorId: notification.actorId,
          userId: notification.userId,
          scoreId: notification.scoreId,
          courseId: notification.courseId,
        },
        badge: unreadCount,  // ✅ Accurate badge count instead of hardcoded 1
      };

      // Customize title based on notification type
      switch (type) {
        case "like":
          pushMessage.title = "🎯 New Dart!";
          break;
        case "comment_like":
          pushMessage.title = "🎯 Dart on Comment!";
          break;
        case "comment":
          pushMessage.title = "💬 New Comment";
          break;
        case "reply":
          pushMessage.title = "↩️ New Reply";
          break;
        case "mention_post":
          pushMessage.title = "🏷️ You Were Tagged";
          break;
        case "mention_comment":
          pushMessage.title = "🏷️ Tagged in Comment";
          break;
        case "share":
          pushMessage.title = "🔄 Post Shared";
          break;
        case "partner_request":
          pushMessage.title = "🤝 Partner Request";
          break;
        case "partner_accepted":
          pushMessage.title = "✅ Partner Accepted";
          break;
        case "partner_posted":
          pushMessage.title = "📝 New Swing Thought";
          break;
        case "partner_scored":
          pushMessage.title = "⛳ Round Logged";
          break;
        case "partner_lowman":
          pushMessage.title = "🏆 Low Leader!";
          break;
        case "partner_holeinone":
          pushMessage.title = "🏌️ Hole in One!";
          break;
        case "message":
          pushMessage.title = "📬 New Locker Note";
          break;
        case "holeinone_pending_poster":
          pushMessage.title = "⏳ Awaiting Verification";
          break;
        case "holeinone_verification_request":
          pushMessage.title = "✅ Verification Needed";
          break;
        case "holeinone_verified":
          pushMessage.title = "🎉 Hole-in-One Verified!";
          break;
        case "holeinone_denied":
          pushMessage.title = "❌ Verification Denied";
          break;
        case "membership_submitted":
          pushMessage.title = "📋 Request Submitted";
          break;
        case "membership_approved":
          pushMessage.title = "✅ Membership Approved";
          break;
        case "membership_rejected":
          pushMessage.title = "❌ Membership Update";
          break;
        default:
          pushMessage.title = "⛳ Swing Thoughts";
      }

      console.log("📤 Sending push notification to:", userId);

      const chunks = expo.chunkPushNotifications([pushMessage]);
      const tickets = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
          console.log("✅ Push notification sent:", ticketChunk);
        } catch (error) {
          console.error("❌ Error sending push notification chunk:", error);
        }
      }

      for (const ticket of tickets) {
        if (ticket.status === "error") {
          console.error("❌ Push notification error:", ticket.message);

          if (ticket.details?.error === "DeviceNotRegistered") {
            await db.collection("users").doc(userId).update({
              expoPushToken: FieldValue.delete(),
            });
            console.log("🗑️ Removed invalid push token for user:", userId);
          }
        }
      }
    } catch (error) {
      console.error("❌ Error in sendPushNotification function:", error);
    }
  }
);

// ============================================================================
// 2. SCORES - Creates thought/post, leaderboard, badges, notifications
// ============================================================================

export const onScoreCreated = onDocumentCreated(
  "scores/{scoreId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const score = snap.data();
      if (!score) return;

      const scoreId = event.params.scoreId;

      console.log("📝 New score created:", scoreId);

      const {
        userId,
        courseId,
        courseName,
        netScore,
        grossScore,
        userName,
        holeCount,
        regionKey,
        location,
        scorecardImageUrl,
        roundDescription,
        hadHoleInOne,
        holeNumber,
        taggedPartners,
        tee,
        teeYardage,
        geohash,
      } = score;

      if (
        !userId ||
        courseId === undefined ||
        !courseName ||
        typeof netScore !== "number" ||
        typeof grossScore !== "number"
      ) {
        console.log("⛔ Score missing required fields");
        return;
      }

      // Get user data for notifications and post creation
      const userRef = db.collection("users").doc(userId);
      const userSnap = await userRef.get();
      const userData = userSnap.data();

      if (!userData) {
        console.log("⚠️ User not found:", userId);
        return;
      }

      // ============================================
      // DETERMINE POST TYPE (check if lowman for 18-hole rounds)
      // ============================================
      let isNewLowman = false;
      let postType = "score";
      let achievementType: string | null = null;

      if (holeCount === 18 && regionKey) {
        const leaderboardId = `${regionKey}_${courseId}`;
        const leaderboardRef = db.collection("leaderboards").doc(leaderboardId);
        const leaderboardSnap = await leaderboardRef.get();

        const newScoreEntry = {
          userId,
          displayName: userName || userData?.displayName || "Unknown",
          userAvatar: userData?.avatar || null,
          grossScore,
          netScore,
          courseId,
          courseName,
          tees: tee || null,
          teeYardage: teeYardage || null,
          teePar: score.par || 72,
          par: score.par || 72,
          scoreId,
          createdAt: Timestamp.now(),
        };

        if (!leaderboardSnap.exists) {
          await leaderboardRef.set({
            regionKey,
            courseId,
            courseName,
            location: location || null,
            topScores18: [newScoreEntry],
            lowNetScore18: netScore,
            totalScores18: 1,
            topScores9: [],
            lowNetScore9: null,
            totalScores9: 0,
            totalScores: 1,
            holesInOne: [],
            createdAt: Timestamp.now(),
            lastUpdated: Timestamp.now(),
          });

          isNewLowman = true;
          console.log("✅ New leaderboard created, user is lowman");
        } else {
          const leaderboardData = leaderboardSnap.data();
          const topScores18 = leaderboardData?.topScores18 || [];
          const previousLowNetScore = leaderboardData?.lowNetScore18 || 999;

          topScores18.push(newScoreEntry);
          topScores18.sort((a: any, b: any) => {
            if (a.netScore !== b.netScore) return a.netScore - b.netScore;
            if (a.grossScore !== b.grossScore) return a.grossScore - b.grossScore;
            return a.createdAt.toMillis() - b.createdAt.toMillis();
          });

          const updatedTopScores18 = topScores18.slice(0, 10);
          const newLowNetScore = updatedTopScores18[0].netScore;

          if (
            updatedTopScores18[0].userId === userId &&
            newLowNetScore < previousLowNetScore
          ) {
            isNewLowman = true;
            console.log("🏆 NEW LOWMAN! User:", userId);
          }

          await leaderboardRef.update({
            topScores18: updatedTopScores18,
            lowNetScore18: newLowNetScore,
            totalScores18: FieldValue.increment(1),
            totalScores: FieldValue.increment(1),
            lastUpdated: Timestamp.now(),
          });

          console.log("✅ Leaderboard updated");
        }

        // ============================================
        // AWARD BADGES (if lowman)
        // ============================================
        if (isNewLowman) {
          console.log("🏆 Awarding badges...");
          postType = "low-leader";
          achievementType = "lowman";

          const lowmanBadge = {
            type: "lowman",
            courseId,
            courseName,
            achievedAt: Timestamp.now(),
            score: grossScore,
            displayName: "Lowman",
          };

          const currentBadges = userData?.Badges || [];

          await userRef.update({
            Badges: [...currentBadges, lowmanBadge],
          });

          console.log("✅ Lowman badge awarded");

          // Check for tier upgrades
          const leaderboardsSnap = await db
            .collection("leaderboards")
            .where("regionKey", "==", regionKey)
            .get();

          let lowmanCount = 0;
          leaderboardsSnap.forEach((doc) => {
            const data = doc.data();
            const topScores = data.topScores18 || [];
            if (topScores.length > 0 && topScores[0].userId === userId) {
              lowmanCount++;
            }
          });

          const existingBadges = userData?.Badges || [];
          const filteredBadges = existingBadges.filter(
            (b: any) => b.type !== "scratch" && b.type !== "ace"
          );

          if (lowmanCount >= 3) {
            await userRef.update({
              Badges: [
                ...filteredBadges,
                {
                  type: "ace",
                  courseId: 0,
                  courseName: "Multiple Courses",
                  achievedAt: Timestamp.now(),
                  displayName: "Ace",
                },
              ],
            });
            console.log("🏆 Upgraded to Ace badge!");
          } else if (lowmanCount >= 2) {
            await userRef.update({
              Badges: [
                ...filteredBadges,
                {
                  type: "scratch",
                  courseId: 0,
                  courseName: "Multiple Courses",
                  achievedAt: Timestamp.now(),
                  displayName: "Scratch",
                },
              ],
            });
            console.log("🏆 Upgraded to Scratch badge!");
          }
        }
      }

      // ============================================
      // CREATE CLUBHOUSE POST (for ALL scores)
      // ============================================
      console.log("📝 Creating clubhouse post...");

      const teeDetails = teeYardage 
        ? `from "${tee}", ${teeYardage} yards`
        : tee ? `from "${tee}"` : "";
      const postContent = `Shot a ${grossScore} @${courseName} ${teeDetails}! ${roundDescription || ""}`.trim();

      console.log("📝 Post content:", postContent);

      const thoughtData: any = {
        thoughtId: `thought_${Date.now()}`,
        userId,
        userName: userData?.displayName || "Unknown",
        displayName: userData?.displayName || "Unknown",
        userAvatar: userData?.avatar || null,
        avatar: userData?.avatar || null,
        userHandicap: userData?.handicap || 0,
        userType: userData?.userType || "Golfer",
        userVerified: userData?.verified || false,
        postType,
        achievementType,
        content: postContent,
        scoreId,
        imageUrl: scorecardImageUrl || null,
        regionKey: regionKey || null,
        geohash: geohash || null,
        location: location || null,
        taggedPartners: taggedPartners || [],
        taggedCourses: [{ courseId, courseName }],
        createdAt: Timestamp.now(),
        createdAtTimestamp: Date.now(),
        likes: 0,
        likedBy: [],
        comments: 0,
        engagementScore: 0,
        viewCount: 0,
        lastActivityAt: Timestamp.now(),
        hasMedia: !!scorecardImageUrl,
        mediaType: scorecardImageUrl ? "images" : null,
        imageUrls: scorecardImageUrl ? [scorecardImageUrl] : [],
        imageCount: scorecardImageUrl ? 1 : 0,
        contentLowercase: postContent.toLowerCase(),
        createdByScoreFunction: true,
      };

      console.log("📝 Thought data prepared, adding to Firestore...");

      let thoughtId: string | undefined;
      
      try {
        const thoughtRef = await db.collection("thoughts").add(thoughtData);
        thoughtId = thoughtRef.id;
        console.log("✅ Clubhouse post created:", thoughtId);

        // Update score document with thoughtId
        try {
          await snap.ref.update({ thoughtId });
          console.log("✅ Score updated with thoughtId:", thoughtId);
        } catch (updateError) {
          console.error("❌ Error updating score with thoughtId:", updateError);
        }
      } catch (thoughtError) {
        console.error("❌ Error creating thought:", thoughtError);
      }

      // ============================================
      // SEND PARTNER NOTIFICATIONS (with postId!)
      // ============================================
      const partners = userData?.partners || [];

      if (Array.isArray(partners) && partners.length > 0) {
        // partner_scored (for ALL scores)
        for (const partnerId of partners) {
          await createNotificationDocument({
            userId: partnerId,
            type: "partner_scored",
            actorId: userId,
            actorName: userName || userData?.displayName,
            actorAvatar: userData?.avatar || null,
            postId: thoughtId, // ✅ NOW INCLUDED
            scoreId,
            courseId,
            courseName,
            message: `${userName || userData?.displayName} logged a round at ${courseName}`,
            regionKey,
          });
        }
        console.log("✅ Sent partner_scored notifications to", partners.length, "partners");

        // partner_lowman (if applicable)
        if (isNewLowman) {
          for (const partnerId of partners) {
            await createNotificationDocument({
              userId: partnerId,
              type: "partner_lowman",
              actorId: userId,
              actorName: userName || userData?.displayName,
              actorAvatar: userData?.avatar || null,
              postId: thoughtId, // ✅ NOW INCLUDED
              scoreId,
              courseId,
              courseName,
              message: `${userName || userData?.displayName} became the low leader @${courseName}`,
              regionKey,
            });
          }
          console.log("✅ Sent partner_lowman notifications to", partners.length, "partners");
        }

        // partner_holeinone (if applicable)
        if (hadHoleInOne && holeNumber) {
          for (const partnerId of partners) {
            await createNotificationDocument({
              userId: partnerId,
              type: "partner_holeinone",
              actorId: userId,
              actorName: userName || userData?.displayName,
              actorAvatar: userData?.avatar || null,
              postId: thoughtId, // ✅ NOW INCLUDED
              scoreId,
              courseId,
              courseName,
              message: `${userName || userData?.displayName} hit a hole-in-one on hole ${holeNumber} at ${courseName}!`,
              regionKey,
            });
          }
          console.log("✅ Sent partner_holeinone notifications to", partners.length, "partners");
        }
      }

      console.log("✅ Score processing complete");
    } catch (err) {
      console.error("🔥 onScoreCreated failed:", err);
    }
  }
);

// ============================================================================
// 3. MESSAGES - message
// ============================================================================

export const onMessageCreated = onDocumentCreated(
  "threads/{threadId}/messages/{messageId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const message = snap.data();
      if (!message) return;

      const { senderId, receiverId, content, createdAt } = message;

      if (!senderId || !receiverId) {
        console.log("⛔ Message missing senderId or receiverId");
        return;
      }

      console.log("📨 New message:", senderId, "→", receiverId);

      // ============================================================
      // THREAD ID (FROM PATH PARAM)
      // ============================================================

      const { threadId } = event.params;
      const threadRef = db.collection("threads").doc(threadId);
      const threadSnap = await threadRef.get();

      const messageTimestamp = createdAt || Timestamp.now();

      // ============================================================
      // FETCH USER DATA (FOR NAMES + AVATARS)
      // ============================================================

      const senderData = await getUserData(senderId);
      const receiverData = await getUserData(receiverId);

      if (!senderData || !receiverData) {
        console.log("⚠️ Sender or receiver user not found");
        return;
      }

      // ============================================================
      // CREATE OR UPDATE THREAD
      // ============================================================

      if (!threadSnap.exists) {
        // 🆕 NEW THREAD
        await threadRef.set({
          participants: [senderId, receiverId],

          participantNames: {
            [senderId]: senderData.displayName || "Unknown",
            [receiverId]: receiverData.displayName || "Unknown",
          },

          participantAvatars: {
            [senderId]: senderData.avatar || null,
            [receiverId]: receiverData.avatar || null,
          },

          unreadCount: {
            [receiverId]: 1,
            [senderId]: 0,
          },

          lastMessage: {
            senderId,
            content,
            createdAt: messageTimestamp,
          },

          lastSenderId: senderId,
          lastMessageAt: messageTimestamp,

          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });

        console.log("🧵 Thread created:", threadId);
      } else {
        // 🔄 EXISTING THREAD - Also clear deletedBy when new message arrives
        const threadData = threadSnap.data();
        const updateData: any = {
          [`unreadCount.${receiverId}`]: FieldValue.increment(1),

          participantNames: {
            [senderId]: senderData.displayName || "Unknown",
            [receiverId]: receiverData.displayName || "Unknown",
          },

          participantAvatars: {
            [senderId]: senderData.avatar || null,
            [receiverId]: receiverData.avatar || null,
          },

          lastMessage: {
            senderId,
            content,
            createdAt: messageTimestamp,
          },

          lastSenderId: senderId,
          lastMessageAt: messageTimestamp,

          updatedAt: Timestamp.now(),
        };

        // Clear deletedBy array when new message arrives (restores thread for both users)
        if (threadData?.deletedBy && threadData.deletedBy.length > 0) {
          updateData.deletedBy = [];
        }

        await threadRef.update(updateData);

        console.log("🧵 Thread updated:", threadId);
      }

      // ============================================================
      // CREATE NOTIFICATION (NOW WITH SMART GROUPING)
      // ============================================================

      await createNotificationDocument({
        userId: receiverId,
        type: "message",
        actorId: senderId,
        actorName: senderData.displayName || "Someone",
        actorAvatar: senderData.avatar || undefined,
        message: `${senderData.displayName || "Someone"} left a note in your locker`,
      });

      console.log("✅ Message thread + notification processed");
    } catch (error) {
      console.error("🔥 onMessageCreated failed:", error);
    }
  }
);

// ============================================================================
// 4. THOUGHTS (POSTS) - partner_posted, mention_post
// ============================================================================

export const onThoughtCreated = onDocumentCreated(
  "thoughts/{thoughtId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const thought = snap.data();
      if (!thought) return;

      const thoughtId = event.params.thoughtId;

      // ✅ SKIP if this thought was created by onScoreCreated (to avoid duplicate notifications)
      if (thought.createdByScoreFunction === true) {
        console.log("⏭️ Skipping partner_posted - thought created by score function");
        return;
      }

      // Support both old (userName) and new (displayName) field names
      const { userId, userName, displayName, userAvatar, avatar, taggedPartners } = thought;

      if (!userId) {
        console.log("⛔ Thought missing userId");
        return;
      }

      console.log("📝 New thought created by", userId);

      const userData = await getUserData(userId);
      if (!userData) {
        console.log("⚠️ User not found");
        return;
      }

      // Use whichever name field is available
      const actorName = userName || displayName || userData.displayName || "Someone";
      const actorAvatar = userAvatar || avatar || userData.avatar;

      // ============================================
      // SEND PARTNER_POSTED NOTIFICATIONS
      // ============================================
      const partners = userData.partners || [];

      if (Array.isArray(partners) && partners.length > 0) {
        for (const partnerId of partners) {
          await createNotificationDocument({
            userId: partnerId,
            type: "partner_posted",
            actorId: userId,
            actorName,
            actorAvatar,
            postId: thoughtId,
            message: `${actorName} has a new Swing Thought`,
          });
        }
        console.log("✅ Sent partner_posted notifications to", partners.length, "partners");
      }

      // ============================================
      // SEND MENTION_POST NOTIFICATIONS
      // ============================================
      if (taggedPartners && Array.isArray(taggedPartners) && taggedPartners.length > 0) {
        for (const tagged of taggedPartners) {
          // Handle both formats: string ID or object with userId
          const taggedUserId = typeof tagged === 'string' ? tagged : tagged.userId;
          
          if (!taggedUserId) continue;
          
          // Skip if already notified as partner
          if (partners.includes(taggedUserId)) continue;

          await createNotificationDocument({
            userId: taggedUserId,
            type: "mention_post",
            actorId: userId,
            actorName,
            actorAvatar,
            postId: thoughtId,
            message: `${actorName} tagged you in a Swing Thought`,
          });
        }
        console.log("✅ Sent mention_post notifications to tagged users");
      }

      console.log("✅ Thought processing complete");
    } catch (error) {
      console.error("🔥 onThoughtCreated failed:", error);
    }
  }
);

// ============================================================================
// 5. LIKES (POST LIKES) - like
// ============================================================================

export const onLikeCreated = onDocumentCreated(
  "likes/{likeId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const like = snap.data();
      if (!like) return;

      const { userId, postId, postAuthorId } = like;

      if (!userId || !postId || !postAuthorId) {
        console.log("⛔ Like missing required fields");
        return;
      }

      console.log("👍 New like from", userId, "on post by", postAuthorId);

      const userData = await getUserData(userId);
      if (!userData) {
        console.log("⚠️ User not found");
        return;
      }

      await createNotificationDocument({
        userId: postAuthorId,
        type: "like",
        actorId: userId,
        actorName: userData.displayName || "Someone",
        actorAvatar: userData.avatar,
        postId,
        message: `${userData.displayName || "Someone"} landed a dart on your Swing Thought`,
      });

      console.log("✅ Like notification created");
    } catch (error) {
      console.error("🔥 onLikeCreated failed:", error);
    }
  }
);

// ============================================================================
// 6. COMMENT LIKES - comment_like
// ============================================================================

export const onCommentLikeCreated = onDocumentCreated(
  "comment_likes/{likeId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const like = snap.data();
      if (!like) return;

      const { userId, commentId, commentAuthorId, postId } = like;

      if (!userId || !commentId || !commentAuthorId) {
        console.log("⛔ Comment like missing required fields");
        return;
      }

      console.log("👍 New comment like from", userId, "on comment by", commentAuthorId);

      const userData = await getUserData(userId);
      if (!userData) {
        console.log("⚠️ User not found");
        return;
      }

      await createNotificationDocument({
        userId: commentAuthorId,
        type: "comment_like",
        actorId: userId,
        actorName: userData.displayName || "Someone",
        actorAvatar: userData.avatar,
        postId,
        commentId,
        message: `${userData.displayName || "Someone"} landed a dart on your comment`,
      });

      console.log("✅ Comment like notification created");
    } catch (error) {
      console.error("🔥 onCommentLikeCreated failed:", error);
    }
  }
);

// ============================================================================
// 7. COMMENTS - comment, reply, mention_comment
// ============================================================================

export const onCommentCreated = onDocumentCreated(
  "comments/{commentId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const comment = snap.data();
      if (!comment) return;

      const commentId = event.params.commentId;
      const { 
        userId, 
        postId, 
        postAuthorId, 
        taggedUsers,
        parentCommentId,
        parentCommentAuthorId,
      } = comment;

      if (!userId || !postId || !postAuthorId) {
        console.log("⛔ Comment missing required fields");
        return;
      }

      console.log("💬 New comment from", userId, "on post by", postAuthorId);

      const userData = await getUserData(userId);
      if (!userData) {
        console.log("⚠️ User not found");
        return;
      }

      const actorName = userData.displayName || "Someone";
      const actorAvatar = userData.avatar;

      // Track who we've already notified to avoid duplicates
      const notifiedUsers = new Set<string>();

      // ============================================
      // REPLY NOTIFICATION (if this is a reply)
      // ============================================
      if (parentCommentId && parentCommentAuthorId) {
        // Don't notify if replying to own comment
        if (parentCommentAuthorId !== userId) {
          await createNotificationDocument({
            userId: parentCommentAuthorId,
            type: "reply",
            actorId: userId,
            actorName,
            actorAvatar,
            postId,
            commentId,
            message: `${actorName} replied to your comment`,
          });
          notifiedUsers.add(parentCommentAuthorId);
          console.log("✅ Reply notification sent to parent comment author");
        }
      }

      // ============================================
      // COMMENT NOTIFICATION TO POST AUTHOR
      // ============================================
      // Only notify post author if:
      // 1. They haven't been notified already (e.g., as parent comment author)
      // 2. This is NOT a reply (to avoid double notifications)
      // 3. They're not the commenter
      if (!parentCommentId && postAuthorId !== userId && !notifiedUsers.has(postAuthorId)) {
        await createNotificationDocument({
          userId: postAuthorId,
          type: "comment",
          actorId: userId,
          actorName,
          actorAvatar,
          postId,
          commentId,
          message: `${actorName} weighed in on your Swing Thought`,
        });
        notifiedUsers.add(postAuthorId);
        console.log("✅ Comment notification created for post author");
      }

      // ============================================
      // MENTION NOTIFICATIONS
      // ============================================
      if (taggedUsers && Array.isArray(taggedUsers) && taggedUsers.length > 0) {
        for (const taggedUserId of taggedUsers) {
          // Skip if already notified or is the commenter
          if (notifiedUsers.has(taggedUserId) || taggedUserId === userId) continue;

          await createNotificationDocument({
            userId: taggedUserId,
            type: "mention_comment",
            actorId: userId,
            actorName,
            actorAvatar,
            postId,
            commentId,
            message: `${actorName} tagged you in a comment`,
          });
          notifiedUsers.add(taggedUserId);
        }
        console.log("✅ Sent mention_comment notifications to", taggedUsers.length, "tagged users");
      }

      console.log("✅ Comment processing complete");
    } catch (error) {
      console.error("🔥 onCommentCreated failed:", error);
    }
  }
);

// ============================================================================
// 8. PARTNER REQUESTS - partner_request, partner_accepted
// ============================================================================

export const onPartnerRequestCreated = onDocumentCreated(
  "partnerRequests/{requestId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const request = snap.data();
      if (!request) return;

      const { fromUserId, toUserId } = request;

      if (!fromUserId || !toUserId) {
        console.log("⛔ Partner request missing required fields");
        return;
      }

      console.log("🤝 New partner request from", fromUserId, "to", toUserId);

      const userData = await getUserData(fromUserId);
      if (!userData) {
        console.log("⚠️ User not found");
        return;
      }

      await createNotificationDocument({
        userId: toUserId,
        type: "partner_request",
        actorId: fromUserId,
        actorName: userData.displayName || "Someone",
        actorAvatar: userData.avatar,
        message: `${userData.displayName || "Someone"} wants to Partner Up`,
      });

      console.log("✅ Partner request notification created");
    } catch (error) {
      console.error("🔥 onPartnerRequestCreated failed:", error);
    }
  }
);

export const onPartnerRequestUpdated = onDocumentUpdated(
  "partnerRequests/{requestId}",
  async (event) => {
    console.log("🔥 onPartnerRequestUpdated TRIGGERED");
    console.log("📄 Request ID:", event.params.requestId);
    
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();

      console.log("📝 Before status:", before?.status);
      console.log("📝 After status:", after?.status);

      if (!before || !after) {
        console.log("⛔ Missing before/after data");
        return;
      }

      // Check if status changed to "approved"
      if (before.status !== "approved" && after.status === "approved") {
        const { fromUserId, toUserId } = after;

        console.log("✅ Status changed to approved!");
        console.log("👤 fromUserId:", fromUserId);
        console.log("👤 toUserId:", toUserId);

        // ... rest of function stays the same

        if (!fromUserId || !toUserId) {
          console.log("⛔ Partner request missing required fields");
          return;
        }

        console.log("✅ Partner request approved:", fromUserId, "←→", toUserId);

        const userData = await getUserData(toUserId);
        if (!userData) {
          console.log("⚠️ User not found");
          return;
        }

        // Notify the person who sent the request
        await createNotificationDocument({
          userId: fromUserId,
          type: "partner_accepted",
          actorId: toUserId,
          actorName: userData.displayName || "Someone",
          actorAvatar: userData.avatar,
          message: `${userData.displayName || "Someone"} has agreed to be your Partner`,
        });

        console.log("✅ Partner accepted notification created");
      }
    } catch (error) {
      console.error("🔥 onPartnerRequestUpdated failed:", error);
    }
  }
);

// ============================================================================
// 9. COURSE MEMBERSHIPS - membership_submitted, membership_approved, membership_rejected
// ============================================================================

export const onMembershipCreated = onDocumentCreated(
  "course_memberships/{membershipId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const membership = snap.data();
      if (!membership) return;

      const { userId, courseId, courseName } = membership;

      if (!userId || !courseId) {
        console.log("⛔ Membership missing required fields");
        return;
      }

      console.log("📋 New membership request from", userId, "for", courseName);

      // Send confirmation to user
      await createNotificationDocument({
        userId,
        type: "membership_submitted",
        courseId,
        courseName: courseName || "a course",
        message: `Your membership request for ${courseName || "a course"} has been submitted for review`,
      });

      console.log("✅ Membership submitted notification created");
    } catch (error) {
      console.error("🔥 onMembershipCreated failed:", error);
    }
  }
);

export const onMembershipUpdated = onDocumentUpdated(
  "course_memberships/{membershipId}",
  async (event) => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();

      if (!before || !after) return;

      const { userId, courseId, courseName, status } = after;

      if (!userId || !courseId) {
        console.log("⛔ Membership missing required fields");
        return;
      }

      // Check if status changed to approved
      if (before.status !== "approved" && status === "approved") {
        console.log("✅ Membership approved for", userId, "at", courseName);

        await createNotificationDocument({
          userId,
          type: "membership_approved",
          courseId,
          courseName: courseName || "the course",
          message: `Your membership at ${courseName || "the course"} has been verified!`,
        });

        console.log("✅ Membership approved notification created");
      }

      // Check if status changed to rejected
      if (before.status !== "rejected" && status === "rejected") {
        console.log("❌ Membership rejected for", userId, "at", courseName);

        const rejectionReason = after.rejectionReason || "";

        await createNotificationDocument({
          userId,
          type: "membership_rejected",
          courseId,
          courseName: courseName || "the course",
          message: rejectionReason
            ? `Your membership request for ${courseName || "the course"} was not approved. Reason: ${rejectionReason}`
            : `Your membership request for ${courseName || "the course"} was not approved`,
        });

        console.log("✅ Membership rejected notification created");
      }
    } catch (error) {
      console.error("🔥 onMembershipUpdated failed:", error);
    }
  }
);

// ============================================================================
// 10. HOLE-IN-ONE VERIFICATION - holeinone_pending_poster, holeinone_verification_request, holeinone_verified, holeinone_denied
// ============================================================================

export const onHoleInOneCreated = onDocumentCreated(
  "hole_in_ones/{holeInOneId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const holeInOne = snap.data();
      if (!holeInOne) return;

      const { userId, verifierId, courseId, courseName, holeNumber, scoreId } = holeInOne;

      if (!userId || !verifierId) {
        console.log("⛔ Hole-in-one missing required fields");
        return;
      }

      console.log("🏌️ New hole-in-one submission from", userId);

      const userData = await getUserData(userId);
      const verifierData = await getUserData(verifierId);

      if (!userData || !verifierData) {
        console.log("⚠️ User data not found");
        return;
      }

      // ✅ Look up the postId from the score document
      let postId: string | undefined;
      if (scoreId) {
        const scoreSnap = await db.collection("scores").doc(scoreId).get();
        if (scoreSnap.exists) {
          postId = scoreSnap.data()?.thoughtId;
          console.log("✅ Found postId from score:", postId);
        }
      }

      // Notify poster (pending)
      await createNotificationDocument({
        userId,
        type: "holeinone_pending_poster",
        actorId: verifierId,
        actorName: verifierData.displayName || "Someone",
        actorAvatar: verifierData.avatar,
        postId, // ✅ NOW INCLUDED
        scoreId,
        courseId,
        courseName,
        message: `Your hole-in-one on hole ${holeNumber} is pending verification from ${verifierData.displayName || "Someone"}`,
      });

      // Notify verifier (needs to verify)
      await createNotificationDocument({
        userId: verifierId,
        type: "holeinone_verification_request",
        actorId: userId,
        actorName: userData.displayName || "Someone",
        actorAvatar: userData.avatar,
        scoreId,
        courseId,
        courseName,
        message: `${userData.displayName || "Someone"} needs you to verify their hole-in-one on hole ${holeNumber}`,
      });

      console.log("✅ Hole-in-one verification notifications created");
    } catch (error) {
      console.error("🔥 onHoleInOneCreated failed:", error);
    }
  }
);

export const onHoleInOneUpdated = onDocumentUpdated(
  "hole_in_ones/{holeInOneId}",
  async (event) => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();

      if (!before || !after) return;

      const { userId, verifierId, courseId, courseName, holeNumber, scoreId } = after;

      if (!userId || !verifierId) {
        console.log("⛔ Hole-in-one missing required fields");
        return;
      }

      const verifierData = await getUserData(verifierId);
      if (!verifierData) {
        console.log("⚠️ Verifier not found");
        return;
      }

      // ✅ Look up the postId from the score document
      let postId: string | undefined;
      if (scoreId) {
        const scoreSnap = await db.collection("scores").doc(scoreId).get();
        if (scoreSnap.exists) {
          postId = scoreSnap.data()?.thoughtId;
          console.log("✅ Found postId from score:", postId);
        }
      }

      // Check if status changed to verified
      if (before.status !== "verified" && after.status === "verified") {
        console.log("✅ Hole-in-one verified for", userId);

        await createNotificationDocument({
          userId,
          type: "holeinone_verified",
          actorId: verifierId,
          actorName: verifierData.displayName || "Someone",
          actorAvatar: verifierData.avatar,
          postId, // ✅ NOW INCLUDED
          scoreId,
          courseId,
          courseName,
          message: `✅ ${verifierData.displayName || "Someone"} verified your hole-in-one on hole ${holeNumber}!`,
        });

        console.log("✅ Hole-in-one verified notification created");
      }

      // Check if status changed to denied
      if (before.status !== "denied" && after.status === "denied") {
        console.log("❌ Hole-in-one denied for", userId);

        await createNotificationDocument({
          userId,
          type: "holeinone_denied",
          actorId: verifierId,
          actorName: verifierData.displayName || "Someone",
          actorAvatar: verifierData.avatar,
          postId, // ✅ NOW INCLUDED
          scoreId,
          courseId,
          courseName,
          message: `❌ ${verifierData.displayName || "Someone"} did not verify your hole-in-one on hole ${holeNumber}`,
        });

        console.log("✅ Hole-in-one denied notification created");
      }
    } catch (error) {
      console.error("🔥 onHoleInOneUpdated failed:", error);
    }
  }
);

// ============================================================================
// 11. SHARES - share (Future Proofing)
// ============================================================================

export const onShareCreated = onDocumentCreated(
  "shares/{shareId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const share = snap.data();
      if (!share) return;

      const { userId, postId, postAuthorId } = share;

      if (!userId || !postId || !postAuthorId) {
        console.log("⛔ Share missing required fields");
        return;
      }

      console.log("🔄 New share from", userId, "of post by", postAuthorId);

      const userData = await getUserData(userId);
      if (!userData) {
        console.log("⚠️ User not found");
        return;
      }

      await createNotificationDocument({
        userId: postAuthorId,
        type: "share",
        actorId: userId,
        actorName: userData.displayName || "Someone",
        actorAvatar: userData.avatar,
        postId,
        message: `${userData.displayName || "Someone"} shared your Swing Thought`,
      });

      console.log("✅ Share notification created");
    } catch (error) {
      console.error("🔥 onShareCreated failed:", error);
    }
  }
);

// ============================================================================
// 12. THREAD CLEANUP - Delete thread when both users have deleted
// ============================================================================

export const onThreadUpdated = onDocumentUpdated(
  "threads/{threadId}",
  async (event) => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();

      if (!before || !after) return;

      const threadId = event.params.threadId;
      const participants = after.participants || [];
      const deletedBy = after.deletedBy || [];

      // Only proceed if deletedBy was modified
      const beforeDeletedBy = before.deletedBy || [];
      if (JSON.stringify(beforeDeletedBy) === JSON.stringify(deletedBy)) {
        return; // deletedBy wasn't changed, skip
      }

      // Check if all participants have deleted the thread
      const allDeleted = participants.length > 0 && 
        participants.every((p: string) => deletedBy.includes(p));

      if (!allDeleted) {
        console.log("🔍 Thread not fully deleted yet:", threadId);
        return;
      }

      console.log("🗑️ All participants deleted thread, performing full cleanup:", threadId);

      // Delete all messages in the thread
      const messagesRef = db.collection("threads").doc(threadId).collection("messages");
      const messagesSnap = await messagesRef.get();

      const batch = db.batch();

      messagesSnap.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // Delete the thread document itself
      batch.delete(db.collection("threads").doc(threadId));

      await batch.commit();

      console.log(
        `✅ Thread ${threadId} fully deleted (${messagesSnap.size} messages removed)`
      );
    } catch (error) {
      console.error("🔥 onThreadUpdated (cleanup) failed:", error);
    }
  }
);

// ============================================================================
// TOURNAMENT SYNC FUNCTIONS
// ============================================================================

export {
  cleanupTournamentChats,
  getActiveTournament, syncLeaderboard,
  syncLeaderboardManual, syncTournamentSchedule
} from "./tournamentSync";








