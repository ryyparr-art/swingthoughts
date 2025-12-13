import { auth, db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { doc, updateDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LeaderboardFiltersScreen() {
  const router = useRouter();
  const [filterType, setFilterType] = useState<"all" | "nearMe" | "course" | "player">("all");
  const [loadingLocation, setLoadingLocation] = useState(false);

  const handleSelectFilterType = (type: "all" | "nearMe" | "course" | "player") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFilterType(type);
  };

  const handleNearMeRequest = async () => {
    setLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        if (Platform.OS === 'web') {
          alert("Location permission denied. Please enable location access in your browser settings.");
        } else {
          Alert.alert(
            "Location Permission Denied",
            "Please enable location access in your device settings."
          );
        }
        setLoadingLocation(false);
        setFilterType("all");
        return;
      }

      // Get location and save to user profile
      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      
      const userId = auth.currentUser?.uid;
      if (userId) {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
          location: {
            type: "gps",
            latitude: latitude,
            longitude: longitude,
            city: geocode[0]?.city || null,
            state: geocode[0]?.region || null,
            lastUpdated: new Date(),
          },
        });
      }

      setLoadingLocation(false);
    } catch (error) {
      console.error("Location error:", error);
      setLoadingLocation(false);
      setFilterType("all");
    }
  };

  const handleApplyFilter = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (filterType === "all") {
      router.push({
        pathname: "/leaderboard",
        params: { filterType: "all" },
      });
    } else if (filterType === "nearMe") {
      router.push({
        pathname: "/leaderboard",
        params: { filterType: "nearMe" },
      });
    } else if (filterType === "course") {
      // Navigate to course search screen
      router.push("/leaderboard-filters/course-search");
    } else if (filterType === "player") {
      // Navigate to player search screen
      router.push("/leaderboard-filters/player-search");
    }
  };

  const handleClearFilter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/leaderboard",
      params: { filterType: "clear" },
    });
  };

  const canApplyFilter = filterType === "all" || filterType === "nearMe" || filterType === "course" || filterType === "player";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Filter Leaderboard</Text>

        <View style={styles.headerButton} />
      </View>

      <View style={styles.content}>
        {/* Filter Options */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Show Scores From</Text>

          {/* All Courses */}
          <TouchableOpacity
            style={[styles.filterOption, filterType === "all" && styles.filterOptionActive]}
            onPress={() => handleSelectFilterType("all")}
          >
            <View style={styles.filterOptionLeft}>
              <Ionicons
                name="globe-outline"
                size={24}
                color={filterType === "all" ? "#0D5C3A" : "#666"}
              />
              <View style={styles.filterOptionText}>
                <Text style={[styles.filterOptionTitle, filterType === "all" && styles.filterOptionTitleActive]}>
                  All Courses
                </Text>
                <Text style={styles.filterOptionDescription}>Show all leaderboard scores</Text>
              </View>
            </View>
            <View style={[styles.radio, filterType === "all" && styles.radioActive]}>
              {filterType === "all" && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>

          {/* Near Me */}
          <TouchableOpacity
            style={[styles.filterOption, filterType === "nearMe" && styles.filterOptionActive]}
            onPress={() => {
              handleSelectFilterType("nearMe");
              handleNearMeRequest();
            }}
          >
            <View style={styles.filterOptionLeft}>
              <Ionicons
                name="location-outline"
                size={24}
                color={filterType === "nearMe" ? "#0D5C3A" : "#666"}
              />
              <View style={styles.filterOptionText}>
                <Text style={[styles.filterOptionTitle, filterType === "nearMe" && styles.filterOptionTitleActive]}>
                  Near Me
                </Text>
                <Text style={styles.filterOptionDescription}>Courses within 50 miles</Text>
              </View>
            </View>
            {loadingLocation ? (
              <ActivityIndicator size="small" color="#0D5C3A" />
            ) : (
              <View style={[styles.radio, filterType === "nearMe" && styles.radioActive]}>
                {filterType === "nearMe" && <View style={styles.radioDot} />}
              </View>
            )}
          </TouchableOpacity>

          {/* Search Course */}
          <TouchableOpacity
            style={[styles.filterOption, filterType === "course" && styles.filterOptionActive]}
            onPress={() => handleSelectFilterType("course")}
          >
            <View style={styles.filterOptionLeft}>
              <Ionicons
                name="golf-outline"
                size={24}
                color={filterType === "course" ? "#0D5C3A" : "#666"}
              />
              <View style={styles.filterOptionText}>
                <Text style={[styles.filterOptionTitle, filterType === "course" && styles.filterOptionTitleActive]}>
                  Specific Course
                </Text>
                <Text style={styles.filterOptionDescription}>Search for a golf course</Text>
              </View>
            </View>
            <View style={[styles.radio, filterType === "course" && styles.radioActive]}>
              {filterType === "course" && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>

          {/* Search Player */}
          <TouchableOpacity
            style={[styles.filterOption, filterType === "player" && styles.filterOptionActive]}
            onPress={() => handleSelectFilterType("player")}
          >
            <View style={styles.filterOptionLeft}>
              <Ionicons
                name="person-outline"
                size={24}
                color={filterType === "player" ? "#0D5C3A" : "#666"}
              />
              <View style={styles.filterOptionText}>
                <Text style={[styles.filterOptionTitle, filterType === "player" && styles.filterOptionTitleActive]}>
                  Specific Player
                </Text>
                <Text style={styles.filterOptionDescription}>Search by player name</Text>
              </View>
            </View>
            <View style={[styles.radio, filterType === "player" && styles.radioActive]}>
              {filterType === "player" && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.clearButton}
          onPress={handleClearFilter}
        >
          <Text style={styles.clearButtonText}>Clear Filter</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.applyButton, !canApplyFilter && styles.applyButtonDisabled]}
          onPress={handleApplyFilter}
          disabled={!canApplyFilter}
        >
          <Text style={[styles.applyButtonText, !canApplyFilter && styles.applyButtonTextDisabled]}>
            {filterType === "course" || filterType === "player" ? "Continue" : "Apply Filter"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },

  headerButton: {
    width: 40,
    alignItems: "center",
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 1,
  },

  content: {
    flex: 1,
    padding: 16,
  },

  section: {
    marginBottom: 24,
  },

  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  filterOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
  },

  filterOptionActive: {
    borderColor: "#0D5C3A",
    backgroundColor: "rgba(13, 92, 58, 0.05)",
  },

  filterOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },

  filterOptionText: {
    flex: 1,
  },

  filterOptionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },

  filterOptionTitleActive: {
    color: "#0D5C3A",
  },

  filterOptionDescription: {
    fontSize: 13,
    color: "#666",
  },

  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#CCC",
    alignItems: "center",
    justifyContent: "center",
  },

  radioActive: {
    borderColor: "#0D5C3A",
  },

  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#0D5C3A",
  },

  actionButtons: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },

  clearButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    backgroundColor: "#F4EED8",
    alignItems: "center",
    justifyContent: "center",
  },

  clearButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  applyButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },

  applyButtonDisabled: {
    backgroundColor: "rgba(13, 92, 58, 0.3)",
  },

  applyButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  applyButtonTextDisabled: {
    color: "rgba(255, 255, 255, 0.5)",
  },
});