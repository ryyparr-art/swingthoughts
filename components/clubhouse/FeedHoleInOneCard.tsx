/**
 * FeedHoleInOneCard
 *
 * Standalone elevated feed card for verified hole-in-ones.
 * Shown to ALL users (not just partners) since it's rare enough
 * to always be worth celebrating.
 *
 * Uses assets/icons/HoleinOne.png for the icon.
 * Gold left border with warm background.
 */

import type { HoleInOneInsert } from "@/utils/feedInsertTypes";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  insert: HoleInOneInsert;
}

export default function FeedHoleInOneCard({ insert }: Props) {
  const router = useRouter();

  const handlePress = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/profile/${insert.userId}` as any);
  };

  const timeAgo = formatTime(insert.timestamp);

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.9}
      onPress={handlePress}
    >
      {/* Center content */}
      <View style={styles.center}>
        {/* HoleinOne.png icon */}
        <View style={styles.iconWrap}>
          <Image
            source={require("@/assets/icons/HoleinOne.png")}
            style={styles.icon}
          />
        </View>

        <Text style={styles.headline}>Hole-in-One!</Text>

        <Text style={styles.detail}>
          <Text style={styles.bold}>{insert.displayName}</Text>
          {" aced "}
          <Text style={styles.hl}>
            {insert.courseName} Hole #{insert.hole}
          </Text>
        </Text>

        <View style={styles.verifiedBadge}>
          <Ionicons name="checkmark-circle" size={14} color="#0D5C3A" />
          <Text style={styles.verifiedText}>
            Verified by {insert.verifiedBy}
          </Text>
        </View>

        <Text style={styles.timeText}>{timeAgo}</Text>
      </View>
    </TouchableOpacity>
  );
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFCF0",
    borderLeftWidth: 3,
    borderLeftColor: "#FFD700",
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  center: {
    alignItems: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  icon: {
    width: 40,
    height: 40,
    resizeMode: "contain",
  },
  headline: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    fontFamily: "serif",
    marginBottom: 6,
  },
  detail: {
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
    textAlign: "center",
  },
  bold: { fontWeight: "700", color: "#333" },
  hl: { color: "#0D5C3A", fontWeight: "700" },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(13, 92, 58, 0.08)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    marginTop: 12,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  timeText: {
    fontSize: 11,
    color: "#CCC",
    marginTop: 8,
  },
});