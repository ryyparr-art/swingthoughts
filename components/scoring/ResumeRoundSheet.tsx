/**
 * ResumeRoundSheet — Modal that appears when user has an active round.
 *
 * Triggered on:
 *   - App mount (initial load)
 *   - App returning to foreground (AppState listener)
 *
 * Checks for any round doc where:
 *   - markerId == currentUser
 *   - status == "live"
 *
 * Actions:
 *   - Resume → navigates to /scoring?roundId=X&resume=true
 *   - Abandon → writes status: "abandoned" to round doc
 *
 * No dismiss — user must make a decision.
 *
 * File: components/scoring/ResumeRoundSheet.tsx
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  AppStateStatus,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ============================================================================
// TYPES
// ============================================================================

interface ActiveRound {
  roundId: string;
  courseName: string;
  courseId: number;
  formatId: string;
  holeCount: number;
  playerCount: number;
  holesCompleted: number;
  startedAt: number; // epoch ms
  players: {
    displayName: string;
    avatar?: string | null;
  }[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GREEN = "#0D5C3A";

const FORMAT_LABELS: Record<string, string> = {
  stroke_play: "Stroke Play",
  individual_stableford: "Stableford",
  par_bogey: "Par/Bogey",
  match_play: "Match Play",
  four_ball: "Four-Ball",
  foursomes: "Foursomes",
  scramble: "Scramble",
  best_ball: "Best Ball",
  skins: "Skins",
  nassau: "Nassau",
};

// ============================================================================
// HELPERS
// ============================================================================

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function countCompletedHoles(
  holeData: Record<string, any> | undefined
): number {
  if (!holeData) return 0;
  return Object.keys(holeData).length;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ResumeRoundSheet() {
  const router = useRouter();
  const [activeRound, setActiveRound] = useState<ActiveRound | null>(null);
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const appState = useRef(AppState.currentState);
  const hasCheckedOnMount = useRef(false);

  // ── Check for active rounds ───────────────────────────────
  const checkForActiveRound = useCallback(async () => {
    const userId = auth.currentUser?.uid;
    if (!userId || checking) return;

    setChecking(true);
    try {
      const roundsQuery = query(
        collection(db, "rounds"),
        where("markerId", "==", userId),
        where("status", "==", "live"),
        orderBy("startedAt", "desc"),
        limit(1)
      );

      const snap = await getDocs(roundsQuery);

      if (snap.empty) {
        setActiveRound(null);
        setVisible(false);
        setChecking(false);
        return;
      }

      const docSnap = snap.docs[0];
      const d = docSnap.data();

      const startedAt = d.startedAt?.toMillis?.() || Date.now();

      // If older than 12 hours, skip — cleanup function handles it
      if (Date.now() - startedAt > 12 * 60 * 60 * 1000) {
        setActiveRound(null);
        setVisible(false);
        setChecking(false);
        return;
      }

      const round: ActiveRound = {
        roundId: docSnap.id,
        courseName: d.courseName || "Unknown Course",
        courseId: d.courseId,
        formatId: d.formatId || "stroke_play",
        holeCount: d.holeCount || 18,
        playerCount: d.players?.length || 1,
        holesCompleted: countCompletedHoles(d.holeData),
        startedAt,
        players: (d.players || []).map((p: any) => ({
          displayName: p.displayName || "Unknown",
          avatar: p.avatar || null,
        })),
      };

      setActiveRound(round);
      setVisible(true);
    } catch (error) {
      console.error("Error checking for active rounds:", error);
    } finally {
      setChecking(false);
    }
  }, [checking]);

  // ── Initial mount check ───────────────────────────────────
  useEffect(() => {
    if (!hasCheckedOnMount.current) {
      hasCheckedOnMount.current = true;
      const timer = setTimeout(() => {
        checkForActiveRound();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  // ── AppState listener (foreground resume) ─────────────────
  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextState === "active"
        ) {
          checkForActiveRound();
        }
        appState.current = nextState;
      }
    );

    return () => subscription.remove();
  }, [checkForActiveRound]);

  // ── Resume ────────────────────────────────────────────────
  const handleResume = () => {
    if (!activeRound) return;
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setVisible(false);
    setActiveRound(null);

    router.push({
      pathname: "/scoring" as any,
      params: {
        roundId: activeRound.roundId,
        resume: "true",
      },
    });
  };

  // ── Abandon ───────────────────────────────────────────────
  const handleAbandon = () => {
    if (!activeRound) return;
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(
      "Abandon Round?",
      `Your round at ${activeRound.courseName} will be discarded. This cannot be undone.`,
      [
        { text: "Keep Round", style: "cancel" },
        {
          text: "Abandon",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "rounds", activeRound.roundId), {
                status: "abandoned",
              });
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success
              );
              setVisible(false);
              setActiveRound(null);
            } catch (err) {
              console.error("Error abandoning round:", err);
              Alert.alert(
                "Error",
                "Failed to abandon round. Please try again."
              );
            }
          },
        },
      ]
    );
  };

  if (!activeRound) return null;

  const holesLeft = activeRound.holeCount - activeRound.holesCompleted;
  const progress = activeRound.holesCompleted / activeRound.holeCount;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        // Android back button — treat as resume
        handleResume();
      }}
    >
      <View style={s.container}>
        {/* Handle indicator (decorative) */}
        <View style={s.handleRow}>
          <View style={s.handle} />
        </View>

        {/* Header */}
        <View style={s.headerRow}>
          <View style={s.headerIcon}>
            <Text style={{ fontSize: 20 }}>⛳</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Round in Progress</Text>
            <Text style={s.headerSubtitle}>
              Started {formatTimeAgo(activeRound.startedAt)}
            </Text>
          </View>
        </View>

        {/* Course card */}
        <View style={s.courseCard}>
          <Text style={s.courseName}>{activeRound.courseName}</Text>
          <Text style={s.courseMeta}>
            {activeRound.holeCount} holes •{" "}
            {FORMAT_LABELS[activeRound.formatId] || activeRound.formatId}
          </Text>

          {/* Progress bar */}
          <View style={s.progressContainer}>
            <View style={s.progressBar}>
              <View
                style={[
                  s.progressFill,
                  { width: `${Math.round(progress * 100)}%` },
                ]}
              />
            </View>
            <Text style={s.progressLabel}>
              <Text style={s.progressBold}>
                {activeRound.holesCompleted}
              </Text>{" "}
              of {activeRound.holeCount} holes •{" "}
              <Text style={s.progressBold}>{holesLeft}</Text> remaining
            </Text>
          </View>

          {/* Players */}
          <View style={s.playersRow}>
            <View style={s.avatarStack}>
              {activeRound.players.slice(0, 4).map((p, i) => (
                <View
                  key={i}
                  style={[s.avatarWrap, i > 0 && { marginLeft: -8 }]}
                >
                  {p.avatar ? (
                    <Image
                      source={{ uri: p.avatar }}
                      style={s.stackAvatar}
                    />
                  ) : (
                    <View
                      style={[s.stackAvatar, s.stackAvatarFallback]}
                    >
                      <Text style={s.stackAvatarText}>
                        {p.displayName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
            <Text style={s.playersText}>
              {activeRound.playerCount === 1
                ? "Solo round"
                : `${activeRound.playerCount} players`}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={s.actions}>
          <TouchableOpacity
            style={s.resumeBtn}
            onPress={handleResume}
            activeOpacity={0.8}
          >
            <Ionicons name="play" size={18} color="#FFF" />
            <Text style={s.resumeBtnText}>Resume Round</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.abandonBtn}
            onPress={handleAbandon}
            activeOpacity={0.7}
          >
            <Text style={s.abandonBtnText}>Abandon Round</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF",
    paddingHorizontal: 20,
    gap: 16,
  },

  // Handle (decorative)
  handleRow: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
  },

  // Header
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(13,92,58,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },

  // Course card
  courseCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    gap: 10,
  },
  courseName: {
    fontSize: 15,
    fontWeight: "700",
    color: GREEN,
  },
  courseMeta: {
    fontSize: 12,
    color: "#999",
    marginTop: -6,
  },

  // Progress
  progressContainer: {
    gap: 6,
  },
  progressBar: {
    height: 6,
    backgroundColor: "#E8E4DA",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    backgroundColor: GREEN,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 12,
    color: "#888",
  },
  progressBold: {
    fontWeight: "700",
    color: "#555",
  },

  // Players
  playersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarWrap: {
    zIndex: 1,
  },
  stackAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#FFF",
  },
  stackAvatarFallback: {
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  stackAvatarText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 11,
  },
  playersText: {
    fontSize: 12,
    color: "#888",
    fontWeight: "500",
  },

  // Actions
  actions: {
    gap: 10,
    marginTop: 4,
  },
  resumeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GREEN,
    paddingVertical: 14,
    borderRadius: 12,
  },
  resumeBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
  abandonBtn: {
    alignItems: "center",
    paddingVertical: 12,
  },
  abandonBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#E53935",
  },
});