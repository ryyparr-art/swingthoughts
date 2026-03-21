/**
 * ShelfCard — Course Locker Shelf Card
 *
 * Silver metallic engraved card, styled to look bolted to the honor board.
 * Reusable across Low Leaders, Hole-in-Ones, and Tour Champions shelves.
 * Content: avatar, name, stat line, date.
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// ============================================================================
// BOLT — decorative corner fastener
// ============================================================================

function Bolt({ style }: { style?: object }) {
  return (
    <View style={[styles.bolt, style]}>
      <View style={styles.boltInner} />
    </View>
  );
}

// ============================================================================
// PROPS
// ============================================================================

interface ShelfCardProps {
  avatarUri?: string | null;
  name: string;
  stat: string;       // e.g. "Net: 68" or "Hole 7"
  date?: string;
  onPress?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ShelfCard({
  avatarUri,
  name,
  stat,
  date,
  onPress,
}: ShelfCardProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.75 : 1}
      style={styles.wrapper}
    >
      <LinearGradient
        colors={["#D8D8D8", "#B8B8B8", "#A0A0A0", "#B8B8B8", "#D0D0D0"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Inset engraving border */}
        <View style={styles.insetBorder} />



        {/* Corner bolts */}
        <Bolt style={styles.boltTL} />
        <Bolt style={styles.boltTR} />
        <Bolt style={styles.boltBL} />
        <Bolt style={styles.boltBR} />

        {/* Avatar */}
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons name="person" size={16} color="#5A5A5A" />
          </View>
        )}

        {/* Name */}
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>

        {/* Thin divider */}
        <View style={styles.divider} />

        {/* Stat */}
        <Text style={styles.stat}>{stat}</Text>

        {/* Date */}
        {date ? (
          <Text style={styles.date}>{date}</Text>
        ) : null}
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  wrapper: {
    // Outer shadow gives the "raised off the board" feel
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 6,
  },

  card: {
    width: 95,
    height: 110,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#888888",
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  insetBorder: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 3,
  },

  // Bolts
  bolt: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#909090",
    borderWidth: 1,
    borderColor: "#606060",
    alignItems: "center",
    justifyContent: "center",
  },
  boltInner: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#606060",
  },
  boltTL: { top: 5, left: 5 },
  boltTR: { top: 5, right: 5 },
  boltBL: { bottom: 5, left: 5 },
  boltBR: { bottom: 5, right: 5 },

  // Content
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: "#707070",
    marginBottom: 4,
  },

  avatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#C0C0C0",
    borderWidth: 1.5,
    borderColor: "#888888",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },

  name: {
    fontFamily: "Georgia",
    fontSize: 10,
    fontWeight: "700",
    color: "#1A1A1A",
    textAlign: "center",
    letterSpacing: 0.3,
    lineHeight: 13,
  },

  divider: {
    width: "60%",
    height: 1,
    backgroundColor: "rgba(0,0,0,0.15)",
    marginTop: 3,
    marginBottom: 3,
  },

  stat: {
    fontFamily: "Georgia",
    fontSize: 10,
    fontWeight: "700",
    color: "#2A2A2A",
    textAlign: "center",
    letterSpacing: 0.5,
    lineHeight: 13,
  },

  date: {
    fontFamily: "Georgia",
    fontSize: 8,
    color: "#555555",
    textAlign: "center",
    letterSpacing: 0.3,
    marginTop: 2,
    opacity: 0.8,
  },
});