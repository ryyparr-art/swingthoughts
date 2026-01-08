import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
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
  const [courseSearch, setCourseSearch] = useState("");
  const [courseResults, setCourseResults] = useState<GolfCourse[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<GolfCourse | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [pinnedCourseId, setPinnedCourseId] = useState<number | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadPinnedCourse();
  }, []);

  const loadPinnedCourse = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        const pinnedLeaderboard = userDoc.data()?.pinnedLeaderboard;
        if (pinnedLeaderboard) {
          setPinnedCourseId(pinnedLeaderboard.courseId);
        }
      }
    } catch (error) {
      console.error("Error loading pinned course:", error);
    }
  };

  const searchCourses = async (searchQuery: string) => {
    try {
      console.log("🔍 Searching courses for:", searchQuery);
      setLoadingCourses(true);
      setSearchError(null);

      // First, search Firestore cache
      const coursesQuery = query(collection(db, "courses"));
      const coursesSnap = await getDocs(coursesQuery);
      
      const cachedCourses: GolfCourse[] = [];
      coursesSnap.forEach((doc) => {
        const data = doc.data();
        const courseName = data.course_name?.toLowerCase() || "";
        const clubName = data.club_name?.toLowerCase() || "";
        const searchLower = searchQuery.toLowerCase();
        
        if (courseName.includes(searchLower) || clubName.includes(searchLower)) {
          cachedCourses.push({
            id: data.id,
            club_name: data.club_name,
            course_name: data.course_name,
            location: data.location,
            tees: data.tees,
          });
        }
      });

      console.log(`✅ Found ${cachedCourses.length} cached courses`);

      // Deduplicate courses by ID (keep first occurrence)
      const uniqueCourses = Array.from(
        new Map(cachedCourses.map(c => [c.id, c])).values()
      );

      console.log(`✅ After deduplication: ${uniqueCourses.length} unique courses`);

      // If we have cached results, show them
      if (uniqueCourses.length > 0) {
        setCourseResults(uniqueCourses);
        setLoadingCourses(false);
        return;
      }

      // No cached results, try API
      console.log("🌐 Searching API...");
      
      if (!GOLF_COURSE_API_URL || !GOLF_COURSE_API_KEY) {
        console.error("❌ API credentials missing");
        setSearchError("API credentials not configured");
        setLoadingCourses(false);
        return;
      }

      const apiUrl = `${GOLF_COURSE_API_URL}/search?search_query=${encodeURIComponent(searchQuery)}`;
      console.log("📡 API URL:", apiUrl);

      const res = await fetch(apiUrl, {
        method: "GET",
        headers: {
          Authorization: `Key ${GOLF_COURSE_API_KEY}`,
          "Content-Type": "application/json",
        },
      });

      console.log("📡 API Response status:", res.status);

      if (!res.ok) {
        const errorText = await res.text();
        console.error("❌ API Error:", res.status, errorText);
        setSearchError(`API Error: ${res.status}`);
        soundPlayer.play('error');
        setLoadingCourses(false);
        return;
      }

      const data = await res.json();
      console.log("📦 API Response data:", data);
      
      const courses: GolfCourse[] = data.courses || [];
      console.log(`✅ Found ${courses.length} courses from API`);

      // Deduplicate courses by ID
      const uniqueApiCourses = Array.from(
        new Map(courses.map(c => [c.id, c])).values()
      );

      console.log(`✅ After deduplication: ${uniqueApiCourses.length} unique courses`);

      setCourseResults(uniqueApiCourses);
      setLoadingCourses(false);
    } catch (err) {
      console.error("❌ Course search error:", err);
      setSearchError(err instanceof Error ? err.message : "Search failed");
      soundPlayer.play('error');
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
      const query = text.trim();

      if (!query) {
        setCourseResults([]);
        setLoadingCourses(false);
        return;
      }

      if (query.length >= 2) {
        searchCourses(query);
      }
    }, 300);
  };

  const handleSelectCourse = (course: GolfCourse) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCourse(course);
    Keyboard.dismiss(); // ✅ Hide keyboard when course is selected
  };

  const saveCourseToFirestore = async (course: GolfCourse) => {
    try {
      const courseData = {
        id: course.id,
        club_name: course.club_name,
        course_name: course.course_name,
        location: course.location,
        tees: course.tees || null,
        cachedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, "courses", String(course.id)), courseData, { merge: true });
      console.log("💾 Saved course to Firestore:", course.course_name);
    } catch (error) {
      console.error("❌ Error saving course:", error);
      soundPlayer.play('error');
    }
  };

  const handlePinCourse = async (course: GolfCourse) => {
    try {
      soundPlayer.play('click');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const uid = auth.currentUser?.uid;
      if (!uid) return;

      // Save course to Firestore first
      const coursesQuery = query(
        collection(db, "courses"),
        where("id", "==", course.id)
      );
      const coursesSnap = await getDocs(coursesQuery);

      if (coursesSnap.empty) {
        await saveCourseToFirestore(course);
      }

      // Pin the course
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
      soundPlayer.play('error');
    }
  };

  const handleUnpinCourse = async () => {
    try {
      soundPlayer.play('click');
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
      soundPlayer.play('error');
    }
  };

  const handleApply = async () => {
    if (!selectedCourse) return;
    
    try {
      soundPlayer.play('click');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Check if course exists in Firestore
      const coursesQuery = query(
        collection(db, "courses"),
        where("id", "==", selectedCourse.id)
      );
      const coursesSnap = await getDocs(coursesQuery);

      if (coursesSnap.empty) {
        // Course not cached - save it
        console.log("🔍 Course not cached, saving to Firestore...");
        await saveCourseToFirestore(selectedCourse);
      } else {
        console.log("✅ Course already cached");
      }

      // Navigate to leaderboard with filter
      router.push({
        pathname: "/leaderboard",
        params: { 
          filterType: "course",
          courseId: selectedCourse.id.toString(),
          courseName: selectedCourse.course_name,
        },
      });
    } catch (error) {
      console.error("Error applying course filter:", error);
      soundPlayer.play('error');
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
            soundPlayer.play('click');
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
            <ActivityIndicator size="small" color="#0D5C3A" style={styles.searchSpinner} />
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
              <Text style={styles.selectedCourseName}>{selectedCourse.course_name}</Text>
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
                    selectedCourse?.id === item.id && styles.courseItemSelected
                  ]} 
                  onPress={() => handleSelectCourse(item)}
                >
                  <View style={styles.courseItemContent}>
                    <Text style={styles.courseItemName}>{item.course_name}</Text>
                    <Text style={styles.courseItemLocation}>
                      {item.location.city}, {item.location.state}
                    </Text>
                  </View>
                  {selectedCourse?.id === item.id && (
                    <Ionicons name="checkmark-circle" size={20} color="#0D5C3A" />
                  )}
                </TouchableOpacity>
                
                {/* Pin Button */}
                <TouchableOpacity
                  style={[styles.pinButton, isPinned && styles.pinButtonActive]}
                  onPress={() => {
                    if (isPinned) {
                      soundPlayer.play('click');
                      Alert.alert(
                        "Unpin Course",
                        `Remove ${item.course_name} from your pinned leaderboard?`,
                        [
                          { 
                            text: "Cancel", 
                            style: "cancel",
                            onPress: () => soundPlayer.play('click')
                          },
                          { 
                            text: "Unpin", 
                            style: "destructive", 
                            onPress: handleUnpinCourse 
                          },
                        ]
                      );
                    } else {
                      if (pinnedCourseId) {
                        soundPlayer.play('click');
                        Alert.alert(
                          "Replace Pinned Course",
                          `You can only pin 1 course. Replace your current pin with ${item.course_name}?`,
                          [
                            { 
                              text: "Cancel", 
                              style: "cancel",
                              onPress: () => soundPlayer.play('click')
                            },
                            { 
                              text: "Replace", 
                              onPress: () => handlePinCourse(item) 
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