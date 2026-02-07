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
 * IDEMPOTENCY:
 * - Uses `_notifiedStarting` flag to prevent duplicate "starting tomorrow" notifications
 * - Uses `status` check to prevent re-activation of already-active leagues
 * - Each notification type is gated to prevent duplicates on multiple daily runs
 * 
 * Deploy: firebase deploy --only functions:processLeaguesDaily
 */

import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

const db = getFirestore();

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

function isElevatedWeek(league: FirebaseFirestore.DocumentData, week: number): boolean {
  // Support both old nested and new flat structure
  if (league.hasElevatedEvents && Array.isArray(league.elevatedWeeks)) {
    return league.elevatedWeeks.includes(week);
  }
  return (
    league.elevatedEvents?.enabled === true &&
    Array.isArray(league.elevatedEvents?.weeks) &&
    league.elevatedEvents.weeks.includes(week)
  );
}

function getElevatedMultiplier(league: FirebaseFirestore.DocumentData): number {
  // Support both old nested and new flat structure
  if (league.elevatedMultiplier) return league.elevatedMultiplier;
  return league.elevatedEvents?.multiplier || 2;
}

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

function calculateWeekPrize(purse: PurseData | null, isElevated: boolean): number {
  if (!purse) return 0;
  let total = purse.weeklyPurse || 0;
  if (isElevated) {
    total += purse.elevatedPurse || 0;
  }
  return total;
}

function formatPrize(amount: number, currency: string = "USD"): string {
  if (amount <= 0) return "";
  if (currency === "USD") return `$${amount}`;
  return `${amount} ${currency}`;
}

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
        const multiplier = extraData.teamName || "2x";
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
// DATE HELPERS
// ============================================================================

/**
 * Get the start of a day (midnight) in local timezone
 */
function getDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Check if a Firestore Timestamp falls on a specific date (ignoring time)
 */
function isOnDate(timestamp: Timestamp, targetDate: Date): boolean {
  const tsDate = getDateOnly(timestamp.toDate());
  const target = getDateOnly(targetDate);
  return tsDate.getTime() === target.getTime();
}

// ============================================================================
// MAIN SCHEDULED FUNCTION
// ============================================================================

export const processLeaguesDaily = onSchedule(
  {
    schedule: "0 6,12,21 * * *",
    region: "us-central1",
    timeZone: "America/New_York",
  },
  async () => {
    console.log("🔄 Starting daily league processor...");

    const now = new Date();
    const etNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const today = getDateOnly(etNow);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const currentDayName = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][etNow.getDay()];
    const yesterdayDayName = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][yesterday.getDay()];
    const currentHour = etNow.getHours();
    const todayStr = `${etNow.getFullYear()}-${String(etNow.getMonth() + 1).padStart(2, "0")}-${String(etNow.getDate()).padStart(2, "0")}`;

    try {
      // 1. SEASON STARTING TOMORROW (only notify once)
      await processSeasonStartingTomorrow(tomorrow, todayStr);

      // 2. SEASON STARTING TODAY (activate league)
      await processSeasonStartingToday(today, todayStr);

      // 3. SCORE REMINDERS
      await processScoreReminders(currentDayName, currentHour, todayStr);

      // 4. WEEK COMPLETION (only at 6 AM)
      await processWeekCompletion(yesterdayDayName);

      console.log("✅ Daily league processor complete");
    } catch (error) {
      console.error("🔥 Daily league processor failed:", error);
    }
  }
);

// ============================================================================
// SEASON MANAGEMENT
// ============================================================================

async function processSeasonStartingTomorrow(tomorrow: Date, todayStr: string): Promise<void> {
  console.log("📅 Checking for leagues starting tomorrow...");

  // Get upcoming leagues
  const leaguesSnap = await db
    .collection("leagues")
    .where("status", "==", "upcoming")
    .get();

  for (const leagueDoc of leaguesSnap.docs) {
    const league = leagueDoc.data();
    const leagueId = leagueDoc.id;
    const leagueName = league.name;
    const leagueAvatar = league.avatar || undefined; // League avatar for notifications

    // Check if startDate is tomorrow (ignoring time component)
    if (!isOnDate(league.startDate, tomorrow)) continue;

    // IDEMPOTENCY: Check if we already sent this notification
    if (league._notifiedStarting === todayStr) {
      console.log(`⏭️ Already notified for ${leagueName} starting tomorrow`);
      continue;
    }

    console.log(`📅 League starting tomorrow: ${leagueName}`);

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
        actorAvatar: leagueAvatar,
        leagueId,
        leagueName,
        message: generateLeagueMessage("league_season_starting", { leagueName }),
      });
    }

    // Mark as notified to prevent duplicates
    await db.collection("leagues").doc(leagueId).update({
      _notifiedStarting: todayStr,
    });

    console.log(`✅ Sent "starting tomorrow" to ${membersSnap.size} members`);
  }
}

async function processSeasonStartingToday(today: Date, todayStr: string): Promise<void> {
  console.log("🚀 Checking for leagues starting today...");

  // Get upcoming leagues (not already active)
  const leaguesSnap = await db
    .collection("leagues")
    .where("status", "==", "upcoming")
    .get();

  for (const leagueDoc of leaguesSnap.docs) {
    const league = leagueDoc.data();
    const leagueId = leagueDoc.id;
    const leagueName = league.name;
    const leagueAvatar = league.avatar || undefined;

    // Check if startDate is today (ignoring time component)
    if (!isOnDate(league.startDate, today)) continue;

    console.log(`🚀 Activating league: ${leagueName}`);

    // Activate the league (this is idempotent - status check above prevents re-runs)
    await db.collection("leagues").doc(leagueId).update({
      status: "active",
      currentWeek: 1,
      _activatedOn: todayStr,
      _updatedByProcessor: true,
    });

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
        actorAvatar: leagueAvatar,
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

async function processScoreReminders(currentDayName: string, currentHour: number, todayStr: string): Promise<void> {
  console.log(`⏰ Checking score reminders for ${currentDayName}...`);

  const leaguesSnap = await db
    .collection("leagues")
    .where("status", "==", "active")
    .where("playDay", "==", currentDayName)
    .get();

  for (const leagueDoc of leaguesSnap.docs) {
    const league = leagueDoc.data();
    const leagueId = leagueDoc.id;
    const leagueName = league.name;
    const leagueAvatar = league.avatar || undefined;
    const teeTime = league.teeTime;
    const holes = league.holes || league.holesPerRound || 18;
    const currentWeek = league.currentWeek || 1;

    if (!teeTime) continue;

    const [teeHour] = teeTime.split(":").map(Number);
    const reminderOffset = holes === 9 ? 4 : 6;
    const reminderHour = teeHour + reminderOffset;

    if (Math.abs(currentHour - reminderHour) > 1) continue;

    // IDEMPOTENCY: Check if we already sent reminders today for this week
    const reminderKey = `${todayStr}-week${currentWeek}`;
    if (league._lastScoreReminder === reminderKey) {
      console.log(`⏭️ Already sent reminders for ${leagueName} Week ${currentWeek} today`);
      continue;
    }

    console.log(`⏰ Processing reminders for ${leagueName} (Week ${currentWeek})`);

    const elevated = isElevatedWeek(league, currentWeek);

    const membersSnap = await db
      .collection("leagues")
      .doc(leagueId)
      .collection("members")
      .where("status", "==", "active")
      .get();

    const scoresSnap = await db
      .collection("leagues")
      .doc(leagueId)
      .collection("scores")
      .where("week", "==", currentWeek)
      .where("status", "in", ["approved", "pending"])
      .get();

    const scoredUserIds = new Set(scoresSnap.docs.map((doc) => doc.data().userId));

    let reminderCount = 0;
    for (const memberDoc of membersSnap.docs) {
      const memberId = memberDoc.id;
      if (scoredUserIds.has(memberId)) continue;

      await createNotificationDocument({
        userId: memberId,
        type: "league_score_reminder",
        actorAvatar: leagueAvatar,
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

    // Mark reminders as sent
    await db.collection("leagues").doc(leagueId).update({
      _lastScoreReminder: reminderKey,
    });

    console.log(`✅ Sent ${reminderCount} score reminders for ${leagueName}${elevated ? " (🏅 Elevated)" : ""}`);
  }
}

// ============================================================================
// WEEK COMPLETION
// ============================================================================

async function processWeekCompletion(yesterdayDayName: string): Promise<void> {
  console.log(`🏆 Processing week completion for leagues with playDay=${yesterdayDayName}...`);

  const leaguesSnap = await db
    .collection("leagues")
    .where("status", "==", "active")
    .where("playDay", "==", yesterdayDayName)
    .get();

  for (const leagueDoc of leaguesSnap.docs) {
    const league = leagueDoc.data();
    const leagueId = leagueDoc.id;
    const leagueName = league.name;
    const leagueAvatar = league.avatar || undefined;
    const currentWeek = league.currentWeek || 1;
    const totalWeeks = league.totalWeeks || league.numberOfWeeks || 12;
    const format = league.format || "stroke";

    // IDEMPOTENCY: Check if we already processed this week
    if (league._lastProcessedWeek === currentWeek) {
      console.log(`⏭️ Already processed Week ${currentWeek} for ${leagueName}`);
      continue;
    }

    const purse = getLeaguePurse(league);
    const elevated = isElevatedWeek(league, currentWeek);
    const weekPrize = calculateWeekPrize(purse, elevated);

    console.log(`🏆 Processing Week ${currentWeek} for ${leagueName} (${format})${elevated ? " 🏅 ELEVATED" : ""}${weekPrize > 0 ? ` 💰 ${formatPrize(weekPrize, purse?.currency)}` : ""}`);

    try {
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

      if (format === "2v2") {
        await processWeekComplete2v2(leagueId, leagueName, leagueAvatar, currentWeek, scoresSnap, league, purse, elevated, weekPrize);
      } else {
        await processWeekCompleteStroke(leagueId, leagueName, leagueAvatar, currentWeek, scoresSnap, league, purse, elevated, weekPrize);
      }

      // Mark week as processed
      await db.collection("leagues").doc(leagueId).update({
        _lastProcessedWeek: currentWeek,
      });

      if (currentWeek >= totalWeeks) {
        await completeLeagueSeason(leagueId, leagueName, leagueAvatar, format, purse);
      } else {
        const nextWeek = currentWeek + 1;
        const nextElevated = isElevatedWeek(league, nextWeek);
        const nextWeekPrize = calculateWeekPrize(purse, nextElevated);
        await advanceToNextWeek(leagueId, leagueName, leagueAvatar, nextWeek, format, league, purse, nextElevated, nextWeekPrize);
      }
    } catch (error) {
      console.error(`🔥 Error processing ${leagueName}:`, error);
    }
  }
}

async function processWeekCompleteStroke(
  leagueId: string,
  leagueName: string,
  leagueAvatar: string | undefined,
  currentWeek: number,
  scoresSnap: FirebaseFirestore.QuerySnapshot,
  league: FirebaseFirestore.DocumentData,
  purse: PurseData | null,
  isElevated: boolean,
  weekPrize: number
): Promise<void> {
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

  scores.sort((a, b) => a.netScore - b.netScore);

  if (scores.length === 0) {
    console.log(`⚠️ No scores to process for Week ${currentWeek}`);
    return;
  }

  const winner = scores[0];
  const pointsMultiplier = isElevated ? getElevatedMultiplier(league) : 1;

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

  await updateStandings(leagueId, scores, currentWeek, pointsMultiplier);

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
      actorAvatar: winner.avatar || leagueAvatar,
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

async function processWeekComplete2v2(
  leagueId: string,
  leagueName: string,
  leagueAvatar: string | undefined,
  currentWeek: number,
  scoresSnap: FirebaseFirestore.QuerySnapshot,
  league: FirebaseFirestore.DocumentData,
  purse: PurseData | null,
  isElevated: boolean,
  weekPrize: number
): Promise<void> {
  const weeklyMatchups = league.weeklyMatchups?.[currentWeek];
  if (!weeklyMatchups || !Array.isArray(weeklyMatchups)) {
    console.log(`⚠️ No matchups found for Week ${currentWeek}`);
    return;
  }

  const teamsSnap = await db.collection("leagues").doc(leagueId).collection("teams").get();
  const teamsMap: Record<string, { name: string; memberIds: string[] }> = {};
  teamsSnap.docs.forEach((doc) => {
    const data = doc.data();
    teamsMap[doc.id] = { name: data.name, memberIds: data.memberIds || [] };
  });

  const scoresByUser: Record<string, number> = {};
  scoresSnap.docs.forEach((doc) => {
    const data = doc.data();
    scoresByUser[data.userId] = data.netScore;
  });

  const pointsMultiplier = isElevated ? getElevatedMultiplier(league) : 1;

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

    let team1Score = 0, team1Count = 0;
    for (const memberId of team1.memberIds) {
      if (scoresByUser[memberId] !== undefined) {
        team1Score += scoresByUser[memberId];
        team1Count++;
      }
    }

    let team2Score = 0, team2Count = 0;
    for (const memberId of team2.memberIds) {
      if (scoresByUser[memberId] !== undefined) {
        team2Score += scoresByUser[memberId];
        team2Count++;
      }
    }

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

  let weekWinner: { teamId: string; teamName: string; score: number } | null = null;
  for (const result of matchupResults) {
    if (result.winnerId) {
      const score = result.winnerId === result.team1Id ? result.team1Score : result.team2Score;
      if (!weekWinner || score < weekWinner.score) {
        weekWinner = { teamId: result.winnerId, teamName: result.winnerName || "Unknown Team", score };
      }
    }
  }

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
      actorAvatar: leagueAvatar,
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
  const totalPlayers = scores.length;

  for (let i = 0; i < scores.length; i++) {
    const score = scores[i];
    const placement = i + 1;
    const basePoints = Math.max(totalPlayers - i, 1);
    const points = Math.round(basePoints * pointsMultiplier);
    const isWinner = placement === 1;

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

  const membersSnap = await db
    .collection("leagues")
    .doc(leagueId)
    .collection("members")
    .where("status", "==", "active")
    .orderBy("totalPoints", "desc")
    .get();

  let position = 1;
  let lastPoints = -1;
  let lastPosition = 1;

  for (const memberDoc of membersSnap.docs) {
    const memberData = memberDoc.data();
    const currentPoints = memberData.totalPoints || 0;

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

async function advanceToNextWeek(
  leagueId: string,
  leagueName: string,
  leagueAvatar: string | undefined,
  nextWeek: number,
  format: string,
  league: FirebaseFirestore.DocumentData,
  purse: PurseData | null,
  nextElevated: boolean,
  nextWeekPrize: number
): Promise<void> {
  await db.collection("leagues").doc(leagueId).update({
    currentWeek: nextWeek,
    _updatedByProcessor: true,
  });

  const multiplierStr = nextElevated ? `${getElevatedMultiplier(league)}x` : "";

  const membersSnap = await db
    .collection("leagues")
    .doc(leagueId)
    .collection("members")
    .where("status", "==", "active")
    .get();

  for (const memberDoc of membersSnap.docs) {
    await createNotificationDocument({
      userId: memberDoc.id,
      type: "league_week_start",
      actorAvatar: leagueAvatar,
      leagueId,
      leagueName,
      weekNumber: nextWeek,
      message: generateLeagueMessage("league_week_start", {
        leagueName,
        weekNumber: nextWeek,
        isElevated: nextElevated,
        prizeAmount: nextWeekPrize,
        currency: purse?.currency,
        teamName: multiplierStr,
      }),
    });
  }

  if (format === "2v2" && league.weeklyMatchups) {
    const currentMatchups = league.weeklyMatchups[nextWeek];
    if (currentMatchups && Array.isArray(currentMatchups)) {
      const teamsSnap = await db.collection("leagues").doc(leagueId).collection("teams").get();
      const teamsMap: Record<string, { name: string; memberIds: string[] }> = {};
      teamsSnap.docs.forEach((doc) => {
        const data = doc.data();
        teamsMap[doc.id] = { name: data.name, memberIds: data.memberIds || [] };
      });

      for (const matchup of currentMatchups) {
        const team1 = teamsMap[matchup.team1Id];
        const team2 = teamsMap[matchup.team2Id];

        if (team1 && team2) {
          const elevatedTag = nextElevated ? "🏅 " : "";
          const matchupMessage = `${elevatedTag}${team1.name} vs ${team2.name} — Week ${nextWeek} matchup is set! ⚔️`;

          for (const memberId of team1.memberIds) {
            await createNotificationDocument({
              userId: memberId,
              type: "league_matchup",
              actorAvatar: leagueAvatar,
              leagueId,
              leagueName,
              teamName: team1.name,
              weekNumber: nextWeek,
              message: matchupMessage,
            });
          }

          for (const memberId of team2.memberIds) {
            await createNotificationDocument({
              userId: memberId,
              type: "league_matchup",
              actorAvatar: leagueAvatar,
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

async function completeLeagueSeason(
  leagueId: string,
  leagueName: string,
  leagueAvatar: string | undefined,
  format: string,
  purse: PurseData | null
): Promise<void> {
  console.log(`🏆 Completing season for ${leagueName}`);

  let champion: { id: string; name: string } | null = null;

  if (format === "2v2") {
    const teamsSnap = await db
      .collection("leagues")
      .doc(leagueId)
      .collection("teams")
      .orderBy("points", "desc")
      .limit(1)
      .get();

    if (!teamsSnap.empty) {
      const topTeam = teamsSnap.docs[0];
      champion = { id: topTeam.id, name: topTeam.data().name };
    }
  } else {
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
      champion = { id: topMember.id, name: topMember.data().displayName };
    }
  }

  const championshipPurse = purse?.seasonPurse || 0;

  await db.collection("leagues").doc(leagueId).update({
    status: "completed",
    completedAt: Timestamp.now(),
    championId: champion?.id || null,
    championName: champion?.name || null,
    championshipPurse: championshipPurse > 0 ? championshipPurse : null,
    _updatedByProcessor: true,
  });

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
      actorAvatar: leagueAvatar,
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