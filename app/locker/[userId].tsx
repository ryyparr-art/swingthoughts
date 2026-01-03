import BottomActionBar from "@/components/navigation/BottomActionBar";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";

import {
  acceptPartnerRequest,
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
  Image,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ✅ Badge icon imports (matching LowmanCarousel)
const LowLeaderTrophy = require("@/assets/icons/LowLeaderTrophy.png");
const LowLeaderScratch = require("@/assets/icons/LowLeaderScratch.png");
const LowLeaderAce = require("@/assets/icons/LowLeaderAce.png");
const HoleInOne = require("@/assets/icons/HoleinOne.png");

export default function LockerUserScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const currentUserId = auth.currentUser?.uid;
  const viewingUserId = params.userId as string;
  const isOwnLocker = viewingUserId === currentUserId;

  const [profile, setProfile] = useState<any>(null);
  const [clubs, setClubs] = useState<any>(null);
  const [badges, setBadges] = useState<any[]>([]);
  const [partnershipStatus, setPartnershipStatus] =
    useState<"none" | "pending_sent" | "pending_received" | "partners">("none");
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
            
            // Parse badges from Firestore structure
            const badgesData = data.Badges || [];
            console.log("Raw badges data:", badgesData);
            
            // Filter out empty/invalid badges
            const validBadges = badgesData.filter((badge: any) => {
              if (!badge) return false;
              if (typeof badge === "string" && badge.trim() === "") return false;
              return true;
            });
            
            // ✅ Use displayBadges if available, otherwise fallback to first 3
            const displayBadges = data.displayBadges || validBadges.slice(0, 3);
            setBadges(displayBadges);
          }
          setLoading(false);
        },
        (error) => {
          console.error("Error loading user:", error);
          soundPlayer.play('error');
          setLoading(false);
        }
      );

      if (!isOwnLocker && currentUserId) {
        checkPartnershipStatus();
      }

      return () => unsubscribe();
    }, [viewingUserId, currentUserId, isOwnLocker])
  );

  const checkPartnershipStatus = async () => {
    if (!currentUserId || !viewingUserId) return;

    try {
      if (await arePartnersAlready(currentUserId, viewingUserId)) {
        setPartnershipStatus("partners");
        return;
      }

      const existingRequest = await checkExistingRequest(currentUserId, viewingUserId);
      if (existingRequest.exists) {
        if (existingRequest.sentByMe) {
          setPartnershipStatus("pending_sent");
        } else if (existingRequest.sentToMe) {
          setPartnershipStatus("pending_received");
        }
        return;
      }

      setPartnershipStatus("none");
    } catch (error) {
      console.log("⚠️ Error checking partnership status (likely permissions):", error);
      // Default to "none" if we can't check
      setPartnershipStatus("none");
    }
  };

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
    console.log("🔍 Parsing badge:", JSON.stringify(badge, null, 2));
    
    // Handle string badges (legacy)
    if (typeof badge === "string") {
      return { 
        label: badge, 
        courseName: null, 
        date: null,
        icon: LowLeaderTrophy,
        type: "lowman"
      };
    }

    // ✅ Handle flat structure with direct "type" field (MOST COMMON)
    if (badge.type) {
      const badgeType = badge.type.toLowerCase();
      
      console.log(`  ✅ Badge type (flat): ${badgeType}`);
      
      // Map badge type to custom icon
      let icon = LowLeaderTrophy; // Default
      
      switch (badgeType) {
        case "lowman":
          icon = LowLeaderTrophy;
          break;
        case "scratch":
          icon = LowLeaderScratch;
          break;
        case "ace":
          icon = LowLeaderAce;
          break;
        case "holeinone":
          icon = HoleInOne;
          break;
        default:
          console.warn(`⚠️ Unknown badge type: ${badgeType}`);
      }
      
      return {
        label: badge.displayName || (badgeType.charAt(0).toUpperCase() + badgeType.slice(1)),
        courseName: badge.courseName || null,
        date: badge.achievedAt || null,
        icon: icon,
        type: badgeType
      };
    }

    // ✅ FALLBACK: Handle nested structure (if it exists)
    const badgeKeys = Object.keys(badge || {}).filter(key => key !== 'courseName');
    const badgeTypeKey = badgeKeys.find(key => 
      badge[key] && typeof badge[key] === 'object' && badge[key].displayName
    );

    if (badgeTypeKey) {
      const badgeData = badge[badgeTypeKey];
      const badgeType = badgeTypeKey.toLowerCase();
      
      console.log(`  ✅ Badge type (nested): ${badgeType}`);
      
      let icon = LowLeaderTrophy;
      
      switch (badgeType) {
        case "lowman":
          icon = LowLeaderTrophy;
          break;
        case "scratch":
          icon = LowLeaderScratch;
          break;
        case "ace":
          icon = LowLeaderAce;
          break;
        case "holeinone":
          icon = HoleInOne;
          break;
        default:
          console.warn(`⚠️ Unknown badge type: ${badgeType}`);
      }
      
      return {
        label: badgeData.displayName || (badgeTypeKey.charAt(0).toUpperCase() + badgeTypeKey.slice(1)),
        courseName: badge.courseName || null,
        date: badgeData.achievedAt || null,
        icon: icon,
        type: badgeType
      };
    }

    // Default fallback
    console.warn("⚠️ No valid badge type found in:", badge);
    return {
      label: badge.displayName || "Achievement",
      courseName: badge.courseName || null,
      date: badge.achievedAt || null,
      icon: LowLeaderTrophy,
      type: "lowman"
    };
  };

  /* ========================= ACTIONS ========================= */

  const handlePartnerUp = async () => {
    if (!currentUserId || !viewingUserId) return;

    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionLoading(true);

    try {
      if (partnershipStatus === "pending_received") {
        // Accept the incoming request
        await acceptPartnerRequest(currentUserId, viewingUserId);
        soundPlayer.play('postThought');
        setPartnershipStatus("partners");
        Alert.alert("Partners! 🤝", "You're now partners!");
      } else {
        // Send a new request
        await sendPartnerRequest(currentUserId, viewingUserId);
        soundPlayer.play('postThought');
        setPartnershipStatus("pending_sent");
        Alert.alert("Request Sent", "Your partner request is pending.");
      }
    } catch (e: any) {
      soundPlayer.play('error');
      Alert.alert("Error", e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleLockerNote = () => {
    if (partnershipStatus !== "partners") {
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "Locker Note Locked",
        `Notes in the locker aren't available until ${profile?.displayName} accepts your Partner invitation.`
      );
      return;
    }

    soundPlayer.play('click');
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

            {/* ACTION BUTTONS */}
            {!isOwnLocker && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  disabled={partnershipStatus === "pending_sent" || partnershipStatus === "partners" || actionLoading}
                  onPress={handlePartnerUp}
                  style={[
                    styles.actionButton,
                    partnershipStatus === "pending_sent" && styles.pendingButton,
                    partnershipStatus === "pending_received" && styles.acceptButton,
                    partnershipStatus === "partners" && styles.disabledButton,
                  ]}
                >
                  <Ionicons
                    name={
                      partnershipStatus === "pending_sent"
                        ? "time-outline"
                        : partnershipStatus === "pending_received"
                        ? "checkmark-circle-outline"
                        : "people"
                    }
                    size={18}
                    color="#fff"
                  />
                  <Text style={styles.actionText}>
                    {partnershipStatus === "none"
                      ? "Partner Up"
                      : partnershipStatus === "pending_sent"
                      ? "Pending"
                      : partnershipStatus === "pending_received"
                      ? "Accept"
                      : "Partners"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleLockerNote}
                  style={[
                    styles.actionButton,
                    partnershipStatus !== "partners" && styles.lockerNoteLocked,
                  ]}
                >
                  <Ionicons name="mail" size={18} color="#fff" />
                  <Text style={styles.actionText}>Locker Note</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* BADGES - 2 COLUMN LAYOUT */}
            <View style={styles.badgesWrapper}>
              <Text style={styles.sectionTitle}>Achievements</Text>

              {badges.length === 0 ? (
                <Text style={styles.noBadges}>No badges earned yet</Text>
              ) : (
                <View style={styles.badgesContainer}>
                  {/* First Row - 2 badges */}
                  <View style={styles.badgesRow}>
                    {badges.slice(0, 2).map((badge, i) => {
                      const parsed = parseBadge(badge);
                      
                      return (
                        <View key={i} style={styles.badge}>
                          {/* ✅ Custom badge icon at top */}
                          <Image source={parsed.icon} style={styles.badgeIcon} />
                          
                          <Text style={styles.badgeText}>{parsed.label}</Text>
                          
                          {(parsed.courseName || parsed.date) && (
                            <View style={styles.badgeDetails}>
                              {parsed.courseName && (
                                <Text style={styles.badgeDetailText} numberOfLines={1}>
                                  {parsed.courseName}
                                </Text>
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

                  {/* Second Row - 1 badge centered */}
                  {badges.length > 2 && (
                    <View style={styles.badgesRowSingle}>
                      {(() => {
                        const parsed = parseBadge(badges[2]);
                        
                        return (
                          <View style={styles.badge}>
                            {/* ✅ Custom badge icon at top */}
                            <Image source={parsed.icon} style={styles.badgeIcon} />
                            
                            <Text style={styles.badgeText}>{parsed.label}</Text>
                            
                            {(parsed.courseName || parsed.date) && (
                              <View style={styles.badgeDetails}>
                                {parsed.courseName && (
                                  <Text style={styles.badgeDetailText} numberOfLines={1}>
                                    {parsed.courseName}
                                  </Text>
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
                      })()}
                    </View>
                  )}
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

        <BottomActionBar 
          isViewingOtherUser={!isOwnLocker} 
          viewingUserId={viewingUserId}
        />
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
  acceptButton: { backgroundColor: "#FFD700" },
  disabledButton: { backgroundColor: "#555" },
  lockerNoteLocked: { backgroundColor: "#999" },

  actionText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  badgesWrapper: { 
    width: "100%", 
    alignItems: "center",
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "white",
    marginBottom: 14,
  },

  // ✅ Container for all badges
  badgesContainer: {
    width: "100%",
    gap: 12,
  },

  // ✅ First row - 2 badges side by side
  badgesRow: { 
    flexDirection: "row", 
    gap: 12,
    justifyContent: "center",
  },

  // ✅ Second row - 1 badge centered
  badgesRowSingle: {
    flexDirection: "row",
    justifyContent: "center",
  },

  badge: {
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    minWidth: 140,
    maxWidth: 160,
    alignItems: "center",
  },

  // ✅ Custom badge icon at top
  badgeIcon: {
    width: 40,
    height: 40,
    resizeMode: "contain",
    marginBottom: 8,
  },

  badgeText: { 
    color: "white", 
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 4,
  },

  badgeDetails: {
    width: "100%",
    gap: 2,
  },

  badgeDetailText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
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