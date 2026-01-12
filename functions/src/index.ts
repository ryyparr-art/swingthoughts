import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

initializeApp();
const db = getFirestore();

// Initialize Expo SDK for push notifications
const expo = new Expo();

/**
 * PUSH NOTIFICATIONS
 * --------------------------------------------------
 * Triggered when a new notification document is created
 * Sends push notification to user's device via Expo Push Service
 */
export const sendPushNotification = onDocumentCreated(
  "notifications/{notificationId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const notification = snap.data();
      if (!notification) return;

      const { userId, type, message, read } = notification;

      // Only send push if notification is unread
      if (read) {
        console.log("⏭️ Notification already read, skipping push");
        return;
      }

      // Get user's Expo Push Token
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

      // Validate token
      if (!Expo.isExpoPushToken(expoPushToken)) {
        console.error("❌ Invalid Expo push token:", expoPushToken);
        return;
      }

      // Construct push notification payload
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
        case "comment":
          pushMessage.title = "💬 New Comment";
          break;
        case "partner_request":
          pushMessage.title = "🤝 Partner Request";
          break;
        case "partner_holeinone":
          pushMessage.title = "🏌️ Hole in One!";
          break;
        case "partner_lowman":
          pushMessage.title = "🏆 Low Leader!";
          break;
        case "message":
          pushMessage.title = "📬 New Locker Note";
          break;
        case "holeinone_verification_request":
          pushMessage.title = "✅ Verification Needed";
          break;
        case "holeinone_verified":
          pushMessage.title = "🎉 Hole-in-One Verified!";
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

      // Send push notification
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

      // Check for errors in tickets
      for (const ticket of tickets) {
        if (ticket.status === "error") {
          console.error("❌ Push notification error:", ticket.message);

          // If token is invalid, remove it from user document
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

/**
 * REGIONAL LEADERBOARDS + BADGE AWARDS
 * --------------------------------------------------
 * Triggered when a new score is created
 * Handles:
 * 1. Regional leaderboard updates (18-hole only)
 * 2. Badge awards (lowman, scratch, ace)
 * 3. Clubhouse post creation (if lowman)
 * 4. Partner notifications
 */
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
      console.log("  User:", score.userId);
      console.log("  Course:", score.courseId);
      console.log("  Net Score:", score.netScore);
      console.log("  Hole Count:", score.holeCount);

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

      // Validation
      if (
        !userId ||
        courseId === undefined ||
        !courseName ||
        typeof netScore !== "number" ||
        typeof grossScore !== "number"
      ) {
        console.log("⛔ Score missing required fields", score);
        return;
      }

      // Skip 9-hole rounds for leaderboard (for now)
      if (holeCount !== 18) {
        console.log("⏭️ Skipping leaderboard update (9-hole round)");
        return;
      }

      // Get region key
      if (!regionKey) {
        console.warn("⚠️ Score missing regionKey");
        return;
      }

      console.log("🌍 Region:", regionKey);
      console.log("⛳ Hole-in-one:", hadHoleInOne ? "Yes" : "No");
      if (hadHoleInOne && holeNumber) {
        console.log("🕳️ Hole number:", holeNumber);
      }

      // ============================================
      // 1. UPDATE REGIONAL LEADERBOARD
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
      let previousLowNetScore = 999;

      if (!leaderboardSnap.exists) {
        // First score at this course - user is lowman!
        console.log("🏆 First score at course - creating leaderboard");

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
        // Update existing leaderboard
        const leaderboardData = leaderboardSnap.data();
        const topScores18 = leaderboardData?.topScores18 || [];
        previousLowNetScore = leaderboardData?.lowNetScore18 || 999;

        console.log("📊 Previous low score:", previousLowNetScore);
        console.log("📊 New score:", netScore);

        // Add new score and sort
        topScores18.push(newScoreEntry);
        topScores18.sort((a: any, b: any) => {
          if (a.netScore !== b.netScore) {
            return a.netScore - b.netScore;
          }
          if (a.grossScore !== b.grossScore) {
            return a.grossScore - b.grossScore;
          }
          return a.createdAt.toMillis() - b.createdAt.toMillis();
        });

        // Keep top 10
        const updatedTopScores18 = topScores18.slice(0, 10);
        const newLowNetScore = updatedTopScores18[0].netScore;

        // Check if user is new lowman
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
      // 2. AWARD BADGES (if lowman)
      // ============================================
      if (isNewLowman) {
        console.log("🏆 Awarding badges...");

        // Award lowman badge
        const lowmanBadge = {
          type: "lowman",
          courseId,
          courseName,
          achievedAt: Timestamp.now(),
          score: grossScore,
          displayName: "Lowman",
        };

        const userRef = db.collection("users").doc(userId);

        // Get current badges to append to
        const userSnap = await userRef.get();
        const currentBadges = userSnap.data()?.Badges || [];

        await userRef.update({
          Badges: [...currentBadges, lowmanBadge],
        });

        console.log("✅ Lowman badge awarded");

        // Check for tier upgrades (Scratch/Ace)
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

        console.log("📊 User has lowman at", lowmanCount, "courses");

        // Get existing badges to filter tier badges (reuse userSnap from above)
        const existingBadges = userSnap.data()?.Badges || [];

        // Remove old tier badges but keep all other badges
        const filteredBadges = existingBadges.filter(
          (b: any) => b.type !== "scratch" && b.type !== "ace"
        );

        if (lowmanCount >= 3) {
          // Award Ace
          const aceBadge = {
            type: "ace",
            courseId: 0,
            courseName: "Multiple Courses",
            achievedAt: Timestamp.now(),
            displayName: "Ace",
          };

          await userRef.update({
            Badges: [...filteredBadges, aceBadge],
          });

          console.log("🏆 Upgraded to Ace badge!");
        } else if (lowmanCount >= 2) {
          // Award Scratch
          const scratchBadge = {
            type: "scratch",
            courseId: 0,
            courseName: "Multiple Courses",
            achievedAt: Timestamp.now(),
            displayName: "Scratch",
          };

          await userRef.update({
            Badges: [...filteredBadges, scratchBadge],
          });

          console.log("🏆 Upgraded to Scratch badge!");
        }

        // ============================================
        // 3. CREATE CLUBHOUSE POST (if lowman)
        // ============================================
        console.log("📱 Creating clubhouse post...");

        // Get user data for denormalized fields (reuse userSnap from above)
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
          content: `Shot a ${grossScore} at ${courseName}! ${
            roundDescription || ""
          }`,
          scoreId,
          imageUrl: scorecardImageUrl || null,
          regionKey,
          geohash: score.geohash || null,
          location,
          taggedPartners: score.taggedPartners || [],
          taggedCourses: [
            {
              courseId,
              courseName,
            },
          ],
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
          contentLowercase: `shot a ${grossScore} at ${courseName.toLowerCase()}! ${(
            roundDescription || ""
          ).toLowerCase()}`,
        });

        console.log("✅ Clubhouse post created");

        // ============================================
        // 4. SEND NOTIFICATIONS
        // ============================================
        console.log("📬 Sending notifications...");

        // Get user's partners
        const partners = userData?.partners || [];

        if (Array.isArray(partners) && partners.length > 0) {
          for (const partnerId of partners) {
            await db.collection("notifications").add({
              userId: partnerId,
              type: "partner_lowman",
              actorId: userId,
              scoreId,
              courseId,
              read: false,
              createdAt: Timestamp.now(),
            });
          }

          console.log("✅ Sent notifications to", partners.length, "partners");
        }
      } else {
        console.log("ℹ️ Not a new lowman, no post/notifications created");
      }

      console.log("✅ Score processing complete");
    } catch (err) {
      console.error("🔥 onScoreCreated failed:", err);
    }
  }
);








