import { auth, db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";

import BackIcon from "@/assets/icons/Back.png";

export default function SetupLocker() {
  const router = useRouter();

  const [homeCourse, setHomeCourse] = useState("");
  const [gameIdentity, setGameIdentity] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /* ---------------- BACK ---------------- */
  const handleBack = () => {
    if (loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace("/onboarding/setup-profile");
  };

  /* ---------------- CONTINUE ---------------- */
  const handleContinue = async () => {
    setError("");

    // Validation (both fields optional, but if provided, must be valid)
    if (homeCourse.trim() && homeCourse.trim().length < 2) {
      setError("Course name must be at least 2 characters");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (gameIdentity.trim() && gameIdentity.trim().length < 2) {
      setError("Game identity must be at least 2 characters");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No user logged in");

      const userRef = doc(db, "users", user.uid);

      const lockerData: any = {
        lockerCompleted: true,
        updatedAt: new Date().toISOString(),
      };

      if (homeCourse.trim()) lockerData.homeCourse = homeCourse.trim();
      if (gameIdentity.trim()) lockerData.gameIdentity = gameIdentity.trim();

      await setDoc(userRef, lockerData, { merge: true });

      const snap = await getDoc(userRef);
      const userData = snap.data();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Check if verification is needed
      if (
        userData?.userType === "PGA Professional" ||
        userData?.userType === "Course"
      ) {
        router.replace("/onboarding/verification");
        return;
      }

      router.replace("/onboarding/starter");
    } catch (err) {
      console.error("Error saving locker info:", err);
      setError("Failed to save information. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setLoading(false);
    }
  };

  /* ---------------- SKIP ---------------- */
  const handleSkip = async () => {
    if (loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const user = auth.currentUser;
      if (!user) return;

      const userRef = doc(db, "users", user.uid);

      await setDoc(
        userRef,
        {
          lockerCompleted: true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      const snap = await getDoc(userRef);
      const userData = snap.data();

      if (
        userData?.userType === "PGA Professional" ||
        userData?.userType === "Course"
      ) {
        router.replace("/onboarding/verification");
        return;
      }

      router.replace("/onboarding/starter");
    } catch (err) {
      console.error("Skip locker failed:", err);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Back Button */}
      <View pointerEvents="box-none" style={styles.topNav}>
        <TouchableOpacity
          onPress={handleBack}
          disabled={loading}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Image source={BackIcon} style={styles.navIcon} />
        </TouchableOpacity>
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          enableOnAndroid
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          extraScrollHeight={Platform.OS === "ios" ? 40 : 80}
          enableAutomaticScroll
          enableResetScrollToCoords={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="golf-outline" size={64} color="#0D5C3A" />
            </View>
            <Text style={styles.title}>Your Golf Identity</Text>
            <Text style={styles.subtitle}>
              Tell us about your home course and how you describe your game
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {error ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={20} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Home Course */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Home Course <Text style={styles.optional}>(Optional)</Text>
              </Text>
              <View style={styles.inputWrapper}>
                <Ionicons 
                  name="flag-outline" 
                  size={20} 
                  color="#666" 
                  style={styles.inputIcon} 
                />
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Pebble Beach Golf Links"
                  placeholderTextColor="#999"
                  value={homeCourse}
                  onChangeText={setHomeCourse}
                  autoCapitalize="words"
                  editable={!loading}
                  maxLength={50}
                />
              </View>
            </View>

            {/* Game Identity */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Game Identity <Text style={styles.optional}>(Optional)</Text>
              </Text>
              <View style={styles.inputWrapper}>
                <Ionicons 
                  name="person-outline" 
                  size={20} 
                  color="#666" 
                  style={styles.inputIcon} 
                />
                <TextInput
                  style={styles.input}
                  placeholder='e.g., "Short game king" or "Long hitter - not very straight"'
                  placeholderTextColor="#999"
                  value={gameIdentity}
                  onChangeText={setGameIdentity}
                  autoCapitalize="sentences"
                  editable={!loading}
                  maxLength={60}
                  multiline={false}
                />
              </View>
              <Text style={styles.helperText}>
                Describe your playing style in your own words
              </Text>
            </View>

            {/* Continue Button */}
            <TouchableOpacity
              style={[styles.continueButton, loading && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.continueButtonText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>

            {/* Skip Button */}
            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkip}
              disabled={loading}
            >
              <Text style={styles.skipButtonText}>Skip for now</Text>
            </TouchableOpacity>
          </View>

          {/* Progress Indicator */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: "66%" }]} />
            </View>
            <Text style={styles.progressText}>Step 2 of 3</Text>
          </View>

          {/* Extra spacing for keyboard */}
          <View style={{ height: 40 }} />
        </KeyboardAwareScrollView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#F4EED8" 
  },
  topNav: {
    position: "absolute",
    top: 48,
    left: 20,
    zIndex: 1000,
  },
  navIcon: { 
    width: 28, 
    height: 28 
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 32,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  form: { 
    flex: 1 
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: "#DC2626",
    fontWeight: "500",
  },
  inputGroup: { 
    marginBottom: 24 
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 8,
  },
  optional: {
    fontSize: 14,
    color: "#999",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: "#333",
  },
  helperText: {
    fontSize: 13,
    color: "#999",
    marginTop: 6,
    marginLeft: 4,
  },
  continueButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0D5C3A",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonDisabled: { 
    opacity: 0.6 
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  skipButton: {
    alignItems: "center",
    paddingVertical: 16,
    marginTop: 12,
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
    textDecorationLine: "underline",
  },
  progressContainer: {
    marginTop: 32,
    alignItems: "center",
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

