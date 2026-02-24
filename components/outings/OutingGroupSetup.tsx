/**
 * OutingGroupSetup — Group assignment & management for outings
 *
 * Fixes:
 *   - Scorer tee change cascades to all players in that group
 *   - Passes onScorerTeeChange + onMovePlayer to OutingGroupCard
 *
 * File: components/outings/OutingGroupSetup.tsx
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { soundPlayer } from "@/utils/soundPlayer";
import { calculateCourseHandicap } from "@/components/leagues/post-score/helpers";
import type { TeeOption } from "@/components/leagues/post-score/types";
import type {
  OutingGroup,
  OutingPlayer,
} from "@/constants/outingTypes";
import {
  autoAssignGroups,
  getGroupPlayers,
  getUnassignedPlayers,
  movePlayerBetweenGroups,
  reassignGroupMarker,
  shotgunAssignStartingHoles,
  validateOutingSetup,
} from "@/utils/outingHelpers";
import OutingGroupCard from "./OutingGroupCard";
import OutingRosterBuilder from "./OutingRosterBuilder";

const GREEN = "#0D5C3A";

const MAX_PLAYERS = 20;
const GROUP_SIZE = 4;

interface OutingGroupSetupProps {
  organizer: {
    userId: string;
    displayName: string;
    avatar?: string;
    handicapIndex: number;
  };
  courseId: number;
  courseName: string;
  holeCount: 9 | 18;
  nineHoleSide?: "front" | "back";
  formatId: string;
  defaultTee: TeeOption;
  availableTees: TeeOption[];
  initialRoster?: OutingPlayer[];
  initialGroups?: OutingGroup[];
  showRosterBuilder?: boolean;
  maxPlayers?: number;
  groupSize?: number;
  onConfirm: (roster: OutingPlayer[], groups: OutingGroup[]) => void;
  onBack: () => void;
}

export default function OutingGroupSetup({
  organizer,
  courseId,
  courseName,
  holeCount,
  nineHoleSide,
  formatId,
  defaultTee,
  availableTees,
  initialRoster,
  initialGroups,
  showRosterBuilder = true,
  maxPlayers = MAX_PLAYERS,
  groupSize = GROUP_SIZE,
  onConfirm,
  onBack,
}: OutingGroupSetupProps) {
  // ── State ──
  const [roster, setRoster] = useState<OutingPlayer[]>(() => {
    if (initialRoster && initialRoster.length > 0) return initialRoster;
    return [
      {
        playerId: organizer.userId,
        displayName: organizer.displayName,
        avatar: organizer.avatar,
        isGhost: false,
        handicapIndex: organizer.handicapIndex,
        courseHandicap: calculateCourseHandicap(organizer.handicapIndex, defaultTee.slope_rating, holeCount),
        tee: defaultTee,
        teeName: defaultTee.tee_name,
        slopeRating: defaultTee.slope_rating,
        courseRating: defaultTee.course_rating,
        groupId: null,
        isGroupMarker: false,
      },
    ];
  });

  const [groups, setGroups] = useState<OutingGroup[]>(initialGroups ?? []);
  const [isShotgun, setIsShotgun] = useState(false);

  // ── Derived ──
  const unassigned = useMemo(() => getUnassignedPlayers(roster), [roster]);
  const warnings = useMemo(
    () => (groups.length > 0 ? validateOutingSetup(roster, groups) : []),
    [roster, groups]
  );
  const canContinue = groups.length > 0 && unassigned.length === 0;

  // ── Auto-assign groups ──
  const handleAutoAssign = useCallback(() => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const cleanRoster = roster.map((p) => ({
      ...p,
      groupId: null,
      isGroupMarker: false,
    }));

    let newGroups = autoAssignGroups(cleanRoster, groupSize);

    if (isShotgun) {
      newGroups = shotgunAssignStartingHoles(newGroups, holeCount);
    }

    const updatedRoster = cleanRoster.map((p) => {
      const group = newGroups.find((g) => g.playerIds.includes(p.playerId));
      if (group) {
        return { ...p, groupId: group.groupId, isGroupMarker: p.playerId === group.markerId };
      }
      return p;
    });

    setRoster(updatedRoster);
    setGroups(newGroups);
  }, [roster, groupSize, isShotgun, holeCount]);

  // ── Roster change handler ──
  const handleRosterChange = useCallback(
    (newRoster: OutingPlayer[]) => {
      setRoster(newRoster);
      if (groups.length > 0) {
        const rosterIds = new Set(newRoster.map((p) => p.playerId));
        const updatedGroups = groups
          .map((g) => ({
            ...g,
            playerIds: g.playerIds.filter((id) => rosterIds.has(id)),
          }))
          .filter((g) => g.playerIds.length > 0)
          .map((g) => {
            if (!rosterIds.has(g.markerId) && g.playerIds.length > 0) {
              const newMarker = newRoster.find(
                (p) => g.playerIds.includes(p.playerId) && !p.isGhost
              );
              return { ...g, markerId: newMarker?.playerId ?? g.playerIds[0] };
            }
            return g;
          });
        setGroups(updatedGroups);
      }
    },
    [groups]
  );

  // ── Individual tee change (non-scorer) ──
  const handleTeeChange = useCallback(
    (playerId: string, tee: TeeOption) => {
      setRoster((prev) =>
        prev.map((p) => {
          if (p.playerId !== playerId) return p;
          return {
            ...p,
            tee,
            teeName: tee.tee_name,
            slopeRating: tee.slope_rating,
            courseRating: tee.course_rating,
            courseHandicap: calculateCourseHandicap(p.handicapIndex, tee.slope_rating, holeCount),
          };
        })
      );
    },
    [holeCount]
  );

  // ── Scorer tee change — cascades to all players in that group ──
  const handleScorerTeeChange = useCallback(
    (groupId: string, tee: TeeOption) => {
      const group = groups.find((g) => g.groupId === groupId);
      if (!group) return;

      const groupPlayerIds = new Set(group.playerIds);

      setRoster((prev) =>
        prev.map((p) => {
          if (!groupPlayerIds.has(p.playerId)) return p;
          return {
            ...p,
            tee,
            teeName: tee.tee_name,
            slopeRating: tee.slope_rating,
            courseRating: tee.course_rating,
            courseHandicap: calculateCourseHandicap(p.handicapIndex, tee.slope_rating, holeCount),
          };
        })
      );
    },
    [groups, holeCount]
  );

  // ── Marker change — new scorer moves to top of group list ──
  const handleMarkerChange = useCallback(
    (groupId: string, newMarkerId: string) => {
      const result = reassignGroupMarker(roster, groups, groupId, newMarkerId);
      // Reorder playerIds so the new marker is first
      const updatedGroups = result.groups.map((g) => {
        if (g.groupId !== groupId) return g;
        const reordered = [
          newMarkerId,
          ...g.playerIds.filter((id) => id !== newMarkerId),
        ];
        return { ...g, playerIds: reordered };
      });
      setRoster(result.roster);
      setGroups(updatedGroups);
    },
    [roster, groups]
  );

  // ── Starting hole change ──
  const handleStartingHoleChange = useCallback(
    (groupId: string, hole: number) => {
      setGroups((prev) =>
        prev.map((g) => (g.groupId === groupId ? { ...g, startingHole: hole } : g))
      );
    },
    []
  );

  // ── Move player between groups ──
  const handleMovePlayer = useCallback(
    (playerId: string, targetGroupId: string) => {
      const result = movePlayerBetweenGroups(roster, groups, playerId, targetGroupId);
      setRoster(result.roster);
      setGroups(result.groups);
    },
    [roster, groups]
  );

  // ── Remove player from group (back to unassigned) ──
  const handleRemoveFromGroup = useCallback(
    (playerId: string) => {
      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const updatedRoster = roster.map((p) =>
        p.playerId === playerId ? { ...p, groupId: null, isGroupMarker: false } : p
      );
      const updatedGroups = groups
        .map((g) => {
          const filteredIds = g.playerIds.filter((id) => id !== playerId);
          if (filteredIds.length === 0) return null;
          if (g.markerId === playerId) {
            const newMarker = updatedRoster.find(
              (p) => filteredIds.includes(p.playerId) && !p.isGhost
            );
            return { ...g, playerIds: filteredIds, markerId: newMarker?.playerId ?? filteredIds[0] };
          }
          return { ...g, playerIds: filteredIds };
        })
        .filter(Boolean) as OutingGroup[];

      setRoster(updatedRoster);
      setGroups(updatedGroups);
    },
    [roster, groups]
  );

  // ── Shotgun toggle ──
  const handleShotgunToggle = useCallback(() => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !isShotgun;
    setIsShotgun(next);

    if (groups.length > 0) {
      if (next) {
        setGroups(shotgunAssignStartingHoles(groups, holeCount));
      } else {
        setGroups(groups.map((g, i) => ({
          ...g,
          startingHole: 1,
          name: g.name.startsWith("Hole") ? `Group ${i + 1}` : g.name,
        })));
      }
    }
  }, [isShotgun, groups, holeCount]);

  // ── Confirm ──
  const handleConfirm = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onConfirm(roster, groups);
  };

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scrollArea}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
      >
        {/* ── Roster Builder ── */}
        {showRosterBuilder && (
          <View style={s.section}>
            <OutingRosterBuilder
              roster={roster}
              onRosterChange={handleRosterChange}
              maxPlayers={maxPlayers}
              organizerId={organizer.userId}
              defaultTee={defaultTee}
              holeCount={holeCount}
            />
          </View>
        )}

        {/* ── Group Assignment Controls ── */}
        {roster.length >= 2 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Groups</Text>
              <View style={s.groupControls}>
                <TouchableOpacity
                  style={[s.toggleBtn, isShotgun && s.toggleBtnActive]}
                  onPress={handleShotgunToggle}
                >
                  <Ionicons name="flag" size={14} color={isShotgun ? "#FFF" : GREEN} />
                  <Text style={[s.toggleBtnText, isShotgun && s.toggleBtnTextActive]}>Shotgun</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.autoAssignBtn} onPress={handleAutoAssign}>
                  <Ionicons name="shuffle" size={16} color={GREEN} />
                  <Text style={s.autoAssignText}>{groups.length > 0 ? "Re-assign" : "Auto-Assign"}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {unassigned.length > 0 && groups.length > 0 && (
              <View style={s.unassignedBanner}>
                <Ionicons name="alert-circle" size={18} color="#FF9500" />
                <Text style={s.unassignedText}>
                  {unassigned.length} player{unassigned.length !== 1 ? "s" : ""} not assigned to a group
                </Text>
              </View>
            )}

            {groups.length === 0 && roster.length >= 2 && (
              <View style={s.promptCard}>
                <Ionicons name="people-outline" size={32} color="#CCC" />
                <Text style={s.promptText}>Tap "Auto-Assign" to create groups of {groupSize}</Text>
                <Text style={s.promptSub}>{roster.length} player{roster.length !== 1 ? "s" : ""} in roster</Text>
              </View>
            )}

            {groups.map((group) => (
              <OutingGroupCard
                key={group.groupId}
                group={group}
                players={getGroupPlayers(roster, group.groupId)}
                mode="setup"
                allGroups={groups}
                availableTees={availableTees}
                holeCount={holeCount}
                nineHoleSide={nineHoleSide}
                onMarkerChange={handleMarkerChange}
                onStartingHoleChange={handleStartingHoleChange}
                onMovePlayer={handleMovePlayer}
                onRemovePlayer={handleRemoveFromGroup}
                onTeeChange={handleTeeChange}
                onScorerTeeChange={handleScorerTeeChange}
              />
            ))}
          </View>
        )}

        {/* ── Validation Warnings ── */}
        {warnings.length > 0 && (
          <View style={s.warningsSection}>
            {warnings.map((w, i) => (
              <View key={`warn-${i}`} style={s.warningRow}>
                <Ionicons
                  name={w.type === "ghost_marker" || w.type === "no_marker" ? "alert-circle" : "information-circle"}
                  size={16}
                  color={w.type === "ghost_marker" || w.type === "no_marker" ? "#FF3B30" : "#FF9500"}
                />
                <Text style={s.warningText}>{w.message}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Bottom Bar ── */}
      <View style={s.bottomBar}>
        <TouchableOpacity
          style={[s.confirmBtn, !canContinue && s.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={!canContinue}
        >
          <Text style={s.confirmBtnText}>Continue to Review</Text>
          <Ionicons name="arrow-forward" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#333", fontFamily: Platform.OS === "ios" ? "Georgia" : "serif" },
  groupControls: { flexDirection: "row", gap: 8 },
  toggleBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: GREEN },
  toggleBtnActive: { backgroundColor: GREEN },
  toggleBtnText: { fontSize: 13, fontWeight: "600", color: GREEN },
  toggleBtnTextActive: { color: "#FFF" },
  autoAssignBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#E8F5E9" },
  autoAssignText: { fontSize: 13, fontWeight: "600", color: GREEN },
  unassignedBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF3CD", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, marginBottom: 12 },
  unassignedText: { fontSize: 13, fontWeight: "600", color: "#664D03", flex: 1 },
  promptCard: { alignItems: "center", paddingVertical: 30, borderRadius: 14, borderWidth: 2, borderColor: "#E0DCD4", borderStyle: "dashed", gap: 8 },
  promptText: { fontSize: 15, fontWeight: "600", color: "#999" },
  promptSub: { fontSize: 13, color: "#CCC" },
  warningsSection: { backgroundColor: "#FFF", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#E8E4DA", gap: 8 },
  warningRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  warningText: { fontSize: 13, color: "#666", flex: 1, lineHeight: 18 },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingVertical: 12, paddingBottom: Platform.OS === "ios" ? 34 : 12, backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: "#E8E4DA" },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: GREEN, paddingVertical: 14, borderRadius: 12 },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { fontSize: 16, fontWeight: "700", color: "#FFF" },
});