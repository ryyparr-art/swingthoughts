/**
 * Compete Tab
 *
 * Hub for structured competitions: Leagues, Invitationals, Tours.
 *
 * - Leagues: live, season-long competitions
 * - Invitationals: host-created invite-only single-day tournaments
 *   (uses outing scoring infrastructure with competitive leaderboard)
 * - Tours: user-created multi-event series (coming soon)
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
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface CompeteProps {
  userId: string;
}

interface LeagueSummary {
  id: string;
  name: string;
  avatar?: string;
  format: string;
  status: string;
  currentWeek?: number;
  totalWeeks?: number;
  memberCount?: number;
  userRank?: number;
}

interface InvitationalSummary {
  id: string;
  name: string;
  hostUserId: string;
  hostName: string;
  courseName: string;
  date: Date;
  status: "draft" | "open" | "active" | "completed" | "cancelled";
  format: string;
  playerCount: number;
  maxPlayers: number;
  userStatus: "host" | "accepted" | "invited";
}

export default function Compete({ userId }: CompeteProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myLeagues, setMyLeagues] = useState<LeagueSummary[]>([]);
  const [myInvitationals, setMyInvitationals] = useState<InvitationalSummary[]>([]);

  useEffect(() => {
    if (userId) loadCompetitions();
  }, [userId]);

  const loadCompetitions = async () => {
    try {
      // Load leagues
      const leaguesSnap = await getDocs(collection(db, "leagues"));
      const leagues: LeagueSummary[] = [];

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
            memberCount: data.memberCount,
          });
        }
      }

      setMyLeagues(leagues);

      // Load invitationals where user is on the roster or is host
      // Wrapped in try/catch — collection may not exist yet or rules may not be deployed
      try {
        const invitationalsSnap = await getDocs(collection(db, "invitationals"));
        const invitationals: InvitationalSummary[] = [];

        for (const invDoc of invitationalsSnap.docs) {
          const data = invDoc.data();
          const roster = data.roster || [];
          const isHost = data.hostUserId === userId;
          const rosterEntry = roster.find((r: any) => r.userId === userId);

          if (isHost || rosterEntry) {
            invitationals.push({
              id: invDoc.id,
              name: data.name || "Unnamed Invitational",
              hostUserId: data.hostUserId,
              hostName: data.hostName || "Unknown",
              courseName: data.courseName || "",
              date: data.date?.toDate?.() || new Date(),
              status: data.status || "draft",
              format: data.format || "stroke",
              playerCount: data.playerCount || roster.length,
              maxPlayers: data.maxPlayers || 24,
              userStatus: isHost ? "host" : (rosterEntry?.status || "invited"),
            });
          }
        }

        // Sort: active/open first, then by date
        invitationals.sort((a, b) => {
          const statusOrder = { active: 0, open: 1, draft: 2, completed: 3, cancelled: 4 };
          const aOrder = statusOrder[a.status] ?? 5;
          const bOrder = statusOrder[b.status] ?? 5;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.date.getTime() - b.date.getTime();
        });

        setMyInvitationals(invitationals);
      } catch (invError) {
        console.warn("Invitationals not available yet:", invError);
        setMyInvitationals([]);
      }
    } catch (error) {
      console.error("Error loading competitions:", error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await loadCompetitions();
    setRefreshing(false);
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

  const formatLabel = (format: string) => {
    switch (format) {
      case "stroke": return "Stroke Play";
      case "stableford": return "Stableford";
      case "scramble": return "Scramble";
      default: return format;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
        <Text style={styles.loadingText}>Loading competitions...</Text>
      </View>
    );
  }

  return (
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
      {/* ============================================================ */}
      {/* LEAGUES                                                      */}
      {/* ============================================================ */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="shield" size={18} color="#0D5C3A" />
            <Text style={styles.sectionTitle}>Leagues</Text>
          </View>
          <TouchableOpacity
            style={styles.sectionAction}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/leagues/explore" as any);
            }}
          >
            <Text style={styles.sectionActionText}>Explore</Text>
            <Ionicons name="arrow-forward" size={14} color="#0D5C3A" />
          </TouchableOpacity>
        </View>

        {myLeagues.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="shield-outline" size={36} color="#CCC" />
            <Text style={styles.emptyTitle}>No Leagues Yet</Text>
            <Text style={styles.emptySubtext}>
              Join an existing league or create your own season-long competition
            </Text>
            <View style={styles.emptyActions}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/leagues/explore" as any);
                }}
              >
                <Text style={styles.primaryButtonText}>Find a League</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/leagues/create" as any);
                }}
              >
                <Text style={styles.secondaryButtonText}>Create League</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {myLeagues.map((league) => (
              <TouchableOpacity
                key={league.id}
                style={styles.competitionCard}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({
                    pathname: "/leagues/home" as any,
                    params: { leagueId: league.id },
                  });
                }}
                activeOpacity={0.7}
              >
                <View style={styles.competitionLeft}>
                  {league.avatar ? (
                    <Image
                      source={{ uri: league.avatar }}
                      style={styles.competitionAvatar}
                    />
                  ) : (
                    <View style={styles.competitionAvatarPlaceholder}>
                      <Ionicons name="shield" size={20} color="#FFF" />
                    </View>
                  )}
                  <View style={styles.competitionInfo}>
                    <Text style={styles.competitionName}>{league.name}</Text>
                    <Text style={styles.competitionMeta}>
                      {league.format === "stroke"
                        ? "Stroke Play"
                        : "2v2 Match Play"}
                      {league.currentWeek && league.totalWeeks
                        ? ` • Week ${league.currentWeek}/${league.totalWeeks}`
                        : ""}
                    </Text>
                  </View>
                </View>

                <View style={styles.competitionRight}>
                  <View
                    style={[
                      styles.statusBadge,
                      league.status === "active"
                        ? styles.statusActive
                        : styles.statusUpcoming,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        league.status === "active"
                          ? styles.statusTextActive
                          : styles.statusTextUpcoming,
                      ]}
                    >
                      {league.status === "active"
                        ? "Active"
                        : league.status === "upcoming"
                        ? "Upcoming"
                        : "Completed"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#CCC" />
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.createNewButton}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push("/leagues/create" as any);
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color="#0D5C3A" />
              <Text style={styles.createNewText}>Create New League</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ============================================================ */}
      {/* INVITATIONALS                                                */}
      {/* ============================================================ */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="trophy" size={18} color="#B8860B" />
            <Text style={styles.sectionTitle}>Invitationals</Text>
          </View>
          {myInvitationals.length > 0 && (
            <TouchableOpacity
              style={styles.sectionAction}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push("/invitationals/create" as any);
              }}
            >
              <Text style={styles.sectionActionText}>Host</Text>
              <Ionicons name="add" size={14} color="#0D5C3A" />
            </TouchableOpacity>
          )}
        </View>

        {/* Pending invitations */}
        {myInvitationals
          .filter((inv) => inv.userStatus === "invited" && inv.status === "open")
          .map((inv) => (
            <TouchableOpacity
              key={`invite-${inv.id}`}
              style={styles.inviteCard}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({
                  pathname: "/invitationals/[id]" as any,
                  params: { id: inv.id },
                });
              }}
              activeOpacity={0.7}
            >
              <View style={styles.inviteBadge}>
                <Ionicons name="mail" size={16} color="#FFF" />
              </View>
              <View style={styles.inviteContent}>
                <Text style={styles.inviteTitle}>You're Invited!</Text>
                <Text style={styles.inviteName}>{inv.name}</Text>
                <Text style={styles.inviteMeta}>
                  {inv.courseName} • {formatDate(inv.date)} • Hosted by {inv.hostName}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#B8860B" />
            </TouchableOpacity>
          ))}

        {/* Active / upcoming invitationals */}
        {myInvitationals
          .filter((inv) => inv.userStatus !== "invited" || inv.status !== "open")
          .length === 0 && myInvitationals.filter((inv) => inv.userStatus === "invited" && inv.status === "open").length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="trophy-outline" size={36} color="#CCC" />
            <Text style={styles.emptyTitle}>No Invitationals Yet</Text>
            <Text style={styles.emptySubtext}>
              Plan a golf trip, organize a local rivalry, or build your own multi-round series — pick the courses, set the dates, and crown a champion
            </Text>
            <View style={styles.emptyActions}>
              <TouchableOpacity
                style={styles.primaryButtonGold}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push("/invitationals/create" as any);
                }}
              >
                <Ionicons name="trophy" size={16} color="#FFF" />
                <Text style={styles.primaryButtonText}>Host an Invitational</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {myInvitationals
              .filter((inv) => !(inv.userStatus === "invited" && inv.status === "open"))
              .map((inv) => (
                <TouchableOpacity
                  key={inv.id}
                  style={styles.competitionCard}
                  onPress={() => {
                    soundPlayer.play("click");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: "/invitationals/[id]" as any,
                      params: { id: inv.id },
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.competitionLeft}>
                    <View style={styles.invitationalAvatarPlaceholder}>
                      <Ionicons name="trophy" size={20} color="#FFF" />
                    </View>
                    <View style={styles.competitionInfo}>
                      <Text style={styles.competitionName}>{inv.name}</Text>
                      <Text style={styles.competitionMeta}>
                        {inv.courseName} • {formatDate(inv.date)}
                      </Text>
                      <Text style={styles.competitionMeta}>
                        {formatLabel(inv.format)} • {inv.playerCount}/{inv.maxPlayers} players
                      </Text>
                    </View>
                  </View>

                  <View style={styles.competitionRight}>
                    <View
                      style={[
                        styles.statusBadge,
                        inv.status === "active" ? styles.statusActive :
                        inv.status === "open" ? styles.statusUpcoming :
                        inv.status === "completed" ? styles.statusCompleted :
                        styles.statusDraft,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          inv.status === "active" ? styles.statusTextActive :
                          inv.status === "open" ? styles.statusTextUpcoming :
                          inv.status === "completed" ? styles.statusTextCompleted :
                          styles.statusTextDraft,
                        ]}
                      >
                        {inv.status === "active" ? "Live" :
                         inv.status === "open" ? "Open" :
                         inv.status === "completed" ? "Completed" :
                         inv.status === "draft" ? "Draft" : inv.status}
                      </Text>
                    </View>
                    {inv.userStatus === "host" && (
                      <View style={styles.hostBadge}>
                        <Text style={styles.hostBadgeText}>Host</Text>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={16} color="#CCC" />
                  </View>
                </TouchableOpacity>
              ))}

            <TouchableOpacity
              style={styles.createNewButton}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push("/invitationals/create" as any);
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color="#B8860B" />
              <Text style={[styles.createNewText, { color: "#B8860B" }]}>
                Host New Invitational
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ============================================================ */}
      {/* TOURS                                                        */}
      {/* ============================================================ */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="golf" size={18} color="#999" />
            <Text style={[styles.sectionTitle, styles.sectionTitleDisabled]}>
              Tours
            </Text>
          </View>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>Coming Soon</Text>
          </View>
        </View>

        <View style={styles.comingSoonCard}>
          <Ionicons name="golf-outline" size={28} color="#BBB" />
          <Text style={styles.comingSoonCardTitle}>
            Professional Tour Series
          </Text>
          <Text style={styles.comingSoonCardDesc}>
            Paid, multi-course competitive series with entry fees, points races, purses, and season-long standings. The serious side of amateur golf.
          </Text>
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
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#888",
  },

  // Sections
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
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  sectionTitleDisabled: {
    color: "#999",
  },
  sectionAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sectionActionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  // Empty state
  emptyCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
  },
  emptySubtext: {
    fontSize: 12,
    color: "#888",
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  emptyActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  primaryButtonGold: {
    backgroundColor: "#B8860B",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#0D5C3A",
  },
  secondaryButtonText: {
    color: "#0D5C3A",
    fontSize: 13,
    fontWeight: "700",
  },

  // Invitation card
  inviteCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF8E1",
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "#FFE082",
  },
  inviteBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#B8860B",
    alignItems: "center",
    justifyContent: "center",
  },
  inviteContent: {
    flex: 1,
    gap: 2,
  },
  inviteTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B8860B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inviteName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
  },
  inviteMeta: {
    fontSize: 12,
    color: "#888",
  },

  // Competition cards
  competitionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  competitionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  competitionAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  competitionAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  invitationalAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#B8860B",
    alignItems: "center",
    justifyContent: "center",
  },
  competitionInfo: {
    flex: 1,
    gap: 2,
  },
  competitionName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
  },
  competitionMeta: {
    fontSize: 12,
    color: "#888",
  },
  competitionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  // Status badges
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusActive: {
    backgroundColor: "rgba(13, 92, 58, 0.1)",
  },
  statusUpcoming: {
    backgroundColor: "#FFF8E1",
  },
  statusCompleted: {
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  statusDraft: {
    backgroundColor: "rgba(0, 0, 0, 0.04)",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusTextActive: {
    color: "#0D5C3A",
  },
  statusTextUpcoming: {
    color: "#F59E0B",
  },
  statusTextCompleted: {
    color: "#666",
  },
  statusTextDraft: {
    color: "#999",
  },

  // Host badge
  hostBadge: {
    backgroundColor: "rgba(184, 134, 11, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#B8860B",
  },

  // Create new
  createNewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(13, 92, 58, 0.2)",
    borderStyle: "dashed",
  },
  createNewText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  // Coming soon
  comingSoonBadge: {
    backgroundColor: "#FFF8E1",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  comingSoonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#F59E0B",
  },
  comingSoonCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    gap: 8,
    opacity: 0.7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  comingSoonCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#666",
  },
  comingSoonCardDesc: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: 8,
  },
});