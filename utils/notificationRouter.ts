import { auth } from "@/constants/firebaseConfig";
import { Notification } from "@/constants/notificationTypes";
import { Router } from "expo-router";

/**
 * Routes the user to the appropriate screen based on notification type.
 * Returns true if navigation occurred, false otherwise.
 */
export function navigateForNotification(notification: Notification, router: Router): boolean {
  switch (notification.type) {
    // ==========================================
    // POST INTERACTIONS
    // ==========================================
    case "like":
    case "comment":
    case "comment_like":
    case "reply":
    case "share":
    case "mention_post":
    case "mention_comment":
    case "partner_posted":
    case "trending":
    case "poll_vote":
      if (notification.postId) {
        router.push({
          pathname: "/clubhouse",
          params: { highlightPostId: notification.postId },
        });
        return true;
      }
      return false;

    // ==========================================
    // SCORING & ROUNDS
    // ==========================================
    case "partner_scored":
      const scoredActorId = notification.navigationUserId || notification.actorId;
      if (scoredActorId) {
        router.push(`/profile/${scoredActorId}?tab=rounds`);
        return true;
      }
      return false;

    case "round_complete":
      const myUid = auth.currentUser?.uid;
      if (myUid) {
        router.push(`/profile/${myUid}?tab=rounds`);
        return true;
      }
      return false;

    // ==========================================
    // OUTING & RIVALRY
    // ==========================================
    case "outing_complete":
      if (notification.roundId) {
        // Open the player's group round scorecard
        const uid = auth.currentUser?.uid;
        if (uid) {
          router.push(`/profile/${uid}?tab=rounds`);
          return true;
        }
      }
      return false;

    case "rivalry_update":
      if (notification.rivalryId) {
        // rivalryId format: "playerAId_playerBId" (sorted alphabetically)
        // Navigate to the OTHER player's profile
        const ids = notification.rivalryId.split("_");
        const currentUserId = auth.currentUser?.uid;
        const rivalId = ids.find((id: string) => id !== currentUserId) || ids[0];
        router.push(`/profile/${rivalId}` as any);
        return true;
      }
      return false;

    // ==========================================
    // HOLE-IN-ONE
    // ==========================================
    case "partner_holeinone":
    case "holeinone_verified":
    case "holeinone_pending_poster":
      if (notification.postId) {
        router.push({
          pathname: "/clubhouse",
          params: { highlightPostId: notification.postId },
        });
      } else if (notification.scoreId) {
        router.push({
          pathname: "/clubhouse",
          params: { highlightScoreId: notification.scoreId },
        });
      } else {
        router.push("/clubhouse");
      }
      return true;

    case "holeinone_verification_request":
      if (notification.scoreId) {
        router.push(`/verify-holeinone/${notification.scoreId}`);
        return true;
      }
      return false;

    case "holeinone_denied":
      router.push(`/locker/${auth.currentUser?.uid}`);
      return true;

    // ==========================================
    // LEADERBOARD
    // ==========================================
    case "partner_lowman":
      if (notification.courseId && notification.actorId) {
        router.push({
          pathname: "/leaderboard",
          params: {
            filterType: "course",
            courseId: notification.courseId.toString(),
            highlightCourseId: notification.courseId.toString(),
            highlightUserId: notification.actorId,
          },
        });
        return true;
      }
      return false;

    // ==========================================
    // PARTNERS
    // ==========================================
    case "partner_request":
    case "partner_accepted":
      const actorId = notification.lastActorId || notification.actorId;
      if (actorId) {
        router.push(`/locker/${actorId}`);
        return true;
      }
      return false;

    // ==========================================
    // MESSAGES
    // ==========================================
    case "message":
    case "group_message":
      if (notification.threadId) {
        router.push(`/messages/${notification.threadId}`);
        return true;
      }
      // Fallback: construct deterministic ID for legacy 1:1 notifications
      const messageActorId = notification.lastActorId || notification.actorId;
      const currentUserId = auth.currentUser?.uid;
      if (messageActorId && currentUserId) {
        const threadId = [currentUserId, messageActorId].sort().join("_");
        router.push(`/messages/${threadId}`);
        return true;
      }
      return false;

    // ==========================================
    // MEMBERSHIP
    // ==========================================
    case "membership_submitted":
    case "membership_approved":
    case "membership_rejected":
      if (notification.courseId) {
        router.push(`/locker/course/${notification.courseId}`);
        return true;
      }
      return false;

    // ==========================================
    // COMMISSIONER APPLICATIONS
    // ==========================================
    case "commissioner_approved":
      router.push("/leagues/create" as any);
      return true;

    case "commissioner_rejected":
      router.push("/leagues/explore" as any);
      return true;

    // ==========================================
    // LEAGUE - INVITES & MEMBERSHIP
    // ==========================================
    case "league_invite":
      if (notification.leagueId) {
        router.push(`/leagues/${notification.leagueId}` as any);
        return true;
      }
      return false;

    case "league_invite_sent":
    case "league_invite_accepted":
      if (notification.leagueId) {
        router.push({
          pathname: "/leagues/home" as any,
          params: { leagueId: notification.leagueId },
        });
        return true;
      }
      return false;

    case "league_invite_declined":
      router.push("/leagues/explore" as any);
      return true;

    case "league_join_request":
      if (notification.leagueId) {
        router.push({
          pathname: "/leagues/settings" as any,
          params: { leagueId: notification.leagueId, tab: "members" },
        });
        return true;
      }
      return false;

    case "league_join_approved":
    case "league_team_assigned":
    case "league_team_removed":
    case "league_team_edit_approved":
    case "league_team_edit_rejected":
    case "league_announcement":
      if (notification.leagueId) {
        router.push({
          pathname: "/leagues/home" as any,
          params: { leagueId: notification.leagueId },
        });
        return true;
      }
      return false;

    case "league_join_rejected":
      router.push("/leagues/explore" as any);
      return true;

    case "league_removed":
      // No navigation, just mark as read
      return false;

    case "league_manager_invite":
      if (notification.leagueId) {
        router.push({
          pathname: "/leagues/settings" as any,
          params: { leagueId: notification.leagueId },
        });
        return true;
      }
      return false;

    // ==========================================
    // LEAGUE - SCORES & STANDINGS
    // ==========================================
    case "league_score_reminder":
      if (notification.leagueId) {
        router.push({
          pathname: "/leagues/post-score" as any,
          params: { leagueId: notification.leagueId },
        });
        return true;
      }
      return false;

    case "league_score_posted":
    case "league_score_dq":
    case "league_score_edited":
    case "league_score_reinstated":
    case "league_week_complete":
    case "league_season_complete":
      if (notification.leagueId) {
        router.push({
          pathname: "/leagues/standings" as any,
          params: { leagueId: notification.leagueId },
        });
        return true;
      }
      return false;

    case "league_week_start":
    case "league_matchup":
      if (notification.leagueId) {
        router.push({
          pathname: "/leagues/schedule" as any,
          params: { leagueId: notification.leagueId },
        });
        return true;
      }
      return false;

    case "league_season_starting":
    case "league_season_started":
      if (notification.leagueId) {
        router.push({
          pathname: "/leagues/home" as any,
          params: { leagueId: notification.leagueId },
        });
        return true;
      }
      return false;

    case "league_team_edit_request":
      if (notification.leagueId) {
        router.push({
          pathname: "/leagues/settings" as any,
          params: { leagueId: notification.leagueId, tab: "teams" },
        });
        return true;
      }
      return false;

    // ==========================================
    // CHALLENGES
    // ==========================================
    case "challenge_earned":
    case "challenge_tier":
    case "challenge_progress":
    case "dtp_claimed":
    case "dtp_lost":
      router.push("/events" as any);
      return true;

    default:
      console.log("⚠️ Unhandled notification type:", notification.type);
      return false;
  }
}