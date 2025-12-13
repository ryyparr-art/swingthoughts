import { auth, db } from "@/constants/firebaseConfig";
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
    updateDoc,
    where
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
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

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [otherUserName, setOtherUserName] = useState("User");

  useEffect(() => {
    if (userId && id) {
      fetchThread();
    }
  }, [userId, id]);

  const fetchThread = async () => {
    if (!userId || !id) return;

    try {
      // Fetch messages between current user and other user
      const q1 = query(
        collection(db, "messages"),
        where("senderId", "==", userId),
        where("receiverId", "==", id)
      );

      const q2 = query(
        collection(db, "messages"),
        where("senderId", "==", id as string),
        where("receiverId", "==", userId)
      );

      const [sent, received] = await Promise.all([
        getDocs(q1),
        getDocs(q2),
      ]);

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

      // Sort by timestamp
      allMessages.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return aTime - bTime;
      });

      // Get other user's name
      const otherUserDoc = await getDoc(doc(db, "users", id as string));
      if (otherUserDoc.exists()) {
        setOtherUserName(otherUserDoc.data().displayName || "User");
      }

      setMessages(allMessages);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching thread:", error);
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !userId || !id) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSending(true);

    try {
      const messageData = {
        messageId: `msg_${Date.now()}`,
        senderId: userId,
        receiverId: id,
        content: newMessage.trim(),
        createdAt: new Date(),
        read: false,
      };

      await addDoc(collection(db, "messages"), messageData);

      // Add to local state immediately
      setMessages((prev) => [...prev, messageData as Message]);
      setNewMessage("");
      setSending(false);
    } catch (error) {
      console.error("Error sending message:", error);
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
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerInfo}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {otherUserName[0]?.toUpperCase() || "?"}
              </Text>
            </View>
            <Text style={styles.headerName}>{otherUserName}</Text>
          </View>

          <View style={{ width: 40 }} />
        </View>

        {/* Messages */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0D5C3A" />
          </View>
        ) : (
          <FlatList
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item, index) => item.messageId || `msg-${index}`}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Input */}
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
              name="send"
              size={20}
              color={!newMessage.trim() || sending ? "#999" : "#FFFFFF"}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
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
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },

  backButton: {
    padding: 4,
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

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  messagesList: {
    padding: 16,
    paddingBottom: 8,
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
    fontSize: 16,
    lineHeight: 22,
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

  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    gap: 8,
  },

  input: {
    flex: 1,
    backgroundColor: "#F4EED8",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 100,
    color: "#333",
  },

  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },

  sendButtonDisabled: {
    backgroundColor: "#E0E0E0",
  },
});