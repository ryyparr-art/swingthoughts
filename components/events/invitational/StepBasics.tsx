/**
 * StepBasics — Wizard Step 1
 *
 * Invitational name, date range, max players,
 * overall scoring method, and handicap method.
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
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import ScoringMethodPicker, {
    HandicapMethod,
    OverallScoring,
} from "../shared/ScoringMethodPicker";

export interface BasicsData {
  name: string;
  avatarUri: string | null;
  startDate: Date;
  endDate: Date;
  isSingleDay: boolean;
  maxPlayers: number;
  overallScoring: OverallScoring;
  handicapMethod: HandicapMethod;
}

interface StepBasicsProps {
  data: BasicsData;
  onChange: (data: BasicsData) => void;
  onNext: () => void;
}

const PLAYER_PRESETS = [8, 16, 24, 48, 100];

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
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={handlePickAvatar}
            activeOpacity={0.7}
          >
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

        {/* Single Day Toggle */}
        <View style={styles.field}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.fieldLabel}>Date</Text>
              <Text style={styles.fieldHint}>
                {data.isSingleDay ? "One-day event" : "Multi-day event"}
              </Text>
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Single Day</Text>
              <Switch
                value={data.isSingleDay}
                onValueChange={(val) => {
                  soundPlayer.play("click");
                  update({
                    isSingleDay: val,
                    endDate: val ? data.startDate : data.endDate,
                  });
                }}
                trackColor={{ false: "#DDD", true: "rgba(13, 92, 58, 0.3)" }}
                thumbColor={data.isSingleDay ? "#0D5C3A" : "#FFF"}
              />
            </View>
          </View>

          {/* Start Date */}
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowStartPicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={18} color="#0D5C3A" />
            <Text style={styles.dateText}>
              {data.isSingleDay ? formatDate(data.startDate) : `Start: ${formatDate(data.startDate)}`}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#999" />
          </TouchableOpacity>

          {showStartPicker && (
            <DateTimePicker
              value={data.startDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              minimumDate={new Date()}
              onChange={(_, selectedDate) => {
                setShowStartPicker(Platform.OS === "ios");
                if (selectedDate) {
                  update({
                    startDate: selectedDate,
                    endDate: data.isSingleDay ? selectedDate : data.endDate,
                  });
                }
              }}
            />
          )}

          {/* End Date (multi-day only) */}
          {!data.isSingleDay && (
            <>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowEndPicker(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={18} color="#0D5C3A" />
                <Text style={styles.dateText}>End: {formatDate(data.endDate)}</Text>
                <Ionicons name="chevron-down" size={16} color="#999" />
              </TouchableOpacity>

              {showEndPicker && (
                <DateTimePicker
                  value={data.endDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  minimumDate={data.startDate}
                  onChange={(_, selectedDate) => {
                    setShowEndPicker(Platform.OS === "ios");
                    if (selectedDate) update({ endDate: selectedDate });
                  }}
                />
              )}
            </>
          )}
        </View>

        {/* Max Players */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Max Players</Text>
          <View style={styles.presetsRow}>
            {PLAYER_PRESETS.map((count) => (
              <TouchableOpacity
                key={count}
                style={[
                  styles.presetChip,
                  data.maxPlayers === count && styles.presetChipActive,
                ]}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  update({ maxPlayers: count });
                }}
              >
                <Text
                  style={[
                    styles.presetText,
                    data.maxPlayers === count && styles.presetTextActive,
                  ]}
                >
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
            onOverallScoringChange={(overallScoring) => update({ overallScoring })}
            onHandicapMethodChange={(handicapMethod) => update({ handicapMethod })}
          />
        </View>

        {/* Spacer for scroll */}
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

  // Avatar
  avatarSection: {
    alignItems: "center",
    gap: 8,
  },
  avatarButton: {
    position: "relative",
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: "#B8860B",
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#B8860B",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(184, 134, 11, 0.3)",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#F4EED8",
  },
  avatarHint: {
    fontSize: 12,
    color: "#999",
  },

  // Fields
  field: { gap: 8 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldHint: {
    fontSize: 12,
    color: "#999",
  },

  // Text input
  textInput: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  charCount: {
    fontSize: 11,
    color: "#999",
    textAlign: "right",
  },

  // Toggle row
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggleInfo: { gap: 2 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  switchLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
  },

  // Date buttons
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  dateText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },

  // Player presets
  presetsRow: {
    flexDirection: "row",
    gap: 8,
  },
  presetChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#FFF",
    borderWidth: 2,
    borderColor: "#E0E0E0",
  },
  presetChipActive: {
    borderColor: "#0D5C3A",
    backgroundColor: "rgba(13, 92, 58, 0.04)",
  },
  presetText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
  },
  presetTextActive: {
    color: "#0D5C3A",
  },

  // Footer
  footer: {
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    backgroundColor: "#F4EED8",
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    borderRadius: 14,
    paddingVertical: 16,
  },
  nextButtonDisabled: {
    opacity: 0.4,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
});