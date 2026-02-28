/**
 * Invitational Hub - Schedule Tab
 *
 * Shows:
 * - Timeline of all rounds (completed, active, upcoming)
 * - Each round card: badge, course, date, tee time, format, status
 * - Completed: winner + course
 * - Active: "Live" badge + link to outing scorecard
 * - Upcoming: host sees "Start Round" → creates backing outing
 * - Host sees "Manage Groups" on upcoming rounds
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    doc,
    onSnapshot,
    Timestamp,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
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
  startDate: Timestamp;
  endDate: Timestamp;
  isSingleDay: boolean;
  rounds: InvitationalRound[];
  standings: Standing[] | null;
}

interface InvitationalRound {
  roundId: string;
  courseId: number | null;
  courseName: string;
  courseLocation: { city: string; state: string };
  date: Timestamp;
  teeTime: string | null;
  format: string;
  scoringType: string;
  status: "upcoming" | "active" | "completed";
  outingId: string | null;
  groups: any[];
  roundNumber: number;
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

export default function InvitationalSchedule() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const invitationalId = Array.isArray(id) ? id[0] : id;
  const currentUserId = auth.currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invitational, setInvitational] = useState<Invitational | null>(null);
  const [isHost, setIsHost] = useState(false);

  /* ================================================================ */
  /* DATA LOADING                                                    */
  /* ================================================================ */

  useEffect(() => {
    if (!invitationalId) return;

    const unsub = onSnapshot(
      doc(db, "invitationals", invitationalId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as Invitational;
          setInvitational(data);
          setIsHost(data.hostUserId === currentUserId);
        }
        setLoading(false);
      }
    );

    return () => unsub();
  }, [invitationalId]);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  /* ================================================================ */
  /* HANDLERS                                                        */
  /* ================================================================ */

  const [startingRound, setStartingRound] = useState(false);

  const handleStartRound = (round: InvitationalRound) => {
    if (!invitationalId) return;

    Alert.alert(
      "Start Round",
      `Start Round ${round.roundNumber} at ${round.courseName}? This will create the scoring outing for all players.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start Round",
          onPress: async () => {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

            setStartingRound(true);
            try {
              const functions = getFunctions();
              const startRound = httpsCallable(functions, "startInvitationalRound");
              const result = await startRound({
                invitationalId,
                roundId: round.roundId,
              });

              const data = result.data as any;
              soundPlayer.play("postThought");
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

              Alert.alert(
                "Round Started!",
                `Round ${round.roundNumber} is live with ${data.playerCount} players in ${data.groupCount} group${data.groupCount > 1 ? "s" : ""}. Players can now start scoring.`
              );
            } catch (err: any) {
              console.error("Start round failed:", err);
              const message =
                err?.message?.includes("permission-denied")
                  ? "Only the host can start rounds."
                  : err?.message?.includes("failed-precondition")
                  ? err.message
                  : "Failed to start round. Please try again.";
              Alert.alert("Error", message);
            } finally {
              setStartingRound(false);
            }
          },
        },
      ]
    );
  };

  const handleManageGroups = (round: InvitationalRound) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // TODO: Navigate to group management screen
    Alert.alert(
      "Coming Soon",
      "Group management will let you assign players to groups and set tee times."
    );
  };

  const handleViewOuting = (outingId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/outings/${outingId}` as any);
  };

  /* ================================================================ */
  /* HELPERS                                                         */
  /* ================================================================ */

  const formatDate = (timestamp: Timestamp) => {
    if (!timestamp?.toDate) return "TBD";
    return timestamp.toDate().toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  };

  const formatDateShort = (timestamp: Timestamp) => {
    if (!timestamp?.toDate) return "TBD";
    return timestamp.toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const getFormatLabel = (format: string) => {
    switch (format) {
      case "stroke": return "Stroke Play";
      case "stableford": return "Stableford";
      case "scramble": return "Scramble";
      default: return format;
    }
  };

  const getRoundWinner = (roundNumber: number): Standing | null => {
    if (!invitational?.standings) return null;
    // Sort by this round's score
    const sorted = [...invitational.standings]
      .filter((s) => s.roundScores?.[roundNumber - 1] > 0)
      .sort(
        (a, b) =>
          (a.roundScores?.[roundNumber - 1] || 999) -
          (b.roundScores?.[roundNumber - 1] || 999)
      );
    return sorted.length > 0 ? sorted[0] : null;
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "completed":
        return { label: "Complete", color: "#B8860B", bg: "rgba(184, 134, 11, 0.1)", icon: "checkmark-circle" };
      case "active":
        return { label: "Live", color: "#0D5C3A", bg: "rgba(13, 92, 58, 0.1)", icon: "play-circle" };
      default:
        return { label: "Upcoming", color: "#666", bg: "rgba(0, 0, 0, 0.05)", icon: "time-outline" };
    }
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
      <TouchableOpacity
        style={styles.tab}
        onPress={() => {
          soundPlayer.play("click");
          router.replace(`/invitationals/standings?id=${invitationalId}` as any);
        }}
      >
        <Text style={styles.tabText}>Standings</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, styles.tabActive]}>
        <Text style={[styles.tabText, styles.tabTextActive]}>Schedule</Text>
      </TouchableOpacity>
    </View>
  );

  const renderRoundCard = (round: InvitationalRound) => {
    const statusConfig = getStatusConfig(round.status);
    const winner = round.status === "completed" ? getRoundWinner(round.roundNumber) : null;

    return (
      <View
        key={round.roundId}
        style={[
          styles.roundCard,
          round.status === "active" && styles.roundCardActive,
        ]}
      >
        {/* Timeline dot */}
        <View style={styles.timelineSide}>
          <View
            style={[
              styles.timelineDot,
              { backgroundColor: statusConfig.color },
            ]}
          >
            <Text style={styles.timelineDotText}>R{round.roundNumber}</Text>
          </View>
          <View style={styles.timelineLine} />
        </View>

        {/* Card content */}
        <View style={styles.roundContent}>
          {/* Status + date row */}
          <View style={styles.roundTopRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
              <Ionicons name={statusConfig.icon as any} size={12} color={statusConfig.color} />
              <Text style={[styles.statusBadgeText, { color: statusConfig.color }]}>
                {statusConfig.label}
              </Text>
            </View>
            <Text style={styles.roundDate}>{formatDateShort(round.date)}</Text>
          </View>

          {/* Course name */}
          <Text style={styles.roundCourseName}>
            {round.courseName || "Course TBD"}
          </Text>

          {/* Course location */}
          {round.courseLocation?.city && (
            <Text style={styles.roundLocation}>
              {[round.courseLocation.city, round.courseLocation.state]
                .filter(Boolean)
                .join(", ")}
            </Text>
          )}

          {/* Details row */}
          <View style={styles.roundDetails}>
            <View style={styles.detailChip}>
              <Ionicons name="golf-outline" size={12} color="#888" />
              <Text style={styles.detailChipText}>
                {getFormatLabel(round.format)}
              </Text>
            </View>
            <View style={styles.detailChip}>
              <Ionicons name="speedometer-outline" size={12} color="#888" />
              <Text style={styles.detailChipText}>
                {round.scoringType === "net" ? "Net" : "Gross"}
              </Text>
            </View>
            {round.teeTime && (
              <View style={styles.detailChip}>
                <Ionicons name="time-outline" size={12} color="#888" />
                <Text style={styles.detailChipText}>{round.teeTime}</Text>
              </View>
            )}
          </View>

          {/* Completed: show winner */}
          {round.status === "completed" && winner && (
            <View style={styles.winnerRow}>
              <Ionicons name="trophy" size={14} color="#B8860B" />
              <Text style={styles.winnerText}>
                {winner.displayName} — {winner.roundScores?.[round.roundNumber - 1]}
              </Text>
            </View>
          )}

          {/* Active: link to live outing */}
          {round.status === "active" && round.outingId && (
            <TouchableOpacity
              style={styles.liveButton}
              onPress={() => handleViewOuting(round.outingId!)}
              activeOpacity={0.7}
            >
              <View style={styles.liveDot} />
              <Text style={styles.liveButtonText}>View Live Scorecard</Text>
              <Ionicons name="arrow-forward" size={14} color="#0D5C3A" />
            </TouchableOpacity>
          )}

          {/* Upcoming: host actions */}
          {round.status === "upcoming" && isHost && (
            <View style={styles.hostActions}>
              <TouchableOpacity
                style={styles.manageGroupsButton}
                onPress={() => handleManageGroups(round)}
                activeOpacity={0.7}
              >
                <Ionicons name="people-outline" size={14} color="#B8860B" />
                <Text style={styles.manageGroupsText}>Manage Groups</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.startRoundButton, startingRound && { opacity: 0.6 }]}
                onPress={() => handleStartRound(round)}
                activeOpacity={0.8}
                disabled={startingRound}
              >
                {startingRound ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="play" size={14} color="#FFF" />
                )}
                <Text style={styles.startRoundText}>
                  {startingRound ? "Starting..." : "Start Round"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
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

  const rounds = invitational?.rounds || [];

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
        {/* Event date range */}
        <View style={styles.dateRangeBar}>
          <Ionicons name="calendar-outline" size={16} color="#B8860B" />
          <Text style={styles.dateRangeText}>
            {invitational?.isSingleDay
              ? formatDate(invitational.startDate)
              : `${formatDateShort(invitational!.startDate)} — ${formatDateShort(invitational!.endDate)}`}
          </Text>
          <Text style={styles.roundCountText}>
            {rounds.length} round{rounds.length !== 1 ? "s" : ""}
          </Text>
        </View>

        {rounds.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color="#CCC" />
            <Text style={styles.emptyTitle}>No Rounds Scheduled</Text>
            <Text style={styles.emptySubtitle}>
              {isHost
                ? "Add rounds from the settings page"
                : "The host hasn't scheduled rounds yet"}
            </Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {rounds
              .sort((a, b) => a.roundNumber - b.roundNumber)
              .map((round) => renderRoundCard(round))}
          </View>
        )}

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

  // Date range bar
  dateRangeBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 10,
  },
  dateRangeText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  roundCountText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
  },

  // Timeline
  timeline: {
    gap: 0,
  },
  roundCard: {
    flexDirection: "row",
    gap: 12,
    minHeight: 100,
  },
  roundCardActive: {},

  // Timeline side
  timelineSide: {
    alignItems: "center",
    width: 40,
  },
  timelineDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFF",
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: "#E0E0E0",
    marginTop: 4,
    marginBottom: -4,
  },

  // Round content
  roundContent: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 6,
  },
  roundTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  roundDate: {
    fontSize: 12,
    fontWeight: "600",
    color: "#888",
  },
  roundCourseName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  roundLocation: {
    fontSize: 12,
    color: "#999",
  },
  roundDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  detailChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F5F5F0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  detailChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#888",
  },

  // Winner
  winnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  winnerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#B8860B",
  },

  // Live button
  liveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    paddingTop: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0D5C3A",
  },
  liveButtonText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  // Host actions
  hostActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  manageGroupsButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B8860B",
  },
  manageGroupsText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B8860B",
  },
  startRoundButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#0D5C3A",
  },
  startRoundText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFF",
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