/**
 * LeagueInfoCard Component
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Timestamp } from "firebase/firestore";
import React, { useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface LeagueData {
  name?: string;
  customRules?: string;
  leagueType: "live" | "sim";
  simPlatform?: string;
  format: "stroke" | "2v2";
  holesPerRound: number;
  handicapSystem: "swingthoughts" | "league_managed";
  frequency: "weekly" | "biweekly" | "monthly";
  scoreDeadlineDays: number;
  startDate: Timestamp;
  endDate: Timestamp;
  restrictedCourses?: Array<{ courseId: number; courseName: string }>;
  elevatedEvents?: {
    enabled: boolean;
    weeks: number[];
    multiplier: number;
  };
}

interface LeagueInfoCardProps {
  league: LeagueData;
  editable?: boolean;
  onSaveRules?: (rules: string) => Promise<void>;
  showHeader?: boolean;
  saving?: boolean;
}

const formatDateShort = (timestamp: Timestamp): string => {
  const date = timestamp.toDate();
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default function LeagueInfoCard({
  league,
  editable = false,
  onSaveRules,
  showHeader = true,
  saving: externalSaving = false,
}: LeagueInfoCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [customRules, setCustomRules] = useState(league.customRules || "");
  const [saving, setSaving] = useState(false);

  const isSaving = saving || externalSaving;

  const getFormatDisplay = () => league.format === "stroke" ? "Stroke Play" : "2v2 Match Play";
  const getTypeDisplay = () => league.leagueType === "live" ? "Live Golf" : league.simPlatform ? `Simulator (${league.simPlatform})` : "Simulator";
  const getHandicapDisplay = () => league.handicapSystem === "swingthoughts" ? "SwingThoughts" : "League Managed";
  const getFrequencyDisplay = () => {
    if (league.frequency === "weekly") return "Weekly";
    if (league.frequency === "biweekly") return "Every 2 Weeks";
    return "Monthly";
  };
  const getDeadlineDisplay = () => `${league.scoreDeadlineDays} day${league.scoreDeadlineDays !== 1 ? "s" : ""} after round`;
  const getCourseDisplay = () => {
    if (!league.restrictedCourses || league.restrictedCourses.length === 0) return "Any Course";
    if (league.restrictedCourses.length === 1) return league.restrictedCourses[0].courseName;
    return `${league.restrictedCourses.length} Specific Courses`;
  };
  const getElevatedDisplay = () => {
    if (!league.elevatedEvents?.enabled) return "None";
    const weeks = league.elevatedEvents.weeks || [];
    if (weeks.length === 0) return "Enabled (no weeks selected)";
    return `Weeks ${weeks.join(", ")} at ${league.elevatedEvents.multiplier || 2}x points`;
  };
  const getSeasonDisplay = () => `${formatDateShort(league.startDate)} - ${formatDateShort(league.endDate)}`;

  const handleSaveRules = async () => {
    if (!onSaveRules) return;
    try {
      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await onSaveRules(customRules);
      setIsEditing(false);
      Alert.alert("Saved!", "League rules have been updated.");
    } catch (error) {
      console.error("Error saving rules:", error);
      Alert.alert("Error", "Failed to save rules.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setCustomRules(league.customRules || "");
    setIsEditing(false);
  };

  const infoRows = [
    { icon: "trophy-outline" as const, label: "Format", value: getFormatDisplay() },
    { icon: "golf-outline" as const, label: "Type", value: getTypeDisplay() },
    { icon: "flag-outline" as const, label: "Holes", value: `${league.holesPerRound} per round` },
    { icon: "calculator-outline" as const, label: "Handicaps", value: getHandicapDisplay() },
    { icon: "calendar-outline" as const, label: "Frequency", value: getFrequencyDisplay() },
    { icon: "time-outline" as const, label: "Deadline", value: getDeadlineDisplay() },
    { icon: "location-outline" as const, label: "Courses", value: getCourseDisplay() },
    { icon: "star-outline" as const, label: "Elevated Events", value: getElevatedDisplay() },
    { icon: "calendar-number-outline" as const, label: "Season", value: getSeasonDisplay() },
  ];

  return (
    <View style={styles.container}>
      {showHeader && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>League Info</Text>
          <Ionicons name="information-circle-outline" size={20} color="#999" />
        </View>
      )}

      <View style={styles.infoCard}>
        {infoRows.map((row, index) => (
          <View key={row.label} style={index === infoRows.length - 1 ? styles.infoRowLast : styles.infoRow}>
            <View style={styles.infoLabel}>
              <Ionicons name={row.icon} size={18} color="#0D5C3A" />
              <Text style={styles.infoLabelText}>{row.label}</Text>
            </View>
            <Text style={styles.infoValue}>{row.value}</Text>
          </View>
        ))}
      </View>

      {league.restrictedCourses && league.restrictedCourses.length > 1 && (
        <View style={styles.courseList}>
          <Text style={styles.courseListTitle}>Approved Courses:</Text>
          {league.restrictedCourses.map((course, index) => (
            <Text key={index} style={styles.courseItem}>• {course.courseName}</Text>
          ))}
        </View>
      )}

      <View style={styles.rulesSection}>
        <View style={styles.rulesSectionHeader}>
          <Text style={styles.sectionTitle}>League Rules</Text>
          {editable && !isEditing && (
            <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
              <Ionicons name="create-outline" size={18} color="#0D5C3A" />
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        {isEditing ? (
          <View style={styles.editContainer}>
            <TextInput
              style={styles.rulesInput}
              value={customRules}
              onChangeText={setCustomRules}
              placeholder="Enter your league rules here..."
              placeholderTextColor="#999"
              multiline
              maxLength={2000}
              autoFocus
            />
            <Text style={styles.charCount}>{customRules.length}/2000 characters</Text>
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelEdit} disabled={isSaving}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                onPress={handleSaveRules}
                disabled={isSaving}
              >
                <Text style={styles.saveButtonText}>{isSaving ? "Saving..." : "Save Rules"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.rulesDisplay}>
            {league.customRules ? (
              <Text style={styles.rulesText}>{league.customRules}</Text>
            ) : (
              <View style={styles.noRules}>
                <Ionicons name="document-text-outline" size={32} color="#CCC" />
                <Text style={styles.noRulesText}>No custom rules set</Text>
                {editable && <Text style={styles.noRulesHint}>Tap Edit to add league rules</Text>}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#333" },
  infoCard: { backgroundColor: "#F9F9F9", borderRadius: 12, overflow: "hidden" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E8E8E8" },
  infoRowLast: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  infoLabel: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoLabelText: { fontSize: 14, color: "#666" },
  infoValue: { fontSize: 14, fontWeight: "600", color: "#333", textAlign: "right", flex: 1, marginLeft: 16 },
  courseList: { marginTop: 12, backgroundColor: "#F9F9F9", borderRadius: 12, padding: 16 },
  courseListTitle: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 },
  courseItem: { fontSize: 14, color: "#666", lineHeight: 22 },
  rulesSection: { marginTop: 20 },
  rulesSectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  editButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#E8F5E9", borderRadius: 16 },
  editButtonText: { fontSize: 14, fontWeight: "600", color: "#0D5C3A" },
  rulesDisplay: { backgroundColor: "#F9F9F9", borderRadius: 12, padding: 16 },
  rulesText: { fontSize: 14, color: "#444", lineHeight: 22 },
  noRules: { alignItems: "center", paddingVertical: 24 },
  noRulesText: { fontSize: 15, color: "#999", marginTop: 8 },
  noRulesHint: { fontSize: 13, color: "#0D5C3A", marginTop: 4 },
  editContainer: { backgroundColor: "#FFF", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E0E0E0" },
  rulesInput: { minHeight: 150, fontSize: 15, color: "#333", lineHeight: 22, textAlignVertical: "top" },
  charCount: { fontSize: 12, color: "#999", textAlign: "right", marginTop: 8 },
  editActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#E0E0E0" },
  cancelButton: { paddingHorizontal: 20, paddingVertical: 10 },
  cancelButtonText: { fontSize: 15, color: "#666", fontWeight: "600" },
  saveButton: { backgroundColor: "#0D5C3A", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 15, color: "#FFF", fontWeight: "700" },
});