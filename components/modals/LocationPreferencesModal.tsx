import { db } from "@/constants/firebaseConfig";
import {
  getCurrentLocation,
  hasLocationPermission,
  requestLocationPermission,
  updateCurrentLocation,
} from "@/utils/locationHelpers";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

interface LocationPreferencesModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  onUpdate: () => void;
}

export default function LocationPreferencesModal({
  visible,
  onClose,
  userId,
  onUpdate,
}: LocationPreferencesModalProps) {
  const [loading, setLoading] = useState(true);
  
  const [currentCity, setCurrentCity] = useState("");
  const [currentState, setCurrentState] = useState("");
  const [locationPermission, setLocationPermission] = useState(false);
  const [locationMethod, setLocationMethod] = useState<"gps" | "manual" | "course-based">("manual");

  useEffect(() => {
    if (visible) {
      loadLocationData();
    }
  }, [visible]);

  const loadLocationData = async () => {
    try {
      setLoading(true);

      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setCurrentCity(data.city || "");
        setCurrentState(data.state || "");
        setLocationMethod(data.locationMethod || "manual");
        
        const hasPermission = await hasLocationPermission();
        setLocationPermission(hasPermission);
      }

      setLoading(false);
    } catch (error) {
      console.error("Error loading location data:", error);
      setLoading(false);
    }
  };

  const handleEnableLocationServices = async () => {
    const granted = await requestLocationPermission();
    
    if (granted) {
      setLocationPermission(true);
      
      // Get current location and update
      const location = await getCurrentLocation();
      if (location) {
        await updateCurrentLocation(userId, location, "gps");
        
        Alert.alert(
          "Location Services Enabled",
          "Your location will now update automatically based on where you play.",
          [{ text: "OK", onPress: () => { loadLocationData(); onUpdate(); } }]
        );
      }
    } else {
      Alert.alert(
        "Permission Denied",
        "You can enable location services later in your device settings."
      );
    }
  };

  const handleChangeLocation = () => {
    Alert.alert(
      "Change Location",
      "How would you like to update your location?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Use GPS",
          onPress: async () => {
            const location = await getCurrentLocation();
            if (location) {
              await updateCurrentLocation(userId, location, "gps");
              setCurrentCity(location.city);
              setCurrentState(location.state);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Success", `Location set to ${location.city}, ${location.state}`);
              onUpdate();
            } else {
              Alert.alert("Error", "Could not get GPS location. Please enable location services.");
            }
          },
        },
        {
          text: "Enter Manually",
          onPress: () => handleManualEntry(),
        },
      ]
    );
  };

  const handleManualEntry = () => {
    if (Platform.OS === 'web') {
      // Web doesn't support Alert.prompt, use a different approach
      Alert.alert("Manual Entry", "Please use the mobile app to manually enter location");
      return;
    }

    Alert.prompt(
      "Enter City",
      "What city?",
      async (cityInput?: string) => {
        const city = cityInput || "";
        if (!city.trim()) return;

        Alert.prompt(
          "Enter State",
          "What state? (e.g., NC, CA, TX)",
          async (stateInput?: string) => {
            const state = stateInput || "";
            if (!state.trim()) return;

            const cleanCity = city.trim();
            const cleanState = state.trim().toUpperCase();

            // Get current location to use as coordinates (or use dummy coordinates)
            const loc = await getCurrentLocation();
            
            await updateCurrentLocation(
              userId,
              {
                city: cleanCity,
                state: cleanState,
                latitude: loc?.latitude || 0,
                longitude: loc?.longitude || 0,
              },
              "manual"
            );
            
            setCurrentCity(cleanCity);
            setCurrentState(cleanState);

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("Success", `Location set to ${cleanCity}, ${cleanState}`);
            onUpdate();
          },
          "plain-text"
        );
      },
      "plain-text"
    );
  };

  const handleUseCurrentLocation = async () => {
    const location = await getCurrentLocation();
    
    if (location) {
      Alert.alert(
        "Update to Current Location",
        `Set your location to ${location.city}, ${location.state}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Update",
            onPress: async () => {
              await updateCurrentLocation(userId, location, "gps");
              setCurrentCity(location.city);
              setCurrentState(location.state);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onUpdate();
            },
          },
        ]
      );
    } else {
      Alert.alert("Error", "Could not detect your current location. Please enable location services.");
    }
  };

  if (loading) {
    return (
      <Modal visible={visible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ActivityIndicator size="large" color="#0D5C3A" />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Location Preferences</Text>
            <TouchableOpacity onPress={onClose}>
              <Image
                source={require("@/assets/icons/Close.png")}
                style={styles.closeIcon}
              />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* CURRENT LOCATION - NO MORE HOME LOCATION */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="location" size={20} color="#0D5C3A" />
                <Text style={styles.sectionTitle}>Your Location</Text>
              </View>
              <Text style={styles.sectionSubtext}>
                Used for leaderboards, finding nearby courses, and feed content
              </Text>
              
              <View style={styles.locationDisplay}>
                <Text style={styles.locationText}>
                  {currentCity && currentState ? `📍 ${currentCity}, ${currentState}` : "Not set"}
                </Text>
                {currentCity && currentState && (
                  <Text style={styles.locationMethod}>
                    {locationMethod === "gps" && "Auto-updated via GPS"}
                    {locationMethod === "manual" && "Manually set"}
                    {locationMethod === "course-based" && "Updated from recent scores"}
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={styles.changeButton}
                onPress={handleChangeLocation}
              >
                <Text style={styles.changeButtonText}>Change Location</Text>
              </TouchableOpacity>
            </View>

            {/* LOCATION SERVICES */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="settings" size={20} color="#0D5C3A" />
                <Text style={styles.sectionTitle}>Location Services</Text>
              </View>
              
              {locationPermission ? (
                <View style={styles.permissionEnabled}>
                  <Ionicons name="checkmark-circle" size={24} color="#0D5C3A" />
                  <View style={styles.permissionText}>
                    <Text style={styles.permissionTitle}>Enabled</Text>
                    <Text style={styles.permissionSubtext}>
                      Location updates automatically
                    </Text>
                  </View>
                </View>
              ) : (
                <View>
                  <View style={styles.permissionDisabled}>
                    <Ionicons name="close-circle" size={24} color="#FF3B30" />
                    <View style={styles.permissionText}>
                      <Text style={styles.permissionTitle}>Disabled</Text>
                      <Text style={styles.permissionSubtext}>
                        Enable for automatic location updates
                      </Text>
                    </View>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.enableButton}
                    onPress={handleEnableLocationServices}
                  >
                    <Ionicons name="location" size={18} color="#FFF" />
                    <Text style={styles.enableButtonText}>
                      Enable Location Services
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.useCurrentButton}
                    onPress={handleUseCurrentLocation}
                  >
                    <Text style={styles.useCurrentButtonText}>
                      Use My Current Location (One-time)
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* INFO */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color="#0D5C3A" />
              <Text style={styles.infoText}>
                With location services enabled, your location updates automatically
                when you're 15+ miles from your last location.
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ==================== STYLES ==================== */
const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },

  modalContainer: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  closeIcon: {
    width: 24,
    height: 24,
    tintColor: "#666",
  },

  modalContent: {
    padding: 20,
  },

  section: {
    marginBottom: 24,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  sectionSubtext: {
    fontSize: 13,
    color: "#666",
    marginBottom: 12,
  },

  locationDisplay: {
    backgroundColor: "#F7F8FA",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },

  locationText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  locationMethod: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
  },

  changeButton: {
    backgroundColor: "#FFF",
    borderWidth: 2,
    borderColor: "#0D5C3A",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },

  changeButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  permissionEnabled: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },

  permissionDisabled: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF5F5",
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 12,
  },

  permissionText: {
    flex: 1,
  },

  permissionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 2,
  },

  permissionSubtext: {
    fontSize: 13,
    color: "#666",
  },

  enableButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },

  enableButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
  },

  useCurrentButton: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#0D5C3A",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },

  useCurrentButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  infoBox: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },

  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#0D5C3A",
    lineHeight: 18,
  },
});