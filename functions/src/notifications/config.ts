/**
 * Notification Configuration
 * 
 * Grouping config, types, and interfaces shared across
 * all notification-related modules.
 */

// Time window for grouping (in milliseconds)
export const GROUPING_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Notification types that should be grouped
export const GROUPABLE_TYPES = {
  // Group by: postId (same post, multiple actors)
  POST_GROUPED: ["like", "comment", "comment_like", "share"],
  
  // Group by: actorId (same person, multiple actions)
  ACTOR_GROUPED: ["message"],
  
  // Never group (always create individual notifications)
  INDIVIDUAL: [
    "reply",
    "partner_request",
    "partner_accepted", 
    "mention_post",
    "mention_comment",
    "partner_posted",
    "partner_scored",
    "partner_lowman",
    "partner_holeinone",
    "holeinone_pending_poster",
    "holeinone_verification_request",
    "holeinone_verified",
    "holeinone_denied",
    "membership_submitted",
    "membership_approved",
    "membership_rejected",
    "commissioner_approved",
    "commissioner_rejected",
    "trending",
    "system",
    "group_message",
    // League notifications (always individual)
    "league_invite",
    "league_join_request",
    "league_join_approved",
    "league_join_rejected",
    "league_removed",
    "league_manager_invite",
    "league_score_reminder",
    "league_score_posted",
    "league_score_dq",
    "league_score_edited",
    "league_score_reinstated",
    "league_week_start",
    "league_week_complete",
    "league_season_starting",
    "league_season_started",
    "league_season_complete",
    "league_team_assigned",
    "league_team_removed",
    "league_matchup",
    "league_team_edit_approved",
    "league_team_edit_rejected",
    "league_team_edit_request",
    "league_announcement",
    "league_invite_sent",
    "league_invite_accepted", 
    "league_invite_declined",
  ],
};

// Interfaces
export interface UserData {
  displayName?: string;
  avatar?: string;
  partners?: string[];
  handicap?: number;
  userType?: string;
  verified?: boolean;
  Badges?: any[];
}

export interface CreateNotificationParams {
  userId: string;
  type: string;
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;
  postId?: string;
  commentId?: string;
  courseId?: number;
  courseName?: string;
  scoreId?: string;
  threadId?: string;
  leagueId?: string;
  leagueName?: string;
  teamName?: string;
  weekNumber?: number;
  inviteId?: string;
  message: string;
  regionKey?: string;
}