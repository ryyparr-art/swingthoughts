/**
 * Rules Tab Component
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { formatDateShort, League } from "./types";

interface RulesTabProps {
  league: League;
  isCommissioner: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSaveRules: (rules: string) => Promise<void>;
}

export default function RulesTab(props: RulesTabProps) {
  const { league, isCommissioner, refreshing, onRefresh, onSaveRules } = props;

  const [customRules, setCustomRules] = useState(league.customRules || "");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await onSaveRules(customRules);
      setIsEditing(false);
      Alert.alert("Saved!", "League rules have been updated.");
    } catch (error) {
      Alert.alert("Error", "Failed to save rules.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setCustomRules(league.customRules || "");
    setIsEditing(false);
  };

  const leagueTypeDisplay =
    league.leagueType === "live"
      ? "Live Golf"
      : league.simPlatform
      ? "Simulator (" + league.simPlatform + ")"
      : "Simulator";

  const formatDisplay =
    league.format === "stroke" ? "Stroke Play" : "2v2 Match Play";

  const handicapDisplay =
    league.handicapSystem === "swingthoughts"
      ? "SwingThoughts Handicaps"
      : "League Managed";

  const frequencyDisplay =
    league.frequency === "weekly"
      ? "Weekly"
      : league.frequency === "biweekly"
      ? "Every 2 Weeks"
      : "Monthly";

  const courseDisplay =
    !league.restrictedCourses || league.restrictedCourses.length === 0
      ? "Any Course"
      : league.restrictedCourses.length === 1
      ? league.restrictedCourses[0].courseName
      : league.restrictedCourses.length + " Specific Courses";

  const elevatedDisplay = !league.elevatedEvents?.enabled
    ? "None"
    : (league.elevatedEvents.weeks?.length || 0) === 0
    ? "Enabled (no weeks selected)"
    : "Weeks " +
      league.elevatedEvents.weeks.join(", ") +
      " at " +
      (league.elevatedEvents.multiplier || 2) +
      "x points";

  const deadlineDisplay =
    league.scoreDeadlineDays +
    " day" +
    (league.scoreDeadlineDays !== 1 ? "s" : "") +
    " after round";

  const seasonDisplay =
    formatDateShort(league.startDate) +
    " - " +
    formatDateShort(league.endDate);

  return (
    <ScrollView
      style={s.tabContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#0D5C3A"
        />
      }
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>League Rules</Text>
          {isCommissioner && !isEditing ? (
            <TouchableOpacity
              style={s.editButton}
              onPress={() => setIsEditing(true)}
            >
              <Ionicons name="create-outline" size={18} color="#0D5C3A" />
              <Text style={s.editButtonText}>Edit</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {isEditing ? (
          <View style={s.editContainer}>
            <TextInput
              style={s.rulesInput}
              value={customRules}
              onChangeText={setCustomRules}
              placeholder="Enter your league rules here..."
              placeholderTextColor="#999"
              multiline
              maxLength={2000}
              autoFocus
            />
            <Text style={s.charCount}>
              {customRules.length}/2000 characters
            </Text>
            <View style={s.editActions}>
              <TouchableOpacity
                style={s.cancelButton}
                onPress={handleCancel}
                disabled={saving}
              >
                <Text style={s.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={saving ? s.saveButtonDisabled : s.saveButton}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={s.saveButtonText}>
                  {saving ? "Saving..." : "Save Rules"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={s.rulesDisplay}>
            {customRules ? (
              <Text style={s.rulesText}>{customRules}</Text>
            ) : (
              <View style={s.noRules}>
                <Ionicons
                  name="document-text-outline"
                  size={32}
                  color="#CCC"
                />
                <Text style={s.noRulesText}>No custom rules set</Text>
                {isCommissioner ? (
                  <Text style={s.noRulesHint}>Tap Edit to add league rules</Text>
                ) : null}
              </View>
            )}
          </View>
        )}
      </View>

      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>League Info</Text>
          <Ionicons name="information-circle-outline" size={20} color="#999" />
        </View>

        <View style={s.infoCard}>
          <View style={s.infoRow}>
            <View style={s.infoLabel}>
              <Ionicons name="trophy-outline" size={18} color="#0D5C3A" />
              <Text style={s.infoLabelText}>Format</Text>
            </View>
            <Text style={s.infoValue}>{formatDisplay}</Text>
          </View>

          <View style={s.infoRow}>
            <View style={s.infoLabel}>
              <Ionicons name="golf-outline" size={18} color="#0D5C3A" />
              <Text style={s.infoLabelText}>Type</Text>
            </View>
            <Text style={s.infoValue}>{leagueTypeDisplay}</Text>
          </View>

          <View style={s.infoRow}>
            <View style={s.infoLabel}>
              <Ionicons name="flag-outline" size={18} color="#0D5C3A" />
              <Text style={s.infoLabelText}>Holes</Text>
            </View>
            <Text style={s.infoValue}>{league.holesPerRound} per round</Text>
          </View>

          <View style={s.infoRow}>
            <View style={s.infoLabel}>
              <Ionicons name="calculator-outline" size={18} color="#0D5C3A" />
              <Text style={s.infoLabelText}>Handicaps</Text>
            </View>
            <Text style={s.infoValue}>{handicapDisplay}</Text>
          </View>

          <View style={s.infoRow}>
            <View style={s.infoLabel}>
              <Ionicons name="calendar-outline" size={18} color="#0D5C3A" />
              <Text style={s.infoLabelText}>Frequency</Text>
            </View>
            <Text style={s.infoValue}>{frequencyDisplay}</Text>
          </View>

          <View style={s.infoRow}>
            <View style={s.infoLabel}>
              <Ionicons name="time-outline" size={18} color="#0D5C3A" />
              <Text style={s.infoLabelText}>Score Deadline</Text>
            </View>
            <Text style={s.infoValue}>{deadlineDisplay}</Text>
          </View>

          <View style={s.infoRow}>
            <View style={s.infoLabel}>
              <Ionicons name="location-outline" size={18} color="#0D5C3A" />
              <Text style={s.infoLabelText}>Courses</Text>
            </View>
            <Text style={s.infoValue}>{courseDisplay}</Text>
          </View>

          <View style={s.infoRow}>
            <View style={s.infoLabel}>
              <Ionicons name="star-outline" size={18} color="#0D5C3A" />
              <Text style={s.infoLabelText}>Elevated Events</Text>
            </View>
            <Text style={s.infoValue}>{elevatedDisplay}</Text>
          </View>

          <View style={s.infoRowLast}>
            <View style={s.infoLabel}>
              <Ionicons
                name="calendar-number-outline"
                size={18}
                color="#0D5C3A"
              />
              <Text style={s.infoLabelText}>Season</Text>
            </View>
            <Text style={s.infoValue}>{seasonDisplay}</Text>
          </View>
        </View>

        {league.restrictedCourses && league.restrictedCourses.length > 1 ? (
          <View style={s.courseList}>
            <Text style={s.courseListTitle}>Approved Courses:</Text>
            {league.restrictedCourses.map((course, index) => (
              <Text key={index} style={s.courseItem}>
                • {course.courseName}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <View style={s.bottomSpacer} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tabContent: {
    flex: 1,
    backgroundColor: "#F5F5F0",
    paddingHorizontal: 16,
  },
  section: {
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#E8F5E9",
    borderRadius: 16,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  editContainer: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  rulesInput: {
    minHeight: 200,
    fontSize: 15,
    color: "#333",
    lineHeight: 22,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 12,
    color: "#999",
    textAlign: "right",
    marginTop: 8,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  cancelButtonText: {
    fontSize: 15,
    color: "#666",
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 15,
    color: "#FFF",
    fontWeight: "700",
  },
  rulesDisplay: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  rulesText: {
    fontSize: 15,
    color: "#333",
    lineHeight: 24,
  },
  noRules: {
    alignItems: "center",
    paddingVertical: 24,
  },
  noRulesText: {
    fontSize: 15,
    color: "#999",
    marginTop: 8,
  },
  noRulesHint: {
    fontSize: 13,
    color: "#0D5C3A",
    marginTop: 4,
  },
  infoCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  infoRowLast: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoLabelText: {
    fontSize: 14,
    color: "#666",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    textAlign: "right",
    flex: 1,
    marginLeft: 16,
  },
  courseList: {
    marginTop: 12,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  courseListTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  courseItem: {
    fontSize: 14,
    color: "#666",
    lineHeight: 22,
  },
  bottomSpacer: {
    height: 100,
  },
});
