/**
 * ScoreSummary - Shows gross score, handicap, net score, stats, and legend
 */

import React from "react";
import { Text, View } from "react-native";

import {
    countFairways,
    countGreens,
    countPenalties,
    getTotalAdjScore,
    getTotalPar,
    getTotalScore,
} from "./helpers";
import { styles } from "./styles";
import { HoleInfo } from "./types";

interface ScoreSummaryProps {
  scores: (number | null)[];
  adjScores: (number | null)[];
  holes: HoleInfo[];
  holesCount: number;
  courseHandicap: number;
  showHandicap: boolean;
  fir: (boolean | null)[];
  gir: (boolean | null)[];
  pnl: (number | null)[];
}

export default function ScoreSummary({
  scores,
  adjScores,
  holes,
  holesCount,
  courseHandicap,
  showHandicap,
  fir,
  gir,
  pnl,
}: ScoreSummaryProps) {
  const totalScore = getTotalScore(scores);
  const totalAdj = getTotalAdjScore(adjScores);
  const totalPar = getTotalPar(holes, holesCount);

  const fairways = countFairways(fir, holes, holesCount);
  const greens = countGreens(gir, holesCount);
  const penalties = countPenalties(pnl, holesCount);

  const hasFirData = fir.some((v) => v !== null);
  const hasGirData = gir.some((v) => v !== null);
  const hasPnlData = pnl.some((v) => v !== null && v > 0);

  return (
    <>
      {/* Score Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Gross Score</Text>
          <Text style={styles.summaryValue}>{totalScore ?? "-"}</Text>
        </View>
        {showHandicap ? (
          <>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Course Handicap</Text>
              <Text style={styles.summaryValue}>{courseHandicap}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>To Par</Text>
              <Text style={styles.summaryValue}>
                {totalScore !== null
                  ? `${totalScore - totalPar >= 0 ? "+" : ""}${totalScore - totalPar}`
                  : "-"}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowNet]}>
              <Text style={styles.summaryLabelNet}>Net Score</Text>
              <Text style={styles.summaryValueNet}>{totalAdj ?? "-"}</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>To Par</Text>
              <Text style={styles.summaryValue}>
                {totalScore !== null
                  ? `${totalScore - totalPar >= 0 ? "+" : ""}${totalScore - totalPar}`
                  : "-"}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowNet]}>
              <Text style={styles.summaryLabel}>Handicap</Text>
              <Text style={styles.summaryValueMuted}>League Managed</Text>
            </View>
          </>
        )}
      </View>

      {/* Stats Summary (only show if user entered any) */}
      {(hasFirData || hasGirData || hasPnlData) && (
        <View style={styles.statsSummary}>
          <Text style={styles.statsSummaryTitle}>Round Stats</Text>
          <View style={styles.statsGrid}>
            {hasFirData && (
              <View style={styles.statsItem}>
                <Text style={styles.statsItemValue}>
                  {fairways.hit}/{fairways.possible}
                </Text>
                <Text style={styles.statsItemLabel}>Fairways</Text>
                {fairways.possible > 0 && (
                  <Text style={styles.statsItemPercent}>
                    {Math.round((fairways.hit / fairways.possible) * 100)}%
                  </Text>
                )}
              </View>
            )}
            {hasGirData && (
              <View style={styles.statsItem}>
                <Text style={styles.statsItemValue}>
                  {greens.hit}/{greens.possible}
                </Text>
                <Text style={styles.statsItemLabel}>Greens</Text>
                {greens.possible > 0 && (
                  <Text style={styles.statsItemPercent}>
                    {Math.round((greens.hit / greens.possible) * 100)}%
                  </Text>
                )}
              </View>
            )}
            {hasPnlData && (
              <View style={styles.statsItem}>
                <Text style={[styles.statsItemValue, styles.statsItemPenalty]}>
                  {penalties}
                </Text>
                <Text style={styles.statsItemLabel}>Penalties</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSample, styles.scoreEagle]}>
            <Text style={styles.legendSampleText}>2</Text>
          </View>
          <Text style={styles.legendText}>Eagle+</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSample, styles.scoreBirdie]}>
            <Text style={[styles.legendSampleText, { color: "#E53935" }]}>3</Text>
          </View>
          <Text style={styles.legendText}>Birdie</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSample, styles.scoreBogey]}>
            <Text style={styles.legendSampleText}>5</Text>
          </View>
          <Text style={styles.legendText}>Bogey</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSample, styles.scoreDouble]}>
            <Text style={styles.legendSampleText}>6</Text>
          </View>
          <Text style={styles.legendText}>Double+</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendStrokeDot}>
            <View style={styles.strokeDot} />
          </View>
          <Text style={styles.legendText}>Stroke</Text>
        </View>
      </View>
    </>
  );
}