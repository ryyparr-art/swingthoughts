import BottomActionBar from "@/components/navigation/BottomActionBar";
import LowmanCarousel from "@/components/navigation/LowmanCarousel";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "firebase/firestore";

import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/* ------------------------------------------------------------------ */
/* TYPES                                                              */
/* ------------------------------------------------------------------ */

interface Score {
  scoreId: string;
  userId: string;
  courseId: number;
  courseName: string;
  grossScore: number;
  netScore: number;
  par: number;
  createdAt: any;
  userName?: string;
  userAvatar?: string | null;
}

interface UserProfile {
  displayName?: string;
  avatar?: string | null;
  userType?: string;
}

interface CourseBoard {
  courseId: number;
  courseName: string;
  scores: Score[];
}

/* ------------------------------------------------------------------ */

export default function LeaderboardScreen() {
  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<CourseBoard[]>([]);
  const [locationLabel, setLocationLabel] = useState("Nearby");

  const LocationIcon = require("@/assets/icons/Location Near Me.png");

  const params = useLocalSearchParams();
  const { filterType, courseId, playerId } = params as {
    filterType?: "near" | "all" | "course" | "player";
    courseId?: string;
    playerId?: string;
  };

  /* ---------------------- LOAD USER LOCATION ---------------------- */

  useEffect(() => {
    const loadLocation = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const loc = snap.data().location;
        if (loc?.city && loc?.state) {
          setLocationLabel(`${loc.city}, ${loc.state}`);
        }
      }
    };

    loadLocation();
  }, []);

  /* ---------------------- FETCH LEADERBOARDS ---------------------- */

  useEffect(() => {
    fetchLeaderboards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, courseId, playerId]);

  const fetchLeaderboards = async () => {
    try {
      setLoading(true);

      let q;

      if (filterType === "player" && playerId) {
        q = query(
          collection(db, "scores"),
          where("userId", "==", playerId)
        );
      } else if (filterType === "course" && courseId) {
        q = query(
          collection(db, "scores"),
          where("courseId", "==", Number(courseId))
        );
      } else {
        q = query(collection(db, "scores"));
      }

      const snap = await getDocs(q);

      const scores: Score[] = [];
      const userIds = new Set<string>();

      snap.forEach((d) => {
        const data = d.data();
        scores.push({
          scoreId: d.id,
          userId: data.userId,
          courseId: data.courseId,
          courseName: data.courseName,
          grossScore: data.grossScore,
          netScore: data.netScore,
          par: data.par,
          createdAt: data.createdAt,
        });
        userIds.add(data.userId);
      });

      /* ---- LOAD USER PROFILES ---- */

      const profiles: Record<string, UserProfile> = {};
      const ids = Array.from(userIds);

      for (let i = 0; i < ids.length; i += 10) {
        const batch = ids.slice(i, i + 10);
        const uq = query(
          collection(db, "users"),
          where("__name__", "in", batch)
        );
        const us = await getDocs(uq);
        us.forEach((u) => {
          profiles[u.id] = u.data() as UserProfile;
        });
      }

      /* ---- MERGE + FILTER ---- */

      const merged = scores
        .filter((s) => profiles[s.userId]?.userType !== "Course")
        .map((s) => ({
          ...s,
          userName: profiles[s.userId]?.displayName || "Player",
          userAvatar: profiles[s.userId]?.avatar ?? null,
        }));

      /* ---- GROUP BY COURSE ---- */

      const grouped: Record<number, CourseBoard> = {};

      merged.forEach((s) => {
        if (!grouped[s.courseId]) {
          grouped[s.courseId] = {
            courseId: s.courseId,
            courseName: s.courseName,
            scores: [],
          };
        }
        grouped[s.courseId].scores.push(s);
      });

      /* ---- SORT + TOP 3 PER COURSE ---- */

      const boards: CourseBoard[] = Object.values(grouped).map((b) => {
        const sorted = [...b.scores].sort(
          (a, b) => a.netScore - b.netScore
        );
        return {
          ...b,
          scores: sorted.slice(0, 3),
        };
      });

      setBoards(boards);
      setLoading(false);
    } catch (e) {
      console.error("Leaderboard error:", e);
      setLoading(false);
    }
  };

  /* ---------------------- INTERACTIONS ---------------------- */

  const goToPlayer = (userId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/locker/${userId}`);
  };

  const goToCourse = (courseId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/course/${courseId}`);
  };

  const goToPostScore = (courseId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/post-score",
      params: { courseId },
    });
  };

  /* ---------------------- RENDER ---------------------- */

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      <View style={styles.carouselWrapper}>
        <LowmanCarousel />
      </View>

      <TopNavBar />

      {/* LOCATION ROW */}
      <View style={styles.locationRow}>
        <Image source={LocationIcon} style={styles.locationIcon} />
        <Text style={styles.locationText}>{locationLabel}</Text>
        <TouchableOpacity
          onPress={() =>
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          }
        >
          <Text style={styles.change}>Change</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#0D5C3A" />
        </View>
      ) : (
        <FlatList
          data={boards}
          keyExtractor={(b) => String(b.courseId)}
          contentContainerStyle={{ paddingBottom: 140 }}
          renderItem={({ item }) => (
            <View style={styles.board}>
              {/* COURSE HEADER */}
              <TouchableOpacity onPress={() => goToCourse(item.courseId)}>
                <Text style={styles.boardTitle}>
                  {item.courseName} Leaders
                </Text>
              </TouchableOpacity>

              {/* COLUMN HEADER */}
              <View style={styles.rowHeader}>
                <Text style={styles.colPos}>POS</Text>
                <Text style={styles.colPlayer}>PLAYER</Text>
                <Text style={styles.colScore}>G</Text>
                <Text style={styles.colScore}>N</Text>
                <Text style={styles.colLow}>LOW</Text>
              </View>

              {/* ROWS */}
              {item.scores.length === 0 ? (
                <TouchableOpacity
                  style={styles.emptyRow}
                  onPress={() => goToPostScore(item.courseId)}
                >
                  <Text style={styles.emptyText}>
                    Be the first Lowman ⛳
                  </Text>
                </TouchableOpacity>
              ) : (
                item.scores.map((s, i) => {
                  const isLowman =
                    s.netScore ===
                    Math.min(...item.scores.map((x) => x.netScore));

                  return (
                    <View key={s.scoreId} style={styles.row}>
                      <Text style={styles.colPos}>{i + 1}</Text>

                      <TouchableOpacity
                        style={styles.playerCell}
                        onPress={() => goToPlayer(s.userId)}
                      >
                        {s.userAvatar ? (
                          <Image
                            source={{ uri: s.userAvatar }}
                            style={styles.avatar}
                          />
                        ) : (
                          <View style={styles.avatarFallback} />
                        )}
                        <Text style={styles.playerName}>
                          {s.userName}
                        </Text>
                      </TouchableOpacity>

                      <Text style={styles.colScore}>
                        {s.grossScore}
                      </Text>
                      <Text
                        style={[
                          styles.colScore,
                          isLowman && styles.lowNet,
                        ]}
                      >
                        {s.netScore}
                      </Text>
                      <Text style={styles.colLow}>
                        {isLowman ? "🏆" : ""}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          )}
        />
      )}

      <BottomActionBar />
      <SwingFooter />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* STYLES                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  safeTop: { backgroundColor: "#0D5C3A" },
  carouselWrapper: { height: 50 },

  loading: { flex: 1, justifyContent: "center", alignItems: "center" },

  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
  },
  locationIcon: {
    width: 22,
    height: 22,
    tintColor: "#B0433B",
  },
  locationText: {
    fontWeight: "800",
    fontSize: 15,
  },
  change: {
    fontWeight: "700",
    color: "#0D5C3A",
  },

  board: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#DDD",
    backgroundColor: "#FFF",
  },
  boardTitle: {
    fontWeight: "900",
    fontSize: 18,
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#DDD",
  },

  rowHeader: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#F0F0F0",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderColor: "#EEE",
  },

  colPos: { width: 40, fontWeight: "800", textAlign: "center" },
  colPlayer: { flex: 1, fontWeight: "800" },
  colScore: { width: 44, textAlign: "center", fontWeight: "700" },
  colLow: { width: 44, textAlign: "center" },

  playerCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  avatar: { width: 26, height: 26, borderRadius: 13 },
  avatarFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#CCC",
  },

  playerName: { fontWeight: "700" },

  lowNet: { color: "#C9A400", fontWeight: "900" },

  emptyRow: {
    padding: 16,
    alignItems: "center",
  },
  emptyText: {
    fontStyle: "italic",
    fontWeight: "700",
    color: "#0D5C3A",
  },
});



