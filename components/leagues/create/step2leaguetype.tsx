/**
 * Step 2: League Type
 * - Live vs Simulator
 * - Simulator platform selection
 * - Format (Stroke Play vs 2v2)
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

import { styles } from "./styles";
import { LeagueFormData, SIM_PLATFORMS } from "./types";

interface Step2Props {
  formData: LeagueFormData;
  updateFormData: (updates: Partial<LeagueFormData>) => void;
}

export default function Step2LeagueType({ formData, updateFormData }: Step2Props) {
  const handlePress = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.stepContent}>
      {/* League Type */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          League Type <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.optionButton, formData.leagueType === "live" && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ leagueType: "live", simPlatform: null });
            }}
          >
            <Text style={styles.optionEmoji}>☀️</Text>
            <Text style={[styles.optionText, formData.leagueType === "live" && styles.optionTextSelected]}>
              Live Golf
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, formData.leagueType === "sim" && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ leagueType: "sim" });
            }}
          >
            <Text style={styles.optionEmoji}>🖥️</Text>
            <Text style={[styles.optionText, formData.leagueType === "sim" && styles.optionTextSelected]}>
              Simulator
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Simulator Platform */}
      {formData.leagueType === "sim" && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Simulator Platform <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.chipContainer}>
            {SIM_PLATFORMS.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.chip, formData.simPlatform === p.key && styles.chipSelected]}
                onPress={() => {
                  handlePress();
                  updateFormData({ simPlatform: p.key });
                }}
              >
                <Text style={[styles.chipText, formData.simPlatform === p.key && styles.chipTextSelected]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Format */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Format <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.optionButton, formData.format === "stroke" && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ format: "stroke" });
            }}
          >
            <Ionicons name="person" size={24} color={formData.format === "stroke" ? "#0D5C3A" : "#666"} />
            <Text style={[styles.optionText, formData.format === "stroke" && styles.optionTextSelected]}>
              Stroke Play
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, formData.format === "2v2" && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ format: "2v2" });
            }}
          >
            <Ionicons name="people" size={24} color={formData.format === "2v2" ? "#0D5C3A" : "#666"} />
            <Text style={[styles.optionText, formData.format === "2v2" && styles.optionTextSelected]}>
              2v2 Teams
            </Text>
          </TouchableOpacity>
        </View>
        {formData.format === "2v2" && (
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={20} color="#0D5C3A" />
            <Text style={styles.infoText}>Team assignments are done after members join.</Text>
          </View>
        )}
      </View>
    </View>
  );
}