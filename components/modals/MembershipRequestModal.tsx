import { auth, db, storage } from "@/constants/firebaseConfig";
import { createNotification } from "@/utils/notificationHelpers";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import {
    addDoc,
    arrayUnion,
    collection,
    doc,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Props {
  visible: boolean;
  onClose: () => void;
  courseId: number;
  courseName: string;
  onSuccess?: () => void; // Callback after successful submission
}

export default function MembershipRequestModal({
  visible,
  onClose,
  courseId,
  courseName,
  onSuccess,
}: Props) {
  const currentUserId = auth.currentUser?.uid;

  const [membershipNumber, setMembershipNumber] = useState("");
  const [proofImageUri, setProofImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  /* ========================= IMAGE PICKER ========================= */

  const pickProofImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProofImageUri(result.assets[0].uri);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const removeProofImage = () => {
    setProofImageUri(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  /* ========================= SUBMIT REQUEST ========================= */

  const handleSubmit = async () => {
    if (!currentUserId) {
      Alert.alert("Error", "You must be logged in to submit a membership request");
      return;
    }

    if (!proofImageUri) {
      Alert.alert("Missing Proof", "Please upload proof of your membership (membership card, portal screenshot, or receipt)");
      return;
    }

    try {
      setUploading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // 1. Upload proof image to Firebase Storage
      const response = await fetch(proofImageUri);
      const blob = await response.blob();
      const imagePath = `course-memberships/${currentUserId}/${courseId}/${Date.now()}.jpg`;
      const storageRef = ref(storage, imagePath);

      await uploadBytes(storageRef, blob);
      const proofImageUrl = await getDownloadURL(storageRef);

      // 2. Create membership request document
      await addDoc(collection(db, "course_memberships"), {
        userId: currentUserId,
        courseId: courseId,
        courseName: courseName,
        status: "pending",
        proofImageUrl: proofImageUrl,
        membershipNumber: membershipNumber.trim() || null,
        submittedAt: serverTimestamp(),
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
      });

      // 3. Update user document - add to pendingMembershipCourses
      const userRef = doc(db, "users", currentUserId);
      await updateDoc(userRef, {
        pendingMembershipCourses: arrayUnion(courseId),
      });

      // 4. Send notification to user
      await createNotification({
        userId: currentUserId,
        type: "membership_submitted",
        courseId: courseId,
        courseName: courseName,
        customTitle: "Membership Request Submitted",
      });

      setUploading(false);

      // Show success message
      Alert.alert(
        "Request Submitted ✅",
        `Your membership request for ${courseName} has been submitted and is pending review. We'll notify you once it's been processed.`,
        [
          {
            text: "OK",
            onPress: () => {
              // Reset form
              setMembershipNumber("");
              setProofImageUri(null);
              
              // Call success callback
              if (onSuccess) {
                onSuccess();
              }
              
              // Close modal
              onClose();
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error submitting membership request:", error);
      setUploading(false);
      Alert.alert("Error", "Failed to submit membership request. Please try again.");
    }
  };

  const handleClose = () => {
    if (!uploading) {
      // Reset form
      setMembershipNumber("");
      setProofImageUri(null);
      onClose();
    }
  };

  /* ========================= RENDER ========================= */

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerButton} />

            <Text style={styles.headerTitle}>Declare Membership</Text>

            <TouchableOpacity
              onPress={handleClose}
              style={styles.headerButton}
              disabled={uploading}
            >
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Info Box */}
            <View style={styles.infoBox}>
              <Ionicons name="ribbon" size={40} color="#0D5C3A" />
              <Text style={styles.infoTitle}>Verify Your Membership</Text>
              <Text style={styles.infoText}>
                Submit proof of your membership at <Text style={styles.courseName}>{courseName}</Text> for verification.
              </Text>
            </View>

            {/* Course Name (Read-only) */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Course</Text>
              <View style={styles.readOnlyField}>
                <Ionicons name="flag" size={20} color="#0D5C3A" />
                <Text style={styles.readOnlyText}>{courseName}</Text>
              </View>
            </View>

            {/* Membership Number (Optional) */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                Membership Number{" "}
                <Text style={styles.optionalText}>(Optional)</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 12345"
                value={membershipNumber}
                onChangeText={setMembershipNumber}
                keyboardType="default"
                autoCapitalize="characters"
                editable={!uploading}
              />
            </View>

            {/* Proof Image Upload */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                Upload Proof of Membership{" "}
                <Text style={styles.requiredText}>*</Text>
              </Text>
              <Text style={styles.sectionDescription}>
                Accepted: Membership card, portal screenshot, receipt, or invoice
              </Text>

              <TouchableOpacity
                style={styles.imageUploadBox}
                onPress={pickProofImage}
                disabled={uploading}
              >
                {proofImageUri ? (
                  <Image
                    source={{ uri: proofImageUri }}
                    style={styles.uploadedImage}
                  />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="camera" size={48} color="#0D5C3A" />
                    <Text style={styles.imagePlaceholderText}>
                      Tap to upload proof
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {proofImageUri && (
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={removeProofImage}
                  disabled={uploading}
                >
                  <Text style={styles.removeImageText}>✕ Remove Image</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Privacy Notice */}
            <View style={styles.noticeBox}>
              <Ionicons name="information-circle" size={20} color="#666" />
              <Text style={styles.noticeText}>
                Your membership information will be reviewed by our team. You'll receive a notification once your request has been processed.
              </Text>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!proofImageUri || uploading) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!proofImageUri || uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Submit for Review</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

/* ========================= STYLES ========================= */

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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },

  headerButton: {
    width: 40,
    alignItems: "center",
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    flex: 1,
  },

  content: {
    flex: 1,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  infoBox: {
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#0D5C3A",
  },

  infoTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
    marginTop: 12,
    marginBottom: 8,
  },

  infoText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },

  courseName: {
    fontWeight: "700",
    color: "#0D5C3A",
  },

  section: {
    marginBottom: 24,
  },

  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
  },

  optionalText: {
    fontSize: 12,
    fontWeight: "400",
    color: "#666",
    fontStyle: "italic",
  },

  requiredText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FF3B30",
  },

  sectionDescription: {
    fontSize: 12,
    color: "#666",
    marginBottom: 12,
    lineHeight: 16,
  },

  readOnlyField: {
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  readOnlyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  input: {
    backgroundColor: "#FFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    padding: 12,
    fontSize: 16,
  },

  imageUploadBox: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    borderStyle: "dashed",
    backgroundColor: "#F5F5F5",
    overflow: "hidden",
  },

  uploadedImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  imagePlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  imagePlaceholderText: {
    fontSize: 14,
    color: "#0D5C3A",
    marginTop: 12,
    textAlign: "center",
    fontWeight: "600",
  },

  removeImageButton: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#FF3B30",
    borderRadius: 6,
    marginTop: 12,
  },

  removeImageText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 13,
  },

  noticeBox: {
    backgroundColor: "#FFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    padding: 12,
    flexDirection: "row",
    gap: 8,
    marginBottom: 24,
  },

  noticeText: {
    fontSize: 12,
    color: "#666",
    lineHeight: 18,
    flex: 1,
  },

  submitButton: {
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },

  submitButtonDisabled: {
    opacity: 0.5,
  },

  submitButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});