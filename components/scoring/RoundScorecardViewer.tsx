/**
 * RoundScorecardViewer — Read-only scorecard modal for completed rounds
 *
 * Fetches the round document and renders a heritage-styled scorecard grid
 * with FIR/GIR stat indicator rows below each player's score row.
 *
 * Used by:
 *   - ProfileRoundCard (tap to view)
 *   - FeedActivityCarousel round_complete cards (tap to view)
 *
 * Data source: rounds/{roundId} Firestore document
 *
 * Updates:
 *   - Handwritten Caveat font on score cells (matching MultiplayerScorecard)
 *   - Larger stroke dots, net subscript, and cell padding
 *
 * File: components/scoring/RoundScorecardViewer.tsx
 */

import { getStrokesForHole } from "@/components/leagues/post-score/helpers";
import { db } from "@/constants/firebaseConfig";
import { getFormatById } from "@/constants/gameFormats";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ============================================================================
// TYPES
// ============================================================================

interface RoundPlayer {
  playerId: string;
  displayName: string;
  avatar?: string;
  courseHandicap: number;
  handicapIndex: number;
  courseRating: number;
  slopeRating: number;
  teeName?: string;
  isGhost?: boolean;
}

interface HolePlayerData {
  strokes: number | null;
  fir?: boolean | null;
  gir?: boolean | null;
  dtp?: string | null;
}

interface RoundDoc {
  courseId: number;
  courseName: string;
  formatId: string;
  holeCount: number;
  holePars: number[];
  holeYardages?: number[];
  holeHandicaps?: number[];
  holeData: Record<string, Record<string, HolePlayerData>>;
  players: RoundPlayer[];
  status: string;
  completedAt?: any;
  startedAt?: any;
  roundDescription?: string;
  roundImageUrl?: string;
  isSimulator?: boolean;
  liveScores?: Record<string, {
    currentGross: number;
    currentNet: number;
    holesCompleted: number;
    scoreToPar: number;
  }>;
}

interface RoundScorecardViewerProps {
  visible: boolean;
  roundId: string | null;
  onClose: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const HEADER_GREEN = "#147A52";
const GOLD = "#C5A55A";
const GREEN = "#0D5C3A";
const CREAM = "#F4EED8";
const CREAM_LIGHT = "#FFFCF0";

const CELL_W = 38;
const LABEL_W = 70;
const TOTAL_W = 46;

const HANDWRITTEN = "Caveat_400Regular";

// ============================================================================
// COMPONENT
// ============================================================================

export default function RoundScorecardViewer({
  visible,
  roundId,
  onClose,
}: RoundScorecardViewerProps) {
  const [roundData, setRoundData] = useState<RoundDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"front" | "back">("front");

  // ── Fetch round data ──────────────────────────────────────
  useEffect(() => {
    if (!visible || !roundId) return;

    setLoading(true);
    setError(null);
    setActiveTab("front");

    const fetchRound = async () => {
      try {
        const roundRef = doc(db, "rounds", roundId);
        const roundSnap = await getDoc(roundRef);

        if (!roundSnap.exists()) {
          setError("Round not found");
          setLoading(false);
          return;
        }

        setRoundData(roundSnap.data() as RoundDoc);
        setLoading(false);
      } catch (err) {
        console.error("❌ Error fetching round:", err);
        setError("Failed to load scorecard");
        setLoading(false);
      }
    };

    fetchRound();
  }, [visible, roundId]);

  // ── Derived data ──────────────────────────────────────────
  if (!roundData) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <SafeAreaView style={cs.container} edges={["top"]}>
          {renderHeader("Scorecard", onClose)}
          <View style={cs.centerContent}>
            {loading ? (
              <ActivityIndicator size="large" color={GREEN} />
            ) : (
              <>
                <Ionicons name="alert-circle-outline" size={48} color="#CCC" />
                <Text style={cs.errorText}>{error || "Round not found"}</Text>
              </>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  const { players, holeData, holePars, holeCount, formatId, courseName } = roundData;
  const is18 = holeCount === 18;
  const format = getFormatById(formatId);

  // Build HoleInfo-like objects from holePars + optional yardages/handicaps
  const holes = holePars.map((par, i) => ({
    par,
    yardage: roundData.holeYardages?.[i] ?? null,
    handicap: roundData.holeHandicaps?.[i] ?? null,
  }));

  const startIdx = activeTab === "front" ? 0 : 9;
  const endIdx = activeTab === "front" ? (is18 ? 9 : holeCount) : 18;
  const sliceHoles = holes.slice(startIdx, endIdx);
  const nineLabel = activeTab === "back" ? "IN" : "OUT";

  // ── Helper functions ──────────────────────────────────────
  const getScore = (holeNum: number, playerId: string): number | null => {
    return holeData[String(holeNum)]?.[playerId]?.strokes ?? null;
  };

  const getStat = (holeNum: number, playerId: string, stat: "fir" | "gir"): boolean | null => {
    return holeData[String(holeNum)]?.[playerId]?.[stat] ?? null;
  };

  const getPlayerTotal = (playerId: string, from: number, to: number): number | null => {
    let total = 0;
    let hasAny = false;
    for (let h = from; h <= to; h++) {
      const s = getScore(h, playerId);
      if (s !== null) { total += s; hasAny = true; }
      else return null;
    }
    return hasAny ? total : null;
  };

  const getScoreToPar = (playerId: string): string => {
    const live = roundData.liveScores?.[playerId];
    if (live) {
      const diff = live.scoreToPar;
      if (diff === 0) return "E";
      return diff > 0 ? `+${diff}` : `${diff}`;
    }
    let score = 0;
    let par = 0;
    for (let h = 1; h <= holeCount; h++) {
      const s = getScore(h, playerId);
      if (s !== null) {
        score += s;
        par += holes[h - 1]?.par || 4;
      }
    }
    if (score === 0) return "E";
    const diff = score - par;
    if (diff === 0) return "E";
    return diff > 0 ? `+${diff}` : `${diff}`;
  };

  const getStatCount = (playerId: string, stat: "fir" | "gir", from: number, to: number): { hit: number; possible: number } => {
    let hit = 0;
    let possible = 0;
    for (let h = from; h <= to; h++) {
      const val = getStat(h, playerId, stat);
      // For FIR: skip par 3s
      if (stat === "fir" && holes[h - 1]?.par === 3) continue;
      if (val !== null) {
        possible++;
        if (val) hit++;
      }
    }
    return { hit, possible };
  };

  // ── Score cell styling ────────────────────────────────────
  const getScoreStyle = (score: number | null, par: number) => {
    if (score === null) return {};
    const diff = score - par;
    if (diff <= -2) return cs.cellEagle;
    if (diff === -1) return cs.cellBirdie;
    if (diff === 1) return cs.cellBogey;
    if (diff >= 2) return cs.cellDouble;
    return {};
  };

  const getScoreTextColor = (score: number | null, par: number): string => {
    if (score === null) return "#999";
    const diff = score - par;
    if (diff <= -2) return "#FFF";
    if (diff === -1) return "#E53935";
    return "#333";
  };

  // ── Nine par total ────────────────────────────────────────
  const getNineParTotal = (from: number, to: number): number => {
    let total = 0;
    for (let h = from; h <= to; h++) {
      total += holes[h - 1]?.par || 0;
    }
    return total;
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const renderHoleRow = () => (
    <View style={cs.row}>
      <View style={[cs.labelCell, cs.greenBg]}>
        <Text style={cs.labelTextWhite}>HOLE</Text>
      </View>
      {sliceHoles.map((_, idx) => {
        const hNum = startIdx + idx + 1;
        return (
          <View key={`h-${hNum}`} style={[cs.cell, cs.greenBg]}>
            <Text style={cs.holeNum}>{hNum}</Text>
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

  const renderParRow = () => (
    <View style={cs.row}>
      <View style={cs.labelCell}>
        <Text style={cs.labelText}>PAR</Text>
      </View>
      {sliceHoles.map((hole, idx) => {
        const hNum = startIdx + idx + 1;
        return (
          <View key={`p-${hNum}`} style={cs.cell}>
            <Text style={cs.parText}>{hole.par}</Text>
          </View>
        );
      })}
      <View style={cs.totalCell}>
        <Text style={cs.totalText}>
          {activeTab === "back"
            ? getNineParTotal(10, 18)
            : getNineParTotal(1, is18 ? 9 : holeCount)}
        </Text>
      </View>
      {activeTab === "back" && (
        <View style={cs.totalCell}>
          <Text style={cs.totalText}>{getNineParTotal(1, 18)}</Text>
        </View>
      )}
    </View>
  );

  const renderYardageRow = () => {
    // Only show if yardage data exists
    const hasYardage = holes.some(h => h.yardage !== null);
    if (!hasYardage) return null;

    const getNineYardageTotal = (from: number, to: number): number => {
      let total = 0;
      for (let h = from; h <= to; h++) {
        total += holes[h - 1]?.yardage || 0;
      }
      return total;
    };

    return (
      <View style={cs.row}>
        <View style={cs.labelCell}>
          <Text style={cs.labelText}>YARDS</Text>
        </View>
        {sliceHoles.map((hole, idx) => {
          const hNum = startIdx + idx + 1;
          return (
            <View key={`y-${hNum}`} style={cs.cell}>
              <Text style={cs.yardageText}>{hole.yardage ?? ""}</Text>
            </View>
          );
        })}
        <View style={cs.totalCell}>
          <Text style={cs.totalText}>
            {activeTab === "back"
              ? getNineYardageTotal(10, 18)
              : getNineYardageTotal(1, is18 ? 9 : holeCount)}
          </Text>
        </View>
        {activeTab === "back" && (
          <View style={cs.totalCell}>
            <Text style={cs.totalText}>{getNineYardageTotal(1, 18)}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderStrokeIndexRow = () => {
    const hasHandicaps = holes.some(h => h.handicap !== null);
    if (!hasHandicaps) return null;

    return (
      <View style={[cs.row, cs.siRow]}>
        <View style={cs.labelCell}>
          <Text style={cs.labelText}>S.I.</Text>
        </View>
        {sliceHoles.map((hole, idx) => {
          const hNum = startIdx + idx + 1;
          return (
            <View key={`si-${hNum}`} style={[cs.cell, cs.siCell]}>
              <Text style={cs.siText}>{hole.handicap ?? "-"}</Text>
            </View>
          );
        })}
        <View style={cs.totalCell}><Text style={cs.totalText} /></View>
        {activeTab === "back" && <View style={cs.totalCell}><Text style={cs.totalText} /></View>}
      </View>
    );
  };

  /** Render a player's score row + FIR/GIR stats row */
  const renderPlayerBlock = (player: RoundPlayer, playerIndex: number) => {
    const scoreToPar = getScoreToPar(player.playerId);
    const frontTotal = getPlayerTotal(player.playerId, 1, is18 ? 9 : holeCount);
    const backTotal = is18 ? getPlayerTotal(player.playerId, 10, 18) : null;
    const grandTotal = getPlayerTotal(player.playerId, 1, holeCount);

    // FIR/GIR totals for the current nine
    const nineFrom = activeTab === "back" ? 10 : 1;
    const nineTo = activeTab === "back" ? 18 : (is18 ? 9 : holeCount);
    const firNine = getStatCount(player.playerId, "fir", nineFrom, nineTo);
    const girNine = getStatCount(player.playerId, "gir", nineFrom, nineTo);
    const firTotal = is18 ? getStatCount(player.playerId, "fir", 1, 18) : firNine;
    const girTotal = is18 ? getStatCount(player.playerId, "gir", 1, 18) : girNine;

    // Check if this player has any stat data
    const hasStats = (() => {
      for (let h = 1; h <= holeCount; h++) {
        const fir = getStat(h, player.playerId, "fir");
        const gir = getStat(h, player.playerId, "gir");
        if (fir !== null || gir !== null) return true;
      }
      return false;
    })();

    return (
      <View key={player.playerId}>
        {/* Score row */}
        <View style={[cs.row, playerIndex > 0 && cs.playerDivider]}>
          <View style={[cs.labelCell, cs.playerLabelCell]}>
            <Text style={cs.playerName} numberOfLines={1}>
              {player.displayName}
            </Text>
            <Text style={[
              cs.playerToPar,
              scoreToPar.startsWith("-") && cs.toParUnder,
              scoreToPar.startsWith("+") && cs.toParOver,
            ]}>
              {scoreToPar}
            </Text>
          </View>

          {sliceHoles.map((hole, idx) => {
            const hNum = startIdx + idx + 1;
            const score = getScore(hNum, player.playerId);
            const strokes = hole.handicap !== null
              ? getStrokesForHole(hole.handicap, player.courseHandicap, holeCount)
              : 0;

            return (
              <View key={`s-${hNum}-${player.playerId}`} style={cs.cell}>
                {strokes > 0 && (
                  <Text style={cs.strokeDot}>
                    {strokes >= 2 ? "••" : "•"}
                  </Text>
                )}
                <View style={[cs.scoreDisplay, getScoreStyle(score, hole.par)]}>
                  <Text style={[cs.scoreText, { color: getScoreTextColor(score, hole.par) }]}>
                    {score ?? ""}
                  </Text>
                  {score !== null && strokes > 0 && (
                    <Text style={cs.netSubscript}>
                      {score - strokes}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}

          <View style={cs.totalCell}>
            <Text style={cs.playerTotalText}>
              {activeTab === "back" ? (backTotal ?? "-") : (frontTotal ?? "-")}
            </Text>
          </View>
          {activeTab === "back" && (
            <View style={[cs.totalCell, cs.grandTotalCell]}>
              <Text style={cs.grandTotalText}>{grandTotal ?? "-"}</Text>
            </View>
          )}
        </View>

        {/* FIR stat row */}
        {hasStats && (
          <View style={cs.row}>
            <View style={[cs.labelCell, cs.statLabelCell]}>
              <Text style={cs.statLabel}>FIR</Text>
            </View>
            {sliceHoles.map((hole, idx) => {
              const hNum = startIdx + idx + 1;
              const isPar3 = hole.par === 3;
              const fir = getStat(hNum, player.playerId, "fir");

              return (
                <View key={`fir-${hNum}-${player.playerId}`} style={[cs.cell, cs.statCell]}>
                  {isPar3 ? (
                    <Text style={cs.statDash}>—</Text>
                  ) : fir === null ? (
                    <Text style={cs.statDash}>·</Text>
                  ) : (
                    <View style={[cs.statDot, fir ? cs.statHit : cs.statMiss]}>
                      <Text style={cs.statDotText}>{fir ? "✓" : "✗"}</Text>
                    </View>
                  )}
                </View>
              );
            })}
            <View style={cs.totalCell}>
              <Text style={cs.statTotalText}>
                {firNine.possible > 0 ? `${firNine.hit}/${firNine.possible}` : "-"}
              </Text>
            </View>
            {activeTab === "back" && (
              <View style={cs.totalCell}>
                <Text style={cs.statTotalText}>
                  {firTotal.possible > 0 ? `${firTotal.hit}/${firTotal.possible}` : "-"}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* GIR stat row */}
        {hasStats && (
          <View style={[cs.row, cs.statRowLast]}>
            <View style={[cs.labelCell, cs.statLabelCell]}>
              <Text style={cs.statLabel}>GIR</Text>
            </View>
            {sliceHoles.map((hole, idx) => {
              const hNum = startIdx + idx + 1;
              const gir = getStat(hNum, player.playerId, "gir");

              return (
                <View key={`gir-${hNum}-${player.playerId}`} style={[cs.cell, cs.statCell]}>
                  {gir === null ? (
                    <Text style={cs.statDash}>·</Text>
                  ) : (
                    <View style={[cs.statDot, gir ? cs.statHit : cs.statMiss]}>
                      <Text style={cs.statDotText}>{gir ? "✓" : "✗"}</Text>
                    </View>
                  )}
                </View>
              );
            })}
            <View style={cs.totalCell}>
              <Text style={cs.statTotalText}>
                {girNine.possible > 0 ? `${girNine.hit}/${girNine.possible}` : "-"}
              </Text>
            </View>
            {activeTab === "back" && (
              <View style={cs.totalCell}>
                <Text style={cs.statTotalText}>
                  {girTotal.possible > 0 ? `${girTotal.hit}/${girTotal.possible}` : "-"}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={cs.container} edges={["top"]}>
        {/* Header */}
        {renderHeader(courseName, onClose, roundData)}

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
          </View>
        )}

        {/* Scorecard grid */}
        <ScrollView style={cs.scrollContainer} bounces={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={cs.grid}>
              {renderHoleRow()}
              {renderYardageRow()}
              {renderParRow()}
              {renderStrokeIndexRow()}
              {players.map((p, i) => renderPlayerBlock(p, i))}
            </View>
          </ScrollView>

          {/* Round info footer */}
          <View style={cs.footer}>
            {roundData.roundDescription ? (
              <Text style={cs.footerDescription}>"{roundData.roundDescription}"</Text>
            ) : null}
            <View style={cs.footerRow}>
              <Text style={cs.footerLabel}>Format</Text>
              <Text style={cs.footerValue}>{format?.name || formatId}</Text>
            </View>
            {players[0]?.teeName && (
              <View style={cs.footerRow}>
                <Text style={cs.footerLabel}>Tees</Text>
                <Text style={cs.footerValue}>{players[0].teeName}</Text>
              </View>
            )}
            {players[0]?.courseRating && (
              <View style={cs.footerRow}>
                <Text style={cs.footerLabel}>Rating / Slope</Text>
                <Text style={cs.footerValue}>
                  {players[0].courseRating} / {players[0].slopeRating}
                </Text>
              </View>
            )}
            {roundData.isSimulator && (
              <View style={cs.simBadge}>
                <Ionicons name="game-controller-outline" size={14} color="#666" />
                <Text style={cs.simText}>Simulator Round</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ============================================================================
// HEADER HELPER (extracted to avoid duplication)
// ============================================================================

function renderHeader(title: string, onClose: () => void, roundData?: RoundDoc | null) {
  return (
    <View style={cs.header}>
      <TouchableOpacity
        onPress={() => {
          soundPlayer.play("click");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onClose();
        }}
        style={cs.headerCloseBtn}
      >
        <Image
          source={require("@/assets/icons/Close.png")}
          style={{ width: 24, height: 24, tintColor: "#FFF" }}
          resizeMode="contain"
        />
      </TouchableOpacity>

      <View style={cs.headerCenter}>
        <Text style={cs.headerTitle} numberOfLines={1}>{title}</Text>
        {roundData && (
          <Text style={cs.headerSubtitle}>
            {roundData.holeCount} holes • {roundData.players.length} player{roundData.players.length !== 1 ? "s" : ""}
          </Text>
        )}
      </View>

      <View style={cs.headerCloseBtn} />
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
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: "#999",
  },
  scrollContainer: {
    flex: 1,
  },

  // ── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: HEADER_GREEN,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  headerCloseBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFF",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
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
  greenBg: {
    backgroundColor: HEADER_GREEN,
  },

  // ── Hole numbers ────────────────────────────────────────────
  holeNum: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },

  // ── Data cells ──────────────────────────────────────────────
  cell: {
    width: CELL_W,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  yardageText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#999",
  },
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
  playerDivider: {
    borderTopWidth: 1,
    borderTopColor: "#E0DCC8",
  },

  // ── Handicap Stroke Dots ────────────────────────────────────
  strokeDot: {
    fontSize: 10,
    color: HEADER_GREEN,
    fontWeight: "800",
    position: "absolute",
    top: 6,
    right: 6,
    letterSpacing: -1,
    zIndex: 1,
  },

  // ── Score Display — handwritten font ────────────────────────
  scoreDisplay: {
    width: 36,
    height: 36,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -2,
  },
  scoreText: {
    fontSize: 30,
    fontFamily: HANDWRITTEN,
    fontWeight: "700",
    lineHeight: 34,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  netSubscript: {
    fontSize: 10,
    color: GREEN,
    fontWeight: "800",
    position: "absolute",
    bottom: 0,
    right: -0,
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

  // ── FIR/GIR Stat Rows ──────────────────────────────────────
  statLabelCell: {
    backgroundColor: "rgba(13, 92, 58, 0.03)",
    paddingVertical: 4,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: HEADER_GREEN,
    letterSpacing: 0.5,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  statCell: {
    paddingVertical: 3,
    backgroundColor: "rgba(13, 92, 58, 0.03)",
  },
  statRowLast: {
    borderBottomWidth: 1.5,
    borderBottomColor: "#D5D0C5",
  },
  statDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  statHit: {
    backgroundColor: "rgba(13, 92, 58, 0.15)",
  },
  statMiss: {
    backgroundColor: "rgba(200, 50, 50, 0.08)",
  },
  statDotText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#555",
  },
  statDash: {
    fontSize: 11,
    color: "#DDD",
  },
  statTotalText: {
    fontSize: 10,
    fontWeight: "700",
    color: HEADER_GREEN,
  },

  // ── Footer ──────────────────────────────────────────────────
  footer: {
    padding: 20,
    gap: 10,
  },
  footerDescription: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
    lineHeight: 20,
    marginBottom: 4,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerLabel: {
    fontSize: 13,
    color: "#999",
    fontWeight: "500",
  },
  footerValue: {
    fontSize: 13,
    color: "#333",
    fontWeight: "600",
  },
  simBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 12,
    marginTop: 4,
  },
  simText: {
    fontSize: 12,
    color: "#666",
    fontWeight: "500",
  },
});