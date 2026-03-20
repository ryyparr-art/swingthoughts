/**
 * backfill-round.ts
 *
 * Manually writes score docs to the leaderboard when onScoreCreated
 * skipped them (e.g. course had no regionKey at the time).
 *
 * Usage:
 *   ts-node scripts/backfill-round.ts --scores AtAKqbdjKW6u30dXKyDE,DuCHKGA2LiUPrmWGRdrf
 *   ts-node scripts/backfill-round.ts --scores AtAKqbdjKW6u30dXKyDE,DuCHKGA2LiUPrmWGRdrf --dry-run
 */

import admin from "firebase-admin";
import * as fs from "fs";

const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT ?? "./serviceAccountKey.json";

async function backfillScore(
  db: admin.firestore.Firestore,
  scoreId: string,
  dryRun: boolean
): Promise<void> {
  console.log(`\n📋 Processing score: ${scoreId}`);

  // ── Load score doc ──────────────────────────────────────────────────────────
  const scoreSnap = await db.collection("scores").doc(scoreId).get();
  if (!scoreSnap.exists) {
    console.log(`  ⛔ Score doc not found: ${scoreId}`);
    return;
  }
  const score = scoreSnap.data()!;

  // ── Load user doc ───────────────────────────────────────────────────────────
  const userSnap = await db.collection("users").doc(score.userId).get();
  const userData = userSnap.data() ?? {};

  // ── Resolve regionKey ───────────────────────────────────────────────────────
  // First try the course doc, then fall back to the score doc itself
  const courseSnap = await db.collection("courses").doc(String(score.courseId)).get();
  const courseData = courseSnap.data();
  const regionKey: string | null = courseData?.regionKey ?? score.regionKey ?? null;

  if (!regionKey) {
    console.log(`  ⛔ No regionKey found for course ${score.courseId} — skipping`);
    return;
  }

  const { holeCount, grossScore, netScore, userId, courseId, courseName } = score;

  if (holeCount !== 18 && holeCount !== 9) {
    console.log(`  ⛔ holeCount is ${holeCount} — skipping`);
    return;
  }

  if (!score.isLeaderboardEligible || score.isSimulator) {
    console.log(`  ⛔ Score not leaderboard eligible — skipping`);
    return;
  }

  const leaderboardId = `${regionKey}_${courseId}`;
  const leaderboardRef = db.collection("leaderboards").doc(leaderboardId);

  const is18 = holeCount === 18;
  const scoresKey = is18 ? "topScores18" : "topScores9";
  const lowNetKey = is18 ? "lowNetScore18" : "lowNetScore9";
  const totalKey = is18 ? "totalScores18" : "totalScores9";

  const newScoreEntry = {
    userId,
    displayName: score.userName || userData?.displayName || "Unknown",
    userAvatar: score.avatar || userData?.avatar || null,
    challengeBadges: userData?.earnedChallengeBadges || [],
    grossScore,
    netScore,
    courseId,
    courseName,
    tees: score.tees || null,
    teeYardage: score.teeYardage || null,
    teePar: score.par || (is18 ? 72 : 36),
    par: score.par || (is18 ? 72 : 36),
    scoreId,
    createdAt: score.createdAt || admin.firestore.Timestamp.now(),
  };

  console.log(`  ℹ️  Player   : ${newScoreEntry.displayName}`);
  console.log(`  ℹ️  Course   : ${courseName} (${courseId})`);
  console.log(`  ℹ️  Scores   : gross ${grossScore} / net ${netScore}`);
  console.log(`  ℹ️  Region   : ${regionKey}`);
  console.log(`  ℹ️  Leaderboard: ${leaderboardId}`);

  if (dryRun) {
    console.log(`  [dry] Would write to leaderboard ${leaderboardId}`);
    return;
  }

  // ── Transactional leaderboard update ────────────────────────────────────────
  let isNewLowman = false;

  await db.runTransaction(async (tx) => {
    const leaderboardSnap = await tx.get(leaderboardRef);

    if (!leaderboardSnap.exists) {
      // Create new leaderboard doc
      const newDoc: Record<string, any> = {
        regionKey,
        courseId,
        courseName,
        leaderboardId,
        location: courseData?.location || score.location || null,
        topScores18: [],
        lowNetScore18: null,
        totalScores18: 0,
        topScores9: [],
        lowNetScore9: null,
        totalScores9: 0,
        totalScores: 1,
        holesInOne: [],
        createdAt: admin.firestore.Timestamp.now(),
        lastUpdated: admin.firestore.Timestamp.now(),
      };
      newDoc[scoresKey] = [newScoreEntry];
      newDoc[lowNetKey] = netScore;
      newDoc[totalKey] = 1;
      tx.set(leaderboardRef, newDoc);

      if (is18) isNewLowman = true;
      console.log(`  ✅ Created new leaderboard doc — user is lowman`);
    } else {
      const leaderboardData = leaderboardSnap.data()!;
      const topScores = [...(leaderboardData[scoresKey] || [])];
      const previousLowNet = leaderboardData[lowNetKey] ?? 999;

      // Check if this score is already in the leaderboard (idempotency)
      const alreadyExists = topScores.some((s: any) => s.scoreId === scoreId);
      if (alreadyExists) {
        console.log(`  ⚠️  Score already in leaderboard — skipping`);
        return;
      }

      topScores.push(newScoreEntry);
      topScores.sort((a: any, b: any) => {
        if (a.netScore !== b.netScore) return a.netScore - b.netScore;
        if (a.grossScore !== b.grossScore) return a.grossScore - b.grossScore;
        return a.createdAt.toMillis() - b.createdAt.toMillis();
      });

      const updatedTopScores = topScores.slice(0, 10);
      const newLowNet = updatedTopScores[0].netScore;

      if (is18 && updatedTopScores[0].userId === userId && newLowNet < previousLowNet) {
        isNewLowman = true;
      }

      tx.update(leaderboardRef, {
        [scoresKey]: updatedTopScores,
        [lowNetKey]: newLowNet,
        [totalKey]: admin.firestore.FieldValue.increment(1),
        totalScores: admin.firestore.FieldValue.increment(1),
        lastUpdated: admin.firestore.Timestamp.now(),
      });

      console.log(`  ✅ Leaderboard updated — position: #${updatedTopScores.findIndex((s: any) => s.scoreId === scoreId) + 1}`);
    }
  });

  if (isNewLowman) {
    console.log(`  🏆 New lowman at ${courseName}!`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const scoresIndex = args.indexOf("--scores");

  if (scoresIndex === -1 || !args[scoresIndex + 1]) {
    console.error("⛔ Usage: ts-node scripts/backfill-round.ts --scores <scoreId1,scoreId2,...>");
    process.exit(1);
  }

  const scoreIds = args[scoresIndex + 1].split(",").map((s) => s.trim()).filter(Boolean);

  console.log(`\n🏌️  SwingThoughts Round Backfill`);
  console.log(`   scores  : ${scoreIds.join(", ")}`);
  console.log(`   dry-run : ${dryRun}\n`);

  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  for (const scoreId of scoreIds) {
    await backfillScore(db, scoreId, dryRun);
  }

  console.log(`\n✅ Done\n`);
}

main().catch((err) => {
  console.error("🔥 Fatal:", err);
  process.exit(1);
});