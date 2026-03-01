// Icon mapping for notification types
export type NotificationIconConfig = {
  icon?: string;
  image?: any;
  color: string;
};

export const NOTIFICATION_ICONS: Record<string, NotificationIconConfig> = {
  // Post interactions
  like: { image: require("@/assets/icons/Throw Darts.png"), color: "#FF3B30" },
  comment: { image: require("@/assets/icons/Comments.png"), color: "#FFD700" },
  comment_like: { image: require("@/assets/icons/Throw Darts.png"), color: "#FF3B30" },
  reply: { image: require("@/assets/icons/Comments.png"), color: "#FFD700" },
  share: { icon: "share-social", color: "#5856D6" },
  poll_vote: { icon: "stats-chart", color: "#7C3AED" },

  // Mentions
  mention_post: { image: require("@/assets/icons/Clubhouse.png"), color: "#5856D6" },
  mention_comment: { image: require("@/assets/icons/Comments.png"), color: "#FFD700" },

  // Messages
  message: { image: require("@/assets/icons/Mail.png"), color: "#0D5C3A" },
  group_message: { icon: "people", color: "#0D5C3A" },

  // Partner activities
  partner_request: { icon: "person-add", color: "#FFD700" },
  partner_accepted: { icon: "people", color: "#34C759" },
  partner_posted: { image: require("@/assets/icons/Clubhouse.png"), color: "#0D5C3A" },
  partner_scored: { icon: "flag", color: "#FF9500" },
  partner_lowman: { image: require("@/assets/icons/LowLeaderTrophy.png"), color: "#FFD700" },
  partner_holeinone: { image: require("@/assets/icons/LowLeaderAce.png"), color: "#FF3B30" },

  // Trending
  trending: { icon: "flame", color: "#FF9500" },

  // Hole-in-one verification
  holeinone_pending_poster: { icon: "time", color: "#FF9500" },
  holeinone_verification_request: { icon: "hourglass", color: "#FFD700" },
  holeinone_verified: { icon: "ribbon", color: "#34C759" },
  holeinone_denied: { icon: "close-circle", color: "#FF3B30" },

  // Membership
  membership_submitted: { icon: "document-text", color: "#007AFF" },
  membership_approved: { icon: "checkmark-circle", color: "#34C759" },
  membership_rejected: { icon: "close-circle", color: "#FF3B30" },

  // Commissioner Applications
  commissioner_approved: { icon: "trophy", color: "#4CAF50" },
  commissioner_rejected: { icon: "close-circle", color: "#F44336" },

  // League - Membership & Invites
  league_invite: { icon: "mail", color: "#0D5C3A" },
  league_join_request: { icon: "person-add", color: "#2196F3" },
  league_join_approved: { icon: "checkmark-circle", color: "#4CAF50" },
  league_join_rejected: { icon: "close-circle", color: "#F44336" },
  league_removed: { icon: "person-remove", color: "#F44336" },
  league_manager_invite: { icon: "shield", color: "#9C27B0" },
  league_invite_sent: { icon: "paper-plane", color: "#2196F3" },
  league_invite_accepted: { icon: "checkmark-circle", color: "#4CAF50" },
  league_invite_declined: { icon: "close-circle", color: "#F44336" },

  // League - Scores & Gameplay
  league_score_reminder: { icon: "alarm", color: "#FF9800" },
  league_score_posted: { icon: "golf", color: "#0D5C3A" },
  league_score_dq: { icon: "ban", color: "#F44336" },
  league_score_edited: { icon: "create", color: "#2196F3" },
  league_score_reinstated: { icon: "refresh-circle", color: "#4CAF50" },

  // League - Weekly Cycle
  league_week_start: { icon: "flag", color: "#0D5C3A" },
  league_week_complete: { icon: "trophy", color: "#FFD700" },

  // League - Season Events
  league_season_starting: { icon: "calendar", color: "#2196F3" },
  league_season_started: { icon: "play-circle", color: "#4CAF50" },
  league_season_complete: { icon: "ribbon", color: "#FFD700" },

  // League - Teams (2v2)
  league_team_assigned: { icon: "people", color: "#0D5C3A" },
  league_team_removed: { icon: "people", color: "#F44336" },
  league_matchup: { icon: "git-compare", color: "#9C27B0" },
  league_team_edit_approved: { icon: "checkmark-circle", color: "#4CAF50" },
  league_team_edit_rejected: { icon: "close-circle", color: "#F44336" },
  league_team_edit_request: { icon: "create", color: "#FF9800" },

  // League - Announcements
  league_announcement: { icon: "megaphone", color: "#0D5C3A" },

  // Invitational
  invitational_welcome: { icon: "trophy", color: "#B8860B" },
  invitational_player_joined: { icon: "person-add", color: "#0D5C3A" },

  // Challenge
  challenge_earned: { icon: "trophy", color: "#FFD700" },
  challenge_tier: { icon: "star", color: "#FFD700" },
  challenge_progress: { icon: "flag", color: "#0D5C3A" },
  dtp_claimed: { icon: "location", color: "#D32F2F" },
  dtp_lost: { icon: "location", color: "#D32F2F" },

  // Round
  round_invite: { icon: "golf", color: "#0D5C3A" },
  round_complete: { icon: "checkmark-circle", color: "#34C759" },
  outing_complete: { icon: "flag", color: "#0D5C3A" },
  rivalry_update: { icon: "git-compare", color: "#9C27B0" },

  // System
  system: { icon: "information-circle", color: "#8E8E93" },
};