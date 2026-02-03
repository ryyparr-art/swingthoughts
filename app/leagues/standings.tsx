/**
 * League Hub - Standings Tab
 *
 * Shows:
 * - Full leaderboard with position changes
 * - Stroke: Player standings with avatar, rounds, points, wins
 * - 2v2: Team standings with W-L record
 * - User's row flashes with green border on load
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
  onSnapshot,
  orderBy,
  query
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
  avatar?: string;
  format: "stroke" | "2v2";
  status: "upcoming" | "active" | "completed";
  currentWeek: number;
  totalWeeks: number;
  pointsPerWeek?: number;
  hasElevatedEvents?: boolean;
  elevatedWeeks?: number[];
  elevatedMultiplier?: number;
  purse?: {
    seasonPurse: number;
    weeklyPurse: number;
    elevatedPurse: number;
    currency?: string;
  };
}

interface LeagueCard {
  id: string;
  name: string;
  avatar?: string;
  currentWeek: number;
  totalWeeks: number;
}

interface PlayerStanding {
  odcuserId: string;
  displayName: string;
  avatar?: string;
  rank: number;
  previousRank?: number;
  roundsPlayed: number;
  totalPoints: number;
  wins: number;
}

interface TeamStanding {
  teamId: string;
  teamName: string;
  teamAvatar?: string;
  rank: number;
  previousRank?: number;
  wins: number;
  losses: number;
  totalPoints: number;
}

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function LeagueStandings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUserId = auth.currentUser?.uid;

  // Loading states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // User's leagues
  const [myLeagues, setMyLeagues] = useState<LeagueCard[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [showLeagueSelector, setShowLeagueSelector] = useState(false);

  // Standings data
  const [playerStandings, setPlayerStandings] = useState<PlayerStanding[]>([]);
  const [teamStandings, setTeamStandings] = useState<TeamStanding[]>([]);

  // Commissioner/Manager status
  const [isCommissionerOrManager, setIsCommissionerOrManager] = useState(false);

  // Flash animation for user's row
  const flashAnim = useRef(new Animated.Value(0)).current;
  const [shouldFlash, setShouldFlash] = useState(true);

  /* ================================================================ */
  /* DATA LOADING                                                    */
  /* ================================================================ */

  useEffect(() => {
    if (!currentUserId) return;
    loadMyLeagues();
  }, [currentUserId]);

  useEffect(() => {
    if (selectedLeagueId && currentUserId) {
      const unsubscribers: (() => void)[] = [];

      // Listen to league doc
      const leagueUnsub = onSnapshot(
        doc(db, "leagues", selectedLeagueId),
        (docSnap) => {
          if (docSnap.exists()) {
            const leagueData = { id: docSnap.id, ...docSnap.data() } as League;
            setSelectedLeague(leagueData);
          }
        }
      );
      unsubscribers.push(leagueUnsub);

      // Check membership role
      getDoc(doc(db, "leagues", selectedLeagueId, "members", currentUserId)).then(
        (docSnap) => {
          if (docSnap.exists()) {
            const role = docSnap.data().role;
            setIsCommissionerOrManager(
              role === "commissioner" || role === "manager"
            );
          }
        }
      );

      // Load standings
      loadStandings(selectedLeagueId);

      return () => {
        unsubscribers.forEach((unsub) => unsub());
      };
    }
  }, [selectedLeagueId, currentUserId]);

  // Trigger flash animation
  useEffect(() => {
    if (shouldFlash && !loading && (playerStandings.length > 0 || teamStandings.length > 0)) {
      triggerFlash();
      setShouldFlash(false);
    }
  }, [shouldFlash, loading, playerStandings, teamStandings]);

  const triggerFlash = () => {
    flashAnim.setValue(0);
    Animated.sequence([
      Animated.timing(flashAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: false,
      }),
    ]).start();
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
          userLeagues.push({
            id: leagueDoc.id,
            name: leagueData.name,
            avatar: leagueData.avatar,
            currentWeek: leagueData.currentWeek || 0,
            totalWeeks: leagueData.totalWeeks || 0,
          });
        }
      }

      setMyLeagues(userLeagues);

      if (userLeagues.length > 0 && !selectedLeagueId) {
        setSelectedLeagueId(userLeagues[0].id);
      }
    } catch (error) {
      console.error("Error loading leagues:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadStandings = async (leagueId: string) => {
    try {
      // Get league to determine format
      const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
      if (!leagueDoc.exists()) return;

      const leagueData = leagueDoc.data();
      const format = leagueData.format;

      if (format === "2v2") {
        // Load team standings
        const teamsSnap = await getDocs(
          query(
            collection(db, "leagues", leagueId, "teams"),
            orderBy("totalPoints", "desc")
          )
        );

        const teams: TeamStanding[] = [];
        let rank = 1;
        teamsSnap.forEach((docSnap) => {
          const data = docSnap.data();
          teams.push({
            teamId: docSnap.id,
            teamName: data.name,
            teamAvatar: data.avatar,
            rank: rank,
            previousRank: data.previousRank,
            wins: data.wins || 0,
            losses: data.losses || 0,
            totalPoints: data.totalPoints || 0,
          });
          rank++;
        });

        setTeamStandings(teams);
        setPlayerStandings([]);
      } else {
        // Load player standings
        const membersSnap = await getDocs(
          query(
            collection(db, "leagues", leagueId, "members"),
            orderBy("totalPoints", "desc")
          )
        );

        const players: PlayerStanding[] = [];
        let rank = 1;
        membersSnap.forEach((docSnap) => {
          const data = docSnap.data();
          players.push({
            odcuserId: docSnap.id,
            displayName: data.displayName,
            avatar: data.avatar,
            rank: rank,
            previousRank: data.previousRank,
            roundsPlayed: data.roundsPlayed || 0,
            totalPoints: data.totalPoints || 0,
            wins: data.wins || 0,
          });
          rank++;
        });

        setPlayerStandings(players);
        setTeamStandings([]);
      }
    } catch (error) {
      console.error("Error loading standings:", error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setShouldFlash(true);
    await loadMyLeagues();
    if (selectedLeagueId) {
      await loadStandings(selectedLeagueId);
    }
    setRefreshing(false);
  };

  /* ================================================================ */
  /* HANDLERS                                                        */
  /* ================================================================ */

  const handleSelectLeague = (leagueId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedLeagueId(leagueId);
    setShowLeagueSelector(false);
    setShouldFlash(true);
  };

  const handleSettings = () => {
    soundPlayer.play("click");
    router.push(`/leagues/settings?id=${selectedLeagueId}`);
  };

  const handlePlayerPress = (odcuserId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/profile/${odcuserId}`);
  };

  const handleTeamPress = (teamId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Could navigate to team detail page
  };

  /* ================================================================ */
  /* HELPERS                                                         */
  /* ================================================================ */

  const getPositionChange = (current: number, previous?: number) => {
    if (previous === undefined || previous === null) {
      return { type: "new", change: 0 };
    }
    if (current < previous) {
      return { type: "up", change: previous - current };
    }
    if (current > previous) {
      return { type: "down", change: current - previous };
    }
    return { type: "same", change: 0 };
  };

  const getLeaderPoints = () => {
    if (selectedLeague?.format === "2v2") {
      return teamStandings[0]?.totalPoints || 0;
    }
    return playerStandings[0]?.totalPoints || 0;
  };

  const getPointsBehind = (points: number, rank: number) => {
    if (rank === 1) return "-";
    const leader = getLeaderPoints();
    return (leader - points).toString();
  };

  /* ================================================================ */
  /* RENDER COMPONENTS                                               */
  /* ================================================================ */

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => router.push("/leaderboard")}
      >
        <Ionicons name="chevron-back" size={28} color="#F4EED8" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>League Hub</Text>
      {isCommissionerOrManager ? (
        <TouchableOpacity style={styles.headerButton} onPress={handleSettings}>
          <Ionicons name="settings-outline" size={24} color="#F4EED8" />
        </TouchableOpacity>
      ) : (
        <View style={styles.headerRight} />
      )}
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabBar}>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => router.push("/leagues/home")}
      >
        <Text style={styles.tabText}>Home</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => router.push("/leagues/schedule")}
      >
        <Text style={styles.tabText}>Schedule</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, styles.tabActive]}>
        <Text style={[styles.tabText, styles.tabTextActive]}>Standings</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => router.push("/leagues/explore")}
      >
        <Text style={styles.tabText}>Explore</Text>
      </TouchableOpacity>
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
          <View style={styles.leagueLogoPlaceholder}>
            {selectedLeague?.avatar ? (
              <Image source={{ uri: selectedLeague.avatar }} style={styles.leagueLogoImage} />
            ) : (
              <Text style={styles.leagueLogoText}>
                {selected?.name?.charAt(0) || "L"}
              </Text>
            )}
          </View>
          <View style={styles.leagueSelectorText}>
            <Text style={styles.leagueName}>
              {selected?.name || "Select League"}
            </Text>
            <Text style={styles.leagueSubtitle}>
              Week {selected?.currentWeek || 0} of {selected?.totalWeeks || 0}
            </Text>
          </View>
        </View>
        {myLeagues.length > 1 ? (
          <Ionicons name="chevron-down" size={20} color="#0D5C3A" />
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderPositionIndicator = (current: number, previous?: number) => {
    const change = getPositionChange(current, previous);

    if (change.type === "new") {
      return (
        <View style={styles.positionNew}>
          <Text style={styles.positionNewText}>NEW</Text>
        </View>
      );
    }

    if (change.type === "up") {
      return (
        <View style={styles.positionChange}>
          <Ionicons name="caret-up" size={14} color="#4CAF50" />
          <Text style={styles.positionUpText}>{change.change}</Text>
        </View>
      );
    }

    if (change.type === "down") {
      return (
        <View style={styles.positionChange}>
          <Ionicons name="caret-down" size={14} color="#F44336" />
          <Text style={styles.positionDownText}>{change.change}</Text>
        </View>
      );
    }

    return (
      <View style={styles.positionChange}>
        <Text style={styles.positionSameText}>-</Text>
      </View>
    );
  };

  const renderStandingsHeader = () => {
    const is2v2 = selectedLeague?.format === "2v2";

    return (
      <View style={styles.tableHeader}>
        <Text style={styles.headerRank}>#</Text>
        <Text style={styles.headerChange}>+/-</Text>
        <Text style={styles.headerName}>{is2v2 ? "TEAM" : "PLAYER"}</Text>
        {is2v2 ? (
          <Text style={styles.headerWL}>W-L</Text>
        ) : (
          <Text style={styles.headerRounds}>RNDS</Text>
        )}
        <Text style={styles.headerPoints}>PTS</Text>
        <Text style={styles.headerBehind}>BEHIND</Text>
        {!is2v2 ? <Text style={styles.headerWins}>WINS</Text> : null}
      </View>
    );
  };

  const renderPlayerRow = (player: PlayerStanding) => {
    const isCurrentUser = player.odcuserId === currentUserId;
    const isLeader = player.rank === 1;

    const borderColor = flashAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["transparent", "#0D5C3A"],
    });

    const RowContent = (
      <TouchableOpacity
        style={[
          styles.tableRow,
          isLeader && styles.leaderRow,
        ]}
        onPress={() => handlePlayerPress(player.odcuserId)}
        activeOpacity={0.7}
      >
        <Text style={[styles.cellRank, isLeader && styles.leaderText]}>
          {player.rank}
        </Text>
        <View style={styles.cellChange}>
          {renderPositionIndicator(player.rank, player.previousRank)}
        </View>
        <View style={styles.cellName}>
          {player.avatar ? (
            <Image
              source={{ uri: player.avatar }}
              style={[styles.avatar, isLeader && styles.leaderAvatar]}
            />
          ) : (
            <View style={[styles.avatarPlaceholder, isLeader && styles.leaderAvatar]}>
              <Text style={styles.avatarText}>
                {player.displayName?.charAt(0) || "?"}
              </Text>
            </View>
          )}
          <Text
            style={[styles.nameText, isLeader && styles.leaderText]}
            numberOfLines={1}
          >
            {isCurrentUser ? "You" : player.displayName}
          </Text>
        </View>
        <Text style={styles.cellRounds}>{player.roundsPlayed}</Text>
        <Text style={[styles.cellPoints, isLeader && styles.leaderText]}>
          {player.totalPoints}
        </Text>
        <Text style={styles.cellBehind}>
          {getPointsBehind(player.totalPoints, player.rank)}
        </Text>
        <Text style={styles.cellWins}>{player.wins || "-"}</Text>
      </TouchableOpacity>
    );

    if (isCurrentUser) {
      return (
        <Animated.View
          key={player.odcuserId}
          style={[styles.userRowWrapper, { borderColor: borderColor }]}
        >
          {RowContent}
        </Animated.View>
      );
    }

    return <View key={player.odcuserId}>{RowContent}</View>;
  };

  const renderTeamRow = (team: TeamStanding) => {
    const isLeader = team.rank === 1;
    // Check if current user is on this team - would need additional data
    const isUserTeam = false; // TODO: Implement based on user's teamId

    const borderColor = flashAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["transparent", "#0D5C3A"],
    });

    const RowContent = (
      <TouchableOpacity
        style={[
          styles.tableRow,
          isLeader && styles.leaderRow,
        ]}
        onPress={() => handleTeamPress(team.teamId)}
        activeOpacity={0.7}
      >
        <Text style={[styles.cellRank, isLeader && styles.leaderText]}>
          {team.rank}
        </Text>
        <View style={styles.cellChange}>
          {renderPositionIndicator(team.rank, team.previousRank)}
        </View>
        <View style={styles.cellName}>
          {team.teamAvatar ? (
            <Image
              source={{ uri: team.teamAvatar }}
              style={[styles.avatar, isLeader && styles.leaderAvatar]}
            />
          ) : (
            <View style={[styles.avatarPlaceholder, isLeader && styles.leaderAvatar]}>
              <Text style={styles.avatarText}>
                {team.teamName?.charAt(0) || "?"}
              </Text>
            </View>
          )}
          <Text
            style={[styles.nameText, isLeader && styles.leaderText]}
            numberOfLines={1}
          >
            {team.teamName}
          </Text>
        </View>
        <Text style={styles.cellWL}>
          {team.wins}-{team.losses}
        </Text>
        <Text style={[styles.cellPoints, isLeader && styles.leaderText]}>
          {team.totalPoints}
        </Text>
        <Text style={styles.cellBehind}>
          {getPointsBehind(team.totalPoints, team.rank)}
        </Text>
      </TouchableOpacity>
    );

    if (isUserTeam) {
      return (
        <Animated.View
          key={team.teamId}
          style={[styles.userRowWrapper, { borderColor: borderColor }]}
        >
          {RowContent}
        </Animated.View>
      );
    }

    return <View key={team.teamId}>{RowContent}</View>;
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
        <View style={styles.selectorModalContent}>
          <Text style={styles.selectorModalTitle}>Select League</Text>
          {myLeagues.map((league) => (
            <TouchableOpacity
              key={league.id}
              style={
                league.id === selectedLeagueId
                  ? styles.selectorOptionSelected
                  : styles.selectorOption
              }
              onPress={() => handleSelectLeague(league.id)}
            >
              <View style={styles.selectorOptionContent}>
                <View style={styles.selectorLogoPlaceholder}>
                  {league.avatar ? (
                    <Image source={{ uri: league.avatar }} style={styles.selectorLogoImage} />
                  ) : (
                    <Text style={styles.selectorLogoText}>
                      {league.name?.charAt(0) || "L"}
                    </Text>
                  )}
                </View>
                <View>
                  <Text style={styles.selectorOptionTitle}>{league.name}</Text>
                  <Text style={styles.selectorOptionSubtitle}>
                    Week {league.currentWeek} of {league.totalWeeks}
                  </Text>
                </View>
              </View>
              {league.id === selectedLeagueId ? (
                <Ionicons name="checkmark" size={20} color="#0D5C3A" />
              ) : null}
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

  if (myLeagues.length === 0) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        {renderTabs()}
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateEmoji}>🏆</Text>
          <Text style={styles.emptyStateTitle}>No Leagues Yet</Text>
          <Text style={styles.emptyStateSubtitle}>
            Join a league to see standings!
          </Text>
          <TouchableOpacity
            style={styles.emptyStateButton}
            onPress={() => router.push("/leagues/explore")}
          >
            <Text style={styles.emptyStateButtonText}>Explore Leagues</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const is2v2 = selectedLeague?.format === "2v2";
  const hasStandings = is2v2 ? teamStandings.length > 0 : playerStandings.length > 0;

  return (
    <View style={styles.container}>
      {renderHeader()}
      {renderTabs()}

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0D5C3A"
          />
        }
      >
        {renderLeagueSelector()}

        <View style={styles.standingsCard}>
          <Text style={styles.standingsTitle}>Standings</Text>

          {hasStandings ? (
            <>
              {renderStandingsHeader()}
              {is2v2
                ? teamStandings.map(renderTeamRow)
                : playerStandings.map(renderPlayerRow)}
            </>
          ) : (
            <View style={styles.noStandings}>
              <Ionicons name="podium-outline" size={48} color="#CCC" />
              <Text style={styles.noStandingsText}>
                No standings yet - check back after scores are posted!
              </Text>
            </View>
          )}
        </View>

        {/* Purse Summary */}
        {selectedLeague?.purse && (selectedLeague.purse.seasonPurse > 0 || selectedLeague.purse.weeklyPurse > 0 || selectedLeague.purse.elevatedPurse > 0) ? (
          <View style={styles.purseCard}>
            <View style={styles.purseCardHeader}>
              <Text style={styles.purseCardTitle}>💰 Prize Purse</Text>
              <Text style={styles.purseCardTotal}>
                ${(() => {
                  const p = selectedLeague.purse!;
                  let total = p.seasonPurse || 0;
                  total += (p.weeklyPurse || 0) * (selectedLeague.totalWeeks || 0);
                  const elevatedCount = selectedLeague.elevatedWeeks?.length ?? 0;
                  total += (p.elevatedPurse || 0) * elevatedCount;
                  return total.toLocaleString();
                })()}
              </Text>
            </View>
            <View style={styles.purseCardBreakdown}>
              {selectedLeague.purse.seasonPurse > 0 ? (
                <View style={styles.purseCardRow}>
                  <Text style={styles.purseCardLabel}>🏆 Championship</Text>
                  <Text style={styles.purseCardAmount}>${selectedLeague.purse.seasonPurse.toLocaleString()}</Text>
                </View>
              ) : null}
              {selectedLeague.purse.weeklyPurse > 0 ? (
                <View style={styles.purseCardRow}>
                  <Text style={styles.purseCardLabel}>📅 Weekly ({selectedLeague.totalWeeks} wks)</Text>
                  <Text style={styles.purseCardAmount}>${selectedLeague.purse.weeklyPurse.toLocaleString()}/wk</Text>
                </View>
              ) : null}
              {selectedLeague.purse.elevatedPurse > 0 && (selectedLeague.elevatedWeeks?.length ?? 0) > 0 ? (
                <View style={styles.purseCardRow}>
                  <Text style={styles.purseCardLabel}>🏅 Elevated ({selectedLeague.elevatedWeeks?.length} evts)</Text>
                  <Text style={styles.purseCardAmount}>${selectedLeague.purse.elevatedPurse.toLocaleString()}/evt</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.bottomSpacer} />
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
    backgroundColor: "#F5F5F0",
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
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F4EED8",
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

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // League Selector
  leagueSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  leagueSelectorContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  leagueLogoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  leagueLogoText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },
  leagueLogoImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  leagueSelectorText: {
    marginLeft: 12,
  },
  leagueName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  leagueSubtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },

  // Standings Card
  standingsCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  standingsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 16,
  },

  // Table Header
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: "#E0E0E0",
    marginBottom: 4,
  },
  headerRank: {
    width: 30,
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
  },
  headerChange: {
    width: 36,
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    textAlign: "center",
  },
  headerName: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    marginLeft: 8,
  },
  headerRounds: {
    width: 44,
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    textAlign: "center",
  },
  headerWL: {
    width: 44,
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    textAlign: "center",
  },
  headerPoints: {
    width: 50,
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    textAlign: "center",
  },
  headerBehind: {
    width: 50,
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    textAlign: "center",
  },
  headerWins: {
    width: 40,
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    textAlign: "center",
  },

  // Table Row
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  leaderRow: {
    backgroundColor: "#FFFBEB",
  },
  userRowWrapper: {
    borderWidth: 2,
    borderRadius: 8,
    marginVertical: 2,
  },

  // Cells
  cellRank: {
    width: 30,
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  cellChange: {
    width: 36,
    alignItems: "center",
  },
  cellName: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  cellRounds: {
    width: 44,
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  cellWL: {
    width: 44,
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  cellPoints: {
    width: 50,
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },
  cellBehind: {
    width: 50,
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
  cellWins: {
    width: 40,
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },

  // Avatar
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFF",
  },
  leaderAvatar: {
    borderWidth: 2,
    borderColor: "#C9A227",
  },
  nameText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    flex: 1,
  },
  leaderText: {
    fontWeight: "700",
  },

  // Position Indicators
  positionChange: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  positionUpText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4CAF50",
    marginLeft: 1,
  },
  positionDownText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#F44336",
    marginLeft: 1,
  },
  positionSameText: {
    fontSize: 14,
    color: "#999",
  },
  positionNew: {
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  positionNewText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#2196F3",
  },

  // No Standings
  noStandings: {
    alignItems: "center",
    paddingVertical: 40,
  },
  noStandingsText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginTop: 12,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  selectorModalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  selectorModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 16,
    textAlign: "center",
  },
  selectorOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  selectorOptionSelected: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#E8F5E9",
  },
  selectorOptionContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectorLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  selectorLogoImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  selectorLogoText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
  selectorOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  selectorOptionSubtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },

  // Empty State
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyStateEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  emptyStateButton: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },

  bottomSpacer: {
    height: 100,
  },

  // Purse Card
  purseCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  purseCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  purseCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  purseCardTotal: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0D5C3A",
  },
  purseCardBreakdown: {
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    paddingTop: 10,
    gap: 8,
  },
  purseCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  purseCardLabel: {
    fontSize: 14,
    color: "#666",
  },
  purseCardAmount: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
});