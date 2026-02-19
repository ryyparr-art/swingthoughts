/**
 * LiveRoundFAB — Compact floating pill for active live rounds
 *
 * Appears on the clubhouse screen when the user is part of a live round.
 * Walnut pill with pulsing dot, stacked layout:
 *   ● LIVE | Hole 5
 *     Meadowlands GC       ›
 *
 * File: components/scoring/LiveRoundFAB.tsx
 */

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { soundPlayer } from "@/utils/soundPlayer";
import { useActiveRound } from "@/hooks/useLiveRound";

// ============================================================================
// COMPONENT
// ============================================================================

interface LiveRoundFABProps {
  userId: string;
}

export default function LiveRoundFAB({ userId }: LiveRoundFABProps) {
  const router = useRouter();
  const { activeRoundId, activeRoundInfo, isChecking } = useActiveRound(userId);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(80)).current;

  // ── Pulse animation loop ──────────────────────────────────
  useEffect(() => {
    if (!activeRoundId) return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.4,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [activeRoundId]);

  // ── Slide in/out ──────────────────────────────────────────
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: activeRoundId ? 0 : 80,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [activeRoundId]);

  if (isChecking || !activeRoundId || !activeRoundInfo) return null;

  const handlePress = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/round/${activeRoundId}` as any);
  };

  return (
    <Animated.View
      style={[
        s.container,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <TouchableOpacity style={s.fab} onPress={handlePress} activeOpacity={0.85}>
        {/* Pulsing dot */}
        <View style={s.dotContainer}>
          <Animated.View
            style={[
              s.pulseRing,
              { transform: [{ scale: pulseAnim }] },
            ]}
          />
          <View style={s.dot} />
        </View>

        {/* Stacked info */}
        <View style={s.info}>
          <View style={s.topRow}>
            <Text style={s.liveLabel}>LIVE</Text>
            <View style={s.divider} />
            <Text style={s.holeText}>Hole {activeRoundInfo.currentHole}</Text>
          </View>
          <Text style={s.courseName} numberOfLines={1}>
            {activeRoundInfo.courseName}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={16} color="#C5A55A" />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const s = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 72 : 100,
    left: 16,
    zIndex: 50,
  },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4A3628",
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    gap: 8,
  },

  // ── Pulsing Dot ─────────────────────────────────────────────
  dotContainer: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseRing: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(76, 175, 80, 0.3)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
  },

  // ── Info ────────────────────────────────────────────────────
  info: {
    gap: 1,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#C5A55A",
    letterSpacing: 0.8,
  },
  divider: {
    width: 1,
    height: 10,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  holeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFF",
  },
  courseName: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.6)",
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    maxWidth: 160,
  },
});