/**
 * backfill-leaderboards.ts
 *
 * Creates leaderboard docs for every course in Firestore that has a regionKey.
 * Safe to re-run — existing leaderboard docs are never overwritten.
 *
 * Leaderboard doc ID:  "{regionKey}_{courseId}"   e.g. "us_nc_triad_27071"
 *
 * Each leaderboard doc contains:
 *   - courseId, courseName        — ties back to the course record
 *   - regionKey                   — ties back to the region
 *   - location                    — copied from the course doc
 *   - leaderboardId               — self-referencing ID (matches doc ID)
 *   - empty score arrays + counters ready for onScoreCreated to populate
 *
 * Usage:
 *   ts-node backfill-leaderboards.ts
 *   ts-node backfill-leaderboards.ts --dry-run
 *   ts-node backfill-leaderboards.ts --overwrite   # re-stamps metadata on existing docs
 *                                                  # (never touches topScores arrays)
 */

import admin from "firebase-admin";
import * as fs from "fs";
import * as readline from "readline";
// Firebase Admin is initialized using your project's existing service account.
// Set FIREBASE_SERVICE_ACCOUNT env var, or swap initializeApp() below to match
// however your project initializes Admin (e.g. application default credentials).

// ── CONFIG ────────────────────────────────────────────────────────────────────

const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT ?? "./serviceAccount.json";
const BATCH_SIZE = 400; // Firestore batch limit is 500; stay under it

// ── TYPES ─────────────────────────────────────────────────────────────────────

interface CourseDoc {
  id: number;
  club_name?: string;
  course_name?: string;
  regionKey?: string;
  leaderboardId?: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
}

interface LeaderboardDoc {
  // Identity
  leaderboardId: string;

  // Course cross-reference
  courseId: number;
  courseName: string;

  // Region cross-reference
  regionKey: string;

  // Location (for display + geo queries)
  location: CourseDoc["location"] | null;

  // 18-hole leaderboard
  topScores18: any[];
  lowNetScore18: null;
  totalScores18: number;

  // 9-hole leaderboard
  topScores9: any[];
  lowNetScore9: null;
  totalScores9: number;

  // Shared
  totalScores: number;
  holesInOne: any[];

  // Timestamps
  createdAt: admin.firestore.Timestamp;
  lastUpdated: admin.firestore.Timestamp;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function buildLeaderboardDoc(
  course: CourseDoc,
  regionKey: string,
  leaderboardId: string
): LeaderboardDoc {
  const now = admin.firestore.Timestamp.now();
  const courseName = course.course_name ?? course.club_name ?? "Unknown Course";

  return {
    leaderboardId,
    courseId: course.id,
    courseName,
    regionKey,
    location: course.location ?? null,
    topScores18: [],
    lowNetScore18: null,
    totalScores18: 0,
    topScores9: [],
    lowNetScore9: null,
    totalScores9: 0,
    totalScores: 0,
    holesInOne: [],
    createdAt: now,
    lastUpdated: now,
  };
}

async function flushBatch(
  batch: admin.firestore.WriteBatch,
  db: admin.firestore.Firestore
): Promise<admin.firestore.WriteBatch> {
  await batch.commit();
  return db.batch();
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const overwrite = args.includes("--overwrite");

  console.log(`\n🏆  SwingThoughts Leaderboard Backfill`);
  console.log(`   dry-run  : ${dryRun}`);
  console.log(`   overwrite: ${overwrite} (metadata only — topScores never touched)\n`);

  // Init Firebase
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  const db = admin.firestore();

  // ── Load all courses with a regionKey ───────────────────────────────────────

  console.log("📦 Loading courses from Firestore...");
  const coursesSnap = await db.collection("courses").get();

  const eligible: CourseDoc[] = [];
  const missingRegionKey: number[] = [];

  coursesSnap.forEach((doc) => {
    const data = doc.data() as CourseDoc;
    if (data.regionKey) {
      eligible.push({ ...data, id: data.id ?? parseInt(doc.id, 10) });
    } else {
      missingRegionKey.push(data.id ?? parseInt(doc.id, 10));
    }
  });

  console.log(`   Eligible (have regionKey) : ${eligible.length}`);
  console.log(`   Missing regionKey         : ${missingRegionKey.length}`);
  if (missingRegionKey.length > 0) {
    console.log(`   ⚠️  Run backfill-courses.ts first to assign regionKeys to these.`);
    console.log(`   Missing IDs: ${missingRegionKey.slice(0, 20).join(", ")}${missingRegionKey.length > 20 ? "..." : ""}`);
  }
  console.log();

  if (eligible.length === 0) {
    console.log("Nothing to do — no courses with regionKey found.");
    return;
  }

  // ── Check which leaderboards already exist ──────────────────────────────────

  console.log("🔍 Checking existing leaderboard docs...");

  // Fetch in batches of 30 (Firestore 'in' query limit)
  const expectedIds = eligible.map(
    (c) => `${c.regionKey}_${c.id}`
  );

  const existingLeaderboardIds = new Set<string>();
  const chunkSize = 30;
  for (let i = 0; i < expectedIds.length; i += chunkSize) {
    const chunk = expectedIds.slice(i, i + chunkSize);
    const snap = await db
      .collection("leaderboards")
      .where(admin.firestore.FieldPath.documentId(), "in", chunk)
      .get();
    snap.forEach((doc) => existingLeaderboardIds.add(doc.id));
  }

  const toCreate = eligible.filter(
    (c) => !existingLeaderboardIds.has(`${c.regionKey}_${c.id}`)
  );
  const toUpdate = overwrite
    ? eligible.filter((c) =>
        existingLeaderboardIds.has(`${c.regionKey}_${c.id}`)
      )
    : [];

  console.log(`   Already exist : ${existingLeaderboardIds.size}`);
  console.log(`   To create     : ${toCreate.length}`);
  console.log(`   To update     : ${toUpdate.length} ${overwrite ? "" : "(use --overwrite to update existing)"}\n`);

  if (toCreate.length === 0 && toUpdate.length === 0) {
    console.log("✅ All leaderboards already exist. Nothing to do.");
    return;
  }

  if (!dryRun) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((resolve) => {
      rl.question(
        `Proceed? Will create ${toCreate.length} and update ${toUpdate.length} leaderboard docs. (y/N) `,
        (ans) => {
          rl.close();
          if (ans.toLowerCase() !== "y") {
            console.log("Aborted.");
            process.exit(0);
          }
          resolve();
        }
      );
    });
  }

  // ── Write leaderboard docs ──────────────────────────────────────────────────

  let created = 0;
  let updated = 0;
  let batchCount = 0;
  let batch = db.batch();

  const processEntry = async (
    course: CourseDoc,
    mode: "create" | "update"
  ) => {
    const regionKey = course.regionKey!;
    const leaderboardId = `${regionKey}_${course.id}`;
    const docRef = db.collection("leaderboards").doc(leaderboardId);

    if (mode === "create") {
      const doc = buildLeaderboardDoc(course, regionKey, leaderboardId);
      if (!dryRun) batch.set(docRef, doc);
      console.log(`  + ${leaderboardId} — ${doc.courseName}`);
      created++;
    } else {
      // --overwrite: only update metadata fields, never touch score arrays
      const metadataUpdate = {
        courseId: course.id,
        courseName: course.course_name ?? course.club_name ?? "Unknown Course",
        regionKey,
        leaderboardId,
        location: course.location ?? null,
        lastUpdated: admin.firestore.Timestamp.now(),
      };
      if (!dryRun) batch.update(docRef, metadataUpdate);
      console.log(`  ~ ${leaderboardId} — metadata updated`);
      updated++;
    }

    batchCount++;
    if (batchCount >= BATCH_SIZE && !dryRun) {
      batch = await flushBatch(batch, db);
      batchCount = 0;
    }
  };

  console.log(dryRun ? "\n[DRY RUN] Would create/update:\n" : "\nWriting leaderboards...\n");

  for (const course of toCreate) {
    await processEntry(course, "create");
  }
  for (const course of toUpdate) {
    await processEntry(course, "update");
  }

  // Flush remaining
  if (batchCount > 0 && !dryRun) {
    await flushBatch(batch, db);
  }

  // ── Also backfill leaderboardId onto any course docs that are missing it ────
  // This handles the case where backfill-courses ran before this script existed.

  console.log("\n🔗 Backfilling leaderboardId onto course docs...");
  let courseDocPatches = 0;
  let patchBatch = db.batch();
  let patchCount = 0;

  for (const course of eligible) {
    const leaderboardId = `${course.regionKey}_${course.id}`;
    if (course.leaderboardId !== leaderboardId) {
      const courseRef = db.collection("courses").doc(String(course.id));
      if (!dryRun) patchBatch.update(courseRef, { leaderboardId });
      courseDocPatches++;
      patchCount++;
      if (patchCount >= BATCH_SIZE && !dryRun) {
        patchBatch = await flushBatch(patchBatch, db);
        patchCount = 0;
      }
    }
  }
  if (patchCount > 0 && !dryRun) {
    await flushBatch(patchBatch, db);
  }
  console.log(`   Patched ${courseDocPatches} course docs with leaderboardId`);

  // ── Summary ──────────────────────────────────────────────────────────────────

  console.log(`\n${"─".repeat(60)}`);
  console.log(`✅ Done${dryRun ? " (dry run — no writes)" : ""}`);
  console.log(`   Leaderboards created : ${created}`);
  console.log(`   Leaderboards updated : ${updated}`);
  console.log(`   Course docs patched  : ${courseDocPatches}`);
  if (missingRegionKey.length > 0) {
    console.log(`\n⚠️  ${missingRegionKey.length} courses still have no regionKey.`);
    console.log(`   Run: ts-node backfill-courses.ts --seed ./seed.json`);
  }
  console.log(`${"─".repeat(60)}\n`);
}

main().catch((err) => {
  console.error("🔥 Fatal:", err);
  process.exit(1);
});