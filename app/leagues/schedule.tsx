/**
 * League Hub - Schedule Tab
 * 
 * Shows the weekly schedule for the selected league
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
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
  status: string;
  currentWeek: number;
  totalWeeks: number;
  elevatedWeeks?: number[];
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

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function LeagueSchedule() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUserId = auth.currentUser?.uid;

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Commissioner status
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [commissionerLeagueId, setCommissionerLeagueId] = useState<string | null>(null);

  // User's leagues
  const [myLeagues, setMyLeagues] = useState<LeagueCard[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [showLeagueSelector, setShowLeagueSelector] = useState(false);

  /* ================================================================ */
  /* DATA LOADING                                                    */
  /* ================================================================ */

  useEffect(() => {
    if (!currentUserId) return;
    loadMyLeagues();
    checkCommissionerStatus();
  }, [currentUserId]);

  useEffect(() => {
    if (selectedLeagueId) {
      loadLeagueDetails(selectedLeagueId);
    }
  }, [selectedLeagueId]);

  const checkCommissionerStatus = async () => {
    if (!currentUserId) return;

    try {
      const userDoc = await getDoc(doc(db, "users", currentUserId));
      if (!userDoc.exists()) return;

      const userData = userDoc.data();
      const approved = userData.isApprovedCommissioner === true;
      setIsCommissioner(approved);

      if (approved) {
        const leaguesSnap = await getDocs(
          query(
            collection(db, "leagues"),
            where("hostUserId", "==", currentUserId)
          )
        );

        if (!leaguesSnap.empty) {
          setCommissionerLeagueId(leaguesSnap.docs[0].id);
        }
      }
    } catch (error) {
      console.error("Error checking commissioner status:", error);
    }
  };

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
    try {
      const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
      if (!leagueDoc.exists()) return;

      setSelectedLeague({ id: leagueDoc.id, ...leagueDoc.data() } as League);
    } catch (error) {
      console.error("Error loading league details:", error);
    }
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

    if (tab === "schedule") return;

    router.replace(`/leagues/${tab}` as any);
  };

  const handleSelectLeague = (leagueId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedLeagueId(leagueId);
    setShowLeagueSelector(false);
  };

  const handleCommissionerSettings = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (commissionerLeagueId) {
      router.push({
        pathname: "/leagues/settings" as any,
        params: { leagueId: commissionerLeagueId },
      });
    } else {
      router.push("/leagues/create" as any);
    }
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
      {isCommissioner ? (
        <TouchableOpacity
          onPress={handleCommissionerSettings}
          style={styles.headerButton}
        >
          <Image
            source={require("@/assets/icons/Settings.png")}
            style={styles.headerIcon}
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.headerRight} />
      )}
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
          style={[styles.tab, tab.key === "schedule" && styles.tabActive]}
          onPress={() => handleTabChange(tab.key)}
        >
          <Text
            style={[
              styles.tabText,
              tab.key === "schedule" && styles.tabTextActive,
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

  const renderSchedule = () => {
    if (!selectedLeague) {
      return (
        <View style={styles.card}>
          <Text style={styles.emptyText}>Join a league to see the schedule</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => handleTabChange("explore")}
          >
            <Text style={styles.primaryButtonText}>Find a League</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const scheduleItems = [];
    for (let week = 1; week <= selectedLeague.totalWeeks; week++) {
      const isElevated = selectedLeague.elevatedWeeks?.includes(week);
      const isCurrent = week === selectedLeague.currentWeek;
      const isPast = week < selectedLeague.currentWeek;

      scheduleItems.push(
        <View
          key={week}
          style={[
            styles.scheduleItem,
            isCurrent && styles.scheduleItemCurrent,
            isPast && styles.scheduleItemPast,
          ]}
        >
          <View style={styles.scheduleWeek}>
            <Text style={[styles.scheduleWeekNumber, isPast && styles.scheduleTextPast]}>
              Week {week}
            </Text>
            {isElevated && (
              <View style={styles.elevatedBadge}>
                <Text style={styles.elevatedBadgeText}>⚡ Elevated</Text>
              </View>
            )}
          </View>
          <Text style={[styles.scheduleStatus, isPast && styles.scheduleTextPast]}>
            {isPast ? "Completed" : isCurrent ? "In Progress" : "Upcoming"}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>SEASON SCHEDULE</Text>
        {scheduleItems}
      </View>
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

  return (
    <View style={styles.container}>
      {renderHeader()}
      {myLeagues.length > 0 && renderLeagueSelector()}
      {renderTabs()}

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {renderSchedule()}
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

  // Schedule
  scheduleItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  scheduleItemCurrent: {
    backgroundColor: "rgba(13, 92, 58, 0.1)",
    marginHorizontal: -16,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  scheduleItemPast: {
    opacity: 0.6,
  },
  scheduleWeek: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scheduleWeekNumber: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  scheduleTextPast: {
    color: "#999",
  },
  scheduleStatus: {
    fontSize: 13,
    color: "#666",
  },
  elevatedBadge: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  elevatedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#333",
  },

  // Empty State
  emptyText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    paddingVertical: 20,
  },
  primaryButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
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