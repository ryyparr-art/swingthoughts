/**
 * Push Notifications
 * 
 * Firestore trigger that sends push notifications via Expo
 * when a notification document is created.
 */

import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

const db = getFirestore();
const expo = new Expo();

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

      // Count actual unread notifications for accurate badge
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
          threadId: notification.threadId,
          leagueId: notification.leagueId,
          roundId: notification.roundId,
          rivalryId: notification.rivalryId,
          changeType: notification.changeType,
        },
        badge: unreadCount,
      };

      // Customize title based on notification type
      switch (type) {
        case "like": pushMessage.title = "🎯 New Dart!"; break;
        case "comment_like": pushMessage.title = "🎯 Dart on Comment!"; break;
        case "comment": pushMessage.title = "💬 New Comment"; break;
        case "reply": pushMessage.title = "↩️ New Reply"; break;
        case "mention_post": pushMessage.title = "🏷️ You Were Tagged"; break;
        case "mention_comment": pushMessage.title = "🏷️ Tagged in Comment"; break;
        case "share": pushMessage.title = "🔄 Post Shared"; break;
        case "partner_request": pushMessage.title = "🤝 Partner Request"; break;
        case "partner_accepted": pushMessage.title = "✅ Partner Accepted"; break;
        case "partner_posted": pushMessage.title = "📝 New Swing Thought"; break;
        case "partner_scored": pushMessage.title = "⛳ Round Logged"; break;
        case "partner_lowman": pushMessage.title = "🏆 Low Leader!"; break;
        case "partner_holeinone": pushMessage.title = "🏌️ Hole in One!"; break;
        case "message": pushMessage.title = "📬 New Locker Note"; break;
        case "group_message": pushMessage.title = "👥 Group Message"; break;
        case "holeinone_pending_poster": pushMessage.title = "⏳ Awaiting Verification"; break;
        case "holeinone_verification_request": pushMessage.title = "✅ Verification Needed"; break;
        case "holeinone_verified": pushMessage.title = "🎉 Hole-in-One Verified!"; break;
        case "holeinone_denied": pushMessage.title = "❌ Verification Denied"; break;
        case "membership_submitted": pushMessage.title = "📋 Request Submitted"; break;
        case "membership_approved": pushMessage.title = "✅ Membership Approved"; break;
        case "membership_rejected": pushMessage.title = "❌ Membership Update"; break;
        case "commissioner_approved": pushMessage.title = "🏆 You're Approved!"; break;
        case "commissioner_rejected": pushMessage.title = "📋 Application Update"; break;
        // League Notifications
        case "league_invite": pushMessage.title = "📩 League Invite"; break;
        case "league_invite_sent": pushMessage.title = "📤 Invite Sent"; break;
        case "league_invite_accepted": pushMessage.title = "✅ Invite Accepted!"; break;
        case "league_invite_declined": pushMessage.title = "Invite Declined"; break;
        case "league_join_request": pushMessage.title = "👤 Join Request"; break;
        case "league_join_approved": pushMessage.title = "✅ Welcome to the League!"; break;
        case "league_join_rejected": pushMessage.title = "League Update"; break;
        case "league_removed": pushMessage.title = "League Update"; break;
        case "league_manager_invite": pushMessage.title = "🛡️ Manager Invite"; break;
        case "league_score_reminder": pushMessage.title = "⏰ Score Reminder"; break;
        case "league_score_posted": pushMessage.title = "⛳ League Score Posted"; break;
        case "league_score_dq": pushMessage.title = "🚫 Score Disqualified"; break;
        case "league_score_edited": pushMessage.title = "✏️ Score Updated"; break;
        case "league_score_reinstated": pushMessage.title = "↩️ Score Reinstated"; break;
        case "league_week_start": pushMessage.title = "🏌️ New Week Started!"; break;
        case "league_week_complete": pushMessage.title = "🏆 Week Complete!"; break;
        case "league_season_starting": pushMessage.title = "📅 Season Starting Soon!"; break;
        case "league_season_started": pushMessage.title = "🚀 Season Started!"; break;
        case "league_season_complete": pushMessage.title = "🏆 Season Champion!"; break;
        case "league_team_assigned": pushMessage.title = "👥 Team Assignment"; break;
        case "league_team_removed": pushMessage.title = "👥 Team Update"; break;
        case "league_matchup": pushMessage.title = "⚔️ Matchup Set!"; break;
        case "league_team_edit_approved": pushMessage.title = "✅ Team Edit Approved"; break;
        case "league_team_edit_rejected": pushMessage.title = "Team Edit Update"; break;
        case "league_team_edit_request": pushMessage.title = "✏️ Team Edit Request"; break;
        case "league_announcement": pushMessage.title = "📢 League Announcement"; break;
        // Challenge Notifications
        case "challenge_earned": pushMessage.title = "🏆 Badge Earned!"; break;
        case "challenge_tier": pushMessage.title = "⭐ Milestone Badge!"; break;
        case "challenge_progress": pushMessage.title = "📈 Challenge Update"; break;
        case "dtp_claimed": pushMessage.title = "🎯 Pin Claimed!"; break;
        case "dtp_lost": pushMessage.title = "🎯 Pin Beaten!"; break;
        // Round Notifications
        case "round_invite": pushMessage.title = "⛳ Live Round"; break;
        case "round_complete": pushMessage.title = "🏁 Round Complete"; break;
        case "round_notable": pushMessage.title = "⛳ Round Update"; break;
        // Outing & Rivalry Notifications
        case "outing_complete": pushMessage.title = "🏁 Outing Results"; break;
        case "rivalry_update": pushMessage.title = "⚔️ Rivalry Update"; break;
        default: pushMessage.title = "⛳ Swing Thoughts";
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