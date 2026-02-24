/**
 * OutingReview — Pre-launch summary screen
 *
 * Read-only view of the outing setup before the organizer confirms launch.
 * Shows course, format, all groups with markers and starting holes,
 * validation warnings, and a "Launch Outing" button.
 *
 * Fix: FORMAT_NAMES now covers all actual format IDs (stroke_play, individual_stableford, etc.)
 *
 * File: components/outings/OutingReview.tsx
 */

import type {
  OutingGroup,
  OutingPlayer
} from "@/constants/outingTypes";
import { getGroupPlayers, validateOutingSetup } from "@/utils/outingHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import OutingGroupCard from "./OutingGroupCard";

const GREEN = "#0D5C3A";
const HEADER_GREEN = "#147A52";
const CREAM = "#F4EED8";
const GOLD = "#C5A55A";
const WALNUT = "#4A3628";

// Comprehensive format display names — keys must match gameFormats.ts IDs
const FORMAT_NAMES: Record<string, string> = {
  stroke_play: "Stroke Play",
  stroke: "Stroke Play",
  individual_stableford: "Stableford",
  stableford: "Stableford",
  par_bogey: "Par/Bogey",
  match_play: "Match Play",
  match: "Match Play",
  best_ball: "Best Ball",
  four_ball: "Four-Ball",
  scramble: "Scramble",
  alternate_shot: "Alternate Shot",
  foursomes: "Foursomes",
  shamble: "Shamble",
  skins: "Skins",
  nassau: "Nassau",
  chapman: "Chapman",
  greensome: "Greensome",
};

/** Convert formatId to human-readable name with fallback */
function getFormatDisplayName(formatId: string): string {
  if (FORMAT_NAMES[formatId]) return FORMAT_NAMES[formatId];
  // Fallback: convert snake_case to Title Case
  return formatId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

interface OutingReviewProps {
  courseName: string;
  holeCount: 9 | 18;
  nineHoleSide?: "front" | "back";
  formatId: string;
  roster: OutingPlayer[];
  groups: OutingGroup[];
  outingName?: string;
  launching?: boolean;
  onLaunch: (roster: OutingPlayer[], groups: OutingGroup[]) => void;
  onBack: () => void;
}

export default function OutingReview({
  courseName,
  holeCount,
  nineHoleSide,
  formatId,
  roster,
  groups,
  outingName,
  launching = false,
  onLaunch,
  onBack,
}: OutingReviewProps) {
  const warnings = useMemo(
    () => validateOutingSetup(roster, groups),
    [roster, groups]
  );

  const criticalWarnings = warnings.filter(
    (w) => w.type === "ghost_marker" || w.type === "no_marker"
  );
  const hasCritical = criticalWarnings.length > 0;

  const formatName = getFormatDisplayName(formatId);
  const totalPlayers = roster.length;
  const totalGroups = groups.length;
  const hasShotgun = groups.some((g) => g.startingHole !== 1);

  const handleLaunch = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    if (hasCritical) {
      Alert.alert(
        "Cannot Launch",
        "Some groups have no on-platform scorekeeper. Every group needs at least one on-platform player designated as the scorer.",
        [{ text: "OK" }]
      );
      return;
    }

    if (warnings.length > 0) {
      Alert.alert(
        "Launch with Warnings?",
        `There ${warnings.length === 1 ? "is" : "are"} ${warnings.length} warning${warnings.length !== 1 ? "s" : ""}. Do you want to continue?`,
        [
          { text: "Review", style: "cancel" },
          {
            text: "Launch Anyway",
            style: "default",
            onPress: () => onLaunch(roster, groups),
          },
        ]
      );
      return;
    }

    onLaunch(roster, groups);
  };

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scrollArea}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
      >
        {/* ── Summary Card ── */}
        <View style={s.summaryCard}>
          {outingName && (
            <Text style={s.outingName}>{outingName}</Text>
          )}

          <View style={s.summaryRow}>
            <Ionicons name="golf-outline" size={18} color={HEADER_GREEN} />
            <View style={s.summaryInfo}>
              <Text style={s.summaryLabel}>Course</Text>
              <Text style={s.summaryValue}>{courseName}</Text>
            </View>
          </View>

          <View style={s.summaryDivider} />

          <View style={s.summaryRow}>
            <Ionicons name="flag-outline" size={18} color={HEADER_GREEN} />
            <View style={s.summaryInfo}>
              <Text style={s.summaryLabel}>Format</Text>
              <Text style={s.summaryValue}>
                {formatName} • {holeCount} Holes
                {nineHoleSide ? ` (${nineHoleSide === "front" ? "Front" : "Back"} 9)` : ""}
              </Text>
            </View>
          </View>

          <View style={s.summaryDivider} />

          <View style={s.summaryRow}>
            <Ionicons name="people-outline" size={18} color={HEADER_GREEN} />
            <View style={s.summaryInfo}>
              <Text style={s.summaryLabel}>Players & Groups</Text>
              <Text style={s.summaryValue}>
                {totalPlayers} player{totalPlayers !== 1 ? "s" : ""} in{" "}
                {totalGroups} group{totalGroups !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>

          {hasShotgun && (
            <>
              <View style={s.summaryDivider} />
              <View style={s.summaryRow}>
                <Ionicons name="megaphone-outline" size={18} color={GOLD} />
                <View style={s.summaryInfo}>
                  <Text style={s.summaryLabel}>Start Type</Text>
                  <Text style={s.summaryValue}>Shotgun Start</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* ── Groups ── */}
        <Text style={s.sectionTitle}>Groups</Text>

        {groups.map((group) => (
          <OutingGroupCard
            key={group.groupId}
            group={group}
            players={getGroupPlayers(roster, group.groupId)}
            mode="review"
            holeCount={holeCount}
            nineHoleSide={nineHoleSide}
          />
        ))}

        {/* ── Warnings ── */}
        {warnings.length > 0 && (
          <View style={s.warningsSection}>
            <View style={s.warningsHeader}>
              <Ionicons name="alert-circle" size={18} color="#FF9500" />
              <Text style={s.warningsTitle}>
                {warnings.length} Warning{warnings.length !== 1 ? "s" : ""}
              </Text>
            </View>
            {warnings.map((w, i) => (
              <View key={`warn-${i}`} style={s.warningRow}>
                <Ionicons
                  name={
                    w.type === "ghost_marker" || w.type === "no_marker"
                      ? "close-circle"
                      : "alert-circle-outline"
                  }
                  size={15}
                  color={
                    w.type === "ghost_marker" || w.type === "no_marker"
                      ? "#FF3B30"
                      : "#FF9500"
                  }
                />
                <Text
                  style={[
                    s.warningText,
                    (w.type === "ghost_marker" || w.type === "no_marker") &&
                      s.warningTextCritical,
                  ]}
                >
                  {w.message}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── What happens next ── */}
        <View style={s.infoCard}>
          <Text style={s.infoTitle}>What happens when you launch?</Text>
          <View style={s.infoItem}>
            <Ionicons name="checkmark-circle" size={16} color={HEADER_GREEN} />
            <Text style={s.infoText}>
              A separate scorecard is created for each group
            </Text>
          </View>
          <View style={s.infoItem}>
            <Ionicons name="notifications" size={16} color={HEADER_GREEN} />
            <Text style={s.infoText}>
              Group scorers are notified to start scoring
            </Text>
          </View>
          <View style={s.infoItem}>
            <Ionicons name="stats-chart" size={16} color={HEADER_GREEN} />
            <Text style={s.infoText}>
              A live leaderboard tracks all groups in real time
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Bottom Buttons ── */}
      <View style={s.bottomBar}>
        <TouchableOpacity style={s.editBtn} onPress={onBack}>
          <Ionicons name="chevron-back" size={18} color={GREEN} />
          <Text style={s.editBtnText}>Edit Groups</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            s.launchBtn,
            (hasCritical || launching) && s.launchBtnDisabled,
          ]}
          onPress={handleLaunch}
          disabled={launching}
        >
          {launching ? (
            <Text style={s.launchBtnText}>Launching...</Text>
          ) : (
            <>
              <Ionicons name="rocket" size={18} color="#FFF" />
              <Text style={s.launchBtnText}>Launch Outing</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  summaryCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8E4DA",
    padding: 16,
    marginBottom: 20,
  },
  outingName: {
    fontSize: 18,
    fontWeight: "700",
    color: WALNUT,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    marginBottom: 14,
    textAlign: "center",
  },
  summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  summaryInfo: { flex: 1 },
  summaryLabel: { fontSize: 12, fontWeight: "600", color: "#999", textTransform: "uppercase", letterSpacing: 0.5 },
  summaryValue: { fontSize: 15, fontWeight: "600", color: "#333", marginTop: 2 },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E8E4DA",
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    marginBottom: 12,
  },
  warningsSection: {
    backgroundColor: "#FFF8E1",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FFE0B2",
    marginBottom: 16,
    gap: 8,
  },
  warningsHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  warningsTitle: { fontSize: 14, fontWeight: "700", color: "#E65100" },
  warningRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  warningText: { fontSize: 13, color: "#666", flex: 1, lineHeight: 18 },
  warningTextCritical: { color: "#FF3B30", fontWeight: "600" },
  infoCard: {
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: GREEN,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    marginBottom: 2,
  },
  infoItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoText: { fontSize: 13, color: "#333", flex: 1 },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 12,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#E8E4DA",
    gap: 10,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: GREEN,
  },
  editBtnText: { fontSize: 15, fontWeight: "700", color: GREEN },
  launchBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GREEN,
    paddingVertical: 14,
    borderRadius: 12,
  },
  launchBtnDisabled: { opacity: 0.4 },
  launchBtnText: { fontSize: 16, fontWeight: "700", color: "#FFF" },
});