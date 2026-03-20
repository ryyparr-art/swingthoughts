/**
 * AchievementNotecard — Section 5
 * Cream notecard with pushpin for achievements/badges.
 * Rotation seeded by badge type for stable renders.
 */

import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import PushPin, { PinColor } from "./PushPin";

interface BadgeData {
  icon?: any;
  emoji?: string;
  name: string;
  location?: string;
  year?: string;
  type?: string;
}

interface Props {
  badge: BadgeData;
  rotation?: number;
  pinColor?: PinColor;
}

// Seeded rotation from badge type — stable across renders, ±2–4 degrees
export function seededAchievementRotation(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0xffffffff;
  }
  const magnitude = 2 + (Math.abs(hash) % 20) / 10; // 2.0–4.0
  return hash % 2 === 0 ? magnitude : -magnitude;
}

export default function AchievementNotecard({ badge, rotation = 0, pinColor = "gold" }: Props) {
  return (
    <View style={[styles.wrapper, { transform: [{ rotate: `${rotation}deg` }] }]}>
      <PushPin color={pinColor} size={20} />

      <View style={styles.card}>
        {/* Year badge top-right */}
        {badge.year ? (
          <Text style={styles.year}>'{badge.year}</Text>
        ) : null}

        {/* Icon — prefer image asset, fall back to emoji */}
        {badge.icon ? (
          <Image source={badge.icon} style={styles.iconImage} />
        ) : badge.emoji ? (
          <Text style={styles.iconEmoji}>{badge.emoji}</Text>
        ) : (
          <Text style={styles.iconEmoji}>🏆</Text>
        )}

        {/* Badge name */}
        <Text style={styles.name} numberOfLines={2}>
          {badge.name}
        </Text>

        {/* Location */}
        {badge.location ? (
          <Text style={styles.location} numberOfLines={1}>
            {badge.location}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    margin: 2,
    marginTop: 6,
    alignItems: "center",
    flexShrink: 0,
    overflow: "visible",
  },
  card: {
    width: 97,
    height: 95,
    backgroundColor: "#EDE0B5",
    borderRadius: 5,
    paddingTop: 11,
    paddingBottom: 7,
    paddingHorizontal: 7,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(160,130,80,0.2)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 6,
  },
  year: {
    position: "absolute",
    top: 6,
    right: 8,
    fontFamily: "Caveat_400Regular",
    fontSize: 11,
    color: "#8B7355",
  },
  iconImage: {
    width: 26,
    height: 26,
    resizeMode: "contain",
    marginBottom: 5,
  },
  iconEmoji: {
    fontSize: 26,
    marginBottom: 2,
    lineHeight: 37,
  },
  name: {
    fontFamily: "Caveat_700Bold",
    fontSize: 13,
    color: "#4A3628",
    textTransform: "uppercase",
    textAlign: "center",
    lineHeight: 17,
  },
  location: {
    fontFamily: "Caveat_400Regular",
    fontSize: 11,
    color: "#9B8060",
    marginTop: 4,
    textAlign: "center",
    lineHeight: 14,
  },
});
