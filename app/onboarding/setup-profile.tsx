import { auth, db } from "@/constants/firebaseConfig";
import { canWrite } from "@/utils";

import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { deleteUser, signOut } from "firebase/auth";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
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
import CloseIcon from "@/assets/icons/Close.png";

export default function SetupProfile() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /**
   * HARD CANCEL — DELETE EVERYTHING
   */
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

              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

              await deleteDoc(doc(db, "users", user.uid));
              await deleteUser(user);
              await signOut(auth);

              router.replace("/");
            } catch (err) {
              console.error("Cancel cleanup failed:", err);
              Alert.alert(
                "Something went wrong",
                "We couldn't fully delete your account. Please try again."
              );
            }
          },
        },
      ]
    );
  };

  /**
   * SAFE BACK — RETURN TO USER TYPE SELECTION
   */
  const handleBack = () => {
    if (loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace("/auth/user-type");
  };

  const handleContinue = async () => {
    setError("");

    if (!displayName.trim()) {
      setError("Please enter your display name");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (displayName.trim().length < 2) {
      setError("Display name must be at least 2 characters");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!handicap.trim()) {
      setError("Please enter your handicap");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const handicapNum = parseFloat(handicap);
    if (isNaN(handicapNum)) {
      setError("Please enter a valid handicap number");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (handicapNum < -10 || handicapNum > 54) {
      setError("Handicap must be between -10 and 54");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No user logged in");

      // 🔐 Load user document for permission check
      const userSnap = await getDoc(doc(db, "users", user.uid));

      // ✅ ONLY write if allowed by rules
      if (userSnap.exists() && canWrite(userSnap.data())) {
        await setDoc(
          doc(db, "users", user.uid),
          {
            displayName: displayName.trim(),
            handicap: handicapNum,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );

      // ➡️ Always continue onboarding
      router.push("/onboarding/setup-locker");
    } catch (err) {
      console.error("Error saving profile:", err);
      setError("Failed to continue. Please try again.");
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Error
      );
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View pointerEvents="box-none" style={styles.topNav}>
        <TouchableOpacity
          onPress={handleBack}
          disabled={loading}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Image source={BackIcon} style={styles.navIcon} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleCancel}
          disabled={loading}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Image source={CloseIcon} style={styles.navIcon} />
        </TouchableOpacity>
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          enableOnAndroid
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          extraScrollHeight={20}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Set Up Your Profile</Text>
            <Text style={styles.subtitle}>
              Let's get to know you better, golfer!
            </Text>
          </View>

          <View style={styles.form}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Display Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                placeholderTextColor="#999"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                editable={!loading}
                maxLength={30}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Handicap Index</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 12.5"
                placeholderTextColor="#999"
                value={handicap}
                onChangeText={setHandicap}
                keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              style={[styles.continueButton, loading && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.continueButtonText}>Continue</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollView>
      </TouchableWithoutFeedback>
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
    zIndex: 1000,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  navIcon: { width: 28, height: 28 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
    marginTop: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  form: { flex: 1 },
  inputGroup: { marginBottom: 24 },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#333",
    borderWidth: 2,
    borderColor: "#E0E0E0",
  },
  errorText: {
    fontSize: 14,
    color: "#FF3B30",
    backgroundColor: "#FFE5E5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    textAlign: "center",
  },
  continueButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  continueButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});


