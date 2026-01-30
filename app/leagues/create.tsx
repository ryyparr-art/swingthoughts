/**
 * League Creation Wizard
 * 
 * 7-step wizard for commissioners to create their league:
 * 1. Basic Info (name, description, region)
 * 2. Type & Format (live/sim, stroke/2v2)
 * 3. Round Settings (holes, courses)
 * 4. Handicap System
 * 5. Schedule
 * 6. Elevated Events
 * 7. Review & Create
 */

import { auth, db } from "@/constants/firebaseConfig";
import { findRegionByKey } from "@/constants/regions";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
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
/* CONSTANTS                                                        */
/* ================================================================ */

const TOTAL_STEPS = 7;

const DAYS_OF_WEEK = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

const SIM_PLATFORMS = [
  { key: "trackman", label: "TrackMan" },
  { key: "fullswing", label: "Full Swing" },
  { key: "foresight", label: "Foresight" },
  { key: "topgolf", label: "TopGolf" },
  { key: "golfzon", label: "Golfzon" },
  { key: "aboutgolf", label: "aboutGolf" },
  { key: "other", label: "Other" },
  { key: "notsure", label: "Not Sure" },
];

// Helper functions for tee time
const formatTeeTime = (time: string): string => {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
};

const parseTimeToDate = (time: string): Date => {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const STEP_TITLES = [
  "Name Your League",
  "League Type",
  "Round Setup",
  "Handicap & Scoring",
  "Season Schedule",
  "Playoffs & Special Events",
  "Review Your League",
];

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface LeagueFormData {
  // Step 1
  name: string;
  description: string;
  regionKey: string;
  regionName: string;
  // Step 2
  leagueType: "live" | "sim";
  simPlatform: string | null;
  format: "stroke" | "2v2";
  // Step 3
  holes: 9 | 18;
  courseRestriction: boolean;
  allowedCourses: { courseId: number; courseName: string }[];
  nineHoleOption: "front" | "back" | "either";
  // Step 4
  handicapSystem: "swingthoughts" | "league_managed";
  // Step 5
  startDate: Date | null;
  frequency: "weekly" | "biweekly";
  scoreDeadline: string;
  numberOfWeeks: number;
  playDay: string | null;
  teeTime: string | null;
  // Step 6
  hasElevatedEvents: boolean;
  elevatedWeeks: number[];
  elevatedMultiplier: number;
}

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function CreateLeague() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUserId = auth.currentUser?.uid;

  // State
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [checkingName, setCheckingName] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);

  // Date picker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Course picker modal
  const [showCoursePicker, setShowCoursePicker] = useState(false);
  const [courseSearchQuery, setCourseSearchQuery] = useState("");
  const [courseSearchResults, setCourseSearchResults] = useState<any[]>([]);
  const [searchingCourses, setSearchingCourses] = useState(false);

  // Form data persists across steps
  const [formData, setFormData] = useState<LeagueFormData>({
    name: "",
    description: "",
    regionKey: "",
    regionName: "",
    leagueType: "live",
    simPlatform: null,
    format: "stroke",
    holes: 18,
    courseRestriction: false,
    allowedCourses: [],
    nineHoleOption: "either",
    handicapSystem: "swingthoughts",
    startDate: null,
    frequency: "weekly",
    scoreDeadline: "sunday",
    numberOfWeeks: 10,
    playDay: null,
    teeTime: null,
    hasElevatedEvents: false,
    elevatedWeeks: [],
    elevatedMultiplier: 2,
  });

  /* ================================================================ */
  /* INITIALIZATION                                                  */
  /* ================================================================ */

  useEffect(() => {
    loadCommissionerData();
  }, []);

  const loadCommissionerData = async () => {
    if (!currentUserId) {
      router.back();
      return;
    }

    try {
      const userDoc = await getDoc(doc(db, "users", currentUserId));
      if (!userDoc.exists() || !userDoc.data().isApprovedCommissioner) {
        Alert.alert("Not Authorized", "You must be an approved commissioner to create a league.");
        router.back();
        return;
      }

      // Check existing league
      const existingLeague = await getDocs(
        query(collection(db, "leagues"), where("hostUserId", "==", currentUserId))
      );
      if (!existingLeague.empty) {
        Alert.alert("League Exists", "You have already created a league.");
        router.back();
        return;
      }

      // Pre-fill from application
      const userData = userDoc.data();
      let regionKey = userData.regionKey || "";
      let regionName = "";

      const applicationsSnap = await getDocs(
        query(
          collection(db, "league_applications"),
          where("userId", "==", currentUserId),
          where("status", "==", "approved")
        )
      );

      if (!applicationsSnap.empty) {
        const appData = applicationsSnap.docs[0].data();
        regionKey = appData.regionKey || regionKey;
        regionName = appData.regionName || "";

        setFormData((prev) => ({
          ...prev,
          name: appData.leagueName || "",
          description: appData.description || "",
          regionKey,
          regionName,
          leagueType: appData.leagueType || "live",
          format: appData.format || "stroke",
        }));
      } else {
        const region = findRegionByKey(regionKey);
        regionName = region?.displayName || regionKey;
        setFormData((prev) => ({ ...prev, regionKey, regionName }));
      }

      setLoading(false);
    } catch (error) {
      console.error("Error loading data:", error);
      Alert.alert("Error", "Failed to load. Please try again.");
      router.back();
    }
  };

  /* ================================================================ */
  /* NAME CHECK                                                      */
  /* ================================================================ */

  const checkNameAvailability = async (name: string) => {
    if (name.trim().length < 3) {
      setNameAvailable(null);
      return;
    }

    setCheckingName(true);
    try {
      const leaguesSnap = await getDocs(
        query(collection(db, "leagues"), where("nameLower", "==", name.trim().toLowerCase()))
      );
      setNameAvailable(leaguesSnap.empty);
    } catch (error) {
      setNameAvailable(null);
    }
    setCheckingName(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.name.trim().length >= 3) {
        checkNameAvailability(formData.name);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.name]);

  /* ================================================================ */
  /* VALIDATION                                                      */
  /* ================================================================ */

  const isStepValid = (): boolean => {
    switch (currentStep) {
      case 1:
        return formData.name.trim().length >= 3 && nameAvailable === true && formData.regionKey.length > 0;
      case 2:
        return formData.leagueType === "live" || (formData.leagueType === "sim" && !!formData.simPlatform);
      case 3:
        return !formData.courseRestriction || formData.allowedCourses.length > 0;
      case 4:
        return true;
      case 5:
        return formData.startDate !== null && formData.numberOfWeeks >= 1;
      case 6:
        return !formData.hasElevatedEvents || formData.elevatedWeeks.length > 0;
      case 7:
        return true;
      default:
        return false;
    }
  };

  /* ================================================================ */
  /* HANDLERS                                                        */
  /* ================================================================ */

  const handleBack = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (currentStep === 1) {
      Alert.alert("Exit Creation?", "Your progress will not be saved.", [
        { text: "Cancel", style: "cancel" },
        { text: "Exit", style: "destructive", onPress: () => router.back() },
      ]);
    } else {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleContinue = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleCreateLeague();
    }
  };

  const handleCreateLeague = async () => {
    if (!currentUserId) return;

    setCreating(true);
    try {
      const startDate = formData.startDate!;
      const weeksToAdd = formData.frequency === "weekly" ? formData.numberOfWeeks : formData.numberOfWeeks * 2;
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + weeksToAdd * 7);

      // Extract hashtags from name and description for search
      const extractHashtags = (text: string): string[] => {
        const matches = text.match(/#[a-zA-Z0-9_]+/g);
        if (!matches) return [];
        return [...new Set(matches.map(tag => tag.toLowerCase()))];
      };

      const nameHashtags = extractHashtags(formData.name);
      const descHashtags = extractHashtags(formData.description);
      const allHashtags = [...new Set([...nameHashtags, ...descHashtags])];

      // Create searchable keywords from league name (for non-hashtag search)
      const nameWords = formData.name
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length >= 2);

      const leagueData = {
        name: formData.name.trim(),
        nameLower: formData.name.trim().toLowerCase(),
        description: formData.description.trim(),
        regionKey: formData.regionKey,
        regionName: formData.regionName,
        leagueType: formData.leagueType,
        simPlatform: formData.leagueType === "sim" ? formData.simPlatform : null,
        format: formData.format,
        holes: formData.holes,
        courseRestriction: formData.courseRestriction,
        allowedCourses: formData.allowedCourses,
        nineHoleOption: formData.holes === 9 ? formData.nineHoleOption : null,
        handicapSystem: formData.format === "stroke" ? formData.handicapSystem : "league_managed",
        startDate,
        endDate,
        frequency: formData.frequency,
        scoreDeadline: formData.scoreDeadline,
        playDay: formData.playDay,
        teeTime: formData.teeTime,
        totalWeeks: formData.numberOfWeeks,
        currentWeek: 0,
        hasElevatedEvents: formData.hasElevatedEvents,
        elevatedWeeks: formData.elevatedWeeks,
        elevatedMultiplier: formData.elevatedMultiplier,
        hostUserId: currentUserId,
        status: "upcoming",
        isPublic: true,
        memberCount: 1,
        // Search fields
        hashtags: allHashtags,
        searchKeywords: nameWords,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const leagueRef = await addDoc(collection(db, "leagues"), leagueData);

      const userDoc = await getDoc(doc(db, "users", currentUserId));
      const userData = userDoc.data();

      await setDoc(doc(db, "leagues", leagueRef.id, "members", currentUserId), {
        leagueId: leagueRef.id,
        userId: currentUserId,
        displayName: userData?.displayName || "Commissioner",
        avatar: userData?.avatar || null,
        role: "commissioner",
        joinedAt: serverTimestamp(),
        totalPoints: 0,
        roundsPlayed: 0,
        wins: 0,
        currentRank: null,
      });

      soundPlayer.play("postThought");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert("League Created! 🏆", `"${formData.name}" is ready!`, [
        { text: "Go to League", onPress: () => router.replace("/leagues/home" as any) },
      ]);
    } catch (error) {
      console.error("Error creating league:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to create league.");
    }
    setCreating(false);
  };

  const updateFormData = (updates: Partial<LeagueFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  /* ================================================================ */
  /* COURSE SEARCH                                                   */
  /* ================================================================ */

  const searchCourses = async (query: string) => {
    if (query.trim().length < 2) {
      setCourseSearchResults([]);
      return;
    }

    setSearchingCourses(true);
    try {
      // Using the Golf Course API - adjust endpoint as needed
      const response = await fetch(
        `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(query)}&page_size=20`,
        {
          headers: {
            Authorization: `Key ${process.env.EXPO_PUBLIC_GOLF_COURSE_API_KEY || ""}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCourseSearchResults(data.courses || []);
      } else {
        setCourseSearchResults([]);
      }
    } catch (error) {
      console.error("Course search error:", error);
      setCourseSearchResults([]);
    }
    setSearchingCourses(false);
  };

  // Debounced course search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (courseSearchQuery.trim().length >= 2) {
        searchCourses(courseSearchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [courseSearchQuery]);

  const handleSelectCourse = (course: any) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const courseData = {
      courseId: course.id,
      courseName: course.name || course.club_name,
    };

    // Check if already selected
    const alreadySelected = formData.allowedCourses.some(
      (c) => c.courseId === courseData.courseId
    );

    if (!alreadySelected) {
      updateFormData({
        allowedCourses: [...formData.allowedCourses, courseData],
      });
    }
  };

  const handleRemoveCourse = (courseId: number) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateFormData({
      allowedCourses: formData.allowedCourses.filter((c) => c.courseId !== courseId),
    });
  };

  /* ================================================================ */
  /* STEP RENDERERS                                                  */
  /* ================================================================ */

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>League Name <Text style={styles.required}>*</Text></Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="e.g., Sunday Morning Skins"
            placeholderTextColor="#999"
            value={formData.name}
            onChangeText={(text) => {
              updateFormData({ name: text });
              setNameAvailable(null);
            }}
            maxLength={50}
          />
          {checkingName && <ActivityIndicator size="small" color="#0D5C3A" />}
          {!checkingName && nameAvailable === true && formData.name.length >= 3 && (
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
          )}
          {!checkingName && nameAvailable === false && (
            <Ionicons name="close-circle" size={20} color="#DC2626" />
          )}
        </View>
        {nameAvailable === false && <Text style={styles.errorText}>This name is already taken</Text>}
        <Text style={styles.helperText}>{formData.name.length}/50</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Tell potential members about your league..."
          placeholderTextColor="#999"
          value={formData.description}
          onChangeText={(text) => updateFormData({ description: text })}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />
        <Text style={styles.helperText}>{formData.description.length}/500</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Region</Text>
        <View style={styles.displayField}>
          <Ionicons name="location" size={20} color="#0D5C3A" />
          <Text style={styles.displayText}>{formData.regionName || "Not set"}</Text>
        </View>
        <Text style={styles.helperText}>Based on your commissioner application</Text>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>League Type <Text style={styles.required}>*</Text></Text>
        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.optionButton, formData.leagueType === "live" && styles.optionSelected]}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateFormData({ leagueType: "live", simPlatform: null });
            }}
          >
            <Text style={styles.optionEmoji}>☀️</Text>
            <Text style={[styles.optionText, formData.leagueType === "live" && styles.optionTextSelected]}>
              Live Golf
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, formData.leagueType === "sim" && styles.optionSelected]}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateFormData({ leagueType: "sim" });
            }}
          >
            <Text style={styles.optionEmoji}>🖥️</Text>
            <Text style={[styles.optionText, formData.leagueType === "sim" && styles.optionTextSelected]}>
              Simulator
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {formData.leagueType === "sim" && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Simulator Platform <Text style={styles.required}>*</Text></Text>
          <View style={styles.chipContainer}>
            {SIM_PLATFORMS.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.chip, formData.simPlatform === p.key && styles.chipSelected]}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updateFormData({ simPlatform: p.key });
                }}
              >
                <Text style={[styles.chipText, formData.simPlatform === p.key && styles.chipTextSelected]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Format <Text style={styles.required}>*</Text></Text>
        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.optionButton, formData.format === "stroke" && styles.optionSelected]}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateFormData({ format: "stroke" });
            }}
          >
            <Ionicons name="person" size={24} color={formData.format === "stroke" ? "#0D5C3A" : "#666"} />
            <Text style={[styles.optionText, formData.format === "stroke" && styles.optionTextSelected]}>
              Stroke Play
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, formData.format === "2v2" && styles.optionSelected]}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateFormData({ format: "2v2" });
            }}
          >
            <Ionicons name="people" size={24} color={formData.format === "2v2" ? "#0D5C3A" : "#666"} />
            <Text style={[styles.optionText, formData.format === "2v2" && styles.optionTextSelected]}>
              2v2 Teams
            </Text>
          </TouchableOpacity>
        </View>
        {formData.format === "2v2" && (
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={20} color="#0D5C3A" />
            <Text style={styles.infoText}>Team assignments are done after members join.</Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Holes Per Round <Text style={styles.required}>*</Text></Text>
        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.optionButton, formData.holes === 9 && styles.optionSelected]}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateFormData({ holes: 9 });
            }}
          >
            <Text style={[styles.optionNumber, formData.holes === 9 && styles.optionNumberSelected]}>9</Text>
            <Text style={[styles.optionText, formData.holes === 9 && styles.optionTextSelected]}>Holes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, formData.holes === 18 && styles.optionSelected]}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateFormData({ holes: 18 });
            }}
          >
            <Text style={[styles.optionNumber, formData.holes === 18 && styles.optionNumberSelected]}>18</Text>
            <Text style={[styles.optionText, formData.holes === 18 && styles.optionTextSelected]}>Holes</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Course Requirement</Text>
        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.optionButton, !formData.courseRestriction && styles.optionSelected]}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateFormData({ courseRestriction: false, allowedCourses: [] });
            }}
          >
            <Ionicons name="globe-outline" size={24} color={!formData.courseRestriction ? "#0D5C3A" : "#666"} />
            <Text style={[styles.optionText, !formData.courseRestriction && styles.optionTextSelected]}>
              Any Course
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, formData.courseRestriction && styles.optionSelected]}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateFormData({ courseRestriction: true });
            }}
          >
            <Ionicons name="flag-outline" size={24} color={formData.courseRestriction ? "#0D5C3A" : "#666"} />
            <Text style={[styles.optionText, formData.courseRestriction && styles.optionTextSelected]}>
              Specific
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {formData.courseRestriction && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Select Course(s) <Text style={styles.required}>*</Text></Text>
          
          {/* Selected courses */}
          {formData.allowedCourses.map((course) => (
            <View key={course.courseId} style={styles.selectedCourse}>
              <Text style={styles.selectedCourseText} numberOfLines={1}>{course.courseName}</Text>
              <TouchableOpacity onPress={() => handleRemoveCourse(course.courseId)}>
                <Ionicons name="close-circle" size={22} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ))}

          {/* Add course button */}
          <TouchableOpacity
            style={styles.addCourseButton}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setCourseSearchQuery("");
              setCourseSearchResults([]);
              setShowCoursePicker(true);
            }}
          >
            <Ionicons name="add-circle-outline" size={22} color="#0D5C3A" />
            <Text style={styles.addCourseText}>
              {formData.allowedCourses.length > 0 ? "Add Another Course" : "Search for Courses"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {formData.holes === 9 && formData.courseRestriction && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Which 9?</Text>
          <View style={styles.chipContainer}>
            {["front", "back", "either"].map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.chip, formData.nineHoleOption === opt && styles.chipSelected]}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updateFormData({ nineHoleOption: opt as any });
                }}
              >
                <Text style={[styles.chipText, formData.nineHoleOption === opt && styles.chipTextSelected]}>
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContent}>
      {formData.format === "stroke" ? (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Handicap System <Text style={styles.required}>*</Text></Text>
          <TouchableOpacity
            style={[styles.radioOption, formData.handicapSystem === "swingthoughts" && styles.radioSelected]}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateFormData({ handicapSystem: "swingthoughts" });
            }}
          >
            <View style={[styles.radioCircle, formData.handicapSystem === "swingthoughts" && styles.radioCircleSelected]}>
              {formData.handicapSystem === "swingthoughts" && <View style={styles.radioInner} />}
            </View>
            <View style={styles.radioContent}>
              <Text style={styles.radioTitle}>SwingThoughts Handicap</Text>
              <Text style={styles.radioDesc}>Use members' SwingThoughts handicaps automatically.</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.radioOption, formData.handicapSystem === "league_managed" && styles.radioSelected]}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateFormData({ handicapSystem: "league_managed" });
            }}
          >
            <View style={[styles.radioCircle, formData.handicapSystem === "league_managed" && styles.radioCircleSelected]}>
              {formData.handicapSystem === "league_managed" && <View style={styles.radioInner} />}
            </View>
            <View style={styles.radioContent}>
              <Text style={styles.radioTitle}>League Managed</Text>
              <Text style={styles.radioDesc}>You set and manage handicaps manually.</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.infoCardLarge}>
          <Ionicons name="information-circle" size={32} color="#0D5C3A" />
          <Text style={styles.infoCardTitle}>2v2 Scoring</Text>
          <Text style={styles.infoCardDesc}>
            2v2 leagues require manual handicap and scoring management for now.
          </Text>
        </View>
      )}
    </View>
  );

  const renderStep5 = () => {
    const calcEndDate = () => {
      if (!formData.startDate) return "—";
      const weeks = formData.frequency === "weekly" ? formData.numberOfWeeks : formData.numberOfWeeks * 2;
      const end = new Date(formData.startDate);
      end.setDate(end.getDate() + weeks * 7);
      return end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    return (
      <View style={styles.stepContent}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Start Date <Text style={styles.required}>*</Text></Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowDatePicker(true);
            }}
          >
            <Ionicons name="calendar" size={20} color="#0D5C3A" />
            <Text style={[styles.pickerText, formData.startDate && { color: "#333" }]}>
              {formData.startDate
                ? formData.startDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
                : "Select start date..."}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={formData.startDate || new Date()}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              minimumDate={new Date()}
              onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                if (Platform.OS === "android") {
                  setShowDatePicker(false);
                }
                if (event.type === "set" && selectedDate) {
                  updateFormData({ startDate: selectedDate });
                }
                if (Platform.OS === "ios" && selectedDate) {
                  updateFormData({ startDate: selectedDate });
                }
              }}
            />
          )}

          {Platform.OS === "ios" && showDatePicker && (
            <TouchableOpacity
              style={styles.datePickerDone}
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={styles.datePickerDoneText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Frequency <Text style={styles.required}>*</Text></Text>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[styles.optionButton, formData.frequency === "weekly" && styles.optionSelected]}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                updateFormData({ frequency: "weekly" });
              }}
            >
              <Text style={[styles.optionText, formData.frequency === "weekly" && styles.optionTextSelected]}>Weekly</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionButton, formData.frequency === "biweekly" && styles.optionSelected]}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                updateFormData({ frequency: "biweekly" });
              }}
            >
              <Text style={[styles.optionText, formData.frequency === "biweekly" && styles.optionTextSelected]}>Bi-weekly</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Score Deadline <Text style={styles.required}>*</Text></Text>
          <Text style={styles.helperText}>Day scores are due</Text>
          <View style={styles.chipContainer}>
            {DAYS_OF_WEEK.map((d) => (
              <TouchableOpacity
                key={d.key}
                style={[styles.chip, formData.scoreDeadline === d.key && styles.chipSelected]}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updateFormData({ scoreDeadline: d.key });
                }}
              >
                <Text style={[styles.chipText, formData.scoreDeadline === d.key && styles.chipTextSelected]}>
                  {d.label.substring(0, 3)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Number of Weeks <Text style={styles.required}>*</Text></Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (formData.numberOfWeeks > 1) updateFormData({ numberOfWeeks: formData.numberOfWeeks - 1 });
              }}
            >
              <Ionicons name="remove" size={24} color={formData.numberOfWeeks <= 1 ? "#CCC" : "#0D5C3A"} />
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{formData.numberOfWeeks}</Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (formData.numberOfWeeks < 52) updateFormData({ numberOfWeeks: formData.numberOfWeeks + 1 });
              }}
            >
              <Ionicons name="add" size={24} color={formData.numberOfWeeks >= 52 ? "#CCC" : "#0D5C3A"} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>End Date</Text>
          <View style={styles.displayField}>
            <Ionicons name="calendar-outline" size={20} color="#666" />
            <Text style={styles.displayText}>{calcEndDate()}</Text>
          </View>
          <Text style={styles.helperText}>Auto-calculated</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Play Day (Optional) */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>League Play Day <Text style={styles.optionalTag}>(optional)</Text></Text>
          <Text style={styles.helperText}>The day your league typically plays</Text>
          <View style={styles.chipContainer}>
            {DAYS_OF_WEEK.map((d) => (
              <TouchableOpacity
                key={d.key}
                style={[styles.chip, formData.playDay === d.key && styles.chipSelected]}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updateFormData({ playDay: formData.playDay === d.key ? null : d.key });
                }}
              >
                <Text style={[styles.chipText, formData.playDay === d.key && styles.chipTextSelected]}>
                  {d.label.substring(0, 3)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Tee Time (Optional) */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Tee Time <Text style={styles.optionalTag}>(optional)</Text></Text>
          <Text style={styles.helperText}>Used for score reminders</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowTimePicker(true);
            }}
          >
            <Ionicons name="time-outline" size={20} color="#0D5C3A" />
            <Text style={[styles.pickerText, formData.teeTime && { color: "#333" }]}>
              {formData.teeTime
                ? formatTeeTime(formData.teeTime)
                : "Select tee time..."}
            </Text>
            {formData.teeTime ? (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  soundPlayer.play("click");
                  updateFormData({ teeTime: null });
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={20} color="#999" />
              </TouchableOpacity>
            ) : (
              <Ionicons name="chevron-forward" size={20} color="#999" />
            )}
          </TouchableOpacity>

          {showTimePicker && (
            <DateTimePicker
              value={formData.teeTime ? parseTimeToDate(formData.teeTime) : new Date(new Date().setHours(14, 0, 0, 0))}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              minuteInterval={15}
              onChange={(event: DateTimePickerEvent, selectedDate?: Date) => {
                if (Platform.OS === "android") {
                  setShowTimePicker(false);
                }
                if (event.type === "set" && selectedDate) {
                  const hours = selectedDate.getHours().toString().padStart(2, "0");
                  const minutes = selectedDate.getMinutes().toString().padStart(2, "0");
                  updateFormData({ teeTime: `${hours}:${minutes}` });
                }
                if (Platform.OS === "ios" && selectedDate) {
                  const hours = selectedDate.getHours().toString().padStart(2, "0");
                  const minutes = selectedDate.getMinutes().toString().padStart(2, "0");
                  updateFormData({ teeTime: `${hours}:${minutes}` });
                }
              }}
            />
          )}

          {Platform.OS === "ios" && showTimePicker && (
            <TouchableOpacity
              style={styles.datePickerDone}
              onPress={() => setShowTimePicker(false)}
            >
              <Text style={styles.datePickerDoneText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color="#666" />
          <Text style={styles.infoBoxText}>
            Play day & tee time are used for score reminders and weekly results. Can be set later in Settings.
          </Text>
        </View>
      </View>
    );
  };

  const renderStep6 = () => (
    <View style={styles.stepContent}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Include Playoffs / Elevated Events?</Text>
        <View style={styles.optionRow}>
          <TouchableOpacity
            style={[styles.optionButton, !formData.hasElevatedEvents && styles.optionSelected]}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateFormData({ hasElevatedEvents: false, elevatedWeeks: [] });
            }}
          >
            <Text style={[styles.optionText, !formData.hasElevatedEvents && styles.optionTextSelected]}>No</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.optionButton, formData.hasElevatedEvents && styles.optionSelected]}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateFormData({ hasElevatedEvents: true });
            }}
          >
            <Text style={[styles.optionText, formData.hasElevatedEvents && styles.optionTextSelected]}>Yes</Text>
          </TouchableOpacity>
        </View>
      </View>

      {formData.hasElevatedEvents && (
        <>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Select Elevated Weeks <Text style={styles.required}>*</Text></Text>
            <Text style={styles.helperText}>Worth {formData.elevatedMultiplier}x points</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weeksScroll}>
              <View style={styles.weeksRow}>
                {Array.from({ length: formData.numberOfWeeks }, (_, i) => i + 1).map((w) => (
                  <TouchableOpacity
                    key={w}
                    style={[styles.weekChip, formData.elevatedWeeks.includes(w) && styles.weekChipSelected]}
                    onPress={() => {
                      soundPlayer.play("click");
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      const newWeeks = formData.elevatedWeeks.includes(w)
                        ? formData.elevatedWeeks.filter((x) => x !== w)
                        : [...formData.elevatedWeeks, w].sort((a, b) => a - b);
                      updateFormData({ elevatedWeeks: newWeeks });
                    }}
                  >
                    <Text style={[styles.weekChipText, formData.elevatedWeeks.includes(w) && styles.weekChipTextSelected]}>{w}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Points Multiplier</Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (formData.elevatedMultiplier > 1.5) updateFormData({ elevatedMultiplier: formData.elevatedMultiplier - 0.5 });
                }}
              >
                <Ionicons name="remove" size={24} color={formData.elevatedMultiplier <= 1.5 ? "#CCC" : "#0D5C3A"} />
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{formData.elevatedMultiplier}x</Text>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (formData.elevatedMultiplier < 5) updateFormData({ elevatedMultiplier: formData.elevatedMultiplier + 0.5 });
                }}
              >
                <Ionicons name="add" size={24} color={formData.elevatedMultiplier >= 5 ? "#CCC" : "#0D5C3A"} />
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </View>
  );

  const renderStep7 = () => {
    const calcEndDate = () => {
      if (!formData.startDate) return "—";
      const weeks = formData.frequency === "weekly" ? formData.numberOfWeeks : formData.numberOfWeeks * 2;
      const end = new Date(formData.startDate);
      end.setDate(end.getDate() + weeks * 7);
      return end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    return (
      <View style={styles.stepContent}>
        <View style={styles.reviewHeader}>
          <Text style={styles.reviewName}>{formData.name}</Text>
          {formData.description && <Text style={styles.reviewDesc}>{formData.description}</Text>}
        </View>

        <View style={styles.reviewSection}>
          <Text style={styles.reviewSectionTitle}>TYPE & FORMAT</Text>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Type</Text>
            <Text style={styles.reviewValue}>
              {formData.leagueType === "live" ? "☀️ Live" : "🖥️ Sim"}
              {formData.simPlatform && ` (${SIM_PLATFORMS.find((p) => p.key === formData.simPlatform)?.label})`}
            </Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Format</Text>
            <Text style={styles.reviewValue}>{formData.format === "stroke" ? "Stroke Play" : "2v2 Teams"}</Text>
          </View>
        </View>

        <View style={styles.reviewSection}>
          <Text style={styles.reviewSectionTitle}>ROUND SETTINGS</Text>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Holes</Text>
            <Text style={styles.reviewValue}>{formData.holes}</Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Courses</Text>
            <Text style={styles.reviewValue}>{formData.courseRestriction ? "Specific" : "Any"}</Text>
          </View>
        </View>

        <View style={styles.reviewSection}>
          <Text style={styles.reviewSectionTitle}>SCHEDULE</Text>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Season</Text>
            <Text style={styles.reviewValue}>
              {formData.startDate?.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {calcEndDate()}
            </Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Frequency</Text>
            <Text style={styles.reviewValue}>{formData.frequency === "weekly" ? "Weekly" : "Bi-weekly"}</Text>
          </View>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Deadline</Text>
            <Text style={styles.reviewValue}>{DAYS_OF_WEEK.find((d) => d.key === formData.scoreDeadline)?.label}</Text>
          </View>
        </View>

        {formData.hasElevatedEvents && (
          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>ELEVATED EVENTS</Text>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Weeks</Text>
              <Text style={styles.reviewValue}>{formData.elevatedWeeks.join(", ")} ({formData.elevatedMultiplier}x)</Text>
            </View>
          </View>
        )}

        <View style={styles.reviewSection}>
          <Text style={styles.reviewSectionTitle}>REGION</Text>
          <View style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>Location</Text>
            <Text style={styles.reviewValue}>{formData.regionName}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      case 6: return renderStep6();
      case 7: return renderStep7();
      default: return null;
    }
  };

  /* ================================================================ */
  /* MAIN RENDER                                                     */
  /* ================================================================ */

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Image source={require("@/assets/icons/Close.png")} style={styles.closeIcon} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create League</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress */}
      <View style={styles.progress}>
        <Text style={styles.progressText}>Step {currentStep} of {TOTAL_STEPS}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(currentStep / TOTAL_STEPS) * 100}%` }]} />
        </View>
        <Text style={styles.stepTitle}>{STEP_TITLES[currentStep - 1]}</Text>
      </View>

      {/* Content */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {renderStepContent()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Nav */}
      <View style={[styles.bottomNav, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} disabled={creating}>
          <Image source={require("@/assets/icons/Back.png")} style={styles.backIcon} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.continueBtn, (!isStepValid() || creating) && styles.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!isStepValid() || creating}
        >
          {creating ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.continueBtnText}>{currentStep === TOTAL_STEPS ? "Create League" : "Continue"}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Course Picker Modal */}
      <Modal
        visible={showCoursePicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCoursePicker(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                soundPlayer.play("click");
                setShowCoursePicker(false);
              }}
              style={styles.modalCloseBtn}
            >
              <Ionicons name="close" size={28} color="#0D5C3A" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add Course</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Search Input */}
          <View style={styles.modalSearchContainer}>
            <View style={styles.modalSearchWrapper}>
              <Ionicons name="search" size={20} color="#666" />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search courses..."
                placeholderTextColor="#999"
                value={courseSearchQuery}
                onChangeText={setCourseSearchQuery}
                autoFocus
                returnKeyType="search"
              />
              {courseSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setCourseSearchQuery("")}>
                  <Ionicons name="close-circle" size={20} color="#999" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Results */}
          {searchingCourses ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator size="large" color="#0D5C3A" />
              <Text style={styles.modalLoadingText}>Searching...</Text>
            </View>
          ) : courseSearchQuery.length < 2 ? (
            <View style={styles.modalEmpty}>
              <Ionicons name="golf" size={48} color="#CCC" />
              <Text style={styles.modalEmptyText}>Type at least 2 characters to search</Text>
            </View>
          ) : courseSearchResults.length === 0 ? (
            <View style={styles.modalEmpty}>
              <Ionicons name="search" size={48} color="#CCC" />
              <Text style={styles.modalEmptyText}>No courses found</Text>
            </View>
          ) : (
            <FlatList
              data={courseSearchResults}
              keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
              contentContainerStyle={styles.modalList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = formData.allowedCourses.some((c) => c.courseId === item.id);
                return (
                  <TouchableOpacity
                    style={[styles.courseResultItem, isSelected && styles.courseResultItemSelected]}
                    onPress={() => {
                      if (!isSelected) {
                        handleSelectCourse(item);
                      }
                    }}
                    disabled={isSelected}
                  >
                    <View style={styles.courseResultInfo}>
                      <Text style={styles.courseResultName} numberOfLines={1}>
                        {item.name || item.club_name}
                      </Text>
                      <Text style={styles.courseResultLocation} numberOfLines={1}>
                        {[item.city, item.state, item.country].filter(Boolean).join(", ")}
                      </Text>
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={24} color="#0D5C3A" />
                    ) : (
                      <Ionicons name="add-circle-outline" size={24} color="#0D5C3A" />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* Selected Count */}
          {formData.allowedCourses.length > 0 && (
            <View style={[styles.modalFooter, { paddingBottom: insets.bottom + 16 }]}>
              <Text style={styles.modalFooterText}>
                {formData.allowedCourses.length} course{formData.allowedCourses.length !== 1 ? "s" : ""} selected
              </Text>
              <TouchableOpacity
                style={styles.modalDoneBtn}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowCoursePicker(false);
                }}
              >
                <Text style={styles.modalDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  centered: { justifyContent: "center", alignItems: "center" },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E0E0E0" },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  closeIcon: { width: 24, height: 24 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#0D5C3A" },

  progress: { paddingHorizontal: 24, paddingVertical: 16 },
  progressText: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 8 },
  progressBar: { height: 6, backgroundColor: "#E0E0E0", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#0D5C3A", borderRadius: 3 },
  stepTitle: { fontSize: 20, fontWeight: "700", color: "#0D5C3A", textAlign: "center", marginTop: 16 },

  scrollContent: { paddingHorizontal: 24, paddingBottom: 24 },
  stepContent: { paddingTop: 8 },

  inputGroup: { marginBottom: 24 },
  label: { fontSize: 16, fontWeight: "600", color: "#333", marginBottom: 8 },
  required: { color: "#DC2626" },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 12, borderWidth: 2, borderColor: "#E0E0E0", paddingHorizontal: 16 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: "#333" },
  textArea: { backgroundColor: "#FFF", borderRadius: 12, borderWidth: 2, borderColor: "#E0E0E0", paddingHorizontal: 16, paddingVertical: 12, minHeight: 100 },
  helperText: { fontSize: 13, color: "#999", marginTop: 6 },
  errorText: { fontSize: 13, color: "#DC2626", marginTop: 4 },

  displayField: { flexDirection: "row", alignItems: "center", backgroundColor: "#F0F0F0", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  displayText: { fontSize: 16, color: "#333" },

  optionRow: { flexDirection: "row", gap: 12 },
  optionButton: { flex: 1, backgroundColor: "#FFF", borderRadius: 12, borderWidth: 2, borderColor: "#E0E0E0", paddingVertical: 16, alignItems: "center", gap: 8 },
  optionSelected: { borderColor: "#0D5C3A", backgroundColor: "#F0F8F0" },
  optionEmoji: { fontSize: 28 },
  optionText: { fontSize: 15, fontWeight: "600", color: "#666" },
  optionTextSelected: { color: "#0D5C3A" },
  optionNumber: { fontSize: 32, fontWeight: "700", color: "#666" },
  optionNumberSelected: { color: "#0D5C3A" },

  chipContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "#FFF", borderRadius: 20, borderWidth: 2, borderColor: "#E0E0E0", paddingHorizontal: 16, paddingVertical: 8 },
  chipSelected: { borderColor: "#0D5C3A", backgroundColor: "#F0F8F0" },
  chipText: { fontSize: 14, fontWeight: "500", color: "#666" },
  chipTextSelected: { color: "#0D5C3A" },

  infoCard: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#F0F8F0", borderRadius: 12, padding: 16, marginTop: 12, gap: 12 },
  infoText: { flex: 1, fontSize: 14, color: "#0D5C3A", lineHeight: 20 },
  infoCardLarge: { backgroundColor: "#F0F8F0", borderRadius: 16, padding: 24, alignItems: "center", marginTop: 16 },
  infoCardTitle: { fontSize: 18, fontWeight: "700", color: "#0D5C3A", marginTop: 12, marginBottom: 8 },
  infoCardDesc: { fontSize: 15, color: "#666", textAlign: "center", lineHeight: 22 },

  pickerButton: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 12, borderWidth: 2, borderColor: "#E0E0E0", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  pickerText: { flex: 1, fontSize: 16, color: "#666" },

  datePickerDone: { alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 16, marginTop: 8 },
  datePickerDoneText: { fontSize: 16, fontWeight: "600", color: "#0D5C3A" },

  selectedCourse: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#F0F8F0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8, borderWidth: 1, borderColor: "#0D5C3A" },
  selectedCourseText: { flex: 1, fontSize: 15, color: "#333", marginRight: 12 },
  addCourseButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#FFF", borderRadius: 12, borderWidth: 2, borderColor: "#0D5C3A", borderStyle: "dashed", paddingVertical: 14, gap: 8 },
  addCourseText: { fontSize: 15, fontWeight: "600", color: "#0D5C3A" },

  radioOption: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#FFF", borderRadius: 12, borderWidth: 2, borderColor: "#E0E0E0", padding: 16, marginBottom: 12, gap: 12 },
  radioSelected: { borderColor: "#0D5C3A", backgroundColor: "#F0F8F0" },
  radioCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#CCC", alignItems: "center", justifyContent: "center", marginTop: 2 },
  radioCircleSelected: { borderColor: "#0D5C3A" },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#0D5C3A" },
  radioContent: { flex: 1 },
  radioTitle: { fontSize: 16, fontWeight: "600", color: "#333", marginBottom: 4 },
  radioDesc: { fontSize: 14, color: "#666", lineHeight: 20 },

  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 },
  stepperBtn: { width: 48, height: 48, backgroundColor: "#FFF", borderRadius: 24, borderWidth: 2, borderColor: "#E0E0E0", alignItems: "center", justifyContent: "center" },
  stepperValue: { fontSize: 32, fontWeight: "700", color: "#0D5C3A", minWidth: 60, textAlign: "center" },

  weeksScroll: { marginTop: 8 },
  weeksRow: { flexDirection: "row", gap: 8, paddingRight: 24 },
  weekChip: { width: 44, height: 44, backgroundColor: "#FFF", borderRadius: 22, borderWidth: 2, borderColor: "#E0E0E0", alignItems: "center", justifyContent: "center" },
  weekChipSelected: { borderColor: "#0D5C3A", backgroundColor: "#0D5C3A" },
  weekChipText: { fontSize: 16, fontWeight: "600", color: "#666" },
  weekChipTextSelected: { color: "#FFF" },

  reviewHeader: { backgroundColor: "#0D5C3A", borderRadius: 16, padding: 20, marginBottom: 20 },
  reviewName: { fontSize: 24, fontWeight: "700", color: "#FFF", marginBottom: 8 },
  reviewDesc: { fontSize: 15, color: "rgba(255,255,255,0.8)", lineHeight: 22 },
  reviewSection: { backgroundColor: "#FFF", borderRadius: 12, padding: 16, marginBottom: 12 },
  reviewSectionTitle: { fontSize: 12, fontWeight: "600", color: "#999", letterSpacing: 0.5, marginBottom: 12 },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  reviewLabel: { fontSize: 15, color: "#666" },
  reviewValue: { fontSize: 15, fontWeight: "600", color: "#333", textAlign: "right", flex: 1, marginLeft: 16 },

  bottomNav: { flexDirection: "row", alignItems: "center", paddingHorizontal: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#E0E0E0", backgroundColor: "#F4EED8", gap: 16 },
  backBtn: { width: 56, height: 56, backgroundColor: "#FFF", borderRadius: 28, borderWidth: 2, borderColor: "#E0E0E0", alignItems: "center", justifyContent: "center" },
  backIcon: { width: 24, height: 24 },
  continueBtn: { flex: 1, backgroundColor: "#0D5C3A", borderRadius: 28, height: 56, alignItems: "center", justifyContent: "center" },
  continueBtnDisabled: { opacity: 0.5 },
  continueBtnText: { fontSize: 18, fontWeight: "700", color: "#FFF" },

  // Course Picker Modal
  modalContainer: { flex: 1, backgroundColor: "#F4EED8" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E0E0E0", backgroundColor: "#FFF" },
  modalCloseBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#0D5C3A" },
  modalSearchContainer: { padding: 16, backgroundColor: "#FFF" },
  modalSearchWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "#F0F0F0", borderRadius: 12, paddingHorizontal: 14, gap: 10 },
  modalSearchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: "#333" },
  modalLoading: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  modalLoadingText: { fontSize: 16, color: "#666" },
  modalEmpty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingHorizontal: 40 },
  modalEmptyText: { fontSize: 16, color: "#999", textAlign: "center" },
  modalList: { padding: 16 },
  courseResultItem: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 12, padding: 14, marginBottom: 8 },
  courseResultItemSelected: { backgroundColor: "#F0F8F0", borderWidth: 1, borderColor: "#0D5C3A" },
  courseResultInfo: { flex: 1, marginRight: 12 },
  courseResultName: { fontSize: 16, fontWeight: "600", color: "#333", marginBottom: 2 },
  courseResultLocation: { fontSize: 14, color: "#666" },
  modalFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E0E0E0", backgroundColor: "#FFF" },
  modalFooterText: { fontSize: 15, color: "#666" },
  modalDoneBtn: { backgroundColor: "#0D5C3A", borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10 },
  modalDoneBtnText: { fontSize: 16, fontWeight: "600", color: "#FFF" },
  divider: { height: 1, backgroundColor: "#E0E0E0", marginVertical: 16 },
  optionalTag: { fontSize: 13, fontWeight: "400", color: "#999" },
  infoBox: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#F5F5F5", borderRadius: 10, padding: 12, gap: 10, marginTop: 8 },
  infoBoxText: { flex: 1, fontSize: 13, color: "#666", lineHeight: 18 },
});