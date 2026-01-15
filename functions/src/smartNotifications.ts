/**
 * Smart Notification System (Firebase Functions v2)
 * 
 * This Cloud Function handles notification creation with intelligent grouping.
 * Instead of creating separate notifications for each action, it aggregates
 * similar notifications within a time window.
 * 
 * Grouping Rules:
 * - Messages from same user: "displayName sent you X messages"
 * - Multiple likes on same post: "displayName and X others liked your thought"
 * - Multiple comments on same post: "displayName and X others commented on your thought"
 * - Partner requests: Always individual (important action)
 * - Mentions: Always individual (need to see each one)
 * 
 * Deploy: firebase deploy --only functions:createSmartNotification
 */

import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

const db = admin.firestore();

// Time window for grouping (in milliseconds)
const GROUPING_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Notification types that should be grouped
const GROUPABLE_TYPES = {
  // Group by: postId (same post, multiple actors)
  POST_GROUPED: ["like", "comment", "share"],
  
  // Group by: actorId (same person, multiple actions)
  ACTOR_GROUPED: ["message"],
  
  // Never group (always create individual)
  INDIVIDUAL: [
    "partner_request",
    "partner_accepted", 
    "mention_post",
    "mention_comment",
    "partner_posted",
    "partner_scored",
    "partner_lowman",
    "partner_holeinone",
    "holeinone_verification_request",
    "holeinone_verified",
    "holeinone_denied",
    "trending",
    "system",
  ],
};

interface NotificationData {
  userId: string;           // Recipient
  type: string;             // Notification type
  actorId: string;          // Person who triggered the notification
  actorName: string;        // Display name
  actorAvatar?: string;     // Avatar URL
  postId?: string;          // Related post (for likes, comments)
  commentId?: string;       // Related comment
  scoreId?: string;         // Related score
  courseId?: number;        // Related course
  messagePreview?: string;  // Preview text for messages
}

interface NotificationActor {
  userId: string;
  displayName: string;
  avatar?: string;
  timestamp: admin.firestore.Timestamp;
}

interface GroupedNotification {
  id: string;
  userId: string;
  type: string;
  read: boolean;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  message: string;
  
  // Grouping fields
  actors: NotificationActor[];
  actorCount: number;
  
  // For backward compatibility
  actorId: string;
  actorName: string;
  actorAvatar?: string;
  
  // Related content
  postId?: string;
  commentId?: string;
  scoreId?: string;
  courseId?: number;
  
  // Grouping metadata
  groupKey: string;
  lastActorId: string;
}

/**
 * Generate a group key for finding existing notifications to update
 */
function generateGroupKey(data: NotificationData): string {
  const { type, userId, postId, actorId } = data;
  
  // Post-grouped types: same recipient + same post + same type
  if (GROUPABLE_TYPES.POST_GROUPED.includes(type)) {
    return `${userId}:${type}:post:${postId}`;
  }
  
  // Actor-grouped types: same recipient + same actor + same type
  if (GROUPABLE_TYPES.ACTOR_GROUPED.includes(type)) {
    return `${userId}:${type}:actor:${actorId}`;
  }
  
  // Individual types: unique key (won't match anything)
  return `${userId}:${type}:${Date.now()}:${Math.random()}`;
}

/**
 * Generate human-readable notification message
 */
function generateMessage(
  type: string,
  actorName: string,
  actorCount: number,
  _messagePreview?: string
): string {
  const othersCount = actorCount - 1;
  const othersText = othersCount === 1 ? "1 other" : `${othersCount} others`;
  
  switch (type) {
    // Post interactions
    case "like":
      if (actorCount === 1) {
        return `${actorName} landed a dart on your swing thought 🎯`;
      }
      return `${actorName} and ${othersText} landed darts on your swing thought 🎯`;
    
    case "comment":
      if (actorCount === 1) {
        return `${actorName} commented on your swing thought 💬`;
      }
      return `${actorName} and ${othersText} commented on your swing thought 💬`;
    
    case "share":
      if (actorCount === 1) {
        return `${actorName} shared your swing thought`;
      }
      return `${actorName} and ${othersText} shared your swing thought`;
    
    // Messages
    case "message":
      if (actorCount === 1) {
        return `${actorName} left you a note in your locker 📝`;
      }
      return `${actorName} left you ${actorCount} notes in your locker 📝`;
    
    // Partner interactions (always individual but included for completeness)
    case "partner_request":
      return `${actorName} wants to be your partner ⛳`;
    
    case "partner_accepted":
      return `${actorName} is now your partner! 🤝`;
    
    case "partner_posted":
      return `${actorName} shared a new swing thought`;
    
    case "partner_scored":
      return `${actorName} posted a new score`;
    
    case "partner_lowman":
      return `${actorName} is the new low leader! 🏆`;
    
    case "partner_holeinone":
      return `${actorName} made a hole-in-one! 🦅`;
    
    // Mentions
    case "mention_post":
      return `${actorName} mentioned you in a swing thought`;
    
    case "mention_comment":
      return `${actorName} mentioned you in a comment`;
    
    // Trending
    case "trending":
      return `Your swing thought is trending! 🔥`;
    
    // Hole-in-one verification
    case "holeinone_verification_request":
      return `${actorName} needs you to verify their hole-in-one 🏌️`;
    
    case "holeinone_verified":
      return `Your hole-in-one has been verified! 🎉`;
    
    case "holeinone_denied":
      return `Your hole-in-one verification was not approved`;
    
    default:
      return `${actorName} interacted with you`;
  }
}

/**
 * Internal helper to create or update notifications
 */
async function createNotificationInternal(data: NotificationData): Promise<{
  success: boolean;
  action?: string;
  notificationId?: string;
  actorCount?: number;
  skipped?: boolean;
  reason?: string;
}> {
  const {
    userId,
    type,
    actorId,
    actorName,
    actorAvatar,
    postId,
    commentId,
    scoreId,
    courseId,
    messagePreview,
  } = data;
  
  // Don't notify yourself
  if (userId === actorId) {
    return { success: true, skipped: true, reason: "self-action" };
  }
  
  const groupKey = generateGroupKey(data);
  const now = admin.firestore.Timestamp.now();
  const windowStart = new Date(Date.now() - GROUPING_WINDOW_MS);
  
  try {
    // Check for existing notification to update
    const existingQuery = await db
      .collection("notifications")
      .where("userId", "==", userId)
      .where("groupKey", "==", groupKey)
      .where("read", "==", false) // Only group unread notifications
      .where("updatedAt", ">", admin.firestore.Timestamp.fromDate(windowStart))
      .limit(1)
      .get();
    
    if (!existingQuery.empty) {
      // UPDATE existing notification
      const existingDoc = existingQuery.docs[0];
      const existingData = existingDoc.data() as GroupedNotification;
      
      // Check if this actor already exists in the notification
      const actorExists = existingData.actors?.some(a => a.userId === actorId);
      
      let newActors = existingData.actors || [];
      let newActorCount = existingData.actorCount || 1;
      
      if (!actorExists) {
        // Add new actor to the list (keep max 10 for display)
        newActors = [
          {
            userId: actorId,
            displayName: actorName,
            avatar: actorAvatar,
            timestamp: now,
          },
          ...newActors.slice(0, 9),
        ];
        newActorCount = newActorCount + 1;
      } else if (GROUPABLE_TYPES.ACTOR_GROUPED.includes(type)) {
        // For actor-grouped (messages), increment count even if same actor
        newActorCount = newActorCount + 1;
      }
      
      // Generate updated message
      const message = generateMessage(type, actorName, newActorCount, messagePreview);
      
      await existingDoc.ref.update({
        actors: newActors,
        actorCount: newActorCount,
        actorId: actorId, // Most recent actor
        actorName: actorName,
        actorAvatar: actorAvatar || null,
        lastActorId: actorId,
        message: message,
        updatedAt: now,
        read: false, // Reset to unread on new activity
      });
      
      console.log(`✅ Updated notification ${existingDoc.id} (${newActorCount} actors)`);
      
      return {
        success: true,
        action: "updated",
        notificationId: existingDoc.id,
        actorCount: newActorCount,
      };
    } else {
      // CREATE new notification
      const message = generateMessage(type, actorName, 1, messagePreview);
      
      const newNotification: Record<string, any> = {
        userId,
        type,
        read: false,
        createdAt: now,
        updatedAt: now,
        message,
        
        // Grouping fields
        actors: [
          {
            userId: actorId,
            displayName: actorName,
            avatar: actorAvatar || null,
            timestamp: now,
          },
        ],
        actorCount: 1,
        
        // Backward compatibility
        actorId,
        actorName,
        
        // Grouping metadata
        groupKey,
        lastActorId: actorId,
      };
      
      // Add optional fields only if they exist
      if (actorAvatar) newNotification.actorAvatar = actorAvatar;
      if (postId) newNotification.postId = postId;
      if (commentId) newNotification.commentId = commentId;
      if (scoreId) newNotification.scoreId = scoreId;
      if (courseId) newNotification.courseId = courseId;
      
      const docRef = await db.collection("notifications").add(newNotification);
      
      console.log(`✅ Created notification ${docRef.id}`);
      
      return {
        success: true,
        action: "created",
        notificationId: docRef.id,
        actorCount: 1,
      };
    }
  } catch (error) {
    console.error("❌ Error creating notification:", error);
    throw error;
  }
}

/**
 * Main Cloud Function: Create or update a smart notification (callable)
 */
export const createSmartNotification = onCall(
  { region: "us-central1" },
  async (request) => {
    // Validate auth
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Must be authenticated to create notifications"
      );
    }
    
    const data = request.data as NotificationData;
    
    try {
      return await createNotificationInternal(data);
    } catch (error) {
      console.error("❌ Error in createSmartNotification:", error);
      throw new HttpsError("internal", "Failed to create notification");
    }
  }
);

/**
 * Firestore Trigger: When a like is added, create notification
 */
export const onLikeCreated = onDocumentCreated(
  "thoughts/{thoughtId}/likes/{likeId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    
    const thoughtId = event.params.thoughtId;
    const likeData = snapshot.data();
    
    // Get the post to find the owner
    const postDoc = await db.collection("thoughts").doc(thoughtId).get();
    if (!postDoc.exists) return;
    
    const postData = postDoc.data();
    if (!postData) return;
    
    // Don't notify if liking own post
    if (postData.userId === likeData.userId) return;
    
    // Get liker's info
    const likerDoc = await db.collection("users").doc(likeData.userId).get();
    const likerData = likerDoc.data();
    
    // Create smart notification
    await createNotificationInternal({
      userId: postData.userId,
      type: "like",
      actorId: likeData.userId,
      actorName: likerData?.displayName || "Someone",
      actorAvatar: likerData?.avatar,
      postId: thoughtId,
    });
  }
);

/**
 * Firestore Trigger: When a comment is added, create notification
 */
export const onCommentCreated = onDocumentCreated(
  "thoughts/{thoughtId}/comments/{commentId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    
    const thoughtId = event.params.thoughtId;
    const commentId = event.params.commentId;
    const commentData = snapshot.data();
    
    // Get the post to find the owner
    const postDoc = await db.collection("thoughts").doc(thoughtId).get();
    if (!postDoc.exists) return;
    
    const postData = postDoc.data();
    if (!postData) return;
    
    // Don't notify if commenting on own post
    if (postData.userId === commentData.userId) return;
    
    // Get commenter's info
    const commenterDoc = await db.collection("users").doc(commentData.userId).get();
    const commenterData = commenterDoc.data();
    
    // Create smart notification
    await createNotificationInternal({
      userId: postData.userId,
      type: "comment",
      actorId: commentData.userId,
      actorName: commenterData?.displayName || "Someone",
      actorAvatar: commenterData?.avatar,
      postId: thoughtId,
      commentId: commentId,
    });
  }
);

/**
 * Firestore Trigger: When a message is sent, create notification
 */
export const onMessageCreated = onDocumentCreated(
  "conversations/{conversationId}/messages/{messageId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    
    const conversationId = event.params.conversationId;
    const messageData = snapshot.data();
    
    // Get conversation to find recipient
    const convDoc = await db.collection("conversations").doc(conversationId).get();
    if (!convDoc.exists) return;
    
    const convData = convDoc.data();
    if (!convData) return;
    
    // Find recipient (the other participant)
    const recipientId = convData.participants?.find(
      (p: string) => p !== messageData.senderId
    );
    
    if (!recipientId) return;
    
    // Get sender's info
    const senderDoc = await db.collection("users").doc(messageData.senderId).get();
    const senderData = senderDoc.data();
    
    // Create smart notification
    await createNotificationInternal({
      userId: recipientId,
      type: "message",
      actorId: messageData.senderId,
      actorName: senderData?.displayName || "Someone",
      actorAvatar: senderData?.avatar,
      messagePreview: messageData.text?.substring(0, 50),
    });
  }
);

/**
 * Scheduled cleanup: Remove old notifications (older than 30 days)
 */
export const cleanupOldNotifications = onSchedule(
  {
    schedule: "every 24 hours",
    region: "us-central1",
  },
  async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const oldNotifications = await db
      .collection("notifications")
      .where("createdAt", "<", admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
      .where("read", "==", true)
      .limit(500)
      .get();
    
    const batch = db.batch();
    oldNotifications.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`🧹 Cleaned up ${oldNotifications.size} old notifications`);
  }
);