/**
 * RoundEditor
 *
 * Editable card for a single round within an invitational/tour.
 * Contains: course picker, date, optional tee time, format + scoring type.
 *
 * Used by: StepRounds in create wizard, Invitational Home (edit rounds)
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
    Platform,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import CourseSearchPicker, { CourseSelection } from "./CourseSearchPicker";
import FormatPicker, { GolfFormat, ScoringType } from "./FormatPicker";

export interface RoundData {
  id: string;
  course: CourseSelection | null;
  date: Date;
  hasTeeTime: boolean;
  teeTime: Date; // time portion only
  format: GolfFormat;
  scoringType: ScoringType;
}

interface RoundEditorProps {
  round: RoundData;
  roundNumber: number;
  onChange: (updated: RoundData) => void;
  onRemove?: () => void;
  canRemove: boolean;
}

export default function RoundEditor({
  round,
  roundNumber,
  onChange,
  onRemove,
  canRemove,
}: RoundEditorProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const update = (partial: Partial<RoundData>) => {
    onChange({ ...round, ...partial });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.roundBadge}>
          <Text style={styles.roundBadgeText}>R{roundNumber}</Text>
        </View>
        <Text style={styles.roundTitle}>Round {roundNumber}</Text>
        {canRemove && onRemove && (
          <TouchableOpacity
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onRemove();
            }}
            style={styles.removeButton}
          >
            <Ionicons name="trash-outline" size={18} color="#FF3B30" />
          </TouchableOpacity>
        )}
      </View>

      {/* Course */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Course</Text>
        <CourseSearchPicker
          selectedCourse={round.course}
          onSelectCourse={(course) => update({ course })}
          onClear={() => update({ course: null })}
        />
      </View>

      {/* Date */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Date</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowDatePicker(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar-outline" size={18} color="#0D5C3A" />
          <Text style={styles.dateText}>{formatDate(round.date)}</Text>
          <Ionicons name="chevron-down" size={16} color="#999" />
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={round.date}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            minimumDate={new Date()}
            onChange={(_, selectedDate) => {
              setShowDatePicker(Platform.OS === "ios");
              if (selectedDate) update({ date: selectedDate });
            }}
          />
        )}
      </View>

      {/* Tee Time */}
      <View style={styles.field}>
        <View style={styles.teeTimeHeader}>
          <Text style={styles.fieldLabel}>Tee Time</Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>
              {round.hasTeeTime ? "Set" : "TBD"}
            </Text>
            <Switch
              value={round.hasTeeTime}
              onValueChange={(val) => {
                soundPlayer.play("click");
                update({ hasTeeTime: val });
              }}
              trackColor={{ false: "#DDD", true: "rgba(13, 92, 58, 0.3)" }}
              thumbColor={round.hasTeeTime ? "#0D5C3A" : "#FFF"}
            />
          </View>
        </View>

        {round.hasTeeTime && (
          <>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowTimePicker(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="time-outline" size={18} color="#0D5C3A" />
              <Text style={styles.dateText}>{formatTime(round.teeTime)}</Text>
              <Ionicons name="chevron-down" size={16} color="#999" />
            </TouchableOpacity>

            {showTimePicker && (
              <DateTimePicker
                value={round.teeTime}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minuteInterval={5}
                onChange={(_, selectedTime) => {
                  setShowTimePicker(Platform.OS === "ios");
                  if (selectedTime) update({ teeTime: selectedTime });
                }}
              />
            )}
          </>
        )}
      </View>

      {/* Format */}
      <View style={styles.field}>
        <FormatPicker
          format={round.format}
          scoringType={round.scoringType}
          onFormatChange={(format) => update({ format })}
          onScoringTypeChange={(scoringType) => update({ scoringType })}
        />
      </View>
    </View>
  );
}

export function createEmptyRound(): RoundData {
  const defaultTeeTime = new Date();
  defaultTeeTime.setHours(8, 0, 0, 0);

  return {
    id: `round_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    course: null,
    date: new Date(),
    hasTeeTime: false,
    teeTime: defaultTeeTime,
    format: "stroke",
    scoringType: "gross",
  };
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 16,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  roundBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  roundBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFF",
  },
  roundTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  removeButton: {
    padding: 6,
  },

  // Fields
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Date / time buttons
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

  // Tee time toggle
  teeTimeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
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
});