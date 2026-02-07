/**
 * League Week Scores
 *
 * Shows all posted scores for a specific league week.
 * - Table: Rank, Player, Gross, Net, To Par
 * - Expandable rows: course/tees, FIR/GIR/PNL stats, mini hole-by-hole scorecard
 * - Week selector dropdown to switch between weeks
 * - Current user row highlighted with green flash
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    Timestamp,
    where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Image,
    LayoutAnimation,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface League {
  id: string;
  name: string;
  avatar?: string;
  format: "stroke" | "2v2";
  handicapSystem: "swingthoughts" | "league_managed";
  currentWeek: number;
  totalWeeks: number;
  startDate: Timestamp;
  frequency: "weekly" | "biweekly" | "monthly";
}

interface WeekOption {
  week: number;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
}

interface ScoreEntry {
  id: string;
  userId: string;
  displayName: string;
  avatar?: string;
  week: number;
  grossScore: number;
  netScore: number;
  totalPar: number;
  scoreToPar: number;
  courseName: string;
  tees: string;
  courseHandicap: number;
  handicapIndex: number;
  holeScores: (number | null)[];
  adjScores?: (number | null)[];
  holeStats?: {
    fir: (boolean | null)[];
    gir: (boolean | null)[];
    pnl: (number | null)[];
  };
  fairwaysHit?: number;
  fairwaysPossible?: number;
  greensInRegulation?: number;
  totalPenalties?: number;
  handicapSystem?: string;
}

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function WeekScores() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ leagueId: string; week: string }>();
  const currentUserId = auth.currentUser?.uid;

  const leagueId = params.leagueId;
  const initialWeek = parseInt(params.week || "1", 10);

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [league, setLeague] = useState<League | null>(null);
  const [selectedWeek, setSelectedWeek] = useState(initialWeek);
  const [weekOptions, setWeekOptions] = useState<WeekOption[]>([]);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showWeekSelector, setShowWeekSelector] = useState(false);

  // Flash animation for user's row
  const flashAnim = useRef(new Animated.Value(0)).current;
  const [shouldFlash, setShouldFlash] = useState(true);

  const isSwingThoughts = league?.handicapSystem === "swingthoughts";

  /* ================================================================ */
  /* DATA LOADING                                                    */
  /* ================================================================ */

  useEffect(() => {
    if (leagueId) {
      loadLeague();
    }
  }, [leagueId]);

  useEffect(() => {
    if (leagueId && league) {
      loadScores(selectedWeek);
    }
  }, [selectedWeek, league]);

  // Trigger flash animation
  useEffect(() => {
    if (shouldFlash && !loading && scores.length > 0) {
      triggerFlash();
      setShouldFlash(false);
    }
  }, [shouldFlash, loading, scores]);

  const triggerFlash = () => {
    flashAnim.setValue(0);
    Animated.sequence([
      Animated.timing(flashAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const loadLeague = async () => {
    try {
      setLoading(true);
      const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
      if (leagueDoc.exists()) {
        const data = { id: leagueDoc.id, ...leagueDoc.data() } as League;
        setLeague(data);
        generateWeekOptions(data);
      }
    } catch (error) {
      console.error("Error loading league:", error);
    }
  };

  const generateWeekOptions = (leagueData: League) => {
    const options: WeekOption[] = [];
    const startDate = leagueData.startDate.toDate();
    const weekDuration =
      leagueData.frequency === "weekly"
        ? 7
        : leagueData.frequency === "biweekly"
        ? 14
        : 30;

    for (let i = 1; i <= leagueData.totalWeeks; i++) {
      const weekStart = new Date(startDate);
      weekStart.setDate(startDate.getDate() + (i - 1) * weekDuration);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + weekDuration - 1);

      options.push({
        week: i,
        startDate: weekStart,
        endDate: weekEnd,
        isCurrent: i === leagueData.currentWeek,
      });
    }

    setWeekOptions(options);
  };

  const loadScores = async (week: number) => {
    if (!leagueId) return;

    try {
      setLoading(true);
      const scoresSnap = await getDocs(
        query(
          collection(db, "leagues", leagueId, "scores"),
          where("week", "==", week)
        )
      );

      const scoresList: ScoreEntry[] = [];
      scoresSnap.forEach((docSnap) => {
        const data = docSnap.data();
        scoresList.push({
          id: docSnap.id,
          userId: data.userId,
          displayName: data.displayName,
          avatar: data.avatar,
          week: data.week,
          grossScore: data.grossScore,
          netScore: data.netScore ?? data.grossScore,
          totalPar: data.totalPar,
          scoreToPar: data.scoreToPar,
          courseName: data.courseName,
          tees: data.tees,
          courseHandicap: data.courseHandicap || 0,
          handicapIndex: data.handicapIndex || 0,
          holeScores: data.holeScores || [],
          adjScores: data.adjScores,
          holeStats: data.holeStats,
          fairwaysHit: data.fairwaysHit,
          fairwaysPossible: data.fairwaysPossible,
          greensInRegulation: data.greensInRegulation,
          totalPenalties: data.totalPenalties,
          handicapSystem: data.handicapSystem,
        });
      });

      // Sort by net score (swingthoughts) or gross score (league managed)
      scoresList.sort((a, b) => {
        if (isSwingThoughts) return a.netScore - b.netScore;
        return a.grossScore - b.grossScore;
      });

      setScores(scoresList);
      setShouldFlash(true);
    } catch (error) {
      console.error("Error loading scores:", error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadScores(selectedWeek);
    setRefreshing(false);
  };

  /* ================================================================ */
  /* HANDLERS                                                        */
  /* ================================================================ */

  const handleBack = () => {
    soundPlayer.play("click");
    router.back();
  };

  const handleWeekSelect = (week: number) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedWeek(week);
    setShowWeekSelector(false);
    setExpandedId(null);
  };

  const handleToggleExpand = (scoreId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === scoreId ? null : scoreId));
  };

  const handlePlayerPress = (userId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/profile/${userId}`);
  };

  /* ================================================================ */
  /* HELPERS                                                         */
  /* ================================================================ */

  const formatDateRange = (start: Date, end: Date) => {
    const startMonth = start.toLocaleString("en-US", { month: "short" });
    const endMonth = end.toLocaleString("en-US", { month: "short" });

    if (startMonth === endMonth) {
      return `${startMonth} ${start.getDate()} - ${end.getDate()}`;
    }
    return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}`;
  };

  const getToParDisplay = (scoreToPar: number) => {
    if (scoreToPar === 0) return "E";
    return scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;
  };

  const getToParColor = (scoreToPar: number) => {
    if (scoreToPar < 0) return "#E53935";
    if (scoreToPar === 0) return "#0D5C3A";
    return "#333";
  };

  const getHoleScoreColor = (score: number | null, par: number) => {
    if (score === null) return "#999";
    const diff = score - par;
    if (diff <= -2) return "#FFD700"; // Eagle+
    if (diff === -1) return "#E53935"; // Birdie
    if (diff === 1) return "#333"; // Bogey
    if (diff >= 2) return "#333"; // Double+
    return "#333"; // Par
  };

  const getHoleScoreStyle = (score: number | null, par: number) => {
    if (score === null) return null;
    const diff = score - par;
    if (diff <= -2) return styles.miniScoreEagle;
    if (diff === -1) return styles.miniScoreBirdie;
    if (diff === 1) return styles.miniScoreBogey;
    if (diff >= 2) return styles.miniScoreDouble;
    return null;
  };

  /** Standard par layout for mini scorecard when no hole data available */
  const DEFAULT_PARS_9 = [4, 4, 3, 4, 4, 3, 4, 5, 4];
  const DEFAULT_PARS_18 = [4, 4, 3, 4, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 4, 5];

  /* ================================================================ */
  /* RENDER                                                          */
  /* ================================================================ */

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <TouchableOpacity style={styles.headerBackBtn} onPress={handleBack}>
        <Image
          source={require("@/assets/icons/Back.png")}
          style={styles.headerBackIcon}
        />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Week Scores</Text>
      <View style={styles.headerRight} />
    </View>
  );

  const renderWeekSelector = () => {
    const currentOption = weekOptions.find((w) => w.week === selectedWeek);

    return (
      <TouchableOpacity
        style={styles.weekSelector}
        onPress={() => {
          soundPlayer.play("click");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowWeekSelector(true);
        }}
      >
        <View style={styles.weekSelectorContent}>
          <View style={styles.weekSelectorIcon}>
            <Ionicons name="calendar-outline" size={20} color="#0D5C3A" />
          </View>
          <View style={styles.weekSelectorText}>
            <Text style={styles.weekSelectorTitle}>
              Week {selectedWeek}
              {currentOption?.isCurrent ? (
                <Text style={styles.weekSelectorCurrent}> • Current</Text>
              ) : null}
            </Text>
            {currentOption ? (
              <Text style={styles.weekSelectorSubtitle}>
                {formatDateRange(currentOption.startDate, currentOption.endDate)}
              </Text>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-down" size={20} color="#0D5C3A" />
      </TouchableOpacity>
    );
  };

  const renderTableHeader = () => (
    <View style={styles.tableHeader}>
      <Text style={styles.headerRank}>#</Text>
      <Text style={styles.headerName}>PLAYER</Text>
      <Text style={styles.headerGross}>GROSS</Text>
      {isSwingThoughts ? (
        <Text style={styles.headerNet}>NET</Text>
      ) : null}
      <Text style={styles.headerToPar}>TO PAR</Text>
    </View>
  );

  const renderMiniScorecard = (entry: ScoreEntry) => {
    const holeCount = entry.holeScores.length;
    const is18 = holeCount >= 18;
    // We don't have par data per hole on the score doc, so we use scoreToPar + grossScore
    // to derive total par, then estimate. If adjScores exist we can infer more.
    // For color coding, we'd ideally need hole pars. Use defaults as fallback.
    const pars = is18 ? DEFAULT_PARS_18 : DEFAULT_PARS_9;

    const renderNine = (start: number, end: number, label: string) => {
      const sliceScores = entry.holeScores.slice(start, end);
      const nineTotal = sliceScores.reduce(
        (sum: number, s) => sum + (s || 0),
        0
      );
      const allFilled = sliceScores.every((s) => s !== null);

      return (
        <View style={styles.miniNine}>
          {/* Hole numbers */}
          <View style={styles.miniRow}>
            <View style={styles.miniLabelCell}>
              <Text style={styles.miniLabelText}>HOLE</Text>
            </View>
            {sliceScores.map((_, idx) => (
              <View key={`h-${start + idx}`} style={styles.miniHoleCell}>
                <Text style={styles.miniHoleNumber}>{start + idx + 1}</Text>
              </View>
            ))}
            <View style={styles.miniTotalCell}>
              <Text style={styles.miniTotalLabel}>{label}</Text>
            </View>
          </View>

          {/* Scores */}
          <View style={styles.miniRow}>
            <View style={styles.miniLabelCell}>
              <Text style={styles.miniLabelText}>SCORE</Text>
            </View>
            {sliceScores.map((score, idx) => {
              const par = pars[start + idx] || 4;
              return (
                <View key={`s-${start + idx}`} style={styles.miniHoleCell}>
                  <View
                    style={[
                      styles.miniScoreWrap,
                      getHoleScoreStyle(score, par),
                    ]}
                  >
                    <Text
                      style={[
                        styles.miniScoreText,
                        { color: getHoleScoreColor(score, par) },
                      ]}
                    >
                      {score ?? "-"}
                    </Text>
                  </View>
                </View>
              );
            })}
            <View style={styles.miniTotalCell}>
              <Text style={styles.miniTotalValue}>
                {allFilled ? nineTotal : "-"}
              </Text>
            </View>
          </View>
        </View>
      );
    };

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.miniScorecardScroll}
      >
        <View style={styles.miniScorecard}>
          {renderNine(0, Math.min(9, holeCount), "OUT")}
          {is18 ? renderNine(9, 18, "IN") : null}
        </View>
      </ScrollView>
    );
  };

  const renderExpandedContent = (entry: ScoreEntry) => {
    const hasFir =
      entry.fairwaysHit !== undefined && entry.fairwaysPossible !== undefined;
    const hasGir = entry.greensInRegulation !== undefined;
    const hasPnl =
      entry.totalPenalties !== undefined && entry.totalPenalties > 0;
    const hasAnyStats = hasFir || hasGir || hasPnl;

    return (
      <View style={styles.expandedContent}>
        {/* Course & Tees */}
        <View style={styles.expandedCourseRow}>
          <Ionicons name="golf-outline" size={16} color="#666" />
          <Text style={styles.expandedCourseText}>
            {entry.courseName}
            {entry.tees ? ` • ${entry.tees}` : ""}
          </Text>
          {isSwingThoughts && entry.courseHandicap > 0 ? (
            <View style={styles.expandedHandicapBadge}>
              <Text style={styles.expandedHandicapText}>
                CH: {entry.courseHandicap}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Stats Row */}
        {hasAnyStats ? (
          <View style={styles.expandedStatsRow}>
            {hasFir ? (
              <View style={styles.expandedStatItem}>
                <Text style={styles.expandedStatLabel}>FIR</Text>
                <Text style={styles.expandedStatValue}>
                  {entry.fairwaysHit}/{entry.fairwaysPossible}
                </Text>
                {entry.fairwaysPossible! > 0 ? (
                  <Text style={styles.expandedStatPercent}>
                    {Math.round(
                      (entry.fairwaysHit! / entry.fairwaysPossible!) * 100
                    )}
                    %
                  </Text>
                ) : null}
              </View>
            ) : null}
            {hasGir ? (
              <View style={styles.expandedStatItem}>
                <Text style={styles.expandedStatLabel}>GIR</Text>
                <Text style={styles.expandedStatValue}>
                  {entry.greensInRegulation}/
                  {entry.holeScores.length}
                </Text>
                <Text style={styles.expandedStatPercent}>
                  {Math.round(
                    (entry.greensInRegulation! / entry.holeScores.length) * 100
                  )}
                  %
                </Text>
              </View>
            ) : null}
            {hasPnl ? (
              <View style={styles.expandedStatItem}>
                <Text style={styles.expandedStatLabel}>PNL</Text>
                <Text style={[styles.expandedStatValue, styles.penaltyText]}>
                  {entry.totalPenalties}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Mini Scorecard */}
        {entry.holeScores.length > 0 ? renderMiniScorecard(entry) : null}

        {/* View Profile Link */}
        <TouchableOpacity
          style={styles.expandedProfileLink}
          onPress={() => handlePlayerPress(entry.userId)}
        >
          <Text style={styles.expandedProfileText}>View Profile</Text>
          <Ionicons name="chevron-forward" size={14} color="#0D5C3A" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderScoreRow = (entry: ScoreEntry, index: number) => {
    const rank = index + 1;
    const isCurrentUser = entry.userId === currentUserId;
    const isLeader = rank === 1;
    const isExpanded = expandedId === entry.id;

    const borderColor = flashAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["transparent", "#0D5C3A"],
    });

    const RowContent = (
      <View>
        <TouchableOpacity
          style={[styles.tableRow, isLeader && styles.leaderRow]}
          onPress={() => handleToggleExpand(entry.id)}
          activeOpacity={0.7}
        >
          <Text style={[styles.cellRank, isLeader && styles.leaderText]}>
            {rank}
          </Text>
          <View style={styles.cellName}>
            {entry.avatar ? (
              <Image
                source={{ uri: entry.avatar }}
                style={[styles.avatar, isLeader && styles.leaderAvatar]}
              />
            ) : (
              <View
                style={[
                  styles.avatarPlaceholder,
                  isLeader && styles.leaderAvatar,
                ]}
              >
                <Text style={styles.avatarText}>
                  {entry.displayName?.charAt(0) || "?"}
                </Text>
              </View>
            )}
            <View style={styles.nameWrap}>
              <Text
                style={[styles.nameText, isLeader && styles.leaderText]}
                numberOfLines={1}
              >
                {isCurrentUser ? "You" : entry.displayName}
              </Text>
            </View>
          </View>
          <Text style={[styles.cellGross, isLeader && styles.leaderText]}>
            {entry.grossScore}
          </Text>
          {isSwingThoughts ? (
            <Text style={[styles.cellNet, isLeader && styles.leaderText]}>
              {entry.netScore}
            </Text>
          ) : null}
          <Text
            style={[
              styles.cellToPar,
              { color: getToParColor(entry.scoreToPar) },
            ]}
          >
            {getToParDisplay(entry.scoreToPar)}
          </Text>
          <Ionicons
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={16}
            color="#CCC"
            style={styles.expandIcon}
          />
        </TouchableOpacity>

        {isExpanded ? renderExpandedContent(entry) : null}
      </View>
    );

    if (isCurrentUser) {
      return (
        <Animated.View
          key={entry.id}
          style={[styles.userRowWrapper, { borderColor }]}
        >
          {RowContent}
        </Animated.View>
      );
    }

    return <View key={entry.id}>{RowContent}</View>;
  };

  const renderWeekSelectorModal = () => (
    <Modal
      visible={showWeekSelector}
      transparent
      animationType="fade"
      onRequestClose={() => setShowWeekSelector(false)}
    >
      <Pressable
        style={styles.modalBackdrop}
        onPress={() => setShowWeekSelector(false)}
      >
        <View style={styles.selectorModalContent}>
          <Text style={styles.selectorModalTitle}>Select Week</Text>
          <ScrollView style={styles.selectorModalScroll}>
            {weekOptions.map((option) => (
              <TouchableOpacity
                key={option.week}
                style={[
                  styles.selectorOption,
                  option.week === selectedWeek &&
                    styles.selectorOptionSelected,
                ]}
                onPress={() => handleWeekSelect(option.week)}
              >
                <View style={styles.selectorOptionContent}>
                  <Text style={styles.selectorOptionTitle}>
                    Week {option.week}
                  </Text>
                  <Text style={styles.selectorOptionSubtitle}>
                    {formatDateRange(option.startDate, option.endDate)}
                  </Text>
                </View>
                <View style={styles.selectorOptionRight}>
                  {option.isCurrent ? (
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>CURRENT</Text>
                    </View>
                  ) : null}
                  {option.week === selectedWeek ? (
                    <Ionicons name="checkmark" size={20} color="#0D5C3A" />
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );

  /* ================================================================ */
  /* MAIN RENDER                                                     */
  /* ================================================================ */

  return (
    <View style={styles.container}>
      {renderHeader()}

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
        {renderWeekSelector()}

        {/* Scores Table */}
        <View style={styles.scoresCard}>
          <View style={styles.scoresCardHeader}>
            <Text style={styles.scoresCardTitle}>
              {scores.length} Score{scores.length !== 1 ? "s" : ""} Posted
            </Text>
          </View>

          {loading && scores.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0D5C3A" />
            </View>
          ) : scores.length > 0 ? (
            <>
              {renderTableHeader()}
              {scores.map((entry, idx) => renderScoreRow(entry, idx))}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="podium-outline" size={48} color="#CCC" />
              <Text style={styles.emptyStateText}>
                No scores posted yet for Week {selectedWeek}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {renderWeekSelectorModal()}
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

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#0D5C3A",
  },
  headerBackBtn: {
    padding: 8,
  },
  headerBackIcon: {
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

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // Week Selector
  weekSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  weekSelectorContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  weekSelectorIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },
  weekSelectorText: {
    marginLeft: 12,
  },
  weekSelectorTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  weekSelectorCurrent: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2196F3",
  },
  weekSelectorSubtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },

  // Scores Card
  scoresCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  scoresCardHeader: {
    marginBottom: 12,
  },
  scoresCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },

  // Table Header
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: "#E0E0E0",
    marginBottom: 4,
  },
  headerRank: {
    width: 30,
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
  },
  headerName: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    marginLeft: 8,
  },
  headerGross: {
    width: 50,
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    textAlign: "center",
  },
  headerNet: {
    width: 44,
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    textAlign: "center",
  },
  headerToPar: {
    width: 50,
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    textAlign: "center",
  },

  // Table Row
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingRight: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  leaderRow: {
    backgroundColor: "#FFFBEB",
  },
  userRowWrapper: {
    borderWidth: 2,
    borderRadius: 8,
    marginVertical: 2,
    overflow: "hidden",
  },

  // Cells
  cellRank: {
    width: 30,
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  cellName: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  nameWrap: {
    flex: 1,
  },
  nameText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  cellGross: {
    width: 50,
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  cellNet: {
    width: 44,
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  cellToPar: {
    width: 50,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  expandIcon: {
    marginLeft: 4,
  },
  leaderText: {
    fontWeight: "700",
  },

  // Avatar
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFF",
  },
  leaderAvatar: {
    borderWidth: 2,
    borderColor: "#C9A227",
  },

  // Expanded Content
  expandedContent: {
    backgroundColor: "#FAFAFA",
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  expandedCourseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  expandedCourseText: {
    fontSize: 13,
    color: "#666",
    flex: 1,
  },
  expandedHandicapBadge: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  expandedHandicapText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  // Expanded Stats
  expandedStatsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 14,
  },
  expandedStatItem: {
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  expandedStatLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#999",
    marginBottom: 2,
  },
  expandedStatValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
  },
  expandedStatPercent: {
    fontSize: 11,
    color: "#666",
    marginTop: 1,
  },
  penaltyText: {
    color: "#D32F2F",
  },

  // Mini Scorecard
  miniScorecardScroll: {
    marginBottom: 12,
  },
  miniScorecard: {
    gap: 6,
  },
  miniNine: {
    gap: 2,
  },
  miniRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  miniLabelCell: {
    width: 44,
    paddingRight: 4,
  },
  miniLabelText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#999",
    textAlign: "right",
  },
  miniHoleCell: {
    width: 28,
    alignItems: "center",
    paddingVertical: 2,
  },
  miniHoleNumber: {
    fontSize: 9,
    fontWeight: "600",
    color: "#999",
  },
  miniTotalCell: {
    width: 36,
    alignItems: "center",
    paddingVertical: 2,
    marginLeft: 4,
  },
  miniTotalLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#666",
  },
  miniTotalValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#333",
  },
  miniScoreWrap: {
    width: 22,
    height: 22,
    borderRadius: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  miniScoreText: {
    fontSize: 11,
    fontWeight: "600",
  },
  miniScoreEagle: {
    backgroundColor: "#FFF8E1",
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#FFD700",
  },
  miniScoreBirdie: {
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "#E53935",
  },
  miniScoreBogey: {
    borderWidth: 1,
    borderColor: "#333",
  },
  miniScoreDouble: {
    borderWidth: 2,
    borderColor: "#333",
  },

  // Expanded Profile Link
  expandedProfileLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E8E8E8",
  },
  expandedProfileText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  // Loading
  loadingContainer: {
    paddingVertical: 60,
    alignItems: "center",
  },

  // Empty State
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginTop: 12,
  },

  // Week Selector Modal
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
    maxHeight: "60%",
  },
  selectorModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 16,
    textAlign: "center",
  },
  selectorModalScroll: {
    maxHeight: 400,
  },
  selectorOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    marginBottom: 6,
  },
  selectorOptionSelected: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: "#E8F5E9",
  },
  selectorOptionContent: {},
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
  selectorOptionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  currentBadge: {
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#2196F3",
  },

  bottomSpacer: {
    height: 100,
  },
});