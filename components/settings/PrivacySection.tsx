/**
 * PrivacySection
 * Account privacy, partner requests, push notifications, email notifications
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { settingsStyles as sharedStyles } from "./styles";

interface Props {
  accountPrivacy: "public" | "private";
  partnerRequests: "anyone" | "partners_of_partners" | "no_one";
  onPrivacyChange: (value: "public" | "private") => void;
  onPartnerRequestsChange: (value: "anyone" | "partners_of_partners" | "no_one") => void;
}

export default function PrivacySection({
  accountPrivacy,
  partnerRequests,
  onPrivacyChange,
  onPartnerRequestsChange,
}: Props) {
  const tap = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <>
      <Text style={sharedStyles.sectionTitle}>PRIVACY & NOTIFICATIONS</Text>

      {/* ACCOUNT PRIVACY */}
      <View style={sharedStyles.settingRow}>
        <View style={sharedStyles.settingLeft}>
          <Ionicons name="lock-closed-outline" size={20} color="#0D5C3A" />
          <Text style={sharedStyles.settingLabel}>Account Privacy</Text>
        </View>
        <View style={sharedStyles.toggleContainer}>
          <TouchableOpacity
            style={[
              sharedStyles.toggleOption,
              accountPrivacy === "public" && sharedStyles.toggleOptionActive,
            ]}
            onPress={() => { tap(); onPrivacyChange("public"); }}
          >
            <Text
              style={[
                sharedStyles.toggleText,
                accountPrivacy === "public" && sharedStyles.toggleTextActive,
              ]}
            >
              Public
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              sharedStyles.toggleOption,
              accountPrivacy === "private" && sharedStyles.toggleOptionActive,
            ]}
            onPress={() => { tap(); onPrivacyChange("private"); }}
          >
            <Text
              style={[
                sharedStyles.toggleText,
                accountPrivacy === "private" && sharedStyles.toggleTextActive,
              ]}
            >
              Private
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={sharedStyles.settingHelperText}>
        Private: Only partners can see your profile
      </Text>

      {/* PUSH NOTIFICATIONS */}
      <View style={sharedStyles.settingRow}>
        <View style={sharedStyles.settingLeft}>
          <Ionicons name="notifications-outline" size={20} color="#0D5C3A" />
          <View>
            <Text style={sharedStyles.settingLabel}>Push Notifications</Text>
            <Text style={sharedStyles.settingSubtext}>Manage in device settings</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.settingsLinkButton}
          onPress={() => {
            tap();
            if (Platform.OS === "ios") {
              Linking.openURL("app-settings:");
            } else {
              Linking.openSettings();
            }
          }}
        >
          <Text style={styles.settingsLinkText}>Open Settings</Text>
          <Ionicons name="chevron-forward" size={16} color="#0D5C3A" />
        </TouchableOpacity>
      </View>
      <Text style={sharedStyles.settingHelperText}>
        Push notifications are managed through your device settings. You'll receive
        alerts for likes, comments, messages, partner activity, and more.
      </Text>

      {/* EMAIL NOTIFICATIONS */}
      <View style={[sharedStyles.settingRow, sharedStyles.disabledSetting]}>
        <View style={sharedStyles.settingLeft}>
          <Ionicons name="mail-outline" size={20} color="#999" />
          <Text style={sharedStyles.settingLabelDisabled}>Email Notifications</Text>
        </View>
        <Text style={sharedStyles.comingSoonBadge}>Coming Soon</Text>
      </View>

      {/* PARTNER REQUESTS */}
      <View style={sharedStyles.settingRow}>
        <View style={sharedStyles.settingLeft}>
          <Ionicons name="people-outline" size={20} color="#0D5C3A" />
          <View>
            <Text style={sharedStyles.settingLabel}>Partner Requests</Text>
            <Text style={sharedStyles.settingSubtext}>Who can send you requests</Text>
          </View>
        </View>
      </View>
      <View style={styles.dropdownContainer}>
        {(
          [
            { value: "anyone", label: "Anyone" },
            { value: "partners_of_partners", label: "Partners of Partners" },
            { value: "no_one", label: "No One" },
          ] as const
        ).map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.dropdownOption,
              partnerRequests === opt.value && styles.dropdownOptionActive,
            ]}
            onPress={() => { tap(); onPartnerRequestsChange(opt.value); }}
          >
            <View style={styles.radio}>
              {partnerRequests === opt.value && <View style={styles.radioInner} />}
            </View>
            <Text style={styles.dropdownText}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  settingsLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0D5C3A",
  },
  settingsLinkText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  dropdownContainer: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 8,
    marginBottom: 8,
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
  },
  dropdownOptionActive: {
    backgroundColor: "#E8F5E9",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#0D5C3A",
  },
  dropdownText: {
    fontSize: 15,
    color: "#333",
  },
});