/**
 * AccountSection
 * Personal Details link, email verification, change email/password, delete account
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { settingsStyles as sharedStyles } from "./styles";

interface Props {
  emailVerified: boolean;
  sendingVerification: boolean;
  personalDetailsComplete: boolean;
  onSendVerification: () => void;
  onChangeEmail: () => void;
  onChangePassword: () => void;
  onDeleteAccount: () => void;
}

export default function AccountSection({
  emailVerified,
  sendingVerification,
  personalDetailsComplete,
  onSendVerification,
  onChangeEmail,
  onChangePassword,
  onDeleteAccount,
}: Props) {
  const router = useRouter();

  return (
    <>
      <Text style={sharedStyles.sectionTitle}>ACCOUNT</Text>

      {/* PERSONAL DETAILS */}
      <TouchableOpacity
        style={[
          sharedStyles.actionButton,
          !personalDetailsComplete && styles.incompleteButton,
        ]}
        onPress={() => {
          soundPlayer.play("click");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/profile/personal-details");
        }}
      >
        <Ionicons
          name="person-outline"
          size={20}
          color={personalDetailsComplete ? "#0D5C3A" : "#FF9500"}
        />
        <Text
          style={[
            sharedStyles.actionButtonText,
            !personalDetailsComplete && styles.incompleteText,
          ]}
        >
          Personal Details
        </Text>
        {!personalDetailsComplete && (
          <View style={styles.incompleteBadge}>
            <Text style={styles.incompleteBadgeText}>Incomplete</Text>
          </View>
        )}
        <Ionicons
          name="chevron-forward"
          size={20}
          color={personalDetailsComplete ? "#999" : "#FF9500"}
        />
      </TouchableOpacity>

      {/* VERIFY EMAIL */}
      {!emailVerified && (
        <TouchableOpacity
          style={[sharedStyles.actionButton, styles.verifyButton]}
          onPress={onSendVerification}
          disabled={sendingVerification}
        >
          <Ionicons name="mail-outline" size={20} color="#FF9500" />
          {sendingVerification ? (
            <ActivityIndicator
              size="small"
              color="#FF9500"
              style={{ marginLeft: 12, flex: 1 }}
            />
          ) : (
            <>
              <Text style={styles.verifyButtonText}>Verify Email Address</Text>
              <Ionicons name="warning" size={20} color="#FF9500" />
            </>
          )}
        </TouchableOpacity>
      )}

      {emailVerified && (
        <View style={styles.verifiedBadge}>
          <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
          <Text style={styles.verifiedText}>Email Verified</Text>
        </View>
      )}

      {/* CHANGE EMAIL */}
      <TouchableOpacity style={sharedStyles.actionButton} onPress={onChangeEmail}>
        <Ionicons name="mail-outline" size={20} color="#0D5C3A" />
        <Text style={sharedStyles.actionButtonText}>Change Email</Text>
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </TouchableOpacity>

      {/* CHANGE PASSWORD */}
      <TouchableOpacity style={sharedStyles.actionButton} onPress={onChangePassword}>
        <Ionicons name="key-outline" size={20} color="#0D5C3A" />
        <Text style={sharedStyles.actionButtonText}>Change Password</Text>
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </TouchableOpacity>

      {/* DELETE ACCOUNT */}
      <TouchableOpacity
        style={[sharedStyles.actionButton, sharedStyles.dangerButton]}
        onPress={onDeleteAccount}
      >
        <Ionicons name="trash-outline" size={20} color="#FF3B30" />
        <Text style={sharedStyles.dangerButtonText}>Delete Account</Text>
        <Ionicons name="chevron-forward" size={20} color="#FF3B30" />
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  incompleteButton: {
    borderWidth: 2,
    borderColor: "#FF9500",
    backgroundColor: "#FFF9F0",
  },
  incompleteText: {
    color: "#FF9500",
    fontWeight: "600",
  },
  incompleteBadge: {
    backgroundColor: "#FF9500",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 8,
  },
  incompleteBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },
  verifyButton: {
    borderWidth: 2,
    borderColor: "#FF9500",
    backgroundColor: "#FFF9F0",
  },
  verifyButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#FF9500",
    marginLeft: 12,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    gap: 12,
    borderWidth: 2,
    borderColor: "#4CAF50",
  },
  verifiedText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4CAF50",
  },
});