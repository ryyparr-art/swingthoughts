export interface NotificationActor {
  userId: string;
  displayName: string;
  avatar?: string;
  timestamp?: any;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  read: boolean;
  archived?: boolean;
  archivedAt?: any;
  createdAt: any;
  updatedAt?: any;
  message: string;

  // Grouped notifications
  actors?: NotificationActor[];
  actorCount?: number;

  // Single actor (backward compatibility)
  actorId?: string;
  actorName?: string;
  actorAvatar?: string;

  // Related content
  postId?: string;
  commentId?: string;
  courseId?: number;
  scoreId?: string;
  threadId?: string;
  leagueId?: string;
  inviteId?: string;

  // Navigation
  navigationTarget?: string;
  navigationUserId?: string;
  navigationTab?: string;

  // Grouping
  groupKey?: string;
  lastActorId?: string;
}

export interface GroupedNotifications {
  title: string;
  data: Notification[];
}