import LockerRivals from "@/components/locker/LockerRivals";
import BottomActionBar from "@/components/navigation/BottomActionBar";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import { soundPlayer } from "@/utils/soundPlayer";

import LockerClubsDisplay from "@/components/locker/LockerClubsDisplay";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Badge icon imports
const LowLeaderTrophy = require("@/assets/icons/LowLeaderTrophy.png");
const LowLeaderScratch = require("@/assets/icons/LowLeaderScratch.png");
const LowLeaderAce = require("@/assets/icons/LowLeaderAce.png");
const HoleInOne = require("@/assets/icons/HoleinOne.png");

export default function LockerScreen() {
  const router = useRouter();
  const currentUserId = auth.currentUser?.uid;
  const { getCache, setCache } = useCache();

  const [profile, setProfile] = useState<any>(null);
  const [clubs, setClubs] = useState<any>(null);
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showingCached, setShowingCached] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /* ========================= LOAD USER WITH CACHE ========================= */

  useFocusEffect(
    useCallback(() => {
      if (!currentUserId) return;

      let unsubscribe: (() => void) | undefined;

      const loadUserWithCache = async () => {
        try {
          const cached = await getCache(CACHE_KEYS.LOCKER(currentUserId));
          
          if (cached) {
            console.log("⚡ Using cached locker data");
            setProfile(cached.profile);
            setClubs(cached.clubs);
            setBadges(Array.isArray(cached.badges) ? cached.badges : []);
            setShowingCached(true);
            setLoading(false);
          }

          const userRef = doc(db, "users", currentUserId);

          unsubscribe = onSnapshot(
            userRef,
            async (snap) => {
              if (snap.exists()) {
                const data = snap.data();
                
                const badgesData = data.Badges || [];
                const validBadges = badgesData.filter((badge: any) => {
                  if (!badge) return false;
                  if (typeof badge === "string" && badge.trim() === "") return false;
                  return true;
                });
                
                const displayBadges = data.displayBadges || validBadges.slice(0, 3);
                
                setProfile(data);
                setClubs(data.clubs || {});
                setBadges(displayBadges);
                
                await setCache(CACHE_KEYS.LOCKER(currentUserId), {
                  profile: data,
                  clubs: data.clubs || {},
                  badges: displayBadges,
                });
                
                setShowingCached(false);
              }
              setLoading(false);
            },
            (error) => {
              console.error("Error loading user:", error);
              soundPlayer.play('error');
              setShowingCached(false);
              setLoading(false);
            }
          );
        } catch (error) {
          console.error("❌ Locker cache error:", error);
          setLoading(false);
        }
      };

      loadUserWithCache();

      return () => {
        if (unsubscribe) {
          unsubscribe();
        }
      };
    }, [currentUserId])
  );

  /* ========================= PULL TO REFRESH ========================= */

  const onRefresh = useCallback(async () => {
    if (!currentUserId) return;
    
    setRefreshing(true);
    setShowingCached(false);
    
    try {
      const userRef = doc(db, "users", currentUserId);
      const snap = await getDoc(userRef);
      
      if (snap.exists()) {
        const data = snap.data();
        
        const badgesData = data.Badges || [];
        const validBadges = badgesData.filter((badge: any) => {
          if (!badge) return false;
          if (typeof badge === "string" && badge.trim() === "") return false;
          return true;
        });
        
        const displayBadges = data.displayBadges || validBadges.slice(0, 3);
        
        setProfile(data);
        setClubs(data.clubs || {});
        setBadges(displayBadges);
        
        await setCache(CACHE_KEYS.LOCKER(currentUserId), {
          profile: data,
          clubs: data.clubs || {},
          badges: displayBadges,
        });
      }
    } catch (error) {
      console.error("Error refreshing locker:", error);
      soundPlayer.play('error');
    }
    
    setRefreshing(false);
  }, [currentUserId]);

  /* ========================= HELPERS ========================= */

  const getHomeCourseName = () => {
    if (!profile) return null;
    if (profile.homeCourse && typeof profile.homeCourse === 'object') {
      return profile.homeCourse.courseName;
    }
    if (profile.homeCourseName) {
      return profile.homeCourseName;
    }
    if (profile.homeCourse && typeof profile.homeCourse === 'string') {
      return profile.homeCourse;
    }
    return null;
  };

  const parseBadge = (badge: any) => {
    if (typeof badge === "string") {
      return { 
        label: badge, 
        courseName: null, 
        date: null,
        icon: LowLeaderTrophy,
        type: "lowman"
      };
    }

    if (badge.type) {
      const badgeType = badge.type.toLowerCase();
      let icon = LowLeaderTrophy;
      
      switch (badgeType) {
        case "lowman": icon = LowLeaderTrophy; break;
        case "scratch": icon = LowLeaderScratch; break;
        case "ace": icon = LowLeaderAce; break;
        case "holeinone": icon = HoleInOne; break;
      }
      
      return {
        label: badge.displayName || (badgeType.charAt(0).toUpperCase() + badgeType.slice(1)),
        courseName: badge.courseName || null,
        date: badge.achievedAt || null,
        icon,
        type: badgeType
      };
    }

    const badgeKeys = Object.keys(badge || {}).filter(key => key !== 'courseName');
    const badgeTypeKey = badgeKeys.find(key => 
      badge[key] && typeof badge[key] === 'object' && badge[key].displayName
    );

    if (badgeTypeKey) {
      const badgeData = badge[badgeTypeKey];
      const badgeType = badgeTypeKey.toLowerCase();
      let icon = LowLeaderTrophy;
      
      switch (badgeType) {
        case "lowman": icon = LowLeaderTrophy; break;
        case "scratch": icon = LowLeaderScratch; break;
        case "ace": icon = LowLeaderAce; break;
        case "holeinone": icon = HoleInOne; break;
      }
      
      return {
        label: badgeData.displayName || (badgeTypeKey.charAt(0).toUpperCase() + badgeTypeKey.slice(1)),
        courseName: badge.courseName || null,
        date: badgeData.achievedAt || null,
        icon,
        type: badgeType
      };
    }

    return {
      label: badge.displayName || "Achievement",
      courseName: badge.courseName || null,
      date: badge.achievedAt || null,
      icon: LowLeaderTrophy,
      type: "lowman"
    };
  };

  /* ========================= COURSE USER REDIRECT ========================= */

  if (!loading && profile?.userType === "Course" && profile?.ownedCourseId) {
    return <Redirect href={`/locker/course/${profile.ownedCourseId}`} />;
  }

  /* ========================= UI ========================= */

  if (loading && !showingCached) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={["top"]} style={styles.safeTop} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D5C3A" />
        </View>
      </View>
    );
  }

  const homeCourseName = getHomeCourseName();

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      <ImageBackground
        source={require("@/assets/locker/locker-bg.png")}
        resizeMode="cover"
        style={styles.background}
      >
        <TopNavBar />

        {showingCached && !loading && (
          <View style={styles.cacheIndicator}>
            <ActivityIndicator size="small" color="#0D5C3A" />
            <Text style={styles.cacheText}>Updating locker...</Text>
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FFF"
              colors={["#FFF"]}
            />
          }
        >
          {/* ═══════════════════════════════════════════════════════════
              PROFILE SECTION — LAYOUT ORDER
              Name → HCI → Rivals → Stats → Identity → Badges → Clubs
              ═══════════════════════════════════════════════════════════ */}
          <View style={styles.profileSection}>

            {/* ── DISPLAY NAME ── */}
            <Text style={styles.name}>{profile?.displayName ?? "Player"}</Text>

            {/* ── HANDICAP ── */}
            <Text style={styles.handicap}>
              HCI: {profile?.handicap ?? "N/A"}
            </Text>

            {/* ── RIVALS (Nemesis / Threat / Target) ── */}
            {currentUserId && <LockerRivals userId={currentUserId} />}

            {/* ── CAREER STATS ROW ── */}
            <TouchableOpacity
              onPress={() => router.push(`/locker/stats-tracker?userId=${currentUserId}`)}
              activeOpacity={0.7}
            >
              <View style={styles.careerStatsContainer}>
                <View style={styles.statItem}>
                  <Text style={styles.statEmoji}>🦩</Text>
                  <Text style={styles.statCount}>
                    {profile?.totalBirdies > 0 ? profile.totalBirdies : "-"}
                  </Text>
                </View>
                
                <View style={styles.statItem}>
                  <Text style={styles.statEmoji}>🦅</Text>
                  <Text style={styles.statCount}>
                    {profile?.totalEagles > 0 ? profile.totalEagles : "-"}
                  </Text>
                </View>
                
                <View style={styles.statItem}>
                  <Text style={styles.statEmoji}>🦢</Text>
                  <Text style={styles.statCount}>
                    {profile?.totalAlbatross > 0 ? profile.totalAlbatross : "-"}
                  </Text>
                </View>
                
                <View style={styles.statItem}>
                  <Image source={HoleInOne} style={styles.statIcon} />
                  <Text style={styles.statCount}>
                    {profile?.totalHoleInOnes > 0 ? profile.totalHoleInOnes : "-"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* ── HOME COURSE & GAME IDENTITY ── */}
            {(homeCourseName || profile?.gameIdentity) && (
              <View style={styles.identityContainer}>
                {homeCourseName && (
                  <View style={styles.identityRow}>
                    <Ionicons name="flag" size={16} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.identityText}>{homeCourseName}</Text>
                  </View>
                )}
                {profile?.gameIdentity && (
                  <View style={styles.identityRow}>
                    <Ionicons name="chatbubble-ellipses" size={16} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.identityText}>"{profile.gameIdentity}"</Text>
                  </View>
                )}
              </View>
            )}

            {/* ── ACHIEVEMENTS — 3 across, compact ── */}
            {badges.length > 0 && (
              <View style={styles.badgesWrapper}>
                <Text style={styles.badgesSectionLabel}>ACHIEVEMENTS</Text>
                <View style={styles.badgesRow}>
                  {badges.slice(0, 3).map((badge, i) => {
                    const parsed = parseBadge(badge);
                    return (
                      <View key={i} style={styles.badgeCompact}>
                        <Image source={parsed.icon} style={styles.badgeIconCompact} />
                        <Text style={styles.badgeLabel} numberOfLines={1}>
                          {parsed.label}
                        </Text>
                        {parsed.courseName && (
                          <Text style={styles.badgeCourse} numberOfLines={1}>
                            {parsed.courseName}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* ═══ CLUBS ═══ */}
          <LockerClubsDisplay clubs={clubs} isOwnLocker={true} />
        </ScrollView>

        <BottomActionBar />
        <SwingFooter />
      </ImageBackground>
    </View>
  );
}

/* ========================= STYLES ========================= */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  safeTop: { backgroundColor: "#0D5C3A" },
  background: { flex: 1 },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  cacheIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    backgroundColor: "rgba(255, 243, 205, 0.95)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 236, 181, 0.95)",
  },
  
  cacheText: {
    fontSize: 12,
    color: "#664D03",
    fontWeight: "600",
  },

  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 120,
    gap: 24,
  },

  profileSection: { alignItems: "center", gap: 14 },

  // ── Name & Handicap ──
  name: {
    fontSize: 32,
    fontWeight: "800",
    color: "white",
  },

  handicap: {
    fontSize: 16,
    fontWeight: "700",
    color: "rgba(255,255,255,0.8)",
    letterSpacing: 0.5,
  },

  // ── Career Stats Row ──
  careerStatsContainer: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  statEmoji: {
    fontSize: 24,
  },

  statIcon: {
    width: 24,
    height: 24,
    resizeMode: "contain",
  },

  statCount: {
    fontSize: 18,
    fontWeight: "700",
    color: "white",
  },

  // ── Identity ──
  identityContainer: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
    alignItems: "center",
  },

  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  identityText: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.95)",
    fontStyle: "italic",
  },

  // ── Achievements — compact 3 across ──
  badgesWrapper: {
    width: "100%",
    alignItems: "center",
  },

  badgesSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 1.2,
    marginBottom: 10,
  },

  badgesRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },

  badgeCompact: {
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    width: 100,
    gap: 4,
  },

  badgeIconCompact: {
    width: 28,
    height: 28,
    resizeMode: "contain",
  },

  badgeLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFF",
    textAlign: "center",
  },

  badgeCourse: {
    fontSize: 9,
    fontWeight: "500",
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
  },
});








