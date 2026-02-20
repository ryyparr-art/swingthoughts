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
      // Set by rounds.ts for multiplayer scores.
      // Legacy solo scores won't have these → default to eligible.
      const isSimulator = score.isSimulator === true;
      const isLeaderboardEligible = score.isLeaderboardEligible !== false;
      const countsForHandicap = score.countsForHandicap !== false;

      // ── LEADERBOARD UPDATE ────────────────────────────────────
      let isNewLowman = false;

      if ((holeCount === 18 || holeCount === 9) && regionKey && isLeaderboardEligible && !isSimulator) {
        const leaderboardId = `${regionKey}_${courseId}`;
        const leaderboardRef = db.collection("leaderboards").doc(leaderboardId);
        const leaderboardSnap = await leaderboardRef.get();

        const is18 = holeCount === 18;
        const scoresKey = is18 ? "topScores18" : "topScores9";
        const lowNetKey = is18 ? "lowNetScore18" : "lowNetScore9";
        const totalKey = is18 ? "totalScores18" : "totalScores9";

        const newScoreEntry = {
          userId,
          displayName: userName || userData?.displayName || "Unknown",
          userAvatar: userData?.avatar || null,
          grossScore, netScore, courseId, courseName,
          tees: tee || null, teeYardage: teeYardage || null,
          teePar: score.par || (is18 ? 72 : 36), par: score.par || (is18 ? 72 : 36),
          scoreId, createdAt: Timestamp.now(),
        };

        if (!leaderboardSnap.exists) {
          const newDoc: Record<string, any> = {
            regionKey, courseId, courseName, location: location || null,
            topScores18: [], lowNetScore18: null, totalScores18: 0,
            topScores9: [], lowNetScore9: null, totalScores9: 0,
            totalScores: 1, holesInOne: [],
            createdAt: Timestamp.now(), lastUpdated: Timestamp.now(),
          };
          // Set the relevant hole count fields
          newDoc[scoresKey] = [newScoreEntry];
          newDoc[lowNetKey] = netScore;
          newDoc[totalKey] = 1;

          await leaderboardRef.set(newDoc);

          if (is18) {
            isNewLowman = true;
            console.log("✅ New leaderboard created, user is lowman (18-hole)");
          } else {
            console.log("✅ New leaderboard created with 9-hole score");
          }
        } else {
          const leaderboardData = leaderboardSnap.data();
          const topScores = leaderboardData?.[scoresKey] || [];
          const previousLowNet = leaderboardData?.[lowNetKey] || 999;

          topScores.push(newScoreEntry);
          topScores.sort((a: any, b: any) => {
            if (a.netScore !== b.netScore) return a.netScore - b.netScore;
            if (a.grossScore !== b.grossScore) return a.grossScore - b.grossScore;
            return a.createdAt.toMillis() - b.createdAt.toMillis();
          });

          const updatedTopScores = topScores.slice(0, 10);
          const newLowNet = updatedTopScores[0].netScore;

          // Lowman only for 18-hole
          if (is18 && updatedTopScores[0].userId === userId && newLowNet < previousLowNet) {
            isNewLowman = true;
            console.log("🏆 NEW LOWMAN! User:", userId);
          }

          await leaderboardRef.update({
            [scoresKey]: updatedTopScores,
            [lowNetKey]: newLowNet,
            [totalKey]: FieldValue.increment(1),
            totalScores: FieldValue.increment(1),
            lastUpdated: Timestamp.now(),
          });
          console.log(`✅ Leaderboard updated (${holeCount}-hole)`);
        }

        // AWARD BADGES (18-hole only)
        if (isNewLowman && is18) {
          console.log("🏆 Awarding badges...");

          const lowmanBadge = {
            type: "lowman", courseId, courseName,
            achievedAt: Timestamp.now(), score: grossScore, displayName: "Lowman",
          };
          const currentBadges = userData?.Badges || [];
          await userRef.update({ Badges: [...currentBadges, lowmanBadge] });
          console.log("✅ Lowman badge awarded");

          // Feed activity: low leader change
          await writeLowLeaderChangeActivity(
            userId,
            userData?.displayName || "Unknown",
            userData?.avatar || null,
            courseName,
            netScore,
            regionKey || ""
          );

          // Tier upgrades
          const leaderboardsSnap = await db
            .collection("leaderboards")
            .where("regionKey", "==", regionKey)
            .get();

          let lowmanCount = 0;
          leaderboardsSnap.forEach((doc) => {
            const data = doc.data();
            const topScores = data.topScores18 || [];
            if (topScores.length > 0 && topScores[0].userId === userId) lowmanCount++;
          });

          const existingBadges = userData?.Badges || [];
          const filteredBadges = existingBadges.filter((b: any) => b.type !== "scratch" && b.type !== "ace");

          if (lowmanCount >= 3) {
            await userRef.update({
              Badges: [...filteredBadges, { type: "ace", courseId: 0, courseName: "Multiple Courses", achievedAt: Timestamp.now(), displayName: "Ace" }],
            });
            console.log("🏆 Upgraded to Ace badge!");

            const aceCourseNames: string[] = [];
            leaderboardsSnap.forEach((lbDoc) => {
              const lbData = lbDoc.data();
              const top = lbData.topScores18 || [];
              if (top.length > 0 && top[0].userId === userId) {
                aceCourseNames.push(lbData.courseName || "Unknown");
              }
            });
            await writeAceTierEarnedActivity(
              userId,
              userData?.displayName || "Unknown",
              userData?.avatar || null,
              aceCourseNames.slice(0, 3),
              regionKey || ""
            );
          } else if (lowmanCount >= 2) {
            await userRef.update({
              Badges: [...filteredBadges, { type: "scratch", courseId: 0, courseName: "Multiple Courses", achievedAt: Timestamp.now(), displayName: "Scratch" }],
            });
            console.log("🏆 Upgraded to Scratch badge!");

            const scratchCourseNames: string[] = [];
            leaderboardsSnap.forEach((lbDoc) => {
              const lbData = lbDoc.data();
              const top = lbData.topScores18 || [];
              if (top.length > 0 && top[0].userId === userId) {
                scratchCourseNames.push(lbData.courseName || "Unknown");
              }
            });
            await writeScratchEarnedActivity(
              userId,
              userData?.displayName || "Unknown",
              userData?.avatar || null,
              scratchCourseNames.slice(0, 2),
              regionKey || ""
            );
          }
        }
      } else if ((holeCount === 18 || holeCount === 9) && regionKey && (!isLeaderboardEligible || isSimulator)) {
        console.log("⏭️ Score not leaderboard eligible (format or simulator) — skipping leaderboard");
      }

     // ── PARTNER NOTIFICATIONS ─────────────────────────────────
      // Always send regardless of format/simulator
      const partners = userData?.partners || [];
      if (Array.isArray(partners) && partners.length > 0) {
        // Get round data if this score came from a multiplayer round
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

        // Build dynamic "with X" string
        const actorName = userName || userData?.displayName || "Unknown";
        let withString = "";
        if (roundPlayers.length > 1) {
          const others = roundPlayers.filter((p: any) => p.playerId !== userId);
          // Prefer on-platform users, fall back to ghosts
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
          // DEDUP: Skip if this partner was IN the round
          // (they already got a round_complete notification from rounds.ts)
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
            // Navigation data
            navigationTarget: "profile",
            navigationUserId: userId,
            navigationTab: "rounds",
          });
        }
        console.log("✅ Sent partner_scored notifications to partners (with dedup)");

        // Feed activity: career best round (only for eligible scores)
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
      // Challenges run for all scores (some may apply to any format)
      try {
        const { evaluateChallenges } = await import("./challengeEvaluator.js");

        const courseDoc = await db.collection("courses").doc(String(courseId)).get();
        const courseTees = courseDoc.exists ? courseDoc.data()?.tees : null;
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

      console.log("✅ Score processing complete");
    } catch (err) {
      console.error("🔥 onScoreCreated failed:", err);
    }
  }
);