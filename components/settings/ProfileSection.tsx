/**
 * ProfileSection
 * Avatar, display name, handicap, edit locker button
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
    ActivityIndicator,
    Image,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { settingsStyles as sharedStyles } from "./styles";

interface Props {
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  avatar?: string;
  handicap?: string | number;
  uploadingAvatar: boolean;
  onPickAvatar: () => void;
  userId?: string;
}

export default function ProfileSection({
  displayName,
  onDisplayNameChange,
  avatar,
  handicap,
  uploadingAvatar,
  onPickAvatar,
  userId,
}: Props) {
  const router = useRouter();

  return (
    <>
      <Text style={sharedStyles.sectionTitle}>PROFILE</Text>

      {/* AVATAR */}
      <View style={styles.avatarSection}>
        {uploadingAvatar ? (
          <ActivityIndicator size="large" color="#0D5C3A" />
        ) : avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>
              {displayName[0]?.toUpperCase() || "?"}
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.changeAvatarButton} onPress={onPickAvatar}>
          <Ionicons name="camera" size={18} color="#FFF" />
          <Text style={styles.changeAvatarText}>Change Photo</Text>
        </TouchableOpacity>
      </View>

      {/* DISPLAY NAME */}
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Display Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Display Name"
          placeholderTextColor="#999"
          value={displayName}
          onChangeText={onDisplayNameChange}
        />
        <Text style={styles.helperText}>
          Note: This won't update your name in past posts/comments
        </Text>
      </View>

      {/* HANDICAP */}
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Handicap</Text>
        <View style={styles.disabledInput}>
          <Text style={styles.disabledInputText}>{handicap || "N/A"}</Text>
        </View>
        <Text style={styles.helperText}>
          Updates automatically as you log scores
        </Text>
      </View>

      {/* EDIT LOCKER */}
      <TouchableOpacity
        style={styles.lockerButton}
        onPress={() => {
          soundPlayer.play("click");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/locker/${userId}`);
        }}
      >
        <Ionicons name="create-outline" size={20} color="#0D5C3A" />
        <Text style={styles.lockerButtonText}>Edit Locker Details in Locker</Text>
        <Ionicons name="chevron-forward" size={20} color="#0D5C3A" />
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  avatarSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: "#0D5C3A",
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarInitial: {
    fontSize: 48,
    color: "#FFF",
    fontWeight: "700",
  },
  changeAvatarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  changeAvatarText: {
    color: "#FFF",
    fontWeight: "600",
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },
  disabledInput: {
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },
  disabledInputText: {
    fontSize: 16,
    color: "#999",
  },
  helperText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    fontStyle: "italic",
  },
  lockerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },
  lockerButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
    marginLeft: 12,
  },
});