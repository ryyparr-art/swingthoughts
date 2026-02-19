/**
 * GroupSetup — Add players to the round
 *
 * The marker (Player 1) is pre-filled. Up to 3 more players can be added.
 * Each player can be:
 *   - On-platform user (searched from partners, then all users)
 *   - Ghost user (name + optional phone/email)
 *
 * Each player selects their own tee (defaults to marker's tee).
 * Course handicap is recalculated per player based on their tee.
 *
 * File: components/scoring/GroupSetup.tsx
 */

import React, { useCallback, useMemo, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { calculateCourseHandicap, getTeeColor } from "@/components/leagues/post-score/helpers";
import type { TeeOption } from "@/components/leagues/post-score/types";
import type { GroupSetupProps, PlayerSlot } from "./scoringTypes";
import AddPlayerModal, { type SearchResult } from "./AddPlayerModal";

const MAX_PLAYERS = 4;

// ============================================================================
// COMPONENT
// ============================================================================

export default function GroupSetup({
  marker,
  markerTee,
  availableTees,
  courseName,
  holeCount,
  onConfirm,
  onPlaySolo,
  onBack,
  onMarkerTeeChange,
}: GroupSetupProps) {
  // ── Player slots ──────────────────────────────────────────────
  const markerSlot: PlayerSlot = useMemo(() => ({
    playerId: marker.userId,
    displayName: marker.displayName,
    avatar: marker.avatar,
    isGhost: false,
    isMarker: true,
    handicapIndex: marker.handicapIndex,
    courseHandicap: calculateCourseHandicap(marker.handicapIndex, markerTee.slope_rating, holeCount),
    tee: markerTee,
    teeName: markerTee.tee_name,
    slopeRating: markerTee.slope_rating,
    courseRating: markerTee.course_rating,
  }), [marker, markerTee, holeCount]);

  const [additionalPlayers, setAdditionalPlayers] = useState<PlayerSlot[]>([]);
  const allPlayers = [markerSlot, ...additionalPlayers];

  // ── Add Player Modal ──────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);

  // Tee picker
  const [showTeePicker, setShowTeePicker] = useState(false);
  const [teePickerTarget, setTeePickerTarget] = useState<string | null>(null);

  // ── Add On-Platform User (from AddPlayerModal) ─────────────────
  const handleAddUser = useCallback((user: SearchResult) => {
    const courseHandicap = calculateCourseHandicap(
      user.handicapIndex,
      markerTee.slope_rating,
      holeCount
    );

    const newPlayer: PlayerSlot = {
      playerId: user.userId,
      displayName: user.displayName,
      avatar: user.avatar || undefined,
      isGhost: false,
      isMarker: false,
      handicapIndex: user.handicapIndex,
      courseHandicap,
      tee: markerTee,
      teeName: markerTee.tee_name,
      slopeRating: markerTee.slope_rating,
      courseRating: markerTee.course_rating,
    };

    setAdditionalPlayers((prev) => [...prev, newPlayer]);
  }, [markerTee, holeCount]);

  // ── Add Ghost User (from AddPlayerModal) ──────────────────────
  const handleAddGhost = useCallback((ghost: {
    name: string;
    handicapIndex: number;
    contactInfo?: string;
    contactType?: "phone" | "email";
  }) => {
    const courseHandicap = calculateCourseHandicap(ghost.handicapIndex, markerTee.slope_rating, holeCount);
    const ghostId = `ghost_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const newPlayer: PlayerSlot = {
      playerId: ghostId,
      displayName: ghost.name,
      isGhost: true,
      isMarker: false,
      handicapIndex: ghost.handicapIndex,
      courseHandicap,
      tee: markerTee,
      teeName: markerTee.tee_name,
      slopeRating: markerTee.slope_rating,
      courseRating: markerTee.course_rating,
      contactInfo: ghost.contactInfo,
      contactType: ghost.contactType,
    };

    setAdditionalPlayers((prev) => [...prev, newPlayer]);
  }, [markerTee, holeCount]);

  // ── Remove Player ─────────────────────────────────────────────
  const handleRemovePlayer = useCallback((playerId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAdditionalPlayers((prev) => prev.filter((p) => p.playerId !== playerId));
  }, []);

  // ── Change Tee ────────────────────────────────────────────────
  const handleChangeTee = useCallback((playerId: string, tee: TeeOption) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (playerId === marker.userId) {
      // Marker tee change — notify parent to update markerTee prop
      onMarkerTeeChange?.(tee);
    } else {
      setAdditionalPlayers((prev) =>
        prev.map((p) => {
          if (p.playerId !== playerId) return p;
          const newCH = calculateCourseHandicap(p.handicapIndex, tee.slope_rating, holeCount);
          return {
            ...p,
            tee,
            teeName: tee.tee_name,
            slopeRating: tee.slope_rating,
            courseRating: tee.course_rating,
            courseHandicap: newCH,
          };
        })
      );
    }
    setShowTeePicker(false);
    setTeePickerTarget(null);
  }, [holeCount, marker.userId, onMarkerTeeChange]);

  // ── Confirm ───────────────────────────────────────────────────
  const handleConfirm = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onConfirm(allPlayers);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <View style={s.container}>
      {/* Header — walnut bar consistent with orchestrator */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.headerBackBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>Playing Partners</Text>
          <Text style={s.headerSubtitle}>{courseName} • {holeCount} Holes</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={s.scrollArea} showsVerticalScrollIndicator={false}>
        {/* Player Cards */}
        {allPlayers.map((player, index) => (
          <View key={player.playerId} style={s.playerCard}>
            <View style={s.playerCardHeader}>
              <View style={s.playerIdentity}>
                {/* Avatar or placeholder */}
                {player.avatar ? (
                  <Image source={{ uri: player.avatar }} style={s.avatar} />
                ) : (
                  <View style={[s.avatar, s.avatarPlaceholder]}>
                    <Text style={s.avatarText}>
                      {player.displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={s.playerNameBlock}>
                  <View style={s.playerNameRow}>
                    <Text style={s.playerName}>{player.displayName}</Text>
                    {player.isMarker && (
                      <View style={s.markerBadge}>
                        <Text style={s.markerBadgeText}>Marker</Text>
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

              {/* Remove button (not for marker) */}
              {!player.isMarker && (
                <TouchableOpacity
                  style={s.removeBtn}
                  onPress={() => handleRemovePlayer(player.playerId)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={22} color="#CC3333" />
                </TouchableOpacity>
              )}
            </View>

            {/* Tee selection row */}
            <TouchableOpacity
              style={s.teeRow}
              onPress={() => {
                setTeePickerTarget(player.playerId);
                setShowTeePicker(true);
              }}
            >
              <View style={s.teeRowLeft}>
                <View style={[s.teeColorDot, { backgroundColor: getTeeColor(player.teeName) }]} />
                <Text style={s.teeName}>{player.teeName}</Text>
                <Text style={s.teeDetails}>
                  {player.tee.total_yards?.toLocaleString()} yds • {player.tee.course_rating?.toFixed(1)}/{player.tee.slope_rating}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={16} color="#999" />
            </TouchableOpacity>
          </View>
        ))}

        {/* Add Player Button */}
        {allPlayers.length < MAX_PLAYERS && (
          <TouchableOpacity style={s.addPlayerBtn} onPress={() => { soundPlayer.play("click"); setShowAddModal(true); }}>
            <Ionicons name="add-circle-outline" size={24} color="#0D5C3A" />
            <Text style={s.addPlayerText}>Add Player</Text>
          </TouchableOpacity>
        )}

        {/* Play Solo option — inline */}
        <TouchableOpacity style={s.soloInlineBtn} onPress={onPlaySolo}>
          <Ionicons name="person-outline" size={18} color="#888" />
          <Text style={s.soloInlineText}>Playing alone?</Text>
          <Text style={s.soloInlineLink}>Score Solo</Text>
        </TouchableOpacity>

        {/* Spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Bottom Button — always shows Continue */}
      <View style={s.bottomBar}>
        <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm}>
          <Text style={s.confirmBtnText}>
            Start Round with {allPlayers.length} Player{allPlayers.length > 1 ? "s" : ""}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* ================================================================ */}
      {/* ADD PLAYER MODAL                                                 */}
      {/* ================================================================ */}
      <AddPlayerModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAddUser={handleAddUser}
        onAddGhost={handleAddGhost}
        markerId={marker.userId}
        existingPlayerIds={allPlayers.map((p) => p.playerId)}
      />

      {/* ================================================================ */}
      {/* TEE PICKER MODAL                                                 */}
      {/* ================================================================ */}
      <Modal visible={showTeePicker} animationType="slide" transparent>
        <View style={s.teePickerOverlay}>
          <View style={s.teePickerSheet}>
            <View style={s.teePickerHeader}>
              <Text style={s.teePickerTitle}>Select Tee</Text>
              <TouchableOpacity onPress={() => { setShowTeePicker(false); setTeePickerTarget(null); }}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            {availableTees.map((tee, index) => (
              <TouchableOpacity
                key={`tee-${index}`}
                style={s.teePickerOption}
                onPress={() => {
                  if (teePickerTarget) handleChangeTee(teePickerTarget, tee);
                }}
              >
                <View style={s.teePickerLeft}>
                  <View style={[s.teeColorDot, { backgroundColor: getTeeColor(tee.tee_name) }]} />
                  <View>
                    <Text style={s.teePickerName}>{tee.tee_name}</Text>
                    <Text style={s.teePickerDetails}>
                      {tee.total_yards?.toLocaleString()} yds • Par {tee.par_total}
                    </Text>
                  </View>
                </View>
                <Text style={s.teePickerRating}>
                  {tee.course_rating?.toFixed(1)} / {tee.slope_rating}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  header: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#147A52",
    flexDirection: "row",
    alignItems: "center",
  },
  headerBackBtn: { padding: 4, marginRight: 8 },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#C5A55A",
    marginTop: 2,
  },
  scrollArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // ── Player Card ─────────────────────────────────────────────
  playerCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8E4DA",
    marginBottom: 12,
    overflow: "hidden",
  },
  playerCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  playerIdentity: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  playerNameBlock: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  markerBadge: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  markerBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFF",
  },
  ghostBadge: {
    backgroundColor: "#E8E4DA",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ghostBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#888",
  },
  playerHcp: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  removeBtn: {
    padding: 4,
  },

  // ── Tee Row ─────────────────────────────────────────────────
  teeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FAFAF5",
    borderTopWidth: 1,
    borderTopColor: "#F0EDE4",
  },
  teeRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  teeColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#DDD",
  },
  teeName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
  },
  teeDetails: {
    fontSize: 12,
    color: "#999",
  },

  // ── Add Player Button ───────────────────────────────────────
  addPlayerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    borderStyle: "dashed",
    marginBottom: 12,
  },
  addPlayerText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  // ── Bottom Bar ──────────────────────────────────────────────
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E8E4DA",
    backgroundColor: "#FFF",
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    paddingVertical: 14,
    borderRadius: 12,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
  soloInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginTop: 8,
  },
  soloInlineText: {
    fontSize: 14,
    color: "#888",
  },
  soloInlineLink: {
    fontSize: 14,
    fontWeight: "700",
    color: "#147A52",
    textDecorationLine: "underline",
  },

  // ── Tee Picker ──────────────────────────────────────────────
  teePickerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  teePickerSheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 40,
  },
  teePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  teePickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  teePickerOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#FAFAF5",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E8E4DA",
  },
  teePickerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  teePickerName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  teePickerDetails: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  teePickerRating: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0D5C3A",
  },
});