import BottomActionBar from "@/components/navigation/BottomActionBar";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";

import { auth, db } from "@/constants/firebaseConfig";
import {
  arePartnersAlready,
  checkExistingRequest,
  sendPartnerRequest,
} from "@/utils/partnerUtils";

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
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
import { SafeAreaView } from "react-native-safe-area-context";

export default function LockerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const currentUserId = auth.currentUser?.uid;

  const viewingUserId = (params.id as string) || currentUserId;
  const isOwnLocker = viewingUserId === currentUserId;

  const [profile, setProfile] = useState<any>(null);
  const [clubs, setClubs] = useState<any>(null);
  const [badges, setBadges] = useState<any[]>([]);
  const [partnershipStatus, setPartnershipStatus] =
    useState<"none" | "pending" | "partners">("none");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  /* ========================= LOAD USER ========================= */

  useFocusEffect(
    useCallback(() => {
      if (!viewingUserId) return;

      const userRef = doc(db, "users", viewingUserId);

      const unsubscribe = onSnapshot(
        userRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setProfile(data);
            setClubs(data.clubs || {});
            setBadges(data.Badges || []);
          }
          setLoading(false);
        },
        () => setLoading(false)
      );

      if (!isOwnLocker && currentUserId) {
        checkPartnershipStatus();
      }

      return () => unsubscribe();
    }, [viewingUserId, currentUserId, isOwnLocker])
  );

  const checkPartnershipStatus = async () => {
    if (!currentUserId || !viewingUserId) return;

    if (await arePartnersAlready(currentUserId, viewingUserId)) {
      setPartnershipStatus("partners");
      return;
    }

    if (await checkExistingRequest(currentUserId, viewingUserId)) {
      setPartnershipStatus("pending");
      return;
    }

    setPartnershipStatus("none");
  };

  /* ========================= ACTIONS ========================= */

  const handlePartnerUp = async () => {
    if (!currentUserId || !viewingUserId) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionLoading(true);

    try {
      await sendPartnerRequest(viewingUserId);
      setPartnershipStatus("pending");
      Alert.alert("Request Sent", "Your partner request is pending.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFanmail = () => {
    if (partnershipStatus !== "partners") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "Fanmail Locked",
        `Notes in the locker aren’t available until ${profile?.displayName} accepts your Partner invitation.`
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/messages/${viewingUserId}`);
  };

  /* ========================= UI ========================= */

  if (loading) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={["top"]} style={styles.safeTop} />
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      <ImageBackground
        source={require("@/assets/locker/locker-bg.png")}
        resizeMode="cover"
        style={styles.background}
      >
        <TopNavBar />

        <ScrollView
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* PROFILE */}
          <View style={styles.profileSection}>
            <Text style={styles.name}>{profile?.displayName ?? "Player"}</Text>
            <Text style={styles.handicap}>
              Handicap: {profile?.handicap ?? "N/A"}
            </Text>

            {/* ACTION BUTTONS */}
            {!isOwnLocker && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  disabled={partnershipStatus !== "none" || actionLoading}
                  onPress={handlePartnerUp}
                  style={[
                    styles.actionButton,
                    partnershipStatus === "pending" && styles.pendingButton,
                    partnershipStatus === "partners" && styles.disabledButton,
                  ]}
                >
                  <Ionicons
                    name={
                      partnershipStatus === "pending"
                        ? "time-outline"
                        : "people"
                    }
                    size={18}
                    color="#fff"
                  />
                  <Text style={styles.actionText}>
                    {partnershipStatus === "none"
                      ? "Partner Up"
                      : partnershipStatus === "pending"
                      ? "Pending"
                      : "Partners"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleFanmail}
                  style={[
                    styles.actionButton,
                    partnershipStatus !== "partners" && styles.fanmailLocked,
                  ]}
                >
                  <Ionicons name="mail" size={18} color="#fff" />
                  <Text style={styles.actionText}>Fanmail</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* BADGES */}
            <View style={styles.badgesWrapper}>
              <Text style={styles.sectionTitle}>Achievements</Text>

              {badges.length === 0 ? (
                <Text style={styles.noBadges}>No badges earned yet</Text>
              ) : (
                <View style={styles.badgesRow}>
                  {badges.slice(0, 3).map((badge, i) => (
                    <View key={i} style={styles.badge}>
                      <Ionicons name="trophy" size={16} color="#FFD700" />
                      <Text style={styles.badgeText}>
                        {typeof badge === "string" ? badge : badge.label}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* CLUBS */}
          <View style={styles.clubsSection}>
            <Text style={styles.sectionTitle}>
              {isOwnLocker ? "My Clubs" : "Their Clubs"}
            </Text>

            {["driver", "irons", "wedges", "putter", "ball"].map((type) => {
              const val = clubs?.[type];
              return (
                <View key={type} style={styles.clubCard}>
                  <Text style={styles.clubLabel}>{type.toUpperCase()}</Text>
                  <Text style={styles.clubValue}>
                    {val || "Not added"}
                  </Text>
                </View>
              );
            })}
          </View>
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

  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 120,
    gap: 28,
  },

  profileSection: { alignItems: "center" },

  name: {
    fontSize: 32,
    fontWeight: "800",
    color: "white",
    marginBottom: 6,
  },

  handicap: {
    fontSize: 18,
    fontWeight: "600",
    color: "rgba(255,255,255,0.95)",
    marginBottom: 18,
  },

  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },

  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
  },

  pendingButton: { backgroundColor: "#888" },
  disabledButton: { backgroundColor: "#555" },
  fanmailLocked: { backgroundColor: "#999" },

  actionText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  badgesWrapper: { width: "100%", alignItems: "center" },

  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "white",
    marginBottom: 14,
  },

  badgesRow: { flexDirection: "row", gap: 12 },

  badge: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },

  badgeText: { color: "white", fontWeight: "700" },

  noBadges: {
    color: "rgba(255,255,255,0.6)",
    fontStyle: "italic",
  },

  clubsSection: { width: "100%" },

  clubCard: {
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  clubLabel: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "900",
    color: "rgba(255,255,255,0.9)",
    letterSpacing: 1.5,
    marginBottom: 4,
  },

  clubValue: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: "white",
  },
});













