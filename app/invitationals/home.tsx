/**
 * Invitational Hub - Home Tab
 *
 * Shows:
 * - Invitational selector (if multiple)
 * - Round X of Y status banner + RSVP banner if pending
 * - Last round's winner (hero card)
 * - Announcements (host-only posting)
 * - Upcoming rounds preview
 * - My status card (rank, score, rounds played, handicap)
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface Invitational {
  id: string;
  name: string;
  avatar?: string;
  hostUserId: string;
  hostName: string;
  status: "draft" | "open" | "active" | "completed" | "cancelled";
  startDate: Timestamp;
  endDate: Timestamp;
  isSingleDay: boolean;
  maxPlayers: number;
  overallScoring: "cumulative" | "points" | "best_of";
  handicapMethod: "swingthoughts" | "manual";
  roster: RosterEntry[];
  playerCount: number;
  rounds: InvitationalRound[];
  standings: Standing[] | null;
  winnerId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface RosterEntry {
  userId: string | null;
  displayName: string;
  avatar?: string;
  handicap?: number;
  invitationalHandicap: number | null;
  status: "accepted" | "invited" | "declined" | "ghost";
  isGhost: boolean;
  ghostName?: string;
}

interface InvitationalRound {
  roundId: string;
  courseId: number | null;
  courseName: string;
  courseLocation: { city: string; state: string };
  date: Timestamp;
  teeTime: string | null;
  format: string;
  scoringType: string;
  status: "upcoming" | "active" | "completed";
  outingId: string | null;
  groups: any[];
  roundNumber: number;
}

interface Standing {
  userId: string;
  displayName: string;
  totalScore: number;
  toPar: number;
  rank: number;
  roundScores: number[];
}

interface Announcement {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  message: string;
  createdAt: Timestamp;
}

interface InvitationalCard {
  id: string;
  name: string;
  status: string;
  completedRounds: number;
  totalRounds: number;
  userRank?: number;
}

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function InvitationalHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUserId = auth.currentUser?.uid;

  // Loading
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // User's invitationals
  const [myInvitationals, setMyInvitationals] = useState<InvitationalCard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [invitational, setInvitational] = useState<Invitational | null>(null);
  const [showSelector, setShowSelector] = useState(false);

  // Data
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [myRosterEntry, setMyRosterEntry] = useState<RosterEntry | null>(null);

  // Announcement modal
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);

  /* ================================================================ */
  /* DATA LOADING                                                    */
  /* ================================================================ */

  useEffect(() => {
    if (!currentUserId) return;
    loadMyInvitationals();
  }, [currentUserId]);

  useEffect(() => {
    if (!selectedId || !currentUserId) return;

    const unsubscribers: (() => void)[] = [];

    // Listen to invitational doc
    const invUnsub = onSnapshot(
      doc(db, "invitationals", selectedId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as Invitational;
          setInvitational(data);
          setIsHost(data.hostUserId === currentUserId);

          // Find my roster entry
          const myEntry = data.roster?.find(
            (r) => r.userId === currentUserId
          ) || null;
          setMyRosterEntry(myEntry);
        }
      }
    );
    unsubscribers.push(invUnsub);

    // Listen to announcements
    const annUnsub = onSnapshot(
      query(
        collection(db, "invitationals", selectedId, "announcements"),
        orderBy("createdAt", "desc"),
        limit(10)
      ),
      (snapshot) => {
        const items: Announcement[] = [];
        snapshot.forEach((d) => {
          items.push({ id: d.id, ...d.data() } as Announcement);
        });
        setAnnouncements(items);
      }
    );
    unsubscribers.push(annUnsub);

    return () => unsubscribers.forEach((u) => u());
  }, [selectedId, currentUserId]);

  const loadMyInvitationals = async () => {
    if (!currentUserId) return;

    try {
      setLoading(true);
      const snap = await getDocs(collection(db, "invitationals"));
      const list: InvitationalCard[] = [];

      for (const invDoc of snap.docs) {
        const data = invDoc.data();
        const roster = data.roster || [];
        const isOnRoster =
          data.hostUserId === currentUserId ||
          roster.some((r: any) => r.userId === currentUserId);

        if (isOnRoster && data.status !== "cancelled") {
          const completedRounds = (data.rounds || []).filter(
            (r: any) => r.status === "completed"
          ).length;
          const myStanding = data.standings?.find(
            (s: any) => s.userId === currentUserId
          );

          list.push({
            id: invDoc.id,
            name: data.name || "Unnamed",
            status: data.status,
            completedRounds,
            totalRounds: (data.rounds || []).length,
            userRank: myStanding?.rank,
          });
        }
      }

      setMyInvitationals(list);

      if (list.length > 0 && !selectedId) {
        setSelectedId(list[0].id);
      }
    } catch (error) {
      console.error("Error loading invitationals:", error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMyInvitationals();
    setRefreshing(false);
  };

  /* ================================================================ */
  /* HANDLERS                                                        */
  /* ================================================================ */

  const handleSelectInvitational = (id: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedId(id);
    setShowSelector(false);
  };

  const handleAcceptInvite = async () => {
    if (!currentUserId || !invitational || !selectedId) return;

    soundPlayer.play("postThought");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const updatedRoster = invitational.roster.map((r) =>
        r.userId === currentUserId ? { ...r, status: "accepted" as const } : r
      );

      await updateDoc(doc(db, "invitationals", selectedId), {
        roster: updatedRoster,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error accepting invite:", error);
      Alert.alert("Error", "Failed to accept invite.");
    }
  };

  const handleDeclineInvite = async () => {
    if (!currentUserId || !invitational || !selectedId) return;

    Alert.alert(
      "Decline Invite",
      `Are you sure you want to decline ${invitational.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline",
          style: "destructive",
          onPress: async () => {
            try {
              const updatedRoster = invitational.roster.map((r) =>
                r.userId === currentUserId
                  ? { ...r, status: "declined" as const }
                  : r
              );

              await updateDoc(doc(db, "invitationals", selectedId), {
                roster: updatedRoster,
                playerCount: updatedRoster.filter(
                  (r) => r.status === "accepted" || r.status === "ghost"
                ).length,
                updatedAt: serverTimestamp(),
              });
            } catch (error) {
              console.error("Error declining invite:", error);
            }
          },
        },
      ]
    );
  };

  const handlePostAnnouncement = async () => {
    if (!announcementText.trim() || !selectedId || !currentUserId) return;

    setPostingAnnouncement(true);
    try {
      const userDoc = await getDoc(doc(db, "users", currentUserId));
      const userData = userDoc.data();

      await addDoc(
        collection(db, "invitationals", selectedId, "announcements"),
        {
          authorId: currentUserId,
          authorName: userData?.displayName || "Host",
          authorAvatar: userData?.avatar || null,
          message: announcementText.trim(),
          createdAt: serverTimestamp(),
        }
      );

      soundPlayer.play("postThought");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAnnouncementText("");
      setShowAnnouncementModal(false);
    } catch (error) {
      console.error("Error posting announcement:", error);
      Alert.alert("Error", "Failed to post announcement.");
    } finally {
      setPostingAnnouncement(false);
    }
  };

  const handleSettings = () => {
    soundPlayer.play("click");
    router.push(`/invitationals/settings?id=${selectedId}` as any);
  };

  /* ================================================================ */
  /* HELPERS                                                         */
  /* ================================================================ */

  const getCompletedRounds = () =>
    invitational?.rounds?.filter((r) => r.status === "completed") || [];

  const getUpcomingRounds = () =>
    invitational?.rounds?.filter((r) => r.status === "upcoming") || [];

  const getActiveRound = () =>
    invitational?.rounds?.find((r) => r.status === "active") || null;

  const getLastCompletedRound = () => {
    const completed = getCompletedRounds();
    return completed.length > 0 ? completed[completed.length - 1] : null;
  };

  const getRoundStatus = () => {
    if (!invitational) return "";
    const completed = getCompletedRounds().length;
    const total = invitational.rounds?.length || 0;
    const active = getActiveRound();

    if (invitational.status === "completed") return "Event Complete 🏆";
    if (active) return `Round ${active.roundNumber} of ${total} • Live`;
    if (completed === 0) return `${total} round${total !== 1 ? "s" : ""} scheduled`;
    return `Round ${completed} of ${total} complete`;
  };

  const getStatusColor = () => {
    if (!invitational) return "#666";
    if (invitational.status === "completed") return "#B8860B";
    if (getActiveRound()) return "#0D5C3A";
    if (invitational.status === "open") return "#2196F3";
    return "#666";
  };

  const formatDate = (timestamp: Timestamp) => {
    if (!timestamp?.toDate) return "TBD";
    return timestamp.toDate().toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatTimeAgo = (timestamp: Timestamp) => {
    if (!timestamp?.toDate) return "";
    const now = new Date();
    const date = timestamp.toDate();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getMyStanding = () => {
    if (!invitational?.standings || !currentUserId) return null;
    return invitational.standings.find((s) => s.userId === currentUserId);
  };

  const getLastRoundWinner = () => {
    if (!invitational?.standings || getCompletedRounds().length === 0) return null;
    // Winner is the first in standings
    return invitational.standings.length > 0 ? invitational.standings[0] : null;
  };

  /* ================================================================ */
  /* RENDER COMPONENTS                                               */
  /* ================================================================ */

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => {
          soundPlayer.play("click");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}
      >
        <Image
          source={require("@/assets/icons/Back.png")}
          style={styles.backIcon}
        />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Invitational</Text>
      {isHost ? (
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
        onPress={() => {
          soundPlayer.play("click");
          router.replace(`/invitationals/standings?id=${selectedId}` as any);
        }}
      >
        <Text style={styles.tabText}>Standings</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => {
          soundPlayer.play("click");
          router.replace(`/invitationals/schedule?id=${selectedId}` as any);
        }}
      >
        <Text style={styles.tabText}>Schedule</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSelector = () => {
    if (myInvitationals.length === 0) return null;

    const selected = myInvitationals.find((i) => i.id === selectedId);

    return (
      <TouchableOpacity
        style={styles.selectorCard}
        onPress={() => {
          if (myInvitationals.length > 1) {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowSelector(true);
          }
        }}
        disabled={myInvitationals.length <= 1}
        activeOpacity={0.7}
      >
        <View style={styles.selectorIcon}>
          {invitational?.avatar ? (
            <Image source={{ uri: invitational.avatar }} style={styles.selectorAvatarImage} />
          ) : (
            <Ionicons name="trophy" size={20} color="#FFF" />
          )}
        </View>
        <View style={styles.selectorText}>
          <Text style={styles.selectorName}>{selected?.name || "Select"}</Text>
          <Text style={styles.selectorSub}>
            {selected?.completedRounds || 0} of {selected?.totalRounds || 0} rounds
          </Text>
        </View>
        {myInvitationals.length > 1 && (
          <Ionicons name="chevron-down" size={20} color="#B8860B" />
        )}
      </TouchableOpacity>
    );
  };

  const renderRSVPBanner = () => {
    if (!myRosterEntry || myRosterEntry.status !== "invited") return null;

    return (
      <View style={styles.rsvpBanner}>
        <View style={styles.rsvpContent}>
          <Ionicons name="mail" size={20} color="#B8860B" />
          <View style={styles.rsvpText}>
            <Text style={styles.rsvpTitle}>You're Invited!</Text>
            <Text style={styles.rsvpSubtext}>
              {invitational?.hostName} invited you to this invitational
            </Text>
          </View>
        </View>
        <View style={styles.rsvpActions}>
          <TouchableOpacity
            style={styles.rsvpDeclineButton}
            onPress={handleDeclineInvite}
          >
            <Text style={styles.rsvpDeclineText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rsvpAcceptButton}
            onPress={handleAcceptInvite}
          >
            <Ionicons name="checkmark" size={18} color="#FFF" />
            <Text style={styles.rsvpAcceptText}>Accept</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderStatusBanner = () => {
    if (!invitational) return null;

    const activeRound = getActiveRound();
    const iconName = invitational.status === "completed"
      ? "trophy-outline"
      : activeRound
      ? "play-circle-outline"
      : "calendar-outline";

    return (
      <View style={[styles.statusBanner, { borderLeftColor: getStatusColor() }]}>
        <Ionicons name={iconName as any} size={20} color={getStatusColor()} />
        <Text style={[styles.statusText, { color: getStatusColor() }]}>
          {getRoundStatus()}
        </Text>
      </View>
    );
  };

  const renderLastRoundWinner = () => {
    if (!invitational) return null;

    const lastRound = getLastCompletedRound();
    const winner = getLastRoundWinner();

    if (!lastRound || !winner) {
      if (invitational.status === "open" && getCompletedRounds().length === 0) {
        return (
          <View style={styles.winnerCard}>
            <View style={styles.winnerEmpty}>
              <Text style={styles.winnerEmoji}>🏆</Text>
              <Text style={styles.winnerEmptyTitle}>No Results Yet</Text>
              <Text style={styles.winnerEmptySubtitle}>
                Results appear after the first round
              </Text>
            </View>
          </View>
        );
      }
      return null;
    }

    return (
      <View style={styles.winnerCard}>
        <Text style={styles.winnerLabel}>
          ROUND {lastRound.roundNumber} WINNER
        </Text>
        <View style={styles.winnerContent}>
          <View style={styles.winnerAvatarPlaceholder}>
            <Text style={styles.winnerAvatarText}>
              {winner.displayName?.charAt(0) || "?"}
            </Text>
          </View>
          <Text style={styles.winnerName}>{winner.displayName}</Text>
          <Text style={styles.winnerScore}>
            {winner.totalScore}
            {winner.toPar !== 0
              ? ` (${winner.toPar > 0 ? "+" : ""}${winner.toPar})`
              : " (E)"}
          </Text>
          <Text style={styles.winnerCourse}>
            {lastRound.courseName}
          </Text>
        </View>
      </View>
    );
  };

  const renderAnnouncements = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Announcements</Text>
        {isHost && (
          <TouchableOpacity
            style={styles.createAnnouncementButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowAnnouncementModal(true);
            }}
          >
            <Ionicons name="add-circle" size={20} color="#B8860B" />
            <Text style={styles.createAnnouncementText}>Post</Text>
          </TouchableOpacity>
        )}
      </View>

      {announcements.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="megaphone-outline" size={32} color="#CCC" />
          <Text style={styles.emptyText}>No announcements yet</Text>
        </View>
      ) : (
        announcements.map((item) => (
          <View key={item.id} style={styles.announcementCard}>
            <View style={styles.announcementHeader}>
              {item.authorAvatar ? (
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
                  {item.authorName}
                </Text>
                <Text style={styles.announcementTime}>
                  {formatTimeAgo(item.createdAt)}
                </Text>
              </View>
            </View>
            <Text style={styles.announcementMessage}>{item.message}</Text>
          </View>
        ))
      )}
    </View>
  );

  const renderUpcomingRounds = () => {
    const upcoming = getUpcomingRounds();
    const activeRound = getActiveRound();

    if (upcoming.length === 0 && !activeRound) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upcoming Rounds</Text>

        {/* Active round */}
        {activeRound && (
          <TouchableOpacity
            style={[styles.roundCard, styles.roundCardActive]}
            activeOpacity={0.7}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (activeRound.outingId) {
                // Navigate to outing scorecard
                router.push(`/outings/${activeRound.outingId}` as any);
              }
            }}
          >
            <View style={styles.roundBadge}>
              <Text style={styles.roundBadgeText}>R{activeRound.roundNumber}</Text>
            </View>
            <View style={styles.roundInfo}>
              <Text style={styles.roundCourseName}>{activeRound.courseName}</Text>
              <Text style={styles.roundMeta}>
                {formatDate(activeRound.date)}
                {activeRound.teeTime ? ` • ${activeRound.teeTime}` : ""}
              </Text>
            </View>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Upcoming rounds (show max 2) */}
        {upcoming.slice(0, 2).map((round) => (
          <View key={round.roundId} style={styles.roundCard}>
            <View style={[styles.roundBadge, styles.roundBadgeUpcoming]}>
              <Text style={[styles.roundBadgeText, styles.roundBadgeTextUpcoming]}>
                R{round.roundNumber}
              </Text>
            </View>
            <View style={styles.roundInfo}>
              <Text style={styles.roundCourseName}>
                {round.courseName || "Course TBD"}
              </Text>
              <Text style={styles.roundMeta}>
                {formatDate(round.date)}
                {round.teeTime ? ` • ${round.teeTime}` : " • Tee time TBD"}
              </Text>
              <Text style={styles.roundFormat}>
                {round.format === "stroke" ? "Stroke" : round.format === "stableford" ? "Stableford" : "Scramble"}
                {" • "}
                {round.scoringType === "net" ? "Net" : "Gross"}
              </Text>
            </View>
          </View>
        ))}

        {upcoming.length > 2 && (
          <TouchableOpacity
            style={styles.viewAllRoundsButton}
            onPress={() => {
              soundPlayer.play("click");
              router.replace(`/invitationals/schedule?id=${selectedId}` as any);
            }}
          >
            <Text style={styles.viewAllRoundsText}>
              View all {upcoming.length} upcoming rounds
            </Text>
            <Ionicons name="arrow-forward" size={14} color="#0D5C3A" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderMyStatus = () => {
    if (!myRosterEntry || myRosterEntry.status !== "accepted") return null;

    const myStanding = getMyStanding();
    const completedCount = getCompletedRounds().length;
    const totalPlayers = invitational?.roster?.filter(
      (r) => r.status === "accepted" || r.status === "ghost"
    ).length || 0;

    const handicapDisplay =
      invitational?.handicapMethod === "manual"
        ? myRosterEntry.invitationalHandicap != null
          ? myRosterEntry.invitationalHandicap.toString()
          : "-"
        : myRosterEntry.handicap != null
        ? myRosterEntry.handicap.toFixed(1)
        : "-";

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Status</Text>
        <View style={styles.myStatusCard}>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                #{myStanding?.rank || "-"}
              </Text>
              <Text style={styles.statLabel}>of {totalPlayers}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {myStanding?.totalScore || "-"}
              </Text>
              <Text style={styles.statLabel}>Score</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {myStanding?.roundScores?.length || 0}
              </Text>
              <Text style={styles.statLabel}>Rounds</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{handicapDisplay}</Text>
              <Text style={styles.statLabel}>HCP</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  /* ================================================================ */
  /* MODALS                                                          */
  /* ================================================================ */

  const renderSelectorModal = () => (
    <Modal
      visible={showSelector}
      transparent
      animationType="fade"
      onRequestClose={() => setShowSelector(false)}
    >
      <Pressable
        style={styles.modalBackdrop}
        onPress={() => setShowSelector(false)}
      >
        <View style={styles.selectorModalContent}>
          <Text style={styles.selectorModalTitle}>Select Invitational</Text>
          {myInvitationals.map((inv) => (
            <TouchableOpacity
              key={inv.id}
              style={[
                styles.selectorOption,
                inv.id === selectedId && styles.selectorOptionSelected,
              ]}
              onPress={() => handleSelectInvitational(inv.id)}
            >
              <View style={styles.selectorOptionContent}>
                <View style={styles.selectorIconSmall}>
                  <Ionicons name="trophy" size={16} color="#FFF" />
                </View>
                <View>
                  <Text style={styles.selectorOptionTitle}>{inv.name}</Text>
                  <Text style={styles.selectorOptionSubtitle}>
                    {inv.completedRounds}/{inv.totalRounds} rounds
                    {inv.userRank ? ` • Rank #${inv.userRank}` : ""}
                  </Text>
                </View>
              </View>
              {inv.id === selectedId && (
                <Ionicons name="checkmark" size={20} color="#B8860B" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </Pressable>
    </Modal>
  );

  const renderAnnouncementModal = () => (
    <Modal
      visible={showAnnouncementModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowAnnouncementModal(false)}
    >
      <Pressable
        style={styles.modalBackdrop}
        onPress={() => setShowAnnouncementModal(false)}
      >
        <Pressable
          style={styles.announcementModalContent}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.announcementModalHeader}>
            <Text style={styles.announcementModalTitle}>Post Announcement</Text>
            <TouchableOpacity onPress={() => setShowAnnouncementModal(false)}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.announcementInput}
            placeholder="Share an update with the group..."
            placeholderTextColor="#999"
            value={announcementText}
            onChangeText={setAnnouncementText}
            multiline
            maxLength={500}
            autoFocus
          />
          <View style={styles.announcementModalFooter}>
            <Text style={styles.announcementCharCount}>
              {announcementText.length}/500
            </Text>
            <TouchableOpacity
              style={[
                styles.announcementPostButton,
                (!announcementText.trim() || postingAnnouncement) &&
                  styles.announcementPostDisabled,
              ]}
              onPress={handlePostAnnouncement}
              disabled={!announcementText.trim() || postingAnnouncement}
            >
              {postingAnnouncement ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.announcementPostText}>Post</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );

  /* ================================================================ */
  /* MAIN RENDER                                                     */
  /* ================================================================ */

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#B8860B" />
      </View>
    );
  }

  if (myInvitationals.length === 0) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateEmoji}>🏆</Text>
          <Text style={styles.emptyStateTitle}>No Invitationals</Text>
          <Text style={styles.emptyStateSubtitle}>
            Host your own or wait for an invite!
          </Text>
          <TouchableOpacity
            style={styles.emptyStateButton}
            onPress={() => router.push("/invitationals/create" as any)}
          >
            <Text style={styles.emptyStateButtonText}>Create Invitational</Text>
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
            tintColor="#B8860B"
          />
        }
      >
        {renderSelector()}
        {renderRSVPBanner()}
        {renderStatusBanner()}
        {renderLastRoundWinner()}
        {renderAnnouncements()}
        {renderUpcomingRounds()}
        {renderMyStatus()}
        <View style={{ height: 100 }} />
      </ScrollView>

      {renderSelectorModal()}
      {renderAnnouncementModal()}
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
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
  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#F4EED8",
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
    backgroundColor: "#B8860B",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  tabTextActive: {
    color: "#FFF",
    fontWeight: "700",
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
  },

  // Invitational Selector
  selectorCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  selectorIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#B8860B",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  selectorAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  selectorText: {
    flex: 1,
    gap: 2,
  },
  selectorName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  selectorSub: {
    fontSize: 13,
    color: "#888",
  },

  // RSVP Banner
  rsvpBanner: {
    backgroundColor: "#FFF8E1",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FFE082",
    gap: 12,
  },
  rsvpContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rsvpText: {
    flex: 1,
    gap: 2,
  },
  rsvpTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#B8860B",
  },
  rsvpSubtext: {
    fontSize: 12,
    color: "#888",
  },
  rsvpActions: {
    flexDirection: "row",
    gap: 10,
  },
  rsvpDeclineButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DDD",
  },
  rsvpDeclineText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#999",
  },
  rsvpAcceptButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#B8860B",
  },
  rsvpAcceptText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },

  // Status Banner
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Winner Card
  winnerCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
  },
  winnerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B8860B",
    letterSpacing: 1,
    marginBottom: 12,
  },
  winnerContent: {
    alignItems: "center",
    gap: 4,
  },
  winnerAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#B8860B",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFD700",
    marginBottom: 8,
  },
  winnerAvatarText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFF",
  },
  winnerName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  winnerScore: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  winnerCourse: {
    fontSize: 13,
    color: "#888",
  },
  winnerEmpty: {
    alignItems: "center",
    paddingVertical: 8,
  },
  winnerEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  winnerEmptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  winnerEmptySubtitle: {
    fontSize: 13,
    color: "#999",
    marginTop: 4,
  },

  // Sections
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },

  // Announcements
  createAnnouncementButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(184, 134, 11, 0.1)",
    borderRadius: 16,
  },
  createAnnouncementText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#B8860B",
  },
  announcementCard: {
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  announcementHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  announcementAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  announcementAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#B8860B",
    alignItems: "center",
    justifyContent: "center",
  },
  announcementAvatarText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFF",
  },
  announcementMeta: {
    flex: 1,
  },
  announcementAuthor: {
    fontSize: 13,
    fontWeight: "700",
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
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#999",
  },

  // Round Cards
  roundCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  roundCardActive: {
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },
  roundBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  roundBadgeUpcoming: {
    backgroundColor: "#E0E0E0",
  },
  roundBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFF",
  },
  roundBadgeTextUpcoming: {
    color: "#666",
  },
  roundInfo: {
    flex: 1,
    gap: 2,
  },
  roundCourseName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  },
  roundMeta: {
    fontSize: 12,
    color: "#888",
  },
  roundFormat: {
    fontSize: 11,
    color: "#AAA",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(13, 92, 58, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0D5C3A",
  },
  liveText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  viewAllRoundsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
  },
  viewAllRoundsText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D5C3A",
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
    color: "#B8860B",
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

  // Modals
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
    backgroundColor: "#FFF8E1",
  },
  selectorOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectorIconSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#B8860B",
    alignItems: "center",
    justifyContent: "center",
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

  // Announcement Modal
  announcementModalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  announcementModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  announcementModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  announcementInput: {
    backgroundColor: "#F8F8F8",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#333",
    minHeight: 100,
    textAlignVertical: "top",
  },
  announcementModalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  announcementCharCount: {
    fontSize: 12,
    color: "#999",
  },
  announcementPostButton: {
    backgroundColor: "#B8860B",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  announcementPostDisabled: {
    opacity: 0.4,
  },
  announcementPostText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
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
    backgroundColor: "#B8860B",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
});