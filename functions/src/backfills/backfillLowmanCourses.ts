/**
 * Backfill: lowmanCourses
 *
 * One-time script to populate the `lowmanCourses` array on user docs.
 *
 * For every leaderboard doc, checks who currently holds the 18-hole
 * lowman position (topScores18[0]) and adds that courseId to their
 * lowmanCourses[] array.
 *
 * Run from functions/ folder:
 *   npx ts-node --project tsconfig.dev.json src/backfills/backfillLowmanCourses.ts
 *
 * Safe to re-run — uses Set deduplication before writing.
 */

import * as admin from "firebase-admin";
import * as path from "path";

// ── Init ──────────────────────────────────────────────────────────────────
const serviceAccount = require(
  path.resolve(__dirname, "../../../serviceAccountKey.json")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ── Main ──────────────────────────────────────────────────────────────────

async function backfillLowmanCourses() {
  console.log("🏌️ Starting lowmanCourses backfill...\n");

  // 1. Read all leaderboard docs
  const leaderboardsSnap = await db.collection("leaderboards").get();
  console.log(`📋 Found ${leaderboardsSnap.size} leaderboard docs\n`);

  // 2. Build a map: userId → Set of courseIds they currently lead
  const lowmanMap = new Map<string, Set<string>>();

  for (const doc of leaderboardsSnap.docs) {
    const data = doc.data();
    const topScores18: any[] = data.topScores18 || [];

    if (topScores18.length === 0) continue;

    const currentLowman = topScores18[0];
    if (!currentLowman?.userId) continue;

    const userId = currentLowman.userId;
    const courseId = String(data.courseId);

    if (!lowmanMap.has(userId)) {
      lowmanMap.set(userId, new Set());
    }
    lowmanMap.get(userId)!.add(courseId);
  }

  console.log(`👥 Found ${lowmanMap.size} users with active lowman positions\n`);

  // 3. Write lowmanCourses[] to each user doc
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const [userId, courseIdSet] of Array.from(lowmanMap.entries())) {
    const courseIds = Array.from(courseIdSet);

    try {
      const userRef = db.collection("users").doc(userId);
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        console.warn(`⚠️  User ${userId} not found — skipping`);
        skipped++;
        continue;
      }

      const existing: string[] = userSnap.data()?.lowmanCourses || [];

      // Merge existing + new (deduped)
      const merged: string[] = Array.from(new Set([...existing, ...courseIds]));

      // Skip write if already correct
      const alreadyCorrect =
        merged.length === existing.length &&
        merged.every((c) => existing.includes(c));

      if (alreadyCorrect) {
        console.log(`✅ ${userId} — already correct: [${merged.join(", ")}]`);
        skipped++;
        continue;
      }

      await userRef.update({ lowmanCourses: merged });

      const displayName = userSnap.data()?.displayName || userId;
      console.log(`✅ ${displayName} (${userId})`);
      console.log(`   lowmanCourses: [${merged.join(", ")}]`);
      updated++;
    } catch (err) {
      console.error(`🔥 Error updating ${userId}:`, err);
      errors++;
    }
  }

  // 4. Clear lowmanCourses for users who no longer hold any lowman
  //    (e.g. they were displaced since the old code ran)
  console.log("\n🧹 Checking for users with stale lowmanCourses...");

  const usersWithLowmanCourses = await db
    .collection("users")
    .where("lowmanCourses", "!=", [])
    .get();

  for (const userDoc of usersWithLowmanCourses.docs) {
    const userId = userDoc.id;
    const existingCourses: string[] = userDoc.data().lowmanCourses || [];
    const currentCourses = lowmanMap.get(userId);

    if (!currentCourses) {
      // User has lowmanCourses but holds no current lowman positions
      await userDoc.ref.update({ lowmanCourses: [] });
      console.log(`🗑️  Cleared stale lowmanCourses for ${userDoc.data().displayName || userId}`);
      continue;
    }

    // Remove any courseIds they no longer lead
    const validCourses = existingCourses.filter((c) => currentCourses.has(c));
    if (validCourses.length !== existingCourses.length) {
      await userDoc.ref.update({ lowmanCourses: validCourses });
      console.log(`🔧 Corrected lowmanCourses for ${userDoc.data().displayName || userId}: [${validCourses.join(", ")}]`);
    }
  }

  // 5. Summary
  console.log("\n══════════════════════════════════════");
  console.log(`✅ Updated:  ${updated} users`);
  console.log(`⏭️  Skipped:  ${skipped} users (already correct or not found)`);
  console.log(`🔥 Errors:   ${errors} users`);
  console.log("══════════════════════════════════════");
  console.log("\n✅ Backfill complete. lowmanCourses is now accurate.");
  console.log("   You can now deploy the updated scores.ts safely.\n");

  process.exit(0);
}

backfillLowmanCourses().catch((err) => {
  console.error("🔥 Backfill failed:", err);
  process.exit(1);
});