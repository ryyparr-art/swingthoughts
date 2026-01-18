/**
 * LeaderboardCarousel Component
 *
 * Displays a horizontally scrolling carousel of tournament leaderboard players.
 * Styled in the SwingThoughts heritage aesthetic (cream cards, green text).
 *
 * Features:
 * - Auto-scroll: Slow for top 10, faster after
 * - Manual scroll override (pauses auto-scroll)
 * - Position movement indicators (↑↓-)
 * - Player name, position, score, and thru hole
 */

import { LeaderboardPlayer } from "@/hooks/useLeaderboard";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  View
} from "react-native";

// SwingThoughts heritage colors
const COLORS = {
  cream: "#F4EED8",
  deepGreen: "#0D5C3A",
  gold: "#FFD700",
  lightGreen: "#1A7A50",
  white: "#FFFFFF",
  gray: "#666666",
  red: "#D32F2F",
};

interface LeaderboardCarouselProps {
  players: LeaderboardPlayer[];
  isLoading?: boolean;
}

const CARD_WIDTH = 72;
const CARD_MARGIN = 4;
const CARD_TOTAL_WIDTH = CARD_WIDTH + CARD_MARGIN * 2;

// Auto-scroll speeds (pixels per frame at 60fps)
const SLOW_SPEED = 0.5; // For top 10
const FAST_SPEED = 1.5; // After top 10

// ============================================================================
// HELPER: Parse value from MongoDB-style objects
// ============================================================================

const parseValue = (value: any): string => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  // Handle MongoDB Extended JSON format: { $numberInt: "123" } or { $numberLong: "123" }
  if (typeof value === "object") {
    if (value.$numberInt) return value.$numberInt;
    if (value.$numberLong) return value.$numberLong;
  }
  return String(value);
};

export default function LeaderboardCarousel({
  players,
  isLoading = false,
}: LeaderboardCarouselProps) {
  const flatListRef = useRef<FlatList>(null);
  const scrollOffset = useRef(0);
  const isUserScrolling = useRef(false);
  const userScrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationRef = useRef<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Get current scroll speed based on position
  const getCurrentSpeed = useCallback((offset: number): number => {
    const cardIndex = Math.floor(offset / CARD_TOTAL_WIDTH);
    // Slow for first 10 cards, faster after
    return cardIndex < 10 ? SLOW_SPEED : FAST_SPEED;
  }, []);

  // Auto-scroll animation
  useEffect(() => {
    if (players.length === 0 || isPaused || isUserScrolling.current) {
      return;
    }

    const maxScroll = players.length * CARD_TOTAL_WIDTH - 300; // Approximate visible width

    const animate = () => {
      if (isUserScrolling.current || isPaused) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const speed = getCurrentSpeed(scrollOffset.current);
      scrollOffset.current += speed;

      // Loop back to start when reaching the end
      if (scrollOffset.current >= maxScroll) {
        scrollOffset.current = 0;
      }

      flatListRef.current?.scrollToOffset({
        offset: scrollOffset.current,
        animated: false,
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [players.length, isPaused, getCurrentSpeed]);

  // Handle user scroll start
  const handleScrollBegin = () => {
    isUserScrolling.current = true;
    setIsPaused(true);

    // Clear any existing timeout
    if (userScrollTimeout.current) {
      clearTimeout(userScrollTimeout.current);
    }
  };

  // Handle scroll end - resume auto-scroll after delay
  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffset.current = event.nativeEvent.contentOffset.x;

    // Resume auto-scroll after 3 seconds of no interaction
    userScrollTimeout.current = setTimeout(() => {
      isUserScrolling.current = false;
      setIsPaused(false);
    }, 3000);
  };

  // Handle momentum scroll end
  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffset.current = event.nativeEvent.contentOffset.x;
  };

  // Render movement indicator
  const renderMovementIndicator = (movement: LeaderboardPlayer["movement"]) => {
    switch (movement) {
      case "up":
        return <Text style={[styles.movementIcon, styles.movementUp]}>↑</Text>;
      case "down":
        return <Text style={[styles.movementIcon, styles.movementDown]}>↓</Text>;
      case "same":
        return <Text style={[styles.movementIcon, styles.movementSame]}>-</Text>;
      case "new":
        return <Text style={[styles.movementIcon, styles.movementNew]}>●</Text>;
      default:
        return null;
    }
  };

  // Render individual player card
  const renderPlayerCard = ({ item, index }: { item: LeaderboardPlayer; index: number }) => {
    const isLeader = index === 0;

    // Parse all values to handle MongoDB Extended JSON format
    const lastName = parseValue(item.lastName);
    const position = parseValue(item.position);
    const total = parseValue(item.total);
    const thru = parseValue(item.thru);
    const currentRoundScore = parseValue(item.currentRoundScore);

    return (
      <View style={[styles.card, isLeader && styles.leaderCard]}>
        {/* Player Name - Top */}
        <Text style={styles.playerName} numberOfLines={1}>
          {lastName.toUpperCase()}
        </Text>

        {/* Position with movement indicator */}
        <View style={styles.positionRow}>
          <Text style={[styles.position, isLeader && styles.leaderPosition]}>
            {position}
          </Text>
          {renderMovementIndicator(item.movement)}
        </View>

        {/* Score - Center */}
        <Text style={[styles.score, isLeader && styles.leaderScore]}>
          {total}
        </Text>

        {/* Bottom row: Thru */}
        <View style={styles.cardBottomRow}>
          <Text style={styles.thruLabel}>THRU</Text>
          <Text style={styles.thruValue}>{thru}</Text>
        </View>

        {/* Today's score (small) */}
        {currentRoundScore && currentRoundScore !== "-" && (
          <Text style={styles.todayScore}>
            Today: {currentRoundScore}
          </Text>
        )}

        {/* Amateur indicator */}
        {item.isAmateur && (
          <Text style={styles.amateurBadge}>(a)</Text>
        )}
      </View>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={[styles.card, styles.loadingCard]}>
              <View style={styles.loadingPlaceholder} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  // Empty state
  if (players.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Leaderboard data loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Carousel */}
      <FlatList
        ref={flatListRef}
        data={players}
        renderItem={renderPlayerCard}
        keyExtractor={(item) => parseValue(item.playerId)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        onScrollBeginDrag={handleScrollBegin}
        onScrollEndDrag={handleScrollEnd}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={CARD_TOTAL_WIDTH}
        snapToAlignment="start"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.deepGreen,
    paddingVertical: 4,
  },
  listContent: {
    paddingHorizontal: 8,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: COLORS.cream,
    borderRadius: 6,
    padding: 6,
    marginHorizontal: CARD_MARGIN,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
    alignItems: "center",
  },
  leaderCard: {
    borderWidth: 2,
    borderColor: COLORS.gold,
  },
  playerName: {
    fontWeight: "700",
    fontSize: 11,
    color: COLORS.deepGreen,
    textAlign: "center",
    marginBottom: 2,
  },
  positionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  position: {
    fontWeight: "600",
    fontSize: 9,
    color: COLORS.gray,
  },
  leaderPosition: {
    color: COLORS.gold,
  },
  movementIcon: {
    fontSize: 8,
    marginLeft: 2,
  },
  movementUp: {
    color: "#4CAF50",
  },
  movementDown: {
    color: COLORS.red,
  },
  movementSame: {
    color: COLORS.gray,
  },
  movementNew: {
    color: COLORS.gold,
    fontSize: 5,
  },
  score: {
    fontWeight: "800",
    fontSize: 18,
    color: COLORS.deepGreen,
    textAlign: "center",
    marginVertical: 2,
  },
  leaderScore: {
    color: COLORS.deepGreen,
  },
  cardBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  thruLabel: {
    fontSize: 7,
    color: COLORS.gray,
    letterSpacing: 0.5,
  },
  thruValue: {
    fontWeight: "700",
    fontSize: 10,
    color: COLORS.deepGreen,
  },
  todayScore: {
    fontSize: 8,
    color: COLORS.lightGreen,
    textAlign: "center",
    marginTop: 2,
  },
  amateurBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    fontSize: 7,
    color: COLORS.gray,
  },
  loadingContainer: {
    flexDirection: "row",
    paddingHorizontal: 8,
  },
  loadingCard: {
    justifyContent: "center",
    alignItems: "center",
    height: 70,
  },
  loadingPlaceholder: {
    width: "80%",
    height: 40,
    backgroundColor: COLORS.deepGreen,
    opacity: 0.2,
    borderRadius: 4,
  },
  emptyContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.cream,
    opacity: 0.7,
  },
});