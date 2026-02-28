/**
 * Create Invitational Screen
 *
 * Route: /invitationals/create
 * Thin wrapper around CreateInvitationalWizard with header + navigation.
 */

import CreateInvitationalWizard from "@/components/events/invitational/CreateInvitationalWizard";
import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
    Alert,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function CreateInvitationalScreen() {
  const router = useRouter();

  const handleClose = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Alert.alert(
      "Discard Invitational?",
      "Nothing has been saved yet. Are you sure you want to leave?",
      [
        { text: "Keep Editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => router.back(),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
          <Image
            source={require("@/assets/icons/Close.png")}
            style={styles.closeIcon}
          />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Create Invitational</Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {/* Wizard */}
      <CreateInvitationalWizard />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  safeTop: {
    backgroundColor: "#0D5C3A",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  closeIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFF",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },
});