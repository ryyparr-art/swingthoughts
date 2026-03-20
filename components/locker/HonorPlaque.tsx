/**
 * HonorPlaque — Section 1
 * Gold engraved nameplate with embedded stats row.
 * Name centered on top, stats (birdies/eagles/albatross/HIO) below.
 * HCI relocated to LockerRailDivider.
 */

import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const LowLeaderTrophy  = require("@/assets/icons/LowLeaderTrophy.png");
const LowLeaderScratch = require("@/assets/icons/LowLeaderScratch.png");
const LowLeaderAce     = require("@/assets/icons/LowLeaderAce.png");
const HoleInOne        = require("@/assets/icons/HoleinOne.png");

interface StatItem {
  emoji: string;
  label: string;
  value?: number | string;
}

interface Props {
  name: string;
  stats?: {
    totalBirdies?: number;
    totalEagles?: number;
    totalAlbatross?: number;
    totalHoleInOnes?: number;
  };
  onStatsPress?: () => void;
}

const STATS: StatItem[] = [
  { emoji: "🐦", label: "BIRDIE" },
  { emoji: "🦅", label: "EAGLE" },
  { emoji: "🦢", label: "ALBATROSS" },
  { emoji: "🕳️", label: "HIO" },
];

export default function HonorPlaque({ name, stats, onStatsPress }: Props) {
  const values = [
    stats?.totalBirdies,
    stats?.totalEagles,
    stats?.totalAlbatross,
    stats?.totalHoleInOnes,
  ];

  return (
    <View style={styles.wrapper}>
      <LinearGradient
        colors={["#E8C84A", "#C8A53C", "#B8922A", "#C8A53C", "#E2C048"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.plaque}
      >
        {/* Inset engraving border */}
        <View style={styles.insetBorder} />

        {/* Name */}
        <Text style={styles.name} numberOfLines={1}>{name}</Text>

        {/* Divider line */}
        <View style={styles.divider} />

        {/* Stats row — tappable to open stats tracker */}
        <TouchableOpacity
          onPress={onStatsPress}
          activeOpacity={onStatsPress ? 0.7 : 1}
          style={styles.statsRow}
        >
          {STATS.map((stat, i) => (
            <View key={stat.label} style={styles.statItem}>
              <Text style={styles.statEmoji}>{stat.emoji}</Text>
              <Text style={styles.statValue}>{values[i] ?? 0}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 80,
    paddingTop: 32,
    paddingBottom: 4,
    marginTop: 2,
  },
  plaque: {
    borderRadius: 7,
    paddingTop: 6,
    paddingBottom: 5,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#6A4C08",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.75,
    shadowRadius: 14,
    elevation: 8,
  },
  insetBorder: {
    position: "absolute",
    top: 5, left: 5, right: 5, bottom: 5,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
    borderRadius: 4,
  },

  name: {
    fontFamily: "Georgia",
    fontSize: 19,
    fontWeight: "700",
    color: "#2C1600",
    letterSpacing: 2,
    textShadowColor: "rgba(255,215,80,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
    lineHeight: 20,
  },

  divider: {
    width: "70%",
    height: 1,
    backgroundColor: "rgba(0,0,0,0.18)",
    marginTop: 4,
    marginBottom: 4,
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    width: "100%",
    paddingHorizontal: 4,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statEmoji: {
    fontSize: 13,
    marginBottom: 0,
  },
  statValue: {
    fontFamily: "Georgia",
    fontSize: 13,
    fontWeight: "700",
    color: "#2C1600",
    letterSpacing: 0.5,
    lineHeight: 15,
  },
  statLabel: {
    fontFamily: "Georgia",
    fontSize: 7,
    color: "#3A2000",
    letterSpacing: 1.5,
    opacity: 0.75,
    marginTop: 1,
  },
});