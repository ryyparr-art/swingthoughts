/**
 * Score Triggers
 * 
 * Handles: onScoreCreated
 * Updates leaderboards, awards badges, sends partner notifications,
 * and updates career stats.
 * 
 * Thought (clubhouse post) creation is REMOVED — feed is now driven
 * entirely by feedActivity cards written by rounds.ts on completion.
 * 
 * Eligibility checks:
 *   - isLeaderboardEligible === false → skip leaderboard update
 *   - countsForHandicap === false → skip career stats + handicap
 *   - isSimulator === true → skip leaderboard + career stats
 */

import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { createNotificationDocument } from "../notifications/helpers";
import { upsertLeaderboardPlayer } from "../utils/leaderboardPlayers";
import {
  calculatePlayerRanking,
  normaliseGameFormatId,
  soloFieldStrength,
} from "../utils/rankingEngine";
import {
  writeAceTierEarnedActivity,
  writeLowLeaderChangeActivity,
  writeLowRoundActivity,
  writeScratchEarnedActivity,
} from "./feedActivity";
import { updateUserCareerStats } from "./userStats";

const db = getFirestore();

export const onScoreCreated = onDocumentCreated(
  "scores/{scoreId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const score = snap.data();
      if (!score) return;

      const scoreId = event.params.scoreId;
      console.log("📝 New score created:", scoreId);

      // Ghost scores (from multiplayer rounds) — skip entire pipeline
      if (score.isGhost) {
        console.log("👻 Ghost score — skipping onScoreCreated pipeline");
        return;
      }

      const {
        userId, courseId, courseName, netScore, grossScore, userName,
        holeCount, regionKey, location,
        hadHoleInOne, holeNumber, tee, teeYardage,
      } = score;

      if (!userId || courseId === undefined || !courseName || typeof netScore !== "number" || typeof grossScore !== "number") {
        console.log("⛔ Score missing required fields");
        return;
      }

      const userRef = db.collection("users").doc(userId);
      const userSnap = await userRef.get();
      const userData = userSnap.data();

      if (!userData) {
        console.log("⚠️ User not found:", userId);
        return;
      }

      // ── ELIGIBILITY FLAGS ─────────────────────────────────────
      const isSimulator = score.isSimulator === true;
      const isLeaderboardEligible = score.isLeaderboardEligible !== false;
      const countsForHandicap = score.countsForHandicap !== false;

      // ── FETCH COURSE DOC ──────────────────────────────────────
      // Fetched once and reused for: leaderboard regionKey, location, and
      // challenge hole pars. Prevents duplicate reads later in the pipeline.
      const courseDocSnap = await db.collection("courses").doc(String(courseId)).get();
      const courseDocData = courseDocSnap.data();

      // ── LEADERBOARD UPDATE ────────────────────────────────────
      let isNewLowman = false;
      // userId of the player displaced from lowman — used to update their lowmanCourses[]
      let displacedLowmanId: string | null = null;

      if ((holeCount === 18 || holeCount === 9) && isLeaderboardEligible && !isSimulator) {

        // Prefer leaderboardId baked into the score at round creation time —
        // this is set by scoring/index.tsx via CourseSelector and eliminates
        // the need for a course doc lookup to resolve the region.
        // Fall back to course doc regionKey for legacy rounds.
        const courseRegionKey: string | null =
          courseDocData?.regionKey ?? score.regionKey ?? null;

        const resolvedLeaderboardId: string | null =
          score.leaderboardId ??
          courseDocData?.leaderboardId ??
          (courseRegionKey ? `${courseRegionKey}_${courseId}` : null);

        if (!resolvedLeaderboardId || !courseRegionKey) {
          console.log(`⏭️ Skipping leaderboard — course ${courseId} has no regionKey`);
        } else {
          const leaderboardId = resolvedLeaderboardId;
          const leaderboardRef = db.collection("leaderboards").doc(leaderboardId);

          const is18 = holeCount === 18;
          const scoresKey = is18 ? "topScores18" : "topScores9";
          const lowNetKey = is18 ? "lowNetScore18" : "lowNetScore9";
          const totalKey = is18 ? "totalScores18" : "totalScores9";

          const newScoreEntry = {
            userId,
            displayName: userName || userData?.displayName || "Unknown",
            userAvatar: userData?.avatar || null,
            challengeBadges: userData?.earnedChallengeBadges || [],
            grossScore, netScore, courseId, courseName,
            tees: tee || null, teeYardage: teeYardage || null,
            teePar: score.par || (is18 ? 72 : 36), par: score.par || (is18 ? 72 : 36),
            scoreId, createdAt: Timestamp.now(),
          };

          await db.runTransaction(async (tx) => {
            const leaderboardSnap = await tx.get(leaderboardRef);

            if (!leaderboardSnap.exists) {
              const newDoc: Record<string, any> = {
                regionKey: courseRegionKey,
                courseId, courseName,
                leaderboardId,
                location: courseDocData?.location || location || null,
                topScores18: [], lowNetScore18: null, totalScores18: 0,
                topScores9: [], lowNetScore9: null, totalScores9: 0,
                totalScores: 1, holesInOne: [],
                createdAt: Timestamp.now(), lastUpdated: Timestamp.now(),
              };
              newDoc[scoresKey] = [newScoreEntry];
              newDoc[lowNetKey] = netScore;
              newDoc[totalKey] = 1;

              tx.set(leaderboardRef, newDoc);

              if (is18) {
                isNewLowman = true;
                console.log("✅ New leaderboard created, user is lowman (18-hole)");
              } else {
                console.log("✅ New leaderboard created with 9-hole score");
              }
            } else {
              const leaderboardData = leaderboardSnap.data()!;
              const topScores = [...(leaderboardData[scoresKey] || [])];
              const previousLowNet = leaderboardData[lowNetKey] ?? 999;

              // Capture previous lowman before sorting so we can update their
              // lowmanCourses[] if they get displaced
              const previousLowmanUserId: string | null =
                topScores.length > 0 ? (topScores[0].userId ?? null) : null;

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
                console.log("🏆 NEW LOWMAN! User:", userId);
                // Record who was displaced (only if it's a different user)
                if (previousLowmanUserId && previousLowmanUserId !== userId) {
                  displacedLowmanId = previousLowmanUserId;
                }
              }

              tx.update(leaderboardRef, {
                [scoresKey]: updatedTopScores,
                [lowNetKey]: newLowNet,
                [totalKey]: FieldValue.increment(1),
                totalScores: FieldValue.increment(1),
                lastUpdated: Timestamp.now(),
              });
              console.log(`✅ Leaderboard updated (${holeCount}-hole)`);
            }
          });

          // ── LEADERBOARD PLAYERS INDEX ───────────────────────────
          // Outside the transaction — upsertLeaderboardPlayer does its own
          // getDoc internally which would conflict with the tx read set.
          try {
            await upsertLeaderboardPlayer({
              userId,
              courseId,
              courseName,
              regionKey: courseRegionKey,
              displayName: userName || userData?.displayName || "Unknown",
              userAvatar: userData?.avatar || null,
              grossScore,
              netScore,
              scoreToPar: grossScore - (score.par || (holeCount === 18 ? 72 : 36)),
              courseRating: score.courseRating ?? null,
              slopeRating: score.slopeRating ?? null,
              tees: tee || null,
              handicapIndex: score.handicapIndex ?? null,
              createdAt: Timestamp.now(),
              location: courseDocData?.location || location || undefined,
            });
          } catch (lpErr) {
            console.error("⚠️ leaderboardPlayers upsert failed (non-critical):", lpErr);
          }

          // ── AWARD BADGES (18-hole only) ─────────────────────────
          if (isNewLowman && is18) {
            console.log("🏆 Awarding badges...");

            const courseKey = String(courseId);

            const lowmanBadge = {
              type: "lowman", courseId, courseName,
              achievedAt: Timestamp.now(), score: grossScore, displayName: "Lowman",
            };
            const currentBadges = userData?.Badges || [];

            // Add this course to lowmanCourses — single field read, no collection scan.
            // lowmanCourses[] is maintained as a denormalized list of courseIds where
            // this user currently holds the lowman position. Backfilled via
            // src/backfills/backfillLowmanCourses.ts before this code was deployed.
            const existingLowmanCourses: string[] = userData?.lowmanCourses || [];
            const updatedLowmanCourses = existingLowmanCourses.includes(courseKey)
              ? existingLowmanCourses
              : [...existingLowmanCourses, courseKey];

            await userRef.update({
              Badges: [...currentBadges, lowmanBadge],
              lowmanCourses: updatedLowmanCourses,
            });
            console.log("✅ Lowman badge awarded");

            // Remove this course from the displaced lowman's lowmanCourses
            if (displacedLowmanId) {
              try {
                const displacedRef = db.collection("users").doc(displacedLowmanId);
                const displacedSnap = await displacedRef.get();
                if (displacedSnap.exists) {
                  const displacedCourses: string[] = displacedSnap.data()?.lowmanCourses || [];
                  await displacedRef.update({
                    lowmanCourses: displacedCourses.filter((c) => c !== courseKey),
                  });
                  console.log(`✅ Removed ${courseKey} from displaced lowman ${displacedLowmanId}`);
                }
              } catch (err) {
                console.error("⚠️ Failed to update displaced lowman courses (non-critical):", err);
              }
            }

            await writeLowLeaderChangeActivity(
              userId,
              userData?.displayName || "Unknown",
              userData?.avatar || null,
              courseName,
              netScore,
              courseRegionKey
            );

            // ── BADGE TIER CHECK ────────────────────────────────────
            // Read lowmanCourses.length directly — O(1), replaces the full
            // leaderboard collection scan that previously fired here.
            const lowmanCount = updatedLowmanCourses.length;
            console.log(`🏆 Lowman course count: ${lowmanCount}`);

            const existingBadges = userData?.Badges || [];
            const filteredBadges = existingBadges.filter(
              (b: any) => b.type !== "scratch" && b.type !== "ace"
            );

            if (lowmanCount >= 3) {
              await userRef.update({
                Badges: [...filteredBadges, {
                  type: "ace", courseId: 0, courseName: "Multiple Courses",
                  achievedAt: Timestamp.now(), displayName: "Ace",
                }],
              });
              console.log("🏆 Upgraded to Ace badge!");

              // Fetch only the specific leaderboard docs we know this user leads —
              // 2-3 targeted reads instead of a full collection scan
              const aceCourseNames: string[] = [];
              for (const cId of updatedLowmanCourses.slice(0, 3)) {
                try {
                  const lbId = `${courseRegionKey}_${cId}`;
                  const lbSnap = await db.collection("leaderboards").doc(lbId).get();
                  if (lbSnap.exists) {
                    aceCourseNames.push(lbSnap.data()?.courseName || cId);
                  }
                } catch (err) {
                  console.error(`⚠️ Could not fetch leaderboard name for ${cId}:`, err);
                }
              }

              await writeAceTierEarnedActivity(
                userId,
                userData?.displayName || "Unknown",
                userData?.avatar || null,
                aceCourseNames,
                courseRegionKey
              );
            } else if (lowmanCount >= 2) {
              await userRef.update({
                Badges: [...filteredBadges, {
                  type: "scratch", courseId: 0, courseName: "Multiple Courses",
                  achievedAt: Timestamp.now(), displayName: "Scratch",
                }],
              });
              console.log("🏆 Upgraded to Scratch badge!");

              const scratchCourseNames: string[] = [];
              for (const cId of updatedLowmanCourses.slice(0, 2)) {
                try {
                  const lbId = `${courseRegionKey}_${cId}`;
                  const lbSnap = await db.collection("leaderboards").doc(lbId).get();
                  if (lbSnap.exists) {
                    scratchCourseNames.push(lbSnap.data()?.courseName || cId);
                  }
                } catch (err) {
                  console.error(`⚠️ Could not fetch leaderboard name for ${cId}:`, err);
                }
              }

              await writeScratchEarnedActivity(
                userId,
                userData?.displayName || "Unknown",
                userData?.avatar || null,
                scratchCourseNames,
                courseRegionKey
              );
            }
          }
        }
      } else if ((holeCount === 18 || holeCount === 9) && (!isLeaderboardEligible || isSimulator)) {
        console.log("⏭️ Score not leaderboard eligible (format or simulator) — skipping leaderboard");
      }

      // ── PARTNER NOTIFICATIONS ─────────────────────────────────
      const partners = userData?.partners || [];
      if (Array.isArray(partners) && partners.length > 0) {
        const roundId = score.roundId || null;
        let roundPlayers: any[] = [];
        let roundPlayerIdSet = new Set<string>();

        if (roundId) {
          try {
            const roundSnap = await db.collection("rounds").doc(roundId).get();
            const roundData = roundSnap.data();
            if (roundData?.players) {
              roundPlayers = roundData.players;
              roundPlayerIdSet = new Set(
                roundData.players
                  .filter((p: any) => !p.isGhost)
                  .map((p: any) => p.playerId)
              );
            }
          } catch (e) {
            console.error("⚠️ Failed to fetch round for partner notification:", e);
          }
        }

        const actorName = userName || userData?.displayName || "Unknown";
        let withString = "";
        if (roundPlayers.length > 1) {
          const others = roundPlayers.filter((p: any) => p.playerId !== userId);
          const namedPlayer = others.find((p: any) => !p.isGhost) || others[0];
          const remainingCount = others.length - 1;

          if (namedPlayer) {
            withString = ` with ${namedPlayer.displayName}`;
            if (remainingCount === 1) {
              const third = others.find((p: any) => p.playerId !== namedPlayer.playerId);
              withString += ` & ${third?.displayName || "1 other"}`;
            } else if (remainingCount > 1) {
              withString += ` & ${remainingCount} other${remainingCount > 1 ? "s" : ""}`;
            }
          }
        }

        const message = `${actorName} played a round at ${courseName}${withString}`;

        for (const partnerId of partners) {
          if (roundPlayerIdSet.has(partnerId)) {
            console.log(`⏭️ Skipping partner_scored for ${partnerId} — was in the round`);
            continue;
          }

          await createNotificationDocument({
            userId: partnerId, type: "partner_scored",
            actorId: userId, actorName,
            actorAvatar: userData?.avatar || undefined,
            scoreId, courseId, courseName, regionKey,
            message,
            navigationTarget: "profile",
            navigationUserId: userId,
            navigationTab: "rounds",
          });
        }
        console.log("✅ Sent partner_scored notifications to partners (with dedup)");

        if (countsForHandicap) {
          const prevBest = userData?.personalDetails?.bestRound ?? 999;
          if (grossScore < prevBest && holeCount === 18) {
            await writeLowRoundActivity(
              userId,
              userName || userData?.displayName || "Unknown",
              userData?.avatar || null,
              grossScore,
              courseName,
              scoreId,
              regionKey || ""
            );
          }
        }

        if (isNewLowman) {
          for (const partnerId of partners) {
            await createNotificationDocument({
              userId: partnerId, type: "partner_lowman",
              actorId: userId, actorName: userName || userData?.displayName,
              actorAvatar: userData?.avatar || undefined,
              scoreId, courseId, courseName, regionKey,
              message: `${userName || userData?.displayName} became the low leader @${courseName}`,
            });
          }
          console.log("✅ Sent partner_lowman notifications");
        }

        if (hadHoleInOne && holeNumber) {
          for (const partnerId of partners) {
            await createNotificationDocument({
              userId: partnerId, type: "partner_holeinone",
              actorId: userId, actorName: userName || userData?.displayName,
              actorAvatar: userData?.avatar || undefined,
              scoreId, courseId, courseName, regionKey,
              message: `${userName || userData?.displayName} hit a hole-in-one on hole ${holeNumber} at ${courseName}!`,
            });
          }
          console.log("✅ Sent partner_holeinone notifications");
        }
      }

      // ── UPDATE USER CAREER STATS ──────────────────────────────
      if (countsForHandicap) {
        try {
          await updateUserCareerStats(userId, {
            grossScore,
            netScore,
            holeScores: score.holeScores,
            courseId,
            fairwaysHit: score.fairwaysHit,
            fairwaysPossible: score.fairwaysPossible,
            greensInRegulation: score.greensInRegulation,
            totalPenalties: score.totalPenalties,
          });
        } catch (statsErr) {
          console.error("⚠️ Career stats update failed:", statsErr);
        }
      } else {
        console.log("⏭️ Score does not count for handicap — skipping career stats");
      }

      // ── EVALUATE CHALLENGES ───────────────────────────────────
      try {
        const { evaluateChallenges } = await import("./challengeEvaluator.js");

        const courseTees = courseDocSnap.exists ? courseDocData?.tees : null;
        const allTees = [...(courseTees?.male || []), ...(courseTees?.female || [])];
        const holePars = allTees[0]?.holes?.map((h: any) => h.par || 4) || [];

        const fir = score.fir || [];
        const gir = score.gir || [];
        const hasFirData = fir.some((v: any) => v !== null);
        const hasGirData = gir.some((v: any) => v !== null);

        await evaluateChallenges({
          userId,
          grossScore,
          holeScores: score.holeScores || [],
          holePars: holePars.slice(0, score.holeScores?.length || 0),
          holesCount: score.holeScores?.length || 0,
          courseId,
          courseName,
          fairwaysHit: score.fairwaysHit,
          fairwaysPossible: score.fairwaysPossible,
          greensHit: score.greensInRegulation,
          greensPossible: score.holeScores?.length || 0,
          hasFirData,
          hasGirData,
          dtpMeasurements: score.dtpMeasurements,
          scoreId,
        });
      } catch (challengeErr) {
        console.error("⚠️ Challenge evaluation failed:", challengeErr);
      }

      // ── ST POWER RANKING — solo round ────────────────────────
      // Only rank eligible solo scores (not ghost, not simulator, has regionKey)
      if (!isSimulator && regionKey && countsForHandicap) {
        try {
          const par = score.par || (holeCount === 18 ? 72 : 36);
          const slopeRating = score.slopeRating ?? 113;
          const fieldStrength = soloFieldStrength(slopeRating);
          const gameFormatId = normaliseGameFormatId(score.formatId);

          const { calculateRoundPoints } = await import("../utils/rankingEngine.js");
          const roundPoints = calculateRoundPoints(
            netScore,
            par,
            slopeRating,
            fieldStrength,
            "solo",
            gameFormatId
          );

          const playerRoundRef = db
            .collection("playerRounds")
            .doc(`${userId}_${scoreId}`);

          await playerRoundRef.set({
            userId,
            roundId: scoreId,
            courseId,
            regionKey,
            netScore,
            par,
            slopeRating,
            courseRating: score.courseRating ?? null,
            handicapIndex: score.handicapIndex ?? null,
            fieldStrength,
            formatType: "solo",
            gameFormatId,
            roundPoints,
            challengePoints: 0,
            createdAt: Timestamp.now(),
          });

          const displayName = userName || userData?.displayName || "Unknown";
          const userAvatar = userData?.avatar || null;
          await calculatePlayerRanking(userId, displayName, userAvatar, regionKey);
        } catch (rankErr) {
          console.error("⚠️ Power ranking update failed (non-critical):", rankErr);
        }
      }

      console.log("✅ Score processing complete");
    } catch (err) {
      console.error("🔥 onScoreCreated failed:", err);
    }
  }
);