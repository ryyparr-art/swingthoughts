/**
 * AchievementsSection
 * 
 * Badge selection button and preview.
 * Extracted from modify-clubs.tsx.
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import type { Badge } from "./types";

/* ================================================================ */
/* PROPS                                                            */
/* ================================================================ */

interface AchievementsSectionProps {
  selectedBadges: Badge[];
  onOpenBadgeModal: () => void;
}

/* ================================================================ */
/* COMPONENT                                                        */
/* ================================================================ */

export default function AchievementsSection({
  selectedBadges,
  onOpenBadgeModal,
}: AchievementsSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Achievements</Text>
      <Text style={styles.sectionSubtitle}>
        Select up to 3 badges to display in your locker
      </Text>

      <TouchableOpacity
        style={styles.selectBadgesButton}
        onPress={() => {
          soundPlayer.play("click");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onOpenBadgeModal();
        }}
      >
        <View style={styles.selectBadgesContent}>
          <Ionicons name="trophy" size={20} color="#0D5C3A" />
          <Text style={styles.selectBadgesText}>
            Select Your Achievements to Display
          </Text>
          <View style={styles.badgeCount}>
            <Text style={styles.badgeCountText}>
              {selectedBadges.length}/3
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </TouchableOpacity>

      {selectedBadges.length > 0 && (
        <View style={styles.selectedBadgesPreview}>
          <Text style={styles.previewLabel}>Currently Selected:</Text>
          {selectedBadges.map((badge, index) => (
            <View key={index} style={styles.previewBadge}>
              <Text style={styles.previewBadgeNumber}>{index + 1}.</Text>
              <Text style={styles.previewBadgeText}>
                {badge.displayName}
                {badge.courseName && ` • ${badge.courseName}`}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#666",
    marginBottom: 16,
  },
  selectBadgesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },
  selectBadgesContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  selectBadgesText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0D5C3A",
    flex: 1,
  },
  badgeCount: {
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  selectedBadgesPreview: {
    marginTop: 12,
    backgroundColor: "#F0F7F4",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#0D5C3A",
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  previewBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  previewBadgeNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0D5C3A",
    marginRight: 8,
    width: 20,
  },
  previewBadgeText: {
    fontSize: 13,
    color: "#333",
    flex: 1,
  },
});