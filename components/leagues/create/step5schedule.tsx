/**
 * Step 5: Season Schedule
 * - Start date
 * - Frequency (weekly/biweekly)
 * - Score deadline (day of week)
 * - Number of weeks
 * - Play day (optional)
 * - Tee time (optional)
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";

import { styles } from "./styles";
import {
  calculateEndDate,
  DAYS_OF_WEEK,
  formatTeeTime,
  LeagueFormData,
  parseTimeToDate,
} from "./types";

interface Step5Props {
  formData: LeagueFormData;
  updateFormData: (updates: Partial<LeagueFormData>) => void;
}

export default function Step5Schedule({ formData, updateFormData }: Step5Props) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const handlePress = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (event.type === "set" && selectedDate) {
      updateFormData({ startDate: selectedDate });
    }
    if (Platform.OS === "ios" && selectedDate) {
      updateFormData({ startDate: selectedDate });
    }
  };

  const handleTimeChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowTimePicker(false);
    }
    if (event.type === "set" && selectedDate) {
      const hours = selectedDate.getHours().toString().padStart(2, "0");
      const minutes = selectedDate.getMinutes().toString().padStart(2, "0");
      updateFormData({ teeTime: `${hours}:${minutes}` });
    }
    if (Platform.OS === "ios" && selectedDate) {
      const hours = selectedDate.getHours().toString().padStart(2, "0");
      const minutes = selectedDate.getMinutes().toString().padStart(2, "0");
      updateFormData({ teeTime: `${hours}:${minutes}` });
    }
  };

  const adjustWeeks = (delta: number) => {
    handlePress();
    const newValue = formData.numberOfWeeks + delta;
    if (newValue >= 1 && newValue <= 52) {
      updateFormData({ numberOfWeeks: newValue });
    }
  };

  return (
    <View style={styles.stepContent}>
      {/* Start Date */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Start Date <Text style={styles.required}>*</Text>
        </Text>
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => {
            handlePress();
            setShowDatePicker(true);
          }}
        >
          <Ionicons name="calendar" size={20} color="#0D5C3A" />
          <Text style={[styles.pickerText, formData.startDate && styles.pickerTextFilled]}>
            {formData.startDate
              ? formData.startDate.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Select start date..."}
          </Text>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>

        {showDatePicker && (
          <View style={styles.datePickerContainer}>
            <DateTimePicker
              value={formData.startDate || new Date()}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              minimumDate={new Date()}
              onChange={handleDateChange}
              textColor="#1a1a1a"
              themeVariant="light"
            />
          </View>
        )}

        {Platform.OS === "ios" && showDatePicker && (
          <TouchableOpacity style={styles.datePickerDone} onPress={() => setShowDatePicker(false)}>
            <Text style={styles.datePickerDoneText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Frequency */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Frequency <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.optionButton, formData.frequency === "weekly" && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ frequency: "weekly" });
            }}
          >
            <Text style={[styles.optionText, formData.frequency === "weekly" && styles.optionTextSelected]}>
              Weekly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, formData.frequency === "biweekly" && styles.optionSelected]}
            onPress={() => {
              handlePress();
              updateFormData({ frequency: "biweekly" });
            }}
          >
            <Text style={[styles.optionText, formData.frequency === "biweekly" && styles.optionTextSelected]}>
              Bi-weekly
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Score Deadline */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Score Deadline <Text style={styles.required}>*</Text>
        </Text>
        <Text style={styles.helperText}>Day scores are due each week</Text>
        <View style={styles.chipContainer}>
          {DAYS_OF_WEEK.map((d) => (
            <TouchableOpacity
              key={d.key}
              style={[styles.chip, formData.scoreDeadline === d.key && styles.chipSelected]}
              onPress={() => {
                handlePress();
                updateFormData({ scoreDeadline: d.key });
              }}
            >
              <Text style={[styles.chipText, formData.scoreDeadline === d.key && styles.chipTextSelected]}>
                {d.label.substring(0, 3)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Number of Weeks */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Number of Weeks <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => adjustWeeks(-1)}
            disabled={formData.numberOfWeeks <= 1}
          >
            <Ionicons name="remove" size={24} color={formData.numberOfWeeks <= 1 ? "#CCC" : "#0D5C3A"} />
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{formData.numberOfWeeks}</Text>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => adjustWeeks(1)}
            disabled={formData.numberOfWeeks >= 52}
          >
            <Ionicons name="add" size={24} color={formData.numberOfWeeks >= 52 ? "#CCC" : "#0D5C3A"} />
          </TouchableOpacity>
        </View>
      </View>

      {/* End Date (calculated) */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>End Date</Text>
        <View style={styles.displayField}>
          <Ionicons name="calendar-outline" size={20} color="#666" />
          <Text style={styles.displayText}>
            {calculateEndDate(formData.startDate, formData.frequency, formData.numberOfWeeks)}
          </Text>
        </View>
        <Text style={styles.helperText}>Auto-calculated</Text>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Play Day (Optional) */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          League Play Day <Text style={styles.optionalTag}>(optional)</Text>
        </Text>
        <Text style={styles.helperText}>The day your league typically plays</Text>
        <View style={styles.chipContainer}>
          {DAYS_OF_WEEK.map((d) => (
            <TouchableOpacity
              key={d.key}
              style={[styles.chip, formData.playDay === d.key && styles.chipSelected]}
              onPress={() => {
                handlePress();
                updateFormData({ playDay: formData.playDay === d.key ? null : d.key });
              }}
            >
              <Text style={[styles.chipText, formData.playDay === d.key && styles.chipTextSelected]}>
                {d.label.substring(0, 3)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tee Time (Optional) */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Tee Time <Text style={styles.optionalTag}>(optional)</Text>
        </Text>
        <Text style={styles.helperText}>Used for score reminders</Text>
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => {
            handlePress();
            setShowTimePicker(true);
          }}
        >
          <Ionicons name="time-outline" size={20} color="#0D5C3A" />
          <Text style={[styles.pickerText, formData.teeTime && styles.pickerTextFilled]}>
            {formData.teeTime ? formatTeeTime(formData.teeTime) : "Select tee time..."}
          </Text>
          {formData.teeTime ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                handlePress();
                updateFormData({ teeTime: null });
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-forward" size={20} color="#999" />
          )}
        </TouchableOpacity>

        {showTimePicker && (
          <View style={styles.datePickerContainer}>
            <DateTimePicker
              value={formData.teeTime ? parseTimeToDate(formData.teeTime) : new Date(new Date().setHours(14, 0, 0, 0))}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              minuteInterval={15}
              onChange={handleTimeChange}
              textColor="#1a1a1a"
              themeVariant="light"
            />
          </View>
        )}

        {Platform.OS === "ios" && showTimePicker && (
          <TouchableOpacity style={styles.datePickerDone} onPress={() => setShowTimePicker(false)}>
            <Text style={styles.datePickerDoneText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={18} color="#666" />
        <Text style={styles.infoBoxText}>
          Play day & tee time are used for score reminders and weekly results. Can be changed later in Settings.
        </Text>
      </View>
    </View>
  );
}