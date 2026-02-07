/**
 * Step 4: Handicap & Scoring
 * - Handicap system (SwingThoughts vs League Managed)
 * - Points per week (configurable, default 100)
 * - League purse (PGA-style: season total, weekly, elevated events)
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

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

  const handlePurseChange = (field: 'purseAmount' | 'weeklyPurse' | 'elevatedPurse', text: string) => {
    const numericValue = text.replace(/[^0-9]/g, "");
    const amount = numericValue ? parseInt(numericValue, 10) : 0;
    updateFormData({ [field]: amount });
  };

  // Calculate total purse display
  const calculateTotalPurse = () => {
    let total = 0;
    
    // Season purse
    if (formData.purseAmount > 0) {
      total += formData.purseAmount;
    }
    
    // Weekly purse × number of weeks
    if (formData.weeklyPurse > 0 && formData.numberOfWeeks > 0) {
      total += formData.weeklyPurse * formData.numberOfWeeks;
    }
    
    // Elevated event purse × number of elevated weeks
    if (formData.elevatedPurse > 0 && formData.elevatedWeeks.length > 0) {
      total += formData.elevatedPurse * formData.elevatedWeeks.length;
    }
    
    return total;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
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
      </View>

      {/* Score Approval */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Score Approval <Text style={styles.required}>*</Text>
        </Text>
        <Text style={styles.helperText}>
          How are submitted scores verified?
        </Text>
        <View style={[styles.optionRow, { marginTop: 12 }]}>
          <TouchableOpacity
            style={[styles.optionButton, formData.scoreApproval === "auto" && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ scoreApproval: "auto" });
            }}
          >
            <Ionicons name="checkmark-circle" size={24} color={formData.scoreApproval === "auto" ? "#0D5C3A" : "#666"} />
            <Text style={[styles.optionText, formData.scoreApproval === "auto" && styles.optionTextSelected]}>
              Auto-Approve
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, formData.scoreApproval === "manager" && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ scoreApproval: "manager" });
            }}
          >
            <Ionicons name="shield-checkmark" size={24} color={formData.scoreApproval === "manager" ? "#0D5C3A" : "#666"} />
            <Text style={[styles.optionText, formData.scoreApproval === "manager" && styles.optionTextSelected]}>
              Manager Review
            </Text>
          </TouchableOpacity>
        </View>
        {formData.scoreApproval === "manager" && (
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={20} color="#0D5C3A" />
            <Text style={styles.infoText}>
              Scores will be held as pending until you approve them in league settings.
            </Text>
          </View>
        )}
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* League Purse Section */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          League Purse <Text style={styles.optionalTag}>(optional)</Text>
        </Text>
        <Text style={styles.helperText}>
          Track prize money PGA-style. This is for display only — we don't handle money.
        </Text>

        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.optionButton, !formData.purseEnabled && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ 
                purseEnabled: false, 
                purseAmount: 0,
                weeklyPurse: 0,
                elevatedPurse: 0,
              });
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

      {/* Purse Details */}
      {formData.purseEnabled && (
        <>
          {/* Season Championship Purse */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Season Championship 🏆
            </Text>
            <Text style={styles.helperText}>
              End-of-season prize for final standings
            </Text>
            <View style={styles.purseInputRow}>
              <View style={styles.currencyPrefix}>
                <Text style={styles.currencyText}>$</Text>
              </View>
              <TextInput
                style={styles.purseInput}
                value={formData.purseAmount > 0 ? formData.purseAmount.toString() : ""}
                onChangeText={(text) => handlePurseChange('purseAmount', text)}
                placeholder="0"
                placeholderTextColor="#999"
                keyboardType="number-pad"
                maxLength={7}
              />
            </View>
          </View>

          {/* Weekly Purse */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Weekly Prize 📅
            </Text>
            <Text style={styles.helperText}>
              Prize for each week's winner ({formData.numberOfWeeks} weeks)
            </Text>
            <View style={styles.purseInputRow}>
              <View style={styles.currencyPrefix}>
                <Text style={styles.currencyText}>$</Text>
              </View>
              <TextInput
                style={styles.purseInput}
                value={formData.weeklyPurse > 0 ? formData.weeklyPurse.toString() : ""}
                onChangeText={(text) => handlePurseChange('weeklyPurse', text)}
                placeholder="0"
                placeholderTextColor="#999"
                keyboardType="number-pad"
                maxLength={6}
              />
              <Text style={styles.pursePerLabel}>/week</Text>
            </View>
          </View>

          {/* Elevated Event Purse */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Elevated Event Bonus ⭐
            </Text>
            <Text style={styles.helperText}>
              Additional prize for elevated/playoff weeks
              {formData.elevatedWeeks.length > 0 
                ? ` (${formData.elevatedWeeks.length} selected)`
                : " (configure in Step 6)"}
            </Text>
            <View style={styles.purseInputRow}>
              <View style={styles.currencyPrefix}>
                <Text style={styles.currencyText}>$</Text>
              </View>
              <TextInput
                style={styles.purseInput}
                value={formData.elevatedPurse > 0 ? formData.elevatedPurse.toString() : ""}
                onChangeText={(text) => handlePurseChange('elevatedPurse', text)}
                placeholder="0"
                placeholderTextColor="#999"
                keyboardType="number-pad"
                maxLength={6}
              />
              <Text style={styles.pursePerLabel}>/event</Text>
            </View>
          </View>

          {/* Total Purse Summary */}
          {calculateTotalPurse() > 0 && (
            <View style={styles.purseSummaryCard}>
              <View style={styles.purseSummaryHeader}>
                <Ionicons name="cash-outline" size={20} color="#0D5C3A" />
                <Text style={styles.purseSummaryTitle}>Total Season Purse</Text>
              </View>
              <Text style={styles.purseSummaryAmount}>
                {formatCurrency(calculateTotalPurse())}
              </Text>
              <View style={styles.purseSummaryBreakdown}>
                {formData.purseAmount > 0 && (
                  <Text style={styles.purseSummaryLine}>
                    Championship: {formatCurrency(formData.purseAmount)}
                  </Text>
                )}
                {formData.weeklyPurse > 0 && (
                  <Text style={styles.purseSummaryLine}>
                    Weekly: {formatCurrency(formData.weeklyPurse)} × {formData.numberOfWeeks} = {formatCurrency(formData.weeklyPurse * formData.numberOfWeeks)}
                  </Text>
                )}
                {formData.elevatedPurse > 0 && formData.elevatedWeeks.length > 0 && (
                  <Text style={styles.purseSummaryLine}>
                    Elevated: {formatCurrency(formData.elevatedPurse)} × {formData.elevatedWeeks.length} = {formatCurrency(formData.elevatedPurse * formData.elevatedWeeks.length)}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Disclaimer */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color="#666" />
            <Text style={styles.infoBoxText}>
              Purse amounts are for display only. Collecting and distributing funds is your responsibility.
            </Text>
          </View>
        </>
      )}
    </View>
  );
}