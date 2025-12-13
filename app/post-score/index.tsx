import { auth, db } from "@/constants/firebaseConfig";
import { canPostScores } from "@/utils/canPostScores";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
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
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/* ------------------------------------------------------------------ */

const API_KEY = process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY;
const API_BASE = "https://api.golfcourseapi.com/v1";

const RADIUS_STEPS = [15, 30, 60, 120, 240, 480]; // Expanding radiuses

/* ------------------------------------------------------------------ */

type TeeChoice = "back" | "forward";

type UserLocation = {
  city?: string;
  state?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
};

type Course = {
  id: number;
  course_name: string;
  location: {
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
  };
  tees?: {
    male?: { par_total: number }[];
    female?: { par_total: number }[];
  };
};

/* ------------------------------------------------------------------ */
/* DISTANCE HELPER (MILES)                                             */
/* ------------------------------------------------------------------ */

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ------------------------------------------------------------------ */

export default function PostScoreScreen() {
  const router = useRouter();
  const scrollViewRef = React.useRef<ScrollView>(null);

  const CloseIcon = require("@/assets/icons/Close.png");
  const LocationIcon = require("@/assets/icons/Location Near Me.png");

  const [userData, setUserData] = useState<any>(null);
  const canPost = canPostScores(userData);

  const [location, setLocation] = useState<UserLocation | null>(null);
  const [nearbyCourses, setNearbyCourses] = useState<Course[]>([]);
  const [searchResults, setSearchResults] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [tee, setTee] = useState<TeeChoice>("back");

  const [par, setPar] = useState<number | null>(null);
  const [grossScore, setGrossScore] = useState("");
  const [netScore, setNetScore] = useState<number | null>(null);

/* ========================= LOAD USER ========================= */

  useEffect(() => {
    const loadUser = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        setUserData(snap.data());
        setLocation(snap.data().location || null);
      }
    };
    loadUser();
  }, []);

/* ========================= NET SCORE ========================= */

  useEffect(() => {
    if (!grossScore || !par) return setNetScore(null);
    const g = parseInt(grossScore);
    if (!isNaN(g)) setNetScore(g - (userData?.handicap || 0));
  }, [grossScore, par, userData?.handicap]);

/* ========================= LOCATION ========================= */

  const handleChangeLocation = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert("Change Location", "", [
      {
        text: "Use GPS",
        onPress: async () => {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") return;

          const pos = await Location.getCurrentPositionAsync({});
          const geo = await Location.reverseGeocodeAsync(pos.coords);
          const city = geo[0]?.city;
          const state = geo[0]?.region;

          if (!city || !state) return;

          const loc = {
            city,
            state,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };

          await updateDoc(doc(db, "users", auth.currentUser!.uid), {
            location: loc,
          });

          setLocation(loc);
        },
      },
      {
        text: "Enter ZIP",
        onPress: () => {
          Alert.prompt("ZIP Code", "", async (zip) => {
            if (!zip) return;
            const loc = { zip };
            await updateDoc(doc(db, "users", auth.currentUser!.uid), {
              location: loc,
            });
            setLocation(loc);
          });
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

/* ========================= COURSES ========================= */

  useEffect(() => {
    if (!location?.latitude || !location?.longitude) return;
    loadNearbyCourses();
  }, [location]);

  const loadNearbyCourses = async () => {
    // First check Firebase cache
    const cachedCourses = await loadCoursesFromCache();
    if (cachedCourses.length >= 3) {
      setNearbyCourses(cachedCourses.slice(0, 3));
      return;
    }

    // If no cache, fetch from API with expanding radius
    await fetchCoursesFromAPI();
  };

  const loadCoursesFromCache = async (): Promise<Course[]> => {
    try {
      const q = query(
        collection(db, "courses"),
        where("userId", "==", auth.currentUser!.uid)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as Course);
    } catch (error) {
      console.error("Error loading cached courses:", error);
      return [];
    }
  };

  const fetchCoursesFromAPI = async () => {
    try {
      // First try searching by city
      console.log("Fetching courses for city:", location!.city);
      let res = await fetch(
        `${API_BASE}/search?search_query=${encodeURIComponent(location!.city!)}`,
        { headers: { Authorization: `Key ${API_KEY}` } }
      );
      let data = await res.json();
      let allCourses: Course[] = data.courses || [];
      
      console.log("Total courses from API (city search):", allCourses.length);

      // If we got less than 3 courses and have GPS coordinates, search nearby cities
      if (allCourses.length < 3 && location?.latitude && location?.longitude) {
        console.log("Less than 3 courses, searching nearby cities using GPS...");
        
        // Search in expanding circles: 10, 20, 30 miles
        const searchRadii = [10, 20, 30];
        
        for (const radius of searchRadii) {
          // Calculate approximate lat/lng offsets for the radius
          const latOffset = radius / 69; // roughly 69 miles per degree of latitude
          const lngOffset = radius / (69 * Math.cos(location.latitude * Math.PI / 180));
          
          // Get cities in the bounding box
          const nearbyCities = await findNearbyCities(
            location.latitude,
            location.longitude,
            latOffset,
            lngOffset
          );
          
          console.log(`Searching ${nearbyCities.length} cities within ${radius} miles`);
          
          // Search each nearby city
          for (const city of nearbyCities) {
            try {
              const cityRes = await fetch(
                `${API_BASE}/search?search_query=${encodeURIComponent(city)}`,
                { headers: { Authorization: `Key ${API_KEY}` } }
              );
              const cityData = await cityRes.json();
              if (cityData.courses && cityData.courses.length > 0) {
                allCourses = [...allCourses, ...cityData.courses];
                console.log(`Added ${cityData.courses.length} courses from ${city}`);
              }
            } catch (err) {
              console.log(`Error searching ${city}:`, err);
            }
          }
          
          // Remove duplicates by course ID
          const uniqueCourses = Array.from(
            new Map(allCourses.map(c => [c.id, c])).values()
          );
          allCourses = uniqueCourses;
          
          console.log(`Total unique courses after ${radius} mile search: ${allCourses.length}`);
          
          if (allCourses.length >= 3) break;
        }
      }

      // If still less than 3 courses, try searching by state as last resort
      if (allCourses.length < 3 && location?.state) {
        console.log("Still less than 3 courses, searching by state:", location.state);
        res = await fetch(
          `${API_BASE}/search?search_query=${encodeURIComponent(location.state)}`,
          { headers: { Authorization: `Key ${API_KEY}` } }
        );
        data = await res.json();
        allCourses = data.courses || [];
        console.log("Total courses from API (state search):", allCourses.length);
      }

      if (!location?.latitude || !location?.longitude) {
        // No coordinates, just use first 3
        const topThree = allCourses.slice(0, 3);
        console.log("No user coordinates, using first 3 courses:", topThree.length);
        setNearbyCourses(topThree);
        await cacheCoursesInFirebase(topThree);
        return;
      }

      // Filter to courses with coordinates
      const coursesWithCoords = allCourses.filter(
        c => c.location.latitude && c.location.longitude
      );
      
      console.log("Courses with coordinates:", coursesWithCoords.length);

      // Try each radius until we find at least 3 courses
      for (const radius of RADIUS_STEPS) {
        const within = coursesWithCoords.filter((c) => {
          const distance = haversine(
            location!.latitude!,
            location!.longitude!,
            c.location.latitude!,
            c.location.longitude!
          );
          return distance <= radius;
        });

        console.log(`Within ${radius} miles: ${within.length} courses`);

        if (within.length >= 3) {
          const topThree = within.slice(0, 3);
          console.log("Found 3+ courses, using:", topThree.map(c => c.course_name));
          setNearbyCourses(topThree);
          await cacheCoursesInFirebase(topThree);
          return;
        }
      }

      // If still less than 3 after all radiuses, use whatever we have (with or without coords)
      const topThree = allCourses.slice(0, 3);
      console.log("After all radiuses, using first 3:", topThree.map(c => c.course_name));
      setNearbyCourses(topThree);
      await cacheCoursesInFirebase(topThree);
    } catch (error) {
      console.error("Error fetching courses from API:", error);
    }
  };

  // Helper function to find nearby cities using reverse geocoding
  const findNearbyCities = async (
    lat: number,
    lng: number,
    latOffset: number,
    lngOffset: number
  ): Promise<string[]> => {
    const cities = new Set<string>();
    
    // Sample points in a grid around the location
    const gridPoints = [
      [lat + latOffset, lng],           // North
      [lat - latOffset, lng],           // South
      [lat, lng + lngOffset],           // East
      [lat, lng - lngOffset],           // West
      [lat + latOffset, lng + lngOffset], // NE
      [lat + latOffset, lng - lngOffset], // NW
      [lat - latOffset, lng + lngOffset], // SE
      [lat - latOffset, lng - lngOffset], // SW
    ];

    for (const [pointLat, pointLng] of gridPoints) {
      try {
        const result = await Location.reverseGeocodeAsync({
          latitude: pointLat,
          longitude: pointLng,
        });
        
        if (result[0]?.city && result[0].city !== location?.city) {
          cities.add(result[0].city);
        }
      } catch (err) {
        // Skip points that fail
        continue;
      }
    }

    return Array.from(cities);
  };

  const cacheCoursesInFirebase = async (courses: Course[]) => {
    try {
      for (const course of courses) {
        await setDoc(doc(db, "courses", `${auth.currentUser!.uid}_${course.id}`), {
          ...course,
          userId: auth.currentUser!.uid,
          cachedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error("Error caching courses:", error);
    }
  };

  const searchCourses = async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed || trimmed.length === 0) {
      setSearchResults([]);
      return;
    }
    
    try {
      console.log("Searching for:", trimmed);
      const res = await fetch(
        `${API_BASE}/search?search_query=${encodeURIComponent(trimmed)}`,
        { headers: { Authorization: `Key ${API_KEY}` } }
      );
      const data = await res.json();
      let courses: Course[] = data.courses || [];
      console.log("Search results:", courses.length);
      
      // If we have user location, sort by distance (closest first)
      if (location?.latitude && location?.longitude) {
        courses = courses
          .map(course => {
            // Calculate distance if course has coordinates
            if (course.location.latitude && course.location.longitude) {
              const distance = haversine(
                location.latitude!,
                location.longitude!,
                course.location.latitude,
                course.location.longitude
              );
              return { ...course, distance };
            }
            // Courses without coordinates go to the end
            return { ...course, distance: 999999 };
          })
          .sort((a, b) => a.distance - b.distance);
        
        console.log("Sorted by distance, closest:", courses[0]?.course_name, courses[0]?.distance?.toFixed(1), "miles");
      }
      
      setSearchResults(courses);
    } catch (error) {
      console.error("Error searching courses:", error);
      setSearchResults([]);
    }
  };

  const selectCourse = async (course: Course) => {
    Haptics.selectionAsync();
    setSelectedCourse(course);

    try {
      const res = await fetch(`${API_BASE}/courses/${course.id}`, {
        headers: { Authorization: `Key ${API_KEY}` },
      });
      const data = await res.json();

      const p =
        tee === "back"
          ? data.tees?.male?.[0]?.par_total
          : data.tees?.female?.[0]?.par_total;

      setPar(p ?? 72);
    } catch (error) {
      console.error("Error fetching course details:", error);
      setPar(72); // Default fallback
    }
  };

  // Update par when tee selection changes
  useEffect(() => {
    if (selectedCourse) {
      selectCourse(selectedCourse);
    }
  }, [tee]);

/* ========================= POST SCORE ========================= */

  const handlePostScore = async () => {
    if (!selectedCourse || !grossScore || !par) {
      Alert.alert("Missing Info", "Please select a course and enter your score");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      await addDoc(collection(db, "scores"), {
        userId: auth.currentUser!.uid,
        courseId: selectedCourse.id,
        courseName: selectedCourse.course_name,
        grossScore: Number(grossScore),
        netScore,
        par,
        tee,
        createdAt: serverTimestamp(),
      });

      router.back();
    } catch (error) {
      console.error("Error posting score:", error);
      Alert.alert("Error", "Failed to post score. Please try again.");
    }
  };

  const handleClose = () => {
    if (selectedCourse || grossScore) {
      // User has started entering data, confirm before closing
      Alert.alert(
        "Cancel Score Entry",
        "Are you sure you want to cancel? Your progress will be lost.",
        [
          { text: "Continue Editing", style: "cancel" },
          { 
            text: "Cancel Entry", 
            style: "destructive",
            onPress: () => router.back()
          },
        ]
      );
    } else {
      // Nothing entered yet, just go back
      router.back();
    }
  };

/* ========================= UI ========================= */

  const getCourseCardColor = (index: number) => {
    const colors = ["#E8F5E9", "#FFF3E0", "#E3F2FD"];
    return colors[index % 3];
  };

  return (
    <SafeAreaView style={styles.container}>
      <ImageBackground
        source={require("@/assets/images/PostScoreBackground.png")}
        resizeMode="cover"
        style={styles.backgroundImage}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <Image source={CloseIcon} style={styles.closeIcon} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handlePostScore}>
            <Text style={styles.flag}>⛳</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"} 
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <ScrollView 
            ref={scrollViewRef}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
          {/* LOCATION ROW - Evenly Spaced */}
          <View style={styles.locationRow}>
            <Text style={styles.nearbyLabel}>Nearby</Text>
            <Image source={LocationIcon} style={styles.locationIcon} />
            <Text style={styles.locationText}>
              {location?.city
                ? `${location.city}, ${location.state}`
                : location?.zip || "Not set"}
            </Text>
            <TouchableOpacity onPress={handleChangeLocation}>
              <Text style={styles.change}>Change</Text>
            </TouchableOpacity>
          </View>

          {/* SELECT COURSE - Show nearby or selected */}
          <Text style={styles.sectionTitle}>
            {selectedCourse ? "Selected Course" : "Select Course"}
          </Text>
          <View style={styles.courseCardsContainer}>
            {nearbyCourses.length > 0 ? (
              nearbyCourses.map((c, index) => {
                const isSelected = selectedCourse?.id === c.id;
                const CardWrapper = Platform.OS === "ios" ? BlurView : View;
                const cardProps = Platform.OS === "ios" 
                  ? { intensity: 80, tint: "light" as const }
                  : {};
                
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => selectCourse(c)}
                    style={styles.courseCardTouchable}
                  >
                    <CardWrapper
                      {...cardProps}
                      style={[
                        styles.courseCard,
                        Platform.OS !== "ios" && {
                          backgroundColor: isSelected 
                            ? "rgba(200, 230, 201, 0.85)" 
                            : "rgba(255, 255, 255, 0.75)"
                        },
                        isSelected && styles.courseCardSelected,
                      ]}
                    >
                      <Text style={styles.courseCardText}>{c.course_name}</Text>
                      <Text style={styles.courseCardLocation}>
                        {c.location.city}, {c.location.state}
                      </Text>
                    </CardWrapper>
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text style={styles.noCoursesText}>Loading nearby courses...</Text>
            )}
          </View>

          {/* SEARCH - Live results as user types */}
          <TextInput
            placeholder="Search courses"
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              // Search on every keystroke, no minimum length
              if (text.trim().length > 0) {
                searchCourses();
              } else {
                setSearchResults([]);
              }
            }}
            onFocus={() => {
              // Scroll to make search input visible when keyboard appears
              setTimeout(() => {
                scrollViewRef.current?.scrollTo({ y: 300, animated: true });
              }, 100);
            }}
            style={styles.input}
          />

          {searchResults.length > 0 && (
            <View style={styles.searchResultsContainer}>
              {searchResults.map((c: any) => {
                const SearchWrapper = Platform.OS === "ios" ? BlurView : View;
                const searchProps = Platform.OS === "ios" 
                  ? { intensity: 80, tint: "light" as const }
                  : {};
                
                return (
                  <TouchableOpacity 
                    key={c.id} 
                    onPress={() => {
                      selectCourse(c);
                      setSearchQuery("");
                      setSearchResults([]);
                      // Clear nearby courses and show only selected course
                      setNearbyCourses([c]);
                    }}
                    style={styles.searchRowTouchable}
                  >
                    <SearchWrapper
                      {...searchProps}
                      style={[
                        styles.searchRow,
                        Platform.OS !== "ios" && {
                          backgroundColor: "rgba(255, 255, 255, 0.8)"
                        }
                      ]}
                    >
                      <View style={styles.searchRowContent}>
                        <View style={styles.searchRowLeft}>
                          <Text style={styles.searchRowText}>{c.course_name}</Text>
                          <Text style={styles.searchRowLocation}>
                            {c.location.city}, {c.location.state}
                          </Text>
                        </View>
                        {c.distance && c.distance < 999999 && (
                          <Text style={styles.searchRowDistance}>
                            {c.distance.toFixed(0)} mi
                          </Text>
                        )}
                      </View>
                    </SearchWrapper>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* TEE SELECTION - Color Coded */}
          {selectedCourse && (
            <>
              <View style={styles.toggleRow}>
                <TouchableOpacity 
                  onPress={() => setTee("back")} 
                  style={[
                    styles.teeButton,
                    tee === "back" && styles.teeButtonActive
                  ]}
                >
                  <Text style={[styles.teeText, tee === "back" && styles.teeTextActive, { color: "#000" }]}>
                    Back Tee
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => setTee("forward")} 
                  style={[
                    styles.teeButton,
                    tee === "forward" && styles.teeButtonActive
                  ]}
                >
                  <Text style={[styles.teeText, tee === "forward" && styles.teeTextActive, { color: "#B0433B" }]}>
                    Forward Tee
                  </Text>
                </TouchableOpacity>
              </View>

              {par && <Text style={styles.par}>PAR {par}</Text>}

              <TextInput
                keyboardType="number-pad"
                placeholder="Gross Score"
                value={grossScore}
                onChangeText={setGrossScore}
                onFocus={() => {
                  // Scroll much further to make input visible above keyboard
                  setTimeout(() => {
                    scrollViewRef.current?.scrollTo({ y: 1000, animated: true });
                  }, 300);
                }}
                style={styles.input}
              />

              {netScore !== null && (
                <Text style={styles.net}>Net Score: {netScore}</Text>
              )}
            </>
          )}
          </ScrollView>
        </KeyboardAvoidingView>
      </ImageBackground>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* STYLES                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  
  backgroundImage: {
    flex: 1,
  },
  
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Platform.OS === "ios" ? 300 : 400,
  },
  
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "#0D5C3A",
  },
  closeIcon: { width: 26, height: 26, tintColor: "#FFF" },
  flag: { fontSize: 26 },

  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  nearbyLabel: { 
    fontWeight: "800", 
    fontSize: 16,
  },
  locationIcon: {
    width: 24,
    height: 24,
    tintColor: "#B0433B",
  },
  locationText: { 
    fontWeight: "700",
    fontSize: 15,
  },
  change: { 
    color: "#0D5C3A", 
    fontWeight: "700",
    fontSize: 15,
  },

  sectionTitle: { 
    marginLeft: 16, 
    marginTop: 8,
    marginBottom: 12,
    fontWeight: "800",
    fontSize: 18,
  },

  courseCardsContainer: {
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },

  courseCardTouchable: {
    borderRadius: 14,
    overflow: Platform.OS === "ios" ? "hidden" : "visible",
  },

  courseCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.5)",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    overflow: "hidden",
  },

  courseCardSelected: {
    borderColor: "#0D5C3A",
    borderWidth: 3,
  },

  courseCardText: {
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 4,
    color: "#1a1a1a",
  },

  courseCardLocation: {
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
  },

  noCoursesText: {
    textAlign: "center",
    color: "#666",
    fontStyle: "italic",
    marginVertical: 20,
  },

  input: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 14,
    backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.85)",
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },

  searchResultsContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
  },

  searchRowTouchable: {
    borderRadius: 10,
    overflow: Platform.OS === "ios" ? "hidden" : "visible",
    marginBottom: 8,
  },

  searchRow: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
    overflow: "hidden",
  },

  searchRowContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  searchRowLeft: {
    flex: 1,
  },

  searchRowText: {
    fontWeight: "700",
    fontSize: 15,
    marginBottom: 2,
  },

  searchRowLocation: {
    fontSize: 13,
    color: "#666",
  },

  searchRowDistance: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    marginLeft: 12,
  },

  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 16,
    marginHorizontal: 16,
    gap: 12,
  },

  teeButton: {
    flex: 1,
    padding: 12,
    backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.85)",
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },

  teeButtonActive: {
    backgroundColor: Platform.OS === "ios" ? "rgba(232, 245, 233, 0.9)" : "#E8F5E9",
    borderColor: "#0D5C3A",
    borderWidth: 2,
  },

  teeText: {
    fontSize: 16,
    fontWeight: "600",
  },

  teeTextActive: {
    fontWeight: "900",
  },

  par: { 
    textAlign: "center", 
    marginTop: 12, 
    fontWeight: "800",
    fontSize: 20,
    color: "#0D5C3A",
  },

  net: { 
    textAlign: "center", 
    marginTop: 8,
    marginBottom: 24,
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
});




