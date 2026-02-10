/**
 * ChangeEmailModal
 * Extracted from settings.tsx
 */

import { soundPlayer } from "@/utils/soundPlayer";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { settingsStyles as styles } from "../styles";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (newEmail: string, password: string) => Promise<void>;
}

export default function ChangeEmailModal({ visible, onClose, onSubmit }: Props) {
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");

  const handleClose = () => {
    soundPlayer.play("click");
    setNewEmail("");
    setEmailPassword("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!newEmail.trim() || !emailPassword.trim()) {
      soundPlayer.play("error");
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (!newEmail.includes("@")) {
      soundPlayer.play("error");
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }
    soundPlayer.play("click");
    await onSubmit(newEmail.trim(), emailPassword);
    setNewEmail("");
    setEmailPassword("");
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Change Email</Text>
            <TouchableOpacity onPress={handleClose} style={styles.modalClose}>
              <Image
                source={require("@/assets/icons/Close.png")}
                style={styles.closeIcon}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.modalLabel}>New Email</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter new email"
              placeholderTextColor="#999"
              value={newEmail}
              onChangeText={setNewEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.modalLabel}>Current Password</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter your password to confirm"
              placeholderTextColor="#999"
              value={emailPassword}
              onChangeText={setEmailPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={styles.modalSubmitButton}
              onPress={handleSubmit}
            >
              <Text style={styles.modalSubmitButtonText}>Update Email</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}