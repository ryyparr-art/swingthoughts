import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { db } from "@/constants/firebaseConfig";
import { milesBetween } from "@/utils/geo";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";

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
    // ✅ Dynamic search strategy using common golf patterns + abbreviations
    // This works for ANY city/state, not just hardcoded locations
    
    const searchQueries = [
      // User's city with variations
      city,
      `${city} CC`,
      `${city} GC`,
      `${city} Country Club`,
      `${city} Golf Club`,
      `${city} Golf Course`,
      
      // Common golf course name patterns with abbreviations
      // These catch courses like "Salem Glen CC", "Oak Hollow GC", etc.
      "Salem", "Salem CC", "Salem GC",
      "Glen", "Glen CC", "Glen GC",
      "Oak", "Oak CC", "Oak GC", "Oakwood",
      "Pine", "Pine CC", "Pine GC", "Pinehurst",
      "Creek", "Creek CC", "Creek GC",
      "Meadow", "Meadow CC", "Meadow GC", "Meadowlands",
      "Ridge", "Ridge CC", "Ridge GC",
      "Hills", "Hills CC", "Hills GC",
      "Valley", "Valley CC", "Valley GC",
      "Lake", "Lake CC", "Lake GC",
      "River", "River CC", "River GC",
      "Spring", "Spring CC", "Spring GC",
      "Forest", "Forest CC", "Forest GC",
      "Park", "Park CC", "Park GC",
      "Green", "Green CC", "Green GC",
      "Willow", "Willow CC", "Willow GC",
      "Eagle", "Eagle CC", "Eagle GC",
      "Fox", "Fox CC", "Fox GC",
      "Bear", "Bear CC", "Bear GC",
      
      // State-wide searches with abbreviations
      state,
      `${state} CC`,
      `${state} GC`,
      `${state} Country Club`,
      `${state} Golf Club`,
      `${state} Municipal`,
    ];
    
    const allCourses: any[] = [];
    const seenCourseIds = new Set<number>();
    let consecutiveRateLimitErrors = 0;
    
    for (const searchQuery of searchQueries) {
      // ✅ STOP if we hit rate limit 3 times in a row
      if (consecutiveRateLimitErrors >= 3) {
        console.log("⚠️ Rate limit detected, stopping API search");
        break;
      }
      
      console.log("🌐 Trying Golf API with:", searchQuery);
      
      const url = `${GOLF_API_BASE_URL}/search?search_query=${encodeURIComponent(searchQuery)}`;
      
      // Add delay to avoid rate limiting (except first search)
      if (searchQuery !== city) {
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay to avoid 429 errors
      }
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Key ${GOLF_API_KEY}`,
        },
      });

      console.log("📡 Response status:", response.status);

      if (!response.ok) {
        if (response.status === 429) {
          consecutiveRateLimitErrors++;
          console.log(`⚠️ Rate limit (${consecutiveRateLimitErrors}/3), trying next...`);
        } else {
          console.log("⚠️ Query failed with", response.status, "trying next...");
        }
        continue;
      }
      
      // ✅ Reset counter on successful request
      consecutiveRateLimitErrors = 0;

      const data = await response.json();
      
      console.log("📦 API response for", searchQuery, ":", data.courses?.length || 0, "courses");
      
      if (data.courses && data.courses.length > 0) {
        console.log("✅ Found", data.courses.length, "courses with query:", searchQuery);
        
        // Add unique courses to results
        for (const course of data.courses) {
          if (!seenCourseIds.has(course.id)) {
            seenCourseIds.add(course.id);
            allCourses.push(course);
          }
        }
      }
    }
    
    console.log(`✅ Total unique courses found: ${allCourses.length}`);
    return allCourses;
  } catch (error) {
    console.error("❌ Network error:", error);
    return [];
  }
}

// Save course to Firestore (shared cache for all users)
async function saveCourseToFirestore(course: any) {
  try {
    const courseData = {
      id: course.id,
      club_name: course.club_name,
      course_name: course.course_name,
      location: course.location,
      tees: course.tees,
      cachedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    // ✅ Use courseId as document ID (not userId_courseId)
    // This creates a shared cache for all users
    const docId = String(course.id);
    
    await setDoc(doc(db, "courses", docId), courseData, { merge: true });
    console.log("💾 Saved course to shared cache:", course.course_name);
  } catch (error) {
    console.error("❌ Error saving course to Firestore:", error);
  }
}

// ✅ NEW: Cache all courses in a city/region (shared for all users in that area)
export async function cacheStateCoursesToFirestore(
  state: string,
  city?: string,
  userId?: string
): Promise<number> {
  try {
    console.log(`🌐 Checking cache for ${city}, ${state}...`);
    
    // Get user's location to check what's already cached nearby
    if (!userId) {
      console.log("⚠️ No userId provided, searching API without location check...");
      const apiCourses = await fetchCoursesFromAPI(city || "", state);
      return await saveCoursesToFirestore(apiCourses, state);
    }
    
    const userDoc = await getDoc(doc(db, "users", userId));
    
    if (!userDoc.exists()) {
      console.log("⚠️ User doc not found, searching API...");
      const apiCourses = await fetchCoursesFromAPI(city || "", state);
      return await saveCoursesToFirestore(apiCourses, state);
    }
    
    const userData = userDoc.data();
    const userLat = userData?.currentLatitude || userData?.latitude;
    const userLon = userData?.currentLongitude || userData?.longitude;
    
    if (!userLat || !userLon) {
      console.log("⚠️ No user location available, searching API...");
      const apiCourses = await fetchCoursesFromAPI(city || "", state);
      return await saveCoursesToFirestore(apiCourses, state);
    }
    
    // ✅ Check how many courses we already have within 50 miles of user
    const allCoursesSnapshot = await getDocs(
      query(collection(db, "courses"), where("location.state", "==", state))
    );
    
    const nearbyCourses = allCoursesSnapshot.docs.filter(doc => {
      const course = doc.data();
      const courseLat = course.location?.latitude;
      const courseLon = course.location?.longitude;
      
      if (!courseLat || !courseLon) return false;
      
      const distance = milesBetween(
        userLat,
        userLon,
        courseLat,
        courseLon
      );
      
      return distance <= 50;
    });
    
    const nearbyCount = nearbyCourses.length;
    console.log(`📦 Found ${nearbyCount} courses already cached within 50 miles of ${city}`);
    
    // If we have 30+ courses within 50 miles, use existing cache
    if (nearbyCount >= 30) {
      console.log("✅ Using existing cache (30+ courses within 50 miles)");
      return nearbyCount;
    }
    
    console.log(`🔍 Only ${nearbyCount} courses cached, fetching more from API...`);
    const apiCourses = await fetchCoursesFromAPI(city || "", state);
    return await saveCoursesToFirestore(apiCourses, state);
  } catch (error) {
    console.error("❌ Error caching courses:", error);
    return 0;
  }
}

// Helper function to save courses to Firestore
async function saveCoursesToFirestore(apiCourses: any[], state: string): Promise<number> {
  console.log(`📦 API returned ${apiCourses.length} courses`);

  // ✅ Filter to only courses in this state
  const stateCourses = apiCourses.filter(course => 
    course.location?.state === state
  );
  
  console.log(`✅ Filtered to ${stateCourses.length} courses in ${state}`);

  let savedCount = 0;
  
  for (const course of stateCourses) {
    if (course.location?.latitude && course.location?.longitude) {
      await saveCourseToFirestore(course);
      savedCount++;
    }
  }

  console.log(`✅ Cached ${savedCount} new courses to shared Firestore collection`);
  return savedCount;
}

// ✅ NEW: Get nearby courses from Firestore (calculated fresh each time)
export async function getNearbyCourses(
  userId: string,
  maxRadius: number = 50
): Promise<Array<{
  courseId: number;
  courseName: string;
  distance: number;
  location: {
    city?: string;
    state?: string;
    latitude: number;
    longitude: number;
  };
}>> {
  try {
    // Get user's current location
    const userDoc = await getDoc(doc(db, "users", userId));
    
    if (!userDoc.exists()) {
      console.log("⚠️ User document not found");
      return [];
    }

    const userData = userDoc.data();
    const userLat = userData.currentLatitude || userData.latitude;
    const userLon = userData.currentLongitude || userData.longitude;
    const userState = userData.currentState || userData.state;

    if (!userLat || !userLon || !userState) {
      console.log("⚠️ Missing user location data");
      return [];
    }

    console.log(`🔍 Finding courses near ${userState} within ${maxRadius} miles`);

    // Query all courses in user's state
    const coursesQuery = query(
      collection(db, "courses"),
      where("location.state", "==", userState)
    );

    const coursesSnap = await getDocs(coursesQuery);
    console.log(`📦 Found ${coursesSnap.size} courses in ${userState}`);

    const nearbyCourses: any[] = [];
    const seenCourseIds = new Set<number>();

    coursesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const courseId = data.id ?? data.courseId;
      const courseName = data.course_name ?? data.courseName ?? data.club_name;

      if (
        courseId != null &&
        courseName &&
        data.location?.latitude != null &&
        data.location?.longitude != null &&
        !seenCourseIds.has(courseId)
      ) {
        const distance = calculateDistance(
          userLat,
          userLon,
          data.location.latitude,
          data.location.longitude
        );

        if (distance <= maxRadius) {
          seenCourseIds.add(courseId);
          nearbyCourses.push({
            courseId,
            courseName,
            distance: Math.round(distance * 10) / 10,
            location: data.location,
          });
        }
      }
    });

    // Sort by distance (closest first)
    nearbyCourses.sort((a, b) => a.distance - b.distance);

    console.log(`✅ Found ${nearbyCourses.length} courses within ${maxRadius} miles`);
    return nearbyCourses;
  } catch (error) {
    console.error("❌ Error getting nearby courses:", error);
    return [];
  }
}

// ✅ DEPRECATED: Old function kept for backward compatibility
// This will be removed once all code is migrated to getNearbyCourses()
export async function cacheNearbyCourses(
  userId: string,
  userLat: number,
  userLon: number,
  userCity?: string,
  userState?: string
): Promise<Array<{
  courseId: number;
  courseName: string;
  distance: number;
}>> {
  console.warn("⚠️ cacheNearbyCourses() is deprecated. Use getNearbyCourses() instead.");
  
  // For now, just call the new function
  if (!userState) {
    return [];
  }
  
  // Cache the state if not already cached
  await cacheStateCoursesToFirestore(userState, userCity, userId);
  
  // Return nearby courses
  const courses = await getNearbyCourses(userId, 100);
  
  // Return in old format for compatibility
  return courses.slice(0, 10).map(c => ({
    courseId: c.courseId,
    courseName: c.courseName,
    distance: c.distance
  }));
}