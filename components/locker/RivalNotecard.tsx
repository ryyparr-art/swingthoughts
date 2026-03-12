/**
 * RivalNotecard — Section 2
 * Compact horizontal notecard pinned to locker panel.
 */

import type { RivalRole } from "@/hooks/useRivalries";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import PushPin, { PinColor } from "./PushPin";

interface Props {
  role: RivalRole;
  rotation?: number;
  pinColor?: PinColor;
  onPress?: () => void;
}

export function seededRotation(id: string, min = 1, max = 3): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  }
  const range = max - min;
  const magnitude = min + (Math.abs(hash) % (range * 10)) / 10;
  return hash % 2 === 0 ? magnitude : -magnitude;
}

export default function RivalNotecard({ role, rotation = 0, pinColor = "green" }: Props) {
  const { record } = role;
  const { myWins, theirWins } = record;

  const isWinning  = myWins > theirWins;
  const isLosing   = myWins < theirWins;
  const scoreColor = isWinning ? "#1B5E20" : isLosing ? "#8B0000" : "#4A3628";
  const firstName  = role.rival.displayName.split(" ")[0];
  const roleLabel  = role.type === "nemesis" ? "NEMESIS" : role.type === "threat" ? "THREAT" : "TARGET";

  return (
    <View style={[styles.wrapper, { transform: [{ rotate: `${rotation}deg` }] }]}>
      <PushPin color={pinColor} size={18} />
      <View style={styles.card}>
        {/* Role label top-left */}
        <Text style={styles.roleLabel}>{roleLabel}</Text>

        {/* Name + score in a row */}
        <View style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>{firstName}</Text>
          <Text style={[styles.score, { color: scoreColor }]}>
            {myWins}–{theirWins}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    overflow: "visible",
    marginHorizontal: 6,
    marginTop: 8,
  },
  card: {
    width: 120,
    backgroundColor: "#EDE0B5",
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(160,130,80,0.25)",
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  roleLabel: {
    fontFamily: "Caveat_400Regular",
    fontSize: 11,
    color: "#9B8B6A",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  name: {
    fontFamily: "Caveat_700Bold",
    fontSize: 24,
    color: "#3A2010",
    flex: 1,
    marginRight: 6,
  },
  score: {
    fontFamily: "Caveat_700Bold",
    fontSize: 24,
  },
});
