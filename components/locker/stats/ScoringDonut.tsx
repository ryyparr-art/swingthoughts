/**
 * ScoringDonut - Donut chart showing scoring breakdown
 * 
 * Shows percentage of: Birdies+, Pars, Bogeys, Double Bogeys, Triple+
 * Center shows "X% PAR OR BETTER"
 * 
 * Uses SVG circles with stroke-dasharray for the donut segments.
 */

import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

interface ScoringDonutProps {
  birdiesOrBetter: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  tripleOrWorse: number;
  totalHoles: number;
}

const COLORS = {
  birdiesOrBetter: "#0D5C3A",  // Dark green
  pars: "#4CAF50",              // Green
  bogeys: "#B0C8B0",            // Light sage
  doubleBogeys: "#E8C87A",      // Gold
  tripleOrWorse: "#C62828",     // Red
};

export default function ScoringDonut({
  birdiesOrBetter,
  pars,
  bogeys,
  doubleBogeys,
  tripleOrWorse,
  totalHoles,
}: ScoringDonutProps) {
  if (totalHoles === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.noDataText}>No hole-by-hole data available</Text>
      </View>
    );
  }

  const segments = [
    { count: birdiesOrBetter, color: COLORS.birdiesOrBetter, label: "Birdies or Better" },
    { count: pars, color: COLORS.pars, label: "Pars" },
    { count: bogeys, color: COLORS.bogeys, label: "Bogeys" },
    { count: doubleBogeys, color: COLORS.doubleBogeys, label: "Double Bogeys" },
    { count: tripleOrWorse, color: COLORS.tripleOrWorse, label: "Triple Bogeys+" },
  ].filter((s) => s.count > 0);

  const parOrBetterPct = Math.round(
    ((birdiesOrBetter + pars) / totalHoles) * 100
  );

  // SVG donut config
  const size = 200;
  const strokeWidth = 35;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Build segment arcs
  let cumulativeOffset = 0;
  const arcs = segments.map((segment) => {
    const pct = segment.count / totalHoles;
    const dashLength = pct * circumference;
    const dashGap = circumference - dashLength;
    const offset = -cumulativeOffset + circumference * 0.25; // Start at 12 o'clock
    cumulativeOffset += dashLength;

    return {
      ...segment,
      pct: Math.round(pct * 100),
      dashArray: `${dashLength} ${dashGap}`,
      dashOffset: offset,
    };
  });

  return (
    <View style={styles.container}>
      {/* Donut Chart */}
      <View style={styles.chartWrapper}>
        <Svg width={size} height={size}>
          {/* Background circle */}
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#F0F0F0"
            strokeWidth={strokeWidth}
          />
          {/* Segments */}
          {arcs.map((arc, i) => (
            <Circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeDasharray={arc.dashArray}
              strokeDashoffset={arc.dashOffset}
              strokeLinecap="butt"
            />
          ))}
        </Svg>

        {/* Center text */}
        <View style={styles.centerText}>
          <Text style={styles.centerPct}>{parOrBetterPct}<Text style={styles.centerPctSmall}>%</Text></Text>
          <Text style={styles.centerLabel}>PAR OR{"\n"}BETTER</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {arcs.map((arc, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: arc.color }]} />
            <Text style={styles.legendLabel}>
              {arc.label} ({arc.pct}%)
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 16,
  },
  noDataText: {
    fontSize: 14,
    color: "#999",
    fontStyle: "italic",
    paddingVertical: 40,
  },

  // Chart
  chartWrapper: {
    width: 200,
    height: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  centerText: {
    position: "absolute",
    alignItems: "center",
  },
  centerPct: {
    fontSize: 36,
    fontWeight: "800",
    color: "#333",
  },
  centerPctSmall: {
    fontSize: 18,
    fontWeight: "600",
  },
  centerLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#999",
    textAlign: "center",
    letterSpacing: 0.8,
    marginTop: 2,
  },

  // Legend
  legend: {
    marginTop: 16,
    gap: 6,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "500",
  },
});