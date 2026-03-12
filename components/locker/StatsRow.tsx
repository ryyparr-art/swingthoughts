/**
 * StatsRow — Section 3
 * 4-column scoring highlights strip: Birdie, Eagle, Albatross, HIO.
 */

import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const HoleInOne = require("@/assets/icons/HoleinOne.png");

interface Stats {
  totalBirdies?: number;
  totalEagles?: number;
  totalAlbatross?: number;
  totalHoleInOnes?: number;
}

interface Props {
  stats: Stats;
  onPress?: () => void;
}

const COLUMNS = [
  { emoji: "🐦", label: "Birdie",    key: "totalBirdies",    useImage: false },
  { emoji: "🦅", label: "Eagle",     key: "totalEagles",     useImage: false },
  { emoji: "🦢", label: "Albatross", key: "totalAlbatross",  useImage: false },
  { emoji: null,  label: "HIO",       key: "totalHoleInOnes", useImage: true  },
] as const;

export default function StatsRow({ stats, onPress }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={styles.container}
    >
      {COLUMNS.map((col) => {
        const value = stats[col.key as keyof Stats] ?? 0;
        return (
          <View key={col.key} style={styles.column}>
            {col.useImage ? (
              <Image source={HoleInOne} style={styles.hioImage} />
            ) : (
              <Text style={styles.emoji}>{col.emoji}</Text>
            )}
            <Text style={styles.count}>{value > 0 ? value : "–"}</Text>
            <Text style={styles.label}>{col.label}</Text>
          </View>
        );
      })}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 8,
    marginTop: 2,
    paddingVertical: 4,
    paddingHorizontal: 4,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  column: {
    alignItems: "center",
    gap: 1,
    minWidth: 56,
  },
  emoji: {
    fontSize: 16,
    lineHeight: 18,
  },
  hioImage: {
    width: 16,
    height: 16,
    resizeMode: "contain",
  },
  count: {
    fontFamily: "Caveat_700Bold",
    fontSize: 16,
    lineHeight: 18,
    color: "#C5A55A",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  label: {
    fontFamily: "Georgia",
    fontSize: 8,
    color: "rgba(244,238,216,0.7)",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
