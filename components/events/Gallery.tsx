/**
 * Gallery Tab
 *
 * The "movie trailer" — condensed cliff notes that drive users
 * into the Challenges and Compete tabs.
 *
 * Two sections:
 *   1. Challenges – Horizontal scroll of active challenge previews,
 *      or a teaser card if none active
 *   2. Compete – Action needed items (scores due, invites),
 *      active competition previews, or CTAs to get started
 *
 * Key principle: Gallery never shows full detail.
 * Every card deeplinks or switches tabs.
 */

import { db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
    collection,
    doc,
    getDoc,
    getDocs,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface GalleryProps {
  userId: string;
  onSwitchTab?: (tab: "challenges" | "compete") => void;
}

interface LeaguePreview {
  id: string;
  name: string;
  avatar?: string;
  format: string;
  status: string;
  currentWeek?: number;
  totalWeeks?: number;
}

// Teaser challenges to show when user has none active
const CHALLENGE_TEASERS = [
  { id: "par3", name: "Par 3 Champion", icon: "flag", color: "#0D5C3A" },
  { id: "fir", name: "Fairway Finder", icon: "golf", color: "#2E7D32" },
  { id: "gir", name: "GIR Master", icon: "disc", color: "#1B5E20" },
];

export default function Gallery({ userId, onSwitchTab }: GalleryProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [myLeagues, setMyLeagues] = useState<LeaguePreview[]>([]);

  useEffect(() => {
    if (userId) loadPreviewData();
  }, [userId]);

  const loadPreviewData = async () => {
    try {
      // Load league memberships for compete section
      const leaguesSnap = await getDocs(collection(db, "leagues"));
      const leagues: LeaguePreview[] = [];

      for (const leagueDoc of leaguesSnap.docs) {
        const memberDoc = await getDoc(
          doc(db, "leagues", leagueDoc.id, "members", userId)
        );
        if (memberDoc.exists()) {
          const data = leagueDoc.data();
          leagues.push({
            id: leagueDoc.id,
            name: data.name || "Unnamed League",
            avatar: data.avatar,
            format: data.format || "stroke",
            status: data.status || "active",
            currentWeek: data.currentWeek,
            totalWeeks: data.totalWeeks,
          });
        }
      }

      setMyLeagues(leagues);
    } catch (error) {
      console.error("Gallery load error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ============================================================ */}
      {/* CHALLENGES PREVIEW                                           */}
      {/* ============================================================ */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="flag" size={16} color="#0D5C3A" />
            <Text style={styles.sectionTitle}>Challenges</Text>
          </View>
          <TouchableOpacity
            style={styles.viewAllButton}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSwitchTab?.("challenges");
            }}
          >
            <Text style={styles.viewAllText}>View All</Text>
            <Ionicons name="arrow-forward" size={14} color="#0D5C3A" />
          </TouchableOpacity>
        </View>

        {/*
         * TODO: When user has active challenges, show horizontal scroll:
         * <ScrollView horizontal>
         *   <ActiveChallengeCard progress={12} total={20} rank={3} />
         * </ScrollView>
         *
         * For now, show teaser since challenges aren't live yet.
         */}

        {/* Teaser — no active challenges */}
        <TouchableOpacity
          style={styles.teaserCard}
          activeOpacity={0.8}
          onPress={() => {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onSwitchTab?.("challenges");
          }}
        >
          <View style={styles.teaserTop}>
            <Text style={styles.teaserEmoji}>🎯</Text>
            <View style={styles.teaserTextBlock}>
              <Text style={styles.teaserTitle}>New Challenges Available</Text>
              <Text style={styles.teaserSubtext}>
                Test your skills against other golfers
              </Text>
            </View>
          </View>

          {/* Mini preview of challenge types */}
          <View style={styles.teaserChips}>
            {CHALLENGE_TEASERS.map((c) => (
              <View key={c.id} style={styles.teaserChip}>
                <Ionicons name={c.icon as any} size={12} color={c.color} />
                <Text style={styles.teaserChipText}>{c.name}</Text>
              </View>
            ))}
          </View>

          <View style={styles.teaserFooter}>
            <Text style={styles.teaserCta}>Browse Challenges</Text>
            <Ionicons name="arrow-forward" size={14} color="#0D5C3A" />
          </View>
        </TouchableOpacity>
      </View>

      {/* ============================================================ */}
      {/* COMPETE PREVIEW                                              */}
      {/* ============================================================ */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="podium" size={16} color="#0D5C3A" />
            <Text style={styles.sectionTitle}>Compete</Text>
          </View>
          <TouchableOpacity
            style={styles.viewAllButton}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSwitchTab?.("compete");
            }}
          >
            <Text style={styles.viewAllText}>View All</Text>
            <Ionicons name="arrow-forward" size={14} color="#0D5C3A" />
          </TouchableOpacity>
        </View>

        {myLeagues.length > 0 ? (
          <>
            {/* TODO: Action needed cards (scores due, invites) go here */}

            {/* Active competition previews — compact horizontal scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.competeScroll}
            >
              {myLeagues.map((league) => (
                <TouchableOpacity
                  key={league.id}
                  style={styles.competeCard}
                  activeOpacity={0.8}
                  onPress={() => {
                    soundPlayer.play("click");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: "/leagues/home" as any,
                      params: { leagueId: league.id },
                    });
                  }}
                >
                  {/* League avatar */}
                  {league.avatar ? (
                    <Image
                      source={{ uri: league.avatar }}
                      style={styles.competeAvatar}
                    />
                  ) : (
                    <View style={styles.competeAvatarPlaceholder}>
                      <Ionicons name="shield" size={18} color="#FFF" />
                    </View>
                  )}

                  <Text style={styles.competeName} numberOfLines={1}>
                    {league.name}
                  </Text>

                  <Text style={styles.competeMeta}>
                    {league.format === "stroke" ? "Stroke" : "2v2"}
                    {league.currentWeek && league.totalWeeks
                      ? ` • Wk ${league.currentWeek}/${league.totalWeeks}`
                      : ""}
                  </Text>

                  <View
                    style={[
                      styles.competeStatusDot,
                      league.status === "active"
                        ? styles.dotActive
                        : styles.dotUpcoming,
                    ]}
                  >
                    <Text style={styles.competeStatusText}>
                      {league.status === "active" ? "Active" : "Upcoming"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}

              {/* Quick CTA card at end */}
              <TouchableOpacity
                style={styles.competeCardAdd}
                activeOpacity={0.8}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onSwitchTab?.("compete");
                }}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={28}
                  color="#0D5C3A"
                />
                <Text style={styles.competeAddText}>Join or{"\n"}Create</Text>
              </TouchableOpacity>
            </ScrollView>
          </>
        ) : (
          /* No active competitions — CTA cards */
          <View style={styles.competeEmptyRow}>
            <TouchableOpacity
              style={styles.competeEmptyCard}
              activeOpacity={0.8}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push("/leagues/explore" as any);
              }}
            >
              <Ionicons name="shield-outline" size={28} color="#0D5C3A" />
              <Text style={styles.competeEmptyLabel}>Join a League</Text>
              <Text style={styles.competeEmptyDesc}>
                Season-long competition with friends
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.competeEmptyCard}
              activeOpacity={0.8}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push("/leagues/create" as any);
              }}
            >
              <Ionicons name="add-circle-outline" size={28} color="#0D5C3A" />
              <Text style={styles.competeEmptyLabel}>Create League</Text>
              <Text style={styles.competeEmptyDesc}>
                Start your own and invite players
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ============================================================ */}
      {/* COMING SOON TEASER                                           */}
      {/* ============================================================ */}
      <View style={styles.comingSoonStrip}>
        <Text style={styles.comingSoonStripText}>
          🏆 Cups & Tournaments coming soon
        </Text>
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  content: {
    padding: 16,
    gap: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Section headers
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  // =============================================
  // Challenges teaser card
  // =============================================
  teaserCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  teaserTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  teaserEmoji: {
    fontSize: 32,
  },
  teaserTextBlock: {
    flex: 1,
    gap: 2,
  },
  teaserTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
  },
  teaserSubtext: {
    fontSize: 12,
    color: "#888",
  },
  teaserChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  teaserChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(13, 92, 58, 0.06)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  teaserChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#555",
  },
  teaserFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  teaserCta: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  // =============================================
  // Compete — horizontal league previews
  // =============================================
  competeScroll: {
    gap: 10,
    paddingRight: 4,
  },
  competeCard: {
    width: 140,
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  competeAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  competeAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  competeName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
  },
  competeMeta: {
    fontSize: 11,
    color: "#888",
    textAlign: "center",
  },
  competeStatusDot: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dotActive: {
    backgroundColor: "rgba(13, 92, 58, 0.1)",
  },
  dotUpcoming: {
    backgroundColor: "#FFF8E1",
  },
  competeStatusText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  competeCardAdd: {
    width: 100,
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: "rgba(13, 92, 58, 0.15)",
    borderStyle: "dashed",
  },
  competeAddText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0D5C3A",
    textAlign: "center",
  },

  // =============================================
  // Compete — empty state (no competitions)
  // =============================================
  competeEmptyRow: {
    flexDirection: "row",
    gap: 10,
  },
  competeEmptyCard: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  competeEmptyLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
  },
  competeEmptyDesc: {
    fontSize: 11,
    color: "#888",
    textAlign: "center",
    lineHeight: 15,
  },

  // =============================================
  // Coming soon strip
  // =============================================
  comingSoonStrip: {
    backgroundColor: "rgba(255, 215, 0, 0.12)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  comingSoonStripText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#A68A00",
  },
});