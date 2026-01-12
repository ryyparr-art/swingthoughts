import { auth, db } from "@/constants/firebaseConfig";
import { useCache } from "@/contexts/CacheContext";
import { createNotification } from "@/utils/notificationHelpers";
import {
  checkRateLimit,
  EMAIL_VERIFICATION_MESSAGE,
  getRateLimitMessage,
  isEmailVerified,
  updateRateLimitTimestamp
} from "@/utils/rateLimitHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Message {
  messageId: string;
  senderId: string;
  senderName?: string;
  receiverId: string;
  content: string;
  createdAt: any;
  read: boolean;
}

export default function MessageThreadScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams(); // This is the other user's ID
  const userId = auth.currentUser?.uid;
  const { getCache, setCache } = useCache(); // ✅ Add cache hook

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [showingCached, setShowingCached] = useState(false); // ✅ Cache indicator
  const [refreshing, setRefreshing] = useState(false); // ✅ Pull to refresh
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [otherUserName, setOtherUserName] = useState("User");
  const [otherUserAvatar, setOtherUserAvatar] = useState<string | null>(null);
  
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (userId && id) {
      fetchThreadWithCache();
    }
  }, [userId, id]);

  /* ========================= FETCH WITH CACHE ========================= */

  const fetchThreadWithCache = async () => {
    if (!userId || !id || typeof id !== "string") {
      console.log("❌ Missing userId or id:", { userId, id });
      return;
    }

    try {
      // Create a stable cache key for this conversation
      const conversationKey = [userId, id].sort().join("_");
      
      // Step 1: Try to load from cache (instant)
      const cached = await getCache(`message_thread_${conversationKey}`);
      
      if (cached) {
        console.log("⚡ Message thread cache hit");
        setMessages(cached.messages);
        setOtherUserName(cached.otherUserName);
        setOtherUserAvatar(cached.otherUserAvatar);
        setShowingCached(true);
        setLoading(false);
      }

      // Step 2: Fetch fresh data (always)
      await fetchThread(conversationKey);
    } catch (error) {
      console.error("❌ Message thread cache error:", error);
      await fetchThread();
    }
  };

  const fetchThread = async (conversationKey?: string) => {
    if (!userId || !id || typeof id !== "string") {
      console.log("❌ Missing userId or id:", { userId, id });
      return;
    }

    console.log("📨 Fetching thread between:", userId, "and", id);

    try {
      // Fetch messages between current user and other user
      const q1 = query(
        collection(db, "messages"),
        where("senderId", "==", userId),
        where("receiverId", "==", id)
      );

      const q2 = query(
        collection(db, "messages"),
        where("senderId", "==", id),
        where("receiverId", "==", userId)
      );

      const [sent, received] = await Promise.all([
        getDocs(q1),
        getDocs(q2),
      ]);

      console.log("✉️ Messages found - sent:", sent.size, "received:", received.size);

      const allMessages: Message[] = [];

      sent.forEach((doc) => {
        allMessages.push({ ...doc.data(), messageId: doc.id } as Message);
      });

      received.forEach((doc) => {
        const msg = { ...doc.data(), messageId: doc.id } as Message;
        allMessages.push(msg);

        // Mark as read
        if (!msg.read) {
          updateDoc(doc.ref, { read: true });
        }
      });

      // Sort by timestamp (oldest first for inverted list)
      allMessages.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime; // Descending = newest first, but inverted list will show oldest at top
      });

      // Get other user's name and avatar
      const otherUserDoc = await getDoc(doc(db, "users", id));
      let userName = "User";
      let userAvatar: string | null = null;

      if (otherUserDoc.exists()) {
        const userData = otherUserDoc.data();
        userName = userData.displayName || "User";
        userAvatar = userData.avatar || null;
        console.log("👤 Other user:", userData.displayName);
      } else {
        console.log("⚠️ Other user document not found");
      }

      setOtherUserName(userName);
      setOtherUserAvatar(userAvatar);
      setMessages(allMessages);

      // ✅ Step 3: Update cache
      const cacheKey = conversationKey || [userId, id].sort().join("_");
      await setCache(`message_thread_${cacheKey}`, {
        messages: allMessages,
        otherUserName: userName,
        otherUserAvatar: userAvatar,
      });
      console.log("✅ Message thread cached");

      setShowingCached(false);
      setLoading(false);
      console.log("✅ Thread loaded successfully");
    } catch (error) {
      console.error("❌ Error fetching thread:", error);
      soundPlayer.play('error');
      setShowingCached(false);
      setLoading(false);
    }
  };

  /* ========================= PULL TO REFRESH ========================= */

  const onRefresh = async () => {
    if (!userId || !id || typeof id !== "string") return;
    
    setRefreshing(true);
    setShowingCached(false);
    
    const conversationKey = [userId, id].sort().join("_");
    await fetchThread(conversationKey);
    
    setRefreshing(false);
  };

  /* ========================= SEND MESSAGE ========================= */

  const handleSend = async () => {
    if (!newMessage.trim() || !userId || !id || typeof id !== "string") return;

    // ✅ ANTI-BOT CHECK 1: Email Verification
    if (!isEmailVerified()) {
      soundPlayer.play('error');
      Alert.alert("Email Not Verified", EMAIL_VERIFICATION_MESSAGE);
      return;
    }

    // ✅ ANTI-BOT CHECK 2: Rate Limiting
    const { allowed, remainingSeconds } = await checkRateLimit("message");
    if (!allowed) {
      soundPlayer.play('error');
      Alert.alert("Please Wait", getRateLimitMessage("message", remainingSeconds));
      return;
    }

    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSending(true);

    try {
      const messageData = {
        messageId: `msg_${Date.now()}`,
        senderId: userId,
        receiverId: id,
        content: newMessage.trim(),
        createdAt: serverTimestamp(),
        read: false,
      };

      await addDoc(collection(db, "messages"), messageData);

      // Create notification for receiver
      await createNotification({
        userId: id,
        type: "message",
        actorId: userId,
      });

      // ✅ ANTI-BOT: Update rate limit timestamp
      await updateRateLimitTimestamp("message");

      soundPlayer.play('postThought');
      console.log("✅ Message sent and notification created");

      // Add to local state immediately (with current date for display)
      const newMsg = { ...messageData, createdAt: new Date() } as Message;
      const updatedMessages = [newMsg, ...messages];
      setMessages(updatedMessages);
      
      // ✅ Update cache with new message
      const conversationKey = [userId, id].sort().join("_");
      await setCache(`message_thread_${conversationKey}`, {
        messages: updatedMessages,
        otherUserName,
        otherUserAvatar,
      });

      setNewMessage("");
      setSending(false);
    } catch (error) {
      console.error("Error sending message:", error);
      soundPlayer.play('error');
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMyMessage = item.senderId === userId;

    return (
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
    );
  };

  return (
    <View style={styles.wrapper}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
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
              source={require("@/assets/icons/Back.png")}
              style={styles.backIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>

          <View style={styles.headerInfo}>
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
          </View>

          <View style={{ width: 40 }} />
        </View>

        {/* Cache indicator - only show when cache is displayed */}
        {showingCached && !loading && (
          <View style={styles.cacheIndicator}>
            <ActivityIndicator size="small" color="#0D5C3A" />
            <Text style={styles.cacheText}>Checking for new messages...</Text>
          </View>
        )}

        {/* Messages */}
        {loading && !showingCached ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0D5C3A" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item, index) => item.messageId || `msg-${index}`}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            inverted
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#0D5C3A"
                colors={["#0D5C3A"]}
              />
            }
          />
        )}

        {/* Input */}
        <View style={styles.inputWrapper}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor="#999"
              value={newMessage}
              onChangeText={setNewMessage}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              onPress={handleSend}
              style={[
                styles.sendButton,
                (!newMessage.trim() || sending) && styles.sendButtonDisabled,
              ]}
              disabled={!newMessage.trim() || sending}
            >
              <Ionicons
                name="golf"
                size={24}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },

  backButton: {
    padding: 4,
  },

  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFFFFF",
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
    fontSize: 16,
    fontWeight: "700",
  },

  headerName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  cacheIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
    backgroundColor: "#FFF3CD",
    borderBottomWidth: 1,
    borderBottomColor: "#FFECB5",
  },
  
  cacheText: {
    fontSize: 11,
    color: "#664D03",
    fontWeight: "600",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  messagesList: {
    padding: 16,
    paddingTop: 8,
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
    fontFamily: 'Caveat_400Regular',
    fontSize: 20,
    lineHeight: 26,
  },

  myMessageText: {
    color: "#FFFFFF",
  },

  theirMessageText: {
    color: "#333",
  },

  timestamp: {
    fontSize: 11,
    marginTop: 4,
  },

  myTimestamp: {
    color: "rgba(255,255,255,0.7)",
    textAlign: "right",
  },

  theirTimestamp: {
    color: "#999",
  },

  inputWrapper: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    paddingBottom: Platform.OS === "ios" ? 0 : 8,
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
  },

  input: {
    flex: 1,
    backgroundColor: "#F4EED8",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: 'Caveat_400Regular',
    fontSize: 20,
    lineHeight: 26,
    maxHeight: 100,
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
    backgroundColor: "#CCCCCC",
    shadowOpacity: 0,
    elevation: 0,
  },
});