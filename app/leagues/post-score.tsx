/**
 * League Post Score - Scorecard Style
 *
 * PGA-style scorecard with:
 * - League name, Player, Team (if applicable)
 * - Course info (yardage, par) pulled from Firestore
 * - Hole-by-hole score input
 * - Front 9 / Back 9 / Total calculations
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    where
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface League {
  id: string;
  name: string;
  format: "stroke" | "2v2";
  holesPerRound: number;
  handicapSystem: "swingthoughts" | "league_managed";
  currentWeek: number;
  restrictedCourses?: Array<{ courseId: number; courseName: string }>;
}

interface Course {
  id: string;
  courseId: number;
  courseName: string;
  city?: string;
  state?: string;
  holes: HoleInfo[];
}

interface HoleInfo {
  holeNumber: number;
  par: number;
  yardage: number;
  handicap?: number;
}

interface Member {
  displayName: string;
  avatar?: string;
  teamId?: string;
  leagueHandicap?: number;
  swingThoughtsHandicap?: number;
}

interface Team {
  id: string;
  name: string;
}

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function LeaguePostScore() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const currentUserId = auth.currentUser?.uid;

  // Data
  const [league, setLeague] = useState<League | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);

  // Score state
  const [scores, setScores] = useState<(number | null)[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCourseSelector, setShowCourseSelector] = useState(false);

  // Input refs for navigation
  const inputRefs = useRef<Record<number, TextInput | null>>({});

  /* ================================================================ */
  /* DATA LOADING                                                    */
  /* ================================================================ */

  useEffect(() => {
    if (leagueId && currentUserId) {
      loadData();
    }
  }, [leagueId, currentUserId]);

  useEffect(() => {
    if (selectedCourseId) {
      loadCourseDetails(selectedCourseId);
    }
  }, [selectedCourseId]);

  const loadData = async () => {
    if (!leagueId || !currentUserId) return;

    try {
      setLoading(true);

      // Load league
      const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
      if (!leagueDoc.exists()) {
        Alert.alert("Error", "League not found");
        router.back();
        return;
      }
      const leagueData = { id: leagueDoc.id, ...leagueDoc.data() } as League;
      setLeague(leagueData);

      // Initialize scores array
      setScores(new Array(leagueData.holesPerRound).fill(null));

      // Load member
      const memberDoc = await getDoc(
        doc(db, "leagues", leagueId, "members", currentUserId)
      );
      if (memberDoc.exists()) {
        const memberData = memberDoc.data() as Member;
        setMember(memberData);

        // Load team if exists
        if (memberData.teamId) {
          const teamDoc = await getDoc(
            doc(db, "leagues", leagueId, "teams", memberData.teamId)
          );
          if (teamDoc.exists()) {
            setTeam({ id: teamDoc.id, ...teamDoc.data() } as Team);
          }
        }
      }

      // Load courses
      if (leagueData.restrictedCourses && leagueData.restrictedCourses.length > 0) {
        // Load restricted courses
        const courses: Course[] = [];
        for (const rc of leagueData.restrictedCourses) {
          const courseData = await loadCourseById(rc.courseId);
          if (courseData) {
            courses.push(courseData);
          }
        }
        setAvailableCourses(courses);
        if (courses.length === 1) {
          setSelectedCourseId(courses[0].courseId);
        }
      } else {
        // Show course search/selector for "Any Course"
        setShowCourseSelector(true);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      Alert.alert("Error", "Failed to load league data");
    } finally {
      setLoading(false);
    }
  };

  const loadCourseById = async (courseId: number): Promise<Course | null> => {
    try {
      // Check cached courses in Firestore
      const coursesSnap = await getDocs(
        query(collection(db, "courses"), where("courseId", "==", courseId))
      );

      if (!coursesSnap.empty) {
        const courseDoc = coursesSnap.docs[0];
        const data = courseDoc.data();
        return {
          id: courseDoc.id,
          courseId: data.courseId,
          courseName: data.courseName,
          city: data.city,
          state: data.state,
          holes: data.holes || generateDefaultHoles(league?.holesPerRound || 18),
        };
      }

      return null;
    } catch (error) {
      console.error("Error loading course:", error);
      return null;
    }
  };

  const loadCourseDetails = async (courseId: number) => {
    const courseData = await loadCourseById(courseId);
    if (courseData) {
      setCourse(courseData);
    }
  };

  const generateDefaultHoles = (numHoles: number): HoleInfo[] => {
    const holes: HoleInfo[] = [];
    for (let i = 1; i <= numHoles; i++) {
      holes.push({
        holeNumber: i,
        par: 4,
        yardage: 400,
      });
    }
    return holes;
  };

  /* ================================================================ */
  /* HANDLERS                                                        */
  /* ================================================================ */

  const handleScoreChange = (holeIndex: number, value: string) => {
    const numValue = value === "" ? null : parseInt(value, 10);
    if (numValue !== null && (isNaN(numValue) || numValue < 1 || numValue > 15)) {
      return;
    }

    const newScores = [...scores];
    newScores[holeIndex] = numValue;
    setScores(newScores);

    // Auto-advance to next input
    if (numValue !== null && holeIndex < scores.length - 1) {
      setTimeout(() => {
        inputRefs.current[holeIndex + 1]?.focus();
      }, 50);
    }
  };

  const handleSubmit = async () => {
    if (!league || !currentUserId || !course) return;

    // Validate all scores entered
    const missingScores = scores.filter((s) => s === null);
    if (missingScores.length > 0) {
      Alert.alert(
        "Incomplete Scorecard",
        `Please enter scores for all ${league.holesPerRound} holes.`
      );
      return;
    }

    try {
      setSubmitting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const grossScore = scores.reduce((sum: number, s) => sum + (s || 0), 0);
      const totalPar = course.holes.reduce((sum: number, h) => sum + h.par, 0);

      // Get handicap
      let handicap = 0;
      if (league.handicapSystem === "league_managed") {
        handicap = member?.leagueHandicap || 0;
      } else {
        handicap = member?.swingThoughtsHandicap || 0;
      }

      const netScore = grossScore - handicap;

      // Create score document
      await addDoc(collection(db, "leagues", league.id, "scores"), {
        userId: currentUserId,
        displayName: member?.displayName || "Unknown",
        avatar: member?.avatar,
        teamId: team?.id || null,
        teamName: team?.name || null,
        week: league.currentWeek,
        courseId: course.courseId,
        courseName: course.courseName,
        holeScores: scores,
        grossScore,
        netScore,
        handicapUsed: handicap,
        totalPar,
        scoreToPar: grossScore - totalPar,
        createdAt: serverTimestamp(),
      });

      soundPlayer.play("click");
      Alert.alert(
        "Score Posted! 🎉",
        `Gross: ${grossScore} | Net: ${netScore}\n${grossScore - totalPar >= 0 ? "+" : ""}${grossScore - totalPar} to par`,
        [
          {
            text: "View Standings",
            onPress: () => router.push("/leagues/standings"),
          },
          {
            text: "Done",
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error("Error submitting score:", error);
      Alert.alert("Error", "Failed to submit score. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectCourse = (courseId: number) => {
    setSelectedCourseId(courseId);
    setShowCourseSelector(false);
  };

  /* ================================================================ */
  /* CALCULATIONS                                                    */
  /* ================================================================ */

  const getFront9Score = (): number | null => {
    const front9 = scores.slice(0, 9);
    if (front9.some((s) => s === null)) return null;
    return front9.reduce((sum: number, s) => sum + (s || 0), 0);
  };

  const getBack9Score = (): number | null => {
    if (league?.holesPerRound !== 18) return null;
    const back9 = scores.slice(9, 18);
    if (back9.some((s) => s === null)) return null;
    return back9.reduce((sum: number, s) => sum + (s || 0), 0);
  };

  const getTotalScore = (): number | null => {
    if (scores.some((s) => s === null)) return null;
    return scores.reduce((sum: number, s) => sum + (s || 0), 0);
  };

  const getFront9Par = (): number => {
    if (!course) return 36;
    return course.holes.slice(0, 9).reduce((sum: number, h) => sum + h.par, 0);
  };

  const getBack9Par = (): number => {
    if (!course || league?.holesPerRound !== 18) return 36;
    return course.holes.slice(9, 18).reduce((sum: number, h) => sum + h.par, 0);
  };

  const getTotalPar = (): number => {
    if (!course) return league?.holesPerRound === 9 ? 36 : 72;
    return course.holes.reduce((sum: number, h) => sum + h.par, 0);
  };

  const getFront9Yardage = (): number => {
    if (!course) return 0;
    return course.holes.slice(0, 9).reduce((sum: number, h) => sum + h.yardage, 0);
  };

  const getBack9Yardage = (): number => {
    if (!course || league?.holesPerRound !== 18) return 0;
    return course.holes.slice(9, 18).reduce((sum: number, h) => sum + h.yardage, 0);
  };

  const getTotalYardage = (): number => {
    if (!course) return 0;
    return course.holes.reduce((sum: number, h) => sum + h.yardage, 0);
  };

  const getScoreColor = (score: number | null, par: number) => {
    if (score === null) return "#333";
    const diff = score - par;
    if (diff <= -2) return "#FFD700"; // Eagle or better - Gold
    if (diff === -1) return "#E53935"; // Birdie - Red
    if (diff === 0) return "#333"; // Par - Black
    if (diff === 1) return "#333"; // Bogey - Black (boxed)
    if (diff === 2) return "#333"; // Double - Black (double boxed)
    return "#333"; // Triple+ - Black
  };

  const getScoreStyle = (score: number | null, par: number) => {
    if (score === null) return {};
    const diff = score - par;
    if (diff <= -2) return styles.scoreEagle; // Circle
    if (diff === -1) return styles.scoreBirdie; // Circle
    if (diff === 1) return styles.scoreBogey; // Box
    if (diff >= 2) return styles.scoreDouble; // Double box
    return {};
  };

  /* ================================================================ */
  /* RENDER                                                          */
  /* ================================================================ */

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  if (!league || !course) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post Score</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Course Selector */}
        {availableCourses.length > 0 ? (
          <View style={styles.courseSelector}>
            <Text style={styles.courseSelectorTitle}>Select Course</Text>
            {availableCourses.map((c) => (
              <TouchableOpacity
                key={c.courseId}
                style={styles.courseOption}
                onPress={() => handleSelectCourse(c.courseId)}
              >
                <Text style={styles.courseOptionName}>{c.courseName}</Text>
                {c.city && c.state ? (
                  <Text style={styles.courseOptionLocation}>
                    {c.city}, {c.state}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.noCourse}>
            <Text style={styles.noCourseText}>
              Course search coming soon...
            </Text>
          </View>
        )}
      </View>
    );
  }

  const is18Holes = league.holesPerRound === 18;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scorecard</Text>
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitButtonText}>
            {submitting ? "..." : "Submit"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Scorecard Header */}
        <View style={styles.scorecardHeader}>
          <View style={styles.scorecardLogo}>
            <Text style={styles.logoText}>{league.name.charAt(0)}</Text>
          </View>
          <View style={styles.scorecardInfo}>
            <Text style={styles.leagueName}>{league.name}</Text>
            <Text style={styles.courseName}>{course.courseName}</Text>
            <Text style={styles.weekText}>Week {league.currentWeek}</Text>
          </View>
        </View>

        {/* Player Info */}
        <View style={styles.playerInfo}>
          <View style={styles.playerRow}>
            <Text style={styles.playerLabel}>Player</Text>
            <Text style={styles.playerValue}>{member?.displayName || "Unknown"}</Text>
          </View>
          {team ? (
            <View style={styles.playerRow}>
              <Text style={styles.playerLabel}>Team</Text>
              <Text style={styles.playerValue}>{team.name}</Text>
            </View>
          ) : null}
          <View style={styles.playerRow}>
            <Text style={styles.playerLabel}>Date</Text>
            <Text style={styles.playerValue}>
              {new Date().toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </View>
        </View>

        {/* Front 9 */}
        <View style={styles.nineSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.scorecardTable}>
              {/* Hole Numbers */}
              <View style={styles.tableRow}>
                <View style={styles.labelCell}>
                  <Text style={styles.labelText}>HOLE</Text>
                </View>
                {course.holes.slice(0, 9).map((hole) => (
                  <View key={hole.holeNumber} style={styles.holeCell}>
                    <Text style={styles.holeNumber}>{hole.holeNumber}</Text>
                  </View>
                ))}
                <View style={styles.totalCell}>
                  <Text style={styles.totalLabel}>OUT</Text>
                </View>
              </View>

              {/* Yardage */}
              <View style={styles.tableRow}>
                <View style={styles.labelCell}>
                  <Text style={styles.labelText}>YARDS</Text>
                </View>
                {course.holes.slice(0, 9).map((hole) => (
                  <View key={hole.holeNumber} style={styles.dataCell}>
                    <Text style={styles.yardageText}>{hole.yardage}</Text>
                  </View>
                ))}
                <View style={styles.totalCell}>
                  <Text style={styles.totalValue}>{getFront9Yardage()}</Text>
                </View>
              </View>

              {/* Par */}
              <View style={styles.tableRow}>
                <View style={styles.labelCell}>
                  <Text style={styles.labelText}>PAR</Text>
                </View>
                {course.holes.slice(0, 9).map((hole) => (
                  <View key={hole.holeNumber} style={styles.dataCell}>
                    <Text style={styles.parText}>{hole.par}</Text>
                  </View>
                ))}
                <View style={styles.totalCell}>
                  <Text style={styles.totalValue}>{getFront9Par()}</Text>
                </View>
              </View>

              {/* Score Input */}
              <View style={styles.tableRow}>
                <View style={styles.labelCell}>
                  <Text style={styles.labelText}>SCORE</Text>
                </View>
                {course.holes.slice(0, 9).map((hole, idx) => (
                  <View key={hole.holeNumber} style={styles.scoreCell}>
                    <TextInput
                      ref={(ref) => { inputRefs.current[idx] = ref; }}
                      style={[
                        styles.scoreInput,
                        getScoreStyle(scores[idx], hole.par),
                        { color: getScoreColor(scores[idx], hole.par) },
                      ]}
                      value={scores[idx]?.toString() || ""}
                      onChangeText={(v) => handleScoreChange(idx, v)}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                    />
                  </View>
                ))}
                <View style={styles.totalCell}>
                  <Text style={styles.totalScore}>
                    {getFront9Score() ?? "-"}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* Back 9 */}
        {is18Holes ? (
          <View style={styles.nineSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.scorecardTable}>
                {/* Hole Numbers */}
                <View style={styles.tableRow}>
                  <View style={styles.labelCell}>
                    <Text style={styles.labelText}>HOLE</Text>
                  </View>
                  {course.holes.slice(9, 18).map((hole) => (
                    <View key={hole.holeNumber} style={styles.holeCell}>
                      <Text style={styles.holeNumber}>{hole.holeNumber}</Text>
                    </View>
                  ))}
                  <View style={styles.totalCell}>
                    <Text style={styles.totalLabel}>IN</Text>
                  </View>
                  <View style={styles.grandTotalCell}>
                    <Text style={styles.totalLabel}>TOT</Text>
                  </View>
                </View>

                {/* Yardage */}
                <View style={styles.tableRow}>
                  <View style={styles.labelCell}>
                    <Text style={styles.labelText}>YARDS</Text>
                  </View>
                  {course.holes.slice(9, 18).map((hole) => (
                    <View key={hole.holeNumber} style={styles.dataCell}>
                      <Text style={styles.yardageText}>{hole.yardage}</Text>
                    </View>
                  ))}
                  <View style={styles.totalCell}>
                    <Text style={styles.totalValue}>{getBack9Yardage()}</Text>
                  </View>
                  <View style={styles.grandTotalCell}>
                    <Text style={styles.totalValue}>{getTotalYardage()}</Text>
                  </View>
                </View>

                {/* Par */}
                <View style={styles.tableRow}>
                  <View style={styles.labelCell}>
                    <Text style={styles.labelText}>PAR</Text>
                  </View>
                  {course.holes.slice(9, 18).map((hole) => (
                    <View key={hole.holeNumber} style={styles.dataCell}>
                      <Text style={styles.parText}>{hole.par}</Text>
                    </View>
                  ))}
                  <View style={styles.totalCell}>
                    <Text style={styles.totalValue}>{getBack9Par()}</Text>
                  </View>
                  <View style={styles.grandTotalCell}>
                    <Text style={styles.totalValue}>{getTotalPar()}</Text>
                  </View>
                </View>

                {/* Score Input */}
                <View style={styles.tableRow}>
                  <View style={styles.labelCell}>
                    <Text style={styles.labelText}>SCORE</Text>
                  </View>
                  {course.holes.slice(9, 18).map((hole, idx) => (
                    <View key={hole.holeNumber} style={styles.scoreCell}>
                      <TextInput
                        ref={(ref) => { inputRefs.current[idx + 9] = ref; }}
                        style={[
                          styles.scoreInput,
                          getScoreStyle(scores[idx + 9], hole.par),
                          { color: getScoreColor(scores[idx + 9], hole.par) },
                        ]}
                        value={scores[idx + 9]?.toString() || ""}
                        onChangeText={(v) => handleScoreChange(idx + 9, v)}
                        keyboardType="number-pad"
                        maxLength={2}
                        selectTextOnFocus
                      />
                    </View>
                  ))}
                  <View style={styles.totalCell}>
                    <Text style={styles.totalScore}>
                      {getBack9Score() ?? "-"}
                    </Text>
                  </View>
                  <View style={styles.grandTotalCell}>
                    <Text style={styles.grandTotalScore}>
                      {getTotalScore() ?? "-"}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        ) : (
          /* 9 Hole Total */
          <View style={styles.totalSummary}>
            <Text style={styles.totalSummaryLabel}>TOTAL</Text>
            <Text style={styles.totalSummaryValue}>
              {getTotalScore() ?? "-"}
            </Text>
          </View>
        )}

        {/* Score Summary */}
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Gross Score</Text>
            <Text style={styles.summaryValue}>{getTotalScore() ?? "-"}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Handicap</Text>
            <Text style={styles.summaryValue}>
              {league.handicapSystem === "league_managed"
                ? member?.leagueHandicap ?? 0
                : member?.swingThoughtsHandicap ?? 0}
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryRowNet]}>
            <Text style={styles.summaryLabelNet}>Net Score</Text>
            <Text style={styles.summaryValueNet}>
              {getTotalScore() !== null
                ? getTotalScore()! -
                  (league.handicapSystem === "league_managed"
                    ? member?.leagueHandicap ?? 0
                    : member?.swingThoughtsHandicap ?? 0)
                : "-"}
            </Text>
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSample, styles.scoreEagle]}>
              <Text style={styles.legendSampleText}>2</Text>
            </View>
            <Text style={styles.legendText}>Eagle+</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSample, styles.scoreBirdie]}>
              <Text style={[styles.legendSampleText, { color: "#E53935" }]}>3</Text>
            </View>
            <Text style={styles.legendText}>Birdie</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSample, styles.scoreBogey]}>
              <Text style={styles.legendSampleText}>5</Text>
            </View>
            <Text style={styles.legendText}>Bogey</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSample, styles.scoreDouble]}>
              <Text style={styles.legendSampleText}>6</Text>
            </View>
            <Text style={styles.legendText}>Double+</Text>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </KeyboardAvoidingView>
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
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  headerRight: {
    width: 70,
  },
  submitButton: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },

  // Scorecard Header
  scorecardHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D5C3A",
    padding: 16,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  scorecardLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
  },
  logoText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  scorecardInfo: {
    marginLeft: 16,
    flex: 1,
  },
  leagueName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },
  courseName: {
    fontSize: 14,
    color: "#C8E6C9",
    marginTop: 2,
  },
  weekText: {
    fontSize: 12,
    color: "#A5D6A7",
    marginTop: 2,
  },

  // Player Info
  playerInfo: {
    backgroundColor: "#FFF",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  playerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  playerLabel: {
    fontSize: 13,
    color: "#666",
  },
  playerValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },

  // Nine Section
  nineSection: {
    backgroundColor: "#FFF",
    marginTop: 2,
  },

  // Scorecard Table
  scorecardTable: {
    flexDirection: "column",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  labelCell: {
    width: 50,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
  },
  labelText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#666",
  },
  holeCell: {
    width: 36,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D5C3A",
  },
  holeNumber: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },
  dataCell: {
    width: 36,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  yardageText: {
    fontSize: 11,
    color: "#666",
  },
  parText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  scoreCell: {
    width: 36,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreInput: {
    width: 30,
    height: 30,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    backgroundColor: "#FFFDE7",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  totalCell: {
    width: 44,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F5E9",
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  totalValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
  totalScore: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  grandTotalCell: {
    width: 48,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C8E6C9",
  },
  grandTotalScore: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  // Score Styles
  scoreEagle: {
    backgroundColor: "#FFF9C4",
    borderColor: "#FFD700",
    borderWidth: 2,
    borderRadius: 15,
  },
  scoreBirdie: {
    borderColor: "#E53935",
    borderWidth: 2,
    borderRadius: 15,
  },
  scoreBogey: {
    borderColor: "#333",
    borderWidth: 2,
    borderRadius: 2,
  },
  scoreDouble: {
    borderColor: "#333",
    borderWidth: 3,
    borderRadius: 2,
  },

  // Total Summary (9 hole)
  totalSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#C8E6C9",
    padding: 16,
  },
  totalSummaryLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  totalSummaryValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  // Summary
  summary: {
    backgroundColor: "#FFF",
    padding: 16,
    marginTop: 2,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  summaryRowNet: {
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    marginTop: 8,
    paddingTop: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#666",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  summaryLabelNet: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  summaryValueNet: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  // Legend
  legend: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 16,
    padding: 12,
    backgroundColor: "#FFF",
    borderRadius: 12,
  },
  legendItem: {
    alignItems: "center",
  },
  legendSample: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 4,
    marginBottom: 4,
  },
  legendSampleText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#333",
  },
  legendText: {
    fontSize: 10,
    color: "#666",
  },

  // Course Selector
  courseSelector: {
    padding: 16,
  },
  courseSelectorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 16,
  },
  courseOption: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  courseOptionName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  courseOptionLocation: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
  },

  // No Course
  noCourse: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  noCourseText: {
    fontSize: 16,
    color: "#666",
  },

  bottomSpacer: {
    height: 40,
  },
});