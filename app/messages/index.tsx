import BottomActionBar from "@/components/navigation/BottomActionBar";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";
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
  Platform,
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
  receiverId: string;
  content: string;
  createdAt: any;
  read: boolean;
}

export default function MessagesScreen() {
  const router = useRouter();
  const userId = auth.currentUser?.uid;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      fetchMessages();
    }
  }, [userId]);

  const fetchMessages = async () => {
    if (!userId) return;

    try {
      // Simpler query without orderBy to avoid index requirement
      const q = query(
        collection(db, "messages"),
        where("receiverId", "==", userId)
      );

      const querySnapshot = await getDocs(q);
      const messagesData: Message[] = [];

      // Fetch sender names
      for (const docSnap of querySnapshot.docs) {
        const messageData = docSnap.data() as Message;
        
        // Get sender's display name
        try {
          const senderDoc = await getDoc(doc(db, "users", messageData.senderId));
          if (senderDoc.exists()) {
            messageData.senderName = senderDoc.data().displayName || "Anonymous";
          } else {
            messageData.senderName = "Anonymous";
          }
        } catch (err) {
          messageData.senderName = "Anonymous";
        }

        messagesData.push(messageData);
      }

      // Sort in JavaScript instead of Firestore
      messagesData.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime; // Descending order (newest first)
      });

      setMessages(messagesData);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching messages:", error);
      setLoading(false);
    }
  };

  const handleComposeNew = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/messages/select-partner");
  };

  const handleDeleteMessage = async (messageId: string, senderId: string) => {
    // Get fresh userId
    const currentUserId = auth.currentUser?.uid;
    
    console.log("Delete attempt - userId:", currentUserId, "senderId:", senderId);
    
    if (!currentUserId) {
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
                onPress: () => resolve(false),
              },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => resolve(true),
              },
            ]
          );
        });
      }
    };

    const shouldDelete = await confirmDelete();
    if (!shouldDelete) return;

    try {
      console.log("Starting delete with userId:", currentUserId, "senderId:", senderId);
      
      // Delete all messages between current user and the sender
      const q1 = query(
        collection(db, "messages"),
        where("senderId", "==", currentUserId),
        where("receiverId", "==", senderId)
      );

      const q2 = query(
        collection(db, "messages"),
        where("senderId", "==", senderId),
        where("receiverId", "==", currentUserId)
      );

      const [sent, received] = await Promise.all([
        getDocs(q1),
        getDocs(q2),
      ]);

      console.log("Found messages to delete - sent:", sent.size, "received:", received.size);

      const deletePromises = [];
      
      sent.forEach((docSnap) => {
        deletePromises.push(deleteDoc(docSnap.ref));
      });

      received.forEach((docSnap) => {
        deletePromises.push(deleteDoc(docSnap.ref));
      });

      await Promise.all(deletePromises);

      console.log("Successfully deleted", deletePromises.length, "messages");

      // Remove from local state
      setMessages((prev) => prev.filter((msg) => msg.senderId !== senderId));

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        alert("Conversation deleted successfully");
      }
    } catch (error) {
      console.error("Error deleting conversation:", error);
      if (Platform.OS === 'web') {
        alert("Failed to delete conversation: " + (error as Error).message);
      } else {
        Alert.alert("Error", "Failed to delete conversation");
      }
    }
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={styles.messageWrapper}>
      <TouchableOpacity
        style={[styles.messageCard, !item.read && styles.unreadCard]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          // Navigate to thread with the sender's ID
          router.push(`/messages/${item.senderId}`);
        }}
      >
        <View style={styles.messageHeader}>
          <View style={styles.senderInfo}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {item.senderName[0]?.toUpperCase() || "?"}
              </Text>
            </View>
            <View>
              <Text style={styles.senderName}>{item.senderName}</Text>
              <Text style={styles.timestamp}>
                {item.createdAt?.toDate?.()?.toLocaleDateString() || "Recently"}
              </Text>
            </View>
          </View>
          {!item.read && <View style={styles.unreadBadge} />}
        </View>

        <Text style={styles.messageContent} numberOfLines={2}>
          {item.content}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeleteMessage(item.messageId, item.senderId)}
      >
        <Ionicons name="trash-outline" size={20} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      <TopNavBar />

      <View style={styles.header}>
        <Text style={styles.title}>Fanmail</Text>
        <TouchableOpacity
          onPress={handleComposeNew}
          style={styles.composeButton}
        >
          <Ionicons name="create-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D5C3A" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.messageId}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="mail-outline" size={64} color="#999" />
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>
                Your fanmail will appear here
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#F4EED8",
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0D5C3A",
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
    paddingBottom: 32,
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
    fontSize: 15,
    lineHeight: 22,
    color: "#333",
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