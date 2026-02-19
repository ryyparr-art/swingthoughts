/**
 * PlayerRow — Reusable player display component
 *
 * Shows: Avatar | Name + BadgeRow | HCP
 * Used in: AddPlayerModal suggestions, search results, partner lists
 *
 * File: components/scoring/PlayerRow.tsx
 */

import React from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import BadgeRow from "@/components/challenges/BadgeRow";

// ============================================================================
// TYPES
// ============================================================================

export interface PlayerRowData {
  userId: string;
  displayName: string;
  avatar?: string | null;
  handicapIndex?: number;
  earnedChallengeBadges?: string[];
  /** Optional label shown under HCP (e.g. "Partner") */
  tag?: string;
}

interface PlayerRowProps {
  player: PlayerRowData;
  /** Avatar size (default 40) */
  avatarSize?: number;
  /** Show HCP (default true) */
  showHcp?: boolean;
  /** Right-side accessory element */
  rightAccessory?: React.ReactNode;
  /** Compact mode for chips (smaller text, tighter spacing) */
  compact?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PlayerRow({
  player,
  avatarSize = 40,
  showHcp = true,
  rightAccessory,
  compact = false,
}: PlayerRowProps) {
  const borderRadius = avatarSize / 2;

  return (
    <View style={[s.container, compact && s.containerCompact]}>
      {/* Avatar */}
      {player.avatar ? (
        <Image
          source={{ uri: player.avatar }}
          style={[s.avatar, { width: avatarSize, height: avatarSize, borderRadius }]}
        />
      ) : (
        <View
          style={[s.avatar, s.avatarPlaceholder, { width: avatarSize, height: avatarSize, borderRadius }]}
        >
          <Text style={[s.avatarInitial, { fontSize: avatarSize * 0.4 }]}>
            {player.displayName?.charAt(0)?.toUpperCase() || "?"}
          </Text>
        </View>
      )}

      {/* Name + Badges */}
      <View style={s.info}>
        <View style={s.nameRow}>
          <Text
            style={[s.name, compact && s.nameCompact]}
            numberOfLines={1}
          >
            {player.displayName}
          </Text>
          <BadgeRow
            challengeBadges={player.earnedChallengeBadges}
            size={compact ? 12 : 14}
          />
        </View>
        {showHcp && player.handicapIndex !== undefined && (
          <Text style={s.hcp}>
            HCP {player.handicapIndex.toFixed(1)}
            {player.tag ? `  •  ${player.tag}` : ""}
          </Text>
        )}
      </View>

      {/* Right accessory */}
      {rightAccessory && <View style={s.accessory}>{rightAccessory}</View>}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const s = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  containerCompact: {
    gap: 8,
  },
  avatar: {
    backgroundColor: "#E0E0E0",
  },
  avatarPlaceholder: {
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    fontWeight: "700",
    color: "#FFF",
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    flexShrink: 1,
  },
  nameCompact: {
    fontSize: 13,
  },
  hcp: {
    fontSize: 12,
    color: "#888",
    marginTop: 1,
  },
  accessory: {
    marginLeft: 4,
  },
});