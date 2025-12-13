import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
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
  };
}

export default function CourseSearchScreen() {
  const router = useRouter();
  const [courseSearch, setCourseSearch] = useState("");
  const [courseResults, setCourseResults] = useState<GolfCourse[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<GolfCourse | null>(null);
  const [loadingCourses, setLoadingCourses] = useState(false);
  
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchCourses = async (query: string) => {
    try {
      setLoadingCourses(true);

      const res = await fetch(
        `${GOLF_COURSE_API_URL}/search?search_query=${encodeURIComponent(query)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Key ${GOLF_COURSE_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        setLoadingCourses(false);
        return;
      }

      const data = await res.json();
      const courses: GolfCourse[] = data.courses || [];

      setCourseResults(courses);
      setLoadingCourses(false);
    } catch (err) {
      console.error("Course search error:", err);
      setLoadingCourses(false);
    }
  };

  const handleCourseSearchChange = (text: string) => {
    setCourseSearch(text);
    setSelectedCourse(null);

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCourse(course);
  };

  const handleApply = () => {
    if (!selectedCourse) return;
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push({
      pathname: "/leaderboard",
      params: { 
        filterType: "course",
        courseName: selectedCourse.course_name,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Search Course</Text>

        <View style={styles.headerButton} />
      </View>

      <View style={styles.content}>
        <Text style={styles.instructions}>
          Enter a course name to filter leaderboard scores
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
          keyExtractor={(item) => item.id.toString()}
          style={styles.resultsList}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
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
          )}
          ListEmptyComponent={
            courseSearch.length >= 2 && !loadingCourses ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={48} color="#CCC" />
                <Text style={styles.emptyText}>No courses found</Text>
              </View>
            ) : null
          }
        />
      </View>

      {selectedCourse && (
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
            <Text style={styles.applyButtonText}>Apply Filter</Text>
          </TouchableOpacity>
        </View>
      )}
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

  courseItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    marginBottom: 8,
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

  emptyState: {
    alignItems: "center",
    paddingTop: 40,
  },

  emptyText: {
    fontSize: 16,
    color: "#999",
    marginTop: 12,
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