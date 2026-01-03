import LocationPickerModal from "@/components/modals/LocationPickerModal";
import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LeaderboardFiltersScreen() {
  const router = useRouter();
  const [filterType, setFilterType] = useState<"nearMe" | "course" | "player" | "partnersOnly">("nearMe");
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [cachedLocation, setCachedLocation] = useState<string>("Loading...");

  useEffect(() => {
    loadCachedLocation();
  }, []);

  const loadCachedLocation = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        const location = userDoc.data().location;
        if (location?.city && location?.state) {
          setCachedLocation(`${location.city}, ${location.state}`);
        } else {
          setCachedLocation("No location set");
        }
      }
    } catch (error) {
      console.error("Error loading location:", error);
      soundPlayer.play('error');
      setCachedLocation("No location set");
    }
  };

  const handleSelectFilterType = (type: "nearMe" | "course" | "player" | "partnersOnly") => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (type === "nearMe") {
      // Open LocationPickerModal immediately
      setLocationModalVisible(true);
    } else {
      setFilterType(type);
    }
  };

  const handleLocationSet = async (location: {
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
  }) => {
    // Location is cached in modal, update display
    soundPlayer.play('click');
    setCachedLocation(`${location.city}, ${location.state}`);
    setFilterType("nearMe");
    setLocationModalVisible(false);
  };

  const handleApplyFilter = () => {
    soundPlayer.play('click');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (filterType === "nearMe") {
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
    } else if (filterType === "partnersOnly") {
      // Navigate to leaderboard with partners filter
      router.push({
        pathname: "/leaderboard",
        params: { filterType: "partnersOnly" },
      });
    }
  };

  const handleClearFilter = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFilterType("nearMe");
    router.push({
      pathname: "/leaderboard",
      params: { filterType: "nearMe" },
    });
  };

  const canApplyFilter = filterType === "nearMe" || filterType === "course" || filterType === "player" || filterType === "partnersOnly";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }} 
          style={styles.headerButton}
        >
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Filter Leaderboard</Text>

        <View style={styles.headerButton} />
      </View>

      <View style={styles.content}>
        {/* Filter Options */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Show Scores From</Text>

          {/* Near Me */}
          <TouchableOpacity
            style={[styles.filterOption, filterType === "nearMe" && styles.filterOptionActive]}
            onPress={() => handleSelectFilterType("nearMe")}
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
                <Text style={styles.filterOptionDescription}>
                  📍 {cachedLocation}
                </Text>
                <Text style={styles.filterOptionHint}>Tap to change location</Text>
              </View>
            </View>
            <View style={[styles.radio, filterType === "nearMe" && styles.radioActive]}>
              {filterType === "nearMe" && <View style={styles.radioDot} />}
            </View>
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

          {/* Partners Only - NEW */}
          <TouchableOpacity
            style={[styles.filterOption, filterType === "partnersOnly" && styles.filterOptionActive]}
            onPress={() => handleSelectFilterType("partnersOnly")}
          >
            <View style={styles.filterOptionLeft}>
              <Ionicons
                name="people-outline"
                size={24}
                color={filterType === "partnersOnly" ? "#0D5C3A" : "#666"}
              />
              <View style={styles.filterOptionText}>
                <Text style={[styles.filterOptionTitle, filterType === "partnersOnly" && styles.filterOptionTitleActive]}>
                  Partners Only
                </Text>
                <Text style={styles.filterOptionDescription}>Show scores from your partners</Text>
              </View>
            </View>
            <View style={[styles.radio, filterType === "partnersOnly" && styles.radioActive]}>
              {filterType === "partnersOnly" && <View style={styles.radioDot} />}
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

      {/* Location Picker Modal */}
      <LocationPickerModal
        visible={locationModalVisible}
        onClose={() => {
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setLocationModalVisible(false);
        }}
        onLocationSet={handleLocationSet}
      />
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
    marginTop: 2,
  },

  filterOptionHint: {
    fontSize: 11,
    color: "#999",
    fontStyle: "italic",
    marginTop: 2,
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