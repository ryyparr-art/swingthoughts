/**
 * sweep-courses.ts
 *
 * Sweeps the Golf Course API by ID range, writes all valid courses to Firestore
 * with regionKey + leaderboardId assigned.
 *
 * Usage:
 *   ts-node scripts/sweep-courses.ts                        # sweep 1 → 50000
 *   ts-node scripts/sweep-courses.ts --start 10000          # resume from ID
 *   ts-node scripts/sweep-courses.ts --start 1 --end 25000  # custom range
 *   ts-node scripts/sweep-courses.ts --dry-run              # no Firestore writes
 *
 * Progress is saved to ./sweep-progress.json so the script can resume
 * if interrupted. Delete this file to start fresh.
 *
 * Stops automatically after 1000 consecutive 404s (signals end of ID space).
 */

import admin from "firebase-admin";
import * as fs from "fs";
import { REGIONS } from "../constants/regions.js";

// ── CONFIG ────────────────────────────────────────────────────────────────────

const GOLF_API_BASE = "https://api.golfcourseapi.com/v1";
const GOLF_API_KEY = "Z4EX2SEUPXVVYDXRUJZFXXBJSA"; // replace with your key
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT ?? "./serviceAccountKey.json";

const CONCURRENCY = 2;          // parallel requests
const BATCH_DELAY_MS = 1000;      // delay between batches
const MAX_CONSECUTIVE_404S = 1000; // stop after this many 404s in a row
const PROGRESS_FILE = "./sweep-progress.json";
const DEFAULT_START = 1;
const DEFAULT_END = 50000;

// ── REGION MATCHING ───────────────────────────────────────────────────────────

function haversineDistanceMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3958.8;
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

  const isUS = country?.toLowerCase().includes("united states");
  const stateCode = (state ?? "").toLowerCase();

  if (isUS && latitude != null && longitude != null) {
    // 1. Find closest MSA within its radius
    let bestKey: string | null = null;
    let bestDist = Infinity;

    for (const region of REGIONS) {
      if (region.isFallback) continue;
      if (region.radiusMiles === 0) continue;
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

    // 2. Closest MSA in state within 150 miles
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
    if (closestInState && closestDist <= 150) return closestInState;

    // 3. State fallback
    const fallback = REGIONS.find((r) => r.isFallback && r.state === stateCode);
    return fallback?.key ?? null;
  }

  if (isUS) {
    const fallback = REGIONS.find((r) => r.isFallback && r.state === stateCode);
    return fallback?.key ?? `us_${stateCode}_misc`;
  }

  // International — derive a simple country-based key
  const countrySlug = (country ?? "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 20);
  return `intl_${countrySlug}`;
}

// ── API ───────────────────────────────────────────────────────────────────────

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
  tees?: { male?: any[]; female?: any[] };
}

type FetchResult =
  | { status: "ok"; course: ApiCourse }
  | { status: "not_found" }
  | { status: "rate_limited" }
  | { status: "error"; code: number };

async function fetchCourse(courseId: number): Promise<FetchResult> {
  try {
    const res = await fetch(`${GOLF_API_BASE}/courses/${courseId}`, {
      headers: { Authorization: `Key ${GOLF_API_KEY}` },
    });

    if (res.status === 404) return { status: "not_found" };
    if (res.status === 429) return { status: "rate_limited" };
    if (!res.ok) return { status: "error", code: res.status };

    const json = await res.json() as any;
    const data = json?.course ?? json;
    if (!data?.id) data.id = courseId;
    return { status: "ok", course: data as ApiCourse };
  } catch {
    return { status: "error", code: 0 };
  }
}

// ── PROGRESS ──────────────────────────────────────────────────────────────────

interface Progress {
  lastProcessedId: number;
  totalWritten: number;
  totalSkipped: number;
  startedAt: string;
  updatedAt: string;
}

function loadProgress(): Progress | null {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
    } catch {
      return null;
    }
  }
  return null;
}

function saveProgress(p: Progress): void {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ── FIRESTORE ─────────────────────────────────────────────────────────────────

async function writeCourseDoc(
  db: admin.firestore.Firestore,
  course: ApiCourse,
  dryRun: boolean
): Promise<string | null> {
  const regionKey = getRegionKeyFromLocation({
    state: course.location?.state,
    country: course.location?.country,
    latitude: course.location?.latitude,
    longitude: course.location?.longitude,
  });

  const leaderboardId = regionKey ? `${regionKey}_${course.id}` : null;
  const now = new Date().toISOString();

  const payload: Record<string, any> = {
    id: course.id,
    club_name: course.club_name ?? null,
    course_name: course.course_name ?? null,
    location: {
      address: course.location?.address ?? null,
      city: course.location?.city ?? null,
      state: course.location?.state ?? null,
      country: course.location?.country ?? null,
      latitude: course.location?.latitude ?? null,
      longitude: course.location?.longitude ?? null,
    },
    tees: course.tees ?? null,
    regionKey,
    leaderboardId,
    cachedAt: now,
    lastUpdated: now,
  };

  if (!dryRun) {
    await db
      .collection("courses")
      .doc(String(course.id))
      .set(payload, { merge: true });
  }

  return regionKey;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const startArg = args.indexOf("--start");
  const endArg = args.indexOf("--end");

  // Load progress file to auto-resume
  const savedProgress = loadProgress();

  let startId = startArg !== -1 ? parseInt(args[startArg + 1], 10) : DEFAULT_START;
  const endId = endArg !== -1 ? parseInt(args[endArg + 1], 10) : DEFAULT_END;

  // Auto-resume from last processed ID unless --start was explicitly passed
  if (savedProgress && startArg === -1) {
    startId = savedProgress.lastProcessedId + 1;
    console.log(`\n📂 Resuming from ID ${startId} (last run: ${savedProgress.updatedAt})`);
    console.log(`   Previously written: ${savedProgress.totalWritten} courses`);
  }

  console.log(`\n🏌️  SwingThoughts Course Sweep`);
  console.log(`   range    : ${startId} → ${endId}`);
  console.log(`   dry-run  : ${dryRun}`);
  console.log(`   regions  : ${REGIONS.length} loaded\n`);

  // Init Firebase
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  // ── Sweep ─────────────────────────────────────────────────────────────────

  let written = savedProgress?.totalWritten ?? 0;
  let skipped = savedProgress?.totalSkipped ?? 0;
  let errors = 0;
  let consecutiveNotFound = 0;
  let rateLimitHits = 0;

  const progress: Progress = {
    lastProcessedId: startId - 1,
    totalWritten: written,
    totalSkipped: skipped,
    startedAt: savedProgress?.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const ids = Array.from(
    { length: endId - startId + 1 },
    (_, i) => startId + i
  );

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (courseId) => {
        const result = await fetchCourse(courseId);
        return { courseId, result };
      })
    );

    for (const { courseId, result } of results) {
      if (result.status === "not_found") {
        consecutiveNotFound++;
        skipped++;
      } else if (result.status === "rate_limited") {
        rateLimitHits++;
        consecutiveNotFound = 0;
        console.log(`  ⚠️  Rate limited at ID ${courseId} — pausing 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
      } else if (result.status === "error") {
        errors++;
        consecutiveNotFound = 0;
        console.log(`  ⚠️  Error ${result.code} for ID ${courseId}`);
      } else {
        consecutiveNotFound = 0;
        const { course } = result;
        const regionKey = await writeCourseDoc(db, course, dryRun);
        written++;

        const tag = dryRun ? "[dry]" : "✅";
        process.stdout.write(
          `${tag} ${courseId} | ${course.course_name} | ${course.location?.city ?? "?"}, ${course.location?.country ?? "?"} | ${regionKey ?? "⚠️ no region"}\n`
        );
      }

      progress.lastProcessedId = courseId;
    }

    // Stop if we've hit too many consecutive 404s
    if (consecutiveNotFound >= MAX_CONSECUTIVE_404S) {
      console.log(`\n🛑 ${MAX_CONSECUTIVE_404S} consecutive 404s — assuming end of ID space. Stopping.`);
      break;
    }

    // Save progress after every batch
    progress.totalWritten = written;
    progress.totalSkipped = skipped;
    progress.updatedAt = new Date().toISOString();
    saveProgress(progress);

    // Progress report every 500 IDs
    if (i % 500 === 0 && i > 0) {
      const pct = ((i / ids.length) * 100).toFixed(1);
      console.log(`\n📊 Progress: ${i}/${ids.length} (${pct}%) | Written: ${written} | Skipped: ${skipped} | Errors: ${errors}\n`);
    }

    if (i + CONCURRENCY < ids.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(`\n${"─".repeat(60)}`);
  console.log(`✅ Sweep complete${dryRun ? " (dry run)" : ""}`);
  console.log(`   Written       : ${written}`);
  console.log(`   Skipped (404) : ${skipped}`);
  console.log(`   Errors        : ${errors}`);
  console.log(`   Rate limits   : ${rateLimitHits}`);
  console.log(`   Last ID       : ${progress.lastProcessedId}`);
  if (!dryRun) {
    console.log(`\n👉 Next step: run backfill-leaderboards.ts`);
    // Clean up progress file on successful completion
    if (progress.lastProcessedId >= endId || consecutiveNotFound >= MAX_CONSECUTIVE_404S) {
      fs.unlinkSync(PROGRESS_FILE);
      console.log(`   Progress file cleared.`);
    }
  }
  console.log(`${"─".repeat(60)}\n`);
}

main().catch((err) => {
  console.error("🔥 Fatal:", err);
  process.exit(1);
});