/**
 * Challenge Evaluator
 *
 * Evaluates a posted score against all active challenges the user is registered for.
 * Called from both onScoreCreated (standalone) and onLeagueScoreCreated (league).
 *
 * Flow:
 *   1. Score is posted → trigger fires
 *   2. Check user's activeChallenges array
 *   3. For each active challenge, evaluate the score
 *   4. Update progress in challenges/{id}/participants/{userId}
 *   5. If threshold met → award badge, check cumulative tiers
 *   6. Send notifications (earned, progress milestones, DTP pin claimed/lost)
 *
 * File: functions/src/triggers/challengeEvaluator.ts
 */

import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { createNotificationDocument, getUserData } from "../notifications/helpers.js";
import { writeBadgeEarnedActivity, writeDTPClaimedActivity } from "./feedActivity";

const db = getFirestore();

// ============================================================================
// TYPES
// ============================================================================

interface ScoreData {
  userId: string;
  grossScore: number;
  netScore?: number;
  holeScores: number[];
  holePars: number[];      // par for each hole
  holesCount: number;      // 9 or 18
  courseId: string | number;
  courseName?: string;
  // FIR/GIR
  fairwaysHit?: number;
  fairwaysPossible?: number;
  greensHit?: number;
  greensPossible?: number;
  hasFirData?: boolean;    // user interacted with FIR toggles
  hasGirData?: boolean;    // user interacted with GIR toggles
  // DTP
  dtpMeasurements?: Array<{ hole: number; par: number; distance: number }>;
  // Score doc ref
  scoreId?: string;
}

interface ChallengeProgress {
  earned: boolean;
  [key: string]: any;
}

// ============================================================================
// MAIN EVALUATOR
// ============================================================================

export async function evaluateChallenges(scoreData: ScoreData): Promise<void> {
  const { userId } = scoreData;

  try {
    // 1. Get user's active challenges
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return;

    const userData = userDoc.data()!;
    const activeChallenges: string[] = userData.activeChallenges || [];

    if (activeChallenges.length === 0) return;

    console.log(
      `🎯 Evaluating ${activeChallenges.length} challenges for ${userId}`
    );

    // 2. Evaluate each active challenge
    const badgesEarned: string[] = [];

    for (const challengeId of activeChallenges) {
      try {
        const participantRef = db
          .collection("challenges")
          .doc(challengeId)
          .collection("participants")
          .doc(userId);

        const participantDoc = await participantRef.get();
        if (!participantDoc.exists) continue;

        const participant = participantDoc.data() as ChallengeProgress;

        // Skip if already earned
        if (participant.earned) continue;

        let earned = false;

        switch (challengeId) {
          case "par3":
            earned = await evaluatePar3(participantRef, participant, scoreData);
            break;
          case "fir":
            earned = await evaluateFIR(participantRef, participant, scoreData);
            break;
          case "gir":
            earned = await evaluateGIR(participantRef, participant, scoreData);
            break;
          case "birdie_streak":
            earned = await evaluateBirdieStreak(participantRef, participant, scoreData);
            break;
          case "iron_player":
            earned = await evaluateIronPlayer(participantRef, participant, scoreData);
            break;
          case "dtp":
            earned = await evaluateDTP(participantRef, participant, scoreData);
            break;
          // ace is handled by onHoleInOneUpdated trigger, not score evaluator
          default:
            break;
        }

        if (earned) {
          badgesEarned.push(challengeId);
        }
      } catch (err) {
        console.error(`⚠️ Error evaluating challenge ${challengeId}:`, err);
      }
    }

    // 3. Award badges and check cumulative tiers
    if (badgesEarned.length > 0) {
      await awardBadges(userId, badgesEarned);
    }
  } catch (error) {
    console.error(`🔥 Challenge evaluator failed for ${userId}:`, error);
  }
}

// ============================================================================
// INDIVIDUAL CHALLENGE EVALUATORS
// ============================================================================

/**
 * Par 3 Champion
 * Running average across all par 3 holes played
 */
async function evaluatePar3(
  ref: FirebaseFirestore.DocumentReference,
  participant: ChallengeProgress,
  score: ScoreData
): Promise<boolean> {
  // Extract par 3 holes from this round
  const par3Holes: number[] = [];
  for (let i = 0; i < score.holesCount; i++) {
    if (score.holePars[i] === 3) {
      par3Holes.push(score.holeScores[i]);
    }
  }

  if (par3Holes.length === 0) return false;

  const newHoles = par3Holes.length;
  const newScore = par3Holes.reduce((sum, s) => sum + s, 0);

  const previousHoles = participant.totalPar3Holes || 0;
  const totalHoles = previousHoles + newHoles;
  const totalScore = (participant.totalPar3Score || 0) + newScore;
  const currentAverage = totalScore / totalHoles;

  const updates: Record<string, any> = {
    totalPar3Holes: totalHoles,
    totalPar3Score: totalScore,
    currentAverage: Math.round(currentAverage * 100) / 100,
  };

  // Check threshold: need minSample (50) holes AND average ≤ target
  const threshold = participant.targetThreshold;
  if (totalHoles >= 50 && currentAverage <= threshold) {
    updates.earned = true;
    updates.earnedAt = FieldValue.serverTimestamp();
    await ref.update(updates);
    console.log(`🏆 Par 3 Champion earned! Avg: ${currentAverage.toFixed(2)}`);
    return true;
  }

  // Check progress milestones (based on hole count toward 50)
  await checkProgressMilestones(
    score.userId,
    "par3",
    totalHoles,
    50,
    previousHoles,
    `${totalHoles}/50 holes`
  );

  await ref.update(updates);
  return false;
}

/**
 * Fairway Finder
 * Running FIR% across qualifying rounds
 */
async function evaluateFIR(
  ref: FirebaseFirestore.DocumentReference,
  participant: ChallengeProgress,
  score: ScoreData
): Promise<boolean> {
  // Only count rounds where user tracked FIR
  if (!score.hasFirData || score.fairwaysHit === undefined) return false;

  const newRounds = 1;
  const newHit = score.fairwaysHit;
  const newPossible = score.fairwaysPossible || 0;

  const previousRounds = participant.qualifyingRounds || 0;
  const totalRounds = previousRounds + newRounds;
  const totalHit = (participant.totalFairwaysHit || 0) + newHit;
  const totalPossible = (participant.totalFairwaysPossible || 0) + newPossible;
  const currentPct = totalPossible > 0 ? (totalHit / totalPossible) * 100 : 0;

  const updates: Record<string, any> = {
    qualifyingRounds: totalRounds,
    totalFairwaysHit: totalHit,
    totalFairwaysPossible: totalPossible,
    currentPercentage: Math.round(currentPct * 10) / 10,
  };

  // Check threshold: need 10 rounds AND FIR% ≥ target
  const threshold = participant.targetThreshold;
  if (totalRounds >= 10 && currentPct >= threshold) {
    updates.earned = true;
    updates.earnedAt = FieldValue.serverTimestamp();
    await ref.update(updates);
    console.log(`🏆 Fairway Finder earned! FIR: ${currentPct.toFixed(1)}%`);
    return true;
  }

  // Check progress milestones (based on round count toward 10)
  await checkProgressMilestones(
    score.userId,
    "fir",
    totalRounds,
    10,
    previousRounds,
    `${totalRounds}/10 rounds`
  );

  await ref.update(updates);
  return false;
}

/**
 * GIR Master
 * Running GIR% across qualifying rounds
 */
async function evaluateGIR(
  ref: FirebaseFirestore.DocumentReference,
  participant: ChallengeProgress,
  score: ScoreData
): Promise<boolean> {
  // Only count rounds where user tracked GIR
  if (!score.hasGirData || score.greensHit === undefined) return false;

  const newRounds = 1;
  const newHit = score.greensHit;
  const newPossible = score.greensPossible || score.holesCount;

  const previousRounds = participant.qualifyingRounds || 0;
  const totalRounds = previousRounds + newRounds;
  const totalHit = (participant.totalGreensHit || 0) + newHit;
  const totalPossible = (participant.totalGreensPossible || 0) + newPossible;
  const currentPct = totalPossible > 0 ? (totalHit / totalPossible) * 100 : 0;

  const updates: Record<string, any> = {
    qualifyingRounds: totalRounds,
    totalGreensHit: totalHit,
    totalGreensPossible: totalPossible,
    currentPercentage: Math.round(currentPct * 10) / 10,
  };

  // Check threshold: need 10 rounds AND GIR% ≥ target
  const threshold = participant.targetThreshold;
  if (totalRounds >= 10 && currentPct >= threshold) {
    updates.earned = true;
    updates.earnedAt = FieldValue.serverTimestamp();
    await ref.update(updates);
    console.log(`🏆 GIR Master earned! GIR: ${currentPct.toFixed(1)}%`);
    return true;
  }

  // Check progress milestones (based on round count toward 10)
  await checkProgressMilestones(
    score.userId,
    "gir",
    totalRounds,
    10,
    previousRounds,
    `${totalRounds}/10 rounds`
  );

  await ref.update(updates);
  return false;
}

/**
 * Birdie Streak
 * Longest consecutive birdies (or better) in a single round
 */
async function evaluateBirdieStreak(
  ref: FirebaseFirestore.DocumentReference,
  participant: ChallengeProgress,
  score: ScoreData
): Promise<boolean> {
  // Walk through holes and find longest birdie streak
  let currentStreak = 0;
  let longestStreak = 0;

  for (let i = 0; i < score.holesCount; i++) {
    if (score.holeScores[i] < score.holePars[i]) {
      // Birdie or better
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const previousBest = participant.bestStreak || 0;
  const newBest = Math.max(previousBest, longestStreak);

  const updates: Record<string, any> = {
    bestStreak: newBest,
  };

  // Check threshold
  const threshold = participant.targetThreshold;
  if (newBest >= threshold) {
    updates.earned = true;
    updates.earnedAt = FieldValue.serverTimestamp();
    await ref.update(updates);
    console.log(`🏆 Birdie Streak earned! Streak: ${newBest}`);
    return true;
  }

  // No progress milestones for birdie streak — single-round achievement

  await ref.update(updates);
  return false;
}

/**
 * Iron Player
 * Break target score in 5 consecutive 18-hole rounds
 */
async function evaluateIronPlayer(
  ref: FirebaseFirestore.DocumentReference,
  participant: ChallengeProgress,
  score: ScoreData
): Promise<boolean> {
  // Only 18-hole rounds count
  if (score.holesCount !== 18) return false;

  const targetScore = participant.targetScore || participant.targetThreshold;
  const currentCount = participant.consecutiveCount || 0;

  let newCount: number;

  if (score.grossScore < targetScore) {
    // Under target — extend streak
    newCount = currentCount + 1;
  } else {
    // At or above target — reset
    newCount = 0;
  }

  const updates: Record<string, any> = {
    consecutiveCount: newCount,
  };

  // Check threshold: 5 consecutive
  if (newCount >= 5) {
    updates.earned = true;
    updates.earnedAt = FieldValue.serverTimestamp();
    await ref.update(updates);
    console.log(`🏆 Iron Player earned! ${newCount} consecutive under ${targetScore}`);
    return true;
  }

  // Check progress milestones (based on consecutive count toward 5)
  await checkProgressMilestones(
    score.userId,
    "iron_player",
    newCount,
    5,
    currentCount,
    `${newCount}/5 consecutive rounds`
  );

  await ref.update(updates);
  return false;
}

/**
 * Closest to Pin (DTP)
 * Living challenge — claim/defend pins on designated par 3 holes
 */
async function evaluateDTP(
  ref: FirebaseFirestore.DocumentReference,
  participant: ChallengeProgress,
  score: ScoreData
): Promise<boolean> {
  if (!score.dtpMeasurements || score.dtpMeasurements.length === 0) return false;

  const courseId = String(score.courseId);
  const userId = score.userId;
  let pinClaimed = false;
  let claimedCourseName = score.courseName || "a course";
  let claimedHole = 0;
  let claimedDistance = 0;

  for (const measurement of score.dtpMeasurements) {
    const courseRef = db
      .collection("challenges")
      .doc("dtp")
      .collection("courses")
      .doc(courseId);

    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      // First DTP entry at this course — this hole becomes the designated hole
      const userInfo = await getUserData(userId);

      await courseRef.set({
        courseName: score.courseName || "",
        designatedHole: measurement.hole,
        designatedPar: 3,
        setByUserId: userId,
        setAt: FieldValue.serverTimestamp(),
        currentHolderId: userId,
        currentHolderName: userInfo?.displayName || "Unknown",
        currentHolderAvatar: userInfo?.avatar || null,
        currentDistance: measurement.distance,
        currentScoreId: score.scoreId || "",
        recordedAt: FieldValue.serverTimestamp(),
        previousHolders: [],
      });

      pinClaimed = true;
      claimedCourseName = score.courseName || "a course";
      claimedHole = measurement.hole;
      claimedDistance = measurement.distance;

      console.log(
        `📍 DTP: ${userId} set designated hole #${measurement.hole} at ${courseId} — ${measurement.distance}ft`
      );
    } else {
      const courseData = courseDoc.data()!;

      // Only the designated hole counts
      if (measurement.hole !== courseData.designatedHole) continue;

      // Is this measurement closer than the current holder?
      if (measurement.distance < courseData.currentDistance) {
        const previousHolder = {
          userId: courseData.currentHolderId,
          name: courseData.currentHolderName,
          distance: courseData.currentDistance,
          date: courseData.recordedAt,
        };

        const previousHolders = courseData.previousHolders || [];
        previousHolders.push(previousHolder);

        // Notify the previous holder they lost their pin
        if (courseData.currentHolderId !== userId) {
          await notifyPinLost(
            courseData.currentHolderId,
            userId,
            courseData.courseName || "",
            courseData.designatedHole,
            measurement.distance,
            courseData.currentDistance
          );

          // Update previous holder's pin count
          await updateDTPPinCount(courseData.currentHolderId);
        }

        const userInfo = await getUserData(userId);

        await courseRef.update({
          currentHolderId: userId,
          currentHolderName: userInfo?.displayName || "Unknown",
          currentHolderAvatar: userInfo?.avatar || null,
          currentDistance: measurement.distance,
          currentScoreId: score.scoreId || "",
          recordedAt: FieldValue.serverTimestamp(),
          previousHolders,
        });

        pinClaimed = true;
        claimedCourseName = courseData.courseName || score.courseName || "a course";
        claimedHole = courseData.designatedHole;
        claimedDistance = measurement.distance;

        console.log(
          `📍 DTP: ${userId} claimed pin at ${courseId} hole #${measurement.hole} — ${measurement.distance}ft (was ${courseData.currentDistance}ft)`
        );
      }
    }
  }

  if (pinClaimed) {
    // Notify the winner they claimed a pin
    await createNotificationDocument({
      userId,
      type: "dtp_claimed",
      message: `You claimed the pin at ${claimedCourseName} Hole #${claimedHole} — ${claimedDistance}ft! 🎯`,
    });

    // Feed activity: DTP pin claimed
    try {
      const dtpUserSnap = await db.collection("users").doc(userId).get();
      const dtpUserData = dtpUserSnap.data();
      await writeDTPClaimedActivity(
        userId,
        dtpUserData?.displayName || "Someone",
        dtpUserData?.avatar || null,
        claimedCourseName,
        claimedHole,
        claimedDistance,
        dtpUserData?.regionKey || ""
      );
    } catch (feedErr) {
      console.warn("⚠️ Failed to write DTP claimed feed activity:", feedErr);
    }

    // Update this user's pin count and check badge status
    const earned = await updateDTPPinCount(userId);
    return earned;
  }

  return false;
}

// ============================================================================
// DTP HELPERS
// ============================================================================

/**
 * Recount pins held by a user and update their participant doc + user doc
 */
async function updateDTPPinCount(userId: string): Promise<boolean> {
  // Count all courses where this user holds the pin
  const coursesSnap = await db
    .collection("challenges")
    .doc("dtp")
    .collection("courses")
    .where("currentHolderId", "==", userId)
    .get();

  const pinsHeld = coursesSnap.size;
  const coursesWithPins = coursesSnap.docs.map((d) => d.id);

  // Update participant doc
  const participantRef = db
    .collection("challenges")
    .doc("dtp")
    .collection("participants")
    .doc(userId);

  const participantDoc = await participantRef.get();
  if (!participantDoc.exists) return false;

  const participant = participantDoc.data()!;
  const wasEarned = participant.earned;

  const updates: Record<string, any> = {
    pinsHeld,
    coursesWithPins,
  };

  // Badge earned if holding ≥ 1 pin
  if (pinsHeld > 0 && !wasEarned) {
    updates.earned = true;
    updates.earnedAt = FieldValue.serverTimestamp();
  } else if (pinsHeld === 0 && wasEarned) {
    // Lost all pins — remove badge
    updates.earned = false;
    updates.earnedAt = FieldValue.delete();
  }

  await participantRef.update(updates);

  // Update user doc pin count for quick reads
  await db.collection("users").doc(userId).update({
    dtpPinsHeld: pinsHeld,
  });

  // Return true if badge was just earned (newly)
  return pinsHeld > 0 && !wasEarned;
}

async function notifyPinLost(
  loserId: string,
  winnerId: string,
  courseName: string,
  hole: number,
  newDistance: number,
  oldDistance: number
): Promise<void> {
  try {
    const winnerData = await getUserData(winnerId);

    await createNotificationDocument({
      userId: loserId,
      type: "dtp_lost",
      actorId: winnerId,
      actorName: winnerData?.displayName || "Someone",
      actorAvatar: winnerData?.avatar || undefined,
      message: `beat your pin at ${courseName} Hole #${hole}! ${newDistance}ft vs your ${oldDistance}ft`,
    });

    console.log(`📍 DTP pin lost notification sent to ${loserId}`);
  } catch (err) {
    console.error("Failed to send DTP pin lost notification:", err);
  }
}

// ============================================================================
// PROGRESS MILESTONE NOTIFICATIONS
// ============================================================================

/**
 * Check if a user has crossed the 50% or 75% progress milestone
 * and send a notification if so.
 *
 * Compares previous value to current value against the target
 * to detect when a milestone threshold is freshly crossed.
 */
async function checkProgressMilestones(
  userId: string,
  challengeId: string,
  currentValue: number,
  targetValue: number,
  previousValue: number,
  metricLabel: string
): Promise<void> {
  try {
    const pct = (currentValue / targetValue) * 100;
    const prevPct = (previousValue / targetValue) * 100;

    const milestones = [
      { threshold: 50, label: "halfway" },
      { threshold: 75, label: "75%" },
    ];

    for (const milestone of milestones) {
      // Only notify when freshly crossing the threshold
      if (pct >= milestone.threshold && prevPct < milestone.threshold) {
        await createNotificationDocument({
          userId,
          type: "challenge_progress",
          message: `You're ${milestone.label} to the ${getBadgeName(challengeId)} badge! ${metricLabel} 📈`,
        });
        console.log(
          `📈 ${challengeId} progress: ${milestone.label} for ${userId}`
        );
      }
    }
  } catch (err) {
    console.error("Failed to send progress notification:", err);
  }
}

// ============================================================================
// BADGE AWARDING & CUMULATIVE TIERS
// ============================================================================

const CUMULATIVE_TIERS = [
  { id: "tier_amateur", name: "The Amateur", requiredBadges: 3 },
  { id: "tier_next_tour", name: "The Next Tour Player", requiredBadges: 5 },
  { id: "tier_tour", name: "The Tour Player", requiredBadges: 7 },
];

async function awardBadges(
  userId: string,
  newBadgeIds: string[]
): Promise<void> {
  try {
    // Update user doc — add to earnedChallengeBadges
    await db.collection("users").doc(userId).update({
      earnedChallengeBadges: FieldValue.arrayUnion(...newBadgeIds),
    });

    // Update challenge docs — increment earnedCount
    for (const badgeId of newBadgeIds) {
      await db.collection("challenges").doc(badgeId).update({
        earnedCount: FieldValue.increment(1),
      });

      // Send badge earned notification
      await createNotificationDocument({
        userId,
        type: "challenge_earned",
        message: `You earned the ${getBadgeName(badgeId)} badge! 🏆`,
      });

      // Feed activity: badge earned
      try {
        const badgeUserSnap = await db.collection("users").doc(userId).get();
        const badgeUserData = badgeUserSnap.data();
        await writeBadgeEarnedActivity(
          userId,
          badgeUserData?.displayName || "Someone",
          badgeUserData?.avatar || null,
          badgeId,
          getBadgeName(badgeId),
          badgeUserData?.regionKey || ""
        );
      } catch (feedErr) {
        console.warn("⚠️ Failed to write badge earned feed activity:", feedErr);
      }

      console.log(`🏆 Badge awarded: ${badgeId} → ${userId}`);
    }

    // Check cumulative tiers
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data()!;
    const earnedBadges: string[] = userData.earnedChallengeBadges || [];
    const dtpPinsHeld: number = userData.dtpPinsHeld || 0;

    // Count active badges (exclude tiers, DTP only counts if pins > 0)
    let activeBadgeCount = 0;
    for (const badge of earnedBadges) {
      if (badge.startsWith("tier_")) continue;
      if (badge === "dtp") {
        if (dtpPinsHeld > 0) activeBadgeCount++;
        continue;
      }
      activeBadgeCount++;
    }

    // Check each tier
    const alreadyEarnedTiers = earnedBadges.filter((b) => b.startsWith("tier_"));
    const newTiers: string[] = [];

    for (const tier of CUMULATIVE_TIERS) {
      if (
        activeBadgeCount >= tier.requiredBadges &&
        !alreadyEarnedTiers.includes(tier.id)
      ) {
        newTiers.push(tier.id);
      }
    }

    if (newTiers.length > 0) {
      await db.collection("users").doc(userId).update({
        earnedChallengeBadges: FieldValue.arrayUnion(...newTiers),
      });

      for (const tierId of newTiers) {
        const tierDef = CUMULATIVE_TIERS.find((t) => t.id === tierId);
        await createNotificationDocument({
          userId,
          type: "challenge_tier",
          message: `You've reached ${tierDef?.name || "a new milestone"}! ⭐`,
        });

        console.log(`⭐ Cumulative tier awarded: ${tierId} → ${userId}`);
      }
    }
  } catch (err) {
    console.error("Failed to award badges:", err);
  }
}

function getBadgeName(badgeId: string): string {
  const names: Record<string, string> = {
    par3: "Par 3 Champion",
    fir: "Fairway Finder",
    gir: "GIR Master",
    birdie_streak: "Birdie Streak",
    iron_player: "Iron Player",
    dtp: "Closest to Pin",
    ace: "Ace Hunter",
  };
  return names[badgeId] || badgeId;
}

// ============================================================================
// ACE HUNTER EVALUATOR (separate — called from onHoleInOneUpdated)
// ============================================================================

/**
 * Called when a hole-in-one is verified.
 * Check if user is registered for Ace Hunter and award badge.
 */
export async function evaluateAceHunter(userId: string): Promise<void> {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return;

    const activeChallenges: string[] = userDoc.data()?.activeChallenges || [];
    if (!activeChallenges.includes("ace")) return;

    const participantRef = db
      .collection("challenges")
      .doc("ace")
      .collection("participants")
      .doc(userId);

    const participantDoc = await participantRef.get();
    if (!participantDoc.exists) return;

    const participant = participantDoc.data()!;
    if (participant.earned) return; // Already earned

    // Award!
    await participantRef.update({
      verified: true,
      earned: true,
      earnedAt: FieldValue.serverTimestamp(),
    });

    await awardBadges(userId, ["ace"]);
    console.log(`🏆 Ace Hunter earned by ${userId}!`);
  } catch (err) {
    console.error("Ace Hunter evaluation failed:", err);
  }
}