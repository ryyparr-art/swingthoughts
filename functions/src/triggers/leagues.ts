/**
 * League Firestore Triggers
 * 
 * All league-related Firestore triggers for notifications.
 * 
 * IMPORTANT: Some notifications are also sent by leagueProcessor.ts (scheduled).
 * To avoid duplicates, triggers that overlap with the processor check for
 * `source: "processor"` on documents created by the processor and skip
 * sending notifications in those cases.
 * 
 * Processor handles (DO NOT duplicate):
 * - league_week_complete (via week_results with source: "processor")
 * - league_week_start (via league.currentWeek update with source: "processor")
 * - league_season_started (via league.status → active with source: "processor")
 * - league_season_complete (via league.status → completed with source: "processor")
 * - league_matchup (sent directly by processor)
 * - league_score_reminder (sent directly by processor)
 * - league_season_starting (sent directly by processor)
 */

import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { createNotificationDocument, generateGroupedMessage, getUserData } from "../notifications/helpers";
import { updateUserCareerStats } from "./userStats";

const db = getFirestore();

// ============================================================================
// HELPER: Get league data with avatar
// ============================================================================

interface LeagueInfo {
  name: string;
  avatar?: string;
}

async function getLeagueInfo(leagueId: string): Promise<LeagueInfo | null> {
  const leagueDoc = await db.collection("leagues").doc(leagueId).get();
  if (!leagueDoc.exists) return null;
  const data = leagueDoc.data();
  return {
    name: data?.name || "the league",
    avatar: data?.avatar || undefined,
  };
}

// ============================================================================
// JOIN REQUESTS (ROOT-LEVEL COLLECTION)
// ============================================================================

export const onJoinRequestCreated = onDocumentCreated(
  "league_join_requests/{requestId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const request = snap.data();
      if (!request) return;

      const { leagueId, leagueName, userId, displayName, avatar } = request;
      if (!leagueId || !userId) { console.log("⛔ Join request missing required fields"); return; }

      let actorName = displayName;
      let actorAvatar = avatar;
      if (!actorName) {
        const userData = await getUserData(userId);
        actorName = userData?.displayName || "Someone";
        actorAvatar = actorAvatar || userData?.avatar;
      }

      // Get league avatar as fallback
      const leagueInfo = await getLeagueInfo(leagueId);
      const finalAvatar = actorAvatar || leagueInfo?.avatar;

      const managersSnap = await db
        .collection("leagues").doc(leagueId)
        .collection("members").where("role", "in", ["commissioner", "manager"]).get();

      for (const managerDoc of managersSnap.docs) {
        if (managerDoc.id === userId) continue;
        await createNotificationDocument({
          userId: managerDoc.id, type: "league_join_request",
          actorId: userId, actorName: actorName || "Someone", actorAvatar: finalAvatar,
          leagueId, leagueName: leagueName || "the league",
          message: generateGroupedMessage("league_join_request", actorName || "Someone", 1, { leagueName: leagueName || "the league" }),
        });
      }
      console.log(`✅ Join request notifications sent to ${managersSnap.size} commissioners/managers`);
    } catch (error) { console.error("🔥 onJoinRequestCreated failed:", error); }
  }
);

export const onJoinRequestUpdated = onDocumentUpdated(
  "league_join_requests/{requestId}",
  async (event) => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after) return;

      const { leagueId, leagueName, userId } = after;
      if (!userId || !leagueId) return;

      if (before.status !== "rejected" && after.status === "rejected") {
        const leagueInfo = await getLeagueInfo(leagueId);
        await createNotificationDocument({
          userId, type: "league_join_rejected",
          actorAvatar: leagueInfo?.avatar,
          leagueId, leagueName: leagueName || "the league",
          message: generateGroupedMessage("league_join_rejected", "", 1, { leagueName: leagueName || "the league" }),
        });
      }
    } catch (error) { console.error("🔥 onJoinRequestUpdated failed:", error); }
  }
);

// ============================================================================
// LEAGUE SCORES
// ============================================================================

export const onLeagueScoreCreated = onDocumentCreated(
  "leagues/{leagueId}/scores/{scoreId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const score = snap.data();
      if (!score) return;

      const leagueId = event.params.leagueId;
      const { userId, displayName, avatar, netScore, grossScore, week } = score;
      if (!userId) return;

      const leagueInfo = await getLeagueInfo(leagueId);
      if (!leagueInfo) return;

      // Use scorer's avatar, fallback to league avatar
      const actorAvatar = avatar || leagueInfo.avatar;

      const membersSnap = await db.collection("leagues").doc(leagueId).collection("members").get();
      const memberIds = membersSnap.docs.map((doc) => doc.id).filter((id) => id !== userId);

      for (const memberId of memberIds) {
        await createNotificationDocument({
          userId: memberId, type: "league_score_posted",
          actorId: userId, actorName: displayName || "Someone", actorAvatar,
          leagueId, leagueName: leagueInfo.name, weekNumber: week,
          message: generateGroupedMessage("league_score_posted", displayName || "Someone", 1, { leagueName: leagueInfo.name, netScore }),
        });
      }
      console.log(`✅ League score notifications sent to ${memberIds.length} members`);

      // ============================================
      // UPDATE USER CAREER STATS
      // ============================================
      try {
        await updateUserCareerStats(userId, {
          grossScore: grossScore || 0,
          netScore: netScore || grossScore || 0,
          holeScores: score.holeScores,
          courseId: score.courseId,
          fairwaysHit: score.fairwaysHit,
          fairwaysPossible: score.fairwaysPossible,
          greensInRegulation: score.greensInRegulation,
          totalPenalties: score.totalPenalties,
        });
      } catch (statsErr) {
        console.error(`⚠️ Career stats update failed for ${userId}:`, statsErr);
      }

      // ============================================
      // EVALUATE CHALLENGES
      // ============================================
      try {
        const { evaluateChallenges } = await import("./challengeEvaluator.js");

        // Build holePars from course data
        const courseDoc = await db.collection("courses").doc(String(score.courseId)).get();
        const courseTees = courseDoc.exists ? courseDoc.data()?.tees : null;
        const allTees = [...(courseTees?.male || []), ...(courseTees?.female || [])];
        const holePars = allTees[0]?.holes?.map((h: any) => h.par || 4) || [];

        const fir = score.fir || [];
        const gir = score.gir || [];
        const hasFirData = fir.some((v: any) => v !== null);
        const hasGirData = gir.some((v: any) => v !== null);

        await evaluateChallenges({
          userId,
          grossScore: grossScore || 0,
          holeScores: score.holeScores || [],
          holePars: holePars.slice(0, score.holeScores?.length || 0),
          holesCount: score.holeScores?.length || 0,
          courseId: score.courseId,
          courseName: score.courseName,
          fairwaysHit: score.fairwaysHit,
          fairwaysPossible: score.fairwaysPossible,
          greensHit: score.greensInRegulation,
          greensPossible: score.holeScores?.length || 0,
          hasFirData,
          hasGirData,
          dtpMeasurements: score.dtpMeasurements,
          scoreId: event.params.scoreId,
        });
      } catch (challengeErr) {
        console.error(`⚠️ Challenge evaluation failed for ${userId}:`, challengeErr);
      }
    } catch (error) { console.error("🔥 onLeagueScoreCreated failed:", error); }
  }
);

export const onLeagueScoreUpdated = onDocumentUpdated(
  "leagues/{leagueId}/scores/{scoreId}",
  async (event) => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after) return;

      const leagueId = event.params.leagueId;
      const { userId, week } = after;

      const leagueInfo = await getLeagueInfo(leagueId);
      if (!leagueInfo) return;

      if (before.status !== "disqualified" && after.status === "disqualified") {
        await createNotificationDocument({
          userId, type: "league_score_dq",
          actorAvatar: leagueInfo.avatar,
          leagueId, leagueName: leagueInfo.name, weekNumber: week,
          message: generateGroupedMessage("league_score_dq", "", 1, { weekNumber: week }),
        });
      }

      if (before.status === "disqualified" && after.status === "approved") {
        await createNotificationDocument({
          userId, type: "league_score_reinstated",
          actorAvatar: leagueInfo.avatar,
          leagueId, leagueName: leagueInfo.name, weekNumber: week,
          message: generateGroupedMessage("league_score_reinstated", "", 1, { weekNumber: week }),
        });
      }

      const beforeEditCount = before.editHistory?.length || 0;
      const afterEditCount = after.editHistory?.length || 0;
      if (afterEditCount > beforeEditCount) {
        await createNotificationDocument({
          userId, type: "league_score_edited",
          actorAvatar: leagueInfo.avatar,
          leagueId, leagueName: leagueInfo.name, weekNumber: week,
          message: generateGroupedMessage("league_score_edited", "", 1, { weekNumber: week }),
        });
      }
    } catch (error) { console.error("🔥 onLeagueScoreUpdated failed:", error); }
  }
);

// ============================================================================
// LEAGUE MEMBERS
// ============================================================================

export const onLeagueMemberCreated = onDocumentCreated(
  "leagues/{leagueId}/members/{memberId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const member = snap.data();
      if (!member) return;

      const leagueId = event.params.leagueId;
      const memberId = event.params.memberId;
      const { role, displayName, avatar, status } = member;

      const leagueInfo = await getLeagueInfo(leagueId);
      if (!leagueInfo) return;

      // Use member's avatar, fallback to league avatar
      const actorAvatar = avatar || leagueInfo.avatar;

      if (status === "pending") {
        const managersSnap = await db.collection("leagues").doc(leagueId)
          .collection("members").where("role", "in", ["commissioner", "manager"]).get();
        for (const managerDoc of managersSnap.docs) {
          if (managerDoc.id === memberId) continue;
          await createNotificationDocument({
            userId: managerDoc.id, type: "league_join_request",
            actorId: memberId, actorName: displayName || "Someone", actorAvatar,
            leagueId, leagueName: leagueInfo.name,
            message: generateGroupedMessage("league_join_request", displayName || "Someone", 1, { leagueName: leagueInfo.name }),
          });
        }
      }

      if (status === "active" && role === "member") {
        await createNotificationDocument({
          userId: memberId, type: "league_join_approved",
          actorAvatar: leagueInfo.avatar,
          leagueId, leagueName: leagueInfo.name,
          message: generateGroupedMessage("league_join_approved", "", 1, { leagueName: leagueInfo.name }),
        });
      }
    } catch (error) { console.error("🔥 onLeagueMemberCreated failed:", error); }
  }
);

export const onLeagueMemberUpdated = onDocumentUpdated(
  "leagues/{leagueId}/members/{memberId}",
  async (event) => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after) return;

      const leagueId = event.params.leagueId;
      const memberId = event.params.memberId;

      const leagueInfo = await getLeagueInfo(leagueId);
      if (!leagueInfo) return;

      if (before.status === "pending" && after.status === "active") {
        await createNotificationDocument({
          userId: memberId, type: "league_join_approved",
          actorAvatar: leagueInfo.avatar,
          leagueId, leagueName: leagueInfo.name,
          message: generateGroupedMessage("league_join_approved", "", 1, { leagueName: leagueInfo.name }),
        });
      }

      if (before.status === "pending" && after.status === "rejected") {
        await createNotificationDocument({
          userId: memberId, type: "league_join_rejected",
          actorAvatar: leagueInfo.avatar,
          leagueId, leagueName: leagueInfo.name,
          message: generateGroupedMessage("league_join_rejected", "", 1, { leagueName: leagueInfo.name }),
        });
      }

      if (!before.teamId && after.teamId) {
        const teamDoc = await db.collection("leagues").doc(leagueId).collection("teams").doc(after.teamId).get();
        const teamName = teamDoc.exists ? teamDoc.data()?.name : "a team";
        await createNotificationDocument({
          userId: memberId, type: "league_team_assigned",
          actorAvatar: leagueInfo.avatar,
          leagueId, leagueName: leagueInfo.name, teamName,
          message: generateGroupedMessage("league_team_assigned", "", 1, { leagueName: leagueInfo.name, teamName }),
        });
      }

      if (before.teamId && !after.teamId) {
        const teamDoc = await db.collection("leagues").doc(leagueId).collection("teams").doc(before.teamId).get();
        const teamName = teamDoc.exists ? teamDoc.data()?.name : "the team";
        await createNotificationDocument({
          userId: memberId, type: "league_team_removed",
          actorAvatar: leagueInfo.avatar,
          leagueId, leagueName: leagueInfo.name, teamName,
          message: generateGroupedMessage("league_team_removed", "", 1, { teamName }),
        });
      }

      if (before.role !== "manager" && after.role === "manager") {
        await createNotificationDocument({
          userId: memberId, type: "league_manager_invite",
          actorAvatar: leagueInfo.avatar,
          leagueId, leagueName: leagueInfo.name,
          message: generateGroupedMessage("league_manager_invite", "", 1, { leagueName: leagueInfo.name }),
        });
      }
    } catch (error) { console.error("🔥 onLeagueMemberUpdated failed:", error); }
  }
);

export const onLeagueMemberDeleted = onDocumentDeleted(
  "leagues/{leagueId}/members/{memberId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const member = snap.data();
      if (!member) return;

      const leagueId = event.params.leagueId;
      const memberId = event.params.memberId;
      if (member.role === "commissioner") return;

      const leagueInfo = await getLeagueInfo(leagueId);
      if (!leagueInfo) return;

      await createNotificationDocument({
        userId: memberId, type: "league_removed",
        actorAvatar: leagueInfo.avatar,
        leagueId, leagueName: leagueInfo.name,
        message: generateGroupedMessage("league_removed", "", 1, { leagueName: leagueInfo.name }),
      });
    } catch (error) { console.error("🔥 onLeagueMemberDeleted failed:", error); }
  }
);

// ============================================================================
// WEEK RESULTS (with processor duplicate guard)
// ============================================================================

export const onWeekResultCreated = onDocumentCreated(
  "leagues/{leagueId}/week_results/{resultId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const result = snap.data();
      if (!result) return;

      // ⚠️ DUPLICATE GUARD: Skip if created by leagueProcessor
      if (result.source === "processor") {
        console.log("⏭️ Skipping onWeekResultCreated - already handled by leagueProcessor");
        return;
      }

      const leagueId = event.params.leagueId;
      const { userId, displayName, avatar, week, score, teamName } = result;

      const leagueInfo = await getLeagueInfo(leagueId);
      if (!leagueInfo) return;

      // Use winner's avatar, fallback to league avatar
      const actorAvatar = avatar || leagueInfo.avatar;

      const membersSnap = await db.collection("leagues").doc(leagueId).collection("members").get();

      for (const memberDoc of membersSnap.docs) {
        await createNotificationDocument({
          userId: memberDoc.id, type: "league_week_complete",
          actorId: userId, actorName: displayName || teamName || "Someone", actorAvatar,
          leagueId, leagueName: leagueInfo.name, weekNumber: week,
          message: generateGroupedMessage("league_week_complete", displayName || teamName || "Someone", 1, { weekNumber: week, netScore: score }),
        });
      }
      console.log(`✅ Week complete notifications sent to ${membersSnap.size} members`);
    } catch (error) { console.error("🔥 onWeekResultCreated failed:", error); }
  }
);

// ============================================================================
// LEAGUE UPDATED (with processor duplicate guard)
// ============================================================================

export const onLeagueUpdated = onDocumentUpdated(
  "leagues/{leagueId}",
  async (event) => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after) return;

      const leagueId = event.params.leagueId;
      const leagueName = after.name || "the league";
      const leagueAvatar = after.avatar || undefined;

      // ⚠️ DUPLICATE GUARD: Skip lifecycle events if triggered by processor
      const isProcessorUpdate = after._updatedByProcessor === true;

      const getMemberIds = async () => {
        const membersSnap = await db.collection("leagues").doc(leagueId).collection("members").get();
        return membersSnap.docs.map((doc) => doc.id);
      };

      // Season started (status → active)
      if (before.status !== "active" && after.status === "active") {
        if (isProcessorUpdate) {
          console.log("⏭️ Skipping season_started - handled by leagueProcessor");
          await db.collection("leagues").doc(leagueId).update({ _updatedByProcessor: FieldValue.delete() });
        } else {
          const memberIds = await getMemberIds();
          for (const memberId of memberIds) {
            await createNotificationDocument({
              userId: memberId, type: "league_season_started",
              actorAvatar: leagueAvatar,
              leagueId, leagueName,
              message: generateGroupedMessage("league_season_started", "", 1, { leagueName }),
            });
          }
          console.log(`✅ Season started notifications sent to ${memberIds.length} members`);
        }
      }

      // Season completed (status → completed)
      if (before.status !== "completed" && after.status === "completed") {
        if (isProcessorUpdate) {
          console.log("⏭️ Skipping season_complete - handled by leagueProcessor");
          await db.collection("leagues").doc(leagueId).update({ _updatedByProcessor: FieldValue.delete() });
        } else {
          const championName = after.championName || "the champion";
          const championId = after.championId;
          const memberIds = await getMemberIds();
          for (const memberId of memberIds) {
            await createNotificationDocument({
              userId: memberId, type: "league_season_complete",
              actorId: championId, actorName: championName, actorAvatar: leagueAvatar,
              leagueId, leagueName,
              message: generateGroupedMessage("league_season_complete", championName, 1, { leagueName }),
            });
          }
          console.log(`✅ Season complete notifications sent to ${memberIds.length} members`);
        }
      }

      // Week advanced (currentWeek changed)
      if (before.currentWeek !== after.currentWeek && after.currentWeek > (before.currentWeek || 0)) {
        if (isProcessorUpdate) {
          console.log("⏭️ Skipping week_start - handled by leagueProcessor");
          await db.collection("leagues").doc(leagueId).update({ _updatedByProcessor: FieldValue.delete() });
        } else {
          const memberIds = await getMemberIds();
          for (const memberId of memberIds) {
            await createNotificationDocument({
              userId: memberId, type: "league_week_start",
              actorAvatar: leagueAvatar,
              leagueId, leagueName,
              weekNumber: after.currentWeek,
              message: generateGroupedMessage("league_week_start", "", 1, { weekNumber: after.currentWeek }),
            });
          }
          console.log(`✅ Week start notifications sent to ${memberIds.length} members`);

          // 2v2 matchup notifications
          if (after.format === "2v2" && after.weeklyMatchups) {
            const currentMatchups = after.weeklyMatchups[after.currentWeek];
            if (currentMatchups && Array.isArray(currentMatchups)) {
              const teamsSnap = await db.collection("leagues").doc(leagueId).collection("teams").get();
              const teamsMap: Record<string, { name: string; memberIds: string[] }> = {};
              teamsSnap.docs.forEach((doc) => {
                const data = doc.data();
                teamsMap[doc.id] = { name: data.name, memberIds: data.memberIds || [] };
              });

              for (const matchup of currentMatchups) {
                const team1 = teamsMap[matchup.team1Id];
                const team2 = teamsMap[matchup.team2Id];
                if (team1 && team2) {
                  for (const memberId of team1.memberIds) {
                    await createNotificationDocument({
                      userId: memberId, type: "league_matchup",
                      actorAvatar: leagueAvatar,
                      leagueId, leagueName,
                      teamName: team1.name, weekNumber: after.currentWeek,
                      message: generateGroupedMessage("league_matchup", "", 1, { teamName: team1.name, weekNumber: after.currentWeek }),
                    });
                  }
                  for (const memberId of team2.memberIds) {
                    await createNotificationDocument({
                      userId: memberId, type: "league_matchup",
                      actorAvatar: leagueAvatar,
                      leagueId, leagueName,
                      teamName: team2.name, weekNumber: after.currentWeek,
                      message: generateGroupedMessage("league_matchup", "", 1, { teamName: team2.name, weekNumber: after.currentWeek }),
                    });
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) { console.error("🔥 onLeagueUpdated failed:", error); }
  }
);

// ============================================================================
// ANNOUNCEMENTS
// ============================================================================

export const onLeagueAnnouncementCreated = onDocumentCreated(
  "leagues/{leagueId}/announcements/{announcementId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const announcement = snap.data();
      if (!announcement) return;

      const leagueId = event.params.leagueId;
      const { authorId, authorAvatar, type: announcementType } = announcement;

      if (announcementType === "system") return;

      const leagueInfo = await getLeagueInfo(leagueId);
      if (!leagueInfo) return;

      // Use author's avatar, fallback to league avatar
      const actorAvatar = authorAvatar || leagueInfo.avatar;

      const membersSnap = await db.collection("leagues").doc(leagueId).collection("members").get();
      const memberIds = membersSnap.docs.map((doc) => doc.id).filter((id) => id !== authorId);

      for (const memberId of memberIds) {
        await createNotificationDocument({
          userId: memberId, type: "league_announcement",
          actorId: authorId, actorName: announcement.authorName || "The Commissioner", actorAvatar,
          leagueId, leagueName: leagueInfo.name,
          message: generateGroupedMessage("league_announcement", "", 1, { leagueName: leagueInfo.name }),
        });
      }
      console.log(`✅ Announcement notifications sent to ${memberIds.length} members`);
    } catch (error) { console.error("🔥 onLeagueAnnouncementCreated failed:", error); }
  }
);

// ============================================================================
// TEAM EDIT REQUESTS
// ============================================================================

export const onTeamEditRequestCreated = onDocumentCreated(
  "leagues/{leagueId}/team_edit_requests/{requestId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const request = snap.data();
      if (!request) return;

      const leagueId = event.params.leagueId;
      const { requesterId, requesterName, requesterAvatar, teamName } = request;

      const leagueInfo = await getLeagueInfo(leagueId);
      if (!leagueInfo) return;

      // Use requester's avatar, fallback to league avatar
      const actorAvatar = requesterAvatar || leagueInfo.avatar;

      const managersSnap = await db.collection("leagues").doc(leagueId)
        .collection("members").where("role", "in", ["commissioner", "manager"]).get();

      for (const managerDoc of managersSnap.docs) {
        if (managerDoc.id === requesterId) continue;
        await createNotificationDocument({
          userId: managerDoc.id, type: "league_team_edit_request",
          actorId: requesterId, actorName: requesterName || "Someone", actorAvatar,
          leagueId, leagueName: leagueInfo.name, teamName,
          message: generateGroupedMessage("league_team_edit_request", requesterName || "Someone", 1, { leagueName: leagueInfo.name, teamName }),
        });
      }
    } catch (error) { console.error("🔥 onTeamEditRequestCreated failed:", error); }
  }
);

export const onTeamEditRequestUpdated = onDocumentUpdated(
  "leagues/{leagueId}/team_edit_requests/{requestId}",
  async (event) => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after) return;

      const leagueId = event.params.leagueId;
      const { requesterId, teamId, teamName } = after;

      const leagueInfo = await getLeagueInfo(leagueId);
      if (!leagueInfo) return;

      if (before.status !== "approved" && after.status === "approved") {
        const teamDoc = await db.collection("leagues").doc(leagueId).collection("teams").doc(teamId).get();
        const teamMemberIds = teamDoc.exists ? teamDoc.data()?.memberIds || [] : [requesterId];
        for (const memberId of teamMemberIds) {
          await createNotificationDocument({
            userId: memberId, type: "league_team_edit_approved",
            actorAvatar: leagueInfo.avatar,
            leagueId, leagueName: leagueInfo.name, teamName,
            message: generateGroupedMessage("league_team_edit_approved", "", 1, { teamName }),
          });
        }
      }

      if (before.status !== "rejected" && after.status === "rejected") {
        await createNotificationDocument({
          userId: requesterId, type: "league_team_edit_rejected",
          actorAvatar: leagueInfo.avatar,
          leagueId, leagueName: leagueInfo.name, teamName,
          message: generateGroupedMessage("league_team_edit_rejected", "", 1, { teamName }),
        });
      }
    } catch (error) { console.error("🔥 onTeamEditRequestUpdated failed:", error); }
  }
);

// ============================================================================
// LEAGUE INVITES (SUBCOLLECTION)
// ============================================================================

export const onLeagueInviteCreated = onDocumentCreated(
  "leagues/{leagueId}/invites/{inviteId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const invite = snap.data();
      if (!invite) return;

      const leagueId = event.params.leagueId;
      const { inviteeId, inviterId, inviterName, inviterAvatar } = invite;
      if (!inviteeId) return;

      const leagueInfo = await getLeagueInfo(leagueId);
      if (!leagueInfo) return;

      // Use inviter's avatar, fallback to league avatar
      const actorAvatar = inviterAvatar || leagueInfo.avatar;

      await createNotificationDocument({
        userId: inviteeId, type: "league_invite",
        actorId: inviterId, actorName: inviterName || "Someone", actorAvatar,
        leagueId, leagueName: leagueInfo.name,
        message: generateGroupedMessage("league_invite", "", 1, { leagueName: leagueInfo.name }),
      });
    } catch (error) { console.error("🔥 onLeagueInviteCreated failed:", error); }
  }
);

export const onManagerInviteCreated = onDocumentCreated(
  "leagues/{leagueId}/manager_invites/{inviteId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const invite = snap.data();
      if (!invite) return;

      const leagueId = event.params.leagueId;
      const { inviteeId, inviterId, inviterName, inviterAvatar } = invite;
      if (!inviteeId) return;

      const leagueInfo = await getLeagueInfo(leagueId);
      if (!leagueInfo) return;

      // Use inviter's avatar, fallback to league avatar
      const actorAvatar = inviterAvatar || leagueInfo.avatar;

      await createNotificationDocument({
        userId: inviteeId, type: "league_manager_invite",
        actorId: inviterId, actorName: inviterName || "The Commissioner", actorAvatar,
        leagueId, leagueName: leagueInfo.name,
        message: generateGroupedMessage("league_manager_invite", "", 1, { leagueName: leagueInfo.name }),
      });
    } catch (error) { console.error("🔥 onManagerInviteCreated failed:", error); }
  }
);

// ============================================================================
// LEAGUE INVITES (ROOT-LEVEL COLLECTION)
// ============================================================================

export const onLeagueInviteCreatedRoot = onDocumentCreated(
  "league_invites/{inviteId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;
      const invite = snap.data();
      if (!invite) return;

      const inviteId = event.params.inviteId;
      const { leagueId, leagueName, invitedUserId, invitedUserName, invitedByUserId, invitedByUserName, invitedByUserAvatar } = invite;
      if (!leagueId || !invitedUserId || !invitedByUserId) return;

      // Get league avatar as fallback
      const leagueInfo = await getLeagueInfo(leagueId);
      const actorAvatar = invitedByUserAvatar || leagueInfo?.avatar;

      // Notify invitee
      await createNotificationDocument({
        userId: invitedUserId, type: "league_invite",
        actorId: invitedByUserId, actorName: invitedByUserName || "Someone",
        actorAvatar, leagueId, leagueName: leagueName || "a league", inviteId,
        message: `${invitedByUserName || "Someone"} invited you to join ${leagueName || "a league"}`,
      });

      // Notify commissioners/managers
      const managersSnap = await db.collection("leagues").doc(leagueId)
        .collection("members").where("role", "in", ["commissioner", "manager"]).get();

      for (const managerDoc of managersSnap.docs) {
        if (managerDoc.id === invitedByUserId) continue;
        await createNotificationDocument({
          userId: managerDoc.id, type: "league_invite_sent",
          actorId: invitedByUserId, actorName: invitedByUserName || "Someone",
          actorAvatar, leagueId, leagueName: leagueName || "the league", inviteId,
          message: `${invitedByUserName || "Someone"} invited ${invitedUserName || "a user"} to join ${leagueName || "the league"}`,
        });
      }
    } catch (error) { console.error("🔥 onLeagueInviteCreatedRoot failed:", error); }
  }
);

export const onLeagueInviteUpdatedRoot = onDocumentUpdated(
  "league_invites/{inviteId}",
  async (event) => {
    try {
      const before = event.data?.before.data();
      const after = event.data?.after.data();
      if (!before || !after) return;

      const { leagueId, leagueName, invitedUserId, invitedUserName, invitedUserAvatar, invitedByUserId } = after;
      if (!leagueId || !invitedUserId || !invitedByUserId) return;

      // Get league avatar as fallback
      const leagueInfo = await getLeagueInfo(leagueId);
      const actorAvatar = invitedUserAvatar || leagueInfo?.avatar;

      // Accepted
      if (before.status === "pending" && after.status === "accepted") {
        const inviteeData = await getUserData(invitedUserId);

        await db.collection("leagues").doc(leagueId).collection("members").doc(invitedUserId).set({
          displayName: invitedUserName || inviteeData?.displayName || "Unknown",
          avatar: invitedUserAvatar || inviteeData?.avatar || null,
          handicap: inviteeData?.handicap || 0,
          role: "member", status: "active",
          joinedAt: Timestamp.now(), updatedAt: Timestamp.now(),
        });

        await db.collection("leagues").doc(leagueId).update({
          memberCount: FieldValue.increment(1), updatedAt: Timestamp.now(),
        });

        await createNotificationDocument({
          userId: invitedByUserId, type: "league_invite_accepted",
          actorId: invitedUserId, actorName: invitedUserName || "Someone",
          actorAvatar, leagueId, leagueName: leagueName || "the league",
          message: `${invitedUserName || "Someone"} accepted your invite to join ${leagueName || "the league"}`,
        });
      }

      // Declined
      if (before.status === "pending" && after.status === "declined") {
        await createNotificationDocument({
          userId: invitedByUserId, type: "league_invite_declined",
          actorId: invitedUserId, actorName: invitedUserName || "Someone",
          actorAvatar, leagueId, leagueName: leagueName || "the league",
          message: `${invitedUserName || "Someone"} declined your invite to join ${leagueName || "the league"}`,
        });
      }
    } catch (error) { console.error("🔥 onLeagueInviteUpdatedRoot failed:", error); }
  }
);