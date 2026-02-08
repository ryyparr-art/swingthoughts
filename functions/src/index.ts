/**
 * SwingThoughts Cloud Functions
 * 
 * Main entry point - re-exports all functions from organized modules.
 * 
 * Structure:
 *   notifications/   - Config, helpers, push notification trigger
 *   triggers/        - All Firestore document triggers
 *   leagueProcessor  - Scheduled league processing
 *   tournamentSync   - Tournament data sync
 */

import { initializeApp } from "firebase-admin/app";
initializeApp();

// ============================================================================
// PUSH NOTIFICATIONS
// ============================================================================
export { cleanupOldNotifications } from "./notifications/cleanup";
export { sendPushNotification } from "./notifications/pushNotifications";

// ============================================================================
// SCORE TRIGGERS
// ============================================================================
export { onScoreCreated } from "./triggers/scores";

// ============================================================================
// THOUGHT (POST) TRIGGERS
// ============================================================================
export { onThoughtCreated } from "./triggers/thoughts";

// ============================================================================
// LIKE TRIGGERS
// ============================================================================
export { onCommentLikeCreated, onLikeCreated } from "./triggers/likes";

// ============================================================================
// COMMENT TRIGGERS
// ============================================================================
export { onCommentCreated } from "./triggers/comments";

// ============================================================================
// MESSAGE TRIGGERS
// ============================================================================
export { onMessageCreated } from "./triggers/messages";

// ============================================================================
// PARTNER TRIGGERS
// ============================================================================
export { onPartnerRequestCreated, onPartnerRequestUpdated } from "./triggers/partners";

// ============================================================================
// MEMBERSHIP TRIGGERS
// ============================================================================
export { onMembershipCreated, onMembershipUpdated } from "./triggers/memberships";

// ============================================================================
// HOLE-IN-ONE TRIGGERS
// ============================================================================
export { onHoleInOneCreated, onHoleInOneUpdated } from "./triggers/holeInOnes";

// ============================================================================
// SHARE TRIGGERS
// ============================================================================
export { onShareCreated } from "./triggers/shares";

// ============================================================================
// THREAD CLEANUP
// ============================================================================
export { onThreadUpdated } from "./triggers/threads";

// ============================================================================
// LEAGUE TRIGGERS
// ============================================================================
export {
  onJoinRequestCreated,
  onJoinRequestUpdated,
  onLeagueAnnouncementCreated,
  onLeagueInviteCreated,
  onLeagueInviteCreatedRoot,
  onLeagueInviteUpdatedRoot,
  onLeagueMemberCreated,
  onLeagueMemberDeleted,
  onLeagueMemberUpdated,
  onLeagueScoreCreated,
  onLeagueScoreUpdated,
  onLeagueUpdated,
  onManagerInviteCreated,
  onTeamEditRequestCreated,
  onTeamEditRequestUpdated,
  onWeekResultCreated
} from "./triggers/leagues";

// ============================================================================
// LEAGUE PROCESSOR (Scheduled)
// ============================================================================
export { processLeaguesDaily } from "./leagueProcessor";

// ============================================================================
// TOURNAMENT SYNC
// ============================================================================
export {
  cleanupTournamentChats,
  fixTournamentDates,
  getActiveTournament,
  syncLeaderboard,
  syncLeaderboardManual,
  syncTournamentSchedule
} from "./tournamentSync";

// ============================================================================
// USER TRIGGERS
// ============================================================================
export { onUserUpdated } from "./triggers/users";

export { onHandicapScoreCreated, onHandicapLeagueScoreCreated } from "./triggers/handicapCalculator";







