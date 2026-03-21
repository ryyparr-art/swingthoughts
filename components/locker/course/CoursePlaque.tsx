/**
 * CoursePlaque — Course Locker Hero
 *
 * Gold engraved nameplate matching the user locker HonorPlaque aesthetic.
 * Displays course name prominently with city/state, par, and slope below a divider.
 */

import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface CoursePlaqueProps {
  courseName: string;
  city?: string;
  state?: string;
  par?: number;
  slope?: number | null;
}

export default function CoursePlaque({
  courseName,
  city,
  state,
  par = 72,
  slope,
}: CoursePlaqueProps) {
  const locationLine = city && state ? `${city}, ${state}` : null;

  const detailParts = [
    locationLine,
    `Par ${par}`,
    slope ? `Slope ${slope}` : null,
  ].filter(Boolean);

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



        {/* Course Name */}
        <Text style={styles.name} numberOfLines={2}>
          {courseName.toUpperCase()}
        </Text>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Subtitle — location, par, slope */}
        <Text style={styles.subtitle} numberOfLines={1}>
          {detailParts.join("  •  ")}
        </Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 1,
  },

  plaque: {
    borderRadius: 7,
    paddingTop: 6,
    paddingBottom: 6,
    paddingHorizontal: 14,
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
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
    borderRadius: 4,
  },

  name: {
    fontFamily: "Georgia",
    fontSize: 16,
    fontWeight: "700",
    color: "#2C1600",
    letterSpacing: 2,
    textShadowColor: "rgba(255,215,80,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
    lineHeight: 20,
    textAlign: "center",
  },

  divider: {
    width: "70%",
    height: 1,
    backgroundColor: "rgba(0,0,0,0.18)",
    marginTop: 3,
    marginBottom: 3,
  },

  subtitle: {
    fontFamily: "Georgia",
    fontSize: 10,
    color: "#3A2000",
    letterSpacing: 1.5,
    opacity: 0.85,
    textAlign: "center",
    textShadowColor: "rgba(255,215,60,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});