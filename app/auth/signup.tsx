import { auth, db } from "@/constants/firebaseConfig";
import {
  getCurrentLocation,
  requestLocationPermission
} from "@/utils/locationHelpers";
import { assignRegionFromLocation } from "@/utils/regionHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

/**
 * Calculate geohash for location (5-char precision = ~2.4 miles)
 */
function encodeGeohash(latitude: number, longitude: number, precision: number = 5): string {
  const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = "";

  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const lonMid = (lonMin + lonMax) / 2;
      if (longitude > lonMid) {
        idx |= (1 << (4 - bit));
        lonMin = lonMid;
      } else {
        lonMax = lonMid;
      }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (latitude > latMid) {
        idx |= (1 << (4 - bit));
        latMin = latMid;
      } else {
        latMax = latMid;
      }
    }
    evenBit = !evenBit;

    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32[idx];
      bit = 0;
      idx = 0;
    }
  }

  return geohash;
}

type LocationMethod = "manual" | "gps";

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /**
   * Prompt user for manual city/state entry
   */
  const promptManualLocation = (): Promise<{
    city: string;
    state: string;
  } | null> => {
    return new Promise((resolve) => {
      if (Platform.OS === 'web') {
        // Web fallback - use simple prompts
        const city = window.prompt("Enter your city:");
        if (!city) {
          resolve(null);
          return;
        }
        
        const state = window.prompt("Enter your state (e.g., NC, CA, TX):");
        if (!state) {
          resolve(null);
          return;
        }
        
        resolve({ city: city.trim(), state: state.trim().toUpperCase() });
      } else {
        // Native - use Alert.prompt
        Alert.prompt(
          "Enter Your City",
          "What city are you in?",
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => {
                soundPlayer.play('click');
                resolve(null);
              },
            },
            {
              text: "Next",
              onPress: (cityInput?: string) => {
                const city = cityInput || "";
                if (!city.trim()) {
                  soundPlayer.play('error');
                  Alert.alert("Error", "City is required");
                  resolve(null);
                  return;
                }
                
                // Now prompt for state
                Alert.prompt(
                  "Enter Your State",
                  "What state? (e.g., NC, CA, TX)",
                  [
                    {
                      text: "Cancel",
                      style: "cancel",
                      onPress: () => {
                        soundPlayer.play('click');
                        resolve(null);
                      },
                    },
                    {
                      text: "Done",
                      onPress: (stateInput?: string) => {
                        const state = stateInput || "";
                        if (!state.trim()) {
                          soundPlayer.play('error');
                          Alert.alert("Error", "State is required");
                          resolve(null);
                          return;
                        }
                        
                        soundPlayer.play('click');
                        resolve({
                          city: city.trim(),
                          state: state.trim().toUpperCase(),
                        });
                      },
                    },
                  ],
                  "plain-text"
                );
              },
            },
          ],
          "plain-text"
        );
      }
    });
  };

  const handleSignup = async () => {
    // Play click sound + light haptic
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (!email || !password) {
      setError("Please enter both email and password");
      soundPlayer.play('error');
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      soundPlayer.play('error');
      return;
    }

    try {
      setLoading(true);
      setError("");

      // Create Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Force session initialization (CRITICAL in Expo)
      await user.reload();

      // Send email verification
      try {
        await sendEmailVerification(user);
        console.log("✅ Verification email sent to:", user.email);
      } catch (verifyError: any) {
        console.error("❌ Verification email failed:", verifyError.code, verifyError.message);
      }

      // ============================================================
      // LOCATION & REGION ASSIGNMENT
      // ============================================================

      let locationData: {
        city: string;
        state: string;
        regionKey: string;
        geohash: string;
        latitude: number | null;
        longitude: number | null;
        locationPermission: boolean;
        locationMethod: LocationMethod;
      } = {
        city: "",
        state: "",
        regionKey: "",
        geohash: "",
        latitude: null,
        longitude: null,
        locationPermission: false,
        locationMethod: "manual",
      };

      // REQUEST LOCATION PERMISSION
      const hasPermission = await requestLocationPermission();

      if (hasPermission) {
        // ✅ GPS GRANTED - Get location automatically
        const location = await getCurrentLocation();

        if (location) {
          const regionKey = assignRegionFromLocation(
            location.latitude,
            location.longitude,
            location.city,
            location.state
          );
          
          const geohash = encodeGeohash(location.latitude, location.longitude, 5);

          locationData = {
            city: location.city,
            state: location.state,
            regionKey,
            geohash,
            latitude: location.latitude,
            longitude: location.longitude,
            locationPermission: true,
            locationMethod: "gps",
          };

          console.log("✅ GPS location assigned:", {
            city: location.city,
            state: location.state,
            regionKey,
          });
        } else {
          // GPS permission granted but couldn't get location
          console.warn("⚠️ GPS permission granted but location fetch failed");
          
          // Fall back to manual entry
          const manualLocation = await promptManualLocation();
          
          if (manualLocation) {
            // For manual entry without coordinates, use dummy coordinates (will use state fallback)
            const regionKey = assignRegionFromLocation(
              0, // dummy lat
              0, // dummy lon
              manualLocation.city,
              manualLocation.state
            );

            locationData = {
              city: manualLocation.city,
              state: manualLocation.state,
              regionKey,
              geohash: "",
              latitude: null,
              longitude: null,
              locationPermission: true,
              locationMethod: "manual",
            };

            console.log("✅ Manual location assigned (GPS failed):", {
              city: manualLocation.city,
              state: manualLocation.state,
              regionKey,
            });
          } else {
            // User cancelled manual entry
            soundPlayer.play('error');
            Alert.alert(
              "Location Required",
              "We need your location to show you nearby courses and golfers. Please try signing up again.",
              [{ text: "OK", onPress: () => soundPlayer.play('click') }]
            );
            setLoading(false);
            return;
          }
        }
      } else {
        // ❌ GPS DENIED - Prompt for manual entry
        console.log("📍 GPS denied, prompting manual location entry");
        
        const manualLocation = await promptManualLocation();
        
        if (manualLocation) {
          // For manual entry without coordinates, use dummy coordinates (will use state fallback)
          const regionKey = assignRegionFromLocation(
            0, // dummy lat
            0, // dummy lon
            manualLocation.city,
            manualLocation.state
          );

          locationData = {
            city: manualLocation.city,
            state: manualLocation.state,
            regionKey,
            geohash: "",
            latitude: null,
            longitude: null,
            locationPermission: false,
            locationMethod: "manual",
          };

          console.log("✅ Manual location assigned:", {
            city: manualLocation.city,
            state: manualLocation.state,
            regionKey,
          });
        } else {
          // User cancelled manual entry
          soundPlayer.play('error');
          Alert.alert(
            "Location Required",
            "We need your location to show you nearby courses and golfers. Please try signing up again.",
            [{ text: "OK", onPress: () => soundPlayer.play('click') }]
          );
          setLoading(false);
          return;
        }
      }

      // ============================================================
      // CREATE USER DOCUMENT - NO HOME LOCATION FIELDS
      // ============================================================

      await setDoc(doc(db, "users", user.uid), {
        userId: user.uid,
        email: user.email,
        emailVerified: false,
        createdAt: serverTimestamp(),

        // Location data - ONLY CURRENT LOCATION
        city: locationData.city,
        state: locationData.state,
        regionKey: locationData.regionKey,
        geohash: locationData.geohash,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        
        // Location metadata
        locationPermission: locationData.locationPermission,
        locationMethod: locationData.locationMethod,
        locationUpdatedAt: serverTimestamp(),

        // ANTI-BOT FIELDS
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
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>Sign Up</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity 
        onPress={handleLoginNavigation}
        disabled={loading}
      >
        <Text style={styles.link}>Already have an account? Log in</Text>
      </TouchableOpacity>

      <Text style={styles.locationNote}>
        We'll ask for your location to help you find nearby courses
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