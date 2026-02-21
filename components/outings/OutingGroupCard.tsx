/**
 * OutingGroupCard — Displays a single group with players, marker badge, and starting hole
 *
 * Reused in: OutingGroupSetup, OutingReview, OutingDashboard
 *
 * File: components/outings/OutingGroupCard.tsx
 *
 * STUB — Implementation in Phase 2
 */

import type { OutingGroup, OutingPlayer } from "@/constants/outingTypes";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export interface OutingGroupCardProps {
  group: OutingGroup;
  /** Players in this group (pre-filtered from roster) */
  players: OutingPlayer[];
  /** Display mode affects which controls are shown */
  mode: "setup" | "review" | "dashboard";
  /** Callback when marker is tapped (setup mode only) */
  onReassignMarker?: (groupId: string, playerId: string) => void;
  /** Callback when starting hole is changed (setup mode only) */
  onStartingHoleChange?: (groupId: string, hole: number) => void;
  /** Callback when group card is tapped (dashboard mode only) */
  onGroupTap?: (groupId: string, roundId: string) => void;
  /** Holes completed / total (dashboard mode only) */
  holesCompleted?: number;
  totalHoles?: number;
}

export default function OutingGroupCard(_props: OutingGroupCardProps) {
  // TODO: Phase 2 implementation
  return (
    <View style={styles.container}>
      <Text>OutingGroupCard stub</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});