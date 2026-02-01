/**
 * Step 7: Review
 * - Summary of all league settings before creation
 */

import React from "react";
import { Text, View } from "react-native";

import { styles } from "./styles";
import {
  calculateEndDate,
  DAYS_OF_WEEK,
  formatCurrency,
  LeagueFormData,
  SIM_PLATFORMS,
} from "./types";

interface Step7Props {
  formData: LeagueFormData;
}

export default function Step7Review({ formData }: Step7Props) {
  return (
    <View style={styles.stepContent}>
      {/* Header */}
      <View style={styles.reviewHeader}>
        <Text style={styles.reviewName}>{formData.name}</Text>
        {formData.description && <Text style={styles.reviewDesc}>{formData.description}</Text>}
      </View>

      {/* Type & Format */}
      <View style={styles.reviewSection}>
        <Text style={styles.reviewSectionTitle}>TYPE & FORMAT</Text>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Type</Text>
          <Text style={styles.reviewValue}>
            {formData.leagueType === "live" ? "☀️ Live" : "🖥️ Sim"}
            {formData.simPlatform &&
              ` (${SIM_PLATFORMS.find((p) => p.key === formData.simPlatform)?.label})`}
          </Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Format</Text>
          <Text style={styles.reviewValue}>
            {formData.format === "stroke" ? "Stroke Play" : "2v2 Teams"}
          </Text>
        </View>
      </View>

      {/* Round Settings */}
      <View style={styles.reviewSection}>
        <Text style={styles.reviewSectionTitle}>ROUND SETTINGS</Text>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Holes</Text>
          <Text style={styles.reviewValue}>{formData.holes}</Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Courses</Text>
          <Text style={styles.reviewValue}>
            {formData.courseRestriction
              ? formData.allowedCourses.length === 1
                ? formData.allowedCourses[0].courseName
                : `${formData.allowedCourses.length} specific courses`
              : "Any"}
          </Text>
        </View>
        {formData.format === "stroke" && (
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Handicaps</Text>
            <Text style={styles.reviewValue}>
              {formData.handicapSystem === "swingthoughts" ? "SwingThoughts" : "League Managed"}
            </Text>
          </View>
        )}
      </View>

      {/* Scoring */}
      <View style={styles.reviewSection}>
        <Text style={styles.reviewSectionTitle}>SCORING</Text>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Points/Week</Text>
          <Text style={styles.reviewValue}>{formData.pointsPerWeek} pts</Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Score Deadline</Text>
          <Text style={styles.reviewValue}>
            {DAYS_OF_WEEK.find((d) => d.key === formData.scoreDeadline)?.label || formData.scoreDeadline}
          </Text>
        </View>
      </View>

      {/* Schedule */}
      <View style={styles.reviewSection}>
        <Text style={styles.reviewSectionTitle}>SCHEDULE</Text>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Season</Text>
          <Text style={styles.reviewValue}>
            {formData.startDate?.toLocaleDateString("en-US", { month: "short", day: "numeric" })} —{" "}
            {calculateEndDate(formData.startDate, formData.frequency, formData.numberOfWeeks)}
          </Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Frequency</Text>
          <Text style={styles.reviewValue}>
            {formData.frequency === "weekly" ? "Weekly" : "Bi-weekly"}
          </Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Duration</Text>
          <Text style={styles.reviewValue}>{formData.numberOfWeeks} weeks</Text>
        </View>
        {formData.playDay && (
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Play Day</Text>
            <Text style={styles.reviewValue}>
              {DAYS_OF_WEEK.find((d) => d.key === formData.playDay)?.label}
            </Text>
          </View>
        )}
      </View>

      {/* Elevated Events */}
      {formData.hasElevatedEvents && (
        <View style={styles.reviewSection}>
          <Text style={styles.reviewSectionTitle}>ELEVATED EVENTS</Text>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Weeks</Text>
            <Text style={styles.reviewValue}>
              {formData.elevatedWeeks.join(", ")} ({formData.elevatedMultiplier}x)
            </Text>
          </View>
        </View>
      )}

      {/* Purse */}
      {formData.purseEnabled && formData.purseAmount > 0 && (
        <View style={styles.reviewSection}>
          <Text style={styles.reviewSectionTitle}>PRIZE PURSE</Text>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Total Purse</Text>
            <Text style={styles.reviewValue}>
              {formatCurrency(formData.purseAmount, formData.purseCurrency)}
            </Text>
          </View>
        </View>
      )}

      {/* Region */}
      <View style={styles.reviewSection}>
        <Text style={styles.reviewSectionTitle}>REGION</Text>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Location</Text>
          <Text style={styles.reviewValue}>{formData.regionName}</Text>
        </View>
      </View>
    </View>
  );
}