/**
 * League Detail Page (Public Marketing Page)
 * 
 * Displays league info for anyone to view.
 * Allows users to request to join.
 * 
 * Sections:
 * 1. Header with league name
 * 2. Hero card (last week's winner)
 * 3. Quick stats row
 * 4. About section (format, type, region, dates)
 * 5. Members preview
 * 6. Sticky bottom CTA
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
  description: string;
  leagueType: "live" | "sim";
  simPlatform: string | null;
  format: "stroke" | "2v2";
  holes: number;
  frequency: "weekly" | "biweekly";
  regionName: string;
  startDate: any;
  endDate: any;
  totalWeeks: number;
  currentWeek: number;
  memberCount: number;
  hostUserId: string;
  status: string;
  lastWeekResult?: LastWeekResult;
}

interface LastWeekResult {
  week: number;
  // Stroke play
  winnerId?: string;
  winnerName?: string;
  winnerAvatar?: string;
  score?: number;
  courseName?: string;
  participantCount?: number;
  // 2v2 teams
  teamName?: string;
  teamMembers?: Array<{
    userId: string;
    displayName: string;
    avatar: string | null;
  }>;
  matchResult?: string;
  opponentTeamName?: string;
  teamCount?: number;
}

interface Member {
  id: string;
  userId: string;
  displayName: string;
  avatar: string | null;
  role: string;
}

/* ================================================================ */
/* CONSTANTS                                                        */
/* ================================================================ */

const SIM_PLATFORMS: Record<string, string> = {
  trackman: "TrackMan",
  fullswing: "Full Swing",
  foresight: "Foresight",
  topgolf: "TopGolf",
  golfzon: "Golfzon",
  aboutgolf: "aboutGolf",
  other: "Other",
  notsure: "Not Sure",
};

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function LeagueDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const leagueId = Array.isArray(id) ? id[0] : id;
  const currentUserId = auth.currentUser?.uid;

  // State
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requesting, setRequesting] = useState(false);

  // Membership status
  const [isMember, setIsMember] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isCommissioner, setIsCommissioner] = useState(false);

  // Description expansion
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  /* ================================================================ */
  /* DATA LOADING                                                    */
  /* ================================================================ */

  useEffect(() => {
    if (leagueId) {
      loadLeagueData();
    }
  }, [leagueId]);

  const loadLeagueData = async () => {
    if (!leagueId) return;

    try {
      // Load league doc
      const leagueDoc = await getDoc(doc(db, "leagues", leagueId));
      if (!leagueDoc.exists()) {
        Alert.alert("Not Found", "This league doesn't exist.");
        router.back();
        return;
      }

      const leagueData = { id: leagueDoc.id, ...leagueDoc.data() } as League;
      setLeague(leagueData);

      // Check if current user is commissioner
      if (currentUserId && leagueData.hostUserId === currentUserId) {
        setIsCommissioner(true);
        setIsMember(true);
      }

      // Load members (limit 10 for preview)
      const membersSnap = await getDocs(
        query(collection(db, "leagues", leagueId, "members"), limit(10))
      );
      const membersData: Member[] = [];
      membersSnap.forEach((doc) => {
        membersData.push({ id: doc.id, ...doc.data() } as Member);

        // Check if current user is a member
        if (currentUserId && doc.data().userId === currentUserId) {
          setIsMember(true);
        }
      });
      setMembers(membersData);

      // Check for pending join request
      if (currentUserId && !isMember) {
        const requestsSnap = await getDocs(
          query(
            collection(db, "league_join_requests"),
            where("leagueId", "==", leagueId),
            where("userId", "==", currentUserId),
            where("status", "==", "pending")
          )
        );
        setIsPending(!requestsSnap.empty);
      }

      setLoading(false);
    } catch (error) {
      console.error("Error loading league:", error);
      Alert.alert("Error", "Failed to load league data.");
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await loadLeagueData();
    setRefreshing(false);
  };

  /* ================================================================ */
  /* HANDLERS                                                        */
  /* ================================================================ */

  const handleRequestToJoin = async () => {
  if (!currentUserId || !league) return;

  setRequesting(true);
  try {
    // Get user data
    const userDoc = await getDoc(doc(db, "users", currentUserId));
    const userData = userDoc.data();

    // Create join request
    await addDoc(collection(db, "league_join_requests"), {
      leagueId: league.id,
      leagueName: league.name,
      userId: currentUserId,
      displayName: userData?.displayName || "Unknown",
      avatar: userData?.avatar || null,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Send notification to commissioner
    await addDoc(collection(db, "notifications"), {
      userId: league.hostUserId,
      type: "league_join_request",
      message: `${userData?.displayName || "Someone"} wants to join ${league.name}`,
      actorId: currentUserId,
      actorName: userData?.displayName || "Unknown",
      actorAvatar: userData?.avatar || null,
      leagueId: league.id,
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    soundPlayer.play("postThought");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsPending(true);

    Alert.alert(
      "Request Sent! ⛳",
      "The league commissioner will review your request."
    );
  } catch (error) {
    console.error("Error requesting to join:", error);
    soundPlayer.play("error");
    Alert.alert("Error", "Failed to send request. Please try again.");
  }
  setRequesting(false);
};

  const handleGoToLeague = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/leagues/home" as any);
  };

  const handleManageLeague = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/leagues/settings?leagueId=${leagueId}` as any);
  };

  /* ================================================================ */
  /* HELPERS                                                         */
  /* ================================================================ */

  const formatDate = (timestamp: any): string => {
    if (!timestamp) return "TBD";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatDateRange = (): string => {
    if (!league?.startDate || !league?.endDate) return "Dates TBD";
    return `${formatDate(league.startDate)} - ${formatDate(league.endDate)}`;
  };

  const getSeasonStatus = (): string => {
    if (!league) return "";
    if (league.status === "upcoming") return "Starting Soon";
    if (league.status === "active") return `Week ${league.currentWeek} of ${league.totalWeeks}`;
    if (league.status === "completed") return "Season Complete";
    return "";
  };

  /* ================================================================ */
  /* RENDER: HERO CARD                                               */
  /* ================================================================ */

  const renderHeroCard = () => {
    if (!league) return null;

    const result = league.lastWeekResult;

    // No results yet - show season start info
    if (!result) {
      return (
        <View style={styles.heroCard}>
          <View style={styles.heroCardInner}>
            <Text style={styles.heroLabel}>
              {league.status === "upcoming" ? "SEASON STARTS" : "NO RESULTS YET"}
            </Text>
            {league.status === "upcoming" ? (
              <>
                <Text style={styles.heroDateLarge}>{formatDate(league.startDate)}</Text>
                <Text style={styles.heroSubtext}>
                  {league.totalWeeks} weeks of competition
                </Text>
              </>
            ) : (
              <View style={styles.heroEmptyState}>
                <Image
                  source={require("@/assets/icons/LowLeaderTrophy.png")}
                  style={styles.heroTrophyEmpty}
                />
                <Text style={styles.heroSubtext}>Check back after Week 1</Text>
              </View>
            )}
          </View>
        </View>
      );
    }

    // 2v2 Team Winner
    if (league.format === "2v2" && result.teamName) {
      return (
        <View style={[styles.heroCard, styles.heroCardWinner]}>
          <View style={styles.heroCardInner}>
            <Text style={styles.heroLabelGold}>🏆 WEEK {result.week} CHAMPIONS</Text>
            <Text style={styles.heroTeamName}>{result.teamName}</Text>
            
            {/* Team member avatars */}
            {result.teamMembers && result.teamMembers.length > 0 && (
              <View style={styles.heroTeamAvatars}>
                {result.teamMembers.map((member, index) => (
                  <View key={member.userId} style={styles.heroTeamMember}>
                    {member.avatar ? (
                      <Image source={{ uri: member.avatar }} style={styles.heroTeamAvatar} />
                    ) : (
                      <View style={styles.heroTeamAvatarPlaceholder}>
                        <Text style={styles.heroTeamAvatarInitial}>
                          {member.displayName[0]?.toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.heroTeamMemberName} numberOfLines={1}>
                      {member.displayName.split(" ")[0]}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {result.opponentTeamName && (
              <Text style={styles.heroMatchResult}>
                Won {result.matchResult} vs {result.opponentTeamName}
              </Text>
            )}

            <Text style={styles.heroParticipants}>
              {result.teamCount} teams competed
            </Text>
          </View>
        </View>
      );
    }

    // Stroke Play Winner
    return (
      <View style={[styles.heroCard, styles.heroCardWinner]}>
        <View style={styles.heroCardInner}>
          <Text style={styles.heroLabelGold}>🏆 WEEK {result.week} LOW LEADER</Text>
          
          {/* Winner avatar */}
          <View style={styles.heroWinnerAvatar}>
            {result.winnerAvatar ? (
              <Image source={{ uri: result.winnerAvatar }} style={styles.heroAvatar} />
            ) : (
              <View style={styles.heroAvatarPlaceholder}>
                <Text style={styles.heroAvatarInitial}>
                  {result.winnerName?.[0]?.toUpperCase() || "?"}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.heroWinnerName}>{result.winnerName}</Text>
          
          {result.score && result.courseName && (
            <Text style={styles.heroScore}>
              {result.score} at {result.courseName}
            </Text>
          )}

          <Text style={styles.heroParticipants}>
            {result.participantCount} golfers competed
          </Text>
        </View>
      </View>
    );
  };

  /* ================================================================ */
  /* RENDER: STATS ROW                                               */
  /* ================================================================ */

  const renderStatsRow = () => {
    if (!league) return null;

    return (
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{league.memberCount}</Text>
          <Text style={styles.statLabel}>MEMBERS</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statItem}>
          <Text style={styles.statValue}>{league.holes}</Text>
          <Text style={styles.statLabel}>HOLES</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {league.frequency === "weekly" ? "Weekly" : "Bi-wk"}
          </Text>
          <Text style={styles.statLabel}>ROUNDS</Text>
        </View>
      </View>
    );
  };

  /* ================================================================ */
  /* RENDER: ABOUT SECTION                                           */
  /* ================================================================ */

  const renderAboutSection = () => {
    if (!league) return null;

    return (
      <View style={styles.aboutSection}>
        <Text style={styles.sectionTitle}>About</Text>

        {/* Badges Row */}
        <View style={styles.badgesRow}>
          {/* Format Badge */}
          <View style={styles.badge}>
            <Ionicons
              name={league.format === "stroke" ? "person" : "people"}
              size={14}
              color="#0D5C3A"
            />
            <Text style={styles.badgeText}>
              {league.format === "stroke" ? "Stroke Play" : "2v2 Teams"}
            </Text>
          </View>

          {/* Type Badge */}
          <View style={styles.badge}>
            <Text style={styles.badgeEmoji}>
              {league.leagueType === "live" ? "☀️" : "🖥️"}
            </Text>
            <Text style={styles.badgeText}>
              {league.leagueType === "live" ? "Live Golf" : "Simulator"}
            </Text>
          </View>

          {/* Sim Platform Badge */}
          {league.leagueType === "sim" && league.simPlatform && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {SIM_PLATFORMS[league.simPlatform] || league.simPlatform}
              </Text>
            </View>
          )}
        </View>

        {/* Info Rows */}
        <View style={styles.infoRow}>
          <Ionicons name="location" size={18} color="#666" />
          <Text style={styles.infoText}>{league.regionName}</Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="calendar" size={18} color="#666" />
          <Text style={styles.infoText}>{formatDateRange()}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{getSeasonStatus()}</Text>
          </View>
        </View>

        {/* Description */}
        {league.description && (
          <TouchableOpacity
            onPress={() => setDescriptionExpanded(!descriptionExpanded)}
            activeOpacity={0.7}
          >
            <Text
              style={styles.description}
              numberOfLines={descriptionExpanded ? undefined : 3}
            >
              {league.description}
            </Text>
            {league.description.length > 150 && (
              <Text style={styles.readMore}>
                {descriptionExpanded ? "Show less" : "Read more"}
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  /* ================================================================ */
  /* RENDER: MEMBERS PREVIEW                                         */
  /* ================================================================ */

  const renderMembersPreview = () => {
    if (!league || members.length === 0) return null;

    const displayMembers = members.slice(0, 5);
    const remaining = league.memberCount - displayMembers.length;

    return (
      <View style={styles.membersSection}>
        <View style={styles.membersSectionHeader}>
          <Text style={styles.sectionTitle}>Members ({league.memberCount})</Text>
        </View>

        <View style={styles.membersPreview}>
          {/* Stacked avatars */}
          <View style={styles.avatarStack}>
            {displayMembers.map((member, index) => (
              <View
                key={member.id}
                style={[
                  styles.stackedAvatarContainer,
                  { marginLeft: index > 0 ? -12 : 0, zIndex: 10 - index },
                ]}
              >
                {member.avatar ? (
                  <Image source={{ uri: member.avatar }} style={styles.stackedAvatar} />
                ) : (
                  <View style={styles.stackedAvatarPlaceholder}>
                    <Text style={styles.stackedAvatarInitial}>
                      {member.displayName[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            ))}
            
            {remaining > 0 && (
              <View style={[styles.stackedAvatarContainer, { marginLeft: -12, zIndex: 0 }]}>
                <View style={styles.moreAvatars}>
                  <Text style={styles.moreAvatarsText}>+{remaining}</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  /* ================================================================ */
  /* RENDER: BOTTOM CTA                                              */
  /* ================================================================ */

  const renderBottomCTA = () => {
    if (!league) return null;

    // Commissioner
    if (isCommissioner) {
      return (
        <View style={[styles.bottomCTA, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.ctaButton} onPress={handleManageLeague}>
            <Ionicons name="settings" size={20} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.ctaButtonText}>Manage League</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Already a member
    if (isMember) {
      return (
        <View style={[styles.bottomCTA, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.ctaButton} onPress={handleGoToLeague}>
            <Text style={styles.ctaButtonText}>Go to League</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </View>
      );
    }

    // Pending request
    if (isPending) {
      return (
        <View style={[styles.bottomCTA, { paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.ctaButton, styles.ctaButtonDisabled]}>
            <Ionicons name="time" size={20} color="#666" style={{ marginRight: 8 }} />
            <Text style={styles.ctaButtonTextDisabled}>Request Pending</Text>
          </View>
        </View>
      );
    }

    // Not signed in
    if (!currentUserId) {
      return (
        <View style={[styles.bottomCTA, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => {
              soundPlayer.play("click");
              router.push("/auth/login" as any);
            }}
          >
            <Text style={styles.ctaButtonText}>Sign In to Join</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Request to join
    return (
      <View style={[styles.bottomCTA, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={handleRequestToJoin}
          disabled={requesting}
        >
          {requesting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="person-add" size={20} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.ctaButtonText}>Request to Join</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  /* ================================================================ */
  /* MAIN RENDER                                                     */
  /* ================================================================ */

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  if (!league) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>League not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
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
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          {league.avatar ? (
            <Image source={{ uri: league.avatar }} style={styles.headerAvatar} />
          ) : null}
          <Text style={styles.headerTitle} numberOfLines={1}>
            {league.name}
          </Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0D5C3A"
          />
        }
      >
        {renderHeroCard()}
        {renderStatsRow()}
        {renderAboutSection()}
        {renderMembersPreview()}
        
        {/* Spacer for bottom CTA */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom CTA */}
      {renderBottomCTA()}
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
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 16,
    color: "#666",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFF",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
    flexShrink: 1,
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 8,
  },
  headerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },

  // Hero Card
  heroCard: {
    backgroundColor: "#F4EED8",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D4D0C5",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  heroCardWinner: {
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  heroCardInner: {
    padding: 20,
    alignItems: "center",
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666",
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroLabelGold: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B8860B",
    letterSpacing: 1,
    marginBottom: 12,
  },
  heroDateLarge: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0D5C3A",
    marginBottom: 4,
  },
  heroSubtext: {
    fontSize: 14,
    color: "#666",
  },
  heroEmptyState: {
    alignItems: "center",
    paddingVertical: 8,
  },
  heroTrophyEmpty: {
    width: 48,
    height: 48,
    opacity: 0.5,
    marginBottom: 8,
  },

  // Hero - Stroke Play Winner
  heroWinnerAvatar: {
    marginBottom: 12,
  },
  heroAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: "#FFD700",
  },
  heroAvatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFD700",
  },
  heroAvatarInitial: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFF",
  },
  heroWinnerName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 4,
  },
  heroScore: {
    fontSize: 15,
    color: "#333",
    marginBottom: 8,
  },
  heroParticipants: {
    fontSize: 13,
    color: "#666",
    fontStyle: "italic",
  },

  // Hero - 2v2 Team Winner
  heroTeamName: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0D5C3A",
    marginBottom: 12,
  },
  heroTeamAvatars: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginBottom: 12,
  },
  heroTeamMember: {
    alignItems: "center",
  },
  heroTeamAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "#FFD700",
    marginBottom: 4,
  },
  heroTeamAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFD700",
    marginBottom: 4,
  },
  heroTeamAvatarInitial: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFF",
  },
  heroTeamMemberName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    maxWidth: 70,
  },
  heroMatchResult: {
    fontSize: 14,
    color: "#333",
    marginBottom: 8,
  },

  // Stats Bar
  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: "#E0E0E0",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0D5C3A",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#888",
    letterSpacing: 0.5,
  },

  // About Section
  aboutSection: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 12,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F8F0",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  badgeEmoji: {
    fontSize: 14,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  infoText: {
    fontSize: 15,
    color: "#333",
    flex: 1,
  },
  statusBadge: {
    backgroundColor: "#E8F5E9",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2E7D32",
  },
  description: {
    fontSize: 15,
    color: "#333",
    lineHeight: 22,
    marginTop: 8,
  },
  readMore: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
    marginTop: 4,
  },

  // Members Section
  membersSection: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  membersSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  membersPreview: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  stackedAvatarContainer: {
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FFF",
  },
  stackedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  stackedAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  stackedAvatarInitial: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },
  moreAvatars: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E0E0E0",
    alignItems: "center",
    justifyContent: "center",
  },
  moreAvatarsText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#666",
  },

  // Bottom CTA
  bottomCTA: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    paddingVertical: 16,
  },
  ctaButtonDisabled: {
    backgroundColor: "#E0E0E0",
  },
  ctaButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },
  ctaButtonTextDisabled: {
    fontSize: 18,
    fontWeight: "700",
    color: "#666",
  },
});