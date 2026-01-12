import BottomActionBar from "@/components/navigation/BottomActionBar";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import { EMAIL_VERIFICATION_MESSAGE, isEmailVerified } from "@/utils/rateLimitHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Message {
  messageId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string | null;
  receiverId: string;
  receiverName?: string;
  receiverAvatar?: string | null;
  content: string;
  createdAt: any;
  read: boolean;
}

interface Conversation {
  otherUserId: string;
  otherUserName: string;
  otherUserAvatar?: string | null;
  lastMessage: Message;
  unreadCount: number;
}

export default function MessagesScreen() {
  const router = useRouter();
  const userId = auth.currentUser?.uid;
  const { getCache, setCache } = useCache(); // ✅ Add cache hook
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showingCached, setShowingCached] = useState(false); // ✅ Cache indicator
  const [refreshing, setRefreshing] = useState(false); // ✅ Pull to refresh

  useEffect(() => {
    if (userId) {
      fetchMessagesWithCache();
    }
  }, [userId]);

  /* ========================= FETCH WITH CACHE ========================= */

  const fetchMessagesWithCache = async () => {
    if (!userId) return;

    try {
      // Step 1: Try to load from cache (instant)
      const cached = await getCache(CACHE_KEYS.LOCKER_NOTES(userId));
      
      if (cached) {
        console.log("⚡ Using cached locker notes");
        setConversations(cached);
        setShowingCached(true);
        setLoading(false);
      }

      // Step 2: Fetch fresh data (always)
      await fetchMessages(true);

    } catch (error) {
      console.error("❌ Locker notes cache error:", error);
      await fetchMessages();
    }
  };

  const fetchMessages = async (isBackgroundRefresh: boolean = false) => {
    if (!userId) return;

    try {
      if (!isBackgroundRefresh) {
        setLoading(true);
      }

      // Query 1: Messages I received
      const receivedQuery = query(
        collection(db, "messages"),
        where("receiverId", "==", userId)
      );

      // Query 2: Messages I sent
      const sentQuery = query(
        collection(db, "messages"),
        where("senderId", "==", userId)
      );

      const [receivedSnapshot, sentSnapshot] = await Promise.all([
        getDocs(receivedQuery),
        getDocs(sentQuery),
      ]);

      const allMessages: Message[] = [];

      // Process received messages
      for (const docSnap of receivedSnapshot.docs) {
        const messageData = docSnap.data() as Message;
        
        // Get sender's display name and avatar
        try {
          const senderDoc = await getDoc(doc(db, "users", messageData.senderId));
          if (senderDoc.exists()) {
            const senderData = senderDoc.data();
            messageData.senderName = senderData.displayName || "Anonymous";
            messageData.senderAvatar = senderData.avatar || null;
          } else {
            messageData.senderName = "Anonymous";
            messageData.senderAvatar = null;
          }
        } catch (err) {
          messageData.senderName = "Anonymous";
          messageData.senderAvatar = null;
        }

        allMessages.push(messageData);
      }

      // Process sent messages
      for (const docSnap of sentSnapshot.docs) {
        const messageData = docSnap.data() as Message;
        
        // Get receiver's display name and avatar
        try {
          const receiverDoc = await getDoc(doc(db, "users", messageData.receiverId));
          if (receiverDoc.exists()) {
            const receiverData = receiverDoc.data();
            messageData.receiverName = receiverData.displayName || "Anonymous";
            messageData.receiverAvatar = receiverData.avatar || null;
          } else {
            messageData.receiverName = "Anonymous";
            messageData.receiverAvatar = null;
          }
        } catch (err) {
          messageData.receiverName = "Anonymous";
          messageData.receiverAvatar = null;
        }

        allMessages.push(messageData);
      }

      console.log(`📨 Total messages found: ${allMessages.length} (${receivedSnapshot.size} received, ${sentSnapshot.size} sent)`);

      // Sort by timestamp (newest first)
      allMessages.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      // Group messages by conversation partner
      const conversationsMap = new Map<string, Conversation>();

      for (const msg of allMessages) {
        // Determine who the "other" user is
        const otherUserId = msg.senderId === userId ? msg.receiverId : msg.senderId;
        const otherUserName = msg.senderId === userId 
          ? (msg.receiverName || "Anonymous")
          : (msg.senderName || "Anonymous");
        const otherUserAvatar = msg.senderId === userId
          ? (msg.receiverAvatar || null)
          : (msg.senderAvatar || null);

        // If this conversation doesn't exist yet, or this message is newer, update it
        const existing = conversationsMap.get(otherUserId);
        
        if (!existing) {
          // Count unread messages in this conversation
          const unreadCount = allMessages.filter(
            m => m.senderId === otherUserId && m.receiverId === userId && !m.read
          ).length;

          conversationsMap.set(otherUserId, {
            otherUserId,
            otherUserName,
            otherUserAvatar,
            lastMessage: msg,
            unreadCount,
          });
        }
      }

      // Convert map to array
      const conversationsList = Array.from(conversationsMap.values());

      // Sort by last message timestamp
      conversationsList.sort((a, b) => {
        const aTime = a.lastMessage.createdAt?.toMillis?.() || 0;
        const bTime = b.lastMessage.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      console.log(`💬 Grouped into ${conversationsList.length} conversations`);

      setConversations(conversationsList);

      // ✅ Step 3: Update cache
      await setCache(CACHE_KEYS.LOCKER_NOTES(userId), conversationsList);
      console.log("✅ Locker notes cached");

      setShowingCached(false);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching messages:", error);
      soundPlayer.play('error');
      setShowingCached(false);
      setLoading(false);
    }
  };

  /* ========================= PULL TO REFRESH ========================= */

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Clear cache indicator on manual refresh
    setShowingCached(false);
    await fetchMessages();
    
    setRefreshing(false);
  };

  /* ========================= HANDLERS ========================= */

  const handleComposeNew = () => {
    // ✅ ANTI-BOT: Check email verification before allowing compose
    if (!isEmailVerified()) {
      soundPlayer.play('error');
      Alert.alert("Email Not Verified", EMAIL_VERIFICATION_MESSAGE);
      return;
    }

    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/messages/select-partner");
  };

  const handleDeleteConversation = async (otherUserId: string) => {
    const currentUserId = auth.currentUser?.uid;
    
    if (!currentUserId) {
      soundPlayer.play('error');
      if (Platform.OS === 'web') {
        alert("Error: User not authenticated. Please log in again.");
      } else {
        Alert.alert("Error", "User not authenticated. Please log in again.");
      }
      return;
    }

    const confirmDelete = async () => {
      if (Platform.OS === 'web') {
        return window.confirm("Delete this conversation? This will remove all messages with this user.");
      } else {
        return new Promise<boolean>((resolve) => {
          Alert.alert(
            "Delete Conversation",
            "Delete this conversation? This will remove all messages with this user.",
            [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => {
                  soundPlayer.play('click');
                  resolve(false);
                },
              },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => {
                  soundPlayer.play('error');
                  resolve(true);
                },
              },
            ]
          );
        });
      }
    };

    const shouldDelete = await confirmDelete();
    if (!shouldDelete) return;

    try {
      console.log("Starting delete with userId:", currentUserId, "otherUserId:", otherUserId);
      
      // Delete all messages between current user and the other user
      const q1 = query(
        collection(db, "messages"),
        where("senderId", "==", currentUserId),
        where("receiverId", "==", otherUserId)
      );

      const q2 = query(
        collection(db, "messages"),
        where("senderId", "==", otherUserId),
        where("receiverId", "==", currentUserId)
      );

      const [sent, received] = await Promise.all([
        getDocs(q1),
        getDocs(q2),
      ]);

      console.log("Found messages to delete - sent:", sent.size, "received:", received.size);

      const deletePromises: Promise<void>[] = [];
      
      sent.forEach((docSnap) => {
        deletePromises.push(deleteDoc(docSnap.ref));
      });

      received.forEach((docSnap) => {
        deletePromises.push(deleteDoc(docSnap.ref));
      });

      await Promise.all(deletePromises);

      soundPlayer.play('postThought');
      console.log("Successfully deleted", deletePromises.length, "messages");

      // Remove from local state
      const updatedConversations = conversations.filter((conv) => conv.otherUserId !== otherUserId);
      setConversations(updatedConversations);

      // ✅ Update cache after deletion
      await setCache(CACHE_KEYS.LOCKER_NOTES(currentUserId), updatedConversations);

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        alert("Conversation deleted successfully");
      }
    } catch (error) {
      console.error("Error deleting conversation:", error);
      soundPlayer.play('error');
      if (Platform.OS === 'web') {
        alert("Failed to delete conversation: " + (error as Error).message);
      } else {
        Alert.alert("Error", "Failed to delete conversation");
      }
    }
  };

  const renderConversation = ({ item }: { item: Conversation }) => {
    const isMyMessage = item.lastMessage.senderId === userId;
    const hasUnread = item.unreadCount > 0;

    return (
      <View style={styles.messageWrapper}>
        <TouchableOpacity
          style={[styles.messageCard, hasUnread && styles.unreadCard]}
          onPress={() => {
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/messages/${item.otherUserId}`);
          }}
        >
          <View style={styles.messageHeader}>
            <View style={styles.senderInfo}>
              {item.otherUserAvatar ? (
                <Image
                  source={{ uri: item.otherUserAvatar }}
                  style={styles.avatarImage}
                />
              ) : (
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {item.otherUserName[0]?.toUpperCase() || "?"}
                  </Text>
                </View>
              )}
              <View>
                <Text style={styles.senderName}>{item.otherUserName}</Text>
                <Text style={styles.timestamp}>
                  {item.lastMessage.createdAt?.toDate?.()?.toLocaleDateString() || "Recently"}
                </Text>
              </View>
            </View>
            {hasUnread && <View style={styles.unreadBadge} />}
          </View>

          <Text style={styles.messageContent} numberOfLines={2}>
            {isMyMessage && <Text style={styles.youText}>You: </Text>}
            {item.lastMessage.content}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => {
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handleDeleteConversation(item.otherUserId);
          }}
        >
          <Ionicons name="trash-outline" size={20} color="#FF3B30" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      <TopNavBar />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/clubhouse');
          }}
          style={styles.closeButton}
        >
          <Image
            source={require("@/assets/icons/Close.png")}
            style={styles.closeIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>

        <Text style={styles.title}>Locker Notes</Text>

        <TouchableOpacity
          onPress={handleComposeNew}
          style={styles.composeButton}
        >
          <Ionicons name="create-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Cache indicator - only show when cache is displayed */}
      {showingCached && !loading && (
        <View style={styles.cacheIndicator}>
          <ActivityIndicator size="small" color="#0D5C3A" />
          <Text style={styles.cacheText}>Updating locker notes...</Text>
        </View>
      )}

      {loading && !showingCached ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D5C3A" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.otherUserId}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0D5C3A"
              colors={["#0D5C3A"]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="mail-outline" size={64} color="#999" />
              <Text style={styles.emptyText}>No locker notes yet</Text>
              <Text style={styles.emptySubtext}>
                Your locker notes will appear here
              </Text>
            </View>
          }
        />
      )}

      <BottomActionBar />
      <SwingFooter />
    </View>
  );
}

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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#F4EED8",
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
    tintColor: "#FFFFFF",
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

  cacheIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    backgroundColor: "#FFF3CD",
    borderBottomWidth: 1,
    borderBottomColor: "#FFECB5",
  },
  
  cacheText: {
    fontSize: 12,
    color: "#664D03",
    fontWeight: "600",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    marginTop: 10,
    color: "#0D5C3A",
    fontSize: 16,
  },

  listContent: {
    padding: 16,
    paddingBottom: 140,
  },

  messageWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },

  messageCard: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    marginBottom: 12,
  },

  senderInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },

  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },

  avatarText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  senderName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  timestamp: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },

  unreadBadge: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFD700",
  },

  messageContent: {
    fontFamily: 'Caveat_400Regular',
    fontSize: 18,
    lineHeight: 24,
    color: "#333",
  },

  youText: {
    fontWeight: "700",
    color: "#0D5C3A",
  },

  deleteButton: {
    padding: 12,
    backgroundColor: "#FFE5E5",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },

  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#0D5C3A",
    marginTop: 16,
    marginBottom: 8,
  },

  emptySubtext: {
    fontSize: 14,
    color: "#999",
  },
});