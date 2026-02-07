/**
 * Types for League Post Score
 */

export interface League {
  id: string;
  name: string;
  format: "stroke" | "2v2";
  holes?: number;
  holesPerRound?: number;
  handicapSystem: "swingthoughts" | "league_managed";
  currentWeek: number;
  courseRestriction?: boolean;
  allowedCourses?: Array<{ courseId: number; courseName: string }>;
  avatar?: string;
}

export interface CourseBasic {
  id?: number | string;
  courseId?: number;
  course_name?: string;
  courseName?: string;
  city?: string;
  state?: string;
  location?: {
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
  };
  distance?: number;
}

export interface HoleInfo {
  holeNumber?: number;
  par: number;
  yardage: number;
  handicap?: number; // Stroke index (1-18)
}

export interface TeeOption {
  tee_name: string;
  course_rating: number;
  slope_rating: number;
  par_total: number;
  total_yards: number;
  number_of_holes: number;
  holes: HoleInfo[];
  source: "male" | "female";
}

export interface FullCourseData {
  id: number | string;
  courseId?: number;
  course_name?: string;
  courseName?: string;
  location?: {
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
  };
  tees?: {
    male?: TeeOption[];
    female?: TeeOption[];
  };
}

export interface Member {
  displayName: string;
  avatar?: string;
  teamId?: string;
  leagueHandicap?: number;
  swingThoughtsHandicap?: number;
}

export interface Team {
  id: string;
  name: string;
}

export interface UserProfile {
  handicap?: string | number;
  handicapIndex?: number;
  displayName?: string;
  avatar?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  cachedCourses?: any[];
}

/** Per-hole stats: FIR (Fairway in Reg), GIR (Green in Reg), PNL (Penalties) */
export interface HoleStats {
  fir: (boolean | null)[]; // null = not entered, true/false = checked
  gir: (boolean | null)[];
  pnl: (number | null)[]; // null = not entered, number = penalty count
}

export interface ScoreData {
  userId: string;
  displayName: string;
  avatar?: string;
  teamId?: string;
  teamName?: string;
  week: number;
  courseId: number;
  courseName: string;
  tees: string;
  courseRating: number;
  slopeRating: number;
  handicapIndex: number;
  courseHandicap: number;
  holeScores: (number | null)[];
  adjScores: (number | null)[]; // Per-hole adjusted scores
  grossScore: number;
  netScore: number;
  totalPar: number;
  scoreToPar: number;
  // Stats
  fairwaysHit?: number;
  fairwaysPossible?: number;
  greensInRegulation?: number;
  totalPenalties?: number;
  holeStats?: {
    fir: (boolean | null)[];
    gir: (boolean | null)[];
    pnl: (number | null)[];
  };
}