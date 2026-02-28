/**
 * RivalryNudgeCard
 *
 * Renders a single rivalry nudge inside the feed discovery carousel.
 * Used when DiscoveryInsert.subtype === "rivalry_nudges".
 *
 * Shows: emoji + message + rival avatar + rival first name
 * Tap → navigates to rival's locker.
 *
 * INTEGRATION:
 * In your FeedDiscoveryCarousel (or wherever you render discovery items),
 * add a case for subtype "rivalry_nudges":
 *
 *   case "rivalry_nudges":
 *     return (
 *       <RivalryNudgeCard
 *         item={item as DiscoveryRivalryNudgeItem}
 *         onPress={() => router.push(`/locker/${item.rivalUserId}`)}
 *       />
 *     );
 */

import { Image as ExpoImage } from "expo-image";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface RivalryNudgeItem {
  id: string;
  rivalryId: string;
  rivalUserId: string;
  rivalName: string;
  rivalAvatar?: string | null;
  message: string;
  emoji: string;
}

interface Props {
  item: RivalryNudgeItem;
  onPress: () => void;
}

export default function RivalryNudgeCard({ item, onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Rival avatar */}
      <View style={styles.avatarContainer}>
        {item.rivalAvatar ? (
          <ExpoImage
            source={{ uri: item.rivalAvatar }}
            style={styles.avatar}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarLetter}>
              {item.rivalName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      {/* Emoji + message */}
      <Text style={styles.emoji}>{item.emoji}</Text>
      <Text style={styles.message} numberOfLines={2}>
        {item.message}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 14,
    width: 160,
    alignItems: "center",
    gap: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#E53935",
  },
  avatarContainer: {
    marginBottom: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(229, 57, 53, 0.4)",
  },
  avatarFallback: {
    backgroundColor: "rgba(229, 57, 53, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },
  emoji: {
    fontSize: 20,
  },
  message: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    lineHeight: 16,
  },
});