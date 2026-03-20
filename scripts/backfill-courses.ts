/**
 * backfill-courses.ts
 *
 * Fetches fresh data from the Golf Course API for:
 *   A) All courses already in Firestore (updates + fills missing regionKey)
 *   B) Net-new courses from a seed JSON file
 *
 * Writes to each course doc:
 *   - All API fields (id, club_name, course_name, location, tees)
 *   - regionKey  — derived from location via REGIONS distance matching
 *   - leaderboardId — "{regionKey}_{courseId}"
 *   - cachedAt / lastUpdated
 *
 * Usage:
 *   ts-node backfill-courses.ts                        # existing Firestore courses only
 *   ts-node backfill-courses.ts --seed ./seed.json     # existing + seed file
 *   ts-node backfill-courses.ts --seed ./seed.json --dry-run
 *
 * Seed file format:
 *   { "courses": [ { "id": 27071 }, { "id": 6918 } ] }
 */

import admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { REGIONS } from "../constants/regions.js";

// ── CONFIG ────────────────────────────────────────────────────────────────────

const GOLF_API_BASE = "https://api.golfcourseapi.com/v1";
const GOLF_API_KEY = process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY ?? "";
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT ?? "./serviceAccountKey.json";

// How many concurrent API requests to allow (stay polite to the API)
const CONCURRENCY = 2;
// Delay between batches in ms
const BATCH_DELAY_MS = 1500;

// ── REGION MATCHING ───────────────────────────────────────────────────────────

function haversineDistanceMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getRegionKeyFromLocation(location: {
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}): string | null {
  const { state, country, latitude, longitude } = location;

  // Only handle US courses for now
  if (!country || !country.toLowerCase().includes("united states")) {
    // International fallback — you can expand this later
    return `gb_misc`; // crude fallback for non-US; extend as needed
  }

  const stateCode = (state ?? "").toLowerCase();

  // 1. If we have coordinates, find the closest MSA within its radius
  if (latitude != null && longitude != null) {
    let bestKey: string | null = null;
    let bestDist = Infinity;

    for (const region of REGIONS) {
      if (region.isFallback) continue;
      if (region.radiusMiles === 0) continue;

      // Region must cover this state
      const coversState =
        region.state === stateCode || region.states?.includes(stateCode);
      if (!coversState) continue;

      const dist = haversineDistanceMiles(
        latitude, longitude,
        region.centerPoint.lat, region.centerPoint.lon
      );

      if (dist <= region.radiusMiles && dist < bestDist) {
        bestDist = dist;
        bestKey = region.key;
      }
    }

    if (bestKey) return bestKey;

    // 2. No MSA within radius — find closest MSA in the same state regardless of radius
    let closestInState: string | null = null;
    let closestDist = Infinity;
    for (const region of REGIONS) {
      if (region.isFallback) continue;
      const coversState =
        region.state === stateCode || region.states?.includes(stateCode);
      if (!coversState) continue;

      const dist = haversineDistanceMiles(
        latitude, longitude,
        region.centerPoint.lat, region.centerPoint.lon
      );
      if (dist < closestDist) {
        closestDist = dist;
        closestInState = region.key;
      }
    }

    // Use closest MSA only if it's within 150 miles — otherwise fall back to state
    if (closestInState && closestDist <= 150) return closestInState;
  }

  // 3. State fallback
  const fallback = REGIONS.find(
    (r) => r.isFallback && r.state === stateCode
  );
  return fallback?.key ?? null;
}

// ── GOLF COURSE API ───────────────────────────────────────────────────────────

interface ApiCourse {
  id: number;
  club_name: string;
  course_name: string;
  location: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  tees?: {
    male?: any[];
    female?: any[];
  };
}

async function fetchCourseFromApi(courseId: number): Promise<ApiCourse | null> {
  if (!GOLF_API_KEY) throw new Error("GOLF_COURSE_API_KEY env var not set");

  const url = `${GOLF_API_BASE}/courses/${courseId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Key ${GOLF_API_KEY}` },
  });

  if (res.status === 404) return null;
  if (res.status === 429) {
    console.warn(`  ⚠️  API 429 (rate limited) for course ${courseId} — skipping`);
    return null;
  }
  if (!res.ok) {
    console.warn(`  ⚠️  API ${res.status} for course ${courseId}`);
    return null;
  }

  const json = await res.json() as any;

  // The API may wrap the course in a { course: {} } envelope — handle both shapes
  const data = json?.course ?? json;

  if (!data || typeof data !== "object") {
    console.warn(`  ⚠️  Unexpected API response shape for ${courseId}:`, JSON.stringify(json).slice(0, 200));
    return null;
  }

  // Ensure id is always set (use the requested courseId as fallback)
  if (!data.id) data.id = courseId;

  return data as ApiCourse;
}

// ── FIRESTORE WRITE ───────────────────────────────────────────────────────────

async function upsertCourseDoc(
  db: admin.firestore.Firestore,
  apiCourse: ApiCourse,
  dryRun: boolean
): Promise<{ courseId: number; regionKey: string | null; leaderboardId: string | null; isNew: boolean }> {
  const courseId = apiCourse.id;
  const docRef = db.collection("courses").doc(String(courseId));
  const existing = await docRef.get();
  const isNew = !existing.exists;

  const regionKey = getRegionKeyFromLocation({
    state: apiCourse.location?.state,
    country: apiCourse.location?.country,
    latitude: apiCourse.location?.latitude,
    longitude: apiCourse.location?.longitude,
  });

  const leaderboardId = regionKey ? `${regionKey}_${courseId}` : null;

  const now = new Date().toISOString();

  const payload: Record<string, any> = {
    id: courseId,
    club_name: apiCourse.club_name ?? null,
    course_name: apiCourse.course_name ?? null,
    location: {
      address: apiCourse.location?.address ?? null,
      city: apiCourse.location?.city ?? null,
      state: apiCourse.location?.state ?? null,
      country: apiCourse.location?.country ?? null,
      latitude: apiCourse.location?.latitude ?? null,
      longitude: apiCourse.location?.longitude ?? null,
    },
    tees: apiCourse.tees ?? null,
    regionKey,
    leaderboardId,
    lastUpdated: now,
  };

  // Only set cachedAt on initial creation
  if (isNew) {
    payload.cachedAt = now;
  }

  if (!dryRun) {
    await docRef.set(payload, { merge: true });
  }

  return { courseId, regionKey, leaderboardId, isNew };
}

// ── CONCURRENCY HELPER ────────────────────────────────────────────────────────

async function processInBatches<T, R>(
  items: T[],
  concurrency: number,
  delayMs: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (i + concurrency < items.length) {
      await new Promise((r: (value: void) => void) => setTimeout(r, delayMs));
    }
  }
  return results;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const seedIndex = args.indexOf("--seed");
  const seedPath = seedIndex !== -1 ? args[seedIndex + 1] : null;

  console.log(`\n🏌️  SwingThoughts Course Backfill`);
  console.log(`   dry-run: ${dryRun}`);
  console.log(`   seed:    ${seedPath ?? "none"}\n`);
  console.log(`✅ Loaded ${REGIONS.length} regions from constants/regions`);

  // Init Firebase
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  const db = admin.firestore();

  // ── Collect course IDs ──────────────────────────────────────────────────────

  const idSet = new Set<number>();

  // Source A: existing Firestore courses
  console.log("📦 Loading existing courses from Firestore...");
  const existingSnap = await db.collection("courses").get();
  existingSnap.forEach((doc) => {
    const id = parseInt(doc.id, 10);
    if (!isNaN(id)) idSet.add(id);
  });
  console.log(`   Found ${idSet.size} existing course IDs\n`);

  // Source B: seed file
  if (seedPath) {
    const resolved = path.resolve(seedPath);
    if (!fs.existsSync(resolved)) {
      console.error(`⛔ Seed file not found: ${resolved}`);
      process.exit(1);
    }
    const seed = JSON.parse(fs.readFileSync(resolved, "utf-8"));
    const seedCourses: { id: number }[] = seed.courses ?? [];
    let newFromSeed = 0;
    for (const c of seedCourses) {
      if (!idSet.has(c.id)) {
        idSet.add(c.id);
        newFromSeed++;
      }
    }
    console.log(`🌱 Seed file: ${seedCourses.length} entries, ${newFromSeed} net-new IDs\n`);
  }

  const allIds = Array.from(idSet).sort((a, b) => a - b);
  console.log(`🔢 Total course IDs to process: ${allIds.length}\n`);

  if (!dryRun) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((resolve) => {
      rl.question(`Proceed with writing to Firestore? (y/N) `, (ans) => {
        rl.close();
        if (ans.toLowerCase() !== "y") {
          console.log("Aborted.");
          process.exit(0);
        }
        resolve();
      });
    });
  }

  // ── Process ─────────────────────────────────────────────────────────────────

  let updated = 0;
  let created = 0;
  let skipped = 0;
  let failed = 0;
  const noRegionKey: number[] = [];

  await processInBatches(allIds, CONCURRENCY, BATCH_DELAY_MS, async (courseId) => {
    try {
      process.stdout.write(`  Fetching ${courseId}... `);
      const apiCourse = await fetchCourseFromApi(courseId);

      if (!apiCourse) {
        console.log(`404 — skipped`);
        skipped++;
        return;
      }

      const result = await upsertCourseDoc(db, apiCourse, dryRun);

      if (!result.regionKey) noRegionKey.push(courseId);

      const tag = dryRun ? "[dry]" : result.isNew ? "created" : "updated";
      console.log(
        `${tag} | regionKey: ${result.regionKey ?? "⚠️  NONE"} | leaderboardId: ${result.leaderboardId ?? "none"}`
      );

      if (result.isNew) created++;
      else updated++;
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`);
      failed++;
    }
  });

  // ── Summary ──────────────────────────────────────────────────────────────────

  console.log(`\n${"─".repeat(60)}`);
  console.log(`✅ Done${dryRun ? " (dry run — no writes)" : ""}`);
  console.log(`   Created : ${created}`);
  console.log(`   Updated : ${updated}`);
  console.log(`   Skipped : ${skipped} (404 or API error)`);
  console.log(`   Failed  : ${failed}`);
  if (noRegionKey.length > 0) {
    console.log(`\n⚠️  ${noRegionKey.length} courses with no regionKey assigned:`);
    console.log(`   ${noRegionKey.join(", ")}`);
    console.log(`   These will NOT get leaderboards. Check location data.`);
  }
  console.log(`${"─".repeat(60)}\n`);
}

main().catch((err) => {
  console.error("🔥 Fatal:", err);
  process.exit(1);
});