import { auth, db } from "@/constants/firebaseConfig";
import { Notification, GroupedNotifications } from "@/constants/notificationTypes";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import { markNotificationAsRead } from "@/utils/notificationHelpers";
import { navigateForNotification } from "@/utils/notificationRouter";
import { getTimestampMs, getDateFromTimestamp } from "@/utils/timestampHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import NotificationCard from "@/components/notifications/NotificationCard";
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

// Sort notifications by updatedAt (if exists) or createdAt, descending
const sortNotifications = (notifications: Notification[]): Notification[] => {
  return notifications.sort((a, b) => {
    const aTime = getTimestampMs(a.updatedAt) || getTimestampMs(a.createdAt);
    const bTime = getTimestampMs(b.updatedAt) || getTimestampMs(b.createdAt);
    return bTime - aTime;
  });
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

export default function NotificationsScreen() {
  const router = useRouter();
  const { getCache, setCache } = useCache();

  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showingCached, setShowingCached] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showArchivedModal, setShowArchivedModal] = useState(false);

  const activeNotifications = allNotifications.filter(n => !n.archived);
  const archivedNotifications = allNotifications.filter(n => n.archived);

  // ==========================================
  // DATA LOADING
  // ==========================================

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    let unsubscribe: (() => void) | undefined;

    const loadNotificationsWithCache = async () => {
      try {
        const cached = await getCache(CACHE_KEYS.NOTIFICATIONS(uid));
        if (cached) {
          setAllNotifications(cached);
          setShowingCached(true);
          setLoading(false);
        }

        const notificationsQuery = query(
          collection(db, "notifications"),
          where("userId", "==", uid)
        );

        unsubscribe = onSnapshot(
          notificationsQuery,
          async (snapshot) => {
            const notificationsList: Notification[] = [];
            snapshot.forEach((doc) => {
              notificationsList.push({ id: doc.id, ...doc.data() } as Notification);
            });

            const sorted = sortNotifications(notificationsList);
            setAllNotifications(sorted);
            await setCache(CACHE_KEYS.NOTIFICATIONS(uid), sorted);

            setShowingCached(false);
            setLoading(false);
            setRefreshing(false);
          },
          (error) => {
            console.error("Error fetching notifications:", error);
            soundPlayer.play("error");
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
    return () => unsubscribe?.();
  }, []);

  // ==========================================
  // ACTIONS
  // ==========================================

  const handleRefresh = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setRefreshing(true);
    setShowingCached(false);

    try {
      const notificationsQuery = query(
        collection(db, "notifications"),
        where("userId", "==", uid)
      );

      const snapshot = await getDocs(notificationsQuery);
      const notificationsList: Notification[] = [];
      snapshot.forEach((doc) => {
        notificationsList.push({ id: doc.id, ...doc.data() } as Notification);
      });

      const sorted = sortNotifications(notificationsList);
      setAllNotifications(sorted);
      await setCache(CACHE_KEYS.NOTIFICATIONS(uid), sorted);
    } catch (error) {
      console.error("Error refreshing notifications:", error);
      soundPlayer.play("error");
    }

    setRefreshing(false);
  };

  const handleClearAll = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const batch = writeBatch(db);
      const now = serverTimestamp();

      activeNotifications.forEach((notification) => {
        const notifRef = doc(db, "notifications", notification.id);
        batch.update(notifRef, { archived: true, archivedAt: now, read: true });
      });

      await batch.commit();
      soundPlayer.play("postThought");

      const updated = allNotifications.map(n =>
        !n.archived ? { ...n, archived: true, read: true } : n
      );
      setAllNotifications(updated);
      await setCache(CACHE_KEYS.NOTIFICATIONS(uid), updated);
    } catch (error) {
      console.error("Error archiving notifications:", error);
      soundPlayer.play("error");
    }
  };

  const handleRestoreNotification = async (notificationId: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const notifRef = doc(db, "notifications", notificationId);
      const batch = writeBatch(db);
      batch.update(notifRef, { archived: false, archivedAt: null });
      await batch.commit();

      const updated = allNotifications.map(n =>
        n.id === notificationId ? { ...n, archived: false, archivedAt: null } : n
      );
      setAllNotifications(updated);
      await setCache(CACHE_KEYS.NOTIFICATIONS(uid), updated);
    } catch (error) {
      console.error("Error restoring notification:", error);
      soundPlayer.play("error");
    }
  };

  const handleNotificationTap = async (notification: Notification) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Mark as read
    if (!notification.read) {
      await markNotificationAsRead(notification.id);

      const uid = auth.currentUser?.uid;
      if (uid) {
        const updated = allNotifications.map(n =>
          n.id === notification.id ? { ...n, read: true } : n
        );
        setAllNotifications(updated);
        await setCache(CACHE_KEYS.NOTIFICATIONS(uid), updated);
      }
    }

    // Close archived modal if open
    if (showArchivedModal) {
      setShowArchivedModal(false);
    }

    // Navigate
    navigateForNotification(notification, router);
  };

  // ==========================================
  // RENDER HELPERS
  // ==========================================

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
        <View style={styles.archivedHeader}>
          <TouchableOpacity
            onPress={() => {
              soundPlayer.play("click");
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

        <View style={styles.contentArea}>
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
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      isArchived
                      onPress={handleNotificationTap}
                      onRestore={handleRestoreNotification}
                    />
                  ))}
                </>
              )}
              keyExtractor={(item) => item.title}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );

  // ==========================================
  // MAIN RENDER
  // ==========================================

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
            soundPlayer.play("click");
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
          <TouchableOpacity onPress={handleClearAll} style={styles.clearAllButton}>
            <Text style={styles.clearAllText}>Clear all</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backButton} />
        )}
      </View>

      {/* Content Area */}
      <View style={styles.contentArea}>
        {showingCached && !loading && (
          <View style={styles.cacheIndicator}>
            <ActivityIndicator size="small" color="#0D5C3A" />
            <Text style={styles.cacheText}>Updating notifications...</Text>
          </View>
        )}

        {!hasActiveNotifications ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="checkmark-circle-outline" size={64} color="#0D5C3A" />
            </View>
            <Text style={styles.emptyText}>No new notifications</Text>
            <Text style={styles.emptySubtext}>You're all caught up!</Text>

            {hasArchivedNotifications && (
              <TouchableOpacity
                style={styles.viewArchivedButton}
                onPress={() => {
                  soundPlayer.play("click");
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
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onPress={handleNotificationTap}
                    />
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

            {hasArchivedNotifications && (
              <TouchableOpacity
                style={styles.bottomArchivedButton}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowArchivedModal(true);
                }}
              >
                <Ionicons name="archive-outline" size={18} color="#0D5C3A" />
                <Text style={styles.bottomArchivedText}>
                  View {archivedNotifications.length} archived notification{archivedNotifications.length !== 1 ? "s" : ""}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {renderArchivedModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D5C3A" },
  contentArea: { flex: 1, backgroundColor: "#F4EED8" },
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
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emptyIconContainer: { width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(13, 92, 58, 0.1)", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  emptyText: { fontSize: 20, fontWeight: "700", color: "#333" },
  emptySubtext: { fontSize: 14, color: "#999", marginTop: 8, textAlign: "center" },
  viewArchivedButton: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#0D5C3A", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 24, marginTop: 32 },
  viewArchivedText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  bottomArchivedButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#E0E0E0", backgroundColor: "#FFFFFF" },
  bottomArchivedText: { color: "#0D5C3A", fontSize: 14, fontWeight: "600" },
  archivedModalContainer: { flex: 1, backgroundColor: "#0D5C3A" },
  archivedHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#0D5C3A", paddingHorizontal: 16, paddingVertical: 12 },
  archivedCloseButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  archivedHeaderTitle: { fontSize: 18, fontWeight: "700", color: "#FFFFFF" },
  archivedEmptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  archivedEmptyText: { fontSize: 16, color: "#999", marginTop: 16 },
});