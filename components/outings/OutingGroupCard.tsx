/**
 * OutingGroupCard — Reusable group card for outings
 *
 * Renders a single group's players, marker designation, tee selection,
 * and starting hole. Three modes:
 *   - "setup": Editable — change marker, tee, move players, set starting hole
 *   - "review": Read-only summary before launch
 *   - "dashboard": Live progress with status badges
 *
 * Fixes:
 *   - Clearer "Make Scorer" button (text label, not just icon)
 *   - Move player between groups via swap icon → group picker
 *   - Scorer tee change cascades to all group members (via onScorerTeeChange)
 *
 * File: components/outings/OutingGroupCard.tsx
 */

import { getTeeColor } from "@/components/leagues/post-score/helpers";
import type { TeeOption } from "@/components/leagues/post-score/types";
import type { OutingGroup, OutingPlayer } from "@/constants/outingTypes";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const GREEN = "#0D5C3A";
const HEADER_GREEN = "#147A52";
const GOLD = "#C5A55A";
const WALNUT = "#4A3628";

type CardMode = "setup" | "review" | "dashboard";

interface OutingGroupCardProps {
  group: OutingGroup;
  players: OutingPlayer[];
  mode: CardMode;
  allGroups?: OutingGroup[];
  availableTees?: TeeOption[];
  holeCount?: 9 | 18;
  nineHoleSide?: "front" | "back";

  // Setup mode callbacks
  onMarkerChange?: (groupId: string, newMarkerId: string) => void;
  onStartingHoleChange?: (groupId: string, hole: number) => void;
  onMovePlayer?: (playerId: string, targetGroupId: string) => void;
  onRemovePlayer?: (playerId: string) => void;
  /** Individual player tee change */
  onTeeChange?: (playerId: string, tee: TeeOption) => void;
  /** Scorer tee change — cascades to all group members */
  onScorerTeeChange?: (groupId: string, tee: TeeOption) => void;

  // Dashboard mode data
  holesCompleted?: number;
  totalHoles?: number;
}

export default function OutingGroupCard({
  group,
  players,
  mode,
  allGroups,
  availableTees,
  holeCount = 18,
  nineHoleSide = "front",
  onMarkerChange,
  onStartingHoleChange,
  onMovePlayer,
  onRemovePlayer,
  onTeeChange,
  onScorerTeeChange,
  holesCompleted,
  totalHoles,
}: OutingGroupCardProps) {
  const [showHolePicker, setShowHolePicker] = useState(false);
  const [showMovePicker, setShowMovePicker] = useState<string | null>(null);
  const [showTeePicker, setShowTeePicker] = useState<string | null>(null);

  const isSetup = mode === "setup";
  const isDashboard = mode === "dashboard";

  const statusColor =
    group.status === "complete" ? "#34C759" :
    group.status === "live" ? HEADER_GREEN :
    "#999";

  const statusLabel =
    group.status === "complete" ? "Complete" :
    group.status === "live" ? "Live" :
    "Pending";

  const baseHole = holeCount === 9 && nineHoleSide === "back" ? 10 : 1;
  const holes = Array.from({ length: holeCount }, (_, i) => baseHole + i);

  /** Handle tee selection — if scorer, cascade to group */
  const handleTeeSelect = (playerId: string, tee: TeeOption) => {
    const isScorer = playerId === group.markerId;
    if (isScorer && onScorerTeeChange) {
      onScorerTeeChange(group.groupId, tee);
    } else {
      onTeeChange?.(playerId, tee);
    }
    setShowTeePicker(null);
  };

  return (
    <View style={s.card}>
      {/* Card Header */}
      <View style={s.cardHeader}>
        <View style={s.cardHeaderLeft}>
          <Ionicons name="people" size={18} color={HEADER_GREEN} />
          <Text style={s.groupName}>{group.name}</Text>
          <View style={s.playerCountBadge}>
            <Text style={s.playerCountText}>{players.length}</Text>
          </View>
        </View>
        <View style={s.cardHeaderRight}>
          {isDashboard && (
            <View style={[s.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={s.statusBadgeText}>{statusLabel}</Text>
            </View>
          )}
          {isSetup && (
            <TouchableOpacity
              style={s.holeBtn}
              onPress={() => { soundPlayer.play("click"); setShowHolePicker(true); }}
            >
              <Ionicons name="flag" size={14} color={HEADER_GREEN} />
              <Text style={s.holeBtnText}>Hole {group.startingHole}</Text>
              <Ionicons name="chevron-down" size={14} color="#999" />
            </TouchableOpacity>
          )}
          {!isSetup && (
            <View style={s.holeTag}>
              <Ionicons name="flag" size={12} color={GOLD} />
              <Text style={s.holeTagText}>Hole {group.startingHole}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Dashboard progress bar */}
      {isDashboard && holesCompleted != null && totalHoles != null && (
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${Math.min((holesCompleted / totalHoles) * 100, 100)}%` }]} />
        </View>
      )}

      {/* Players list */}
      <View style={s.playerList}>
        {players.map((player) => {
          const isMarker = player.playerId === group.markerId;
          return (
            <View key={player.playerId} style={s.playerBlock}>
              {/* Player info row */}
              <View style={s.playerRow}>
                <View style={s.playerLeft}>
                  {player.avatar ? (
                    <Image source={{ uri: player.avatar }} style={s.playerAvatar} />
                  ) : (
                    <View style={[s.playerAvatar, s.playerAvatarFallback]}>
                      <Text style={s.playerAvatarText}>
                        {player.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={s.playerInfo}>
                    <View style={s.playerNameRow}>
                      <Text style={s.playerName} numberOfLines={1}>
                        {player.displayName}
                      </Text>
                      {isMarker && (
                        <View style={s.markerBadge}>
                          <Ionicons name="pencil" size={10} color="#FFF" />
                          <Text style={s.markerBadgeText}>Scorer</Text>
                        </View>
                      )}
                      {player.isGhost && (
                        <View style={s.ghostBadge}>
                          <Text style={s.ghostBadgeText}>Guest</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.playerHcp}>
                      HCP {player.handicapIndex.toFixed(1)} → CH {player.courseHandicap}
                    </Text>
                  </View>
                </View>

                {/* Setup mode actions */}
                {isSetup && (
                  <View style={s.playerActions}>
                    {/* Move player to another group */}
                    {allGroups && allGroups.length > 1 && (
                      <TouchableOpacity
                        style={s.actionBtnCompact}
                        onPress={() => {
                          soundPlayer.play("click");
                          setShowMovePicker(player.playerId);
                        }}
                      >
                        <Ionicons name="swap-horizontal-outline" size={16} color="#999" />
                      </TouchableOpacity>
                    )}
                    {/* Remove player from group */}
                    <TouchableOpacity
                      style={s.actionBtnCompact}
                      onPress={() => {
                        soundPlayer.play("click");
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        onRemovePlayer?.(player.playerId);
                      }}
                    >
                      <Ionicons name="close-circle-outline" size={16} color="#CC3333" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Make Scorer button — setup mode, non-ghost, non-current-marker */}
              {isSetup && !isMarker && !player.isGhost && (
                <TouchableOpacity
                  style={s.makeScorerBtn}
                  onPress={() => {
                    soundPlayer.play("click");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onMarkerChange?.(group.groupId, player.playerId);
                  }}
                >
                  <Ionicons name="pencil-outline" size={13} color={HEADER_GREEN} />
                  <Text style={s.makeScorerText}>Make Scorer</Text>
                </TouchableOpacity>
              )}

              {/* Tee row — setup mode: tappable, review mode: read-only */}
              {(isSetup || mode === "review") && player.tee && (
                <TouchableOpacity
                  style={s.teeRow}
                  disabled={!isSetup || !availableTees}
                  activeOpacity={isSetup ? 0.6 : 1}
                  onPress={() => {
                    if (isSetup && availableTees) {
                      soundPlayer.play("click");
                      setShowTeePicker(player.playerId);
                    }
                  }}
                >
                  <View style={s.teeRowLeft}>
                    <View style={[s.teeColorDot, { backgroundColor: getTeeColor(player.teeName) }]} />
                    <Text style={s.teeName}>{player.teeName}</Text>
                    <Text style={s.teeDetails}>
                      {player.tee.total_yards?.toLocaleString()} yds • {player.courseRating?.toFixed(1)}/{player.slopeRating}
                    </Text>
                  </View>
                  {isSetup && (
                    <View style={s.teeRowRight}>
                      {isMarker && <Text style={s.teeGroupHint}>Changes group</Text>}
                      <Ionicons name="chevron-down" size={14} color="#999" />
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Empty slots in setup mode */}
        {isSetup && players.length < 4 && (
          <View style={s.emptySlot}>
            <Ionicons name="person-add-outline" size={16} color="#CCC" />
            <Text style={s.emptySlotText}>
              {4 - players.length} spot{4 - players.length !== 1 ? "s" : ""} available
            </Text>
          </View>
        )}
      </View>

      {/* ── Tee Picker Modal ── */}
      {isSetup && showTeePicker && availableTees && (
        <Modal visible={!!showTeePicker} transparent animationType="slide">
          <View style={s.pickerOverlay}>
            <TouchableOpacity
              style={s.pickerBackdrop}
              activeOpacity={1}
              onPress={() => setShowTeePicker(null)}
            />
            <View style={s.pickerSheet}>
              <View style={s.pickerHeader}>
                <View>
                  <Text style={s.pickerTitle}>Select Tee</Text>
                  {showTeePicker === group.markerId && (
                    <Text style={s.pickerSubtitle}>Scorer's tee will update the whole group</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => setShowTeePicker(null)}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>
              {availableTees.map((tee, index) => {
                const currentPlayer = players.find(p => p.playerId === showTeePicker);
                const isSelected = currentPlayer?.teeName === tee.tee_name;
                return (
                  <TouchableOpacity
                    key={`tee-${index}`}
                    style={[s.teePickerOption, isSelected && s.teePickerOptionActive]}
                    onPress={() => {
                      soundPlayer.play("click");
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (showTeePicker) handleTeeSelect(showTeePicker, tee);
                    }}
                  >
                    <View style={s.teePickerLeft}>
                      <View style={[s.teeColorDot, { backgroundColor: getTeeColor(tee.tee_name) }]} />
                      <View>
                        <Text style={s.teePickerName}>{tee.tee_name}</Text>
                        <Text style={s.teePickerDetails}>{tee.total_yards?.toLocaleString()} yds • Par {tee.par_total}</Text>
                      </View>
                    </View>
                    <Text style={s.teePickerRating}>{tee.course_rating?.toFixed(1)} / {tee.slope_rating}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Modal>
      )}

      {/* ── Starting Hole Picker Modal ── */}
      {isSetup && (
        <Modal visible={showHolePicker} transparent animationType="slide">
          <View style={s.pickerOverlay}>
            <TouchableOpacity
              style={s.pickerBackdrop}
              activeOpacity={1}
              onPress={() => setShowHolePicker(false)}
            />
            <View style={s.pickerSheet}>
              <View style={s.pickerHeader}>
                <Text style={s.pickerTitle}>Starting Hole — {group.name}</Text>
                <TouchableOpacity onPress={() => setShowHolePicker(false)}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.holeGrid}
              >
                {holes.map((hole) => {
                  const isSelected = hole === group.startingHole;
                  return (
                    <TouchableOpacity
                      key={hole}
                      style={[s.holeChip, isSelected && s.holeChipActive]}
                      onPress={() => {
                        soundPlayer.play("click");
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        onStartingHoleChange?.(group.groupId, hole);
                        setShowHolePicker(false);
                      }}
                    >
                      <Text style={[s.holeChipText, isSelected && s.holeChipTextActive]}>
                        {hole}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Move Player Picker Modal ── */}
      {isSetup && showMovePicker && (
        <Modal visible={!!showMovePicker} transparent animationType="slide">
          <View style={s.pickerOverlay}>
            <TouchableOpacity
              style={s.pickerBackdrop}
              activeOpacity={1}
              onPress={() => setShowMovePicker(null)}
            />
            <View style={s.pickerSheet}>
              <View style={s.pickerHeader}>
                <Text style={s.pickerTitle}>Move to Group</Text>
                <TouchableOpacity onPress={() => setShowMovePicker(null)}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>
              {allGroups
                ?.filter((g) => g.groupId !== group.groupId)
                .map((targetGroup) => {
                  const targetPlayerCount = targetGroup.playerIds.length;
                  const isFull = targetPlayerCount >= 4;
                  return (
                    <TouchableOpacity
                      key={targetGroup.groupId}
                      style={[s.moveOption, isFull && s.moveOptionDisabled]}
                      disabled={isFull}
                      onPress={() => {
                        soundPlayer.play("click");
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        onMovePlayer?.(showMovePicker, targetGroup.groupId);
                        setShowMovePicker(null);
                      }}
                    >
                      <Ionicons name="people-outline" size={20} color={isFull ? "#CCC" : HEADER_GREEN} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.moveOptionName, isFull && { color: "#CCC" }]}>{targetGroup.name}</Text>
                        <Text style={s.moveOptionSub}>
                          {targetPlayerCount}/4 player{targetPlayerCount !== 1 ? "s" : ""}
                          {isFull ? " — Full" : ""}
                        </Text>
                      </View>
                      {!isFull && <Ionicons name="arrow-forward" size={18} color="#CCC" />}
                    </TouchableOpacity>
                  );
                })}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8E4DA",
    marginBottom: 14,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E4DA",
  },
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  groupName: {
    fontSize: 16,
    fontWeight: "700",
    color: WALNUT,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  playerCountBadge: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  playerCountText: { fontSize: 12, fontWeight: "700", color: GREEN },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: "700", color: "#FFF" },
  holeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F5F2EB",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  holeBtnText: { fontSize: 13, fontWeight: "600", color: HEADER_GREEN },
  holeTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  holeTagText: { fontSize: 12, fontWeight: "600", color: GOLD },
  progressBar: { height: 3, backgroundColor: "#E8E4DA" },
  progressFill: { height: 3, backgroundColor: HEADER_GREEN, borderRadius: 1.5 },
  playerList: { paddingVertical: 4 },
  playerBlock: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F0EDE4",
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  playerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  playerAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  playerAvatarFallback: {
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },
  playerAvatarText: { fontSize: 14, fontWeight: "700", color: GREEN },
  playerInfo: { flex: 1 },
  playerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  playerName: { fontSize: 15, fontWeight: "600", color: "#333", flexShrink: 1 },
  markerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: GREEN,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  markerBadgeText: { fontSize: 10, fontWeight: "700", color: "#FFF" },
  ghostBadge: {
    backgroundColor: "#E8E4DA",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  ghostBadgeText: { fontSize: 10, fontWeight: "700", color: "#888" },
  playerHcp: { fontSize: 12, color: "#999", marginTop: 2 },
  playerActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  actionBtnCompact: { padding: 6 },

  // Make Scorer button
  makeScorerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 60,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#E8F5E9",
    alignSelf: "flex-start",
  },
  makeScorerText: { fontSize: 12, fontWeight: "600", color: HEADER_GREEN },

  // Tee row
  teeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    paddingLeft: 60,
    backgroundColor: "#FAFAF5",
  },
  teeRowLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  teeRowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  teeGroupHint: { fontSize: 10, color: HEADER_GREEN, fontWeight: "600" },
  teeColorDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: "#DDD" },
  teeName: { fontSize: 13, fontWeight: "600", color: "#555" },
  teeDetails: { fontSize: 12, color: "#999" },
  emptySlot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  emptySlotText: { fontSize: 13, color: "#CCC" },
  pickerOverlay: { flex: 1, justifyContent: "flex-end" },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  pickerSheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 40 : 20,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E4DA",
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  pickerSubtitle: { fontSize: 12, color: HEADER_GREEN, marginTop: 2 },
  teePickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: "#FAFAF5",
    borderWidth: 1,
    borderColor: "#E8E4DA",
  },
  teePickerOptionActive: {
    borderColor: GREEN,
    backgroundColor: "#E8F5E9",
  },
  teePickerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  teePickerName: { fontSize: 15, fontWeight: "600", color: "#333" },
  teePickerDetails: { fontSize: 12, color: "#888", marginTop: 2 },
  teePickerRating: { fontSize: 13, fontWeight: "700", color: GREEN },
  holeGrid: { paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  holeChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F5F2EB",
    borderWidth: 1.5,
    borderColor: "#E0DCD4",
    justifyContent: "center",
    alignItems: "center",
  },
  holeChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  holeChipText: { fontSize: 15, fontWeight: "700", color: "#999" },
  holeChipTextActive: { color: "#FFF" },
  moveOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E4DA",
  },
  moveOptionDisabled: { opacity: 0.5 },
  moveOptionName: { fontSize: 15, fontWeight: "700", color: "#333" },
  moveOptionSub: { fontSize: 12, color: "#999", marginTop: 1 },
});