/**
 * CourseSearchModal
 * 
 * Extracted from modify-clubs.tsx.
 * Handles searching for golf courses via cached data,
 * Firestore, and external Golf Course API.
 */

import { db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import type { Course, UserLocation } from "./types";

const API_KEY = process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY;
const API_BASE = "https://api.golfcourseapi.com/v1";

/* ================================================================ */
/* HELPERS                                                          */
/* ================================================================ */

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ================================================================ */
/* PROPS                                                            */
/* ================================================================ */

interface CourseSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (course: Course) => void;
  cachedCourses: Course[];
  location: UserLocation | null;
}

/* ================================================================ */
/* COMPONENT                                                        */
/* ================================================================ */

export default function CourseSearchModal({
  visible,
  onClose,
  onSelect,
  cachedCourses,
  location,
}: CourseSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Course[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    Keyboard.dismiss();

    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const query = searchQuery.trim().toLowerCase();

    try {
      soundPlayer.play("click");
      let combinedResults: Course[] = [];

      // Step 1: Filter cached courses locally
      const cachedMatches = cachedCourses.filter((c) => {
        const name = (c.course_name || c.courseName || "").toLowerCase();
        const city = c.location?.city?.toLowerCase() || "";
        return name.includes(query) || city.includes(query);
      });
      combinedResults = [...cachedMatches];

      // Step 2: Search Firestore courses collection
      try {
        const {
          collection: firestoreCollection,
          getDocs,
          query: firestoreQuery,
          where,
          limit,
        } = await import("firebase/firestore");

        const searchUpper =
          searchQuery.trim().charAt(0).toUpperCase() + searchQuery.trim().slice(1);
        const coursesRef = firestoreCollection(db, "courses");

        const firestoreSearch = firestoreQuery(
          coursesRef,
          where("courseName", ">=", searchUpper),
          where("courseName", "<=", searchUpper + "\uf8ff"),
          limit(10)
        );

        const firestoreSnap = await getDocs(firestoreSearch);

        firestoreSnap.forEach((doc) => {
          const data = doc.data();
          const courseId = data.id || parseInt(doc.id) || undefined;

          const exists = combinedResults.some(
            (c) => c.id === courseId || c.courseId === courseId
          );

          if (!exists) {
            combinedResults.push({
              id: courseId,
              courseId: courseId,
              course_name: data.courseName,
              courseName: data.courseName,
              location: data.location,
            });
          }
        });
      } catch (firestoreErr) {
        console.log("⚠️ Firestore search failed, continuing to API:", firestoreErr);
      }

      // Step 3: Hit external API if not enough results
      if (combinedResults.length >= 5) {
        if (location?.latitude && location?.longitude) {
          combinedResults = combinedResults.map((c) => ({
            ...c,
            distance:
              c.location?.latitude && c.location?.longitude
                ? haversine(
                    location.latitude!,
                    location.longitude!,
                    c.location.latitude,
                    c.location.longitude
                  )
                : 999,
          }));
          combinedResults.sort((a, b) => (a.distance || 999) - (b.distance || 999));
        }
        setSearchResults(combinedResults);
      } else {
        const url = `${API_BASE}/search?search_query=${encodeURIComponent(searchQuery)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Key ${API_KEY}` },
        });

        const data = await res.json();
        const apiCourses: Course[] = data.courses || [];

        apiCourses.forEach((apiCourse) => {
          const exists = combinedResults.some(
            (c) => c.id === apiCourse.id || c.courseId === apiCourse.id
          );
          if (!exists) {
            combinedResults.push(apiCourse);
          }
        });

        if (location?.latitude && location?.longitude) {
          combinedResults = combinedResults.map((c) => ({
            ...c,
            distance:
              c.location?.latitude && c.location?.longitude
                ? haversine(
                    location.latitude!,
                    location.longitude!,
                    c.location.latitude,
                    c.location.longitude
                  )
                : 999,
          }));
          combinedResults.sort((a, b) => (a.distance || 999) - (b.distance || 999));
        }

        setSearchResults(combinedResults);
      }
    } catch (err) {
      console.error("❌ Search error:", err);
      soundPlayer.play("error");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = (course: Course) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect(course);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleClose = () => {
    soundPlayer.play("click");
    onClose();
    setSearchQuery("");
    setSearchResults([]);
  };

  const renderCourseItem = ({ item }: { item: Course }) => (
    <TouchableOpacity style={styles.courseItem} onPress={() => handleSelect(item)}>
      <View style={styles.courseItemLeft}>
        <Text style={styles.courseItemName}>
          {item.course_name || item.courseName || "Unknown Course"}
        </Text>
        {item.location && (
          <Text style={styles.courseItemLocation}>
            {item.location.city}, {item.location.state}
          </Text>
        )}
      </View>
      {item.distance !== undefined && item.distance < 999 && (
        <Text style={styles.courseItemDistance}>{item.distance.toFixed(1)} mi</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Home Course</Text>
              <TouchableOpacity onPress={handleClose}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by course name or city..."
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                autoFocus
              />
              {searching && <ActivityIndicator size="small" color="#0D5C3A" />}
            </View>

            {/* Search Button */}
            <TouchableOpacity
              style={styles.searchButton}
              onPress={handleSearch}
              disabled={searching || !searchQuery.trim()}
            >
              <Text style={styles.searchButtonText}>Search</Text>
            </TouchableOpacity>

            {/* Results */}
            <FlatList
              data={searchResults.length > 0 ? searchResults : cachedCourses}
              keyExtractor={(item, index) =>
                `course-${item.id || item.courseId}-${index}`
              }
              renderItem={renderCourseItem}
              style={styles.courseList}
              contentContainerStyle={styles.courseListContent}
              ListHeaderComponent={
                searchResults.length === 0 && cachedCourses.length > 0 ? (
                  <Text style={styles.courseSectionHeader}>Recent Courses</Text>
                ) : searchResults.length > 0 ? (
                  <Text style={styles.courseSectionHeader}>Search Results</Text>
                ) : null
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="golf-outline" size={48} color="#CCC" />
                  <Text style={styles.emptyText}>
                    {searchQuery.trim()
                      ? "No courses found. Try a different search."
                      : "Search for your home course above"}
                  </Text>
                </View>
              }
              keyboardShouldPersistTaps="handled"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    minHeight: "60%",
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: "#333",
  },
  searchButton: {
    backgroundColor: "#0D5C3A",
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  searchButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
  courseList: {
    flex: 1,
    marginTop: 8,
  },
  courseListContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  courseSectionHeader: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  courseItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9F9F9",
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  courseItemLeft: {
    flex: 1,
  },
  courseItemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  courseItemLocation: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  courseItemDistance: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
    marginLeft: 12,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 15,
    color: "#999",
    textAlign: "center",
    marginTop: 12,
    paddingHorizontal: 32,
  },
});