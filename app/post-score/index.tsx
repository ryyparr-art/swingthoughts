/**
 * Post Score Screen (Refactored)
 *
 * Flow: Course Selection → Tee Selection → Scorecard → Round Details → Submit
 *
 * Reuses league post-score components:
 * - CourseSelector, TeeSelector, Scorecard, ScoreSummary
 * - helpers.ts, types.ts, styles.ts
 *
 * Adds non-league features:
 * - Hole-in-one detection & verification
 * - Round description with @mention autocomplete
 * - Scorecard image upload (required)
 * - Scores collection write + Cloud Function triggers
 * - User stats, course stats, location updates
 * - Rate limiting & email verification
 */

import { auth, db, storage } from "@/constants/firebaseConfig";
import { canPostScores } from "@/utils/canPostScores";
import {
  checkRateLimit,
  EMAIL_VERIFICATION_MESSAGE,
  getRateLimitMessage,
  isEmailVerified,
  updateRateLimitTimestamp,
} from "@/utils/rateLimitHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Reuse league post-score components
import CourseSelector from "@/components/leagues/post-score/CourseSelector";
import Scorecard from "@/components/leagues/post-score/Scorecard";
import ScoreSummary from "@/components/leagues/post-score/ScoreSummary";
import TeeSelector from "@/components/leagues/post-score/TeeSelector";
import {
  calculateAllAdjustedScores,
  calculateCourseHandicap,
  countFairways,
  countGreens,
  extractTees,
  generateDefaultHoles,
  getTotalAdjScore,
  getTotalPar,
  getTotalScore,
  haversine,
  loadFullCourseData,
} from "@/components/leagues/post-score/helpers";
import { styles } from "@/components/leagues/post-score/styles";
import {
  CourseBasic,
  FullCourseData,
  TeeOption,
} from "@/components/leagues/post-score/types";
import { getDtpCourseInfo, getDtpEligibleHoles, DtpCourseInfo } from "@/utils/dtpHelpers";

console.log("✅ PostScoreScreen module loaded successfully");

const MAX_CHARACTERS = 280;

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface Partner {
  userId: string;
  displayName: string;
  avatar?: string;
}

type Screen = "course" | "tee" | "scorecard";

/* ================================================================ */
/* HELPERS                                                          */
/* ================================================================ */

function encodeGeohash(latitude: number, longitude: number, precision: number = 5): string {
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = "";
  let latMin = -90, latMax = 90;
  let lonMin = -180, lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const lonMid = (lonMin + lonMax) / 2;
      if (longitude > lonMid) { idx = (idx << 1) + 1; lonMin = lonMid; }
      else { idx = idx << 1; lonMax = lonMid; }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (latitude > latMid) { idx = (idx << 1) + 1; latMin = latMid; }
      else { idx = idx << 1; latMax = latMid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { geohash += base32[idx]; bit = 0; idx = 0; }
  }
  return geohash;
}

/* ================================================================ */
/* COMPONENT                                                        */
/* ================================================================ */

export default function PostScoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUserId = auth.currentUser?.uid;

  console.log("🏌️ PostScoreScreen render, userId:", currentUserId);

  // Current screen in flow
  const [currentScreen, setCurrentScreen] = useState<Screen>("course");

  /* ---------------------------------------------------------------- */
  /* USER DATA                                                        */
  /* ---------------------------------------------------------------- */

  const [userData, setUserData] = useState<any>(null);
  const [userRegionKey, setUserRegionKey] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude?: number;
    longitude?: number;
  } | null>(null);
  const [allPartners, setAllPartners] = useState<Partner[]>([]);
  const canPost = canPostScores(userData);

  /* ---------------------------------------------------------------- */
  /* COURSE & TEE STATE                                               */
  /* ---------------------------------------------------------------- */

  const [availableCourses, setAvailableCourses] = useState<CourseBasic[]>([]);
  const [fullCourseData, setFullCourseData] = useState<FullCourseData | null>(null);
  const [availableTees, setAvailableTees] = useState<TeeOption[]>([]);
  const [selectedTee, setSelectedTee] = useState<TeeOption | null>(null);

  /* ---------------------------------------------------------------- */
  /* SCORE STATE                                                      */
  /* ---------------------------------------------------------------- */

  const [holeCount, setHoleCount] = useState<9 | 18>(18);
  const [scores, setScores] = useState<(number | null)[]>(new Array(18).fill(null));
  const [fir, setFir] = useState<(boolean | null)[]>(new Array(18).fill(null));
  const [gir, setGir] = useState<(boolean | null)[]>(new Array(18).fill(null));

  /* ---------------------------------------------------------------- */
  /* HOLE-IN-ONE STATE                                                */
  /* ---------------------------------------------------------------- */

  const [hadHoleInOne, setHadHoleInOne] = useState(false);
  const [holeInOneHoleNumber, setHoleInOneHoleNumber] = useState("");
  const [selectedVerifier, setSelectedVerifier] = useState<Partner | null>(null);
  const [showVerifierModal, setShowVerifierModal] = useState(false);
  const [verifierSearchQuery, setVerifierSearchQuery] = useState("");

  /* ---------------------------------------------------------------- */
  /* DTP CHALLENGE STATE                                              */
  /* ---------------------------------------------------------------- */

  const [isDtpRegistered, setIsDtpRegistered] = useState(false);
  const [dtpCourseInfo, setDtpCourseInfo] = useState<DtpCourseInfo | null>(null);
  const [dtpValues, setDtpValues] = useState<(string | null)[]>(new Array(18).fill(null));

  /* ---------------------------------------------------------------- */
  /* ROUND DETAILS STATE                                              */
  /* ---------------------------------------------------------------- */

  const [roundDescription, setRoundDescription] = useState("");
  const [scorecardImageUri, setScorecardImageUri] = useState<string | null>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteResults, setAutocompleteResults] = useState<any[]>([]);
  const [currentMention, setCurrentMention] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);

  /* ---------------------------------------------------------------- */
  /* UI STATE                                                         */
  /* ---------------------------------------------------------------- */

  const [loading, setLoading] = useState(true);
  const [loadingCourse, setLoadingCourse] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittingMessage, setSubmittingMessage] = useState("Submitting...");

  /* ================================================================ */
  /* DERIVED VALUES                                                   */
  /* ================================================================ */

  const holesCount = holeCount;

  const courseHandicap = useMemo(() => {
    if (!selectedTee || !userData) return 0;
    const handicapIndex = parseFloat(userData.handicap) || 0;
    return calculateCourseHandicap(handicapIndex, selectedTee.slope_rating, holesCount);
  }, [selectedTee, userData, holesCount]);

  const adjScores = useMemo(() => {
    if (!selectedTee) return scores.map(() => null);
    return calculateAllAdjustedScores(scores, selectedTee.holes, courseHandicap, holesCount);
  }, [scores, selectedTee, courseHandicap, holesCount]);

  const dtpEligibleHoles = useMemo(() => {
    if (!isDtpRegistered || !selectedTee) return new Set<number>();
    return getDtpEligibleHoles(selectedTee.holes, holesCount, dtpCourseInfo);
  }, [isDtpRegistered, selectedTee, holesCount, dtpCourseInfo]);

  /* ================================================================ */
  /* DATA LOADING                                                     */
  /* ================================================================ */

  useEffect(() => {
    if (currentUserId) loadData();
  }, [currentUserId]);

  const loadData = async () => {
    if (!currentUserId) return;
    console.log("📦 loadData started");
    try {
      setLoading(true);

      const snap = await getDoc(doc(db, "users", currentUserId));
      if (!snap.exists()) return;

      const data = snap.data();
      setUserData(data);
      setUserRegionKey(data.regionKey || null);

      // Check DTP challenge registration
      const activeChallenges: string[] = data.activeChallenges ?? [];
      setIsDtpRegistered(activeChallenges.includes("dtp"));

      if (data.location?.latitude && data.location?.longitude) {
        setUserLocation({
          latitude: data.location.latitude,
          longitude: data.location.longitude,
        });
      }

      // Load partners
      const partners = data?.partners || [];
      if (Array.isArray(partners) && partners.length > 0) {
        const partnerDocs = await Promise.all(
          partners.map((id: string) => getDoc(doc(db, "users", id)))
        );
        setAllPartners(
          partnerDocs
            .filter((d) => d.exists())
            .map((d) => ({
              userId: d.id,
              displayName: d.data()?.displayName || "Unknown",
              avatar: d.data()?.avatar || undefined,
            }))
        );
      }

      // Load cached courses
      const cached = data?.cachedCourses || [];
      if (cached.length > 0) {
        const unique = cached.reduce((acc: any[], cur: any) => {
          if (!acc.find((c: any) => c.courseId === cur.courseId || c.id === cur.courseId)) {
            acc.push(cur);
          }
          return acc;
        }, []);

        const courses: CourseBasic[] = unique.map((c: any) => {
          let distance: number | undefined;
          if (data.location?.latitude && data.location?.longitude && c.location?.latitude && c.location?.longitude) {
            distance = haversine(data.location.latitude, data.location.longitude, c.location.latitude, c.location.longitude);
          }
          return {
            id: c.id || c.courseId,
            courseId: c.courseId || c.id,
            courseName: c.courseName || c.course_name,
            course_name: c.course_name || c.courseName,
            location: c.location,
            city: c.location?.city,
            state: c.location?.state,
            distance,
          };
        });

        courses.sort((a: CourseBasic, b: CourseBasic) => (a.distance || 999) - (b.distance || 999));
        setAvailableCourses(courses.slice(0, 5));
        console.log("📦 Loaded", courses.length, "cached courses");
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
      console.log("📦 loadData complete");
    }
  };

  const resetArrays = (hc: number) => {
    setScores(new Array(hc).fill(null));
    setFir(new Array(hc).fill(null));
    setGir(new Array(hc).fill(null));
    setDtpValues(new Array(hc).fill(null));
  };

  /* ================================================================ */
  /* COURSE & TEE HANDLERS                                            */
  /* ================================================================ */

  const handleSelectCourse = async (course: CourseBasic) => {
    console.log("🏌️ handleSelectCourse CALLED:", JSON.stringify(course).slice(0, 300));
    
    const rawCourseId = course.courseId || course.id;
    console.log("🏌️ rawCourseId:", rawCourseId, "type:", typeof rawCourseId);
    if (!rawCourseId) {
      console.log("🏌️ BAIL: no rawCourseId");
      return;
    }

    const courseId = typeof rawCourseId === "string" ? parseInt(rawCourseId, 10) : rawCourseId;
    console.log("🏌️ parsed courseId:", courseId);
    if (isNaN(courseId as number)) {
      console.log("🏌️ BAIL: courseId is NaN");
      return;
    }

    setLoadingCourse(true);

    try {
      console.log("🏌️ Calling loadFullCourseData...");
      const courseData = await loadFullCourseData(
        courseId as number,
        course.courseName || course.course_name,
        course.location
      );

      console.log("🏌️ loadFullCourseData returned:", courseData ? "data" : "null");
      if (courseData) {
        console.log("🏌️ courseName:", courseData.courseName);
        console.log("🏌️ tees:", JSON.stringify(courseData.tees, null, 2)?.slice(0, 500));
        
        setFullCourseData(courseData);
        const tees = extractTees(courseData.tees);
        console.log("🏌️ extractTees returned:", tees.length, "tees");

        // Fetch DTP info if registered
        if (isDtpRegistered) {
          const dtpInfo = await getDtpCourseInfo(courseId as number);
          setDtpCourseInfo(dtpInfo);
          console.log("📍 DTP course info:", dtpInfo);
        }

        if (tees.length > 0) {
          setAvailableTees(tees);
          setCurrentScreen("tee");
        } else {
          Alert.alert("No Tee Data", "Using default values.");
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
      } else {
        console.log("🏌️ courseData is null — showing error");
        Alert.alert("Error", "Could not load course data.");
      }
    } catch (error) {
      console.error("🏌️ Error loading course:", error);
      Alert.alert("Error", "Failed to load course data.");
    } finally {
      setLoadingCourse(false);
    }
  };

  const handleSelectTee = (tee: TeeOption) => {
    console.log("🏌️ handleSelectTee:", tee.tee_name);
    if (tee.holes && tee.holes.length >= holesCount) {
      setSelectedTee(tee);
    } else {
      const filledHoles = [];
      for (let i = 0; i < holesCount; i++) {
        filledHoles.push(tee.holes?.[i] || { par: 4, yardage: 400 });
      }
      setSelectedTee({ ...tee, holes: filledHoles });
    }
    resetArrays(holesCount);
    setCurrentScreen("scorecard");
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
  /* AUTO-DETECT FROM SCORES                                          */
  /* ================================================================ */

  /** Auto-detect hole-in-one when any hole is scored as 1 */
  useEffect(() => {
    if (!selectedTee) return;

    const aceHoles: number[] = [];
    for (let i = 0; i < holesCount; i++) {
      if (scores[i] === 1) aceHoles.push(i + 1); // 1-indexed hole number
    }

    if (aceHoles.length > 0) {
      if (!hadHoleInOne) {
        setHadHoleInOne(true);
        setHoleInOneHoleNumber(String(aceHoles[0]));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "Hole-in-One Detected! 🎯",
          `Hole ${aceHoles[0]}! Select a partner to verify.`,
          [{ text: "Got It" }]
        );
      } else {
        // Update hole number if they change which hole has the ace
        setHoleInOneHoleNumber(String(aceHoles[0]));
      }
    } else if (hadHoleInOne) {
      // All aces removed — reset
      setHadHoleInOne(false);
      setHoleInOneHoleNumber("");
      setSelectedVerifier(null);
    }
  }, [scores, holesCount, selectedTee]);

  /** Auto-calculate birdie/eagle/albatross counts for display */
  const scoreCounts = useMemo(() => {
    if (!selectedTee) return { birdies: 0, eagles: 0, albatross: 0, aces: 0 };
    let birdies = 0, eagles = 0, albatross = 0, aces = 0;
    for (let i = 0; i < holesCount; i++) {
      const score = scores[i];
      const par = selectedTee.holes[i]?.par || 4;
      if (score === null) continue;
      if (score === 1) aces++;
      const diff = score - par;
      if (diff === -1) birdies++;
      else if (diff === -2) eagles++;
      else if (diff <= -3) albatross++;
    }
    return { birdies, eagles, albatross, aces };
  }, [scores, selectedTee, holesCount]);

  /* ================================================================ */
  /* SCORE INPUT HANDLERS                                             */
  /* ================================================================ */

  const handleScoreChange = useCallback((holeIndex: number, value: string) => {
    const numValue = value === "" ? null : parseInt(value, 10);
    if (numValue !== null && (isNaN(numValue) || numValue < 1 || numValue > 15)) return;
    setScores((prev) => { const next = [...prev]; next[holeIndex] = numValue; return next; });
  }, []);

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

  const handleDtpChange = useCallback((holeIndex: number, value: string) => {
    // Allow digits and decimal point, max 4 chars (e.g. "12.5")
    if (value !== "" && !/^\d{0,3}\.?\d{0,1}$/.test(value)) return;
    setDtpValues((prev) => { const next = [...prev]; next[holeIndex] = value || null; return next; });
  }, []);

  /* ================================================================ */
  /* ROUND DESCRIPTION & @MENTIONS                                    */
  /* ================================================================ */

  const renderDescriptionWithMentions = () => {
    const mentionRegex = /@([\w\s]+?)(?=\s{2,}|$|@|\n)/g;
    const parts: { text: string; isMention: boolean }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(roundDescription)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: roundDescription.slice(lastIndex, match.index), isMention: false });
      }
      const isValidMention = selectedMentions.includes(match[0].trim());
      parts.push({ text: match[0], isMention: isValidMention });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < roundDescription.length) {
      parts.push({ text: roundDescription.slice(lastIndex), isMention: false });
    }

    return parts.map((part, index) =>
      part.isMention
        ? <Text key={index} style={{ fontSize: 16, fontWeight: "700", color: "#0D5C3A" }}>{part.text}</Text>
        : <Text key={index}>{part.text}</Text>
    );
  };

  const handleDescriptionChange = (text: string) => {
    setRoundDescription(text);

    const cleanedMentions = selectedMentions.filter((m) => text.includes(m));
    if (cleanedMentions.length !== selectedMentions.length) {
      setSelectedMentions(cleanedMentions);
    }

    const lastAtIndex = text.lastIndexOf("@");
    if (lastAtIndex === -1) { setShowAutocomplete(false); return; }

    const afterAt = text.slice(lastAtIndex + 1);
    if (afterAt.endsWith("  ") || (afterAt.includes("@") && afterAt.indexOf("@") > 0)) {
      setShowAutocomplete(false);
      return;
    }

    const words = text.split(/\s+/);
    const lastWord = words[words.length - 1];
    if (!lastWord.startsWith("@")) { setShowAutocomplete(false); return; }

    const searchText = lastWord.slice(1);
    setCurrentMention(searchText);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (searchText.length >= 1) {
        const results = allPartners.filter((p) =>
          p.displayName.toLowerCase().includes(searchText.toLowerCase())
        );
        setAutocompleteResults(results.map((p) => ({ ...p, type: "partner" })));
        setShowAutocomplete(results.length > 0);
      } else {
        setShowAutocomplete(false);
      }
    }, 300);
  };

  const handleSelectMention = (item: any) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const lastAtIndex = roundDescription.lastIndexOf("@");
    const beforeAt = roundDescription.slice(0, lastAtIndex);
    const afterMention = roundDescription.slice(lastAtIndex + 1 + currentMention.length);
    const mentionText = `@${item.displayName}`;

    setRoundDescription(`${beforeAt}${mentionText} ${afterMention}`);
    if (!selectedMentions.includes(mentionText)) {
      setSelectedMentions([...selectedMentions, mentionText]);
    }
    setShowAutocomplete(false);
  };

  /* ================================================================ */
  /* SCORECARD IMAGE                                                  */
  /* ================================================================ */

  const pickScorecardImage = async () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      soundPlayer.play("postThought");
      setScorecardImageUri(result.assets[0].uri);
    }
  };

  /* ================================================================ */
  /* CLOSE HANDLER                                                    */
  /* ================================================================ */

  const handleClose = () => {
    const hasData =
      scorecardImageUri !== null ||
      fullCourseData !== null ||
      scores.some((s) => s !== null) ||
      roundDescription.trim() !== "";

    if (hasData) {
      soundPlayer.play("click");
      Alert.alert("Discard Changes?", "Your progress will be lost.", [
        { text: "Keep Editing", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            soundPlayer.play("error");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            router.back();
          },
        },
      ]);
    } else {
      soundPlayer.play("click");
      router.back();
    }
  };

  /* ================================================================ */
  /* SUBMIT                                                           */
  /* ================================================================ */

  const handleSubmit = async () => {
    if (!currentUserId || !selectedTee || !fullCourseData || !userData) return;

    setSubmitting(true);
    setSubmittingMessage("Submitting score...");
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Validations
    if (!canPost) {
      soundPlayer.play("error"); setSubmitting(false);
      Alert.alert("Verification Pending", "Posting unlocks once your account is verified.");
      return;
    }
    if (!isEmailVerified()) {
      soundPlayer.play("error"); setSubmitting(false);
      Alert.alert("Email Not Verified", EMAIL_VERIFICATION_MESSAGE);
      return;
    }
    const { allowed, remainingSeconds } = await checkRateLimit("score");
    if (!allowed) {
      soundPlayer.play("error"); setSubmitting(false);
      Alert.alert("Please Wait", getRateLimitMessage("score", remainingSeconds));
      return;
    }

    // Check all scores entered
    const activeScores = scores.slice(0, holesCount);
    const missingScores = activeScores.filter((s) => s === null);
    if (missingScores.length > 0) {
      soundPlayer.play("error"); setSubmitting(false);
      Alert.alert("Incomplete Scorecard", `Please enter scores for all ${holesCount} holes.`);
      return;
    }

    if (!scorecardImageUri) {
      soundPlayer.play("error"); setSubmitting(false);
      Alert.alert("Scorecard Required", "Please upload a photo of your scorecard.");
      return;
    }

    if (hadHoleInOne) {
      if (!holeInOneHoleNumber.trim()) {
        soundPlayer.play("error"); setSubmitting(false);
        Alert.alert("Missing Hole Number", "Please enter the hole number.");
        return;
      }
      if (!selectedVerifier) {
        soundPlayer.play("error"); setSubmitting(false);
        Alert.alert("Select Verifier", "Please select a partner to verify your hole-in-one.");
        return;
      }
    }

    try {
      // Upload scorecard image
      setSubmittingMessage("Compressing scorecard...");
      const compressed = await manipulateAsync(
        scorecardImageUri,
        [{ resize: { width: 1080 } }],
        { compress: 0.7, format: SaveFormat.JPEG }
      );

      setSubmittingMessage("Uploading scorecard...");
      const response = await fetch(compressed.uri);
      const blob = await response.blob();
      const imagePath = `scorecards/${currentUserId}/${Date.now()}.jpg`;
      const imageRef = ref(storage, imagePath);
      await uploadBytes(imageRef, blob);
      const imageUrl = await getDownloadURL(imageRef);

      // Extract tagged partners from description
      const mentionRegex = /@([\w\s]+?)(?=\s{2,}|$|@|\n)/g;
      const mentions = roundDescription.match(mentionRegex) || [];
      const extractedPartners: Partner[] = [];

      for (const mention of mentions) {
        const mentionText = mention.substring(1).trim();
        const matched = allPartners.find(
          (p) => p.displayName.toLowerCase() === mentionText.toLowerCase()
        );
        if (matched && !extractedPartners.find((p) => p.userId === matched.userId)) {
          extractedPartners.push(matched);
        }
      }

      // Geohash
      let geohash = null;
      if (fullCourseData.location?.latitude && fullCourseData.location?.longitude) {
        geohash = encodeGeohash(fullCourseData.location.latitude, fullCourseData.location.longitude, 5);
      }

      setSubmittingMessage("Saving score...");

      const grossScore = activeScores.reduce((sum: number, s) => sum + (s || 0), 0);
      const totalPar = getTotalPar(selectedTee.holes, holesCount);
      const handicapIndex = parseFloat(userData.handicap) || 0;
      const netScore = getTotalAdjScore(adjScores.slice(0, holesCount)) ?? grossScore - courseHandicap;
      const courseId = fullCourseData.courseId || fullCourseData.id;
      const courseName = fullCourseData.courseName || fullCourseData.course_name;

      // Calculate birdie/eagle/albatross counts from hole-by-hole data
      let birdieCount = 0, eagleCount = 0, albatrossCount = 0;
      for (let i = 0; i < holesCount; i++) {
        const score = activeScores[i];
        const par = selectedTee.holes[i]?.par || 4;
        if (score === null) continue;
        const diff = score - par;
        if (diff === -1) birdieCount++;
        else if (diff === -2) eagleCount++;
        else if (diff <= -3) albatrossCount++;
      }

      // Calculate stats
      const fairways = countFairways(fir, selectedTee.holes, holesCount);
      const greens = countGreens(gir, holesCount);
      const hasFirData = fir.some((v) => v !== null);
      const hasGirData = gir.some((v) => v !== null);

      // Score data — Cloud Function will create thought, update leaderboards, award badges
      const scoreData: any = {
        userId: currentUserId,
        userName: userData.displayName || "Unknown",
        courseId: courseId,
        courseName: courseName,
        holeCount: holesCount,
        grossScore: grossScore,
        netScore: netScore,
        par: selectedTee.par_total,
        tee: selectedTee.tee_name,
        teeYardage: selectedTee.total_yards || null,
        courseRating: selectedTee.course_rating,
        slopeRating: selectedTee.slope_rating,
        handicapIndex: handicapIndex,
        courseHandicap: courseHandicap,
        holeScores: activeScores,
        adjScores: adjScores.slice(0, holesCount),
        birdies: birdieCount,
        eagles: eagleCount,
        albatross: albatrossCount,
        hadHoleInOne: hadHoleInOne,
        roundDescription: roundDescription.trim(),
        scorecardImageUrl: imageUrl,
        location: fullCourseData.location || undefined,
        regionKey: userRegionKey,
        geohash: geohash,
        createdAt: serverTimestamp(),
        taggedPartners: extractedPartners.map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
        })),
      };

      // Stats
      if (hasFirData || hasGirData) {
        scoreData.holeStats = { fir: fir.slice(0, holesCount), gir: gir.slice(0, holesCount) };
        if (hasFirData) { scoreData.fairwaysHit = fairways.hit; scoreData.fairwaysPossible = fairways.possible; }
        if (hasGirData) { scoreData.greensInRegulation = greens.hit; }
      }

      if (hadHoleInOne) {
        scoreData.holeNumber = parseInt(holeInOneHoleNumber);
      }

      // DTP measurements (if any entered)
      if (isDtpRegistered && dtpValues.some((v) => v !== null && v !== "")) {
        const dtpMeasurements: Record<string, number> = {};
        for (let i = 0; i < holesCount; i++) {
          if (dtpValues[i] && dtpEligibleHoles.has(i)) {
            const distance = parseFloat(dtpValues[i]!);
            if (!isNaN(distance) && distance > 0) {
              dtpMeasurements[String(i + 1)] = distance; // 1-indexed hole number as key
            }
          }
        }
        if (Object.keys(dtpMeasurements).length > 0) {
          scoreData.dtpMeasurements = dtpMeasurements;
        }
      }

      const scoreRef = await addDoc(collection(db, "scores"), scoreData);
      console.log("✅ Score created:", scoreRef.id);

      // Hole-in-one verification document
      if (hadHoleInOne && selectedVerifier) {
        console.log("🏌️ Creating hole-in-one verification document...");
        await addDoc(collection(db, "hole_in_ones"), {
          userId: currentUserId,
          userName: userData.displayName || "Unknown",
          userAvatar: userData.avatar || null,
          verifierId: selectedVerifier.userId,
          verifierName: selectedVerifier.displayName,
          scoreId: scoreRef.id,
          courseId: courseId,
          courseName: courseName,
          holeNumber: parseInt(holeInOneHoleNumber),
          holeCount: holesCount,
          status: "pending",
          scorecardImageUrl: imageUrl,
          createdAt: serverTimestamp(),
        });
        console.log("✅ Hole-in-one document created");
      }

      // Update user location
      try {
        setSubmittingMessage("Updating location...");
        const { checkAndUpdateLocation, incrementLocationScoreCount } = await import("@/utils/locationHelpers");
        await checkAndUpdateLocation(currentUserId, {
          courseCity: fullCourseData.location?.city || "",
          courseState: fullCourseData.location?.state || "",
          courseLatitude: fullCourseData.location?.latitude,
          courseLongitude: fullCourseData.location?.longitude,
          onScoreSubmission: true,
        });
        await incrementLocationScoreCount(currentUserId);
      } catch (locationErr) {
        console.error("Location update failed:", locationErr);
      }

      // NOTE: User career stats (totalRounds, totalBirdies, etc.) are now
      // handled by the Cloud Function onScoreCreated trigger on scores/{scoreId}

      // Update course stats
      try {
        const courseDocRef = doc(db, "courses", String(courseId));
        const courseUpdates: any = {};
        if (birdieCount > 0) courseUpdates["stats.birdies"] = increment(birdieCount);
        if (eagleCount > 0) courseUpdates["stats.eagles"] = increment(eagleCount);
        if (albatrossCount > 0) courseUpdates["stats.albatross"] = increment(albatrossCount);

        if (Object.keys(courseUpdates).length > 0) {
          await updateDoc(courseDocRef, courseUpdates);
        }
      } catch (courseErr) {
        console.error("Course stats update failed:", courseErr);
      }

      await updateRateLimitTimestamp("score");

      console.log("📬 Score submitted - Cloud Functions handle post creation, leaderboards, badges, and notifications");

      soundPlayer.play("achievement");
      setSubmitting(false);

      const alertMessage = hadHoleInOne
        ? `Your hole-in-one is pending verification from ${selectedVerifier!.displayName}.`
        : "Your round has been logged!";

      Alert.alert(
        hadHoleInOne ? "Pending Verification 🎯" : "Score Posted! ⛳",
        alertMessage,
        [{ text: "OK", onPress: () => router.push("/clubhouse") }]
      );
    } catch (error) {
      console.error("Submit error:", error);
      soundPlayer.play("error");
      setSubmitting(false);
      Alert.alert("Error", "Failed to submit score. Please try again.");
    }
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

  // ===== Course Selection =====
  if (currentScreen === "course") {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleClose}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Post Score</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Holes toggle */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {([9, 18] as const).map((count) => (
              <TouchableOpacity
                key={count}
                style={[
                  styles.teeOption,
                  { flex: 1, alignItems: "center" },
                  holeCount === count && { borderColor: "#0D5C3A", backgroundColor: "#E8F5E9" },
                ]}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setHoleCount(count);
                  resetArrays(count);
                }}
              >
                <Text
                  style={[
                    styles.teeOptionName,
                    holeCount === count && { color: "#0D5C3A", fontWeight: "900" },
                  ]}
                >
                  {count} Holes
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <CourseSelector
          availableCourses={availableCourses}
          isRestricted={false}
          userLocation={userLocation}
          onSelectCourse={handleSelectCourse}
          onBack={() => router.back()}
        />
      </View>
    );
  }

  // ===== Tee Selection =====
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
          handicapIndex={parseFloat(userData?.handicap) || undefined}
          onSelectTee={handleSelectTee}
          onBack={handleChangeCourse}
        />
      </View>
    );
  }

  // ===== Scorecard Screen =====
  if (!selectedTee) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Text style={styles.noCourseText}>Something went wrong.</Text>
        <TouchableOpacity style={styles.searchCourseButton} onPress={handleChangeCourse}>
          <Text style={styles.searchCourseButtonText}>Start Over</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const filteredVerifierPartners = allPartners.filter((p) =>
    p.displayName.toLowerCase().includes(verifierSearchQuery.toLowerCase())
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleClose}>
          <Ionicons name="close" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scorecard</Text>
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          <Text style={styles.submitButtonText}>{submitting ? "..." : "Submit"}</Text>
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
            <Text style={styles.logoText}>⛳</Text>
          </View>
          <View style={styles.scorecardInfo}>
            <Text style={styles.leagueName}>Post Score</Text>
            <TouchableOpacity onPress={handleChangeCourse}>
              <Text style={styles.courseName}>
                {fullCourseData?.courseName || fullCourseData?.course_name}{" "}
                <Ionicons name="pencil" size={12} color="#C8E6C9" />
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleChangeTee}>
              <Text style={styles.teeInfo}>
                {selectedTee.tee_name} • {selectedTee.total_yards?.toLocaleString()} yds{" "}
                <Ionicons name="pencil" size={10} color="#A5D6A7" />
              </Text>
            </TouchableOpacity>
            <Text style={styles.weekText}>{holesCount} Holes</Text>
          </View>
        </View>

        {/* Player Info */}
        <View style={styles.playerInfo}>
          <View style={styles.playerRow}>
            <Text style={styles.playerLabel}>Player</Text>
            <Text style={styles.playerValue}>{userData?.displayName || "Unknown"}</Text>
          </View>
          <View style={styles.playerRow}>
            <Text style={styles.playerLabel}>Handicap Index</Text>
            <Text style={styles.playerValue}>
              {(parseFloat(userData?.handicap) || 0).toFixed(1)}
            </Text>
          </View>
          <View style={styles.playerRow}>
            <Text style={styles.playerLabel}>Course Handicap</Text>
            <Text style={styles.playerValue}>{courseHandicap}</Text>
          </View>
          <View style={styles.playerRow}>
            <Text style={styles.playerLabel}>Date</Text>
            <Text style={styles.playerValue}>
              {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
          showHandicap={true}
          fir={fir}
          gir={gir}
          onScoreChange={handleScoreChange}
          onFirToggle={handleFirToggle}
          onGirToggle={handleGirToggle}
          dtpEligibleHoles={dtpEligibleHoles}
          dtpValues={dtpValues}
          onDtpChange={handleDtpChange}
          dtpCurrentDistance={dtpCourseInfo?.currentDistance}
          dtpCurrentHolderName={dtpCourseInfo?.currentHolderName}
        />

        {/* Score Summary */}
        <ScoreSummary
          scores={scores}
          adjScores={adjScores}
          holes={selectedTee.holes}
          holesCount={holesCount}
          courseHandicap={courseHandicap}
          showHandicap={true}
          fir={fir}
          gir={gir}
        />

        {/* ===== ROUND HIGHLIGHTS ===== */}
        {(scoreCounts.birdies > 0 || scoreCounts.eagles > 0 || scoreCounts.albatross > 0 || scoreCounts.aces > 0) && (
          <View style={styles.playerInfo}>
            <Text style={[styles.playerLabel, { fontSize: 16, fontWeight: "900", color: "#0D5C3A", marginBottom: 12 }]}>
              Round Highlights 🏆
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {scoreCounts.aces > 0 && (
                <View style={{ backgroundColor: "#FFD700", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" }}>
                  <Text style={{ fontSize: 20, fontWeight: "900", color: "#333" }}>{scoreCounts.aces}</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#555" }}>Ace{scoreCounts.aces > 1 ? "s" : ""} 🎯</Text>
                </View>
              )}
              {scoreCounts.albatross > 0 && (
                <View style={{ backgroundColor: "#E1BEE7", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" }}>
                  <Text style={{ fontSize: 20, fontWeight: "900", color: "#333" }}>{scoreCounts.albatross}</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#555" }}>Albatross</Text>
                </View>
              )}
              {scoreCounts.eagles > 0 && (
                <View style={{ backgroundColor: "#FFF9C4", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" }}>
                  <Text style={{ fontSize: 20, fontWeight: "900", color: "#333" }}>{scoreCounts.eagles}</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#555" }}>Eagle{scoreCounts.eagles > 1 ? "s" : ""}</Text>
                </View>
              )}
              {scoreCounts.birdies > 0 && (
                <View style={{ backgroundColor: "#FFCDD2", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" }}>
                  <Text style={{ fontSize: 20, fontWeight: "900", color: "#333" }}>{scoreCounts.birdies}</Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#555" }}>Birdie{scoreCounts.birdies > 1 ? "s" : ""}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ===== HOLE-IN-ONE VERIFICATION ===== */}
        {hadHoleInOne && (
          <View style={styles.playerInfo}>
            <Text style={[styles.playerLabel, { fontSize: 16, fontWeight: "900", color: "#0D5C3A", marginBottom: 4 }]}>
              Hole-in-One Verification 🎯
            </Text>
            <Text style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
              Auto-detected from your scorecard — select a partner to verify.
            </Text>

            <View style={styles.playerRow}>
              <Text style={styles.playerLabel}>Hole</Text>
              <Text style={[styles.playerValue, { fontWeight: "900" }]}>{holeInOneHoleNumber}</Text>
            </View>

            <Text style={[styles.playerLabel, { marginTop: 12 }]}>Select Verifier *</Text>
            <TouchableOpacity
              style={[styles.teeOption, { marginTop: 8, alignItems: "center" }]}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowVerifierModal(true);
              }}
            >
              <Text style={[styles.teeOptionName, selectedVerifier && { color: "#0D5C3A", fontWeight: "900" }]}>
                {selectedVerifier ? `✓ ${selectedVerifier.displayName}` : "Tap to Select Partner"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ===== ROUND DESCRIPTION ===== */}
        <View style={styles.playerInfo}>
          <Text style={[styles.playerLabel, { fontSize: 16, fontWeight: "900", color: "#0D5C3A", marginBottom: 12 }]}>
            How was your round?
          </Text>

          <View style={{ position: "relative" }}>
            <TextInput
              style={[
                styles.searchInput,
                { minHeight: 100, textAlignVertical: "top", paddingTop: 14 },
                roundDescription && { color: "transparent" },
              ]}
              placeholder="Share details... (mention partners with @)"
              placeholderTextColor="#999"
              multiline
              maxLength={MAX_CHARACTERS}
              value={roundDescription}
              onChangeText={handleDescriptionChange}
            />
            {roundDescription ? (
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, padding: 14, paddingTop: 15 }} pointerEvents="none">
                <Text style={{ fontSize: 16, color: "#333" }}>
                  {renderDescriptionWithMentions()}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={{ fontSize: 12, color: "#999", textAlign: "right", marginTop: 4 }}>
            {roundDescription.length}/{MAX_CHARACTERS}
          </Text>

          {showAutocomplete && autocompleteResults.length > 0 && (
            <View style={{ backgroundColor: "#FFF", borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: "#E0E0E0", maxHeight: 200 }}>
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {autocompleteResults.map((item, idx) => (
                  <TouchableOpacity
                    key={`${item.userId}-${idx}`}
                    style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" }}
                    onPress={() => handleSelectMention(item)}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#0D5C3A" }}>
                      @{item.displayName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* ===== SCORECARD IMAGE ===== */}
        <View style={styles.playerInfo}>
          <Text style={[styles.playerLabel, { fontSize: 16, fontWeight: "900", color: "#0D5C3A", marginBottom: 12 }]}>
            Upload Scorecard *
          </Text>

          <TouchableOpacity
            style={{
              height: 200, borderRadius: 12, overflow: "hidden",
              backgroundColor: "#F5F5F5", borderWidth: 2, borderColor: "#0D5C3A", borderStyle: "dashed",
            }}
            onPress={pickScorecardImage}
          >
            {scorecardImageUri ? (
              <Image source={{ uri: scorecardImageUri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 48, marginBottom: 8 }}>📸</Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#0D5C3A" }}>
                  Tap to Upload Scorecard
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {scorecardImageUri && (
            <TouchableOpacity
              style={{ marginTop: 8, alignSelf: "center", paddingVertical: 8, paddingHorizontal: 16, backgroundColor: "#0D5C3A", borderRadius: 8 }}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setScorecardImageUri(null);
              }}
            >
              <Text style={{ color: "#FFF", fontWeight: "600", fontSize: 14 }}>✕ Change Photo</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* ===== VERIFIER MODAL ===== */}
      <Modal
        visible={showVerifierModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowVerifierModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%", paddingBottom: 40 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#E0E0E0" }}>
              <Text style={{ fontSize: 18, fontWeight: "900", color: "#0D5C3A" }}>Select Verifier</Text>
              <TouchableOpacity onPress={() => { soundPlayer.play("click"); setShowVerifierModal(false); }}>
                <Text style={{ fontSize: 24, color: "#666", fontWeight: "600" }}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={{ margin: 16, padding: 12, backgroundColor: "#F5F5F5", borderRadius: 10, fontSize: 16 }}
              placeholder="Search partners..."
              placeholderTextColor="#999"
              value={verifierSearchQuery}
              onChangeText={setVerifierSearchQuery}
            />

            <FlatList
              data={filteredVerifierPartners}
              keyExtractor={(item) => item.userId}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" }}
                  onPress={() => {
                    soundPlayer.play("click");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedVerifier(item);
                    setShowVerifierModal(false);
                  }}
                >
                  {item.avatar ? (
                    <Image source={{ uri: item.avatar }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12 }} />
                  ) : (
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#0D5C3A", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                      <Text style={{ color: "#FFF", fontSize: 18, fontWeight: "700" }}>{item.displayName.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: "#333" }}>{item.displayName}</Text>
                  {selectedVerifier?.userId === item.userId && (
                    <Text style={{ fontSize: 20, color: "#0D5C3A", fontWeight: "900" }}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ textAlign: "center", color: "#999", fontSize: 14, fontStyle: "italic", margin: 20 }}>
                  No partners found.
                </Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* ===== SUBMITTING OVERLAY ===== */}
      {submitting && (
        <View style={{
          ...Platform.select({ ios: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, android: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } }),
          backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", zIndex: 1000,
        }}>
          <View style={{ backgroundColor: "#FFF", borderRadius: 16, padding: 24, alignItems: "center", minWidth: 200 }}>
            <ActivityIndicator size="large" color="#0D5C3A" />
            <Text style={{ marginTop: 12, fontSize: 16, fontWeight: "700", color: "#0D5C3A" }}>{submittingMessage}</Text>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}