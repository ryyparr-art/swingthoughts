/**
 * TournamentChatModal Component
 * 
 * Full-screen modal for tournament live chat.
 * Features:
 * - Top 10 leaderboard carousel
 * - Real-time chat messages
 * - @mentions and #hashtags support
 * - Rate limiting (2 second cooldown)
 * - Supports both "live" and "onpremise" chat types
 * - Cross-platform safe area handling (iOS notch/home indicator, Android nav bar)
 */

import { auth, db } from "@/constants/firebaseConfig";
import type { ActiveTournament } from "@/hooks/useTournamentStatus";
import { soundPlayer } from "@/utils/soundPlayer";
import { getUserProfile } from "@/utils/userProfileHelpers";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
    addDoc,
    collection,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    Timestamp,
    where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ============================================================================
// TYPES
// ============================================================================

interface LeaderboardPlayer {
  position: number;
  name: string;
  score: string; // e.g., "-12", "E", "+3"
  thru: string;  // e.g., "F", "12", "10"
  country?: string;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: Timestamp;
  chatType: "live" | "onpremise";
}

interface TournamentChatModalProps {
  visible: boolean;
  tournament: ActiveTournament | null;
  chatType: "live" | "onpremise";
  onClose: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function TournamentChatModal({
  visible,
  tournament,
  chatType,
  onClose,
}: TournamentChatModalProps) {
  const insets = useSafeAreaInsets();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPlayer[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSentTime, setLastSentTime] = useState<number>(0);
  const [leaderboardUpdatedAt, setLeaderboardUpdatedAt] = useState<Date | null>(null);
  
  const flatListRef = useRef<FlatList>(null);
  const currentUserId = auth.currentUser?.uid;

  // Calculate safe padding for different platforms
  const topPadding = Platform.select({
    ios: insets.top,
    android: StatusBar.currentHeight || insets.top || 24,
    default: insets.top,
  });

  const bottomPadding = Platform.select({
    ios: Math.max(insets.bottom, 12),
    android: Math.max(insets.bottom, 16), // Android nav bar
    default: 12,
  });

  // ============================================================================
  // FETCH LEADERBOARD
  // ============================================================================

  useEffect(() => {
    if (!visible || !tournament) return;

    const fetchLeaderboard = async () => {
      try {
        console.log("🏌️ Fetching leaderboard for:", tournament.name);
        
        // Query the tournament document
        const tournamentDoc = await getDocs(
          query(
            collection(db, "tournaments"),
            where("tournId", "==", tournament.tournId),
            where("year", "==", tournament.year),
            limit(1)
          )
        );

        if (!tournamentDoc.empty) {
          const data = tournamentDoc.docs[0].data();
          
          if (data.leaderboard && Array.isArray(data.leaderboard)) {
            // Take top 10
            const top10 = data.leaderboard.slice(0, 10).map((player: any, index: number) => ({
              position: player.position || index + 1,
              name: player.name || player.playerName || "Unknown",
              score: player.score || player.totalScore || "E",
              thru: player.thru || player.holesPlayed || "—",
              country: player.country,
            }));
            setLeaderboard(top10);
            console.log("🏌️ Leaderboard loaded:", top10.length, "players");
          }
          
          if (data.leaderboardUpdatedAt) {
            setLeaderboardUpdatedAt(data.leaderboardUpdatedAt.toDate());
          }
        } else {
          console.log("🏌️ No leaderboard data found");
        }
      } catch (error) {
        console.error("🏌️ Error fetching leaderboard:", error);
      }
    };

    fetchLeaderboard();
    
    // Refresh leaderboard every 5 minutes
    const interval = setInterval(fetchLeaderboard, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [visible, tournament]);

  // ============================================================================
  // SUBSCRIBE TO CHAT MESSAGES
  // ============================================================================

  useEffect(() => {
    if (!visible || !tournament) return;

    setLoading(true);
    setMessages([]); // Clear messages when switching chat type

    const chatCollectionId = `tournamentChats_${tournament.year}_${tournament.tournId}_${chatType}`;
    console.log("🏌️ Subscribing to chat:", chatCollectionId);

    const chatRef = collection(db, chatCollectionId);
    const chatQuery = query(
      chatRef,
      orderBy("createdAt", "desc"),
      limit(100)
    );

    const unsubscribe = onSnapshot(
      chatQuery,
      (snapshot) => {
        const newMessages: ChatMessage[] = [];
        
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          newMessages.push({
            id: doc.id,
            userId: data.userId,
            userName: data.userName || "Anonymous",
            userAvatar: data.userAvatar,
            content: data.content,
            createdAt: data.createdAt,
            chatType: data.chatType || chatType,
          });
        });

        // Reverse to show oldest first (newest at bottom)
        setMessages(newMessages.reverse());
        setLoading(false);
        console.log("🏌️ Chat messages loaded:", newMessages.length);
      },
      (error) => {
        console.error("🏌️ Chat subscription error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [visible, tournament, chatType]);

  // ============================================================================
  // SEND MESSAGE
  // ============================================================================

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !currentUserId || !tournament) return;

    // Rate limiting: 2 second cooldown
    const now = Date.now();
    if (now - lastSentTime < 2000) {
      soundPlayer.play("error");
      Alert.alert("Slow down", "Please wait a moment before sending another message.");
      return;
    }

    setSending(true);

    try {
      // Get user profile for denormalized data
      const userProfile = await getUserProfile(currentUserId);

      const chatCollectionId = `tournamentChats_${tournament.year}_${tournament.tournId}_${chatType}`;

      await addDoc(collection(db, chatCollectionId), {
        userId: currentUserId,
        userName: userProfile.displayName || "Anonymous",
        userAvatar: userProfile.avatar || null,
        content: newMessage.trim(),
        chatType,
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        createdAt: serverTimestamp(),
      });

      soundPlayer.play("postThought");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setNewMessage("");
      setLastSentTime(now);

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (error) {
      console.error("🏌️ Error sending message:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // ============================================================================
  // RENDER LEADERBOARD ITEM
  // ============================================================================

  const renderLeaderboardItem = ({ item }: { item: LeaderboardPlayer }) => {
    const isTopThree = item.position <= 3;
    const scoreColor = item.score.startsWith("-") 
      ? "#C41E3A" // Under par - red
      : item.score === "E" 
        ? "#333" // Even
        : "#0D5C3A"; // Over par - green

    return (
      <View style={[styles.leaderboardCard, isTopThree && styles.leaderboardCardTop]}>
        <View style={[styles.positionBadge, isTopThree && styles.positionBadgeTop]}>
          <Text style={[styles.positionText, isTopThree && styles.positionTextTop]}>
            {item.position}
          </Text>
        </View>
        <Text style={styles.playerName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.scoreContainer}>
          <Text style={[styles.scoreText, { color: scoreColor }]}>
            {item.score}
          </Text>
          <Text style={styles.thruText}>
            {item.thru === "F" ? "F" : `${item.thru}`}
          </Text>
        </View>
      </View>
    );
  };

  // ============================================================================
  // RENDER CHAT MESSAGE
  // ============================================================================

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isOwnMessage = item.userId === currentUserId;
    const timeAgo = getRelativeTime(item.createdAt);

    return (
      <View style={[styles.messageRow, isOwnMessage && styles.messageRowOwn]}>
        {!isOwnMessage && (
          item.userAvatar ? (
            <Image source={{ uri: item.userAvatar }} style={styles.messageAvatar} />
          ) : (
            <View style={styles.messageAvatarPlaceholder}>
              <Text style={styles.messageAvatarText}>
                {item.userName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )
        )}
        
        <View style={[styles.messageBubble, isOwnMessage && styles.messageBubbleOwn]}>
          {!isOwnMessage && (
            <Text style={styles.messageUserName}>{item.userName}</Text>
          )}
          <Text style={[styles.messageContent, isOwnMessage && styles.messageContentOwn]}>
            {renderMessageContent(item.content)}
          </Text>
          <Text style={[styles.messageTime, isOwnMessage && styles.messageTimeOwn]}>
            {timeAgo}
          </Text>
        </View>
      </View>
    );
  };

  // ============================================================================
  // RENDER MESSAGE CONTENT WITH @MENTIONS AND #HASHTAGS
  // ============================================================================

  const renderMessageContent = (content: string) => {
    // Split by @mentions and #hashtags
    const parts = content.split(/(@\w+|#\w+)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith("@")) {
        return (
          <Text key={index} style={styles.mention}>
            {part}
          </Text>
        );
      } else if (part.startsWith("#")) {
        return (
          <Text key={index} style={styles.hashtag}>
            {part}
          </Text>
        );
      }
      return part;
    });
  };

  // ============================================================================
  // HELPER: RELATIVE TIME
  // ============================================================================

  const getRelativeTime = (timestamp: Timestamp | null) => {
    if (!timestamp) return "";
    
    try {
      const now = new Date();
      const messageDate = timestamp.toDate();
      const diffMs = now.getTime() - messageDate.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return "now";
      if (diffMins === 1) return "1m";
      if (diffMins < 60) return `${diffMins}m`;
      
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours === 1) return "1h";
      if (diffHours < 24) return `${diffHours}h`;
      
      return messageDate.toLocaleDateString();
    } catch {
      return "";
    }
  };

  // ============================================================================
  // HANDLE CLOSE
  // ============================================================================

  const handleClose = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  // ============================================================================
  // RENDER CHAT CONTENT (extracted for platform-specific wrapper)
  // ============================================================================

  const renderChatContent = () => {
    const chatTypeIconName = chatType === "onpremise" ? "location" : "chatbubbles";
    
    return (
      <>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0D5C3A" />
            <Text style={styles.loadingText}>Loading chat...</Text>
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name={chatTypeIconName as any} size={48} color="#999" />
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>
              {chatType === "onpremise" 
                ? "Chat with others at the tournament!" 
                : "Be the first to say something!"}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              flatListRef.current?.scrollToEnd({ animated: false });
            }}
          />
        )}

        {/* Input Bar with Safe Area for Home Indicator / Android Nav Bar */}
        <View style={[styles.inputContainer, { paddingBottom: bottomPadding }]}>
          <TextInput
            style={styles.input}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder="Type a message..."
            placeholderTextColor="#999"
            maxLength={280}
            multiline
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!newMessage.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="send" size={20} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
      </>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!tournament) return null;

  const chatTypeLabel = chatType === "onpremise" ? "On-Premise Chat" : "Tournament Discussion";
  const chatTypeIcon = chatType === "onpremise" ? "location" : "chatbubbles";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
      statusBarTranslucent={Platform.OS === "android"}
    >
      <View style={styles.container}>
        {/* Safe Area for Notch/Status Bar - Green background */}
        <View style={[styles.statusBarBackground, { height: topPadding }]} />
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image
              source={require("@/assets/icons/LowLeaderTrophy.png")}
              style={styles.headerTrophy}
            />
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {tournament.name}
              </Text>
              <View style={styles.chatTypeRow}>
                <Ionicons name={chatTypeIcon as any} size={12} color="#A8D5BA" />
                <Text style={styles.headerSubtitle}>{chatTypeLabel}</Text>
              </View>
            </View>
          </View>
          
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#0D5C3A" />
          </TouchableOpacity>
        </View>

        {/* Leaderboard Carousel */}
        {leaderboard.length > 0 && (
          <View style={styles.leaderboardSection}>
            <View style={styles.leaderboardHeader}>
              <Text style={styles.leaderboardTitle}>Leaderboard</Text>
              {leaderboardUpdatedAt && (
                <Text style={styles.leaderboardUpdated}>
                  Updated {getRelativeTime(Timestamp.fromDate(leaderboardUpdatedAt))} ago
                </Text>
              )}
            </View>
            <FlatList
              data={leaderboard}
              renderItem={renderLeaderboardItem}
              keyExtractor={(item) => `leader-${item.position}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.leaderboardList}
            />
          </View>
        )}

        {/* Chat Messages */}
        {Platform.OS === "ios" ? (
          <KeyboardAvoidingView
            behavior="padding"
            style={styles.chatContainer}
            keyboardVerticalOffset={0}
          >
            {renderChatContent()}
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.chatContainer}>
            {renderChatContent()}
          </View>
        )}
      </View>
    </Modal>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  
  // Status bar background (for notch/status bar)
  statusBarBackground: {
    backgroundColor: "#0D5C3A",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
    borderBottomWidth: 1,
    borderBottomColor: "#0A4A2E",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  headerTrophy: {
    width: 32,
    height: 32,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  chatTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#A8D5BA",
  },
  closeButton: {
    padding: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
  },

  // Leaderboard
  leaderboardSection: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  leaderboardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  leaderboardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  leaderboardUpdated: {
    fontSize: 11,
    color: "#999",
  },
  leaderboardList: {
    paddingHorizontal: 12,
    gap: 8,
  },
  leaderboardCard: {
    backgroundColor: "#F8F8F8",
    borderRadius: 8,
    padding: 10,
    minWidth: 100,
    alignItems: "center",
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  leaderboardCardTop: {
    backgroundColor: "#FFF9E6",
    borderColor: "#FFD700",
  },
  positionBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#E0E0E0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  positionBadgeTop: {
    backgroundColor: "#FFD700",
  },
  positionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666",
  },
  positionTextTop: {
    color: "#0D5C3A",
  },
  playerName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
    marginBottom: 4,
  },
  scoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scoreText: {
    fontSize: 16,
    fontWeight: "800",
  },
  thruText: {
    fontSize: 11,
    color: "#999",
  },

  // Chat
  chatContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 4,
    textAlign: "center",
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },

  // Message Bubbles
  messageRow: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "flex-end",
  },
  messageRowOwn: {
    justifyContent: "flex-end",
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  messageAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  messageAvatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },
  messageBubble: {
    maxWidth: "75%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  messageBubbleOwn: {
    backgroundColor: "#0D5C3A",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  messageUserName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 4,
  },
  messageContent: {
    fontSize: 15,
    color: "#333",
    lineHeight: 20,
  },
  messageContentOwn: {
    color: "#FFFFFF",
  },
  messageTime: {
    fontSize: 10,
    color: "#999",
    marginTop: 4,
    textAlign: "right",
  },
  messageTimeOwn: {
    color: "rgba(255, 255, 255, 0.7)",
  },
  mention: {
    color: "#0D5C3A",
    fontWeight: "700",
  },
  hashtag: {
    color: "#1DA1F2",
    fontWeight: "600",
  },

  // Input
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#F4F4F4",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: "#333",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#CCC",
  },
});