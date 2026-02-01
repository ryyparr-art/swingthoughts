/**
 * LeagueInfoCard Component
 *
 * Displays league configuration info and custom rules.
 * Used in:
 * - leagues/home.tsx (modal, read-only)
 * - leagues/settings RulesTab (with edit capability)
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

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface LeagueData {
  name?: string;
  customRules?: string;
  leagueType: "live" | "sim";
  simPlatform?: string;
  format: "stroke" | "2v2";
  // Original field names
  holes: number;
  handicapSystem: "swingthoughts" | "league_managed";
  frequency: "weekly" | "biweekly" | "monthly";
  scoreDeadline: string; // Day of week (e.g., "sunday")
  startDate: Timestamp;
  endDate: Timestamp;
  courseRestriction?: boolean;
  allowedCourses?: Array<{ courseId: number; courseName: string }>;
  // Original elevated event fields
  hasElevatedEvents?: boolean;
  elevatedWeeks?: number[];
  elevatedMultiplier?: number;
  // New fields (additive)
  pointsPerWeek?: number;
  purse?: {
    amount: number;
    currency: string;
  } | null;
}

interface LeagueInfoCardProps {
  league: LeagueData;
  editable?: boolean;
  onSaveRules?: (rules: string) => Promise<void>;
  showHeader?: boolean;
  saving?: boolean;
}

interface InfoRowProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  isLast?: boolean;
}

/* ================================================================ */
/* INFO ROW COMPONENT                                               */
/* ================================================================ */

function InfoRow({ icon, label, value, isLast = false }: InfoRowProps) {
  return (
    <View style={isLast ? styles.infoRowLast : styles.infoRow}>
      <View style={styles.infoLabel}>
        <Ionicons name={icon} size={18} color="#0D5C3A" />
        <Text style={styles.infoLabelText}>{label}</Text>
      </View>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

/* ================================================================ */
/* HELPERS                                                          */
/* ================================================================ */

const formatDateShort = (timestamp: Timestamp): string => {
  const date = timestamp.toDate();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

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

  /* ================================================================ */
  /* DISPLAY HELPERS                                                  */
  /* ================================================================ */

  const getFormatDisplay = () => {
    return league.format === "stroke" ? "Stroke Play" : "2v2 Match Play";
  };

  const getTypeDisplay = () => {
    if (league.leagueType === "live") return "Live Golf";
    return league.simPlatform
      ? `Simulator (${league.simPlatform})`
      : "Simulator";
  };

  const getHandicapDisplay = () => {
    return league.handicapSystem === "swingthoughts"
      ? "SwingThoughts"
      : "League Managed";
  };

  const getFrequencyDisplay = () => {
    switch (league.frequency) {
      case "weekly":
        return "Weekly";
      case "biweekly":
        return "Every 2 Weeks";
      case "monthly":
        return "Monthly";
      default:
        return league.frequency;
    }
  };

  const getDeadlineDisplay = () => {
    // scoreDeadline is day of week like "sunday"
    const day = league.scoreDeadline;
    if (!day) return "Not set";
    return day.charAt(0).toUpperCase() + day.slice(1);
  };

  const getCourseDisplay = () => {
    if (!league.courseRestriction || !league.allowedCourses || league.allowedCourses.length === 0) {
      return "Any Course";
    }
    if (league.allowedCourses.length === 1) {
      return league.allowedCourses[0].courseName;
    }
    return `${league.allowedCourses.length} Specific Courses`;
  };

  const getElevatedDisplay = () => {
    if (!league.hasElevatedEvents) return "None";
    const weeks = league.elevatedWeeks || [];
    if (weeks.length === 0) return "Enabled (no weeks selected)";
    const multiplier = league.elevatedMultiplier || 2;
    return `Weeks ${weeks.join(", ")} at ${multiplier}x points`;
  };

  const getSeasonDisplay = () => {
    return `${formatDateShort(league.startDate)} - ${formatDateShort(league.endDate)}`;
  };

  /* ================================================================ */
  /* HANDLERS                                                         */
  /* ================================================================ */

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

  /* ================================================================ */
  /* RENDER                                                           */
  /* ================================================================ */

  return (
    <View style={styles.container}>
      {/* League Info Header */}
      {showHeader && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>League Info</Text>
          <Ionicons name="information-circle-outline" size={20} color="#999" />
        </View>
      )}

      {/* League Info Card */}
      <View style={styles.infoCard}>
        <InfoRow icon="trophy-outline" label="Format" value={getFormatDisplay()} />
        <InfoRow icon="golf-outline" label="Type" value={getTypeDisplay()} />
        <InfoRow icon="flag-outline" label="Holes" value={`${league.holes} per round`} />
        <InfoRow icon="calculator-outline" label="Handicaps" value={getHandicapDisplay()} />
        <InfoRow icon="calendar-outline" label="Frequency" value={getFrequencyDisplay()} />
        <InfoRow icon="time-outline" label="Deadline" value={getDeadlineDisplay()} />
        <InfoRow icon="location-outline" label="Courses" value={getCourseDisplay()} />
        <InfoRow icon="star-outline" label="Elevated Events" value={getElevatedDisplay()} />
        <InfoRow icon="calendar-number-outline" label="Season" value={getSeasonDisplay()} isLast />
      </View>

      {/* Allowed Courses List */}
      {league.courseRestriction && league.allowedCourses && league.allowedCourses.length > 1 && (
        <View style={styles.courseList}>
          <Text style={styles.courseListTitle}>Approved Courses:</Text>
          {league.allowedCourses.map((course, index) => (
            <Text key={index} style={styles.courseItem}>
              • {course.courseName}
            </Text>
          ))}
        </View>
      )}

      {/* Custom Rules Section */}
      <View style={styles.rulesSection}>
        <View style={styles.rulesSectionHeader}>
          <Text style={styles.sectionTitle}>League Rules</Text>
          {editable && !isEditing && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => setIsEditing(true)}
            >
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
            <Text style={styles.charCount}>
              {customRules.length}/2000 characters
            </Text>
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancelEdit}
                disabled={isSaving}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                onPress={handleSaveRules}
                disabled={isSaving}
              >
                <Text style={styles.saveButtonText}>
                  {isSaving ? "Saving..." : "Save Rules"}
                </Text>
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
                {editable && (
                  <Text style={styles.noRulesHint}>
                    Tap Edit to add league rules
                  </Text>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Section Headers
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },

  // Info Card
  infoCard: {
    backgroundColor: "#F9F9F9",
    borderRadius: 12,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E8E8",
  },
  infoRowLast: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
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

  // Course List
  courseList: {
    marginTop: 12,
    backgroundColor: "#F9F9F9",
    borderRadius: 12,
    padding: 16,
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

  // Rules Section
  rulesSection: {
    marginTop: 20,
  },
  rulesSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
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

  // Rules Display
  rulesDisplay: {
    backgroundColor: "#F9F9F9",
    borderRadius: 12,
    padding: 16,
  },
  rulesText: {
    fontSize: 14,
    color: "#444",
    lineHeight: 22,
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

  // Edit Mode
  editContainer: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  rulesInput: {
    minHeight: 150,
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
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 15,
    color: "#FFF",
    fontWeight: "700",
  },
});