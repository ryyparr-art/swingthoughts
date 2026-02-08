/**
 * RoundRow - Single round entry in Score History
 * 
 * Shows: date, course name, tees, gross, differential
 * Color-coded differential (green = good, red = bad relative to index)
 */

import { StyleSheet, Text, View } from "react-native";

interface RoundRowProps {
  courseName: string;
  tees?: string | null;
  grossScore: number;
  differential: number;
  holes: number;
  courseRating: number;
  slopeRating: number;
  playedAt: any;
  source: "standalone" | "league";
  isUsedInCalc?: boolean;
}

export default function RoundRow({
  courseName,
  tees,
  grossScore,
  differential,
  holes,
  courseRating,
  slopeRating,
  playedAt,
  source,
  isUsedInCalc,
}: RoundRowProps) {
  const formatDate = (timestamp: any) => {
    if (!timestamp) return "—";
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return "—";
    }
  };

  // Color the differential: lower is better
  const getDiffColor = () => {
    if (differential < 5) return "#0D5C3A";
    if (differential < 15) return "#2E7D32";
    if (differential < 25) return "#F9A825";
    return "#C62828";
  };

  return (
    <View style={[styles.row, isUsedInCalc && styles.rowHighlighted]}>
      {/* Left: Date + Source indicator */}
      <View style={styles.dateCol}>
        <Text style={styles.dateText}>{formatDate(playedAt)}</Text>
        <View style={styles.sourceRow}>
          <View style={[styles.sourceDot, source === "league" ? styles.leagueDot : styles.standaloneDot]} />
          <Text style={styles.sourceText}>{holes}H</Text>
        </View>
      </View>

      {/* Middle: Course + Tees */}
      <View style={styles.courseCol}>
        <Text style={styles.courseName} numberOfLines={1}>
          {courseName || "Unknown Course"}
        </Text>
        <Text style={styles.courseDetail} numberOfLines={1}>
          {tees ? `${tees} • ` : ""}
          {courseRating}/{slopeRating}
        </Text>
      </View>

      {/* Right: Gross + Differential */}
      <View style={styles.scoreCol}>
        <Text style={styles.grossScore}>{grossScore}</Text>
        <Text style={[styles.differential, { color: getDiffColor() }]}>
          {differential.toFixed(1)}
        </Text>
      </View>

      {/* Used indicator */}
      {isUsedInCalc && (
        <View style={styles.usedBadge}>
          <Text style={styles.usedText}>★</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  rowHighlighted: {
    backgroundColor: "#F0FFF0",
  },

  // Date column
  dateCol: {
    width: 50,
    marginRight: 10,
  },
  dateText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  sourceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  standaloneDot: {
    backgroundColor: "#0D5C3A",
  },
  leagueDot: {
    backgroundColor: "#FFD700",
  },
  sourceText: {
    fontSize: 10,
    color: "#999",
    fontWeight: "500",
  },

  // Course column
  courseCol: {
    flex: 1,
    marginRight: 10,
  },
  courseName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  courseDetail: {
    fontSize: 11,
    color: "#999",
    marginTop: 2,
  },

  // Score column
  scoreCol: {
    alignItems: "flex-end",
    minWidth: 50,
  },
  grossScore: {
    fontSize: 18,
    fontWeight: "800",
    color: "#333",
  },
  differential: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 1,
  },

  // Used in calculation badge
  usedBadge: {
    position: "absolute",
    top: 8,
    right: 4,
  },
  usedText: {
    fontSize: 8,
    color: "#FFD700",
  },
});