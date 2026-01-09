/**
 * MIGRATION SCRIPT: Region-Based Architecture
 * 
 * This script migrates the entire app to use region-based data structure:
 * 1. Users: Add regionKey based on their location
 * 2. Courses: Add regionKey based on course location
 * 3. Scores: Add regionKey + tees data
 * 4. Thoughts: Add regionKey from user's region
 * 5. Leaderboards: Build from scores with denormalized user data
 * 
 * SETUP:
 *   npm install firebase-admin dotenv
 *   Download service account key from Firebase Console:
 *   - Go to Project Settings → Service Accounts
 *   - Click "Generate New Private Key"
 *   - Save as serviceAccountKey.json in project root (add to .gitignore!)
 * 
 * USAGE:
 *   node scripts/migrate-regions.js --all              # Run all phases
 *   node scripts/migrate-regions.js --users            # Only migrate users
 *   node scripts/migrate-regions.js --courses          # Only migrate courses
 *   node scripts/migrate-regions.js --scores           # Only migrate scores
 *   node scripts/migrate-regions.js --thoughts         # Only migrate thoughts
 *   node scripts/migrate-regions.js --leaderboards     # Only build leaderboards
 *   node scripts/migrate-regions.js --dry-run          # Preview without writing
 */

const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

// ============================================================
// FIREBASE CONFIG (ADMIN SDK)
// ============================================================

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ============================================================
// REGION HELPERS (Copied from regionHelpers.ts)
// ============================================================

function encodeGeohash(latitude, longitude, precision = 4) {
  const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = "";

  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const lonMid = (lonMin + lonMax) / 2;
      if (longitude > lonMid) {
        idx |= 1 << (4 - bit);
        lonMin = lonMid;
      } else {
        lonMax = lonMid;
      }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (latitude > latMid) {
        idx |= 1 << (4 - bit);
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

function milesBetween(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 3958.8; // miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

function assignRegionFromLocation(lat, lon, city, state, REGIONS) {
  console.log(`  🔍 Assigning region for: ${city}, ${state} (${lat}, ${lon})`);

  // Step 1: Try geohash match
  const userGeohash4 = encodeGeohash(lat, lon, 4);

  const geohashMatch = REGIONS.find((r) => r.geohashPrefixes.includes(userGeohash4));

  if (geohashMatch) {
    console.log(`  ✅ Geohash match: ${geohashMatch.displayName}`);
    return geohashMatch.key;
  }

  // Step 2: Find nearest region within 100 miles
  const nonFallbackRegions = REGIONS.filter((r) => !r.isFallback);

  let nearest = null;

  for (const region of nonFallbackRegions) {
    const distance = milesBetween(
      lat,
      lon,
      region.centerPoint.lat,
      region.centerPoint.lon
    );

    if (!nearest || distance < nearest.distance) {
      nearest = { region, distance };
    }
  }

  if (nearest && nearest.distance <= 100) {
    console.log(
      `  ✅ Nearest region: ${nearest.region.displayName} (${nearest.distance.toFixed(1)} mi)`
    );
    return nearest.region.key;
  }

  // Step 3: Fall back to state misc
  const stateLower = state.toLowerCase();
  const fallbackKey = `us_${stateLower}_misc`;

  console.log(`  ⚠️ Using state fallback: ${fallbackKey}`);

  return fallbackKey;
}

// ============================================================
// LOAD REGIONS
// ============================================================

async function loadRegions() {
  try {
    console.log("📦 Loading regions...");

    // ✅ Import REGIONS from your constants file
    // Note: Using dynamic import since this is a .js file
    // 
    // ⚠️ IMPORTANT: Your regions.ts file needs to be accessible as .js
    // Either:
    //   1. Copy constants/regions.ts → constants/regions.js (and change export to module.exports)
    //   2. Or use the inline method below
    
    const regionsModule = await import("../constants/regions.js");
    const REGIONS = regionsModule.REGIONS;

    if (!REGIONS || REGIONS.length === 0) {
      throw new Error("No regions loaded! Check constants/regions.js exists and exports REGIONS");
    }

    console.log(`✅ Loaded ${REGIONS.length} regions`);
    return REGIONS;
  } catch (error) {
    console.error("❌ Error loading regions:", error);
    console.error("\n💡 Make sure:");
    console.error("   1. constants/regions.js exists (copy from regions.ts)");
    console.error("   2. Change: export const REGIONS = [...] → module.exports = { REGIONS: [...] }");
    console.error("   3. Or paste your REGIONS array inline in this function");
    throw error;
  }
}

// ============================================================
// MIGRATION PHASES
// ============================================================

/**
 * PHASE 1: Migrate Users
 * Add regionKey based on user's current location
 */
async function migrateUsers(REGIONS, dryRun = false) {
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 1: MIGRATING USERS");
  console.log("=".repeat(60) + "\n");

  const stats = { processed: 0, updated: 0, skipped: 0, errors: 0 };

  try {
    const usersSnap = await db.collection("users").get();
    console.log(`📦 Found ${usersSnap.size} users\n`);

    for (const userDoc of usersSnap.docs) {
      stats.processed++;
      const data = userDoc.data();

      // Skip if already has regionKey
      if (data.regionKey) {
        console.log(`⏭️  ${stats.processed}. ${data.displayName || userDoc.id} - Already has regionKey: ${data.regionKey}`);
        stats.skipped++;
        continue;
      }

      // Get location
      const lat = data.currentLatitude || data.latitude;
      const lon = data.currentLongitude || data.longitude;
      const city = data.currentCity || data.city || "";
      const state = data.currentState || data.state || "";

      if (!lat || !lon || !state) {
        console.log(`⚠️  ${stats.processed}. ${data.displayName || userDoc.id} - Missing location data, skipping`);
        stats.skipped++;
        continue;
      }

      // Assign region
      const regionKey = assignRegionFromLocation(lat, lon, city, state, REGIONS);

      console.log(`✅ ${stats.processed}. ${data.displayName || userDoc.id} → ${regionKey}`);

      if (!dryRun) {
        await db.collection("users").doc(userDoc.id).update({
          regionKey,
          regionUpdatedAt: new Date().toISOString(),
        });
        stats.updated++;
      } else {
        console.log("   [DRY RUN - Not writing to database]");
        stats.updated++;
      }
    }

    console.log("\n" + "-".repeat(60));
    console.log("PHASE 1 COMPLETE:");
    console.log(`  Processed: ${stats.processed}`);
    console.log(`  Updated: ${stats.updated}`);
    console.log(`  Skipped: ${stats.skipped}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log("-".repeat(60) + "\n");

    return stats;
  } catch (error) {
    console.error("❌ Error migrating users:", error);
    throw error;
  }
}

/**
 * PHASE 2: Migrate Courses
 * Add regionKey based on course location
 */
async function migrateCourses(REGIONS, dryRun = false) {
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 2: MIGRATING COURSES");
  console.log("=".repeat(60) + "\n");

  const stats = { processed: 0, updated: 0, skipped: 0, errors: 0 };

  try {
    const coursesSnap = await db.collection("courses").get();
    console.log(`📦 Found ${coursesSnap.size} courses\n`);

    for (const courseDoc of coursesSnap.docs) {
      stats.processed++;
      const data = courseDoc.data();

      // Skip if already has regionKey
      if (data.regionKey) {
        console.log(`⏭️  ${stats.processed}. ${data.course_name || data.courseName || courseDoc.id} - Already has regionKey: ${data.regionKey}`);
        stats.skipped++;
        continue;
      }

      // Get location
      const lat = data.location?.latitude;
      const lon = data.location?.longitude;
      const city = data.location?.city || "";
      const state = data.location?.state || "";

      if (!lat || !lon || !state) {
        console.log(`⚠️  ${stats.processed}. ${data.course_name || data.courseName || courseDoc.id} - Missing location data, skipping`);
        stats.skipped++;
        continue;
      }

      // Assign region
      const regionKey = assignRegionFromLocation(lat, lon, city, state, REGIONS);

      console.log(`✅ ${stats.processed}. ${data.course_name || data.courseName} → ${regionKey}`);

      if (!dryRun) {
        await db.collection("courses").doc(courseDoc.id).update({
          regionKey,
        });
        stats.updated++;
      } else {
        console.log("   [DRY RUN - Not writing to database]");
        stats.updated++;
      }
    }

    console.log("\n" + "-".repeat(60));
    console.log("PHASE 2 COMPLETE:");
    console.log(`  Processed: ${stats.processed}`);
    console.log(`  Updated: ${stats.updated}`);
    console.log(`  Skipped: ${stats.skipped}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log("-".repeat(60) + "\n");

    return stats;
  } catch (error) {
    console.error("❌ Error migrating courses:", error);
    throw error;
  }
}

/**
 * PHASE 3: Migrate Scores
 * Add regionKey from course + add tees data
 */
async function migrateScores(dryRun = false) {
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 3: MIGRATING SCORES");
  console.log("=".repeat(60) + "\n");

  const stats = { processed: 0, updated: 0, skipped: 0, errors: 0 };

  try {
    const scoresSnap = await db.collection("scores").get();
    console.log(`📦 Found ${scoresSnap.size} scores\n`);

    // Build course lookup map
    const courseMap = new Map();
    const coursesSnap = await db.collection("courses").get();
    coursesSnap.forEach((doc) => {
      const data = doc.data();
      if (data.id != null) {
        courseMap.set(data.id, data);
      }
    });

    console.log(`📦 Loaded ${courseMap.size} courses for lookup\n`);

    for (const scoreDoc of scoresSnap.docs) {
      stats.processed++;
      const data = scoreDoc.data();

      // Skip if already has regionKey
      if (data.regionKey) {
        console.log(`⏭️  ${stats.processed}. Score ${scoreDoc.id} - Already has regionKey`);
        stats.skipped++;
        continue;
      }

      // Get course
      const courseId = data.courseId;
      const course = courseMap.get(courseId);

      if (!course || !course.regionKey) {
        console.log(`⚠️  ${stats.processed}. Score ${scoreDoc.id} - Course ${courseId} not found or missing regionKey, skipping`);
        stats.errors++;
        continue;
      }

      // Build update object
      const updates = {
        regionKey: course.regionKey,
      };

      // Add tees data if not present
      if (!data.tees) {
        updates.tees = "Unknown";
        updates.teePar = data.par || 72;
        updates.teeYardage = 0;
      }

      console.log(`✅ ${stats.processed}. Score ${scoreDoc.id} → ${course.regionKey}`);

      if (!dryRun) {
        await db.collection("scores").doc(scoreDoc.id).update(updates);
        stats.updated++;
      } else {
        console.log("   [DRY RUN - Not writing to database]");
        stats.updated++;
      }
    }

    console.log("\n" + "-".repeat(60));
    console.log("PHASE 3 COMPLETE:");
    console.log(`  Processed: ${stats.processed}`);
    console.log(`  Updated: ${stats.updated}`);
    console.log(`  Skipped: ${stats.skipped}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log("-".repeat(60) + "\n");

    return stats;
  } catch (error) {
    console.error("❌ Error migrating scores:", error);
    throw error;
  }
}

/**
 * PHASE 4: Migrate Thoughts
 * Add regionKey from user's region
 */
async function migrateThoughts(dryRun = false) {
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 4: MIGRATING THOUGHTS");
  console.log("=".repeat(60) + "\n");

  const stats = { processed: 0, updated: 0, skipped: 0, errors: 0 };

  try {
    const thoughtsSnap = await db.collection("thoughts").get();
    console.log(`📦 Found ${thoughtsSnap.size} thoughts\n`);

    // Build user lookup map
    const userMap = new Map();
    const usersSnap = await db.collection("users").get();
    usersSnap.forEach((doc) => {
      userMap.set(doc.id, doc.data());
    });

    console.log(`📦 Loaded ${userMap.size} users for lookup\n`);

    for (const thoughtDoc of thoughtsSnap.docs) {
      stats.processed++;
      const data = thoughtDoc.data();

      // Skip if already has regionKey
      if (data.regionKey) {
        console.log(`⏭️  ${stats.processed}. Thought ${thoughtDoc.id} - Already has regionKey`);
        stats.skipped++;
        continue;
      }

      // Get user
      const userId = data.userId;
      const user = userMap.get(userId);

      if (!user) {
        console.log(`⚠️  ${stats.processed}. Thought ${thoughtDoc.id} - User ${userId} not found, skipping`);
        stats.errors++;
        continue;
      }

      if (!user.regionKey) {
        console.log(`⚠️  ${stats.processed}. Thought ${thoughtDoc.id} - User ${userId} (${user.displayName}) missing regionKey, skipping`);
        stats.errors++;
        continue;
      }

      console.log(`✅ ${stats.processed}. Thought by ${user.displayName} → ${user.regionKey}`);

      if (!dryRun) {
        await db.collection("thoughts").doc(thoughtDoc.id).update({
          regionKey: user.regionKey,
        });
        stats.updated++;
      } else {
        console.log("   [DRY RUN - Not writing to database]");
        stats.updated++;
      }
    }

    console.log("\n" + "-".repeat(60));
    console.log("PHASE 4 COMPLETE:");
    console.log(`  Processed: ${stats.processed}`);
    console.log(`  Updated: ${stats.updated}`);
    console.log(`  Skipped: ${stats.skipped}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log("-".repeat(60) + "\n");

    return stats;
  } catch (error) {
    console.error("❌ Error migrating thoughts:", error);
    throw error;
  }
}

/**
 * PHASE 5: Build Leaderboards
 * Create leaderboard documents from scores with denormalized user data
 */
async function buildLeaderboards(dryRun = false) {
  console.log("\n" + "=".repeat(60));
  console.log("PHASE 5: BUILDING LEADERBOARDS");
  console.log("=".repeat(60) + "\n");

  const stats = { processed: 0, updated: 0, skipped: 0, errors: 0 };

  try {
    // Load all scores
    const scoresSnap = await db.collection("scores").get();
    console.log(`📦 Found ${scoresSnap.size} scores\n`);

    // Load user profiles
    const userMap = new Map();
    const usersSnap = await db.collection("users").get();
    usersSnap.forEach((doc) => {
      userMap.set(doc.id, doc.data());
    });

    console.log(`📦 Loaded ${userMap.size} users for lookup\n`);

    // Group scores by regionKey + courseId
    const grouped = {};

    scoresSnap.forEach((scoreDoc) => {
      const data = scoreDoc.data();

      // Skip if missing regionKey
      if (!data.regionKey) {
        console.log(`⚠️  Score ${scoreDoc.id} missing regionKey, skipping`);
        stats.errors++;
        return;
      }

      // Skip hole-in-one scores
      if (data.hadHoleInOne === true) return;

      // Skip Course account scores
      const user = userMap.get(data.userId);
      if (!user || user.userType === "Course") return;

      const key = `${data.regionKey}_${data.courseId}`;

      if (!grouped[key]) {
        grouped[key] = {
          regionKey: data.regionKey,
          courseId: data.courseId,
          courseName: data.courseName,
          scores: [],
        };
      }

      // Add score with denormalized user data
      grouped[key].scores.push({
        scoreId: scoreDoc.id,
        userId: data.userId,
        userName: user?.displayName || "[Deleted User]",
        userAvatar: user?.avatar || null,
        grossScore: data.grossScore,
        netScore: data.netScore,
        par: data.par,
        tees: data.tees || "Unknown",
        teePar: data.teePar || data.par || 72,
        teeYardage: data.teeYardage || 0,
        createdAt: data.createdAt,
      });
    });

    const leaderboardCount = Object.keys(grouped).length;
    console.log(`📦 Found ${leaderboardCount} unique leaderboards to build\n`);

    let index = 0;
    for (const key in grouped) {
      index++;
      stats.processed++;

      const { regionKey, courseId, courseName, scores } = grouped[key];

      // Sort by net score
      const sorted = scores.sort((a, b) => a.netScore - b.netScore);

      // Take top 3
      const topScores = sorted.slice(0, 3);

      const leaderboardData = {
        regionKey,
        courseId,
        courseName,
        topScores,
        lowNetScore: topScores[0]?.netScore || null,
        totalScores: scores.length,
        lastUpdated: new Date().toISOString(),
      };

      console.log(`✅ ${index}/${leaderboardCount}. ${courseName} (${regionKey}) - ${scores.length} scores, top 3: ${topScores.map(s => s.netScore).join(", ")}`);

      if (!dryRun) {
        await db.collection("leaderboards").doc(key).set(leaderboardData);
        stats.updated++;
      } else {
        console.log("   [DRY RUN - Not writing to database]");
        stats.updated++;
      }
    }

    console.log("\n" + "-".repeat(60));
    console.log("PHASE 5 COMPLETE:");
    console.log(`  Leaderboards Built: ${stats.updated}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log("-".repeat(60) + "\n");

    return stats;
  } catch (error) {
    console.error("❌ Error building leaderboards:", error);
    throw error;
  }
}

// ============================================================
// MAIN EXECUTION
// ============================================================

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 REGION MIGRATION SCRIPT");
  console.log("=".repeat(60) + "\n");

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const runAll = args.includes("--all") || args.length === 0 || (args.length === 1 && dryRun);
  const runUsers = runAll || args.includes("--users");
  const runCourses = runAll || args.includes("--courses");
  const runScores = runAll || args.includes("--scores");
  const runThoughts = runAll || args.includes("--thoughts");
  const runLeaderboards = runAll || args.includes("--leaderboards");

  if (dryRun) {
    console.log("⚠️  DRY RUN MODE - No data will be written\n");
  }

  const totalStats = {
    users: { processed: 0, updated: 0, skipped: 0, errors: 0 },
    courses: { processed: 0, updated: 0, skipped: 0, errors: 0 },
    scores: { processed: 0, updated: 0, skipped: 0, errors: 0 },
    thoughts: { processed: 0, updated: 0, skipped: 0, errors: 0 },
    leaderboards: { processed: 0, updated: 0, skipped: 0, errors: 0 },
  };

  try {
    // Load regions
    const REGIONS = await loadRegions();

    // Run phases
    if (runUsers) {
      totalStats.users = await migrateUsers(REGIONS, dryRun);
    }

    if (runCourses) {
      totalStats.courses = await migrateCourses(REGIONS, dryRun);
    }

    if (runScores) {
      totalStats.scores = await migrateScores(dryRun);
    }

    if (runThoughts) {
      totalStats.thoughts = await migrateThoughts(dryRun);
    }

    if (runLeaderboards) {
      totalStats.leaderboards = await buildLeaderboards(dryRun);
    }

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 MIGRATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`Users:        ${totalStats.users.updated} updated, ${totalStats.users.skipped} skipped, ${totalStats.users.errors} errors`);
    console.log(`Courses:      ${totalStats.courses.updated} updated, ${totalStats.courses.skipped} skipped, ${totalStats.courses.errors} errors`);
    console.log(`Scores:       ${totalStats.scores.updated} updated, ${totalStats.scores.skipped} skipped, ${totalStats.scores.errors} errors`);
    console.log(`Thoughts:     ${totalStats.thoughts.updated} updated, ${totalStats.thoughts.skipped} skipped, ${totalStats.thoughts.errors} errors`);
    console.log(`Leaderboards: ${totalStats.leaderboards.updated} built, ${totalStats.leaderboards.errors} errors`);
    console.log("=".repeat(60) + "\n");

    console.log("✅ Migration complete!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  }
}

main();