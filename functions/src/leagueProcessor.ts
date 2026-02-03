/**
 * League Processor - Scheduled Cloud Functions
 * 
 * Handles all time-based league operations:
 * - Season starting notifications (day before)
 * - Season activation (on start date)
 * - Score reminders (after tee time)
 * - Week completion (calculate winners, update standings, purse tracking)
 * - Season completion (crown champion, championship purse)
 * 
 * Purse Support:
 * - Weekly prize → awarded to week winner
 * - Elevated bonus → added to weekly prize for elevated weeks
 * - Season championship → awarded to season champion
 * 
 * Deploy: firebase deploy --only functions:processLeaguesDaily
 */

import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

const db = getFirestore();

// ============================================================================
// NOTIFICATION HELPER (imported for non-purse notifications)
// ============================================================================

import { createNotificationDocument } from "./notifications/helpers";

// ============================================================================
// PURSE HELPERS
// ============================================================================

interface PurseData {
  seasonPurse: number;
  weeklyPurse: number;
  elevatedPurse: number;
  currency: string;
}

/**
 * Check if a week is an elevated event
 */
function isElevatedWeek(league: FirebaseFirestore.DocumentData, week: number): boolean {
  return (
    league.elevatedEvents?.enabled === true &&
    Array.isArray(league.elevatedEvents?.weeks) &&
    league.elevatedEvents.weeks.includes(week)
  );
}

/**
 * Get the purse data from a league document (null if no purse configured)
 */
function getLeaguePurse(league: FirebaseFirestore.DocumentData): PurseData | null {
  if (!league.purse) return null;
  const p = league.purse;
  if ((p.seasonPurse || 0) === 0 && (p.weeklyPurse || 0) === 0 && (p.elevatedPurse || 0) === 0) {
    return null;
  }
  return {
    seasonPurse: p.seasonPurse || 0,
    weeklyPurse: p.weeklyPurse || 0,
    elevatedPurse: p.elevatedPurse || 0,
    currency: p.currency || "USD",
  };
}

/**
 * Calculate the total prize for a given week
 * Returns 0 if no purse is configured or no weekly prize
 */
function calculateWeekPrize(purse: PurseData | null, isElevated: boolean): number {
  if (!purse) return 0;
  let total = purse.weeklyPurse || 0;
  if (isElevated) {
    total += purse.elevatedPurse || 0;
  }
  return total;
}

/**
 * Format a currency amount (e.g. "$25", "$500")
 */
function formatPrize(amount: number, currency: string = "USD"): string {
  if (amount <= 0) return "";
  // Simple format - works for USD and most currencies
  if (currency === "USD") return `$${amount}`;
  return `${amount} ${currency}`;
}

/**
 * Generate notification message for league types
 */
function generateLeagueMessage(
  type: string,
  extraData: {
    leagueName?: string;
    teamName?: string;
    weekNumber?: number;
    netScore?: number;
    actorName?: string;
    isElevated?: boolean;
    prizeAmount?: number;
    currency?: string;
  }
): string {
  const { leagueName, weekNumber, netScore, actorName, isElevated, prizeAmount, currency } = extraData;

  const elevatedPrefix = isElevated ? "🏅 " : "";
  const elevatedLabel = isElevated ? "Elevated " : "";
  const prizeStr = prizeAmount && prizeAmount > 0 ? ` 💰 ${formatPrize(prizeAmount, currency)} prize` : "";

  switch (type) {
    case "league_score_reminder":
      return isElevated
        ? `🏅 Don't forget your Elevated Week ${weekNumber || ""} score for ${leagueName || "your league"}!`
        : `Don't forget to post your Week ${weekNumber || ""} score for ${leagueName || "your league"}!`;

    case "league_season_starting":
      return `${leagueName || "Your league"} kicks off tomorrow! Get ready 🏌️`;

    case "league_season_started":
      return `Week 1 is live in ${leagueName || "your league"}! Post your first score`;

    case "league_season_complete":
      return `Congratulations to ${actorName || "the champion"} — Season Champion of ${leagueName || "the league"}! 🏆${prizeStr}`;

    case "league_week_start": {
      const prizePreview = prizeAmount && prizeAmount > 0
        ? ` ${formatPrize(prizeAmount, currency)} prize`
        : "";
      if (isElevated) {
        const multiplier = extraData.teamName || "2x"; // repurpose teamName for multiplier string if needed
        return `🏅 Elevated Week ${weekNumber || ""} is now open in ${leagueName || "your league"}! ${multiplier} points${prizePreview ? ` • ${prizePreview}` : ""} 🏌️`;
      }
      return `Week ${weekNumber || ""} is now open in ${leagueName || "your league"}!${prizePreview ? ` ${prizePreview} up for grabs!` : ""} 🏌️`;
    }

    case "league_week_complete":
      return `${elevatedPrefix}${actorName || "Someone"} wins ${elevatedLabel}Week ${weekNumber || ""}${netScore ? ` with ${netScore} net` : ""}!${prizeStr.length > 0 ? prizeStr : " 🏆"}`;

    default:
      return `League update for ${leagueName || "your league"}`;
  }
}

// ============================================================================
// MAIN SCHEDULED FUNCTION
// ============================================================================

/**
 * Main daily league processor
 * Runs every day at 6 AM, 12 PM, and 9 PM Eastern to catch different play times
 */
export const processLeaguesDaily = onSchedule(
  {
    schedule: "0 6,12,21 * * *", // 6 AM, 12 PM, 9 PM daily
    region: "us-central1",
    timeZone: "America/New_York",
  },
  async () => {
    console.log("🔄 Starting daily league processor...");

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const currentDayName = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][now.getDay()];
    const yesterdayDayName = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][yesterday.getDay()];
    const currentHour = now.getHours();

    try {
      // ========================================
      // 1. SEASON STARTING TOMORROW
      // ========================================
      await processSeasonStartingTomorrow(tomorrow);

      // ========================================
      // 2. SEASON STARTING TODAY
      // ========================================
      await processSeasonStartingToday(today);

      // ========================================
      // 3. SCORE REMINDERS (for today's play day)
      // ========================================
      await processScoreReminders(currentDayName, currentHour);

      // ========================================
      // 4. WEEK COMPLETION (for yesterday's play day)
      // Only run at 6 AM to process previous day's results
      // ========================================
      if (currentHour === 6) {
        await processWeekCompletion(yesterdayDayName);
      }

      console.log("✅ Daily league processor complete");
    } catch (error) {
      console.error("🔥 Daily league processor failed:", error);
    }
  }
);

// ============================================================================
// SEASON MANAGEMENT
// ============================================================================

/**
 * Process leagues starting tomorrow - send "season starting" notifications
 */
async function processSeasonStartingTomorrow(tomorrow: Date): Promise<void> {
  console.log("📅 Checking for leagues starting tomorrow...");

  const tomorrowStart = Timestamp.fromDate(tomorrow);
  const tomorrowEnd = Timestamp.fromDate(new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000));

  const leaguesSnap = await db
    .collection("leagues")
    .where("status", "==", "upcoming")
    .where("startDate", ">=", tomorrowStart)
    .where("startDate", "<", tomorrowEnd)
    .get();

  for (const leagueDoc of leaguesSnap.docs) {
    const league = leagueDoc.data();
    const leagueId = leagueDoc.id;
    const leagueName = league.name;

    console.log(`📅 League starting tomorrow: ${leagueName}`);

    // Get all active members
    const membersSnap = await db
      .collection("leagues")
      .doc(leagueId)
      .collection("members")
      .where("status", "==", "active")
      .get();

    for (const memberDoc of membersSnap.docs) {
      await createNotificationDocument({
        userId: memberDoc.id,
        type: "league_season_starting",
        leagueId,
        leagueName,
        message: generateLeagueMessage("league_season_starting", { leagueName }),
      });
    }

    console.log(`✅ Sent "starting tomorrow" to ${membersSnap.size} members`);
  }
}

/**
 * Process leagues starting today - activate them and send notifications
 */
async function processSeasonStartingToday(today: Date): Promise<void> {
  console.log("🚀 Checking for leagues starting today...");

  const todayStart = Timestamp.fromDate(today);
  const todayEnd = Timestamp.fromDate(new Date(today.getTime() + 24 * 60 * 60 * 1000));

  const leaguesSnap = await db
    .collection("leagues")
    .where("status", "==", "upcoming")
    .where("startDate", ">=", todayStart)
    .where("startDate", "<", todayEnd)
    .get();

  for (const leagueDoc of leaguesSnap.docs) {
    const league = leagueDoc.data();
    const leagueId = leagueDoc.id;
    const leagueName = league.name;

    console.log(`🚀 Activating league: ${leagueName}`);

    // Update league to active
    await db.collection("leagues").doc(leagueId).update({
      status: "active",
      currentWeek: 1,
      _updatedByProcessor: true,
    });

    // Get all active members and send notifications
    const membersSnap = await db
      .collection("leagues")
      .doc(leagueId)
      .collection("members")
      .where("status", "==", "active")
      .get();

    for (const memberDoc of membersSnap.docs) {
      await createNotificationDocument({
        userId: memberDoc.id,
        type: "league_season_started",
        leagueId,
        leagueName,
        weekNumber: 1,
        message: generateLeagueMessage("league_season_started", { leagueName }),
      });
    }

    console.log(`✅ League activated: ${leagueName}, notified ${membersSnap.size} members`);
  }
}

// ============================================================================
// SCORE REMINDERS
// ============================================================================

/**
 * Process score reminders for active leagues
 * Now includes elevated week awareness (🏅)
 */
async function processScoreReminders(currentDayName: string, currentHour: number): Promise<void> {
  console.log(`⏰ Checking score reminders for ${currentDayName}...`);

  // Get active leagues where today is their play day
  const leaguesSnap = await db
    .collection("leagues")
    .where("status", "==", "active")
    .where("playDay", "==", currentDayName)
    .get();

  for (const leagueDoc of leaguesSnap.docs) {
    const league = leagueDoc.data();
    const leagueId = leagueDoc.id;
    const leagueName = league.name;
    const teeTime = league.teeTime; // "14:00" format
    const holes = league.holesPerRound || 18;
    const currentWeek = league.currentWeek || 1;

    // Skip if no tee time set
    if (!teeTime) continue;

    // Parse tee time and calculate reminder window
    const [teeHour] = teeTime.split(":").map(Number);
    const reminderOffset = holes === 9 ? 4 : 6; // 4hrs after for 9-hole, 6hrs for 18-hole
    const reminderHour = teeHour + reminderOffset;

    // Only send reminders within the reminder window (±1 hour)
    if (Math.abs(currentHour - reminderHour) > 1) continue;

    console.log(`⏰ Processing reminders for ${leagueName} (Week ${currentWeek})`);

    // Check if this is an elevated week
    const elevated = isElevatedWeek(league, currentWeek);

    // Get all active members
    const membersSnap = await db
      .collection("leagues")
      .doc(leagueId)
      .collection("members")
      .where("status", "==", "active")
      .get();

    // Get scores for this week
    const scoresSnap = await db
      .collection("leagues")
      .doc(leagueId)
      .collection("scores")
      .where("week", "==", currentWeek)
      .where("status", "in", ["approved", "pending"])
      .get();

    const scoredUserIds = new Set(scoresSnap.docs.map((doc) => doc.data().userId));

    // Send reminders to members without scores
    let reminderCount = 0;
    for (const memberDoc of membersSnap.docs) {
      const memberId = memberDoc.id;

      if (scoredUserIds.has(memberId)) continue; // Already posted

      await createNotificationDocument({
        userId: memberId,
        type: "league_score_reminder",
        leagueId,
        leagueName,
        weekNumber: currentWeek,
        message: generateLeagueMessage("league_score_reminder", {
          leagueName,
          weekNumber: currentWeek,
          isElevated: elevated,
        }),
      });
      reminderCount++;
    }

    console.log(`✅ Sent ${reminderCount} score reminders for ${leagueName}${elevated ? " (🏅 Elevated)" : ""}`);
  }
}

// ============================================================================
// WEEK COMPLETION
// ============================================================================

/**
 * Process week completion for leagues that played yesterday
 * Now includes purse tracking and elevated event awareness
 */
async function processWeekCompletion(yesterdayDayName: string): Promise<void> {
  console.log(`🏆 Processing week completion for leagues with playDay=${yesterdayDayName}...`);

  // Get active leagues where yesterday was their play day
  const leaguesSnap = await db
    .collection("leagues")
    .where("status", "==", "active")
    .where("playDay", "==", yesterdayDayName)
    .get();

  for (const leagueDoc of leaguesSnap.docs) {
    const league = leagueDoc.data();
    const leagueId = leagueDoc.id;
    const leagueName = league.name;
    const currentWeek = league.currentWeek || 1;
    const totalWeeks = league.totalWeeks || league.numberOfWeeks || 12;
    const format = league.format || "stroke"; // "stroke" or "2v2"

    // Purse & elevated context
    const purse = getLeaguePurse(league);
    const elevated = isElevatedWeek(league, currentWeek);
    const weekPrize = calculateWeekPrize(purse, elevated);

    console.log(`🏆 Processing Week ${currentWeek} for ${leagueName} (${format})${elevated ? " 🏅 ELEVATED" : ""}${weekPrize > 0 ? ` 💰 ${formatPrize(weekPrize, purse?.currency)}` : ""}`);

    try {
      // Get all approved scores for this week
      const scoresSnap = await db
        .collection("leagues")
        .doc(leagueId)
        .collection("scores")
        .where("week", "==", currentWeek)
        .where("status", "==", "approved")
        .get();

      if (scoresSnap.empty) {
        console.log(`⚠️ No scores for Week ${currentWeek} in ${leagueName}`);
        continue;
      }

      // Process based on format
      if (format === "2v2") {
        await processWeekComplete2v2(leagueId, leagueName, currentWeek, scoresSnap, league, purse, elevated, weekPrize);
      } else {
        await processWeekCompleteStroke(leagueId, leagueName, currentWeek, scoresSnap, league, purse, elevated, weekPrize);
      }

      // Check if season is complete
      if (currentWeek >= totalWeeks) {
        await completeLeagueSeason(leagueId, leagueName, format, purse);
      } else {
        // Advance to next week and send notifications
        const nextWeek = currentWeek + 1;
        const nextElevated = isElevatedWeek(league, nextWeek);
        const nextWeekPrize = calculateWeekPrize(purse, nextElevated);
        await advanceToNextWeek(leagueId, leagueName, nextWeek, format, league, purse, nextElevated, nextWeekPrize);
      }
    } catch (error) {
      console.error(`🔥 Error processing ${leagueName}:`, error);
    }
  }
}

/**
 * Process stroke play week completion
 * Now includes purse tracking in week_results and notifications
 */
async function processWeekCompleteStroke(
  leagueId: string,
  leagueName: string,
  currentWeek: number,
  scoresSnap: FirebaseFirestore.QuerySnapshot,
  league: FirebaseFirestore.DocumentData,
  purse: PurseData | null,
  isElevated: boolean,
  weekPrize: number
): Promise<void> {
  // Collect and sort scores
  const scores: Array<{
    odtsuserId: string;
    displayName: string;
    avatar?: string;
    netScore: number;
    grossScore: number;
    courseName?: string;
  }> = [];

  scoresSnap.docs.forEach((doc) => {
    const data = doc.data();
    scores.push({
      odtsuserId: data.userId,
      displayName: data.displayName || "Unknown",
      avatar: data.avatar,
      netScore: data.netScore,
      grossScore: data.grossScore,
      courseName: data.courseName,
    });
  });

  // Sort by net score (lowest first)
  scores.sort((a, b) => a.netScore - b.netScore);

  if (scores.length === 0) {
    console.log(`⚠️ No scores to process for Week ${currentWeek}`);
    return;
  }

  const winner = scores[0];

  // Elevated multiplier for points
  const pointsMultiplier = isElevated ? (league.elevatedEvents?.multiplier || 2) : 1;

  // Create week_result document
  await db.collection("leagues").doc(leagueId).collection("week_results").add({
    week: currentWeek,
    userId: winner.odtsuserId,
    displayName: winner.displayName,
    avatar: winner.avatar || null,
    score: winner.netScore,
    courseName: winner.courseName || null,
    format: "stroke",
    isElevated,
    pointsMultiplier,
    prizeAwarded: weekPrize,
    standings: scores.map((s, i) => ({
      placement: i + 1,
      odtsuserId: s.odtsuserId,
      displayName: s.displayName,
      netScore: s.netScore,
    })),
    source: "processor",
    createdAt: Timestamp.now(),
  });

  // Update member standings (with multiplier for elevated weeks)
  await updateStandings(leagueId, scores, currentWeek, pointsMultiplier);

  // Send week complete notifications
  const membersSnap = await db
    .collection("leagues")
    .doc(leagueId)
    .collection("members")
    .where("status", "==", "active")
    .get();

  for (const memberDoc of membersSnap.docs) {
    await createNotificationDocument({
      userId: memberDoc.id,
      type: "league_week_complete",
      actorId: winner.odtsuserId,
      actorName: winner.displayName,
      leagueId,
      leagueName,
      weekNumber: currentWeek,
      message: generateLeagueMessage("league_week_complete", {
        actorName: winner.displayName,
        weekNumber: currentWeek,
        netScore: winner.netScore,
        isElevated,
        prizeAmount: weekPrize,
        currency: purse?.currency,
      }),
    });
  }

  console.log(`✅ Week ${currentWeek} winner: ${winner.displayName} (${winner.netScore} net)${isElevated ? " 🏅" : ""}${weekPrize > 0 ? ` 💰 ${formatPrize(weekPrize, purse?.currency)}` : ""}`);
}

/**
 * Process 2v2 week completion
 * Now includes purse tracking in week_results and notifications
 */
async function processWeekComplete2v2(
  leagueId: string,
  leagueName: string,
  currentWeek: number,
  scoresSnap: FirebaseFirestore.QuerySnapshot,
  league: FirebaseFirestore.DocumentData,
  purse: PurseData | null,
  isElevated: boolean,
  weekPrize: number
): Promise<void> {
  // Get matchups for this week
  const weeklyMatchups = league.weeklyMatchups?.[currentWeek];
  if (!weeklyMatchups || !Array.isArray(weeklyMatchups)) {
    console.log(`⚠️ No matchups found for Week ${currentWeek}`);
    return;
  }

  // Get teams
  const teamsSnap = await db
    .collection("leagues")
    .doc(leagueId)
    .collection("teams")
    .get();

  const teamsMap: Record<string, { name: string; memberIds: string[] }> = {};
  teamsSnap.docs.forEach((doc) => {
    const data = doc.data();
    teamsMap[doc.id] = {
      name: data.name,
      memberIds: data.memberIds || [],
    };
  });

  // Map scores by user
  const scoresByUser: Record<string, number> = {};
  scoresSnap.docs.forEach((doc) => {
    const data = doc.data();
    scoresByUser[data.userId] = data.netScore;
  });

  // Elevated multiplier for points
  const pointsMultiplier = isElevated ? (league.elevatedEvents?.multiplier || 2) : 1;

  // Calculate team scores and matchup results
  const matchupResults: Array<{
    team1Id: string;
    team2Id: string;
    team1Name: string;
    team2Name: string;
    team1Score: number;
    team2Score: number;
    winnerId: string | null;
    winnerName: string | null;
  }> = [];

  for (const matchup of weeklyMatchups) {
    const team1 = teamsMap[matchup.team1Id];
    const team2 = teamsMap[matchup.team2Id];

    if (!team1 || !team2) continue;

    // Calculate combined team scores (lower is better)
    let team1Score = 0;
    let team1Count = 0;
    for (const memberId of team1.memberIds) {
      if (scoresByUser[memberId] !== undefined) {
        team1Score += scoresByUser[memberId];
        team1Count++;
      }
    }

    let team2Score = 0;
    let team2Count = 0;
    for (const memberId of team2.memberIds) {
      if (scoresByUser[memberId] !== undefined) {
        team2Score += scoresByUser[memberId];
        team2Count++;
      }
    }

    // Determine winner (lower combined score wins)
    let winnerId: string | null = null;
    let winnerName: string | null = null;
    if (team1Count > 0 && team2Count > 0) {
      if (team1Score < team2Score) {
        winnerId = matchup.team1Id;
        winnerName = team1.name;
      } else if (team2Score < team1Score) {
        winnerId = matchup.team2Id;
        winnerName = team2.name;
      }
      // null = tie
    }

    matchupResults.push({
      team1Id: matchup.team1Id,
      team2Id: matchup.team2Id,
      team1Name: team1.name,
      team2Name: team2.name,
      team1Score,
      team2Score,
      winnerId,
      winnerName,
    });

    // Update team records (apply multiplier to points for elevated weeks)
    if (winnerId) {
      const loserId = winnerId === matchup.team1Id ? matchup.team2Id : matchup.team1Id;
      const winPoints = (league.pointsPerWin || 3) * pointsMultiplier;

      await db.collection("leagues").doc(leagueId).collection("teams").doc(winnerId).update({
        wins: FieldValue.increment(1),
        points: FieldValue.increment(winPoints),
      });

      await db.collection("leagues").doc(leagueId).collection("teams").doc(loserId).update({
        losses: FieldValue.increment(1),
      });
    } else {
      // Tie - both teams get tie points (with multiplier)
      const tiePoints = (league.pointsPerTie || 1) * pointsMultiplier;

      await db.collection("leagues").doc(leagueId).collection("teams").doc(matchup.team1Id).update({
        ties: FieldValue.increment(1),
        points: FieldValue.increment(tiePoints),
      });
      await db.collection("leagues").doc(leagueId).collection("teams").doc(matchup.team2Id).update({
        ties: FieldValue.increment(1),
        points: FieldValue.increment(tiePoints),
      });
    }
  }

  // Find best performing team this week
  let weekWinner: { teamId: string; teamName: string; score: number } | null = null;
  for (const result of matchupResults) {
    if (result.winnerId) {
      const score = result.winnerId === result.team1Id ? result.team1Score : result.team2Score;
      if (!weekWinner || score < weekWinner.score) {
        weekWinner = {
          teamId: result.winnerId,
          teamName: result.winnerName || "Unknown Team",
          score,
        };
      }
    }
  }

  // Create week_result document
  await db.collection("leagues").doc(leagueId).collection("week_results").add({
    week: currentWeek,
    teamId: weekWinner?.teamId || null,
    teamName: weekWinner?.teamName || null,
    score: weekWinner?.score || null,
    format: "2v2",
    isElevated,
    pointsMultiplier,
    prizeAwarded: weekPrize,
    matchupResults,
    source: "processor",
    createdAt: Timestamp.now(),
  });

  // Send week complete notifications
  const membersSnap = await db
    .collection("leagues")
    .doc(leagueId)
    .collection("members")
    .where("status", "==", "active")
    .get();

  for (const memberDoc of membersSnap.docs) {
    await createNotificationDocument({
      userId: memberDoc.id,
      type: "league_week_complete",
      actorName: weekWinner?.teamName || "A team",
      leagueId,
      leagueName,
      weekNumber: currentWeek,
      teamName: weekWinner?.teamName,
      message: generateLeagueMessage("league_week_complete", {
        actorName: weekWinner?.teamName || "A team",
        weekNumber: currentWeek,
        netScore: weekWinner?.score,
        isElevated,
        prizeAmount: weekPrize,
        currency: purse?.currency,
      }),
    });
  }

  console.log(`✅ Week ${currentWeek} 2v2 results processed${isElevated ? " 🏅" : ""}${weekPrize > 0 ? ` 💰 ${formatPrize(weekPrize, purse?.currency)}` : ""}`);
}

// ============================================================================
// STANDINGS
// ============================================================================

/**
 * Update league standings after week completion
 * Now supports points multiplier for elevated weeks
 */
async function updateStandings(
  leagueId: string,
  scores: Array<{
    odtsuserId: string;
    displayName: string;
    netScore: number;
    grossScore: number;
  }>,
  currentWeek: number,
  pointsMultiplier: number = 1
): Promise<void> {
  // Points system: 1st = N points, 2nd = N-1, etc. (N = number of players)
  // Multiplied by pointsMultiplier for elevated weeks
  const totalPlayers = scores.length;

  for (let i = 0; i < scores.length; i++) {
    const score = scores[i];
    const placement = i + 1;
    const basePoints = Math.max(totalPlayers - i, 1); // At least 1 point for participating
    const points = Math.round(basePoints * pointsMultiplier);
    const isWinner = placement === 1;

    // Update member's stats
    const memberRef = db.collection("leagues").doc(leagueId).collection("members").doc(score.odtsuserId);

    await memberRef.update({
      totalPoints: FieldValue.increment(points),
      roundsPlayed: FieldValue.increment(1),
      totalNetScore: FieldValue.increment(score.netScore),
      totalGrossScore: FieldValue.increment(score.grossScore),
      wins: isWinner ? FieldValue.increment(1) : FieldValue.increment(0),
      lastWeekPlacement: placement,
      [`weeklyResults.week${currentWeek}`]: {
        placement,
        points,
        netScore: score.netScore,
        grossScore: score.grossScore,
      },
    });
  }

  // Update league standings (sorted by total points)
  const membersSnap = await db
    .collection("leagues")
    .doc(leagueId)
    .collection("members")
    .where("status", "==", "active")
    .orderBy("totalPoints", "desc")
    .get();

  // Update position for each member
  let position = 1;
  let lastPoints = -1;
  let lastPosition = 1;

  for (const memberDoc of membersSnap.docs) {
    const memberData = memberDoc.data();
    const currentPoints = memberData.totalPoints || 0;

    // Handle ties (same points = same position)
    if (currentPoints === lastPoints) {
      await memberDoc.ref.update({
        currentPosition: lastPosition,
        previousPosition: memberData.currentPosition || position,
      });
    } else {
      await memberDoc.ref.update({
        currentPosition: position,
        previousPosition: memberData.currentPosition || position,
      });
      lastPosition = position;
    }

    lastPoints = currentPoints;
    position++;
  }

  console.log(`✅ Updated standings for ${membersSnap.size} members (${pointsMultiplier}x points)`);
}

// ============================================================================
// WEEK ADVANCEMENT
// ============================================================================

/**
 * Advance league to next week and send notifications
 * Now includes elevated event preview and purse info
 */
async function advanceToNextWeek(
  leagueId: string,
  leagueName: string,
  nextWeek: number,
  format: string,
  league: FirebaseFirestore.DocumentData,
  purse: PurseData | null,
  nextElevated: boolean,
  nextWeekPrize: number
): Promise<void> {
  // Update league
  await db.collection("leagues").doc(leagueId).update({
    currentWeek: nextWeek,
    _updatedByProcessor: true,
  });

  // Get elevated multiplier string for message
  const multiplierStr = nextElevated
    ? `${league.elevatedEvents?.multiplier || 2}x`
    : "";

  // Get all active members
  const membersSnap = await db
    .collection("leagues")
    .doc(leagueId)
    .collection("members")
    .where("status", "==", "active")
    .get();

  // Send week start notifications
  for (const memberDoc of membersSnap.docs) {
    await createNotificationDocument({
      userId: memberDoc.id,
      type: "league_week_start",
      leagueId,
      leagueName,
      weekNumber: nextWeek,
      message: generateLeagueMessage("league_week_start", {
        leagueName,
        weekNumber: nextWeek,
        isElevated: nextElevated,
        prizeAmount: nextWeekPrize,
        currency: purse?.currency,
        teamName: multiplierStr, // repurposed for multiplier string in message
      }),
    });
  }

  // If 2v2 format, also send matchup notifications
  if (format === "2v2" && league.weeklyMatchups) {
    const currentMatchups = league.weeklyMatchups[nextWeek];
    if (currentMatchups && Array.isArray(currentMatchups)) {
      // Get teams
      const teamsSnap = await db
        .collection("leagues")
        .doc(leagueId)
        .collection("teams")
        .get();

      const teamsMap: Record<string, { name: string; memberIds: string[] }> = {};
      teamsSnap.docs.forEach((doc) => {
        const data = doc.data();
        teamsMap[doc.id] = {
          name: data.name,
          memberIds: data.memberIds || [],
        };
      });

      // Send matchup notifications to each team's members
      for (const matchup of currentMatchups) {
        const team1 = teamsMap[matchup.team1Id];
        const team2 = teamsMap[matchup.team2Id];

        if (team1 && team2) {
          const elevatedTag = nextElevated ? "🏅 " : "";
          const matchupMessage = `${elevatedTag}${team1.name} vs ${team2.name} — Week ${nextWeek} matchup is set! ⚔️`;

          // Notify team1 members
          for (const memberId of team1.memberIds) {
            await createNotificationDocument({
              userId: memberId,
              type: "league_matchup",
              leagueId,
              leagueName,
              teamName: team1.name,
              weekNumber: nextWeek,
              message: matchupMessage,
            });
          }

          // Notify team2 members
          for (const memberId of team2.memberIds) {
            await createNotificationDocument({
              userId: memberId,
              type: "league_matchup",
              leagueId,
              leagueName,
              teamName: team2.name,
              weekNumber: nextWeek,
              message: matchupMessage,
            });
          }
        }
      }
    }
  }

  console.log(`✅ Advanced ${leagueName} to Week ${nextWeek}${nextElevated ? " 🏅 ELEVATED" : ""}`);
}

// ============================================================================
// SEASON COMPLETION
// ============================================================================

/**
 * Complete a league season
 * Now includes championship purse in notification
 */
async function completeLeagueSeason(
  leagueId: string,
  leagueName: string,
  format: string,
  purse: PurseData | null
): Promise<void> {
  console.log(`🏆 Completing season for ${leagueName}`);

  let champion: { id: string; name: string } | null = null;

  if (format === "2v2") {
    // Find team with most points
    const teamsSnap = await db
      .collection("leagues")
      .doc(leagueId)
      .collection("teams")
      .orderBy("points", "desc")
      .limit(1)
      .get();

    if (!teamsSnap.empty) {
      const topTeam = teamsSnap.docs[0];
      champion = {
        id: topTeam.id,
        name: topTeam.data().name,
      };
    }
  } else {
    // Find member with most points
    const membersSnap = await db
      .collection("leagues")
      .doc(leagueId)
      .collection("members")
      .where("status", "==", "active")
      .orderBy("totalPoints", "desc")
      .limit(1)
      .get();

    if (!membersSnap.empty) {
      const topMember = membersSnap.docs[0];
      champion = {
        id: topMember.id,
        name: topMember.data().displayName,
      };
    }
  }

  // Championship purse amount
  const championshipPurse = purse?.seasonPurse || 0;

  // Update league status
  await db.collection("leagues").doc(leagueId).update({
    status: "completed",
    completedAt: Timestamp.now(),
    championId: champion?.id || null,
    championName: champion?.name || null,
    championshipPurse: championshipPurse > 0 ? championshipPurse : null,
    _updatedByProcessor: true,
  });

  // Send season complete notifications
  const membersSnap = await db
    .collection("leagues")
    .doc(leagueId)
    .collection("members")
    .where("status", "==", "active")
    .get();

  for (const memberDoc of membersSnap.docs) {
    await createNotificationDocument({
      userId: memberDoc.id,
      type: "league_season_complete",
      actorId: champion?.id,
      actorName: champion?.name || "The Champion",
      leagueId,
      leagueName,
      message: generateLeagueMessage("league_season_complete", {
        leagueName,
        actorName: champion?.name || "The Champion",
        prizeAmount: championshipPurse,
        currency: purse?.currency,
      }),
    });
  }

  console.log(`✅ Season complete! Champion: ${champion?.name || "Unknown"}${championshipPurse > 0 ? ` 💰 ${formatPrize(championshipPurse, purse?.currency)}` : ""}`);
}