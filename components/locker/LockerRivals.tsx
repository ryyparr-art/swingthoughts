/**
 * LockerRivals
 *
 * Compact rivals display for the locker screen.
 * Shows up to 3 computed rivalry roles: Nemesis, Threat, Target.
 * Each row: role label + emoji | rival avatar + name | record.
 * Tapping opens the RivalryDetailModal with full head-to-head breakdown.
 */

import RivalryDetailModal from "@/components/locker/RivalryDetailModal";
import { RivalRole, useRivalries } from "@/hooks/useRivalries";
import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  userId: string;
}

export default function LockerRivals({ userId }: Props) {
  const { roles, loading } = useRivalries(userId);
  const [selectedRole, setSelectedRole] = useState<RivalRole | null>(null);

  if (loading) return null;

  // Empty state — no rivalries yet
  if (roles.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionLabel}>RIVALS</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>⚔️</Text>
          <Text style={styles.emptyText}>No rivals yet</Text>
          <Text style={styles.emptySubtext}>
            Play 3+ rounds with someone to start a rivalry
          </Text>
        </View>
      </View>
    );
  }

  const handlePress = (role: RivalRole) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedRole(role);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>RIVALS</Text>
      <View style={styles.rolesRow}>
        {roles.map((role) => (
          <TouchableOpacity
            key={role.type}
            style={styles.roleCard}
            onPress={() => handlePress(role)}
            activeOpacity={0.7}
          >
            {/* Role badge */}
            <View style={[styles.roleBadge, roleColor(role.type)]}>
              <Text style={styles.roleEmoji}>{role.emoji}</Text>
            </View>

            {/* Avatar */}
            {role.rival.avatar ? (
              <View style={styles.avatar}>
                <ExpoImage
                  source={{ uri: role.rival.avatar }}
                  style={{ width: 36, height: 36 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              </View>
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarLetter}>
                  {role.rival.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}

            {/* Name + type label */}
            <Text style={styles.rivalName} numberOfLines={1}>
              {role.rival.displayName.split(" ")[0]}
            </Text>
            <Text style={styles.roleLabel}>{role.label}</Text>

            {/* Record */}
            <Text style={styles.record}>
              {role.record.myWins}-{role.record.theirWins}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <RivalryDetailModal
        visible={!!selectedRole}
        role={selectedRole}
        onClose={() => setSelectedRole(null)}
      />
    </View>
  );
}

function roleColor(type: string): { backgroundColor: string } {
  switch (type) {
    case "nemesis":
      return { backgroundColor: "rgba(229, 57, 53, 0.3)" };
    case "threat":
      return { backgroundColor: "rgba(255, 152, 0, 0.3)" };
    case "target":
      return { backgroundColor: "rgba(197, 165, 90, 0.3)" };
    default:
      return { backgroundColor: "rgba(255,255,255,0.15)" };
  }
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 1.2,
    textAlign: "center",
    marginBottom: 10,
  },
  rolesRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  roleCard: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    minWidth: 95,
    maxWidth: 110,
    gap: 6,
  },
  roleBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  roleEmoji: {
    fontSize: 14,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
  },
  avatarFallback: {
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },
  rivalName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFF",
    textAlign: "center",
    maxWidth: 90,
  },
  roleLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  record: {
    fontSize: 14,
    fontWeight: "800",
    color: "rgba(255,255,255,0.9)",
  },
  emptyContainer: {
    backgroundColor: "rgba(0,0,0,0.2)",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 4,
  },
  emptyEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.7)",
  },
  emptySubtext: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
  },
});