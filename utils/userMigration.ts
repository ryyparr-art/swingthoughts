import { db } from "@/constants/firebaseConfig";
import { REGIONS } from "@/constants/regions";
import { collection, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import geohash from "ngeohash";

// ============================================================
// CONFIG
// ============================================================

const GEOHASH_PRECISION = 5;
const MAX_USERS_PER_RUN = 50; // hard safety limit

// ============================================================
// DISTANCE (pure function)
// ============================================================

const toRad = (v: number) => (v * Math.PI) / 180;

const distanceMiles = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) => {
  const R = 3959;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

// ============================================================
// REGION RESOLVER (pure, sync)
// ============================================================

function resolveRegionKey(lat: number, lng: number): string {
  const hash = geohash.encode(lat, lng, GEOHASH_PRECISION);

  // 1️⃣ Geohash prefix match
  const prefixMatches = REGIONS.filter(
    r =>
      !r.isFallback &&
      r.geohashPrefixes?.some((p: string) => hash.startsWith(p))
  );

  if (prefixMatches.length === 1) {
    return prefixMatches[0].key;
  }

  if (prefixMatches.length > 1) {
    return prefixMatches.reduce((closest, r) => {
      const d1 = distanceMiles(
        lat,
        lng,
        closest.centerPoint.lat,
        closest.centerPoint.lon
      );
      const d2 = distanceMiles(
        lat,
        lng,
        r.centerPoint.lat,
        r.centerPoint.lon
      );
      return d2 < d1 ? r : closest;
    }).key;
  }

  // 2️⃣ Radius fallback
  const radiusMatches = REGIONS.filter(
    r =>
      !r.isFallback &&
      distanceMiles(
        lat,
        lng,
        r.centerPoint.lat,
        r.centerPoint.lon
      ) <= r.radiusMiles
  );

  if (radiusMatches.length > 0) {
    return radiusMatches.reduce((closest, r) => {
      const d1 = distanceMiles(
        lat,
        lng,
        closest.centerPoint.lat,
        closest.centerPoint.lon
      );
      const d2 = distanceMiles(
        lat,
        lng,
        r.centerPoint.lat,
        r.centerPoint.lon
      );
      return d2 < d1 ? r : closest;
    }).key;
  }

  // 3️⃣ Fallback region (guaranteed)
  const fallback = REGIONS.find(r => r.isFallback);
  if (!fallback) {
    throw new Error("No fallback region configured");
  }

  return fallback.key;
}

// ============================================================
// MIGRATION FUNCTION (EXPO-GO SAFE)
// ============================================================

export async function migrateUsersForRegionKey(): Promise<{
  success: boolean;
  migrated: number;
  skipped: number;
}> {
  console.log("🔄 Starting regionKey migration (Expo Go)");

  const snapshot = await getDocs(collection(db, "users"));

  let migrated = 0;
  let skipped = 0;

  const batch = writeBatch(db);
  let operations = 0;

  for (const userDoc of snapshot.docs.slice(0, MAX_USERS_PER_RUN)) {
    const user = userDoc.data();

    // Skip if already migrated
    if (user.regionKey) {
      skipped++;
      continue;
    }

    // Require lat/lng
    if (
      typeof user.latitude !== "number" ||
      typeof user.longitude !== "number"
    ) {
      console.warn(`⏭️ Skipping ${userDoc.id} (no lat/lng)`);
      skipped++;
      continue;
    }

    try {
      const regionKey = resolveRegionKey(
        user.latitude,
        user.longitude
      );

      const userGeohash = geohash.encode(
        user.latitude,
        user.longitude,
        GEOHASH_PRECISION
      );

      batch.update(userDoc.ref, {
        regionKey,
        geohash: userGeohash,
        regionUpdatedAt: serverTimestamp(),
      });

      operations++;
      migrated++;

      console.log(`✅ ${userDoc.id} → ${regionKey}`);
    } catch (err) {
      console.error(`❌ Failed for ${userDoc.id}`, err);
      skipped++;
    }
  }

  if (operations > 0) {
    await batch.commit();
    console.log(`💾 Committed ${operations} updates`);
  }

  console.log(`
✅ Region migration complete
Migrated: ${migrated}
Skipped: ${skipped}
  `);

  return {
    success: true,
    migrated,
    skipped,
  };
}
