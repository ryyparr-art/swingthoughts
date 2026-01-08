import { auth, db } from "@/constants/firebaseConfig";
import { cacheStateCoursesToFirestore } from "@/utils/courseCache";
import * as Location from "expo-location";
import { doc, getDoc, updateDoc } from "firebase/firestore";

// Haversine distance calculation
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

interface LocationUpdate {
  updated: boolean;
  newLocation?: {
    city: string;
    state: string;
    lat: number;
    lon: number;
  };
  distance?: number;
}

/**
 * Check and update user's location if they've moved 15+ miles
 * Call this on app mount
 */
export async function checkAndUpdateLocation(): Promise<LocationUpdate> {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      console.log("⚠️ No authenticated user");
      return { updated: false };
    }

    // Check if we have location permission
    const { status } = await Location.getForegroundPermissionsAsync();
    
    if (status !== "granted") {
      console.log("📍 Location permission not granted");
      return { updated: false };
    }

    console.log("📍 Checking user location...");

    // Get current GPS location
    const currentPosition = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const currentLat = currentPosition.coords.latitude;
    const currentLon = currentPosition.coords.longitude;

    // Reverse geocode to get city/state
    const [address] = await Location.reverseGeocodeAsync({
      latitude: currentLat,
      longitude: currentLon,
    });

    if (!address.city || !address.region) {
      console.log("⚠️ Could not determine city/state from GPS");
      return { updated: false };
    }

    const newCity = address.city;
    const newState = address.region;

    // Get user's last known location
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) {
      console.log("⚠️ User document not found");
      return { updated: false };
    }

    const userData = userDoc.data();
    const lastLat = userData.currentLatitude || userData.latitude;
    const lastLon = userData.currentLongitude || userData.longitude;
    const lastCity = userData.currentCity || userData.city;
    const lastState = userData.currentState || userData.state;

    if (!lastLat || !lastLon) {
      console.log("⚠️ No previous location stored");
      // First time setting location - update it
      await updateDoc(doc(db, "users", uid), {
        currentCity: newCity,
        currentState: newState,
        currentLatitude: currentLat,
        currentLongitude: currentLon,
        lastLocationUpdate: new Date(),
      });

      // ✅ Cache all courses in user's state (shared for all users)
      console.log("🔄 Caching courses for state:", newState);
      await cacheStateCoursesToFirestore(newState, newCity);

      console.log(`✅ Initial location set: ${newCity}, ${newState}`);
      return {
        updated: true,
        newLocation: {
          city: newCity,
          state: newState,
          lat: currentLat,
          lon: currentLon,
        },
      };
    }

    // Calculate distance from last known location
    const distance = calculateDistance(currentLat, currentLon, lastLat, lastLon);
    console.log(`📏 Distance from last location: ${distance.toFixed(1)} miles`);

    // Only update if moved 15+ miles
    const DISTANCE_THRESHOLD = 15; // miles

    if (distance >= DISTANCE_THRESHOLD) {
      console.log(`🚗 User has moved ${distance.toFixed(1)} miles - updating location`);

      // Update user's current location
      await updateDoc(doc(db, "users", uid), {
        currentCity: newCity,
        currentState: newState,
        currentLatitude: currentLat,
        currentLongitude: currentLon,
        lastLocationUpdate: new Date(),
      });

      // ✅ Cache all courses in new state (shared for all users)
      console.log("🔄 Caching courses for new state:", newState);
      await cacheStateCoursesToFirestore(newState, newCity);

      console.log(`✅ Location updated: ${lastCity}, ${lastState} → ${newCity}, ${newState}`);

      return {
        updated: true,
        newLocation: {
          city: newCity,
          state: newState,
          lat: currentLat,
          lon: currentLon,
        },
        distance,
      };
    } else {
      console.log("✅ Location unchanged (within 15 miles)");
      return { updated: false, distance };
    }
  } catch (error) {
    console.error("❌ Error checking location:", error);
    return { updated: false };
  }
}

/**
 * Request location permission
 */
export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("Error requesting location permission:", error);
    return false;
  }
}

/**
 * Check if we have location permission
 */
export async function hasLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("Error checking location permission:", error);
    return false;
  }
}