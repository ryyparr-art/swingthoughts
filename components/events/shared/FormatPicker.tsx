/**
 * FormatPicker
 *
 * Reusable selector for golf competition format + scoring type.
 * Used by: Invitationals, Tours (future)
 *
 * Props:
 *   format: "stroke" | "stableford" | "scramble"
 *   scoringType: "gross" | "net"
 *   onFormatChange, onScoringTypeChange
 */

import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export type GolfFormat = "stroke" | "stableford" | "scramble";
export type ScoringType = "gross" | "net";

interface FormatPickerProps {
  format: GolfFormat;
  scoringType: ScoringType;
  onFormatChange: (format: GolfFormat) => void;
  onScoringTypeChange: (type: ScoringType) => void;
}

const FORMATS: { key: GolfFormat; label: string; desc: string }[] = [
  { key: "stroke", label: "Stroke Play", desc: "Lowest total score wins" },
  { key: "stableford", label: "Stableford", desc: "Points per hole, highest wins" },
  { key: "scramble", label: "Scramble", desc: "Best shot from the group" },
];

const SCORING_TYPES: { key: ScoringType; label: string; desc: string }[] = [
  { key: "gross", label: "Gross", desc: "Raw scores, no handicap" },
  { key: "net", label: "Net", desc: "Handicap-adjusted scores" },
];

export default function FormatPicker({
  format,
  scoringType,
  onFormatChange,
  onScoringTypeChange,
}: FormatPickerProps) {
  const tap = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.container}>
      {/* Format */}
      <Text style={styles.label}>Format</Text>
      <View style={styles.optionsRow}>
        {FORMATS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.option, format === f.key && styles.optionActive]}
            onPress={() => { tap(); onFormatChange(f.key); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionLabel, format === f.key && styles.optionLabelActive]}>
              {f.label}
            </Text>
            <Text style={[styles.optionDesc, format === f.key && styles.optionDescActive]}>
              {f.desc}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Scoring Type */}
      <Text style={[styles.label, { marginTop: 16 }]}>Scoring</Text>
      <View style={styles.optionsRow}>
        {SCORING_TYPES.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.option, styles.optionHalf, scoringType === s.key && styles.optionActive]}
            onPress={() => { tap(); onScoringTypeChange(s.key); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.optionLabel, scoringType === s.key && styles.optionLabelActive]}>
              {s.label}
            </Text>
            <Text style={[styles.optionDesc, scoringType === s.key && styles.optionDescActive]}>
              {s.desc}
            </Text>
          </TouchableOpacity>
        ))}
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
  optionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  option: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    gap: 2,
  },
  optionHalf: {
    flex: 1,
  },
  optionActive: {
    borderColor: "#0D5C3A",
    backgroundColor: "rgba(13, 92, 58, 0.04)",
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
    fontSize: 11,
    color: "#999",
    lineHeight: 14,
  },
  optionDescActive: {
    color: "#0D5C3A",
  },
});