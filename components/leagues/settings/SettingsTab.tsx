/**
 * Settings Tab Component
 * 
 * League configuration settings.
 * Commissioners can edit basic info, schedule (before confirmed), and elevated events.
 */

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { styles } from "./styles";
import { League, formatDateShort } from "./types";

interface SettingsTabProps {
  league: League;
  leagueId: string;
  isCommissioner: boolean;
  isHost: boolean;
  refreshing: boolean;
  uploadingAvatar: boolean;
  onRefresh: () => void;
  onSaveSetting: (field: string, value: any) => Promise<void>;
  onUploadLeagueAvatar: () => Promise<void>;
  onArchiveLeague: () => void;
  onDeleteLeague: () => void;
  onStartNewSeason: () => void;
}

export default function SettingsTab({
  league,
  leagueId,
  isCommissioner,
  isHost,
  refreshing,
  uploadingAvatar,
  onRefresh,
  onSaveSetting,
  onUploadLeagueAvatar,
  onArchiveLeague,
  onDeleteLeague,
  onStartNewSeason,
}: SettingsTabProps) {
  // Helper functions
  const formatTeeTime = (time: string): string => {
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
  };

  const parseTimeToDate = (time: string): Date => {
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const capitalizeDay = (day: string): string => {
    return day.charAt(0).toUpperCase() + day.slice(1);
  };

  // Local state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<any>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const canEditSchedule = (): boolean => {
    return league.status === "upcoming" && !league.readyConfirmed;
  };

  const handleSave = async (field: string, value: any) => {
    try {
      setSaving(true);
      await onSaveSetting(field, value);
      setEditingField(null);
      setTempValue(null);
    } finally {
      setSaving(false);
    }
  };

  // Text Edit Modal
  const renderTextEditModal = () => (
    <Modal
      visible={editingField === "name" || editingField === "description" || editingField === "totalWeeks"}
      animationType="slide"
      transparent
      onRequestClose={() => setEditingField(null)}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            Edit {editingField === "name" ? "League Name" : editingField === "totalWeeks" ? "Total Weeks" : "Description"}
          </Text>

          <TextInput
            style={[
              styles.textEditInput,
              editingField === "description" && styles.textEditInputMultiline,
            ]}
            value={tempValue}
            onChangeText={setTempValue}
            multiline={editingField === "description"}
            numberOfLines={editingField === "description" ? 4 : 1}
            keyboardType={editingField === "totalWeeks" ? "number-pad" : "default"}
            placeholder={editingField === "description" ? "Enter description..." : ""}
            placeholderTextColor="#999"
            autoFocus
          />

          <View style={styles.modalButtonRow}>
            <TouchableOpacity
              style={styles.modalCancelButtonSmall}
              onPress={() => {
                setEditingField(null);
                setTempValue(null);
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={() => {
                if (editingField === "totalWeeks") {
                  const weeks = parseInt(tempValue);
                  if (isNaN(weeks) || weeks < 1 || weeks > 52) {
                    Alert.alert("Invalid", "Please enter a number between 1 and 52.");
                    return;
                  }
                  handleSave("totalWeeks", weeks);
                } else {
                  handleSave(editingField!, tempValue);
                }
              }}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  // Date Picker
  const renderDatePicker = () => {
    if (!showDatePicker || !tempValue) return null;

    if (Platform.OS === "ios") {
      return (
        <Modal visible={showDatePicker} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerHeader}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.datePickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.datePickerTitle}>Select Date</Text>
                <TouchableOpacity
                  onPress={() => {
                    handleSave("startDate", tempValue);
                    setShowDatePicker(false);
                  }}
                >
                  <Text style={styles.datePickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempValue}
                mode="date"
                display="spinner"
                onChange={(e, date) => date && setTempValue(date)}
                minimumDate={new Date()}
              />
            </View>
          </View>
        </Modal>
      );
    }

    return (
      <DateTimePicker
        value={tempValue}
        mode="date"
        display="default"
        onChange={(e, date) => {
          setShowDatePicker(false);
          if (date) {
            handleSave("startDate", date);
          }
        }}
        minimumDate={new Date()}
      />
    );
  };

  // Time Picker
  const renderTimePicker = () => {
    if (!showTimePicker) return null;

    if (Platform.OS === "ios") {
      return (
        <Modal
          visible={showTimePicker}
          animationType="slide"
          transparent
          onRequestClose={() => setShowTimePicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.pickerModalContent}>
              <View style={styles.pickerModalHeader}>
                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.pickerCancelText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>Select Tee Time</Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowTimePicker(false);
                    if (tempValue) {
                      handleSave("teeTime", tempValue);
                    }
                  }}
                >
                  <Text style={styles.pickerDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={parseTimeToDate(tempValue || "14:00")}
                mode="time"
                display="spinner"
                minuteInterval={15}
                onChange={(e, date) => {
                  if (date) {
                    const hours = date.getHours().toString().padStart(2, "0");
                    const minutes = date.getMinutes().toString().padStart(2, "0");
                    setTempValue(`${hours}:${minutes}`);
                  }
                }}
              />
              <TouchableOpacity
                style={styles.clearTimeBtn}
                onPress={() => {
                  setShowTimePicker(false);
                  handleSave("teeTime", null);
                }}
              >
                <Text style={styles.clearTimeText}>Clear Tee Time</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      );
    }

    return (
      <DateTimePicker
        value={parseTimeToDate(tempValue || "14:00")}
        mode="time"
        display="default"
        minuteInterval={15}
        onChange={(e, date) => {
          setShowTimePicker(false);
          if (date) {
            const hours = date.getHours().toString().padStart(2, "0");
            const minutes = date.getMinutes().toString().padStart(2, "0");
            handleSave("teeTime", `${hours}:${minutes}`);
          }
        }}
      />
    );
  };

  return (
    <>
      <ScrollView
        style={styles.tabContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0D5C3A" />
        }
      >
        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Info</Text>

          {/* League Avatar */}
          {isCommissioner && (
            <TouchableOpacity
              style={styles.leagueAvatarRow}
              onPress={onUploadLeagueAvatar}
              disabled={uploadingAvatar}
            >
              {league.avatar ? (
                <Image source={{ uri: league.avatar }} style={styles.leagueAvatarPreview} />
              ) : (
                <View style={[styles.leagueAvatarPreview, styles.leagueAvatarPlaceholder]}>
                  <Ionicons name="trophy-outline" size={32} color="#FFF" />
                </View>
              )}
              <View style={styles.leagueAvatarInfo}>
                <Text style={styles.settingLabel}>League Avatar</Text>
                <Text style={styles.settingValue}>
                  {uploadingAvatar ? "Uploading..." : league.avatar ? "Tap to change" : "Tap to add"}
                </Text>
              </View>
              <Ionicons name="camera-outline" size={22} color="#0D5C3A" />
            </TouchableOpacity>
          )}

          <SettingRow
            label="League Name"
            value={league.name}
            editable={isCommissioner}
            onEdit={() => {
              setEditingField("name");
              setTempValue(league.name);
            }}
          />

          <SettingRow
            label="Description"
            value={league.description || "No description"}
            editable={isCommissioner}
            multiline
            onEdit={() => {
              setEditingField("description");
              setTempValue(league.description || "");
            }}
          />

          <SettingRow
            label="Visibility"
            value={league.isPublic ? "Public" : "Private"}
            editable={isCommissioner}
            onEdit={() => {
              Alert.alert(
                "Change Visibility",
                league.isPublic
                  ? "Make this league private? Only invited members can join."
                  : "Make this league public? Anyone can request to join.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: league.isPublic ? "Make Private" : "Make Public",
                    onPress: () => handleSave("isPublic", !league.isPublic),
                  },
                ]
              );
            }}
          />
        </View>

        {/* Schedule */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          {!canEditSchedule() && (
            <Text style={styles.sectionNote}>
              {league.readyConfirmed
                ? "Schedule locked after confirming setup"
                : "Schedule locked after season starts"}
            </Text>
          )}

          <SettingRow
            label="Start Date"
            value={formatDateShort(league.startDate)}
            editable={canEditSchedule() && isCommissioner}
            onEdit={() => {
              setTempValue(league.startDate.toDate());
              setShowDatePicker(true);
            }}
          />

          <SettingRow label="End Date" value={formatDateShort(league.endDate)} editable={false} />

          <SettingRow
            label="Frequency"
            value={league.frequency.charAt(0).toUpperCase() + league.frequency.slice(1)}
            editable={canEditSchedule() && isCommissioner}
            onEdit={() => {
              Alert.alert("Change Frequency", "Select round frequency:", [
                { text: "Cancel", style: "cancel" },
                { text: "Weekly", onPress: () => handleSave("frequency", "weekly") },
                { text: "Biweekly", onPress: () => handleSave("frequency", "biweekly") },
                { text: "Monthly", onPress: () => handleSave("frequency", "monthly") },
              ]);
            }}
          />

          <SettingRow
            label="Total Weeks"
            value={`${league.totalWeeks} weeks`}
            editable={canEditSchedule() && isCommissioner}
            onEdit={() => {
              setEditingField("totalWeeks");
              setTempValue(league.totalWeeks.toString());
            }}
          />

          <SettingRow
            label="Score Deadline"
            value={`${league.scoreDeadlineDays} days after round`}
            editable={canEditSchedule() && isCommissioner}
            onEdit={() => {
              Alert.alert("Score Deadline", "How many days to submit scores?", [
                { text: "Cancel", style: "cancel" },
                { text: "1 Day", onPress: () => handleSave("scoreDeadlineDays", 1) },
                { text: "2 Days", onPress: () => handleSave("scoreDeadlineDays", 2) },
                { text: "3 Days", onPress: () => handleSave("scoreDeadlineDays", 3) },
                { text: "7 Days", onPress: () => handleSave("scoreDeadlineDays", 7) },
              ]);
            }}
          />

          <SettingRow
            label="League Play Day"
            value={league.playDay ? capitalizeDay(league.playDay) : "Not set"}
            editable={isCommissioner}
            onEdit={() => {
              Alert.alert("League Play Day", "Select the day your league typically plays:", [
                { text: "Cancel", style: "cancel" },
                { text: "Sunday", onPress: () => handleSave("playDay", "sunday") },
                { text: "Monday", onPress: () => handleSave("playDay", "monday") },
                { text: "Tuesday", onPress: () => handleSave("playDay", "tuesday") },
                { text: "Wednesday", onPress: () => handleSave("playDay", "wednesday") },
                { text: "Thursday", onPress: () => handleSave("playDay", "thursday") },
                { text: "Friday", onPress: () => handleSave("playDay", "friday") },
                { text: "Saturday", onPress: () => handleSave("playDay", "saturday") },
                { text: "Clear", style: "destructive", onPress: () => handleSave("playDay", null) },
              ]);
            }}
          />

          <SettingRow
            label="Tee Time"
            value={league.teeTime ? formatTeeTime(league.teeTime) : "Not set"}
            editable={isCommissioner}
            onEdit={() => {
              setEditingField("teeTime");
              setTempValue(league.teeTime || "14:00");
              setShowTimePicker(true);
            }}
          />

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color="#666" />
            <Text style={styles.infoBoxText}>
              Play day & tee time are used for score reminders and weekly results notifications.
            </Text>
          </View>
        </View>

        {/* Format (Read-Only) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Format</Text>
          <Text style={styles.sectionNote}>Set at creation, cannot be changed</Text>

          <SettingRow
            label="Type"
            value={league.leagueType === "live" ? "☀️ Live Golf" : `🖥️ Simulator (${league.simPlatform})`}
            editable={false}
          />

          <SettingRow
            label="Format"
            value={league.format === "stroke" ? "Stroke Play" : "2v2 Match Play"}
            editable={false}
          />

          <SettingRow
            label="Holes"
            value={`${league.holesPerRound} holes per round`}
            editable={false}
          />

          <SettingRow
            label="Handicap System"
            value={
              league.handicapSystem === "swingthoughts"
                ? "SwingThoughts Handicaps"
                : "League Managed"
            }
            editable={false}
          />
        </View>

        {/* Elevated Events */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Elevated Events</Text>

          <SettingRow
            label="Enabled"
            value={league.elevatedEvents?.enabled ? "Yes" : "No"}
            editable={isCommissioner}
            onEdit={() => {
              const current = league.elevatedEvents?.enabled || false;
              handleSave("elevatedEvents", {
                ...league.elevatedEvents,
                enabled: !current,
                weeks: league.elevatedEvents?.weeks || [],
                multiplier: league.elevatedEvents?.multiplier || 2,
              });
            }}
          />

          {league.elevatedEvents?.enabled && (
            <>
              <SettingRow
                label="Weeks"
                value={
                  league.elevatedEvents.weeks.length > 0
                    ? league.elevatedEvents.weeks.map((w) => `Week ${w}`).join(", ")
                    : "None selected"
                }
                editable={isCommissioner}
                onEdit={() => {
                  Alert.alert("Coming Soon", "Week selection will be available in the next update.");
                }}
              />

              <SettingRow
                label="Multiplier"
                value={`${league.elevatedEvents.multiplier}x points`}
                editable={isCommissioner}
                onEdit={() => {
                  Alert.alert("Points Multiplier", "Select multiplier for elevated events:", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "1.5x",
                      onPress: () =>
                        handleSave("elevatedEvents", {
                          ...league.elevatedEvents,
                          multiplier: 1.5,
                        }),
                    },
                    {
                      text: "2x",
                      onPress: () =>
                        handleSave("elevatedEvents", {
                          ...league.elevatedEvents,
                          multiplier: 2,
                        }),
                    },
                    {
                      text: "3x",
                      onPress: () =>
                        handleSave("elevatedEvents", {
                          ...league.elevatedEvents,
                          multiplier: 3,
                        }),
                    },
                  ]);
                }}
              />
            </>
          )}
        </View>

        {/* Season Management (Host only, completed leagues) */}
        {isHost && league.status === "completed" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Season Management</Text>
            
            <TouchableOpacity 
              style={styles.seasonButton} 
              onPress={onStartNewSeason}
            >
              <Ionicons name="refresh-outline" size={22} color="#FFF" />
              <View style={styles.seasonButtonContent}>
                <Text style={styles.seasonButtonText}>Start New Season</Text>
                <Text style={styles.seasonButtonSubtext}>
                  Create next season with same settings & members
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* Danger Zone (Commissioner only) */}
        {isCommissioner && (
          <View style={[styles.section, styles.dangerSection]}>
            <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>

            <TouchableOpacity style={styles.dangerButton} onPress={onArchiveLeague}>
              <Ionicons name="archive-outline" size={20} color="#FF6B6B" />
              <Text style={styles.dangerButtonText}>Archive League</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.dangerButton} onPress={onDeleteLeague}>
              <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
              <Text style={styles.dangerButtonText}>Delete League</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {renderTextEditModal()}
      {renderDatePicker()}
      {renderTimePicker()}
    </>
  );
}

/* ================================================================ */
/* SETTING ROW COMPONENT                                            */
/* ================================================================ */

interface SettingRowProps {
  label: string;
  value: string;
  editable: boolean;
  multiline?: boolean;
  onEdit?: () => void;
}

const SettingRow = ({ label, value, editable, multiline, onEdit }: SettingRowProps) => (
  <TouchableOpacity
    style={[styles.settingRow, !editable && styles.settingRowDisabled]}
    onPress={editable ? onEdit : undefined}
    disabled={!editable}
    activeOpacity={editable ? 0.7 : 1}
  >
    <View style={styles.settingRowContent}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text
        style={[styles.settingValue, multiline && styles.settingValueMultiline]}
        numberOfLines={multiline ? 3 : 1}
      >
        {value}
      </Text>
    </View>
    {editable && <Ionicons name="chevron-forward" size={20} color="#CCC" />}
  </TouchableOpacity>
);