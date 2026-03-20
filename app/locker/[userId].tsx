import AchievementNotecard, { seededAchievementRotation } from "@/components/locker/AchievementNotecard";
import HonorPlaque from "@/components/locker/HonorPlaque";
import LockerClubsDisplay from "@/components/locker/LockerClubsDisplay";
import LockerRailDivider from "@/components/locker/LockerRailDivider";
import LockerRivals from "@/components/locker/LockerRivals";
import SectionBanner from "@/components/locker/SectionBanner";
import BottomActionBar from "@/components/navigation/BottomActionBar";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import {
  acceptPartnerRequest,
  arePartnersAlready,
  checkExistingRequest,
  sendPartnerRequest,
} from "@/utils/partnerUtils";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const LowLeaderTrophy  = require("@/assets/icons/LowLeaderTrophy.png");
const LowLeaderScratch = require("@/assets/icons/LowLeaderScratch.png");
const LowLeaderAce     = require("@/assets/icons/LowLeaderAce.png");
const HoleInOne        = require("@/assets/icons/HoleinOne.png");
const LockerBg         = require("@/assets/locker/locker-bg.png");

export default function LockerUserScreen() {
  const router   = useRouter();
  const params   = useLocalSearchParams();
  const insets   = useSafeAreaInsets();
  const { getCache, setCache, cleanupOldProfiles } = useCache();

  const currentUserId = auth.currentUser?.uid;
  const viewingUserId = params.userId as string;
  const isOwnLocker   = viewingUserId === currentUserId;

  const [profile,           setProfile]           = useState<any>(null);
  const [clubs,             setClubs]             = useState<any>(null);
  const [badges,            setBadges]            = useState<any[]>([]);
  const [partnershipStatus, setPartnershipStatus] =
    useState<"none" | "pending_sent" | "pending_received" | "partners">("none");
  const [showingCached, setShowingCached] = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  /* ========================= LOAD ========================= */

  useFocusEffect(
    useCallback(() => {
      if (!viewingUserId) return;
      let unsubscribe: (() => void) | undefined;

      const load = async () => {
        try {
          const cached = await getCache(CACHE_KEYS.USER_PROFILE(viewingUserId));
          if (cached) {
            setProfile(cached.profile);
            setClubs(cached.clubs);
            setBadges(cached.badges || []);
            if (cached.partnershipStatus) setPartnershipStatus(cached.partnershipStatus);
            setShowingCached(true);
          }

          const userRef = doc(db, "users", viewingUserId);
          unsubscribe = onSnapshot(userRef, async (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              const badgesData    = data.Badges || [];
              const validBadges   = badgesData.filter((b: any) => b && !(typeof b === "string" && !b.trim()));
              const displayBadges = data.displayBadges || validBadges.slice(0, 3);

              setProfile(data);
              setClubs(data.clubs || {});
              setBadges(displayBadges);

              let ps = partnershipStatus;
              if (!isOwnLocker && currentUserId) ps = await checkPartnershipStatus();

              await setCache(CACHE_KEYS.USER_PROFILE(viewingUserId), {
                profile: data, clubs: data.clubs || {}, badges: displayBadges, partnershipStatus: ps,
              });
              setShowingCached(false);
            }
          }, (err) => {
            console.error("Error loading user:", err);
            soundPlayer.play("error");
            setShowingCached(false);
          });

          if (Math.random() < 0.1) cleanupOldProfiles();
        } catch (e) {
          console.error("❌ Locker cache error:", e);
        }
      };

      load();
      return () => { if (unsubscribe) unsubscribe(); };
    }, [viewingUserId, currentUserId, isOwnLocker])
  );

  /* ========================= REFRESH ========================= */

  const onRefresh = useCallback(async () => {
    if (!viewingUserId) return;
    setRefreshing(true);
    setShowingCached(false);
    try {
      const snap = await getDoc(doc(db, "users", viewingUserId));
      if (snap.exists()) {
        const data = snap.data();
        const validBadges   = (data.Badges || []).filter((b: any) => b && !(typeof b === "string" && !b.trim()));
        const displayBadges = data.displayBadges || validBadges.slice(0, 3);
        setProfile(data);
        setClubs(data.clubs || {});
        setBadges(displayBadges);
        let ps = partnershipStatus;
        if (!isOwnLocker && currentUserId) ps = await checkPartnershipStatus();
        await setCache(CACHE_KEYS.USER_PROFILE(viewingUserId), {
          profile: data, clubs: data.clubs || {}, badges: displayBadges, partnershipStatus: ps,
        });
      }
    } catch (e) {
      soundPlayer.play("error");
    }
    setRefreshing(false);
  }, [viewingUserId, currentUserId, isOwnLocker]);

  /* ========================= PARTNERSHIP ========================= */

  const checkPartnershipStatus = async () => {
    if (!currentUserId || !viewingUserId) return "none";
    try {
      if (await arePartnersAlready(currentUserId, viewingUserId)) {
        setPartnershipStatus("partners"); return "partners";
      }
      const req = await checkExistingRequest(currentUserId, viewingUserId);
      if (req.exists) {
        if (req.sentByMe)   { setPartnershipStatus("pending_sent");     return "pending_sent"; }
        if (req.sentToMe)   { setPartnershipStatus("pending_received"); return "pending_received"; }
      }
      setPartnershipStatus("none"); return "none";
    } catch {
      setPartnershipStatus("none"); return "none";
    }
  };

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

  /* ========================= ACTIONS ========================= */

  const handlePartnerUp = async () => {
    if (!currentUserId || !viewingUserId) return;
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionLoading(true);
    try {
      if (partnershipStatus === "pending_received") {
        await acceptPartnerRequest(currentUserId, viewingUserId);
        soundPlayer.play("postThought");
        setPartnershipStatus("partners");
        Alert.alert("Partners! 🤝", "You're now partners!");
      } else {
        await sendPartnerRequest(currentUserId, viewingUserId);
        soundPlayer.play("postThought");
        setPartnershipStatus("pending_sent");
        Alert.alert("Request Sent", "Your partner request is pending.");
      }
      const cached = await getCache(CACHE_KEYS.USER_PROFILE(viewingUserId));
      if (cached) await setCache(CACHE_KEYS.USER_PROFILE(viewingUserId), { ...cached, partnershipStatus });
    } catch (e: any) {
      soundPlayer.play("error");
      Alert.alert("Error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleLockerNote = () => {
    if (partnershipStatus !== "partners") {
      soundPlayer.play("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("Locker Note Locked", `Notes aren't available until ${profile?.displayName} accepts your Partner invitation.`);
      return;
    }
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/messages/${[currentUserId, viewingUserId].sort().join("_")}`);
  };

  /* ========================= DERIVED ========================= */

  const homeCourse   = profile?.homeCourse?.courseName
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

        <View style={styles.doorPanel}>

          {/* S1: Honor Plaque — name + stats row */}
          <HonorPlaque
            name={profile?.displayName ?? "Player"}
            stats={{
              totalBirdies:    profile?.totalBirdies,
              totalEagles:     profile?.totalEagles,
              totalAlbatross:  profile?.totalAlbatross,
              totalHoleInOnes: profile?.totalHoleInOnes,
            }}
            onStatsPress={() => router.push(`/locker/stats-tracker?userId=${viewingUserId}` as any)}
          />
          <View style={styles.plaqueSeparator} />

          {/* S2: Rivals */}
          {!isOwnLocker ? (
            <View style={styles.rivalsHeader}>
              {/* Partner Up — under left vent */}
              <TouchableOpacity
                disabled={partnershipStatus === "pending_sent" || partnershipStatus === "partners" || actionLoading}
                onPress={handlePartnerUp}
                style={[
                  styles.ventButton,
                  styles.ventButtonLeft,
                  partnershipStatus === "pending_sent"     && styles.pendingButton,
                  partnershipStatus === "pending_received" && styles.acceptButton,
                  partnershipStatus === "partners"         && styles.disabledButton,
                ]}
              >
                <Ionicons
                  name={partnershipStatus === "pending_sent" ? "time-outline" : partnershipStatus === "pending_received" ? "checkmark-circle-outline" : "people"}
                  size={14} color="#fff"
                />
                <Text style={styles.ventButtonText}>
                  {partnershipStatus === "none" ? "Partner Up" : partnershipStatus === "pending_sent" ? "Pending" : partnershipStatus === "pending_received" ? "Accept" : "Partners"}
                </Text>
              </TouchableOpacity>

              {/* RIVALS badge — centered */}
              <View style={styles.rivalsBadge}>
                <Text style={styles.rivalsBadgeText}>RIVALS</Text>
              </View>

              {/* Note — under right vent */}
              <TouchableOpacity
                onPress={handleLockerNote}
                style={[
                  styles.ventButton,
                  styles.ventButtonRight,
                  partnershipStatus !== "partners" && styles.lockerNoteLocked,
                ]}
              >
                <Ionicons name="mail" size={14} color="#fff" />
                <Text style={styles.ventButtonText}>Note</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <SectionBanner label="RIVALS" />
          )}
          <LockerRivals userId={viewingUserId} />

          {/* S3: Achievements */}
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
                  icon: undefined,
                  emoji: "🏆",
                  name: "No badges yet",
                  location: "Win a round to earn one",
                }}
                rotation={0}
                pinColor="gold"
              />
            </View>
          )}

          {/* S4: Rail Divider — HCI + course + quote */}
          <LockerRailDivider
            hci={profile?.handicap ?? "N/A"}
            course={homeCourse}
            quote={gameIdentity}
          />
        </View>

        <View style={styles.clubsPanel}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.clubsScroll}
          >
            <LockerClubsDisplay clubs={clubs} isOwnLocker={isOwnLocker} />
          </ScrollView>
        </View>

      </ImageBackground>

      <BottomActionBar isViewingOtherUser={!isOwnLocker} viewingUserId={viewingUserId} />
      <SwingFooter />
    </View>
  );
}

/* ========================= STYLES ========================= */

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: "#1a0f06" },
  navWrapper:       { backgroundColor: "#0D5C3A" },

  contentArea: { flex: 1 },

  cacheIndicator: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 8,
    backgroundColor: "rgba(255,243,205,0.95)",
    borderBottomWidth: 1, borderBottomColor: "rgba(255,236,181,0.95)",
  },
  cacheText: { fontSize: 12, color: "#664D03", fontWeight: "600" },

  doorPanel:        { width: "100%", position: "relative" },
  plaqueSeparator:  { height: 4 },

  achievementsScroll: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "flex-start",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 17,
  },

  rivalsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginHorizontal: 16,
  },

  // Vent buttons — absolutely positioned under each vent
  ventButton: {
    position: "absolute",
    top: -120,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#0D5C3A",
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 10,
  },
  ventButtonLeft: {
    left: -14,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  ventButtonRight: {
    right: -14,
  },
  ventButtonText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  rivalsBadge: {
    backgroundColor: "#3A2010",
    borderWidth: 1,
    borderColor: "#C5A55A",
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 3,
  },
  rivalsBadgeText: {
    fontFamily: "Georgia",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.5,
    color: "#C5A55A",
  },
  pendingButton:    { backgroundColor: "#888" },
  acceptButton:     { backgroundColor: "#C5A55A" },
  disabledButton:   { backgroundColor: "#555" },
  lockerNoteLocked: { backgroundColor: "#888" },

  clubsPanel: { flex: 1, width: "100%" },
  clubsScroll: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 20,
  },
});