/**
 * Challenge Detail Screen
 *
 * Shows full challenge information, user's HCI bracket,
 * personalized threshold target, and register/deregister button.
 *
 * For DTP challenge: shows onboarding modal with putter diagram
 * before confirming registration.
 *
 * Route: /events/challenge/[id]
 */

import BadgeIcon from "@/components/challenges/BadgeIcon";
import DTPOnboardingModal from "@/components/challenges/DTPOnboardingModal";
import {
  ChallengeDefinition,
  ChallengeParticipant,
  CHALLENGES,
  getHCIBracket,
  getThresholdDisplay,
  getThresholdForBracket,
  HCI_BRACKETS,
  HCIBracket
} from "@/constants/challengeTypes";
import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ChallengeDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentUserId = auth.currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [challenge, setChallenge] = useState<ChallengeDefinition | null>(null);
  const [userHCI, setUserHCI] = useState<number>(20);
  const [bracket, setBracket] = useState<HCIBracket>("mid");
  const [isRegistered, setIsRegistered] = useState(false);
  const [participant, setParticipant] = useState<ChallengeParticipant | null>(null);
  const [challengeStats, setChallengeStats] = useState({
    registeredCount: 0,
    earnedCount: 0,
  });

  // DTP onboarding modal
  const [showDTPOnboarding, setShowDTPOnboarding] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    if (!id || !currentUserId) return;

    try {
      // Find challenge definition from constants
      const challengeDef = CHALLENGES.find((c) => c.id === id);
      if (!challengeDef) {
        Alert.alert("Error", "Challenge not found.");
        router.back();
        return;
      }
      setChallenge(challengeDef);

      // Get user's handicap
      const userDoc = await getDoc(doc(db, "users", currentUserId));
      if (userDoc.exists()) {
        const hci = userDoc.data().handicap ?? 20;
        setUserHCI(hci);
        setBracket(getHCIBracket(hci));
      }

      // Get challenge stats from Firestore
      const challengeDoc = await getDoc(doc(db, "challenges", id));
      if (challengeDoc.exists()) {
        const data = challengeDoc.data();
        setChallengeStats({
          registeredCount: data.registeredCount ?? 0,
          earnedCount: data.earnedCount ?? 0,
        });
      }

      // Check if user is registered
      const participantDoc = await getDoc(
        doc(db, "challenges", id, "participants", currentUserId)
      );
      if (participantDoc.exists()) {
        setIsRegistered(true);
        setParticipant(participantDoc.data() as ChallengeParticipant);
      }
    } catch (error) {
      console.error("Error loading challenge:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterPress = () => {
    if (!challenge || !currentUserId) return;

    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Show DTP onboarding for the DTP challenge
    if (challenge.type === "dtp") {
      setShowDTPOnboarding(true);
      return;
    }

    // All other challenges register directly
    performRegistration();
  };

  const performRegistration = async () => {
    if (!challenge || !currentUserId) return;

    setRegistering(true);

    try {
      const threshold = challenge.hasHCIScaling
        ? getThresholdForBracket(challenge, bracket)
        : 0;

      // Build initial progress fields based on challenge type
      const progressFields: Record<string, any> = {};
      switch (challenge.type) {
        case "par3":
          progressFields.totalPar3Holes = 0;
          progressFields.totalPar3Score = 0;
          progressFields.currentAverage = 0;
          break;
        case "fir":
          progressFields.qualifyingRounds = 0;
          progressFields.totalFairwaysHit = 0;
          progressFields.totalFairwaysPossible = 0;
          progressFields.currentPercentage = 0;
          break;
        case "gir":
          progressFields.qualifyingRounds = 0;
          progressFields.totalGreensHit = 0;
          progressFields.totalGreensPossible = 0;
          progressFields.currentPercentage = 0;
          break;
        case "birdie_streak":
          progressFields.bestStreak = 0;
          break;
        case "iron_player":
          progressFields.consecutiveCount = 0;
          progressFields.targetScore = threshold;
          break;
        case "dtp":
          progressFields.pinsHeld = 0;
          progressFields.coursesWithPins = [];
          break;
        case "ace":
          progressFields.verified = false;
          break;
      }

      // Create participant doc
      await setDoc(
        doc(db, "challenges", challenge.id, "participants", currentUserId),
        {
          registeredAt: serverTimestamp(),
          hciBracket: bracket,
          hciAtRegistration: userHCI,
          targetThreshold: threshold,
          earned: false,
          ...progressFields,
        }
      );

      // Add to user's active challenges
      await updateDoc(doc(db, "users", currentUserId), {
        activeChallenges: arrayUnion(challenge.id),
      });

      // Increment registered count
      await updateDoc(doc(db, "challenges", challenge.id), {
        registeredCount: increment(1),
      });

      setIsRegistered(true);
      setChallengeStats((prev) => ({
        ...prev,
        registeredCount: prev.registeredCount + 1,
      }));

      Alert.alert(
        "Registered! 🎯",
        `You're now tracking ${challenge.name}. Your progress will update automatically as you post rounds.`
      );
    } catch (error) {
      console.error("Registration error:", error);
      Alert.alert("Error", "Failed to register. Please try again.");
    } finally {
      setRegistering(false);
    }
  };

  const handleDeregister = async () => {
    if (!challenge || !currentUserId) return;

    Alert.alert(
      "Leave Challenge?",
      "Your progress will be lost. You can re-register later but will start from scratch.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              // Remove participant doc
              await deleteDoc(
                doc(db, "challenges", challenge.id, "participants", currentUserId)
              );

              // Remove from user's active challenges
              await updateDoc(doc(db, "users", currentUserId), {
                activeChallenges: arrayRemove(challenge.id),
              });

              // Decrement registered count
              await updateDoc(doc(db, "challenges", challenge.id), {
                registeredCount: increment(-1),
              });

              setIsRegistered(false);
              setParticipant(null);
              setChallengeStats((prev) => ({
                ...prev,
                registeredCount: Math.max(0, prev.registeredCount - 1),
              }));

              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            } catch (error) {
              console.error("Deregister error:", error);
              Alert.alert("Error", "Failed to leave challenge.");
            }
          },
        },
      ]
    );
  };

  if (loading || !challenge) {
    return (
      <View style={styles.loadingContainer}>
        <SafeAreaView edges={["top"]} style={styles.safeTop} />
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  const thresholdDisplay = challenge.hasHCIScaling
    ? getThresholdDisplay(challenge, bracket)
    : challenge.type === "dtp"
    ? "Hold ≥ 1 pin on any course"
    : "1 verified hole-in-one";

  const bracketInfo = HCI_BRACKETS.find((b) => b.key === bracket);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.replace("/events?tab=challenges" as any);
          }}
          style={styles.headerButton}
        >
          <Image
            source={require("@/assets/icons/Back.png")}
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Challenge</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Badge + Name */}
        <View style={styles.heroSection}>
          <BadgeIcon badgeId={challenge.id} size={72} />
          <Text style={styles.challengeName}>{challenge.name}</Text>
          <Text style={styles.challengeDesc}>{challenge.description}</Text>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{challengeStats.registeredCount}</Text>
            <Text style={styles.statLabel}>Registered</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{challengeStats.earnedCount}</Text>
            <Text style={styles.statLabel}>Earned</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {challenge.minSample}
            </Text>
            <Text style={styles.statLabel}>{challenge.minSampleUnit}</Text>
          </View>
        </View>

        {/* Your Target */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Target</Text>

          {challenge.hasHCIScaling ? (
            <>
              <View style={styles.targetRow}>
                <Text style={styles.targetValue}>{thresholdDisplay}</Text>
              </View>
              <View style={styles.bracketInfo}>
                <Ionicons name="speedometer-outline" size={16} color="#888" />
                <Text style={styles.bracketText}>
                  HCI {userHCI} → {bracketInfo?.label} bracket ({bracketInfo?.min}–{bracketInfo?.max})
                </Text>
              </View>

              {/* Show all brackets for reference */}
              <View style={styles.bracketTable}>
                {HCI_BRACKETS.map((b) => (
                  <View
                    key={b.key}
                    style={[
                      styles.bracketRow,
                      b.key === bracket && styles.bracketRowActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bracketLabel,
                        b.key === bracket && styles.bracketLabelActive,
                      ]}
                    >
                      {b.label} ({b.min}–{b.max})
                    </Text>
                    <Text
                      style={[
                        styles.bracketThreshold,
                        b.key === bracket && styles.bracketThresholdActive,
                      ]}
                    >
                      {getThresholdDisplay(challenge, b.key)}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.targetRow}>
              <Text style={styles.targetValue}>{thresholdDisplay}</Text>
            </View>
          )}
        </View>

        {/* Progress (if registered) */}
        {isRegistered && participant && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your Progress</Text>
            {renderProgress(challenge, participant)}
          </View>
        )}

        {/* Register / Deregister Button */}
        <View style={styles.actionSection}>
          {isRegistered ? (
            <>
              <View style={styles.registeredBanner}>
                <Ionicons name="checkmark-circle" size={20} color="#0D5C3A" />
                <Text style={styles.registeredText}>
                  You're registered — progress tracks automatically
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deregisterButton}
                onPress={handleDeregister}
              >
                <Text style={styles.deregisterText}>Leave Challenge</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.registerButton}
              onPress={handleRegisterPress}
              disabled={registering}
            >
              {registering ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="flag" size={18} color="#FFF" />
                  <Text style={styles.registerText}>Register for Challenge</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* DTP Onboarding Modal */}
      <DTPOnboardingModal
        visible={showDTPOnboarding}
        onConfirm={() => {
          setShowDTPOnboarding(false);
          performRegistration();
        }}
        onClose={() => setShowDTPOnboarding(false)}
      />
    </View>
  );
}

// ============================================================================
// PROGRESS RENDERER
// ============================================================================

function renderProgress(
  challenge: ChallengeDefinition,
  participant: ChallengeParticipant
) {
  if (participant.earned) {
    return (
      <View style={styles.progressEarned}>
        <Ionicons name="trophy" size={24} color="#FFD700" />
        <Text style={styles.progressEarnedText}>Badge Earned!</Text>
      </View>
    );
  }

  switch (challenge.type) {
    case "par3": {
      const holes = participant.totalPar3Holes ?? 0;
      const avg = participant.currentAverage ?? 0;
      const pct = Math.min(holes / challenge.minSample, 1);
      return (
        <View style={styles.progressBlock}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${pct * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {holes}/{challenge.minSample} par 3 holes — Avg {avg.toFixed(1)}
          </Text>
        </View>
      );
    }

    case "fir": {
      const rounds = participant.qualifyingRounds ?? 0;
      const pct = participant.currentPercentage ?? 0;
      const progress = Math.min(rounds / challenge.minSample, 1);
      return (
        <View style={styles.progressBlock}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {rounds}/{challenge.minSample} rounds — FIR {pct.toFixed(0)}%
          </Text>
        </View>
      );
    }

    case "gir": {
      const rounds = participant.qualifyingRounds ?? 0;
      const pct = participant.currentPercentage ?? 0;
      const progress = Math.min(rounds / challenge.minSample, 1);
      return (
        <View style={styles.progressBlock}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {rounds}/{challenge.minSample} rounds — GIR {pct.toFixed(0)}%
          </Text>
        </View>
      );
    }

    case "birdie_streak": {
      const best = participant.bestStreak ?? 0;
      const target = participant.targetThreshold;
      return (
        <View style={styles.progressBlock}>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(best / target, 1) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            Best streak: {best} consecutive (Target: {target})
          </Text>
        </View>
      );
    }

    case "iron_player": {
      const count = participant.consecutiveCount ?? 0;
      return (
        <View style={styles.progressBlock}>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${(count / 5) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {count}/5 consecutive rounds under {participant.targetScore}
          </Text>
        </View>
      );
    }

    case "dtp": {
      const pins = participant.pinsHeld ?? 0;
      return (
        <View style={styles.progressBlock}>
          <Text style={styles.progressText}>
            📍 Holding {pins} pin{pins !== 1 ? "s" : ""} across courses
          </Text>
        </View>
      );
    }

    case "ace": {
      return (
        <View style={styles.progressBlock}>
          <Text style={styles.progressText}>
            {participant.verified ? "✅ Verified!" : "0/1 verified hole-in-one"}
          </Text>
        </View>
      );
    }

    default:
      return null;
  }
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  safeTop: { backgroundColor: "#0D5C3A" },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F4EED8",
    justifyContent: "center",
    alignItems: "center",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  backIcon: { width: 24, height: 24, tintColor: "#FFF" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#FFF" },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },

  // Hero
  heroSection: { alignItems: "center", gap: 12, paddingVertical: 8 },
  challengeName: { fontSize: 22, fontWeight: "800", color: "#333", textAlign: "center" },
  challengeDesc: { fontSize: 14, color: "#666", textAlign: "center", lineHeight: 20, paddingHorizontal: 8 },

  // Stats row
  statsRow: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 20, fontWeight: "800", color: "#333" },
  statLabel: { fontSize: 11, color: "#888" },
  statDivider: { width: 1, height: 30, backgroundColor: "#E0E0E0" },

  // Cards
  card: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#333" },

  // Target
  targetRow: {
    backgroundColor: "rgba(13, 92, 58, 0.06)",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  targetValue: { fontSize: 18, fontWeight: "800", color: "#0D5C3A" },
  bracketInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bracketText: { fontSize: 12, color: "#888" },

  // Bracket table
  bracketTable: { gap: 4, marginTop: 4 },
  bracketRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  bracketRowActive: { backgroundColor: "rgba(13, 92, 58, 0.08)" },
  bracketLabel: { fontSize: 12, color: "#999" },
  bracketLabelActive: { color: "#0D5C3A", fontWeight: "700" },
  bracketThreshold: { fontSize: 12, color: "#999" },
  bracketThresholdActive: { color: "#0D5C3A", fontWeight: "700" },

  // Progress
  progressBlock: { gap: 8 },
  progressBarBg: {
    height: 8,
    backgroundColor: "#E8E8E8",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 8,
    backgroundColor: "#0D5C3A",
    borderRadius: 4,
  },
  progressText: { fontSize: 13, color: "#666" },
  progressEarned: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 8,
  },
  progressEarnedText: { fontSize: 16, fontWeight: "700", color: "#333" },

  // Action section
  actionSection: { gap: 12 },
  registerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    paddingVertical: 14,
    borderRadius: 24,
  },
  registerText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  registeredBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(13, 92, 58, 0.08)",
    padding: 14,
    borderRadius: 12,
  },
  registeredText: { fontSize: 13, color: "#0D5C3A", fontWeight: "600", flex: 1 },
  deregisterButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  deregisterText: { fontSize: 13, color: "#999" },
});