import { auth, db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { doc, setDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import BackIcon from "@/assets/icons/Back.png";

export default function VerificationScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<
    DocumentPicker.DocumentPickerAsset | null
  >(null);

  const handleBack = () => {
    if (loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  /* ---------------- PICK FILE ---------------- */
  const handlePickFile = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (!result.canceled) {
      setSelectedFile(result.assets[0]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  /* ---------------- SUBMIT ---------------- */
  const handleSubmitVerification = async () => {
    if (!selectedFile) {
      Alert.alert(
        "Missing Document",
        "Please upload your verification document first."
      );
      return;
    }

    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const user = auth.currentUser;
      if (!user) throw new Error("No user");

      await setDoc(
        doc(db, "users", user.uid),
        {
          verification: {
            required: true,
            status: "pending",
            submittedAt: new Date(),
            fileName: selectedFile.name,
            fileType: selectedFile.mimeType,
          },
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      setSubmitted(true);
      setLoading(false);
    } catch {
      setLoading(false);
      Alert.alert("Submission Failed", "Please try again.");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Back Button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={handleBack}
        disabled={loading || submitted}
      >
        <Image source={BackIcon} style={styles.backIcon} />
      </TouchableOpacity>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Icon */}
        <View style={styles.header}>
          <Ionicons name="shield-checkmark" size={80} color="#0D5C3A" />
          <Text style={styles.title}>Verification Required</Text>
          <Text style={styles.subtitle}>
            Help us maintain trust in the Swing Thoughts community
          </Text>
        </View>

        {!submitted ? (
          <>
            {/* What to Upload Card */}
            <View style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <Ionicons name="document-text-outline" size={24} color="#0D5C3A" />
                <Text style={styles.infoTitle}>What We Need</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoBullet}>🏌️</Text>
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>PGA Professionals</Text>
                  <Text style={styles.infoText}>PGA membership card or certification</Text>
                </View>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoBullet}>⛳</Text>
                <View style={styles.infoTextContainer}>
                  <Text style={styles.infoLabel}>Golf Courses</Text>
                  <Text style={styles.infoText}>Proof of ownership or management authorization</Text>
                </View>
              </View>
              <View style={styles.acceptedFormats}>
                <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
                <Text style={styles.acceptedText}>
                  Accepted: Photos (JPG, PNG) or PDF documents
                </Text>
              </View>
            </View>

            {/* File Upload Section */}
            {selectedFile ? (
              <View style={styles.selectedFileCard}>
                <View style={styles.filePreview}>
                  <Ionicons 
                    name={selectedFile.mimeType?.includes("pdf") ? "document" : "image"} 
                    size={40} 
                    color="#0D5C3A" 
                  />
                </View>
                <View style={styles.fileInfo}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {selectedFile.name}
                  </Text>
                  <Text style={styles.fileSize}>
                    {selectedFile.size ? `${(selectedFile.size / 1024).toFixed(1)} KB` : ""}
                  </Text>
                </View>
                <TouchableOpacity 
                  onPress={() => {
                    setSelectedFile(null);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  style={styles.removeButton}
                >
                  <Ionicons name="close-circle" size={28} color="#999" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.uploadCard}
                onPress={handlePickFile}
                activeOpacity={0.7}
              >
                <Ionicons name="cloud-upload-outline" size={40} color="#0D5C3A" />
                <Text style={styles.uploadTitle}>Upload Document</Text>
                <Text style={styles.uploadText}>
                  Tap to choose a photo or PDF
                </Text>
              </TouchableOpacity>
            )}

            {/* Action Buttons */}
            <View style={styles.actions}>
              {selectedFile && (
                <TouchableOpacity
                  style={styles.changeButton}
                  onPress={handlePickFile}
                >
                  <Ionicons name="swap-horizontal" size={20} color="#0D5C3A" />
                  <Text style={styles.changeButtonText}>Change File</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (!selectedFile || loading) && styles.buttonDisabled
                ]}
                onPress={handleSubmitVerification}
                disabled={!selectedFile || loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.submitButtonText}>Submit for Review</Text>
                    <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Progress Indicator */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: "80%" }]} />
              </View>
              <Text style={styles.progressText}>Almost there!</Text>
            </View>
          </>
        ) : (
          <>
            {/* Success State */}
            <View style={styles.successCard}>
              <View style={styles.successIconContainer}>
                <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
              </View>
              <Text style={styles.successTitle}>Verification Submitted!</Text>
              <Text style={styles.successMessage}>
                Thanks for submitting your verification. Our team will review it shortly.
              </Text>
              <View style={styles.successInfoBox}>
                <Ionicons name="information-circle-outline" size={20} color="#0D5C3A" />
                <Text style={styles.successInfo}>
                  You can explore the app now, but you'll need approval before posting or commenting.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => router.replace("/onboarding/starter")}
            >
              <Text style={styles.continueButtonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Progress Indicator */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: "90%" }]} />
              </View>
              <Text style={styles.progressText}>One more step!</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#F4EED8" 
  },

  backButton: {
    position: "absolute",
    top: 16,
    left: 24,
    zIndex: 10,
    padding: 8,
  },

  backIcon: {
    width: 28,
    height: 28,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },

  header: {
    alignItems: "center",
    marginBottom: 32,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0D5C3A",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },

  subtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    paddingHorizontal: 20,
    lineHeight: 22,
  },

  infoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },

  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 10,
  },

  infoTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  infoItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
    gap: 12,
  },

  infoBullet: {
    fontSize: 24,
  },

  infoTextContainer: {
    flex: 1,
  },

  infoLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 2,
  },

  infoText: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },

  acceptedFormats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
  },

  acceptedText: {
    fontSize: 13,
    color: "#4CAF50",
    fontWeight: "600",
    flex: 1,
  },

  uploadCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24, // ✅ Reduced from 40 to 24
    marginBottom: 24,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E0E0E0",
    borderStyle: "dashed",
  },

  uploadTitle: {
    fontSize: 16, // ✅ Reduced from 18
    fontWeight: "700",
    color: "#0D5C3A",
    marginTop: 12, // ✅ Reduced from 16
    marginBottom: 4,
  },

  uploadText: {
    fontSize: 13, // ✅ Reduced from 14
    color: "#999",
  },

  selectedFileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 2,
    borderColor: "#4CAF50",
  },

  filePreview: {
    width: 60,
    height: 60,
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },

  fileInfo: {
    flex: 1,
  },

  fileName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  fileSize: {
    fontSize: 13,
    color: "#999",
  },

  removeButton: {
    padding: 4,
  },

  actions: {
    gap: 12,
  },

  changeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    gap: 8,
  },

  changeButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D5C3A",
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    gap: 8,
  },

  buttonDisabled: {
    opacity: 0.4,
  },

  submitButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  successCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },

  successIconContainer: {
    marginBottom: 20,
  },

  successTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 12,
    textAlign: "center",
  },

  successMessage: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },

  successInfoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFF9E6",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFE082",
    gap: 10,
  },

  successInfo: {
    flex: 1,
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },

  continueButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D5C3A",
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    gap: 8,
  },

  continueButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  progressContainer: {
    alignItems: "center",
    marginTop: 16,
  },

  progressBar: {
    width: "100%",
    height: 8,
    backgroundColor: "#E0E0E0",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },

  progressFill: {
    height: "100%",
    backgroundColor: "#0D5C3A",
    borderRadius: 4,
  },

  progressText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
});
