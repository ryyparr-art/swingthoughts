/**
 * Step 6: Playoffs & Special Events
 * - Elevated events toggle
 * - Elevated weeks selection
 * - Points multiplier
 * - League purse (optional tracking)
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

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

  const handlePurseChange = (text: string) => {
    // Only allow numbers
    const numericValue = text.replace(/[^0-9]/g, "");
    const amount = numericValue ? parseInt(numericValue, 10) : 0;
    updateFormData({ purseAmount: amount });
  };

  return (
    <View style={styles.stepContent}>
      {/* Elevated Events Toggle */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Include Playoffs / Elevated Events?</Text>
        <View style={styles.optionRow}>
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
            <Text style={styles.helperText}>Worth {formData.elevatedMultiplier}x points</Text>
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
          </View>

          {/* Points Multiplier */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Points Multiplier</Text>
            <View style={styles.stepperRow}>
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
        </>
      )}

      {/* Divider */}
      <View style={styles.divider} />

      {/* League Purse (Optional) */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          League Purse <Text style={styles.optionalTag}>(optional)</Text>
        </Text>
        <Text style={styles.helperText}>
          Track a prize pool for your league. This is for display only — we don't handle money.
        </Text>

        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.optionButton, !formData.purseEnabled && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ purseEnabled: false, purseAmount: 0 });
            }}
          >
            <Text style={[styles.optionText, !formData.purseEnabled && styles.optionTextSelected]}>
              No Purse
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, formData.purseEnabled && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ purseEnabled: true });
            }}
          >
            <Text style={[styles.optionText, formData.purseEnabled && styles.optionTextSelected]}>
              Add Purse
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Purse Amount */}
      {formData.purseEnabled && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Purse Amount</Text>
          <View style={styles.purseInputRow}>
            <View style={styles.currencyPrefix}>
              <Text style={styles.currencyText}>$</Text>
            </View>
            <TextInput
              style={styles.purseInput}
              value={formData.purseAmount > 0 ? formData.purseAmount.toString() : ""}
              onChangeText={handlePurseChange}
              placeholder="0"
              placeholderTextColor="#999"
              keyboardType="number-pad"
              maxLength={7}
            />
          </View>
          <View style={[styles.infoBox, { marginTop: 12 }]}>
            <Ionicons name="information-circle-outline" size={18} color="#666" />
            <Text style={styles.infoBoxText}>
              This amount will be displayed on your league page. Collecting and distributing funds is your responsibility.
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}