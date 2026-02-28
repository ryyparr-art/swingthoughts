/**
 * FeedDiscoveryCarousel
 *
 * Horizontal scrollable discovery card inserted between feed posts.
 * Renders different item cards based on subtype:
 *   - challenges: Badge icons with scarcity counts (tap to register inline)
 *   - leagues: League avatar + info + CTA
 *   - courses: Course hero with avatar
 *   - partners: Avatar + context + Add button
 *   - dtp_pins: Green cards with pin status
 *   - rivalry_nudges: Engagement nudges for active rivalries
 *
 * Dismissible via ✕ button. Dismiss state persisted in AsyncStorage.
 */

import BadgeIcon from "@/components/challenges/BadgeIcon";
import {
  CHALLENGES,
  getHCIBracket,
  getThresholdForBracket,
} from "@/constants/challengeTypes";
import { auth, db } from "@/constants/firebaseConfig";
import {
  DiscoveryChallengeItem,
  DiscoveryCourseItem,
  DiscoveryDTPItem,
  DiscoveryInsert,
  DiscoveryLeagueItem,
  DiscoveryPartnerItem,
  DiscoveryRivalryNudgeItem,
} from "@/utils/feedInsertTypes";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import {
  arrayUnion,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

interface Props {
  insert: DiscoveryInsert;
}

export default function FeedDiscoveryCarousel({ insert }: Props) {
  const router = useRouter();

  const renderItem = ({ item }: { item: any }) => {
    switch (insert.subtype) {
      case "challenges":
        return <ChallengeCard item={item as DiscoveryChallengeItem} onRegistered={handleChallengeRegistered} />;
      case "leagues":
        return <LeagueCard item={item as DiscoveryLeagueItem} />;
      case "courses":
        return <CourseCard item={item as DiscoveryCourseItem} />;
      case "partners":
        return <PartnerCard item={item as DiscoveryPartnerItem} />;
      case "dtp_pins":
        return <DTPCard item={item as DiscoveryDTPItem} />;
      case "rivalry_nudges":
        return <RivalryNudgeCard item={item as DiscoveryRivalryNudgeItem} />;
      default:
        return null;
    }
  };

  // When a challenge card registers successfully, remove it from the carousel
  const [hiddenChallenges, setHiddenChallenges] = useState<Set<string>>(new Set());

  const handleChallengeRegistered = (challengeId: string) => {
    setHiddenChallenges((prev) => {
      const next = new Set(prev);
      next.add(challengeId);
      return next;
    });
  };

  // Filter out registered challenges from items
  const visibleItems = insert.subtype === "challenges"
    ? insert.items.filter((item: any) => !hiddenChallenges.has(item.id))
    : insert.items;

  // If all challenge cards are gone, hide the whole carousel
  if (visibleItems.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{insert.title}</Text>
      </View>

      <FlatList
        data={visibleItems}
        renderItem={renderItem}
        keyExtractor={(item: any) => item.id || item.courseId || item.userId}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
        removeClippedSubviews={false}
        initialNumToRender={4}
        maxToRenderPerBatch={3}
        windowSize={3}
      />
    </View>
  );
}

// ============================================================================
// CHALLENGE CARD (inline registration)
// ============================================================================

function ChallengeCard({
  item,
  onRegistered,
}: {
  item: DiscoveryChallengeItem;
  onRegistered: (challengeId: string) => void;
}) {
  const router = useRouter();
  const [registering, setRegistering] = useState(false);

  const handlePress = async () => {
    const userId = auth.currentUser?.uid;
    if (!userId || registering) return;

    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // DTP requires the onboarding modal — navigate to detail screen
    if (item.id === "dtp") {
      router.push({
        pathname: "/events/challenge/[id]" as any,
        params: { id: "dtp" },
      });
      return;
    }

    setRegistering(true);

    try {
      const challengeDef = CHALLENGES.find((c) => c.id === item.id);
      if (!challengeDef) throw new Error("Challenge not found");

      // Check if already registered
      const participantRef = doc(db, "challenges", item.id, "participants", userId);
      const existingDoc = await getDoc(participantRef);
      if (existingDoc.exists()) {
        // Already registered — just remove the card silently
        onRegistered(item.id);
        setRegistering(false);
        return;
      }

      // Get user's handicap for bracket
      const userDoc = await getDoc(doc(db, "users", userId));
      const hci = userDoc.exists() ? (userDoc.data().handicap ?? 20) : 20;
      const bracket = getHCIBracket(hci);
      const threshold = challengeDef.hasHCIScaling
        ? getThresholdForBracket(challengeDef, bracket)
        : 0;

      // Create participant doc
      await setDoc(participantRef, {
        registeredAt: serverTimestamp(),
        hciBracket: bracket,
        hciAtRegistration: hci,
        targetThreshold: threshold,
        earned: false,
      });

      // Add to user's active challenges
      await updateDoc(doc(db, "users", userId), {
        activeChallenges: arrayUnion(item.id),
      });

      // Increment registered count
      await updateDoc(doc(db, "challenges", item.id), {
        registeredCount: increment(1),
      });

      soundPlayer.play("postThought");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(
        "Registered! 🎯",
        `You're now tracking ${challengeDef.name}. Your progress will update automatically as you post rounds.`
      );

      onRegistered(item.id);
    } catch (error) {
      console.error("Inline challenge registration error:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to register. Please try again.");
    } finally {
      setRegistering(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.challengeCard, registering && styles.challengeCardRegistering]}
      activeOpacity={0.8}
      onPress={handlePress}
      disabled={registering}
    >
      {registering ? (
        <ActivityIndicator size="small" color="#FFD700" style={{ marginBottom: 8 }} />
      ) : (
        <View style={styles.challengeBadge}>
          <BadgeIcon badgeId={item.id} size={36} />
        </View>
      )}
      <Text style={styles.challengeName} numberOfLines={2}>
        {registering ? "Registering..." : item.name}
      </Text>
      <Text style={styles.challengeScarcity}>
        {item.earnedCount === 0 ? "Be the first" : `${item.earnedCount} earned`}
      </Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// LEAGUE CARD
// ============================================================================

function LeagueCard({ item }: { item: DiscoveryLeagueItem }) {
  const router = useRouter();

  const formatLabel = `${item.format === "stroke" ? "Stroke" : "2v2"} • ${item.holes} holes • ${
    item.frequency.charAt(0).toUpperCase() + item.frequency.slice(1)
  }`;

  return (
    <TouchableOpacity
      style={styles.leagueCard}
      activeOpacity={0.8}
      onPress={() => {
        soundPlayer.play("click");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/leagues/${item.id}` as any);
      }}
    >
      <View style={styles.leagueTop}>
        {item.avatar ? (
          <ExpoImage source={{ uri: item.avatar }} style={styles.leagueAvatar} contentFit="cover" cachePolicy="memory-disk" />
        ) : (
          <View style={[styles.leagueAvatar, styles.leagueAvatarFallback]}>
            <Text style={styles.leagueAvatarLetter}>
              {item.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.leagueInfo}>
          <Text style={styles.leagueName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.leagueMeta}>{formatLabel}</Text>
        </View>
      </View>
      <View style={styles.leagueBottom}>
        <Text style={styles.leagueMembers}>{item.memberCount} members</Text>
        <View style={styles.leagueCta}>
          <Text style={styles.leagueCtaText}>View</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// COURSE CARD
// ============================================================================

function CourseCard({ item }: { item: DiscoveryCourseItem }) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.courseCard}
      activeOpacity={0.8}
      onPress={() => {
        soundPlayer.play("click");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({
          pathname: "/locker/course/[courseId]" as any,
          params: { courseId: item.courseId },
        });
      }}
    >
      <View style={styles.courseHero}>
        {item.avatar ? (
          <View style={styles.courseAvatarWrap}>
            <ExpoImage source={{ uri: item.avatar }} style={styles.courseAvatarImg} contentFit="cover" cachePolicy="memory-disk" />
          </View>
        ) : (
          <View style={[styles.courseAvatarWrap, styles.courseAvatarFallback]}>
            <Ionicons name="golf" size={18} color="rgba(255,255,255,0.3)" />
          </View>
        )}
      </View>
      <View style={styles.courseBar}>
        <Text style={styles.courseName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.courseMeta}>
          {item.distance ? `${item.distance} • ` : ""}
          {item.roundsPosted} rounds posted
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// PARTNER CARD
// ============================================================================

function PartnerCard({ item }: { item: DiscoveryPartnerItem }) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.partnerCard}
      activeOpacity={0.8}
      onPress={() => {
        soundPlayer.play("click");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/locker/${item.userId}` as any);
      }}
    >
      {item.avatar ? (
        <ExpoImage source={{ uri: item.avatar }} style={styles.partnerAvatar} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <View style={[styles.partnerAvatar, styles.partnerAvatarFallback]}>
          <Text style={styles.partnerAvatarLetter}>
            {item.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <Text style={styles.partnerName} numberOfLines={1}>
        {item.displayName}
      </Text>
      <Text style={styles.partnerContext} numberOfLines={1}>
        {item.context}
      </Text>
      <View style={styles.partnerAddBtn}>
        <Text style={styles.partnerAddText}>+ Add</Text>
      </View>
    </TouchableOpacity>
  );
}

// ============================================================================
// DTP PIN CARD
// ============================================================================

function DTPCard({ item }: { item: DiscoveryDTPItem }) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.dtpCard}
      activeOpacity={0.8}
      onPress={() => {
        soundPlayer.play("click");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({
          pathname: "/events/challenge/[id]" as any,
          params: { id: "dtp" },
        });
      }}
    >
      <View style={styles.dtpPinRow}>
        <Text style={styles.dtpPinIcon}>📍</Text>
        <Text style={styles.dtpTag}>
          {item.status === "unclaimed" ? "Unclaimed" : "Beatable"}
        </Text>
      </View>
      <Text style={styles.dtpCourse} numberOfLines={1}>
        {item.courseName}
      </Text>
      <Text style={styles.dtpStatus}>
        {item.status === "unclaimed"
          ? "No pin holder yet"
          : `Current: ${item.currentDistance}ft`}
      </Text>
      <Text style={styles.dtpCta}>
        {item.status === "unclaimed" ? "Be the first →" : "Claim pin →"}
      </Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// RIVALRY NUDGE CARD
// ============================================================================

function RivalryNudgeCard({ item }: { item: DiscoveryRivalryNudgeItem }) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.rivalryCard}
      activeOpacity={0.8}
      onPress={() => {
        soundPlayer.play("click");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/locker/${item.rivalUserId}` as any);
      }}
    >
      {/* Avatar */}
      {item.rivalAvatar ? (
        <ExpoImage
          source={{ uri: item.rivalAvatar }}
          style={styles.rivalryAvatar}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.rivalryAvatar, styles.rivalryAvatarFallback]}>
          <Text style={styles.rivalryAvatarLetter}>
            {item.rivalName.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      {/* Emoji */}
      <Text style={styles.rivalryEmoji}>{item.emoji}</Text>

      {/* Message */}
      <Text style={styles.rivalryMessage} numberOfLines={2}>
        {item.message}
      </Text>
    </TouchableOpacity>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: "transparent",
    paddingTop: 4,
    paddingBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    fontFamily: "serif",
  },
  scroll: {
    paddingLeft: 16,
    paddingRight: 16,
  },

  // Challenge
  challengeCard: {
    width: 160,
    height: 160,
    backgroundColor: "#0D5C3A",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  challengeCardRegistering: {
    opacity: 0.7,
  },
  challengeBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 215, 0, 0.12)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 215, 0, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  challengeName: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFF",
    textAlign: "center",
    lineHeight: 14,
  },
  challengeScarcity: {
    fontSize: 10,
    color: "rgba(255, 215, 0, 0.65)",
    fontWeight: "600",
  },

  // League
  leagueCard: {
    width: 160,
    height: 160,
    backgroundColor: "#FFF",
    borderWidth: 1.5,
    borderColor: "#E8E8E8",
    borderRadius: 14,
    padding: 14,
    justifyContent: "space-between",
  },
  leagueTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  leagueAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    overflow: "hidden",
  },
  leagueAvatarFallback: {
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  leagueAvatarLetter: { fontSize: 15, fontWeight: "800", color: "#FFF" },
  leagueInfo: { flex: 1 },
  leagueName: { fontSize: 13, fontWeight: "700", color: "#333" },
  leagueMeta: { fontSize: 11, color: "#999", marginTop: 2 },
  leagueBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  leagueMembers: { fontSize: 11, color: "#666", fontWeight: "600" },
  leagueCta: {
    backgroundColor: "rgba(13, 92, 58, 0.08)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  leagueCtaText: { fontSize: 11, fontWeight: "700", color: "#0D5C3A" },

  // Course
  courseCard: {
    width: 160,
    height: 160,
    borderRadius: 14,
    overflow: "hidden",
  },
  courseHero: {
    width: "100%",
    height: 90,
    backgroundColor: "#1B5E20",
    alignItems: "center",
    justifyContent: "center",
  },
  courseAvatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.8)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
  },
  courseAvatarFallback: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: "rgba(255,255,255,0.25)",
    borderStyle: "dashed",
  },
  courseAvatarImg: { width: "100%", height: "100%" },
  courseBar: {
    backgroundColor: "#FFF",
    padding: 10,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: "#E8E8E8",
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  courseName: { fontSize: 12, fontWeight: "700", color: "#333" },
  courseMeta: { fontSize: 10, color: "#999", marginTop: 2 },

  // Partner
  partnerCard: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 14,
    backgroundColor: "#FFF",
    borderWidth: 1.5,
    borderColor: "#E8E8E8",
    borderRadius: 14,
  },
  partnerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
  },
  partnerAvatarFallback: {
    backgroundColor: "#4A3628",
    alignItems: "center",
    justifyContent: "center",
  },
  partnerAvatarLetter: { fontSize: 18, fontWeight: "800", color: "#C5A55A" },
  partnerName: { fontSize: 12, fontWeight: "700", color: "#333", textAlign: "center" },
  partnerContext: { fontSize: 10, color: "#999", textAlign: "center" },
  partnerAddBtn: {
    backgroundColor: "rgba(13, 92, 58, 0.08)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 2,
  },
  partnerAddText: { fontSize: 11, fontWeight: "700", color: "#0D5C3A" },

  // DTP
  dtpCard: {
    width: 160,
    height: 160,
    backgroundColor: "#0D5C3A",
    borderRadius: 14,
    padding: 14,
    justifyContent: "center",
    gap: 6,
  },
  dtpPinRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dtpPinIcon: { fontSize: 16 },
  dtpTag: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#C5A55A",
  },
  dtpCourse: { fontSize: 13, fontWeight: "700", color: "#FFF", lineHeight: 17 },
  dtpStatus: { fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: "500" },
  dtpCta: { fontSize: 11, fontWeight: "700", color: "#FFD700", marginTop: 4 },

  // Rivalry Nudge
  rivalryCard: {
    width: 160,
    height: 160,
    backgroundColor: "#1A1A1A",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#E53935",
  },
  rivalryAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(229, 57, 53, 0.4)",
  },
  rivalryAvatarFallback: {
    backgroundColor: "rgba(229, 57, 53, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  rivalryAvatarLetter: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },
  rivalryEmoji: {
    fontSize: 18,
  },
  rivalryMessage: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    lineHeight: 15,
  },
});