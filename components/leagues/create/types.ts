/**
 * League Creation - Types & Constants
 */

export const TOTAL_STEPS = 7;

export const DAYS_OF_WEEK = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

export const SIM_PLATFORMS = [
  { key: "trackman", label: "TrackMan" },
  { key: "fullswing", label: "Full Swing" },
  { key: "foresight", label: "Foresight" },
  { key: "topgolf", label: "TopGolf" },
  { key: "golfzon", label: "Golfzon" },
  { key: "aboutgolf", label: "aboutGolf" },
  { key: "other", label: "Other" },
  { key: "notsure", label: "Not Sure" },
];

export const STEP_TITLES = [
  "Name Your League",
  "League Type",
  "Round Setup",
  "Handicap & Scoring",
  "Season Schedule",
  "Playoffs & Special Events",
  "Review Your League",
];

export interface LeagueFormData {
  // Step 1
  name: string;
  description: string;
  regionKey: string;
  regionName: string;
  // Step 2
  leagueType: "live" | "sim";
  simPlatform: string | null;
  format: "stroke" | "2v2";
  // Step 3
  holes: 9 | 18;
  courseRestriction: boolean;
  allowedCourses: { courseId: number; courseName: string }[];
  nineHoleOption: "front" | "back" | "either";
  // Step 4
  handicapSystem: "swingthoughts" | "league_managed";
  pointsPerWeek: number;
  // Purse - PGA style (in Step 4)
  purseEnabled: boolean;
  purseAmount: number;        // Season championship purse
  weeklyPurse: number;        // Per-week prize
  elevatedPurse: number;      // Bonus for elevated events
  purseCurrency: string;
  // Step 5
  startDate: Date | null;
  frequency: "weekly" | "biweekly";
  scoreDeadline: string; // Day of week (e.g., "sunday")
  numberOfWeeks: number;
  playDay: string | null;
  teeTime: string | null;
  // Step 6
  hasElevatedEvents: boolean;
  elevatedWeeks: number[];
  elevatedMultiplier: number;
}

export const DEFAULT_FORM_DATA: LeagueFormData = {
  name: "",
  description: "",
  regionKey: "",
  regionName: "",
  leagueType: "live",
  simPlatform: null,
  format: "stroke",
  holes: 18,
  courseRestriction: false,
  allowedCourses: [],
  nineHoleOption: "either",
  handicapSystem: "swingthoughts",
  pointsPerWeek: 100,
  purseEnabled: false,
  purseAmount: 0,
  weeklyPurse: 0,
  elevatedPurse: 0,
  purseCurrency: "USD",
  startDate: null,
  frequency: "weekly",
  scoreDeadline: "sunday",
  numberOfWeeks: 10,
  playDay: null,
  teeTime: null,
  hasElevatedEvents: false,
  elevatedWeeks: [],
  elevatedMultiplier: 2,
};

// Helper functions
export const formatTeeTime = (time: string): string => {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
};

export const parseTimeToDate = (time: string): Date => {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};

export const calculateEndDate = (
  startDate: Date | null,
  frequency: "weekly" | "biweekly",
  numberOfWeeks: number
): string => {
  if (!startDate) return "—";
  const weeks = frequency === "weekly" ? numberOfWeeks : numberOfWeeks * 2;
  const end = new Date(startDate);
  end.setDate(end.getDate() + weeks * 7);
  return end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export const formatCurrency = (amount: number, currency: string): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Calculate total purse from all sources
export const calculateTotalPurse = (formData: LeagueFormData): number => {
  let total = 0;
  
  if (formData.purseAmount > 0) {
    total += formData.purseAmount;
  }
  
  if (formData.weeklyPurse > 0 && formData.numberOfWeeks > 0) {
    total += formData.weeklyPurse * formData.numberOfWeeks;
  }
  
  if (formData.elevatedPurse > 0 && formData.elevatedWeeks.length > 0) {
    total += formData.elevatedPurse * formData.elevatedWeeks.length;
  }
  
  return total;
};