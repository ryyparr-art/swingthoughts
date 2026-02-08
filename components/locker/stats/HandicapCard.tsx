/**
 * HandicapCard - Shows current handicap index with context
 * 
 * Displays:
 * - Current Handicap Index (large)
 * - Rounds used / total rounds
 * - Low index from last 365 days
 * - Last updated date
 */

import { db } from "@/constants/firebaseConfig";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

interface HandicapCardProps {
  userId: string;
  profile: any;
}

export default function HandicapCard({ userId, profile }: HandicapCardProps) {
  const [totalRounds, setTotalRounds] = useState(0);
  const [lowIndex, setLowIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHandicapData();
  }, [userId]);

  const loadHandicapData = async () => {
    if (!userId) return;

    try {
      // Get handicap history count and low differential
      const historySnap = await getDocs(
        query(
          collection(db, "users", userId, "handicapHistory"),
          orderBy("playedAt", "desc"),
          limit(20)
        )
      );

      setTotalRounds(historySnap.size);

      // Find lowest differential in last 365 days
      if (!historySnap.empty) {
        const now = new Date();
        const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        
        let lowest: number | null = null;
        historySnap.docs.forEach((doc) => {
          const data = doc.data();
          const playedAt = data.playedAt?.toDate?.() || new Date(data.playedAt);
          if (playedAt >= oneYearAgo) {
            if (lowest === null || data.differential < lowest) {
              lowest = data.differential;
            }
          }
        });
        setLowIndex(lowest);
      }
    } catch (error) {
      console.error("Error loading handicap data:", error);
    }
    setLoading(false);
  };

  const getDifferentialsUsed = (total: number): number => {
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

  const handicap = profile?.handicap;
  const diffsUsed = getDifferentialsUsed(totalRounds);
  const lastUpdated = profile?.handicapUpdatedAt;

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "—";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator size="small" color="#0D5C3A" />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {/* Main Index */}
      <View style={styles.indexSection}>
        <Text style={styles.indexLabel}>HANDICAP INDEX</Text>
        <Text style={styles.indexValue}>
          {handicap != null ? Number(handicap).toFixed(1) : "N/A"}
        </Text>
        {totalRounds < 3 && (
          <Text style={styles.indexNote}>
            {totalRounds === 0
              ? "Post 3 rounds to establish index"
              : `${3 - totalRounds} more round${3 - totalRounds > 1 ? "s" : ""} needed`}
          </Text>
        )}
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{totalRounds}</Text>
          <Text style={styles.statLabel}>Rounds</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statBox}>
          <Text style={styles.statValue}>
            {diffsUsed > 0 ? `${diffsUsed} of ${Math.min(totalRounds, 20)}` : "—"}
          </Text>
          <Text style={styles.statLabel}>Best Used</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statBox}>
          <Text style={styles.statValue}>
            {lowIndex != null ? lowIndex.toFixed(1) : "—"}
          </Text>
          <Text style={styles.statLabel}>Low Diff</Text>
        </View>
      </View>

      {/* Last Updated */}
      {lastUpdated && (
        <Text style={styles.updatedText}>Updated {formatDate(lastUpdated)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    alignItems: "center",
  },

  // Index
  indexSection: {
    alignItems: "center",
    marginBottom: 14,
  },
  indexLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  indexValue: {
    fontSize: 42,
    fontWeight: "800",
    color: "#0D5C3A",
  },
  indexNote: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
    marginTop: 4,
  },

  // Stats Row
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  statBox: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#E8E8E8",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#999",
    letterSpacing: 0.5,
  },

  // Updated
  updatedText: {
    fontSize: 11,
    color: "#BBB",
    marginTop: 10,
  },
});