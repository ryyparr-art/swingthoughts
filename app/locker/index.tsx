import AchievementNotecard, { seededAchievementRotation } from "@/components/locker/AchievementNotecard";
import HonorPlaque from "@/components/locker/HonorPlaque";
import LockerClubsDisplay from "@/components/locker/LockerClubsDisplay";
import LockerRailDivider from "@/components/locker/LockerRailDivider";
import LockerRivals from "@/components/locker/LockerRivals";
import SectionBanner from "@/components/locker/SectionBanner";
import StatsRow from "@/components/locker/StatsRow";
import BottomActionBar from "@/components/navigation/BottomActionBar";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import { soundPlayer } from "@/utils/soundPlayer";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const LowLeaderTrophy  = require("@/assets/icons/LowLeaderTrophy.png");
const LowLeaderScratch = require("@/assets/icons/LowLeaderScratch.png");
const LowLeaderAce     = require("@/assets/icons/LowLeaderAce.png");
const HoleInOne        = require("@/assets/icons/HoleinOne.png");
const LockerBg         = require("@/assets/locker/locker-bg.png");


export default function LockerScreen() {
  const router        = useRouter();
  const insets        = useSafeAreaInsets();
  const currentUserId = auth.currentUser?.uid;
  const { getCache, setCache } = useCache();

  const [profile,       setProfile]       = useState<any>(null);
  const [clubs,         setClubs]         = useState<any>(null);
  const [badges,        setBadges]        = useState<any[]>([]);
  const [showingCached, setShowingCached] = useState(false);

  /* ========================= LOAD ========================= */

  useFocusEffect(
    useCallback(() => {
      if (!currentUserId) return;
      let unsubscribe: (() => void) | undefined;

      const load = async () => {
        try {
          const cached = await getCache(CACHE_KEYS.LOCKER(currentUserId));
          if (cached) {
            setProfile(cached.profile);
            setClubs(cached.clubs);
            setBadges(Array.isArray(cached.badges) ? cached.badges : []);
            setShowingCached(true);
          }

          const userRef = doc(db, "users", currentUserId);
          unsubscribe = onSnapshot(userRef, async (snap) => {
            if (snap.exists()) {
              const data         = snap.data();
              const badgesData   = data.Badges || [];
              const validBadges  = badgesData.filter((b: any) => b && !(typeof b === "string" && !b.trim()));
              const displayBadges = data.displayBadges || validBadges.slice(0, 3);

              setProfile(data);
              setClubs(data.clubs || {});
              setBadges(displayBadges);

              await setCache(CACHE_KEYS.LOCKER(currentUserId), {
                profile: data, clubs: data.clubs || {}, badges: displayBadges,
              });
              setShowingCached(false);
            }
          }, (err) => {
            console.error("Error loading locker:", err);
            soundPlayer.play("error");
            setShowingCached(false);
          });
        } catch (e) {
          console.error("❌ Locker cache error:", e);
        }
      };

      load();
      return () => { if (unsubscribe) unsubscribe(); };
    }, [currentUserId])
  );

  /* ========================= HELPERS ========================= */

  const parseBadge = (badge: any) => {
    if (typeof badge === "string") return { label: badge, courseName: null, date: null, icon: LowLeaderTrophy, type: "lowman" };
    if (badge.type) {
      const t = badge.type.toLowerCase();
      const icon = t === "scratch" ? LowLeaderScratch : t === "ace" ? LowLeaderAce : t === "holeinone" ? HoleInOne : LowLeaderTrophy;
      return { label: badge.displayName || t, courseName: badge.courseName || null, date: badge.achievedAt || null, icon, type: t };
    }
    return { label: badge.displayName || "Achievement", courseName: badge.courseName || null, date: badge.achievedAt || null, icon: LowLeaderTrophy, type: "lowman" };
  };

  /* ========================= REDIRECT ========================= */

  if (profile?.userType === "Course" && profile?.ownedCourseId) {
    return <Redirect href={`/locker/course/${profile.ownedCourseId}`} />;
  }

  /* ========================= DERIVED ========================= */

  const homeCourse = profile?.homeCourse?.courseName
    ?? (typeof profile?.homeCourse === "string" ? profile.homeCourse : null)
    ?? profile?.homeCourseName ?? null;
  const gameIdentity = profile?.gameIdentity ?? null;

  /* ========================= UI ========================= */

  return (
    <View style={styles.container}>
      <View style={[styles.navWrapper, { paddingTop: insets.top }]}>
        <TopNavBar />
      </View>

      <ImageBackground
        source={LockerBg}
        resizeMode="stretch"
        style={styles.contentArea}
      >
        {showingCached && (
          <View style={styles.cacheIndicator}>
            <ActivityIndicator size="small" color="#0D5C3A" />
            <Text style={styles.cacheText}>Updating locker...</Text>
          </View>
        )}

        {/* ── S1–S5: Fixed door panel ── */}
        <View style={styles.doorPanel}>

          {/* S1: Honor Plaque */}
          <HonorPlaque
            name={profile?.displayName ?? "Player"}
            hci={profile?.handicap ?? "N/A"}
          />
          <View style={styles.plaqueSeparator} />

          {/* S2: Rivals */}
          <SectionBanner label="RIVALS" />
          {currentUserId && <LockerRivals userId={currentUserId} />}

          {/* S3: Stats Row */}
          <StatsRow
            stats={{
              totalBirdies:    profile?.totalBirdies,
              totalEagles:     profile?.totalEagles,
              totalAlbatross:  profile?.totalAlbatross,
              totalHoleInOnes: profile?.totalHoleInOnes,
            }}
            onPress={() => router.push(`/locker/stats-tracker?userId=${currentUserId}` as any)}
          />

          {/* S5: Achievements — always shown */}
          <SectionBanner label="ACHIEVEMENTS" />
          {badges.length > 0 ? (
            <View style={styles.achievementsScroll}>
              {badges.map((badge, i) => {
                const parsed   = parseBadge(badge);
                const rotation = seededAchievementRotation(parsed.type + i);
                return (
                  <AchievementNotecard
                    key={i}
                    badge={{
                      icon:     parsed.icon,
                      name:     parsed.label,
                      location: parsed.courseName ?? undefined,
                      year:     parsed.date
                        ? String(new Date(parsed.date.toDate?.() ?? parsed.date).getFullYear()).slice(2)
                        : undefined,
                      type: parsed.type,
                    }}
                    rotation={rotation}
                    pinColor={["green", "blue", "red", "gold"][i % 4] as any}
                  />
                );
              })}
            </View>
          ) : (
            <View style={styles.achievementsScroll}>
              <AchievementNotecard
                badge={{
                  emoji: "🏆",
                  name: "No badges yet",
                  location: "Win a round to earn one",
                }}
                rotation={0}
                pinColor="gold"
              />
            </View>
          )}

          {/* S4: Rail Divider */}
          <LockerRailDivider course={homeCourse} quote={gameIdentity} />
        </View>

        {/* ── S6: My Clubs — scrollable ── */}
        <View style={styles.clubsPanel}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.clubsScroll}
          >
            <LockerClubsDisplay clubs={clubs} isOwnLocker={true} />
          </ScrollView>
        </View>

      </ImageBackground>

      <BottomActionBar />
      <SwingFooter />
    </View>
  );
}

/* ========================= STYLES ========================= */

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: "#3D1F0A" },
  navWrapper:       { backgroundColor: "#0D5C3A" },

  contentArea: {
    flex: 1,
  },

  cacheIndicator: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 8,
    backgroundColor: "rgba(255,243,205,0.95)",
    borderBottomWidth: 1, borderBottomColor: "rgba(255,236,181,0.95)",
  },
  cacheText: { fontSize: 12, color: "#664D03", fontWeight: "600" },

  doorPanel: {
    width: "100%",
  },

  plaqueSeparator: {
    height: 0,
  },

  achievementsScroll: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "flex-start",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 17,
  },

  clubsPanel: {
    flex: 1,
    width: "100%",
  },
  clubsScroll: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 20,
  },
});







