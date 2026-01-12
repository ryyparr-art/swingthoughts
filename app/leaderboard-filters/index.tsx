import LocationPickerModal from "@/components/modals/LocationPickerModal";
import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LeaderboardFiltersScreen() {
  const router = useRouter();
  const [filterType, setFilterType] = useState<"nearMe" | "course" | "player" | "partnersOnly">("nearMe");
  const [holeCount, setHoleCount] = useState<"9" | "18">("18"); // ✅ NEW: Hole count filter
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [cachedLocation, setCachedLocation] = useState<string>("Loading...");
  
  const [pinnedLeaderboard, setPinnedLeaderboard] = useState<{
    courseId: number;
    courseName: string;
  } | null>(null);

  useEffect(() => {
    loadCachedLocation();
    loadPinnedLeaderboard();
  }, []);

  const loadCachedLocation = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        const city = userData.currentCity || userData.city;
        const state = userData.currentState || userData.state;
        
        if (city && state) {
          setCachedLocation(`${city}, ${state}`);
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

  const loadPinnedLeaderboard = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        const pinned = userDoc.data()?.pinnedLeaderboard;
        if (pinned?.courseId && pinned?.courseName) {
          setPinnedLeaderboard({
            courseId: pinned.courseId,
            courseName: pinned.courseName,
          });
          console.log("📌 Loaded pinned leaderboard:", pinned.courseName);
        } else {
          setPinnedLeaderboard(null);
        }
      }
    } catch (error) {
      console.error("Error loading pinned leaderboard:", error);
      soundPlayer.play('error');
    }
  };

  const handleUnpinLeaderboard = async () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      await updateDoc(doc(db, "users", uid), {
        pinnedLeaderboard: null,
      });

      setPinnedLeaderboard(null);
      console.log("✅ Unpinned leaderboard");
    } catch (error) {
      console.error("Error unpinning:", error);
      soundPlayer.play("error");
    }
  };

  const handleGoToPinned = () => {
    if (!pinnedLeaderboard) return;
    
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    router.push({
      pathname: "/leaderboard",
      params: {
        filterType: "course",
        courseId: pinnedLeaderboard.courseId.toString(),
        courseName: pinnedLeaderboard.courseName,
        holeCount, // ✅ Pass hole count
      },
    });
  };

  const handleSelectFilterType = (type: "nearMe" | "course" | "player" | "partnersOnly") => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (type === "nearMe") {
      setLocationModalVisible(true);
    } else {
      setFilterType(type);
    }
  };

  // ✅ NEW: Handle hole count selection
  const handleSelectHoleCount = (count: "9" | "18") => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHoleCount(count);
  };

  const handleLocationSet = async (location: {
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
  }) => {
    soundPlayer.play('click');
    setCachedLocation(`${location.city}, ${location.state}`);
    setFilterType("nearMe");
    setLocationModalVisible(false);
    
    await loadCachedLocation();
  };

  const handleApplyFilter = () => {
    soundPlayer.play('click');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (filterType === "nearMe") {
      router.push({
        pathname: "/leaderboard",
        params: { 
          filterType: "nearMe",
          holeCount, // ✅ Pass hole count
        },
      });
    } else if (filterType === "course") {
      router.push({
        pathname: "/leaderboard-filters/course-search",
        params: { holeCount }, // ✅ Pass hole count
      });
    } else if (filterType === "player") {
      router.push({
        pathname: "/leaderboard-filters/player-search",
        params: { holeCount }, // ✅ Pass hole count
      });
    } else if (filterType === "partnersOnly") {
      router.push({
        pathname: "/leaderboard",
        params: { 
          filterType: "partnersOnly",
          holeCount, // ✅ Pass hole count
        },
      });
    }
  };

  const handleClearFilter = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFilterType("nearMe");
    setHoleCount("18"); // ✅ Reset to default
    router.push({
      pathname: "/leaderboard",
      params: { 
        filterType: "nearMe",
        holeCount: "18",
      },
    });
  };

  const canApplyFilter = filterType === "nearMe" || filterType === "course" || filterType === "player" || filterType === "partnersOnly";

  return (
    <View style={styles.wrapper}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />
      <View style={styles.container}>
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
          <Image
            source={require("@/assets/icons/Close.png")}
            style={styles.closeIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Filter Leaderboard</Text>

        <View style={styles.headerButton} />
      </View>

      <View style={styles.content}>
        {/* Pinned Leaderboard Section */}
        {pinnedLeaderboard && (
          <View style={styles.pinnedBoard}>
            <View style={styles.pinnedHeader}>
              <View style={styles.pinnedBadge}>
                <Text style={styles.pinnedBadgeText}>📌 PINNED</Text>
              </View>
              <TouchableOpacity
                style={styles.unpinButton}
                onPress={handleUnpinLeaderboard}
              >
                <Ionicons name="close-circle" size={20} color="#666" />
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity onPress={handleGoToPinned}>
              <View style={styles.boardHeader}>
                <Text style={styles.boardTitle}>
                  {pinnedLeaderboard.courseName}
                </Text>
                <Text style={styles.boardSubtitle}>
                  Tap to view full leaderboard
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

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
                <Text style={styles.filterOptionHint}>Pin your favorite course to keep it at the top</Text>
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

          {/* Partners Only */}
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

        {/* ✅ NEW: Hole Count Filter Section */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Score Type</Text>

          {/* 18-Hole */}
          <TouchableOpacity
            style={[styles.filterOption, holeCount === "18" && styles.filterOptionActive]}
            onPress={() => handleSelectHoleCount("18")}
          >
            <View style={styles.filterOptionLeft}>
              <Ionicons
                name="flag-outline"
                size={24}
                color={holeCount === "18" ? "#0D5C3A" : "#666"}
              />
              <View style={styles.filterOptionText}>
                <Text style={[styles.filterOptionTitle, holeCount === "18" && styles.filterOptionTitleActive]}>
                  18-Hole Scores
                </Text>
                <Text style={styles.filterOptionDescription}>Full round scores with achievements</Text>
              </View>
            </View>
            <View style={[styles.radio, holeCount === "18" && styles.radioActive]}>
              {holeCount === "18" && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>

          {/* 9-Hole */}
          <TouchableOpacity
            style={[styles.filterOption, holeCount === "9" && styles.filterOptionActive]}
            onPress={() => handleSelectHoleCount("9")}
          >
            <View style={styles.filterOptionLeft}>
              <Ionicons
                name="golf-outline"
                size={24}
                color={holeCount === "9" ? "#0D5C3A" : "#666"}
              />
              <View style={styles.filterOptionText}>
                <Text style={[styles.filterOptionTitle, holeCount === "9" && styles.filterOptionTitleActive]}>
                  9-Hole Scores
                </Text>
                <Text style={styles.filterOptionDescription}>Half round scores</Text>
              </View>
            </View>
            <View style={[styles.radio, holeCount === "9" && styles.radioActive]}>
              {holeCount === "9" && <View style={styles.radioDot} />}
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
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  safeTop: {
    backgroundColor: "#0D5C3A",
  },

  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#0D5C3A",
  },

  headerButton: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  closeIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFFFFF",
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 1,
  },

  content: {
    flex: 1,
    paddingTop: 8,
  },

  pinnedBoard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#DDD",
    backgroundColor: "#FFF",
    borderRadius: 8,
  },

  pinnedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: "#FFFEF7",
    borderBottomWidth: 1,
    borderBottomColor: "#FFD700",
  },
  
  pinnedBadge: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  
  pinnedBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#0D5C3A",
    letterSpacing: 0.5,
  },
  
  unpinButton: {
    padding: 4,
  },

  boardHeader: {
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#DDD",
  },

  boardTitle: {
    fontWeight: "900",
    fontSize: 18,
  },

  boardSubtitle: {
    fontWeight: "600",
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },

  section: {
    marginHorizontal: 16,
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
    padding: 18,
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    marginHorizontal: 0,
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