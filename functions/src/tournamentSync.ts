/**
 * Tournament Sync Cloud Functions (v2)
 * 
 * Handles syncing PGA Tour tournament data from RapidAPI.
 * 
 * SETUP: Copy constants/regions.ts to functions/src/regions.ts
 * and add the intl_misc fallback region for international tournaments.
 */

import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { REGIONS, type Region } from "./regions";

const db = getFirestore();

const RAPIDAPI_KEY = defineSecret("RAPIDAPI_KEY");
const RAPIDAPI_HOST = defineSecret("RAPIDAPI_HOST");

// =================================================================
// TYPES
// =================================================================

interface TournamentScheduleItem {
  tournId: string;
  name: string;
  date: { start: string; end: string; weekNumber: string };
  format: string;
  purse: number;
  winnersShare?: number;
  fedexCupPoints?: number;
}

interface TournamentDetails {
  tournId: string;
  name: string;
  date: { start: string; end: string };
  status: string;
  timeZone: string;
  courses: Array<{
    courseId: string;
    courseName: string;
    host: string;
    location: { country: string; state: string; city: string };
    parTotal: string;
  }>;
}

interface LeaderboardRow {
  position: string;
  firstName: string;
  lastName: string;
  playerId: string;
  total: string;
  thru: string;
  currentRoundScore: string;
  status: string;
  isAmateur?: boolean;
}

interface LeaderboardPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  position: string;
  previousPosition: string | null;
  movement: "up" | "down" | "same" | "new";
  total: string;
  thru: string;
  currentRoundScore: string;
  isAmateur: boolean;
}

// =================================================================
// STATE ABBREVIATIONS
// =================================================================

const STATE_ABBREVIATIONS: Record<string, string> = {
  "alabama": "al", "alaska": "ak", "arizona": "az", "arkansas": "ar",
  "california": "ca", "colorado": "co", "connecticut": "ct", "delaware": "de",
  "florida": "fl", "georgia": "ga", "hawaii": "hi", "idaho": "id",
  "illinois": "il", "indiana": "in", "iowa": "ia", "kansas": "ks",
  "kentucky": "ky", "louisiana": "la", "maine": "me", "maryland": "md",
  "massachusetts": "ma", "michigan": "mi", "minnesota": "mn", "mississippi": "ms",
  "missouri": "mo", "montana": "mt", "nebraska": "ne", "nevada": "nv",
  "new hampshire": "nh", "new jersey": "nj", "new mexico": "nm", "new york": "ny",
  "north carolina": "nc", "north dakota": "nd", "ohio": "oh", "oklahoma": "ok",
  "oregon": "or", "pennsylvania": "pa", "rhode island": "ri", "south carolina": "sc",
  "south dakota": "sd", "tennessee": "tn", "texas": "tx", "utah": "ut",
  "vermont": "vt", "virginia": "va", "washington": "wa", "west virginia": "wv",
  "wisconsin": "wi", "wyoming": "wy", "district of columbia": "dc",
  "scotland": "scotland", "england": "england", "wales": "wales",
  "ontario": "on", "jalisco": "jalisco", "tokyo": "tokyo", "seoul": "seoul", "bermuda": "bermuda",
};

// =================================================================
// HELPERS
// =================================================================

function getStateAbbreviation(stateName: string | null | undefined): string | null {
  if (!stateName) return null;
  const lower = stateName.toLowerCase().trim();
  return STATE_ABBREVIATIONS[lower] || lower.substring(0, 2);
}

function safeTimestamp(dateInput: any): Timestamp | null {
  console.log(`📅 safeTimestamp called with:`, dateInput, `(type: ${typeof dateInput})`);
  
  if (!dateInput) {
    console.log(`⚠️ safeTimestamp: empty/null dateInput`);
    return null;
  }
  
  let date: Date;
  
  // Handle MongoDB Extended JSON format: { '$date': { '$numberLong': '1742083200000' } }
  if (typeof dateInput === "object") {
    if (dateInput.$date) {
      // MongoDB Extended JSON format
      let timestamp: number;
      if (typeof dateInput.$date === "object" && dateInput.$date.$numberLong) {
        timestamp = parseInt(dateInput.$date.$numberLong, 10);
      } else if (typeof dateInput.$date === "string") {
        timestamp = parseInt(dateInput.$date, 10);
      } else if (typeof dateInput.$date === "number") {
        timestamp = dateInput.$date;
      } else {
        console.log(`⚠️ Unknown $date format:`, JSON.stringify(dateInput));
        return null;
      }
      console.log(`📅 Parsed MongoDB timestamp: ${timestamp}`);
      date = new Date(timestamp);
    } else {
      console.log(`⚠️ safeTimestamp received unknown object:`, JSON.stringify(dateInput));
      return null;
    }
  } else if (typeof dateInput === "string") {
    // Regular date string
    const dateStr = dateInput.trim();
    // Add 'Z' if no timezone specified (treat as UTC)
    const normalizedDate = dateStr.endsWith("Z") || dateStr.includes("+") || dateStr.includes("-", 10) 
      ? dateStr 
      : dateStr + "Z";
    console.log(`📅 Normalized date string: "${normalizedDate}"`);
    date = new Date(normalizedDate);
  } else if (typeof dateInput === "number") {
    // Unix timestamp
    date = new Date(dateInput);
  } else {
    console.log(`⚠️ Unknown dateInput type: ${typeof dateInput}`);
    return null;
  }
  
  if (isNaN(date.getTime())) {
    console.log(`❌ Invalid date from:`, dateInput);
    return null;
  }
  
  console.log(`📅 Parsed date: ${date.toISOString()}`);
  
  try {
    const ts = Timestamp.fromDate(date);
    console.log(`✅ Created timestamp successfully`);
    return ts;
  } catch (err) {
    console.log(`❌ Timestamp.fromDate failed:`, err);
    return null;
  }
}

function findRegionForLocation(
  city: string | null | undefined, 
  state: string | null | undefined, 
  courseName?: string
): Region | null {
  if (!city && !state) {
    return REGIONS.find((r: Region) => r.key === "intl_misc") || null;
  }

  const stateAbbr = getStateAbbreviation(state);
  const cityLower = (city || "").toLowerCase().trim();
  const courseNameLower = (courseName || "").toLowerCase();

  console.log(`🔍 Finding region for: ${city || "?"}, ${state || "?"} (${courseName || "no course"})`);

  // 1. Match by course name in majorCities
  if (courseName) {
    const match = REGIONS.find((r: Region) => !r.isFallback && r.majorCities.some((c: string) => 
      courseNameLower.includes(c.toLowerCase()) || c.toLowerCase().includes(courseNameLower.split("(")[0].trim())
    ));
    if (match) { console.log(`✅ Matched by course: ${match.key}`); return match; }
  }

  // 2. Exact city match
  if (cityLower) {
    const match = REGIONS.find((r: Region) => !r.isFallback && 
      (r.primaryCity.toLowerCase() === cityLower || r.majorCities.some((c: string) => c.toLowerCase() === cityLower))
    );
    if (match) { console.log(`✅ Matched by city: ${match.key}`); return match; }

    // 3. Partial city match
    const partial = REGIONS.find((r: Region) => !r.isFallback && 
      (r.primaryCity.toLowerCase().includes(cityLower) || cityLower.includes(r.primaryCity.toLowerCase()) ||
        r.majorCities.some((c: string) => c.toLowerCase().includes(cityLower) || cityLower.includes(c.toLowerCase())))
    );
    if (partial) { console.log(`✅ Matched by partial city: ${partial.key}`); return partial; }
  }

  // 4. Match by state
  if (stateAbbr) {
    const match = REGIONS.find((r: Region) => !r.isFallback && r.states?.includes(stateAbbr));
    if (match) { console.log(`✅ Matched by state: ${match.key}`); return match; }
  }

  // 5. Fallback to intl_misc for international tournaments
  const intlMisc = REGIONS.find((r: Region) => r.key === "intl_misc");
  if (intlMisc) {
    console.log(`⚠️ Using fallback region: intl_misc`);
    return intlMisc;
  }

  console.log(`❌ No region found for: ${city}, ${state}`);
  return null;
}

function encodeGeohash(lat: number, lon: number, precision = 5): string {
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let minLat = -90, maxLat = 90, minLon = -180, maxLon = 180;
  let hash = "", bit = 0, ch = 0, even = true;

  while (hash.length < precision) {
    if (even) {
      const mid = (minLon + maxLon) / 2;
      if (lon >= mid) { ch |= (1 << (4 - bit)); minLon = mid; } else { maxLon = mid; }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) { ch |= (1 << (4 - bit)); minLat = mid; } else { maxLat = mid; }
    }
    even = !even;
    if (++bit === 5) { hash += base32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

function isTournamentLive(startDate: Date, endDate: Date): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();

  // Must be Thu (4), Fri (5), Sat (6), or Sun (0)
  const isValidDay = [0, 4, 5, 6].includes(dayOfWeek);
  // Must be between 8am and 8pm
  const isValidTime = hour >= 8 && hour < 20;
  // Must be within tournament dates (with 1 day buffer)
  const bufferMs = 24 * 60 * 60 * 1000;
  const isWithinDates = now >= new Date(startDate.getTime() - bufferMs) && now <= new Date(endDate.getTime() + bufferMs);

  return isValidDay && isValidTime && isWithinDates;
}

/**
 * Parse position string to numeric value for comparison
 * Handles: "1", "2", "T3", "CUT", "WD", etc.
 */
function parsePosition(position: string): number {
  if (!position) return 999;
  const cleaned = position.replace(/^T/, "").trim();
  const num = parseInt(cleaned, 10);
  if (isNaN(num)) return 999; // CUT, WD, etc.
  return num;
}

/**
 * Calculate movement based on previous and current position
 */
function calculateMovement(
  currentPos: string,
  previousPos: string | null
): "up" | "down" | "same" | "new" {
  if (!previousPos) return "new";
  
  const current = parsePosition(currentPos);
  const previous = parsePosition(previousPos);
  
  if (current < previous) return "up";
  if (current > previous) return "down";
  return "same";
}

// =================================================================
// SCHEDULED: SYNC TOURNAMENT SCHEDULE
// =================================================================

export const syncTournamentSchedule = onCall(
  { timeoutSeconds: 300, memory: "512MiB", secrets: [RAPIDAPI_KEY, RAPIDAPI_HOST] },
  async (request) => {
    const { year = new Date().getFullYear().toString(), orgId = "1" } = request.data || {};

    console.log(`\n🏌️ Starting tournament schedule sync for ${year}...`);
    const apiKey = RAPIDAPI_KEY.value();
    const apiHost = RAPIDAPI_HOST.value();
    if (!apiKey || !apiHost) throw new HttpsError("failed-precondition", "Missing API credentials");

    try {
      const res = await fetch(`https://${apiHost}/schedule?orgId=${orgId}&year=${year}`, {
        headers: { "x-rapidapi-host": apiHost, "x-rapidapi-key": apiKey },
      });
      if (!res.ok) throw new HttpsError("internal", `API error: ${res.status}`);

      const data = await res.json();
      const tournaments: TournamentScheduleItem[] = data.schedule || [];
      console.log(`📋 Found ${tournaments.length} tournaments`);

      const results: any[] = [];
      let successCount = 0, skippedCount = 0, errorCount = 0;

      for (const t of tournaments) {
        try {
          const startTs = safeTimestamp(t.date.start);
          const endTs = safeTimestamp(t.date.end);

          if (!startTs || !endTs) {
            console.log(`⏩ Skipping ${t.name}: invalid dates`);
            results.push({ tournId: t.tournId, name: t.name, status: "skipped", reason: "invalid dates" });
            skippedCount++;
            continue;
          }

          let courseData: any = null, location: any = null, regionKey: string | null = null, geohash: string | null = null;

          const detailsRes = await fetch(`https://${apiHost}/tournament?orgId=${orgId}&tournId=${t.tournId}&year=${year}`, {
            headers: { "x-rapidapi-host": apiHost, "x-rapidapi-key": apiKey },
          });

          if (detailsRes.ok) {
            const details: TournamentDetails = await detailsRes.json();
            const hostCourse = details.courses?.find((c: TournamentDetails["courses"][0]) => c.host === "Yes") || details.courses?.[0];

            if (hostCourse?.location) {
              courseData = { courseId: hostCourse.courseId, courseName: hostCourse.courseName, parTotal: parseInt(hostCourse.parTotal) || 72 };
              const region = findRegionForLocation(hostCourse.location.city, hostCourse.location.state, hostCourse.courseName);

              if (region) {
                regionKey = region.key;
                location = {
                  city: hostCourse.location.city || "Unknown",
                  state: hostCourse.location.state || "Unknown",
                  country: hostCourse.location.country || "Unknown",
                  latitude: region.centerPoint.lat,
                  longitude: region.centerPoint.lon,
                };
                geohash = encodeGeohash(region.centerPoint.lat, region.centerPoint.lon);
              }
            }
          }

          await db.collection("tournaments").doc(`${year}_${t.tournId}`).set({
            tournId: t.tournId, orgId, year: parseInt(year), name: t.name, format: t.format,
            purse: t.purse || 0, winnersShare: t.winnersShare || 0, fedexCupPoints: t.fedexCupPoints || 0,
            startDate: startTs, endDate: endTs, weekNumber: parseInt(t.date.weekNumber) || 0,
            course: courseData, location, regionKey, geohash, isActive: false,
            syncedAt: FieldValue.serverTimestamp(),
          }, { merge: true });

          results.push({ tournId: t.tournId, name: t.name, status: "success" });
          successCount++;
          console.log(`✅ Saved: ${t.name}`);
          await new Promise(r => setTimeout(r, 200));

        } catch (err) {
          console.error(`❌ Error: ${t.name}`, err);
          results.push({ tournId: t.tournId, name: t.name, status: "error", error: String(err) });
          errorCount++;
        }
      }

      console.log(`\n🏁 Done: ${successCount} success, ${skippedCount} skipped, ${errorCount} errors`);
      return { success: true, year, totalTournaments: tournaments.length, successCount, skippedCount, errorCount, results };
    } catch (error) {
      console.error("❌ Schedule sync failed:", error);
      throw new HttpsError("internal", `Schedule sync failed: ${error}`);
    }
  }
);

// =================================================================
// SCHEDULED: SYNC LEADERBOARD (Enhanced with position tracking)
// =================================================================

export const syncLeaderboard = onSchedule(
  { schedule: "0 * * * *", timeZone: "America/New_York", timeoutSeconds: 120, memory: "256MiB", secrets: [RAPIDAPI_KEY, RAPIDAPI_HOST] },
  async () => {
    console.log("🏌️ Starting leaderboard sync...");
    const apiKey = RAPIDAPI_KEY.value();
    const apiHost = RAPIDAPI_HOST.value();
    if (!apiKey) { console.error("❌ No API key"); return; }

    const now = new Date();
    const year = now.getFullYear().toString();

    try {
      const snap = await db.collection("tournaments").where("year", "==", parseInt(year)).where("startDate", "<=", Timestamp.fromDate(now)).get();
      const active = snap.docs.filter((d) => {
        const end = d.data().endDate?.toDate();
        return end && end >= new Date(now.getTime() - 24 * 60 * 60 * 1000);
      });

      if (!active.length) { console.log("📭 No active tournaments"); return; }

      for (const doc of active) {
        const t = doc.data();
        const isLive = isTournamentLive(t.startDate.toDate(), t.endDate.toDate());
        await doc.ref.update({ isActive: isLive });
        if (!isLive) continue;

        console.log(`📊 Fetching leaderboard: ${t.name}`);
        const res = await fetch(`https://${apiHost}/leaderboard?orgId=${t.orgId}&tournId=${t.tournId}&year=${year}`, {
          headers: { "x-rapidapi-host": apiHost, "x-rapidapi-key": apiKey },
        });
        if (!res.ok) continue;

        const data = await res.json();
        const rows: LeaderboardRow[] = data.leaderboardRows || [];
        
        // Get previous leaderboard data for position comparison
        const leaderboardDocId = `${year}_${t.tournId}`;
        const prevDoc = await db.collection("tournamentLeaderboards").doc(leaderboardDocId).get();
        const prevPlayers: Map<string, string> = new Map();
        
        if (prevDoc.exists) {
          const prevData = prevDoc.data();
          (prevData?.players || []).forEach((p: LeaderboardPlayer) => {
            prevPlayers.set(p.playerId, p.position);
          });
        }

        // Process all active players (not cut/wd)
        const activePlayers = rows
          .filter((r: LeaderboardRow) => r.status !== "cut" && r.status !== "wd")
          .map((r: LeaderboardRow): LeaderboardPlayer => {
            const previousPosition = prevPlayers.get(r.playerId) || null;
            return {
              playerId: r.playerId,
              firstName: r.firstName,
              lastName: r.lastName,
              position: r.position,
              previousPosition,
              movement: calculateMovement(r.position, previousPosition),
              total: r.total,
              thru: r.thru,
              currentRoundScore: r.currentRoundScore,
              isAmateur: r.isAmateur || false,
            };
          });

        await db.collection("tournamentLeaderboards").doc(leaderboardDocId).set({
          tournId: t.tournId,
          tournamentName: t.name,
          year: parseInt(year),
          orgId: t.orgId,
          status: data.status || "In Progress",
          roundId: data.roundId || 1,
          roundStatus: data.roundStatus || "in_progress",
          cutLine: data.cutLines?.[0]?.cutScore || null,
          players: activePlayers,
          lastUpdated: FieldValue.serverTimestamp(),
        });
        
        console.log(`✅ Updated leaderboard: ${activePlayers.length} players (${t.name})`);
      }
    } catch (err) { console.error("❌ Leaderboard sync failed:", err); }
  }
);

// =================================================================
// CALLABLE: MANUAL LEADERBOARD SYNC (Enhanced)
// =================================================================

export const syncLeaderboardManual = onCall(
  { timeoutSeconds: 120, memory: "256MiB", secrets: [RAPIDAPI_KEY, RAPIDAPI_HOST] },
  async (request) => {
    const { tournId, year = new Date().getFullYear().toString(), orgId = "1" } = request.data || {};
    if (!tournId) throw new HttpsError("invalid-argument", "tournId required");

    const apiKey = RAPIDAPI_KEY.value();
    const apiHost = RAPIDAPI_HOST.value();
    if (!apiKey) throw new HttpsError("failed-precondition", "No API key");

    console.log(`📊 Manual leaderboard sync: tournId=${tournId}, year=${year}`);

    const res = await fetch(`https://${apiHost}/leaderboard?orgId=${orgId}&tournId=${tournId}&year=${year}`, {
      headers: { "x-rapidapi-host": apiHost, "x-rapidapi-key": apiKey },
    });
    if (!res.ok) throw new HttpsError("internal", `API error: ${res.status}`);

    const data = await res.json();
    const rows: LeaderboardRow[] = data.leaderboardRows || [];

    // Get previous leaderboard data for position comparison
    const leaderboardDocId = `${year}_${tournId}`;
    const prevDoc = await db.collection("tournamentLeaderboards").doc(leaderboardDocId).get();
    const prevPlayers: Map<string, string> = new Map();
    
    if (prevDoc.exists) {
      const prevData = prevDoc.data();
      (prevData?.players || []).forEach((p: LeaderboardPlayer) => {
        prevPlayers.set(p.playerId, p.position);
      });
    }

    // Process all active players (not cut/wd)
    const activePlayers = rows
      .filter((r: LeaderboardRow) => r.status !== "cut" && r.status !== "wd")
      .map((r: LeaderboardRow): LeaderboardPlayer => {
        const previousPosition = prevPlayers.get(r.playerId) || null;
        return {
          playerId: r.playerId,
          firstName: r.firstName,
          lastName: r.lastName,
          position: r.position,
          previousPosition,
          movement: calculateMovement(r.position, previousPosition),
          total: r.total,
          thru: r.thru,
          currentRoundScore: r.currentRoundScore,
          isAmateur: r.isAmateur || false,
        };
      });

    const tournDoc = await db.collection("tournaments").doc(`${year}_${tournId}`).get();
    const tournamentName = tournDoc.exists ? tournDoc.data()?.name : "Unknown";

    await db.collection("tournamentLeaderboards").doc(leaderboardDocId).set({
      tournId,
      tournamentName,
      year: parseInt(year),
      orgId,
      status: data.status || "In Progress",
      roundId: data.roundId || 1,
      roundStatus: data.roundStatus || "in_progress",
      cutLine: data.cutLines?.[0]?.cutScore || null,
      players: activePlayers,
      lastUpdated: FieldValue.serverTimestamp(),
    });

    console.log(`✅ Manual sync complete: ${activePlayers.length} players`);

    return { 
      success: true, 
      tournamentName, 
      playerCount: activePlayers.length, 
      players: activePlayers.slice(0, 10) // Return top 10 for response
    };
  }
);

// =================================================================
// SCHEDULED: CLEANUP OLD TOURNAMENT CHATS
// =================================================================

export const cleanupTournamentChats = onSchedule(
  { schedule: "0 3 * * *", timeZone: "America/New_York", timeoutSeconds: 300, memory: "256MiB" },
  async () => {
    console.log("🧹 Cleaning up chats...");
    const now = Timestamp.now();
    let deleted = 0;

    try {
      const collections = await db.listCollections();
      for (const col of collections) {
        if (!col.id.startsWith("tournamentChats_")) continue;
        const expired = await col.where("expireAt", "<", now).limit(500).get();
        if (expired.empty) continue;

        const batch = db.batch();
        expired.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        deleted += expired.size;
      }
      console.log(`✅ Deleted ${deleted} messages`);
    } catch (err) { console.error("❌ Cleanup failed:", err); }
  }
);

// =================================================================
// CALLABLE: GET ACTIVE TOURNAMENT
// =================================================================

export const getActiveTournament = onCall({ timeoutSeconds: 30 }, async () => {
  const now = new Date();
  const year = now.getFullYear();

  try {
    const snap = await db.collection("tournaments").where("year", "==", year).where("isActive", "==", true).limit(1).get();
    if (snap.empty) return { active: false, tournament: null };

    const t = snap.docs[0].data();
    const chatId = `tournamentChats_${year}_${t.tournId}_live`;
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

    let participantCount = 0;
    try {
      const msgs = await db.collection(chatId).where("createdAt", ">", Timestamp.fromDate(thirtyMinAgo)).get();
      participantCount = new Set(msgs.docs.map((d) => d.data().userId)).size;
    } catch { /* collection may not exist */ }

    const lbDoc = await db.collection("tournamentLeaderboards").doc(`${year}_${t.tournId}`).get();
    const lb = lbDoc.exists ? lbDoc.data() : null;

    return {
      active: true,
      tournament: { 
        tournId: t.tournId, 
        name: t.name, 
        course: t.course, 
        location: t.location, 
        regionKey: t.regionKey,
        orgId: t.orgId,
        year: t.year,
      },
      leaderboard: lb ? { 
        players: lb.players, 
        lastUpdated: lb.lastUpdated, 
        status: lb.status, 
        roundId: lb.roundId,
        roundStatus: lb.roundStatus,
      } : null,
      participantCount,
    };
  } catch (err) {
    console.error("❌ Error:", err);
    throw new HttpsError("internal", "Failed to get active tournament");
  }
});