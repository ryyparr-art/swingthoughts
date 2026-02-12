/**
 * PollBuilder Component
 *
 * Allows users to create a poll with a question and custom response options.
 * Supports Yes/No preset, custom options (2-4), and free-text question input.
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

/* ================================================================ */
/* CONSTANTS                                                        */
/* ================================================================ */

export const MAX_POLL_OPTIONS = 4;
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_QUESTION_LENGTH = 140;
export const MAX_POLL_OPTION_LENGTH = 40;

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

export interface PollData {
  question: string;
  options: string[];
}

/* ================================================================ */
/* PRESETS                                                          */
/* ================================================================ */

const PRESETS = [
  { label: "Yes / No", options: ["Yes", "No"] },
  { label: "Agree / Disagree", options: ["Agree", "Disagree"] },
  { label: "Custom", options: ["", ""] },
];

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

interface PollBuilderProps {
  pollData: PollData;
  onPollDataChange: (data: PollData) => void;
  writable: boolean;
}

export default function PollBuilder({
  pollData,
  onPollDataChange,
  writable,
}: PollBuilderProps) {
  const { question, options } = pollData;

  /* ---------------------------------------------------------------- */
  /* HANDLERS                                                         */
  /* ---------------------------------------------------------------- */

  const handleQuestionChange = (text: string) => {
    onPollDataChange({ ...pollData, question: text });
  };

  const handleOptionChange = (index: number, text: string) => {
    const newOptions = [...options];
    newOptions[index] = text;
    onPollDataChange({ ...pollData, options: newOptions });
  };

  const handleAddOption = () => {
    if (options.length >= MAX_POLL_OPTIONS) return;
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPollDataChange({ ...pollData, options: [...options, ""] });
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= MIN_POLL_OPTIONS) return;
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newOptions = options.filter((_, i) => i !== index);
    onPollDataChange({ ...pollData, options: newOptions });
  };

  const handlePresetSelect = (preset: (typeof PRESETS)[number]) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPollDataChange({ ...pollData, options: [...preset.options] });
  };

  /* ---------------------------------------------------------------- */
  /* ACTIVE PRESET CHECK                                              */
  /* ---------------------------------------------------------------- */

  const activePreset = PRESETS.find(
    (p) =>
      p.options.length === options.length &&
      p.options.every((opt, i) => opt === options[i])
  );

  const isCustom =
    !activePreset || activePreset.label === "Custom";

  /* ---------------------------------------------------------------- */
  /* RENDER                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Poll</Text>

      {/* Question */}
      <View style={styles.questionContainer}>
        <TextInput
          style={styles.questionInput}
          placeholder="Ask your question..."
          placeholderTextColor="#999"
          value={question}
          onChangeText={handleQuestionChange}
          maxLength={MAX_POLL_QUESTION_LENGTH}
          editable={writable}
          multiline
          autoCorrect
          autoCapitalize="sentences"
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>
          {question.length}/{MAX_POLL_QUESTION_LENGTH}
        </Text>
      </View>

      {/* Presets */}
      <View style={styles.presetsRow}>
        {PRESETS.map((preset) => {
          const isActive =
            preset.label === "Custom"
              ? isCustom
              : activePreset?.label === preset.label;

          return (
            <TouchableOpacity
              key={preset.label}
              style={[styles.presetChip, isActive && styles.presetChipActive]}
              onPress={() => handlePresetSelect(preset)}
              disabled={!writable}
            >
              <Text
                style={[
                  styles.presetChipText,
                  isActive && styles.presetChipTextActive,
                ]}
              >
                {preset.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Options */}
      <View style={styles.optionsContainer}>
        {options.map((option, index) => (
          <View key={index} style={styles.optionRow}>
            <View style={styles.optionBadge}>
              <Text style={styles.optionBadgeText}>
                {String.fromCharCode(65 + index)}
              </Text>
            </View>

            <TextInput
              style={styles.optionInput}
              placeholder={`Option ${index + 1}`}
              placeholderTextColor="#999"
              value={option}
              onChangeText={(text) => handleOptionChange(index, text)}
              maxLength={MAX_POLL_OPTION_LENGTH}
              editable={writable}
              autoCorrect
              autoCapitalize="sentences"
            />

            {options.length > MIN_POLL_OPTIONS && (
              <TouchableOpacity
                style={styles.removeOptionButton}
                onPress={() => handleRemoveOption(index)}
                disabled={!writable}
              >
                <Ionicons name="close-circle" size={22} color="#CC3333" />
              </TouchableOpacity>
            )}
          </View>
        ))}

        {options.length < MAX_POLL_OPTIONS && (
          <TouchableOpacity
            style={styles.addOptionButton}
            onPress={handleAddOption}
            disabled={!writable}
          >
            <Ionicons name="add-circle-outline" size={20} color="#0D5C3A" />
            <Text style={styles.addOptionText}>Add Option</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 12,
  },

  /* Question */
  questionContainer: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    marginBottom: 12,
  },
  questionInput: {
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    lineHeight: 22,
    color: "#333",
    minHeight: 64,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 12,
    color: "#999",
    textAlign: "right",
    paddingRight: 12,
    paddingBottom: 8,
  },

  /* Presets */
  presetsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  presetChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#FFF",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
  },
  presetChipActive: {
    backgroundColor: "#0D5C3A",
    borderColor: "#0D5C3A",
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  presetChipTextActive: {
    color: "#FFF",
  },

  /* Options */
  optionsContainer: {
    gap: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  optionBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  optionBadgeText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  optionInput: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#333",
  },
  removeOptionButton: {
    padding: 4,
  },

  /* Add Option */
  addOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#0D5C3A",
    borderStyle: "dashed",
    marginTop: 4,
  },
  addOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
  },
});