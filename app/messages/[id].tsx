import { auth, db } from "@/constants/firebaseConfig";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import {
  checkRateLimit,
  EMAIL_VERIFICATION_MESSAGE,
  getRateLimitMessage,
  isEmailVerified,
  updateRateLimitTimestamp,
} from "@/utils/rateLimitHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/* ========================= TYPES ========================= */

interface Message {
  messageId: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: any;
  read?: boolean;
  edited?: boolean;
  editedAt?: any;
}

interface ThreadData {
  participants: string[];
  participantNames?: Record<string, string>;
  participantAvatars?: Record<string, string | null>;
  lastMessage?: any;
  lastMessageAt?: any;
  unreadCount?: Record<string, number>;
}

/* ========================= SCREEN ========================= */

export default function MessageThreadScreen() {
  const router = useRouter();
  const { id: threadId } = useLocalSearchParams();
  const userId = auth.currentUser?.uid;
  const { getCache, setCache } = useCache();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [showingCached, setShowingCached] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);

  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [otherUserName, setOtherUserName] = useState("User");
  const [otherUserAvatar, setOtherUserAvatar] = useState<string | null>(null);
  const [threadExists, setThreadExists] = useState(false);
  
  // ✅ Track if we've already marked messages as read this session
  const [hasMarkedRead, setHasMarkedRead] = useState(false);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  if (!userId || !threadId || typeof threadId !== "string") return null;

  const threadRef = doc(db, "threads", threadId);
  const messagesRef = collection(db, "threads", threadId, "messages");
  const cacheKey = `${CACHE_KEYS.MESSAGE_THREAD}:${threadId}`;

  /* ========================= INIT ========================= */

  useEffect(() => {
    initializeThread();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [threadId]);

  const initializeThread = async () => {
    try {
      // ✅ Load from cache first for instant UI
      await loadFromCache();

      // ✅ Parse partner ID from deterministic thread ID (format: "userA_userB")
      const participantIds = threadId.split("_");
      const partnerId = participantIds.find((id) => id !== userId);

      if (!partnerId) {
        console.error("❌ Could not parse partner ID from thread ID");
        setLoading(false);
        return;
      }

      setOtherUserId(partnerId);

      // ✅ First try to get denormalized data from thread document
      const threadSnap = await getDoc(threadRef);
      
      if (threadSnap.exists()) {
        const threadData = threadSnap.data() as ThreadData;
        setThreadExists(true);
        
        // ✅ Use denormalized data from thread if available
        if (threadData.participantNames?.[partnerId]) {
          setOtherUserName(threadData.participantNames[partnerId]);
          console.log("✅ Using denormalized name:", threadData.participantNames[partnerId]);
        }
        
        if (threadData.participantAvatars?.[partnerId]) {
          setOtherUserAvatar(threadData.participantAvatars[partnerId]);
          console.log("✅ Using denormalized avatar");
        }
        
        // ✅ Mark messages as read immediately when opening thread
        const unreadCount = threadData.unreadCount?.[userId] || 0;
        if (unreadCount > 0) {
          console.log(`📬 Thread has ${unreadCount} unread messages, marking as read...`);
          await markAllMessagesAsRead();
        }
      } else {
        console.log("📝 Thread doesn't exist yet - will be created on first message");
      }

      // ✅ Fallback: Fetch partner's user data if denormalized data not available
      if (!otherUserName || otherUserName === "User") {
        const partnerDoc = await getDoc(doc(db, "users", partnerId));
        if (partnerDoc.exists()) {
          const partnerData = partnerDoc.data();
          setOtherUserName(partnerData.displayName || "User");
          setOtherUserAvatar(partnerData.avatar || null);
          console.log("✅ Partner data loaded from users collection:", partnerData.displayName);
        }
      }

      // ✅ Subscribe to messages
      subscribeToMessages();

      setLoading(false);
    } catch (error) {
      console.error("❌ Error initializing thread:", error);
      setLoading(false);
    }
  };

  const loadFromCache = async () => {
    try {
      const cached = await getCache(cacheKey);
      if (cached) {
        setMessages(cached.messages || []);
        if (cached.otherUserName) setOtherUserName(cached.otherUserName);
        if (cached.otherUserAvatar) setOtherUserAvatar(cached.otherUserAvatar);
        setShowingCached(true);
        setLoading(false);
      }
    } catch {
      // Cache miss is fine
    }
  };

  /* ========================= MARK AS READ ========================= */

  const markAllMessagesAsRead = async () => {
    if (!userId || !threadId || hasMarkedRead) return;
    
    try {
      console.log("📖 Marking all messages as read...");
      
      // ✅ Reset unread count in thread document
      await updateDoc(threadRef, {
        [`unreadCount.${userId}`]: 0,
        updatedAt: serverTimestamp(),
      });
      
      setHasMarkedRead(true);
      console.log("✅ Unread count reset to 0");
    } catch (error) {
      console.error("❌ Error marking messages as read:", error);
    }
  };

  /* ========================= REALTIME ========================= */

  const subscribeToMessages = () => {
    const q = query(messagesRef);

    unsubscribeRef.current = onSnapshot(
      q,
      async (snapshot) => {
        const msgs: Message[] = [];

        snapshot.forEach((d) => {
          msgs.push({ ...d.data(), messageId: d.id } as Message);
        });

        msgs.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });

        setMessages(msgs);
        setLoading(false);
        setShowingCached(false);

        // ✅ Update cache with current user data
        await setCache(cacheKey, {
          messages: msgs,
          otherUserName,
          otherUserAvatar,
        });

        // ✅ Mark individual unread messages as read
        const unreadMessages = msgs.filter(
          (m) => m.receiverId === userId && !m.read
        );

        if (unreadMessages.length > 0) {
          console.log(`📬 Found ${unreadMessages.length} unread messages in snapshot`);
          
          try {
            // Mark each message as read
            await Promise.all(
              unreadMessages.map((m) =>
                updateDoc(
                  doc(db, "threads", threadId, "messages", m.messageId),
                  { read: true, readAt: serverTimestamp() }
                )
              )
            );
            console.log("✅ Individual messages marked as read");

            // Also update the thread's unread count
            await updateDoc(threadRef, {
              [`unreadCount.${userId}`]: 0,
              updatedAt: serverTimestamp(),
            });
            console.log("✅ Thread unread count reset");
          } catch (error) {
            console.error("❌ Error marking messages as read:", error);
          }
        }
      },
      (error) => {
        // ✅ Handle permission errors gracefully (thread may not exist yet)
        if (error.code !== "permission-denied") {
          console.error("❌ Message subscription error:", error);
        }
      }
    );
  };

  /* ========================= SEND ========================= */

  const handleSend = async () => {
    if (!newMessage.trim() || !otherUserId) return;

    const emailVerified = await isEmailVerified();
    if (!emailVerified) {
      soundPlayer.play("error");
      Alert.alert("Email Not Verified", EMAIL_VERIFICATION_MESSAGE);
      return;
    }

    const { allowed, remainingSeconds } = await checkRateLimit("message");
    if (!allowed) {
      soundPlayer.play("error");
      Alert.alert(
        "Please Wait",
        getRateLimitMessage("message", remainingSeconds)
      );
      return;
    }

    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSending(true);

    try {
      // ✅ Add message to subcollection
      // Cloud Function will create/update the thread document automatically!
      await addDoc(messagesRef, {
        senderId: userId,
        receiverId: otherUserId,
        content: newMessage.trim(),
        createdAt: serverTimestamp(),
        read: false,
      });

      // ✅ Update rate limit
      await updateRateLimitTimestamp("message");

      // ✅ Mark thread as existing now
      setThreadExists(true);

      soundPlayer.play("postThought");
      setNewMessage("");
      console.log("✅ Message sent successfully");
    } catch (err) {
      console.error("❌ Send failed:", err);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  /* ========================= LONG PRESS ACTIONS ========================= */

  const handleLongPress = (message: Message) => {
    // Only allow actions on user's own messages
    if (message.senderId !== userId) return;

    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Edit Message", "Delete Message"],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
          title: "Message Options",
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            openEditModal(message);
          } else if (buttonIndex === 2) {
            confirmDeleteMessage(message);
          }
        }
      );
    } else {
      // Android fallback using Alert
      Alert.alert(
        "Message Options",
        "What would you like to do?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Edit Message",
            onPress: () => openEditModal(message),
          },
          {
            text: "Delete Message",
            style: "destructive",
            onPress: () => confirmDeleteMessage(message),
          },
        ]
      );
    }
  };

  /* ========================= EDIT MESSAGE ========================= */

  const openEditModal = (message: Message) => {
    setEditingMessage(message);
    setEditedContent(message.content);
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingMessage || !editedContent.trim()) return;

    // Check if content actually changed
    if (editedContent.trim() === editingMessage.content) {
      setEditModalVisible(false);
      setEditingMessage(null);
      return;
    }

    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsUpdating(true);

    try {
      const messageRef = doc(
        db,
        "threads",
        threadId,
        "messages",
        editingMessage.messageId
      );

      await updateDoc(messageRef, {
        content: editedContent.trim(),
        edited: true,
        editedAt: serverTimestamp(),
      });

      soundPlayer.play("postThought");
      console.log("✅ Message edited successfully");

      setEditModalVisible(false);
      setEditingMessage(null);
      setEditedContent("");
    } catch (error) {
      console.error("❌ Edit failed:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to edit message. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  /* ========================= DELETE MESSAGE ========================= */

  const confirmDeleteMessage = (message: Message) => {
    Alert.alert(
      "Delete Message",
      "Are you sure you want to delete this message? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => handleDeleteMessage(message),
        },
      ]
    );
  };

  const handleDeleteMessage = async (message: Message) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const messageRef = doc(
        db,
        "threads",
        threadId,
        "messages",
        message.messageId
      );

      await deleteDoc(messageRef);

      soundPlayer.play("postThought");
      console.log("✅ Message deleted successfully");

      // Update lastMessage in thread if this was the most recent
      if (messages.length > 1 && messages[0].messageId === message.messageId) {
        // Find the next most recent message
        const nextMessage = messages[1];
        if (nextMessage) {
          await updateDoc(threadRef, {
            lastMessage: {
              senderId: nextMessage.senderId,
              content: nextMessage.content,
              createdAt: nextMessage.createdAt,
            },
            lastSenderId: nextMessage.senderId,
            lastMessageAt: nextMessage.createdAt,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (error) {
      console.error("❌ Delete failed:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to delete message. Please try again.");
    }
  };

  /* ========================= RENDER ========================= */

  const renderMessage = ({ item }: { item: Message }) => {
    const isMyMessage = item.senderId === userId;
    return (
      <TouchableOpacity
        activeOpacity={isMyMessage ? 0.7 : 1}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={500}
      >
        <View
          style={[
            styles.messageBubble,
            isMyMessage ? styles.myMessage : styles.theirMessage,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isMyMessage ? styles.myMessageText : styles.theirMessageText,
            ]}
          >
            {item.content}
          </Text>
          <View style={styles.messageFooter}>
            {item.edited && (
              <Text
                style={[
                  styles.editedLabel,
                  isMyMessage ? styles.myEditedLabel : styles.theirEditedLabel,
                ]}
              >
                edited
              </Text>
            )}
            <Text
              style={[
                styles.timestamp,
                isMyMessage ? styles.myTimestamp : styles.theirTimestamp,
              ]}
            >
              {item.createdAt?.toDate?.()?.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }) || "Now"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.wrapper}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.replace("/messages");
            }}
            style={styles.backButton}
          >
            <Image
              source={require("@/assets/icons/Back.png")}
              style={styles.backIcon}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerInfo}
            onPress={() => {
              if (otherUserId) {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/locker/${otherUserId}`);
              }
            }}
          >
            {otherUserAvatar ? (
              <Image
                source={{ uri: otherUserAvatar }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {otherUserName[0]?.toUpperCase() || "?"}
                </Text>
              </View>
            )}
            <Text style={styles.headerName}>{otherUserName}</Text>
          </TouchableOpacity>

          <View style={{ width: 40 }} />
        </View>

        {/* MESSAGES */}
        {loading && !showingCached ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0D5C3A" />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubble-outline" size={64} color="#CCC" />
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>
              Send the first message to {otherUserName}!
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(i) => i.messageId}
            inverted
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {}}
                tintColor="#0D5C3A"
              />
            }
            contentContainerStyle={styles.messagesList}
          />
        )}

        {/* INPUT */}
        <View style={styles.inputWrapper}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor="#999"
              value={newMessage}
              onChangeText={setNewMessage}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!newMessage.trim() || sending}
              style={[
                styles.sendButton,
                (!newMessage.trim() || sending) && styles.sendButtonDisabled,
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="golf" size={24} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* EDIT MESSAGE MODAL */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setEditModalVisible(false);
          setEditingMessage(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Message</Text>
              <TouchableOpacity
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setEditModalVisible(false);
                  setEditingMessage(null);
                }}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.editInput}
              value={editedContent}
              onChangeText={setEditedContent}
              multiline
              maxLength={1000}
              autoFocus
              placeholder="Edit your message..."
              placeholderTextColor="#999"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setEditModalVisible(false);
                  setEditingMessage(null);
                }}
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveEdit}
                disabled={!editedContent.trim() || isUpdating}
                style={[
                  styles.modalSaveButton,
                  (!editedContent.trim() || isUpdating) &&
                    styles.modalSaveButtonDisabled,
                ]}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ========================= STYLES ========================= */

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  safeTop: {
    backgroundColor: "#0D5C3A",
  },

  keyboardView: {
    flex: 1,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#0D5C3A",
  },

  backButton: {
    padding: 4,
  },

  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFF",
  },

  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
  },

  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },

  avatarText: {
    color: "#0D5C3A",
    fontWeight: "700",
  },

  headerName: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },

  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
  },

  emptySubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
    textAlign: "center",
  },

  messagesList: {
    padding: 16,
    flexGrow: 1,
  },

  messageBubble: {
    maxWidth: "75%",
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },

  myMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#0D5C3A",
    borderBottomRightRadius: 4,
  },

  theirMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },

  messageText: {
    fontFamily: "Caveat_400Regular",
    fontSize: 20,
    lineHeight: 26,
  },

  myMessageText: {
    color: "#FFF",
  },

  theirMessageText: {
    color: "#333",
  },

  messageFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    marginTop: 4,
  },

  editedLabel: {
    fontSize: 10,
    fontStyle: "italic",
  },

  myEditedLabel: {
    color: "rgba(255,255,255,0.5)",
  },

  theirEditedLabel: {
    color: "#999",
  },

  timestamp: {
    fontSize: 11,
  },

  myTimestamp: {
    color: "rgba(255,255,255,0.7)",
    textAlign: "right",
  },

  theirTimestamp: {
    color: "#999",
  },

  inputWrapper: {
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    paddingBottom: Platform.OS === "ios" ? 0 : 8,
  },

  inputContainer: {
    flexDirection: "row",
    padding: 12,
    gap: 12,
    alignItems: "flex-end",
  },

  input: {
    flex: 1,
    backgroundColor: "#F4EED8",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: "Caveat_400Regular",
    fontSize: 20,
    lineHeight: 26,
    maxHeight: 120,
    color: "#333",
  },

  sendButton: {
    backgroundColor: "#0D5C3A",
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },

  sendButtonDisabled: {
    backgroundColor: "#CCC",
    shadowOpacity: 0,
    elevation: 0,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  modalContent: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  modalCloseButton: {
    padding: 4,
  },

  editInput: {
    margin: 16,
    backgroundColor: "#F4EED8",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: "Caveat_400Regular",
    fontSize: 20,
    lineHeight: 26,
    minHeight: 100,
    maxHeight: 200,
    color: "#333",
    textAlignVertical: "top",
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    padding: 16,
    paddingTop: 0,
  },

  modalCancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  modalCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },

  modalSaveButton: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },

  modalSaveButtonDisabled: {
    backgroundColor: "#CCC",
  },

  modalSaveText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
});


