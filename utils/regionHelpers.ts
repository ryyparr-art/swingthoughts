import { REGIONS, Region } from "@/constants/regions";
import { milesBetween } from "@/utils/geo";

/**
 * Calculate geohash for a given lat/lon (4 characters)
 * Used for region matching
 */
function encodeGeohash(latitude: number, longitude: number, precision: number = 4): string {
  const BASE32: string = "0123456789bcdefghjkmnpqrstuvwxyz";
  let idx: number = 0;
  let bit: number = 0;
  let evenBit: boolean = true;
  let geohash: string = "";

  let latMin: number = -90;
  let latMax: number = 90;
  let lonMin: number = -180;
  let lonMax: number = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const lonMid: number = (lonMin + lonMax) / 2;
      if (longitude > lonMid) {
        idx |= (1 << (4 - bit));
        lonMin = lonMid;
      } else {
        lonMax = lonMid;
      }
    } else {
      const latMid: number = (latMin + latMax) / 2;
      if (latitude > latMid) {
        idx |= (1 << (4 - bit));
        latMin = latMid;
      } else {
        latMax = latMid;
      }
    }
    evenBit = !evenBit;

    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32[idx];
      bit = 0;
      idx = 0;
    }
  }

  return geohash;
}

/**
 * Assign a region to a user based on their location
 * 
 * Strategy:
 * 1. Try geohash match (most accurate)
 * 2. Try nearest region within 100 miles
 * 3. Fall back to state misc region
 * 
 * @param lat User's latitude
 * @param lon User's longitude
 * @param city User's city (for logging)
 * @param state User's state (for fallback)
 * @returns regionKey (e.g., "us_nc_triad" or "us_nc_misc")
 */
export function assignRegionFromLocation(
  lat: number,
  lon: number,
  city: string,
  state: string
): string {
  console.log(`🔍 Assigning region for: ${city}, ${state} (${lat}, ${lon})`);

  // Step 1: Try geohash match
  const userGeohash4: string = encodeGeohash(lat, lon, 4);
  console.log(`📍 User geohash: ${userGeohash4}`);

  const geohashMatch: Region | undefined = REGIONS.find((r: Region) =>
    r.geohashPrefixes.includes(userGeohash4)
  );

  if (geohashMatch) {
    console.log(`✅ Geohash match found: ${geohashMatch.displayName}`);
    return geohashMatch.key;
  }

  console.log("⚠️ No geohash match, finding nearest region...");

  // Step 2: Find nearest region within 100 miles
  const nearestRegion: { region: Region; distance: number } | null = findNearestRegion(lat, lon);

  if (nearestRegion && nearestRegion.distance <= 100) {
    console.log(
      `✅ Nearest region within 100 miles: ${nearestRegion.region.displayName} (${nearestRegion.distance.toFixed(1)} mi)`
    );
    return nearestRegion.region.key;
  }

  // Step 3: Fall back to state misc
  const stateLower: string = state.toLowerCase();
  const fallbackKey: string = `us_${stateLower}_misc`;
  
  console.log(`⚠️ No region within 100 miles, using state fallback: ${fallbackKey}`);
  
  return fallbackKey;
}

/**
 * Find the nearest region to a given location
 * 
 * @param lat Latitude
 * @param lon Longitude
 * @returns Object with nearest region and distance, or null
 */
export function findNearestRegion(
  lat: number,
  lon: number
): { region: Region; distance: number } | null {
  const nonFallbackRegions: Region[] = REGIONS.filter((r: Region) => !r.isFallback);

  if (nonFallbackRegions.length === 0) return null;

  let nearest: { region: Region; distance: number } | null = null;

  for (const region of nonFallbackRegions) {
    const distance: number = milesBetween(
      lat,
      lon,
      region.centerPoint.lat,
      region.centerPoint.lon
    );

    if (!nearest || distance < nearest.distance) {
      nearest = { region, distance };
    }
  }

  return nearest;
}

/**
 * Find N nearest regions to a given location
 * Useful for expanding search when user's region has no leaderboards
 * 
 * @param lat Latitude
 * @param lon Longitude
 * @param limit Number of regions to return
 * @param maxDistance Maximum distance in miles (optional)
 * @returns Array of regions sorted by distance
 */
export function findNearestRegions(
  lat: number,
  lon: number,
  limit: number = 3,
  maxDistance?: number
): Array<{ region: Region; distance: number }> {
  const nonFallbackRegions: Region[] = REGIONS.filter((r: Region) => !r.isFallback);

  const regionsWithDistance: Array<{ region: Region; distance: number }> = nonFallbackRegions.map((region: Region) => ({
    region,
    distance: milesBetween(
      lat,
      lon,
      region.centerPoint.lat,
      region.centerPoint.lon
    ),
  }));

  // Filter by max distance if provided
  const filtered: Array<{ region: Region; distance: number }> = maxDistance
    ? regionsWithDistance.filter((r: { region: Region; distance: number }) => r.distance <= maxDistance)
    : regionsWithDistance;

  // Sort by distance and take top N
  return filtered
    .sort((a: { region: Region; distance: number }, b: { region: Region; distance: number }) => a.distance - b.distance)
    .slice(0, limit);
}

/**
 * Get a region by its key
 * 
 * @param key Region key (e.g., "us_nc_triad")
 * @returns Region object or undefined
 */
export function getRegionByKey(key: string): Region | undefined {
  return REGIONS.find((r) => r.key === key);
}

/**
 * Get all regions in a state
 * 
 * @param stateCode State code (e.g., "nc")
 * @returns Array of regions in that state
 */
export function getRegionsByState(stateCode: string): Region[] {
  const state: string = stateCode.toLowerCase();
  return REGIONS.filter(
    (r: Region) => r.state === state || r.states?.includes(state)
  );
}

/**
 * Check if a region is a fallback (misc) region
 * 
 * @param regionKey Region key
 * @returns true if it's a misc/fallback region
 */
export function isFallbackRegion(regionKey: string): boolean {
  const region: Region | undefined = getRegionByKey(regionKey);
  return region?.isFallback === true;
}

/**
 * Get the display name for a region
 * 
 * @param regionKey Region key
 * @returns Display name or the key if not found
 */
export function getRegionDisplayName(regionKey: string): string {
  const region: Region | undefined = getRegionByKey(regionKey);
  return region?.displayName || regionKey;
}

/**
 * Search regions by name or city
 * 
 * @param query Search query
 * @returns Matching regions
 */
export function searchRegions(query: string): Region[] {
  const q: string = query.toLowerCase();
  return REGIONS.filter(
    (r: Region) =>
      r.displayName.toLowerCase().includes(q) ||
      r.primaryCity.toLowerCase().includes(q) ||
      r.majorCities.some((city: string) => city.toLowerCase().includes(q))
  );
}