/**
 * Scorecard - Score input grid with front/back 9 tab toggle
 *
 * Rows: Hole | Yards | Par | Stroke Index | Score | Adj. Score | FIR | GIR | PNL
 * Features: Tab toggle for 18-hole rounds, auto-flips to back 9 when front 9 complete
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Modal,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import {
    getBack9AdjScore,
    getBack9Par,
    getBack9Score,
    getBack9Yardage,
    getFront9AdjScore,
    getFront9Par,
    getFront9Score,
    getFront9Yardage,
    getPnlSliceCount,
    getStatSliceCount,
    getStrokesForHole,
    getTotalAdjScore,
    getTotalPar,
    getTotalScore,
    getTotalYardage,
} from "./helpers";
import { styles } from "./styles";
import { HoleInfo } from "./types";

interface ScorecardProps {
  holes: HoleInfo[];
  holesCount: number;
  scores: (number | null)[];
  adjScores: (number | null)[];
  courseHandicap: number;
  showHandicap: boolean;
  fir: (boolean | null)[];
  gir: (boolean | null)[];
  pnl: (number | null)[];
  onScoreChange: (holeIndex: number, value: string) => void;
  onFirToggle: (holeIndex: number) => void;
  onGirToggle: (holeIndex: number) => void;
  onPnlChange: (holeIndex: number, value: string) => void;
}

/** Info modal content for stat row abbreviations */
const STAT_INFO: Record<string, { title: string; description: string }> = {
  SI: {
    title: "Stroke Index",
    description:
      "The difficulty ranking of each hole (1 = hardest, 18 = easiest). Your handicap strokes are allocated to holes based on this index \u2014 hardest holes first.",
  },
  ADJ: {
    title: "Adjusted Score",
    description:
      "Your score on each hole after handicap strokes are applied. If you receive a stroke on a hole, your adjusted score = gross score minus strokes received.",
  },
  FIR: {
    title: "Fairway in Regulation",
    description:
      "Did your tee shot land on the fairway? Tap to toggle. Par 3 holes are excluded since they don't have fairways. This stat is optional.",
  },
  GIR: {
    title: "Green in Regulation",
    description:
      "Did the ball reach the putting green in the expected number of strokes (par minus 2)? For example, reaching a par 4 green in 2 shots. Tap to toggle. Optional.",
  },
  PNL: {
    title: "Penalties",
    description:
      "Number of penalty strokes on the hole (OB, water, lost ball, unplayable, etc.). Enter the count \u2014 leave blank if none. Optional.",
  },
};

type NineTab = "front" | "back";

export default function Scorecard({
  holes,
  holesCount,
  scores,
  adjScores,
  courseHandicap,
  showHandicap,
  fir,
  gir,
  pnl,
  onScoreChange,
  onFirToggle,
  onGirToggle,
  onPnlChange,
}: ScorecardProps) {
  const inputRefs = useRef<Record<number, TextInput | null>>({});
  const pnlInputRefs = useRef<Record<number, TextInput | null>>({});
  const is18Holes = holesCount === 18;
  const [infoModal, setInfoModal] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NineTab>("front");
  const hasAutoFlipped = useRef(false);

  // Auto-flip to back 9 when all front 9 scores are entered
  useEffect(() => {
    if (!is18Holes || hasAutoFlipped.current) return;

    const front9 = scores.slice(0, 9);
    const allFront9Filled = front9.every((s) => s !== null);

    if (allFront9Filled && activeTab === "front") {
      hasAutoFlipped.current = true;
      // Small delay so the user sees their last score register
      setTimeout(() => {
        setActiveTab("back");
        // Focus the first back 9 input
        setTimeout(() => {
          inputRefs.current[9]?.focus();
        }, 100);
      }, 300);
    }
  }, [scores, is18Holes, activeTab]);

  // Reset auto-flip flag if user clears a front 9 score
  useEffect(() => {
    if (!is18Holes) return;
    const front9 = scores.slice(0, 9);
    const anyFront9Empty = front9.some((s) => s === null);
    if (anyFront9Empty) {
      hasAutoFlipped.current = false;
    }
  }, [scores, is18Holes]);

  const handleScoreChange = useCallback(
    (holeIndex: number, value: string) => {
      onScoreChange(holeIndex, value);

      // Auto-advance to next input within the same nine
      const numValue = value === "" ? null : parseInt(value, 10);
      if (numValue !== null) {
        const nineEnd = activeTab === "front" ? 8 : 17;
        if (holeIndex < nineEnd) {
          setTimeout(() => {
            inputRefs.current[holeIndex + 1]?.focus();
          }, 50);
        }
      }
    },
    [onScoreChange, activeTab]
  );

  const getScoreColor = (score: number | null, par: number) => {
    if (score === null) return "#333";
    const diff = score - par;
    if (diff <= -2) return "#FFD700";
    if (diff === -1) return "#E53935";
    return "#333";
  };

  const getScoreStyle = (score: number | null, par: number) => {
    if (score === null) return {};
    const diff = score - par;
    if (diff <= -2) return styles.scoreEagle;
    if (diff === -1) return styles.scoreBirdie;
    if (diff === 1) return styles.scoreBogey;
    if (diff >= 2) return styles.scoreDouble;
    return {};
  };

  /** Render the label cell with optional info icon */
  const renderLabelCell = (label: string, infoKey?: string) => (
    <View style={styles.labelCell}>
      <View style={styles.labelRow}>
        <Text style={styles.labelText}>{label}</Text>
        {infoKey && (
          <TouchableOpacity
            onPress={() => setInfoModal(infoKey)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.infoButton}
          >
            <Ionicons name="information-circle-outline" size={13} color="#999" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  /** Render the scorecard grid for a given nine */
  const renderNine = (startIdx: number, endIdx: number, isBack: boolean) => {
    const sliceHoles = holes.slice(startIdx, endIdx);
    const nineLabel = isBack ? "IN" : "OUT";

    return (
      <View style={styles.nineSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.scorecardTable}>
            {/* Hole Numbers */}
            <View style={styles.tableRow}>
              <View style={styles.labelCell}>
                <Text style={styles.labelText}>HOLE</Text>
              </View>
              {sliceHoles.map((_, idx) => (
                <View key={`hole-${startIdx + idx}`} style={styles.holeCell}>
                  <Text style={styles.holeNumber}>{startIdx + idx + 1}</Text>
                </View>
              ))}
              <View style={styles.totalCell}>
                <Text style={styles.totalLabel}>{nineLabel}</Text>
              </View>
              {isBack && (
                <View style={styles.grandTotalCell}>
                  <Text style={styles.totalLabel}>TOT</Text>
                </View>
              )}
            </View>

            {/* Yardage */}
            <View style={styles.tableRow}>
              {renderLabelCell("YARDS")}
              {sliceHoles.map((hole, idx) => (
                <View key={`yds-${startIdx + idx}`} style={styles.dataCell}>
                  <Text style={styles.yardageText}>{hole.yardage}</Text>
                </View>
              ))}
              <View style={styles.totalCell}>
                <Text style={styles.totalValue}>
                  {isBack
                    ? getBack9Yardage(holes, holesCount)
                    : getFront9Yardage(holes)}
                </Text>
              </View>
              {isBack && (
                <View style={styles.grandTotalCell}>
                  <Text style={styles.totalValue}>
                    {getTotalYardage(holes, holesCount)}
                  </Text>
                </View>
              )}
            </View>

            {/* Par */}
            <View style={styles.tableRow}>
              {renderLabelCell("PAR")}
              {sliceHoles.map((hole, idx) => (
                <View key={`par-${startIdx + idx}`} style={styles.dataCell}>
                  <Text style={styles.parText}>{hole.par}</Text>
                </View>
              ))}
              <View style={styles.totalCell}>
                <Text style={styles.totalValue}>
                  {isBack ? getBack9Par(holes, holesCount) : getFront9Par(holes)}
                </Text>
              </View>
              {isBack && (
                <View style={styles.grandTotalCell}>
                  <Text style={styles.totalValue}>
                    {getTotalPar(holes, holesCount)}
                  </Text>
                </View>
              )}
            </View>

            {/* Stroke Index (only for SwingThoughts handicap) */}
            {showHandicap && (
            <View style={[styles.tableRow, styles.strokeIndexRow]}>
              {renderLabelCell("S.I.", "SI")}
              {sliceHoles.map((hole, idx) => (
                <View key={`si-${startIdx + idx}`} style={styles.strokeIndexCell}>
                  <Text style={styles.strokeIndexText}>
                    {hole.handicap ?? "-"}
                  </Text>
                </View>
              ))}
              <View style={styles.totalCell}>
                <Text style={styles.totalValue} />
              </View>
              {isBack && (
                <View style={styles.grandTotalCell}>
                  <Text style={styles.totalValue} />
                </View>
              )}
            </View>
            )}

            {/* Score Input */}
            <View style={styles.tableRow}>
              {renderLabelCell("SCORE")}
              {sliceHoles.map((hole, idx) => {
                const i = startIdx + idx;
                return (
                  <View key={`score-${i}`} style={styles.scoreCell}>
                    <TextInput
                      ref={(ref) => {
                        inputRefs.current[i] = ref;
                      }}
                      style={[
                        styles.scoreInput,
                        getScoreStyle(scores[i], hole.par),
                        { color: getScoreColor(scores[i], hole.par) },
                      ]}
                      value={scores[i]?.toString() || ""}
                      onChangeText={(v) => handleScoreChange(i, v)}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                    />
                  </View>
                );
              })}
              <View style={styles.totalCell}>
                <Text style={styles.totalScore}>
                  {isBack
                    ? (getBack9Score(scores, holesCount) ?? "-")
                    : (getFront9Score(scores) ?? "-")}
                </Text>
              </View>
              {isBack && (
                <View style={styles.grandTotalCell}>
                  <Text style={styles.grandTotalScore}>
                    {getTotalScore(scores) ?? "-"}
                  </Text>
                </View>
              )}
            </View>

            {/* Adjusted Score (only for SwingThoughts handicap) */}
            {showHandicap && (
            <View style={[styles.tableRow, styles.adjScoreRow]}>
              {renderLabelCell("ADJ", "ADJ")}
              {sliceHoles.map((hole, idx) => {
                const i = startIdx + idx;
                const adj = adjScores[i];
                const strokes = getStrokesForHole(
                  hole.handicap,
                  courseHandicap,
                  holesCount
                );
                return (
                  <View key={`adj-${i}`} style={styles.adjScoreCell}>
                    {adj !== null ? (
                      <View style={styles.adjScoreValueWrap}>
                        <Text style={styles.adjScoreValue}>{adj}</Text>
                        {strokes > 0 && (
                          <View style={styles.strokeDots}>
                            {Array.from({ length: Math.min(strokes, 3) }).map(
                              (_, dotIdx) => (
                                <View key={dotIdx} style={styles.strokeDot} />
                              )
                            )}
                          </View>
                        )}
                      </View>
                    ) : (
                      <Text style={styles.adjScorePlaceholder}>-</Text>
                    )}
                  </View>
                );
              })}
              <View style={styles.totalCell}>
                <Text style={styles.adjTotalScore}>
                  {isBack
                    ? (getBack9AdjScore(adjScores, holesCount) ?? "-")
                    : (getFront9AdjScore(adjScores) ?? "-")}
                </Text>
              </View>
              {isBack && (
                <View style={styles.grandTotalCell}>
                  <Text style={styles.adjGrandTotalScore}>
                    {getTotalAdjScore(adjScores) ?? "-"}
                  </Text>
                </View>
              )}
            </View>
            )}

            {/* FIR - Fairway in Regulation */}
            <View style={[styles.tableRow, styles.statRow]}>
              {renderLabelCell("FIR", "FIR")}
              {sliceHoles.map((hole, idx) => {
                const i = startIdx + idx;
                const isPar3 = hole.par <= 3;
                return (
                  <View key={`fir-${i}`} style={styles.statCell}>
                    {isPar3 ? (
                      <Text style={styles.statDash}>{"\u2014"}</Text>
                    ) : (
                      <TouchableOpacity
                        onPress={() => onFirToggle(i)}
                        style={[
                          styles.statCheckbox,
                          fir[i] === true && styles.statCheckboxChecked,
                          fir[i] === false && styles.statCheckboxUnchecked,
                        ]}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      >
                        {fir[i] === true && (
                          <Ionicons name="checkmark" size={12} color="#FFF" />
                        )}
                        {fir[i] === false && (
                          <Ionicons name="close" size={10} color="#D32F2F" />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
              <View style={styles.totalCell}>
                <Text style={styles.statTotal}>
                  {getStatSliceCount(fir, startIdx, endIdx)}
                </Text>
              </View>
              {isBack && (
                <View style={styles.grandTotalCell}>
                  <Text style={styles.statTotal}>
                    {getStatSliceCount(fir, 0, holesCount)}
                  </Text>
                </View>
              )}
            </View>

            {/* GIR - Green in Regulation */}
            <View style={[styles.tableRow, styles.statRow]}>
              {renderLabelCell("GIR", "GIR")}
              {sliceHoles.map((_, idx) => {
                const i = startIdx + idx;
                return (
                  <View key={`gir-${i}`} style={styles.statCell}>
                    <TouchableOpacity
                      onPress={() => onGirToggle(i)}
                      style={[
                        styles.statCheckbox,
                        gir[i] === true && styles.statCheckboxChecked,
                        gir[i] === false && styles.statCheckboxUnchecked,
                      ]}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      {gir[i] === true && (
                        <Ionicons name="checkmark" size={12} color="#FFF" />
                      )}
                      {gir[i] === false && (
                        <Ionicons name="close" size={10} color="#D32F2F" />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
              <View style={styles.totalCell}>
                <Text style={styles.statTotal}>
                  {getStatSliceCount(gir, startIdx, endIdx)}
                </Text>
              </View>
              {isBack && (
                <View style={styles.grandTotalCell}>
                  <Text style={styles.statTotal}>
                    {getStatSliceCount(gir, 0, holesCount)}
                  </Text>
                </View>
              )}
            </View>

            {/* PNL - Penalties */}
            <View style={[styles.tableRow, styles.statRow, styles.lastStatRow]}>
              {renderLabelCell("PNL", "PNL")}
              {sliceHoles.map((_, idx) => {
                const i = startIdx + idx;
                return (
                  <View key={`pnl-${i}`} style={styles.statCell}>
                    <TextInput
                      ref={(ref) => {
                        pnlInputRefs.current[i] = ref;
                      }}
                      style={styles.pnlInput}
                      value={pnl[i] !== null ? pnl[i]!.toString() : ""}
                      onChangeText={(v) => onPnlChange(i, v)}
                      keyboardType="number-pad"
                      maxLength={1}
                      selectTextOnFocus
                      placeholder=""
                    />
                  </View>
                );
              })}
              <View style={styles.totalCell}>
                <Text style={styles.statTotal}>
                  {getPnlSliceCount(pnl, startIdx, endIdx) || ""}
                </Text>
              </View>
              {isBack && (
                <View style={styles.grandTotalCell}>
                  <Text style={styles.statTotal}>
                    {getPnlSliceCount(pnl, 0, holesCount) || ""}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <>
      {/* Tab Toggle for 18-hole rounds */}
      {is18Holes && (
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "front" && styles.tabActive]}
            onPress={() => setActiveTab("front")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "front" && styles.tabTextActive,
              ]}
            >
              Front 9
            </Text>
            {getFront9Score(scores) !== null && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>
                  {getFront9Score(scores)}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === "back" && styles.tabActive]}
            onPress={() => setActiveTab("back")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "back" && styles.tabTextActive,
              ]}
            >
              Back 9
            </Text>
            {getBack9Score(scores, holesCount) !== null && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>
                  {getBack9Score(scores, holesCount)}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Total pill - always visible when complete */}
          {getTotalScore(scores) !== null && (
            <View style={styles.tabTotalPill}>
              <Text style={styles.tabTotalLabel}>TOT</Text>
              <Text style={styles.tabTotalValue}>{getTotalScore(scores)}</Text>
            </View>
          )}
        </View>
      )}

      {/* Render active nine (or just front 9 for 9-hole rounds) */}
      {is18Holes ? (
        activeTab === "front" ? (
          renderNine(0, 9, false)
        ) : (
          renderNine(9, 18, true)
        )
      ) : (
        <>
          {renderNine(0, 9, false)}
          <View style={styles.totalSummary}>
            <Text style={styles.totalSummaryLabel}>TOTAL</Text>
            <Text style={styles.totalSummaryValue}>
              {getTotalScore(scores) ?? "-"}
            </Text>
          </View>
        </>
      )}

      {/* Info Modal */}
      <Modal
        visible={infoModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModal(null)}
      >
        <TouchableOpacity
          style={styles.infoModalOverlay}
          activeOpacity={1}
          onPress={() => setInfoModal(null)}
        >
          <View style={styles.infoModalContent}>
            <View style={styles.infoModalHeader}>
              <Text style={styles.infoModalTitle}>
                {infoModal ? STAT_INFO[infoModal]?.title : ""}
              </Text>
              <TouchableOpacity onPress={() => setInfoModal(null)}>
                <Ionicons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>
            <Text style={styles.infoModalDescription}>
              {infoModal ? STAT_INFO[infoModal]?.description : ""}
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}