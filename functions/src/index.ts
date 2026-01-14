import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";

initializeApp();
const db = getFirestore();

// Initialize Expo SDK for push notifications
const expo = new Expo();

// ============================================================================
// HELPER: GET USER DATA
// ============================================================================

interface UserData {
  displayName?: string;
  avatar?: string;
  partners?: string[];
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
// HELPER: CREATE NOTIFICATION DOCUMENT
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

  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  );

  const notificationData: any = {
    userId,
    type,
    actorId: actorId || null,
    actorName: actorName || "System",
    actorAvatar: actorAvatar || null,
    message,
    read: false,
    createdAt: Timestamp.now(),
    expiresAt,
  };

  if (postId) notificationData.postId = postId;
  if (commentId) notificationData.commentId = commentId;
  if (courseId) notificationData.courseId = courseId;
  if (courseName) notificationData.courseName = courseName;
  if (scoreId) notificationData.scoreId = scoreId;
  if (regionKey) notificationData.regionKey = regionKey;

  await db.collection("notifications").add(notificationData);
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
        badge: 1,
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
// 2. SCORES - partner_lowman, partner_scored, partner_holeinone
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

      if (holeCount !== 18) {
        console.log("⏭️ Skipping leaderboard update (9-hole round)");
        return;
      }

      if (!regionKey) {
        console.warn("⚠️ Score missing regionKey");
        return;
      }

      // ============================================
      // UPDATE REGIONAL LEADERBOARD
      // ============================================
      const leaderboardId = `${regionKey}_${courseId}`;
      const leaderboardRef = db.collection("leaderboards").doc(leaderboardId);
      const leaderboardSnap = await leaderboardRef.get();

      const newScoreEntry = {
        userId,
        displayName: userName || "Unknown",
        grossScore,
        netScore,
        createdAt: Timestamp.now(),
      };

      let isNewLowman = false;

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

        const lowmanBadge = {
          type: "lowman",
          courseId,
          courseName,
          achievedAt: Timestamp.now(),
          score: grossScore,
          displayName: "Lowman",
        };

        const userRef = db.collection("users").doc(userId);
        const userSnap = await userRef.get();
        const currentBadges = userSnap.data()?.Badges || [];

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

        const existingBadges = userSnap.data()?.Badges || [];
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

        // ============================================
        // CREATE CLUBHOUSE POST (if lowman)
        // ============================================
        const userData = userSnap.data();

        await db.collection("thoughts").add({
          thoughtId: `thought_${Date.now()}`,
          userId,
          userName: userData?.displayName || "Unknown",
          userAvatar: userData?.avatar || null,
          userHandicap: userData?.handicap || 0,
          userType: userData?.userType || "Golfer",
          userVerified: userData?.verified || false,
          postType: "low-leader",
          achievementType: "lowman",
          content: `Shot a ${grossScore} at ${courseName}! ${roundDescription || ""}`,
          scoreId,
          imageUrl: scorecardImageUrl || null,
          regionKey,
          geohash: score.geohash || null,
          location,
          taggedPartners: score.taggedPartners || [],
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
          contentLowercase: `shot a ${grossScore} at ${courseName.toLowerCase()}! ${(roundDescription || "").toLowerCase()}`,
        });

        console.log("✅ Clubhouse post created");

        // ============================================
        // SEND PARTNER_LOWMAN NOTIFICATIONS
        // ============================================
        const partners = userData?.partners || [];

        if (Array.isArray(partners) && partners.length > 0) {
          for (const partnerId of partners) {
            await createNotificationDocument({
              userId: partnerId,
              type: "partner_lowman",
              actorId: userId,
              actorName: userName,
              actorAvatar: userData?.avatar || null,
              scoreId,
              courseId,
              courseName,
              message: `${userName} became the low leader @${courseName}`,
              regionKey,
            });
          }
          console.log("✅ Sent partner_lowman notifications to", partners.length, "partners");
        }
      }

      // ============================================
      // SEND PARTNER_SCORED NOTIFICATIONS (for all scores)
      // ============================================
      const userRef = db.collection("users").doc(userId);
      const userSnap = await userRef.get();
      const userData = userSnap.data();
      const partners = userData?.partners || [];

      if (Array.isArray(partners) && partners.length > 0) {
        for (const partnerId of partners) {
          await createNotificationDocument({
            userId: partnerId,
            type: "partner_scored",
            actorId: userId,
            actorName: userName,
            actorAvatar: userData?.avatar || null,
            scoreId,
            courseId,
            courseName,
            message: `${userName} logged a round at ${courseName}`,
            regionKey,
          });
        }
        console.log("✅ Sent partner_scored notifications to", partners.length, "partners");
      }

      // ============================================
      // SEND PARTNER_HOLEINONE NOTIFICATIONS (if applicable)
      // ============================================
      if (hadHoleInOne && holeNumber) {
        if (Array.isArray(partners) && partners.length > 0) {
          for (const partnerId of partners) {
            await createNotificationDocument({
              userId: partnerId,
              type: "partner_holeinone",
              actorId: userId,
              actorName: userName,
              actorAvatar: userData?.avatar || null,
              scoreId,
              courseId,
              courseName,
              message: `${userName} hit a hole-in-one on hole ${holeNumber} at ${courseName}!`,
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
      // CREATE NOTIFICATION
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
  "partner_requests/{requestId}",
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
  "partner_requests/{requestId}",
  async (event) => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();

      if (!before || !after) return;

      // Check if status changed to "accepted"
      if (before.status !== "accepted" && after.status === "accepted") {
        const { fromUserId, toUserId } = after;

        if (!fromUserId || !toUserId) {
          console.log("⛔ Partner request missing required fields");
          return;
        }

        console.log("✅ Partner request accepted:", fromUserId, "←→", toUserId);

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

      const { userId, verifierId, courseId, courseName, holeNumber } = holeInOne;

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

      // Notify poster (pending)
      await createNotificationDocument({
        userId,
        type: "holeinone_pending_poster",
        actorId: verifierId,
        actorName: verifierData.displayName || "Someone",
        actorAvatar: verifierData.avatar,
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

      const { userId, verifierId, courseId, courseName, holeNumber } = after;

      if (!userId || !verifierId) {
        console.log("⛔ Hole-in-one missing required fields");
        return;
      }

      const verifierData = await getUserData(verifierId);
      if (!verifierData) {
        console.log("⚠️ Verifier not found");
        return;
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







