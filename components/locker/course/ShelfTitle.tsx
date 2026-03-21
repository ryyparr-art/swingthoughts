/**
 * ShelfTitle — Course Locker Shelf Label
 *
 * Reusable gold engraved title label for each shelf section.
 * Matches the CoursePlaque LinearGradient aesthetic.
 */

import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface ShelfTitleProps {
  title: string;
}

export default function ShelfTitle({ title }: ShelfTitleProps) {
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



        <Text style={styles.title}>{title}</Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: "center",
    marginBottom: 8,
  },

  plaque: {
    borderRadius: 5,
    paddingVertical: 5,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#6A4C08",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
  },

  insetBorder: {
    position: "absolute",
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
    borderRadius: 3,
  },

  title: {
    fontFamily: "Georgia",
    fontSize: 10,
    fontWeight: "700",
    color: "#2C1600",
    letterSpacing: 1.5,
    textAlign: "center",
    textTransform: "uppercase",
    textShadowColor: "rgba(255,215,80,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});