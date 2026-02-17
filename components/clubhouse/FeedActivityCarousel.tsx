/**
 * FeedActivityCarousel
 *
 * "From the Field" — swipeable horizontal carousel of activity cards.
 * Bundles all activity types into one feed slot so the feed isn't cluttered.
 *
 * Card types:
 *   - badge_earned (regional)
 *   - dtp_claimed (regional)
 *   - joined_league (partner)
 *   - challenge_progress (personal nudge)
 *   - dtp_available (personal)
 *   - low_round (regional)
 *   - low_leader_change (regional)
 *   - scratch_earned (everyone)
 *   - ace_tier_earned (everyone)
 *   - league_result (members)
 *
 * Uses FlatList with pagingEnabled for snap-to-card behavior.
 */

import BadgeIcon from "@/components/challenges/BadgeIcon";
import type {
  ActivityAceTierEarned,
  ActivityBadgeEarned,
  ActivityChallengeProgress,
  ActivityDTPAvailable,
  ActivityDTPClaimed,
  ActivityInsert,
  ActivityItem,
  ActivityJoinedLeague,
  ActivityLeagueResult,
  ActivityLowLeaderChange,
  ActivityLowRound,
  ActivityScratchEarned,
} from "@/utils/feedInsertTypes";
import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = SCREEN_WIDTH - 52; // 16px padding each side + 10px gaps
const CARD_MARGIN = 5;

interface Props {
  insert: ActivityInsert;
}

export default function FeedActivityCarousel({ insert }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderItem = useCallback(
    ({ item }: { item: ActivityItem }) => (
      <View style={styles.cardOuter}>
        <ActivityCard item={item} />
      </View>
    ),
    []
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{insert.title}</Text>
      </View>

      <FlatList
        data={insert.items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + CARD_MARGIN * 2}
        decelerationRate="fast"
        contentContainerStyle={styles.scroll}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      {/* Page indicator dots */}
      {insert.items.length > 1 && (
        <View style={styles.dots}>
          {insert.items.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// ACTIVITY CARD (renders the right content based on activityType)
// ============================================================================

function ActivityCard({ item }: { item: ActivityItem }) {
  const router = useRouter();

  const handlePress = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    switch (item.activityType) {
      case "badge_earned":
        router.push(`/profile/${item.userId}` as any);
        break;
      case "dtp_claimed":
      case "dtp_available":
        router.push({
          pathname: "/events/challenge/[id]" as any,
          params: { id: "dtp" },
        });
        break;
      case "joined_league":
        router.push(`/leagues/${(item as ActivityJoinedLeague).leagueId}` as any);
        break;
      case "challenge_progress":
        router.push({
          pathname: "/events/challenge/[id]" as any,
          params: { id: (item as ActivityChallengeProgress).badgeId },
        });
        break;
      case "low_round":
        if ((item as ActivityLowRound).scorePostId) {
          router.push(`/clubhouse?highlightPostId=${(item as ActivityLowRound).scorePostId}` as any);
        } else {
          router.push(`/profile/${item.userId}` as any);
        }
        break;
      case "low_leader_change":
        router.push(`/profile/${item.userId}` as any);
        break;
      case "scratch_earned":
      case "ace_tier_earned":
        router.push(`/profile/${item.userId}` as any);
        break;
      case "league_result":
        router.push(`/leagues/home` as any);
        break;
    }
  };

  const { typeLabel, dotColor } = getTypeInfo(item.activityType);

  // Special card styles
  const isNudge = item.activityType === "challenge_progress";
  const isDTPAvailable = item.activityType === "dtp_available";
  const isLeagueResult = item.activityType === "league_result";

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isNudge && styles.cardNudge,
        isDTPAvailable && styles.cardDTP,
        isLeagueResult && styles.cardLeagueResult,
      ]}
      activeOpacity={0.8}
      onPress={handlePress}
    >
      {/* Type label */}
      <View style={styles.typeRow}>
        <View style={[styles.typeDot, { backgroundColor: dotColor }]} />
        <Text
          style={[styles.typeLabel, isDTPAvailable && styles.typeLabelDTP]}
        >
          {typeLabel}
        </Text>
      </View>

      {/* Content — varies by type */}
      {renderActivityContent(item)}
    </TouchableOpacity>
  );
}

// ============================================================================
// CONTENT RENDERERS
// ============================================================================

function renderActivityContent(item: ActivityItem) {
  switch (item.activityType) {
    case "badge_earned":
      return <BadgeEarnedContent item={item} />;
    case "dtp_claimed":
      return <DTPClaimedContent item={item} />;
    case "joined_league":
      return <JoinedLeagueContent item={item} />;
    case "challenge_progress":
      return <ChallengeProgressContent item={item} />;
    case "dtp_available":
      return <DTPAvailableContent item={item} />;
    case "low_round":
      return <LowRoundContent item={item} />;
    case "low_leader_change":
      return <LowLeaderContent item={item} />;
    case "scratch_earned":
      return <ScratchContent item={item} />;
    case "ace_tier_earned":
      return <AceTierContent item={item} />;
    case "league_result":
      return <LeagueResultContent item={item} />;
    default:
      return null;
  }
}

// -- Badge Earned --
function BadgeEarnedContent({ item }: { item: ActivityBadgeEarned }) {
  return (
    <View style={styles.contentRow}>
      <Avatar uri={item.avatar} name={item.displayName} />
      <View style={styles.contentBody}>
        <Text style={styles.contentText}>
          <Text style={styles.bold}>{item.displayName}</Text>
          {" earned the "}
          <Text style={styles.hl}>{item.badgeName}</Text>
          {" badge"}
        </Text>
        <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
      </View>
      <View style={styles.accentBadge}>
        <BadgeIcon badgeId={item.badgeId} size={22} />
      </View>
    </View>
  );
}

// -- DTP Claimed --
function DTPClaimedContent({ item }: { item: ActivityDTPClaimed }) {
  return (
    <View style={styles.contentRow}>
      <Avatar uri={item.avatar} name={item.displayName} />
      <View style={styles.contentBody}>
        <Text style={styles.contentText}>
          <Text style={styles.bold}>{item.displayName}</Text>
          {" claimed the pin at "}
          <Text style={styles.hl}>{item.courseName} Hole #{item.hole}</Text>
          {" — "}
          <Text style={styles.gold}>{item.distance}ft</Text>
        </Text>
        <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
      </View>
      <View style={styles.accentDTP}>
        <Text style={{ fontSize: 14 }}>📍</Text>
      </View>
    </View>
  );
}

// -- Joined League --
function JoinedLeagueContent({ item }: { item: ActivityJoinedLeague }) {
  return (
    <View style={styles.contentRow}>
      <Avatar uri={item.avatar} name={item.displayName} />
      <View style={styles.contentBody}>
        <Text style={styles.contentText}>
          <Text style={styles.bold}>{item.displayName}</Text>
          {" joined "}
          <Text style={styles.hl}>{item.leagueName}</Text>
        </Text>
        <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
      </View>
      <View style={styles.accentLeague}>
        <Text style={styles.accentLeagueText}>
          {item.leagueName.charAt(0).toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

// -- Challenge Progress (personal nudge) --
function ChallengeProgressContent({ item }: { item: ActivityChallengeProgress }) {
  return (
    <View>
      <View style={styles.contentRow}>
        <View style={styles.accentBadgeLarge}>
          <BadgeIcon badgeId={item.badgeId} size={26} />
        </View>
        <View style={styles.contentBody}>
          <Text style={styles.contentText}>
            {"You're "}
            <Text style={styles.hl}>{Math.round(item.progressPct * 100)}%</Text>
            {" to the "}
            <Text style={styles.hl}>{item.badgeName}</Text>
            {" badge — keep going"}
          </Text>
          <Text style={styles.timeText}>{item.progressLabel}</Text>
        </View>
      </View>
      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round(item.progressPct * 100)}%` },
          ]}
        />
      </View>
    </View>
  );
}

// -- DTP Available --
function DTPAvailableContent({ item }: { item: ActivityDTPAvailable }) {
  return (
    <View style={styles.contentRow}>
      <View style={styles.accentDTPLarge}>
        <Text style={{ fontSize: 18 }}>📍</Text>
      </View>
      <View style={styles.contentBody}>
        <Text style={[styles.contentText, { color: "#FFF" }]}>
          {"No one holds the pin at "}
          <Text style={[styles.hl, { color: "#C5A55A" }]}>{item.courseName}</Text>
          {" yet. "}
          <Text style={{ color: "#FFD700", fontWeight: "700" }}>Be the first</Text>
        </Text>
        <Text style={[styles.timeText, { color: "rgba(255,255,255,0.4)" }]}>
          Course you've played
        </Text>
      </View>
    </View>
  );
}

// -- Low Round --
function LowRoundContent({ item }: { item: ActivityLowRound }) {
  return (
    <View style={styles.contentRow}>
      <Avatar uri={item.avatar} name={item.displayName} />
      <View style={styles.contentBody}>
        <Text style={styles.contentText}>
          <Text style={styles.bold}>{item.displayName}</Text>
          {" shot a career best "}
          <Text style={styles.gold}>{item.score}</Text>
          {" at "}
          <Text style={styles.hl}>{item.courseName}</Text>
        </Text>
        <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
      </View>
      <View style={styles.accentFire}>
        <Text style={{ fontSize: 14 }}>🔥</Text>
      </View>
    </View>
  );
}

// -- Low Leader Change --
function LowLeaderContent({ item }: { item: ActivityLowLeaderChange }) {
  return (
    <View style={styles.contentRow}>
      <Avatar uri={item.avatar} name={item.displayName} />
      <View style={styles.contentBody}>
        <Text style={styles.contentText}>
          <Text style={styles.bold}>{item.displayName}</Text>
          {" is the new low leader at "}
          <Text style={styles.hl}>{item.courseName}</Text>
          {" with a "}
          <Text style={styles.gold}>{item.score}</Text>
        </Text>
        <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
      </View>
      <View style={styles.accentCrown}>
        <Text style={{ fontSize: 14 }}>👑</Text>
      </View>
    </View>
  );
}

// -- Scratch Earned --
function ScratchContent({ item }: { item: ActivityScratchEarned }) {
  return (
    <View style={styles.contentRow}>
      <Avatar uri={item.avatar} name={item.displayName} />
      <View style={styles.contentBody}>
        <Text style={styles.contentText}>
          <Text style={styles.bold}>{item.displayName}</Text>
          {" achieved "}
          <Text style={styles.gold}>Scratch</Text>
          {" — low leader at "}
          <Text style={styles.hl}>{item.courseNames[0]}</Text>
          {" and "}
          <Text style={styles.hl}>{item.courseNames[1]}</Text>
        </Text>
        <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
      </View>
      <View style={styles.llScratch}>
        <Image
          source={require("@/assets/icons/LowLeaderScratch.png")}
          style={styles.llIcon}
        />
      </View>
    </View>
  );
}

// -- Ace Tier Earned --
function AceTierContent({ item }: { item: ActivityAceTierEarned }) {
  return (
    <View style={styles.contentRow}>
      <Avatar uri={item.avatar} name={item.displayName} />
      <View style={styles.contentBody}>
        <Text style={styles.contentText}>
          <Text style={styles.bold}>{item.displayName}</Text>
          {" achieved "}
          <Text style={styles.gold}>Ace</Text>
          {" — low leader at "}
          <Text style={styles.hl}>{item.courseNames[0]}</Text>
          {", "}
          <Text style={styles.hl}>{item.courseNames[1]}</Text>
          {", and "}
          <Text style={styles.hl}>{item.courseNames[2]}</Text>
        </Text>
        <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
      </View>
      <View style={styles.llAce}>
        <Image
          source={require("@/assets/icons/LowLeaderAce.png")}
          style={styles.llIcon}
        />
      </View>
    </View>
  );
}

// -- League Result --
function LeagueResultContent({ item }: { item: ActivityLeagueResult }) {
  return (
    <View style={styles.contentRow}>
      {item.leagueAvatar ? (
        <Image
          source={{ uri: item.leagueAvatar }}
          style={styles.leagueResultAvatar}
        />
      ) : (
        <View style={[styles.leagueResultAvatar, styles.leagueResultAvatarFallback]}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: "#FFF" }}>
            {item.leagueName.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.contentBody}>
        <Text style={[styles.hl, { fontSize: 12 }]}>
          {item.leagueName} — Week {item.week}
        </Text>
        <Text style={styles.contentText}>
          <Text style={styles.bold}>{item.winnerName}</Text>
          {" won with a "}
          <Text style={styles.gold}>{item.winnerScore}</Text>
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

function Avatar({ uri, name }: { uri?: string | null; name: string }) {
  if (uri) {
    return <Image source={{ uri }} style={styles.avatar} />;
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback]}>
      <Text style={styles.avatarLetter}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function getTypeInfo(type: string): { typeLabel: string; dotColor: string } {
  switch (type) {
    case "badge_earned":
      return { typeLabel: "Challenge", dotColor: "#0D5C3A" };
    case "dtp_claimed":
    case "dtp_available":
      return { typeLabel: "Closest to Pin", dotColor: "#C5A55A" };
    case "joined_league":
      return { typeLabel: "League", dotColor: "#0D5C3A" };
    case "challenge_progress":
      return { typeLabel: "Your Progress", dotColor: "#0D5C3A" };
    case "low_round":
      return { typeLabel: "Career Best", dotColor: "#E53935" };
    case "low_leader_change":
      return { typeLabel: "Low Leader", dotColor: "#0D5C3A" };
    case "scratch_earned":
    case "ace_tier_earned":
      return { typeLabel: "Achievement", dotColor: "#C5A55A" };
    case "league_result":
      return { typeLabel: "League Result", dotColor: "#0D5C3A" };
    default:
      return { typeLabel: "Activity", dotColor: "#999" };
  }
}

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
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
    paddingHorizontal: 16,
  },

  // Card outer (for snap spacing)
  cardOuter: {
    width: CARD_WIDTH,
    marginHorizontal: CARD_MARGIN,
  },

  // Card base
  card: {
    backgroundColor: "#FAFAFA",
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  cardNudge: {
    backgroundColor: "rgba(13, 92, 58, 0.04)",
    borderColor: "rgba(13, 92, 58, 0.1)",
  },
  cardDTP: {
    backgroundColor: "#0D5C3A",
    borderColor: "transparent",
  },
  cardLeagueResult: {
    borderLeftWidth: 3,
    borderLeftColor: "#0D5C3A",
  },

  // Type label
  typeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  typeDot: { width: 6, height: 6, borderRadius: 3 },
  typeLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#BBB",
  },
  typeLabelDTP: { color: "rgba(255, 215, 0, 0.5)" },

  // Content row
  contentRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  contentBody: { flex: 1, minWidth: 0 },
  contentText: { fontSize: 13, color: "#333", lineHeight: 19 },
  bold: { fontWeight: "700" },
  hl: { color: "#0D5C3A", fontWeight: "700" },
  gold: { color: "#C5A55A", fontWeight: "700" },
  timeText: { fontSize: 11, color: "#CCC", marginTop: 3 },

  // Avatar
  avatar: { width: 40, height: 40, borderRadius: 20, overflow: "hidden" },
  avatarFallback: {
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontSize: 16, fontWeight: "700", color: "#FFF" },

  // Accent icons
  accentBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 215, 0, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  accentBadgeLarge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 215, 0, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  accentDTP: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#0D5C3A",
    borderWidth: 1.5,
    borderColor: "rgba(197, 165, 90, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  accentDTPLarge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 215, 0, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  accentLeague: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  accentLeagueText: { fontSize: 13, fontWeight: "800", color: "#FFF" },
  accentFire: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(229, 57, 53, 0.1)",
    borderWidth: 1.5,
    borderColor: "rgba(229, 57, 53, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  accentCrown: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(13, 92, 58, 0.08)",
    borderWidth: 1.5,
    borderColor: "rgba(13, 92, 58, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Low Leader icons
  llScratch: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  llAce: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  llIcon: { width: 30, height: 30, resizeMode: "contain" },

  // League result avatar
  leagueResultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    overflow: "hidden",
  },
  leagueResultAvatarFallback: {
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },

  // Progress bar
  progressBar: {
    height: 4,
    backgroundColor: "#E0E0E0",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    backgroundColor: "#0D5C3A",
    borderRadius: 2,
  },

  // Page indicator dots
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    paddingTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#DDD",
  },
  dotActive: {
    backgroundColor: "#0D5C3A",
    width: 16,
  },
});