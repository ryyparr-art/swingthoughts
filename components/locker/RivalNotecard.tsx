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
      <PushPin color={pinColor} size={20} />
      <View style={styles.card}>
        {/* Role label top */}
        <Text style={styles.roleLabel}>{roleLabel}</Text>

        {/* Name centered */}
        <Text style={styles.name} numberOfLines={1}>{firstName}</Text>

        {/* Score bottom */}
        <Text style={[styles.score, { color: scoreColor }]}>
          {myWins}–{theirWins}
        </Text>
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
    width: 97,
    height: 95,
    backgroundColor: "#EDE0B5",
    borderRadius: 5,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 7,
    alignItems: "center",
    justifyContent: "space-between",
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
    textAlign: "center",
  },
  name: {
    fontFamily: "Caveat_700Bold",
    fontSize: 20,
    color: "#3A2010",
    textAlign: "center",
  },
  score: {
    fontFamily: "Caveat_700Bold",
    fontSize: 18,
    textAlign: "center",
  },
});
