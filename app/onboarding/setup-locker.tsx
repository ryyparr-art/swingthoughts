import { auth, db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SetupLocker() {
  const router = useRouter();

  const [homeClub, setHomeClub] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCancel = () => {
    Alert.alert(
      "Cancel Setup?",
      "Are you sure you want to cancel? Your account will be logged out and you'll need to start over.",
      [
        { text: "Continue Setup", style: "cancel" },
        {
          text: "Cancel & Sign Out",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut(auth);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.replace("/");
            } catch (err) {
              console.error("Error signing out:", err);
            }
          },
        },
      ]
    );
  };

  const handleContinue = async () => {
    setError("");

    // All fields are optional, but if provided, validate them
    if (homeClub.trim() && homeClub.trim().length < 2) {
      setError("Club name must be at least 2 characters");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("No user logged in");
      }

      const userRef = doc(db, "users", user.uid);
      
      // Save locker info (optional fields)
      const lockerData: any = {
        updatedAt: new Date().toISOString(),
      };

      if (homeClub.trim()) lockerData.homeClub = homeClub.trim();
      if (city.trim()) lockerData.city = city.trim();
      if (state.trim()) lockerData.state = state.trim();

      await setDoc(userRef, lockerData, { merge: true });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Navigate to starter screen (terms acceptance)
      router.push("/onboarding/starter");
    } catch (err: any) {
      console.error("Error saving locker info:", err);
      setError("Failed to save information. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setLoading(false);
    }
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/onboarding/starter");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        {/* Cancel Button */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
          disabled={loading}
        >
          <Ionicons name="close-circle-outline" size={28} color="#666" />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Ionicons name="golf-outline" size={80} color="#0D5C3A" />
            <Text style={styles.title}>Your Golf Locker</Text>
            <Text style={styles.subtitle}>
              Tell us about your home course (optional)
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Home Club <Text style={styles.optional}>(Optional)</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Pebble Beach Golf Links"
                placeholderTextColor="#999"
                value={homeClub}
                onChangeText={setHomeClub}
                autoCapitalize="words"
                editable={!loading}
                maxLength={50}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                City <Text style={styles.optional}>(Optional)</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Pebble Beach"
                placeholderTextColor="#999"
                value={city}
                onChangeText={setCity}
                autoCapitalize="words"
                editable={!loading}
                maxLength={50}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                State <Text style={styles.optional}>(Optional)</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., California"
                placeholderTextColor="#999"
                value={state}
                onChangeText={setState}
                autoCapitalize="words"
                editable={!loading}
                maxLength={30}
              />
            </View>

            <TouchableOpacity
              style={[styles.continueButton, loading && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.continueButtonText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkip}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.skipButtonText}>Skip for now</Text>
            </TouchableOpacity>
          </View>

          {/* Progress indicator */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: "66%" }]} />
            </View>
            <Text style={styles.progressText}>Step 2 of 3</Text>
          </View>
        </ScrollView>
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

  cancelButton: {
    position: "absolute",
    top: 16,
    left: 24,
    zIndex: 10,
    padding: 8,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },

  header: {
    alignItems: "center",
    marginBottom: 40,
  },

  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#0D5C3A",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },

  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    paddingHorizontal: 20,
  },

  form: {
    flex: 1,
  },

  inputGroup: {
    marginBottom: 24,
  },

  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 8,
  },

  optional: {
    fontSize: 14,
    fontWeight: "400",
    color: "#999",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D5C3A",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    gap: 8,
  },

  buttonDisabled: {
    opacity: 0.6,
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