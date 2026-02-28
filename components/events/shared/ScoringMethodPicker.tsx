/**
 * ScoringMethodPicker
 *
 * Two concerns:
 *   1. Overall scoring method (how rounds aggregate into final standings)
 *   2. Handicap method (SwingThoughts HCI auto-pull vs manual commissioner-set)
 *
 * Used by: Invitationals, Tours (future)
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { ComponentProps } from "react";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type IconName = ComponentProps<typeof Ionicons>["name"];

export type OverallScoring = "cumulative" | "points" | "best_of";
export type HandicapMethod = "swingthoughts" | "manual";

interface ScoringMethodPickerProps {
  overallScoring: OverallScoring;
  handicapMethod: HandicapMethod;
  onOverallScoringChange: (scoring: OverallScoring) => void;
  onHandicapMethodChange: (method: HandicapMethod) => void;
}

type OverallOption = { key: OverallScoring; label: string; desc: string; icon: IconName };
type HandicapOption = { key: HandicapMethod; label: string; desc: string; icon: IconName };

const OVERALL_OPTIONS: OverallOption[] = [
  { key: "cumulative", label: "Cumulative", desc: "Total strokes across all rounds", icon: "stats-chart" },
  { key: "points", label: "Points", desc: "Points awarded per round finish", icon: "ribbon" },
  { key: "best_of", label: "Best Of", desc: "Drop worst round(s)", icon: "star" },
];

const HANDICAP_OPTIONS: HandicapOption[] = [
  { key: "swingthoughts", label: "SwingThoughts HCI", desc: "Auto-pull from player profiles", icon: "calculator" },
  { key: "manual", label: "Manual", desc: "Commissioner sets handicaps", icon: "create" },
];

export default function ScoringMethodPicker({
  overallScoring,
  handicapMethod,
  onOverallScoringChange,
  onHandicapMethodChange,
}: ScoringMethodPickerProps) {
  const tap = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.container}>
      {/* Overall Scoring */}
      <Text style={styles.label}>Overall Scoring</Text>
      <View style={styles.optionsList}>
        {OVERALL_OPTIONS.map((opt) => {
          const active = overallScoring === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.optionRow, active && styles.optionRowActive]}
              onPress={() => { tap(); onOverallScoringChange(opt.key); }}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, active && styles.iconCircleActive]}>
                <Ionicons name={opt.icon} size={16} color={active ? "#FFF" : "#999"} />
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={[styles.optionDesc, active && styles.optionDescActive]}>
                  {opt.desc}
                </Text>
              </View>
              {active && (
                <Ionicons name="checkmark-circle" size={20} color="#0D5C3A" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Handicap Method */}
      <Text style={[styles.label, { marginTop: 20 }]}>Handicap Method</Text>
      <View style={styles.optionsList}>
        {HANDICAP_OPTIONS.map((opt) => {
          const active = handicapMethod === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[styles.optionRow, active && styles.optionRowActive]}
              onPress={() => { tap(); onHandicapMethodChange(opt.key); }}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, active && styles.iconCircleActive]}>
                <Ionicons name={opt.icon} size={16} color={active ? "#FFF" : "#999"} />
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={[styles.optionDesc, active && styles.optionDescActive]}>
                  {opt.desc}
                </Text>
              </View>
              {active && (
                <Ionicons name="checkmark-circle" size={20} color="#0D5C3A" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#555",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  optionsList: {
    gap: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
  },
  optionRowActive: {
    borderColor: "#0D5C3A",
    backgroundColor: "rgba(13, 92, 58, 0.04)",
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircleActive: {
    backgroundColor: "#0D5C3A",
  },
  optionText: {
    flex: 1,
    gap: 1,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  },
  optionLabelActive: {
    color: "#0D5C3A",
  },
  optionDesc: {
    fontSize: 12,
    color: "#999",
  },
  optionDescActive: {
    color: "#0D5C3A",
  },
});