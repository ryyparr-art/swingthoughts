/**
 * Shared types for Locker Edit components
 */

/* ================================================================ */
/* CLUBS - NEW STRUCTURED FORMAT                                    */
/* ================================================================ */

export interface WoodEntry {
  label: string; // "3W", "5W", "7W", "9W"
  name: string;  // e.g., "Titleist TSR2"
}

export interface IronSet {
  range: string; // "4-AW", "4-PW", "5-AW", "5-PW", "mixed"
  name: string;  // e.g., "Titleist T200"
}

export interface IndividualIron {
  number: string; // "1i", "2i", "3i", etc.
  name: string;   // e.g., "Titleist U505"
}

export interface WedgeEntry {
  loft: string; // "46", "48", "50", "52", "54", "56", "58", "60", "62", "64"
  name: string; // e.g., "Vokey SM9"
}

export interface ClubsData {
  // Woods
  driver: string;
  woods: Record<string, string>; // { "3W": "name", "5W": "name" }

  // Irons
  ironSet: IronSet | null;
  individualIrons: IndividualIron[];
  irons: string; // Legacy field for backwards compat

  // Wedges (new array format)
  wedgesList: WedgeEntry[];
  wedges: string; // Legacy field for backwards compat

  // Others
  putter: string;
  ball: string;
}

/* ================================================================ */
/* LEGACY CLUBS FORMAT                                              */
/* ================================================================ */

export interface LegacyClubs {
  driver?: string;
  irons?: string;
  wedges?: string;
  putter?: string;
  ball?: string;
}

/* ================================================================ */
/* COURSE & BADGE TYPES                                             */
/* ================================================================ */

export interface Badge {
  type: string;
  displayName: string;
  courseName?: string;
  achievedAt?: any;
  score?: number;
  courseId?: number;
}

export type UserLocation = {
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
};

export type Course = {
  id?: number;
  courseId?: number;
  course_name?: string;
  courseName?: string;
  location?: {
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
  };
  distance?: number;
};

/* ================================================================ */
/* CONSTANTS                                                        */
/* ================================================================ */

export const WOOD_OPTIONS = ["3W", "5W", "7W", "9W"] as const;

export const IRON_SET_OPTIONS = [
  { label: "4-AW", value: "4-AW" },
  { label: "4-PW", value: "4-PW" },
  { label: "5-AW", value: "5-AW" },
  { label: "5-PW", value: "5-PW" },
  { label: "Mixed Bag", value: "mixed" },
] as const;

export const MIXED_IRON_OPTIONS = [
  "1i", "2i", "3i", "4i", "5i", "6i", "7i", "8i", "9i", "PW", "AW",
] as const;

export const WEDGE_LOFT_OPTIONS = [
  "46", "48", "50", "52", "54", "56", "58", "60", "62", "64",
] as const;

export const MAX_WEDGES = 4;

/* ================================================================ */
/* HELPERS                                                          */
/* ================================================================ */

/**
 * Convert Firestore clubs data to our structured ClubsData format.
 * Handles both legacy (simple strings) and new (structured) formats.
 */
export function parseClubsFromFirestore(data: any): ClubsData {
  const clubs = data?.clubs || {};

  return {
    // Driver - same in both formats
    driver: clubs.driver || "",

    // Woods - new field, empty for legacy users
    woods: clubs.woods || {},

    // Irons - detect new vs legacy
    ironSet: clubs.ironSet || null,
    individualIrons: Array.isArray(clubs.individualIrons) ? clubs.individualIrons : [],
    irons: clubs.irons || "", // Keep legacy string

    // Wedges - detect new vs legacy
    wedgesList: Array.isArray(clubs.wedgesList) ? clubs.wedgesList : [],
    wedges: typeof clubs.wedges === "string" ? clubs.wedges : "", // Keep legacy string

    // Simple fields
    putter: clubs.putter || "",
    ball: clubs.ball || "",
  };
}

/**
 * Convert our ClubsData back to Firestore format.
 * Preserves legacy fields for backwards compatibility.
 */
export function clubsToFirestore(clubs: ClubsData): Record<string, any> {
  // Build legacy irons string for backwards compat
  let legacyIrons = clubs.irons;
  if (clubs.ironSet?.name) {
    legacyIrons = clubs.ironSet.range === "mixed"
      ? clubs.ironSet.name
      : `${clubs.ironSet.name} (${clubs.ironSet.range})`;
  }

  // Build legacy wedges string for backwards compat
  let legacyWedges = clubs.wedges;
  if (clubs.wedgesList.length > 0) {
    legacyWedges = clubs.wedgesList
      .filter(w => w.name || w.loft)
      .map(w => `${w.loft}° ${w.name}`.trim())
      .join(" • ");
  }

  // Clean woods - only include non-empty entries
  const cleanWoods: Record<string, string> = {};
  Object.entries(clubs.woods).forEach(([key, val]) => {
    if (val.trim()) cleanWoods[key] = val.trim();
  });

  // Clean individual irons
  const cleanIndividualIrons = clubs.individualIrons.filter(
    (iron) => iron.name.trim() !== ""
  );

  // Clean wedges
  const cleanWedgesList = clubs.wedgesList.filter(
    (w) => w.name.trim() !== "" || w.loft.trim() !== ""
  );

  return {
    driver: clubs.driver.trim(),
    woods: cleanWoods,
    ironSet: clubs.ironSet,
    individualIrons: cleanIndividualIrons,
    irons: legacyIrons, // backwards compat
    wedgesList: cleanWedgesList,
    wedges: legacyWedges, // backwards compat
    putter: clubs.putter.trim(),
    ball: clubs.ball.trim(),
  };
}