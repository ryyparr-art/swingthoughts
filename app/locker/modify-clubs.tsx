/**
 * Modify Locker Screen (Refactored)
 * 
 * Coordinator that composes section components:
 * - GolfIdentitySection (home course, game identity)
 * - AchievementsSection (badge selection)
 * - EquipmentSection (woods, irons, wedges, putter, ball)
 * - CourseSearchModal (extracted modal)
 * 
 * Handles: data loading, saving to Firestore, navigation.
 */

import BadgeSelectionModal from "@/components/modals/BadgeSelectionModal";
import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Section components
import AchievementsSection from "@/components/locker/edit/AchievementsSection";
import CourseSearchModal from "@/components/locker/edit/CourseSearchModal";
import EquipmentSection from "@/components/locker/edit/EquipmentSection";
import GolfIdentitySection from "@/components/locker/edit/GolfIdentitySection";

// Types & helpers
import {
  Badge,
  ClubsData,
  Course,
  UserLocation,
  clubsToFirestore,
  parseClubsFromFirestore,
} from "@/components/locker/edit/types";

/* ================================================================ */
/* COMPONENT                                                        */
/* ================================================================ */

export default function ModifyLockerScreen() {
  const router = useRouter();
  const userId = auth.currentUser?.uid;

  /* ---------------------------------------------------------------- */
  /* STATE                                                            */
  /* ---------------------------------------------------------------- */

  // User location for course distance
  const [location, setLocation] = useState<UserLocation | null>(null);

  // Course selection
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [cachedCourses, setCachedCourses] = useState<Course[]>([]);
  const [showCourseModal, setShowCourseModal] = useState(false);

  // Identity
  const [gameIdentity, setGameIdentity] = useState("");

  // Equipment (new structured format)
  const [clubs, setClubs] = useState<ClubsData>({
    driver: "",
    woods: {},
    ironSet: null,
    individualIrons: [],
    irons: "",
    wedgesList: [],
    wedges: "",
    putter: "",
    ball: "",
  });

  // Badges
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [selectedBadges, setSelectedBadges] = useState<Badge[]>([]);
  const [showBadgeModal, setShowBadgeModal] = useState(false);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* ---------------------------------------------------------------- */
  /* LOAD DATA                                                        */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    fetchLockerData();
  }, []);

  const fetchLockerData = async () => {
    if (!userId) return;

    try {
      const userDoc = await getDoc(doc(db, "users", userId));

      if (userDoc.exists()) {
        const data = userDoc.data();

        // Location
        setLocation(data.location || null);

        // Cached courses
        const cached = data.cachedCourses || [];
        if (cached.length > 0) {
          const uniqueCourses = cached.reduce(
            (acc: Course[], current: Course) => {
              const exists = acc.find(
                (c) =>
                  c.courseId === current.courseId || c.id === current.courseId
              );
              if (!exists) acc.push(current);
              return acc;
            },
            []
          );
          const sorted = [...uniqueCourses].sort(
            (a, b) => (a.distance || 999) - (b.distance || 999)
          );
          setCachedCourses(sorted.slice(0, 5));
        }

        // Home course
        if (data.homeCourse) {
          if (typeof data.homeCourse === "object") {
            setSelectedCourse(data.homeCourse);
          } else {
            setSelectedCourse({ courseName: data.homeCourse });
          }
        }

        // Identity
        setGameIdentity(data.gameIdentity || "");

        // Equipment - parse handles legacy + new format
        setClubs(parseClubsFromFirestore(data));

        // Badges
        const badgesData = data.Badges || [];
        const validBadges = badgesData.filter((badge: any) => {
          if (!badge) return false;
          if (typeof badge === "string" && badge.trim() === "") return false;
          return true;
        });
        setAllBadges(validBadges);
        setSelectedBadges(data.displayBadges || validBadges.slice(0, 3));
      }

      setLoading(false);
    } catch (error) {
      console.error("Error fetching locker data:", error);
      soundPlayer.play("error");
      setLoading(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* SAVE                                                             */
  /* ---------------------------------------------------------------- */

  const handleSave = async () => {
    if (!userId) return;

    try {
      soundPlayer.play("click");
      setSaving(true);

      const updateData: any = {
        gameIdentity: gameIdentity.trim(),
        clubs: clubsToFirestore(clubs),
        displayBadges: selectedBadges,
        updatedAt: new Date().toISOString(),
      };

      // Home course – guard against undefined courseId (legacy docs)
      if (selectedCourse) {
        const courseId = selectedCourse.id || selectedCourse.courseId;
        if (courseId) {
          updateData.homeCourse = {
            courseId,
            courseName:
              selectedCourse.course_name || selectedCourse.courseName,
            location: selectedCourse.location || null,
          };
          updateData.homeCourseName =
            selectedCourse.course_name || selectedCourse.courseName;
        }
        // No valid courseId → skip homeCourse update entirely
      } else {
        updateData.homeCourse = null;
        updateData.homeCourseName = null;
      }

      await setDoc(doc(db, "users", userId), updateData, { merge: true });

      soundPlayer.play("postThought");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (Platform.OS === "web") {
        alert("Locker updated successfully!");
      } else {
        Alert.alert("Success", "Locker updated successfully!");
      }

      router.replace("/locker");
    } catch (error) {
      console.error("Error saving locker:", error);
      soundPlayer.play("error");
      setSaving(false);

      if (Platform.OS === "web") {
        alert("Failed to update locker. Please try again.");
      } else {
        Alert.alert("Error", "Failed to update locker. Please try again.");
      }
    }
  };

  /* ---------------------------------------------------------------- */
  /* HANDLERS                                                         */
  /* ---------------------------------------------------------------- */

  const handleCourseSelect = (course: Course) => {
    setSelectedCourse(course);
    setShowCourseModal(false);
  };

  const handleClearCourse = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCourse(null);
  };

  /* ---------------------------------------------------------------- */
  /* LOADING                                                          */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  /* ---------------------------------------------------------------- */
  /* RENDER                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <View style={styles.wrapper}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.headerButton}
          >
            <Image
              source={require("@/assets/icons/Back.png")}
              style={styles.backIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Update Locker</Text>

          <TouchableOpacity
            onPress={handleSave}
            style={styles.headerButton}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="checkmark" size={24} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Golf Identity (Home Course + Game Identity) */}
          <GolfIdentitySection
            selectedCourse={selectedCourse}
            onOpenCourseSearch={() => setShowCourseModal(true)}
            onClearCourse={handleClearCourse}
            gameIdentity={gameIdentity}
            onChangeGameIdentity={setGameIdentity}
          />

          <View style={styles.divider} />

          {/* Achievements (Badge Selection) */}
          <AchievementsSection
            selectedBadges={selectedBadges}
            onOpenBadgeModal={() => setShowBadgeModal(true)}
          />

          <View style={styles.divider} />

          {/* Equipment (Woods, Irons, Wedges, Putter, Ball) */}
          <EquipmentSection clubs={clubs} onUpdate={setClubs} />

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <ActivityIndicator
                  size="small"
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.saveButtonText}>Saving...</Text>
              </>
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle"
                  size={20}
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.saveButtonText}>Save All Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Badge Selection Modal */}
      <BadgeSelectionModal
        visible={showBadgeModal}
        badges={allBadges}
        selectedBadges={selectedBadges}
        onClose={() => {
          soundPlayer.play("click");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowBadgeModal(false);
        }}
        onSave={setSelectedBadges}
      />

      {/* Course Search Modal */}
      <CourseSearchModal
        visible={showCourseModal}
        onClose={() => setShowCourseModal(false)}
        onSelect={handleCourseSelect}
        cachedCourses={cachedCourses}
        location={location}
      />
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  safeTop: {
    backgroundColor: "#0D5C3A",
  },
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },
  headerButton: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  divider: {
    height: 1,
    backgroundColor: "#E0E0E0",
    marginVertical: 24,
  },
  saveButton: {
    flexDirection: "row",
    backgroundColor: "#0D5C3A",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonDisabled: {
    backgroundColor: "rgba(13, 92, 58, 0.5)",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },
});