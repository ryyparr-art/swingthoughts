/**
 * CreateAnnouncementModal Component
 * 
 * Modal for commissioners/managers to create league announcements.
 * Kept separate from home.tsx to minimize code complexity.
 * 
 * Usage in home.tsx:
 * 1. Import: import CreateAnnouncementModal from "@/components/leagues/CreateAnnouncementModal";
 * 2. Add state: const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
 * 3. Render: <CreateAnnouncementModal visible={showAnnouncementModal} onClose={() => setShowAnnouncementModal(false)} leagueId={selectedLeagueId} />
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface CreateAnnouncementModalProps {
  visible: boolean;
  onClose: () => void;
  leagueId: string | null;
}

export default function CreateAnnouncementModal({
  visible,
  onClose,
  leagueId,
}: CreateAnnouncementModalProps) {
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);

  const currentUserId = auth.currentUser?.uid;

  const handlePost = async () => {
    if (!message.trim() || !leagueId || !currentUserId) {
      Alert.alert("Error", "Please enter a message.");
      return;
    }

    try {
      setPosting(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Get current user's info for the announcement
      const userDoc = await getDoc(doc(db, "users", currentUserId));
      const userData = userDoc.data();

      // Create the announcement
      const announcementsRef = collection(db, "leagues", leagueId, "announcements");
      await addDoc(announcementsRef, {
        type: "announcement",
        message: message.trim(),
        authorId: currentUserId,
        authorName: userData?.displayName || "Commissioner",
        authorAvatar: userData?.avatar || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Cloud Function (onLeagueAnnouncementCreated) handles sending notifications to all members

      soundPlayer.play("postThought");
      setMessage("");
      onClose();
      
      Alert.alert("Posted! 📢", "Your announcement has been sent to all league members.");
    } catch (error) {
      console.error("Error posting announcement:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to post announcement. Please try again.");
    } finally {
      setPosting(false);
    }
  };

  const handleClose = () => {
    if (message.trim() && !posting) {
      Alert.alert(
        "Discard Announcement?",
        "You have unsaved changes. Are you sure you want to discard?",
        [
          { text: "Keep Editing", style: "cancel" },
          { 
            text: "Discard", 
            style: "destructive", 
            onPress: () => {
              setMessage("");
              onClose();
            }
          },
        ]
      );
    } else {
      setMessage("");
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              disabled={posting}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
            
            <Text style={styles.title}>New Announcement</Text>
            
            <TouchableOpacity
              onPress={handlePost}
              style={[
                styles.postButton,
                (!message.trim() || posting) && styles.postButtonDisabled,
              ]}
              disabled={!message.trim() || posting}
            >
              {posting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.postButtonText}>Post</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Message Input */}
          <View style={styles.inputContainer}>
            <View style={styles.iconContainer}>
              <Ionicons name="megaphone" size={24} color="#0D5C3A" />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Write your announcement to the league..."
              placeholderTextColor="#999"
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={6}
              maxLength={500}
              textAlignVertical="top"
              autoFocus
              editable={!posting}
            />
          </View>

          {/* Character count */}
          <View style={styles.footer}>
            <Text style={styles.charCount}>
              {message.length}/500
            </Text>
            <Text style={styles.hint}>
              All league members will be notified
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  postButton: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 70,
    alignItems: "center",
  },
  postButtonDisabled: {
    backgroundColor: "#CCC",
  },
  postButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
  inputContainer: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(13, 92, 58, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#333",
    minHeight: 120,
    maxHeight: 200,
    paddingTop: 0,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  charCount: {
    fontSize: 13,
    color: "#999",
  },
  hint: {
    fontSize: 13,
    color: "#0D5C3A",
    fontWeight: "500",
  },
});