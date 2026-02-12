/**
 * FeedLeagueResultCard Component
 *
 * Renders a league week result inside a feed post.
 * Shows:
 * - Week winner with score
 * - Top 3 overall standings
 * - "View Full Results" button → navigates to league page
 *
 * All data is denormalized on the thought doc — no Firestore fetches.
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { soundPlayer } from "@/utils/soundPlayer";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface StandingEntry {
  rank: number;
  name: string;
  userId?: string;
  points: number;
  netScore?: number;
}

interface LeagueResultData {
  leagueId: string;
  leagueName: string;
  leagueAvatar?: string | null;
  week: number;
  totalWeeks: number;
  format: string;
  isElevated: boolean;
  prizeAwarded: number;
  currency?: string;
  winnerId?: string | null;
  winnerName: string;
  winnerAvatar?: string | null;
  winnerScore?: number | null;
  winnerCourseName?: string | null;
  standings: StandingEntry[];
}

interface FeedLeagueResultCardProps {
  leagueResult: LeagueResultData;
}

/* ================================================================ */
/* HELPERS                                                          */
/* ================================================================ */

const RANK_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"]; // Gold, Silver, Bronze
const RANK_LABELS = ["1st", "2nd", "3rd"];

/* ================================================================ */
/* COMPONENT                                                        */
/* ================================================================ */

export default function FeedLeagueResultCard({
  leagueResult,
}: FeedLeagueResultCardProps) {
  const router = useRouter();

  const {
    leagueId,
    leagueName,
    week,
    totalWeeks,
    format,
    isElevated,
    prizeAwarded,
    currency,
    winnerName,
    winnerAvatar,
    winnerScore,
    winnerCourseName,
    standings,
  } = leagueResult;

  const handleViewLeague = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/leagues/${leagueId}`);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="trophy" size={18} color="#FFD700" />
          <Text style={styles.weekLabel}>
            {isElevated ? "🏅 " : ""}Week {week}
            {totalWeeks > 0 ? ` of ${totalWeeks}` : ""}
          </Text>
        </View>
        {prizeAwarded > 0 && (
          <View style={styles.prizeBadge}>
            <Text style={styles.prizeText}>
              💰 ${prizeAwarded.toLocaleString()}
            </Text>
          </View>
        )}
      </View>

      {/* Winner Section */}
      <View style={styles.winnerSection}>
        <View style={styles.winnerRow}>
          {winnerAvatar ? (
            <Image source={{ uri: winnerAvatar }} style={styles.winnerAvatar} />
          ) : (
            <View style={styles.winnerAvatarPlaceholder}>
              <Text style={styles.winnerAvatarText}>
                {winnerName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.winnerInfo}>
            <Text style={styles.winnerName}>{winnerName}</Text>
            <Text style={styles.winnerDetails}>
              {winnerScore != null ? `${winnerScore} net` : "Winner"}
              {winnerCourseName ? ` · ${winnerCourseName}` : ""}
            </Text>
          </View>
          <View style={styles.winnerBadge}>
            <Ionicons name="ribbon" size={20} color="#FFD700" />
          </View>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Standings - Top 3 */}
      {standings.length > 0 && (
        <View style={styles.standingsSection}>
          <Text style={styles.standingsTitle}>Overall Standings</Text>
          {standings.map((entry, index) => (
            <View key={index} style={styles.standingRow}>
              <View
                style={[
                  styles.rankBadge,
                  { backgroundColor: RANK_COLORS[index] || "#E0E0E0" },
                ]}
              >
                <Text style={styles.rankText}>{RANK_LABELS[index] || `${entry.rank}`}</Text>
              </View>
              <Text style={styles.standingName} numberOfLines={1}>
                {entry.name}
              </Text>
              <Text style={styles.standingPoints}>
                {entry.points} {entry.points === 1 ? "pt" : "pts"}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* View Full Results Button */}
      <TouchableOpacity
        style={styles.viewButton}
        onPress={handleViewLeague}
        activeOpacity={0.7}
      >
        <Text style={styles.viewButtonText}>View Full Results</Text>
        <Ionicons name="chevron-forward" size={16} color="#0D5C3A" />
      </TouchableOpacity>
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },

  /* Header */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  weekLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  },
  prizeBadge: {
    backgroundColor: "#FFF8E1",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFE082",
  },
  prizeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#F57F17",
  },

  /* Winner */
  winnerSection: {
    backgroundColor: "#F1F8E9",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  winnerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  winnerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  winnerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  winnerAvatarText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },
  winnerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  winnerName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0D5C3A",
  },
  winnerDetails: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  winnerBadge: {
    marginLeft: 8,
  },

  /* Divider */
  divider: {
    height: 1,
    backgroundColor: "#E8E8E8",
    marginBottom: 12,
  },

  /* Standings */
  standingsSection: {
    marginBottom: 12,
  },
  standingsTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  standingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  rankBadge: {
    width: 36,
    paddingVertical: 3,
    borderRadius: 6,
    alignItems: "center",
    marginRight: 10,
  },
  rankText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFF",
  },
  standingName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  standingPoints: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    minWidth: 50,
    textAlign: "right",
  },

  /* View Button */
  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
  },
});