/**
 * Multiplayer Scoring Orchestrator
 *
 * Flow: Course + Holes + Settings → Format → Playing Partners → Scorecard → Complete
 *
 * Features:
 *   - Header: "Tee It Up" with green safe area
 *   - No auto-advance on course select
 *   - Round Type + Visibility in "Round Settings" bottom sheet
 *   - Continue button sticky at bottom
 *   - Selected course shows confirmation bar with X to clear
 *   - Marker Transfer: hand off scoring via settings or approve incoming requests
 *
 * File: app/scoring/index.tsx
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView,
  Modal, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { auth, db, functions } from "@/constants/firebaseConfig";
import {
  addDoc, collection, doc, getDoc, onSnapshot, serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { OutingGroup, OutingPlayer } from "@/constants/outingTypes";

import CourseSelector from "@/components/leagues/post-score/CourseSelector";
import {
  extractTees, generateDefaultHoles, haversine, loadFullCourseData
} from "@/components/leagues/post-score/helpers";
import type { CourseBasic, FullCourseData, TeeOption } from "@/components/leagues/post-score/types";

import FormatPicker from "@/components/scoring/FormatPicker";
import GroupSetup from "@/components/scoring/GroupSetup";
import MultiplayerScorecard from "@/components/scoring/MultiplayerScorecard";
import RoundSummary from "@/components/scoring/RoundSummary";
import TransferAlertModal from "@/components/scoring/TransferAlertModal";
import type {
  HolePlayerData, LiveScoreEntry,
  PlayerSlot,
  PostScoreScreen,
  RoundTeam,
} from "@/components/scoring/scoringTypes";

import { useRoundChat, type ChatMessage } from "@/hooks/useLiveRound";
import { soundPlayer } from "@/utils/soundPlayer";

const closeIcon = require("@/assets/icons/Close.png");

const HEADER_GREEN = "#147A52";
const GREEN = "#0D5C3A";
const CREAM = "#F4EED8";
const GOLD = "#C5A55A";
const WALNUT = "#4A3628";

const STABLEFORD_PTS: Record<number, number> = { [-3]: 5, [-2]: 4, [-1]: 3, [0]: 2, [1]: 1 };

function buildPlayingOrder(startingHole: number, totalHoles: number, baseHole: number = 1): number[] {
  const order: number[] = [];
  for (let i = 0; i < totalHoles; i++) {
    const hole = ((startingHole - baseHole + i) % totalHoles) + baseHole;
    order.push(hole);
  }
  return order;
}

function computeLiveScores(
  players: { playerId: string; courseHandicap: number }[],
  holeData: Record<string, Record<string, HolePlayerData>>,
  holePars: number[], holeCount: number, formatId: string,
): Record<string, LiveScoreEntry> {
  const liveScores: Record<string, LiveScoreEntry> = {};
  const isStableford = formatId.includes("stableford");
  for (const player of players) {
    let grossTotal = 0, netTotal = 0, parTotal = 0, holesPlayed = 0, stablefordPts = 0;
    for (let h = 1; h <= holeCount; h++) {
      const pd = holeData[String(h)]?.[player.playerId];
      if (!pd?.strokes || pd.strokes <= 0) continue;
      const par = holePars[h - 1] || 4;
      const gross = pd.strokes;
      const hcStrokes = Math.floor(player.courseHandicap / holeCount) + (h <= (player.courseHandicap % holeCount) ? 1 : 0);
      const net = gross - hcStrokes;
      grossTotal += gross; netTotal += net; parTotal += par; holesPlayed++;
      if (isStableford) stablefordPts += STABLEFORD_PTS[net - par] ?? 0;
    }
    liveScores[player.playerId] = {
      holesCompleted: holesPlayed, currentGross: grossTotal, currentNet: netTotal,
      scoreToPar: grossTotal - parTotal, thru: holesPlayed,
      ...(isStableford ? { stablefordPoints: stablefordPts } : {}),
    };
  }
  return liveScores;
}

export default function ScoringScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ roundId?: string; resume?: string; courseId?: string }>();
  const currentUserId = auth.currentUser?.uid;

  const [currentScreen, setCurrentScreen] = useState<PostScoreScreen>("course");
  const [isResuming, setIsResuming] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [userRegionKey, setUserRegionKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingCourse, setLoadingCourse] = useState(false);
  const [availableCourses, setAvailableCourses] = useState<CourseBasic[]>([]);
  const [fullCourseData, setFullCourseData] = useState<FullCourseData | null>(null);
  const [availableTees, setAvailableTees] = useState<TeeOption[]>([]);
  const [selectedTee, setSelectedTee] = useState<TeeOption | null>(null);
  const [holeCount, setHoleCount] = useState<9 | 18>(18);
  const [nineHoleSide, setNineHoleSide] = useState<"front" | "back">("front");
  const [startingHole, setStartingHole] = useState(1);
  const [formatId, setFormatId] = useState("stroke_play");
  const [teams, setTeams] = useState<RoundTeam[] | undefined>();
  const [roundType, setRoundType] = useState<"on_premise" | "simulator">("on_premise");
  const [roundPrivacy, setRoundPrivacy] = useState<"public" | "private" | "partners">("public");
  const [showRoundSettingsSheet, setShowRoundSettingsSheet] = useState(false);
  const [players, setPlayers] = useState<PlayerSlot[]>([]);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [currentHole, setCurrentHole] = useState(1);
  const [holeData, setHoleData] = useState<Record<string, Record<string, HolePlayerData>>>({});
  const [statsSheetSuppressed, setStatsSheetSuppressed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittingMessage, setSubmittingMessage] = useState("");
  const [showChatSheet, setShowChatSheet] = useState(false);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [showTransferPicker, setShowTransferPicker] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatListRef = React.useRef<FlatList<ChatMessage>>(null);
  const { messages: chatMessages, sendMessage } = useRoundChat(roundId);

  const transferRequestAlertShown = useRef<string | null>(null);
  const [transferRequestVisible, setTransferRequestVisible] = useState(false);
  const [transferRequestData, setTransferRequestData] = useState<{ requestedBy: string; requestedByName: string } | null>(null);

  // ── DATA LOADING ──
  useEffect(() => { if (currentUserId) loadUserData(); }, [currentUserId]);

  const loadUserData = async () => {
    if (!currentUserId) return;
    try {
      setLoading(true);
      const snap = await getDoc(doc(db, "users", currentUserId));
      if (!snap.exists()) return;
      const data = snap.data();
      setUserData(data);
      setUserRegionKey(data.regionKey || null);
      const cached = data?.cachedCourses || [];
      if (cached.length > 0) {
        const unique = cached.reduce((acc: any[], cur: any) => {
          if (!acc.find((c: any) => c.courseId === cur.courseId || c.id === cur.courseId)) acc.push(cur);
          return acc;
        }, []);
        const courses: CourseBasic[] = unique.map((c: any) => {
          let distance: number | undefined;
          if (data.location?.latitude && data.location?.longitude && c.location?.latitude && c.location?.longitude) {
            distance = haversine(data.location.latitude, data.location.longitude, c.location.latitude, c.location.longitude);
          }
          return {
            id: c.id || c.courseId, courseId: c.courseId || c.id,
            courseName: c.courseName || c.course_name, course_name: c.course_name || c.courseName,
            location: c.location, city: c.location?.city, state: c.location?.state, distance,
          };
        });
        courses.sort((a, b) => (a.distance || 999) - (b.distance || 999));
        setAvailableCourses(courses.slice(0, 5));
      }
    } catch (err) { console.error("Error loading user data:", err); }
    finally { setLoading(false); }
  };

  // ── RESUME ROUND ──
  useEffect(() => {
    if (!params.roundId || params.resume !== "true" || !currentUserId) return;
    const resumeRound = async () => {
      try {
        setIsResuming(true); setLoading(true);
        const roundSnap = await getDoc(doc(db, "rounds", params.roundId!));
        if (!roundSnap.exists()) { Alert.alert("Error", "Round not found."); router.back(); return; }
        const roundData = roundSnap.data();
        if (roundData.markerId !== currentUserId) { Alert.alert("Error", "You are not the scorekeeper."); router.back(); return; }
        setRoundId(params.roundId!);
        setHoleCount(roundData.holeCount || 18);
        setFormatId(roundData.formatId || "stroke_play");
        setPlayers(roundData.players || []);
        setTeams(roundData.teams || undefined);
        setCurrentHole(roundData.currentHole || 1);
        setHoleData(roundData.holeData || {});
        if (roundData.courseId) {
          const courseData = await loadFullCourseData(roundData.courseId, roundData.courseName, roundData.location);
          if (courseData) {
            setFullCourseData(courseData);
            const tees = extractTees(courseData.tees);
            setAvailableTees(tees);
            const markerPlayer = roundData.players?.find((p: any) => p.playerId === currentUserId);
            const matchedTee = tees.find((t) => t.tee_name === markerPlayer?.teeName) || tees[0];
            if (matchedTee) setSelectedTee(matchedTee);
          }
        }
        setNineHoleSide(roundData.nineHoleSide || "front");
        setStartingHole(roundData.startingHole || 1);
        setCurrentScreen("scorecard");
        console.log("✅ Resumed round:", params.roundId, "at hole", roundData.currentHole);
      } catch (err) { console.error("Error resuming round:", err); Alert.alert("Error", "Failed to resume round."); router.back(); }
      finally { setLoading(false); setIsResuming(false); }
    };
    resumeRound();
  }, [params.roundId, params.resume, currentUserId]);

  useEffect(() => {
    if (!params.courseId || params.roundId) return;
    if (fullCourseData) return;
    const autoSelectCourse = async () => {
      const cId = parseInt(params.courseId!, 10);
      if (isNaN(cId)) return;
      setLoadingCourse(true);
      try {
        const courseData = await loadFullCourseData(cId, undefined, undefined);
        if (courseData) {
          setFullCourseData(courseData);
          const tees = extractTees(courseData.tees);
          if (tees.length > 0) { setAvailableTees(tees); setSelectedTee(tees[0]); }
          else {
            const dt: TeeOption = { tee_name: "Default", course_rating: 72, slope_rating: 113, par_total: holeCount === 9 ? 36 : 72, total_yards: holeCount === 9 ? 3200 : 6400, number_of_holes: holeCount, holes: generateDefaultHoles(holeCount), source: "male" };
            setAvailableTees([dt]); setSelectedTee(dt);
          }
        }
      } catch (err) { console.error("Auto-select course failed:", err); }
      finally { setLoadingCourse(false); }
    };
    autoSelectCourse();
  }, [params.courseId]);

  // ══════════════════════════════════════════════════════════════════════
  // MARKER TRANSFER
  // ══════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!roundId || !currentUserId) return;
    const unsub = onSnapshot(doc(db, "rounds", roundId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (currentScreen === "scorecard" && data.markerId !== currentUserId && data.status === "live") {
        // Dismiss transfer modal if it's showing
        setTransferRequestVisible(false);
        setTransferRequestData(null);
        const name = data.players?.find((p: any) => p.playerId === data.markerId)?.displayName || "Another player";
        Alert.alert("Scoring Transferred", `${name} has taken over scoring.`, [
          { text: "OK", onPress: () => router.replace(`/round/${roundId}` as any) },
        ]);
        return;
      }
      // Skip transfer request logic if we're no longer the marker
      if (data.markerId !== currentUserId) {
        setTransferRequestVisible(false);
        setTransferRequestData(null);
        return;
      }

      if (
        data.markerTransferRequest?.status === "pending" &&
        data.markerTransferRequest?.requestedBy !== currentUserId
      ) {
        const req = data.markerTransferRequest;
        if (transferRequestAlertShown.current === req.requestedBy) return;
        transferRequestAlertShown.current = req.requestedBy;
        setTransferRequestData({ requestedBy: req.requestedBy, requestedByName: req.requestedByName });
        setTransferRequestVisible(true);
      }
      if (!data.markerTransferRequest) {
        transferRequestAlertShown.current = null;
        setTransferRequestVisible(false);
        setTransferRequestData(null);
      }
    });
    return () => unsub();
  }, [roundId, currentUserId, currentScreen]);

  const handleTransferScoring = () => {
    const eligible = players.filter((p) => !p.isGhost && p.playerId !== currentUserId);
    if (eligible.length === 0) { Alert.alert("No Eligible Players", "There are no on-platform players to transfer scoring to."); return; }
    setShowSettingsSheet(false);
    if (eligible.length === 1) {
      const target = eligible[0];
      Alert.alert("Transfer Scoring", `Hand off scorekeeper duties to ${target.displayName}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Transfer", onPress: () => executeMarkerTransfer(target.playerId, target.displayName) },
      ]);
    } else { setShowTransferPicker(true); }
  };

  const executeMarkerTransfer = async (newMarkerId: string, newMarkerName: string) => {
    if (!roundId) return;
    try {
      soundPlayer.play("click");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await updateDoc(doc(db, "rounds", roundId), {
        markerId: newMarkerId, markerTransferRequest: null,
        players: players.map((p) => ({
          playerId: p.playerId, displayName: p.displayName, avatar: p.avatar || null,
          isGhost: p.isGhost, isMarker: p.playerId === newMarkerId, handicapIndex: p.handicapIndex,
          courseHandicap: p.courseHandicap, teeName: p.teeName, slopeRating: p.slopeRating,
          courseRating: p.courseRating, teamId: p.teamId || null,
          contactInfo: p.contactInfo || null, contactType: p.contactType || null,
        })),
      });
      console.log(`✅ Marker transferred to ${newMarkerName}`);
    } catch (err) { console.error("Error transferring marker:", err); Alert.alert("Error", "Failed to transfer scoring duties."); }
  };

  const handleSelectCourse = async (course: CourseBasic) => {
    const rawCourseId = course.courseId || course.id;
    if (!rawCourseId) return;
    const courseId = typeof rawCourseId === "string" ? parseInt(rawCourseId, 10) : rawCourseId;
    if (isNaN(courseId as number)) return;
    setLoadingCourse(true);
    try {
      const courseData = await loadFullCourseData(courseId as number, course.courseName || course.course_name, course.location);
      if (courseData) {
        setFullCourseData(courseData);
        const tees = extractTees(courseData.tees);
        if (tees.length > 0) { setAvailableTees(tees); setSelectedTee(tees[0]); }
        else {
          const dt: TeeOption = { tee_name: "Default", course_rating: 72, slope_rating: 113, par_total: holeCount === 9 ? 36 : 72, total_yards: holeCount === 9 ? 3200 : 6400, number_of_holes: holeCount, holes: generateDefaultHoles(holeCount), source: "male" };
          setAvailableTees([dt]); setSelectedTee(dt);
        }
        soundPlayer.play("click"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else { Alert.alert("Error", "Could not load course data."); }
    } catch (err) { console.error("Error loading course:", err); Alert.alert("Error", "Failed to load course data."); }
    finally { setLoadingCourse(false); }
  };

  const handleContinueToFormat = () => {
    if (!fullCourseData || !selectedTee) { Alert.alert("Select a Course", "Please select a course before continuing."); return; }
    soundPlayer.play("click"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCurrentScreen("format");
  };

  const handleSetHoleCount = (count: 9 | 18) => {
    soundPlayer.play("click"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHoleCount(count);
    if (count === 18) { setNineHoleSide("front"); setStartingHole(1); }
    else { setStartingHole(nineHoleSide === "back" ? 10 : 1); }
  };

  const handleFormatConfirm = (selectedFormatId: string, selectedTeams?: RoundTeam[]) => {
    soundPlayer.play("click"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFormatId(selectedFormatId); setTeams(selectedTeams); setCurrentScreen("group");
  };

  const markerInfo = useMemo(() => ({
    userId: currentUserId || "", displayName: userData?.displayName || "Unknown",
    avatar: userData?.avatar || undefined, handicapIndex: parseFloat(userData?.handicap) || 0,
  }), [currentUserId, userData]);

  const handleGroupConfirm = async (confirmedPlayers: PlayerSlot[]) => {
    soundPlayer.play("click"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPlayers(confirmedPlayers);
    if (!fullCourseData || !selectedTee || !currentUserId) return;
    try {
      setSubmitting(true); setSubmittingMessage("Starting round...");
      const courseId = fullCourseData.courseId || fullCourseData.id;
      const courseName = fullCourseData.courseName || fullCourseData.course_name;
      const allHoles = selectedTee.holes || [];
      const baseHole = holeCount === 9 && nineHoleSide === "back" ? 10 : 1;
      const playingOrder = buildPlayingOrder(startingHole, holeCount, baseHole);
      const holePars = playingOrder.map((h) => allHoles[h - 1]?.par || 4);
      const holeDetails = playingOrder.map((h) => ({
        par: allHoles[h - 1]?.par || 4, yardage: allHoles[h - 1]?.yardage || 0, handicap: allHoles[h - 1]?.handicap ?? null,
      }));
      const playersWithTeams = teams
        ? confirmedPlayers.map((p) => { const team = teams.find((t) => t.playerIds.includes(p.playerId)); return team ? { ...p, teamId: team.id } : p; })
        : confirmedPlayers;
      const roundDoc = {
        markerId: currentUserId, status: "live",
        courseId: typeof courseId === "string" ? parseInt(courseId, 10) : courseId,
        courseName, holeCount, nineHoleSide: holeCount === 9 ? nineHoleSide : null, formatId,
        players: playersWithTeams.map((p) => ({
          playerId: p.playerId, displayName: p.displayName, avatar: p.avatar || null,
          isGhost: p.isGhost, isMarker: p.isMarker, handicapIndex: p.handicapIndex,
          courseHandicap: p.courseHandicap, teeName: p.teeName, slopeRating: p.slopeRating,
          courseRating: p.courseRating, teamId: p.teamId || null,
          contactInfo: p.contactInfo || null, contactType: p.contactType || null,
        })),
        teams: teams || null, currentHole: 1, holeData: {}, liveScores: {}, holePars, holeDetails, playingOrder,
        startingHole, leagueId: null, leagueWeek: null, regionKey: userRegionKey,
        location: fullCourseData.location || null, startedAt: serverTimestamp(),
        roundType, isSimulator: roundType === "simulator", privacy: roundPrivacy,
        markerTransferRequest: null,
      };
      const docRef = await addDoc(collection(db, "rounds"), roundDoc);
      setRoundId(docRef.id); setPlayers(playersWithTeams);
      console.log("✅ Round created:", docRef.id);
    } catch (err) { console.error("Error creating round:", err); Alert.alert("Error", "Failed to start round."); return; }
    finally { setSubmitting(false); }
    setCurrentScreen("scorecard");
  };

  const handlePlaySolo = async () => {
    soundPlayer.play("click"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!currentUserId || !selectedTee || !fullCourseData) return;
    const hcp = parseFloat(userData?.handicap) || 0;
    const slope = selectedTee.slope_rating || 113;
    const rating = selectedTee.course_rating || 72;
    const courseHandicap = Math.round((hcp * slope) / 113 + (rating - 72));
    const soloMarker: PlayerSlot = {
      playerId: currentUserId, displayName: userData?.displayName || "Unknown",
      avatar: userData?.avatar || undefined, isGhost: false, isMarker: true,
      handicapIndex: hcp, courseHandicap, tee: selectedTee,
      teeName: selectedTee.tee_name || "Default", slopeRating: slope, courseRating: rating,
    };
    await handleGroupConfirm([soloMarker]);
  };

  // ══════════════════════════════════════════════════════════════════════
  // OUTING LAUNCH
  // ══════════════════════════════════════════════════════════════════════

  const handleOutingLaunch = async (roster: OutingPlayer[], groups: OutingGroup[]) => {
    if (!fullCourseData || !selectedTee || !currentUserId) return;
    try {
      setSubmitting(true); setSubmittingMessage("Launching outing...");
      const courseId = fullCourseData.courseId || fullCourseData.id;
      const courseName = fullCourseData.courseName || fullCourseData.course_name;

      const launchOuting = httpsCallable(functions, "launchOuting");
      const result = await launchOuting({
        parentType: "casual",
        parentId: null,
        courseId: typeof courseId === "string" ? parseInt(courseId, 10) : courseId,
        courseName,
        holeCount,
        nineHoleSide: holeCount === 9 ? nineHoleSide : undefined,
        formatId,
        groupSize: 4,
        roundType,
        privacy: roundPrivacy,
        location: fullCourseData.location || null,
        regionKey: userRegionKey || null,
        roster,
        groups,
      });

      const { outingId, organizerRoundId } = result.data as {
        success: boolean; outingId: string; roundIds: string[]; organizerRoundId: string;
      };
      console.log(`✅ Outing launched: ${outingId}, organizer round: ${organizerRoundId}`);

      // If the organizer is a group marker, navigate to their scorecard
      const organizerGroup = groups.find((g) => g.markerId === currentUserId);
      if (organizerGroup && organizerRoundId) {
        setRoundId(organizerRoundId);
        const roundSnap = await getDoc(doc(db, "rounds", organizerRoundId));
        if (roundSnap.exists()) {
          const roundData = roundSnap.data();
          setPlayers(roundData.players || []);
          setHoleData(roundData.holeData || {});
          setStartingHole(roundData.startingHole || 1);
          setCurrentHole(1);
          setCurrentScreen("scorecard");
        }
      } else {
        // Organizer is not scoring — go back to home with success message
        Alert.alert(
          "Outing Launched! 🏌️",
          `Your group outing at ${courseName} is live. Group scorers have been notified.`,
          [{ text: "OK", onPress: () => router.replace("/") }]
        );
      }

      soundPlayer.play("click");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error("Outing launch error:", err);
      Alert.alert("Launch Failed", err?.message || "Failed to launch outing. Please try again.");
    } finally { setSubmitting(false); }
  };

  const handleScoreChange = useCallback((holeNum: number, playerId: string, strokes: number | null) => {
    setHoleData((prev) => {
      const hk = String(holeNum); const existing = prev[hk] || {}; const pd = existing[playerId] || { strokes: 0 };
      return { ...prev, [hk]: { ...existing, [playerId]: { ...pd, strokes: strokes ?? 0 } } };
    });
  }, []);

  const handleHoleComplete = useCallback(async (holeNum: number, stats: Record<string, { fir: boolean | null; gir: boolean | null; dtp: string | null }>) => {
    setHoleData((prev) => {
      const hk = String(holeNum); const existing = prev[hk] || {}; const updated = { ...existing };
      for (const [pid, ps] of Object.entries(stats)) { updated[pid] = { ...(updated[pid] || { strokes: 0 }), fir: ps.fir, gir: ps.gir, dtp: ps.dtp ? parseFloat(ps.dtp) : null }; }
      return { ...prev, [hk]: updated };
    });
    const nextHole = holeNum + 1;
    if (nextHole <= holeCount) setCurrentHole(nextHole);
    if (roundId) {
      try {
        const hk = String(holeNum); const roundRef = doc(db, "rounds", roundId);
        const holeUpdate: Record<string, any> = {};
        for (const [pid, ps] of Object.entries(stats)) {
          holeUpdate[`holeData.${hk}.${pid}`] = { ...(holeData[hk]?.[pid] || { strokes: 0 }), fir: ps.fir, gir: ps.gir, dtp: ps.dtp ? parseFloat(ps.dtp) : null };
        }
        await updateDoc(roundRef, { ...holeUpdate, currentHole: Math.min(nextHole, holeCount) });
        if (selectedTee) {
          const allHoles = selectedTee.holes || [];
          const baseHole = holeCount === 9 && nineHoleSide === "back" ? 10 : 1;
          const order = buildPlayingOrder(startingHole, holeCount, baseHole);
          const holePars = order.map((h) => allHoles[h - 1]?.par || 4);
          const merged = { ...holeData }; if (!merged[hk]) merged[hk] = {};
          for (const [pid, ps] of Object.entries(stats)) { merged[hk][pid] = { ...(merged[hk][pid] || { strokes: 0 }), fir: ps.fir, gir: ps.gir, dtp: ps.dtp ? parseFloat(ps.dtp) : null }; }
          const liveScores = computeLiveScores(players.map((p) => ({ playerId: p.playerId, courseHandicap: p.courseHandicap })), merged, holePars, holeCount, formatId);
          await updateDoc(roundRef, { liveScores });
        }
      } catch (err) { console.error("Error syncing hole data:", err); }
    }
  }, [roundId, holeCount, holeData, selectedTee, nineHoleSide, startingHole, players, formatId]);

  const handleCompleteRound = useCallback(async () => {
    if (!roundId) return;
    for (let h = 1; h <= holeCount; h++) {
      for (const player of players) {
        const strokes = holeData[String(h)]?.[player.playerId]?.strokes;
        if (!strokes || strokes <= 0) { Alert.alert("Incomplete Scorecard", `${player.displayName} is missing a score on hole ${h}.`); return; }
      }
    }
    soundPlayer.play("click"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCurrentScreen("summary");
  }, [roundId, holeCount, holeData, players]);

  const handlePostRound = useCallback(async (description: string, imageUrl: string | null) => {
    if (!roundId) return;
    try {
      setSubmitting(true); setSubmittingMessage("Posting round...");
      const roundRef = doc(db, "rounds", roundId);
      const finalHoleData: Record<string, Record<string, HolePlayerData>> = {};
      for (let h = 1; h <= holeCount; h++) { finalHoleData[String(h)] = holeData[String(h)] || {}; }
      await updateDoc(roundRef, { status: "complete", holeData: finalHoleData, currentHole: holeCount, completedAt: serverTimestamp(), roundDescription: description || null, roundImageUrl: imageUrl || null });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); soundPlayer.play("click"); router.replace("/");
    } catch (err) { console.error("Error posting round:", err); throw err; }
    finally { setSubmitting(false); }
  }, [roundId, holeCount, holeData, router]);

  const handleBack = () => {
    soundPlayer.play("click");
    switch (currentScreen) {
      case "format": setSelectedTee(null); setFullCourseData(null); setAvailableTees([]); setCurrentScreen("course"); break;
      case "group": setCurrentScreen("format"); break;
      case "scorecard":
        Alert.alert("Abandon Round?", "Going back will abandon this round. Scores will not be saved.", [
          { text: "Stay", style: "cancel" },
          { text: "Abandon", style: "destructive", onPress: async () => {
            if (roundId) { try { await updateDoc(doc(db, "rounds", roundId), { status: "abandoned" }); } catch (err) { console.error(err); } }
            router.back();
          }},
        ]); return;
      case "summary": setCurrentScreen("scorecard"); return;
      default: router.back(); return;
    }
  };

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() || chatSending || !roundId) return;
    setChatSending(true); soundPlayer.play("click");
    try {
      const user = auth.currentUser;
      const mp = players.find((p) => p.playerId === currentUserId);
      await sendMessage(currentUserId!, mp?.displayName || user?.displayName || "Marker", mp?.avatar, chatInput.trim());
      setChatInput(""); setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (e) { console.error("Chat send error:", e); }
    finally { setChatSending(false); }
  }, [chatInput, chatSending, roundId, currentUserId, players, sendMessage]);

  const handleTogglePrivacy = () => {
    if (!roundId) return;
    Alert.alert("Round Visibility", "Choose who can see your live round.", [
      { text: "Public", onPress: () => { updateDoc(doc(db, "rounds", roundId), { privacy: "public" }); setRoundPrivacy("public"); } },
      { text: "Partners Only", onPress: () => { updateDoc(doc(db, "rounds", roundId), { privacy: "partners" }); setRoundPrivacy("partners"); } },
      { text: "Private", onPress: () => { updateDoc(doc(db, "rounds", roundId), { privacy: "private" }); setRoundPrivacy("private"); } },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleAbandonRound = () => {
    if (!roundId) return;
    Alert.alert("Abandon Round?", "This will end the round without saving scores.", [
      { text: "Keep Playing", style: "cancel" },
      { text: "Abandon", style: "destructive", onPress: async () => {
        try {
          await updateDoc(doc(db, "rounds", roundId), { status: "abandoned", abandonedAt: serverTimestamp(), abandonedBy: currentUserId });
          soundPlayer.play("click"); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); router.back();
        } catch (err) { Alert.alert("Error", "Failed to abandon round."); }
      }},
    ]);
  };

  const transferEligiblePlayers = useMemo(
    () => players.filter((p) => !p.isGhost && p.playerId !== currentUserId),
    [players, currentUserId]
  );

  // ── RENDER ──
  if (loading) {
    return (
      <SafeAreaView style={st.loadingContainer} edges={["top", "bottom"]}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={st.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  const courseSelected = !!fullCourseData && !!selectedTee;
  const settingsSummary = `${roundType === "on_premise" ? "On Course" : "Simulator"} · ${roundPrivacy === "public" ? "Public" : roundPrivacy === "partners" ? "Partners Only" : "Private"}`;

  return (
    <View style={st.container}>
      {/* ═══ COURSE SCREEN ═══ */}
      {currentScreen === "course" && (
        <View style={{ flex: 1 }}>
          <View style={{ backgroundColor: HEADER_GREEN, paddingTop: insets.top }}>
            <View style={st.header}>
              <TouchableOpacity onPress={() => router.back()} style={st.headerBackBtn}>
                <Ionicons name="chevron-back" size={24} color="#FFF" />
              </TouchableOpacity>
              <Text style={st.headerTitle}>Tee It Up</Text>
              <View style={{ width: 32 }} />
            </View>
          </View>

          <ScrollView style={{ flex: 1, backgroundColor: CREAM }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            {/* Hole Count */}
            <View style={st.holeSection}>
              <Ionicons name="flag-outline" size={24} color={GREEN} />
              <Text style={st.holeSectionTitle}>How many holes are you playing?</Text>
              <View style={st.holeToggle}>
                {([18, 9] as const).map((count) => (
                  <TouchableOpacity key={count} onPress={() => handleSetHoleCount(count)} style={[st.holeOption, holeCount === count && st.holeOptionActive]}>
                    <Text style={[st.holeOptionNumber, holeCount === count && st.holeOptionNumberActive]}>{count}</Text>
                    <Text style={[st.holeOptionLabel, holeCount === count && st.holeOptionLabelActive]}>{count === 18 ? "Full Round" : "Half Round"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {holeCount === 9 && (
                <View style={st.nineHoleRow}>
                  {(["front", "back"] as const).map((side) => (
                    <TouchableOpacity key={side} onPress={() => { soundPlayer.play("click"); setNineHoleSide(side); setStartingHole(side === "front" ? 1 : 10); }} style={[st.nineHoleBtn, nineHoleSide === side && st.nineHoleBtnActive]}>
                      <Text style={[st.nineHoleBtnText, nineHoleSide === side && st.nineHoleBtnTextActive]}>{side === "front" ? "Front 9 (1–9)" : "Back 9 (10–18)"}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            <View style={st.divider} />

            {/* Course Selection */}
            <View style={st.courseSection}>
              <View style={st.courseSectionHeader}>
                <Ionicons name="golf-outline" size={22} color={GREEN} />
                <Text style={st.courseSectionTitle}>Select your course</Text>
              </View>
              {fullCourseData ? (
                <View style={st.selectedCourseBar}>
                  <Ionicons name="checkmark-circle" size={20} color={GREEN} />
                  <Text style={st.selectedCourseName} numberOfLines={1}>{fullCourseData.courseName || fullCourseData.course_name}</Text>
                  <TouchableOpacity onPress={() => { soundPlayer.play("click"); setFullCourseData(null); setSelectedTee(null); setAvailableTees([]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={20} color="#CCC" />
                  </TouchableOpacity>
                </View>
              ) : (
                <CourseSelector availableCourses={availableCourses} isRestricted={false} userLocation={userData?.location || null} onSelectCourse={handleSelectCourse} onBack={() => router.back()} />
              )}
            </View>
            <View style={st.divider} />

            {/* Starting Hole */}
            <View style={st.startingHoleSection}>
              <View style={st.startingHoleHeader}>
                <Ionicons name="navigate-outline" size={20} color={GREEN} />
                <Text style={st.startingHoleTitle}>Starting Hole</Text>
                {startingHole !== (holeCount === 9 && nineHoleSide === "back" ? 10 : 1) && (
                  <View style={st.startingHoleBadge}>
                    <Text style={st.startingHoleBadgeText}>Hole {startingHole}</Text>
                  </View>
                )}
              </View>
              <FlatList
                horizontal showsHorizontalScrollIndicator={false}
                data={(() => {
                  if (holeCount === 18) return Array.from({ length: 18 }, (_, i) => i + 1);
                  return nineHoleSide === "back" ? Array.from({ length: 9 }, (_, i) => i + 10) : Array.from({ length: 9 }, (_, i) => i + 1);
                })()}
                keyExtractor={(item) => String(item)}
                contentContainerStyle={st.startingHoleList}
                renderItem={({ item: hole }) => {
                  const isSelected = hole === startingHole;
                  return (
                    <TouchableOpacity onPress={() => { soundPlayer.play("click"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStartingHole(hole); }}
                      style={[st.startingHoleChip, isSelected && st.startingHoleChipActive]}>
                      <Text style={[st.startingHoleChipText, isSelected && st.startingHoleChipTextActive]}>{hole}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
            <View style={st.divider} />

            {/* Round Settings Bar */}
            <TouchableOpacity style={st.roundSettingsBar} onPress={() => { soundPlayer.play("click"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowRoundSettingsSheet(true); }} activeOpacity={0.7}>
              <Ionicons name="settings-outline" size={20} color={GREEN} />
              <View style={{ flex: 1 }}>
                <Text style={st.roundSettingsLabel}>Round Settings</Text>
                <Text style={st.roundSettingsSummary}>{settingsSummary}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CCC" />
            </TouchableOpacity>
          </ScrollView>

          {/* Continue Button */}
          <View style={[st.continueBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <TouchableOpacity style={[st.continueBtn, !courseSelected && st.continueBtnDisabled]} onPress={handleContinueToFormat} activeOpacity={0.8} disabled={!courseSelected}>
              <Text style={[st.continueBtnText, !courseSelected && st.continueBtnTextDisabled]}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color={courseSelected ? "#FFF" : "#BBB"} />
            </TouchableOpacity>
          </View>

          {/* Round Settings Bottom Sheet */}
          <Modal visible={showRoundSettingsSheet} transparent animationType="slide">
            <View style={st.sheetOverlay}>
              <TouchableOpacity style={st.sheetBackdrop} activeOpacity={1} onPress={() => setShowRoundSettingsSheet(false)} />
              <View style={[st.sheetContainer, { maxHeight: 520 }]}>
                <View style={st.sheetHeader}>
                  <View style={st.sheetHandle} />
                  <Text style={st.sheetTitle}>Round Settings</Text>
                  <TouchableOpacity onPress={() => setShowRoundSettingsSheet(false)}>
                    <Image source={closeIcon} style={{ width: 22, height: 22, tintColor: "#666" }} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                  <Text style={st.rsLabel}>Round Type</Text>
                  <View style={st.rsToggle}>
                    {([
                      { id: "on_premise" as const, label: "On Course", icon: "golf-outline" },
                      { id: "simulator" as const, label: "Simulator", icon: "tv-outline" },
                    ] as const).map((opt) => (
                      <TouchableOpacity key={opt.id} onPress={() => { soundPlayer.play("click"); setRoundType(opt.id); }} style={[st.rsCard, roundType === opt.id && st.rsCardActive]}>
                        <Ionicons name={opt.icon as any} size={22} color={roundType === opt.id ? "#FFF" : "#888"} />
                        <Text style={[st.rsCardLabel, roundType === opt.id && st.rsCardLabelActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {roundType === "simulator" && (
                    <View style={st.rsNote}>
                      <Ionicons name="information-circle-outline" size={14} color="#999" />
                      <Text style={st.rsNoteText}>Simulator rounds do not count toward your Handicap Index.</Text>
                    </View>
                  )}
                  <Text style={[st.rsLabel, { marginTop: 20 }]}>Visibility</Text>
                  <View style={st.rsPrivacyList}>
                    {([
                      { id: "public" as const, label: "Public", icon: "globe-outline", desc: "Anyone can see your round" },
                      { id: "partners" as const, label: "Partners Only", icon: "people-outline", desc: "Only your partners can view" },
                      { id: "private" as const, label: "Private", icon: "lock-closed-outline", desc: "Only you can see this round" },
                    ] as const).map((opt) => (
                      <TouchableOpacity key={opt.id} onPress={() => { soundPlayer.play("click"); setRoundPrivacy(opt.id); }} style={[st.rsPrivacyRow, roundPrivacy === opt.id && st.rsPrivacyRowActive]}>
                        <View style={[st.rsPrivacyIcon, roundPrivacy === opt.id && st.rsPrivacyIconActive]}>
                          <Ionicons name={opt.icon as any} size={18} color={roundPrivacy === opt.id ? "#FFF" : "#888"} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[st.rsPrivacyLabel, roundPrivacy === opt.id && st.rsPrivacyLabelActive]}>{opt.label}</Text>
                          <Text style={st.rsPrivacyDesc}>{opt.desc}</Text>
                        </View>
                        {roundPrivacy === opt.id && <Ionicons name="checkmark-circle" size={20} color={HEADER_GREEN} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                  <TouchableOpacity style={st.rsDoneBtn} onPress={() => { soundPlayer.play("click"); setShowRoundSettingsSheet(false); }} activeOpacity={0.8}>
                    <Text style={st.rsDoneBtnText}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {loadingCourse && (
            <View style={st.courseLoadingOverlay}>
              <View style={st.courseLoadingCard}>
                <ActivityIndicator size="large" color={GREEN} />
                <Text style={st.courseLoadingText}>Loading course data...</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ═══ FORMAT PICKER ═══ */}
      {currentScreen === "format" && (
        <FormatPicker playerCount={4} players={[]} onConfirm={handleFormatConfirm} onBack={handleBack} />
      )}

      {/* ═══ PLAYING PARTNERS ═══ */}
      {currentScreen === "group" && selectedTee && (
        <GroupSetup marker={markerInfo} markerTee={selectedTee} availableTees={availableTees}
          courseName={fullCourseData?.courseName || fullCourseData?.course_name || ""}
          holeCount={holeCount} onConfirm={handleGroupConfirm} onPlaySolo={handlePlaySolo}
          onBack={handleBack} onMarkerTeeChange={(tee) => setSelectedTee(tee)}
          courseId={(() => { const cid = fullCourseData?.courseId || fullCourseData?.id; return typeof cid === "string" ? parseInt(cid, 10) : (cid ?? 0); })()}
          nineHoleSide={nineHoleSide}
          formatId={formatId}
          onOutingLaunch={handleOutingLaunch}
        />
      )}

      {/* ═══ SCORECARD ═══ */}
      {currentScreen === "scorecard" && selectedTee && roundId && players.length > 0 && (
        <View style={{ flex: 1 }}>
          <View style={{ backgroundColor: HEADER_GREEN, paddingTop: insets.top }}>
            <View style={st.header}>
              <TouchableOpacity onPress={handleBack} style={st.headerBackBtn}>
                <Ionicons name="chevron-back" size={24} color="#FFF" />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: 36 }}>
                <Text style={st.headerTitle} numberOfLines={1}>{fullCourseData?.courseName || fullCourseData?.course_name || "Round"}</Text>
                <Text style={st.headerSubtitle}>Hole {(() => {
                  const baseHole = holeCount === 9 && nineHoleSide === "back" ? 10 : 1;
                  const order = buildPlayingOrder(startingHole, holeCount, baseHole);
                  return order[currentHole - 1] || currentHole;
                })()} of {holeCount}</Text>
              </View>
              <View style={st.headerActions}>
                <TouchableOpacity onPress={() => { soundPlayer.play("click"); setShowChatSheet(true); }} style={st.headerIconBtn}>
                  <Ionicons name="chatbubble-outline" size={20} color="#FFF" />
                  {chatMessages.length > 0 && <View style={st.chatBadge}><Text style={st.chatBadgeText}>{chatMessages.length > 99 ? "99+" : chatMessages.length}</Text></View>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { soundPlayer.play("click"); setShowSettingsSheet(true); }} style={st.headerIconBtn}>
                  <Ionicons name="settings-outline" size={20} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCompleteRound} style={st.finishBtn}><Text style={st.finishBtnText}>Finish</Text></TouchableOpacity>
              </View>
            </View>
          </View>

          <MultiplayerScorecard mode="edit"
            initialHole={currentHole}
            holes={(() => {
              const allHoles = selectedTee.holes || [];
              const baseHole = holeCount === 9 && nineHoleSide === "back" ? 10 : 1;
              const order = buildPlayingOrder(startingHole, holeCount, baseHole);
              return order.map((h) => allHoles[h - 1] || { par: 4, yardage: 0 });
            })()}
            holeData={holeData} onScoreChange={handleScoreChange} onHoleComplete={handleHoleComplete}
            statsSheetSuppressed={statsSheetSuppressed} onEnableStatsSheet={() => setStatsSheetSuppressed(false)} formatId={formatId} players={players} holeCount={holeCount} />

          {/* Chat Sheet */}
          <Modal visible={showChatSheet} transparent animationType="slide">
            <KeyboardAvoidingView style={st.sheetOverlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <TouchableOpacity style={st.sheetBackdrop} activeOpacity={1} onPress={() => setShowChatSheet(false)} />
              <View style={st.sheetContainer}>
                <View style={st.sheetHeader}>
                  <View style={st.sheetHandle} />
                  <Text style={st.sheetTitle}>Round Chat</Text>
                  <TouchableOpacity onPress={() => setShowChatSheet(false)}><Image source={closeIcon} style={{ width: 22, height: 22, tintColor: "#666" }} /></TouchableOpacity>
                </View>
                <FlatList ref={chatListRef} data={chatMessages} keyExtractor={(item) => item.id} contentContainerStyle={st.sheetChatList}
                  onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: false })}
                  ListEmptyComponent={<View style={st.sheetChatEmpty}><Ionicons name="chatbubble-ellipses-outline" size={36} color="#CCC" /><Text style={st.sheetChatEmptyText}>No messages yet</Text></View>}
                  renderItem={({ item }) => {
                    const isMe = item.userId === currentUserId;
                    return (
                      <View style={[st.sheetMsgRow, isMe && st.sheetMsgRowMe]}>
                        <View style={[st.sheetMsgBubble, isMe && st.sheetMsgBubbleMe]}>
                          {!isMe && <Text style={st.sheetMsgSender}>{item.displayName}</Text>}
                          <Text style={[st.sheetMsgText, isMe && st.sheetMsgTextMe]}>{item.content}</Text>
                        </View>
                      </View>
                    );
                  }}
                />
                <View style={st.sheetChatInputBar}>
                  <TextInput style={st.sheetChatInput} placeholder="Send a message..." placeholderTextColor="#999" value={chatInput} onChangeText={setChatInput} onSubmitEditing={handleSendChat} returnKeyType="send" maxLength={280} />
                  <TouchableOpacity style={[st.sheetSendBtn, !chatInput.trim() && st.sheetSendBtnDisabled]} onPress={handleSendChat} disabled={!chatInput.trim() || chatSending}>
                    {chatSending ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send" size={16} color="#FFF" />}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          {/* In-Round Settings Sheet */}
          <Modal visible={showSettingsSheet} transparent animationType="slide">
            <View style={st.sheetOverlay}>
              <TouchableOpacity style={st.sheetBackdrop} activeOpacity={1} onPress={() => setShowSettingsSheet(false)} />
              <View style={[st.sheetContainer, { maxHeight: 420 }]}>
                <View style={st.sheetHeader}>
                  <View style={st.sheetHandle} />
                  <Text style={st.sheetTitle}>Round Settings</Text>
                  <TouchableOpacity onPress={() => setShowSettingsSheet(false)}><Image source={closeIcon} style={{ width: 22, height: 22, tintColor: "#666" }} /></TouchableOpacity>
                </View>
                <ScrollView style={st.settingsBody}>
                  <TouchableOpacity style={st.settingsRow} onPress={handleTogglePrivacy}>
                    <View style={st.settingsRowIcon}><Ionicons name="globe-outline" size={20} color={HEADER_GREEN} /></View>
                    <View style={{ flex: 1 }}><Text style={st.settingsRowLabel}>Round Visibility</Text><Text style={st.settingsRowSub}>Who can watch this round live</Text></View>
                    <Ionicons name="chevron-forward" size={18} color="#CCC" />
                  </TouchableOpacity>
                  {transferEligiblePlayers.length > 0 && (
                    <TouchableOpacity style={st.settingsRow} onPress={handleTransferScoring}>
                      <View style={st.settingsRowIcon}><Ionicons name="swap-horizontal-outline" size={20} color={HEADER_GREEN} /></View>
                      <View style={{ flex: 1 }}><Text style={st.settingsRowLabel}>Transfer Scoring</Text><Text style={st.settingsRowSub}>Hand off scorekeeper duties</Text></View>
                      <Ionicons name="chevron-forward" size={18} color="#CCC" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={st.settingsRow} onPress={handleAbandonRound}>
                    <View style={[st.settingsRowIcon, { backgroundColor: "rgba(204,51,51,0.08)" }]}><Ionicons name="close-circle-outline" size={20} color="#CC3333" /></View>
                    <View style={{ flex: 1 }}><Text style={[st.settingsRowLabel, { color: "#CC3333" }]}>Abandon Round</Text><Text style={st.settingsRowSub}>End without saving scores</Text></View>
                    <Ionicons name="chevron-forward" size={18} color="#CCC" />
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Transfer Player Picker */}
          <Modal visible={showTransferPicker} transparent animationType="slide">
            <View style={st.sheetOverlay}>
              <TouchableOpacity style={st.sheetBackdrop} activeOpacity={1} onPress={() => setShowTransferPicker(false)} />
              <View style={[st.sheetContainer, { maxHeight: 400 }]}>
                <View style={st.sheetHeader}>
                  <View style={st.sheetHandle} />
                  <Text style={st.sheetTitle}>Transfer Scoring To</Text>
                  <TouchableOpacity onPress={() => setShowTransferPicker(false)}>
                    <Image source={closeIcon} style={{ width: 22, height: 22, tintColor: "#666" }} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ paddingVertical: 8 }}>
                  {transferEligiblePlayers.map((p) => (
                    <TouchableOpacity key={p.playerId} style={st.transferPlayerRow}
                      onPress={() => {
                        setShowTransferPicker(false);
                        Alert.alert("Transfer Scoring", `Hand off scorekeeper duties to ${p.displayName}?`, [
                          { text: "Cancel", style: "cancel" },
                          { text: "Transfer", onPress: () => executeMarkerTransfer(p.playerId, p.displayName) },
                        ]);
                      }}>
                      {p.avatar ? (
                        <Image source={{ uri: p.avatar }} style={st.transferPlayerAvatar} />
                      ) : (
                        <View style={st.transferPlayerAvatarFallback}><Ionicons name="person" size={18} color="#999" /></View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={st.transferPlayerName}>{p.displayName}</Text>
                        <Text style={st.transferPlayerSub}>Tap to transfer</Text>
                      </View>
                      <Ionicons name="arrow-forward-circle-outline" size={22} color={HEADER_GREEN} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Transfer Request Alert */}
          <TransferAlertModal
            visible={transferRequestVisible}
            requestedByName={transferRequestData?.requestedByName || ""}
            onDecline={async () => {
              setTransferRequestVisible(false);
              transferRequestAlertShown.current = null;
              try { await updateDoc(doc(db, "rounds", roundId!), { markerTransferRequest: null }); soundPlayer.play("click"); }
              catch (err) { console.error("Error declining transfer:", err); }
            }}
            onApprove={() => {
              setTransferRequestVisible(false);
              transferRequestAlertShown.current = null;
              if (transferRequestData) executeMarkerTransfer(transferRequestData.requestedBy, transferRequestData.requestedByName);
            }}
          />
        </View>
      )}

      {/* ═══ ROUND SUMMARY ═══ */}
      {currentScreen === "summary" && roundId && (() => {
        const cName = fullCourseData?.courseName || fullCourseData?.course_name || "Course";
        const cId = typeof fullCourseData?.id === "string" ? parseInt(fullCourseData.id, 10) : (fullCourseData?.courseId || fullCourseData?.id || 0) as number;
        const teeHoles = selectedTee?.holes || [];
        const baseHole = holeCount === 9 && nineHoleSide === "back" ? 10 : 1;
        const order = buildPlayingOrder(startingHole, holeCount, baseHole);
        const pars = order.map((h) => teeHoles[h - 1]?.par || 4);
        return (
          <RoundSummary roundId={roundId} courseName={cName} courseId={cId} holeCount={holeCount} formatId={formatId} isSimulator={roundType === "simulator"} holePars={pars}
            players={players.map((p) => {
              let grossScore = 0, totalPar = 0;
              for (let h = 1; h <= holeCount; h++) { grossScore += holeData[String(h)]?.[p.playerId]?.strokes || 0; totalPar += pars[h - 1] || 4; }
              return { playerId: p.playerId, displayName: p.displayName, avatar: p.avatar, isGhost: p.isGhost, isMarker: p.isMarker, handicapIndex: p.handicapIndex, courseHandicap: p.courseHandicap, grossScore, netScore: grossScore - p.courseHandicap, scoreToPar: grossScore - totalPar };
            })}
            onPost={handlePostRound} onBack={() => setCurrentScreen("scorecard")} />
        );
      })()}

      {/* Submitting Overlay */}
      {submitting && (
        <View style={st.overlay}><View style={st.overlayCard}><ActivityIndicator size="large" color={GREEN} /><Text style={st.overlayText}>{submittingMessage}</Text></View></View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  loadingContainer: { flex: 1, backgroundColor: CREAM, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: WALNUT, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", fontSize: 16 },

  header: { paddingVertical: 12, paddingHorizontal: 16, backgroundColor: HEADER_GREEN, flexDirection: "row", alignItems: "center" },
  headerBackBtn: { padding: 4, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#FFF", fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", textAlign: "center" },
  headerSubtitle: { fontSize: 12, color: GOLD, marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerIconBtn: { padding: 6, position: "relative" },
  chatBadge: { position: "absolute", top: 2, right: 2, backgroundColor: "#E53935", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  chatBadgeText: { fontSize: 9, fontWeight: "800", color: "#FFF" },
  finishBtn: { backgroundColor: GOLD, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, marginLeft: 4 },
  finishBtnText: { color: WALNUT, fontWeight: "800", fontSize: 14 },

  sheetOverlay: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheetContainer: { backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%", paddingBottom: Platform.OS === "ios" ? 28 : 12 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E8E4DA" },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#DDD", position: "absolute", top: 6, left: "50%", marginLeft: -18 },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: "#333", fontFamily: Platform.OS === "ios" ? "Georgia" : "serif" },

  sheetChatList: { padding: 12, paddingBottom: 8 },
  sheetChatEmpty: { alignItems: "center", paddingVertical: 40 },
  sheetChatEmptyText: { fontSize: 14, color: "#999", marginTop: 8 },
  sheetMsgRow: { flexDirection: "row", marginBottom: 8, alignItems: "flex-end" },
  sheetMsgRowMe: { flexDirection: "row-reverse" },
  sheetMsgBubble: { maxWidth: "75%", backgroundColor: "#F0EDE4", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderBottomLeftRadius: 4 },
  sheetMsgBubbleMe: { backgroundColor: HEADER_GREEN, borderBottomLeftRadius: 14, borderBottomRightRadius: 4 },
  sheetMsgSender: { fontSize: 10, fontWeight: "700", color: WALNUT, marginBottom: 2 },
  sheetMsgText: { fontSize: 14, color: "#333", lineHeight: 19 },
  sheetMsgTextMe: { color: "#FFF" },
  sheetChatInputBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#FFF", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E8E4DA", gap: 8 },
  sheetChatInput: { flex: 1, backgroundColor: "#F5F2EB", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, fontSize: 15, maxHeight: 80 },
  sheetSendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: HEADER_GREEN, justifyContent: "center", alignItems: "center" },
  sheetSendBtnDisabled: { opacity: 0.4 },

  settingsBody: { paddingVertical: 8 },
  settingsRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  settingsRowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(20,122,82,0.08)", justifyContent: "center", alignItems: "center" },
  settingsRowLabel: { fontSize: 15, fontWeight: "600", color: "#333" },
  settingsRowSub: { fontSize: 12, color: "#999", marginTop: 1 },

  transferPlayerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E8E4DA" },
  transferPlayerAvatar: { width: 40, height: 40, borderRadius: 20 },
  transferPlayerAvatarFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#E8E4DA", justifyContent: "center", alignItems: "center" },
  transferPlayerName: { fontSize: 15, fontWeight: "700", color: "#333" },
  transferPlayerSub: { fontSize: 12, color: "#999", marginTop: 1 },

  holeSection: { alignItems: "center", paddingTop: 16, paddingBottom: 12, paddingHorizontal: 24 },
  holeSectionTitle: { fontSize: 16, fontWeight: "800", color: WALNUT, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", marginTop: 8, marginBottom: 12, textAlign: "center" },
  holeToggle: { flexDirection: "row", gap: 10 },
  holeOption: { flex: 1, backgroundColor: "#FFF", borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 2, borderColor: "#E8E4DA", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  holeOptionActive: { borderColor: GREEN, backgroundColor: "#E8F5E9" },
  holeOptionNumber: { fontSize: 26, fontWeight: "900", color: "#BBB", fontFamily: Platform.OS === "ios" ? "Georgia" : "serif" },
  holeOptionNumberActive: { color: GREEN },
  holeOptionLabel: { fontSize: 11, fontWeight: "700", color: "#BBB", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  holeOptionLabelActive: { color: GREEN },

  nineHoleRow: { flexDirection: "row", marginTop: 10, gap: 10 },
  nineHoleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: "#DDD", alignItems: "center", backgroundColor: "#FFF" },
  nineHoleBtnActive: { backgroundColor: GREEN, borderColor: GREEN },
  nineHoleBtnText: { fontSize: 13, fontWeight: "700", color: "#999" },
  nineHoleBtnTextActive: { color: "#FFF" },

  divider: { height: 1, backgroundColor: "#E0DCD4", marginHorizontal: 24, marginVertical: 2 },

  startingHoleSection: { paddingTop: 12, paddingBottom: 10 },
  startingHoleHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, marginBottom: 10 },
  startingHoleTitle: { fontSize: 15, fontWeight: "700", color: WALNUT, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif" },
  startingHoleBadge: { backgroundColor: GREEN, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  startingHoleBadgeText: { fontSize: 11, fontWeight: "700", color: "#FFF" },
  startingHoleList: { paddingHorizontal: 24, gap: 6 },
  startingHoleChip: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFF", borderWidth: 1.5, borderColor: "#E0DCD4", justifyContent: "center", alignItems: "center" },
  startingHoleChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  startingHoleChipText: { fontSize: 15, fontWeight: "700", color: "#999" },
  startingHoleChipTextActive: { color: "#FFF" },

  courseSection: { paddingTop: 12 },
  courseSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 24, marginBottom: 8 },
  courseSectionTitle: { fontSize: 16, fontWeight: "800", color: WALNUT, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif" },

  selectedCourseBar: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 24, marginBottom: 4, backgroundColor: "rgba(13,92,58,0.06)", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1.5, borderColor: "rgba(13,92,58,0.15)" },
  selectedCourseName: { flex: 1, fontSize: 15, fontWeight: "700", color: GREEN },

  roundSettingsBar: { flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 24, marginTop: 8, backgroundColor: "#FFF", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: "#E8E4DA" },
  roundSettingsLabel: { fontSize: 15, fontWeight: "700", color: "#333" },
  roundSettingsSummary: { fontSize: 12, color: "#999", marginTop: 2 },

  continueBar: { paddingHorizontal: 24, paddingTop: 10, backgroundColor: CREAM, borderTopWidth: 1, borderTopColor: "#E0DCD4" },
  continueBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: GREEN, paddingVertical: 14, borderRadius: 12 },
  continueBtnDisabled: { backgroundColor: "#E0DCD4" },
  continueBtnText: { fontSize: 16, fontWeight: "700", color: "#FFF" },
  continueBtnTextDisabled: { color: "#BBB" },

  rsLabel: { fontSize: 14, fontWeight: "700", color: WALNUT, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  rsToggle: { flexDirection: "row", gap: 10 },
  rsCard: { flex: 1, backgroundColor: "#F5F2EB", borderRadius: 12, paddingVertical: 16, alignItems: "center", gap: 6, borderWidth: 2, borderColor: "transparent" },
  rsCardActive: { backgroundColor: HEADER_GREEN, borderColor: HEADER_GREEN },
  rsCardLabel: { fontSize: 14, fontWeight: "700", color: "#555" },
  rsCardLabelActive: { color: "#FFF" },
  rsNote: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  rsNoteText: { fontSize: 12, color: "#999", flex: 1 },
  rsPrivacyList: { gap: 8 },
  rsPrivacyRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#F5F2EB", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, gap: 12, borderWidth: 2, borderColor: "transparent" },
  rsPrivacyRowActive: { borderColor: HEADER_GREEN, backgroundColor: "rgba(20,122,82,0.04)" },
  rsPrivacyIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.05)", justifyContent: "center", alignItems: "center" },
  rsPrivacyIconActive: { backgroundColor: HEADER_GREEN },
  rsPrivacyLabel: { fontSize: 14, fontWeight: "700", color: "#555" },
  rsPrivacyLabelActive: { color: "#333" },
  rsPrivacyDesc: { fontSize: 12, color: "#999", marginTop: 1 },
  rsDoneBtn: { backgroundColor: GREEN, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  rsDoneBtnText: { fontSize: 16, fontWeight: "700", color: "#FFF" },

  courseLoadingOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", zIndex: 100 },
  courseLoadingCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 28, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  courseLoadingText: { marginTop: 14, color: GREEN, fontSize: 16, fontWeight: "700" },

  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", zIndex: 1000 },
  overlayCard: { backgroundColor: "#FFF", borderRadius: 16, padding: 24, alignItems: "center", minWidth: 200 },
  overlayText: { marginTop: 12, fontSize: 16, fontWeight: "700", color: GREEN },
});