/**
 * Score Triggers
 * 
 * Handles: onScoreCreated
 * Creates clubhouse posts, updates leaderboards, awards badges,
 * and sends partner notifications.
 */

import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { createNotificationDocument } from "../notifications/helpers";
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

      const {
        userId, courseId, courseName, netScore, grossScore, userName,
        holeCount, regionKey, location, scorecardImageUrl, roundDescription,
        hadHoleInOne, holeNumber, taggedPartners, tee, teeYardage, geohash,
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

      // DETERMINE POST TYPE
      let isNewLowman = false;
      let postType = "score";
      let achievementType: string | null = null;

      if (holeCount === 18 && regionKey) {
        const leaderboardId = `${regionKey}_${courseId}`;
        const leaderboardRef = db.collection("leaderboards").doc(leaderboardId);
        const leaderboardSnap = await leaderboardRef.get();

        const newScoreEntry = {
          userId,
          displayName: userName || userData?.displayName || "Unknown",
          userAvatar: userData?.avatar || null,
          grossScore, netScore, courseId, courseName,
          tees: tee || null, teeYardage: teeYardage || null,
          teePar: score.par || 72, par: score.par || 72,
          scoreId, createdAt: Timestamp.now(),
        };

        if (!leaderboardSnap.exists) {
          await leaderboardRef.set({
            regionKey, courseId, courseName, location: location || null,
            topScores18: [newScoreEntry], lowNetScore18: netScore,
            totalScores18: 1, topScores9: [], lowNetScore9: null,
            totalScores9: 0, totalScores: 1, holesInOne: [],
            createdAt: Timestamp.now(), lastUpdated: Timestamp.now(),
          });
          isNewLowman = true;
          console.log("✅ New leaderboard created, user is lowman");
        } else {
          const leaderboardData = leaderboardSnap.data();
          const topScores18 = leaderboardData?.topScores18 || [];
          const previousLowNetScore = leaderboardData?.lowNetScore18 || 999;

          topScores18.push(newScoreEntry);
          topScores18.sort((a: any, b: any) => {
            if (a.netScore !== b.netScore) return a.netScore - b.netScore;
            if (a.grossScore !== b.grossScore) return a.grossScore - b.grossScore;
            return a.createdAt.toMillis() - b.createdAt.toMillis();
          });

          const updatedTopScores18 = topScores18.slice(0, 10);
          const newLowNetScore = updatedTopScores18[0].netScore;

          if (updatedTopScores18[0].userId === userId && newLowNetScore < previousLowNetScore) {
            isNewLowman = true;
            console.log("🏆 NEW LOWMAN! User:", userId);
          }

          await leaderboardRef.update({
            topScores18: updatedTopScores18,
            lowNetScore18: newLowNetScore,
            totalScores18: FieldValue.increment(1),
            totalScores: FieldValue.increment(1),
            lastUpdated: Timestamp.now(),
          });
          console.log("✅ Leaderboard updated");
        }

        // AWARD BADGES
        if (isNewLowman) {
          console.log("🏆 Awarding badges...");
          postType = "low-leader";
          achievementType = "lowman";

          const lowmanBadge = {
            type: "lowman", courseId, courseName,
            achievedAt: Timestamp.now(), score: grossScore, displayName: "Lowman",
          };
          const currentBadges = userData?.Badges || [];
          await userRef.update({ Badges: [...currentBadges, lowmanBadge] });
          console.log("✅ Lowman badge awarded");

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
          } else if (lowmanCount >= 2) {
            await userRef.update({
              Badges: [...filteredBadges, { type: "scratch", courseId: 0, courseName: "Multiple Courses", achievedAt: Timestamp.now(), displayName: "Scratch" }],
            });
            console.log("🏆 Upgraded to Scratch badge!");
          }
        }
      }

      // CREATE CLUBHOUSE POST
      console.log("📝 Creating clubhouse post...");
      const teeDetails = teeYardage ? `from "${tee}", ${teeYardage} yards` : tee ? `from "${tee}"` : "";
      const postContent = `Shot a ${grossScore} @${courseName} ${teeDetails}! ${roundDescription || ""}`.trim();

      const thoughtData: any = {
        thoughtId: `thought_${Date.now()}`, userId,
        userName: userData?.displayName || "Unknown",
        displayName: userData?.displayName || "Unknown",
        userAvatar: userData?.avatar || null, avatar: userData?.avatar || null,
        userHandicap: userData?.handicap || 0,
        userType: userData?.userType || "Golfer",
        userVerified: userData?.verified || false,
        postType, achievementType, content: postContent, scoreId,
        imageUrl: scorecardImageUrl || null,
        regionKey: regionKey || null, geohash: geohash || null,
        location: location || null,
        taggedPartners: taggedPartners || [],
        taggedCourses: [{ courseId, courseName }],
        createdAt: Timestamp.now(), createdAtTimestamp: Date.now(),
        likes: 0, likedBy: [], comments: 0, engagementScore: 0, viewCount: 0,
        lastActivityAt: Timestamp.now(),
        hasMedia: !!scorecardImageUrl,
        mediaType: scorecardImageUrl ? "images" : null,
        imageUrls: scorecardImageUrl ? [scorecardImageUrl] : [],
        imageCount: scorecardImageUrl ? 1 : 0,
        contentLowercase: postContent.toLowerCase(),
        createdByScoreFunction: true,
      };

      let thoughtId: string | undefined;
      try {
        const thoughtRef = await db.collection("thoughts").add(thoughtData);
        thoughtId = thoughtRef.id;
        console.log("✅ Clubhouse post created:", thoughtId);
        try { await snap.ref.update({ thoughtId }); } catch (e) { console.error("❌ Error updating score with thoughtId:", e); }
      } catch (e) { console.error("❌ Error creating thought:", e); }

      // PARTNER NOTIFICATIONS
      const partners = userData?.partners || [];
      if (Array.isArray(partners) && partners.length > 0) {
        for (const partnerId of partners) {
          await createNotificationDocument({
            userId: partnerId, type: "partner_scored",
            actorId: userId, actorName: userName || userData?.displayName,
            actorAvatar: userData?.avatar || undefined,
            postId: thoughtId, scoreId, courseId, courseName, regionKey,
            message: `${userName || userData?.displayName} logged a round at ${courseName}`,
          });
        }
        console.log("✅ Sent partner_scored notifications to", partners.length, "partners");

        if (isNewLowman) {
          for (const partnerId of partners) {
            await createNotificationDocument({
              userId: partnerId, type: "partner_lowman",
              actorId: userId, actorName: userName || userData?.displayName,
              actorAvatar: userData?.avatar || undefined,
              postId: thoughtId, scoreId, courseId, courseName, regionKey,
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
              postId: thoughtId, scoreId, courseId, courseName, regionKey,
              message: `${userName || userData?.displayName} hit a hole-in-one on hole ${holeNumber} at ${courseName}!`,
            });
          }
          console.log("✅ Sent partner_holeinone notifications");
        }
      }

        // UPDATE USER CAREER STATS
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

      // ============================================
      // EVALUATE CHALLENGES
      // ============================================
      try {
        const { evaluateChallenges } = await import("./challengeEvaluator.js");

        // Build holePars from course data
        const courseDoc = await db.collection("courses").doc(String(courseId)).get();
        const courseTees = courseDoc.exists ? courseDoc.data()?.tees : null;
        const allTees = [...(courseTees?.male || []), ...(courseTees?.female || [])];
        const holePars = allTees[0]?.holes?.map((h: any) => h.par || 4) || [];

        // Determine if user tracked FIR/GIR
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