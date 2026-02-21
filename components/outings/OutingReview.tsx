/**
 * OutingReview — Pre-launch review screen with summary and launch button
 *
 * File: components/outings/OutingReview.tsx
 *
 * STUB — Implementation in Phase 3
 */

import type { OutingGroup, OutingPlayer } from "@/constants/outingTypes";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export interface OutingReviewProps {
  /** Course info */
  courseName: string;
  holeCount: 9 | 18;
  formatId: string;
  /** Roster and groups from setup */
  roster: OutingPlayer[];
  groups: OutingGroup[];
  /** Called when organizer taps "Launch Outing" */
  onLaunch: () => void;
  /** Called when user taps back to edit */
  onBack: () => void;
}

export default function OutingReview(_props: OutingReviewProps) {
  // TODO: Phase 3 implementation
  // - Outing summary (course, format, holes, player count, group count)
  // - Scrollable group list using OutingGroupCard mode="review"
  // - Validation warnings via validateOutingSetup()
  // - "Launch Outing" button
  return (
    <View style={styles.container}>
      <Text>OutingReview stub</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});