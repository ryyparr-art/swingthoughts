/**
 * Invitational Hub - Standings Tab
 *
 * Shows:
 * - Cumulative leaderboard across all completed rounds
 * - Player rows: rank, avatar, name, total score, to-par, rounds played
 * - Tappable rows expand to show per-round score breakdown
 * - Round selector pills to filter by individual round
 * - User's row highlighted
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  doc,
  getDocs,
  collection,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface Invitational {
  id: string;
  name: string;
  hostUserId: string;
  status: string;
  overallScoring: string;
  handicapMethod: string;
  rounds: InvitationalRound[];
  roster: RosterEntry[];
  standings: Standing[] | null;
}

interface InvitationalRound {
  roundId: string;
  courseName: string;
  date: Timestamp;
  format: string;
  scoringType: string;
  status: string;
  roundNumber: number;
}

interface RosterEntry {
  userId: string | null;
  displayName: string;
  avatar?: string;
  status: string;
  isGhost: boolean;
}

interface Standing {
  userId: string;
  displayName: string;
  totalScore: number;
  toPar: number;
  rank: number;
  roundScores: number[];
}

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function InvitationalStandings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const invitationalId = Array.isArray(id) ? id[0] : id;
  const currentUserId = auth.currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invitational, setInvitational] = useState<Invitational | null>(null);
  const [selectedRound, setSelectedRound] = useState<number>(0); // 0 = overall
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  // Highlight animation for user's row
  const highlightAnim = useRef(new Animated.Value(0)).current;

  /* ================================================================ */
  /* DATA LOADING                                                    */
  /* ================================================================ */

  useEffect(() => {
    if (!invitationalId) return;

    const unsub = onSnapshot(
      doc(db, "invitationals", invitationalId),
      (docSnap) => {
        if (docSnap.exists()) {
          setInvitational({ id: docSnap.id, ...docSnap.data() } as Invitational);
        }
        setLoading(false);
      }
    );

    return () => unsub();
  }, [invitationalId]);

  // Flash user's row on load
  useEffect(() => {
    if (invitational?.standings && currentUserId) {
      Animated.sequence([
        Animated.timing(highlightAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.delay(800),
        Animated.timing(highlightAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [invitational?.standings]);

  const onRefresh = async () => {
    setRefreshing(true);
    // onSnapshot handles refresh — just wait a tick
    setTimeout(() => setRefreshing(false), 500);
  };

  /* ================================================================ */
  /* HELPERS                                                         */
  /* ================================================================ */

  const getCompletedRounds = () =>
    invitational?.rounds?.filter((r) => r.status === "completed") || [];

  const getStandings = (): Standing[] => {
    if (!invitational?.standings) return [];
    return [...invitational.standings].sort((a, b) => a.rank - b.rank);
  };

  const getRosterEntry = (userId: string): RosterEntry | undefined =>
    invitational?.roster?.find((r) => r.userId === userId);

  const getRankDisplay = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  const getToParDisplay = (toPar: number) => {
    if (toPar === 0) return "E";
    return toPar > 0 ? `+${toPar}` : `${toPar}`;
  };

  /* ================================================================ */
  /* RENDER                                                          */
  /* ================================================================ */

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => {
          soundPlayer.play("click");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}
      >
        <Image
          source={require("@/assets/icons/Back.png")}
          style={styles.backIcon}
        />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Invitational</Text>
      <View style={styles.headerRight} />
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabBar}>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => {
          soundPlayer.play("click");
          router.replace(`/invitationals/home?id=${invitationalId}` as any);
        }}
      >
        <Text style={styles.tabText}>Home</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, styles.tabActive]}>
        <Text style={[styles.tabText, styles.tabTextActive]}>Standings</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => {
          soundPlayer.play("click");
          router.replace(`/invitationals/schedule?id=${invitationalId}` as any);
        }}
      >
        <Text style={styles.tabText}>Schedule</Text>
      </TouchableOpacity>
    </View>
  );

  const renderRoundSelector = () => {
    const completedRounds = getCompletedRounds();
    if (completedRounds.length === 0) return null;

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.roundPills}
      >
        <TouchableOpacity
          style={[styles.roundPill, selectedRound === 0 && styles.roundPillActive]}
          onPress={() => {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSelectedRound(0);
          }}
        >
          <Text
            style={[
              styles.roundPillText,
              selectedRound === 0 && styles.roundPillTextActive,
            ]}
          >
            Overall
          </Text>
        </TouchableOpacity>

        {completedRounds.map((round) => (
          <TouchableOpacity
            key={round.roundId}
            style={[
              styles.roundPill,
              selectedRound === round.roundNumber && styles.roundPillActive,
            ]}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedRound(round.roundNumber);
            }}
          >
            <Text
              style={[
                styles.roundPillText,
                selectedRound === round.roundNumber && styles.roundPillTextActive,
              ]}
            >
              R{round.roundNumber}
            </Text>
            <Text style={styles.roundPillCourse} numberOfLines={1}>
              {round.courseName}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  const renderLeaderboard = () => {
    const standings = getStandings();

    if (standings.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="podium-outline" size={48} color="#CCC" />
          <Text style={styles.emptyTitle}>No Standings Yet</Text>
          <Text style={styles.emptySubtitle}>
            Standings will appear after the first round is completed
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.leaderboard}>
        {/* Column headers */}
        <View style={styles.columnHeaders}>
          <Text style={[styles.colHeader, styles.colRank]}>#</Text>
          <Text style={[styles.colHeader, styles.colName]}>Player</Text>
          <Text style={[styles.colHeader, styles.colScore]}>Score</Text>
          <Text style={[styles.colHeader, styles.colPar]}>Par</Text>
          <Text style={[styles.colHeader, styles.colRounds]}>Rds</Text>
        </View>

        {standings.map((standing) => {
          const isMe = standing.userId === currentUserId;
          const isExpanded = expandedUserId === standing.userId;
          const rosterEntry = getRosterEntry(standing.userId);

          const highlightBg = isMe
            ? highlightAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["rgba(184, 134, 11, 0)", "rgba(184, 134, 11, 0.12)"],
              })
            : undefined;

          return (
            <View key={standing.userId}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedUserId(isExpanded ? null : standing.userId);
                }}
              >
                <Animated.View
                  style={[
                    styles.playerRow,
                    isMe && styles.playerRowMe,
                    highlightBg ? { backgroundColor: highlightBg } : null,
                  ]}
                >
                  {/* Rank */}
                  <Text style={[styles.colRank, styles.rankText]}>
                    {getRankDisplay(standing.rank)}
                  </Text>

                  {/* Avatar + Name */}
                  <View style={[styles.colName, styles.playerInfo]}>
                    {rosterEntry?.avatar ? (
                      <Image
                        source={{ uri: rosterEntry.avatar }}
                        style={styles.avatar}
                      />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarText}>
                          {standing.displayName?.charAt(0) || "?"}
                        </Text>
                      </View>
                    )}
                    <View style={styles.nameContainer}>
                      <Text
                        style={[styles.playerName, isMe && styles.playerNameMe]}
                        numberOfLines={1}
                      >
                        {standing.displayName}
                        {isMe ? " (You)" : ""}
                      </Text>
                    </View>
                  </View>

                  {/* Score */}
                  <Text style={[styles.colScore, styles.scoreText]}>
                    {selectedRound === 0
                      ? standing.totalScore
                      : standing.roundScores?.[selectedRound - 1] ?? "-"}
                  </Text>

                  {/* To Par */}
                  <Text
                    style={[
                      styles.colPar,
                      styles.parText,
                      standing.toPar < 0 && styles.parUnder,
                      standing.toPar > 0 && styles.parOver,
                    ]}
                  >
                    {selectedRound === 0 ? getToParDisplay(standing.toPar) : ""}
                  </Text>

                  {/* Rounds played */}
                  <Text style={[styles.colRounds, styles.roundsText]}>
                    {standing.roundScores?.filter((s) => s > 0).length || 0}
                  </Text>

                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={14}
                    color="#999"
                  />
                </Animated.View>
              </TouchableOpacity>

              {/* Expanded per-round breakdown */}
              {isExpanded && standing.roundScores && (
                <View style={styles.expandedRow}>
                  {standing.roundScores.map((score, idx) => {
                    const round = invitational?.rounds?.[idx];
                    if (!round || round.status !== "completed") return null;

                    return (
                      <View key={idx} style={styles.roundScoreRow}>
                        <View style={styles.roundScoreBadge}>
                          <Text style={styles.roundScoreBadgeText}>
                            R{idx + 1}
                          </Text>
                        </View>
                        <Text style={styles.roundScoreCourse} numberOfLines={1}>
                          {round.courseName}
                        </Text>
                        <Text style={styles.roundScoreValue}>
                          {score > 0 ? score : "DNS"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  /* ================================================================ */
  /* MAIN RENDER                                                     */
  /* ================================================================ */

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#B8860B" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderHeader()}
      {renderTabs()}

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#B8860B"
          />
        }
      >
        {/* Event name + scoring type */}
        <View style={styles.eventInfo}>
          <Text style={styles.eventName}>{invitational?.name}</Text>
          <View style={styles.scoringBadge}>
            <Text style={styles.scoringBadgeText}>
              {invitational?.overallScoring === "cumulative"
                ? "Cumulative"
                : invitational?.overallScoring === "points"
                ? "Points"
                : "Best Of"}
            </Text>
          </View>
        </View>

        {renderRoundSelector()}
        {renderLeaderboard()}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#0D5C3A",
  },
  headerButton: { padding: 8 },
  backIcon: { width: 24, height: 24, tintColor: "#F4EED8" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#F4EED8" },
  headerRight: { width: 40 },

  // Tabs
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  tabActive: { backgroundColor: "#B8860B" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#666" },
  tabTextActive: { color: "#FFF", fontWeight: "700" },

  // Content
  content: { flex: 1 },
  contentContainer: { padding: 16, gap: 16 },

  // Event info
  eventInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eventName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    flex: 1,
  },
  scoringBadge: {
    backgroundColor: "rgba(184, 134, 11, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  scoringBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B8860B",
  },

  // Round pills
  roundPills: {
    gap: 8,
    paddingVertical: 4,
  },
  roundPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  roundPillActive: {
    backgroundColor: "#B8860B",
    borderColor: "#B8860B",
  },
  roundPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#666",
  },
  roundPillTextActive: {
    color: "#FFF",
  },
  roundPillCourse: {
    fontSize: 11,
    color: "#999",
    maxWidth: 80,
  },

  // Leaderboard
  leaderboard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    overflow: "hidden",
  },
  columnHeaders: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    backgroundColor: "#FAFAFA",
  },
  colHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  colRank: { width: 36 },
  colName: { flex: 1 },
  colScore: { width: 44, textAlign: "center" },
  colPar: { width: 40, textAlign: "center" },
  colRounds: { width: 30, textAlign: "center" },

  // Player rows
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F5F5",
  },
  playerRowMe: {
    backgroundColor: "rgba(184, 134, 11, 0.04)",
  },
  rankText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#B8860B",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFF",
  },
  nameContainer: { flex: 1 },
  playerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  playerNameMe: {
    fontWeight: "700",
    color: "#B8860B",
  },
  scoreText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
  },
  parText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    textAlign: "center",
  },
  parUnder: { color: "#0D5C3A" },
  parOver: { color: "#D32F2F" },
  roundsText: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
  },

  // Expanded row
  expandedRow: {
    backgroundColor: "#FAFAF5",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  roundScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  roundScoreBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E0E0E0",
    alignItems: "center",
    justifyContent: "center",
  },
  roundScoreBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#666",
  },
  roundScoreCourse: {
    flex: 1,
    fontSize: 13,
    color: "#666",
  },
  roundScoreValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    width: 40,
    textAlign: "right",
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
    paddingHorizontal: 32,
  },
});