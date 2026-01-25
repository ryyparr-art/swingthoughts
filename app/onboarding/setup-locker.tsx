import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";

const BackIcon = require("@/assets/icons/Back.png");

const API_KEY = process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY;
const API_BASE = "https://api.golfcourseapi.com/v1";

/* ---------------- TYPES ---------------- */

type UserLocation = {
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
};

type Course = {
  id?: number;
  courseId?: number;
  course_name?: string;
  courseName?: string;
  location?: {
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
  };
  distance?: number;
};

/* ---------------- HELPERS ---------------- */

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ---------------- COMPONENT ---------------- */

export default function SetupLocker() {
  const router = useRouter();

  const [userData, setUserData] = useState<any>(null);
  const [location, setLocation] = useState<UserLocation | null>(null);
  
  // Course selection state
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [cachedCourses, setCachedCourses] = useState<Course[]>([]);
  const [searchResults, setSearchResults] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [searching, setSearching] = useState(false);

  const [gameIdentity, setGameIdentity] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /* ---------------- LOAD USER DATA ---------------- */
  useEffect(() => {
    const loadUser = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
          const data = snap.data();
          setUserData(data);
          setLocation(data.location || null);
          
          // Load cached courses
          const cached = data.cachedCourses || [];
          if (cached.length > 0) {
            const uniqueCourses = cached.reduce((acc: Course[], current: Course) => {
              const exists = acc.find(c => c.courseId === current.courseId || c.id === current.courseId);
              if (!exists) acc.push(current);
              return acc;
            }, []);
            
            const sorted = [...uniqueCourses].sort((a, b) => (a.distance || 999) - (b.distance || 999));
            setCachedCourses(sorted.slice(0, 5));
          }
          
          // Pre-fill if user already has a home course
          if (data.homeCourse) {
            if (typeof data.homeCourse === 'object') {
              setSelectedCourse(data.homeCourse);
            } else {
              // Legacy string format
              setSelectedCourse({ courseName: data.homeCourse });
            }
          }
          
          if (data.gameIdentity) {
            setGameIdentity(data.gameIdentity);
          }
        }
      } catch (err) {
        console.error("Error loading user data:", err);
      }
    };
    loadUser();
  }, []);

  /* ---------------- COURSE SEARCH ---------------- */
  const handleSearch = async () => {
    console.log("🔍 handleSearch called, query:", searchQuery);
    
    if (!searchQuery.trim()) {
      console.log("❌ Empty search query");
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const query = searchQuery.trim().toLowerCase();
    
    try {
      soundPlayer.play('click');
      
      let combinedResults: Course[] = [];
      
      // Step 1: Filter user's cached courses locally
      const cachedMatches = cachedCourses.filter(c => {
        const name = (c.course_name || c.courseName || "").toLowerCase();
        const city = c.location?.city?.toLowerCase() || "";
        return name.includes(query) || city.includes(query);
      });
      
      console.log("📦 Cached course matches:", cachedMatches.length);
      combinedResults = [...cachedMatches];
      
      // Step 2: Search Firestore courses collection (prefix search)
      try {
        const { collection: firestoreCollection, getDocs, query: firestoreQuery, where, orderBy, limit } = await import("firebase/firestore");
        
        // Firestore prefix search - courseName starts with query (case-sensitive limitation)
        const searchUpper = searchQuery.trim().charAt(0).toUpperCase() + searchQuery.trim().slice(1);
        const coursesRef = firestoreCollection(db, "courses");
        
        const firestoreSearch = firestoreQuery(
          coursesRef,
          where("courseName", ">=", searchUpper),
          where("courseName", "<=", searchUpper + "\uf8ff"),
          limit(10)
        );
        
        const firestoreSnap = await getDocs(firestoreSearch);
        console.log("🔥 Firestore courses found:", firestoreSnap.size);
        
        firestoreSnap.forEach((doc) => {
          const data = doc.data();
          const courseId = data.id || parseInt(doc.id) || undefined;
          
          // Avoid duplicates
          const exists = combinedResults.some(c => 
            (c.id === courseId) || (c.courseId === courseId)
          );
          
          if (!exists) {
            combinedResults.push({
              id: courseId,
              courseId: courseId,
              course_name: data.courseName,
              courseName: data.courseName,
              location: data.location,
            });
          }
        });
      } catch (firestoreErr) {
        console.log("⚠️ Firestore search failed, continuing to API:", firestoreErr);
      }
      
      // Step 3: If we have enough results, use them; otherwise hit the external API
      if (combinedResults.length >= 5) {
        console.log("✅ Using cached/Firestore results:", combinedResults.length);
        
        // Sort by distance if location available
        if (location?.latitude && location?.longitude) {
          combinedResults = combinedResults.map((c) => ({
            ...c,
            distance: c.location?.latitude && c.location?.longitude
              ? haversine(location.latitude!, location.longitude!, c.location.latitude, c.location.longitude)
              : 999,
          }));
          combinedResults.sort((a, b) => (a.distance || 999) - (b.distance || 999));
        }
        
        setSearchResults(combinedResults);
      } else {
        // Hit external API for more results
        console.log("🌐 Not enough cached results, fetching from API...");
        const url = `${API_BASE}/search?search_query=${encodeURIComponent(searchQuery)}`;
        console.log("🔑 API Key present:", !!API_KEY);
        
        const res = await fetch(url, { 
          headers: { Authorization: `Key ${API_KEY}` } 
        });
        
        console.log("📡 Response status:", res.status);
        
        const data = await res.json();
        const apiCourses: Course[] = data.courses || [];
        console.log("⛳ API courses found:", apiCourses.length);
        
        // Merge API results with cached results (avoid duplicates)
        apiCourses.forEach((apiCourse) => {
          const exists = combinedResults.some(c => 
            (c.id === apiCourse.id) || (c.courseId === apiCourse.id)
          );
          if (!exists) {
            combinedResults.push(apiCourse);
          }
        });

        // Sort by distance if location available
        if (location?.latitude && location?.longitude) {
          combinedResults = combinedResults.map((c) => ({
            ...c,
            distance: c.location?.latitude && c.location?.longitude
              ? haversine(location.latitude!, location.longitude!, c.location.latitude, c.location.longitude)
              : 999,
          }));
          combinedResults.sort((a, b) => (a.distance || 999) - (b.distance || 999));
        }
        
        setSearchResults(combinedResults);
      }
    } catch (err) {
      console.error("❌ Search error:", err);
      soundPlayer.play('error');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleCourseSelect = (course: Course) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedCourse(course);
    setShowCourseModal(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const clearSelectedCourse = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCourse(null);
  };

  /* ---------------- BACK ---------------- */
  const handleBack = () => {
    if (loading) return;
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace("/onboarding/setup-profile");
  };

  /* ---------------- CONTINUE ---------------- */
  const handleContinue = async () => {
    setError("");

    if (gameIdentity.trim() && gameIdentity.trim().length < 2) {
      setError("Game identity must be at least 2 characters");
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    soundPlayer.play('click');
    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No user logged in");

      const userRef = doc(db, "users", user.uid);

      const lockerData: any = {
        lockerCompleted: true,
        updatedAt: new Date().toISOString(),
      };

      // Save home course as object with full details
      if (selectedCourse) {
        lockerData.homeCourse = {
          courseId: selectedCourse.id || selectedCourse.courseId,
          courseName: selectedCourse.course_name || selectedCourse.courseName,
          location: selectedCourse.location || null,
        };
        // Also save as string for backwards compatibility / display
        lockerData.homeCourseName = selectedCourse.course_name || selectedCourse.courseName;
      }
      
      if (gameIdentity.trim()) lockerData.gameIdentity = gameIdentity.trim();

      await setDoc(userRef, lockerData, { merge: true });

      const snap = await getDoc(userRef);
      const updatedUserData = snap.data();

      soundPlayer.play('postThought');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Check if verification is needed
      if (
        updatedUserData?.userType === "PGA Professional" ||
        updatedUserData?.userType === "Course"
      ) {
        router.replace("/onboarding/verification");
        return;
      }

      router.replace("/onboarding/starter");
    } catch (err) {
      console.error("Error saving locker info:", err);
      setError("Failed to save information. Please try again.");
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setLoading(false);
    }
  };

  /* ---------------- SKIP ---------------- */
  const handleSkip = async () => {
    if (loading) return;
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const user = auth.currentUser;
      if (!user) return;

      const userRef = doc(db, "users", user.uid);

      await setDoc(
        userRef,
        {
          lockerCompleted: true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      const snap = await getDoc(userRef);
      const updatedUserData = snap.data();

      soundPlayer.play('postThought');

      if (
        updatedUserData?.userType === "PGA Professional" ||
        updatedUserData?.userType === "Course"
      ) {
        router.replace("/onboarding/verification");
        return;
      }

      router.replace("/onboarding/starter");
    } catch (err) {
      console.error("Skip locker failed:", err);
      soundPlayer.play('error');
    }
  };

  /* ---------------- RENDER COURSE ITEM ---------------- */
  const renderCourseItem = ({ item }: { item: Course }) => (
    <TouchableOpacity
      style={styles.courseItem}
      onPress={() => handleCourseSelect(item)}
    >
      <View style={styles.courseItemLeft}>
        <Text style={styles.courseItemName}>
          {item.course_name || item.courseName || "Unknown Course"}
        </Text>
        {item.location && (
          <Text style={styles.courseItemLocation}>
            {item.location.city}, {item.location.state}
          </Text>
        )}
      </View>
      {item.distance !== undefined && item.distance < 999 && (
        <Text style={styles.courseItemDistance}>
          {item.distance.toFixed(1)} mi
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Back Button */}
      <View pointerEvents="box-none" style={styles.topNav}>
        <TouchableOpacity
          onPress={handleBack}
          disabled={loading}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <Image source={BackIcon} style={styles.navIcon} />
        </TouchableOpacity>
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          enableOnAndroid
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          extraScrollHeight={Platform.OS === "ios" ? 40 : 80}
          enableAutomaticScroll
          enableResetScrollToCoords={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="golf-outline" size={64} color="#0D5C3A" />
            </View>
            <Text style={styles.title}>Your Golf Identity</Text>
            <Text style={styles.subtitle}>
              Tell us about your home course and how you describe your game
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {error ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={20} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Home Course */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Home Course <Text style={styles.optional}>(Optional)</Text>
              </Text>
              
              {selectedCourse ? (
                <View style={styles.selectedCourseContainer}>
                  <View style={styles.selectedCourseInfo}>
                    <Ionicons name="flag" size={20} color="#0D5C3A" />
                    <View style={styles.selectedCourseText}>
                      <Text style={styles.selectedCourseName}>
                        {selectedCourse.course_name || selectedCourse.courseName}
                      </Text>
                      {selectedCourse.location && (
                        <Text style={styles.selectedCourseLocation}>
                          {selectedCourse.location.city}, {selectedCourse.location.state}
                        </Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={clearSelectedCourse}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={24} color="#999" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.courseSelectButton}
                  onPress={() => {
                    soundPlayer.play('click');
                    setShowCourseModal(true);
                  }}
                  disabled={loading}
                >
                  <Ionicons name="flag-outline" size={20} color="#666" />
                  <Text style={styles.courseSelectButtonText}>
                    Select your home course
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#666" />
                </TouchableOpacity>
              )}
            </View>

            {/* Game Identity */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                Game Identity <Text style={styles.optional}>(Optional)</Text>
              </Text>
              <View style={styles.inputWrapper}>
                <Ionicons 
                  name="person-outline" 
                  size={20} 
                  color="#666" 
                  style={styles.inputIcon} 
                />
                <TextInput
                  style={styles.input}
                  placeholder='"Short game king" or "Long hitter"'
                  placeholderTextColor="#999"
                  value={gameIdentity}
                  onChangeText={setGameIdentity}
                  autoCapitalize="sentences"
                  editable={!loading}
                  maxLength={60}
                  multiline={false}
                />
              </View>
              <Text style={styles.helperText}>
                Describe your playing style in your own words
              </Text>
            </View>

            {/* Continue Button */}
            <TouchableOpacity
              style={[styles.continueButton, loading && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.continueButtonText}>Continue</Text>
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>

            {/* Skip Button */}
            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkip}
              disabled={loading}
            >
              <Text style={styles.skipButtonText}>Skip for now</Text>
            </TouchableOpacity>
          </View>

          {/* Progress Indicator */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: "66%" }]} />
            </View>
            <Text style={styles.progressText}>Step 2 of 3</Text>
          </View>

          {/* Extra spacing for keyboard */}
          <View style={{ height: 40 }} />
        </KeyboardAwareScrollView>
      </TouchableWithoutFeedback>

      {/* Course Selection Modal */}
      <Modal
        visible={showCourseModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCourseModal(false)}
      >
        <KeyboardAvoidingView 
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Home Course</Text>
                <TouchableOpacity
                  onPress={() => {
                    soundPlayer.play('click');
                    setShowCourseModal(false);
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                >
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Search Input */}
              <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by course name or city..."
                  placeholderTextColor="#999"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                  autoFocus
                />
                {searching && (
                  <ActivityIndicator size="small" color="#0D5C3A" />
                )}
              </View>

              {/* Search Button */}
              <TouchableOpacity
                style={styles.searchButton}
                onPress={handleSearch}
                disabled={searching || !searchQuery.trim()}
              >
                <Text style={styles.searchButtonText}>Search</Text>
              </TouchableOpacity>

              {/* Results */}
              <FlatList
                data={searchResults.length > 0 ? searchResults : cachedCourses}
                keyExtractor={(item, index) => `course-${item.id || item.courseId}-${index}`}
                renderItem={renderCourseItem}
                style={styles.courseList}
                contentContainerStyle={styles.courseListContent}
                ListHeaderComponent={
                  searchResults.length === 0 && cachedCourses.length > 0 ? (
                    <Text style={styles.sectionHeader}>Recent Courses</Text>
                  ) : searchResults.length > 0 ? (
                    <Text style={styles.sectionHeader}>Search Results</Text>
                  ) : null
                }
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Ionicons name="golf-outline" size={48} color="#CCC" />
                    <Text style={styles.emptyText}>
                      {searchQuery.trim() 
                        ? "No courses found. Try a different search."
                        : "Search for your home course above"}
                    </Text>
                  </View>
                }
                keyboardShouldPersistTaps="handled"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#F4EED8" 
  },
  topNav: {
    position: "absolute",
    top: 48,
    left: 20,
    zIndex: 1000,
  },
  navIcon: { 
    width: 28, 
    height: 28 
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 32,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  form: { 
    flex: 1 
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: "#DC2626",
    fontWeight: "500",
  },
  inputGroup: { 
    marginBottom: 24 
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 8,
  },
  optional: {
    fontSize: 14,
    color: "#999",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: "#333",
  },
  helperText: {
    fontSize: 13,
    color: "#999",
    marginTop: 6,
    marginLeft: 4,
  },
  
  // Course Selection
  courseSelectButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  courseSelectButtonText: {
    flex: 1,
    fontSize: 16,
    color: "#999",
  },
  selectedCourseContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  selectedCourseInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectedCourseText: {
    flex: 1,
  },
  selectedCourseName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  selectedCourseLocation: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },

  // Buttons
  continueButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0D5C3A",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonDisabled: { 
    opacity: 0.6 
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  skipButton: {
    alignItems: "center",
    paddingVertical: 16,
    marginTop: 12,
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
    textDecorationLine: "underline",
  },
  progressContainer: {
    marginTop: 32,
    alignItems: "center",
  },
  progressBar: {
    width: "100%",
    height: 8,
    backgroundColor: "#E0E0E0",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#0D5C3A",
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    minHeight: "60%",
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: "#333",
  },
  searchButton: {
    backgroundColor: "#0D5C3A",
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  searchButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
  courseList: {
    flex: 1,
    marginTop: 8,
  },
  courseListContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  courseItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9F9F9",
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  courseItemLeft: {
    flex: 1,
  },
  courseItemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  courseItemLocation: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  courseItemDistance: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
    marginLeft: 12,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 15,
    color: "#999",
    textAlign: "center",
    marginTop: 12,
    paddingHorizontal: 32,
  },
});