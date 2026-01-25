import { db } from "@/constants/firebaseConfig";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";

// ============================================================================
// TYPES
// ============================================================================

export type NotificationType =
  // Post interactions
  | "like"
  | "comment"
  | "comment_like"
  | "reply"
  | "mention_post"
  | "mention_comment"
  | "share"
  // Messaging
  | "message"
  | "group_message"  // ✅ NEW: Group chat messages
  | "message_request"
  // Follows & connections
  | "partner_request"
  | "partner_accepted"
  // Network activity
  | "partner_posted"
  | "partner_scored"        // Regular 18-hole round
  | "partner_lowman"        // Low leader achievement
  | "partner_holeinone"     // Hole in one

  // Hole-in-one verification
  | "holeinone_pending_poster"        // Poster: waiting for verification
  | "holeinone_verification_request"  // Verifier: needs to verify
  | "holeinone_verified"              // Poster: your hole-in-one was verified
  | "holeinone_denied"                // Poster: your hole-in-one was denied

  // Course memberships
  | "membership_submitted"            // User: membership request submitted
  | "membership_approved"             // User: membership was approved
  | "membership_rejected"             // User: membership was rejected

  // Clubhouse
  | "group_post"
  | "group_member"
  // System
  | "friend_suggestions"
  | "feature_update"
  | "locker_reminder"
  | "posting_reminder"
  // Achievements
  | "streak"
  | "trending";

interface NotificationActor {
  userId: string;
  displayName: string;
  avatar?: string;
}

interface CreateNotificationParams {
  userId: string;                    // Who receives it
  type: NotificationType;            // Type
  actorId?: string;                  // Who triggered it (optional for system notifications)
  postId?: string;                   // Optional: related post
  commentId?: string;                // Optional: related comment
  courseId?: number;                 // Optional: related course
  courseName?: string;               // Optional: course name
  scoreId?: string;                  // Optional: related score
  threadId?: string;                 // ✅ NEW: related thread (for messages)
  groupName?: string;                // ✅ NEW: group chat name (for group_message)
  regionKey?: string;                // Optional: region key for regional features
  rejectionReason?: string;          // Optional: rejection reason for memberships
  customMessage?: string;            // Optional: override default message
  customTitle?: string;              // Optional: custom title
}

// ============================================================================
// GROUPABLE NOTIFICATION TYPES
// ============================================================================

const GROUPABLE_TYPES: NotificationType[] = [
  "like",
  "comment",
  "comment_like",
  "message",
  "partner_scored",
  "partner_posted",
];

// Note: "group_message" is NOT in GROUPABLE_TYPES - each recipient gets individual notification

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================

const getMessageTemplate = async (
  type: NotificationType,
  actorName: string,
  courseId?: number,
  courseName?: string,
  rejectionReason?: string,
  groupName?: string  // ✅ NEW parameter
): Promise<string> => {
  switch (type) {
    // Post interactions
    case "like":
      return `${actorName} landed a dart on your Swing Thought`;
    case "comment":
      return `${actorName} weighed in on your Swing Thought`;
    case "comment_like":
      return `${actorName} landed a dart on your comment`;
    case "reply":
      return `${actorName} replied to your comment`;
    case "mention_post":
      return `${actorName} tagged you in a Swing Thought`;
    case "mention_comment":
      return `${actorName} tagged you in a comment`;
    case "share":
      return `${actorName} shared your Swing Thought`;

    // Messaging
    case "message":
      return `${actorName} left a note in your locker`;
    case "group_message":  // ✅ NEW
      return `${actorName} sent a message in ${groupName || "a group chat"}`;
    case "message_request":
      return `${actorName} wants to leave a note in your locker`;

    // Follows & connections
    case "partner_request":
      return `${actorName} wants to Partner Up`;
    case "partner_accepted":
      return `${actorName} has agreed to be your Partner`;

    // Network activity
    case "partner_posted":
      return `${actorName} has a new Swing Thought`;
    case "partner_scored":
      return `${actorName} logged a round`;
    case "partner_lowman": {
      if (courseId) {
        try {
          const courseDoc = await getDoc(doc(db, "course_leaders", courseId.toString()));
          if (courseDoc.exists()) {
            const fetchedCourseName = courseDoc.data()?.courseName || "a course";
            return `${actorName} became the low leader @${fetchedCourseName}`;
          }
        } catch (error) {
          console.error("Error fetching course name:", error);
        }
      }
      return `${actorName} became the low leader`;
    }
    case "partner_holeinone":
      return `${actorName} hit a hole in 1!`;

    // Hole-in-one verification
    case "holeinone_pending_poster":
      return `Your hole-in-one is pending verification from ${actorName}`;
    case "holeinone_verification_request":
      return `${actorName} needs you to verify their hole-in-one`;
    case "holeinone_verified":
      return `✅ ${actorName} verified your hole-in-one!`;
    case "holeinone_denied":
      return `❌ ${actorName} did not verify your hole-in-one submission`;

    // Course memberships
    case "membership_submitted":
      return `Your membership request for ${courseName || "a course"} has been submitted for review`;
    case "membership_approved":
      return `Your membership at ${courseName || "the course"} has been verified!`;
    case "membership_rejected":
      if (rejectionReason) {
        return `Your membership request for ${courseName || "the course"} was not approved. Reason: ${rejectionReason}`;
      }
      return `Your membership request for ${courseName || "the course"} was not approved`;

    // Clubhouse
    case "group_post":
      return `${actorName} posted in your clubhouse`;
    case "group_member":
      return "Your clubhouse has a new member";

    // System
    case "friend_suggestions":
      return "You may know these golfers";
    case "feature_update":
      return "New features have landed in Swing Thoughts";
    case "locker_reminder":
      return "You have unread notes in your locker";
    case "posting_reminder":
      return "Haven't had a Swing Thought in a while?";

    // Achievements
    case "streak":
      return "You're on par — nice consistency";
    case "trending":
      return "Your Swing Thought is trending in your area";

    default:
      return "You have a new notification";
  }
};

const getGroupedMessage = (
  type: NotificationType,
  actors: NotificationActor[],
  totalCount: number
): string => {
  if (actors.length === 0) return "";

  const firstName = actors[0].displayName;
  const remaining = totalCount - 1;

  switch (type) {
    case "like":
      if (remaining === 0) return `${firstName} landed a dart on your Swing Thought`;
      if (remaining === 1) return `${firstName} & 1 other landed a dart on your Swing Thought`;
      return `${firstName} & ${remaining} others landed a dart on your Swing Thought`;

    case "comment":
      if (remaining === 0) return `${firstName} weighed in on your Swing Thought`;
      if (remaining === 1) return `${firstName} & 1 other weighed in on your Swing Thought`;
      return `${firstName} & ${remaining} others weighed in on your Swing Thought`;

    case "comment_like":
      if (remaining === 0) return `${firstName} landed a dart on your comment`;
      if (remaining === 1) return `${firstName} & 1 other landed darts on your comment`;
      return `${firstName} & ${remaining} others landed darts on your comment`;

    case "message":
      if (remaining === 0) return `${firstName} left a note in your locker`;
      if (remaining === 1) return `${firstName} left 2 notes in your locker`;
      return `${firstName} left ${totalCount} notes in your locker`;

    case "partner_scored":
      if (remaining === 0) return `${firstName} logged a round`;
      if (remaining === 1) return `${firstName} & 1 other logged a round`;
      return `${firstName} & ${remaining} others logged a round`;

    case "partner_posted":
      if (remaining === 0) return `${firstName} has a new Swing Thought`;
      if (remaining === 1) return `${firstName} & 1 other have new Swing Thoughts`;
      return `${firstName} & ${remaining} others have new Swing Thoughts`;

    default:
      return firstName; // Placeholder, will be replaced by getMessageTemplate
  }
};

// ============================================================================
// HELPER: GET USER DATA
// ============================================================================

async function getUserData(userId: string): Promise<NotificationActor | null> {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) return null;

    const data = userDoc.data();
    return {
      userId,
      displayName: data.displayName || "Someone",
      avatar: data.avatar,
    };
  } catch (error) {
    console.error("Error fetching user data:", error);
    return null;
  }
}

// ============================================================================
// HELPER: CHECK IF NOTIFICATION EXISTS FOR GROUPING
// ============================================================================

async function findExistingGroupNotification(
  userId: string,
  groupKey: string
): Promise<{ id: string; data: any } | null> {
  try {
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      where("groupKey", "==", groupKey),
      where("read", "==", false),
      orderBy("updatedAt", "desc"),
      limit(1)
    );

    const snapshot = await getDocs(notificationsQuery);
    if (snapshot.empty) return null;

    const docSnap = snapshot.docs[0];
    return { id: docSnap.id, data: docSnap.data() };
  } catch (error: any) {
    if (error.code === "failed-precondition" || error.message?.includes("index")) {
      return null;
    }
    console.error("Error finding existing notification:", error);
    return null;
  }
}

// ============================================================================
// MAIN: CREATE NOTIFICATION
// ============================================================================

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const { 
    userId, 
    type, 
    actorId, 
    postId, 
    commentId, 
    courseId, 
    courseName, 
    scoreId,
    threadId,      // ✅ NEW
    groupName,     // ✅ NEW
    regionKey,
    rejectionReason, 
    customMessage,
    customTitle 
  } = params;

  // ✅ VALIDATE PARAMS - Prevent undefined errors
  if (!userId) {
    console.warn("⚠️ Skipping notification - missing userId", { userId, type });
    return;
  }

  // Skip if user is acting on their own content (except for system notifications)
  if (actorId && userId === actorId) return;

  try {
    // For system notifications (membership, etc.), actorId might not exist
    let actor: NotificationActor | null = null;
    if (actorId) {
      actor = await getUserData(actorId);
      if (!actor) return;
    }

    const shouldGroup = GROUPABLE_TYPES.includes(type);

    if (shouldGroup && actor) {
      // Determine groupKey based on notification type
      let groupKey: string;
      
      if (type === "message" && actorId) {
        // Group messages by sender (actorId)
        groupKey = `${type}_${actorId}`;
      } else if ((type === "partner_scored" || type === "partner_posted") && actorId) {
        // Group partner activity by actor
        groupKey = `${type}_${actorId}`;
      } else if (postId) {
        // Group post interactions (likes, comments) by postId
        groupKey = `${type}_${postId}`;
      } else if (commentId) {
        // Group comment interactions by commentId
        groupKey = `${type}_${commentId}`;
      } else {
        // Fallback to type only
        groupKey = type;
      }

      const existing = await findExistingGroupNotification(userId, groupKey);

      if (existing) {
        const existingActors = existing.data.actors || [];
        const existingCount = existing.data.actorCount || existingActors.length;

        const actorExists = existingActors.some(
          (a: NotificationActor) => a.userId === actorId
        );

        if (!actorExists) {
          const updatedActors = [actor, ...existingActors].slice(0, 6);
          const newCount = existingCount + 1;

          const updateData: any = {
            actors: updatedActors,
            actorCount: newCount,
            message: getGroupedMessage(type, updatedActors, newCount),
            updatedAt: serverTimestamp(),  // Use updatedAt for modifications
            read: false,
            lastActorId: actorId,
          };

          // For messages, keep the actorId to allow navigation
          if (type === "message" && actorId) {
            updateData.actorId = actorId;
            updateData.actorName = actor.displayName;
            updateData.actorAvatar = actor.avatar;
          }

          // ✅ Keep threadId if provided
          if (threadId) {
            updateData.threadId = threadId;
          }

          // Add regionKey if provided
          if (regionKey) {
            updateData.regionKey = regionKey;
          }

          await updateDoc(doc(db, "notifications", existing.id), updateData);
        } else {
          // Actor already in group, just bump timestamp
          await updateDoc(doc(db, "notifications", existing.id), {
            updatedAt: serverTimestamp(),  // Use updatedAt for modifications
            read: false,
          });
        }

        return;
      }

      // Create new grouped notification
      const expiresAt = Timestamp.fromDate(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      );

      const newNotification: any = {
        userId,
        type,
        read: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),  // Set both on creation
        expiresAt,
        groupKey,
        actors: [actor],
        actorCount: 1,
        lastActorId: actorId,
        message: getGroupedMessage(type, [actor], 1),
      };

      // Add type-specific fields
      if (postId) newNotification.postId = postId;
      if (commentId) newNotification.commentId = commentId;
      if (threadId) newNotification.threadId = threadId;  // ✅ NEW
      if (type === "message" && actorId) {
        newNotification.actorId = actorId;
        newNotification.actorName = actor.displayName;
        newNotification.actorAvatar = actor.avatar;
      }
      if (regionKey) newNotification.regionKey = regionKey;

      await addDoc(collection(db, "notifications"), newNotification);
    } else {
      // Non-grouped notification (includes group_message)
      const expiresAt = Timestamp.fromDate(
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      );

      const actorName = actor?.displayName || "System";
      const message = customMessage || await getMessageTemplate(type, actorName, courseId, courseName, rejectionReason, groupName);

      const notificationData: any = {
        userId,
        type,
        read: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),  // Set both on creation
        expiresAt,
        message,
      };

      // Add optional fields
      if (customTitle) notificationData.title = customTitle;
      if (actorId) {
        notificationData.actorId = actorId;
        notificationData.lastActorId = actorId;
      }
      if (actor?.displayName) notificationData.actorName = actor.displayName;
      if (actor?.avatar) notificationData.actorAvatar = actor.avatar;
      if (postId) notificationData.postId = postId;
      if (commentId) notificationData.commentId = commentId;
      if (courseId) notificationData.courseId = courseId;
      if (courseName) notificationData.courseName = courseName;
      if (scoreId) notificationData.scoreId = scoreId;
      if (threadId) notificationData.threadId = threadId;  // ✅ NEW
      if (regionKey) notificationData.regionKey = regionKey;
      if (rejectionReason) notificationData.rejectionReason = rejectionReason;

      await addDoc(collection(db, "notifications"), notificationData);
    }
  } catch (error) {
    console.error("Error creating notification:", error);
  }
}

// ============================================================================
// MARK AS READ
// ============================================================================

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, "notifications", notificationId), { 
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
  }
}

// ============================================================================
// MARK ALL AS READ
// ============================================================================

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  try {
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      where("read", "==", false)
    );

    const snapshot = await getDocs(notificationsQuery);
    const batch = writeBatch(db);

    snapshot.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, { 
        read: true,
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
  }
}

// ============================================================================
// DELETE NOTIFICATION
// ============================================================================

export async function deleteNotification(notificationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "notifications", notificationId));
  } catch (error) {
    console.error("Error deleting notification:", error);
  }
}

// ============================================================================
// CLEANUP EXPIRED NOTIFICATIONS
// ============================================================================

export async function cleanupExpiredNotifications(): Promise<void> {
  try {
    const now = Timestamp.now();
    const expiredQuery = query(
      collection(db, "notifications"),
      where("expiresAt", "<=", now)
    );

    const snapshot = await getDocs(expiredQuery);
    const batch = writeBatch(db);

    snapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    await batch.commit();
  } catch (error) {
    console.error("Error cleaning up expired notifications:", error);
  }
}