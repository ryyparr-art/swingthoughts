/**
 * LivePlayerCard
 *
 * Single card in the Live on Course feed insert.
 * Shows avatar, name, course, current hole, and score vs par.
 * Tapping navigates to /round/[roundId] (LiveRoundViewer).
 *
 * File: components/feed/LivePlayerCard.tsx
 */

import type { LiveOnCoursePlayer } from "@/utils/feedInsertTypes";
import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import React from "react";
import {
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const GREEN = "#0D5C3A";
const HEADER_GREEN = "#147A52";
const GOLD = "#C5A55A";
const CREAM = "#F4EED8";

interface Props {
  player: LiveOnCoursePlayer;
}

export default function LivePlayerCard({ player }: Props) {
  const handlePress = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/round/${player.roundId}` as any);
  };

  const scoreLabel =
    player.scoreToPar === 0
      ? "E"
      : player.scoreToPar > 0
      ? `+${player.scoreToPar}`
      : `${player.scoreToPar}`;

  const scoreColor =
    player.scoreToPar < 0
      ? "#1B7A3A"   // under par — green
      : player.scoreToPar === 0
      ? "#555"      // even — neutral
      : "#C0392B";  // over par — red

  const displayName =
    player.displayName.length > 14
      ? player.displayName.slice(0, 13) + "…"
      : player.displayName;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      activeOpacity={0.82}
    >
      {/* Live pulse dot */}
      <View style={styles.liveBadge}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>

      {/* Avatar */}
      <View style={styles.avatarWrapper}>
        {player.avatar ? (
          <ExpoImage
            source={{ uri: player.avatar }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitial}>
              {(player.displayName || "?").charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      {/* Name */}
      <Text style={styles.name} numberOfLines={1}>
        {displayName}
      </Text>

      {/* Course */}
      <Text style={styles.course} numberOfLines={1}>
        {player.courseName}
      </Text>

      {/* Hole + Score row */}
      <View style={styles.statsRow}>
        <View style={styles.holeBadge}>
          <Text style={styles.holeLabel}>Hole</Text>
          <Text style={styles.holeNumber}>{player.currentHole}</Text>
        </View>
        <View style={[styles.scoreBadge, { borderColor: scoreColor }]}>
          <Text style={[styles.scoreLabel, { color: scoreColor }]}>
            {scoreLabel}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 120,
    backgroundColor: "#FFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8E4DA",
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    marginRight: 10,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(20,122,82,0.08)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 8,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1B7A3A",
  },
  liveText: {
    fontSize: 9,
    fontWeight: "900",
    color: HEADER_GREEN,
    letterSpacing: 1,
  },

  avatarWrapper: {
    marginBottom: 6,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: GOLD,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GREEN,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: GOLD,
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFF",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },

  name: {
    fontSize: 12,
    fontWeight: "700",
    color: "#222",
    textAlign: "center",
    marginBottom: 2,
  },
  course: {
    fontSize: 10,
    color: "#888",
    textAlign: "center",
    marginBottom: 8,
  },

  statsRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  holeBadge: {
    alignItems: "center",
    backgroundColor: "#F5F2EB",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  holeLabel: {
    fontSize: 8,
    fontWeight: "600",
    color: "#999",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  holeNumber: {
    fontSize: 14,
    fontWeight: "900",
    color: "#333",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  scoreBadge: {
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minWidth: 34,
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: "900",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
});