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
import { SafeAreaView } from "react-native-safe-area-context";

const API_KEY = process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY;
const API_BASE = "https://api.golfcourseapi.com/v1";

/* ---------------- TYPES ---------------- */

interface Clubs {
  driver?: string;
  irons?: string;
  wedges?: string;
  putter?: string;
  ball?: string;
}

interface Badge {
  type: string;
  displayName: string;
  courseName?: string;
  achievedAt?: any;
  score?: number;
  courseId?: number;
}

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

export default function ModifyLockerScreen() {
  const router = useRouter();
  const userId = auth.currentUser?.uid;

  // User location for distance calc
  const [location, setLocation] = useState<UserLocation | null>(null);

  // Course selection state
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [cachedCourses, setCachedCourses] = useState<Course[]>([]);
  const [searchResults, setSearchResults] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [searching, setSearching] = useState(false);

  // Identity fields
  const [gameIdentity, setGameIdentity] = useState("");

  // Equipment fields
  const [clubs, setClubs] = useState<Clubs>({
    driver: "",
    irons: "",
    wedges: "",
    putter: "",
    ball: "",
  });

  // Badge selection
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [selectedBadges, setSelectedBadges] = useState<Badge[]>([]);
  const [showBadgeModal, setShowBadgeModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLockerData();
  }, []);

  const fetchLockerData = async () => {
    if (!userId) return;

    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        
        // Load user location
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
        
        // Load home course
        if (data.homeCourse) {
          if (typeof data.homeCourse === 'object') {
            setSelectedCourse(data.homeCourse);
          } else {
            // Legacy string format - convert to object
            setSelectedCourse({ courseName: data.homeCourse });
          }
        }
        
        // Load identity
        setGameIdentity(data.gameIdentity || "");
        
        // Load equipment
        setClubs({
          driver: data.clubs?.driver || "",
          irons: data.clubs?.irons || "",
          wedges: data.clubs?.wedges || "",
          putter: data.clubs?.putter || "",
          ball: data.clubs?.ball || "",
        });

        // Load badges
        const badgesData = data.Badges || [];
        const validBadges = badgesData.filter((badge: any) => {
          if (!badge) return false;
          if (typeof badge === "string" && badge.trim() === "") return false;
          return true;
        });
        setAllBadges(validBadges);

        // Load selected badges (or default to first 3)
        const displayBadges = data.displayBadges || validBadges.slice(0, 3);
        setSelectedBadges(displayBadges);
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Error fetching locker data:", error);
      soundPlayer.play('error');
      setLoading(false);
    }
  };

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
        const { collection: firestoreCollection, getDocs, query: firestoreQuery, where, limit } = await import("firebase/firestore");
        
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

  /* ---------------- SAVE ---------------- */
  const handleSave = async () => {
    if (!userId) return;

    try {
      soundPlayer.play('click');
      setSaving(true);

      const updateData: any = {
        gameIdentity: gameIdentity.trim(),
        clubs: clubs,
        displayBadges: selectedBadges,
        updatedAt: new Date().toISOString(),
      };

      // Save home course as object with full details
      if (selectedCourse) {
        updateData.homeCourse = {
          courseId: selectedCourse.id || selectedCourse.courseId,
          courseName: selectedCourse.course_name || selectedCourse.courseName,
          location: selectedCourse.location || null,
        };
        // Also save as string for backwards compatibility / display
        updateData.homeCourseName = selectedCourse.course_name || selectedCourse.courseName;
      } else {
        // Clear home course if none selected
        updateData.homeCourse = null;
        updateData.homeCourseName = null;
      }

      await setDoc(doc(db, "users", userId), updateData, { merge: true });

      soundPlayer.play('postThought');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      if (Platform.OS === 'web') {
        alert("Locker updated successfully!");
      } else {
        Alert.alert("Success", "Locker updated successfully!");
      }
      
      router.replace("/locker");
    } catch (error) {
      console.error("Error saving locker:", error);
      soundPlayer.play('error');
      setSaving(false);
      
      if (Platform.OS === 'web') {
        alert("Failed to update locker. Please try again.");
      } else {
        Alert.alert("Error", "Failed to update locker. Please try again.");
      }
    }
  };

  const handleClear = (field: keyof Clubs) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setClubs({ ...clubs, [field]: "" });
  };

  const handleSaveBadgeSelection = (badges: Badge[]) => {
    setSelectedBadges(badges);
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />
      
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => {
              soundPlayer.play('click');
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

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Identity Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Golf Identity</Text>

            {/* Home Course - Now with search */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <View style={styles.labelWithIcon}>
                  <Ionicons name="flag" size={16} color="#0D5C3A" />
                  <Text style={styles.label}>HOME COURSE</Text>
                </View>
                {selectedCourse && (
                  <TouchableOpacity onPress={clearSelectedCourse}>
                    <Text style={styles.clearButton}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              
              {selectedCourse ? (
                <TouchableOpacity
                  style={styles.selectedCourseContainer}
                  onPress={() => {
                    soundPlayer.play('click');
                    setShowCourseModal(true);
                  }}
                >
                  <View style={styles.selectedCourseInfo}>
                    <Text style={styles.selectedCourseName}>
                      {selectedCourse.course_name || selectedCourse.courseName}
                    </Text>
                    {selectedCourse.location && (
                      <Text style={styles.selectedCourseLocation}>
                        {selectedCourse.location.city}, {selectedCourse.location.state}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#0D5C3A" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.courseSelectButton}
                  onPress={() => {
                    soundPlayer.play('click');
                    setShowCourseModal(true);
                  }}
                >
                  <Text style={styles.courseSelectButtonText}>
                    Select your home course
                  </Text>
                  <Ionicons name="chevron-forward" size={20} color="#666" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <View style={styles.labelWithIcon}>
                  <Ionicons name="chatbubble-ellipses" size={16} color="#0D5C3A" />
                  <Text style={styles.label}>GAME IDENTITY</Text>
                </View>
                {gameIdentity !== "" && (
                  <TouchableOpacity 
                    onPress={() => {
                      soundPlayer.play('click');
                      setGameIdentity("");
                    }}
                  >
                    <Text style={styles.clearButton}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.input}
                placeholder='e.g., "Short game king" or "3-putt champion"'
                placeholderTextColor="#999"
                value={gameIdentity}
                onChangeText={setGameIdentity}
                autoCapitalize="sentences"
                maxLength={60}
              />
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Achievements Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Achievements</Text>
            <Text style={styles.sectionSubtitle}>
              Select up to 3 badges to display in your locker
            </Text>

            <TouchableOpacity
              style={styles.selectBadgesButton}
              onPress={() => {
                soundPlayer.play('click');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowBadgeModal(true);
              }}
            >
              <View style={styles.selectBadgesContent}>
                <Ionicons name="trophy" size={20} color="#0D5C3A" />
                <Text style={styles.selectBadgesText}>
                  Select Your Achievements to Display
                </Text>
                <View style={styles.badgeCount}>
                  <Text style={styles.badgeCountText}>
                    {selectedBadges.length}/3
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </TouchableOpacity>

            {selectedBadges.length > 0 && (
              <View style={styles.selectedBadgesPreview}>
                <Text style={styles.previewLabel}>Currently Selected:</Text>
                {selectedBadges.map((badge, index) => (
                  <View key={index} style={styles.previewBadge}>
                    <Text style={styles.previewBadgeNumber}>{index + 1}.</Text>
                    <Text style={styles.previewBadgeText}>
                      {badge.displayName}
                      {badge.courseName && ` • ${badge.courseName}`}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Equipment Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Equipment</Text>
            <Text style={styles.sectionSubtitle}>
              Leave fields blank if you don't want to display them
            </Text>

            {/* Driver */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>DRIVER</Text>
                {clubs.driver !== "" && (
                  <TouchableOpacity onPress={() => handleClear("driver")}>
                    <Text style={styles.clearButton}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g., TaylorMade Stealth • 9°"
                placeholderTextColor="#999"
                value={clubs.driver}
                onChangeText={(text) => setClubs({ ...clubs, driver: text })}
              />
            </View>

            {/* Irons */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>IRONS</Text>
                {clubs.irons !== "" && (
                  <TouchableOpacity onPress={() => handleClear("irons")}>
                    <Text style={styles.clearButton}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g., Titleist T200"
                placeholderTextColor="#999"
                value={clubs.irons}
                onChangeText={(text) => setClubs({ ...clubs, irons: text })}
              />
            </View>

            {/* Wedges */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>WEDGES</Text>
                {clubs.wedges !== "" && (
                  <TouchableOpacity onPress={() => handleClear("wedges")}>
                    <Text style={styles.clearButton}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g., Vokey SM9 • 52° 56° 60°"
                placeholderTextColor="#999"
                value={clubs.wedges}
                onChangeText={(text) => setClubs({ ...clubs, wedges: text })}
              />
            </View>

            {/* Putter */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>PUTTER</Text>
                {clubs.putter !== "" && (
                  <TouchableOpacity onPress={() => handleClear("putter")}>
                    <Text style={styles.clearButton}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g., Scotty Cameron Newport 2"
                placeholderTextColor="#999"
                value={clubs.putter}
                onChangeText={(text) => setClubs({ ...clubs, putter: text })}
              />
            </View>

            {/* Ball */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>BALL</Text>
                {clubs.ball !== "" && (
                  <TouchableOpacity onPress={() => handleClear("ball")}>
                    <Text style={styles.clearButton}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.input}
                placeholder="e.g., Titleist Pro V1"
                placeholderTextColor="#999"
                value={clubs.ball}
                onChangeText={(text) => setClubs({ ...clubs, ball: text })}
              />
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity 
            style={[styles.saveButton, saving && styles.saveButtonDisabled]} 
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.saveButtonText}>Saving...</Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
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
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowBadgeModal(false);
        }}
        onSave={handleSaveBadgeSelection}
      />

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
                    <Text style={styles.courseSectionHeader}>Recent Courses</Text>
                  ) : searchResults.length > 0 ? (
                    <Text style={styles.courseSectionHeader}>Search Results</Text>
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
    </View>
  );
}

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

  section: {
    marginBottom: 24,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  sectionSubtitle: {
    fontSize: 13,
    color: "#666",
    marginBottom: 16,
  },

  divider: {
    height: 1,
    backgroundColor: "#E0E0E0",
    marginVertical: 24,
  },

  inputGroup: {
    marginBottom: 20,
  },

  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  labelWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D5C3A",
    letterSpacing: 1,
  },

  clearButton: {
    fontSize: 12,
    fontWeight: "600",
    color: "#DC2626",
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#333",
    borderWidth: 2,
    borderColor: "#E0E0E0",
  },

  // Course Selection
  courseSelectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#E0E0E0",
  },
  courseSelectButtonText: {
    fontSize: 16,
    color: "#999",
  },
  selectedCourseContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },
  selectedCourseInfo: {
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

  // Badge Selection Button
  selectBadgesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },

  selectBadgesContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  selectBadgesText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0D5C3A",
    flex: 1,
  },

  badgeCount: {
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  badgeCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Selected Badges Preview
  selectedBadgesPreview: {
    marginTop: 12,
    backgroundColor: "#F0F7F4",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#0D5C3A",
  },

  previewLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
    letterSpacing: 0.5,
  },

  previewBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },

  previewBadgeNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0D5C3A",
    marginRight: 8,
    width: 20,
  },

  previewBadgeText: {
    fontSize: 13,
    color: "#333",
    flex: 1,
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
  courseSectionHeader: {
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