/**
 * League Creation Wizard
 * 
 * 7-step wizard for commissioners to create their league:
 * 1. Basic Info (name, description, region)
 * 2. Type & Format (live/sim, stroke/2v2)
 * 3. Round Settings (holes, courses)
 * 4. Handicap & Scoring (handicap system, points per week)
 * 5. Schedule (dates, frequency, deadline)
 * 6. Elevated Events & Purse
 * 7. Review & Create
 * 
 * Refactored to use modular step components from @/components/leagues/create
 */

import {
  DEFAULT_FORM_DATA,
  LeagueFormData,
  Step1BasicInfo,
  Step2LeagueType,
  Step3RoundSetup,
  Step4HandicapScoring,
  Step5Schedule,
  Step6ElevatedEvents,
  Step7Review,
  STEP_TITLES,
  styles as stepStyles,
  TOTAL_STEPS,
} from "@/components/leagues/create";
import { auth, db } from "@/constants/firebaseConfig";
import { findRegionByKey } from "@/constants/regions";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
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
import React, { useEffect, useState } from "react";
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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function CreateLeague() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUserId = auth.currentUser?.uid;

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Name check state
  const [checkingName, setCheckingName] = useState(false);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);

  // Course picker modal
  const [showCoursePicker, setShowCoursePicker] = useState(false);
  const [courseSearchQuery, setCourseSearchQuery] = useState("");
  const [courseSearchResults, setCourseSearchResults] = useState<any[]>([]);
  const [searchingCourses, setSearchingCourses] = useState(false);

  // Form data
  const [formData, setFormData] = useState<LeagueFormData>(DEFAULT_FORM_DATA);

  /* ================================================================ */
  /* INITIALIZATION                                                   */
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
  /* NAME CHECK                                                       */
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
  /* VALIDATION                                                       */
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
  /* HANDLERS                                                         */
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

  const updateFormData = (updates: Partial<LeagueFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  /* ================================================================ */
  /* CREATE LEAGUE                                                    */
  /* ================================================================ */

  const handleCreateLeague = async () => {
    if (!currentUserId) return;

    setCreating(true);
    try {
      const startDate = formData.startDate!;
      const weeksToAdd = formData.frequency === "weekly" ? formData.numberOfWeeks : formData.numberOfWeeks * 2;
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + weeksToAdd * 7);

      // Extract hashtags
      const extractHashtags = (text: string): string[] => {
        const matches = text.match(/#[a-zA-Z0-9_]+/g);
        if (!matches) return [];
        return [...new Set(matches.map((tag) => tag.toLowerCase()))];
      };

      const allHashtags = [
        ...new Set([...extractHashtags(formData.name), ...extractHashtags(formData.description)]),
      ];

      // Create searchable keywords
      const nameWords = formData.name
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length >= 2);

      // Build league data using ORIGINAL field names for compatibility
      const leagueData = {
        name: formData.name.trim(),
        nameLower: formData.name.trim().toLowerCase(),
        description: formData.description.trim(),
        regionKey: formData.regionKey,
        regionName: formData.regionName,
        leagueType: formData.leagueType,
        simPlatform: formData.leagueType === "sim" ? formData.simPlatform : null,
        format: formData.format,
        // Original field names
        holes: formData.holes,
        courseRestriction: formData.courseRestriction,
        allowedCourses: formData.allowedCourses,
        nineHoleOption: formData.holes === 9 ? formData.nineHoleOption : null,
        handicapSystem: formData.format === "stroke" ? formData.handicapSystem : "league_managed",
        // NEW field - additive, non-breaking
        pointsPerWeek: formData.pointsPerWeek,
        startDate,
        endDate,
        frequency: formData.frequency,
        // Original field name (day of week)
        scoreDeadline: formData.scoreDeadline,
        playDay: formData.playDay,
        teeTime: formData.teeTime,
        totalWeeks: formData.numberOfWeeks,
        currentWeek: 0,
        // Original field names for elevated events
        hasElevatedEvents: formData.hasElevatedEvents,
        elevatedWeeks: formData.elevatedWeeks,
        elevatedMultiplier: formData.elevatedMultiplier,
        // NEW field - additive, non-breaking
        purse: formData.purseEnabled && formData.purseAmount > 0
          ? {
              amount: formData.purseAmount,
              currency: formData.purseCurrency,
            }
          : null,
        hostUserId: currentUserId,
        status: "upcoming",
        isPublic: true,
        memberCount: 1,
        hashtags: allHashtags,
        searchKeywords: nameWords,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const leagueRef = await addDoc(collection(db, "leagues"), leagueData);

      // Add commissioner as first member
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

  /* ================================================================ */
  /* COURSE SEARCH                                                    */
  /* ================================================================ */

  const searchCourses = async (searchQuery: string) => {
    if (searchQuery.trim().length < 2) {
      setCourseSearchResults([]);
      return;
    }

    setSearchingCourses(true);
    try {
      const response = await fetch(
        `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(searchQuery)}&page_size=20`,
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

    const alreadySelected = formData.allowedCourses.some((c) => c.courseId === courseData.courseId);

    if (!alreadySelected) {
      updateFormData({
        allowedCourses: [...formData.allowedCourses, courseData],
      });
    }
  };

  const handleOpenCoursePicker = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCourseSearchQuery("");
    setCourseSearchResults([]);
    setShowCoursePicker(true);
  };

  /* ================================================================ */
  /* RENDER STEP CONTENT                                              */
  /* ================================================================ */

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1BasicInfo
            formData={formData}
            updateFormData={updateFormData}
            checkingName={checkingName}
            nameAvailable={nameAvailable}
            setNameAvailable={setNameAvailable}
          />
        );
      case 2:
        return <Step2LeagueType formData={formData} updateFormData={updateFormData} />;
      case 3:
        return (
          <Step3RoundSetup
            formData={formData}
            updateFormData={updateFormData}
            onOpenCoursePicker={handleOpenCoursePicker}
          />
        );
      case 4:
        return <Step4HandicapScoring formData={formData} updateFormData={updateFormData} />;
      case 5:
        return <Step5Schedule formData={formData} updateFormData={updateFormData} />;
      case 6:
        return <Step6ElevatedEvents formData={formData} updateFormData={updateFormData} />;
      case 7:
        return <Step7Review formData={formData} />;
      default:
        return null;
    }
  };

  /* ================================================================ */
  /* MAIN RENDER                                                      */
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
        <Text style={styles.progressText}>
          Step {currentStep} of {TOTAL_STEPS}
        </Text>
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
            <Text style={styles.continueBtnText}>
              {currentStep === TOTAL_STEPS ? "Create League" : "Continue"}
            </Text>
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
        <View style={[stepStyles.modalContainer, { paddingTop: insets.top }]}>
          {/* Modal Header */}
          <View style={stepStyles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                soundPlayer.play("click");
                setShowCoursePicker(false);
              }}
              style={stepStyles.modalCloseBtn}
            >
              <Ionicons name="close" size={28} color="#0D5C3A" />
            </TouchableOpacity>
            <Text style={stepStyles.modalTitle}>Add Course</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Search Input */}
          <View style={stepStyles.modalSearchContainer}>
            <View style={stepStyles.modalSearchWrapper}>
              <Ionicons name="search" size={20} color="#666" />
              <TextInput
                style={stepStyles.modalSearchInput}
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
            <View style={stepStyles.modalLoading}>
              <ActivityIndicator size="large" color="#0D5C3A" />
              <Text style={stepStyles.modalLoadingText}>Searching...</Text>
            </View>
          ) : courseSearchQuery.length < 2 ? (
            <View style={stepStyles.modalEmpty}>
              <Ionicons name="golf" size={48} color="#CCC" />
              <Text style={stepStyles.modalEmptyText}>Type at least 2 characters to search</Text>
            </View>
          ) : courseSearchResults.length === 0 ? (
            <View style={stepStyles.modalEmpty}>
              <Ionicons name="search" size={48} color="#CCC" />
              <Text style={stepStyles.modalEmptyText}>No courses found</Text>
            </View>
          ) : (
            <FlatList
              data={courseSearchResults}
              keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
              contentContainerStyle={stepStyles.modalList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const isSelected = formData.allowedCourses.some((c) => c.courseId === item.id);
                return (
                  <TouchableOpacity
                    style={[stepStyles.courseResultItem, isSelected && stepStyles.courseResultItemSelected]}
                    onPress={() => {
                      if (!isSelected) {
                        handleSelectCourse(item);
                      }
                    }}
                    disabled={isSelected}
                  >
                    <View style={stepStyles.courseResultInfo}>
                      <Text style={stepStyles.courseResultName} numberOfLines={1}>
                        {item.name || item.club_name}
                      </Text>
                      <Text style={stepStyles.courseResultLocation} numberOfLines={1}>
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
            <View style={[stepStyles.modalFooter, { paddingBottom: insets.bottom + 16 }]}>
              <Text style={stepStyles.modalFooterText}>
                {formData.allowedCourses.length} course{formData.allowedCourses.length !== 1 ? "s" : ""} selected
              </Text>
              <TouchableOpacity
                style={stepStyles.modalDoneBtn}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowCoursePicker(false);
                }}
              >
                <Text style={stepStyles.modalDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

/* ================================================================ */
/* STYLES (Page-specific only - step styles imported from shared)   */
/* ================================================================ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  centered: { justifyContent: "center", alignItems: "center" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#D4D4D4",
  },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  closeIcon: { width: 24, height: 24 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#0D5C3A" },

  // Progress
  progress: { paddingHorizontal: 24, paddingVertical: 16 },
  progressText: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 8 },
  progressBar: { height: 6, backgroundColor: "#D4D4D4", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#0D5C3A", borderRadius: 3 },
  stepTitle: { fontSize: 20, fontWeight: "700", color: "#0D5C3A", textAlign: "center", marginTop: 16 },

  // Content
  scrollContent: { paddingHorizontal: 24, paddingBottom: 24 },

  // Bottom Nav
  bottomNav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#D4D4D4",
    backgroundColor: "#F4EED8",
    gap: 16,
  },
  backBtn: {
    width: 56,
    height: 56,
    backgroundColor: "#FFF",
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "#D4D4D4",
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: { width: 24, height: 24 },
  continueBtn: {
    flex: 1,
    backgroundColor: "#0D5C3A",
    borderRadius: 28,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnDisabled: { opacity: 0.5 },
  continueBtnText: { fontSize: 18, fontWeight: "700", color: "#FFF" },
});