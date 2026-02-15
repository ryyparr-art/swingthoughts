/**
 * Challenges Tab — Badge Shelf
 *
 * Trophy case / clubhouse wall aesthetic.
 * Badges displayed as a visual collection rather than a list.
 *
 * Badge states:
 *   - Earned: full color with subtle glow + checkmark
 *   - Active (in progress): full color with progress ring
 *   - Available (not registered): greyed/dimmed + lock
 *   - Tier locked: greyed with "X/N needed"
 *   - Tier earned: full color + checkmark
 *
 * Info icon next to "Challenges" header explains how it works.
 * Each badge shows scarcity indicator ("X earned" or "Be the first").
 * Tapping any badge navigates to the challenge detail screen.
 */

import BadgeIcon from "@/components/challenges/BadgeIcon";
import BadgeRow from "@/components/challenges/BadgeRow";
import ChallengeBadgePickerModal from "@/components/challenges/ChallengeBadgePickerModal";
import {
  CHALLENGES,
  ChallengeDefinition,
  ChallengeParticipant,
  CUMULATIVE_TIERS,
  countActiveBadges,
  getHCIBracket,
} from "@/constants/challengeTypes";
import { db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Circle } from "react-native-svg";

interface ChallengesProps {
  userId: string;
}

type BadgeState = "earned" | "active" | "available";

interface BadgeShelfItem {
  definition: ChallengeDefinition;
  state: BadgeState;
  participant?: ChallengeParticipant;
  earnedCount: number;
  progressPct: number; // 0-1 for progress ring
}

interface TierShelfItem {
  id: string;
  name: string;
  requiredBadges: number;
  earned: boolean;
  activeBadgeCount: number;
}

export default function Challenges({ userId }: ChallengesProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [badges, setBadges] = useState<BadgeShelfItem[]>([]);
  const [tiers, setTiers] = useState<TierShelfItem[]>([]);

  // Badge picker state
  const [showBadgePicker, setShowBadgePicker] = useState(false);
  const [earnedBadgeIds, setEarnedBadgeIds] = useState<string[]>([]);
  const [selectedBadgeIds, setSelectedBadgeIds] = useState<string[]>([]);

  useEffect(() => {
    if (userId) loadChallenges();
  }, [userId]);

  // Show info alert on first visit
  useEffect(() => {
    const checkFirstVisit = async () => {
      try {
        const hasVisited = await AsyncStorage.getItem("challenges_tab_visited");
        if (!hasVisited) {
          Alert.alert(
            "How Challenges Work",
            "Tap any badge to learn more and register. Your progress tracks automatically as you post rounds.\n\nEarned badges appear next to your name across SwingThoughts."
          );
          await AsyncStorage.setItem("challenges_tab_visited", "true");
        }
      } catch (error) {
        // Silently fail — not critical
      }
    };
    checkFirstVisit();
  }, []);

  const loadChallenges = async () => {
    try {
      // Get user data
      const userDoc = await getDoc(doc(db, "users", userId));
      const userData = userDoc.exists() ? userDoc.data() : {};
      const activeIds: string[] = userData.activeChallenges ?? [];
      const earnedIds: string[] = userData.earnedChallengeBadges ?? [];
      const dtpPinsHeld: number = userData.dtpPinsHeld ?? 0;

      setEarnedBadgeIds(earnedIds);
      setSelectedBadgeIds(userData.challengeBadges ?? []);

      // Fetch earnedCount for all challenges in one batch
      const earnedCounts: Record<string, number> = {};
      const challengeDocsSnap = await getDocs(collection(db, "challenges"));
      challengeDocsSnap.forEach((d) => {
        earnedCounts[d.id] = d.data().earnedCount ?? 0;
      });

      // Build badge shelf items
      const shelfItems: BadgeShelfItem[] = [];

      for (const challengeDef of CHALLENGES) {
        const isEarned = earnedIds.includes(challengeDef.id);
        const isActive = activeIds.includes(challengeDef.id);
        let participant: ChallengeParticipant | undefined;
        let progressPct = 0;

        if (isActive || isEarned) {
          const participantDoc = await getDoc(
            doc(db, "challenges", challengeDef.id, "participants", userId)
          );
          if (participantDoc.exists()) {
            participant = participantDoc.data() as ChallengeParticipant;
            progressPct = calculateProgress(challengeDef, participant);
          }
        }

        let state: BadgeState = "available";
        if (isEarned) {
          state = "earned";
          progressPct = 1;
        } else if (isActive) {
          state = "active";
        }

        shelfItems.push({
          definition: challengeDef,
          state,
          participant,
          earnedCount: earnedCounts[challengeDef.id] ?? 0,
          progressPct,
        });
      }

      setBadges(shelfItems);

      // Build tier items
      const activeBadgeCount = countActiveBadges(earnedIds, dtpPinsHeld);
      const tierItems: TierShelfItem[] = CUMULATIVE_TIERS.map((tier) => ({
        id: tier.id,
        name: tier.name,
        requiredBadges: tier.requiredBadges,
        earned: earnedIds.includes(tier.id),
        activeBadgeCount,
      }));
      setTiers(tierItems);
    } catch (error) {
      console.error("Error loading challenges:", error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await loadChallenges();
    setRefreshing(false);
  };

  const navigateToChallenge = (id: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/events/challenge/[id]" as any,
      params: { id },
    });
  };

  const handleSaveBadges = async (ids: string[]) => {
    try {
      await updateDoc(doc(db, "users", userId), {
        challengeBadges: ids,
      });
      setSelectedBadgeIds(ids);
    } catch (error) {
      console.error("Error saving badge selection:", error);
    }
  };

  const hasEarnedBadges = earnedBadgeIds.length > 0;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0D5C3A"
            colors={["#0D5C3A"]}
          />
        }
      >
        {/* Badge Display Card — earned badge picker */}
        {hasEarnedBadges ? (
          <TouchableOpacity
            style={styles.badgeDisplayCard}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowBadgePicker(true);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.badgeDisplayLeft}>
              <View style={styles.badgeDisplayHeader}>
                <Ionicons name="ribbon" size={18} color="#0D5C3A" />
                <Text style={styles.badgeDisplayTitle}>Your Display Badges</Text>
              </View>
              {selectedBadgeIds.length > 0 ? (
                <View style={styles.badgePreviewRow}>
                  <BadgeRow challengeBadges={selectedBadgeIds} size={22} gap={4} />
                  <Text style={styles.badgeCount}>
                    {selectedBadgeIds.length}/3 selected
                  </Text>
                </View>
              ) : (
                <Text style={styles.badgeDisplayHint}>
                  Tap to choose badges to show next to your name
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color="#CCC" />
          </TouchableOpacity>
        ) : (
          <View style={styles.badgeLockedCard}>
            <View style={styles.badgeLockedIconRow}>
              <View style={styles.badgeLockedCircle}>
                <Ionicons name="lock-closed" size={14} color="#BBB" />
              </View>
              <View style={styles.badgeLockedCircle}>
                <Ionicons name="lock-closed" size={14} color="#BBB" />
              </View>
              <View style={styles.badgeLockedCircle}>
                <Ionicons name="lock-closed" size={14} color="#BBB" />
              </View>
            </View>
            <View style={styles.badgeLockedInfo}>
              <Text style={styles.badgeLockedTitle}>Display Badges</Text>
              <Text style={styles.badgeLockedHint}>
                Complete challenges to earn badges that appear next to your name
              </Text>
            </View>
          </View>
        )}

        {/* Badge Shelf — Challenges */}
        <View style={styles.shelfSection}>
          <View style={styles.shelfHeader}>
            <Text style={styles.shelfTitle}>Challenges</Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Alert.alert(
                  "How Challenges Work",
                  "Tap any badge to learn more and register. Your progress tracks automatically as you post rounds.\n\nEarned badges appear next to your name across SwingThoughts."
                );
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="information-circle-outline" size={20} color="#999" />
            </TouchableOpacity>
          </View>
          <View style={styles.shelfGrid}>
            {badges.map((badge) => (
              <TouchableOpacity
                key={badge.definition.id}
                style={styles.shelfItem}
                onPress={() => navigateToChallenge(badge.definition.id)}
                activeOpacity={0.7}
              >
                {/* Badge with optional progress ring */}
                <View style={styles.badgeWrapper}>
                  {badge.state === "active" && badge.progressPct > 0 && (
                    <ProgressRing progress={badge.progressPct} size={66} />
                  )}
                  {badge.state === "earned" && (
                    <View style={styles.earnedGlow} />
                  )}
                  <View
                    style={[
                      styles.badgeIconContainer,
                      badge.state === "available" && styles.badgeDimmed,
                    ]}
                  >
                    <BadgeIcon badgeId={badge.definition.id} size={52} />
                  </View>
                  {badge.state === "available" && (
                    <View style={styles.lockOverlay}>
                      <Ionicons name="lock-closed" size={12} color="#999" />
                    </View>
                  )}
                  {badge.state === "earned" && (
                    <View style={styles.checkOverlay}>
                      <Ionicons name="checkmark-circle" size={16} color="#0D5C3A" />
                    </View>
                  )}
                </View>

                {/* Name */}
                <Text
                  style={[
                    styles.badgeName,
                    badge.state === "available" && styles.badgeNameDimmed,
                  ]}
                  numberOfLines={2}
                >
                  {badge.definition.name}
                </Text>

                {/* Scarcity */}
                <Text style={styles.badgeEarnedCount}>
                  {badge.earnedCount === 0
                    ? "Be the first"
                    : `${badge.earnedCount} earned`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Milestones — Cumulative Tiers */}
        <View style={styles.shelfSection}>
          <View style={styles.milestoneDivider}>
            <View style={styles.dividerLine} />
            <Text style={styles.milestoneLabel}>Milestones</Text>
            <View style={styles.dividerLine} />
          </View>
          <View style={styles.tierRow}>
            {tiers.map((tier) => (
              <View key={tier.id} style={styles.tierItem}>
                <View style={styles.badgeWrapper}>
                  {tier.earned && <View style={styles.earnedGlow} />}
                  <View
                    style={[
                      styles.badgeIconContainer,
                      !tier.earned && styles.badgeDimmed,
                    ]}
                  >
                    <BadgeIcon badgeId={tier.id} size={52} />
                  </View>
                  {tier.earned && (
                    <View style={styles.checkOverlay}>
                      <Ionicons name="checkmark-circle" size={16} color="#0D5C3A" />
                    </View>
                  )}
                  {!tier.earned && (
                    <View style={styles.lockOverlay}>
                      <Ionicons name="lock-closed" size={12} color="#999" />
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.badgeName,
                    !tier.earned && styles.badgeNameDimmed,
                  ]}
                  numberOfLines={2}
                >
                  {tier.name}
                </Text>
                <Text style={styles.tierProgress}>
                  {tier.earned
                    ? "Achieved"
                    : `${Math.min(tier.activeBadgeCount, tier.requiredBadges)}/${tier.requiredBadges} badges`}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Badge Picker Modal */}
      <ChallengeBadgePickerModal
        visible={showBadgePicker}
        earnedBadgeIds={earnedBadgeIds}
        selectedBadgeIds={selectedBadgeIds}
        onClose={() => setShowBadgePicker(false)}
        onSave={handleSaveBadges}
      />
    </>
  );
}

// ============================================================================
// PROGRESS RING
// ============================================================================

function ProgressRing({
  progress,
  size,
}: {
  progress: number;
  size: number;
}) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(progress, 1));

  return (
    <View style={[styles.progressRing, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(13, 92, 58, 0.12)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#0D5C3A"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
    </View>
  );
}

// ============================================================================
// PROGRESS CALCULATOR
// ============================================================================

function calculateProgress(
  challenge: ChallengeDefinition,
  participant: ChallengeParticipant
): number {
  if (participant.earned) return 1;

  switch (challenge.type) {
    case "par3": {
      const holes = participant.totalPar3Holes ?? 0;
      return Math.min(holes / challenge.minSample, 1);
    }
    case "fir":
    case "gir": {
      const rounds = participant.qualifyingRounds ?? 0;
      return Math.min(rounds / challenge.minSample, 1);
    }
    case "birdie_streak": {
      const best = participant.bestStreak ?? 0;
      const target = participant.targetThreshold ?? 3;
      return Math.min(best / target, 1);
    }
    case "iron_player": {
      const count = participant.consecutiveCount ?? 0;
      return Math.min(count / 5, 1);
    }
    case "dtp": {
      const pins = participant.pinsHeld ?? 0;
      return pins > 0 ? 1 : 0;
    }
    case "ace": {
      return participant.verified ? 1 : 0;
    }
    default:
      return 0;
  }
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  content: { padding: 16, gap: 24 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Badge display card (picker)
  badgeDisplayCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "rgba(13, 92, 58, 0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  badgeDisplayLeft: { flex: 1, gap: 8 },
  badgeDisplayHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  badgeDisplayTitle: { fontSize: 15, fontWeight: "700", color: "#0D5C3A" },
  badgePreviewRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  badgeCount: { fontSize: 12, color: "#888" },
  badgeDisplayHint: { fontSize: 12, color: "#999" },

  // Locked badge card
  badgeLockedCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderStyle: "dashed",
    gap: 14,
    opacity: 0.85,
  },
  badgeLockedIconRow: { flexDirection: "row", gap: 4 },
  badgeLockedCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLockedInfo: { flex: 1, gap: 2 },
  badgeLockedTitle: { fontSize: 15, fontWeight: "700", color: "#999" },
  badgeLockedHint: { fontSize: 12, color: "#BBB", lineHeight: 16 },

  // Shelf section
  shelfSection: { gap: 14 },
  shelfHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  shelfTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    letterSpacing: 0.3,
  },

  // Badge grid — 4 columns
  shelfGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 6,
  },

  // Individual badge tile
  shelfItem: {
    width: "23.5%",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },

  // Badge wrapper — holds icon, ring, overlays
  badgeWrapper: {
    width: 66,
    height: 66,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  badgeIconContainer: {
    position: "absolute",
  },

  badgeDimmed: {
    opacity: 0.3,
  },

  // Earned glow effect
  earnedGlow: {
    position: "absolute",
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "rgba(13, 92, 58, 0.08)",
    borderWidth: 2,
    borderColor: "rgba(13, 92, 58, 0.2)",
  },

  // Progress ring (wraps around badge)
  progressRing: {
    position: "absolute",
  },

  // Lock overlay for available badges
  lockOverlay: {
    position: "absolute",
    bottom: 0,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#F4EED8",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  // Check overlay for earned badges
  checkOverlay: {
    position: "absolute",
    bottom: 0,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },

  // Badge name
  badgeName: {
    fontSize: 11,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
    lineHeight: 14,
  },
  badgeNameDimmed: {
    color: "#AAA",
  },

  // Scarcity count
  badgeEarnedCount: {
    fontSize: 9,
    color: "#999",
    marginTop: 2,
    textAlign: "center",
  },

  // Milestones divider
  milestoneDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  milestoneLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#999",
    letterSpacing: 1,
    textTransform: "uppercase",
  },

  // Tier row — 3 columns centered
  tierRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },

  tierItem: {
    width: "30%",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },

  tierProgress: {
    fontSize: 9,
    color: "#999",
    marginTop: 2,
    textAlign: "center",
  },
});