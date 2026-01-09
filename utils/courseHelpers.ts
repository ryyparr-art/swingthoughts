import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { db } from "@/constants/firebaseConfig";
import { assignRegionFromLocation } from "@/utils/regionHelpers";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";

const GOLF_API_KEY = GOLF_COURSE_API_KEY;
const GOLF_API_BASE_URL = GOLF_COURSE_API_URL;

interface CourseData {
  id: number;
  club_name: string;
  course_name: string;
  location: {
    city: string;
    state: string;
    address?: string;
    latitude: number;
    longitude: number;
  };
  tees: any[];
  regionKey: string; // ✅ NEW: Region assignment
  cachedAt: string;
  lastUpdated: string;
}

/**
 * Fetch courses from Golf Course API by search query
 * 
 * @param searchQuery Search term (city, course name, etc.)
 * @returns Array of courses from API
 */
async function fetchCoursesFromAPI(searchQuery: string): Promise<any[]> {
  try {
    console.log("🌐 Searching Golf API for:", searchQuery);

    const url = `${GOLF_API_BASE_URL}/search?search_query=${encodeURIComponent(
      searchQuery
    )}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Key ${GOLF_API_KEY}`,
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.log("⚠️ Rate limit hit");
      }
      return [];
    }

    const data = await response.json();

    if (data.courses && data.courses.length > 0) {
      console.log("✅ Found", data.courses.length, "courses from API");
      return data.courses;
    }

    return [];
  } catch (error) {
    console.error("❌ API error:", error);
    return [];
  }
}

/**
 * Save a course to Firestore with regionKey assigned
 * 
 * @param course Course data from API
 * @returns The saved course document ID
 */
export async function saveCourseToFirestore(course: any): Promise<string | null> {
  try {
    if (!course.location?.latitude || !course.location?.longitude) {
      console.log("⚠️ Course missing location data, skipping:", course.course_name);
      return null;
    }

    // ✅ Assign region based on course location
    const regionKey = assignRegionFromLocation(
      course.location.latitude,
      course.location.longitude,
      course.location.city || "",
      course.location.state || ""
    );

    const courseData: CourseData = {
      id: course.id,
      club_name: course.club_name,
      course_name: course.course_name,
      location: course.location,
      tees: course.tees || [],
      regionKey, // ✅ Store region assignment
      cachedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    const docId = String(course.id);
    await setDoc(doc(db, "courses", docId), courseData, { merge: true });

    console.log(
      `💾 Saved course: ${course.course_name} → ${regionKey}`
    );

    return docId;
  } catch (error) {
    console.error("❌ Error saving course:", error);
    return null;
  }
}

/**
 * Get a specific course from Firestore by ID
 * If not found, fetch from API and cache
 * 
 * @param courseId Course ID
 * @returns Course data or null
 */
export async function getCourseById(courseId: number): Promise<CourseData | null> {
  try {
    // Check Firestore first
    const courseQuery = query(
      collection(db, "courses"),
      where("id", "==", courseId)
    );
    const courseSnap = await getDocs(courseQuery);

    if (!courseSnap.empty) {
      console.log("✅ Course found in cache:", courseId);
      return courseSnap.docs[0].data() as CourseData;
    }

    // Not in cache - fetch from API
    console.log("🌐 Course not in cache, fetching from API:", courseId);
    
    // Search by course ID (API may not support direct ID lookup)
    // Try searching by ID as string
    const apiCourses = await fetchCoursesFromAPI(courseId.toString());
    
    const matchingCourse = apiCourses.find((c) => c.id === courseId);
    
    if (matchingCourse) {
      await saveCourseToFirestore(matchingCourse);
      
      // Fetch again from Firestore to get complete data with regionKey
      const updatedSnap = await getDocs(courseQuery);
      if (!updatedSnap.empty) {
        return updatedSnap.docs[0].data() as CourseData;
      }
    }

    console.log("⚠️ Course not found:", courseId);
    return null;
  } catch (error) {
    console.error("❌ Error getting course:", error);
    return null;
  }
}

/**
 * Get all courses in a specific region
 * 
 * @param regionKey Region key (e.g., "us_nc_triad")
 * @returns Array of courses in that region
 */
export async function getCoursesInRegion(regionKey: string): Promise<CourseData[]> {
  try {
    console.log("🔍 Fetching courses for region:", regionKey);

    const coursesQuery = query(
      collection(db, "courses"),
      where("regionKey", "==", regionKey)
    );

    const coursesSnap = await getDocs(coursesQuery);

    const courses: CourseData[] = [];
    coursesSnap.forEach((doc) => {
      courses.push(doc.data() as CourseData);
    });

    console.log(`✅ Found ${courses.length} courses in ${regionKey}`);
    return courses;
  } catch (error) {
    console.error("❌ Error fetching courses by region:", error);
    return [];
  }
}

/**
 * Search and cache courses for a region
 * Used for initial hydration when user visits a region with no cached courses
 * 
 * @param regionKey Region key
 * @param city City to search
 * @param state State to search
 * @returns Number of courses cached
 */
export async function hydrateCoursesByRegion(
  regionKey: string,
  city: string,
  state: string
): Promise<number> {
  try {
    console.log(`🔄 Hydrating courses for region: ${regionKey} (${city}, ${state})`);

    // Search strategies
    const searchQueries = [
      city,
      `${city} CC`,
      `${city} Golf`,
      state,
      `${state} Golf`,
    ];

    const allCourses: any[] = [];
    const seenCourseIds = new Set<number>();

    for (const searchQuery of searchQueries) {
      const apiCourses = await fetchCoursesFromAPI(searchQuery);

      // Filter to courses in the correct state
      const stateCourses = apiCourses.filter(
        (c) => c.location?.state === state
      );

      for (const course of stateCourses) {
        if (!seenCourseIds.has(course.id)) {
          seenCourseIds.add(course.id);
          allCourses.push(course);
        }
      }

      // Rate limiting protection
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`📦 Found ${allCourses.length} unique courses from API`);

    let savedCount = 0;
    for (const course of allCourses) {
      const saved = await saveCourseToFirestore(course);
      if (saved) savedCount++;
    }

    console.log(`✅ Hydrated ${savedCount} courses for ${regionKey}`);
    return savedCount;
  } catch (error) {
    console.error("❌ Error hydrating courses:", error);
    return 0;
  }
}

/**
 * Search courses by name or location
 * Searches Firestore first, then falls back to API
 * 
 * @param searchQuery Search term
 * @param state Optional state filter
 * @returns Array of matching courses
 */
export async function searchCourses(
  searchQuery: string,
  state?: string
): Promise<CourseData[]> {
  try {
    console.log("🔍 Searching courses:", searchQuery);

    // Search Firestore first
    let firestoreQuery = query(collection(db, "courses"));

    if (state) {
      firestoreQuery = query(
        collection(db, "courses"),
        where("location.state", "==", state)
      );
    }

    const coursesSnap = await getDocs(firestoreQuery);
    const firestoreCourses: CourseData[] = [];

    coursesSnap.forEach((doc) => {
      const data = doc.data() as CourseData;
      const searchLower = searchQuery.toLowerCase();

      if (
        data.course_name?.toLowerCase().includes(searchLower) ||
        data.club_name?.toLowerCase().includes(searchLower) ||
        data.location?.city?.toLowerCase().includes(searchLower)
      ) {
        firestoreCourses.push(data);
      }
    });

    if (firestoreCourses.length > 0) {
      console.log(`✅ Found ${firestoreCourses.length} courses in cache`);
      return firestoreCourses;
    }

    // Not in cache - try API
    console.log("🌐 No cache results, searching API...");
    const apiCourses = await fetchCoursesFromAPI(searchQuery);

    // Filter by state if provided
    const filtered = state
      ? apiCourses.filter((c) => c.location?.state === state)
      : apiCourses;

    // Save to cache
    for (const course of filtered) {
      await saveCourseToFirestore(course);
    }

    // Return with regionKeys
    const savedCourses: CourseData[] = [];
    for (const course of filtered) {
      const courseQuery = query(
        collection(db, "courses"),
        where("id", "==", course.id)
      );
      const snap = await getDocs(courseQuery);
      if (!snap.empty) {
        savedCourses.push(snap.docs[0].data() as CourseData);
      }
    }

    return savedCourses;
  } catch (error) {
    console.error("❌ Error searching courses:", error);
    return [];
  }
}

/**
 * Batch update existing courses with regionKeys
 * Used for migration - can be run multiple times safely
 * 
 * @returns Number of courses updated
 */
export async function backfillCourseRegions(): Promise<number> {
  try {
    console.log("🔄 Starting course region backfill...");

    const coursesSnap = await getDocs(collection(db, "courses"));
    let updatedCount = 0;

    for (const docSnap of coursesSnap.docs) {
      const data = docSnap.data();

      // Skip if already has regionKey
      if (data.regionKey) continue;

      // Skip if missing location
      if (!data.location?.latitude || !data.location?.longitude) {
        console.log("⚠️ Skipping course with no location:", data.course_name);
        continue;
      }

      // Assign region
      const regionKey = assignRegionFromLocation(
        data.location.latitude,
        data.location.longitude,
        data.location.city || "",
        data.location.state || ""
      );

      // Update document
      await setDoc(
        doc(db, "courses", docSnap.id),
        { regionKey },
        { merge: true }
      );

      updatedCount++;
      console.log(`✅ Updated ${data.course_name} → ${regionKey}`);
    }

    console.log(`✅ Backfill complete: ${updatedCount} courses updated`);
    return updatedCount;
  } catch (error) {
    console.error("❌ Error in backfill:", error);
    return 0;
  }
}