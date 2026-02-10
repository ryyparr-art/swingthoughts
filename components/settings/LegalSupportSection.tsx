/**
 * LegalSupportSection
 * Terms, privacy, etiquette, support, version, logout
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { settingsStyles as sharedStyles } from "./styles";

interface Props {
  onOpenSupport: () => void;
  onLogout: () => void;
}

export default function LegalSupportSection({ onOpenSupport, onLogout }: Props) {
  const router = useRouter();

  const tap = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <>
      <Text style={sharedStyles.sectionTitle}>LEGAL & SUPPORT</Text>

      <TouchableOpacity
        style={sharedStyles.actionButton}
        onPress={() => { tap(); router.push("/legal/terms"); }}
      >
        <Ionicons name="document-text-outline" size={20} color="#0D5C3A" />
        <Text style={sharedStyles.actionButtonText}>Terms of Service</Text>
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </TouchableOpacity>

      <TouchableOpacity
        style={sharedStyles.actionButton}
        onPress={() => { tap(); router.push("/legal/privacy"); }}
      >
        <Ionicons name="shield-checkmark-outline" size={20} color="#0D5C3A" />
        <Text style={sharedStyles.actionButtonText}>Privacy Policy</Text>
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </TouchableOpacity>

      <TouchableOpacity
        style={sharedStyles.actionButton}
        onPress={() => { tap(); router.push("/legal/etiquette"); }}
      >
        <Ionicons name="people-outline" size={20} color="#0D5C3A" />
        <Text style={sharedStyles.actionButtonText}>Community Etiquette</Text>
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </TouchableOpacity>

      <TouchableOpacity
        style={sharedStyles.actionButton}
        onPress={() => { tap(); onOpenSupport(); }}
      >
        <Ionicons name="help-circle-outline" size={20} color="#0D5C3A" />
        <Text style={sharedStyles.actionButtonText}>Support</Text>
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </TouchableOpacity>

      <View style={styles.versionContainer}>
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
        <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  versionContainer: {
    alignItems: "center",
    paddingVertical: 16,
  },
  versionText: {
    fontSize: 12,
    color: "#999",
  },
  logoutButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FF3B30",
    backgroundColor: "#FFF5F5",
    marginTop: 16,
  },
  logoutText: {
    color: "#FF3B30",
    fontWeight: "700",
  },
});