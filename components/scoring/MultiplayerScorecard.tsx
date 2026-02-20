/**
 * MultiplayerScorecard — Heritage-styled grid scorecard for group play
 *
 * Grid layout (top to bottom):
 *   HOLE  | 1  2  3 ... 9 | OUT
 *   YARDS | yardage per hole
 *   PAR   | par per hole
 *   S.I.  | stroke index per hole (with info icon)
 *   [Player rows with handicap stroke dots]
 *
 * Features:
 *   - Front 9 / Back 9 tab toggle (18-hole rounds)
 *   - Yardage row from hole data
 *   - Stroke Index row with (i) info modal
 *   - Handicap stroke dots (•/••) on player score cells
 *   - Per-player score entry with format-aware display
 *   - Active hole column highlight (gold)
 *   - Auto-advance when last player score is entered
 *   - Post-hole stats sheet integration
 *   - Green header, cream background, serif fonts
 *   - Score cell color coding: birdie (red circle), eagle (gold), bogey/double (square)
 *
 * File: components/scoring/MultiplayerScorecard.tsx
 */

import {
    getBack9Par,
    getBack9Yardage,
    getFront9Par,
    getFront9Yardage,
    getStrokesForHole,
    getTotalPar,
    getTotalYardage,
} from "@/components/leagues/post-score/helpers";
import type { HoleInfo } from "@/components/leagues/post-score/types";
import { getFormatById } from "@/constants/gameFormats";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import PostHoleStatsSheet from "./PostHoleStatsSheet";
import type { HolePlayerData, PlayerSlot } from "./scoringTypes";

// ============================================================================
// TYPES
// ============================================================================

export type ScorecardMode = "edit" | "view" | "review";

interface MultiplayerScorecardProps {
  mode: ScorecardMode;
  formatId: string;
  players: PlayerSlot[];
  holeCount: 9 | 18;
  holes: HoleInfo[];
  holeData: Record<string, Record<string, HolePlayerData>>;
  onScoreChange?: (holeNum: number, playerId: string, strokes: number | null) => void;
  onHoleComplete?: (holeNum: number, stats: Record<string, { fir: boolean | null; gir: boolean | null; dtp: string | null }>) => void;
  statsSheetSuppressed?: boolean;
  onEnableStatsSheet?: () => void;
  dtpEligiblePlayers?: Set<string>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const WALNUT = "#4A3628";
const HEADER_GREEN = "#147A52";
const GOLD = "#C5A55A";
const GREEN = "#0D5C3A";
const CREAM = "#F4EED8";
const CREAM_LIGHT = "#FFFCF0";

const CELL_W = 38;
const LABEL_W = 70;
const TOTAL_W = 46;

// ============================================================================
// COMPONENT
// ============================================================================

export default function MultiplayerScorecard({
  mode,
  formatId,
  players,
  holeCount,
  holes,
  holeData,
  onScoreChange,
  onHoleComplete,
  statsSheetSuppressed = false,
  onEnableStatsSheet,
  dtpEligiblePlayers,
}: MultiplayerScorecardProps) {
  const format = getFormatById(formatId);
  const isEdit = mode === "edit";
  const is18 = holeCount === 18;

  // ── State ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"front" | "back">("front");
  const [activeHole, setActiveHole] = useState(1);
  const [showStatsSheet, setShowStatsSheet] = useState(false);
  const [pendingStatsHole, setPendingStatsHole] = useState<number | null>(null);
  const [consecutiveSkips, setConsecutiveSkips] = useState(0);
  const [holeStats, setHoleStats] = useState<
    Record<string, { fir: boolean | null; gir: boolean | null; dtp: string | null }>
  >({});
  const [infoModal, setInfoModal] = useState<string | null>(null);
  // Track which holes have already triggered stats so we don't re-trigger
  const completedStatsHoles = useRef<Set<number>>(new Set());
  // Track whether round is fully complete (all holes scored)
  const [roundComplete, setRoundComplete] = useState(false);

  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const hasAutoFlipped = useRef(false);

  // ── Derived ────────────────────────────────────────────────
  const startIdx = activeTab === "front" ? 0 : 9;
  const endIdx = activeTab === "front" ? (is18 ? 9 : holeCount) : 18;
  const sliceHoles = holes.slice(startIdx, endIdx);
  const nineLabel = activeTab === "back" ? "IN" : "OUT";

  // ── Get score for a player on a hole ──────────────────────
  const getScore = useCallback(
    (holeNum: number, playerId: string): number | null => {
      return holeData[String(holeNum)]?.[playerId]?.strokes ?? null;
    },
    [holeData]
  );

  // ── Get player total for front/back/all ───────────────────
  const getPlayerTotal = useCallback(
    (playerId: string, from: number, to: number): number | null => {
      let total = 0;
      let hasAny = false;
      for (let h = from; h <= to; h++) {
        const s = getScore(h, playerId);
        if (s !== null) { total += s; hasAny = true; }
        else return null;
      }
      return hasAny ? total : null;
    },
    [getScore]
  );

  // ── Get player net total ──────────────────────────────────
  const getPlayerNetTotal = useCallback(
    (player: PlayerSlot, from: number, to: number): number | null => {
      let total = 0;
      for (let h = from; h <= to; h++) {
        const s = getScore(h, player.playerId);
        if (s === null) return null;
        const strokes = getStrokesForHole(holes[h - 1]?.handicap, player.courseHandicap, holeCount);
        total += s - strokes;
      }
      return total;
    },
    [getScore, holes, holeCount]
  );

  // ── Get score-to-par for display ──────────────────────────
  const getScoreToPar = useCallback(
    (playerId: string): string => {
      let score = 0;
      let par = 0;
      let holesPlayed = 0;
      for (let h = 1; h <= holeCount; h++) {
        const s = getScore(h, playerId);
        if (s !== null) {
          score += s;
          par += holes[h - 1]?.par || 4;
          holesPlayed++;
        }
      }
      if (holesPlayed === 0) return "E";
      const diff = score - par;
      if (diff === 0) return "E";
      return diff > 0 ? `+${diff}` : `${diff}`;
    },
    [getScore, holes, holeCount]
  );

  // ── Score color coding ────────────────────────────────────
  const getScoreStyle = (score: number | null, par: number) => {
    if (score === null) return {};
    const diff = score - par;
    if (diff <= -2) return cs.cellEagle;
    if (diff === -1) return cs.cellBirdie;
    if (diff === 1) return cs.cellBogey;
    if (diff >= 2) return cs.cellDouble;
    return {};
  };

  const getScoreTextColor = (score: number | null, par: number) => {
    if (score === null) return "#999";
    const diff = score - par;
    if (diff <= -2) return "#FFF";
    if (diff === -1) return "#E53935";
    return "#333";
  };

  // ── Check if hole is complete (all players have scores) ───
  const isHoleComplete = useCallback(
    (holeNum: number): boolean => {
      return players.every((p) => getScore(holeNum, p.playerId) !== null);
    },
    [players, getScore]
  );

  // ── Auto-advance logic (BUG 1 FIX) ───────────────────────
  // Only trigger stats/advance if:
  //   - We're in edit mode
  //   - The active hole is complete
  //   - We haven't already triggered stats for this hole
  //   - The stats sheet isn't already showing
  //   - The round isn't already complete
  useEffect(() => {
    if (!isEdit) return;
    if (roundComplete) return;
    if (showStatsSheet) return;
    if (!isHoleComplete(activeHole)) return;
    if (completedStatsHoles.current.has(activeHole)) return;

    // Mark this hole so we never re-trigger it
    completedStatsHoles.current.add(activeHole);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (statsSheetSuppressed || consecutiveSkips >= 3) {
      advanceToNextHole(activeHole);
    } else {
      initStatsForHole(activeHole);
      setPendingStatsHole(activeHole);
      setShowStatsSheet(true);
    }
  }, [holeData, activeHole, isEdit, showStatsSheet, roundComplete]);

  // ── Auto-flip to back 9 (BUG 2 FIX) ─────────────────────
  // Don't flip while the stats sheet is open
  useEffect(() => {
    if (!is18 || hasAutoFlipped.current || activeTab !== "front") return;
    if (showStatsSheet) return; // Wait until stats sheet is dismissed

    const allFrontComplete = Array.from({ length: 9 }, (_, i) => i + 1).every((h) =>
      isHoleComplete(h)
    );

    if (allFrontComplete) {
      hasAutoFlipped.current = true;
      setTimeout(() => setActiveTab("back"), 400);
    }
  }, [holeData, is18, activeTab, showStatsSheet]);

  // ── Init stats for a hole ─────────────────────────────────
  const initStatsForHole = (holeNum: number) => {
    const stats: Record<string, { fir: boolean | null; gir: boolean | null; dtp: string | null }> = {};
    for (const p of players) {
      stats[p.playerId] = { fir: null, gir: null, dtp: null };
    }
    setHoleStats(stats);
  };

  // ── Advance to next hole ──────────────────────────────────
  const advanceToNextHole = (completedHole: number) => {
    const next = completedHole + 1;

    // If we've finished the last hole, mark round complete and stop
    if (next > holeCount) {
      setRoundComplete(true);
      return;
    }

    setActiveHole(next);

    if (is18 && next > 9 && activeTab === "front" && !showStatsSheet) {
      hasAutoFlipped.current = true;
      setTimeout(() => setActiveTab("back"), 300);
    }

    setTimeout(() => {
      const key = `${next}-${players[0]?.playerId}`;
      inputRefs.current[key]?.focus();
    }, 200);
  };

  // ── Stats sheet handlers ──────────────────────────────────
  const handleStatsToggle = useCallback(
    (playerId: string, stat: "fir" | "gir") => {
      setHoleStats((prev) => {
        const playerStats = prev[playerId] || { fir: null, gir: null, dtp: null };
        const current = playerStats[stat];
        const next = current === null ? true : current === true ? false : null;
        return { ...prev, [playerId]: { ...playerStats, [stat]: next } };
      });
    },
    []
  );

  const handleStatsDtpChange = useCallback(
    (playerId: string, value: string) => {
      setHoleStats((prev) => {
        const playerStats = prev[playerId] || { fir: null, gir: null, dtp: null };
        return { ...prev, [playerId]: { ...playerStats, dtp: value || null } };
      });
    },
    []
  );

  const handleStatsSave = useCallback(() => {
    if (pendingStatsHole === null) return;
    setShowStatsSheet(false);
    setConsecutiveSkips(0);
    onHoleComplete?.(pendingStatsHole, holeStats);
    advanceToNextHole(pendingStatsHole);
    setPendingStatsHole(null);
  }, [pendingStatsHole, holeStats, onHoleComplete]);

  const handleStatsSkip = useCallback(() => {
    if (pendingStatsHole === null) return;
    setShowStatsSheet(false);
    setConsecutiveSkips((prev) => prev + 1);
    onHoleComplete?.(pendingStatsHole, {});
    advanceToNextHole(pendingStatsHole);
    setPendingStatsHole(null);
  }, [pendingStatsHole, onHoleComplete]);

  // ── Score change handler ──────────────────────────────────
  const handleScoreInput = useCallback(
    (holeNum: number, playerId: string, value: string) => {
      const numValue = value === "" ? null : parseInt(value, 10);
      if (numValue !== null && (isNaN(numValue) || numValue < 1 || numValue > 15)) return;
      onScoreChange?.(holeNum, playerId, numValue);

      if (numValue !== null) {
        const playerIdx = players.findIndex((p) => p.playerId === playerId);
        if (playerIdx < players.length - 1) {
          const nextKey = `${holeNum}-${players[playerIdx + 1].playerId}`;
          setTimeout(() => inputRefs.current[nextKey]?.focus(), 50);
        }
      }
    },
    [onScoreChange, players]
  );

  // ── Tap on a previous hole to edit ────────────────────────
  const handleCellTap = useCallback(
    (holeNum: number, playerId: string) => {
      if (!isEdit) return;
      setActiveHole(holeNum);
      const key = `${holeNum}-${playerId}`;
      setTimeout(() => inputRefs.current[key]?.focus(), 50);
    },
    [isEdit]
  );

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  /** Render the hole header row */
  const renderHoleRow = () => (
    <View style={cs.row}>
      <View style={[cs.labelCell, cs.greenBg]}>
        <Text style={cs.labelTextWhite}>HOLE</Text>
      </View>
      {sliceHoles.map((_, idx) => {
        const hNum = startIdx + idx + 1;
        const isActive = isEdit && hNum === activeHole;
        return (
          <View
            key={`h-${hNum}`}
            style={[cs.cell, cs.greenBg, isActive && cs.activeHoleHeader]}
          >
            <Text style={[cs.holeNum, isActive && cs.activeHoleNum]}>
              {hNum}
            </Text>
          </View>
        );
      })}
      <View style={[cs.totalCell, cs.greenBg]}>
        <Text style={cs.labelTextGold}>{nineLabel}</Text>
      </View>
      {activeTab === "back" && (
        <View style={[cs.totalCell, cs.greenBg]}>
          <Text style={cs.labelTextGold}>TOT</Text>
        </View>
      )}
    </View>
  );

  /** Render the yardage row */
  const renderYardageRow = () => (
    <View style={cs.row}>
      <View style={cs.labelCell}>
        <Text style={cs.labelText}>YARDS</Text>
      </View>
      {sliceHoles.map((hole, idx) => {
        const hNum = startIdx + idx + 1;
        const isActive = isEdit && hNum === activeHole;
        return (
          <View key={`y-${hNum}`} style={[cs.cell, isActive && cs.activeCol]}>
            <Text style={cs.yardageText}>{hole.yardage ?? ""}</Text>
          </View>
        );
      })}
      <View style={cs.totalCell}>
        <Text style={cs.totalText}>
          {activeTab === "back"
            ? getBack9Yardage(holes, holeCount)
            : getFront9Yardage(holes)}
        </Text>
      </View>
      {activeTab === "back" && (
        <View style={cs.totalCell}>
          <Text style={cs.totalText}>{getTotalYardage(holes, holeCount)}</Text>
        </View>
      )}
    </View>
  );

  /** Render the par row */
  const renderParRow = () => (
    <View style={cs.row}>
      <View style={cs.labelCell}>
        <Text style={cs.labelText}>PAR</Text>
      </View>
      {sliceHoles.map((hole, idx) => {
        const hNum = startIdx + idx + 1;
        const isActive = isEdit && hNum === activeHole;
        return (
          <View key={`p-${hNum}`} style={[cs.cell, isActive && cs.activeCol]}>
            <Text style={cs.parText}>{hole.par}</Text>
          </View>
        );
      })}
      <View style={cs.totalCell}>
        <Text style={cs.totalText}>
          {activeTab === "back"
            ? getBack9Par(holes, holeCount)
            : getFront9Par(holes)}
        </Text>
      </View>
      {activeTab === "back" && (
        <View style={cs.totalCell}>
          <Text style={cs.totalText}>{getTotalPar(holes, holeCount)}</Text>
        </View>
      )}
    </View>
  );

  /** Render the stroke index row */
  const renderStrokeIndexRow = () => (
    <View style={[cs.row, cs.siRow]}>
      <View style={cs.labelCell}>
        <View style={cs.labelWithInfo}>
          <Text style={cs.labelText}>S.I.</Text>
          <TouchableOpacity
            onPress={() => setInfoModal("SI")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="information-circle-outline" size={13} color="#999" />
          </TouchableOpacity>
        </View>
      </View>
      {sliceHoles.map((hole, idx) => {
        const hNum = startIdx + idx + 1;
        const isActive = isEdit && hNum === activeHole;
        return (
          <View key={`si-${hNum}`} style={[cs.cell, cs.siCell, isActive && cs.activeCol]}>
            <Text style={cs.siText}>{hole.handicap ?? "-"}</Text>
          </View>
        );
      })}
      <View style={cs.totalCell}>
        <Text style={cs.totalText} />
      </View>
      {activeTab === "back" && (
        <View style={cs.totalCell}>
          <Text style={cs.totalText} />
        </View>
      )}
    </View>
  );

  /** Render a player's score row */
  const renderPlayerRow = (player: PlayerSlot) => {
    const scoreToPar = getScoreToPar(player.playerId);
    const frontTotal = getPlayerTotal(player.playerId, 1, is18 ? 9 : holeCount);
    const backTotal = is18 ? getPlayerTotal(player.playerId, 10, 18) : null;
    const grandTotal = getPlayerTotal(player.playerId, 1, holeCount);

    return (
      <View key={player.playerId} style={cs.row}>
        {/* Frozen left: name + to-par */}
        <View style={[cs.labelCell, cs.playerLabelCell]}>
          <Text style={cs.playerName} numberOfLines={1}>
            {player.displayName}
          </Text>
          <Text
            style={[
              cs.playerToPar,
              scoreToPar.startsWith("-") && cs.toParUnder,
              scoreToPar.startsWith("+") && cs.toParOver,
            ]}
          >
            {scoreToPar}
          </Text>
        </View>

        {/* Score cells */}
        {sliceHoles.map((hole, idx) => {
          const hNum = startIdx + idx + 1;
          const score = getScore(hNum, player.playerId);
          const isActive = isEdit && hNum === activeHole;
          const strokes = getStrokesForHole(hole.handicap, player.courseHandicap, holeCount);

          return (
            <TouchableOpacity
              key={`s-${hNum}-${player.playerId}`}
              style={[cs.cell, isActive && cs.activeCol]}
              onPress={() => handleCellTap(hNum, player.playerId)}
              activeOpacity={isEdit ? 0.6 : 1}
              disabled={!isEdit}
            >
              {/* Handicap stroke dots */}
              {strokes > 0 && (
                <Text style={cs.strokeDot}>
                  {strokes >= 2 ? "••" : "•"}
                </Text>
              )}

              {isEdit && isActive ? (
                <TextInput
                  ref={(ref) => {
                    inputRefs.current[`${hNum}-${player.playerId}`] = ref;
                  }}
                  style={[cs.scoreInput, getScoreStyle(score, hole.par)]}
                  value={score?.toString() || ""}
                  onChangeText={(v) => handleScoreInput(hNum, player.playerId, v)}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                />
              ) : (
                <View style={[cs.scoreDisplay, getScoreStyle(score, hole.par)]}>
                  <Text
                    style={[
                      cs.scoreText,
                      { color: getScoreTextColor(score, hole.par) },
                    ]}
                  >
                    {score ?? ""}
                  </Text>
                  {/* Net subscript */}
                  {score !== null && strokes > 0 && (
                    <Text style={cs.netSubscript}>
                      {score - strokes}
                    </Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Nine total */}
        <View style={cs.totalCell}>
          <Text style={cs.playerTotalText}>
            {activeTab === "back" ? (backTotal ?? "-") : (frontTotal ?? "-")}
          </Text>
        </View>

        {/* Grand total */}
        {activeTab === "back" && (
          <View style={[cs.totalCell, cs.grandTotalCell]}>
            <Text style={cs.grandTotalText}>{grandTotal ?? "-"}</Text>
          </View>
        )}
      </View>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <View style={cs.container}>
      {/* Tab toggle for 18-hole rounds */}
      {is18 && (
        <View style={cs.tabBar}>
          {(["front", "back"] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[cs.tab, activeTab === tab && cs.tabActive]}
              onPress={() => {
                soundPlayer.play("click");
                setActiveTab(tab);
              }}
            >
              <Text style={[cs.tabText, activeTab === tab && cs.tabTextActive]}>
                {tab === "front" ? "Front 9" : "Back 9"}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Enable stats button (if suppressed) */}
          {isEdit && (statsSheetSuppressed || consecutiveSkips >= 3) && onEnableStatsSheet && (
            <TouchableOpacity
              style={cs.statsToggle}
              onPress={() => {
                soundPlayer.play("click");
                setConsecutiveSkips(0);
                onEnableStatsSheet();
              }}
            >
              <Ionicons name="stats-chart" size={14} color={GREEN} />
              <Text style={cs.statsToggleText}>Stats</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Scorecard grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={cs.grid}>
          {renderHoleRow()}
          {renderYardageRow()}
          {renderParRow()}
          {renderStrokeIndexRow()}
          {players.map((p) => renderPlayerRow(p))}
        </View>
      </ScrollView>

      {/* Post-hole stats sheet */}
      {isEdit && pendingStatsHole !== null && (
        <PostHoleStatsSheet
          visible={showStatsSheet}
          holeNumber={pendingStatsHole}
          holeInfo={holes[pendingStatsHole - 1]}
          players={players}
          playerStats={holeStats}
          dtpEligiblePlayers={dtpEligiblePlayers}
          onToggleStat={handleStatsToggle}
          onDtpChange={handleStatsDtpChange}
          onSave={handleStatsSave}
          onSkip={handleStatsSkip}
        />
      )}

      {/* S.I. Info Modal */}
      <Modal visible={infoModal === "SI"} transparent animationType="fade">
        <TouchableOpacity
          style={cs.modalOverlay}
          activeOpacity={1}
          onPress={() => setInfoModal(null)}
        >
          <View style={cs.modalCard}>
            <Text style={cs.modalTitle}>Stroke Index (S.I.)</Text>
            <Text style={cs.modalBody}>
              Holes are ranked 1-18 by difficulty, with 1 being the hardest. Your course handicap determines which holes you receive strokes on.
            </Text>
            <Text style={cs.modalBody}>
              A dot (•) on a hole means that player receives one handicap stroke there. Two dots (••) means two strokes. The net score shown as a small subscript reflects strokes received.
            </Text>
            <TouchableOpacity style={cs.modalBtn} onPress={() => setInfoModal(null)}>
              <Text style={cs.modalBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const cs = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CREAM,
  },

  // ── Tab Bar ─────────────────────────────────────────────────
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: CREAM_LIGHT,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E4DA",
    gap: 8,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: "#F0EDE4",
  },
  tabActive: {
    backgroundColor: HEADER_GREEN,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888",
  },
  tabTextActive: {
    color: "#FFF",
  },
  statsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "rgba(13, 92, 58, 0.08)",
  },
  statsToggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: GREEN,
  },

  // ── Grid ────────────────────────────────────────────────────
  grid: {
    flexDirection: "column",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#D5D0C5",
  },

  // ── Label Cell (frozen left) ────────────────────────────────
  labelCell: {
    width: LABEL_W,
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: "center",
    backgroundColor: "#F5F2EB",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "#D5D0C5",
  },
  labelWithInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  labelText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  labelTextWhite: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFF",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  labelTextGold: {
    fontSize: 11,
    fontWeight: "700",
    color: GOLD,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },

  // ── Player label ────────────────────────────────────────────
  playerLabelCell: {
    backgroundColor: CREAM_LIGHT,
    paddingVertical: 6,
  },
  playerName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#333",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  playerToPar: {
    fontSize: 11,
    fontWeight: "600",
    color: "#888",
    marginTop: 1,
  },
  toParUnder: {
    color: "#E53935",
  },
  toParOver: {
    color: "#333",
  },

  // ── Data Cells ──────────────────────────────────────────────
  cell: {
    width: CELL_W,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  greenBg: {
    backgroundColor: HEADER_GREEN,
  },
  activeCol: {
    backgroundColor: "rgba(197, 165, 90, 0.12)",
  },
  activeHoleHeader: {
    backgroundColor: GOLD,
  },
  holeNum: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  activeHoleNum: {
    color: HEADER_GREEN,
  },

  // ── Yardage ─────────────────────────────────────────────────
  yardageText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#999",
  },

  // ── Par ─────────────────────────────────────────────────────
  parText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },

  // ── Stroke Index ────────────────────────────────────────────
  siRow: {
    backgroundColor: "#FAFAF5",
  },
  siCell: {
    backgroundColor: "#FAFAF5",
  },
  siText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#AAA",
  },

  // ── Handicap Stroke Dots ────────────────────────────────────
  strokeDot: {
    fontSize: 8,
    color: HEADER_GREEN,
    fontWeight: "800",
    position: "absolute",
    top: 1,
    right: 4,
    letterSpacing: -1,
  },

  // ── Score Display (read-only) ───────────────────────────────
  scoreDisplay: {
    width: 30,
    height: 30,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreText: {
    fontSize: 15,
    fontWeight: "700",
  },
  netSubscript: {
    fontSize: 8,
    color: GREEN,
    fontWeight: "600",
    position: "absolute",
    bottom: 0,
    right: 1,
  },

  // ── Score Input (edit mode) ─────────────────────────────────
  scoreInput: {
    width: 32,
    height: 32,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    backgroundColor: "#FFFDE7",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: GOLD,
    color: "#333",
  },

  // ── Score cell color coding ─────────────────────────────────
  cellEagle: {
    backgroundColor: GOLD,
    borderRadius: 15,
  },
  cellBirdie: {
    borderWidth: 2,
    borderColor: "#E53935",
    borderRadius: 15,
  },
  cellBogey: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 2,
  },
  cellDouble: {
    borderWidth: 2,
    borderColor: "#333",
    borderRadius: 2,
  },

  // ── Total Cells ─────────────────────────────────────────────
  totalCell: {
    width: TOTAL_W,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    backgroundColor: "#F0EDE4",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "#D5D0C5",
  },
  totalText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
  },
  playerTotalText: {
    fontSize: 15,
    fontWeight: "700",
    color: HEADER_GREEN,
  },
  grandTotalCell: {
    backgroundColor: "#E8E2D5",
  },
  grandTotalText: {
    fontSize: 16,
    fontWeight: "800",
    color: HEADER_GREEN,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },

  // ── Info Modal ──────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  modalCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#333",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 10,
  },
  modalBtn: {
    marginTop: 8,
    alignSelf: "flex-end",
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: HEADER_GREEN,
    borderRadius: 8,
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },
});