/**
 * RivalryDetailModal
 *
 * Slides up when tapping a rival card in the locker.
 * Shows full head-to-head breakdown:
 *   - Both avatars + names
 *   - Full W-L-T record
 *   - Current & longest streaks
 *   - Belt holder
 *   - Last 10 results as W/L/T dots
 *   - Role label (Nemesis/Threat/Target)
 *   - "View Locker" CTA
 */

import { auth } from "@/constants/firebaseConfig";
import type { RivalRole } from "@/hooks/useRivalries";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Props {
  visible: boolean;
  role: RivalRole | null;
  onClose: () => void;
}

export default function RivalryDetailModal({ visible, role, onClose }: Props) {
  const router = useRouter();

  if (!role) return null;

  const currentUserId = auth.currentUser?.uid;
  const doc = role.rivalryDoc;
  const isPlayerA = doc.playerA.userId === currentUserId;

  const me = isPlayerA ? doc.playerA : doc.playerB;
  const rival = isPlayerA ? doc.playerB : doc.playerA;
  const myWins = role.record.myWins;
  const theirWins = role.record.theirWins;
  const ties = role.record.ties;
  const totalMatches = role.totalMatches;

  // Current streak
  const currentStreak = doc.currentStreak;
  const streakText = (() => {
    if (!currentStreak || currentStreak.count < 2) return null;
    const isMyStreak = currentStreak.playerId === currentUserId;
    if (isMyStreak) {
      return { emoji: "🔥", text: `You've won ${currentStreak.count} straight` };
    }
    return { emoji: "😤", text: `${rival.displayName.split(" ")[0]} has won ${currentStreak.count} straight` };
  })();

  // Longest streak
  const longestStreak = doc.longestStreak;
  const longestText = (() => {
    if (!longestStreak || longestStreak.count < 2) return null;
    const isMine = longestStreak.playerId === currentUserId;
    return `${isMine ? "You" : rival.displayName.split(" ")[0]}: ${longestStreak.count} wins`;
  })();

  // Belt holder
  const beltText = (() => {
    if (!doc.beltHolder) return null;
    const iHoldBelt = doc.beltHolder === currentUserId;
    return iHoldBelt ? "You hold the belt" : `${rival.displayName.split(" ")[0]} holds the belt`;
  })();

  // Recent results (last 10) — from my perspective
  const recentDots = (doc.recentResults || []).slice(0, 10).map((r: any, i: number) => {
    if (r.winnerId === currentUserId) return { key: `r${i}`, result: "W", color: "#0D5C3A" };
    if (r.winnerId === rival.userId) return { key: `r${i}`, result: "L", color: "#E53935" };
    return { key: `r${i}`, result: "T", color: "#999" };
  });

  // Win percentage
  const winPct = totalMatches > 0 ? Math.round((myWins / totalMatches) * 100) : 0;

  // Role color
  const roleColor = (() => {
    switch (role.type) {
      case "nemesis": return "#E53935";
      case "threat": return "#FF9800";
      case "target": return "#C5A55A";
      default: return "#999";
    }
  })();

  const handleViewLocker = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push(`/locker/${rival.userId}` as any);
  };

  const handleClose = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={[styles.rolePill, { backgroundColor: roleColor }]}>
              <Text style={styles.rolePillEmoji}>{role.emoji}</Text>
              <Text style={styles.rolePillText}>{role.label}</Text>
            </View>
          </View>
          <View style={styles.closeBtn} />
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Head-to-Head ── */}
          <View style={styles.h2hSection}>
            {/* Me */}
            <View style={styles.h2hPlayer}>
              <Avatar uri={me.avatar} name={me.displayName} size={56} />
              <Text style={styles.h2hName}>You</Text>
            </View>

            {/* Record */}
            <View style={styles.h2hCenter}>
              <View style={styles.recordRow}>
                <Text style={[styles.recordNum, myWins >= theirWins && styles.recordWinning]}>
                  {myWins}
                </Text>
                <Text style={styles.recordDash}>–</Text>
                <Text style={[styles.recordNum, theirWins >= myWins && styles.recordWinning]}>
                  {theirWins}
                </Text>
              </View>
              {ties > 0 && (
                <Text style={styles.tiesLabel}>
                  {ties} {ties === 1 ? "tie" : "ties"}
                </Text>
              )}
              <Text style={styles.matchCount}>{totalMatches} matches</Text>
            </View>

            {/* Rival */}
            <View style={styles.h2hPlayer}>
              <Avatar uri={rival.avatar} name={rival.displayName} size={56} />
              <Text style={styles.h2hName} numberOfLines={1}>
                {rival.displayName.split(" ")[0]}
              </Text>
            </View>
          </View>

          {/* ── Win Rate Bar ── */}
          <View style={styles.statCard}>
            <Text style={styles.statCardLabel}>WIN RATE</Text>
            <View style={styles.winRateBar}>
              <View
                style={[
                  styles.winRateFill,
                  { width: `${winPct}%` },
                  winPct > 50 && styles.winRateFillGreen,
                  winPct < 50 && styles.winRateFillRed,
                  winPct === 50 && styles.winRateFillNeutral,
                ]}
              />
            </View>
            <View style={styles.winRateLabels}>
              <Text style={styles.winRatePct}>{winPct}%</Text>
              <Text style={styles.winRatePct}>{100 - winPct}%</Text>
            </View>
          </View>

          {/* ── Recent Form ── */}
          {recentDots.length > 0 && (
            <View style={styles.statCard}>
              <Text style={styles.statCardLabel}>RECENT FORM</Text>
              <View style={styles.dotsRow}>
                {recentDots.map((d) => (
                  <View key={d.key} style={[styles.dot, { backgroundColor: d.color }]}>
                    <Text style={styles.dotText}>{d.result}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.dotsCaption}>← most recent</Text>
            </View>
          )}

          {/* ── Streaks & Belt ── */}
          <View style={styles.statsGrid}>
            {/* Current streak */}
            {streakText && (
              <View style={styles.gridItem}>
                <Text style={styles.gridEmoji}>{streakText.emoji}</Text>
                <Text style={styles.gridLabel}>Current Streak</Text>
                <Text style={styles.gridValue}>{streakText.text}</Text>
              </View>
            )}

            {/* Longest streak */}
            {longestText && (
              <View style={styles.gridItem}>
                <Text style={styles.gridEmoji}>📈</Text>
                <Text style={styles.gridLabel}>Longest Streak</Text>
                <Text style={styles.gridValue}>{longestText}</Text>
              </View>
            )}

            {/* Belt */}
            {beltText && (
              <View style={styles.gridItem}>
                <Text style={styles.gridEmoji}>🏅</Text>
                <Text style={styles.gridLabel}>Belt</Text>
                <Text style={styles.gridValue}>{beltText}</Text>
              </View>
            )}
          </View>

          {/* ── View Locker CTA ── */}
          <TouchableOpacity
            style={styles.viewLockerBtn}
            onPress={handleViewLocker}
            activeOpacity={0.8}
          >
            <Ionicons name="person-outline" size={18} color="#FFF" />
            <Text style={styles.viewLockerText}>
              View {rival.displayName.split(" ")[0]}'s Locker
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ============================================================================
// AVATAR
// ============================================================================

function Avatar({
  uri,
  name,
  size,
}: {
  uri?: string | null;
  name: string;
  size: number;
}) {
  if (uri) {
    return (
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
        <ExpoImage
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      </View>
    );
  }
  return (
    <View
      style={[
        styles.avatar,
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarLetter, { fontSize: size * 0.38 }]}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D5C3A",
  },
  scrollArea: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 20,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    alignItems: "center",
  },
  rolePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  rolePillEmoji: {
    fontSize: 14,
  },
  rolePillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFF",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  // Head-to-head
  h2hSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  h2hPlayer: {
    alignItems: "center",
    gap: 8,
    width: 80,
  },
  h2hName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
  },
  h2hCenter: {
    alignItems: "center",
    flex: 1,
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  recordNum: {
    fontSize: 36,
    fontWeight: "800",
    color: "#CCC",
  },
  recordWinning: {
    color: "#0D5C3A",
  },
  recordDash: {
    fontSize: 24,
    fontWeight: "300",
    color: "#DDD",
  },
  tiesLabel: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  matchCount: {
    fontSize: 11,
    color: "#BBB",
    marginTop: 4,
  },

  // Stat card
  statCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    gap: 10,
  },
  statCardLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#BBB",
    letterSpacing: 1,
  },

  // Win rate bar
  winRateBar: {
    height: 8,
    backgroundColor: "#F0F0F0",
    borderRadius: 4,
    overflow: "hidden",
  },
  winRateFill: {
    height: 8,
    borderRadius: 4,
  },
  winRateFillGreen: {
    backgroundColor: "#0D5C3A",
  },
  winRateFillRed: {
    backgroundColor: "#E53935",
  },
  winRateFillNeutral: {
    backgroundColor: "#999",
  },
  winRateLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  winRatePct: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666",
  },

  // Recent form dots
  dotsRow: {
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dotText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFF",
  },
  dotsCaption: {
    fontSize: 10,
    color: "#CCC",
  },

  // Stats grid
  statsGrid: {
    gap: 12,
  },
  gridItem: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E8E8E8",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  gridEmoji: {
    fontSize: 22,
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#999",
    flex: 1,
  },
  gridValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
    flexShrink: 1,
    textAlign: "right",
  },

  // View Locker CTA
  viewLockerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    paddingVertical: 16,
    borderRadius: 14,
  },
  viewLockerText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
  },

  // Avatar
  avatar: {
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.08)",
  },
  avatarFallback: {
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontWeight: "700",
    color: "#FFF",
  },
});