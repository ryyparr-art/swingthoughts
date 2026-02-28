/**
 * Gallery Tab
 *
 * The "movie trailer" — condensed cliff notes that drive users
 * into the Challenges and Compete tabs.
 *
 * Sections:
 *   1. Challenges – Teaser card or active challenge previews
 *   2. Compete – Three subsections matching Compete tab:
 *      a. Leagues – active league previews or CTA
 *      b. Invitationals – pending invites, active events, or CTA
 *      c. Tours – coming soon CTA
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

interface InvitationalPreview {
  id: string;
  name: string;
  hostName: string;
  courseName: string;
  date: Date;
  status: "draft" | "open" | "active" | "completed" | "cancelled";
  playerCount: number;
  userStatus: "host" | "accepted" | "invited";
}

const CHALLENGE_TEASERS = [
  { id: "par3", name: "Par 3 Champion", icon: "flag", color: "#0D5C3A" },
  { id: "fir", name: "Fairway Finder", icon: "golf", color: "#2E7D32" },
  { id: "gir", name: "GIR Master", icon: "disc", color: "#1B5E20" },
];

export default function Gallery({ userId, onSwitchTab }: GalleryProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [myLeagues, setMyLeagues] = useState<LeaguePreview[]>([]);
  const [myInvitationals, setMyInvitationals] = useState<InvitationalPreview[]>([]);

  useEffect(() => {
    if (userId) loadPreviewData();
  }, [userId]);

  const loadPreviewData = async () => {
    try {
      // Load leagues
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

      // Load invitationals
      try {
        const invSnap = await getDocs(collection(db, "invitationals"));
        const invitationals: InvitationalPreview[] = [];

        for (const invDoc of invSnap.docs) {
          const data = invDoc.data();
          const roster = data.roster || [];
          const isHost = data.hostUserId === userId;
          const rosterEntry = roster.find((r: any) => r.userId === userId);

          if (isHost || rosterEntry) {
            const status = data.status || "draft";
            if (status === "cancelled" || status === "completed") continue;

            invitationals.push({
              id: invDoc.id,
              name: data.name || "Unnamed Invitational",
              hostName: data.hostName || "Unknown",
              courseName: data.courseName || "",
              date: data.date?.toDate?.() || new Date(),
              status,
              playerCount: data.playerCount || roster.length,
              userStatus: isHost ? "host" : (rosterEntry?.status || "invited"),
            });
          }
        }

        invitationals.sort((a, b) => {
          if (a.userStatus === "invited" && b.userStatus !== "invited") return -1;
          if (b.userStatus === "invited" && a.userStatus !== "invited") return 1;
          return a.date.getTime() - b.date.getTime();
        });

        setMyInvitationals(invitationals);
      } catch (invError) {
        console.warn("Invitationals not available yet:", invError);
        setMyInvitationals([]);
      }
    } catch (error) {
      console.error("Gallery load error:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days > 0 && days <= 7) return `In ${days} days`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const pendingInvites = myInvitationals.filter(
    (inv) => inv.userStatus === "invited" && inv.status === "open"
  );
  const activeInvitationals = myInvitationals.filter(
    (inv) => !(inv.userStatus === "invited" && inv.status === "open")
  );

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
      {/* CHALLENGES                                                   */}
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
      {/* COMPETE                                                      */}
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

        {/* ---- LEAGUES ---- */}
        <View style={styles.subsection}>
          <View style={styles.subsectionHeader}>
            <View style={styles.subsectionTitleRow}>
              <Ionicons name="shield" size={14} color="#0D5C3A" />
              <Text style={styles.subsectionTitle}>Leagues</Text>
            </View>
          </View>

          {myLeagues.length > 0 ? (
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
                  {league.avatar ? (
                    <Image
                      source={{ uri: league.avatar }}
                      style={styles.competeAvatar}
                    />
                  ) : (
                    <View style={styles.competeAvatarGreen}>
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
                      league.status === "active" ? styles.dotActive : styles.dotUpcoming,
                    ]}
                  >
                    <Text
                      style={[
                        styles.competeStatusText,
                        league.status === "active" ? styles.dotActiveText : styles.dotUpcomingText,
                      ]}
                    >
                      {league.status === "active" ? "Active" : "Upcoming"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <TouchableOpacity
              style={styles.ctaCard}
              activeOpacity={0.8}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push("/leagues/explore" as any);
              }}
            >
              <Ionicons name="shield-outline" size={22} color="#0D5C3A" />
              <View style={styles.ctaContent}>
                <Text style={styles.ctaTitle}>Find a League</Text>
                <Text style={styles.ctaDesc}>
                  Friendly weekly competition with your group
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#CCC" />
            </TouchableOpacity>
          )}
        </View>

        {/* ---- INVITATIONALS ---- */}
        <View style={styles.subsection}>
          <View style={styles.subsectionHeader}>
            <View style={styles.subsectionTitleRow}>
              <Ionicons name="trophy" size={14} color="#B8860B" />
              <Text style={styles.subsectionTitle}>Invitationals</Text>
            </View>
          </View>

          {/* Pending invites */}
          {pendingInvites.map((inv) => (
            <TouchableOpacity
              key={`invite-${inv.id}`}
              style={styles.inviteCard}
              activeOpacity={0.8}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({
                  pathname: "/invitationals/[id]" as any,
                  params: { id: inv.id },
                });
              }}
            >
              <View style={styles.inviteBadge}>
                <Ionicons name="mail" size={14} color="#FFF" />
              </View>
              <View style={styles.inviteContent}>
                <Text style={styles.inviteLabel}>You're Invited!</Text>
                <Text style={styles.inviteName} numberOfLines={1}>
                  {inv.name}
                </Text>
                <Text style={styles.inviteMeta} numberOfLines={1}>
                  {inv.courseName ? `${inv.courseName} • ` : ""}
                  {formatDate(inv.date)} • {inv.hostName}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="#B8860B" />
            </TouchableOpacity>
          ))}

          {/* Active invitationals */}
          {activeInvitationals.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.competeScroll}
            >
              {activeInvitationals.map((inv) => (
                <TouchableOpacity
                  key={inv.id}
                  style={styles.competeCard}
                  activeOpacity={0.8}
                  onPress={() => {
                    soundPlayer.play("click");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: "/invitationals/[id]" as any,
                      params: { id: inv.id },
                    });
                  }}
                >
                  <View style={styles.competeAvatarGold}>
                    <Ionicons name="trophy" size={18} color="#FFF" />
                  </View>
                  <Text style={styles.competeName} numberOfLines={1}>
                    {inv.name}
                  </Text>
                  <Text style={styles.competeMeta} numberOfLines={1}>
                    {inv.courseName || formatDate(inv.date)}
                  </Text>
                  <View
                    style={[
                      styles.competeStatusDot,
                      inv.status === "active" ? styles.dotActive :
                      inv.status === "open" ? styles.dotUpcoming : styles.dotDraft,
                    ]}
                  >
                    <Text
                      style={[
                        styles.competeStatusText,
                        inv.status === "active" ? styles.dotActiveText :
                        inv.status === "open" ? styles.dotUpcomingText : styles.dotDraftText,
                      ]}
                    >
                      {inv.status === "active" ? "Live" :
                       inv.status === "open" ? "Open" : "Draft"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : pendingInvites.length === 0 ? (
            <TouchableOpacity
              style={styles.ctaCard}
              activeOpacity={0.8}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push("/invitationals/create" as any);
              }}
            >
              <Ionicons name="trophy-outline" size={22} color="#B8860B" />
              <View style={styles.ctaContent}>
                <Text style={styles.ctaTitle}>Plan a Trip or Invitational</Text>
                <Text style={styles.ctaDesc}>
                  Golf trips, local rivalries, and mini-tournaments
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#CCC" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ---- TOURS ---- */}
        <View style={styles.subsection}>
          <View style={styles.subsectionHeader}>
            <View style={styles.subsectionTitleRow}>
              <Ionicons name="golf" size={14} color="#999" />
              <Text style={[styles.subsectionTitle, { color: "#999" }]}>Tours</Text>
            </View>
            <View style={styles.comingSoonPill}>
              <Text style={styles.comingSoonPillText}>Coming Soon</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.ctaCard, styles.ctaCardMuted]}
            activeOpacity={0.8}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSwitchTab?.("compete");
            }}
          >
            <Ionicons name="golf-outline" size={22} color="#BBB" />
            <View style={styles.ctaContent}>
              <Text style={[styles.ctaTitle, { color: "#999" }]}>
                Explore Local Tours
              </Text>
              <Text style={styles.ctaDesc}>
                Paid competitive series with points and purses
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#DDD" />
          </TouchableOpacity>
        </View>
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
    gap: 16,
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

  // Subsection headers (Leagues, Invitationals, Tours)
  subsection: {
    gap: 8,
  },
  subsectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  subsectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#555",
  },

  // Coming soon pill
  comingSoonPill: {
    backgroundColor: "#FFF8E1",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  comingSoonPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#F59E0B",
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
  // CTA cards (empty states / actions)
  // =============================================
  ctaCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  ctaCardMuted: {
    opacity: 0.7,
  },
  ctaContent: {
    flex: 1,
    gap: 2,
  },
  ctaTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  },
  ctaDesc: {
    fontSize: 11,
    color: "#888",
    lineHeight: 15,
  },

  // =============================================
  // Pending invitational invites
  // =============================================
  inviteCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF8E1",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "#FFE082",
  },
  inviteBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#B8860B",
    alignItems: "center",
    justifyContent: "center",
  },
  inviteContent: {
    flex: 1,
    gap: 1,
  },
  inviteLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#B8860B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inviteName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  },
  inviteMeta: {
    fontSize: 11,
    color: "#888",
  },

  // =============================================
  // Horizontal competition cards
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
  competeAvatarGreen: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  competeAvatarGold: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#B8860B",
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
  dotDraft: {
    backgroundColor: "rgba(0, 0, 0, 0.04)",
  },
  competeStatusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  dotActiveText: {
    color: "#0D5C3A",
  },
  dotUpcomingText: {
    color: "#F59E0B",
  },
  dotDraftText: {
    color: "#999",
  },
});