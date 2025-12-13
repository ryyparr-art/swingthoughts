import { auth, db } from "@/constants/firebaseConfig";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { deleteUser, signOut } from "firebase/auth";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import BackIcon from "@/assets/icons/Back.png";
import CloseIcon from "@/assets/icons/Close.png";

export default function VerificationScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<
    DocumentPicker.DocumentPickerAsset | null
  >(null);

  /* ---------------- CANCEL ---------------- */
  const handleCancel = () => {
    Alert.alert(
      "Cancel Setup?",
      "If you cancel now, your account will be deleted and you'll need to start over.",
      [
        { text: "Continue Setup", style: "cancel" },
        {
          text: "Cancel & Delete Account",
          style: "destructive",
          onPress: async () => {
            try {
              const user = auth.currentUser;
              if (!user) {
                router.replace("/");
                return;
              }

              await deleteDoc(doc(db, "users", user.uid));
              await deleteUser(user);
              await signOut(auth);

              router.replace("/");
            } catch {
              Alert.alert("Error", "Could not fully delete account.");
            }
          },
        },
      ]
    );
  };

  /* ---------------- BACK ---------------- */
  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace("/auth/user-type");
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
    }
  };

  /* ---------------- SUBMIT ---------------- */
  const handleSubmitVerification = async () => {
    if (!selectedFile) {
      Alert.alert(
        "Missing document",
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
      Alert.alert("Submission failed", "Please try again.");
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Top Nav */}
      <View style={styles.topNav}>
        <TouchableOpacity onPress={handleBack}>
          <Image source={BackIcon} style={styles.navIcon} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleCancel}>
          <Image source={CloseIcon} style={styles.navIcon} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Verification Required</Text>

        <Text style={styles.description}>
          To maintain trust on Swing Thoughts, verification is required.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What to upload</Text>
          <Text style={styles.cardText}>
            • PGA Professionals: PGA card{"\n"}
            • Courses: Proof of ownership or management
          </Text>
        </View>

        {!submitted && (
          <>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handlePickFile}
            >
              <Text style={styles.secondaryText}>
                {selectedFile ? selectedFile.name : "Choose File"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.uploadButton}
              onPress={handleSubmitVerification}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.uploadText}>Submit Verification</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {submitted && (
          <>
            <Text style={styles.pendingText}>
              Verification submitted. Admin approval required.
            </Text>

            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => router.replace("/clubhouse")}
            >
              <Text style={styles.continueText}>Enter App</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },

  topNav: {
    position: "absolute",
    top: 48,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 100,
  },

  navIcon: { width: 28, height: 28 },

  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0D5C3A",
    textAlign: "center",
    marginBottom: 12,
  },

  description: {
    fontSize: 16,
    color: "#555",
    textAlign: "center",
    marginBottom: 24,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    marginBottom: 24,
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
  },

  cardText: { fontSize: 14, color: "#333", lineHeight: 20 },

  secondaryButton: {
    borderWidth: 2,
    borderColor: "#0D5C3A",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },

  secondaryText: {
    color: "#0D5C3A",
    fontWeight: "700",
  },

  uploadButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },

  uploadText: { color: "#fff", fontWeight: "700" },

  pendingText: {
    textAlign: "center",
    color: "#0D5C3A",
    marginBottom: 16,
    fontWeight: "600",
  },

  continueButton: {
    borderWidth: 2,
    borderColor: "#0D5C3A",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },

  continueText: {
    color: "#0D5C3A",
    fontWeight: "700",
  },
});

