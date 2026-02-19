/**
 * FormatPicker — Card-based format selection
 *
 * Displays formats as visual cards grouped by category.
 * Filters by player count. Includes team assignment for team formats.
 *
 * File: components/scoring/FormatPicker.tsx
 */

import {
  GAME_FORMATS,
  type GameFormatDefinition,
} from "@/constants/gameFormats";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FormatPickerProps, RoundTeam } from "./scoringTypes";

// ============================================================================
// COLORS
// ============================================================================

const WALNUT = "#4A3628";
const CREAM = "#F4EED8";
const GREEN = "#0D5C3A";
const GOLD = "#C5A55A";
const HEADER_GREEN = "#147A52";

// ============================================================================
// HELPERS
// ============================================================================

function getAvailableFormats(playerCount: number): GameFormatDefinition[] {
  return GAME_FORMATS.filter((f) => {
    if (f.playersPerTeam === 1) return true;
    const totalNeeded = f.playersPerTeam * (f.teamsPerMatch || 2);
    return playerCount >= totalNeeded;
  });
}

function getCategoryLabel(cat: string): string {
  switch (cat) {
    case "individual": return "Individual";
    case "two_player_team": return "Team — Pairs";
    case "four_player_team": return "Team — Foursome";
    default: return cat;
  }
}

function getCategoryIcon(cat: string): string {
  switch (cat) {
    case "individual": return "person-outline";
    case "two_player_team": return "people-outline";
    case "four_player_team": return "people-circle-outline";
    default: return "golf-outline";
  }
}

function getScoringBadge(method: string): { label: string; color: string } {
  switch (method) {
    case "total_strokes": return { label: "Strokes", color: GREEN };
    case "points": return { label: "Points", color: "#7B61FF" };
    case "holes_won": return { label: "Holes", color: "#C5A55A" };
    default: return { label: method, color: "#666" };
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function FormatPicker({
  playerCount,
  players,
  onConfirm,
  onBack,
}: FormatPickerProps) {
  const insets = useSafeAreaInsets();
  const [selectedFormatId, setSelectedFormatId] = useState("stroke_play");
  const [showTeamAssignment, setShowTeamAssignment] = useState(false);
  const [teams, setTeams] = useState<RoundTeam[]>([]);

  // ── Available formats grouped by category ───────────────────
  const availableFormats = useMemo(() => getAvailableFormats(playerCount), [playerCount]);

  const groupedFormats = useMemo(() => {
    const groups: Record<string, GameFormatDefinition[]> = {};
    for (const fmt of availableFormats) {
      if (!groups[fmt.category]) groups[fmt.category] = [];
      groups[fmt.category].push(fmt);
    }
    return groups;
  }, [availableFormats]);

  const selectedFormat = useMemo(
    () => availableFormats.find((f) => f.id === selectedFormatId) || availableFormats[0],
    [selectedFormatId, availableFormats]
  );

  // ── Handlers ──────────────────────────────────────────────
  const handleSelectFormat = (fmt: GameFormatDefinition) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedFormatId(fmt.id);
  };

  const handleContinue = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (selectedFormat.playersPerTeam > 1) {
      // Team format — show team assignment
      initializeTeams();
      setShowTeamAssignment(true);
    } else {
      onConfirm(selectedFormatId);
    }
  };

  const initializeTeams = () => {
    const ppt = selectedFormat.playersPerTeam;
    const teamCount = Math.ceil(playerCount / ppt);
    const newTeams: RoundTeam[] = [];
    for (let i = 0; i < teamCount; i++) {
      newTeams.push({
        id: `team_${i + 1}`,
        name: `Team ${i + 1}`,
        playerIds: [],
      });
    }
    // Auto-assign players evenly
    players.forEach((p, idx) => {
      newTeams[idx % teamCount].playerIds.push(p.playerId);
    });
    setTeams(newTeams);
  };

  const movePlayerToTeam = (playerId: string, toTeamId: string) => {
    soundPlayer.play("click");
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        playerIds: t.id === toTeamId
          ? [...t.playerIds.filter((id) => id !== playerId), playerId]
          : t.playerIds.filter((id) => id !== playerId),
      }))
    );
  };

  const handleConfirmTeams = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirm(selectedFormatId, teams);
  };

  // ── Team Assignment Screen ────────────────────────────────
  if (showTeamAssignment) {
    return (
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => setShowTeamAssignment(false)}
            style={s.headerBackBtn}
          >
            <Ionicons name="chevron-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Assign Teams</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          <Text style={s.teamSubtitle}>
            Drag players between teams for {selectedFormat.name}
          </Text>

          {teams.map((team) => (
            <View key={team.id} style={s.teamCard}>
              <Text style={s.teamCardTitle}>{team.name}</Text>
              {team.playerIds.map((pid) => {
                const player = players.find((p) => p.playerId === pid);
                if (!player) return null;
                return (
                  <View key={pid} style={s.teamPlayerRow}>
                    <View style={s.teamPlayerAvatar}>
                      <Text style={s.teamPlayerInitial}>
                        {player.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={s.teamPlayerName} numberOfLines={1}>
                      {player.displayName}
                    </Text>
                    {/* Move to other team buttons */}
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {teams
                        .filter((t) => t.id !== team.id)
                        .map((otherTeam) => (
                          <TouchableOpacity
                            key={otherTeam.id}
                            onPress={() => movePlayerToTeam(pid, otherTeam.id)}
                            style={s.moveBtn}
                          >
                            <Text style={s.moveBtnText}>→ {otherTeam.name}</Text>
                          </TouchableOpacity>
                        ))}
                    </View>
                  </View>
                );
              })}
              {team.playerIds.length === 0 && (
                <Text style={s.teamEmpty}>No players assigned</Text>
              )}
            </View>
          ))}
        </ScrollView>

        {/* Bottom button */}
        <View style={s.bottomBar}>
          <TouchableOpacity style={s.continueBtn} onPress={handleConfirmTeams}>
            <Text style={s.continueBtnText}>Start Round</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Main Format Selection ─────────────────────────────────
  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.headerBackBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Game Format</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {Object.entries(groupedFormats).map(([category, formats]) => (
          <View key={category} style={s.categorySection}>
            {/* Category header */}
            <View style={s.categoryHeader}>
              <Ionicons
                name={getCategoryIcon(category) as any}
                size={18}
                color={GOLD}
              />
              <Text style={s.categoryLabel}>{getCategoryLabel(category)}</Text>
            </View>

            {/* Format cards — 2 per row */}
            <View style={s.cardGrid}>
              {formats.map((fmt) => {
                const isSelected = selectedFormatId === fmt.id;
                const badge = getScoringBadge(fmt.scoringMethod);

                return (
                  <TouchableOpacity
                    key={fmt.id}
                    style={[s.formatCard, isSelected && s.formatCardSelected]}
                    onPress={() => handleSelectFormat(fmt)}
                    activeOpacity={0.7}
                  >
                    {/* Icon */}
                    <View style={[s.formatIconWrap, isSelected && s.formatIconWrapSelected]}>
                      <Ionicons
                        name={fmt.icon as any}
                        size={24}
                        color={isSelected ? "#FFF" : WALNUT}
                      />
                    </View>

                    {/* Name */}
                    <Text
                      style={[s.formatName, isSelected && s.formatNameSelected]}
                      numberOfLines={2}
                    >
                      {fmt.name}
                    </Text>

                    {/* Description */}
                    <Text style={s.formatDesc} numberOfLines={2}>
                      {fmt.description}
                    </Text>

                    {/* Scoring badge */}
                    <View style={[s.scoringBadge, { backgroundColor: badge.color + "18" }]}>
                      <Text style={[s.scoringBadgeText, { color: badge.color }]}>
                        {badge.label}
                      </Text>
                    </View>

                    {/* Selected check */}
                    {isSelected && (
                      <View style={s.selectedCheck}>
                        <Ionicons name="checkmark-circle" size={22} color={GREEN} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        {/* Selected format detail */}
        {selectedFormat && (
          <View style={s.detailCard}>
            <View style={s.detailHeader}>
              <Ionicons name={selectedFormat.icon as any} size={20} color={GREEN} />
              <Text style={s.detailTitle}>{selectedFormat.name}</Text>
            </View>
            <Text style={s.detailRules}>{selectedFormat.rulesSummary}</Text>
            <View style={s.detailChips}>
              {selectedFormat.supports9Hole && (
                <View style={s.chip}>
                  <Text style={s.chipText}>9-Hole ✓</Text>
                </View>
              )}
              {selectedFormat.supports18Hole && (
                <View style={s.chip}>
                  <Text style={s.chipText}>18-Hole ✓</Text>
                </View>
              )}
              {selectedFormat.holeByHole && (
                <View style={s.chip}>
                  <Text style={s.chipText}>Hole-by-Hole</Text>
                </View>
              )}
              {selectedFormat.handicapMode !== "scratch" && (
                <View style={s.chip}>
                  <Text style={s.chipText}>Handicap: {selectedFormat.handicapMode}</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom button */}
      <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={s.continueBtn} onPress={handleContinue}>
          <Text style={s.continueBtnText}>
            {selectedFormat.playersPerTeam > 1 ? "Assign Teams" : "Select Partners"}
          </Text>
          <Ionicons name="arrow-forward" size={18} color="#FFF" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },

  // Header
  header: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: HEADER_GREEN,
    flexDirection: "row",
    alignItems: "center",
  },
  headerBackBtn: { padding: 4, marginRight: 8 },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    textAlign: "center",
  },

  // Category sections
  categorySection: { marginBottom: 20 },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: WALNUT,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  // Card grid
  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  // Format card
  formatCard: {
    width: "48%" as any,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    minHeight: 140,
  },
  formatCardSelected: {
    borderColor: GREEN,
    backgroundColor: "#F0FFF4",
  },
  formatIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: CREAM,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  formatIconWrapSelected: {
    backgroundColor: GREEN,
  },
  formatName: {
    fontSize: 14,
    fontWeight: "800",
    color: WALNUT,
    marginBottom: 4,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  formatNameSelected: {
    color: GREEN,
  },
  formatDesc: {
    fontSize: 11,
    color: "#888",
    lineHeight: 15,
    marginBottom: 8,
  },
  scoringBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  scoringBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  selectedCheck: {
    position: "absolute",
    top: 10,
    right: 10,
  },

  // Detail card (expanded rules)
  detailCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderLeftWidth: 4,
    borderLeftColor: GREEN,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: WALNUT,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  detailRules: {
    fontSize: 13,
    color: "#555",
    lineHeight: 19,
    marginBottom: 10,
  },
  detailChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    backgroundColor: CREAM,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
    color: WALNUT,
  },

  // Bottom bar
  bottomBar: {
    backgroundColor: HEADER_GREEN,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  continueBtn: {
    backgroundColor: GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
  },
  continueBtnText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "800",
  },

  // Team assignment
  teamSubtitle: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginBottom: 16,
  },
  teamCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  teamCardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: WALNUT,
    marginBottom: 10,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  teamPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  teamPlayerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  teamPlayerInitial: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
  teamPlayerName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: WALNUT,
  },
  moveBtn: {
    backgroundColor: CREAM,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  moveBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: WALNUT,
  },
  teamEmpty: {
    fontSize: 13,
    color: "#BBB",
    fontStyle: "italic",
    paddingVertical: 8,
  },
});