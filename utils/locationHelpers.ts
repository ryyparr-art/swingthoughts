import { db } from "@/constants/firebaseConfig";
import { assignRegionFromLocation, getRegionByKey } from "@/utils/regionHelpers";
import * as Location from "expo-location";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Alert } from "react-native";

// ============================================================
// TYPES
// ============================================================

interface LocationData {
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

interface LocationHistory {
  city: string;
  state: string;
  from: string;
  to: string | null;
  scoreCount: number;
}

// ============================================================
// GEO HELPERS
// ============================================================

const toRad = (degrees: number): number => (degrees * Math.PI) / 180;

export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 3959;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return Math.round((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))) * 10) / 10;
};

// ============================================================
// LOCATION RESOLUTION
// ============================================================

export const getCurrentLocation = async (): Promise<LocationData | null> => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return null;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const [geo] = await Location.reverseGeocodeAsync(position.coords);

    if (!geo?.region) return null;

    return {
      city: geo.city || geo.subregion || "",
      state: geo.region,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch (e) {
    console.error("Error getting current location", e);
    return null;
  }
};

// ============================================================
// HISTORY
// ============================================================

const addLocationHistory = async (
  userId: string,
  city: string,
  state: string
) => {
  try {
    const ref = doc(db, "users", userId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const history: LocationHistory[] = snap.data().locationHistory || [];
    const now = new Date().toISOString();

    const active = history.find((h: LocationHistory) => h.to === null);
    if (active) active.to = now;

    history.push({
      city,
      state,
      from: now,
      to: null,
      scoreCount: 0,
    });

    await updateDoc(ref, { locationHistory: history });
  } catch (error) {
    console.error("Error adding location history:", error);
  }
};

export const incrementLocationScoreCount = async (userId: string): Promise<void> => {
  try {
    const ref = doc(db, "users", userId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const history: LocationHistory[] = snap.data().locationHistory || [];
    const activeIndex = history.findIndex((h: LocationHistory) => h.to === null);

    if (activeIndex !== -1) {
      history[activeIndex].scoreCount += 1;
      await updateDoc(ref, { locationHistory: history });
    }
  } catch (error) {
    console.error("Error incrementing score count:", error);
  }
};

// ============================================================
// MAIN UPDATE
// ============================================================

export const updateCurrentLocation = async (
  userId: string,
  location: LocationData,
  method: "gps" | "manual"
): Promise<void> => {
  try {
    const ref = doc(db, "users", userId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const user = snap.data();
    const currentRegionKey = user.regionKey;

    // ✅ Use regionHelpers for consistent region assignment
    const newRegionKey = assignRegionFromLocation(
      location.latitude,
      location.longitude,
      location.city,
      location.state
    );

    const region = getRegionByKey(newRegionKey);

    if (!region) {
      console.error(`❌ Region not found for key: ${newRegionKey}`);
      return;
    }

    console.log(`📍 Updating location: ${location.city}, ${location.state} → ${region.displayName}`);

    const updates: any = {
      currentCity: location.city,
      currentState: location.state,
      currentLatitude: location.latitude, // ✅ Added
      currentLongitude: location.longitude, // ✅ Added
      currentLocationUpdatedAt: new Date().toISOString(),
      locationMethod: method,
    };

    // Only update regionKey if it changed
    if (currentRegionKey !== newRegionKey) {
      updates.regionKey = newRegionKey;
      updates.regionUpdatedAt = new Date().toISOString();
      console.log(`🔄 Region changed: ${currentRegionKey} → ${newRegionKey}`);
    }

    await updateDoc(ref, updates);
    await addLocationHistory(userId, location.city, location.state);

    console.log(`✅ Location updated successfully`);
  } catch (error) {
    console.error("❌ Error updating current location:", error);
  }
};

// ============================================================
// HOME LOCATION
// ============================================================

export const updateHomeLocation = async (
  userId: string,
  city: string,
  state: string,
  latitude: number,
  longitude: number
): Promise<boolean> => {
  try {
    const ref = doc(db, "users", userId);

    // Assign region for home location too
    const regionKey = assignRegionFromLocation(latitude, longitude, city, state);

    await updateDoc(ref, {
      homeCity: city,
      homeState: state,
      homeLatitude: latitude,
      homeLongitude: longitude,
      homeLocation: { city, state },
      // Also update current location to match
      currentCity: city,
      currentState: state,
      currentLatitude: latitude,
      currentLongitude: longitude,
      currentLocation: { city, state },
      currentLocationUpdatedAt: new Date().toISOString(),
      regionKey,
      regionUpdatedAt: new Date().toISOString(),
    });

    await addLocationHistory(userId, city, state);

    console.log(`✅ Home location updated: ${city}, ${state} → ${regionKey}`);
    return true;
  } catch (error) {
    console.error("❌ Error updating home location:", error);
    return false;
  }
};

// ============================================================
// LOCATION CHECK (APP LAUNCH / SCORE POST)
// ============================================================

export const checkAndUpdateLocation = async (
  userId: string,
  options: {
    onScoreSubmission?: boolean;
    courseLatitude?: number;
    courseLongitude?: number;
    courseCity?: string;
    courseState?: string;
  } = {}
): Promise<void> => {
  try {
    const ref = doc(db, "users", userId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const user = snap.data();
    const hasPermission = user.locationPermission === true;

    // ========== GPS USERS (Auto-update) ==========
    if (hasPermission) {
      const loc = await getCurrentLocation();
      if (!loc) return;

      const currentLat = user.currentLatitude || user.latitude;
      const currentLon = user.currentLongitude || user.longitude;

      if (!currentLat || !currentLon) {
        // First time setting location
        console.log("📍 Setting initial location");
        await updateCurrentLocation(userId, loc, "gps");
        return;
      }

      // Check if user moved 15+ miles
      const distance = calculateDistance(
        currentLat,
        currentLon,
        loc.latitude,
        loc.longitude
      );

      console.log(`📏 Distance from last location: ${distance} miles`);

      if (distance >= 15) {
        console.log(`🚗 User moved ${distance} miles - updating location`);
        await updateCurrentLocation(userId, loc, "gps");
      }

      return;
    }

    // ========== NON-GPS USERS (Course-based detection) ==========
    if (
      options.onScoreSubmission &&
      options.courseLatitude &&
      options.courseLongitude &&
      options.courseCity &&
      options.courseState
    ) {
      const currentLat = user.currentLatitude || user.latitude;
      const currentLon = user.currentLongitude || user.longitude;

      if (!currentLat || !currentLon) {
        // No saved location - prompt to set it
        Alert.alert(
          "Set Location?",
          `Set your active location to ${options.courseCity}, ${options.courseState}?`,
          [
            { text: "Not Now", style: "cancel" },
            {
              text: "Set Location",
              onPress: async () => {
                await updateCurrentLocation(
                  userId,
                  {
                    city: options.courseCity!,
                    state: options.courseState!,
                    latitude: options.courseLatitude!,
                    longitude: options.courseLongitude!,
                  },
                  "manual"
                );
              },
            },
          ]
        );
        return;
      }

      const distance = calculateDistance(
        currentLat,
        currentLon,
        options.courseLatitude,
        options.courseLongitude
      );

      console.log(`📍 Course distance from saved location: ${distance} miles`);

      // Prompt if course is 25+ miles away
      if (distance >= 25) {
        Alert.alert(
          "Update Location?",
          `You played in ${options.courseCity}, ${options.courseState} (${distance} miles from your saved location). Update your active location?`,
          [
            { text: "No Thanks", style: "cancel" },
            {
              text: "Update",
              onPress: async () => {
                await updateCurrentLocation(
                  userId,
                  {
                    city: options.courseCity!,
                    state: options.courseState!,
                    latitude: options.courseLatitude!,
                    longitude: options.courseLongitude!,
                  },
                  "manual"
                );

                Alert.alert(
                  "Location Updated",
                  `Your active location is now ${options.courseCity}, ${options.courseState}`
                );
              },
            },
          ]
        );
      }
    }
  } catch (error) {
    console.error("❌ Error in checkAndUpdateLocation:", error);
  }
};

// ============================================================
// PERMISSIONS
// ============================================================

export const requestLocationPermission = async (): Promise<boolean> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("Error requesting location permission:", error);
    return false;
  }
};

export const hasLocationPermission = async (): Promise<boolean> => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("Error checking location permission:", error);
    return false;
  }
};
