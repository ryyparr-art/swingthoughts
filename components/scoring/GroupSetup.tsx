/**
 * GroupSetup — Add players to the round
 *
 * Includes a [Foursome] / [Group Outing] toggle that switches to
 * OutingGroupSetup in-place when Group Outing is selected.
 *
 * Fixes:
 *   - Outing state (roster/groups) preserved when going back from Review
 *   - Passes initialRoster/initialGroups so OutingGroupSetup resumes
 *   - defaultTee + availableTees passed through
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { calculateCourseHandicap, getTeeColor } from "@/components/leagues/post-score/helpers";
import type { TeeOption } from "@/components/leagues/post-score/types";
import type { GroupSetupProps, PlayerSlot } from "./scoringTypes";
import type { OutingGroup, OutingPlayer } from "@/constants/outingTypes";
import AddPlayerModal, { type SearchResult } from "./AddPlayerModal";
import OutingGroupSetup from "@/components/outings/OutingGroupSetup";
import OutingReview from "@/components/outings/OutingReview";

const MAX_PLAYERS = 4;
const HEADER_GREEN = "#147A52";
const GREEN = "#0D5C3A";

type GroupMode = "foursome" | "outing";
type OutingScreen = "setup" | "review";

interface ExtendedGroupSetupProps extends GroupSetupProps {
  courseId?: number;
  holeCount: 9 | 18;
  nineHoleSide?: "front" | "back";
  formatId?: string;
  onOutingLaunch?: (roster: OutingPlayer[], groups: OutingGroup[]) => void;
}

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
  courseId,
  nineHoleSide,
  formatId,
  onOutingLaunch,
}: ExtendedGroupSetupProps) {
  const insets = useSafeAreaInsets();

  // ── Mode toggle ──
  const [groupMode, setGroupMode] = useState<GroupMode>("foursome");
  const [outingScreen, setOutingScreen] = useState<OutingScreen>("setup");

  // ── Persisted outing state — survives setup↔review transitions ──
  const [outingRoster, setOutingRoster] = useState<OutingPlayer[] | null>(null);
  const [outingGroups, setOutingGroups] = useState<OutingGroup[] | null>(null);

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

  const [showAddModal, setShowAddModal] = useState(false);
  const [showTeePicker, setShowTeePicker] = useState(false);
  const [teePickerTarget, setTeePickerTarget] = useState<string | null>(null);

  const handleModeToggle = (mode: GroupMode) => {
    if (mode === groupMode) return;
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGroupMode(mode);
    // Don't reset outingScreen — preserve state
  };

  // ── Foursome handlers ──
  const handleAddUser = useCallback((user: SearchResult) => {
    const courseHandicap = calculateCourseHandicap(user.handicapIndex, markerTee.slope_rating, holeCount);
    const newPlayer: PlayerSlot = {
      playerId: user.userId, displayName: user.displayName, avatar: user.avatar || undefined,
      isGhost: false, isMarker: false, handicapIndex: user.handicapIndex, courseHandicap,
      tee: markerTee, teeName: markerTee.tee_name, slopeRating: markerTee.slope_rating, courseRating: markerTee.course_rating,
    };
    setAdditionalPlayers((prev) => [...prev, newPlayer]);
  }, [markerTee, holeCount]);

  const handleAddGhost = useCallback((ghost: { name: string; handicapIndex: number; contactInfo?: string; contactType?: "phone" | "email" }) => {
    const courseHandicap = calculateCourseHandicap(ghost.handicapIndex, markerTee.slope_rating, holeCount);
    const ghostId = `ghost_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newPlayer: PlayerSlot = {
      playerId: ghostId, displayName: ghost.name, isGhost: true, isMarker: false,
      handicapIndex: ghost.handicapIndex, courseHandicap,
      tee: markerTee, teeName: markerTee.tee_name, slopeRating: markerTee.slope_rating, courseRating: markerTee.course_rating,
      contactInfo: ghost.contactInfo, contactType: ghost.contactType,
    };
    setAdditionalPlayers((prev) => [...prev, newPlayer]);
  }, [markerTee, holeCount]);

  const handleRemovePlayer = useCallback((playerId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAdditionalPlayers((prev) => prev.filter((p) => p.playerId !== playerId));
  }, []);

  const handleChangeTee = useCallback((playerId: string, tee: TeeOption) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (playerId === marker.userId) {
      onMarkerTeeChange?.(tee);
    } else {
      setAdditionalPlayers((prev) =>
        prev.map((p) => {
          if (p.playerId !== playerId) return p;
          const newCH = calculateCourseHandicap(p.handicapIndex, tee.slope_rating, holeCount);
          return { ...p, tee, teeName: tee.tee_name, slopeRating: tee.slope_rating, courseRating: tee.course_rating, courseHandicap: newCH };
        })
      );
    }
    setShowTeePicker(false);
    setTeePickerTarget(null);
  }, [holeCount, marker.userId, onMarkerTeeChange]);

  const handleConfirm = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onConfirm(allPlayers);
  };

  // ── Outing handlers ──
  const handleOutingConfirm = (roster: OutingPlayer[], groups: OutingGroup[]) => {
    // Save state so it survives back navigation
    setOutingRoster(roster);
    setOutingGroups(groups);
    setOutingScreen("review");
  };

  const handleOutingLaunch = (roster: OutingPlayer[], groups: OutingGroup[]) => {
    onOutingLaunch?.(roster, groups);
  };

  const handleOutingReviewBack = () => {
    // Go back to setup — outingRoster/outingGroups are preserved in state
    setOutingScreen("setup");
  };

  // ── Render: Outing Review ──
  if (groupMode === "outing" && outingScreen === "review" && outingRoster && outingGroups) {
    return (
      <View style={s.container}>
        <View style={{ backgroundColor: HEADER_GREEN, height: insets.top }} />
        <View style={s.header}>
          <View style={{ width: 32 }} />
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: 36 }}>
            <Text style={s.headerTitle}>Review Outing</Text>
            <Text style={s.headerSubtitle}>{courseName} • {holeCount} Holes</Text>
          </View>
          <View style={{ width: 32 }} />
        </View>
        <OutingReview
          courseName={courseName}
          holeCount={holeCount}
          nineHoleSide={nineHoleSide}
          formatId={formatId ?? "stroke_play"}
          roster={outingRoster}
          groups={outingGroups}
          onLaunch={handleOutingLaunch}
          onBack={handleOutingReviewBack}
        />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={{ backgroundColor: HEADER_GREEN, height: insets.top }} />

      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.headerBackBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: 36 }}>
          <Text style={s.headerTitle}>Playing Partners</Text>
          <Text style={s.headerSubtitle}>{courseName} • {holeCount} Holes</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* ── Mode Toggle ── */}
      <View style={s.toggleBar}>
        <TouchableOpacity
          style={[s.toggleTab, groupMode === "foursome" && s.toggleTabActive]}
          onPress={() => handleModeToggle("foursome")}
        >
          <Ionicons name="people" size={16} color={groupMode === "foursome" ? "#FFF" : "#999"} />
          <Text style={[s.toggleTabText, groupMode === "foursome" && s.toggleTabTextActive]}>Foursome</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.toggleTab, groupMode === "outing" && s.toggleTabActive]}
          onPress={() => handleModeToggle("outing")}
        >
          <Ionicons name="grid" size={16} color={groupMode === "outing" ? "#FFF" : "#999"} />
          <Text style={[s.toggleTabText, groupMode === "outing" && s.toggleTabTextActive]}>Group Outing</Text>
        </TouchableOpacity>
      </View>

      {/* ── Outing Mode ── */}
      {groupMode === "outing" ? (
        <OutingGroupSetup
          organizer={{
            userId: marker.userId,
            displayName: marker.displayName,
            avatar: marker.avatar,
            handicapIndex: marker.handicapIndex,
          }}
          courseId={courseId ?? 0}
          courseName={courseName}
          holeCount={holeCount}
          nineHoleSide={nineHoleSide}
          formatId={formatId ?? "stroke_play"}
          defaultTee={markerTee}
          availableTees={availableTees}
          initialRoster={outingRoster ?? undefined}
          initialGroups={outingGroups ?? undefined}
          onConfirm={handleOutingConfirm}
          onBack={onBack}
        />
      ) : (
        <>
          {/* ── Foursome Mode (existing) ── */}
          <ScrollView style={s.scrollArea} showsVerticalScrollIndicator={false}>
            {allPlayers.map((player) => (
              <View key={player.playerId} style={s.playerCard}>
                <View style={s.playerCardHeader}>
                  <View style={s.playerIdentity}>
                    {player.avatar ? (
                      <Image source={{ uri: player.avatar }} style={s.avatar} />
                    ) : (
                      <View style={[s.avatar, s.avatarPlaceholder]}>
                        <Text style={s.avatarText}>{player.displayName.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={s.playerNameBlock}>
                      <View style={s.playerNameRow}>
                        <Text style={s.playerName}>{player.displayName}</Text>
                        {player.isMarker && <View style={s.markerBadge}><Text style={s.markerBadgeText}>Marker</Text></View>}
                        {player.isGhost && <View style={s.ghostBadge}><Text style={s.ghostBadgeText}>Guest</Text></View>}
                      </View>
                      <Text style={s.playerHcp}>HCP {player.handicapIndex.toFixed(1)} → CH {player.courseHandicap}</Text>
                    </View>
                  </View>
                  {!player.isMarker && (
                    <TouchableOpacity style={s.removeBtn} onPress={() => handleRemovePlayer(player.playerId)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="close-circle" size={22} color="#CC3333" />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity style={s.teeRow} onPress={() => { setTeePickerTarget(player.playerId); setShowTeePicker(true); }}>
                  <View style={s.teeRowLeft}>
                    <View style={[s.teeColorDot, { backgroundColor: getTeeColor(player.teeName) }]} />
                    <Text style={s.teeName}>{player.teeName}</Text>
                    <Text style={s.teeDetails}>{player.tee.total_yards?.toLocaleString()} yds • {player.tee.course_rating?.toFixed(1)}/{player.tee.slope_rating}</Text>
                  </View>
                  <Ionicons name="chevron-down" size={16} color="#999" />
                </TouchableOpacity>
              </View>
            ))}

            {allPlayers.length < MAX_PLAYERS && (
              <TouchableOpacity style={s.addPlayerBtn} onPress={() => { soundPlayer.play("click"); setShowAddModal(true); }}>
                <Ionicons name="add-circle-outline" size={24} color={GREEN} />
                <Text style={s.addPlayerText}>Add Player</Text>
              </TouchableOpacity>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>

          <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm}>
              <Text style={s.confirmBtnText}>
                {allPlayers.length === 1 ? "Play Solo" : `Start Round with ${allPlayers.length} Players`}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>

          <AddPlayerModal
            visible={showAddModal}
            onClose={() => setShowAddModal(false)}
            onAddUser={handleAddUser}
            onAddGhost={handleAddGhost}
            markerId={marker.userId}
            existingPlayerIds={allPlayers.map((p) => p.playerId)}
          />

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
                  <TouchableOpacity key={`tee-${index}`} style={s.teePickerOption} onPress={() => { if (teePickerTarget) handleChangeTee(teePickerTarget, tee); }}>
                    <View style={s.teePickerLeft}>
                      <View style={[s.teeColorDot, { backgroundColor: getTeeColor(tee.tee_name) }]} />
                      <View>
                        <Text style={s.teePickerName}>{tee.tee_name}</Text>
                        <Text style={s.teePickerDetails}>{tee.total_yards?.toLocaleString()} yds • Par {tee.par_total}</Text>
                      </View>
                    </View>
                    <Text style={s.teePickerRating}>{tee.course_rating?.toFixed(1)} / {tee.slope_rating}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  header: { paddingVertical: 12, paddingHorizontal: 16, backgroundColor: HEADER_GREEN, flexDirection: "row", alignItems: "center" },
  headerBackBtn: { padding: 4, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#FFF", fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", textAlign: "center" },
  headerSubtitle: { fontSize: 12, color: "#C5A55A", marginTop: 2 },
  scrollArea: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  toggleBar: { flexDirection: "row", marginHorizontal: 16, marginTop: 12, marginBottom: 4, backgroundColor: "#E8E4DA", borderRadius: 10, padding: 3 },
  toggleTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 8 },
  toggleTabActive: { backgroundColor: GREEN },
  toggleTabText: { fontSize: 14, fontWeight: "600", color: "#999" },
  toggleTabTextActive: { color: "#FFF" },
  playerCard: { backgroundColor: "#FFF", borderRadius: 14, borderWidth: 1, borderColor: "#E8E4DA", marginBottom: 14, overflow: "hidden" },
  playerCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  playerIdentity: { flexDirection: "row", alignItems: "center", flex: 1 },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 14 },
  avatarPlaceholder: { backgroundColor: "#E8F5E9", justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 19, fontWeight: "700", color: GREEN },
  playerNameBlock: { flex: 1 },
  playerNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  playerName: { fontSize: 18, fontWeight: "700", color: "#333" },
  markerBadge: { backgroundColor: GREEN, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  markerBadgeText: { fontSize: 11, fontWeight: "700", color: "#FFF" },
  ghostBadge: { backgroundColor: "#E8E4DA", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  ghostBadgeText: { fontSize: 11, fontWeight: "700", color: "#888" },
  playerHcp: { fontSize: 14, color: "#888", marginTop: 3 },
  removeBtn: { padding: 4 },
  teeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FAFAF5", borderTopWidth: 1, borderTopColor: "#F0EDE4" },
  teeRowLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  teeColorDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: "#DDD" },
  teeName: { fontSize: 15, fontWeight: "600", color: "#555" },
  teeDetails: { fontSize: 13, color: "#999" },
  addPlayerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: 12, borderWidth: 2, borderColor: GREEN, borderStyle: "dashed", marginBottom: 12 },
  addPlayerText: { fontSize: 16, fontWeight: "700", color: GREEN },
  bottomBar: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#E8E4DA", backgroundColor: "#FFF" },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: GREEN, paddingVertical: 14, borderRadius: 12 },
  confirmBtnText: { fontSize: 16, fontWeight: "700", color: "#FFF" },
  teePickerOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  teePickerSheet: { backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 40 },
  teePickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  teePickerTitle: { fontSize: 18, fontWeight: "700", color: "#333" },
  teePickerOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14, borderRadius: 12, backgroundColor: "#FAFAF5", marginBottom: 8, borderWidth: 1, borderColor: "#E8E4DA" },
  teePickerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  teePickerName: { fontSize: 15, fontWeight: "600", color: "#333" },
  teePickerDetails: { fontSize: 12, color: "#888", marginTop: 2 },
  teePickerRating: { fontSize: 13, fontWeight: "700", color: GREEN },
});