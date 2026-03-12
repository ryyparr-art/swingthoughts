/**
 * HonorPlaque — Section 1
 * Gold engraved nameplate, centered on wood, with LinearGradient.
 */

import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface Props {
  name: string;
  hci: number | string;
}

export default function HonorPlaque({ name, hci }: Props) {
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



        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.hci}>HCI · {hci}</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 82,
    paddingTop: 28,
    paddingBottom: 4,
    marginTop: 8,
  },
  plaque: {
    borderRadius: 7,
    paddingVertical: 12,
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
    fontSize: 22,
    fontWeight: "700",
    color: "#2C1600",
    letterSpacing: 2,
    textShadowColor: "rgba(255,215,80,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
    lineHeight: 26,
  },
  hci: {
    fontFamily: "Georgia",
    fontSize: 12,
    color: "#3A2000",
    letterSpacing: 2.5,
    marginTop: 5,
    textShadowColor: "rgba(255,215,60,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
    opacity: 0.88,
  },
});
