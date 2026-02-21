/**
 * OutingLeaderboard — Cross-group leaderboard display
 *
 * Renders the unified leaderboard with player scores, positions,
 * group labels, and thru indicators. Reusable in dashboard and
 * post-outing views.
 *
 * File: components/outings/OutingLeaderboard.tsx
 *
 * STUB — Implementation in Phase 4
 */

import type { OutingLeaderboardEntry } from "@/constants/outingTypes";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export interface OutingLeaderboardProps {
  entries: OutingLeaderboardEntry[];
  formatId: string;
  /** Highlight a specific player (e.g., current user) */
  highlightPlayerId?: string;
  /** Whether the outing is complete (affects display) */
  isComplete?: boolean;
}

export default function OutingLeaderboard(_props: OutingLeaderboardProps) {
  // TODO: Phase 4 implementation
  return (
    <View style={styles.container}>
      <Text>OutingLeaderboard stub</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});