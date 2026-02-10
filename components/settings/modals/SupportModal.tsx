/**
 * SupportModal
 * Extracted from settings.tsx
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    Image,
    Linking,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { settingsStyles as sharedStyles } from "../styles";

const SUPPORT_CATEGORIES = [
  { id: "score", label: "Score not saving", emoji: "📊" },
  { id: "course", label: "Can't find my course", emoji: "⛳" },
  { id: "partner", label: "Partner request issues", emoji: "🤝" },
  { id: "profile", label: "Profile/photo issues", emoji: "👤" },
  { id: "holeinone", label: "Hole-in-one verification", emoji: "🎯" },
  { id: "league", label: "League issues", emoji: "🏆" },
  { id: "other", label: "Other", emoji: "❓" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  userId?: string;
}

export default function SupportModal({ visible, onClose, userId }: Props) {
  const handleCategory = (categoryId: string) => {
    soundPlayer.play("click");
    onClose();

    const category = SUPPORT_CATEGORIES.find((c) => c.id === categoryId);
    const subject = encodeURIComponent(`Support: ${category?.label || "Help"}`);
    const body = encodeURIComponent(
      `\n\n---\nUser ID: ${userId || "unknown"}\nApp Version: 1.0.0`
    );

    Linking.openURL(
      `mailto:support@swingthoughts.com?subject=${subject}&body=${body}`
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={sharedStyles.modalOverlay}>
        <View style={sharedStyles.modalContainer}>
          <View style={sharedStyles.modalHeader}>
            <Text style={sharedStyles.modalTitle}>How can we help?</Text>
            <TouchableOpacity
              onPress={() => {
                soundPlayer.play("click");
                onClose();
              }}
              style={sharedStyles.modalClose}
            >
              <Image
                source={require("@/assets/icons/Close.png")}
                style={sharedStyles.closeIcon}
              />
            </TouchableOpacity>
          </View>

          <ScrollView style={sharedStyles.modalContent}>
            {SUPPORT_CATEGORIES.map((category) => (
              <TouchableOpacity
                key={category.id}
                style={styles.supportOption}
                onPress={() => handleCategory(category.id)}
              >
                <Text style={styles.supportEmoji}>{category.emoji}</Text>
                <Text style={styles.supportLabel}>{category.label}</Text>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  supportOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#F7F8FA",
    borderRadius: 12,
    marginBottom: 10,
  },
  supportEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  supportLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
});