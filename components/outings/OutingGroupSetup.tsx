/**
 * OutingGroupSetup — Roster builder + group assignment + marker designation
 *
 * This is the main setup screen for outings. It replaces GroupSetup when
 * the user toggles to "Group Outing" mode.
 *
 * File: components/outings/OutingGroupSetup.tsx
 *
 * STUB — Implementation in Phase 2
 */

import type { TeeOption } from "@/components/leagues/post-score/types";
import type { OutingGroup, OutingPlayer } from "@/constants/outingTypes";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export interface OutingGroupSetupProps {
  /** Current user (organizer) info */
  organizer: {
    userId: string;
    displayName: string;
    avatar?: string;
    handicapIndex: number;
  };
  /** Course info */
  courseId: number;
  courseName: string;
  holeCount: 9 | 18;
  nineHoleSide?: "front" | "back";
  /** Available tees for the course */
  availableTees: TeeOption[];
  /** Format ID */
  formatId: string;
  /** Called when setup is confirmed — passes roster and groups */
  onConfirm: (roster: OutingPlayer[], groups: OutingGroup[]) => void;
  /** Called when user taps back (returns to foursome mode) */
  onBack: () => void;
}

export default function OutingGroupSetup(_props: OutingGroupSetupProps) {
  // TODO: Phase 2 implementation
  // - Roster builder (search, ghost, import from partners)
  // - Group size selector
  // - Auto-assign button
  // - Group cards with drag-to-reorder
  // - Per-group starting hole picker
  // - Shotgun assign button
  // - Player cap indicator
  return (
    <View style={styles.container}>
      <Text>OutingGroupSetup stub</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});