/**
 * GolfIdentitySection
 * 
 * Home course selector and game identity text field.
 * Extracted from modify-clubs.tsx.
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import type { Course } from "./types";

/* ================================================================ */
/* PROPS                                                            */
/* ================================================================ */

interface GolfIdentitySectionProps {
  selectedCourse: Course | null;
  onOpenCourseSearch: () => void;
  onClearCourse: () => void;
  gameIdentity: string;
  onChangeGameIdentity: (text: string) => void;
}

/* ================================================================ */
/* COMPONENT                                                        */
/* ================================================================ */

export default function GolfIdentitySection({
  selectedCourse,
  onOpenCourseSearch,
  onClearCourse,
  gameIdentity,
  onChangeGameIdentity,
}: GolfIdentitySectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Golf Identity</Text>

      {/* Home Course */}
      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <View style={styles.labelWithIcon}>
            <Ionicons name="flag" size={16} color="#0D5C3A" />
            <Text style={styles.label}>HOME COURSE</Text>
          </View>
          {selectedCourse && (
            <TouchableOpacity onPress={onClearCourse}>
              <Text style={styles.clearButton}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {selectedCourse ? (
          <TouchableOpacity
            style={styles.selectedCourseContainer}
            onPress={() => {
              soundPlayer.play("click");
              onOpenCourseSearch();
            }}
          >
            <View style={styles.selectedCourseInfo}>
              <Text style={styles.selectedCourseName}>
                {selectedCourse.course_name || selectedCourse.courseName}
              </Text>
              {selectedCourse.location && (
                <Text style={styles.selectedCourseLocation}>
                  {selectedCourse.location.city}, {selectedCourse.location.state}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color="#0D5C3A" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.courseSelectButton}
            onPress={() => {
              soundPlayer.play("click");
              onOpenCourseSearch();
            }}
          >
            <Text style={styles.courseSelectButtonText}>Select your home course</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {/* Game Identity */}
      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <View style={styles.labelWithIcon}>
            <Ionicons name="chatbubble-ellipses" size={16} color="#0D5C3A" />
            <Text style={styles.label}>GAME IDENTITY</Text>
          </View>
          {gameIdentity !== "" && (
            <TouchableOpacity
              onPress={() => {
                soundPlayer.play("click");
                onChangeGameIdentity("");
              }}
            >
              <Text style={styles.clearButton}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        <TextInput
          style={styles.input}
          placeholder='e.g., "Short game king" or "3-putt champion"'
          placeholderTextColor="#999"
          value={gameIdentity}
          onChangeText={onChangeGameIdentity}
          autoCapitalize="sentences"
          maxLength={60}
        />
      </View>
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  labelWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D5C3A",
    letterSpacing: 1,
  },
  clearButton: {
    fontSize: 12,
    fontWeight: "600",
    color: "#DC2626",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#333",
    borderWidth: 2,
    borderColor: "#E0E0E0",
  },
  courseSelectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#E0E0E0",
  },
  courseSelectButtonText: {
    fontSize: 16,
    color: "#999",
  },
  selectedCourseContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },
  selectedCourseInfo: {
    flex: 1,
  },
  selectedCourseName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  selectedCourseLocation: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
});