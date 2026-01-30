/**
 * League Hub - Home Tab
 *
 * Shows:
 * - League selector (if multiple leagues)
 * - Season status banner
 * - Last week's winner (hero card)
 * - Announcements + Activity feed
 * - My status card with Post Score
 * - Rules FAB
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
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
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
  description?: string;
  customRules?: string;
  leagueType: "live" | "sim";
  simPlatform?: string;
  format: "stroke" | "2v2";
  holesPerRound: number;
  handicapSystem: "swingthoughts" | "league_managed";
  frequency: "weekly" | "biweekly" | "monthly";
  scoreDeadlineDays: number;
  status: "upcoming" | "active" | "completed";
  currentWeek: number;
  totalWeeks: number;
  startDate: Timestamp;
  endDate: Timestamp;
  memberCount: number;
  hostUserId: string;
  managerIds?: string[];
  regionName?: string;
  restrictedCourses?: Array<{ courseId: number; courseName: string }>;
  elevatedEvents?: {
    enabled: boolean;
    weeks: number[];
    multiplier: number;
  };
}

interface LeagueCard {
  id: string;
  name: string;
  currentWeek: number;
  totalWeeks: number;
  userRank?: number;
  userPoints?: number;
}

interface Member {
  id: string;
  odcuserId: string;
  displayName: string;
  avatar?: string;
  role: "commissioner" | "manager" | "member";
  leagueHandicap?: number;
  swingThoughtsHandicap?: number;
  teamId?: string;
  totalPoints: number;
  roundsPlayed: number;
  wins: number;
  currentRank?: number;
}

interface Team {
  id: string;
  name: string;
  wins: number;
  losses: number;
  totalPoints: number;
}

interface Announcement {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  message: string;
  type: "announcement" | "activity";
  activityType?: "score_posted" | "member_joined" | "week_complete";
  createdAt: Timestamp;
}

interface WeekWinner {
  week: number;
  odcuserId?: string;
  displayName?: string;
  avatar?: string;
  score?: number;
  courseName?: string;
  participantCount?: number;
  // 2v2 fields
  teamId?: string;
  teamName?: string;
  teamMembers?: Array<{ odcuserId: string; displayName: string; avatar?: string }>;
  matchResult?: string;
  teamCount?: number;
}

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function LeagueHome() {
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

  // League data
  const [myMembership, setMyMembership] = useState<Member | null>(null);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [totalMembers, setTotalMembers] = useState(0);
  const [lastWeekWinner, setLastWeekWinner] = useState<WeekWinner | null>(null);

  // Commissioner/Manager status
  const [isCommissionerOrManager, setIsCommissionerOrManager] = useState(false);

  // Modals
  const [showRulesModal, setShowRulesModal] = useState(false);

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
            setSelectedLeague({ id: docSnap.id, ...docSnap.data() } as League);
          }
        }
      );
      unsubscribers.push(leagueUnsub);

      // Listen to my membership
      const memberUnsub = onSnapshot(
        doc(db, "leagues", selectedLeagueId, "members", currentUserId),
        (docSnap) => {
          if (docSnap.exists()) {
            const docData = docSnap.data();
            const memberData: Member = {
              id: docSnap.id,
              odcuserId: docData.odcuserId,
              displayName: docData.displayName,
              avatar: docData.avatar,
              role: docData.role,
              leagueHandicap: docData.leagueHandicap,
              swingThoughtsHandicap: docData.swingThoughtsHandicap,
              teamId: docData.teamId,
              totalPoints: docData.totalPoints || 0,
              roundsPlayed: docData.roundsPlayed || 0,
              wins: docData.wins || 0,
              currentRank: docData.currentRank,
            };
            setMyMembership(memberData);
            setIsCommissionerOrManager(
              memberData.role === "commissioner" || memberData.role === "manager"
            );

            // Load team if member has one
            if (memberData.teamId) {
              loadMyTeam(selectedLeagueId, memberData.teamId);
            } else {
              setMyTeam(null);
            }
          }
        }
      );
      unsubscribers.push(memberUnsub);

      // Listen to announcements
      const announcementsUnsub = onSnapshot(
        query(
          collection(db, "leagues", selectedLeagueId, "announcements"),
          orderBy("createdAt", "desc"),
          limit(20)
        ),
        (snapshot) => {
          const items: Announcement[] = [];
          snapshot.forEach((docSnap) => {
            items.push({ id: docSnap.id, ...docSnap.data() } as Announcement);
          });
          setAnnouncements(items);
        }
      );
      unsubscribers.push(announcementsUnsub);

      // Load total members count
      loadMemberCount(selectedLeagueId);

      // Load last week winner
      loadLastWeekWinner(selectedLeagueId);

      return () => {
        unsubscribers.forEach((unsub) => unsub());
      };
    }
  }, [selectedLeagueId, currentUserId]);

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
    } catch (error) {
      console.error("Error loading leagues:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMyTeam = async (leagueId: string, teamId: string) => {
    try {
      const teamDoc = await getDoc(doc(db, "leagues", leagueId, "teams", teamId));
      if (teamDoc.exists()) {
        setMyTeam({ id: teamDoc.id, ...teamDoc.data() } as Team);
      }
    } catch (error) {
      console.error("Error loading team:", error);
    }
  };

  const loadMemberCount = async (leagueId: string) => {
    try {
      const membersSnap = await getDocs(
        collection(db, "leagues", leagueId, "members")
      );
      setTotalMembers(membersSnap.size);
    } catch (error) {
      console.error("Error loading member count:", error);
    }
  };

  const loadLastWeekWinner = async (leagueId: string) => {
    try {
      // Get the most recent week result
      const resultsSnap = await getDocs(
        query(
          collection(db, "leagues", leagueId, "week_results"),
          orderBy("week", "desc"),
          limit(1)
        )
      );

      if (!resultsSnap.empty) {
        const data = resultsSnap.docs[0].data() as WeekWinner;
        setLastWeekWinner(data);
      } else {
        setLastWeekWinner(null);
      }
    } catch (error) {
      console.error("Error loading last week winner:", error);
      setLastWeekWinner(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMyLeagues();
    if (selectedLeagueId) {
      await loadMemberCount(selectedLeagueId);
      await loadLastWeekWinner(selectedLeagueId);
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
  };

  const handlePostScore = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/leagues/post-score?leagueId=${selectedLeagueId}`);
  };

  const handleOpenRules = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowRulesModal(true);
  };

  const handleSettings = () => {
    soundPlayer.play("click");
    router.push(`/leagues/settings?id=${selectedLeagueId}`);
  };

  /* ================================================================ */
  /* HELPERS                                                         */
  /* ================================================================ */

  const getSeasonStatusText = () => {
    if (!selectedLeague) return "";

    if (selectedLeague.status === "upcoming") {
      const startDate = selectedLeague.startDate.toDate();
      const now = new Date();
      const diffDays = Math.ceil(
        (startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays <= 0) return "Season starting soon!";
      return "Season starts in " + diffDays + " day" + (diffDays !== 1 ? "s" : "");
    }

    if (selectedLeague.status === "active") {
      const deadlineDays = selectedLeague.scoreDeadlineDays || 3;
      return "Week " + selectedLeague.currentWeek + " of " + selectedLeague.totalWeeks + " • Scores due in " + deadlineDays + " days";
    }

    return "Season Complete 🏆";
  };

  const getStatusColor = () => {
    if (!selectedLeague) return "#666";
    if (selectedLeague.status === "upcoming") return "#2196F3";
    if (selectedLeague.status === "active") return "#0D5C3A";
    return "#C9A227";
  };

  const formatTimeAgo = (timestamp: Timestamp) => {
    const now = new Date();
    const date = timestamp.toDate();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return diffMins + "m ago";
    if (diffHours < 24) return diffHours + "h ago";
    if (diffDays < 7) return diffDays + "d ago";
    return date.toLocaleDateString();
  };

  const getHandicapDisplay = () => {
    if (!myMembership || !selectedLeague) return "-";
    if (selectedLeague.handicapSystem === "league_managed") {
      return myMembership.leagueHandicap !== undefined 
        ? myMembership.leagueHandicap.toString() 
        : "-";
    }
    return myMembership.swingThoughtsHandicap !== undefined 
      ? myMembership.swingThoughtsHandicap.toString() 
      : "-";
  };

  const formatDateShort = (timestamp: Timestamp) => {
    return timestamp.toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const getFrequencyDisplay = () => {
    if (!selectedLeague) return "";
    if (selectedLeague.frequency === "weekly") return "Weekly";
    if (selectedLeague.frequency === "biweekly") return "Every 2 Weeks";
    return "Monthly";
  };

  const getCourseDisplay = () => {
    if (!selectedLeague) return "";
    if (!selectedLeague.restrictedCourses || selectedLeague.restrictedCourses.length === 0) {
      return "Any Course";
    }
    return selectedLeague.restrictedCourses.length + " Specific Courses";
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
      <TouchableOpacity style={[styles.tab, styles.tabActive]}>
        <Text style={[styles.tabText, styles.tabTextActive]}>Home</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => router.push("/leagues/schedule")}
      >
        <Text style={styles.tabText}>Schedule</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => router.push("/leagues/standings")}
      >
        <Text style={styles.tabText}>Standings</Text>
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
            <Text style={styles.leagueLogoText}>
              {selected?.name?.charAt(0) || "L"}
            </Text>
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

  const renderSeasonStatus = () => {
    if (!selectedLeague) return null;

    const iconName =
      selectedLeague.status === "upcoming"
        ? "calendar-outline"
        : selectedLeague.status === "active"
        ? "play-circle-outline"
        : "trophy-outline";

    return (
      <View style={[styles.statusBanner, { borderLeftColor: getStatusColor() }]}>
        <Ionicons name={iconName} size={20} color={getStatusColor()} />
        <Text style={[styles.statusText, { color: getStatusColor() }]}>
          {getSeasonStatusText()}
        </Text>
      </View>
    );
  };

  const renderLastWeekWinner = () => {
    if (!selectedLeague) return null;

    // No results yet
    if (!lastWeekWinner || selectedLeague.currentWeek <= 1) {
      return (
        <View style={styles.winnerCard}>
          <View style={styles.winnerEmpty}>
            <Text style={styles.winnerEmoji}>🏆</Text>
            <Text style={styles.winnerEmptyTitle}>No Results Yet</Text>
            <Text style={styles.winnerEmptySubtitle}>
              Check back after Week 1
            </Text>
          </View>
        </View>
      );
    }

    // Stroke play winner
    if (selectedLeague.format === "stroke") {
      return (
        <View style={styles.winnerCard}>
          <Text style={styles.winnerLabel}>LAST WEEK'S WINNER</Text>
          <View style={styles.winnerContent}>
            {lastWeekWinner.avatar ? (
              <Image
                source={{ uri: lastWeekWinner.avatar }}
                style={styles.winnerAvatar}
              />
            ) : (
              <View style={styles.winnerAvatarPlaceholder}>
                <Text style={styles.winnerAvatarText}>
                  {lastWeekWinner.displayName?.charAt(0) || "?"}
                </Text>
              </View>
            )}
            <Text style={styles.winnerName}>{lastWeekWinner.displayName}</Text>
            <Text style={styles.winnerScore}>
              {lastWeekWinner.score} @ {lastWeekWinner.courseName}
            </Text>
            <Text style={styles.winnerParticipants}>
              {lastWeekWinner.participantCount} participants
            </Text>
          </View>
        </View>
      );
    }

    // 2v2 team winner
    return (
      <View style={styles.winnerCard}>
        <Text style={styles.winnerLabel}>LAST WEEK'S WINNER</Text>
        <View style={styles.winnerContent}>
          <Text style={styles.winnerTeamName}>{lastWeekWinner.teamName}</Text>
          <View style={styles.winnerTeamAvatars}>
            {lastWeekWinner.teamMembers?.map((member, idx) => (
              <View
                key={member.odcuserId}
                style={[
                  styles.winnerTeamAvatar,
                  idx > 0 ? { marginLeft: -12 } : null,
                ]}
              >
                {member.avatar ? (
                  <Image
                    source={{ uri: member.avatar }}
                    style={styles.winnerTeamAvatarImg}
                  />
                ) : (
                  <View style={styles.winnerTeamAvatarPlaceholder}>
                    <Text style={styles.winnerTeamAvatarText}>
                      {member.displayName?.charAt(0) || "?"}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
          <Text style={styles.winnerMatchResult}>{lastWeekWinner.matchResult}</Text>
          <Text style={styles.winnerParticipants}>
            {lastWeekWinner.teamCount} teams competed
          </Text>
        </View>
      </View>
    );
  };

  const renderAnnouncements = () => {
    if (announcements.length === 0) {
      return (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Announcements</Text>
          <View style={styles.emptyCard}>
            <Ionicons name="megaphone-outline" size={32} color="#CCC" />
            <Text style={styles.emptyText}>No announcements yet</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Announcements</Text>
        {announcements.map((item) => (
          <View
            key={item.id}
            style={item.type === "activity" ? styles.activityCard : styles.announcementCard}
          >
            <View style={styles.announcementHeader}>
              {item.type === "activity" ? (
                <View style={styles.activityIconContainer}>
                  <Text style={styles.activityIcon}>📊</Text>
                </View>
              ) : item.authorAvatar ? (
                <Image
                  source={{ uri: item.authorAvatar }}
                  style={styles.announcementAvatar}
                />
              ) : (
                <View style={styles.announcementAvatarPlaceholder}>
                  <Text style={styles.announcementAvatarText}>
                    {item.authorName?.charAt(0) || "?"}
                  </Text>
                </View>
              )}
              <View style={styles.announcementMeta}>
                <Text style={styles.announcementAuthor}>
                  {item.type === "activity" ? "Activity" : item.authorName}
                </Text>
                <Text style={styles.announcementTime}>
                  {formatTimeAgo(item.createdAt)}
                </Text>
              </View>
            </View>
            <Text style={styles.announcementMessage}>{item.message}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderMyStatus = () => {
    if (!myMembership) return null;

    const is2v2 = selectedLeague?.format === "2v2";

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Status</Text>
        <View style={styles.myStatusCard}>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                #{myMembership.currentRank || "-"}
              </Text>
              <Text style={styles.statLabel}>of {totalMembers}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{myMembership.totalPoints}</Text>
              <Text style={styles.statLabel}>Points</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{myMembership.roundsPlayed}</Text>
              <Text style={styles.statLabel}>Rounds</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{getHandicapDisplay()}</Text>
              <Text style={styles.statLabel}>HCP</Text>
            </View>
          </View>

          {is2v2 && myTeam ? (
            <View style={styles.teamRow}>
              <Ionicons name="people-outline" size={18} color="#666" />
              <Text style={styles.teamName}>{myTeam.name}</Text>
              <Text style={styles.teamRecord}>
                {myTeam.wins}-{myTeam.losses}
              </Text>
            </View>
          ) : null}

          {selectedLeague?.status === "active" ? (
            <TouchableOpacity
              style={styles.postScoreButton}
              onPress={handlePostScore}
            >
              <Ionicons name="add-circle-outline" size={20} color="#FFF" />
              <Text style={styles.postScoreButtonText}>Post Score</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const renderRulesFAB = () => (
    <TouchableOpacity style={styles.fab} onPress={handleOpenRules}>
      <Ionicons name="document-text-outline" size={24} color="#FFF" />
    </TouchableOpacity>
  );

  const renderRulesModal = () => {
    if (!selectedLeague) return null;

    return (
      <Modal
        visible={showRulesModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRulesModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowRulesModal(false)}
        >
          <Pressable 
            style={styles.rulesModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.rulesModalHeader}>
              <Text style={styles.rulesModalTitle}>League Info</Text>
              <TouchableOpacity onPress={() => setShowRulesModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.rulesModalScroll}>
              {/* League Info */}
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <View style={styles.infoLabel}>
                    <Ionicons name="trophy-outline" size={18} color="#0D5C3A" />
                    <Text style={styles.infoLabelText}>Format</Text>
                  </View>
                  <Text style={styles.infoValue}>
                    {selectedLeague.format === "stroke" ? "Stroke Play" : "2v2 Match Play"}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <View style={styles.infoLabel}>
                    <Ionicons name="golf-outline" size={18} color="#0D5C3A" />
                    <Text style={styles.infoLabelText}>Type</Text>
                  </View>
                  <Text style={styles.infoValue}>
                    {selectedLeague.leagueType === "live"
                      ? "Live Golf"
                      : "Simulator" + (selectedLeague.simPlatform ? " (" + selectedLeague.simPlatform + ")" : "")}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <View style={styles.infoLabel}>
                    <Ionicons name="flag-outline" size={18} color="#0D5C3A" />
                    <Text style={styles.infoLabelText}>Holes</Text>
                  </View>
                  <Text style={styles.infoValue}>
                    {selectedLeague.holesPerRound} per round
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <View style={styles.infoLabel}>
                    <Ionicons name="calculator-outline" size={18} color="#0D5C3A" />
                    <Text style={styles.infoLabelText}>Handicaps</Text>
                  </View>
                  <Text style={styles.infoValue}>
                    {selectedLeague.handicapSystem === "swingthoughts"
                      ? "SwingThoughts"
                      : "League Managed"}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <View style={styles.infoLabel}>
                    <Ionicons name="calendar-outline" size={18} color="#0D5C3A" />
                    <Text style={styles.infoLabelText}>Frequency</Text>
                  </View>
                  <Text style={styles.infoValue}>{getFrequencyDisplay()}</Text>
                </View>

                <View style={styles.infoRow}>
                  <View style={styles.infoLabel}>
                    <Ionicons name="time-outline" size={18} color="#0D5C3A" />
                    <Text style={styles.infoLabelText}>Deadline</Text>
                  </View>
                  <Text style={styles.infoValue}>
                    {selectedLeague.scoreDeadlineDays} days after round
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <View style={styles.infoLabel}>
                    <Ionicons name="location-outline" size={18} color="#0D5C3A" />
                    <Text style={styles.infoLabelText}>Courses</Text>
                  </View>
                  <Text style={styles.infoValue}>{getCourseDisplay()}</Text>
                </View>

                <View style={styles.infoRowLast}>
                  <View style={styles.infoLabel}>
                    <Ionicons name="calendar-number-outline" size={18} color="#0D5C3A" />
                    <Text style={styles.infoLabelText}>Season</Text>
                  </View>
                  <Text style={styles.infoValue}>
                    {formatDateShort(selectedLeague.startDate)} - {formatDateShort(selectedLeague.endDate)}
                  </Text>
                </View>
              </View>

              {/* Custom Rules */}
              {selectedLeague.customRules ? (
                <View style={styles.rulesSection}>
                  <Text style={styles.rulesSectionTitle}>League Rules</Text>
                  <View style={styles.rulesContent}>
                    <Text style={styles.rulesText}>
                      {selectedLeague.customRules}
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.modalBottomSpacer} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
                  <Text style={styles.selectorLogoText}>
                    {league.name?.charAt(0) || "L"}
                  </Text>
                </View>
                <View>
                  <Text style={styles.selectorOptionTitle}>{league.name}</Text>
                  <Text style={styles.selectorOptionSubtitle}>
                    Rank #{league.userRank || "-"} • {league.userPoints || 0} pts
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
          <Text style={styles.emptyStateEmoji}>🏌️</Text>
          <Text style={styles.emptyStateTitle}>No Leagues Yet</Text>
          <Text style={styles.emptyStateSubtitle}>
            Join a league to start competing!
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
        {renderSeasonStatus()}
        {renderLastWeekWinner()}
        {renderAnnouncements()}
        {renderMyStatus()}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {renderRulesFAB()}
      {renderRulesModal()}
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
    marginBottom: 12,
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
  },
  leagueLogoText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
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

  // Season Status
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    gap: 10,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Winner Card
  winnerCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#C9A227",
  },
  winnerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#C9A227",
    letterSpacing: 1,
    marginBottom: 12,
  },
  winnerContent: {
    alignItems: "center",
  },
  winnerEmpty: {
    alignItems: "center",
    paddingVertical: 16,
  },
  winnerEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  winnerEmptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  winnerEmptySubtitle: {
    fontSize: 13,
    color: "#999",
    marginTop: 4,
  },
  winnerAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: "#C9A227",
  },
  winnerAvatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#C9A227",
  },
  winnerAvatarText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFF",
  },
  winnerName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginTop: 8,
  },
  winnerScore: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  winnerParticipants: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  winnerTeamName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  winnerTeamAvatars: {
    flexDirection: "row",
    marginBottom: 8,
  },
  winnerTeamAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#FFF",
    overflow: "hidden",
  },
  winnerTeamAvatarImg: {
    width: 48,
    height: 48,
  },
  winnerTeamAvatarPlaceholder: {
    width: 48,
    height: 48,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },
  winnerTeamAvatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
  winnerMatchResult: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  // Sections
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },

  // Announcements
  announcementCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  activityCard: {
    backgroundColor: "#F9F9F9",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  announcementHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  announcementAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  announcementAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },
  announcementAvatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },
  activityIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },
  activityIcon: {
    fontSize: 18,
  },
  announcementMeta: {
    marginLeft: 10,
  },
  announcementAuthor: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  announcementTime: {
    fontSize: 12,
    color: "#999",
  },
  announcementMessage: {
    fontSize: 14,
    color: "#444",
    lineHeight: 20,
  },

  // Empty Card
  emptyCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
  },

  // My Status
  myStatusCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#E0E0E0",
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    gap: 8,
  },
  teamName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  teamRecord: {
    fontSize: 14,
    color: "#666",
  },
  postScoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D5C3A",
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 16,
    gap: 8,
  },
  postScoreButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },

  // FAB
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },

  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  rulesModalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  rulesModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  rulesModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  rulesModalScroll: {
    padding: 16,
  },
  infoCard: {
    backgroundColor: "#F9F9F9",
    borderRadius: 12,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E8E8",
  },
  infoRowLast: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoLabelText: {
    fontSize: 14,
    color: "#666",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  rulesSection: {
    marginTop: 16,
  },
  rulesSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  rulesContent: {
    backgroundColor: "#F9F9F9",
    borderRadius: 12,
    padding: 16,
  },
  rulesText: {
    fontSize: 14,
    color: "#444",
    lineHeight: 22,
  },
  modalBottomSpacer: {
    height: 32,
  },

  // League Selector Modal
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
});