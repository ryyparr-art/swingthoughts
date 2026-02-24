/**
 * OutingLeaderboard — Cross-group unified leaderboard
 *
 * Renders all players across all groups sorted by net score.
 * Shows position, player info, group label, score, and thru count.
 * Highlights the current user's row.
 *
 * Reusable: embedded in LiveRoundViewer for outing rounds,
 * OutingDashboard, and post-outing summary.
 *
 * File: components/outings/OutingLeaderboard.tsx
 */

import React from "react";
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OutingLeaderboardEntry } from "@/constants/outingTypes";

const GREEN = "#0D5C3A";
const HEADER_GREEN = "#147A52";
const GOLD = "#C5A55A";
const WALNUT = "#4A3628";

// Comprehensive format display names
const FORMAT_NAMES: Record<string, string> = {
  stroke_play: "Stroke Play",
  individual_stableford: "Stableford",
  stableford: "Stableford",
  par_bogey: "Par/Bogey",
  match_play: "Match Play",
  best_ball: "Best Ball",
  scramble: "Scramble",
  skins: "Skins",
};

function getFormatDisplayName(formatId: string): string {
  if (FORMAT_NAMES[formatId]) return FORMAT_NAMES[formatId];
  return formatId.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function formatScoreToPar(score: number): string {
  if (score === 0) return "E";
  if (score > 0) return `+${score}`;
  return `${score}`;
}

function getPositionDisplay(position: number): string {
  if (position === 0) return "-";
  if (position === 1) return "1st";
  if (position === 2) return "2nd";
  if (position === 3) return "3rd";
  return `${position}th`;
}

export interface OutingLeaderboardProps {
  entries: OutingLeaderboardEntry[];
  formatId: string;
  highlightPlayerId?: string;
  isComplete?: boolean;
  /** Compact mode for embedding in LiveRoundViewer */
  compact?: boolean;
  /** Show header with title */
  showHeader?: boolean;
  title?: string;
}

export default function OutingLeaderboard({
  entries,
  formatId,
  highlightPlayerId,
  isComplete = false,
  compact = false,
  showHeader = true,
  title,
}: OutingLeaderboardProps) {
  if (entries.length === 0) {
    return (
      <View style={s.emptyContainer}>
        <Ionicons name="stats-chart-outline" size={32} color="#CCC" />
        <Text style={s.emptyText}>No scores yet</Text>
      </View>
    );
  }

  const headerTitle = title || (isComplete ? "Final Leaderboard" : "Live Leaderboard");
  const formatName = getFormatDisplayName(formatId);

  return (
    <View style={s.container}>
      {showHeader && (
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Ionicons
              name={isComplete ? "trophy" : "stats-chart"}
              size={18}
              color={isComplete ? GOLD : HEADER_GREEN}
            />
            <Text style={s.headerTitle}>{headerTitle}</Text>
          </View>
          <Text style={s.headerFormat}>{formatName}</Text>
        </View>
      )}

      {/* Column labels */}
      <View style={s.columnLabels}>
        <Text style={[s.colLabel, { width: 36 }]}>Pos</Text>
        <Text style={[s.colLabel, { flex: 1 }]}>Player</Text>
        <Text style={[s.colLabel, { width: 50, textAlign: "center" }]}>Gross</Text>
        <Text style={[s.colLabel, { width: 50, textAlign: "center" }]}>Net</Text>
        <Text style={[s.colLabel, { width: 44, textAlign: "right" }]}>Thru</Text>
      </View>

      {/* Entries */}
      <ScrollView
        style={compact ? s.compactScroll : undefined}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {entries.map((entry, index) => {
          const isHighlighted = entry.playerId === highlightPlayerId;
          const isTop3 = entry.position >= 1 && entry.position <= 3 && entry.thru > 0;
          const isNotStarted = entry.thru === 0;

          return (
            <View
              key={`${entry.playerId}-${entry.groupId}`}
              style={[
                s.row,
                isHighlighted && s.rowHighlighted,
                index === entries.length - 1 && s.rowLast,
              ]}
            >
              {/* Position */}
              <View style={s.posCol}>
                {isNotStarted ? (
                  <Text style={s.posTextDim}>-</Text>
                ) : isTop3 ? (
                  <View style={[s.posBadge, entry.position === 1 && s.posBadgeGold, entry.position === 2 && s.posBadgeSilver, entry.position === 3 && s.posBadgeBronze]}>
                    <Text style={s.posBadgeText}>{entry.position}</Text>
                  </View>
                ) : (
                  <Text style={s.posText}>{entry.position}</Text>
                )}
              </View>

              {/* Player info */}
              <View style={s.playerCol}>
                <View style={s.playerRow}>
                  {entry.avatar ? (
                    <Image source={{ uri: entry.avatar }} style={s.avatar} />
                  ) : (
                    <View style={[s.avatar, s.avatarFallback]}>
                      <Text style={s.avatarText}>
                        {entry.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={s.playerInfo}>
                    <Text
                      style={[s.playerName, isHighlighted && s.playerNameHighlighted]}
                      numberOfLines={1}
                    >
                      {entry.displayName}
                    </Text>
                    <Text style={s.groupLabel}>{entry.groupName}</Text>
                  </View>
                </View>
              </View>

              {/* Gross */}
              <View style={s.scoreCol}>
                {isNotStarted ? (
                  <Text style={s.scoreDim}>-</Text>
                ) : (
                  <Text style={s.scoreText}>{entry.grossScore}</Text>
                )}
              </View>

              {/* Net + to par */}
              <View style={s.scoreCol}>
                {isNotStarted ? (
                  <Text style={s.scoreDim}>-</Text>
                ) : (
                  <View style={s.netBlock}>
                    <Text style={[s.scoreText, s.scoreTextBold]}>{entry.netScore}</Text>
                    <Text style={[
                      s.toParText,
                      entry.scoreToPar < 0 && s.toParUnder,
                      entry.scoreToPar > 0 && s.toParOver,
                      entry.scoreToPar === 0 && s.toParEven,
                    ]}>
                      {formatScoreToPar(entry.scoreToPar)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Thru */}
              <View style={s.thruCol}>
                {isNotStarted ? (
                  <Text style={s.scoreDim}>-</Text>
                ) : entry.thru >= (entries[0]?.thru || 18) && isComplete ? (
                  <Ionicons name="checkmark-circle" size={16} color={GREEN} />
                ) : (
                  <Text style={s.thruText}>{entry.thru}</Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8E4DA",
    overflow: "hidden",
  },
  emptyContainer: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8E4DA",
    padding: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyText: { fontSize: 14, color: "#999" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E4DA",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: WALNUT,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  headerFormat: { fontSize: 12, color: "#999", fontWeight: "600" },
  columnLabels: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#FAFAF5",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E4DA",
  },
  colLabel: { fontSize: 11, fontWeight: "600", color: "#999", textTransform: "uppercase", letterSpacing: 0.5 },
  compactScroll: { maxHeight: 320 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F0EDE4",
  },
  rowHighlighted: { backgroundColor: "rgba(13,92,58,0.04)" },
  rowLast: { borderBottomWidth: 0 },

  // Position column
  posCol: { width: 36, alignItems: "center" },
  posText: { fontSize: 15, fontWeight: "700", color: "#999" },
  posTextDim: { fontSize: 14, color: "#DDD" },
  posBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
  },
  posBadgeGold: { backgroundColor: "#FFD700" },
  posBadgeSilver: { backgroundColor: "#C0C0C0" },
  posBadgeBronze: { backgroundColor: "#CD7F32" },
  posBadgeText: { fontSize: 13, fontWeight: "800", color: "#FFF" },

  // Player column
  playerCol: { flex: 1, paddingHorizontal: 8 },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 30, height: 30, borderRadius: 15 },
  avatarFallback: { backgroundColor: "#E8F5E9", justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 12, fontWeight: "700", color: GREEN },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 14, fontWeight: "600", color: "#333", flexShrink: 1 },
  playerNameHighlighted: { color: GREEN, fontWeight: "700" },
  groupLabel: { fontSize: 11, color: "#999", marginTop: 1 },

  // Score columns
  scoreCol: { width: 50, alignItems: "center" },
  scoreText: { fontSize: 15, fontWeight: "600", color: "#333" },
  scoreTextBold: { fontWeight: "700" },
  scoreDim: { fontSize: 14, color: "#DDD" },
  netBlock: { alignItems: "center" },
  toParText: { fontSize: 10, fontWeight: "600", marginTop: 1 },
  toParUnder: { color: "#E53935" },
  toParOver: { color: "#333" },
  toParEven: { color: GREEN },

  // Thru column
  thruCol: { width: 44, alignItems: "flex-end" },
  thruText: { fontSize: 14, fontWeight: "600", color: "#666" },
});