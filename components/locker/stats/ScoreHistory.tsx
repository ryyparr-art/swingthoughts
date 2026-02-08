/**
 * ScoreHistory Tab
 * 
 * Displays:
 * - Summary row: # of Scores, High, Low, Avg
 * - Handicap trend mini-chart (last 20 differentials)
 * - Round-by-round list from handicapHistory subcollection
 * - Legend for source indicators
 */

import { db } from "@/constants/firebaseConfig";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    View,
} from "react-native";

import RoundRow from "./RoundRow";

interface ScoreHistoryProps {
  userId: string;
}

interface HistoryEntry {
  id: string;
  scoreId: string;
  source: "standalone" | "league";
  leagueId?: string;
  courseId?: number | string;
  courseName: string;
  tees?: string;
  grossScore: number;
  courseRating: number;
  slopeRating: number;
  holes: number;
  differential: number;
  is9Hole: boolean;
  playedAt: any;
}

export default function ScoreHistory({ userId }: ScoreHistoryProps) {
  const [rounds, setRounds] = useState<HistoryEntry[]>([]);
  const [usedIndices, setUsedIndices] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [userId]);

  const loadHistory = async () => {
    if (!userId) return;

    try {
      const historySnap = await getDocs(
        query(
          collection(db, "users", userId, "handicapHistory"),
          orderBy("playedAt", "desc"),
          limit(20)
        )
      );

      const entries: HistoryEntry[] = historySnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as HistoryEntry[];

      setRounds(entries);

      // Determine which differentials are used in the calculation
      if (entries.length >= 3) {
        const sorted = entries
          .map((e, i) => ({ differential: e.differential, originalIndex: i }))
          .sort((a, b) => a.differential - b.differential);

        const numToUse = getDifferentialsToUse(entries.length);
        const used = new Set<number>();
        sorted.slice(0, numToUse).forEach((item) => {
          used.add(item.originalIndex);
        });
        setUsedIndices(used);
      }
    } catch (error) {
      console.error("Error loading handicap history:", error);
    }
    setLoading(false);
  };

  const getDifferentialsToUse = (total: number): number => {
    if (total < 3) return 0;
    if (total <= 5) return 1;
    if (total <= 8) return 2;
    if (total <= 11) return 3;
    if (total <= 14) return 4;
    if (total <= 16) return 5;
    if (total <= 18) return 6;
    if (total === 19) return 7;
    return 8;
  };

  // Compute summary stats
  const grossScores = rounds.map((r) => r.grossScore);
  const high = grossScores.length > 0 ? Math.max(...grossScores) : null;
  const low = grossScores.length > 0 ? Math.min(...grossScores) : null;
  const avg =
    grossScores.length > 0
      ? (grossScores.reduce((s, v) => s + v, 0) / grossScores.length).toFixed(1)
      : null;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Summary Row */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}># of Scores</Text>
          <Text style={styles.summaryValue}>{rounds.length}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>High</Text>
          <Text style={styles.summaryValue}>{high ?? "—"}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Low</Text>
          <Text style={[styles.summaryValue, low ? styles.lowHighlight : null]}>
            {low ?? "—"}
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Avg.</Text>
          <Text style={styles.summaryValue}>{avg ?? "—"}</Text>
        </View>
      </View>

      {/* Trend Chart (simple bar visualization) */}
      {rounds.length > 0 && (
        <View style={styles.trendContainer}>
          <Text style={styles.trendTitle}>Differential Trend</Text>
          <View style={styles.trendChart}>
            {[...rounds].reverse().map((round, i) => {
              const maxDiff = Math.max(...rounds.map((r) => r.differential), 1);
              const barHeight = Math.max(
                (round.differential / maxDiff) * 60,
                4
              );
              const isUsed = usedIndices.has(rounds.length - 1 - i);
              return (
                <View key={round.id} style={styles.trendBarWrapper}>
                  <View
                    style={[
                      styles.trendBar,
                      {
                        height: barHeight,
                        backgroundColor: isUsed ? "#0D5C3A" : "#C8DFC8",
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>
          <View style={styles.trendLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#0D5C3A" }]} />
              <Text style={styles.legendText}>Used in calc</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: "#C8DFC8" }]} />
              <Text style={styles.legendText}>Not used</Text>
            </View>
          </View>
        </View>
      )}

      {/* Column Headers */}
      {rounds.length > 0 && (
        <View style={styles.columnHeaders}>
          <Text style={[styles.colHeader, { width: 50 }]}>Date</Text>
          <Text style={[styles.colHeader, { flex: 1 }]}>Course</Text>
          <Text style={[styles.colHeader, { width: 50, textAlign: "right" }]}>
            Score / Diff
          </Text>
        </View>
      )}

      {/* Round List */}
      {rounds.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={styles.emptyTitle}>No Score History</Text>
          <Text style={styles.emptySubtitle}>
            Post scores with tee selection to start{"\n"}building your handicap history.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rounds}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <RoundRow
              courseName={item.courseName}
              tees={item.tees}
              grossScore={item.grossScore}
              differential={item.differential}
              holes={item.holes}
              courseRating={item.courseRating}
              slopeRating={item.slopeRating}
              playedAt={item.playedAt}
              source={item.source}
              isUsedInCalc={usedIndices.has(index)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Source Legend */}
      {rounds.length > 0 && (
        <View style={styles.sourceLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.standaloneDot]} />
            <Text style={styles.legendText}>Standalone</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.leagueDot]} />
            <Text style={styles.legendText}>League</Text>
          </View>
          <View style={styles.legendItem}>
            <Text style={styles.legendStar}>★</Text>
            <Text style={styles.legendText}>Used in handicap calc</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },

  // Summary Row
  summaryRow: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E8E8",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#999",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#333",
  },
  lowHighlight: {
    color: "#0D5C3A",
  },

  // Trend Chart
  trendContainer: {
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E8E8",
  },
  trendTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666",
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  trendChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 70,
    gap: 3,
    paddingHorizontal: 4,
  },
  trendBarWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },
  trendBar: {
    width: "80%",
    borderRadius: 2,
    minHeight: 4,
  },
  trendLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 8,
  },

  // Column Headers
  columnHeaders: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#F0EBD5",
    borderBottomWidth: 1,
    borderBottomColor: "#E0DBCB",
  },
  colHeader: {
    fontSize: 10,
    fontWeight: "700",
    color: "#888",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  // Empty State
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    lineHeight: 20,
  },

  // List
  listContent: {
    paddingBottom: 80,
  },

  // Source Legend
  sourceLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 10,
    paddingBottom: 20,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  standaloneDot: {
    backgroundColor: "#0D5C3A",
  },
  leagueDot: {
    backgroundColor: "#FFD700",
  },
  legendText: {
    fontSize: 10,
    color: "#999",
    fontWeight: "500",
  },
  legendStar: {
    fontSize: 10,
    color: "#FFD700",
  },
});