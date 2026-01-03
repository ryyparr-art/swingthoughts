import { db } from "@/constants/firebaseConfig";
import * as Location from "expo-location";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Alert } from "react-native";

interface LocationData {
  city: string;
  state: string;
}

interface LocationHistory {
  city: string;
  state: string;
  from: string;
  to: string | null;
  scoreCount: number;
}

/**
 * Calculate distance between two coordinates in miles
 */
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 10) / 10; // Round to 1 decimal
};

const toRad = (degrees: number): number => {
  return (degrees * Math.PI) / 180;
};

/**
 * Get current GPS location and reverse geocode to city/state
 */
export const getCurrentLocation = async (): Promise<LocationData | null> => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") {
      return null;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const [geocode] = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });

    const city = geocode.city || geocode.subregion || "";
    const state = geocode.region || "";

    if (!city || !state) return null;

    return { city, state };
  } catch (error) {
    console.error("Error getting current location:", error);
    return null;
  }
};

/**
 * Get coordinates for a city/state (for distance calculations)
 */
export const getCityCoordinates = async (
  city: string,
  state: string
): Promise<{ latitude: number; longitude: number } | null> => {
  try {
    const results = await Location.geocodeAsync(`${city}, ${state}`);
    if (results && results.length > 0) {
      return {
        latitude: results[0].latitude,
        longitude: results[0].longitude,
      };
    }
    return null;
  } catch (error) {
    console.error("Error geocoding city:", error);
    return null;
  }
};

/**
 * Add entry to location history
 */
const addLocationHistory = async (
  userId: string,
  city: string,
  state: string
) => {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) return;

    const history: LocationHistory[] = userDoc.data().locationHistory || [];
    const now = new Date().toISOString();

    // Close current active location (if exists)
    const activeIndex = history.findIndex((h) => h.to === null);
    if (activeIndex !== -1) {
      history[activeIndex].to = now;
    }

    // Check if we're returning to a previous location
    const existingIndex = history.findIndex(
      (h) => h.city === city && h.state === state
    );

    if (existingIndex !== -1) {
      // Returning to previous location - reopen it
      history[existingIndex].to = null;
      history[existingIndex].from = now;
    } else {
      // New location - add to history
      history.push({
        city,
        state,
        from: now,
        to: null,
        scoreCount: 0,
      });
    }

    await updateDoc(userRef, {
      locationHistory: history,
    });
  } catch (error) {
    console.error("Error updating location history:", error);
  }
};

/**
 * Increment score count for current location in history
 */
export const incrementLocationScoreCount = async (userId: string) => {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) return;

    const history: LocationHistory[] = userDoc.data().locationHistory || [];
    const activeIndex = history.findIndex((h) => h.to === null);

    if (activeIndex !== -1) {
      history[activeIndex].scoreCount += 1;
      await updateDoc(userRef, { locationHistory: history });
    }
  } catch (error) {
    console.error("Error incrementing score count:", error);
  }
};

/**
 * Check if user should update home location (been away 7+ days)
 */
const shouldPromptHomeLocationChange = async (
  userId: string,
  newCity: string,
  newState: string
): Promise<boolean> => {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) return false;

    const userData = userDoc.data();
    const homeCity = userData.homeCity;
    const homeState = userData.homeState;
    const currentLocationUpdatedAt = userData.currentLocationUpdatedAt;

    // If new location matches home, no prompt needed
    if (newCity === homeCity && newState === homeState) return false;

    // Check if been away for 7+ days
    if (currentLocationUpdatedAt) {
      const daysSinceUpdate =
        (Date.now() - new Date(currentLocationUpdatedAt).getTime()) /
        (1000 * 60 * 60 * 24);

      // Also check distance from home
      const homeCoords = await getCityCoordinates(homeCity, homeState);
      const newCoords = await getCityCoordinates(newCity, newState);

      if (homeCoords && newCoords) {
        const distance = calculateDistance(
          homeCoords.latitude,
          homeCoords.longitude,
          newCoords.latitude,
          newCoords.longitude
        );

        // Prompt if 100+ miles away for 7+ days
        return distance > 100 && daysSinceUpdate >= 7;
      }
    }

    return false;
  } catch (error) {
    console.error("Error checking home location change:", error);
    return false;
  }
};

/**
 * Prompt user to update home location
 */
const promptHomeLocationChange = (
  city: string,
  state: string,
  onConfirm: () => void
) => {
  Alert.alert(
    "Update Home Location?",
    `You've been playing in ${city}, ${state} for a while. Would you like to update your home location?`,
    [
      {
        text: "Keep Current Home",
        style: "cancel",
      },
      {
        text: "Update Home",
        onPress: onConfirm,
      },
    ]
  );
};

/**
 * Update current location (active location for leaderboards)
 */
export const updateCurrentLocation = async (
  userId: string,
  city: string,
  state: string,
  silent: boolean = true
): Promise<boolean> => {
  try {
    const userRef = doc(db, "users", userId);
    const now = new Date().toISOString();

    await updateDoc(userRef, {
      currentCity: city,
      currentState: state,
      currentLocation: { city, state },
      currentLocationUpdatedAt: now,
      locationMethod: silent ? "gps" : "manual",
    });

    // Add to location history
    await addLocationHistory(userId, city, state);

    return true;
  } catch (error) {
    console.error("Error updating current location:", error);
    return false;
  }
};

/**
 * Update home location (identity/profile location)
 */
export const updateHomeLocation = async (
  userId: string,
  city: string,
  state: string
): Promise<boolean> => {
  try {
    const userRef = doc(db, "users", userId);

    await updateDoc(userRef, {
      homeCity: city,
      homeState: state,
      homeLocation: { city, state },
      // Also update current location to match
      currentCity: city,
      currentState: state,
      currentLocation: { city, state },
      currentLocationUpdatedAt: new Date().toISOString(),
    });

    // Add to location history
    await addLocationHistory(userId, city, state);

    return true;
  } catch (error) {
    console.error("Error updating home location:", error);
    return false;
  }
};

/**
 * Main location check - called on app launch or score submission
 */
export const checkAndUpdateLocation = async (
  userId: string,
  options: {
    courseCity?: string;
    courseState?: string;
    courseLatitude?: number;
    courseLongitude?: number;
    onScoreSubmission?: boolean;
  } = {}
): Promise<void> => {
  try {
    // Get user data
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) return;

    const userData = userDoc.data();
    const hasLocationPermission = userData.locationPermission === true;
    const currentCity = userData.currentCity || userData.homeCity;
    const currentState = userData.currentState || userData.homeState;

    // ========== GPS USERS (Auto-update) ==========
    if (hasLocationPermission) {
      const newLocation = await getCurrentLocation();

      if (newLocation && newLocation.city && newLocation.state) {
        // Get coordinates for distance calculation
        const currentCoords = await getCityCoordinates(currentCity, currentState);
        const newCoords = await getCityCoordinates(
          newLocation.city,
          newLocation.state
        );

        if (currentCoords && newCoords) {
          const distance = calculateDistance(
            currentCoords.latitude,
            currentCoords.longitude,
            newCoords.latitude,
            newCoords.longitude
          );

          console.log(
            `📍 Distance from current location: ${distance} miles`
          );

          // AUTO-UPDATE if 15+ miles away
          if (distance >= 15) {
            console.log(
              `✅ Auto-updating location to ${newLocation.city}, ${newLocation.state}`
            );

            await updateCurrentLocation(
              userId,
              newLocation.city,
              newLocation.state,
              true
            );

            // Check if should prompt home location change
            const shouldPrompt = await shouldPromptHomeLocationChange(
              userId,
              newLocation.city,
              newLocation.state
            );

            if (shouldPrompt) {
              promptHomeLocationChange(
                newLocation.city,
                newLocation.state,
                async () => {
                  await updateHomeLocation(
                    userId,
                    newLocation.city,
                    newLocation.state
                  );
                }
              );
            }
          }
        }
      }
      return;
    }

    // ========== NON-GPS USERS (Course-based detection) ==========
    if (
      options.onScoreSubmission &&
      options.courseCity &&
      options.courseState &&
      options.courseLatitude &&
      options.courseLongitude
    ) {
      const currentCoords = await getCityCoordinates(currentCity, currentState);

      if (currentCoords) {
        const distance = calculateDistance(
          currentCoords.latitude,
          currentCoords.longitude,
          options.courseLatitude,
          options.courseLongitude
        );

        console.log(
          `📍 Course distance from saved location: ${distance} miles`
        );

        // PROMPT if course is 25+ miles away
        if (distance >= 25) {
          Alert.alert(
            "Update Location?",
            `You played in ${options.courseCity}, ${options.courseState} (${distance} miles from your saved location). Update your active location?`,
            [
              {
                text: "No Thanks",
                style: "cancel",
              },
              {
                text: "Update",
                onPress: async () => {
                  await updateCurrentLocation(
                    userId,
                    options.courseCity!,
                    options.courseState!,
                    false
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
    }
  } catch (error) {
    console.error("Error in checkAndUpdateLocation:", error);
  }
};

/**
 * Request location permissions
 */
export const requestLocationPermission = async (): Promise<boolean> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("Error requesting location permission:", error);
    return false;
  }
};

/**
 * Check if user has location permissions
 */
export const hasLocationPermission = async (): Promise<boolean> => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("Error checking location permission:", error);
    return false;
  }
};