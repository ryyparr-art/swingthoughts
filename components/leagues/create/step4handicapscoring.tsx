/**
 * Step 4: Handicap & Scoring
 * - Handicap system (SwingThoughts vs League Managed)
 * - Points per week (configurable, default 100)
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

import { styles } from "./styles";
import { LeagueFormData } from "./types";

interface Step4Props {
  formData: LeagueFormData;
  updateFormData: (updates: Partial<LeagueFormData>) => void;
}

export default function Step4HandicapScoring({ formData, updateFormData }: Step4Props) {
  const handlePress = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const adjustPoints = (delta: number) => {
    handlePress();
    const newValue = formData.pointsPerWeek + delta;
    if (newValue >= 10 && newValue <= 1000) {
      updateFormData({ pointsPerWeek: newValue });
    }
  };

  return (
    <View style={styles.stepContent}>
      {/* Handicap System */}
      {formData.format === "stroke" ? (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Handicap System <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={[styles.radioOption, formData.handicapSystem === "swingthoughts" && styles.radioSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ handicapSystem: "swingthoughts" });
            }}
          >
            <View
              style={[
                styles.radioCircle,
                formData.handicapSystem === "swingthoughts" && styles.radioCircleSelected,
              ]}
            >
              {formData.handicapSystem === "swingthoughts" && <View style={styles.radioInner} />}
            </View>
            <View style={styles.radioContent}>
              <Text style={styles.radioTitle}>SwingThoughts Handicap</Text>
              <Text style={styles.radioDesc}>
                Use members' SwingThoughts handicaps automatically.
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.radioOption, formData.handicapSystem === "league_managed" && styles.radioSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ handicapSystem: "league_managed" });
            }}
          >
            <View
              style={[
                styles.radioCircle,
                formData.handicapSystem === "league_managed" && styles.radioCircleSelected,
              ]}
            >
              {formData.handicapSystem === "league_managed" && <View style={styles.radioInner} />}
            </View>
            <View style={styles.radioContent}>
              <Text style={styles.radioTitle}>League Managed</Text>
              <Text style={styles.radioDesc}>You set and manage handicaps manually.</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.infoCardLarge}>
          <Ionicons name="information-circle" size={32} color="#0D5C3A" />
          <Text style={styles.infoCardTitle}>2v2 Scoring</Text>
          <Text style={styles.infoCardDesc}>
            2v2 leagues require manual handicap and scoring management for now.
          </Text>
        </View>
      )}

      {/* Points Per Week */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Points Per Week</Text>
        <Text style={styles.helperText}>
          Total points distributed each week based on standings
        </Text>
        <View style={[styles.stepperRow, { marginTop: 16 }]}>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => adjustPoints(-10)}
            disabled={formData.pointsPerWeek <= 10}
          >
            <Ionicons
              name="remove"
              size={24}
              color={formData.pointsPerWeek <= 10 ? "#CCC" : "#0D5C3A"}
            />
          </TouchableOpacity>
          <View style={{ alignItems: "center" }}>
            <Text style={styles.stepperValue}>{formData.pointsPerWeek}</Text>
            <Text style={styles.stepperUnit}>pts</Text>
          </View>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => adjustPoints(10)}
            disabled={formData.pointsPerWeek >= 1000}
          >
            <Ionicons
              name="add"
              size={24}
              color={formData.pointsPerWeek >= 1000 ? "#CCC" : "#0D5C3A"}
            />
          </TouchableOpacity>
        </View>
        <View style={[styles.infoBox, { marginTop: 16 }]}>
          <Ionicons name="information-circle-outline" size={18} color="#666" />
          <Text style={styles.infoBoxText}>
            Points are distributed based on weekly standings. Common values: 100, 200, or 500 points per week.
          </Text>
        </View>
      </View>
    </View>
  );
}