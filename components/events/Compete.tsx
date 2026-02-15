/**
 * Compete Tab
 *
 * Hub for structured competitions: Leagues, Cups, Tournaments.
 * Shows active competitions the user is in, invites, and CTAs
 * to create or join new ones.
 *
 * Leagues are live now. Cups and Tournaments coming later
 * (same underlying architecture with different settings).
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
    getDocs
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

export default function Compete({ userId }: CompeteProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myLeagues, setMyLeagues] = useState<LeagueSummary[]>([]);

  useEffect(() => {
    if (userId) loadCompetitions();
  }, [userId]);

  const loadCompetitions = async () => {
    try {
      // Find leagues where user is a member
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

            {/* Create new */}
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
      {/* CUPS                                                         */}
      {/* ============================================================ */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="golf" size={18} color="#999" />
            <Text style={[styles.sectionTitle, styles.sectionTitleDisabled]}>
              Cups
            </Text>
          </View>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>Coming Soon</Text>
          </View>
        </View>

        <View style={styles.comingSoonCard}>
          <Ionicons name="golf-outline" size={28} color="#BBB" />
          <Text style={styles.comingSoonCardTitle}>Golf Trip Cups</Text>
          <Text style={styles.comingSoonCardDesc}>
            Plan a multi-round cup with your buddies. Different courses,
            rotating matchups, one champion.
          </Text>
        </View>
      </View>

      {/* ============================================================ */}
      {/* TOURNAMENTS                                                  */}
      {/* ============================================================ */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="ribbon" size={18} color="#999" />
            <Text style={[styles.sectionTitle, styles.sectionTitleDisabled]}>
              Tournaments
            </Text>
          </View>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>Coming Soon</Text>
          </View>
        </View>

        <View style={styles.comingSoonCard}>
          <Ionicons name="ribbon-outline" size={28} color="#BBB" />
          <Text style={styles.comingSoonCardTitle}>
            Course & League Tournaments
          </Text>
          <Text style={styles.comingSoonCardDesc}>
            Open-registration events hosted by courses or league commissioners.
            Single or multi-day formats.
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