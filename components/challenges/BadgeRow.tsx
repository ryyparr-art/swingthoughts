/**
 * BadgeRow
 *
 * Renders up to 3 challenge badges inline, intended to sit
 * next to a user's displayName. Reads from the user's
 * challengeBadges array.
 *
 * Usage:
 *   <View style={{ flexDirection: "row", alignItems: "center" }}>
 *     <Text style={styles.username}>{displayName}</Text>
 *     <BadgeRow challengeBadges={["par3", "iron_player", "tier_tour"]} size={14} />
 *   </View>
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import BadgeIcon from "./BadgeIcon";

interface BadgeRowProps {
  challengeBadges?: string[];
  size?: number;
  gap?: number;
}

export default function BadgeRow({
  challengeBadges,
  size = 14,
  gap = 2,
}: BadgeRowProps) {
  if (!challengeBadges || challengeBadges.length === 0) return null;

  // Max 3 badges inline
  const badges = challengeBadges.slice(0, 3);

  return (
    <View style={[styles.row, { gap }]}>
      {badges.map((badgeId) => (
        <BadgeIcon key={badgeId} badgeId={badgeId} size={size} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 4,
  },
});