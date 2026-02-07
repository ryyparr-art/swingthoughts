/**
 * League Post Score - Main Orchestrator
 *
 * Flow: Course Selection -> Tee Selection -> Scorecard -> Submit
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
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CourseSelector from "@/components/leagues/post-score/CourseSelector";
import {
  calculateAllAdjustedScores,
  calculateCourseHandicap,
  countFairways,
  countGreens,
  countPenalties,
  extractTees,
  generateDefaultHoles,
  getHolesCount,
  getTotalAdjScore,
  getTotalPar,
  haversine,
} from "@/components/leagues/post-score/helpers";
import Scorecard from "@/components/leagues/post-score/Scorecard";
import ScoreSummary from "@/components/leagues/post-score/ScoreSummary";
import { styles } from "@/components/leagues/post-score/styles";
import TeeSelector from "@/components/leagues/post-score/TeeSelector";
import {
  CourseBasic,
  FullCourseData,
  League,
  Member,
  Team,
  TeeOption,
  UserProfile,
} from "@/components/leagues/post-score/types";

const API_KEY = process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY;
const API_BASE = "https://api.golfcourseapi.com/v1";

type Screen = "course" | "tee" | "scorecard";

export default function LeaguePostScore() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const currentUserId = auth.currentUser?.uid;

  // Current screen in flow
  const [currentScreen, setCurrentScreen] = useState<Screen>("course");

  // Data
  const [league, setLeague] = useState<League | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [availableCourses, setAvailableCourses] = useState<CourseBasic[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude?: number;
    longitude?: number;
  } | null>(null);

  // Course & Tee selection
  const [fullCourseData, setFullCourseData] = useState<FullCourseData | null>(null);
  const [availableTees, setAvailableTees] = useState<TeeOption[]>([]);
  const [selectedTee, setSelectedTee] = useState<TeeOption | null>(null);

  // Score state
  const [scores, setScores] = useState<(number | null)[]>([]);

  // Stat state (FIR / GIR / PNL)
  const [fir, setFir] = useState<(boolean | null)[]>([]);
  const [gir, setGir] = useState<(boolean | null)[]>([]);
  const [pnl, setPnl] = useState<(number | null)[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [loadingCourse, setLoadingCourse] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* ================================================================ */
  /* DERIVED VALUES                                                   */
  /* ================================================================ */

  const holesCount = useMemo(() => getHolesCount(league), [league]);

  /** Whether we use SwingThoughts handicap system (vs league-managed) */
  const useSwingThoughtsHandicap = useMemo(
    () => league?.handicapSystem === "swingthoughts",
    [league]
  );

  const courseHandicap = useMemo(() => {
    if (!useSwingThoughtsHandicap) return 0;
    if (!selectedTee || !userProfile) return 0;
    return calculateCourseHandicap(
      userProfile.handicapIndex || 0,
      selectedTee.slope_rating,
      holesCount
    );
  }, [selectedTee, userProfile, holesCount, useSwingThoughtsHandicap]);

  const adjScores = useMemo(() => {
    if (!selectedTee) return scores.map(() => null);
    return calculateAllAdjustedScores(
      scores,
      selectedTee.holes,
      courseHandicap,
      holesCount
    );
  }, [scores, selectedTee, courseHandicap, holesCount]);

  /* ================================================================ */
  /* DATA LOADING                                                     */
  /* ================================================================ */

  useEffect(() => {
    if (leagueId && currentUserId) {
      loadData();
    }
  }, [leagueId, currentUserId]);

  const loadData = async () => {
    if (!leagueId || !currentUserId) return;

    try {
      setLoading(true);

      // Load user profile
      const userDoc = await getDoc(doc(db, "users", currentUserId));
      let userData: UserProfile | null = null;
      if (userDoc.exists()) {
        userData = userDoc.data() as UserProfile;
        // Parse handicap - stored as string in Firestore (e.g. "20")
        const rawHandicap = userData.handicap;
        if (rawHandicap !== undefined && rawHandicap !== null) {
          const parsed = typeof rawHandicap === "string"
            ? parseFloat(rawHandicap)
            : rawHandicap;
          if (!isNaN(parsed)) {
            userData.handicapIndex = parsed;
          }
        }
        setUserProfile(userData);
        if (userData.location?.latitude && userData.location?.longitude) {
          setUserLocation({
            latitude: userData.location.latitude,
            longitude: userData.location.longitude,
          });
        }
      }

      // Load league
      const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
      if (!leagueDoc.exists()) {
        Alert.alert("Error", "League not found");
        router.back();
        return;
      }
      const leagueData = { id: leagueDoc.id, ...leagueDoc.data() } as League;
      setLeague(leagueData);

      // Initialize arrays
      const hc = getHolesCount(leagueData);
      resetArrays(hc);

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
      await loadCourses(leagueData, userData);
    } catch (error) {
      console.error("Error loading data:", error);
      Alert.alert("Error", "Failed to load league data");
    } finally {
      setLoading(false);
    }
  };

  const resetArrays = (hc: number) => {
    setScores(new Array(hc).fill(null));
    setFir(new Array(hc).fill(null));
    setGir(new Array(hc).fill(null));
    setPnl(new Array(hc).fill(null));
  };

  const loadCourses = async (leagueData: League, userData: UserProfile | null) => {
    if (
      leagueData.courseRestriction &&
      leagueData.allowedCourses &&
      leagueData.allowedCourses.length > 0
    ) {
      const courses: CourseBasic[] = leagueData.allowedCourses.map((rc) => ({
        courseId: rc.courseId,
        courseName: rc.courseName,
      }));
      setAvailableCourses(courses);

      if (courses.length === 1 && courses[0].courseId) {
        await handleSelectCourse(courses[0]);
      }
    } else {
      const cachedCourses = userData?.cachedCourses || [];
      const courses: CourseBasic[] = [];

      const uniqueCourses = cachedCourses.reduce((acc: any[], current: any) => {
        const exists = acc.find(
          (c) => c.courseId === current.courseId || c.id === current.courseId
        );
        if (!exists) acc.push(current);
        return acc;
      }, []);

      for (const c of uniqueCourses) {
        let distance: number | undefined;
        if (
          userLocation?.latitude &&
          userLocation?.longitude &&
          c.location?.latitude &&
          c.location?.longitude
        ) {
          distance = haversine(
            userLocation.latitude,
            userLocation.longitude,
            c.location.latitude,
            c.location.longitude
          );
        }
        courses.push({
          id: c.id || c.courseId,
          courseId: c.courseId || c.id,
          courseName: c.courseName || c.course_name,
          course_name: c.course_name || c.courseName,
          location: c.location,
          city: c.location?.city,
          state: c.location?.state,
          distance,
        });
      }

      courses.sort((a, b) => {
        if (a.distance !== undefined && b.distance !== undefined) {
          return a.distance - b.distance;
        }
        return (a.courseName || "").localeCompare(b.courseName || "");
      });

      setAvailableCourses(courses.slice(0, 5));
    }
  };

  /* ================================================================ */
  /* HANDLERS                                                         */
  /* ================================================================ */

  const handleSelectCourse = async (course: CourseBasic) => {
    const rawCourseId = course.courseId || course.id;
    if (!rawCourseId) return;

    const courseId =
      typeof rawCourseId === "string" ? parseInt(rawCourseId, 10) : rawCourseId;
    if (isNaN(courseId)) return;

    setLoadingCourse(true);

    try {
      const courseDocRef = doc(db, "courses", String(courseId));
      const courseSnap = await getDoc(courseDocRef);

      let courseData: FullCourseData | null = null;

      if (courseSnap.exists()) {
        const data = courseSnap.data();
        courseData = {
          id: courseId,
          courseId: courseId,
          courseName: data.courseName || data.course_name || course.courseName,
          course_name: data.course_name || data.courseName,
          location: data.location || course.location,
          tees: data.tees,
        };
      } else {
        const res = await fetch(`${API_BASE}/courses/${courseId}`, {
          headers: { Authorization: `Key ${API_KEY}` },
        });

        if (res.ok) {
          const apiData = await res.json();
          courseData = {
            id: courseId,
            courseId: courseId,
            courseName: apiData.course_name,
            course_name: apiData.course_name,
            location: apiData.location,
            tees: apiData.tees,
          };

          try {
            await setDoc(
              courseDocRef,
              {
                id: courseId,
                courseId: courseId,
                courseName: apiData.course_name,
                course_name: apiData.course_name,
                location: apiData.location,
                tees: apiData.tees,
                cachedAt: serverTimestamp(),
              },
              { merge: true }
            );
          } catch (e) {
            console.error("Failed to cache course:", e);
          }
        }
      }

      if (courseData) {
        setFullCourseData(courseData);

        const tees = extractTees(courseData.tees);

        if (tees.length > 0) {
          setAvailableTees(tees);
          setCurrentScreen("tee");
        } else {
          Alert.alert(
            "No Tee Data",
            "This course doesn't have tee information. Using default values."
          );
          const defaultTee: TeeOption = {
            tee_name: "Default",
            course_rating: 72,
            slope_rating: 113,
            par_total: holesCount === 9 ? 36 : 72,
            total_yards: holesCount === 9 ? 3200 : 6400,
            number_of_holes: holesCount,
            holes: generateDefaultHoles(holesCount),
            source: "male",
          };
          setSelectedTee(defaultTee);
          setCurrentScreen("scorecard");
        }
      }
    } catch (error) {
      console.error("Error loading course:", error);
      Alert.alert("Error", "Failed to load course data. Please try again.");
    } finally {
      setLoadingCourse(false);
    }
  };

  const handleSelectTee = (tee: TeeOption) => {
    if (tee.holes && tee.holes.length >= holesCount) {
      setSelectedTee(tee);
    } else {
      const filledHoles = [];
      for (let i = 0; i < holesCount; i++) {
        if (tee.holes && tee.holes[i]) {
          filledHoles.push(tee.holes[i]);
        } else {
          filledHoles.push({ par: 4, yardage: 400 });
        }
      }
      setSelectedTee({ ...tee, holes: filledHoles });
    }

    resetArrays(holesCount);
    setCurrentScreen("scorecard");
  };

  const handleScoreChange = useCallback(
    (holeIndex: number, value: string) => {
      const numValue = value === "" ? null : parseInt(value, 10);
      if (numValue !== null && (isNaN(numValue) || numValue < 1 || numValue > 15)) {
        return;
      }
      setScores((prev) => {
        const next = [...prev];
        next[holeIndex] = numValue;
        return next;
      });
    },
    []
  );

  const handleFirToggle = useCallback((holeIndex: number) => {
    setFir((prev) => {
      const next = [...prev];
      if (next[holeIndex] === null) next[holeIndex] = true;
      else if (next[holeIndex] === true) next[holeIndex] = false;
      else next[holeIndex] = null;
      return next;
    });
  }, []);

  const handleGirToggle = useCallback((holeIndex: number) => {
    setGir((prev) => {
      const next = [...prev];
      if (next[holeIndex] === null) next[holeIndex] = true;
      else if (next[holeIndex] === true) next[holeIndex] = false;
      else next[holeIndex] = null;
      return next;
    });
  }, []);

  const handlePnlChange = useCallback((holeIndex: number, value: string) => {
    const numValue = value === "" ? null : parseInt(value, 10);
    if (numValue !== null && (isNaN(numValue) || numValue < 0 || numValue > 9)) {
      return;
    }
    setPnl((prev) => {
      const next = [...prev];
      next[holeIndex] = numValue;
      return next;
    });
  }, []);

  const handleSubmit = async () => {
    if (!league || !currentUserId || !selectedTee || !fullCourseData) return;

    const missingScores = scores.filter((s) => s === null);
    if (missingScores.length > 0) {
      Alert.alert(
        "Incomplete Scorecard",
        `Please enter scores for all ${holesCount} holes.`
      );
      return;
    }

    try {
      setSubmitting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const grossScore = scores.reduce((sum: number, s) => sum + (s || 0), 0);
      const totalPar = getTotalPar(selectedTee.holes, holesCount);
      const handicapIndex = useSwingThoughtsHandicap
        ? (userProfile?.handicapIndex || 0)
        : 0;
      const netScore = useSwingThoughtsHandicap
        ? (getTotalAdjScore(adjScores) ?? grossScore - courseHandicap)
        : grossScore; // No net calculation for league-managed

      // Calculate stats
      const fairways = countFairways(fir, selectedTee.holes, holesCount);
      const greens = countGreens(gir, holesCount);
      const penalties = countPenalties(pnl, holesCount);

      const hasFirData = fir.some((v) => v !== null);
      const hasGirData = gir.some((v) => v !== null);
      const hasPnlData = pnl.some((v) => v !== null && v! > 0);

      const scoreDoc: Record<string, any> = {
        userId: currentUserId,
        displayName: member?.displayName || userProfile?.displayName || "Unknown",
        avatar: member?.avatar || userProfile?.avatar,
        teamId: team?.id || null,
        teamName: team?.name || null,
        week: league.currentWeek,
        courseId: fullCourseData.courseId || fullCourseData.id,
        courseName: fullCourseData.courseName || fullCourseData.course_name,
        tees: selectedTee.tee_name,
        courseRating: selectedTee.course_rating,
        slopeRating: selectedTee.slope_rating,
        handicapSystem: league.handicapSystem,
        handicapIndex: handicapIndex,
        courseHandicap: courseHandicap,
        holeScores: scores,
        grossScore,
        netScore,
        totalPar,
        scoreToPar: grossScore - totalPar,
        postedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: league.scoreApproval === "manager" ? "pending" : "approved",
      };

      // Only include adjusted scores for SwingThoughts handicap system
      if (useSwingThoughtsHandicap) {
        scoreDoc.adjScores = adjScores;
      }

      // Only include stats if user entered any
      if (hasFirData || hasGirData || hasPnlData) {
        scoreDoc.holeStats = { fir, gir, pnl };
        if (hasFirData) {
          scoreDoc.fairwaysHit = fairways.hit;
          scoreDoc.fairwaysPossible = fairways.possible;
        }
        if (hasGirData) {
          scoreDoc.greensInRegulation = greens.hit;
        }
        if (hasPnlData) {
          scoreDoc.totalPenalties = penalties;
        }
      }

      await addDoc(collection(db, "leagues", league.id, "scores"), scoreDoc);

      soundPlayer.play("click");

      const alertMessage = useSwingThoughtsHandicap
        ? `Gross: ${grossScore} | Net: ${netScore}\nCourse Handicap: ${courseHandicap}\n${
            grossScore - totalPar >= 0 ? "+" : ""
          }${grossScore - totalPar} to par`
        : `Score: ${grossScore}\n${
            grossScore - totalPar >= 0 ? "+" : ""
          }${grossScore - totalPar} to par`;

      Alert.alert("Score Posted! \uD83C\uDF89", alertMessage, [
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

  const handleChangeCourse = () => {
    soundPlayer.play("click");
    setSelectedTee(null);
    setFullCourseData(null);
    setAvailableTees([]);
    setCurrentScreen("course");
  };

  const handleChangeTee = () => {
    soundPlayer.play("click");
    setSelectedTee(null);
    setCurrentScreen("tee");
  };

  /* ================================================================ */
  /* RENDER                                                           */
  /* ================================================================ */

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  if (loadingCourse) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#0D5C3A" />
        <Text style={styles.loadingText}>Loading course data...</Text>
      </View>
    );
  }

  // Course Selection Screen
  if (currentScreen === "course") {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post Score</Text>
          <View style={styles.headerRight} />
        </View>

        <CourseSelector
          availableCourses={availableCourses}
          isRestricted={league?.courseRestriction || false}
          userLocation={userLocation}
          onSelectCourse={handleSelectCourse}
          onBack={() => router.back()}
        />
      </View>
    );
  }

  // Tee Selection Screen
  if (currentScreen === "tee") {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleChangeCourse}>
            <Ionicons name="chevron-back" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Select Tees</Text>
          <View style={styles.headerRight} />
        </View>

        <TeeSelector
          courseName={fullCourseData?.courseName || fullCourseData?.course_name || ""}
          tees={availableTees}
          handicapIndex={userProfile?.handicapIndex}
          onSelectTee={handleSelectTee}
          onBack={handleChangeCourse}
        />
      </View>
    );
  }

  // Scorecard Screen
  if (!selectedTee || !league) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Text style={styles.noCourseText}>Something went wrong.</Text>
        <TouchableOpacity style={styles.searchCourseButton} onPress={handleChangeCourse}>
          <Text style={styles.searchCourseButtonText}>Start Over</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
            {league.avatar ? (
              <Image
                source={{ uri: league.avatar }}
                style={styles.scorecardLogoImage}
              />
            ) : (
              <Text style={styles.logoText}>{league.name.charAt(0)}</Text>
            )}
          </View>
          <View style={styles.scorecardInfo}>
            <Text style={styles.leagueName}>{league.name}</Text>
            <TouchableOpacity onPress={handleChangeCourse}>
              <Text style={styles.courseName}>
                {fullCourseData?.courseName || fullCourseData?.course_name}{" "}
                <Ionicons name="pencil" size={12} color="#C8E6C9" />
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleChangeTee}>
              <Text style={styles.teeInfo}>
                {selectedTee.tee_name} •{" "}
                {selectedTee.total_yards?.toLocaleString()} yds{" "}
                <Ionicons name="pencil" size={10} color="#A5D6A7" />
              </Text>
            </TouchableOpacity>
            <Text style={styles.weekText}>Week {league.currentWeek}</Text>
          </View>
        </View>

        {/* Player Info */}
        <View style={styles.playerInfo}>
          <View style={styles.playerRow}>
            <Text style={styles.playerLabel}>Player</Text>
            <Text style={styles.playerValue}>
              {member?.displayName || userProfile?.displayName || "Unknown"}
            </Text>
          </View>
          {team ? (
            <View style={styles.playerRow}>
              <Text style={styles.playerLabel}>Team</Text>
              <Text style={styles.playerValue}>{team.name}</Text>
            </View>
          ) : null}
          {useSwingThoughtsHandicap ? (
            <>
              <View style={styles.playerRow}>
                <Text style={styles.playerLabel}>Handicap Index</Text>
                <Text style={styles.playerValue}>
                  {(userProfile?.handicapIndex || 0).toFixed(1)}
                </Text>
              </View>
              <View style={styles.playerRow}>
                <Text style={styles.playerLabel}>Course Handicap</Text>
                <Text style={styles.playerValue}>{courseHandicap}</Text>
              </View>
            </>
          ) : (
            <View style={styles.playerRow}>
              <Text style={styles.playerLabel}>Handicap</Text>
              <Text style={styles.playerValueMuted}>League Managed</Text>
            </View>
          )}
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

        {/* Scorecard */}
        <Scorecard
          holes={selectedTee.holes}
          holesCount={holesCount}
          scores={scores}
          adjScores={adjScores}
          courseHandicap={courseHandicap}
          showHandicap={useSwingThoughtsHandicap}
          fir={fir}
          gir={gir}
          pnl={pnl}
          onScoreChange={handleScoreChange}
          onFirToggle={handleFirToggle}
          onGirToggle={handleGirToggle}
          onPnlChange={handlePnlChange}
        />

        {/* Score Summary */}
        <ScoreSummary
          scores={scores}
          adjScores={adjScores}
          holes={selectedTee.holes}
          holesCount={holesCount}
          courseHandicap={courseHandicap}
          showHandicap={useSwingThoughtsHandicap}
          fir={fir}
          gir={gir}
          pnl={pnl}
        />

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}