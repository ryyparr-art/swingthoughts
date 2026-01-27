import { auth, db } from "@/constants/firebaseConfig";
import * as Haptics from "expo-haptics";
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  postId: string;
  postAuthorId: string;
  postAuthorName: string;
  postContent: string;
}

type ReportCategory = "spam" | "harassment" | "violence" | "inappropriate" | "false_info" | "other";

interface CategoryOption {
  id: ReportCategory;
  label: string;
  emoji: string;
}

const CATEGORIES: CategoryOption[] = [
  { id: "spam", label: "Spam or misleading", emoji: "🚫" },
  { id: "harassment", label: "Harassment or hate speech", emoji: "😡" },
  { id: "violence", label: "Violence or dangerous content", emoji: "⚠️" },
  { id: "inappropriate", label: "Inappropriate content", emoji: "🔞" },
  { id: "false_info", label: "False information", emoji: "❌" },
  { id: "other", label: "Other", emoji: "📝" },
];

export default function ReportModal({
  visible,
  onClose,
  postId,
  postAuthorId,
  postAuthorName,
  postContent,
}: ReportModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    setSelectedCategory(null);
    setDetails("");
    onClose();
  };

  const handleSubmit = async () => {
    // 🔍 DEBUG: Check auth state
    console.log("🔍 Debug - Current user:", {
      uid: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      isSignedIn: !!auth.currentUser,
    });
    
    if (!selectedCategory) {
      Alert.alert("Select Category", "Please select a reason for reporting.");
      return;
    }

    if (selectedCategory === "other" && !details.trim()) {
      Alert.alert("Provide Details", "Please provide details for 'Other' category.");
      return;
    }

    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      // Check if user has already reported this post
      const existingReportQuery = query(
        collection(db, "reports"),
        where("reporterId", "==", auth.currentUser!.uid),
        where("postId", "==", postId)
      );
      
      console.log("🔍 Checking for existing reports...");
      const existingReports = await getDocs(existingReportQuery);
      
      if (!existingReports.empty) {
        Alert.alert(
          "Already Reported",
          "You've already reported this post. We'll review it soon."
        );
        setSubmitting(false);
        handleClose();
        return;
      }

      // Create report
      console.log("🚨 About to create report with reporterId:", auth.currentUser?.uid);
      await addDoc(collection(db, "reports"), {
        reporterId: auth.currentUser!.uid,
        reporterName: auth.currentUser?.displayName || "Anonymous",
        postId,
        postAuthorId,
        postAuthorName,
        postContent: postContent.substring(0, 200), // First 200 chars as snippet
        category: selectedCategory,
        details: details.trim() || null,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      console.log("✅ Report created successfully!");
      setSubmitting(false);
      
      Alert.alert(
        "Report Submitted",
        "Thanks for reporting. We'll review this shortly.",
        [{ text: "OK", onPress: handleClose }]
      );
    } catch (error: any) {
      console.error("❌ Error submitting report:", {
        code: error?.code,
        message: error?.message,
        name: error?.name,
        fullError: error,
      });
      setSubmitting(false);
      Alert.alert("Error", "Failed to submit report. Please try again.");
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Report Post</Text>
              <Text style={styles.subtitle}>Help us keep the community safe</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Image 
                source={require("@/assets/icons/Close.png")} 
                style={styles.closeIcon}
              />
            </TouchableOpacity>
          </View>

          <KeyboardAwareScrollView 
            style={styles.content} 
            showsVerticalScrollIndicator={false}
            enableOnAndroid={true}
            enableAutomaticScroll={true}
            keyboardShouldPersistTaps="handled"
            extraScrollHeight={Platform.OS === "ios" ? 120 : 80}
            extraHeight={Platform.OS === "ios" ? 120 : 80}
          >
            {/* Categories */}
            <Text style={styles.sectionLabel}>Select a reason:</Text>
            {CATEGORIES.map((category) => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.categoryOption,
                  selectedCategory === category.id && styles.categoryOptionSelected,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedCategory(category.id);
                }}
              >
                <View style={styles.categoryContent}>
                  <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                  <Text
                    style={[
                      styles.categoryLabel,
                      selectedCategory === category.id && styles.categoryLabelSelected,
                    ]}
                  >
                    {category.label}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radioButton,
                    selectedCategory === category.id && styles.radioButtonSelected,
                  ]}
                >
                  {selectedCategory === category.id && <View style={styles.radioButtonInner} />}
                </View>
              </TouchableOpacity>
            ))}

            {/* Additional Details */}
            <Text style={[styles.sectionLabel, styles.sectionLabelTop]}>
              Additional details (optional):
            </Text>
            <TextInput
              style={styles.detailsInput}
              placeholder="Provide more context..."
              placeholderTextColor="#999"
              value={details}
              onChangeText={setDetails}
              multiline
              numberOfLines={4}
              maxLength={500}
              textAlignVertical="top"
            />
            <Text style={styles.characterCount}>{details.length}/500</Text>

            {/* Spacer for keyboard */}
            <View style={{ height: 20 }} />
          </KeyboardAwareScrollView>

          {/* Footer Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={submitting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.submitButton,
                (!selectedCategory || submitting) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!selectedCategory || submitting}
            >
              <Text
                style={[
                  styles.submitButtonText,
                  (!selectedCategory || submitting) && styles.submitButtonTextDisabled,
                ]}
              >
                {submitting ? "Submitting..." : "Submit Report"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },

  modalContainer: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingBottom: 20,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },

  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 14,
    color: "#666",
  },

  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },

  closeIcon: {
    width: 24,
    height: 24,
    tintColor: "#666",
  },

  content: {
    padding: 20,
  },

  sectionLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 12,
  },

  sectionLabelTop: {
    marginTop: 20,
  },

  categoryOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#F7F8FA",
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },

  categoryOptionSelected: {
    backgroundColor: "#E8F5E9",
    borderColor: "#0D5C3A",
  },

  categoryContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  categoryEmoji: {
    fontSize: 20,
    marginRight: 12,
  },

  categoryLabel: {
    fontSize: 15,
    color: "#333",
    fontWeight: "600",
    flex: 1,
  },

  categoryLabelSelected: {
    color: "#0D5C3A",
    fontWeight: "700",
  },

  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#CCC",
    alignItems: "center",
    justifyContent: "center",
  },

  radioButtonSelected: {
    borderColor: "#0D5C3A",
  },

  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#0D5C3A",
  },

  detailsInput: {
    backgroundColor: "#F7F8FA",
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: "#333",
    minHeight: 100,
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },

  characterCount: {
    fontSize: 12,
    color: "#999",
    textAlign: "right",
    marginTop: 4,
  },

  footer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },

  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  cancelButton: {
    backgroundColor: "#F0F0F0",
  },

  cancelButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#666",
  },

  submitButton: {
    backgroundColor: "#0D5C3A",
  },

  submitButtonDisabled: {
    backgroundColor: "#CCC",
  },

  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },

  submitButtonTextDisabled: {
    color: "#999",
  },
});