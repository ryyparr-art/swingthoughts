import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface GolfCourse {
  id: number;
  club_name: string;
  course_name: string;
  location: {
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
    address?: string;
  };
  tees?: any;
}

export default function CourseSearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const holeCount = (Array.isArray(params.holeCount) ? params.holeCount[0] : params.holeCount) || "18";
  const [courseSearch, setCourseSearch] = useState("");
  const [courseResults, setCourseResults] = useState<GolfCourse[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<GolfCourse | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [pinnedCourseId, setPinnedCourseId] = useState<number | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [userRegionKey, setUserRegionKey] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data?.pinnedLeaderboard) {
          setPinnedCourseId(data.pinnedLeaderboard.courseId);
        }
        if (data?.regionKey) {
          setUserRegionKey(data.regionKey);
        }
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  const searchCourses = async (searchQuery: string) => {
    try {
      console.log("🔍 Searching leaderboards for:", searchQuery);
      setLoadingCourses(true);
      setSearchError(null);

      if (!userRegionKey) {
        console.warn("⚠️ No regionKey available for search");
        setSearchError("Region not found — please try again");
        setLoadingCourses(false);
        return;
      }

      // Query only leaderboards in the user's region — avoids full collection scan
      const lbQuery = query(
        collection(db, "leaderboards"),
        where("regionKey", "==", userRegionKey)
      );
      const lbSnap = await getDocs(lbQuery);

      const searchLower = searchQuery.toLowerCase();
      const results: GolfCourse[] = [];

      lbSnap.forEach((d) => {
        const data = d.data();
        const courseName = (data.courseName || "").toLowerCase();
        if (courseName.includes(searchLower)) {
          results.push({
            id: data.courseId,
            club_name: data.courseName,
            course_name: data.courseName,
            location: data.location || { city: "", state: "" },
          });
        }
      });

      // Sort alphabetically by course name
      results.sort((a, b) => a.course_name.localeCompare(b.course_name));

      console.log(`✅ Found ${results.length} leaderboards matching "${searchQuery}"`);
      setCourseResults(results);
      setLoadingCourses(false);
    } catch (err) {
      console.error("❌ Course search error:", err);
      setSearchError(err instanceof Error ? err.message : "Search failed");
      soundPlayer.play("error");
      setLoadingCourses(false);
    }
  };

  const handleCourseSearchChange = (text: string) => {
    setCourseSearch(text);
    setSelectedCourse(null);
    setSearchError(null);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const trimmed = text.trim();

      if (!trimmed) {
        setCourseResults([]);
        setLoadingCourses(false);
        return;
      }

      if (trimmed.length >= 2) {
        searchCourses(trimmed);
      }
    }, 300);
  };

  const handleSelectCourse = (course: GolfCourse) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCourse(course);
    Keyboard.dismiss();
  };

  const handlePinCourse = async (course: GolfCourse) => {
    try {
      soundPlayer.play("click");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const uid = auth.currentUser?.uid;
      if (!uid) return;

      await updateDoc(doc(db, "users", uid), {
        pinnedLeaderboard: {
          courseId: course.id,
          courseName: course.course_name,
          pinnedAt: new Date().toISOString(),
        },
      });

      setPinnedCourseId(course.id);
      console.log("✅ Pinned course:", course.course_name);
    } catch (error) {
      console.error("Error pinning course:", error);
      soundPlayer.play("error");
    }
  };

  const handleUnpinCourse = async () => {
    try {
      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const uid = auth.currentUser?.uid;
      if (!uid) return;

      await updateDoc(doc(db, "users", uid), {
        pinnedLeaderboard: null,
      });

      setPinnedCourseId(null);
      console.log("✅ Unpinned course");
    } catch (error) {
      console.error("Error unpinning course:", error);
      soundPlayer.play("error");
    }
  };

  const handleApply = async () => {
    if (!selectedCourse) return;

    try {
      soundPlayer.play("click");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      router.push({
        pathname: "/leaderboard",
        params: {
          filterType: "course",
          courseId: selectedCourse.id.toString(),
          courseName: selectedCourse.course_name,
          holeCount,
        },
      });
    } catch (error) {
      console.error("Error applying course filter:", error);
      soundPlayer.play("error");
    }
  };

  return (
    <View style={styles.wrapper}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.headerButton}
          >
            <Image
              source={require("@/assets/icons/Back.png")}
              style={styles.backIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Search Course</Text>

          <View style={styles.headerButton} />
        </View>

        <View style={styles.content}>
          <Text style={styles.instructions}>
            Search for a course to view or pin to your leaderboard
          </Text>

          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Enter course name..."
              placeholderTextColor="#999"
              value={courseSearch}
              onChangeText={handleCourseSearchChange}
              autoFocus
            />
            {loadingCourses && (
              <ActivityIndicator
                size="small"
                color="#0D5C3A"
                style={styles.searchSpinner}
              />
            )}
          </View>

          {searchError && (
            <View style={styles.errorBanner}>
              <Ionicons name="warning" size={20} color="#B0433B" />
              <Text style={styles.errorText}>{searchError}</Text>
            </View>
          )}

          {selectedCourse && (
            <View style={styles.selectedCourseCard}>
              <View style={styles.selectedCourseInfo}>
                <Text style={styles.selectedCourseName}>
                  {selectedCourse.course_name}
                </Text>
                <Text style={styles.selectedCourseLocation}>
                  {selectedCourse.location.city}, {selectedCourse.location.state}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={24} color="#FFD700" />
            </View>
          )}

          <FlatList
            data={courseResults}
            keyExtractor={(item, index) => `${item.id}-${index}`}
            style={styles.resultsList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isPinned = pinnedCourseId === item.id;

              return (
                <View style={styles.courseItemContainer}>
                  <TouchableOpacity
                    style={[
                      styles.courseItem,
                      selectedCourse?.id === item.id && styles.courseItemSelected,
                    ]}
                    onPress={() => handleSelectCourse(item)}
                  >
                    <View style={styles.courseItemContent}>
                      <Text style={styles.courseItemName}>
                        {item.course_name}
                      </Text>
                      <Text style={styles.courseItemLocation}>
                        {item.location?.city && item.location?.state
                          ? `${item.location.city}, ${item.location.state}`
                          : item.location?.city || item.location?.state || ""}
                      </Text>
                    </View>
                    {selectedCourse?.id === item.id && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#0D5C3A"
                      />
                    )}
                  </TouchableOpacity>

                  {/* Pin Button */}
                  <TouchableOpacity
                    style={[
                      styles.pinButton,
                      isPinned && styles.pinButtonActive,
                    ]}
                    onPress={() => {
                      if (isPinned) {
                        soundPlayer.play("click");
                        Alert.alert(
                          "Unpin Course",
                          `Remove ${item.course_name} from your pinned leaderboard?`,
                          [
                            {
                              text: "Cancel",
                              style: "cancel",
                              onPress: () => soundPlayer.play("click"),
                            },
                            {
                              text: "Unpin",
                              style: "destructive",
                              onPress: handleUnpinCourse,
                            },
                          ]
                        );
                      } else {
                        if (pinnedCourseId) {
                          soundPlayer.play("click");
                          Alert.alert(
                            "Replace Pinned Course",
                            `You can only pin 1 course. Replace your current pin with ${item.course_name}?`,
                            [
                              {
                                text: "Cancel",
                                style: "cancel",
                                onPress: () => soundPlayer.play("click"),
                              },
                              {
                                text: "Replace",
                                onPress: () => handlePinCourse(item),
                              },
                            ]
                          );
                        } else {
                          handlePinCourse(item);
                        }
                      }
                    }}
                  >
                    <Ionicons
                      name={isPinned ? "pin" : "pin-outline"}
                      size={20}
                      color={isPinned ? "#FFD700" : "#666"}
                    />
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={
              courseSearch.length >= 2 && !loadingCourses ? (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={48} color="#CCC" />
                  <Text style={styles.emptyText}>
                    {searchError ? "Search failed - try again" : "No courses found"}
                  </Text>
                  <Text style={styles.emptyHint}>
                    Try searching with a different name
                  </Text>
                </View>
              ) : null
            }
          />
        </View>

        {selectedCourse && (
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
              <Text style={styles.applyButtonText}>View Leaderboard</Text>
            </TouchableOpacity>
          </View>
        )}
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
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },

  headerButton: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  backIcon: {
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
    padding: 16,
  },

  instructions: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
    textAlign: "center",
  },

  searchContainer: {
    position: "relative",
    marginBottom: 16,
  },

  searchInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#333",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  searchSpinner: {
    position: "absolute",
    right: 16,
    top: 16,
  },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: "#FFE5E5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFB3B3",
  },

  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#B0433B",
    fontWeight: "600",
  },

  selectedCourseCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    marginBottom: 16,
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
  },

  selectedCourseInfo: {
    flex: 1,
  },

  selectedCourseName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  selectedCourseLocation: {
    fontSize: 14,
    color: "#FFD700",
    marginTop: 4,
  },

  resultsList: {
    flex: 1,
  },

  courseItemContainer: {
    flexDirection: "row",
    marginBottom: 8,
    gap: 8,
  },

  courseItem: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
  },

  courseItemSelected: {
    borderColor: "#0D5C3A",
    backgroundColor: "rgba(13, 92, 58, 0.05)",
  },

  courseItemContent: {
    flex: 1,
  },

  courseItemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },

  courseItemLocation: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
  },

  pinButton: {
    width: 44,
    height: 56,
    borderRadius: 12,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
  },

  pinButtonActive: {
    backgroundColor: "#0D5C3A",
  },

  emptyState: {
    alignItems: "center",
    paddingTop: 40,
  },

  emptyText: {
    fontSize: 16,
    color: "#999",
    marginTop: 12,
    fontWeight: "600",
  },

  emptyHint: {
    fontSize: 13,
    color: "#BBB",
    marginTop: 4,
  },

  actionButtons: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },

  applyButton: {
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },

  applyButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});