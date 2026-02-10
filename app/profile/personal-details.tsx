/**
 * Personal Details Screen
 * 
 * Separate screen for capturing personal info:
 * - First Name / Last Name
 * - Date of Birth
 * - Gender
 * - Handedness (Right / Left)
 * 
 * Stored in Firestore user doc under `personalDetails` object.
 * All fields optional (soft prompt approach).
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface PersonalDetails {
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  gender: "male" | "female" | "prefer_not_to_say" | "";
  handedness: "right" | "left" | "";
}

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

const HANDEDNESS_OPTIONS = [
  { value: "right", label: "Right-Handed" },
  { value: "left", label: "Left-Handed" },
] as const;

export default function PersonalDetailsScreen() {
  const router = useRouter();
  const userId = auth.currentUser?.uid;

  const [details, setDetails] = useState<PersonalDetails>({
    firstName: "",
    lastName: "",
    dateOfBirth: null,
    gender: "",
    handedness: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    fetchDetails();
  }, []);

  const fetchDetails = async () => {
    if (!userId) return;

    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        const pd = data.personalDetails || {};

        setDetails({
          firstName: pd.firstName || "",
          lastName: pd.lastName || "",
          dateOfBirth: pd.dateOfBirth?.toDate?.() || (pd.dateOfBirth ? new Date(pd.dateOfBirth) : null),
          gender: pd.gender || "",
          handedness: pd.handedness || "",
        });
      }
    } catch (err) {
      console.error("Error fetching personal details:", err);
      soundPlayer.play("error");
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!userId) return;

    try {
      soundPlayer.play("click");
      setSaving(true);

      const personalDetails: any = {};
      if (details.firstName.trim()) personalDetails.firstName = details.firstName.trim();
      if (details.lastName.trim()) personalDetails.lastName = details.lastName.trim();
      if (details.dateOfBirth) personalDetails.dateOfBirth = details.dateOfBirth;
      if (details.gender) personalDetails.gender = details.gender;
      if (details.handedness) personalDetails.handedness = details.handedness;

      await updateDoc(doc(db, "users", userId), { personalDetails });

      soundPlayer.play("postThought");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Personal details updated", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      console.error("Error saving personal details:", err);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to save. Please try again.");
    }
    setSaving(false);
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (event.type === "set" && selectedDate) {
      setDetails({ ...details, dateOfBirth: selectedDate });
    }
    if (Platform.OS === "ios" && selectedDate) {
      setDetails({ ...details, dateOfBirth: selectedDate });
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "";
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const completionCount = [
    details.firstName.trim(),
    details.lastName.trim(),
    details.dateOfBirth,
    details.gender,
    details.handedness,
  ].filter(Boolean).length;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Image
            source={require("@/assets/icons/Back.png")}
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Personal Details</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Ionicons name="checkmark" size={24} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* COMPLETION INDICATOR */}
        <View style={styles.completionBar}>
          <View style={styles.completionTrack}>
            <View
              style={[
                styles.completionFill,
                { width: `${(completionCount / 5) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.completionText}>
            {completionCount}/5 fields completed
          </Text>
        </View>

        <Text style={styles.introText}>
          This information helps personalize your experience. All fields are
          optional and can be updated anytime.
        </Text>

        {/* FIRST NAME */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>First Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter first name"
            placeholderTextColor="#999"
            value={details.firstName}
            onChangeText={(t) => setDetails({ ...details, firstName: t })}
            autoCapitalize="words"
          />
        </View>

        {/* LAST NAME */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Last Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter last name"
            placeholderTextColor="#999"
            value={details.lastName}
            onChangeText={(t) => setDetails({ ...details, lastName: t })}
            autoCapitalize="words"
          />
        </View>

        {/* DATE OF BIRTH */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Date of Birth</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => {
              soundPlayer.play("click");
              setShowDatePicker(true);
            }}
          >
            <Ionicons name="calendar-outline" size={20} color="#0D5C3A" />
            <Text
              style={[
                styles.dateText,
                !details.dateOfBirth && styles.datePlaceholder,
              ]}
            >
              {details.dateOfBirth
                ? formatDate(details.dateOfBirth)
                : "Select date of birth"}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={details.dateOfBirth || new Date(1990, 0, 1)}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              maximumDate={new Date()}
              minimumDate={new Date(1920, 0, 1)}
              onChange={handleDateChange}
              themeVariant="light"
            />
          )}
          {Platform.OS === "ios" && showDatePicker && (
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* GENDER */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Gender</Text>
          <View style={styles.chipRow}>
            {GENDER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.chip,
                  details.gender === opt.value && styles.chipActive,
                ]}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setDetails({
                    ...details,
                    gender: details.gender === opt.value ? "" : opt.value,
                  });
                }}
              >
                <Text
                  style={[
                    styles.chipText,
                    details.gender === opt.value && styles.chipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.helperText}>
            Used for tee selection recommendations
          </Text>
        </View>

        {/* HANDEDNESS */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Handedness</Text>
          <View style={styles.chipRow}>
            {HANDEDNESS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.chip,
                  details.handedness === opt.value && styles.chipActive,
                ]}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setDetails({
                    ...details,
                    handedness:
                      details.handedness === opt.value ? "" : opt.value,
                  });
                }}
              >
                <Text
                  style={[
                    styles.chipText,
                    details.handedness === opt.value && styles.chipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* SAVE BUTTON */}
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save Details</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  safeTop: { backgroundColor: "#0D5C3A" },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#0D5C3A",
  },
  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFF",
  },
  headerTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  completionBar: {
    marginBottom: 16,
  },
  completionTrack: {
    height: 6,
    backgroundColor: "#E0E0E0",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 6,
  },
  completionFill: {
    height: "100%",
    backgroundColor: "#0D5C3A",
    borderRadius: 3,
  },
  completionText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
  },
  introText: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },
  dateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },
  dateText: {
    fontSize: 16,
    color: "#333",
  },
  datePlaceholder: {
    color: "#999",
  },
  doneButton: {
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#FFF",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
  },
  chipActive: {
    backgroundColor: "#0D5C3A",
    borderColor: "#0D5C3A",
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  chipTextActive: {
    color: "#FFF",
  },
  helperText: {
    fontSize: 12,
    color: "#666",
    marginTop: 6,
    fontStyle: "italic",
  },
  saveButton: {
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 12,
  },
  saveButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
});