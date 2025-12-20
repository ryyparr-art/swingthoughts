import { auth, db } from "@/constants/firebaseConfig";
import { cacheNearbyCourses } from "@/utils/courseCache";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { doc, updateDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
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
  View
} from "react-native";

interface LocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onLocationSet: (location: {
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
  }) => void;
}

// US States for autocomplete
const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

// Major US cities for autocomplete (can expand this list)
const POPULAR_CITIES = [
  "New York", "Los Angeles", "Chicago", "Houston", "Phoenix",
  "Philadelphia", "San Antonio", "San Diego", "Dallas", "San Jose",
  "Austin", "Jacksonville", "Fort Worth", "Columbus", "Charlotte",
  "San Francisco", "Indianapolis", "Seattle", "Denver", "Washington",
  "Boston", "Nashville", "Detroit", "Portland", "Las Vegas",
  "Memphis", "Louisville", "Baltimore", "Milwaukee", "Albuquerque",
  "Tucson", "Fresno", "Sacramento", "Kansas City", "Mesa",
  "Atlanta", "Omaha", "Colorado Springs", "Raleigh", "Miami",
  "Oakland", "Minneapolis", "Tulsa", "Wichita", "Arlington",
  "Tampa", "New Orleans", "Cleveland", "Bakersfield", "Aurora",
  // Golf destinations
  "Pinehurst", "Pebble Beach", "Scottsdale", "Myrtle Beach",
  "Hilton Head", "Palm Springs", "Kiawah Island", "Bandon",
];

export default function LocationPickerModal({
  visible,
  onClose,
  onLocationSet,
}: LocationPickerModalProps) {
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [showStateSuggestions, setShowStateSuggestions] = useState(false);

  const LocationIcon = require("@/assets/icons/Location Near Me.png");

  // Filter city suggestions
  const citySuggestions = city.length > 0
    ? POPULAR_CITIES.filter(c => 
        c.toLowerCase().startsWith(city.toLowerCase())
      ).slice(0, 5)
    : [];

  // Filter state suggestions
  const stateSuggestions = state.length > 0
    ? US_STATES.filter(s => 
        s.toLowerCase().startsWith(state.toLowerCase())
      )
    : [];

  const handleUseGPS = async () => {
    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Please enable location services in your device settings to use GPS."
        );
        setLoading(false);
        return;
      }

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Reverse geocode to get city/state
      const [address] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (address.city && address.region) {
        const locationData = {
          city: address.city,
          state: address.region,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };

        const uid = auth.currentUser?.uid;
        if (uid) {
          // Save location to Firebase
          await updateDoc(doc(db, "users", uid), {
            location: locationData,
          });

          // ✅ CACHE NEARBY COURSES (ONE-TIME)
          console.log("🔍 Caching nearby courses for GPS location...");
          await cacheNearbyCourses(
            uid,
            locationData.latitude,
            locationData.longitude,
            locationData.city,
            locationData.state
          );
          console.log("✅ Courses cached successfully");
        }

        onLocationSet(locationData);
        // ✅ Don't call onClose() - let parent handle navigation
      } else {
        Alert.alert("Error", "Could not determine your location. Please enter manually.");
      }

      setLoading(false);
    } catch (error) {
      console.error("GPS Error:", error);
      Alert.alert("Error", "Failed to get your location. Please try manual entry.");
      setLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!city.trim() || !state.trim()) {
      Alert.alert("Missing Info", "Please enter both city and state.");
      return;
    }

    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Geocode to get lat/lon
      let latitude: number | undefined;
      let longitude: number | undefined;

      try {
        const results = await Location.geocodeAsync(`${city}, ${state}`);
        if (results.length > 0) {
          latitude = results[0].latitude;
          longitude = results[0].longitude;
        }
      } catch (e) {
        console.log("Geocoding failed, saving without coords");
      }

      const locationData = {
        city: city.trim(),
        state: state.trim().toUpperCase(), // Ensure state is uppercase
        latitude,
        longitude,
      };

      const uid = auth.currentUser?.uid;
      if (uid) {
        // Save location to Firebase
        await updateDoc(doc(db, "users", uid), {
          location: locationData,
        });

        // ✅ CACHE NEARBY COURSES (ONE-TIME)
        if (latitude && longitude) {
          console.log("🔍 Caching nearby courses for manual location...");
          await cacheNearbyCourses(
            uid,
            latitude,
            longitude,
            locationData.city,
            locationData.state
          );
          console.log("✅ Courses cached successfully");
        } else {
          console.warn("⚠️ No coordinates - caching by state only");
          // Fallback: cache by state only
          await cacheNearbyCourses(
            uid,
            0, // Dummy lat
            0, // Dummy lon
            locationData.city,
            locationData.state
          );
        }
      }

      onLocationSet(locationData);
      setCity("");
      setState("");
      setShowCitySuggestions(false);
      setShowStateSuggestions(false);
      // ✅ Don't call onClose() - let parent handle navigation
      setLoading(false);
    } catch (error) {
      console.error("Manual entry error:", error);
      Alert.alert("Error", "Failed to save location. Please try again.");
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardAvoid}
        >
          <View style={styles.modal}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
              <Text style={styles.title}>Set Your Location</Text>
              <Text style={styles.subtitle}>
                We'll show you nearby courses and local leaderboards
              </Text>

              {/* GPS OPTION */}
              <TouchableOpacity
                style={styles.gpsButton}
                onPress={handleUseGPS}
                disabled={loading}
              >
                <Image source={LocationIcon} style={styles.gpsIcon} />
                <Text style={styles.gpsButtonText}>
                  {loading ? "Finding Location..." : "Use GPS Location"}
                </Text>
              </TouchableOpacity>

              <View style={styles.divider}>
                <View style={styles.line} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.line} />
              </View>

              {/* MANUAL ENTRY */}
              <Text style={styles.label}>Enter Manually</Text>
              
              {/* CITY INPUT */}
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="City"
                  value={city}
                  onChangeText={(text) => {
                    setCity(text);
                    setShowCitySuggestions(text.length > 0);
                  }}
                  onFocus={() => setShowCitySuggestions(city.length > 0)}
                  onBlur={() => setTimeout(() => setShowCitySuggestions(false), 200)}
                  autoCapitalize="words"
                  editable={!loading}
                />
                
                {/* CITY SUGGESTIONS */}
                {showCitySuggestions && citySuggestions.length > 0 && (
                  <View style={styles.suggestions}>
                    {citySuggestions.map((suggestion, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.suggestionItem}
                        onPress={() => {
                          setCity(suggestion);
                          setShowCitySuggestions(false);
                        }}
                      >
                        <Text style={styles.suggestionText}>{suggestion}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* STATE INPUT */}
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="State (e.g., NC)"
                  value={state}
                  onChangeText={(text) => {
                    setState(text);
                    setShowStateSuggestions(text.length > 0);
                  }}
                  onFocus={() => setShowStateSuggestions(state.length > 0)}
                  onBlur={() => setTimeout(() => setShowStateSuggestions(false), 200)}
                  autoCapitalize="characters"
                  maxLength={2}
                  editable={!loading}
                />
                
                {/* STATE SUGGESTIONS */}
                {showStateSuggestions && stateSuggestions.length > 0 && (
                  <View style={styles.suggestions}>
                    {stateSuggestions.map((suggestion, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.suggestionItem}
                        onPress={() => {
                          setState(suggestion);
                          setShowStateSuggestions(false);
                        }}
                      >
                        <Text style={styles.suggestionText}>{suggestion}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleManualSubmit}
                disabled={loading}
              >
                <Text style={styles.submitButtonText}>
                  {loading ? "Saving..." : "Set Location"}
                </Text>
              </TouchableOpacity>

              {/* CANCEL */}
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  keyboardAvoid: {
    width: "100%",
  },
  modal: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: "100%",
    paddingBottom: Platform.OS === "ios" ? 40 : 20, // Account for iPhone home indicator
  },
  scrollContent: {
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0D5C3A",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
    textAlign: "center",
  },
  gpsButton: {
    backgroundColor: "#0D5C3A",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 20,
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  gpsIcon: {
    width: 48,
    height: 48,
    tintColor: "#B0433B", // Red color
  },
  gpsButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: "#DDD",
  },
  orText: {
    marginHorizontal: 12,
    color: "#999",
    fontWeight: "600",
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 12,
  },
  inputContainer: {
    marginBottom: 12,
    zIndex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#FFF",
  },
  suggestions: {
    marginTop: 4,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#DDD",
    borderRadius: 8,
    maxHeight: 150,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  suggestionText: {
    fontSize: 15,
    color: "#333",
  },
  submitButton: {
    backgroundColor: "#0D5C3A",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 24,
  },
  submitButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  cancelButton: {
    padding: 12,
    alignItems: "center",
    marginTop: 12,
    marginBottom: 20,
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 15,
    fontWeight: "600",
  },
});