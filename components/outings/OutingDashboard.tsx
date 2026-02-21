/**
 * OutingDashboard — Master leaderboard + group progress cards
 *
 * The organizer's main view after launch. Also accessible by
 * any participant or spectator.
 *
 * File: components/outings/OutingDashboard.tsx
 *
 * STUB — Implementation in Phase 4
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

export interface OutingDashboardProps {
  outingId: string;
}

export default function OutingDashboard(_props: OutingDashboardProps) {
  // TODO: Phase 4 implementation
  // - useOuting() hook for real-time data
  // - OutingLeaderboard component
  // - OutingGroupCard mode="dashboard" for each group
  // - Organizer actions (message markers, reassign, end early)
  return (
    <View style={styles.container}>
      <Text>OutingDashboard stub</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});