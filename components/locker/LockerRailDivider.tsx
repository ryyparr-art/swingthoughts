/**
 * LockerRailDivider — Section 4
 * Physical horizontal rail dividing upper and lower locker panels.
 * HCI left-justified in same style as course/quote text.
 * Course name + game identity quote centered as before.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface Props {
  course?: string;
  quote?: string;
  hci?: number | string;
}

export default function LockerRailDivider({ course, quote, hci }: Props) {
  const hasHci = hci !== null && hci !== undefined;
  // Always render if we have hci — don't require course or quote
  if (!hasHci && !course && !quote) return null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.topEdge} />

      <View style={styles.rail}>
        {/* HCI left, course centered using flex spacer trick */}
        <View style={styles.courseRow}>
          <Text style={styles.hciText}>{hasHci ? `HCI · ${hci}` : ""}</Text>
          {course && (
            <View style={styles.courseCenter}>
              <Text style={styles.courseEmoji}>⛳</Text>
              <Text style={styles.courseName} numberOfLines={1}>{course}</Text>
            </View>
          )}
          {/* Phantom spacer matches HCI width to keep course truly centered */}
          <Text style={styles.hciSpacer}>{hasHci ? `HCI · ${hci}` : ""}</Text>
        </View>

        {/* Quote — tight below */}
        {quote ? (
          <Text style={styles.quote}>"{quote}"</Text>
        ) : null}
      </View>

      <View style={styles.bottomEdge} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: -10,
  },
  topEdge: {
    height: 0,
  },
  rail: {
    paddingHorizontal: 24,
    paddingVertical: 4,
    alignItems: "center",
  },
  courseRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 1,
  },
  hciText: {
    fontFamily: "Caveat_400Regular",
    fontSize: 17,
    color: "rgba(180,140,90,0.75)",
    letterSpacing: 1.2,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginTop: 6,
  },
  hciSpacer: {
    fontFamily: "Georgia",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.8,
    opacity: 0,
    marginTop: 6,
  },
  courseCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  courseEmoji: {
    fontSize: 11,
    opacity: 0.9,
    marginRight: 4,
  },
  courseName: {
    fontFamily: "Georgia",
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.88)",
    letterSpacing: 0.8,
    textShadowColor: "rgba(0,0,0,0.95)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  quote: {
    fontFamily: "Caveat_400Regular",
    fontSize: 17,
    fontStyle: "italic",
    color: "rgba(255,255,255,0.75)",
    textShadowColor: "rgba(0,0,0,0.95)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
    letterSpacing: 0.3,
    textAlign: "center",
  },
  bottomEdge: {
    height: 0,
  },
});
