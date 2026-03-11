import { REGIONS, Region } from "@/constants/regions";
import { milesBetween } from "@/utils/geo";

/**
 * Maps full country names (as returned by the Golf Course API) to ISO 2-letter codes.
 * Used to generate international regionKey fallbacks like "gb_misc", "mx_misc", etc.
 */
const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  "united states": "us",
  "united states of america": "us",
  "usa": "us",
  "canada": "ca",
  "mexico": "mx",
  "united kingdom": "gb",
  "england": "gb",
  "scotland": "gb",
  "wales": "gb",
  "northern ireland": "gb",
  "ireland": "ie",
  "france": "fr",
  "germany": "de",
  "spain": "es",
  "portugal": "pt",
  "italy": "it",
  "netherlands": "nl",
  "belgium": "be",
  "sweden": "se",
  "norway": "no",
  "denmark": "dk",
  "finland": "fi",
  "switzerland": "ch",
  "austria": "at",
  "australia": "au",
  "new zealand": "nz",
  "japan": "jp",
  "south korea": "kr",
  "korea": "kr",
  "china": "cn",
  "thailand": "th",
  "singapore": "sg",
  "malaysia": "my",
  "indonesia": "id",
  "philippines": "ph",
  "india": "in",
  "united arab emirates": "ae",
  "uae": "ae",
  "saudi arabia": "sa",
  "south africa": "za",
  "kenya": "ke",
  "brazil": "br",
  "argentina": "ar",
  "colombia": "co",
  "chile": "cl",
  "peru": "pe",
  "dominican republic": "do",
  "jamaica": "jm",
  "bahamas": "bs",
  "bermuda": "bm",
  "cayman islands": "ky",
  "puerto rico": "pr",
  "barbados": "bb",
  "trinidad and tobago": "tt",
  "panama": "pa",
  "costa rica": "cr",
  "guatemala": "gt",
  "bahrain": "bh",
  "qatar": "qa",
  "oman": "om",
  "kuwait": "kw",
};

/**
 * Convert a full country name from the Golf API to an ISO 2-letter code.
 * Falls back to a slugified version of the country name if not in the map.
 */
function countryNameToIso2(countryName: string): string {
  const normalized = countryName.toLowerCase().trim();
  return COUNTRY_NAME_TO_ISO2[normalized] ?? normalized.replace(/[^a-z0-9]/g, "").slice(0, 4);
}

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
 * Assign a region to a location based on coordinates, state, and country.
 *
 * Strategy for US courses:
 * 1. Try geohash match (most accurate)
 * 2. Try nearest region within 100 miles
 * 3. Fall back to us_{state}_misc
 *
 * Strategy for non-US courses:
 * → Return {iso2}_misc  (e.g. "gb_misc", "mx_misc", "ca_misc")
 *
 * @param lat       Latitude
 * @param lon       Longitude
 * @param city      City name (for logging)
 * @param state     State/province code
 * @param country   Full country name as returned by the Golf API (optional but recommended)
 * @returns regionKey
 */
export function assignRegionFromLocation(
  lat: number,
  lon: number,
  city: string,
  state: string,
  country?: string
): string {
  console.log(`🔍 Assigning region for: ${city}, ${state}, ${country ?? "?"} (${lat}, ${lon})`);

  // ── INTERNATIONAL FAST-PATH ──────────────────────────────────────
  if (country) {
    const iso2 = countryNameToIso2(country);
    if (iso2 !== "us") {
      const intlKey = `${iso2}_misc`;
      console.log(`🌍 International course → ${intlKey}`);
      return intlKey;
    }
  }

  // ── US MATCHING ──────────────────────────────────────────────────

  // Step 1: Try geohash match
  const userGeohash4: string = encodeGeohash(lat, lon, 4);
  console.log(`📍 Geohash: ${userGeohash4}`);

  const geohashMatch: Region | undefined = REGIONS.find((r: Region) =>
    r.geohashPrefixes.includes(userGeohash4)
  );

  if (geohashMatch) {
    console.log(`✅ Geohash match: ${geohashMatch.displayName}`);
    return geohashMatch.key;
  }

  console.log("⚠️ No geohash match, finding nearest region...");

  // Step 2: Find nearest region within 100 miles
  const nearestRegion: { region: Region; distance: number } | null = findNearestRegion(lat, lon);

  if (nearestRegion && nearestRegion.distance <= 100) {
    console.log(
      `✅ Nearest region: ${nearestRegion.region.displayName} (${nearestRegion.distance.toFixed(1)} mi)`
    );
    return nearestRegion.region.key;
  }

  // Step 3: US state fallback
  const stateLower: string = state.toLowerCase();
  const fallbackKey: string = `us_${stateLower}_misc`;
  console.log(`⚠️ No region within 100 miles, using state fallback: ${fallbackKey}`);
  return fallbackKey;
}

/**
 * Determine the correct regionKey for a course document.
 * Convenience wrapper used by the course backfill script and
 * anywhere a course object (with location) is available.
 */
export function assignRegionForCourse(course: {
  location?: {
    latitude?: number;
    longitude?: number;
    city?: string;
    state?: string;
    country?: string;
  };
}): string | null {
  const loc = course.location;
  if (!loc?.latitude || !loc?.longitude) return null;
  return assignRegionFromLocation(
    loc.latitude,
    loc.longitude,
    loc.city ?? "",
    loc.state ?? "",
    loc.country
  );
}

/**
 * Returns true if the given regionKey represents a non-US course.
 * International keys follow the pattern "{iso2}_misc" where iso2 is not "us".
 */
export function isInternationalRegion(regionKey: string): boolean {
  return !regionKey.startsWith("us_");
}

/**
 * Find the nearest US region to a given location
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
 */
export function findNearestRegions(
  lat: number,
  lon: number,
  limit: number = 3,
  maxDistance?: number
): Array<{ region: Region; distance: number }> {
  const nonFallbackRegions: Region[] = REGIONS.filter((r: Region) => !r.isFallback);

  const regionsWithDistance = nonFallbackRegions.map((region: Region) => ({
    region,
    distance: milesBetween(lat, lon, region.centerPoint.lat, region.centerPoint.lon),
  }));

  const filtered = maxDistance
    ? regionsWithDistance.filter((r) => r.distance <= maxDistance)
    : regionsWithDistance;

  return filtered
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

export function getRegionByKey(key: string): Region | undefined {
  return REGIONS.find((r) => r.key === key);
}

export function getRegionsByState(stateCode: string): Region[] {
  const state: string = stateCode.toLowerCase();
  return REGIONS.filter(
    (r: Region) => r.state === state || r.states?.includes(state)
  );
}

export function isFallbackRegion(regionKey: string): boolean {
  const region: Region | undefined = getRegionByKey(regionKey);
  return region?.isFallback === true;
}

export function getRegionDisplayName(regionKey: string): string {
  const region: Region | undefined = getRegionByKey(regionKey);
  return region?.displayName || regionKey;
}

export function searchRegions(query: string): Region[] {
  const q: string = query.toLowerCase();
  return REGIONS.filter(
    (r: Region) =>
      r.displayName.toLowerCase().includes(q) ||
      r.primaryCity.toLowerCase().includes(q) ||
      r.majorCities.some((city: string) => city.toLowerCase().includes(q))
  );
}