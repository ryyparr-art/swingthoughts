/**
 * Notification Helpers
 * 
 * Shared functions for creating notifications, generating messages,
 * and fetching user data. Used by all trigger files and leagueProcessor.
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  CreateNotificationParams,
  GROUPABLE_TYPES,
  GROUPING_WINDOW_MS,
  UserData,
} from "./config";

const db = getFirestore();

// ============================================================================
// GET USER DATA
// ============================================================================

export async function getUserData(userId: string): Promise<UserData | null> {
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return null;
    return userDoc.data() as UserData;
  } catch (error) {
    console.error("Error fetching user data:", error);
    return null;
  }
}

// ============================================================================
// GENERATE GROUP KEY
// ============================================================================

export function generateGroupKey(
  type: string,
  userId: string,
  postId?: string,
  commentId?: string,
  actorId?: string
): string {
  if (GROUPABLE_TYPES.POST_GROUPED.includes(type)) {
    if (type === "comment_like" && commentId) {
      return `${userId}:${type}:comment:${commentId}`;
    }
    return `${userId}:${type}:post:${postId}`;
  }
  
  if (GROUPABLE_TYPES.ACTOR_GROUPED.includes(type)) {
    return `${userId}:${type}:actor:${actorId}`;
  }
  
  return `${userId}:${type}:${Date.now()}:${Math.random()}`;
}

// ============================================================================
// GENERATE GROUPED MESSAGE
// ============================================================================

export function generateGroupedMessage(
  type: string,
  actorName: string,
  actorCount: number,
  extraData?: { 
    courseName?: string; 
    holeNumber?: number; 
    groupName?: string;
    leagueName?: string;
    teamName?: string;
    weekNumber?: number;
    netScore?: number;
    invitedUserName?: string;
    pollQuestion?: string;
    pollChoice?: string;
    message?: string;
    invitationalName?: string;
  }
): string {
  const othersCount = actorCount - 1;
  const othersText = othersCount === 1 ? "1 other" : `${othersCount} others`;
  
  switch (type) {
    // Post interactions - GROUPED
    case "like":
      if (actorCount === 1) return `${actorName} landed a dart on your Swing Thought`;
      return `${actorName} and ${othersText} landed darts on your Swing Thought`;
    
    case "comment":
      if (actorCount === 1) return `${actorName} weighed in on your Swing Thought`;
      return `${actorName} and ${othersText} weighed in on your Swing Thought`;
    
    case "comment_like":
      if (actorCount === 1) return `${actorName} landed a dart on your comment`;
      return `${actorName} and ${othersText} landed darts on your comment`;
    
    case "share":
      if (actorCount === 1) return `${actorName} shared your Swing Thought`;
      return `${actorName} and ${othersText} shared your Swing Thought`;
    
    // Messages
    case "message":
      if (actorCount === 1) return `${actorName} left a note in your locker`;
      return `${actorName} left you ${actorCount} notes in your locker`;
    
    case "group_message":
      return `${actorName} sent a message in ${extraData?.groupName || "a group chat"}`;
    
    // Partner interactions
    case "reply":
      return `${actorName} replied to your comment`;
    case "partner_request":
      return `${actorName} wants to Partner Up`;
    case "partner_accepted":
      return `${actorName} has agreed to be your Partner`;
    case "partner_posted":
      return `${actorName} has a new Swing Thought`;
    case "partner_scored":
      return extraData?.message || `${actorName} logged a round${extraData?.courseName ? ` at ${extraData.courseName}` : ""}`;
    case "partner_lowman":
      return `${actorName} became the low leader${extraData?.courseName ? ` @${extraData.courseName}` : ""}`;
    case "partner_holeinone":
      return `${actorName} hit a hole-in-one${extraData?.holeNumber ? ` on hole ${extraData.holeNumber}` : ""}${extraData?.courseName ? ` at ${extraData.courseName}` : ""}!`;
    
    // Mentions
    case "mention_post":
      return `${actorName} tagged you in a Swing Thought`;
    case "mention_comment":
      return `${actorName} tagged you in a comment`;

    case "poll_vote":
      if (actorCount === 1) return `${actorName} voted on your poll`;
      return `${actorName} and ${othersText} voted on your poll`;
    
    // Hole-in-one
    case "holeinone_pending_poster":
      return `Your hole-in-one is pending verification from ${actorName}`;
    case "holeinone_verification_request":
      return `${actorName} needs you to verify their hole-in-one`;
    case "holeinone_verified":
      return `✅ ${actorName} verified your hole-in-one!`;
    case "holeinone_denied":
      return `❌ ${actorName} did not verify your hole-in-one`;

    // League - Membership & Invites
    case "league_invite":
      return `You've been invited to join ${extraData?.leagueName || "a league"}`;
    case "league_invite_sent":
      return `${actorName} invited ${extraData?.invitedUserName || "someone"} to join ${extraData?.leagueName || "the league"}`;
    case "league_invite_accepted":
      return `${actorName} accepted your invite to join ${extraData?.leagueName || "the league"}`;
    case "league_invite_declined":
      return `${actorName} declined your invite to join ${extraData?.leagueName || "the league"}`;
    case "league_join_request":
      return `${actorName} would like to join ${extraData?.leagueName || "your league"}`;
    case "league_join_approved":
      return `Your request to join ${extraData?.leagueName || "the league"} was approved`;
    case "league_join_rejected":
      return `Your request to join ${extraData?.leagueName || "the league"} was declined`;
    case "league_removed":
      return `You were removed from ${extraData?.leagueName || "the league"}`;
    case "league_manager_invite":
      return `You've been invited to manage ${extraData?.leagueName || "a league"}`;

    // League - Scores & Gameplay
    case "league_score_reminder":
      return `Don't forget to post your Week ${extraData?.weekNumber || ""} score!`;
    case "league_score_posted":
      return `${actorName} posted ${extraData?.netScore || "a score"} in ${extraData?.leagueName || "the league"}`;
    case "league_score_dq":
      return `Your Week ${extraData?.weekNumber || ""} score was disqualified`;
    case "league_score_edited":
      return `Your Week ${extraData?.weekNumber || ""} score was edited by the commissioner`;
    case "league_score_reinstated":
      return `Your Week ${extraData?.weekNumber || ""} score has been reinstated`;

    // League - Weekly Cycle
    case "league_week_start":
      return `Week ${extraData?.weekNumber || ""} is now open! Get some birdies out there! 🏌️`;
    case "league_week_complete":
      return `${actorName} wins Week ${extraData?.weekNumber || ""}${extraData?.netScore ? ` with ${extraData.netScore} net` : ""}!`;

    // League - Season Events
    case "league_season_starting":
      return `${extraData?.leagueName || "Your league"} kicks off tomorrow! Get ready 🏌️`;
    case "league_season_started":
      return `Week 1 is live! Post your first score`;
    case "league_season_complete":
      return `Congratulations to ${actorName} - Season Champion! 🏆`;

    // League - Teams (2v2)
    case "league_team_assigned":
      return `You've been added to ${extraData?.teamName || "a team"} in ${extraData?.leagueName || "the league"}`;
    case "league_team_removed":
      return `You've been removed from ${extraData?.teamName || "your team"}`;
    case "league_matchup":
      return `${extraData?.teamName || "Your team"} matchup for Week ${extraData?.weekNumber || ""} is set!`;
    case "league_team_edit_approved":
      return `Your team name/avatar change was approved`;
    case "league_team_edit_rejected":
      return `Your team edit request was declined`;
    case "league_team_edit_request":
      return `${actorName} requested to change their team name`;

    // League - Announcements
    case "league_announcement":
      return `New announcement in ${extraData?.leagueName || "your league"}`;

    // Challenge notifications
    case "challenge_earned":
      return extraData?.message || `You earned a new badge! 🏆`;
    case "challenge_tier":
      return extraData?.message || `You reached a new milestone! ⭐`;
    case "challenge_progress":
      return extraData?.message || `Challenge progress update`;
    case "dtp_claimed":
      return extraData?.message || `You claimed a pin! 🎯`;
    case "dtp_lost":
      return extraData?.message || `Someone beat your pin! 🎯`;

    // Round notifications
    case "round_invite":
      return `${actorName} started a round at ${extraData?.courseName || "a course"}`;
    case "round_complete":
      return extraData?.message || `Your round at ${extraData?.courseName || "the course"} is complete`;
    case "round_notable":
      return extraData?.holeNumber
        ? `${actorName}'s group is on Hole ${extraData.holeNumber} at ${extraData?.courseName || "the course"}`
        : `${actorName}'s group is playing at ${extraData?.courseName || "the course"}`;

    // Outing & Rivalry notifications (message is pre-built by Cloud Functions)
    case "outing_complete":
      return extraData?.message || `Your outing at ${extraData?.courseName || "the course"} is complete`;
    case "rivalry_update":
      return extraData?.message || `Rivalry update`;

    // Invitational notifications
    case "invitational_welcome":
      return `Welcome to ${extraData?.invitationalName || "the invitational"}! ${actorName} invited you. Tap to view the event. 🏆`;
    case "invitational_player_joined":
      return `${actorName} joined ${extraData?.invitationalName || "your invitational"} 🎉`;
    
    default:
      return `${actorName} interacted with you`;
  }
}

// ============================================================================
// CREATE NOTIFICATION DOCUMENT (WITH SMART GROUPING)
// ============================================================================

export async function createNotificationDocument(params: CreateNotificationParams): Promise<void> {
  const {
    userId,
    type,
    actorId,
    actorName,
    actorAvatar,
    postId,
    commentId,
    courseId,
    courseName,
    scoreId,
    threadId,
    leagueId,
    leagueName,
    teamName,
    weekNumber,
    inviteId,
    roundId,
    rivalryId,
    invitationalId,
    changeType,
    message,
    regionKey,
  } = params;

  // Skip if user is acting on their own content
  if (actorId && userId === actorId) return;

  const now = Timestamp.now();
  const expiresAt = Timestamp.fromDate(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  );

  // Check if this notification type should be grouped
  const isGroupable = 
    GROUPABLE_TYPES.POST_GROUPED.includes(type) || 
    GROUPABLE_TYPES.ACTOR_GROUPED.includes(type);

  if (isGroupable && actorId) {
    // SMART GROUPING LOGIC
    const groupKey = generateGroupKey(type, userId, postId, commentId, actorId);
    const windowStart = new Date(Date.now() - GROUPING_WINDOW_MS);

    try {
      const existingQuery = await db
        .collection("notifications")
        .where("userId", "==", userId)
        .where("groupKey", "==", groupKey)
        .where("read", "==", false)
        .where("updatedAt", ">", Timestamp.fromDate(windowStart))
        .limit(1)
        .get();

      if (!existingQuery.empty) {
        // UPDATE EXISTING NOTIFICATION
        const existingDoc = existingQuery.docs[0];
        const existingData = existingDoc.data();

        const actors = existingData.actors || [];
        const actorExists = actors.some((a: any) => a.userId === actorId);

        let newActors = [...actors];
        let newActorCount = existingData.actorCount || 1;

        if (!actorExists) {
          newActors = [
            {
              userId: actorId,
              displayName: actorName || "Someone",
              avatar: actorAvatar || null,
              timestamp: now,
            },
            ...actors.slice(0, 9),
          ];
          newActorCount = newActorCount + 1;
        } else if (GROUPABLE_TYPES.ACTOR_GROUPED.includes(type)) {
          newActorCount = newActorCount + 1;
        }

        const updatedMessage = generateGroupedMessage(type, actorName || "Someone", newActorCount, { courseName });

        const updateData: any = {
          actors: newActors,
          actorCount: newActorCount,
          actorId: actorId,
          actorName: actorName || "Someone",
          actorAvatar: actorAvatar || null,
          lastActorId: actorId,
          message: updatedMessage,
          updatedAt: now,
          read: false,
        };

        if (threadId) updateData.threadId = threadId;

        await existingDoc.ref.update(updateData);
        console.log(`✅ Updated grouped notification ${existingDoc.id} (${newActorCount} actors)`);
        return;
      }
    } catch (error) {
      console.error("Error checking for existing notification:", error);
    }

    // CREATE NEW GROUPED NOTIFICATION
    const notificationData: any = {
      userId,
      type,
      actorId: actorId || null,
      actorName: actorName || "Someone",
      actorAvatar: actorAvatar || null,
      message,
      read: false,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      groupKey,
      lastActorId: actorId,
      actors: [
        {
          userId: actorId,
          displayName: actorName || "Someone",
          avatar: actorAvatar || null,
          timestamp: now,
        },
      ],
      actorCount: 1,
    };

    if (postId) notificationData.postId = postId;
    if (commentId) notificationData.commentId = commentId;
    if (courseId) notificationData.courseId = courseId;
    if (courseName) notificationData.courseName = courseName;
    if (scoreId) notificationData.scoreId = scoreId;
    if (threadId) notificationData.threadId = threadId;
    if (leagueId) notificationData.leagueId = leagueId;
    if (leagueName) notificationData.leagueName = leagueName;
    if (teamName) notificationData.teamName = teamName;
    if (weekNumber) notificationData.weekNumber = weekNumber;
    if (regionKey) notificationData.regionKey = regionKey;
    if (inviteId) notificationData.inviteId = inviteId;
    if (roundId) notificationData.roundId = roundId;
    if (rivalryId) notificationData.rivalryId = rivalryId;
    if (invitationalId) notificationData.invitationalId = invitationalId;
    if (changeType) notificationData.changeType = changeType;
    if (params.navigationTarget) notificationData.navigationTarget = params.navigationTarget;
    if (params.navigationUserId) notificationData.navigationUserId = params.navigationUserId;
    if (params.navigationTab) notificationData.navigationTab = params.navigationTab;

    await db.collection("notifications").add(notificationData);
    console.log("✅ Created new grouped notification");
    return;
  }

  // NON-GROUPED NOTIFICATION
  const notificationData: any = {
    userId,
    type,
    actorId: actorId || null,
    actorName: actorName || "System",
    actorAvatar: actorAvatar || null,
    message,
    read: false,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  };

  if (postId) notificationData.postId = postId;
  if (commentId) notificationData.commentId = commentId;
  if (courseId) notificationData.courseId = courseId;
  if (courseName) notificationData.courseName = courseName;
  if (scoreId) notificationData.scoreId = scoreId;
  if (threadId) notificationData.threadId = threadId;
  if (leagueId) notificationData.leagueId = leagueId;
  if (leagueName) notificationData.leagueName = leagueName;
  if (teamName) notificationData.teamName = teamName;
  if (weekNumber) notificationData.weekNumber = weekNumber;
  if (regionKey) notificationData.regionKey = regionKey;
  if (inviteId) notificationData.inviteId = inviteId;
  if (roundId) notificationData.roundId = roundId;
  if (rivalryId) notificationData.rivalryId = rivalryId;
  if (invitationalId) notificationData.invitationalId = invitationalId;
  if (changeType) notificationData.changeType = changeType;
  if (params.navigationTarget) notificationData.navigationTarget = params.navigationTarget;
  if (params.navigationUserId) notificationData.navigationUserId = params.navigationUserId;
  if (params.navigationTab) notificationData.navigationTab = params.navigationTab;

  await db.collection("notifications").add(notificationData);
  console.log("✅ Created notification");
}