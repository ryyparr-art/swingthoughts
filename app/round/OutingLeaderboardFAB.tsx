/**
 * OutingLeaderboardFAB — Floating broadcast-style leaderboard
 *
 * Inspired by The Open Championship TV graphics: a compact vertical
 * panel anchored bottom-right showing the top 4-5 players with
 * position, name, and score-to-par. Tapping opens the full
 * OutingLeaderboard as a bottom sheet modal.
 *
 * Usage: Overlay on LiveRoundViewer when round has an outingId.
 *   <OutingLeaderboardFAB outingId="abc123" />
 *
 * Placement: app/round/[roundId].tsx as a sibling to LiveRoundViewer,
 * absolutely positioned. Does NOT modify LiveRoundViewer at all.
 *
 * File: components/outings/OutingLeaderboardFAB.tsx
 */

import OutingLeaderboard from "@/components/outings/OutingLeaderboard";
import { auth } from "@/constants/firebaseConfig";
import { useOuting } from "@/hooks/useOuting";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
    Dimensions,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const GREEN = "#0D5C3A";
const HEADER_GREEN = "#147A52";
const GOLD = "#C5A55A";
const WALNUT = "#4A3628";

const FAB_PLAYER_COUNT = 5;

function formatScoreToPar(score: number): string {
  if (score === 0) return "E";
  if (score > 0) return `+${score}`;
  return `${score}`;
}

interface OutingLeaderboardFABProps {
  outingId: string;
}

export default function OutingLeaderboardFAB({ outingId }: OutingLeaderboardFABProps) {
  const insets = useSafeAreaInsets();
  const currentUserId = auth.currentUser?.uid;
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);

  const { outing, leaderboard, loading } = useOuting(outingId);

  // Don't render if no outing or still loading
  if (loading || !outing || leaderboard.length === 0) return null;

  // Get top N players who have started (thru > 0)
  const activePlayers = leaderboard.filter((e) => e.thru > 0);
  const fabEntries = activePlayers.slice(0, FAB_PLAYER_COUNT);

  // Find current user's position if not in top N
  const currentUserEntry = leaderboard.find((e) => e.playerId === currentUserId);
  const currentUserInFab = fabEntries.some((e) => e.playerId === currentUserId);

  if (fabEntries.length === 0) return null;

  const handleOpen = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowFullLeaderboard(true);
  };

  const handleClose = () => {
    soundPlayer.play("click");
    setShowFullLeaderboard(false);
  };

  return (
    <>
      {/* ═══ FAB Panel ═══ */}
      <TouchableOpacity
        style={[s.fab, { bottom: 90 + insets.bottom }]}
        activeOpacity={0.85}
        onPress={handleOpen}
      >
        {/* Header strip */}
        <View style={s.fabHeader}>
          <Ionicons name="trophy" size={11} color="#FFF" />
          <Text style={s.fabHeaderText}>
            {outing.status === "complete" ? "Final" : "Live"}
          </Text>
        </View>

        {/* Player rows */}
        {fabEntries.map((entry) => {
          const isCurrentUser = entry.playerId === currentUserId;
          return (
            <View
              key={entry.playerId}
              style={[s.fabRow, isCurrentUser && s.fabRowHighlighted]}
            >
              <Text style={[s.fabPos, isCurrentUser && s.fabTextHighlighted]}>
                {entry.position}
              </Text>
              <Text
                style={[s.fabName, isCurrentUser && s.fabTextHighlighted]}
                numberOfLines={1}
              >
                {entry.displayName.toUpperCase()}
              </Text>
              <Text style={[s.fabScore, isCurrentUser && s.fabTextHighlighted]}>
                {formatScoreToPar(entry.scoreToPar)}
              </Text>
            </View>
          );
        })}

        {/* Show current user at bottom if not in top N */}
        {!currentUserInFab && currentUserEntry && currentUserEntry.thru > 0 && (
          <>
            <View style={s.fabDivider} />
            <View style={[s.fabRow, s.fabRowHighlighted]}>
              <Text style={[s.fabPos, s.fabTextHighlighted]}>
                {currentUserEntry.position}
              </Text>
              <Text
                style={[s.fabName, s.fabTextHighlighted]}
                numberOfLines={1}
              >
                {currentUserEntry.displayName.toUpperCase()}
              </Text>
              <Text style={[s.fabScore, s.fabTextHighlighted]}>
                {formatScoreToPar(currentUserEntry.scoreToPar)}
              </Text>
            </View>
          </>
        )}
      </TouchableOpacity>

      {/* ═══ Full Leaderboard Modal ═══ */}
      <Modal
        visible={showFullLeaderboard}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
      >
        <Pressable style={s.modalBackdrop} onPress={handleClose}>
          <Pressable
            style={[s.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <View style={s.modalHeader}>
              <View style={s.modalHandle} />
            </View>

            <View style={s.modalTitleRow}>
              <View style={s.modalTitleLeft}>
                <Ionicons name="trophy" size={20} color={GOLD} />
                <View>
                  <Text style={s.modalTitle}>
                    {outing.status === "complete" ? "Final Leaderboard" : "Live Leaderboard"}
                  </Text>
                  <Text style={s.modalSubtitle}>
                    {outing.courseName} • {leaderboard.length} Players
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            {/* Group progress chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.groupChipsRow}
            >
              {outing.groups.map((group) => {
                const isComplete = group.status === "complete";
                const isLive = group.status === "live";
                return (
                  <View key={group.groupId} style={s.groupChip}>
                    <Text style={s.groupChipName}>{group.name}</Text>
                    <View style={s.groupChipStatusRow}>
                      {isLive && <View style={s.liveDotSmall} />}
                      {isComplete && <Ionicons name="checkmark-circle" size={12} color={GREEN} />}
                      <Text style={[s.groupChipStatus, isComplete && { color: GREEN }]}>
                        {isComplete ? "Done" : isLive ? "Live" : "Pending"}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Full leaderboard */}
            <ScrollView
              style={s.modalLeaderboard}
              showsVerticalScrollIndicator={false}
            >
              <OutingLeaderboard
                entries={leaderboard}
                formatId={outing.formatId}
                highlightPlayerId={currentUserId}
                isComplete={outing.status === "complete"}
                showHeader={false}
              />
              <View style={{ height: 20 }} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  // ═══ FAB ═══
  fab: {
    position: "absolute",
    right: 12,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: GREEN,
    minWidth: 160,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  fabHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 6,
    backgroundColor: WALNUT,
  },
  fabHeaderText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFF",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  fabRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  fabRowHighlighted: {
    backgroundColor: "rgba(197,165,90,0.2)",
  },
  fabDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginHorizontal: 8,
  },
  fabPos: {
    width: 20,
    fontSize: 12,
    fontWeight: "800",
    color: "rgba(255,255,255,0.7)",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  fabName: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#FFF",
    letterSpacing: 0.3,
    marginRight: 8,
  },
  fabScore: {
    fontSize: 12,
    fontWeight: "800",
    color: GOLD,
    minWidth: 28,
    textAlign: "right",
  },
  fabTextHighlighted: {
    color: GOLD,
  },

  // ═══ Modal ═══
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: Dimensions.get("window").height * 0.85,
  },
  modalHeader: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
  },
  modalTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  modalTitleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: WALNUT,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#999",
    marginTop: 2,
  },

  // Group chips
  groupChipsRow: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    gap: 8,
  },
  groupChip: {
    backgroundColor: "#FAFAF5",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E8E4DA",
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    minWidth: 80,
  },
  groupChipName: {
    fontSize: 12,
    fontWeight: "700",
    color: WALNUT,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  groupChipStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  groupChipStatus: {
    fontSize: 11,
    fontWeight: "600",
    color: "#999",
  },
  liveDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4CAF50",
  },

  // Leaderboard scroll
  modalLeaderboard: {
    paddingHorizontal: 16,
  },
});