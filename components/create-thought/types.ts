/**
 * Create Thought - Types & Constants
 */

export const MAX_CHARACTERS = 280;
export const MAX_VIDEO_DURATION = 30;
export const MAX_IMAGE_WIDTH = 1080;
export const IMAGE_QUALITY = 0.7;
export const MAX_IMAGES = 3;

export interface Partner {
  userId: string;
  displayName: string;
}

export interface Course {
  courseId: number;
  courseName: string;
}

export interface TaggedTournament {
  tournamentId: string;
  name: string;
  type: "tournament";
}

export interface TaggedLeague {
  leagueId: string;
  name: string;
  type: "league";
}

export interface TaggedTournament {
  tournamentId: string;
  name: string;
  type: "tournament";
}

export interface TaggedLeague {
  leagueId: string;
  name: string;
  type: "league";
}

export interface GolfCourse {
  id: number;
  club_name: string;
  course_name: string;
  location: {
    city: string;
    state: string;
  };
}

export interface PendingImage {
  uri: string;
  width: number;
  height: number;
}

export interface AutocompleteItem {
  // Partner fields
  userId?: string;
  displayName?: string;
  // Course fields
  courseId?: number;
  courseName?: string;
  // Tournament/League fields
  id?: string;
  tournamentId?: string;
  leagueId?: string;
  name?: string;
  // Common fields
  type: "partner" | "course" | "tournament" | "league";
  location?: string;
  startDate?: any;
}

export interface PollOption {
  text: string;
  votes: number;
  voterIds: string[];
}

export interface PollData {
  question: string;
  options: string[];
}

/**
 * Check if user can write posts based on their verification status
 */
export function canWrite(userData: any): boolean {
  if (!userData) return false;

  if (userData.userType === "Golfer" || userData.userType === "Junior") {
    return userData.acceptedTerms === true;
  }

  if (userData.userType === "Course" || userData.userType === "PGA Professional") {
    return userData.verified === true || userData.verification?.status === "approved";
  }

  return false;
}

/**
 * Encode a geohash from latitude/longitude
 */
export function encodeGeohash(latitude: number, longitude: number, precision: number = 5): string {
  const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = "";

  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const lonMid = (lonMin + lonMax) / 2;
      if (longitude > lonMid) {
        idx |= 1 << (4 - bit);
        lonMin = lonMid;
      } else {
        lonMax = lonMid;
      }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (latitude > latMid) {
        idx |= 1 << (4 - bit);
        latMin = latMid;
      } else {
        latMax = latMid;
      }
    }
    evenBit = !evenBit;

    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32[idx];
      bit = 0;
      idx = 0;
    }
  }

  return geohash;
}

/**
 * Extract hashtags from content
 */
export function extractHashtags(content: string): string[] {
  const hashtagRegex = /#(\w+)/g;
  const matches = content.match(hashtagRegex) || [];
  return matches.map((tag) => tag.toLowerCase());
}