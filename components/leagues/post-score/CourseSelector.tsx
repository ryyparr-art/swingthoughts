/**
 * CourseSelector - Course search and selection component
 */

import { db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { collection, getDocs } from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { haversine } from "./helpers";
import { styles } from "./styles";
import { CourseBasic } from "./types";

const API_KEY = process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY;
const API_BASE = "https://api.golfcourseapi.com/v1";

interface CourseSelectorProps {
  availableCourses: CourseBasic[];
  isRestricted: boolean;
  userLocation: { latitude?: number; longitude?: number } | null;
  onSelectCourse: (course: CourseBasic) => void;
  onBack: () => void;
}

export default function CourseSelector({
  availableCourses,
  isRestricted,
  userLocation,
  onSelectCourse,
  onBack,
}: CourseSelectorProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CourseBasic[]>([]);
  const [searching, setSearching] = useState(false);

  const handleCourseSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      soundPlayer.play("click");

      const searchLower = searchQuery.toLowerCase().trim();

      // Step 1: Search Firestore first
      const coursesSnap = await getDocs(collection(db, "courses"));
      const firestoreCourses: CourseBasic[] = [];

      coursesSnap.docs.forEach((courseDoc) => {
        const data = courseDoc.data();
        const courseName = (data.courseName || data.course_name || "").toLowerCase();
        const city = (data.location?.city || "").toLowerCase();
        const state = (data.location?.state || "").toLowerCase();

        if (
          courseName.includes(searchLower) ||
          city.includes(searchLower) ||
          state.includes(searchLower)
        ) {
          let distance: number | undefined;
          if (
            userLocation?.latitude &&
            userLocation?.longitude &&
            data.location?.latitude &&
            data.location?.longitude
          ) {
            distance = haversine(
              userLocation.latitude,
              userLocation.longitude,
              data.location.latitude,
              data.location.longitude
            );
          }

          firestoreCourses.push({
            id: data.id || data.courseId || courseDoc.id,
            courseId: data.id || data.courseId,
            course_name: data.course_name || data.courseName,
            courseName: data.courseName || data.course_name,
            location: data.location,
            city: data.location?.city,
            state: data.location?.state,
            distance,
          });
        }
      });

      // Sort Firestore results by distance
      firestoreCourses.sort((a, b) => (a.distance || 999) - (b.distance || 999));

      // Step 2: If Firestore has enough results, use those
      if (firestoreCourses.length >= 3) {
        setSearchResults(firestoreCourses.slice(0, 10));
        setSearching(false);
        return;
      }

      // Step 3: Fallback to API if not enough Firestore results
      const res = await fetch(
        `${API_BASE}/search?search_query=${encodeURIComponent(searchQuery)}`,
        { headers: { Authorization: `Key ${API_KEY}` } }
      );
      const data = await res.json();
      const apiCourses: any[] = data.courses || [];

      const apiMappedCourses: CourseBasic[] = apiCourses.map((c) => {
        let distance: number | undefined;
        if (
          userLocation?.latitude &&
          userLocation?.longitude &&
          c.location?.latitude &&
          c.location?.longitude
        ) {
          distance = haversine(
            userLocation.latitude,
            userLocation.longitude,
            c.location.latitude,
            c.location.longitude
          );
        }
        return {
          id: c.id,
          courseId: c.id,
          course_name: c.course_name,
          courseName: c.course_name,
          location: c.location,
          city: c.location?.city,
          state: c.location?.state,
          distance,
        };
      });

      // Merge and dedupe
      const seenIds = new Set(firestoreCourses.map((c) => c.courseId || c.id));
      const mergedCourses = [...firestoreCourses];

      for (const apiCourse of apiMappedCourses) {
        if (!seenIds.has(apiCourse.courseId)) {
          mergedCourses.push(apiCourse);
          seenIds.add(apiCourse.courseId);
        }
      }

      mergedCourses.sort((a, b) => (a.distance || 999) - (b.distance || 999));
      setSearchResults(mergedCourses.slice(0, 15));
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectCourse = (course: CourseBasic) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelectCourse(course);
  };

  const renderCourseOption = (course: CourseBasic, index: number) => (
    <TouchableOpacity
      key={`course-${course.courseId || course.id}-${index}`}
      style={styles.courseOption}
      onPress={() => handleSelectCourse(course)}
    >
      <View style={styles.courseOptionLeft}>
        <Text style={styles.courseOptionName}>
          {course.courseName || course.course_name}
        </Text>
        {(course.location?.city || course.city) &&
        (course.location?.state || course.state) ? (
          <Text style={styles.courseOptionLocation}>
            {course.location?.city || course.city},{" "}
            {course.location?.state || course.state}
          </Text>
        ) : null}
      </View>
      {course.distance !== undefined && (
        <Text style={styles.courseOptionDistance}>
          {course.distance.toFixed(1)} mi
        </Text>
      )}
    </TouchableOpacity>
  );

  if (showSearch) {
    return (
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.courseSelector}>
          <Text style={styles.courseSelectorTitle}>Search Course</Text>

          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Enter course name or city..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleCourseSearch}
              returnKeyType="search"
              autoFocus
            />
            <TouchableOpacity
              style={styles.searchButton}
              onPress={handleCourseSearch}
              disabled={searching}
            >
              {searching ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="search" size={20} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>

          {searchResults.length > 0 && (
            <View style={styles.searchResultsContainer}>
              {searchResults.map((c, index) => renderCourseOption(c, index))}
            </View>
          )}

          <TouchableOpacity
            style={styles.backToRecentButton}
            onPress={() => {
              soundPlayer.play("click");
              setShowSearch(false);
              setSearchResults([]);
              setSearchQuery("");
            }}
          >
            <Text style={styles.backToRecentText}>← Back to Recent Courses</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.courseSelector}>
        <Text style={styles.courseSelectorTitle}>Select Course</Text>

        {availableCourses.length > 0 ? (
          <>
            <Text style={styles.courseSubtitle}>
              {isRestricted ? "Allowed Courses" : "Recently Played"}
            </Text>
            {availableCourses.map((c, index) => renderCourseOption(c, index))}
          </>
        ) : (
          <Text style={styles.noCourseText}>
            No recent courses. Search to find a course.
          </Text>
        )}

        {!isRestricted && (
          <TouchableOpacity
            style={styles.searchCourseButton}
            onPress={() => {
              soundPlayer.play("click");
              setShowSearch(true);
            }}
          >
            <Ionicons name="search" size={20} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.searchCourseButtonText}>Search for Course</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}