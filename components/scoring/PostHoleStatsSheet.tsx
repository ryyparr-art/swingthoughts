/**
 * PostHoleStatsSheet — Per-hole stat entry for all players
 *
 * Slides up after the last player's score is entered on a hole.
 * Shows FIR/GIR toggles per player, DTP input on par 3s.
 * Skippable — after 3 consecutive skips, auto-suppresses.
 * The marker can re-enable via a button on the scorecard.
 *
 * File: components/scoring/PostHoleStatsSheet.tsx
 */

import type { HoleInfo } from "@/components/leagues/post-score/types";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PlayerSlot } from "./scoringTypes";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const SHEET_HEIGHT = 340;

// ============================================================================
// TYPES
// ============================================================================

interface PlayerHoleStats {
  fir: boolean | null;
  gir: boolean | null;
  dtp: string | null;
}

interface PostHoleStatsSheetProps {
  /** Whether the sheet is visible */
  visible: boolean;
  /** Current hole number (1-indexed) */
  holeNumber: number;
  /** Hole info (par, yardage, etc.) */
  holeInfo: HoleInfo;
  /** Players in the round */
  players: PlayerSlot[];
  /** Current stats per player for this hole: Map<playerId, stats> */
  playerStats: Record<string, PlayerHoleStats>;
  /** DTP-eligible players (set of playerIds) */
  dtpEligiblePlayers?: Set<string>;
  /** Called when a stat is toggled */
  onToggleStat: (playerId: string, stat: "fir" | "gir") => void;
  /** Called when DTP value changes */
  onDtpChange: (playerId: string, value: string) => void;
  /** Called when "Save & Next" is tapped */
  onSave: () => void;
  /** Called when "Skip" is tapped */
  onSkip: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PostHoleStatsSheet({
  visible,
  holeNumber,
  holeInfo,
  players,
  playerStats,
  dtpEligiblePlayers,
  onToggleStat,
  onDtpChange,
  onSave,
  onSkip,
}: PostHoleStatsSheetProps) {
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const insets = useSafeAreaInsets();

  const isPar3 = holeInfo.par <= 3;
  const showDtp = !isPar3 ? false : dtpEligiblePlayers && dtpEligiblePlayers.size > 0;

  const bottomPadding = Math.max(insets.bottom, 16);

  // ── Animate in/out ──────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
    }
    Animated.spring(translateY, {
      toValue: visible ? 0 : SHEET_HEIGHT + bottomPadding,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [visible, bottomPadding]);

  // ── Three-state toggle: null → true → false → null ──────────
  const handleToggle = useCallback(
    (playerId: string, stat: "fir" | "gir") => {
      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onToggleStat(playerId, stat);
    },
    [onToggleStat]
  );

  const handleSave = useCallback(() => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSave();
  }, [onSave]);

  const handleSkip = useCallback(() => {
    soundPlayer.play("click");
    onSkip();
  }, [onSkip]);

  // ── Stat toggle button renderer ─────────────────────────────
  const renderToggle = (
    value: boolean | null,
    onPress: () => void,
    label: string
  ) => {
    const isChecked = value === true;
    const isMissed = value === false;

    return (
      <TouchableOpacity
        style={[
          s.toggle,
          isChecked && s.toggleChecked,
          isMissed && s.toggleMissed,
        ]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Text style={[s.toggleLabel, (isChecked || isMissed) && s.toggleLabelActive]}>
          {label}
        </Text>
        {isChecked && <Ionicons name="checkmark" size={14} color="#FFF" />}
        {isMissed && <Ionicons name="close" size={14} color="#FFF" />}
        {value === null && <Ionicons name="remove-outline" size={14} color="#CCC" />}
      </TouchableOpacity>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Animated.View
      style={[
        s.container,
        {
          transform: [{ translateY }],
          paddingBottom: bottomPadding,
        },
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      {/* Handle bar */}
      <View style={s.handleBar}>
        <View style={s.handle} />
      </View>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Hole {holeNumber}</Text>
          <Text style={s.headerSubtitle}>Par {holeInfo.par}</Text>
        </View>
        <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
          <Text style={s.skipText}>Skip</Text>
          <Ionicons name="arrow-forward" size={16} color="#999" />
        </TouchableOpacity>
      </View>

      {/* Divider */}
      <View style={s.divider} />

      {/* Player Stat Rows */}
      <View style={s.playerList}>
        {players.map((player) => {
          const stats = playerStats[player.playerId] || {
            fir: null,
            gir: null,
            dtp: null,
          };

          return (
            <View key={player.playerId} style={s.playerRow}>
              {/* Name */}
              <View style={s.playerName}>
                <Text style={s.playerNameText} numberOfLines={1}>
                  {player.displayName}
                </Text>
              </View>

              {/* FIR (hidden on par 3) */}
              {!isPar3 ? (
                renderToggle(stats.fir, () => handleToggle(player.playerId, "fir"), "FIR")
              ) : (
                <View style={s.togglePlaceholder} />
              )}

              {/* GIR */}
              {renderToggle(stats.gir, () => handleToggle(player.playerId, "gir"), "GIR")}

              {/* DTP (only on par 3, only for eligible players) */}
              {showDtp && dtpEligiblePlayers?.has(player.playerId) ? (
                <TextInput
                  style={s.dtpInput}
                  value={stats.dtp || ""}
                  onChangeText={(v) => onDtpChange(player.playerId, v)}
                  keyboardType="decimal-pad"
                  maxLength={4}
                  placeholder="ft"
                  placeholderTextColor="#CCC"
                  selectTextOnFocus
                />
              ) : showDtp ? (
                <View style={s.togglePlaceholder} />
              ) : null}
            </View>
          );
        })}
      </View>

      {/* Save Button */}
      <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
        <Text style={s.saveBtnText}>Save & Next</Text>
        <Ionicons name="arrow-forward" size={18} color="#FFF" />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const s = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFCF0",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    paddingHorizontal: 16,
  },
  handleBar: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
  },

  // ── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#4A3628",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  skipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#F0EDE4",
  },
  skipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#999",
  },

  divider: {
    height: 1,
    backgroundColor: "#E8E4DA",
    marginBottom: 10,
  },

  // ── Player Rows ─────────────────────────────────────────────
  playerList: {
    flex: 1,
  },
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
  },
  playerName: {
    flex: 1,
    minWidth: 80,
  },
  playerNameText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  },

  // ── Toggle Buttons ──────────────────────────────────────────
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F0EDE4",
    minWidth: 64,
    justifyContent: "center",
  },
  toggleChecked: {
    backgroundColor: "#0D5C3A",
  },
  toggleMissed: {
    backgroundColor: "#CC3333",
  },
  toggleLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
  },
  toggleLabelActive: {
    color: "#FFF",
  },
  togglePlaceholder: {
    width: 64,
  },

  // ── DTP Input ───────────────────────────────────────────────
  dtpInput: {
    width: 56,
    height: 36,
    backgroundColor: "#FFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    padding: 0,
  },

  // ── Save Button ─────────────────────────────────────────────
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
});