import BottomActionBar from "@/components/navigation/BottomActionBar";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
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
import { SafeAreaView } from "react-native-safe-area-context";

export default function LockerScreen() {
  const router = useRouter();
  const currentUserId = auth.currentUser?.uid;

  const [profile, setProfile] = useState<any>(null);
  const [clubs, setClubs] = useState<any>(null);
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  /* ========================= LOAD USER ========================= */

  useFocusEffect(
    useCallback(() => {
      if (!currentUserId) return;

      const userRef = doc(db, "users", currentUserId);

      const unsubscribe = onSnapshot(
        userRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setProfile(data);
            setClubs(data.clubs || {});
            
            // Parse badges from Firestore structure
            const badgesData = data.Badges || [];
            console.log("Raw badges data:", badgesData);
            
            // Filter out empty/invalid badges
            const validBadges = badgesData.filter((badge: any) => {
              if (!badge) return false;
              if (typeof badge === "string" && badge.trim() === "") return false;
              return true;
            });
            
            setBadges(validBadges);
          }
          setLoading(false);
        },
        () => setLoading(false)
      );

      return () => unsubscribe();
    }, [currentUserId])
  );

  /* ========================= HELPERS ========================= */

  const formatBadgeDate = (timestamp: any) => {
    if (!timestamp) return "";
    
    try {
      // Handle Firestore Timestamp
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString("en-US", { 
        month: "short", 
        day: "numeric", 
        year: "numeric" 
      });
    } catch {
      return "";
    }
  };

  const parseBadge = (badge: any) => {
    // Handle different badge structures
    
    // If it's a string, return basic structure
    if (typeof badge === "string") {
      return { label: badge, courseName: null, date: null };
    }

    // Check if badge has a nested structure (like lowman)
    const badgeKeys = Object.keys(badge || {});
    const nestedBadgeKey = badgeKeys.find(key => 
      badge[key] && typeof badge[key] === 'object' && badge[key].displayName
    );

    if (nestedBadgeKey) {
      // Badge type is the key (e.g., "lowman")
      const badgeData = badge[nestedBadgeKey];
      return {
        label: nestedBadgeKey.charAt(0).toUpperCase() + nestedBadgeKey.slice(1),
        courseName: badge.courseName || null,
        date: badgeData.achievedAt || null,
      };
    }

    // Standard structure
    return {
      label: badge.displayName || badge.label || "Achievement",
      courseName: badge.courseName || null,
      date: badge.achievedAt || null,
    };
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

            {/* HOME COURSE & GAME IDENTITY */}
            {(profile?.homeCourse || profile?.gameIdentity) && (
              <View style={styles.identityContainer}>
                {profile?.homeCourse && (
                  <View style={styles.identityRow}>
                    <Ionicons name="flag" size={16} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.identityText}>{profile.homeCourse}</Text>
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

            {/* BADGES */}
            <View style={styles.badgesWrapper}>
              <Text style={styles.sectionTitle}>Achievements</Text>

              {badges.length === 0 ? (
                <Text style={styles.noBadges}>No badges earned yet</Text>
              ) : (
                <View style={styles.badgesRow}>
                  {badges.slice(0, 3).map((badge, i) => {
                    const parsed = parseBadge(badge);
                    
                    return (
                      <View key={i} style={styles.badge}>
                        <View style={styles.badgeHeader}>
                          <Ionicons name="trophy" size={16} color="#FFD700" />
                          <Text style={styles.badgeText}>{parsed.label}</Text>
                        </View>
                        {(parsed.courseName || parsed.date) && (
                          <View style={styles.badgeDetails}>
                            {parsed.courseName && (
                              <Text style={styles.badgeDetailText}>{parsed.courseName}</Text>
                            )}
                            {parsed.date && (
                              <Text style={styles.badgeDetailText}>
                                {formatBadgeDate(parsed.date)}
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>

          {/* CLUBS */}
          <View style={styles.clubsSection}>
            <Text style={styles.sectionTitle}>My Clubs</Text>

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
    marginBottom: 12,
  },

  identityContainer: {
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 18,
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

  badgesWrapper: { width: "100%", alignItems: "center" },

  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "white",
    marginBottom: 14,
  },

  badgesRow: { 
    flexDirection: "row", 
    gap: 12,
    flexWrap: "wrap",
    justifyContent: "center",
  },

  badge: {
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    minWidth: 100,
  },

  badgeHeader: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginBottom: 4,
  },

  badgeText: { 
    color: "white", 
    fontWeight: "700",
    fontSize: 14,
  },

  badgeDetails: {
    marginTop: 4,
    gap: 2,
  },

  badgeDetailText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "500",
  },

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












