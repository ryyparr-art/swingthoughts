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
  if (!course && !quote && hci == null) return null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.topEdge} />

      <View style={styles.rail}>
        {/* HCI — left justified, same text style as courseName */}
        {hci != null && (
          <View style={styles.hciRow}>
            <Text style={styles.hciText}>HCI · {hci}</Text>
          </View>
        )}

        {/* Course name — centered */}
        {course ? (
          <View style={styles.courseRow}>
            <Text style={styles.courseEmoji}>⛳</Text>
            <Text style={styles.courseName} numberOfLines={1}>
              {course}
            </Text>
          </View>
        ) : null}

        {/* Game identity quote — centered */}
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
    marginTop: 4,
  },
  topEdge: {
    height: 0,
  },
  rail: {
    paddingHorizontal: 24,
    paddingVertical: 6,
    alignItems: "center",
  },
  // HCI row — full width so text can left-align
  hciRow: {
    width: "100%",
    alignItems: "flex-start",
    marginBottom: 3,
  },
  hciText: {
    fontFamily: "Georgia",
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.88)",
    letterSpacing: 0.8,
    textShadowColor: "rgba(0,0,0,0.95)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  courseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginBottom: 3,
  },
  courseEmoji: {
    fontSize: 11,
    opacity: 0.9,
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
