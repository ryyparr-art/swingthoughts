import BottomActionBar from "@/components/navigation/BottomActionBar";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import {
  EMAIL_VERIFICATION_MESSAGE,
  isEmailVerified,
} from "@/utils/rateLimitHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  GestureHandlerRootView,
  Swipeable,
} from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

const SCREEN_WIDTH = Dimensions.get("window").width;

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

interface Thread {
  id: string;
  participants: string[];
  participantNames?: Record<string, string>;
  participantAvatars?: Record<string, string | null>;
  isGroup?: boolean;           // ✅ NEW: Group chat flag
  groupName?: string;          // ✅ NEW: Group display name
  lastMessage?: any;
  lastMessageAt?: any;
  unreadCount?: Record<string, number>;
  deletedBy?: string[];
}

/* -------------------------------------------------------------------------- */
/* THREAD ROW WITH SWIPE                                                      */
/* -------------------------------------------------------------------------- */

function ThreadRow({
  item,
  userId,
  onOpen,
  onDelete,
}: {
  item: Thread;
  userId: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const unread = item.unreadCount?.[userId] ?? 0;
  const swipeableRef = useRef<Swipeable>(null);

  // ✅ NEW: Detect if this is a group chat
  const isGroup = item.isGroup || item.participants.length > 2;

  // For 1:1 chats, get the other user's ID
  const otherUserId = !isGroup 
    ? item.participants.find((p) => p !== userId)! 
    : null;

  // ✅ UPDATED: Handle both 1:1 and group display names
  const [name, setName] = useState(() => {
    if (isGroup) {
      return item.groupName || "Group Chat";
    }
    return otherUserId ? (item.participantNames?.[otherUserId] || "User") : "User";
  });
  
  const [avatar, setAvatar] = useState<string | null>(() => {
    if (isGroup) {
      return null; // Groups use icon instead
    }
    return otherUserId ? (item.participantAvatars?.[otherUserId] || null) : null;
  });

  // ✅ Only fetch from users collection if denormalized data is missing (1:1 only)
  useEffect(() => {
    if (isGroup || !otherUserId) return;

    // If we already have name from denormalized data, don't fetch
    if (item.participantNames?.[otherUserId]) {
      console.log("✅ Using denormalized name:", item.participantNames[otherUserId]);
      return;
    }

    let mounted = true;

    (async () => {
      console.log("⚠️ Fetching user data (denormalized data missing):", otherUserId);
      const snap = await getDoc(doc(db, "users", otherUserId));
      if (mounted && snap.exists()) {
        const u = snap.data();
        setName(u.displayName || "User");
        setAvatar(u.avatar || null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [otherUserId, item.participantNames, isGroup]);

  const lastMessageText =
    typeof item.lastMessage === "string"
      ? item.lastMessage
      : item.lastMessage?.content || "";

  const getRelativeTime = (timestamp: any) => {
    if (!timestamp?.toDate) return "Recently";

    const now = new Date();
    const date = timestamp.toDate();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  // ✅ NEW: Build group subtitle showing member names
  const getSubtitle = () => {
    if (!lastMessageText && isGroup && item.participantNames) {
      const otherNames = Object.entries(item.participantNames)
        .filter(([id]) => id !== userId)
        .map(([, n]) => n);
      return otherNames.join(", ");
    }
    return lastMessageText || "No messages yet";
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const translateX = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [0, 100],
      extrapolate: "clamp",
    });

    const opacity = dragX.interpolate({
      inputRange: [-100, -50, 0],
      outputRange: [1, 0.8, 0],
      extrapolate: "clamp",
    });

    return (
      <Animated.View
        style={[
          styles.deleteAction,
          {
            transform: [{ translateX }],
            opacity,
          },
        ]}
      >
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => {
            swipeableRef.current?.close();
            onDelete();
          }}
        >
          <Ionicons name="trash" size={24} color="#FFF" />
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      friction={2}
      overshootRight={false}
      onSwipeableOpen={(direction) => {
        if (direction === "right") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }}
    >
      <TouchableOpacity
        style={[styles.messageCard, unread > 0 && styles.unreadCard]}
        onPress={onOpen}
        activeOpacity={0.9}
      >
        <View style={styles.messageHeader}>
          <View style={styles.senderInfo}>
            {/* ✅ UPDATED: Show group icon or user avatar */}
            {isGroup ? (
              <View style={styles.groupAvatarContainer}>
                <View style={styles.avatarCircle}>
                  <Ionicons name="people" size={22} color="#FFF" />
                </View>
                <View style={styles.memberCountBadge}>
                  <Text style={styles.memberCountText}>
                    {item.participants.length}
                  </Text>
                </View>
              </View>
            ) : avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {name[0]?.toUpperCase() || "?"}
                </Text>
              </View>
            )}
            <View style={styles.senderDetails}>
              <View style={styles.nameRow}>
                <Text style={styles.senderName} numberOfLines={1}>
                  {name}
                </Text>
                {unread > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{unread}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.timestamp}>
                {getRelativeTime(item.lastMessageAt)}
              </Text>
            </View>
          </View>

          <Ionicons name="chevron-forward" size={20} color="#CCC" />
        </View>

        <Text numberOfLines={2} style={styles.messageContent}>
          {getSubtitle()}
        </Text>
      </TouchableOpacity>
    </Swipeable>
  );
}

/* -------------------------------------------------------------------------- */
/* SCREEN                                                                     */
/* -------------------------------------------------------------------------- */

export default function MessagesScreen() {
  const router = useRouter();
  const userId = auth.currentUser?.uid;
  const { getCache, setCache } = useCache();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [showingCached, setShowingCached] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (userId) loadThreadsWithCache();
  }, [userId]);

  /* ------------------------------------------------------------------------ */
  /* DATA                                                                     */
  /* ------------------------------------------------------------------------ */

  const loadThreadsWithCache = async () => {
    if (!userId) return;

    const cached = await getCache(CACHE_KEYS.LOCKER_NOTES(userId));
    if (cached) {
      setThreads(cached);
      setShowingCached(true);
      setLoading(false);
    }

    await fetchThreads(true);
  };

  const fetchThreads = async (background = false) => {
    if (!userId) return;

    try {
      if (!background) setLoading(true);

      const q = query(
        collection(db, "threads"),
        where("participants", "array-contains", userId),
        orderBy("lastMessageAt", "desc")
      );

      const snap = await getDocs(q);

      // Filter out threads that current user has deleted
      const items: Thread[] = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Thread, "id">),
        }))
        .filter((thread) => {
          // Don't show threads where current user is in deletedBy array
          const deletedBy = thread.deletedBy || [];
          return !deletedBy.includes(userId);
        });

      console.log(`✅ Loaded ${items.length} threads`);
      
      // Log denormalized data availability
      items.forEach((thread, idx) => {
        const isGroup = thread.isGroup || thread.participants.length > 2;
        if (isGroup) {
          console.log(`  Thread ${idx + 1}: GROUP (${thread.participants.length} members)`);
        } else {
          const otherId = thread.participants.find(p => p !== userId);
          const hasName = !!thread.participantNames?.[otherId!];
          const hasAvatar = !!thread.participantAvatars?.[otherId!];
          console.log(`  Thread ${idx + 1}: 1:1 name=${hasName}, avatar=${hasAvatar}`);
        }
      });

      setThreads(items);
      await setCache(CACHE_KEYS.LOCKER_NOTES(userId), items);

      setShowingCached(false);
      setLoading(false);
    } catch (err) {
      console.error("❌ Thread fetch error:", err);
      setLoading(false);
      setShowingCached(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* DELETE THREAD (SOFT DELETE - HIDES FOR USER)                             */
  /* ------------------------------------------------------------------------ */

  const deleteThread = async (threadId: string) => {
    Alert.alert(
      "Delete Conversation",
      "This will remove this conversation from your inbox. The other person will still be able to see it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

              // Soft delete: Add current user to deletedBy array
              const threadRef = doc(db, "threads", threadId);
              const threadSnap = await getDoc(threadRef);

              if (threadSnap.exists()) {
                const threadData = threadSnap.data();
                const deletedBy = threadData.deletedBy || [];

                // Add current user to deletedBy
                if (!deletedBy.includes(userId)) {
                  deletedBy.push(userId);
                }

                await updateDoc(threadRef, {
                  deletedBy,
                  updatedAt: serverTimestamp(),
                });

                // Check if all users have deleted - trigger full delete via Cloud Function
                const participants = threadData.participants || [];
                const allDeleted = participants.every((p: string) =>
                  deletedBy.includes(p)
                );

                if (allDeleted) {
                  console.log(
                    "🗑️ All users deleted thread - Cloud Function will clean up"
                  );
                }
              }

              // Update local state
              const updated = threads.filter((t) => t.id !== threadId);
              setThreads(updated);
              await setCache(CACHE_KEYS.LOCKER_NOTES(userId!), updated);

              soundPlayer.play("postThought");
            } catch (err) {
              console.error("❌ Delete failed:", err);
              soundPlayer.play("error");
              Alert.alert("Error", "Failed to delete conversation.");
            }
          },
        },
      ]
    );
  };

  /* ------------------------------------------------------------------------ */
  /* EMPTY STATE                                                              */
  /* ------------------------------------------------------------------------ */

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="chatbubbles-outline" size={80} color="#CCC" />
      <Text style={styles.emptyTitle}>No Locker Notes Yet</Text>
      <Text style={styles.emptySubtitle}>
        Start a conversation with one of your partners!
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => {
          soundPlayer.play("click");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (!isEmailVerified()) {
            Alert.alert("Email Not Verified", EMAIL_VERIFICATION_MESSAGE);
            return;
          }
          router.push("/messages/select-partner");
        }}
      >
        <Ionicons name="create-outline" size={20} color="#FFF" />
        <Text style={styles.emptyButtonText}>New Message</Text>
      </TouchableOpacity>
    </View>
  );

  /* ------------------------------------------------------------------------ */
  /* UI                                                                       */
  /* ------------------------------------------------------------------------ */

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <SafeAreaView edges={["top"]} style={styles.safeTop} />
        <TopNavBar />

        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/clubhouse");
            }}
          >
            <Image
              source={require("@/assets/icons/Close.png")}
              style={styles.closeIcon}
            />
          </TouchableOpacity>

          <Text style={styles.title}>Locker Notes</Text>

          <TouchableOpacity
            style={styles.composeButton}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (!isEmailVerified()) {
                Alert.alert("Email Not Verified", EMAIL_VERIFICATION_MESSAGE);
                return;
              }
              router.push("/messages/select-partner");
            }}
          >
            <Ionicons name="create-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Swipe hint for first-time users */}
        {threads.length > 0 && (
          <View style={styles.swipeHint}>
            <Ionicons name="arrow-back" size={14} color="#999" />
            <Text style={styles.swipeHintText}>Swipe left to delete</Text>
          </View>
        )}

        {loading && !showingCached ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0D5C3A" />
          </View>
        ) : threads.length === 0 ? (
          renderEmptyState()
        ) : (
          <FlatList
            data={threads}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <ThreadRow
                item={item}
                userId={userId!}
                onOpen={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/messages/${item.id}`);
                }}
                onDelete={() => deleteThread(item.id)}
              />
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchThreads().finally(() => setRefreshing(false));
                }}
                tintColor="#0D5C3A"
                colors={["#0D5C3A"]}
              />
            }
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        <BottomActionBar />
        <SwingFooter />
      </View>
    </GestureHandlerRootView>
  );
}

/* -------------------------------------------------------------------------- */
/* STYLES                                                                     */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  safeTop: {
    backgroundColor: "#0D5C3A",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },

  closeButton: {
    backgroundColor: "#0D5C3A",
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },

  closeIcon: {
    width: 20,
    height: 20,
    tintColor: "#fff",
  },

  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0D5C3A",
    flex: 1,
    textAlign: "center",
  },

  composeButton: {
    backgroundColor: "#0D5C3A",
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },

  swipeHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    backgroundColor: "rgba(0, 0, 0, 0.03)",
  },

  swipeHintText: {
    fontSize: 12,
    color: "#999",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  listContent: {
    padding: 16,
    paddingBottom: 140,
  },

  messageCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },

  unreadCard: {
    backgroundColor: "#FFF9E6",
    borderLeftWidth: 4,
    borderLeftColor: "#FFD700",
  },

  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  senderInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  senderDetails: {
    flex: 1,
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },

  avatarText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 18,
  },

  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },

  // ✅ NEW: Group avatar styles
  groupAvatarContainer: {
    position: "relative",
  },

  memberCountBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: "#FFD700",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#FFF",
  },

  memberCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#333",
  },

  senderName: {
    fontWeight: "700",
    color: "#0D5C3A",
    fontSize: 16,
    flexShrink: 1,
  },

  unreadBadge: {
    backgroundColor: "#FF3B30",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },

  unreadBadgeText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },

  timestamp: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },

  messageContent: {
    fontFamily: "Caveat_400Regular",
    fontSize: 18,
    color: "#666",
    lineHeight: 24,
  },

  // Swipe delete action
  deleteAction: {
    backgroundColor: "#FF3B30",
    justifyContent: "center",
    alignItems: "flex-end",
    borderRadius: 12,
    marginBottom: 12,
  },

  deleteButton: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    height: "100%",
    paddingHorizontal: 16,
  },

  deleteText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },

  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#333",
    marginTop: 20,
  },

  emptySubtitle: {
    fontSize: 16,
    color: "#666",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },

  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },

  emptyButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
});




