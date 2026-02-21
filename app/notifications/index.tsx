import { auth, db } from "@/constants/firebaseConfig";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import { markNotificationAsRead } from "@/utils/notificationHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface NotificationActor {
  userId: string;
  displayName: string;
  avatar?: string;
  timestamp?: any;
}

interface Notification {
  id: string;
  userId: string;
  type: string;
  read: boolean;
  archived?: boolean;
  archivedAt?: any;
  createdAt: any;
  updatedAt?: any;
  message: string;
  
  // Grouped notifications
  actors?: NotificationActor[];
  actorCount?: number;
  
  // Single actor (backward compatibility)
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
  
  // Related content
  postId?: string;
  commentId?: string;
  courseId?: number;
  scoreId?: string;
  threadId?: string;        // For group message notifications
  leagueId?: string;        // For league notifications
  inviteId?: string;        // For league invite notifications

  // Navigation
  navigationTarget?: string;
  navigationUserId?: string;
  navigationTab?: string;

  // Grouping
  groupKey?: string;
  lastActorId?: string;
}

interface GroupedNotifications {
  title: string;
  data: Notification[];
}

// Icon mapping for notification types
type NotificationIconConfig = {
  icon?: string;
  image?: any;
  color: string;
};

const NOTIFICATION_ICONS: Record<string, NotificationIconConfig> = {
  // Post interactions
  like: { image: require("@/assets/icons/Throw Darts.png"), color: "#FF3B30" },
  comment: { image: require("@/assets/icons/Comments.png"), color: "#FFD700" },
  comment_like: { image: require("@/assets/icons/Throw Darts.png"), color: "#FF3B30" },
  reply: { image: require("@/assets/icons/Comments.png"), color: "#FFD700" },
  share: { icon: "share-social", color: "#5856D6" },
  poll_vote: { icon: "stats-chart", color: "#7C3AED" },

  // Mentions
  mention_post: { image: require("@/assets/icons/Clubhouse.png"), color: "#5856D6" },
  mention_comment: { image: require("@/assets/icons/Comments.png"), color: "#FFD700" },
  
  // Messages
  message: { image: require("@/assets/icons/Mail.png"), color: "#0D5C3A" },
  group_message: { icon: "people", color: "#0D5C3A" },
  
  // Partner activities
  partner_request: { icon: "person-add", color: "#FFD700" },
  partner_accepted: { icon: "people", color: "#34C759" },
  partner_posted: { image: require("@/assets/icons/Clubhouse.png"), color: "#0D5C3A" },
  partner_scored: { icon: "flag", color: "#FF9500" },
  partner_lowman: { image: require("@/assets/icons/LowLeaderTrophy.png"), color: "#FFD700" },
  partner_holeinone: { image: require("@/assets/icons/LowLeaderAce.png"), color: "#FF3B30" },
  
  // Trending
  trending: { icon: "flame", color: "#FF9500" },
  
  // Hole-in-one verification
  holeinone_pending_poster: { icon: "time", color: "#FF9500" },
  holeinone_verification_request: { icon: "hourglass", color: "#FFD700" },
  holeinone_verified: { icon: "ribbon", color: "#34C759" },
  holeinone_denied: { icon: "close-circle", color: "#FF3B30" },
  
  // Membership
  membership_submitted: { icon: "document-text", color: "#007AFF" },
  membership_approved: { icon: "checkmark-circle", color: "#34C759" },
  membership_rejected: { icon: "close-circle", color: "#FF3B30" },

  // ==========================================
  // COMMISSIONER APPLICATIONS
  // ==========================================
  commissioner_approved: { icon: "trophy", color: "#4CAF50" },
  commissioner_rejected: { icon: "close-circle", color: "#F44336" },

  // ==========================================
  // LEAGUE NOTIFICATIONS
  // ==========================================
  
  // League - Membership & Invites
  league_invite: { icon: "mail", color: "#0D5C3A" },
  league_join_request: { icon: "person-add", color: "#2196F3" },
  league_join_approved: { icon: "checkmark-circle", color: "#4CAF50" },
  league_join_rejected: { icon: "close-circle", color: "#F44336" },
  league_removed: { icon: "person-remove", color: "#F44336" },
  league_manager_invite: { icon: "shield", color: "#9C27B0" },
  league_invite_sent: { icon: "paper-plane", color: "#2196F3" },
  league_invite_accepted: { icon: "checkmark-circle", color: "#4CAF50" },
  league_invite_declined: { icon: "close-circle", color: "#F44336" },

  // League - Scores & Gameplay
  league_score_reminder: { icon: "alarm", color: "#FF9800" },
  league_score_posted: { icon: "golf", color: "#0D5C3A" },
  league_score_dq: { icon: "ban", color: "#F44336" },
  league_score_edited: { icon: "create", color: "#2196F3" },
  league_score_reinstated: { icon: "refresh-circle", color: "#4CAF50" },

  // League - Weekly Cycle
  league_week_start: { icon: "flag", color: "#0D5C3A" },
  league_week_complete: { icon: "trophy", color: "#FFD700" },

  // League - Season Events
  league_season_starting: { icon: "calendar", color: "#2196F3" },
  league_season_started: { icon: "play-circle", color: "#4CAF50" },
  league_season_complete: { icon: "ribbon", color: "#FFD700" },

  // League - Teams (2v2)
  league_team_assigned: { icon: "people", color: "#0D5C3A" },
  league_team_removed: { icon: "people", color: "#F44336" },
  league_matchup: { icon: "git-compare", color: "#9C27B0" },
  league_team_edit_approved: { icon: "checkmark-circle", color: "#4CAF50" },
  league_team_edit_rejected: { icon: "close-circle", color: "#F44336" },
  league_team_edit_request: { icon: "create", color: "#FF9800" },

  // League - Announcements
  league_announcement: { icon: "megaphone", color: "#0D5C3A" },

  // ==========================================
  // CHALLENGE NOTIFICATIONS
  // ==========================================
  challenge_earned: { icon: "trophy", color: "#FFD700" },
  challenge_tier: { icon: "star", color: "#FFD700" },
  challenge_progress: { icon: "flag", color: "#0D5C3A" },
  dtp_claimed: { icon: "location", color: "#D32F2F" },
  dtp_lost: { icon: "location", color: "#D32F2F" },
  
  // System
  system: { icon: "information-circle", color: "#8E8E93" },
};

// Helper to get timestamp in milliseconds for sorting
const getTimestampMs = (timestamp: any): number => {
  if (!timestamp) return 0;
  
  // Firestore Timestamp (has toMillis method)
  if (timestamp?.toMillis && typeof timestamp.toMillis === 'function') {
    return timestamp.toMillis();
  }
  
  // Firestore Timestamp from REST/cache (has seconds)
  if (timestamp?.seconds !== undefined) {
    return timestamp.seconds * 1000;
  }
  
  // Unix timestamp (number)
  if (typeof timestamp === 'number') {
    return timestamp;
  }
  
  // Date object
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }
  
  // ISO string
  if (typeof timestamp === 'string') {
    return new Date(timestamp).getTime();
  }
  
  return 0;
};

// Sort notifications by updatedAt (if exists) or createdAt, descending
const sortNotifications = (notifications: Notification[]): Notification[] => {
  return notifications.sort((a, b) => {
    const aTime = getTimestampMs(a.updatedAt) || getTimestampMs(a.createdAt);
    const bTime = getTimestampMs(b.updatedAt) || getTimestampMs(b.createdAt);
    return bTime - aTime; // Descending (newest first)
  });
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { getCache, setCache } = useCache();
  
  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showingCached, setShowingCached] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Archive modal state
  const [showArchivedModal, setShowArchivedModal] = useState(false);

  // Filter to get active (non-archived) notifications
  const activeNotifications = allNotifications.filter(n => !n.archived);
  const archivedNotifications = allNotifications.filter(n => n.archived);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    let unsubscribe: (() => void) | undefined;

    const loadNotificationsWithCache = async () => {
      try {
        // Step 1: Try to load from cache (instant)
        const cached = await getCache(CACHE_KEYS.NOTIFICATIONS(uid));
        
        if (cached) {
          console.log("⚡ Using cached notifications");
          setAllNotifications(cached);
          setShowingCached(true);
          setLoading(false);
        }

        // Step 2: Set up real-time listener (always)
        // ✅ FIX: Removed orderBy("updatedAt") - sort in JS to include docs with only createdAt
        const notificationsQuery = query(
          collection(db, "notifications"),
          where("userId", "==", uid)
        );

        unsubscribe = onSnapshot(
          notificationsQuery,
          async (snapshot) => {
            const notificationsList: Notification[] = [];
            
            snapshot.forEach((doc) => {
              notificationsList.push({
                id: doc.id,
                ...doc.data(),
              } as Notification);
            });

            // ✅ FIX: Sort in JS using updatedAt || createdAt
            const sortedNotifications = sortNotifications(notificationsList);

            setAllNotifications(sortedNotifications);

            // Step 3: Update cache
            await setCache(CACHE_KEYS.NOTIFICATIONS(uid), sortedNotifications);
            console.log("✅ Notifications cached:", sortedNotifications.length);

            setShowingCached(false);
            setLoading(false);
            setRefreshing(false);
          },
          (error) => {
            console.error("Error fetching notifications:", error);
            soundPlayer.play('error');
            setShowingCached(false);
            setLoading(false);
            setRefreshing(false);
          }
        );
      } catch (error) {
        console.error("❌ Notifications cache error:", error);
        setLoading(false);
      }
    };

    loadNotificationsWithCache();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const handleRefresh = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setRefreshing(true);
    setShowingCached(false);

    try {
      // ✅ FIX: Removed orderBy("updatedAt") - sort in JS to include docs with only createdAt
      const notificationsQuery = query(
        collection(db, "notifications"),
        where("userId", "==", uid)
      );

      const snapshot = await getDocs(notificationsQuery);
      const notificationsList: Notification[] = [];
      
      snapshot.forEach((doc) => {
        notificationsList.push({
          id: doc.id,
          ...doc.data(),
        } as Notification);
      });

      // ✅ FIX: Sort in JS using updatedAt || createdAt
      const sortedNotifications = sortNotifications(notificationsList);

      setAllNotifications(sortedNotifications);
      await setCache(CACHE_KEYS.NOTIFICATIONS(uid), sortedNotifications);
    } catch (error) {
      console.error("Error refreshing notifications:", error);
      soundPlayer.play('error');
    }

    setRefreshing(false);
  };

  // Archive all active notifications (Clear All)
  const handleClearAll = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      const batch = writeBatch(db);
      const now = serverTimestamp();
      
      // Archive all non-archived notifications
      activeNotifications.forEach((notification) => {
        const notifRef = doc(db, "notifications", notification.id);
        batch.update(notifRef, {
          archived: true,
          archivedAt: now,
          read: true, // Also mark as read
        });
      });
      
      await batch.commit();
      soundPlayer.play('postThought');
      
      // Update local state
      const updatedNotifications = allNotifications.map(n => 
        !n.archived ? { ...n, archived: true, read: true } : n
      );
      setAllNotifications(updatedNotifications);
      await setCache(CACHE_KEYS.NOTIFICATIONS(uid), updatedNotifications);
      
      console.log("✅ All notifications archived");
    } catch (error) {
      console.error("Error archiving notifications:", error);
      soundPlayer.play('error');
    }
  };

  // Restore a single archived notification
  const handleRestoreNotification = async (notificationId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      const notifRef = doc(db, "notifications", notificationId);
      const batch = writeBatch(db);
      batch.update(notifRef, {
        archived: false,
        archivedAt: null,
      });
      await batch.commit();
      
      // Update local state
      const updatedNotifications = allNotifications.map(n => 
        n.id === notificationId ? { ...n, archived: false, archivedAt: null } : n
      );
      setAllNotifications(updatedNotifications);
      await setCache(CACHE_KEYS.NOTIFICATIONS(uid), updatedNotifications);
    } catch (error) {
      console.error("Error restoring notification:", error);
      soundPlayer.play('error');
    }
  };

  const handleNotificationTap = async (notification: Notification) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Mark as read
    if (!notification.read) {
      await markNotificationAsRead(notification.id);
      
      const uid = auth.currentUser?.uid;
      if (uid) {
        const updatedNotifications = allNotifications.map(n => 
          n.id === notification.id ? { ...n, read: true } : n
        );
        setAllNotifications(updatedNotifications);
        await setCache(CACHE_KEYS.NOTIFICATIONS(uid), updatedNotifications);
      }
    }

    // Close archived modal if open
    if (showArchivedModal) {
      setShowArchivedModal(false);
    }

    // Navigate based on type
    switch (notification.type) {
      case "like":
      case "comment":
      case "comment_like":
      case "reply":
      case "share":
      case "mention_post":
      case "mention_comment":
      case "partner_posted":
      case "trending":
        if (notification.postId) {
          router.push({
            pathname: "/clubhouse",
            params: { highlightPostId: notification.postId },
          });
        }
        break;
        
      case "poll_vote":
        if (notification.postId) {
          router.push({
            pathname: "/clubhouse",
            params: { highlightPostId: notification.postId },
        });
      }
      break;

      case "partner_scored":
        const scoredActorId = notification.navigationUserId || notification.actorId;
        if (scoredActorId) {
          router.push(`/profile/${scoredActorId}?tab=rounds`);
        }
        break;

      case "partner_holeinone":
      case "holeinone_verified":
      case "holeinone_pending_poster":
        if (notification.postId) {
          router.push({
            pathname: "/clubhouse",
            params: { highlightPostId: notification.postId },
          });
        } else if (notification.scoreId) {
          router.push({
            pathname: "/clubhouse",
            params: { highlightScoreId: notification.scoreId },
          });
        } else {
          router.push("/clubhouse");
        }
        break;

      case "partner_lowman":
        if (notification.courseId && notification.actorId) {
          router.push({
            pathname: "/leaderboard",
            params: {
              highlightCourseId: notification.courseId.toString(),
              highlightUserId: notification.actorId,
            },
          });
        }
        break;

      case "holeinone_verification_request":
        if (notification.scoreId) {
          router.push(`/verify-holeinone/${notification.scoreId}`);
        }
        break;

      case "holeinone_denied":
        router.push(`/locker/${auth.currentUser?.uid}`);
        break;

      case "partner_request":
      case "partner_accepted":
        const actorId = notification.lastActorId || notification.actorId;
        if (actorId) {
          router.push(`/locker/${actorId}`);
        }
        break;

      // Handle both 1:1 and group messages
      case "message":
      case "group_message":
        // If threadId is provided directly (group chats or new 1:1 notifications)
        if (notification.threadId) {
          router.push(`/messages/${notification.threadId}`);
        } else {
          // Fallback: construct deterministic ID for legacy 1:1 notifications
          const messageActorId = notification.lastActorId || notification.actorId;
          const currentUserId = auth.currentUser?.uid;

          if (messageActorId && currentUserId) {
            const threadId = [currentUserId, messageActorId].sort().join("_");
            router.push(`/messages/${threadId}`);
          }
        }
        break;

      case "membership_submitted":
      case "membership_approved":
      case "membership_rejected":
        if (notification.courseId) {
          router.push(`/locker/course/${notification.courseId}`);
        }
        break;

      // ==========================================
      // COMMISSIONER APPLICATION NOTIFICATIONS
      // ==========================================
      case "commissioner_approved":
        // Navigate to create league page
        router.push("/leagues/create" as any);
        break;

      case "commissioner_rejected":
        // Navigate to explore leagues (can re-apply)
        router.push("/leagues/explore" as any);
        break;

      // ==========================================
      // LEAGUE NOTIFICATIONS
      // ==========================================

      // League invite (invitee receives) → League detail page to accept/decline
      case "league_invite":
        if (notification.leagueId) {
          router.push(`/leagues/${notification.leagueId}` as any);
        }
        break;

      // League invite sent (commissioner sees someone invited a user) → League Home
      case "league_invite_sent":
        if (notification.leagueId) {
          router.push({
            pathname: "/leagues/home" as any,
            params: { leagueId: notification.leagueId },
          });
        }
        break;

      // League invite accepted (inviter sees their invite was accepted) → League Home
      case "league_invite_accepted":
        if (notification.leagueId) {
          router.push({
            pathname: "/leagues/home" as any,
            params: { leagueId: notification.leagueId },
          });
        }
        break;

      // League invite declined (inviter sees their invite was declined) → League Explore
      case "league_invite_declined":
        router.push("/leagues/explore" as any);
        break;

      // Join request → League Settings > Members tab (for commissioners)
      case "league_join_request":
        if (notification.leagueId) {
          router.push({
            pathname: "/leagues/settings" as any,
            params: { leagueId: notification.leagueId, tab: "members" },
          });
        }
        break;

      // Approved/Team assigned/Announcements → League Home
      case "league_join_approved":
      case "league_team_assigned":
      case "league_team_removed":
      case "league_team_edit_approved":
      case "league_team_edit_rejected":
      case "league_announcement":
        if (notification.leagueId) {
          router.push({
            pathname: "/leagues/home" as any,
            params: { leagueId: notification.leagueId },
          });
        }
        break;

      // Rejected → League Explore
      case "league_join_rejected":
        router.push("/leagues/explore" as any);
        break;

      // Removed → Just dismiss (no navigation needed)
      case "league_removed":
        // No navigation, just mark as read
        break;

      // Manager invite → League Settings
      case "league_manager_invite":
        if (notification.leagueId) {
          router.push({
            pathname: "/leagues/settings" as any,
            params: { leagueId: notification.leagueId },
          });
        }
        break;

      // Score reminder → Post Score page
      case "league_score_reminder":
        if (notification.leagueId) {
          router.push({
            pathname: "/leagues/post-score" as any,
            params: { leagueId: notification.leagueId },
          });
        }
        break;

      // Score/standings related → League Standings
      case "league_score_posted":
      case "league_score_dq":
      case "league_score_edited":
      case "league_score_reinstated":
      case "league_week_complete":
      case "league_season_complete":
        if (notification.leagueId) {
          router.push({
            pathname: "/leagues/standings" as any,
            params: { leagueId: notification.leagueId },
          });
        }
        break;

      // Week start / Matchup → League Schedule
      case "league_week_start":
      case "league_matchup":
        if (notification.leagueId) {
          router.push({
            pathname: "/leagues/schedule" as any,
            params: { leagueId: notification.leagueId },
          });
        }
        break;

      // Season starting/started → League Home
      case "league_season_starting":
      case "league_season_started":
        if (notification.leagueId) {
          router.push({
            pathname: "/leagues/home" as any,
            params: { leagueId: notification.leagueId },
          });
        }
        break;

      // Team edit request → League Settings > Teams tab (for commissioners)
      case "league_team_edit_request":
        if (notification.leagueId) {
          router.push({
            pathname: "/leagues/settings" as any,
            params: { leagueId: notification.leagueId, tab: "teams" },
          });
        }
        break;

      // ==========================================
      // CHALLENGE NOTIFICATIONS
      // ==========================================
      case "challenge_earned":
      case "challenge_tier":
      case "challenge_progress":
      case "dtp_claimed":
      case "dtp_lost":
        router.push("/events" as any);
        break;
      
      case "round_complete":
        const myUid = auth.currentUser?.uid;
        if (myUid) {
          router.push(`/profile/${myUid}?tab=rounds`);
        }
        break;

      default:
        console.log("⚠️ Unhandled notification type:", notification.type);
        break;
    }
  };

  // Helper to safely convert any timestamp format to a Date
  const getDateFromTimestamp = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    
    // Firestore Timestamp (has toDate method)
    if (timestamp?.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    
    // Already a Date object
    if (timestamp instanceof Date) {
      return timestamp;
    }
    
    // Firestore Timestamp from REST/cache (has seconds and nanoseconds)
    if (timestamp?.seconds !== undefined) {
      return new Date(timestamp.seconds * 1000);
    }
    
    // Unix timestamp (number)
    if (typeof timestamp === 'number') {
      return new Date(timestamp);
    }
    
    // ISO string
    if (typeof timestamp === 'string') {
      return new Date(timestamp);
    }
    
    return null;
  };

  const groupNotificationsByDate = (notifications: Notification[]): GroupedNotifications[] => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);

    const todayNotifs: Notification[] = [];
    const yesterdayNotifs: Notification[] = [];
    const thisWeekNotifs: Notification[] = [];
    const olderNotifs: Notification[] = [];

    notifications.forEach((notif) => {
      const date = getDateFromTimestamp(notif.updatedAt || notif.createdAt);
      if (!date) return;

      if (date >= today) {
        todayNotifs.push(notif);
      } else if (date >= yesterday) {
        yesterdayNotifs.push(notif);
      } else if (date >= thisWeek) {
        thisWeekNotifs.push(notif);
      } else {
        olderNotifs.push(notif);
      }
    });

    const grouped: GroupedNotifications[] = [];
    if (todayNotifs.length > 0) grouped.push({ title: "Today", data: todayNotifs });
    if (yesterdayNotifs.length > 0) grouped.push({ title: "Yesterday", data: yesterdayNotifs });
    if (thisWeekNotifs.length > 0) grouped.push({ title: "This Week", data: thisWeekNotifs });
    if (olderNotifs.length > 0) grouped.push({ title: "Older", data: olderNotifs });

    return grouped;
  };

  const formatTimeAgo = (timestamp: any): string => {
    const date = getDateFromTimestamp(timestamp);
    if (!date) return "";
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const renderAvatarStack = (notification: Notification) => {
    const actors = notification.actors || [];
    const actorCount = notification.actorCount || 1;
    
    if (actors.length > 1) {
      const displayActors = actors.slice(0, 3);
      
      return (
        <View style={styles.avatarStack}>
          {displayActors.map((actor, index) => (
            <View
              key={actor.userId}
              style={[
                styles.stackedAvatarContainer,
                { zIndex: displayActors.length - index, marginLeft: index > 0 ? -12 : 0 },
              ]}
            >
              {actor.avatar ? (
                <Image source={{ uri: actor.avatar }} style={styles.stackedAvatar} />
              ) : (
                <View style={styles.stackedAvatarPlaceholder}>
                  <Text style={styles.stackedAvatarInitial}>
                    {actor.displayName?.[0]?.toUpperCase() || "?"}
                  </Text>
                </View>
              )}
            </View>
          ))}
          
          {actorCount > 3 && (
            <View style={[styles.stackedAvatarContainer, styles.moreAvatars, { marginLeft: -12 }]}>
              <Text style={styles.moreAvatarsText}>+{actorCount - 3}</Text>
            </View>
          )}
        </View>
      );
    }
    
    const avatar = actors[0]?.avatar || notification.actorAvatar;
    const displayName = actors[0]?.displayName || notification.actorName || "";
    
    return (
      <View style={styles.singleAvatarContainer}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>
              {displayName[0]?.toUpperCase() || "?"}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderNotificationIcon = (type: string) => {
    const iconConfig = NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.system;
    
    return (
      <View style={[styles.notificationIcon, { backgroundColor: `${iconConfig.color}E6` }]}>
        {iconConfig.image ? (
          <Image 
            source={iconConfig.image} 
            style={[styles.notificationIconImage, { tintColor: "#FFFFFF" }]} 
            resizeMode="contain"
          />
        ) : (
          <Ionicons name={iconConfig.icon as any} size={14} color="#FFFFFF" />
        )}
      </View>
    );
  };

  const renderNotification = ({ item, isArchived = false }: { item: Notification; isArchived?: boolean }) => {
    return (
      <TouchableOpacity
        style={[
          styles.notificationCard, 
          !item.read && !isArchived && styles.notificationUnread,
          isArchived && styles.notificationArchived
        ]}
        onPress={() => handleNotificationTap(item)}
        activeOpacity={0.7}
      >
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          {renderAvatarStack(item)}
          {!item.read && !isArchived && <View style={styles.unreadDot} />}
          {renderNotificationIcon(item.type)}
        </View>

        {/* Content */}
        <View style={styles.notificationContent}>
          <Text style={[
            styles.notificationMessage, 
            !item.read && !isArchived && styles.notificationMessageUnread,
            isArchived && styles.notificationMessageArchived
          ]}>
            {item.message}
          </Text>
          <Text style={styles.notificationTime}>
            {formatTimeAgo(item.updatedAt || item.createdAt)}
          </Text>
        </View>

        {/* Restore button for archived OR Chevron for active */}
        {isArchived ? (
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={(e) => {
              e.stopPropagation();
              handleRestoreNotification(item.id);
            }}
          >
            <Ionicons name="refresh" size={18} color="#0D5C3A" />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-forward" size={18} color="#CCC" />
        )}
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: GroupedNotifications }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <View style={styles.sectionDivider} />
    </View>
  );

  const renderArchivedModal = () => (
    <Modal
      visible={showArchivedModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowArchivedModal(false)}
    >
      <SafeAreaView style={styles.archivedModalContainer} edges={["top"]}>
        {/* Header */}
        <View style={styles.archivedHeader}>
          <TouchableOpacity
            onPress={() => {
              soundPlayer.play('click');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowArchivedModal(false);
            }}
            style={styles.archivedCloseButton}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          
          <Text style={styles.archivedHeaderTitle}>Previous Notifications</Text>
          
          <View style={styles.archivedCloseButton} />
        </View>

        {/* Archived List */}
        {archivedNotifications.length === 0 ? (
          <View style={styles.archivedEmptyContainer}>
            <Ionicons name="archive-outline" size={64} color="#CCC" />
            <Text style={styles.archivedEmptyText}>No archived notifications</Text>
          </View>
        ) : (
          <FlatList
            data={groupNotificationsByDate(archivedNotifications)}
            renderItem={({ item: section }) => (
              <>
                {renderSectionHeader({ section })}
                {section.data.map((notification) => (
                  <View key={notification.id}>
                    {renderNotification({ item: notification, isArchived: true })}
                  </View>
                ))}
              </>
            )}
            keyExtractor={(item) => item.title}
            contentContainerStyle={styles.listContent}
          />
        )}
      </SafeAreaView>
    </Modal>
  );

  const groupedData = groupNotificationsByDate(activeNotifications);

  if (loading && !showingCached) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  const hasActiveNotifications = activeNotifications.length > 0;
  const hasArchivedNotifications = archivedNotifications.length > 0;
  const unreadCount = activeNotifications.filter((n) => !n.read).length;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backButton}
        >
          <Image
            source={require("@/assets/icons/Close.png")}
            style={styles.closeIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>

        {hasActiveNotifications ? (
          <TouchableOpacity
            onPress={handleClearAll}
            style={styles.clearAllButton}
          >
            <Text style={styles.clearAllText}>Clear all</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backButton} />
        )}
      </View>

      {/* Cache indicator */}
      {showingCached && !loading && (
        <View style={styles.cacheIndicator}>
          <ActivityIndicator size="small" color="#0D5C3A" />
          <Text style={styles.cacheText}>Updating notifications...</Text>
        </View>
      )}

      {/* Notifications List or Empty State */}
      {!hasActiveNotifications ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#0D5C3A" />
          </View>
          <Text style={styles.emptyText}>No new notifications</Text>
          <Text style={styles.emptySubtext}>
            You're all caught up!
          </Text>
          
          {hasArchivedNotifications && (
            <TouchableOpacity
              style={styles.viewArchivedButton}
              onPress={() => {
                soundPlayer.play('click');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowArchivedModal(true);
              }}
            >
              <Ionicons name="archive-outline" size={20} color="#FFFFFF" />
              <Text style={styles.viewArchivedText}>See Previous Notifications</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          <FlatList
            data={groupedData}
            renderItem={({ item: section }) => (
              <>
                {renderSectionHeader({ section })}
                {section.data.map((notification) => (
                  <View key={notification.id}>
                    {renderNotification({ item: notification })}
                  </View>
                ))}
              </>
            )}
            keyExtractor={(item) => item.title}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#0D5C3A"
                colors={["#0D5C3A"]}
              />
            }
          />
          
          {/* View Archived Button at bottom when there are active notifications */}
          {hasArchivedNotifications && (
            <TouchableOpacity
              style={styles.bottomArchivedButton}
              onPress={() => {
                soundPlayer.play('click');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowArchivedModal(true);
              }}
            >
              <Ionicons name="archive-outline" size={18} color="#0D5C3A" />
              <Text style={styles.bottomArchivedText}>
                View {archivedNotifications.length} archived notification{archivedNotifications.length !== 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Archived Modal */}
      {renderArchivedModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F4EED8" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#0D5C3A", paddingHorizontal: 16, paddingVertical: 12 },
  backButton: { width: 60, alignItems: "flex-start" },
  closeIcon: { width: 28, height: 28, tintColor: "#FFFFFF" },
  headerTitleContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#FFFFFF" },
  unreadBadge: { backgroundColor: "#FF3B30", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, minWidth: 20, alignItems: "center" },
  unreadBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  clearAllButton: { width: 60, alignItems: "flex-end" },
  clearAllText: { color: "#FFD700", fontSize: 13, fontWeight: "600" },
  cacheIndicator: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 8, backgroundColor: "#FFF3CD", borderBottomWidth: 1, borderBottomColor: "#FFECB5" },
  cacheText: { fontSize: 12, color: "#664D03", fontWeight: "600" },
  listContent: { paddingBottom: 20 },
  sectionHeader: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#0D5C3A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  sectionDivider: { height: 1, backgroundColor: "#E0E0E0" },
  notificationCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", marginHorizontal: 16, marginVertical: 4, padding: 14, borderRadius: 12, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  notificationUnread: { backgroundColor: "#FFFEF5", borderLeftWidth: 3, borderLeftColor: "#FFD700" },
  notificationArchived: { backgroundColor: "#F5F5F5", opacity: 0.85 },
  avatarSection: { position: "relative" },
  singleAvatarContainer: { width: 48, height: 48 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#E0E0E0" },
  avatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#0D5C3A", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 18, fontWeight: "700", color: "#FFFFFF" },
  avatarStack: { flexDirection: "row", alignItems: "center", width: 72, height: 48 },
  stackedAvatarContainer: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: "#FFFFFF", backgroundColor: "#FFFFFF", overflow: "hidden" },
  stackedAvatar: { width: 32, height: 32, borderRadius: 16 },
  stackedAvatarPlaceholder: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#0D5C3A", alignItems: "center", justifyContent: "center" },
  stackedAvatarInitial: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  moreAvatars: { backgroundColor: "#0D5C3A", alignItems: "center", justifyContent: "center" },
  moreAvatarsText: { fontSize: 11, fontWeight: "700", color: "#FFFFFF" },
  unreadDot: { position: "absolute", top: -2, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: "#FFD700", borderWidth: 2, borderColor: "#FFFFFF" },
  notificationIcon: { position: "absolute", bottom: -4, right: -4, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  notificationIconImage: { width: 12, height: 12 },
  notificationContent: { flex: 1 },
  notificationMessage: { fontSize: 14, fontWeight: "500", color: "#333", marginBottom: 4, lineHeight: 20 },
  notificationMessageUnread: { fontWeight: "600", color: "#000" },
  notificationMessageArchived: { color: "#666" },
  notificationTime: { fontSize: 12, color: "#999" },
  restoreButton: { padding: 8, backgroundColor: "rgba(13, 92, 58, 0.1)", borderRadius: 20 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emptyIconContainer: { width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(13, 92, 58, 0.1)", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  emptyText: { fontSize: 20, fontWeight: "700", color: "#333" },
  emptySubtext: { fontSize: 14, color: "#999", marginTop: 8, textAlign: "center" },
  viewArchivedButton: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#0D5C3A", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 24, marginTop: 32 },
  viewArchivedText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  bottomArchivedButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#E0E0E0", backgroundColor: "#FFFFFF" },
  bottomArchivedText: { color: "#0D5C3A", fontSize: 14, fontWeight: "600" },
  archivedModalContainer: { flex: 1, backgroundColor: "#F4EED8" },
  archivedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#0D5C3A", paddingHorizontal: 16, paddingVertical: 12 },
  archivedCloseButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  archivedHeaderTitle: { fontSize: 18, fontWeight: "700", color: "#FFFFFF" },
  archivedEmptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  archivedEmptyText: { fontSize: 16, color: "#999", marginTop: 16 },
});