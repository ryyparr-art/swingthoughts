/**
 * ProfileRoundCard — Full-width round activity card for the profile "Rounds" tab.
 *
 * Reuses the same visual language as FeedActivityCarousel's RoundCompleteContent
 * but rendered as a standalone full-width card instead of a carousel item.
 *
 * File: components/profile/ProfileRoundCard.tsx
 */

import type { ProfileRound } from "@/app/profile/[userId]";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

// ============================================================================
// CONSTANTS
// ============================================================================

const GREEN = "#0D5C3A";
const GOLD = "#C5A55A";

const FORMAT_LABELS: Record<string, string> = {
  stroke_play: "Stroke Play",
  individual_stableford: "Stableford",
  par_bogey: "Par/Bogey",
  match_play: "Match Play",
  four_ball: "Four-Ball",
  foursomes: "Foursomes",
  scramble: "Scramble",
  best_ball: "Best Ball",
  skins: "Skins",
  nassau: "Nassau",
};

// ============================================================================
// HELPERS
// ============================================================================

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;

  const date = new Date(timestamp);
  const month = date.toLocaleString("default", { month: "short" });
  const day = date.getDate();
  return `${month} ${day}`;
}

function scoreToParLabel(stp: number): string {
  if (stp === 0) return "E";
  return stp > 0 ? `+${stp}` : `${stp}`;
}

function Avatar({
  uri,
  name,
  size = 36,
}: {
  uri?: string | null;
  name: string;
  size?: number;
}) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: GREEN,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#FFF", fontWeight: "700", fontSize: size * 0.4 }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

interface Props {
  round: ProfileRound;
  onPress: () => void;
}

export default function ProfileRoundCard({ round, onPress }: Props) {
  const isSolo = round.playerCount === 1;
  const topPlayers = round.playerSummaries.slice(0, 4);

  // Build header names (same logic as FeedActivityCarousel)
  const headerText = (() => {
    if (isSolo) return round.displayName;

    const winner = round.playerSummaries[0];
    const winnerIsDifferent =
      winner && winner.displayName !== round.displayName;
    const othersCount = round.playerCount - (winnerIsDifferent ? 2 : 1);

    if (!winnerIsDifferent) {
      return `${round.displayName} and ${othersCount} other${othersCount !== 1 ? "s" : ""}`;
    }
    if (othersCount === 0) {
      return `${round.displayName} and ${winner.displayName}`;
    }
    return `${round.displayName}, ${winner.displayName} and ${othersCount} other${othersCount !== 1 ? "s" : ""}`;
  })();

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.8}
      onPress={onPress}
    >
      {/* Type label */}
      <View style={s.typeRow}>
        <View style={s.typeDot} />
        <Text style={s.typeLabel}>ROUND POSTED</Text>
        <View style={{ flex: 1 }} />
        <Text style={s.timeText}>{formatTime(round.timestamp)}</Text>
      </View>

      {/* Header: avatar + course */}
      <View style={s.headerRow}>
        <Avatar uri={round.avatar} name={round.displayName} />
        <View style={s.headerBody}>
          <Text style={s.headerText} numberOfLines={2}>
            {headerText}
            <Text style={s.headerTextLight}> played </Text>
            <Text style={s.courseName}>{round.courseName}</Text>
          </Text>
          <Text style={s.metaText}>
            {round.holeCount} holes • {FORMAT_LABELS[round.formatId] || round.formatId}
            {round.isSimulator ? " • Sim" : ""}
          </Text>
        </View>
        {round.roundImageUrl ? (
          <Image source={{ uri: round.roundImageUrl }} style={s.thumbImage} />
        ) : (
          <View style={s.accentGolf}>
            <Text style={{ fontSize: 16 }}>⛳</Text>
          </View>
        )}
      </View>

      {/* Scoreboard */}
      <View style={s.scoreboard}>
        {/* Header row */}
        <View style={s.scoreRow}>
          <Text style={[s.scoreColPlayer, s.scoreHeader]}>PLAYER</Text>
          <Text style={[s.scoreColNum, s.scoreHeader]}>GRS</Text>
          <Text style={[s.scoreColNum, s.scoreHeader]}>NET</Text>
          <Text style={[s.scoreColNum, s.scoreHeader]}>+/-</Text>
        </View>
        {/* Player rows */}
        {topPlayers.map((p, i) => {
          const isWinner = i === 0 && round.playerCount > 1;
          return (
            <View key={p.playerId} style={s.scoreRow}>
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {isWinner && <Text style={{ fontSize: 10 }}>🏆</Text>}
                <Text
                  style={[s.playerName, isWinner && { color: GOLD }]}
                  numberOfLines={1}
                >
                  {p.displayName}
                </Text>
              </View>
              <Text style={[s.scoreColNum, s.scoreVal]}>{p.grossScore}</Text>
              <Text
                style={[
                  s.scoreColNum,
                  s.scoreVal,
                  isWinner && { color: GOLD },
                ]}
              >
                {p.netScore}
              </Text>
              <Text style={[s.scoreColNum, s.scoreValPar]}>
                {scoreToParLabel(p.scoreToPar)}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Description */}
      {round.roundDescription ? (
        <Text style={s.description} numberOfLines={2}>
          {round.roundDescription}
        </Text>
      ) : null}

      {/* Tap hint */}
      <View style={s.tapHint}>
        <Text style={s.tapHintText}>Tap to view scorecard</Text>
        <Ionicons name="chevron-forward" size={12} color="#BBB" />
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const s = StyleSheet.create({
  card: {
    backgroundColor: "#FAFAFA",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    borderLeftWidth: 3,
    borderLeftColor: "#147A52",
  },

  // Type row
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  typeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#147A52",
  },
  typeLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#BBB",
  },
  timeText: {
    fontSize: 11,
    color: "#CCC",
  },

  // Header
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerBody: {
    flex: 1,
    minWidth: 0,
  },
  headerText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
    lineHeight: 19,
  },
  headerTextLight: {
    fontWeight: "400",
  },
  courseName: {
    color: GREEN,
    fontWeight: "700",
  },
  metaText: {
    fontSize: 11,
    color: "#CCC",
    marginTop: 2,
  },
  thumbImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  accentGolf: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(13, 92, 58, 0.08)",
    borderWidth: 1.5,
    borderColor: "rgba(13, 92, 58, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Scoreboard
  scoreboard: {
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
  },
  scoreHeader: {
    fontSize: 9,
    fontWeight: "700",
    color: "#BBB",
    letterSpacing: 0.5,
  },
  scoreColPlayer: {
    flex: 1,
  },
  scoreColNum: {
    width: 36,
    textAlign: "center",
  },
  playerName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
    flexShrink: 1,
  },
  scoreVal: {
    fontSize: 12,
    fontWeight: "700",
    color: "#333",
  },
  scoreValPar: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
  },

  // Description
  description: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    lineHeight: 17,
  },

  // Tap hint
  tapHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.04)",
  },
  tapHintText: {
    fontSize: 11,
    color: "#BBB",
    fontWeight: "500",
  },
});