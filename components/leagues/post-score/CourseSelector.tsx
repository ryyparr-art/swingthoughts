/**
 * CourseSelector - Course search and selection component
 *
 * Searches courses in Firestore scoped to the user's regionKey.
 * Resolves leaderboardId at selection time so rounds always write
 * to the correct leaderboard without needing a course lookup later.
 */

import { db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { collection, getDocs, query, where } from "firebase/firestore";
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

interface CourseSelectorProps {
  availableCourses: CourseBasic[];
  isRestricted: boolean;
  userLocation: { latitude?: number; longitude?: number } | null;
  userRegionKey: string | null;
  onSelectCourse: (course: CourseBasic) => void;
  onBack: () => void;
}

export default function CourseSelector({
  availableCourses,
  isRestricted,
  userLocation,
  userRegionKey,
  onSelectCourse,
  onBack,
}: CourseSelectorProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CourseBasic[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleCourseSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    if (!userRegionKey) {
      setSearchError("Region not available — please try again");
      return;
    }

    try {
      setSearching(true);
      setSearchError(null);
      soundPlayer.play("click");

      const searchLower = searchQuery.toLowerCase().trim();

      // Query only courses in the user's region — avoids full collection scan
      const q = query(
        collection(db, "courses"),
        where("regionKey", "==", userRegionKey)
      );
      const snap = await getDocs(q);

      const results: CourseBasic[] = [];

      snap.forEach((courseDoc) => {
        const data = courseDoc.data();
        const courseName = (data.course_name || data.courseName || "").toLowerCase();
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

          const courseId = data.id || data.courseId;
          const regionKey = data.regionKey || userRegionKey;

          results.push({
            id: courseId,
            courseId: courseId,
            course_name: data.course_name || data.courseName,
            courseName: data.courseName || data.course_name,
            location: data.location,
            city: data.location?.city,
            state: data.location?.state,
            distance,
            regionKey,
            leaderboardId: data.leaderboardId || `${regionKey}_${courseId}`,
            tees: data.tees || null,
          });
        }
      });

      // Sort by distance if available, otherwise alphabetically
      results.sort((a, b) => {
        if (a.distance !== undefined && b.distance !== undefined) {
          return a.distance - b.distance;
        }
        return (a.courseName || a.course_name || "").localeCompare(
          b.courseName || b.course_name || ""
        );
      });

      console.log(
        `✅ CourseSelector: Found ${results.length} courses in ${userRegionKey} for "${searchQuery}"`
      );
      setSearchResults(results.slice(0, 15));
    } catch (error) {
      console.error("❌ CourseSelector search error:", error);
      setSearchError("Search failed — please try again");
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
              onChangeText={(text) => {
                setSearchQuery(text);
                setSearchError(null);
              }}
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

          {searchError && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Ionicons name="warning-outline" size={14} color="#CC3333" />
              <Text style={{ fontSize: 13, color: "#CC3333" }}>{searchError}</Text>
            </View>
          )}

          {!searching && searchResults.length === 0 && searchQuery.trim().length > 0 && !searchError && (
            <Text style={{ fontSize: 14, color: "#999", textAlign: "center", marginTop: 16 }}>
              No courses found in your region — try a different name
            </Text>
          )}

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
              setSearchError(null);
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