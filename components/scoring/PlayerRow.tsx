/**
 * PlayerRow — Reusable player display row
 *
 * Shows: [Checkbox] | Avatar | DisplayName + BadgeRow | HCP
 * Uses BadgeRow from challenges for earned challenge badges.
 *
 * File: components/scoring/PlayerRow.tsx
 */

import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import BadgeRow from "@/components/challenges/BadgeRow";

// ============================================================================
// TYPES
// ============================================================================

export interface PlayerRowUser {
  userId: string;
  displayName: string;
  avatar?: string | null;
  handicapIndex?: number | null;
  earnedChallengeBadges?: string[];
  isPartner?: boolean;
}

interface PlayerRowProps {
  user: PlayerRowUser;
  selected?: boolean;
  onPress?: (user: PlayerRowUser) => void;
  disabled?: boolean;
  showCheckbox?: boolean;
  compact?: boolean;
  trailing?: React.ReactNode;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PlayerRow({
  user,
  selected = false,
  onPress,
  disabled = false,
  showCheckbox = false,
  compact = false,
  trailing,
}: PlayerRowProps) {
  const initials =
    user.displayName?.[0]?.toUpperCase() || "?";
  const avatarSize = compact ? 36 : 44;

  const content = (
    <View style={[s.row, compact && s.rowCompact, selected && s.rowSelected]}>
      {showCheckbox && (
        <View style={s.checkboxWrap}>
          <Ionicons
            name={selected ? "checkbox" : "square-outline"}
            size={22}
            color={selected ? "#0D5C3A" : "#CCC"}
          />
        </View>
      )}

      {user.avatar ? (
        <Image
          source={{ uri: user.avatar }}
          style={[s.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
        />
      ) : (
        <View
          style={[
            s.avatarFallback,
            { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
          ]}
        >
          <Text style={[s.avatarInitial, compact && { fontSize: 13 }]}>
            {initials}
          </Text>
        </View>
      )}

      <View style={s.info}>
        <View style={s.nameRow}>
          <Text style={[s.name, compact && s.nameCompact]} numberOfLines={1}>
            {user.displayName}
          </Text>
          <BadgeRow
            challengeBadges={user.earnedChallengeBadges}
            size={compact ? 13 : 15}
          />
        </View>
        {user.handicapIndex != null && (
          <Text style={s.hcp}>
            HCP {user.handicapIndex.toFixed(1)}
          </Text>
        )}
      </View>

      {trailing && trailing}
    </View>
  );

  if (onPress && !disabled) {
    return (
      <TouchableOpacity activeOpacity={0.6} onPress={() => onPress(user)} disabled={disabled}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

// ============================================================================
// STYLES
// ============================================================================

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 12,
  },
  rowCompact: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 10,
  },
  rowSelected: {
    backgroundColor: "rgba(13, 92, 58, 0.06)",
  },
  checkboxWrap: {
    width: 28,
    alignItems: "center",
  },
  avatar: {
    backgroundColor: "#E0E0E0",
  },
  avatarFallback: {
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 16,
  },
  info: {
    flex: 1,
    justifyContent: "center",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  nameCompact: {
    fontSize: 14,
  },
  hcp: {
    fontSize: 12,
    color: "#888",
    marginTop: 1,
  },
});