/**
 * Feed Insert Provider
 *
 * Fetches and assembles feed insert data for the clubhouse.
 * Called once during feed load, returns an array of FeedInsert items
 * that the clubhouse interleaves between regular posts.
 *
 * Data sources:
 * - rounds collection (live on course insert — slot 0)
 * - challenges collection (discovery + activity)
 * - leagues collection (discovery)
 * - users/{id}/courses (discovery)
 * - feedActivity collection (activity cards — written by Cloud Functions)
 * - holeInOnes collection (standalone HIO card)
 * - scores collection (course player discovery — "Playing Your Courses")
 *
 * Dismiss state stored in AsyncStorage. Dismissed carousels hidden for
 * the session (discovery) or day (activity).
 *
 * Live on Course is never user-dismissable and always occupies index 0
 * when present. When no qualifying rounds are live it is omitted
 * entirely — the feed starts at index 0 with the first regular post.
 */

import { CHALLENGES } from "@/constants/challengeTypes";
import { db } from "@/constants/firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import {
  activityDismissKey,
  ActivityItem,
  DiscoveryChallengeItem,
  DiscoveryCourseItem,
  DiscoveryCoursePlayerItem,
  discoveryDismissKey,
  DiscoveryDTPItem,
  DiscoveryInsert,
  DiscoveryLeagueItem,
  DiscoveryPartnerItem,
  DiscoveryRivalryNudgeItem,
  FeedInsert,
  hioDismissKey,
  HoleInOneInsert,
  LiveOnCourseInsert,
  LiveOnCoursePlayer,
} from "./feedInsertTypes";

// ============================================================================
// MAIN PROVIDER
// ============================================================================

interface ProviderContext {
  userId: string;
  regionKey: string;
  partnerIds: string[];
  activeChallenges: string[];
  earnedChallengeBadges: string[];
  leagueIds: string[]; // populated from user doc (synced by Cloud Function)
  playerCourses: number[]; // courses the user has marked as a player of
}

export async function fetchFeedInserts(
  ctx: ProviderContext
): Promise<FeedInsert[]> {
  const inserts: FeedInsert[] = [];

  try {
    const [
      liveOnCourse,
      challengeDiscovery,
      leagueDiscovery,
      courseDiscovery,
      partnerDiscovery,
      dtpDiscovery,
      rivalryNudgeDiscovery,
      coursePlayerDiscovery,
      activityItems,
      hioInsert,
    ] = await Promise.all([
      fetchLiveOnCourse(ctx),
      fetchChallengeDiscovery(ctx),
      fetchLeagueDiscovery(ctx),
      fetchCourseDiscovery(ctx),
      fetchPartnerDiscovery(ctx),
      fetchDTPDiscovery(ctx),
      fetchRivalryNudges(ctx),
      fetchCoursePlayerDiscovery(ctx),
      fetchActivityItems(ctx),
      fetchHoleInOne(ctx),
    ]);

    // ── Slot 0: Live on Course (never dismissed, omitted if empty) ──────────
    if (liveOnCourse) {
      inserts.push(liveOnCourse);
    }

    const dismissedKeys = await getDismissedKeys();

    if (challengeDiscovery && !dismissedKeys.has(challengeDiscovery.dismissKey))
      inserts.push(challengeDiscovery);
    if (leagueDiscovery && !dismissedKeys.has(leagueDiscovery.dismissKey))
      inserts.push(leagueDiscovery);
    if (courseDiscovery && !dismissedKeys.has(courseDiscovery.dismissKey))
      inserts.push(courseDiscovery);
    if (partnerDiscovery && !dismissedKeys.has(partnerDiscovery.dismissKey))
      inserts.push(partnerDiscovery);
    if (dtpDiscovery && !dismissedKeys.has(dtpDiscovery.dismissKey))
      inserts.push(dtpDiscovery);
    if (rivalryNudgeDiscovery && !dismissedKeys.has(rivalryNudgeDiscovery.dismissKey))
      inserts.push(rivalryNudgeDiscovery);

    // ✅ Players scoring at the user's player courses
    if (coursePlayerDiscovery && !dismissedKeys.has(coursePlayerDiscovery.dismissKey))
      inserts.push(coursePlayerDiscovery);

    if (activityItems.length > 0) {
      const actKey = activityDismissKey();
      if (!dismissedKeys.has(actKey)) {
        inserts.push({
          type: "activity",
          title: "From the Field",
          items: activityItems,
          dismissKey: actKey,
        });
      }
    }

    if (hioInsert && !dismissedKeys.has(hioInsert.dismissKey))
      inserts.push(hioInsert);

  } catch (err) {
    console.error("⚠️ Feed insert provider error:", err);
  }

  return inserts;
}

// ============================================================================
// LIVE ON COURSE
// ============================================================================

/**
 * Fetches active on-premise rounds visible to this user.
 *
 * Firestore query: public + partners rounds in the user's region,
 * ordered by most recently started, limit 20.
 *
 * Client-side filter: keep public rounds freely; keep partners rounds
 * only if ctx.partnerIds includes the round's markerId. Take the first
 * 3 after filtering.
 *
 * Returns null (insert omitted) when 0 qualifying rounds remain.
 *
 * Note: the regionKey filter only covers public rounds reliably.
 * Partners-only rounds from outside the region are handled via the
 * partnerIds[] array written onto the round doc at creation — the
 * client-side filter above catches them regardless of regionKey.
 */
async function fetchLiveOnCourse(
  ctx: ProviderContext
): Promise<LiveOnCourseInsert | null> {
  try {
    if (!ctx.regionKey) return null;

    const snap = await getDocs(
      query(
        collection(db, "rounds"),
        where("status", "==", "live"),
        where("roundType", "==", "on_premise"),
        where("privacy", "in", ["public", "partners"]),
        where("regionKey", "==", ctx.regionKey),
        orderBy("startedAt", "desc"),
        limit(20)
      )
    );

    if (snap.empty) return null;

    const players: LiveOnCoursePlayer[] = [];

    snap.forEach((d) => {
      if (players.length >= 3) return;

      const data = d.data();

      // Skip the user's own active round — they're in it, not watching it
      if (data.markerId === ctx.userId) return;

      // Privacy gate: partners-only rounds only visible to the marker's partners
      if (data.privacy === "partners" && !ctx.partnerIds.includes(data.markerId)) {
        return;
      }

      // Find the marker entry in the players array
      const markerEntry = (data.players as any[])?.find(
        (p) => p.isMarker === true || p.playerId === data.markerId
      );
      if (!markerEntry) return;

      const scoreToPar =
        data.liveScores?.[data.markerId]?.scoreToPar ?? 0;

      players.push({
        userId: data.markerId,
        displayName: markerEntry.displayName || "Unknown",
        avatar: markerEntry.avatar || null,
        courseName: data.courseName || "Unknown Course",
        currentHole: data.currentHole || 1,
        scoreToPar,
        roundId: d.id,
      });
    });

    if (players.length === 0) return null;

    return {
      type: "live_on_course",
      players,
    };
  } catch (err) {
    console.error("Live on course fetch failed:", err);
    return null;
  }
}

// ============================================================================
// DISCOVERY: CHALLENGES FOR YOU
// ============================================================================

async function fetchChallengeDiscovery(
  ctx: ProviderContext
): Promise<DiscoveryInsert | null> {
  try {
    const unregistered = CHALLENGES.filter(
      (c) =>
        !ctx.activeChallenges.includes(c.id) &&
        !ctx.earnedChallengeBadges.includes(c.id)
    );
    if (unregistered.length === 0) return null;

    const challengeDocsSnap = await getDocs(collection(db, "challenges"));
    const earnedCounts: Record<string, number> = {};
    challengeDocsSnap.forEach((d) => {
      earnedCounts[d.id] = d.data().earnedCount ?? 0;
    });

    const items: DiscoveryChallengeItem[] = unregistered
      .map((c) => ({
        id: c.id,
        name: c.name,
        earnedCount: earnedCounts[c.id] ?? 0,
      }))
      .slice(0, 3); // ← capped at 3

    return {
      type: "discovery",
      subtype: "challenges",
      title: "Challenges for You",
      items,
      dismissKey: discoveryDismissKey("challenges"),
    };
  } catch (err) {
    console.error("Challenge discovery fetch failed:", err);
    return null;
  }
}

// ============================================================================
// DISCOVERY: OPEN LEAGUES NEAR YOU
// ============================================================================

async function fetchLeagueDiscovery(
  ctx: ProviderContext
): Promise<DiscoveryInsert | null> {
  try {
    const snap = await getDocs(
      query(
        collection(db, "leagues"),
        where("regionKey", "==", ctx.regionKey),
        where("status", "==", "active"),
        limit(6)
      )
    );
    if (snap.empty) return null;

    const items: DiscoveryLeagueItem[] = [];
    snap.forEach((d) => {
      if (ctx.leagueIds.includes(d.id)) return;
      const data = d.data();
      items.push({
        id: d.id,
        name: data.name || "Unnamed League",
        avatar: data.avatar || null,
        format: data.format || "stroke",
        holes: data.holes || 18,
        frequency: data.frequency || "weekly",
        memberCount: data.memberCount || 0,
      });
    });

    if (items.length === 0) return null;
    return {
      type: "discovery",
      subtype: "leagues",
      title: "Open Leagues Near You",
      items: items.slice(0, 3), // ← capped at 3
      dismissKey: discoveryDismissKey("leagues"),
    };
  } catch (err) {
    console.error("League discovery fetch failed:", err);
    return null;
  }
}

// ============================================================================
// DISCOVERY: DTP PINS TO CLAIM
// ============================================================================

async function fetchDTPDiscovery(
  ctx: ProviderContext
): Promise<DiscoveryInsert | null> {
  try {
    const snap = await getDocs(
      query(collection(db, "challenges", "dtp", "courses"), limit(10))
    );
    if (snap.empty) return null;

    const items: DiscoveryDTPItem[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.currentHolderId === ctx.userId) return;
      items.push({
        courseId: d.id,
        courseName: data.courseName || "Unknown Course",
        designatedHole: data.designatedHole,
        currentDistance: data.currentDistance,
        currentHolderName: data.currentHolderName,
        status: data.currentHolderId ? "beatable" : "unclaimed",
      });
    });

    if (items.length === 0) return null;
    return {
      type: "discovery",
      subtype: "dtp_pins",
      title: "Pins Up for Grabs",
      items: items.slice(0, 3), // ← capped at 3
      dismissKey: discoveryDismissKey("dtp_pins"),
    };
  } catch (err) {
    console.error("DTP discovery fetch failed:", err);
    return null;
  }
}

// ============================================================================
// DISCOVERY: COURSES NEAR YOU
// ============================================================================

async function fetchCourseDiscovery(
  ctx: ProviderContext
): Promise<DiscoveryInsert | null> {
  try {
    if (!ctx.regionKey) return null;

    const playedSnap = await getDocs(
      query(
        collection(db, "leaderboards"),
        where("regionKey", "==", ctx.regionKey),
        where("userId", "==", ctx.userId)
      )
    );
    const playedCourseIds = new Set<string>();
    playedSnap.forEach((d) => {
      const courseId = d.data().courseId;
      if (courseId) playedCourseIds.add(String(courseId));
    });

    const regionalSnap = await getDocs(
      query(
        collection(db, "leaderboards"),
        where("regionKey", "==", ctx.regionKey),
        limit(50)
      )
    );

    const courseMap = new Map<string, { name: string; roundCount: number }>();
    regionalSnap.forEach((d) => {
      const data = d.data();
      const courseId = String(data.courseId);
      if (playedCourseIds.has(courseId)) return;
      const existing = courseMap.get(courseId);
      if (existing) {
        existing.roundCount++;
      } else {
        courseMap.set(courseId, {
          name: data.courseName || "Unknown Course",
          roundCount: 1,
        });
      }
    });

    if (courseMap.size === 0) return null;

    const items: DiscoveryCourseItem[] = Array.from(courseMap.entries())
      .sort((a, b) => b[1].roundCount - a[1].roundCount)
      .slice(0, 3) // ← capped at 3
      .map(([courseId, info]) => ({
        courseId,
        name: info.name,
        roundsPosted: info.roundCount,
      }));

    return {
      type: "discovery",
      subtype: "courses",
      title: "Courses Near You",
      items,
      dismissKey: discoveryDismissKey("courses"),
    };
  } catch (err) {
    console.error("Course discovery fetch failed:", err);
    return null;
  }
}

// ============================================================================
// DISCOVERY: GOLFERS YOU MAY KNOW
// ============================================================================

async function fetchPartnerDiscovery(
  ctx: ProviderContext
): Promise<DiscoveryInsert | null> {
  try {
    if (!ctx.regionKey) return null;

    const excludeIds = new Set([ctx.userId, ...ctx.partnerIds]);
    const candidates = new Map<string, DiscoveryPartnerItem>();

    const regionalSnap = await getDocs(
      query(
        collection(db, "users"),
        where("regionKey", "==", ctx.regionKey),
        limit(30)
      )
    );
    regionalSnap.forEach((d) => {
      if (excludeIds.has(d.id)) return;
      const data = d.data();
      if (!data.displayName) return;
      candidates.set(d.id, {
        userId: d.id,
        displayName: data.displayName,
        avatar: data.avatar || null,
        context: "Golfer in your area",
      });
    });

    const playedSnap = await getDocs(
      query(
        collection(db, "leaderboards"),
        where("userId", "==", ctx.userId),
        limit(10)
      )
    );
    const playedCourseIds: string[] = [];
    const courseNameMap = new Map<string, string>();
    playedSnap.forEach((d) => {
      const data = d.data();
      const cid = String(data.courseId);
      if (!playedCourseIds.includes(cid)) {
        playedCourseIds.push(cid);
        courseNameMap.set(cid, data.courseName || "a course");
      }
    });

    for (const courseId of playedCourseIds.slice(0, 3)) {
      const courseSnap = await getDocs(
        query(
          collection(db, "leaderboards"),
          where("courseId", "==", Number(courseId)),
          limit(10)
        )
      );
      courseSnap.forEach((d) => {
        const data = d.data();
        const uid = data.userId;
        if (!uid || excludeIds.has(uid) || candidates.has(uid)) return;
        candidates.set(uid, {
          userId: uid,
          displayName: data.displayName || "Golfer",
          avatar: data.avatar || null,
          context: `Plays at ${courseNameMap.get(courseId) || "a course you play"}`,
        });
      });
    }

    if (candidates.size === 0) return null;

    const items = Array.from(candidates.values())
      .sort(
        (a, b) =>
          (a.context.startsWith("Plays at") ? 0 : 1) -
          (b.context.startsWith("Plays at") ? 0 : 1)
      )
      .slice(0, 3); // ← capped at 3

    return {
      type: "discovery",
      subtype: "partners",
      title: "Potential Partners",
      items,
      dismissKey: discoveryDismissKey("partners"),
    };
  } catch (err) {
    console.error("Partner discovery fetch failed:", err);
    return null;
  }
}

// ============================================================================
// DISCOVERY: RIVALRY NUDGES
// ============================================================================

async function fetchRivalryNudges(
  ctx: ProviderContext
): Promise<DiscoveryInsert | null> {
  try {
    const snap = await getDocs(
      query(
        collection(db, "rivalries"),
        where("playerIds", "array-contains", ctx.userId)
      )
    );
    if (snap.empty) return null;

    const nudges: DiscoveryRivalryNudgeItem[] = [];

    snap.forEach((d) => {
      const data = d.data();
      const isPlayerA = data.playerA?.userId === ctx.userId;
      const rival = isPlayerA ? data.playerB : data.playerA;
      const myWins = isPlayerA
        ? data.record?.wins || 0
        : data.record?.losses || 0;
      const theirWins = isPlayerA
        ? data.record?.losses || 0
        : data.record?.wins || 0;
      const margin = myWins - theirWins;

      if (margin === 1)
        nudges.push({ id: `nudge_tie_${d.id}`, rivalryId: d.id, rivalUserId: rival.userId, rivalName: rival.displayName, rivalAvatar: rival.avatar || null, message: `${rival.displayName.split(" ")[0]} can tie you next round`, emoji: "⚠️" });
      if (margin === -1)
        nudges.push({ id: `nudge_catch_${d.id}`, rivalryId: d.id, rivalUserId: rival.userId, rivalName: rival.displayName, rivalAvatar: rival.avatar || null, message: `One win ties it with ${rival.displayName.split(" ")[0]}`, emoji: "💪" });
      if (data.currentStreak && data.currentStreak.playerId !== ctx.userId && data.currentStreak.count >= 3)
        nudges.push({ id: `nudge_streak_${d.id}`, rivalryId: d.id, rivalUserId: rival.userId, rivalName: rival.displayName, rivalAvatar: rival.avatar || null, message: `${rival.displayName.split(" ")[0]} has won ${data.currentStreak.count} straight`, emoji: "😤" });
      if (data.beltHolder === ctx.userId)
        nudges.push({ id: `nudge_belt_${d.id}`, rivalryId: d.id, rivalUserId: rival.userId, rivalName: rival.displayName, rivalAvatar: rival.avatar || null, message: `Defend your belt vs ${rival.displayName.split(" ")[0]}`, emoji: "🏅" });
      if (data.beltHolder && data.beltHolder === rival.userId)
        nudges.push({ id: `nudge_belt_take_${d.id}`, rivalryId: d.id, rivalUserId: rival.userId, rivalName: rival.displayName, rivalAvatar: rival.avatar || null, message: `Take the belt from ${rival.displayName.split(" ")[0]}`, emoji: "🥊" });
    });

    if (nudges.length === 0) return null;
    return {
      type: "discovery",
      subtype: "rivalry_nudges",
      title: "Rivalry Watch",
      items: nudges.slice(0, 3), // ← capped at 3
      dismissKey: discoveryDismissKey("rivalry_nudges"),
    };
  } catch (err) {
    console.error("Rivalry nudge fetch failed:", err);
    return null;
  }
}

// ============================================================================
// DISCOVERY: PLAYERS AT YOUR COURSES
// ============================================================================

/**
 * Shows other golfers who have recently scored at courses the user is a
 * player of. Excludes self and existing partners so it surfaces genuine
 * new connections rather than duplicating the partner feed.
 */
async function fetchCoursePlayerDiscovery(
  ctx: ProviderContext
): Promise<DiscoveryInsert | null> {
  try {
    if (!ctx.playerCourses || ctx.playerCourses.length === 0) return null;

    // Cap at 10 — Firestore "in" query limit
    const coursesToFetch = ctx.playerCourses.slice(0, 10);
    const excludeIds = new Set([ctx.userId, ...ctx.partnerIds]);

    const scoresSnap = await getDocs(
      query(
        collection(db, "scores"),
        where("courseId", "in", coursesToFetch),
        orderBy("createdAt", "desc"),
        limit(40)
      )
    );

    if (scoresSnap.empty) return null;

    // One card per unique user — most recent score wins
    const seen = new Map<string, DiscoveryCoursePlayerItem>();

    scoresSnap.forEach((d) => {
      const data = d.data();
      const uid = data.userId;
      if (!uid || excludeIds.has(uid) || seen.has(uid)) return;
      if (!data.displayName && !data.userName) return;

      seen.set(uid, {
        userId: uid,
        displayName: data.displayName || data.userName || "Golfer",
        avatar: data.userAvatar || data.avatar || null,
        courseName: data.courseName || "your course",
        netScore: data.netScore,
        grossScore: data.grossScore,
      });
    });

    if (seen.size === 0) return null;

    return {
      type: "discovery",
      subtype: "course_players",
      title: "Playing Your Courses",
      items: Array.from(seen.values()).slice(0, 3), // ← capped at 3
      dismissKey: discoveryDismissKey("course_players"),
    };
  } catch (err) {
    console.error("Course player discovery fetch failed:", err);
    return null;
  }
}

// ============================================================================
// ACTIVITY: "FROM THE FIELD" ITEMS
// ============================================================================

async function fetchActivityItems(ctx: ProviderContext): Promise<ActivityItem[]> {
  const items: ActivityItem[] = [];

  try {
    const sevenDaysAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const snap = await getDocs(
      query(
        collection(db, "feedActivity"),
        where("regionKey", "==", ctx.regionKey),
        where("createdAt", ">=", sevenDaysAgo),
        orderBy("createdAt", "desc"),
        limit(20)
      )
    );

    snap.forEach((d) => {
      const data = d.data();
      if (!shouldShowActivity(data, ctx)) return;

      const baseItem = {
        id: d.id,
        timestamp: data.createdAt?.toMillis?.() || Date.now(),
      };

      switch (data.activityType) {
        case "badge_earned":
          items.push({ ...baseItem, activityType: "badge_earned", userId: data.userId, displayName: data.displayName, avatar: data.avatar, badgeId: data.badgeId, badgeName: data.badgeName });
          break;
        case "dtp_claimed":
          items.push({ ...baseItem, activityType: "dtp_claimed", userId: data.userId, displayName: data.displayName, avatar: data.avatar, courseName: data.courseName, hole: data.hole, distance: data.distance });
          break;
        case "joined_league":
          items.push({ ...baseItem, activityType: "joined_league", userId: data.userId, displayName: data.displayName, avatar: data.avatar, leagueId: data.leagueId, leagueName: data.leagueName, leagueAvatar: data.leagueAvatar });
          break;
        case "low_round":
          items.push({ ...baseItem, activityType: "low_round", userId: data.userId, displayName: data.displayName, avatar: data.avatar, score: data.score, courseName: data.courseName, scorePostId: data.scorePostId });
          break;
        case "low_leader_change":
          items.push({ ...baseItem, activityType: "low_leader_change", userId: data.userId, displayName: data.displayName, avatar: data.avatar, courseName: data.courseName, score: data.score });
          break;
        case "scratch_earned":
          items.push({ ...baseItem, activityType: "scratch_earned", userId: data.userId, displayName: data.displayName, avatar: data.avatar, courseNames: data.courseNames || [] });
          break;
        case "ace_tier_earned":
          items.push({ ...baseItem, activityType: "ace_tier_earned", userId: data.userId, displayName: data.displayName, avatar: data.avatar, courseNames: data.courseNames || [] });
          break;
        case "league_result":
          items.push({ ...baseItem, activityType: "league_result", leagueId: data.leagueId, leagueName: data.leagueName, leagueAvatar: data.leagueAvatar, week: data.week, winnerName: data.winnerName, winnerScore: data.winnerScore });
          break;
        case "round_complete":
          items.push({ ...baseItem, activityType: "round_complete", userId: data.userId, displayName: data.displayName, avatar: data.avatar, roundId: data.roundId, courseId: data.courseId, courseName: data.courseName, holeCount: data.holeCount, formatId: data.formatId, playerCount: data.playerCount, isSimulator: data.isSimulator || false, playerSummaries: data.playerSummaries || [], winnerName: data.winnerName || null, roundDescription: data.roundDescription || null, roundImageUrl: data.roundImageUrl || null });
          break;
        case "rivalry_update":
          items.push({ ...baseItem, activityType: "rivalry_update", userId: data.userId, displayName: data.displayName, avatar: data.avatar || null, rivalryId: data.rivalryId, changeType: data.changeType, message: data.message, playerA: data.playerA, playerB: data.playerB, record: data.record, courseId: data.courseId, courseName: data.courseName, roundId: data.roundId || null, outingId: data.outingId || null });
          break;
        case "outing_complete":
          items.push({ ...baseItem, activityType: "outing_complete", userId: data.userId, displayName: data.displayName, avatar: data.avatar || null, outingId: data.outingId, roundId: data.roundId || null, courseId: data.courseId, courseName: data.courseName, holeCount: data.holeCount, formatId: data.formatId, playerCount: data.playerCount, groupCount: data.groupCount, winner: data.winner, myPosition: data.myPosition, myGross: data.myGross, myNet: data.myNet, topFive: data.topFive || [], invitationalId: data.invitationalId || null, invitationalRoundNumber: data.invitationalRoundNumber || null });
          break;
      }
    });

    await addChallengeProgress(ctx, items);
    items.sort((a, b) => b.timestamp - a.timestamp);
    return items.slice(0, 10);

  } catch (err) {
    console.error("Activity items fetch failed:", err);
    return items;
  }
}

function shouldShowActivity(data: any, ctx: ProviderContext): boolean {
  const isPartner = ctx.partnerIds.includes(data.userId);
  const isRegional = data.regionKey === ctx.regionKey;
  const isSelf = data.userId === ctx.userId;

  switch (data.activityType) {
    case "badge_earned":
    case "low_round":
    case "dtp_claimed":
    case "low_leader_change":
      if (isSelf) return false;
      return isPartner || isRegional;
    case "joined_league":
      if (isSelf) return false;
      return isPartner;
    case "scratch_earned":
    case "ace_tier_earned":
      if (isSelf) return false;
      return true;
    case "league_result":
      return ctx.leagueIds.includes(data.leagueId);
    case "round_complete":
      if (isSelf) return false;
      if (data.privacy === "private") return false;
      if (data.privacy === "partners") return isPartner;
      return isPartner || isRegional;
    case "rivalry_update": {
      const isInRivalry =
        data.playerA?.userId === ctx.userId ||
        data.playerB?.userId === ctx.userId;
      if (isInRivalry) return true;
      if (isSelf) return false;
      return isPartner || isRegional;
    }
    case "outing_complete":
      if (isSelf) return true;
      return isPartner || isRegional;
    default:
      return false;
  }
}

async function addChallengeProgress(
  ctx: ProviderContext,
  items: ActivityItem[]
): Promise<void> {
  try {
    for (const challengeId of ctx.activeChallenges) {
      if (ctx.earnedChallengeBadges.includes(challengeId)) continue;

      const participantDoc = await getDoc(
        doc(db, "challenges", challengeId, "participants", ctx.userId)
      );
      if (!participantDoc.exists()) continue;

      const data = participantDoc.data();
      if (data.earned) continue;

      let progressPct = 0;
      let progressLabel = "";
      const challengeDef = CHALLENGES.find((c) => c.id === challengeId);
      if (!challengeDef) continue;

      switch (challengeDef.type) {
        case "par3": {
          const holes = data.totalPar3Holes ?? 0;
          progressPct = Math.min(holes / 50, 1);
          progressLabel = `${holes}/50 par 3 holes`;
          break;
        }
        case "fir":
        case "gir": {
          const rounds = data.qualifyingRounds ?? 0;
          progressPct = Math.min(rounds / 10, 1);
          progressLabel = `${rounds}/10 qualifying rounds`;
          break;
        }
        case "iron_player": {
          const count = data.consecutiveCount ?? 0;
          progressPct = Math.min(count / 5, 1);
          progressLabel = `${count}/5 consecutive rounds`;
          break;
        }
        case "birdie_streak": {
          const best = data.bestStreak ?? 0;
          const target = data.targetThreshold ?? 3;
          progressPct = Math.min(best / target, 1);
          progressLabel = `Best streak: ${best}/${target}`;
          break;
        }
        default:
          continue;
      }

      if (progressPct < 0.25) continue;

      items.push({
        id: `progress_${challengeId}`,
        timestamp: Date.now(),
        activityType: "challenge_progress",
        badgeId: challengeId,
        badgeName: challengeDef.name,
        progressPct,
        progressLabel,
      });
    }
  } catch (err) {
    console.error("Challenge progress fetch failed:", err);
  }
}

// ============================================================================
// HOLE-IN-ONE STANDALONE
// ============================================================================

async function fetchHoleInOne(ctx: ProviderContext): Promise<HoleInOneInsert | null> {
  try {
    const thirtyDaysAgo = Timestamp.fromMillis(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    );
    const snap = await getDocs(
      query(
        collection(db, "hole_in_ones"),
        where("verified", "==", true),
        where("verifiedAt", ">=", thirtyDaysAgo),
        orderBy("verifiedAt", "desc"),
        limit(1)
      )
    );
    if (snap.empty) return null;

    const data = snap.docs[0].data();
    const timestamp = data.verifiedAt?.toMillis?.() || Date.now();

    return {
      type: "hole_in_one",
      userId: data.userId,
      displayName: data.displayName || "A golfer",
      avatar: data.avatar || null,
      courseName: data.courseName || "Unknown Course",
      hole: data.holeNumber || 0,
      verifiedBy: data.verifierName || "a partner",
      timestamp,
      dismissKey: hioDismissKey(data.userId, timestamp),
    };
  } catch (err) {
    console.error("HIO fetch failed:", err);
    return null;
  }
}

// ============================================================================
// DISMISS HELPERS
// ============================================================================

const DISMISS_PREFIX = "feed_dismiss_";

async function getDismissedKeys(): Promise<Set<string>> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const dismissKeys = allKeys.filter((k) => k.startsWith(DISMISS_PREFIX));
    if (dismissKeys.length === 0) return new Set();
    const pairs = await AsyncStorage.multiGet(dismissKeys);
    const dismissed = new Set<string>();
    for (const [key, value] of pairs) {
      if (value === "1") dismissed.add(key);
    }
    return dismissed;
  } catch {
    return new Set();
  }
}

export async function dismissFeedInsert(dismissKey: string): Promise<void> {
  try {
    await AsyncStorage.setItem(dismissKey, "1");
  } catch (err) {
    console.error("Failed to dismiss feed insert:", err);
  }
}

export async function cleanupDismissKeys(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const dismissKeys = allKeys.filter((k) => k.startsWith(DISMISS_PREFIX));
    const today = new Date().toISOString().split("T")[0];
    const toRemove = dismissKeys.filter(
      (k) =>
        k.startsWith("feed_dismiss_activity_") && !k.includes(today)
    );
    if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove);
  } catch {
    // Silent fail
  }
}