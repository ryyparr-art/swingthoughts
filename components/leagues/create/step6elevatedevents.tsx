/**
 * Step 6: Playoffs & Special Events
 * - Elevated events toggle
 * - Elevated weeks selection
 * - Points multiplier
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

import { styles } from "./styles";
import { LeagueFormData } from "./types";

interface Step6Props {
  formData: LeagueFormData;
  updateFormData: (updates: Partial<LeagueFormData>) => void;
}

export default function Step6ElevatedEvents({ formData, updateFormData }: Step6Props) {
  const handlePress = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleWeek = (week: number) => {
    handlePress();
    const newWeeks = formData.elevatedWeeks.includes(week)
      ? formData.elevatedWeeks.filter((x) => x !== week)
      : [...formData.elevatedWeeks, week].sort((a, b) => a - b);
    updateFormData({ elevatedWeeks: newWeeks });
  };

  const adjustMultiplier = (delta: number) => {
    handlePress();
    const newValue = formData.elevatedMultiplier + delta;
    if (newValue >= 1.5 && newValue <= 5) {
      updateFormData({ elevatedMultiplier: newValue });
    }
  };

  return (
    <View style={styles.stepContent}>
      {/* Elevated Events Toggle */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Include Playoffs / Elevated Events?</Text>
        <Text style={styles.helperText}>
          Designate special weeks worth extra points (like PGA majors)
        </Text>
        <View style={[styles.optionRow, { marginTop: 12 }]}>
          <TouchableOpacity
            style={[styles.optionButton, !formData.hasElevatedEvents && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ hasElevatedEvents: false, elevatedWeeks: [] });
            }}
          >
            <Text style={[styles.optionText, !formData.hasElevatedEvents && styles.optionTextSelected]}>
              No
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, formData.hasElevatedEvents && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ hasElevatedEvents: true });
            }}
          >
            <Text style={[styles.optionText, formData.hasElevatedEvents && styles.optionTextSelected]}>
              Yes
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Elevated Weeks Selection */}
      {formData.hasElevatedEvents && (
        <>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Select Elevated Weeks <Text style={styles.required}>*</Text>
            </Text>
            <Text style={styles.helperText}>
              Worth {formData.elevatedMultiplier}x points
              {formData.elevatedPurse > 0 && ` + ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(formData.elevatedPurse)} bonus`}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weeksScroll}>
              <View style={styles.weeksRow}>
                {Array.from({ length: formData.numberOfWeeks }, (_, i) => i + 1).map((w) => (
                  <TouchableOpacity
                    key={w}
                    style={[styles.weekChip, formData.elevatedWeeks.includes(w) && styles.weekChipSelected]}
                    onPress={() => toggleWeek(w)}
                  >
                    <Text
                      style={[
                        styles.weekChipText,
                        formData.elevatedWeeks.includes(w) && styles.weekChipTextSelected,
                      ]}
                    >
                      {w}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            {formData.elevatedWeeks.length > 0 && (
              <Text style={styles.selectedWeeksText}>
                Selected: Week{formData.elevatedWeeks.length > 1 ? "s" : ""} {formData.elevatedWeeks.join(", ")}
              </Text>
            )}
          </View>

          {/* Points Multiplier */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Points Multiplier</Text>
            <Text style={styles.helperText}>
              How much more are elevated weeks worth?
            </Text>
            <View style={[styles.stepperRow, { marginTop: 12 }]}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => adjustMultiplier(-0.5)}
                disabled={formData.elevatedMultiplier <= 1.5}
              >
                <Ionicons
                  name="remove"
                  size={24}
                  color={formData.elevatedMultiplier <= 1.5 ? "#CCC" : "#0D5C3A"}
                />
              </TouchableOpacity>
              <View style={{ alignItems: "center" }}>
                <Text style={styles.stepperValue}>{formData.elevatedMultiplier}x</Text>
              </View>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => adjustMultiplier(0.5)}
                disabled={formData.elevatedMultiplier >= 5}
              >
                <Ionicons
                  name="add"
                  size={24}
                  color={formData.elevatedMultiplier >= 5 ? "#CCC" : "#0D5C3A"}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Example Calculation */}
          <View style={styles.infoCard}>
            <Ionicons name="calculator-outline" size={20} color="#0D5C3A" />
            <Text style={styles.infoText}>
              Regular week: {formData.pointsPerWeek} pts{"\n"}
              Elevated week: {Math.round(formData.pointsPerWeek * formData.elevatedMultiplier)} pts
            </Text>
          </View>
        </>
      )}

      {/* No Elevated Events Info */}
      {!formData.hasElevatedEvents && (
        <View style={styles.infoCardLarge}>
          <Ionicons name="trophy-outline" size={40} color="#CCC" />
          <Text style={styles.infoCardTitle}>All Weeks Equal</Text>
          <Text style={styles.infoCardDesc}>
            Every week will be worth {formData.pointsPerWeek} points. You can always add elevated events later in league settings.
          </Text>
        </View>
      )}
    </View>
  );
}