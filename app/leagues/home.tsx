/**
 * League Hub - Home Tab
 * 
 * Shows:
 * - League selector (if multiple leagues)
 * - Notices/deadlines
 * - Current week status
 * - This week's results
 * - Your season stats
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    where
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface League {
  id: string;
  name: string;
  logoUrl?: string;
  status: "draft" | "upcoming" | "active" | "completed" | "cancelled";
  currentWeek: number;
  totalWeeks: number;
  restrictCourses: boolean;
  allowedCourseNames?: string[];
}

interface LeagueCard {
  id: string;
  name: string;
  logoUrl?: string;
  currentWeek: number;
  totalWeeks: number;
  userRank?: number;
  userPoints?: number;
}

interface LeagueMember {
  currentRank?: number;
  totalPoints: number;
  roundsPlayed: number;
  wins: number;
}

interface WeeklyStandingsEntry {
  position: number;
  userId: string;
  displayName: string;
  avatar?: string;
  netScore?: number;
  points: number;
}

interface Notice {
  id: string;
  message: string;
  type: "info" | "warning" | "deadline";
}

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function LeagueHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUserId = auth.currentUser?.uid;

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // User's leagues
  const [myLeagues, setMyLeagues] = useState<LeagueCard[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [showLeagueSelector, setShowLeagueSelector] = useState(false);

  // League data
  const [myMembership, setMyMembership] = useState<LeagueMember | null>(null);
  const [weeklyStandings, setWeeklyStandings] = useState<WeeklyStandingsEntry[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);

  /* ================================================================ */
  /* DATA LOADING                                                    */
  /* ================================================================ */

  useEffect(() => {
    if (!currentUserId) return;
    loadMyLeagues();
  }, [currentUserId]);

  useEffect(() => {
    if (selectedLeagueId) {
      loadLeagueDetails(selectedLeagueId);
    }
  }, [selectedLeagueId]);

  const loadMyLeagues = async () => {
    if (!currentUserId) return;

    try {
      setLoading(true);

      const leaguesSnap = await getDocs(collection(db, "leagues"));
      const userLeagues: LeagueCard[] = [];

      for (const leagueDoc of leaguesSnap.docs) {
        const memberDoc = await getDoc(
          doc(db, "leagues", leagueDoc.id, "members", currentUserId)
        );

        if (memberDoc.exists()) {
          const leagueData = leagueDoc.data();
          const memberData = memberDoc.data();

          userLeagues.push({
            id: leagueDoc.id,
            name: leagueData.name,
            logoUrl: leagueData.logoUrl,
            currentWeek: leagueData.currentWeek || 0,
            totalWeeks: leagueData.totalWeeks || 0,
            userRank: memberData.currentRank,
            userPoints: memberData.totalPoints || 0,
          });
        }
      }

      setMyLeagues(userLeagues);

      // Auto-select first league if none selected
      if (userLeagues.length > 0 && !selectedLeagueId) {
        setSelectedLeagueId(userLeagues[0].id);
      }

      setLoading(false);
    } catch (error) {
      console.error("Error loading leagues:", error);
      setLoading(false);
    }
  };

  const loadLeagueDetails = async (leagueId: string) => {
    if (!currentUserId) return;

    try {
      // Load league document
      const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
      if (!leagueDoc.exists()) return;

      const leagueData = { id: leagueDoc.id, ...leagueDoc.data() } as League;
      setSelectedLeague(leagueData);

      // Load user's membership
      const memberDoc = await getDoc(
        doc(db, "leagues", leagueId, "members", currentUserId)
      );
      if (memberDoc.exists()) {
        setMyMembership(memberDoc.data() as LeagueMember);
      }

      // Load weekly standings (current week)
      await loadWeeklyStandings(leagueId, leagueData.currentWeek);

      // Generate notices
      generateNotices(leagueData);
    } catch (error) {
      console.error("Error loading league details:", error);
    }
  };

  const loadWeeklyStandings = async (leagueId: string, week: number) => {
    try {
      const scoresSnap = await getDocs(
        query(
          collection(db, "leagues", leagueId, "scores"),
          where("week", "==", week),
          orderBy("netScore", "asc")
        )
      );

      const standings: WeeklyStandingsEntry[] = scoresSnap.docs.map((doc, index) => {
        const data = doc.data();
        return {
          position: index + 1,
          userId: data.userId,
          displayName: data.displayName,
          avatar: data.avatar,
          netScore: data.netScore,
          points: data.points || 0,
        };
      });

      setWeeklyStandings(standings);
    } catch (error) {
      console.error("Error loading weekly standings:", error);
    }
  };

  const generateNotices = (league: League) => {
    const newNotices: Notice[] = [];

    if (league.status === "active" && league.currentWeek > 0) {
      newNotices.push({
        id: "deadline",
        message: `Week ${league.currentWeek} deadline is Sunday at midnight`,
        type: "deadline",
      });
    }

    setNotices(newNotices);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMyLeagues();
    if (selectedLeagueId) {
      await loadLeagueDetails(selectedLeagueId);
    }
    setRefreshing(false);
  };

  /* ================================================================ */
  /* HANDLERS                                                        */
  /* ================================================================ */

  const handleTabChange = (tab: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (tab === "home") return; // Already here

    router.replace(`/leagues/${tab}` as any);
  };

  const handleSelectLeague = (leagueId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedLeagueId(leagueId);
    setShowLeagueSelector(false);
  };

  const handlePostScore = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: "/post-score" as any,
      params: { leagueId: selectedLeagueId },
    });
  };

  const dismissNotice = (noticeId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNotices((prev) => prev.filter((n) => n.id !== noticeId));
  };

  /* ================================================================ */
  /* RENDER HELPERS                                                  */
  /* ================================================================ */

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <TouchableOpacity
        onPress={() => {
          soundPlayer.play("click");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}
        style={styles.headerButton}
      >
        <Image
          source={require("@/assets/icons/Back.png")}
          style={styles.headerIcon}
        />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>League Hub</Text>
      <View style={styles.headerRight} />
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabBar}>
      {[
        { key: "home", label: "Home" },
        { key: "schedule", label: "Schedule" },
        { key: "standings", label: "Standings" },
        { key: "explore", label: "Explore" },
      ].map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.tab, tab.key === "home" && styles.tabActive]}
          onPress={() => handleTabChange(tab.key)}
        >
          <Text
            style={[
              styles.tabText,
              tab.key === "home" && styles.tabTextActive,
            ]}
          >
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderLeagueSelector = () => {
    if (myLeagues.length === 0) return null;

    const selected = myLeagues.find((l) => l.id === selectedLeagueId);

    return (
      <TouchableOpacity
        style={styles.leagueSelector}
        onPress={() => {
          if (myLeagues.length > 1) {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowLeagueSelector(true);
          }
        }}
        disabled={myLeagues.length <= 1}
      >
        <View style={styles.leagueSelectorContent}>
          {selected?.logoUrl ? (
            <Image source={{ uri: selected.logoUrl }} style={styles.leagueLogo} />
          ) : (
            <View style={styles.leagueLogoPlaceholder}>
              <Text style={styles.leagueLogoText}>
                {selected?.name?.charAt(0) || "L"}
              </Text>
            </View>
          )}
          <View style={styles.leagueSelectorText}>
            <Text style={styles.leagueName}>{selected?.name || "Select League"}</Text>
            <Text style={styles.leagueSubtitle}>
              Week {selected?.currentWeek || 0} of {selected?.totalWeeks || 0}
            </Text>
          </View>
        </View>
        {myLeagues.length > 1 && (
          <Ionicons name="chevron-down" size={20} color="#0D5C3A" />
        )}
      </TouchableOpacity>
    );
  };

  const renderLeagueSelectorModal = () => (
    <Modal
      visible={showLeagueSelector}
      transparent
      animationType="fade"
      onRequestClose={() => setShowLeagueSelector(false)}
    >
      <Pressable
        style={styles.modalBackdrop}
        onPress={() => setShowLeagueSelector(false)}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Select League</Text>
          {myLeagues.map((league) => (
            <TouchableOpacity
              key={league.id}
              style={[
                styles.modalOption,
                league.id === selectedLeagueId && styles.modalOptionSelected,
              ]}
              onPress={() => handleSelectLeague(league.id)}
            >
              <View style={styles.modalOptionContent}>
                {league.logoUrl ? (
                  <Image source={{ uri: league.logoUrl }} style={styles.modalLogo} />
                ) : (
                  <View style={styles.modalLogoPlaceholder}>
                    <Text style={styles.modalLogoText}>
                      {league.name?.charAt(0) || "L"}
                    </Text>
                  </View>
                )}
                <View>
                  <Text style={styles.modalOptionTitle}>{league.name}</Text>
                  <Text style={styles.modalOptionSubtitle}>
                    Rank #{league.userRank || "-"} • {league.userPoints || 0} pts
                  </Text>
                </View>
              </View>
              {league.id === selectedLeagueId && (
                <Ionicons name="checkmark" size={20} color="#0D5C3A" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </Pressable>
    </Modal>
  );

  /* ================================================================ */
  /* MAIN RENDER                                                     */
  /* ================================================================ */

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  // If no leagues, redirect to explore
  if (myLeagues.length === 0) {
    router.replace("/leagues/explore");
    return null;
  }

  return (
    <View style={styles.container}>
      {renderHeader()}
      {renderLeagueSelector()}
      {renderTabs()}

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Notices */}
        {notices.map((notice) => (
          <View key={notice.id} style={styles.noticeCard}>
            <View style={styles.noticeContent}>
              <Text style={styles.noticeIcon}>
                {notice.type === "deadline" ? "⏰" : "📢"}
              </Text>
              <Text style={styles.noticeText}>{notice.message}</Text>
            </View>
            <TouchableOpacity onPress={() => dismissNotice(notice.id)}>
              <Ionicons name="close" size={18} color="#856404" />
            </TouchableOpacity>
          </View>
        ))}

        {/* Next Match Card */}
        {selectedLeague && selectedLeague.status === "active" && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>NEXT MATCH</Text>
            <Text style={styles.cardTitle}>
              {selectedLeague.name} • Week {selectedLeague.currentWeek}
            </Text>
            <Text style={styles.cardSubtitle}>
              {selectedLeague.restrictCourses
                ? `Course: ${selectedLeague.allowedCourseNames?.[0] || "Restricted"}`
                : "Course: Any"}
            </Text>
            <TouchableOpacity style={styles.postScoreButton} onPress={handlePostScore}>
              <Text style={styles.postScoreButtonText}>Post Score</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* This Week's Results */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>THIS WEEK'S RESULTS</Text>
          {weeklyStandings.length === 0 ? (
            <Text style={styles.emptyText}>No scores posted yet this week</Text>
          ) : (
            weeklyStandings.slice(0, 5).map((entry) => (
              <View key={entry.userId} style={styles.standingsRow}>
                <Text style={styles.standingsPosition}>{entry.position}.</Text>
                <View style={styles.standingsUser}>
                  {entry.avatar ? (
                    <Image source={{ uri: entry.avatar }} style={styles.standingsAvatar} />
                  ) : (
                    <View style={styles.standingsAvatarPlaceholder}>
                      <Text style={styles.standingsAvatarText}>
                        {entry.displayName?.charAt(0) || "?"}
                      </Text>
                    </View>
                  )}
                  <Text
                    style={[
                      styles.standingsName,
                      entry.userId === currentUserId && styles.standingsNameYou,
                    ]}
                  >
                    {entry.userId === currentUserId ? "You" : entry.displayName}
                  </Text>
                </View>
                <Text style={styles.standingsScore}>{entry.netScore} net</Text>
                <Text style={styles.standingsPoints}>{entry.points} pts</Text>
              </View>
            ))
          )}
        </View>

        {/* Your Season Stats */}
        {myMembership && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>YOUR SEASON</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{myMembership.currentRank || "-"}</Text>
                <Text style={styles.statLabel}>Rank</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{myMembership.totalPoints}</Text>
                <Text style={styles.statLabel}>Points</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{myMembership.roundsPlayed}</Text>
                <Text style={styles.statLabel}>Rounds</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{myMembership.wins}</Text>
                <Text style={styles.statLabel}>Wins</Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {renderLeagueSelectorModal()}
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F8F0",
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#0D5C3A",
  },
  headerButton: {
    padding: 8,
  },
  headerIcon: {
    width: 24,
    height: 24,
    tintColor: "#F4EED8",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F4EED8",
    fontFamily: "AmericanTypewriter-Bold",
  },
  headerRight: {
    width: 40,
  },

  // Tabs
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: "#0D5C3A",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  tabTextActive: {
    color: "#FFF",
  },

  // League Selector
  leagueSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  leagueSelectorContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  leagueLogo: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  leagueLogoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },
  leagueLogoText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },
  leagueSelectorText: {},
  leagueName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  leagueSubtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },

  // Content
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // Cards
  card: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    letterSpacing: 1,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },

  // Notice
  noticeCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF3CD",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#D4A300",
  },
  noticeContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  noticeIcon: {
    fontSize: 18,
  },
  noticeText: {
    fontSize: 14,
    color: "#856404",
    flex: 1,
  },

  // Post Score Button
  postScoreButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  postScoreButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },

  // Standings
  standingsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  standingsPosition: {
    width: 24,
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  standingsUser: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  standingsAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  standingsAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },
  standingsAvatarText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
  standingsName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  standingsNameYou: {
    color: "#0D5C3A",
  },
  standingsScore: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    width: 60,
    textAlign: "right",
  },
  standingsPoints: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    width: 50,
    textAlign: "right",
  },

  // Stats Grid
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 8,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },

  // Empty State
  emptyText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    paddingVertical: 20,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 16,
    textAlign: "center",
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  modalOptionSelected: {
    backgroundColor: "rgba(13, 92, 58, 0.1)",
  },
  modalOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  modalLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },
  modalLogoText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  modalOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  modalOptionSubtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
});