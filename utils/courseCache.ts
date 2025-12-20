import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { db } from "@/constants/firebaseConfig";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

// Use your config names
const GOLF_API_KEY = GOLF_COURSE_API_KEY;
const GOLF_API_BASE_URL = GOLF_COURSE_API_URL;

interface CourseData {
  courseId: number;
  courseName: string;
  location: {
    latitude: number;
    longitude: number;
    city?: string;
    state?: string;
    address?: string;
  };
  distance?: number;
}

// Normalize city names (handles "Winston Salem" vs "Winston-Salem")
function normalizeCity(city: string): string {
  return city.toLowerCase().replace(/[\s-]+/g, ""); // Remove spaces and hyphens
}

// Haversine distance calculation (FREE - client-side)
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Fetch courses from Golf Course API by city/state
async function fetchCoursesFromAPI(city: string, state: string) {
  try {
    // Try multiple search strategies
    const searchQueries = [
      city.toLowerCase(), // "pinehurst"
      `${city.toLowerCase()} ${state.toLowerCase()}`, // "pinehurst nc"
      city, // "Pinehurst"
      `${city} ${state}`, // "Pinehurst NC"
    ];
    
    for (const searchQuery of searchQueries) {
      console.log("🌐 Trying Golf API with:", searchQuery);
      
      const url = `${GOLF_API_BASE_URL}/search?search_query=${encodeURIComponent(searchQuery)}`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Key ${GOLF_API_KEY}`,
        },
      });

      console.log("📡 Response status:", response.status);

      if (!response.ok) {
        console.log("⚠️ Query failed with", response.status, "trying next...");
        continue;
      }

      const data = await response.json();
      console.log("📦 API response for", searchQuery, ":", data.courses?.length || 0, "courses");
      
      if (data.courses && data.courses.length > 0) {
        console.log("✅ Found courses with query:", searchQuery);
        return data.courses;
      }
    }
    
    console.warn("⚠️ No courses found with any search query");
    return [];
  } catch (error) {
    console.error("❌ Network error:", error);
    return [];
  }
}

// Save course to Firestore (for future use)
async function saveCourseToFirestore(course: any, userId: string) {
  try {
    const courseData = {
      id: course.id,
      club_name: course.club_name,
      course_name: course.course_name,
      location: course.location,
      tees: course.tees,
      cachedat: new Date().toISOString(),
    };

    // Use a composite document ID (userId_courseId) to track who added it
    const docId = `${userId}_${course.id}`;
    
    await setDoc(doc(db, "courses", docId), courseData, { merge: true });
    console.log("💾 Saved course to Firestore:", course.course_name);
  } catch (error) {
    console.error("❌ Error saving course to Firestore:", error);
  }
}

// Calculate and cache nearby courses
export async function cacheNearbyCourses(
  userId: string,
  userLat: number,
  userLon: number,
  userCity?: string,
  userState?: string
) {
  try {
    console.log("🔍 Finding nearby courses for user:", userId);
    console.log("📍 User location:", { userCity, userState, userLat, userLon });

    let coursesWithDistance: CourseData[] = [];

    // STRATEGY 1: Check Firestore first for cached courses
    let coursesSnap;
    
    if (userState) {
      try {
        const stateQuery = query(
          collection(db, "courses"),
          where("location.state", "==", userState)
        );
        
        console.log(`📍 Querying cached courses in state: ${userState}`);
        coursesSnap = await getDocs(stateQuery);
        console.log(`✅ Found ${coursesSnap.size} cached courses in Firestore`);
      } catch (error) {
        console.log("⚠️ Firestore query failed:", error);
        coursesSnap = null;
      }
    }

    // Process Firestore courses if found
    if (coursesSnap && coursesSnap.size > 0) {
      const normalizedUserCity = userCity ? normalizeCity(userCity) : "";
      
      coursesSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const courseId = data.id ?? data.courseId;
        const courseName = data.course_name ?? data.courseName ?? data.club_name;
        
        if (
          courseId != null && 
          courseName && 
          data.location?.latitude != null && 
          data.location?.longitude != null
        ) {
          const distance = calculateDistance(
            userLat,
            userLon,
            data.location.latitude,
            data.location.longitude
          );
          
          const courseCity = normalizeCity(data.location.city || "");
          const isSameCity = courseCity === normalizedUserCity;
          const adjustedDistance = isSameCity ? distance * 0.9 : distance;
          
          coursesWithDistance.push({
            courseId: courseId,
            courseName: courseName,
            location: data.location,
            distance: adjustedDistance,
          });
        }
      });
    }

    // STRATEGY 2: If not enough Firestore courses, fetch from API
    if (coursesWithDistance.length < 5 && userCity && userState) {
      console.log("🌐 Not enough cached courses, fetching from Golf API...");
      
      const apiCourses = await fetchCoursesFromAPI(userCity, userState);
      
      for (const course of apiCourses) {
        if (course.location?.latitude && course.location?.longitude) {
          const distance = calculateDistance(
            userLat,
            userLon,
            course.location.latitude,
            course.location.longitude
          );
          
          // Only include courses within reasonable distance
          if (distance <= 100) {
            coursesWithDistance.push({
              courseId: course.id,
              courseName: course.course_name || course.club_name,
              location: course.location,
              distance: distance,
            });

            // Save to Firestore for future use
            await saveCourseToFirestore(course, userId);
          }
        }
      }
    }

    console.log(`🎯 Courses with valid locations: ${coursesWithDistance.length}`);

    // Filter by distance and sort
    const MAX_DISTANCE = 100; // miles
    const filteredCourses = coursesWithDistance
      .filter((c) => (c.distance || 999) <= MAX_DISTANCE)
      .sort((a, b) => (a.distance || 999) - (b.distance || 999));

    console.log("🏌️ All nearby courses (within", MAX_DISTANCE, "mi):", filteredCourses.length);

    // Cache top 5 nearest courses to user profile
    const nearbyCourses = filteredCourses
      .slice(0, 5) // Cache up to 5 courses
      .map((c) => ({
        courseId: c.courseId,
        courseName: c.courseName,
        distance: Math.round(c.distance * 10) / 10,
      }));

    console.log("🏌️ Caching top", nearbyCourses.length, "courses:", nearbyCourses);

    // Save to user profile
    await updateDoc(doc(db, "users", userId), {
      cachedCourses: nearbyCourses,
      cacheUpdatedAt: new Date().toISOString(),
    });

    if (nearbyCourses.length > 0) {
      console.log("✅ Cached", nearbyCourses.length, "courses to user profile");
    } else {
      console.log("⚠️ No nearby courses found within", MAX_DISTANCE, "miles");
    }

    return nearbyCourses;
  } catch (error) {
    console.error("❌ Error caching courses:", error);
    throw error;
  }
}

// Get cached courses from user profile
export async function getCachedCourses(userId: string) {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    
    if (!userDoc.exists()) {
      console.log("⚠️ User document not found");
      return [];
    }

    const cached = userDoc.data().cachedCourses || [];
    console.log("📦 Retrieved cached courses:", cached.length);
    
    return cached;
  } catch (error) {
    console.error("❌ Error getting cached courses:", error);
    return [];
  }
}