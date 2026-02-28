/**
 * CourseSearchPicker
 *
 * Search and select a golf course. Firestore-first with Golf Course API fallback.
 * Returns the selected course data to the parent.
 *
 * Used by: RoundEditor, Score posting, Outing creation, Invitationals
 *
 * Search strategy:
 *   1. Query Firestore `courses` collection (already-cached courses)
 *   2. If <3 results, fallback to Golf Course API
 *   3. Deduplicate by courseId
 */

import { db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export interface CourseSelection {
  courseId: number;
  courseName: string;
  clubName?: string;
  location: {
    city: string;
    state: string;
    country?: string;
  };
  holes?: number;
}

interface CourseSearchPickerProps {
  selectedCourse: CourseSelection | null;
  onSelectCourse: (course: CourseSelection) => void;
  onClear?: () => void;
  placeholder?: string;
}

const GOLF_COURSE_API_KEY = process.env.EXPO_PUBLIC_GOLF_COURSE_API_KEY || "";

export default function CourseSearchPicker({
  selectedCourse,
  onSelectCourse,
  onClear,
  placeholder = "Search for a course...",
}: CourseSearchPickerProps) {
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<CourseSelection[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (text: string) => {
    if (text.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setSearching(true);
    setShowResults(true);

    try {
      const allResults: CourseSelection[] = [];
      const seenIds = new Set<number>();

      // 1. Search Firestore first (course_name prefix match)
      try {
        const coursesRef = collection(db, "courses");

        // Firestore stores course_name as-is (mixed case)
        // Try prefix match on course_name field
        const searchCapitalized =
          text.charAt(0).toUpperCase() + text.slice(1);

        const q = query(
          coursesRef,
          where("course_name", ">=", searchCapitalized),
          where("course_name", "<=", searchCapitalized + "\uf8ff"),
          orderBy("course_name"),
          limit(10)
        );
        const snap = await getDocs(q);

        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const courseId =
            typeof data.id === "number"
              ? data.id
              : parseInt(docSnap.id, 10);

          if (!isNaN(courseId) && !seenIds.has(courseId)) {
            seenIds.add(courseId);
            allResults.push({
              courseId,
              courseName: data.course_name || data.courseName || "Unknown",
              clubName: data.club_name || data.clubName,
              location: {
                city: data.location?.city || "",
                state: data.location?.state || "",
                country: data.location?.country,
              },
            });
          }
        });

        // Also try lowercase prefix if no results
        if (allResults.length === 0) {
          const qLower = query(
            coursesRef,
            where("course_name", ">=", text),
            where("course_name", "<=", text + "\uf8ff"),
            orderBy("course_name"),
            limit(10)
          );
          const snapLower = await getDocs(qLower);

          snapLower.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const courseId =
              typeof data.id === "number"
                ? data.id
                : parseInt(docSnap.id, 10);

            if (!isNaN(courseId) && !seenIds.has(courseId)) {
              seenIds.add(courseId);
              allResults.push({
                courseId,
                courseName: data.course_name || data.courseName || "Unknown",
                clubName: data.club_name || data.clubName,
                location: {
                  city: data.location?.city || "",
                  state: data.location?.state || "",
                  country: data.location?.country,
                },
              });
            }
          });
        }
      } catch (firestoreError) {
        console.warn("Firestore course search error:", firestoreError);
      }

      // 2. If few results, try Golf Course API
      if (allResults.length < 3 && GOLF_COURSE_API_KEY) {
        try {
          const response = await fetch(
            `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(text)}&limit=10`,
            {
              headers: { Authorization: `Key ${GOLF_COURSE_API_KEY}` },
            }
          );

          if (response.ok) {
            const data = await response.json();
            const courses = data.courses || [];

            courses.forEach((c: any) => {
              const courseId = c.id || c.course_id;
              if (courseId && !seenIds.has(courseId)) {
                seenIds.add(courseId);
                allResults.push({
                  courseId,
                  courseName: c.course_name || c.name || "Unknown",
                  clubName: c.club_name,
                  location: {
                    city: c.location?.city || "",
                    state: c.location?.state || "",
                    country: c.location?.country,
                  },
                });
              }
            });
          }
        } catch (apiError) {
          console.warn("Golf Course API error:", apiError);
        }
      }

      setResults(allResults);
    } catch (error) {
      console.error("Course search error:", error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleTextChange = (text: string) => {
    setSearchText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(text), 300);
  };

  const handleSelect = (course: CourseSelection) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectCourse(course);
    setSearchText("");
    setResults([]);
    setShowResults(false);
  };

  const handleClear = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClear?.();
    setSearchText("");
    setResults([]);
    setShowResults(false);
  };

  // Show selected course
  if (selectedCourse) {
    return (
      <View style={styles.selectedContainer}>
        <View style={styles.selectedIcon}>
          <Ionicons name="golf" size={18} color="#FFF" />
        </View>
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedName}>{selectedCourse.courseName}</Text>
          <Text style={styles.selectedLocation}>
            {[selectedCourse.location.city, selectedCourse.location.state]
              .filter(Boolean)
              .join(", ")}
          </Text>
        </View>
        {onClear && (
          <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder={placeholder}
          placeholderTextColor="#999"
          value={searchText}
          onChangeText={handleTextChange}
          autoCorrect={false}
          autoCapitalize="words"
        />
        {searching && <ActivityIndicator size="small" color="#0D5C3A" />}
      </View>

      {showResults && (
        <View style={styles.resultsContainer}>
          {results.length === 0 && !searching ? (
            <View style={styles.emptyResult}>
              <Text style={styles.emptyText}>
                {searchText.length < 2
                  ? "Type to search..."
                  : "No courses found"}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.resultsList}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {results.map((course) => (
                <TouchableOpacity
                  key={course.courseId}
                  style={styles.resultItem}
                  onPress={() => handleSelect(course)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="golf-outline" size={16} color="#0D5C3A" />
                  <View style={styles.resultText}>
                    <Text style={styles.resultName}>{course.courseName}</Text>
                    <Text style={styles.resultLocation}>
                      {[course.clubName, course.location.city, course.location.state]
                        .filter(Boolean)
                        .join(" • ")}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},

  // Search bar
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#333",
  },

  // Results dropdown
  resultsContainer: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    maxHeight: 220,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  resultsList: {
    maxHeight: 220,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  resultText: {
    flex: 1,
    gap: 1,
  },
  resultName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  resultLocation: {
    fontSize: 12,
    color: "#888",
  },
  emptyResult: {
    padding: 20,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    color: "#999",
  },

  // Selected state
  selectedContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },
  selectedIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedInfo: {
    flex: 1,
    gap: 1,
  },
  selectedName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
  },
  selectedLocation: {
    fontSize: 12,
    color: "#888",
  },
  clearButton: {
    padding: 4,
  },
});