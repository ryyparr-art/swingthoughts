/**
 * Step 3: Round Setup
 * - Holes per round (9 or 18)
 * - Course restriction (any or specific)
 * - Course selection (if restricted)
 * - 9-hole option (front/back/either)
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

import { styles } from "./styles";
import { LeagueFormData } from "./types";

interface Step3Props {
  formData: LeagueFormData;
  updateFormData: (updates: Partial<LeagueFormData>) => void;
  onOpenCoursePicker: () => void;
}

export default function Step3RoundSetup({
  formData,
  updateFormData,
  onOpenCoursePicker,
}: Step3Props) {
  const handlePress = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRemoveCourse = (courseId: number) => {
    handlePress();
    updateFormData({
      allowedCourses: formData.allowedCourses.filter((c) => c.courseId !== courseId),
    });
  };

  return (
    <View style={styles.stepContent}>
      {/* Holes Per Round */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Holes Per Round <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.optionButton, formData.holes === 9 && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ holes: 9 });
            }}
          >
            <Text style={[styles.optionNumber, formData.holes === 9 && styles.optionNumberSelected]}>
              9
            </Text>
            <Text style={[styles.optionText, formData.holes === 9 && styles.optionTextSelected]}>
              Holes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, formData.holes === 18 && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ holes: 18 });
            }}
          >
            <Text style={[styles.optionNumber, formData.holes === 18 && styles.optionNumberSelected]}>
              18
            </Text>
            <Text style={[styles.optionText, formData.holes === 18 && styles.optionTextSelected]}>
              Holes
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Course Requirement */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Course Requirement</Text>
        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.optionButton, !formData.courseRestriction && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ courseRestriction: false, allowedCourses: [] });
            }}
          >
            <Ionicons
              name="globe-outline"
              size={24}
              color={!formData.courseRestriction ? "#0D5C3A" : "#666"}
            />
            <Text style={[styles.optionText, !formData.courseRestriction && styles.optionTextSelected]}>
              Any Course
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, formData.courseRestriction && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ courseRestriction: true });
            }}
          >
            <Ionicons
              name="flag-outline"
              size={24}
              color={formData.courseRestriction ? "#0D5C3A" : "#666"}
            />
            <Text style={[styles.optionText, formData.courseRestriction && styles.optionTextSelected]}>
              Specific
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Course Selection */}
      {formData.courseRestriction && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Select Course(s) <Text style={styles.required}>*</Text>
          </Text>

          {/* Selected courses */}
          {formData.allowedCourses.map((course) => (
            <View key={course.courseId} style={styles.selectedCourse}>
              <Text style={styles.selectedCourseText} numberOfLines={1}>
                {course.courseName}
              </Text>
              <TouchableOpacity onPress={() => handleRemoveCourse(course.courseId)}>
                <Ionicons name="close-circle" size={22} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ))}

          {/* Add course button */}
          <TouchableOpacity style={styles.addCourseButton} onPress={onOpenCoursePicker}>
            <Ionicons name="add-circle-outline" size={22} color="#0D5C3A" />
            <Text style={styles.addCourseText}>
              {formData.allowedCourses.length > 0 ? "Add Another Course" : "Search for Courses"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 9-Hole Option */}
      {formData.holes === 9 && formData.courseRestriction && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Which 9?</Text>
          <View style={styles.chipContainer}>
            {(["front", "back", "either"] as const).map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.chip, formData.nineHoleOption === opt && styles.chipSelected]}
                onPress={() => {
                  handlePress();
                  updateFormData({ nineHoleOption: opt });
                }}
              >
                <Text style={[styles.chipText, formData.nineHoleOption === opt && styles.chipTextSelected]}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}