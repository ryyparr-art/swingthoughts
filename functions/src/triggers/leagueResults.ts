/**
 * League Results Triggers
 *
 * Creates a clubhouse thought post when a league week result is finalized.
 * The thought contains denormalized league result data so the feed card
 * can render without any additional Firestore fetches.
 *
 * Trigger: leagues/{leagueId}/week_results/{resultId}
 *
 * Skips results created by the leagueProcessor (source: "processor")
 * since the processor calls this helper directly after processing.
 *
 * Actually — we WANT processor-created results to generate posts.
 * The processor is the primary source of week results, so this trigger
 * should fire for ALL week_results documents.
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

const db = getFirestore();

export const onLeagueWeekResultCreated = onDocumentCreated(
  "leagues/{leagueId}/week_results/{resultId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const result = snap.data();
      const leagueId = event.params.leagueId;

      if (!result || !result.week) {
        console.log("⚠️ Week result missing required data");
        return;
      }

      console.log(`📝 Week ${result.week} result created for league ${leagueId}`);

      // Get league data
      const leagueDoc = await db.collection("leagues").doc(leagueId).get();
      if (!leagueDoc.exists) {
        console.error(`❌ League ${leagueId} not found`);
        return;
      }

      const league = leagueDoc.data()!;
      const leagueName = league.name || "Unknown League";
      const leagueAvatar = league.avatar || null;
      const hostUserId = league.hostUserId;
      const format = result.format || league.format || "stroke";

      // Get host user data for the thought post author
      const hostDoc = await db.collection("users").doc(hostUserId).get();
      const hostData = hostDoc.exists ? hostDoc.data() : null;

      // Build standings for the feed card (top 3 only)
      let topStandings: Array<{
        rank: number;
        name: string;
        userId?: string;
        points: number;
        netScore?: number;
      }> = [];

      if (format === "2v2") {
        // For 2v2, get team standings
        const teamsSnap = await db
          .collection("leagues")
          .doc(leagueId)
          .collection("teams")
          .orderBy("totalPoints", "desc")
          .limit(3)
          .get();

        let rank = 1;
        teamsSnap.forEach((doc) => {
          const data = doc.data();
          topStandings.push({
            rank: rank++,
            name: data.name || "Unknown Team",
            points: data.totalPoints || 0,
          });
        });
      } else {
        // For stroke, get member standings
        const membersSnap = await db
          .collection("leagues")
          .doc(leagueId)
          .collection("members")
          .where("status", "==", "active")
          .orderBy("totalPoints", "desc")
          .limit(3)
          .get();

        let rank = 1;
        membersSnap.forEach((doc) => {
          const data = doc.data();
          topStandings.push({
            rank: rank++,
            name: data.displayName || "Unknown",
            userId: doc.id,
            points: data.totalPoints || 0,
          });
        });
      }

      // Build winner info
      const winnerName = result.displayName || result.teamName || "Unknown";
      const winnerScore = result.score != null ? result.score : null;
      const isElevated = result.isElevated || false;

      // Build content text
      const elevatedPrefix = isElevated ? "🏅 " : "";
      const scoreText = winnerScore != null ? ` with a ${winnerScore} net` : "";
      const content = `${elevatedPrefix}${winnerName} wins Week ${result.week} of ${leagueName}${scoreText}! 🏌️`;

      // Create the clubhouse thought
      const thoughtData: any = {
        thoughtId: `league_week_${leagueId}_${result.week}_${Date.now()}`,
        userId: hostUserId,
        userName: leagueName,
        displayName: leagueName,
        userAvatar: leagueAvatar,
        avatar: leagueAvatar,
        userType: hostData?.userType || "Golfer",
        userVerified: hostData?.verified || false,
        userHandicap: hostData?.handicap || 0,

        postType: "league-week-result",
        content,

        // League result data for feed card rendering
        leagueResult: {
          leagueId,
          leagueName,
          leagueAvatar,
          week: result.week,
          totalWeeks: league.totalWeeks || 0,
          format,
          isElevated,
          prizeAwarded: result.prizeAwarded || 0,
          currency: league.purse?.currency || "USD",

          // Winner
          winnerId: result.userId || result.teamId || null,
          winnerName,
          winnerAvatar: result.avatar || null,
          winnerScore,
          winnerCourseName: result.courseName || null,

          // Top 3 overall standings (after this week)
          standings: topStandings,
        },

        // Standard thought fields
        regionKey: league.regionKey || null,
        geohash: league.geohash || null,
        location: league.location || null,
        taggedPartners: [],
        taggedCourses: [],
        taggedLeagues: [{ leagueId, name: leagueName }],

        createdAt: Timestamp.now(),
        createdAtTimestamp: Date.now(),
        likes: 0,
        likedBy: [],
        comments: 0,
        engagementScore: 0,
        viewCount: 0,
        lastActivityAt: Timestamp.now(),

        hasMedia: false,
        mediaType: null,
        imageUrls: [],
        imageCount: 0,

        contentLowercase: content.toLowerCase(),
        createdByLeagueFunction: true,
      };

      const thoughtRef = await db.collection("thoughts").add(thoughtData);
      console.log(`✅ League week result thought created: ${thoughtRef.id}`);
    } catch (err) {
      console.error("🔥 onLeagueWeekResultCreated failed:", err);
    }
  }
);