/**
 * LiveOnCourseInsert
 *
 * Feed slot 0 component. Renders a horizontally scrollable row of
 * LivePlayerCard items with a section label.
 *
 * Returns null when the players array is empty — the caller
 * (clubhouse feed builder) should also guard on this, but this
 * component is safe to render unconditionally.
 *
 * File: components/feed/LiveOnCourseInsert.tsx
 */

import type { LiveOnCourseInsert as LiveOnCourseInsertType } from "@/utils/feedInsertTypes";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import LivePlayerCard from "./LivePlayerCard";

const GREEN = "#0D5C3A";
const HEADER_GREEN = "#147A52";
const CREAM = "#F4EED8";

interface Props {
  insert: LiveOnCourseInsertType;
}

export default function LiveOnCourseInsert({ insert }: Props) {
  if (!insert.players || insert.players.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="radio-outline" size={15} color={HEADER_GREEN} />
          <Text style={styles.headerTitle}>Live on Course</Text>
        </View>
        <Text style={styles.headerCount}>
          {insert.players.length} active{" "}
          {insert.players.length === 1 ? "round" : "rounds"}
        </Text>
      </View>

      {/* Horizontal card scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {insert.players.map((player) => (
          <LivePlayerCard key={player.roundId} player={player} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EDE9E0",
    paddingBottom: 14,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: GREEN,
    letterSpacing: 0.3,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  headerCount: {
    fontSize: 11,
    fontWeight: "600",
    color: "#999",
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingRight: 6,
  },
});