/**
 * StepBasics — Wizard Step 1
 *
 * Invitational name, date range, number of rounds, max players,
 * overall scoring method (with points table), and handicap method.
 *
 * Invitationals are always multi-day events.
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import ScoringMethodPicker, {
    HandicapMethod,
    OverallScoring,
} from "../shared/ScoringMethodPicker";

export const DEFAULT_POINTS_TABLE = [10, 8, 6, 5, 4, 3, 2, 1];

export interface BasicsData {
  name: string;
  avatarUri: string | null;
  startDate: Date;
  endDate: Date;
  numberOfRounds: number;
  maxPlayers: number;
  overallScoring: OverallScoring;
  handicapMethod: HandicapMethod;
  /** Points per position (1st, 2nd, ...). Only used when overallScoring === "points" */
  pointsTable: number[];
}

interface StepBasicsProps {
  data: BasicsData;
  onChange: (data: BasicsData) => void;
  onNext: () => void;
}

const PLAYER_PRESETS = [8, 16, 24, 48, 100];
const ROUND_PRESETS = [2, 4, 6, 8];

export default function StepBasics({ data, onChange, onNext }: StepBasicsProps) {
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const update = (partial: Partial<BasicsData>) => {
    onChange({ ...data, ...partial });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const canProceed = data.name.trim().length >= 3;

  const handlePickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      update({ avatarUri: result.assets[0].uri });
    } catch (error) {
      console.error("Error picking avatar:", error);
    }
  };

  const handlePointsChange = (index: number, text: string) => {
    const value = parseInt(text, 10);
    if (isNaN(value) && text !== "") return;
    const newTable = [...data.pointsTable];
    newTable[index] = isNaN(value) ? 0 : value;
    update({ pointsTable: newTable });
  };

  const handleAddPosition = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const lastVal = data.pointsTable[data.pointsTable.length - 1] || 1;
    update({ pointsTable: [...data.pointsTable, Math.max(lastVal - 1, 0)] });
  };

  const handleRemovePosition = () => {
    if (data.pointsTable.length <= 2) return;
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    update({ pointsTable: data.pointsTable.slice(0, -1) });
  };

  const handleResetPoints = () => {
    soundPlayer.play("click");
    update({ pointsTable: [...DEFAULT_POINTS_TABLE] });
  };

  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarButton} onPress={handlePickAvatar} activeOpacity={0.7}>
            {data.avatarUri ? (
              <Image source={{ uri: data.avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="trophy" size={32} color="#FFF" />
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={12} color="#FFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Tap to add event photo</Text>
        </View>

        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Invitational Name</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Ryan's Fall Classic"
            placeholderTextColor="#999"
            value={data.name}
            onChangeText={(name) => update({ name })}
            maxLength={60}
            autoCorrect={false}
            autoCapitalize="words"
          />
          <Text style={styles.charCount}>{data.name.length}/60</Text>
        </View>

        {/* Dates */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Event Dates</Text>
          <TouchableOpacity style={styles.dateButton} onPress={() => setShowStartPicker(true)} activeOpacity={0.7}>
            <Ionicons name="calendar-outline" size={18} color="#0D5C3A" />
            <Text style={styles.dateText}>Start: {formatDate(data.startDate)}</Text>
            <Ionicons name="chevron-down" size={16} color="#999" />
          </TouchableOpacity>
          {showStartPicker && (
            <View style={styles.datePickerWrapper}>
              <DateTimePicker
                value={data.startDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={new Date()}
                themeVariant="light"
                onChange={(_, selectedDate) => {
                  setShowStartPicker(Platform.OS === "ios");
                  if (selectedDate) {
                    const newEnd = data.endDate < selectedDate ? selectedDate : data.endDate;
                    update({ startDate: selectedDate, endDate: newEnd });
                  }
                }}
              />
            </View>
          )}
          <TouchableOpacity style={styles.dateButton} onPress={() => setShowEndPicker(true)} activeOpacity={0.7}>
            <Ionicons name="calendar-outline" size={18} color="#0D5C3A" />
            <Text style={styles.dateText}>End: {formatDate(data.endDate)}</Text>
            <Ionicons name="chevron-down" size={16} color="#999" />
          </TouchableOpacity>
          {showEndPicker && (
            <View style={styles.datePickerWrapper}>
              <DateTimePicker
                value={data.endDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={data.startDate}
                themeVariant="light"
                onChange={(_, selectedDate) => {
                  setShowEndPicker(Platform.OS === "ios");
                  if (selectedDate) update({ endDate: selectedDate });
                }}
              />
            </View>
          )}
        </View>

        {/* Number of Rounds */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Number of Rounds</Text>
          <View style={styles.presetsRow}>
            {ROUND_PRESETS.map((count) => (
              <TouchableOpacity
                key={count}
                style={[styles.presetChip, data.numberOfRounds === count && styles.presetChipActive]}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  update({ numberOfRounds: count });
                }}
              >
                <Text style={[styles.presetText, data.numberOfRounds === count && styles.presetTextActive]}>
                  {count}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.fieldHint}>You can still add or remove rounds in the next step</Text>
        </View>

        {/* Max Players */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Max Players</Text>
          <View style={styles.presetsRow}>
            {PLAYER_PRESETS.map((count) => (
              <TouchableOpacity
                key={count}
                style={[styles.presetChip, data.maxPlayers === count && styles.presetChipActive]}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  update({ maxPlayers: count });
                }}
              >
                <Text style={[styles.presetText, data.maxPlayers === count && styles.presetTextActive]}>
                  {count}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Scoring & Handicap */}
        <View style={styles.field}>
          <ScoringMethodPicker
            overallScoring={data.overallScoring}
            handicapMethod={data.handicapMethod}
            onOverallScoringChange={(overallScoring) => {
              const pointsTable =
                overallScoring === "points" && data.pointsTable.length === 0
                  ? [...DEFAULT_POINTS_TABLE]
                  : data.pointsTable;
              update({ overallScoring, pointsTable });
            }}
            onHandicapMethodChange={(handicapMethod) => update({ handicapMethod })}
          />
        </View>

        {/* Points Table */}
        {data.overallScoring === "points" && (
          <View style={styles.field}>
            <View style={styles.pointsHeader}>
              <Text style={styles.fieldLabel}>Points Per Position</Text>
              <TouchableOpacity onPress={handleResetPoints} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.resetText}>Reset</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.pointsTable}>
              {data.pointsTable.map((pts, index) => (
                <View key={index} style={styles.pointsRow}>
                  <Text style={styles.positionLabel}>{ordinal(index + 1)}</Text>
                  <TextInput
                    style={styles.pointsInput}
                    value={pts.toString()}
                    onChangeText={(text) => handlePointsChange(index, text)}
                    keyboardType="number-pad"
                    maxLength={3}
                    selectTextOnFocus
                  />
                  <Text style={styles.ptsLabel}>pts</Text>
                </View>
              ))}
            </View>
            <View style={styles.pointsActions}>
              <TouchableOpacity style={styles.pointsActionBtn} onPress={handleAddPosition} activeOpacity={0.7}>
                <Ionicons name="add-circle-outline" size={16} color="#0D5C3A" />
                <Text style={styles.pointsActionText}>Add Position</Text>
              </TouchableOpacity>
              {data.pointsTable.length > 2 && (
                <TouchableOpacity style={styles.pointsActionBtn} onPress={handleRemovePosition} activeOpacity={0.7}>
                  <Ionicons name="remove-circle-outline" size={16} color="#FF3B30" />
                  <Text style={[styles.pointsActionText, { color: "#FF3B30" }]}>Remove Last</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Next Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextButton, !canProceed && styles.nextButtonDisabled]}
          onPress={() => {
            if (!canProceed) return;
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onNext();
          }}
          disabled={!canProceed}
          activeOpacity={0.8}
        >
          <Text style={styles.nextButtonText}>Next: Add Rounds</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 16, gap: 24 },
  avatarSection: { alignItems: "center", gap: 8 },
  avatarButton: { position: "relative" },
  avatarImage: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: "#B8860B" },
  avatarPlaceholder: { width: 88, height: 88, borderRadius: 44, backgroundColor: "#B8860B", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(184, 134, 11, 0.3)" },
  avatarEditBadge: { position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: "#0D5C3A", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#F4EED8" },
  avatarHint: { fontSize: 12, color: "#999" },
  field: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: "#555", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldHint: { fontSize: 11, color: "#999", marginTop: -4 },
  textInput: { backgroundColor: "#FFF", borderRadius: 12, padding: 14, fontSize: 16, fontWeight: "600", color: "#333", borderWidth: 1, borderColor: "#E0E0E0" },
  charCount: { fontSize: 11, color: "#999", textAlign: "right" },
  dateButton: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 12, padding: 12, gap: 8, borderWidth: 1, borderColor: "#E0E0E0" },
  dateText: { flex: 1, fontSize: 15, fontWeight: "600", color: "#333" },
  datePickerWrapper: { backgroundColor: "#FFF", borderRadius: 12, overflow: "hidden" },
  presetsRow: { flexDirection: "row", gap: 8 },
  presetChip: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10, backgroundColor: "#FFF", borderWidth: 2, borderColor: "#E0E0E0" },
  presetChipActive: { borderColor: "#0D5C3A", backgroundColor: "rgba(13, 92, 58, 0.04)" },
  presetText: { fontSize: 15, fontWeight: "700", color: "#333" },
  presetTextActive: { color: "#0D5C3A" },
  pointsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resetText: { fontSize: 13, fontWeight: "600", color: "#0D5C3A" },
  pointsTable: { backgroundColor: "#FFF", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E0E0E0", gap: 8 },
  pointsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  positionLabel: { width: 36, fontSize: 14, fontWeight: "700", color: "#555" },
  pointsInput: { width: 56, backgroundColor: "#F8F8F8", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, fontSize: 16, fontWeight: "700", color: "#333", textAlign: "center", borderWidth: 1, borderColor: "#E0E0E0" },
  ptsLabel: { fontSize: 13, color: "#999", fontWeight: "500" },
  pointsActions: { flexDirection: "row", gap: 12, marginTop: 4 },
  pointsActionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  pointsActionText: { fontSize: 13, fontWeight: "600", color: "#0D5C3A" },
  footer: { padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: "#E0E0E0", backgroundColor: "#F4EED8" },
  nextButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0D5C3A", borderRadius: 14, paddingVertical: 16 },
  nextButtonDisabled: { opacity: 0.4 },
  nextButtonText: { fontSize: 16, fontWeight: "700", color: "#FFF" },
});