import { auth, db } from "@/constants/firebaseConfig";
import { markAllNotificationsAsRead, markNotificationAsRead } from "@/utils/notificationHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Notification {
  id: string;
  userId: string;
  type: string;
  read: boolean;
  createdAt: any;
  message: string;
  
  // Grouped notifications
  actors?: Array<{ userId: string; displayName: string; avatar?: string }>;
  actorCount?: number;
  
  // Single actor notifications
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
  
  // Related content
  postId?: string;
  commentId?: string;
  courseId?: number;
  scoreId?: string;
}

interface GroupedNotifications {
  title: string;
  data: Notification[];
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    // Real-time listener for notifications
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const notificationsList: Notification[] = [];
        
        snapshot.forEach((doc) => {
          notificationsList.push({
            id: doc.id,
            ...doc.data(),
          } as Notification);
        });

        setNotifications(notificationsList);
        setLoading(false);
        setRefreshing(false);
      },
      (error) => {
        console.error("Error fetching notifications:", error);
        soundPlayer.play('error');
        setLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    // The snapshot listener will automatically refresh
  };

  const handleMarkAllAsRead = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      await markAllNotificationsAsRead(uid);
      soundPlayer.play('postThought');
    } catch (error) {
      console.error("Error marking all as read:", error);
      soundPlayer.play('error');
    }
  };

  const handleNotificationTap = async (notification: Notification) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Mark as read
    if (!notification.read) {
      await markNotificationAsRead(notification.id);
    }

    // Navigate based on type
    switch (notification.type) {
      case "like":
      case "comment":
      case "share":
      case "mention_comment":
      case "partner_posted":
      case "trending":
        // All clubhouse interactions - highlight the post with gold border
        if (notification.postId) {
          router.push({
            pathname: "/clubhouse",
            params: { highlightPostId: notification.postId },
          });
        }
        break;

      case "mention_post":
        if (notification.postId) {
          router.push({
            pathname: "/clubhouse",
            params: { highlightPostId: notification.postId },
          });
        }
        break;

      case "partner_request":
      case "partner_accepted":
        if (notification.actorId) {
          router.push(`/locker/${notification.actorId}`);
        }
        break;

      case "message":
      case "message_request":
        if (notification.actorId) {
          router.push(`/messages/${notification.actorId}`);
        }
        break;

      case "partner_scored":
        if (notification.scoreId) {
          router.push({
            pathname: "/clubhouse",
            params: { highlightScoreId: notification.scoreId },
          });
        }
        break;

      // ✅ LOW LEADER - Navigate to leaderboard with highlighting
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

      // ===============================
      // HOLE-IN-ONE ADDITIONS
      // ===============================

      case "holeinone_verification_request":
        router.push(`/verify-holeinone/${notification.scoreId}`);
        break;

      case "holeinone_verified":
        if (notification.postId) {
          router.push({
            pathname: "/clubhouse",
            params: { highlightPostId: notification.postId },
          });
        } else {
          router.push(`/clubhouse`);
        }
        break;

      case "holeinone_denied":
        router.push(`/profile/${auth.currentUser?.uid}`);
        break;

      case "partner_holeinone":
        if (notification.postId) {
          router.push({
            pathname: "/clubhouse",
            params: { highlightPostId: notification.postId },
          });
        } else {
          router.push(`/clubhouse`);
        }
        break;

      default:
        // For system notifications, do nothing or navigate to settings
        break;
    }
  };

  const groupNotificationsByDate = (): GroupedNotifications[] => {
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
      const date = notif.createdAt?.toDate();
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

  const renderNotification = ({ item }: { item: Notification }) => {
    // Get avatar (grouped or single)
    const avatar = item.actors && item.actors.length > 0
      ? item.actors[0].avatar
      : item.actorAvatar;

    return (
      <TouchableOpacity
        style={[styles.notificationCard, !item.read && styles.notificationUnread]}
        onPress={() => handleNotificationTap(item)}
      >
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={24} color="#0D5C3A" />
            </View>
          )}
          {!item.read && <View style={styles.unreadDot} />}
        </View>

        {/* Content */}
        <View style={styles.notificationContent}>
          <Text style={styles.notificationMessage}>{item.message}</Text>
          <Text style={styles.notificationTime}>
            {item.createdAt?.toDate().toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </Text>
        </View>

        {/* Icon */}
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: GroupedNotifications }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
    </View>
  );

  const groupedData = groupNotificationsByDate();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  const hasUnread = notifications.some((n) => !n.read);

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

        <Text style={styles.headerTitle}>Notifications</Text>

        {hasUnread && (
          <TouchableOpacity
            onPress={handleMarkAllAsRead}
            style={styles.markAllButton}
          >
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}

        {!hasUnread && <View style={styles.backButton} />}
      </View>

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="notifications-off-outline" size={80} color="#CCC" />
          <Text style={styles.emptyText}>No notifications yet</Text>
          <Text style={styles.emptySubtext}>
            We'll notify you when something happens
          </Text>
        </View>
      ) : (
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
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    alignItems: "flex-start",
  },
  closeIcon: {
    width: 28,
    height: 28,
    tintColor: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    flex: 1,
    textAlign: "center",
  },
  markAllButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  markAllText: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "600",
  },
  listContent: {
    paddingBottom: 20,
  },
  sectionHeader: {
    backgroundColor: "#F4EED8",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  notificationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginVertical: 4,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  notificationUnread: {
    backgroundColor: "#FFF9E6",
    borderLeftWidth: 4,
    borderLeftColor: "#FFD700",
  },
  avatarContainer: {
    position: "relative",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E0E0E0",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFD700",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  notificationContent: {
    flex: 1,
  },
  notificationMessage: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: "#999",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#666",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
    textAlign: "center",
  },
});
