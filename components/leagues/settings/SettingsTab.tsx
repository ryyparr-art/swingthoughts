/**
 * Settings Tab Component
 * 
 * League configuration settings.
 * Commissioners can edit basic info, schedule (before confirmed), elevated events, and purse.
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

import ImageCropModal from "./ImageCropModal";
import { styles } from "./styles";
import { League, formatDateShort } from "./types";

interface SettingsTabProps {
  league: League;
  leagueId: string;
  isCommissioner: boolean;
  isHost: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSaveSetting: (field: string, value: any) => Promise<void>;
  onAvatarCropped: (uri: string) => Promise<void>;
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
  onRefresh,
  onSaveSetting,
  onAvatarCropped,
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

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: league.purse?.currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Calculate total purse
  const calculateTotalPurse = (): number => {
    if (!league.purse) return 0;
    let total = 0;
    if (league.purse.seasonPurse > 0) total += league.purse.seasonPurse;
    if (league.purse.weeklyPurse > 0) total += league.purse.weeklyPurse * league.totalWeeks;
    const elevatedWeeksCount = league.elevatedWeeks?.length ?? 0;
    if (league.purse.elevatedPurse > 0 && elevatedWeeksCount > 0) {
      total += league.purse.elevatedPurse * elevatedWeeksCount;
    }
    return total;
  };

  // Local state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<any>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showPurseModal, setShowPurseModal] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);

  // Purse editing state
  const [purseEnabled, setPurseEnabled] = useState(!!league.purse);
  const [seasonPurse, setSeasonPurse] = useState(league.purse?.seasonPurse?.toString() || "0");
  const [weeklyPurse, setWeeklyPurse] = useState(league.purse?.weeklyPurse?.toString() || "0");
  const [elevatedPurse, setElevatedPurse] = useState(league.purse?.elevatedPurse?.toString() || "0");

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

  const handleSavePurse = async () => {
    try {
      setSaving(true);
      
      const seasonAmount = parseInt(seasonPurse) || 0;
      const weeklyAmount = parseInt(weeklyPurse) || 0;
      const elevatedAmount = parseInt(elevatedPurse) || 0;
      
      const hasPurse = purseEnabled && (seasonAmount > 0 || weeklyAmount > 0 || elevatedAmount > 0);
      
      const purseData = hasPurse ? {
        seasonPurse: seasonAmount,
        weeklyPurse: weeklyAmount,
        elevatedPurse: elevatedAmount,
        currency: league.purse?.currency || "USD",
      } : null;
      
      await onSaveSetting("purse", purseData);
      setShowPurseModal(false);
    } finally {
      setSaving(false);
    }
  };

  const openPurseModal = () => {
    setPurseEnabled(!!league.purse);
    setSeasonPurse(league.purse?.seasonPurse?.toString() || "0");
    setWeeklyPurse(league.purse?.weeklyPurse?.toString() || "0");
    setElevatedPurse(league.purse?.elevatedPurse?.toString() || "0");
    setShowPurseModal(true);
  };

  // Calculate live total in modal
  const getModalTotalPurse = (): number => {
    if (!purseEnabled) return 0;
    let total = 0;
    const season = parseInt(seasonPurse) || 0;
    const weekly = parseInt(weeklyPurse) || 0;
    const elevated = parseInt(elevatedPurse) || 0;
    
    if (season > 0) total += season;
    if (weekly > 0) total += weekly * league.totalWeeks;
    const elevatedWeeksCount = league.elevatedWeeks?.length ?? 0;
    if (elevated > 0 && elevatedWeeksCount > 0) {
      total += elevated * elevatedWeeksCount;
    }
    return total;
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

  // Purse Edit Modal
  const renderPurseModal = () => (
    <Modal
      visible={showPurseModal}
      animationType="slide"
      transparent
      onRequestClose={() => setShowPurseModal(false)}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.modalContent, { maxHeight: "80%" }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>Prize Purse 💰</Text>
            <Text style={styles.modalSubtitle}>
              Track prize money PGA-style. This is for display only.
            </Text>

            {/* Enable/Disable Toggle */}
            <View style={styles.purseToggleRow}>
              <Text style={styles.purseToggleLabel}>Enable Prize Purse</Text>
              <TouchableOpacity
                style={[styles.purseToggle, purseEnabled && styles.purseToggleActive]}
                onPress={() => setPurseEnabled(!purseEnabled)}
              >
                <View style={[styles.purseToggleThumb, purseEnabled && styles.purseToggleThumbActive]} />
              </TouchableOpacity>
            </View>

            {purseEnabled && (
              <>
                {/* Season Championship */}
                <View style={styles.purseInputGroup}>
                  <Text style={styles.purseInputLabel}>🏆 Season Championship</Text>
                  <Text style={styles.purseInputHelper}>End-of-season prize for final standings</Text>
                  <View style={styles.purseInputRow}>
                    <View style={styles.purseCurrencyPrefix}>
                      <Text style={styles.purseCurrencyText}>$</Text>
                    </View>
                    <TextInput
                      style={styles.purseAmountInput}
                      value={seasonPurse === "0" ? "" : seasonPurse}
                      onChangeText={(text) => setSeasonPurse(text.replace(/[^0-9]/g, "") || "0")}
                      placeholder="0"
                      placeholderTextColor="#999"
                      keyboardType="number-pad"
                      maxLength={7}
                    />
                  </View>
                </View>

                {/* Weekly Prize */}
                <View style={styles.purseInputGroup}>
                  <Text style={styles.purseInputLabel}>📅 Weekly Prize</Text>
                  <Text style={styles.purseInputHelper}>
                    Prize for each week's winner ({league.totalWeeks} weeks)
                  </Text>
                  <View style={styles.purseInputRow}>
                    <View style={styles.purseCurrencyPrefix}>
                      <Text style={styles.purseCurrencyText}>$</Text>
                    </View>
                    <TextInput
                      style={styles.purseAmountInput}
                      value={weeklyPurse === "0" ? "" : weeklyPurse}
                      onChangeText={(text) => setWeeklyPurse(text.replace(/[^0-9]/g, "") || "0")}
                      placeholder="0"
                      placeholderTextColor="#999"
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                    <Text style={styles.pursePerLabel}>/week</Text>
                  </View>
                </View>

                {/* Elevated Event Bonus */}
                <View style={styles.purseInputGroup}>
                  <Text style={styles.purseInputLabel}>⭐ Elevated Event Bonus</Text>
                  <Text style={styles.purseInputHelper}>
                    Additional prize for elevated/playoff weeks
                    {(league.elevatedWeeks?.length ?? 0) > 0
                      ? ` (${league.elevatedWeeks?.length} selected)`
                      : " (none selected)"}
                  </Text>
                  <View style={styles.purseInputRow}>
                    <View style={styles.purseCurrencyPrefix}>
                      <Text style={styles.purseCurrencyText}>$</Text>
                    </View>
                    <TextInput
                      style={styles.purseAmountInput}
                      value={elevatedPurse === "0" ? "" : elevatedPurse}
                      onChangeText={(text) => setElevatedPurse(text.replace(/[^0-9]/g, "") || "0")}
                      placeholder="0"
                      placeholderTextColor="#999"
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                    <Text style={styles.pursePerLabel}>/event</Text>
                  </View>
                </View>

                {/* Total Summary */}
                {getModalTotalPurse() > 0 && (
                  <View style={styles.purseTotalCard}>
                    <View style={styles.purseTotalHeader}>
                      <Ionicons name="cash-outline" size={18} color="#0D5C3A" />
                      <Text style={styles.purseTotalLabel}>Total Season Purse</Text>
                    </View>
                    <Text style={styles.purseTotalAmount}>
                      {formatCurrency(getModalTotalPurse())}
                    </Text>
                    <View style={styles.purseTotalBreakdown}>
                      {parseInt(seasonPurse) > 0 && (
                        <Text style={styles.purseTotalLine}>
                          Championship: {formatCurrency(parseInt(seasonPurse))}
                        </Text>
                      )}
                      {parseInt(weeklyPurse) > 0 && (
                        <Text style={styles.purseTotalLine}>
                          Weekly: {formatCurrency(parseInt(weeklyPurse))} × {league.totalWeeks} = {formatCurrency(parseInt(weeklyPurse) * league.totalWeeks)}
                        </Text>
                      )}
                      {parseInt(elevatedPurse) > 0 && (league.elevatedWeeks?.length ?? 0) > 0 && (
                        <Text style={styles.purseTotalLine}>
                          Elevated: {formatCurrency(parseInt(elevatedPurse))} × {league.elevatedWeeks?.length} = {formatCurrency(parseInt(elevatedPurse) * (league.elevatedWeeks?.length ?? 0))}
                        </Text>
                      )}
                    </View>
                  </View>
                )}

                {/* Disclaimer */}
                <View style={styles.purseDisclaimer}>
                  <Ionicons name="information-circle-outline" size={16} color="#666" />
                  <Text style={styles.purseDisclaimerText}>
                    Purse amounts are for display only. Collecting and distributing funds is your responsibility.
                  </Text>
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.modalButtonRow}>
            <TouchableOpacity
              style={styles.modalCancelButtonSmall}
              onPress={() => setShowPurseModal(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={handleSavePurse}
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

  const totalPurse = calculateTotalPurse();

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
              onPress={() => setShowCropModal(true)}
              disabled={uploadingAvatar}
            >
              {league.avatar ? (
                <Image
                  source={{ uri: league.avatar }}
                  style={[styles.leagueAvatarPreview, { borderRadius: 32 }]}
                />
              ) : (
                <View style={[styles.leagueAvatarPreview, styles.leagueAvatarPlaceholder, { borderRadius: 32 }]}>
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

        {/* Scoring & Purse */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scoring & Purse</Text>

          <SettingRow
            label="Points Per Week"
            value={`${league.pointsPerWeek || 100} pts`}
            editable={isCommissioner}
            onEdit={() => {
              Alert.alert("Points Per Week", "Select points distributed each week:", [
                { text: "Cancel", style: "cancel" },
                { text: "50 pts", onPress: () => handleSave("pointsPerWeek", 50) },
                { text: "100 pts", onPress: () => handleSave("pointsPerWeek", 100) },
                { text: "200 pts", onPress: () => handleSave("pointsPerWeek", 200) },
                { text: "500 pts", onPress: () => handleSave("pointsPerWeek", 500) },
              ]);
            }}
          />

          {/* Prize Purse Row */}
          <TouchableOpacity
            style={[styles.settingRow, !isCommissioner && styles.settingRowDisabled]}
            onPress={isCommissioner ? openPurseModal : undefined}
            disabled={!isCommissioner}
            activeOpacity={isCommissioner ? 0.7 : 1}
          >
            <View style={styles.settingRowContent}>
              <Text style={styles.settingLabel}>Prize Purse</Text>
              {league.purse && totalPurse > 0 ? (
                <View>
                  <Text style={[styles.settingValue, { color: "#0D5C3A", fontWeight: "700" }]}>
                    {formatCurrency(totalPurse)} total
                  </Text>
                  <Text style={styles.purseBreakdownPreview}>
                    {[
                      league.purse.seasonPurse > 0 && `🏆 ${formatCurrency(league.purse.seasonPurse)}`,
                      league.purse.weeklyPurse > 0 && `📅 ${formatCurrency(league.purse.weeklyPurse)}/wk`,
                      league.purse.elevatedPurse > 0 && `⭐ ${formatCurrency(league.purse.elevatedPurse)}/evt`,
                    ].filter(Boolean).join("  ")}
                  </Text>
                </View>
              ) : (
                <Text style={styles.settingValue}>Not configured</Text>
              )}
            </View>
            {isCommissioner && <Ionicons name="chevron-forward" size={20} color="#CCC" />}
          </TouchableOpacity>
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
            value={`${league.holes || 18} holes per round`}
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
            value={league.hasElevatedEvents ? "Yes" : "No"}
            editable={isCommissioner}
            onEdit={() => {
              const current = league.hasElevatedEvents || false;
              handleSave("hasElevatedEvents", !current);
            }}
          />

          {league.hasElevatedEvents && (
            <>
              <SettingRow
                label="Weeks"
                value={
                  (league.elevatedWeeks?.length ?? 0) > 0
                    ? league.elevatedWeeks!.map((w: number) => `Week ${w}`).join(", ")
                    : "None selected"
                }
                editable={isCommissioner}
                onEdit={() => {
                  Alert.alert("Coming Soon", "Week selection will be available in the next update.");
                }}
              />

              <SettingRow
                label="Multiplier"
                value={`${league.elevatedMultiplier || 2}x points`}
                editable={isCommissioner}
                onEdit={() => {
                  Alert.alert("Points Multiplier", "Select multiplier for elevated events:", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "1.5x",
                      onPress: () => handleSave("elevatedMultiplier", 1.5),
                    },
                    {
                      text: "2x",
                      onPress: () => handleSave("elevatedMultiplier", 2),
                    },
                    {
                      text: "3x",
                      onPress: () => handleSave("elevatedMultiplier", 3),
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
      {renderPurseModal()}
      {renderDatePicker()}
      {renderTimePicker()}

      <ImageCropModal
        visible={showCropModal}
        onClose={() => setShowCropModal(false)}
        title="League Avatar"
        onCropComplete={async (uri) => {
          try {
            setUploadingAvatar(true);
            await onAvatarCropped(uri);
          } finally {
            setUploadingAvatar(false);
          }
        }}
      />
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