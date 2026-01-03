import LocationPickerModal from "@/components/modals/LocationPickerModal";
import { auth, db } from "@/constants/firebaseConfig";
import { checkDisplayNameAvailability } from "@/utils/displayNameValidator";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { doc, setDoc } from "firebase/firestore";
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
  View
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";

const BackIcon = require("@/assets/icons/Back.png");

export default function SetupProfile() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [location, setLocation] = useState<any>(null);

  /**
   * BACK → User Type
   */
  const handleBack = () => {
    if (loading) return;
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace("/auth/user-type");
  };

  /**
   * INFO DIALOGS
   */
  const showHandicapInfo = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      "About Handicap",
      "If you don't track your GHIN or handicap, use your last round gross score minus par.\n\nFor example, if you shot 100 strokes on a par 72 course, your handicap here would be 28 (100 - 72 = 28).",
      [{ text: "Got it", style: "default" }]
    );
  };

  const showLocationInfo = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      "Why We Need Your Location",
      "We use your location to establish your leaderboards and show you who you're competing with locally. This helps create a more personalized experience with nearby courses and events.",
      [{ text: "Got it", style: "default" }]
    );
  };

  /**
   * CONTINUE → Setup Locker
   */
  const handleContinue = async () => {
    setError("");

    // Validate display name
    if (!displayName.trim()) {
      setError("Please enter your display name");
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (displayName.trim().length < 2) {
      setError("Display name must be at least 2 characters");
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (displayName.trim().length > 30) {
      setError("Display name must be 30 characters or less");
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    // Validate handicap
    if (!handicap.trim()) {
      setError("Please enter your handicap");
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const handicapNum = parseFloat(handicap);
    if (isNaN(handicapNum) || handicapNum < -10 || handicapNum > 54) {
      setError("Handicap must be between -10 and 54");
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    // Validate location (MANDATORY)
    if (!location) {
      setError("Please set your location preferences");
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    soundPlayer.play('click');
    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No user logged in");

      // ✅ CHECK DISPLAY NAME UNIQUENESS
      console.log("🔍 Checking display name availability:", displayName.trim());
      const isAvailable = await checkDisplayNameAvailability(displayName.trim());
      
      if (!isAvailable) {
        setError("This display name is already taken. Please choose another one.");
        soundPlayer.play('error');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setLoading(false);
        return;
      }

      console.log("✅ Display name is available!");

      // Save profile data with location AND displayNameLower for uniqueness
      await setDoc(
        doc(db, "users", user.uid),
        {
          displayName: displayName.trim(),
          displayNameLower: displayName.trim().toLowerCase(), // For uniqueness checking
          handicap: handicapNum,
          location: location,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      console.log("✅ Profile saved:", { 
        displayName: displayName.trim(), 
        displayNameLower: displayName.trim().toLowerCase(),
        handicap: handicapNum,
        location 
      });

      soundPlayer.play('postThought');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLoading(false);

      // Navigate to setup-locker
      router.push("/onboarding/setup-locker");
    } catch (err) {
      console.error("❌ Error saving profile:", err);
      setError("Failed to continue. Please try again.");
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setLoading(false);
    }
  };

  /**
   * LOCATION SET
   */
  const handleLocationSet = (selectedLocation: any) => {
    console.log("✅ Location set:", selectedLocation);
    soundPlayer.play('postThought');
    setLocation(selectedLocation);
    setShowLocationModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
              <Ionicons name="person-circle-outline" size={64} color="#0D5C3A" />
            </View>
            <Text style={styles.title}>Set Up Your Profile</Text>
            <Text style={styles.subtitle}>
              Tell us about yourself so we can personalize your experience
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

            {/* Display Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Display Name <Text style={styles.required}>*</Text>
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
                  placeholder="This will be visible to all users"
                  placeholderTextColor="#999"
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                  editable={!loading}
                  maxLength={30}
                />
              </View>
              <Text style={styles.helperText}>
                Choose a unique name (2-30 characters)
              </Text>
            </View>

            {/* Handicap */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  Handicap Index <Text style={styles.required}>*</Text>
                </Text>
                <TouchableOpacity 
                  onPress={showHandicapInfo}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="information-circle-outline" size={22} color="#0D5C3A" />
                </TouchableOpacity>
              </View>
              <View style={styles.inputWrapper}>
                <Ionicons 
                  name="golf-outline" 
                  size={20} 
                  color="#666" 
                  style={styles.inputIcon} 
                />
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
              <Text style={styles.helperText}>
                Enter a value between -10 and 54
              </Text>
            </View>

            {/* Location (MANDATORY) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  Location <Text style={styles.required}>*</Text>
                </Text>
                <TouchableOpacity 
                  onPress={showLocationInfo}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.infoButton}
                >
                  <Ionicons name="information-circle-outline" size={18} color="#666" />
                  <Text style={styles.infoButtonText}>Why do we need this?</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[
                  styles.locationButton,
                  location && styles.locationButtonSet
                ]}
                onPress={() => {
                  soundPlayer.play('click');
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowLocationModal(true);
                }}
                disabled={loading}
              >
                <Ionicons 
                  name={location ? "location" : "location-outline"} 
                  size={20} 
                  color={location ? "#0D5C3A" : "#666"} 
                />
                <Text style={[
                  styles.locationButtonText,
                  location && styles.locationButtonTextSet
                ]}>
                  {location 
                    ? `${location.city}, ${location.state}` 
                    : "Set Your Location"
                  }
                </Text>
                <Ionicons 
                  name={location ? "checkmark-circle" : "chevron-forward"} 
                  size={20} 
                  color={location ? "#4CAF50" : "#999"} 
                />
              </TouchableOpacity>
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
          </View>

          {/* Progress Indicator */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: "33%" }]} />
            </View>
            <Text style={styles.progressText}>Step 1 of 3</Text>
          </View>

          {/* Extra spacing for keyboard */}
          <View style={{ height: 40 }} />
        </KeyboardAwareScrollView>
      </TouchableWithoutFeedback>

      {/* Location Modal */}
      <LocationPickerModal
        visible={showLocationModal}
        onClose={() => {
          soundPlayer.play('click');
          setShowLocationModal(false);
        }}
        onLocationSet={handleLocationSet}
      />
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
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  required: {
    color: "#DC2626",
    fontSize: 16,
  },
  infoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  infoButtonText: {
    fontSize: 13,
    color: "#666",
    fontStyle: "italic",
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
  locationButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 12,
  },
  locationButtonSet: {
    borderColor: "#4CAF50",
    backgroundColor: "#F0F8F4",
  },
  locationButtonText: {
    flex: 1,
    fontSize: 16,
    color: "#999",
    fontWeight: "500",
  },
  locationButtonTextSet: {
    color: "#0D5C3A",
    fontWeight: "600",
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






