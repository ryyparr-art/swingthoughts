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

  // 4. State MSA match
  if (stateAbbr) {
    const stateMatch = REGIONS.find((r: Region) => !r.isFallback && (r.state === stateAbbr || r.states?.includes(stateAbbr)));
    if (stateMatch) { console.log(`✅ Matched by state MSA: ${stateMatch.key}`); return stateMatch; }

    // 5. State fallback
    const fallback = REGIONS.find((r: Region) => r.isFallback && r.state === stateAbbr);
    if (fallback) { console.log(`⚠️ State fallback: ${fallback.key}`); return fallback; }
  }

  console.log(`⚠️ Using international fallback`);
  return REGIONS.find((r: Region) => r.key === "intl_misc") || null;
}

function encodeGeohash(lat: number, lon: number, precision = 5): string {
  const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let idx = 0, bit = 0, evenBit = true, geohash = "";
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const mid = (lonMin + lonMax) / 2;
      if (lon > mid) { idx |= (1 << (4 - bit)); lonMin = mid; } else { lonMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat > mid) { idx |= (1 << (4 - bit)); latMin = mid; } else { latMax = mid; }
    }
    evenBit = !evenBit;
    if (bit < 4) { bit++; } else { geohash += BASE32[idx]; bit = 0; idx = 0; }
  }
  return geohash;
}

function isTournamentLive(startDate: Date, endDate: Date): boolean {
  const now = new Date();
  const endBuffer = new Date(endDate); endBuffer.setHours(23, 59, 59);
  if (now < startDate || now > endBuffer) return false;

  const etString = now.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", weekday: "short" });
  const dayMatch = etString.match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/);
  if (!dayMatch || !["Thu", "Fri", "Sat", "Sun"].includes(dayMatch[1])) return false;

  const hourMatch = etString.match(/(\d+):/);
  const isPM = etString.includes("PM");
  let hour = hourMatch ? parseInt(hourMatch[1]) : 0;
  if (isPM && hour !== 12) hour += 12;
  if (!isPM && hour === 12) hour = 0;
  return hour >= 8 && hour < 20;
}

// =================================================================
// CLOUD FUNCTIONS
// =================================================================

export const syncTournamentSchedule = onCall(
  { timeoutSeconds: 300, memory: "512MiB", secrets: [RAPIDAPI_KEY, RAPIDAPI_HOST] },
  async (request) => {
    const year = request.data?.year || new Date().getFullYear().toString();
    const orgId = request.data?.orgId || "1";
    const apiKey = RAPIDAPI_KEY.value();
    const apiHost = RAPIDAPI_HOST.value();

    if (!apiKey) throw new HttpsError("failed-precondition", "RapidAPI key not configured");

    console.log(`🏌️ Syncing tournament schedule for ${year}`);

    try {
      const scheduleRes = await fetch(`https://${apiHost}/schedule?orgId=${orgId}&year=${year}`, {
        headers: { "x-rapidapi-host": apiHost, "x-rapidapi-key": apiKey },
      });
      if (!scheduleRes.ok) throw new Error(`Schedule API error: ${scheduleRes.status}`);

      const { schedule: tournaments = [] }: { schedule: TournamentScheduleItem[] } = await scheduleRes.json();
      console.log(`📅 Found ${tournaments.length} tournaments`);

      const results: { tournId: string; name: string; status: string; error?: string }[] = [];
      let successCount = 0, skippedCount = 0, errorCount = 0;

      for (const t of tournaments) {
        try {
          console.log(`\n📍 Processing: ${t.name} (${t.tournId})`);

          const startTs = safeTimestamp(t.date.start);
          const endTs = safeTimestamp(t.date.end);
          if (!startTs || !endTs) {
            console.warn(`⚠️ Skipping: Invalid dates`);
            results.push({ tournId: t.tournId, name: t.name, status: "skipped", error: "Invalid dates" });
            skippedCount++;
            continue;
          }

          const detailsRes = await fetch(`https://${apiHost}/tournament?orgId=${orgId}&tournId=${t.tournId}&year=${year}`, {
            headers: { "x-rapidapi-host": apiHost, "x-rapidapi-key": apiKey },
          });

          let courseData = null, regionKey = null, location = null, geohash = null;

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
        const top10 = rows.filter((r: LeaderboardRow) => r.status !== "cut" && r.status !== "wd").slice(0, 10).map((r: LeaderboardRow) => ({
          position: r.position, firstName: r.firstName, lastName: r.lastName, playerId: r.playerId,
          total: r.total, thru: r.thru, currentRoundScore: r.currentRoundScore,
        }));

        await db.collection("tournamentLeaderboards").doc(`${year}_${t.tournId}`).set({
          tournId: t.tournId, tournamentName: t.name, year: parseInt(year),
          status: data.status || "In Progress", roundId: data.roundId || 1,
          players: top10, lastUpdated: FieldValue.serverTimestamp(),
        });
        console.log(`✅ Updated: ${top10.length} players`);
      }
    } catch (err) { console.error("❌ Leaderboard sync failed:", err); }
  }
);

export const syncLeaderboardManual = onCall(
  { timeoutSeconds: 120, memory: "256MiB", secrets: [RAPIDAPI_KEY, RAPIDAPI_HOST] },
  async (request) => {
    const { tournId, year = new Date().getFullYear().toString(), orgId = "1" } = request.data || {};
    if (!tournId) throw new HttpsError("invalid-argument", "tournId required");

    const apiKey = RAPIDAPI_KEY.value();
    const apiHost = RAPIDAPI_HOST.value();
    if (!apiKey) throw new HttpsError("failed-precondition", "No API key");

    const res = await fetch(`https://${apiHost}/leaderboard?orgId=${orgId}&tournId=${tournId}&year=${year}`, {
      headers: { "x-rapidapi-host": apiHost, "x-rapidapi-key": apiKey },
    });
    if (!res.ok) throw new HttpsError("internal", `API error: ${res.status}`);

    const data = await res.json();
    const rows: LeaderboardRow[] = data.leaderboardRows || [];
    const top10 = rows.filter((r: LeaderboardRow) => r.status !== "cut" && r.status !== "wd").slice(0, 10).map((r: LeaderboardRow) => ({
      position: r.position, firstName: r.firstName, lastName: r.lastName, playerId: r.playerId,
      total: r.total, thru: r.thru, currentRoundScore: r.currentRoundScore,
    }));

    const tournDoc = await db.collection("tournaments").doc(`${year}_${tournId}`).get();
    const tournamentName = tournDoc.exists ? tournDoc.data()?.name : "Unknown";

    await db.collection("tournamentLeaderboards").doc(`${year}_${tournId}`).set({
      tournId, tournamentName, year: parseInt(year), status: data.status || "In Progress",
      roundId: data.roundId || 1, players: top10, lastUpdated: FieldValue.serverTimestamp(),
    });

    return { success: true, tournamentName, playerCount: top10.length, players: top10 };
  }
);

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
      tournament: { tournId: t.tournId, name: t.name, course: t.course, location: t.location, regionKey: t.regionKey },
      leaderboard: lb ? { players: lb.players, lastUpdated: lb.lastUpdated, status: lb.status, roundId: lb.roundId } : null,
      participantCount,
    };
  } catch (err) {
    console.error("❌ Error:", err);
    throw new HttpsError("internal", "Failed to get active tournament");
  }
});