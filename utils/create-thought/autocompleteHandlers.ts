/**
 * Autocomplete Handlers for Create Thought
 * 
 * Handles @mention search (partners + courses), #hashtag search
 * (tournaments + leagues), external course API search, and
 * content change logic with tag cleanup.
 */

import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { db } from "@/constants/firebaseConfig";
import { collection, getDocs } from "firebase/firestore";

import {
    AutocompleteItem,
    Partner,
} from "@/components/create-thought/types";

/* ================================================================ */
/* MENTION SEARCH (@)                                               */
/* ================================================================ */

export const searchMentions = async (
  searchText: string,
  allPartners: Partner[]
): Promise<AutocompleteItem[]> => {
  try {
    const searchLower = searchText.toLowerCase();

    // Search partners
    const partnerResults = allPartners.filter((p) =>
      p.displayName.toLowerCase().includes(searchLower)
    );

    // Search cached courses in Firestore
    const coursesSnap = await getDocs(collection(db, "courses"));
    const courseResults: AutocompleteItem[] = [];

    coursesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const courseName = data.course_name || data.courseName || "";
      const clubName = data.club_name || data.clubName || "";

      if (
        courseName.toLowerCase().includes(searchLower) ||
        clubName.toLowerCase().includes(searchLower)
      ) {
        let displayName = "";
        if (clubName && courseName && clubName !== courseName) {
          displayName = `${clubName} - ${courseName}`;
        } else if (clubName) {
          displayName = clubName;
        } else {
          displayName = courseName;
        }

        courseResults.push({
          courseId: data.id,
          courseName: displayName,
          location: data.location ? `${data.location.city}, ${data.location.state}` : "",
          type: "course",
        });
      }
    });

    // Combine results
    if (partnerResults.length > 0 || courseResults.length > 0) {
      return [
        ...partnerResults.map((p) => ({ ...p, type: "partner" as const })),
        ...courseResults,
      ];
    }

    // Fallback to external API if no local courses found
    if (courseResults.length === 0) {
      return await searchCoursesAPI(searchText);
    }

    return [];
  } catch (err) {
    console.error("Search mentions error:", err);
    return [];
  }
};

/* ================================================================ */
/* HASHTAG SEARCH (#)                                               */
/* ================================================================ */

export const searchHashtags = async (
  searchText: string
): Promise<AutocompleteItem[]> => {
  try {
    const searchLower = searchText.toLowerCase();
    const results: AutocompleteItem[] = [];

    // Search tournaments
    const tournamentsSnap = await getDocs(collection(db, "tournaments"));
    tournamentsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const name = data.name || "";
      if (name.toLowerCase().includes(searchLower)) {
        results.push({
          id: docSnap.id,
          tournamentId: data.tournId || docSnap.id,
          name,
          type: "tournament",
          location: data.location ? `${data.location.city}, ${data.location.state}` : "",
          startDate: data.startDate,
        });
      }
    });

    // Search leagues
    try {
      const leaguesSnap = await getDocs(collection(db, "leagues"));
      leaguesSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const name = data.name || "";
        if (name.toLowerCase().includes(searchLower)) {
          results.push({
            id: docSnap.id,
            leagueId: docSnap.id,
            name,
            type: "league",
            location: data.regionName || "",
          });
        }
      });
    } catch {
      // Leagues collection may not exist yet
    }

    return results;
  } catch (err) {
    console.error("Search hashtags error:", err);
    return [];
  }
};

/* ================================================================ */
/* EXTERNAL COURSE API                                              */
/* ================================================================ */

export const searchCoursesAPI = async (
  searchText: string
): Promise<AutocompleteItem[]> => {
  try {
    const res = await fetch(
      `${GOLF_COURSE_API_URL}/search?search_query=${encodeURIComponent(searchText)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Key ${GOLF_COURSE_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const courses = data.courses || [];

    return courses.map((c: any) => {
      let displayName = "";
      if (c.club_name && c.course_name && c.club_name !== c.course_name) {
        displayName = `${c.club_name} - ${c.course_name}`;
      } else if (c.club_name) {
        displayName = c.club_name;
      } else {
        displayName = c.course_name;
      }

      return {
        courseId: c.id,
        courseName: displayName,
        location: `${c.location.city}, ${c.location.state}`,
        type: "course" as const,
      };
    });
  } catch (err) {
    console.error("Course API search error:", err);
    return [];
  }
};

/* ================================================================ */
/* TAG CLEANUP (on content change)                                  */
/* ================================================================ */

interface TagState {
  selectedMentions: string[];
  selectedTournaments: string[];
  selectedLeagues: string[];
}

interface CleanedTags {
  mentions: string[];
  tournaments: string[];
  leagues: string[];
  changed: boolean;
}

export const cleanupRemovedTags = (text: string, tags: TagState): CleanedTags => {
  const mentions = tags.selectedMentions.filter((m) => text.includes(m));
  const tournaments = tags.selectedTournaments.filter((t) => text.includes(t));
  const leagues = tags.selectedLeagues.filter((l) => text.includes(l));

  const changed =
    mentions.length !== tags.selectedMentions.length ||
    tournaments.length !== tags.selectedTournaments.length ||
    leagues.length !== tags.selectedLeagues.length;

  return { mentions, tournaments, leagues, changed };
};

/* ================================================================ */
/* PARSE TRIGGER FROM TEXT                                          */
/* ================================================================ */

interface TriggerResult {
  type: "mention" | "hashtag" | null;
  searchText: string;
  triggerIndex: number;
}

export const parseTrigger = (text: string): TriggerResult => {
  const lastAtIndex = text.lastIndexOf("@");
  const lastHashIndex = text.lastIndexOf("#");
  const triggerIndex = Math.max(lastAtIndex, lastHashIndex);

  if (triggerIndex === -1) {
    return { type: null, searchText: "", triggerIndex: -1 };
  }

  const triggerChar = lastAtIndex > lastHashIndex ? "@" : "#";
  const afterTrigger = text.slice(triggerIndex + 1);

  // Cancel if double-space or newline after trigger (user dismissed autocomplete)
  if (afterTrigger.includes("  ") || afterTrigger.includes("\n")) {
    return { type: null, searchText: "", triggerIndex: -1 };
  }

  // Only trigger if the character before is a space or start of string
  if (triggerIndex > 0 && text[triggerIndex - 1] !== " ") {
    return { type: null, searchText: "", triggerIndex: -1 };
  }

  // Use the full text after the trigger (supports multi-word searches)
  const searchText = afterTrigger;
  if (searchText.length < 1) {
    return { type: null, searchText: "", triggerIndex: -1 };
  }

  return {
    type: triggerChar === "@" ? "mention" : "hashtag",
    searchText,
    triggerIndex,
  };
};