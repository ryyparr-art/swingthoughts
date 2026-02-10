/**
 * DeleteAccountModal
 * Extracted from settings.tsx
 */

import { soundPlayer } from "@/utils/soundPlayer";
import React, { useState } from "react";
import {
    Alert,
    Image,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { settingsStyles as sharedStyles } from "../styles";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}

export default function DeleteAccountModal({ visible, onClose, onSubmit }: Props) {
  const [deletePassword, setDeletePassword] = useState("");

  const handleClose = () => {
    soundPlayer.play("click");
    setDeletePassword("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!deletePassword.trim()) {
      soundPlayer.play("error");
      Alert.alert("Error", "Password is required");
      return;
    }
    soundPlayer.play("click");
    await onSubmit(deletePassword);
    setDeletePassword("");
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={sharedStyles.modalOverlay}>
        <View style={sharedStyles.modalContainer}>
          <View style={sharedStyles.modalHeader}>
            <Text style={sharedStyles.modalTitle}>Delete Account</Text>
            <TouchableOpacity onPress={handleClose} style={sharedStyles.modalClose}>
              <Image
                source={require("@/assets/icons/Close.png")}
                style={sharedStyles.closeIcon}
              />
            </TouchableOpacity>
          </View>

          <View style={sharedStyles.modalContent}>
            <Text style={styles.deleteWarningText}>
              ⚠️ This action cannot be undone. Your profile, scores, and posts
              will be permanently deleted.
            </Text>

            <Text style={sharedStyles.modalLabel}>
              Enter Your Password to Confirm
            </Text>
            <TextInput
              style={sharedStyles.modalInput}
              placeholder="Enter your password"
              placeholderTextColor="#999"
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={styles.deleteSubmitButton}
              onPress={handleSubmit}
            >
              <Text style={styles.deleteSubmitButtonText}>
                Delete Account Forever
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  deleteWarningText: {
    fontSize: 14,
    color: "#FF3B30",
    backgroundColor: "#FFF5F5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    textAlign: "center",
    fontWeight: "600",
  },
  deleteSubmitButton: {
    backgroundColor: "#FF3B30",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },
  deleteSubmitButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  cancelButton: {
    backgroundColor: "transparent",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
});