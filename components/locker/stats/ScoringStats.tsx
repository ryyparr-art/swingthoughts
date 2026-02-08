/**
 * ScoringStats Tab
 * 
 * Displays:
 * - Scoring Summary donut chart (birdies/pars/bogeys/doubles/triples)
 * - Par 3 / Par 4 / Par 5 averages
 * - Career stats (total birdies, eagles, albatross, hole-in-ones)
 * 
 * Data sources:
 * - scores collection (standalone 18-hole rounds with holeScores)
 * - leagues/{id}/scores (league rounds with holeScores)
 * - courses collection (for backfilling par data per hole)
 * 
 * Only processes rounds that have holeScores arrays AND hole-by-hole par data
 * (either stored on the score or backfilled from the course).
 */

import { db } from "@/constants/firebaseConfig";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import ScoringDonut from "./ScoringDonut";

interface ScoringStatsProps {
  userId: string;
}

interface HoleResult {
  score: number;
  par: number;
  holeType: "par3" | "par4" | "par5";
  relativeToPar: number; // -2 eagle, -1 birdie, 0 par, +1 bogey, etc.
}

// Cache course par data so we don't re-fetch for the same course
const courseParCache: Record<string, number[] | null> = {};

export default function ScoringStats({ userId }: ScoringStatsProps) {
  const [loading, setLoading] = useState(true);
  const [holeResults, setHoleResults] = useState<HoleResult[]>([]);
  const [roundCount, setRoundCount] = useState(0);
  const [careerStats, setCareerStats] = useState({
    birdies: 0,
    eagles: 0,
    albatross: 0,
    holeInOnes: 0,
  });

  useEffect(() => {
    loadAllStats();
  }, [userId]);

  /**
   * Load par data for a course from Firestore.
   * Returns an array of pars per hole (e.g., [4,3,5,4,4,3,4,5,4]) or null.
   */
  const getCoursePars = async (courseId: string | number): Promise<number[] | null> => {
    const cacheKey = String(courseId);
    if (cacheKey in courseParCache) return courseParCache[cacheKey];

    try {
      const courseDoc = await getDoc(doc(db, "courses", cacheKey));
      if (!courseDoc.exists()) {
        courseParCache[cacheKey] = null;
        return null;
      }

      const data = courseDoc.data();
      const tees = data?.tees;
      if (!tees) {
        courseParCache[cacheKey] = null;
        return null;
      }

      // Get pars from the first available tee set (pars are same across tees)
      const allTees = [...(tees.male || []), ...(tees.female || [])];
      if (allTees.length === 0) {
        courseParCache[cacheKey] = null;
        return null;
      }

      const firstTee = allTees[0];
      if (!firstTee.holes || !Array.isArray(firstTee.holes)) {
        courseParCache[cacheKey] = null;
        return null;
      }

      const pars = firstTee.holes.map((h: any) => h.par || 4);
      courseParCache[cacheKey] = pars;
      return pars;
    } catch (error) {
      console.error(`Error loading course ${courseId} pars:`, error);
      courseParCache[cacheKey] = null;
      return null;
    }
  };

  /**
   * Process a single score document into HoleResult entries.
   * Requires holeScores array and matching par data.
   */
  const processScore = async (scoreData: any): Promise<HoleResult[]> => {
    const holeScores: number[] = scoreData.holeScores;
    if (!Array.isArray(holeScores) || holeScores.length === 0) return [];

    // Try to get par data — check score doc first, then backfill from course
    let holePars: number[] | null = null;

    // Option 1: Score has holePars stored directly
    if (Array.isArray(scoreData.holePars) && scoreData.holePars.length === holeScores.length) {
      holePars = scoreData.holePars;
    }

    // Option 2: Backfill from course data
    if (!holePars && scoreData.courseId) {
      const coursePars = await getCoursePars(scoreData.courseId);
      if (coursePars) {
        // Take the same number of holes as the score
        holePars = coursePars.slice(0, holeScores.length);
      }
    }

    // Option 3: Use totalPar to estimate (fallback — less accurate)
    if (!holePars && scoreData.totalPar && holeScores.length > 0) {
      const avgPar = scoreData.totalPar / holeScores.length;
      // If average is close to 4, assume all par 4s (rough fallback)
      holePars = holeScores.map(() => Math.round(avgPar));
    }

    if (!holePars || holePars.length !== holeScores.length) return [];

    return holeScores.map((score, i) => {
      const par = holePars![i];
      const relativeToPar = score - par;
      let holeType: "par3" | "par4" | "par5";
      if (par <= 3) holeType = "par3";
      else if (par >= 5) holeType = "par5";
      else holeType = "par4";

      return { score, par, holeType, relativeToPar };
    });
  };

  const loadAllStats = async () => {
    if (!userId) return;

    try {
      const allHoleResults: HoleResult[] = [];
      let rounds = 0;

      // 1. Load standalone scores
      const standaloneSnap = await getDocs(
        query(
          collection(db, "scores"),
          where("userId", "==", userId),
          orderBy("createdAt", "desc"),
          limit(50)
        )
      );

      for (const scoreDoc of standaloneSnap.docs) {
        const data = scoreDoc.data();
        const results = await processScore(data);
        if (results.length > 0) {
          allHoleResults.push(...results);
          rounds++;
        }
      }

      // 2. Load league scores from handicapHistory to find league IDs
      const historySnap = await getDocs(
        query(
          collection(db, "users", userId, "handicapHistory"),
          where("source", "==", "league"),
          limit(50)
        )
      );

      // Get unique league IDs
      const leagueIds = new Set<string>();
      historySnap.docs.forEach((doc) => {
        const data = doc.data();
        if (data.leagueId) leagueIds.add(data.leagueId);
      });

      // Load league scores
      for (const leagueId of leagueIds) {
        try {
          const leagueScoreSnap = await getDocs(
            query(
              collection(db, "leagues", leagueId, "scores"),
              where("userId", "==", userId),
              orderBy("createdAt", "desc"),
              limit(20)
            )
          );

          for (const scoreDoc of leagueScoreSnap.docs) {
            const data = scoreDoc.data();
            const results = await processScore(data);
            if (results.length > 0) {
              allHoleResults.push(...results);
              rounds++;
            }
          }
        } catch (error) {
          console.log(`⚠️ Could not load scores from league ${leagueId}:`, error);
        }
      }

      setHoleResults(allHoleResults);
      setRoundCount(rounds);

      // 3. Load career stats from user profile
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setCareerStats({
          birdies: userData.totalBirdies || 0,
          eagles: userData.totalEagles || 0,
          albatross: userData.totalAlbatross || 0,
          holeInOnes: userData.totalHoleInOnes || 0,
        });
      }
    } catch (error) {
      console.error("Error loading scoring stats:", error);
    }
    setLoading(false);
  };

  // ============ Compute Stats ============

  // Scoring breakdown
  const birdiesOrBetter = holeResults.filter((h) => h.relativeToPar <= -1).length;
  const pars = holeResults.filter((h) => h.relativeToPar === 0).length;
  const bogeys = holeResults.filter((h) => h.relativeToPar === 1).length;
  const doubleBogeys = holeResults.filter((h) => h.relativeToPar === 2).length;
  const tripleOrWorse = holeResults.filter((h) => h.relativeToPar >= 3).length;
  const totalHoles = holeResults.length;

  // Par 3/4/5 averages
  const par3Holes = holeResults.filter((h) => h.holeType === "par3");
  const par4Holes = holeResults.filter((h) => h.holeType === "par4");
  const par5Holes = holeResults.filter((h) => h.holeType === "par5");

  const par3Avg =
    par3Holes.length > 0
      ? (par3Holes.reduce((s, h) => s + h.score, 0) / par3Holes.length).toFixed(2)
      : "—";
  const par4Avg =
    par4Holes.length > 0
      ? (par4Holes.reduce((s, h) => s + h.score, 0) / par4Holes.length).toFixed(2)
      : "—";
  const par5Avg =
    par5Holes.length > 0
      ? (par5Holes.reduce((s, h) => s + h.score, 0) / par5Holes.length).toFixed(2)
      : "—";

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
        <Text style={styles.loadingText}>Analyzing rounds...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Scoring Summary */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Scoring Summary — {roundCount} Round{roundCount !== 1 ? "s" : ""}
        </Text>
        {totalHoles > 0 ? (
          <ScoringDonut
            birdiesOrBetter={birdiesOrBetter}
            pars={pars}
            bogeys={bogeys}
            doubleBogeys={doubleBogeys}
            tripleOrWorse={tripleOrWorse}
            totalHoles={totalHoles}
          />
        ) : (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>No hole-by-hole data yet</Text>
            <Text style={styles.noDataSubtext}>
              Post rounds with tee selection to see scoring breakdown
            </Text>
          </View>
        )}
      </View>

      {/* Par Averages */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Scoring Averages</Text>
        <View style={styles.parAvgRow}>
          <View style={styles.parAvgItem}>
            <Text style={styles.parAvgLabel}>Par 3s</Text>
            <Text style={styles.parAvgValue}>{par3Avg}</Text>
            {par3Holes.length > 0 && (
              <Text style={styles.parAvgCount}>{par3Holes.length} holes</Text>
            )}
          </View>
          <View style={styles.parAvgDivider} />
          <View style={styles.parAvgItem}>
            <Text style={styles.parAvgLabel}>Par 4s</Text>
            <Text style={styles.parAvgValue}>{par4Avg}</Text>
            {par4Holes.length > 0 && (
              <Text style={styles.parAvgCount}>{par4Holes.length} holes</Text>
            )}
          </View>
          <View style={styles.parAvgDivider} />
          <View style={styles.parAvgItem}>
            <Text style={styles.parAvgLabel}>Par 5s</Text>
            <Text style={styles.parAvgValue}>{par5Avg}</Text>
            {par5Holes.length > 0 && (
              <Text style={styles.parAvgCount}>{par5Holes.length} holes</Text>
            )}
          </View>
        </View>
      </View>

      {/* Career Stats */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Career Milestones</Text>
        <View style={styles.careerGrid}>
          <View style={styles.careerItem}>
            <Text style={styles.careerEmoji}>🦩</Text>
            <Text style={styles.careerValue}>
              {careerStats.birdies > 0 ? careerStats.birdies : "—"}
            </Text>
            <Text style={styles.careerLabel}>Birdies</Text>
          </View>
          <View style={styles.careerItem}>
            <Text style={styles.careerEmoji}>🦅</Text>
            <Text style={styles.careerValue}>
              {careerStats.eagles > 0 ? careerStats.eagles : "—"}
            </Text>
            <Text style={styles.careerLabel}>Eagles</Text>
          </View>
          <View style={styles.careerItem}>
            <Text style={styles.careerEmoji}>🦢</Text>
            <Text style={styles.careerValue}>
              {careerStats.albatross > 0 ? careerStats.albatross : "—"}
            </Text>
            <Text style={styles.careerLabel}>Albatross</Text>
          </View>
          <View style={styles.careerItem}>
            <Text style={styles.careerEmoji}>🏆</Text>
            <Text style={styles.careerValue}>
              {careerStats.holeInOnes > 0 ? careerStats.holeInOnes : "—"}
            </Text>
            <Text style={styles.careerLabel}>Hole-in-Ones</Text>
          </View>
        </View>
      </View>

      {/* Hole-by-hole breakdown */}
      {totalHoles > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hole Results Breakdown</Text>
          <View style={styles.breakdownList}>
            {[
              { label: "Eagles or Better", count: holeResults.filter((h) => h.relativeToPar <= -2).length, color: "#0D5C3A" },
              { label: "Birdies", count: holeResults.filter((h) => h.relativeToPar === -1).length, color: "#2E7D32" },
              { label: "Pars", count: pars, color: "#4CAF50" },
              { label: "Bogeys", count: bogeys, color: "#B0C8B0" },
              { label: "Double Bogeys", count: doubleBogeys, color: "#E8C87A" },
              { label: "Triple Bogeys+", count: tripleOrWorse, color: "#C62828" },
            ].map((item, i) => (
              <View key={i} style={styles.breakdownRow}>
                <View style={styles.breakdownLeft}>
                  <View style={[styles.breakdownDot, { backgroundColor: item.color }]} />
                  <Text style={styles.breakdownLabel}>{item.label}</Text>
                </View>
                <View style={styles.breakdownRight}>
                  <Text style={styles.breakdownCount}>{item.count}</Text>
                  <Text style={styles.breakdownPct}>
                    {totalHoles > 0 ? Math.round((item.count / totalHoles) * 100) : 0}%
                  </Text>
                </View>
                {/* Bar */}
                <View style={styles.breakdownBarBg}>
                  <View
                    style={[
                      styles.breakdownBar,
                      {
                        width: `${totalHoles > 0 ? (item.count / totalHoles) * 100 : 0}%`,
                        backgroundColor: item.color,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  content: {
    padding: 16,
    gap: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#888",
  },

  // Cards
  card: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    marginBottom: 12,
    textAlign: "center",
  },

  // No Data
  noDataContainer: {
    alignItems: "center",
    paddingVertical: 30,
  },
  noDataText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#999",
    marginBottom: 6,
  },
  noDataSubtext: {
    fontSize: 12,
    color: "#BBB",
    textAlign: "center",
  },

  // Par Averages
  parAvgRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  parAvgItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  parAvgDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#E8E8E8",
  },
  parAvgLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
    marginBottom: 4,
  },
  parAvgValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#333",
  },
  parAvgCount: {
    fontSize: 10,
    color: "#BBB",
    marginTop: 2,
  },

  // Career Grid
  careerGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
  },
  careerItem: {
    alignItems: "center",
    gap: 4,
  },
  careerEmoji: {
    fontSize: 28,
  },
  careerValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#333",
  },
  careerLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#999",
    letterSpacing: 0.3,
  },

  // Breakdown List
  breakdownList: {
    gap: 10,
  },
  breakdownRow: {
    gap: 4,
  },
  breakdownLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  breakdownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  breakdownLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#555",
    flex: 1,
  },
  breakdownRight: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    paddingLeft: 18,
  },
  breakdownCount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    width: 30,
    textAlign: "right",
  },
  breakdownPct: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
    width: 35,
    textAlign: "right",
  },
  breakdownBarBg: {
    height: 6,
    backgroundColor: "#F0F0F0",
    borderRadius: 3,
    marginLeft: 18,
    overflow: "hidden",
  },
  breakdownBar: {
    height: "100%",
    borderRadius: 3,
  },
});