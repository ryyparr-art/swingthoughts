/**
 * League Hub - Schedule Tab
 *
 * Shows:
 * - Week-by-week schedule grouped by month
 * - Status badges (complete/current/upcoming)
 * - Previous winner for completed weeks
 * - User's posted score badge (tappable → week scores screen)
 * - Matchups for 2v2 leagues with teams
 *
 * Week card behavior:
 * - Complete + user posted → winner + score badge (tappable)
 * - Complete + no score    → winner only, not tappable
 * - Current + user posted  → score badge replaces Post Score (tappable)
 * - Current + no score     → Post Score button
 * - Upcoming               → locked, not tappable
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
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

interface League {
  id: string;
  name: string;
  avatar?: string;
  format: "stroke" | "2v2";
  holes: number;
  frequency: "weekly" | "biweekly" | "monthly";
  scoreDeadlineDays: number;
  status: "upcoming" | "active" | "completed";
  currentWeek: number;
  totalWeeks: number;
  startDate: Timestamp;
  endDate: Timestamp;
  pointsPerWeek?: number;
  restrictedCourses?: Array<{ courseId: number; courseName: string }>;
  hasElevatedEvents?: boolean;
  elevatedWeeks?: number[];
  elevatedMultiplier?: number;
  purse?: {
    seasonPurse: number;
    weeklyPurse: number;
    elevatedPurse: number;
    currency?: string;
  };
}

interface LeagueCard {
  id: string;
  name: string;
  avatar?: string;
  currentWeek: number;
  totalWeeks: number;
}

interface Team {
  id: string;
  name: string;
}

interface WeekResult {
  odcuserId?: string;
  displayName?: string;
  avatar?: string;
  score?: number;
  courseName?: string;
  // 2v2
  teamId?: string;
  teamName?: string;
  matchResult?: string;
}

/** User's posted score for a given week */
interface UserWeekScore {
  grossScore: number;
  netScore?: number;
  courseName?: string;
  scoreId: string;
}

interface WeekSchedule {
  week: number;
  startDate: Date;
  endDate: Date;
  status: "complete" | "current" | "upcoming";
  isElevated: boolean;
  multiplier: number;
  basePoints: number;
  weeklyPurse: number;
  elevatedPurse: number;
  courseName?: string;
  winner?: WeekResult;
  matchups?: Array<{ team1: Team; team2: Team; result?: string }>;
  userScore?: UserWeekScore;
  scoresPosted?: number;
}

interface MonthGroup {
  month: string;
  year: number;
  weeks: WeekSchedule[];
}

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function LeagueSchedule() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUserId = auth.currentUser?.uid;

  // Loading states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // User's leagues
  const [myLeagues, setMyLeagues] = useState<LeagueCard[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [showLeagueSelector, setShowLeagueSelector] = useState(false);

  // Schedule data
  const [schedule, setSchedule] = useState<MonthGroup[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  // User's scores per week
  const [userScores, setUserScores] = useState<Record<number, UserWeekScore>>({});

  // Commissioner/Manager status
  const [isCommissionerOrManager, setIsCommissionerOrManager] = useState(false);

  /* ================================================================ */
  /* DATA LOADING                                                    */
  /* ================================================================ */

  useEffect(() => {
    if (!currentUserId) return;
    loadMyLeagues();
  }, [currentUserId]);

  useEffect(() => {
    if (selectedLeagueId && currentUserId) {
      const unsubscribers: (() => void)[] = [];

      // Listen to league doc
      const leagueUnsub = onSnapshot(
        doc(db, "leagues", selectedLeagueId),
        (docSnap) => {
          if (docSnap.exists()) {
            const leagueData = { id: docSnap.id, ...docSnap.data() } as League;
            setSelectedLeague(leagueData);
            generateSchedule(leagueData);
          }
        }
      );
      unsubscribers.push(leagueUnsub);

      // Listen to user's scores (real-time so it updates after posting)
      const scoresUnsub = onSnapshot(
        query(
          collection(db, "leagues", selectedLeagueId, "scores"),
          where("userId", "==", currentUserId)
        ),
        (snapshot) => {
          const scores: Record<number, UserWeekScore> = {};
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            scores[data.week] = {
              grossScore: data.grossScore,
              netScore: data.netScore,
              courseName: data.courseName,
              scoreId: docSnap.id,
            };
          });
          setUserScores(scores);
        }
      );
      unsubscribers.push(scoresUnsub);

      // Check membership role
      getDoc(doc(db, "leagues", selectedLeagueId, "members", currentUserId)).then(
        (docSnap) => {
          if (docSnap.exists()) {
            const role = docSnap.data().role;
            setIsCommissionerOrManager(
              role === "commissioner" || role === "manager"
            );
          }
        }
      );

      // Load teams for 2v2
      loadTeams(selectedLeagueId);

      // Load week results
      loadWeekResults(selectedLeagueId);

      return () => {
        unsubscribers.forEach((unsub) => unsub());
      };
    }
  }, [selectedLeagueId, currentUserId]);

  const loadMyLeagues = async () => {
    if (!currentUserId) return;

    try {
      setLoading(true);

      const leaguesSnap = await getDocs(collection(db, "leagues"));
      const userLeagues: LeagueCard[] = [];

      for (const leagueDoc of leaguesSnap.docs) {
        const memberDoc = await getDoc(
          doc(db, "leagues", leagueDoc.id, "members", currentUserId)
        );

        if (memberDoc.exists()) {
          const leagueData = leagueDoc.data();
          userLeagues.push({
            id: leagueDoc.id,
            name: leagueData.name,
            avatar: leagueData.avatar,
            currentWeek: leagueData.currentWeek || 0,
            totalWeeks: leagueData.totalWeeks || 0,
          });
        }
      }

      setMyLeagues(userLeagues);

      if (userLeagues.length > 0 && !selectedLeagueId) {
        setSelectedLeagueId(userLeagues[0].id);
      }
    } catch (error) {
      console.error("Error loading leagues:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTeams = async (leagueId: string) => {
    try {
      const teamsSnap = await getDocs(
        collection(db, "leagues", leagueId, "teams")
      );
      const teamsData: Team[] = [];
      teamsSnap.forEach((docSnap) => {
        teamsData.push({ id: docSnap.id, name: docSnap.data().name });
      });
      setTeams(teamsData);
    } catch (error) {
      console.error("Error loading teams:", error);
    }
  };

  const loadWeekResults = async (leagueId: string) => {
    try {
      const resultsSnap = await getDocs(
        query(
          collection(db, "leagues", leagueId, "week_results"),
          orderBy("week", "asc")
        )
      );

      const resultsMap: Record<number, WeekResult> = {};
      resultsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        resultsMap[data.week] = {
          odcuserId: data.odcuserId,
          displayName: data.displayName,
          avatar: data.avatar,
          score: data.score,
          courseName: data.courseName,
          teamId: data.teamId,
          teamName: data.teamName,
          matchResult: data.matchResult,
        };
      });

      // Update schedule with results
      setSchedule((prev) =>
        prev.map((group) => ({
          ...group,
          weeks: group.weeks.map((week) => ({
            ...week,
            winner: resultsMap[week.week],
          })),
        }))
      );
    } catch (error) {
      console.error("Error loading week results:", error);
    }
  };

  const generateSchedule = (league: League) => {
    const weeks: WeekSchedule[] = [];
    const startDate = league.startDate.toDate();
    const basePoints = league.pointsPerWeek || 100;

    // Calculate week duration based on frequency
    const weekDuration =
      league.frequency === "weekly"
        ? 7
        : league.frequency === "biweekly"
        ? 14
        : 30;

    for (let i = 1; i <= league.totalWeeks; i++) {
      const weekStart = new Date(startDate);
      weekStart.setDate(startDate.getDate() + (i - 1) * weekDuration);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + weekDuration - 1);

      const isElevated =
        league.hasElevatedEvents && league.elevatedWeeks?.includes(i);
      const multiplier = isElevated ? league.elevatedMultiplier || 2 : 1;

      let status: "complete" | "current" | "upcoming" = "upcoming";
      if (i < league.currentWeek) {
        status = "complete";
      } else if (i === league.currentWeek) {
        status = "current";
      }

      // Course name for restricted leagues
      let courseName: string | undefined;
      if (league.restrictedCourses && league.restrictedCourses.length > 0) {
        if (league.restrictedCourses.length === 1) {
          courseName = league.restrictedCourses[0].courseName;
        } else {
          const courseIndex = (i - 1) % league.restrictedCourses.length;
          courseName = league.restrictedCourses[courseIndex].courseName;
        }
      }

      // Calculate purse for this week
      const weeklyPurse = league.purse?.weeklyPurse || 0;
      const elevatedPurse = isElevated ? league.purse?.elevatedPurse || 0 : 0;

      weeks.push({
        week: i,
        startDate: weekStart,
        endDate: weekEnd,
        status,
        isElevated: isElevated || false,
        multiplier,
        basePoints: basePoints * multiplier,
        weeklyPurse,
        elevatedPurse,
        courseName,
      });
    }

    // Group by month
    const monthGroups: MonthGroup[] = [];
    const monthMap = new Map<string, WeekSchedule[]>();

    weeks.forEach((week) => {
      const monthKey =
        week.startDate.toLocaleString("en-US", { month: "long" }) +
        " " +
        week.startDate.getFullYear();
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, []);
      }
      monthMap.get(monthKey)!.push(week);
    });

    monthMap.forEach((weeks, key) => {
      const [month, yearStr] = key.split(" ");
      monthGroups.push({
        month,
        year: parseInt(yearStr),
        weeks,
      });
    });

    setSchedule(monthGroups);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMyLeagues();
    if (selectedLeagueId) {
      await loadTeams(selectedLeagueId);
      await loadWeekResults(selectedLeagueId);
    }
    setRefreshing(false);
  };

  /* ================================================================ */
  /* HANDLERS                                                        */
  /* ================================================================ */

  const handleSelectLeague = (leagueId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedLeagueId(leagueId);
    setShowLeagueSelector(false);
  };

  const handlePostScore = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/leagues/post-score?leagueId=${selectedLeagueId}`);
  };

  const handleViewWeekScores = (weekNumber: number) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(
      `/leagues/week-scores?leagueId=${selectedLeagueId}&week=${weekNumber}`
    );
  };

  const handleSettings = () => {
    soundPlayer.play("click");
    router.push(`/leagues/settings?id=${selectedLeagueId}`);
  };

  /* ================================================================ */
  /* HELPERS                                                         */
  /* ================================================================ */

  const formatDateRange = (start: Date, end: Date) => {
    const startMonth = start.toLocaleString("en-US", { month: "short" });
    const endMonth = end.toLocaleString("en-US", { month: "short" });

    if (startMonth === endMonth) {
      return (
        startMonth.toUpperCase() +
        " " +
        start.getDate() +
        " - " +
        end.getDate()
      );
    }
    return (
      startMonth.toUpperCase() +
      " " +
      start.getDate() +
      " - " +
      endMonth.toUpperCase() +
      " " +
      end.getDate()
    );
  };

  const getStatusBadge = (status: "complete" | "current" | "upcoming") => {
    switch (status) {
      case "complete":
        return { text: "COMPLETE", color: "#4CAF50", bg: "#E8F5E9" };
      case "current":
        return { text: "CURRENT", color: "#2196F3", bg: "#E3F2FD" };
      case "upcoming":
        return { text: "UPCOMING", color: "#9E9E9E", bg: "#F5F5F5" };
    }
  };

  /* ================================================================ */
  /* RENDER COMPONENTS                                               */
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
      <Text style={styles.headerTitle}>League Center</Text>
      {isCommissionerOrManager ? (
        <TouchableOpacity style={styles.headerButton} onPress={handleSettings}>
          <Ionicons name="settings-outline" size={24} color="#F4EED8" />
        </TouchableOpacity>
      ) : (
        <View style={styles.headerRight} />
      )}
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabBar}>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => router.push("/leagues/home")}
      >
        <Text style={styles.tabText}>Home</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, styles.tabActive]}>
        <Text style={[styles.tabText, styles.tabTextActive]}>Schedule</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => router.push("/leagues/standings")}
      >
        <Text style={styles.tabText}>Standings</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => router.push("/leagues/explore")}
      >
        <Text style={styles.tabText}>Explore</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLeagueSelector = () => {
    if (myLeagues.length === 0) return null;

    const selected = myLeagues.find((l) => l.id === selectedLeagueId);

    return (
      <TouchableOpacity
        style={styles.leagueSelector}
        onPress={() => {
          if (myLeagues.length > 1) {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowLeagueSelector(true);
          }
        }}
        disabled={myLeagues.length <= 1}
      >
        <View style={styles.leagueSelectorContent}>
          <View style={styles.leagueLogoPlaceholder}>
            {selectedLeague?.avatar ? (
              <Image
                source={{ uri: selectedLeague.avatar }}
                style={styles.leagueLogoImage}
              />
            ) : (
              <Text style={styles.leagueLogoText}>
                {selected?.name?.charAt(0) || "L"}
              </Text>
            )}
          </View>
          <View style={styles.leagueSelectorText}>
            <Text style={styles.leagueName}>
              {selected?.name || "Select League"}
            </Text>
            <Text style={styles.leagueSubtitle}>
              Week {selected?.currentWeek || 0} of {selected?.totalWeeks || 0}
            </Text>
          </View>
        </View>
        {myLeagues.length > 1 ? (
          <Ionicons name="chevron-down" size={20} color="#0D5C3A" />
        ) : null}
      </TouchableOpacity>
    );
  };

  /** Score badge shown when user has posted a score for a week */
  const renderUserScoreBadge = (weekNumber: number, score: UserWeekScore) => (
    <TouchableOpacity
      style={styles.scoreBadge}
      onPress={() => handleViewWeekScores(weekNumber)}
      activeOpacity={0.7}
    >
      <View style={styles.scoreBadgeLeft}>
        <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
        <Text style={styles.scoreBadgeLabel}>Your Score</Text>
      </View>
      <View style={styles.scoreBadgeRight}>
        <Text style={styles.scoreBadgeValue}>{score.grossScore}</Text>
        <Ionicons name="chevron-forward" size={16} color="#999" />
      </View>
    </TouchableOpacity>
  );

  const renderWeekCard = (week: WeekSchedule) => {
    const badge = getStatusBadge(week.status);
    const is2v2 = selectedLeague?.format === "2v2";
    const hasTeamsData = teams.length > 0;
    const userScore = userScores[week.week];
    const hasUserScore = !!userScore;

    return (
      <View key={week.week} style={styles.weekCard}>
        {/* Header Row */}
        <View style={styles.weekHeader}>
          <View style={styles.weekDateContainer}>
            <Text style={styles.weekDate}>
              {formatDateRange(week.startDate, week.endDate)}
            </Text>
            {week.isElevated ? (
              <View style={styles.elevatedBadge}>
                <Text style={{ fontSize: 12 }}>🏅</Text>
                <Text style={styles.elevatedText}>{week.multiplier}X</Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusText, { color: badge.color }]}>
              {badge.text}
            </Text>
          </View>
        </View>

        {/* Week Info */}
        <View style={styles.weekInfo}>
          <Text style={styles.weekNumber}>Week {week.week}</Text>
          <Text style={styles.weekDivider}>•</Text>
          <Text style={styles.weekCourse}>
            {week.courseName || "Any Course"}
          </Text>
          <View style={styles.weekPointsContainer}>
            <Text style={styles.weekPoints}>{week.basePoints} pts</Text>
          </View>
          {week.weeklyPurse > 0 || week.elevatedPurse > 0 ? (
            <View style={styles.weekPurseContainer}>
              <Text style={styles.weekPurse}>
                💰 ${week.weeklyPurse + week.elevatedPurse}
              </Text>
            </View>
          ) : null}
        </View>

        {/* 2v2 Matchups */}
        {is2v2 &&
        hasTeamsData &&
        week.matchups &&
        week.matchups.length > 0 ? (
          <View style={styles.matchupsContainer}>
            <Text style={styles.matchupsLabel}>Matchups:</Text>
            {week.matchups.map((matchup, idx) => (
              <View key={idx} style={styles.matchupRow}>
                <Text style={styles.matchupText}>
                  • {matchup.team1.name} vs {matchup.team2.name}
                </Text>
                {matchup.result ? (
                  <Text style={styles.matchupResult}>{matchup.result}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* Winner Row (completed weeks) */}
        {week.status === "complete" && week.winner ? (
          <View style={styles.winnerRow}>
            <View style={styles.winnerContent}>
              <Text style={styles.winnerTrophy}>🏆</Text>
              {is2v2 ? (
                <Text style={styles.winnerName}>
                  {week.winner.teamName}
                  {week.winner.matchResult
                    ? " (" + week.winner.matchResult + ")"
                    : ""}
                </Text>
              ) : (
                <>
                  {week.winner.avatar ? (
                    <Image
                      source={{ uri: week.winner.avatar }}
                      style={styles.winnerAvatar}
                    />
                  ) : (
                    <View style={styles.winnerAvatarPlaceholder}>
                      <Text style={styles.winnerAvatarText}>
                        {week.winner.displayName?.charAt(0) || "?"}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.winnerName}>
                    {week.winner.displayName}
                  </Text>
                  {week.winner.score !== undefined ? (
                    <Text style={styles.winnerScore}>
                      • {week.winner.score} net
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          </View>
        ) : null}

        {/* User's posted score (complete or current weeks) */}
        {(week.status === "complete" || week.status === "current") &&
        hasUserScore ? (
          renderUserScoreBadge(week.week, userScore)
        ) : null}

        {/* Current Week CTA - only show if NO score posted */}
        {week.status === "current" && !hasUserScore ? (
          <View style={styles.currentWeekCta}>
            <View style={styles.deadlineRow}>
              <Ionicons name="time-outline" size={16} color="#2196F3" />
              <Text style={styles.deadlineText}>
                Scores due in {selectedLeague?.scoreDeadlineDays || 3} days
              </Text>
            </View>
            <TouchableOpacity
              style={styles.postScoreBtn}
              onPress={handlePostScore}
            >
              <Text style={styles.postScoreBtnText}>Post Score</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Upcoming Week Lock */}
        {week.status === "upcoming" ? (
          <View style={styles.upcomingRow}>
            <Ionicons name="lock-closed-outline" size={16} color="#999" />
            <Text style={styles.upcomingText}>Opens when week starts</Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderMonthGroup = (group: MonthGroup) => (
    <View key={group.month + group.year} style={styles.monthGroup}>
      <View style={styles.monthHeader}>
        <Text style={styles.monthTitle}>{group.month}</Text>
        <Text style={styles.monthYear}>{group.year}</Text>
      </View>
      {group.weeks.map(renderWeekCard)}
    </View>
  );

  const renderLeagueSelectorModal = () => (
    <Modal
      visible={showLeagueSelector}
      transparent
      animationType="fade"
      onRequestClose={() => setShowLeagueSelector(false)}
    >
      <Pressable
        style={styles.modalBackdrop}
        onPress={() => setShowLeagueSelector(false)}
      >
        <View style={styles.selectorModalContent}>
          <Text style={styles.selectorModalTitle}>Select League</Text>
          {myLeagues.map((league) => (
            <TouchableOpacity
              key={league.id}
              style={
                league.id === selectedLeagueId
                  ? styles.selectorOptionSelected
                  : styles.selectorOption
              }
              onPress={() => handleSelectLeague(league.id)}
            >
              <View style={styles.selectorOptionContent}>
                <View style={styles.selectorLogoPlaceholder}>
                  {league.avatar ? (
                    <Image
                      source={{ uri: league.avatar }}
                      style={styles.selectorLogoImage}
                    />
                  ) : (
                    <Text style={styles.selectorLogoText}>
                      {league.name?.charAt(0) || "L"}
                    </Text>
                  )}
                </View>
                <View>
                  <Text style={styles.selectorOptionTitle}>{league.name}</Text>
                  <Text style={styles.selectorOptionSubtitle}>
                    Week {league.currentWeek} of {league.totalWeeks}
                  </Text>
                </View>
              </View>
              {league.id === selectedLeagueId ? (
                <Ionicons name="checkmark" size={20} color="#0D5C3A" />
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      </Pressable>
    </Modal>
  );

  /* ================================================================ */
  /* MAIN RENDER                                                     */
  /* ================================================================ */

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  if (myLeagues.length === 0) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        {renderTabs()}
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateEmoji}>📅</Text>
          <Text style={styles.emptyStateTitle}>No Leagues Yet</Text>
          <Text style={styles.emptyStateSubtitle}>
            Join a league to see the schedule!
          </Text>
          <TouchableOpacity
            style={styles.emptyStateButton}
            onPress={() => router.push("/leagues/explore")}
          >
            <Text style={styles.emptyStateButtonText}>Explore Leagues</Text>
          </TouchableOpacity>
        </View>
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
            tintColor="#0D5C3A"
          />
        }
      >
        {renderLeagueSelector()}
        {schedule.map(renderMonthGroup)}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {renderLeagueSelectorModal()}
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F0",
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
  headerButton: {
    padding: 8,
  },
  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#F4EED8",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F4EED8",
  },
  headerRight: {
    width: 40,
  },

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
  tabActive: {
    backgroundColor: "#0D5C3A",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  tabTextActive: {
    color: "#FFF",
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // League Selector
  leagueSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  leagueSelectorContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  leagueLogoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  leagueLogoText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },
  leagueLogoImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  leagueSelectorText: {
    marginLeft: 12,
  },
  leagueName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  leagueSubtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },

  // Month Group
  monthGroup: {
    marginBottom: 24,
  },
  monthHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },
  monthYear: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
  },

  // Week Card
  weekCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  weekHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  weekDateContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  weekDate: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    letterSpacing: 0.5,
  },
  elevatedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF8E1",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 4,
  },
  elevatedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#C9A227",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  // Week Info
  weekInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  weekNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  weekDivider: {
    fontSize: 16,
    color: "#CCC",
    marginHorizontal: 8,
  },
  weekCourse: {
    fontSize: 14,
    color: "#666",
    flex: 1,
  },
  weekPointsContainer: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  weekPoints: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  weekPurseContainer: {
    backgroundColor: "#FFF8E1",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 6,
  },
  weekPurse: {
    fontSize: 13,
    fontWeight: "700",
    color: "#C9A227",
  },

  // Matchups
  matchupsContainer: {
    backgroundColor: "#F9F9F9",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  matchupsLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 6,
  },
  matchupRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  matchupText: {
    fontSize: 14,
    color: "#333",
  },
  matchupResult: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  // Winner Row
  winnerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  winnerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  winnerTrophy: {
    fontSize: 16,
  },
  winnerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  winnerAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },
  winnerAvatarText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFF",
  },
  winnerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  winnerScore: {
    fontSize: 14,
    color: "#666",
  },

  // User Score Badge
  scoreBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F0FAF0",
    borderWidth: 1,
    borderColor: "#C8E6C9",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  scoreBadgeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scoreBadgeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  scoreBadgeRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scoreBadgeValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  // Current Week CTA
  currentWeekCta: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  deadlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  deadlineText: {
    fontSize: 13,
    color: "#2196F3",
    fontWeight: "500",
  },
  postScoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D5C3A",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  postScoreBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
  },

  // Upcoming Row
  upcomingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    gap: 6,
  },
  upcomingText: {
    fontSize: 13,
    color: "#999",
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  selectorModalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  selectorModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 16,
    textAlign: "center",
  },
  selectorOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  selectorOptionSelected: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#E8F5E9",
  },
  selectorOptionContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectorLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  selectorLogoImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  selectorLogoText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
  selectorOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  selectorOptionSubtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },

  // Empty State
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyStateEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  emptyStateButton: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },

  bottomSpacer: {
    height: 100,
  },
});