import { auth, db } from "@/constants/firebaseConfig";
import {
  getCurrentLocation,
  requestLocationPermission
} from "@/utils/locationHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

// ✅ FIX: explicit union type
type LocationMethod = "manual" | "gps";

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    // Play click sound + light haptic
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!email || !password) {
      setError("Please enter both email and password");
      // Play error sound for validation
      soundPlayer.play('error');
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      // Play error sound for validation
      soundPlayer.play('error');
      return;
    }

    try {
      setLoading(true);
      setError("");

      // Create Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 🔐 Force session initialization (CRITICAL in Expo)
      await user.reload();

      // ✅ SEND EMAIL VERIFICATION
      try {
        await sendEmailVerification(user);
        console.log("✅ Verification email sent to:", user.email);
      } catch (verifyError: any) {
        console.error(
          "❌ Verification email failed:",
          verifyError.code,
          verifyError.message
        );
      }

      // 📍 REQUEST LOCATION PERMISSION
      const hasPermission = await requestLocationPermission();

      // ✅ FIX: explicitly typed object
      let locationData: {
        homeCity: string;
        homeState: string;
        currentCity: string;
        currentState: string;
        locationPermission: boolean;
        locationMethod: LocationMethod;
      } = {
        homeCity: "",
        homeState: "",
        currentCity: "",
        currentState: "",
        locationPermission: hasPermission,
        locationMethod: "manual",
      };

      if (hasPermission) {
        const location = await getCurrentLocation();

        if (location) {
          locationData = {
            homeCity: location.city,
            homeState: location.state,
            currentCity: location.city,
            currentState: location.state,
            locationPermission: true,
            locationMethod: "gps",
          };
        }
      }

      // Create initial Firestore user document
      await setDoc(doc(db, "users", user.uid), {
        userId: user.uid,
        email: user.email,
        createdAt: serverTimestamp(),

        // Location data
        ...locationData,
        homeLocation: locationData.homeCity
          ? { city: locationData.homeCity, state: locationData.homeState }
          : null,
        currentLocation: locationData.currentCity
          ? { city: locationData.currentCity, state: locationData.currentState }
          : null,
        currentLocationUpdatedAt: serverTimestamp(),

        // Location history
        locationHistory: locationData.homeCity
          ? [
              {
                city: locationData.homeCity,
                state: locationData.homeState,
                from: new Date().toISOString(),
                to: null,
                scoreCount: 0,
              },
            ]
          : [],

        // ✅ ANTI-BOT FIELDS
        displayName: null,
        displayNameLower: null,
        lastPostTime: null,
        lastCommentTime: null,
        lastMessageTime: null,
        lastScoreTime: null,
        banned: false,

        // Onboarding status
        userType: null,
        handicap: null,
        acceptedTerms: false,
        verified: false,
        lockerCompleted: false,
      });

      // Play success sound + medium haptic on successful signup
      soundPlayer.play('postThought');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Navigate to email verification screen
      router.push("/auth/email-verification" as any);
      
    } catch (err: any) {
      console.error("Signup error:", err);

      // Play error sound for failed signup
      soundPlayer.play('error');

      if (err.code === "auth/email-already-in-use") {
        setError("This email is already registered");
      } else if (err.code === "auth/invalid-email") {
        setError("Invalid email address");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak");
      } else {
        setError(err.message || "Failed to create account");
      }

      setLoading(false);
    }
  };

  const handleLoginNavigation = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/auth/login");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>

      {error !== "" && <Text style={styles.error}>{error}</Text>}

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#999"
        onChangeText={setEmail}
        value={email}
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!loading}
      />

      <TextInput
        style={styles.input}
        placeholder="Password (min 6 characters)"
        secureTextEntry
        placeholderTextColor="#999"
        onChangeText={setPassword}
        value={password}
        editable={!loading}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSignup}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Sign Up</Text>}
      </TouchableOpacity>

      <TouchableOpacity 
        onPress={handleLoginNavigation}
        disabled={loading}
      >
        <Text style={styles.link}>Already have an account? Log in</Text>
      </TouchableOpacity>

      <Text style={styles.locationNote}>
        We'll ask for location access to help you find nearby courses
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#F4EED8",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#0D5C3A",
  },
  error: {
    color: "#e74c3c",
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
    padding: 10,
    borderRadius: 8,
    fontSize: 14,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    color: "#333",
  },
  button: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "white",
    textAlign: "center",
    fontWeight: "600",
  },
  link: {
    color: "#0D5C3A",
    textAlign: "center",
    fontWeight: "600",
    marginBottom: 16,
  },
  locationNote: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
  },
});
