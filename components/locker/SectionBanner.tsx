/**
 * SectionBanner
 * Gold banner with side gradient rules.
 * Used above Rivals (S2) and Achievements (S5).
 */

import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface Props {
  label: string;
}

export default function SectionBanner({ label }: Props) {
  return (
    <View style={styles.wrapper}>
      {/* Left rule */}
      <LinearGradient
        colors={["transparent", "rgba(197,165,90,0.6)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.rule}
      />

      {/* Badge */}
      <View style={styles.badge}>
        <Text style={styles.label}>{label}</Text>
      </View>

      {/* Right rule */}
      <LinearGradient
        colors={["rgba(197,165,90,0.6)", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.rule}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 2,
    justifyContent: "center",
  },
  rule: {
    flex: 1,
    height: 1,
  },
  badge: {
    backgroundColor: "#3A2010",
    borderWidth: 1,
    borderColor: "#C5A55A",
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 3,
    // subtle gradient effect via shadow
    shadowColor: "#5C3A1A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    fontFamily: "Georgia",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.5,
    color: "#C5A55A",
  },
});