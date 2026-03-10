/**
 * BACKFILL SCRIPT: ST Power Ranking System
 *
 * Populates playerRounds and worldRankings collections from historical
 * score data. Also rebuilds the leaderboardPlayers index.
 *
 * Safe to re-run — all writes are idempotent.
 *
 * SETUP:
 *   Requires serviceAccountKey.json in project root (same as migrate-regions.js)
 *
 * USAGE:
 *   node scripts/backfillRankings.js              # Run full backfill
 *   node scripts/backfillRankings.js --dry-run    # Preview without writing
 *   node scripts/backfillRankings.js --rankings-only  # Skip leaderboardPlayers rebuild
 */

const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ============================================================
// CONSTANTS
// ============================================================

const FORMAT_WEIGHTS = {
  solo: 0.75,
  casual: 1.0,
  league: 1.25,
  invitational: 1.5,
  tour: 2.0,
};

const FULL_VALUE_WEEKS = 8;
const DECAY_WINDOW_WEEKS = 52;
const DECAY_DURATION = DECAY_WINDOW_WEEKS - FULL_VALUE_WEEKS; // 44
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MIN_ROUNDS_TO_RANK = 3;
const BATCH_SIZE = 400;

// ============================================================
// FORMULA FUNCTIONS (mirrors rankingEngine.ts)
// ============================================================

function initialPowerRating(handicapIndex) {
  if (handicapIndex == null) return 20;
  return Math.max(0, 50 - handicapIndex * 1.5);
}

function soloFieldStrength(slopeRating) {
  return (slopeRating / 113) * 20;
}

function applyDecay(points, createdAtMs) {
  const ageMs = Date.now() - createdAtMs;
  const ageWeeks = ageMs / MS_PER_WEEK;
  if (ageWeeks > DECAY_WINDOW_WEEKS) return 0;
  if (ageWeeks <= FULL_VALUE_WEEKS) return points;
  const decayFraction = (ageWeeks - FULL_VALUE_WEEKS) / DECAY_DURATION;
  return points * (1 - decayFraction);
}

function calculateRoundPoints(netScore, par, slopeRating, fieldStrength, formatType) {
  const courseAdjustedScore = (netScore - par) * (slopeRating / 113);
  const basePoints = Math.max(0, 40 - courseAdjustedScore);
  const fieldMultiplier = 1 + fieldStrength / 100;
  const formatWeight = FORMAT_WEIGHTS[formatType] || 1.0;
  return basePoints * fieldMultiplier * formatWeight;
}

function inferFormatType(scoreData) {
  if (scoreData.leagueId) return "league";
  if (scoreData.invitationalId) return "invitational";
  if (scoreData.tourId) return "tour";
  if (scoreData.roundId) return "casual";
  return "solo";
}

// ============================================================
// HELPERS
// ============================================================

async function getRoundPlayers(roundId) {
  try {
    const snap = await db.collection("rounds").doc(roundId).get();
    if (!snap.exists) return { playerIds: [], handicaps: {} };

    const players = snap.data().players || [];
    const playerIds = [];
    const handicaps = {};

    for (const p of players) {
      if (!p.isGhost && p.playerId) {
        playerIds.push(p.playerId);
        handicaps[p.playerId] = p.handicapIndex ?? null;
      }
    }

    return { playerIds, handicaps };
  } catch {
    return { playerIds: [], handicaps: {} };
  }
}

function historicalFieldStrength(playerIds, selfId, handicaps) {
  const others = playerIds.filter((id) => id !== selfId);
  if (others.length === 0) return 20;
  const ratings = others.map((id) => initialPowerRating(handicaps[id] ?? null));
  return ratings.reduce((a, b) => a + b, 0) / ratings.length;
}

// ============================================================
// STEP 1: WRITE playerRounds
// ============================================================

async function buildPlayerRounds(userMap, roundPlayerCache, dryRun) {
  console.log("\n" + "=".repeat(60));
  console.log("STEP 1: BUILDING playerRounds COLLECTION");
  console.log("=".repeat(60) + "\n");

  const scoresSnap = await db.collection("scores").get();
  console.log(`📦 Found ${scoresSnap.size} score documents\n`);

  const affectedUserIds = new Set();
  let written = 0;
  let skipped = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const scoreDoc of scoresSnap.docs) {
    const d = scoreDoc.data();

    // Skip ineligible
    if (d.isGhost) { skipped++; continue; }
    if (d.isSimulator === true) { skipped++; continue; }
    if (d.isLeaderboardEligible === false) { skipped++; continue; }
    if (d.hadHoleInOne === true) { skipped++; continue; }
    if (!d.userId || !d.courseId || !d.regionKey) { skipped++; continue; }
    if (d.holeCount !== 18 && d.holeCount !== 9) { skipped++; continue; }

    const user = userMap.get(d.userId);
    if (!user) { skipped++; continue; }
    if (user.userType === "Course") { skipped++; continue; }

    const slopeRating = d.slopeRating ?? null;
    if (!slopeRating) { skipped++; continue; }

    const formatType = inferFormatType(d);
    const par = d.par || (d.holeCount === 18 ? 72 : 36);

    // Field strength
    let fieldStrength;
    if (d.roundId && roundPlayerCache.has(d.roundId)) {
      const { playerIds, handicaps } = roundPlayerCache.get(d.roundId);
      fieldStrength = historicalFieldStrength(playerIds, d.userId, handicaps);
    } else {
      fieldStrength = soloFieldStrength(slopeRating);
    }

    const roundPoints = calculateRoundPoints(d.netScore, par, slopeRating, fieldStrength, formatType);

    const createdAtMs = d.createdAt?.toMillis?.() ?? Date.now();

    const roundDoc = {
      userId: d.userId,
      roundId: scoreDoc.id,
      courseId: d.courseId,
      regionKey: d.regionKey,
      netScore: d.netScore,
      par,
      slopeRating,
      courseRating: d.courseRating ?? null,
      handicapIndex: d.handicapIndex ?? user.handicapIndex ?? null,
      fieldStrength: parseFloat(fieldStrength.toFixed(2)),
      formatType,
      roundPoints: parseFloat(roundPoints.toFixed(2)),
      challengePoints: 0,
      createdAt: d.createdAt || admin.firestore.Timestamp.now(),
    };

    const docId = `${d.userId}_${scoreDoc.id}`;

    if (!dryRun) {
      batch.set(db.collection("playerRounds").doc(docId), roundDoc);
      batchCount++;

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
        console.log(`   Written ${written + batchCount} playerRounds docs...`);
      }
    }

    affectedUserIds.add(d.userId);
    written++;
  }

  if (!dryRun && batchCount > 0) await batch.commit();

  console.log(`✅ Written:  ${written} playerRounds docs`);
  console.log(`⏭️  Skipped: ${skipped} ineligible scores`);

  return affectedUserIds;
}

// ============================================================
// STEP 2: CALCULATE worldRankings
// ============================================================

async function calculateWorldRankings(affectedUserIds, userMap, dryRun) {
  console.log("\n" + "=".repeat(60));
  console.log("STEP 2: CALCULATING worldRankings");
  console.log("=".repeat(60) + "\n");

  const cutoffMs = Date.now() - DECAY_WINDOW_WEEKS * MS_PER_WEEK;
  const cutoff = admin.firestore.Timestamp.fromMillis(cutoffMs);

  let ranked = 0;
  let unranked = 0;
  let processed = 0;

  for (const userId of affectedUserIds) {
    const user = userMap.get(userId);
    if (!user) continue;

    processed++;

    // Fetch rounds in window
    const roundsSnap = await db.collection("playerRounds")
      .where("userId", "==", userId)
      .where("createdAt", ">=", cutoff)
      .get();

    let totalAdjustedPoints = 0;
    let roundsInWindow = 0;
    let latestMs = 0;

    roundsSnap.forEach((doc) => {
      const r = doc.data();
      const createdMs = r.createdAt?.toMillis?.() ?? Date.now();
      totalAdjustedPoints += applyDecay(r.roundPoints || 0, createdMs);
      roundsInWindow++;
      if (createdMs > latestMs) latestMs = createdMs;
    });

    const divisor = Math.max(MIN_ROUNDS_TO_RANK, roundsInWindow);
    const powerRating = parseFloat((totalAdjustedPoints / divisor).toFixed(2));
    const isRanked = roundsInWindow >= MIN_ROUNDS_TO_RANK;

    if (isRanked) ranked++; else unranked++;

    if (!dryRun) {
      await db.collection("worldRankings").doc(userId).set({
        userId,
        displayName: user.displayName,
        userAvatar: user.avatar,
        regionKey: user.regionKey,
        powerRating,
        rank: null, // assigned by weeklyRankingSort
        roundsInWindow,
        totalRoundsAllTime: roundsInWindow,
        challengePoints: 0,
        lastRoundAt: latestMs > 0
          ? admin.firestore.Timestamp.fromMillis(latestMs)
          : admin.firestore.Timestamp.now(),
        lastUpdated: admin.firestore.Timestamp.now(),
      });
    }

    if (processed % 20 === 0) {
      console.log(`   Processed ${processed}/${affectedUserIds.size} players...`);
    }
  }

  console.log(`✅ Ranked:   ${ranked} players (${MIN_ROUNDS_TO_RANK}+ rounds)`);
  console.log(`⏭️  Unranked: ${unranked} players (< ${MIN_ROUNDS_TO_RANK} rounds)`);
}

// ============================================================
// STEP 3: REBUILD leaderboardPlayers
// ============================================================

async function rebuildLeaderboardPlayers(userMap, dryRun) {
  console.log("\n" + "=".repeat(60));
  console.log("STEP 3: REBUILDING leaderboardPlayers INDEX");
  console.log("=".repeat(60) + "\n");

  const scoresSnap = await db.collection("scores").get();
  const grouped = {};

  scoresSnap.forEach((scoreDoc) => {
    const d = scoreDoc.data();
    if (d.isGhost || d.hadHoleInOne || !d.regionKey || !d.userId) return;
    const user = userMap.get(d.userId);
    if (!user || user.userType === "Course") return;

    const key = `${d.userId}_${d.courseId}`;
    if (!grouped[key]) {
      grouped[key] = {
        userId: d.userId,
        courseId: d.courseId,
        courseName: d.courseName,
        regionKey: d.regionKey,
        user,
        scores: [],
      };
    }
    grouped[key].scores.push(d);
  });

  let written = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const key in grouped) {
    const { userId, courseId, courseName, regionKey, user, scores } = grouped[key];

    // Find best net score
    const best = scores.reduce((a, b) => (a.netScore <= b.netScore ? a : b));
    const par = best.par || 72;

    const entry = {
      userId,
      courseId,
      displayName: user.displayName,
      userAvatar: user.avatar,
      courseName,
      regionKey,
      bestGrossScore: best.grossScore,
      bestNetScore: best.netScore,
      bestScoreToPar: best.grossScore - par,
      courseRating: best.courseRating ?? null,
      slopeRating: best.slopeRating ?? null,
      tees: best.tees ?? null,
      handicapIndex: best.handicapIndex ?? user.handicapIndex ?? null,
      location: null,
      totalRoundsAtCourse: scores.length,
      firstRoundAt: scores.reduce((a, b) =>
        (a.createdAt?.toMillis?.() ?? 0) < (b.createdAt?.toMillis?.() ?? 0) ? a : b
      ).createdAt || admin.firestore.Timestamp.now(),
      lastRoundAt: scores.reduce((a, b) =>
        (a.createdAt?.toMillis?.() ?? 0) > (b.createdAt?.toMillis?.() ?? 0) ? a : b
      ).createdAt || admin.firestore.Timestamp.now(),
    };

    if (!dryRun) {
      batch.set(db.collection("leaderboardPlayers").doc(key), entry);
      batchCount++;

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    written++;
  }

  if (!dryRun && batchCount > 0) await batch.commit();

  console.log(`✅ Written: ${written} leaderboardPlayers docs`);
  return written;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("\n" + "=".repeat(60));
  console.log("🏌️  ST POWER RANKING BACKFILL");
  console.log("=".repeat(60) + "\n");

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const rankingsOnly = args.includes("--rankings-only");

  if (dryRun) console.log("⚠️  DRY RUN MODE — no data will be written\n");

  // ── Load user profiles ──────────────────────────────────────
  console.log("👤 Loading user profiles...");
  const usersSnap = await db.collection("users").get();
  const userMap = new Map();
  usersSnap.forEach((doc) => {
    const d = doc.data();
    userMap.set(doc.id, {
      displayName: d.displayName || "Unknown",
      avatar: d.avatar || null,
      handicapIndex: d.handicapIndex ?? null,
      regionKey: d.regionKey || d.homeRegionKey || "",
      userType: d.userType || "Golfer",
    });
  });
  console.log(`   Loaded ${userMap.size} user profiles\n`);

  // ── Cache round player data ─────────────────────────────────
  console.log("🏌️  Caching multiplayer round player lists...");
  const scoresSnap = await db.collection("scores").get();
  const roundIds = new Set();
  scoresSnap.forEach((doc) => {
    const d = doc.data();
    if (d.roundId && !d.isGhost) roundIds.add(d.roundId);
  });

  const roundPlayerCache = new Map();
  let cached = 0;
  for (const roundId of roundIds) {
    roundPlayerCache.set(roundId, await getRoundPlayers(roundId));
    cached++;
    if (cached % 100 === 0) console.log(`   Cached ${cached}/${roundIds.size} rounds...`);
  }
  console.log(`   Cached ${cached} round player lists\n`);

  // ── Run steps ───────────────────────────────────────────────
  const affectedUserIds = await buildPlayerRounds(userMap, roundPlayerCache, dryRun);
  await calculateWorldRankings(affectedUserIds, userMap, dryRun);

  if (!rankingsOnly) {
    await rebuildLeaderboardPlayers(userMap, dryRun);
  }

  // ── Summary ─────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("✅ BACKFILL COMPLETE");
  console.log("=".repeat(60));
  console.log("\n⚠️  Next step: run weeklyRankingSort once to assign rank positions.\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("🔥 Backfill failed:", err);
  process.exit(1);
});