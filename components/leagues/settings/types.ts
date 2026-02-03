/**
 * Shared types for League Settings components
 */

import { Timestamp } from "firebase/firestore";

export interface League {
  id: string;
  name: string;
  nameLower?: string;
  description?: string;
  avatar?: string;
  customRules?: string;
  leagueType: "live" | "sim";
  simPlatform?: string;
  format: "stroke" | "2v2";
  holes: 9 | 18;
  handicapSystem: "swingthoughts" | "league_managed";
  isPublic: boolean;
  regionKey: string;
  regionName: string;
  startDate: Timestamp;
  endDate: Timestamp;
  frequency: "weekly" | "biweekly" | "monthly";
  scoreDeadlineDays: number;
  scoreDeadLine?: string | null;
  playDay?: string | null;
  teeTime?: string | null;
  nineHoleOption?: "either" | "front" | "back";
  totalWeeks: number;
  currentWeek: number;
  memberCount: number;
  status: "upcoming" | "active" | "completed";
  readyConfirmed?: boolean;
  hostUserId: string;
  managerIds?: string[];
  restrictedCourses?: Array<{ courseId: number; courseName: string }>;
  // Points per week
  pointsPerWeek?: number;
  // Elevated events (flat fields matching Firestore)
  hasElevatedEvents?: boolean;
  elevatedWeeks?: number[];
  elevatedMultiplier?: number;
  // PGA-style purse
  purse?: {
    seasonPurse: number;
    weeklyPurse: number;
    elevatedPurse: number;
    currency: string;
  } | null;
  hashtags?: string[];
  searchKeywords?: string[];
  previousSeasonId?: string;
  createdAt: Timestamp;
}

export interface Member {
  id: string;
  odcuserId: string;
  displayName: string;
  avatar?: string;
  role: "commissioner" | "manager" | "member";
  leagueHandicap?: number;
  swingThoughtsHandicap?: number;
  teamId?: string;
  totalPoints: number;
  roundsPlayed: number;
  wins: number;
  joinedAt: Timestamp;
}

export interface Team {
  id: string;
  name: string;
  nameLower: string;
  avatar?: string;
  nameChangeUsed: boolean;
  memberIds: string[];
  captainId?: string;
  wins: number;
  losses: number;
  totalPoints: number;
  createdAt: Timestamp;
}

export interface TeamEditRequest {
  id: string;
  teamId: string;
  teamName: string;
  requestedBy: string;
  requestedByName: string;
  requestedByAvatar?: string;
  type: "name" | "avatar";
  currentValue: string;
  newValue: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
}

export interface JoinRequest {
  id: string;
  leagueId: string;
  leagueName: string;
  userId: string;
  displayName: string;
  avatar?: string;
  handicap?: number;
  status: "pending" | "approved" | "rejected";
  createdAt: Timestamp;
}

export type TabType = "members" | "teams" | "rules" | "scores" | "settings";

// Helper functions
export const formatDate = (timestamp: Timestamp): string => {
  const date = timestamp.toDate();
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

export const formatDateShort = (timestamp: Timestamp): string => {
  const date = timestamp.toDate();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const getTimeAgo = (timestamp: Timestamp): string => {
  const now = Date.now();
  const time = timestamp.toMillis();
  const diff = now - time;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return timestamp.toDate().toLocaleDateString();
};

export const getRoleBadge = (role: Member["role"]) => {
  switch (role) {
    case "commissioner":
      return { label: "Commissioner", color: "#FFD700" };
    case "manager":
      return { label: "Manager", color: "#0D5C3A" };
    default:
      return null;
  }
};

// Calculate total purse from all sources
export const calculateTotalPurse = (league: League): number => {
  if (!league.purse) return 0;
  
  let total = 0;
  
  if (league.purse.seasonPurse > 0) {
    total += league.purse.seasonPurse;
  }
  
  if (league.purse.weeklyPurse > 0 && league.totalWeeks > 0) {
    total += league.purse.weeklyPurse * league.totalWeeks;
  }
  
  const elevatedWeeksCount = league.elevatedWeeks?.length ?? 0;
  if (league.purse.elevatedPurse > 0 && elevatedWeeksCount > 0) {
    total += league.purse.elevatedPurse * elevatedWeeksCount;
  }
  
  return total;
};

// Format currency
export const formatCurrency = (amount: number, currency: string = "USD"): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};