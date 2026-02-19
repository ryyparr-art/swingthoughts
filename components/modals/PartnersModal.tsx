/**
 * PartnersModal — Partners & Courses modal with Foursome and Favorites
 *
 * New features:
 *   - "My Foursome" numbered badge (①②③) on partner avatar — max 3
 *   - "Usual Suspects" gold ribbon on favorited partners
 *   - Both persist to user doc: foursomePartners[], favoritedPartners[]
 *
 * File: components/modals/PartnersModal.tsx
 */

import { db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BadgeRow from "@/components/challenges/BadgeRow";

// ============================================================================
// TYPES
// ============================================================================

interface Partner {
  userId: string;
  displayName: string;
  avatar?: string;
  handicap: number;
  partnerId: string;
  earnedChallengeBadges?: string[];
}

interface Course {
  courseId: number;
  courseName: string;
  location?: {
    city: string;
    state: string;
  };
}

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string;
  isOwnProfile: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GREEN = "#0D5C3A";
const CREAM = "#F4EED8";
const GOLD = "#C5A55A";
const MAX_FOURSOME = 3;

// ============================================================================
// COMPONENT
// ============================================================================

export default function PartnersModal({
  visible,
  onClose,
  userId,
  isOwnProfile,
}: Props) {
  const router = useRouter();

  const [displayName, setDisplayName] = useState<string>("");
  const [partners, setPartners] = useState<Partner[]>([]);
  const [playerCourses, setPlayerCourses] = useState<Course[]>([]);
  const [memberCourses, setMemberCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Foursome & favorites
  const [foursomePartners, setFoursomePartners] = useState<string[]>([]);
  const [favoritedPartners, setFavoritedPartners] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      loadAllData();
    }
  }, [visible, userId]);

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([
      loadUserData(),
      loadPartners(),
      loadPlayerCourses(),
      loadMemberCourses(),
    ]);
    setLoading(false);
  };

  const refreshData = async () => {
    setRefreshing(true);
    await Promise.all([
      loadUserData(),
      loadPartners(),
      loadPlayerCourses(),
      loadMemberCourses(),
    ]);
    setRefreshing(false);
  };

  /* ========================= LOAD USER DATA ========================= */
  const loadUserData = async () => {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setDisplayName(data.displayName || "User");
        setFoursomePartners(data.foursomePartners || []);
        setFavoritedPartners(data.favoritedPartners || []);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
      setDisplayName("User");
    }
  };

  /* ========================= LOAD PARTNERS ========================= */
  const loadPartners = async () => {
    try {
      const partnersQuery1 = query(
        collection(db, "partners"),
        where("user1Id", "==", userId)
      );
      const partnersQuery2 = query(
        collection(db, "partners"),
        where("user2Id", "==", userId)
      );

      const [snap1, snap2] = await Promise.all([
        getDocs(partnersQuery1),
        getDocs(partnersQuery2),
      ]);

      const partnerUserIds: { userId: string; partnerId: string }[] = [];

      snap1.forEach((d) => {
        partnerUserIds.push({ userId: d.data().user2Id, partnerId: d.id });
      });
      snap2.forEach((d) => {
        partnerUserIds.push({ userId: d.data().user1Id, partnerId: d.id });
      });

      const partnerProfiles: Partner[] = [];

      for (const { userId: puid, partnerId } of partnerUserIds) {
        const userDoc = await getDoc(doc(db, "users", puid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          partnerProfiles.push({
            userId: puid,
            displayName: data.displayName || "Unknown",
            avatar: data.avatar,
            handicap: data.handicap || 0,
            partnerId,
            earnedChallengeBadges: data.earnedChallengeBadges || [],
          });
        }
      }

      setPartners(partnerProfiles);
    } catch (error) {
      console.error("Error loading partners:", error);
      setPartners([]);
    }
  };

  /* ========================= LOAD COURSES ========================= */
  const loadPlayerCourses = async () => {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) { setPlayerCourses([]); return; }

      const ids = userDoc.data().playerCourses || [];
      if (ids.length === 0) { setPlayerCourses([]); return; }

      const courses: Course[] = [];
      for (const courseId of ids) {
        const q = query(collection(db, "courses"), where("id", "==", courseId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0].data();
          courses.push({
            courseId,
            courseName: d.courseName || d.course_name || "Course",
            location: d.location,
          });
        }
      }
      setPlayerCourses(courses);
    } catch (error) {
      console.error("Error loading player courses:", error);
      setPlayerCourses([]);
    }
  };

  const loadMemberCourses = async () => {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) { setMemberCourses([]); return; }

      const ids = userDoc.data().declaredMemberCourses || [];
      if (ids.length === 0) { setMemberCourses([]); return; }

      const courses: Course[] = [];
      for (const courseId of ids) {
        const q = query(collection(db, "courses"), where("id", "==", courseId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const d = snap.docs[0].data();
          courses.push({
            courseId,
            courseName: d.courseName || d.course_name || "Course",
            location: d.location,
          });
        }
      }
      setMemberCourses(courses);
    } catch (error) {
      console.error("Error loading member courses:", error);
      setMemberCourses([]);
    }
  };

  /* ========================= TOGGLE FOURSOME ========================= */
  const handleToggleFoursome = async (partner: Partner) => {
    const isInFoursome = foursomePartners.includes(partner.userId);

    if (!isInFoursome && foursomePartners.length >= MAX_FOURSOME) {
      Alert.alert(
        "Foursome Full",
        "You can only have 3 partners in your foursome (you're the 4th!). Remove someone first."
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const newList = isInFoursome
      ? foursomePartners.filter((id) => id !== partner.userId)
      : [...foursomePartners, partner.userId];

    setFoursomePartners(newList);

    try {
      await updateDoc(doc(db, "users", userId), {
        foursomePartners: isInFoursome
          ? arrayRemove(partner.userId)
          : arrayUnion(partner.userId),
      });
    } catch (err) {
      console.error("Error toggling foursome:", err);
      // Revert
      setFoursomePartners(foursomePartners);
    }
  };

  /* ========================= TOGGLE FAVORITE ========================= */
  const handleToggleFavorite = async (partner: Partner) => {
    const isFav = favoritedPartners.includes(partner.userId);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const newList = isFav
      ? favoritedPartners.filter((id) => id !== partner.userId)
      : [...favoritedPartners, partner.userId];

    setFavoritedPartners(newList);

    try {
      await updateDoc(doc(db, "users", userId), {
        favoritedPartners: isFav
          ? arrayRemove(partner.userId)
          : arrayUnion(partner.userId),
      });
    } catch (err) {
      console.error("Error toggling favorite:", err);
      setFavoritedPartners(favoritedPartners);
    }
  };

  /* ========================= REMOVE PARTNER ========================= */
  const handleRemovePartner = (partner: Partner) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(
      "Remove Partner?",
      `Remove ${partner.displayName} from your partners?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "partners", partner.partnerId));
              // Also remove from foursome/favorites if present
              const updates: any = {};
              if (foursomePartners.includes(partner.userId)) {
                updates.foursomePartners = arrayRemove(partner.userId);
              }
              if (favoritedPartners.includes(partner.userId)) {
                updates.favoritedPartners = arrayRemove(partner.userId);
              }
              if (Object.keys(updates).length > 0) {
                await updateDoc(doc(db, "users", userId), updates);
              }

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("✅ Partner Removed", `${partner.displayName} removed from partners`);
              await refreshData();
            } catch (error) {
              console.error("Error removing partner:", error);
              Alert.alert("Error", "Failed to remove partner");
            }
          },
        },
      ]
    );
  };

  /* ========================= RENDER PARTNER ========================= */
  const renderPartner = ({ item }: { item: Partner }) => {
    const foursomeIndex = foursomePartners.indexOf(item.userId);
    const isInFoursome = foursomeIndex !== -1;
    const isFavorite = favoritedPartners.includes(item.userId);

    return (
      <TouchableOpacity
        style={styles.listItem}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onClose();
          router.push(`/locker/${item.userId}`);
        }}
        onLongPress={() => {
          if (isOwnProfile) handleRemovePartner(item);
        }}
        delayLongPress={500}
      >
        {/* Avatar with foursome badge */}
        <View style={styles.avatarContainer}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {item.displayName[0]?.toUpperCase() || "?"}
              </Text>
            </View>
          )}

          {/* Foursome numbered badge */}
          {isInFoursome && (
            <View style={styles.foursomeBadge}>
              <Text style={styles.foursomeBadgeText}>{foursomeIndex + 1}</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.listItemContent}>
          <View style={styles.nameRow}>
            <Text style={styles.listItemName} numberOfLines={1}>
              {item.displayName}
            </Text>
            <BadgeRow challengeBadges={item.earnedChallengeBadges} size={14} />
          </View>
          <Text style={styles.listItemDetail}>
            HCP {item.handicap}
          </Text>
        </View>

        {/* Favorite ribbon + foursome toggle (own profile only) */}
        {isOwnProfile && (
          <View style={styles.actionIcons}>
            <TouchableOpacity
              onPress={() => handleToggleFavorite(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={isFavorite ? "ribbon" : "ribbon-outline"}
                size={22}
                color={isFavorite ? GOLD : "#CCC"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleToggleFoursome(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={[
                styles.foursomeToggle,
                isInFoursome && styles.foursomeToggleActive,
              ]}>
                <Text style={[
                  styles.foursomeToggleText,
                  isInFoursome && styles.foursomeToggleTextActive,
                ]}>
                  4
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {!isOwnProfile && (
          <Ionicons name="chevron-forward" size={20} color="#999" />
        )}
      </TouchableOpacity>
    );
  };

  /* ========================= RENDER COURSE ========================= */
  const renderCourse = ({ item }: { item: Course }) => (
    <TouchableOpacity
      style={styles.listItem}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onClose();
        router.push(`/locker/course/${item.courseId}`);
      }}
    >
      <View style={styles.courseIconContainer}>
        <Ionicons name="flag" size={24} color={GREEN} />
      </View>
      <View style={styles.listItemContent}>
        <Text style={styles.listItemName}>{item.courseName}</Text>
        {item.location && (
          <Text style={styles.listItemDetail}>
            {item.location.city}, {item.location.state}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#999" />
    </TouchableOpacity>
  );

  const renderVerifiedCourse = ({ item }: { item: Course }) => (
    <TouchableOpacity
      style={styles.listItem}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onClose();
        router.push(`/locker/course/${item.courseId}`);
      }}
    >
      <View style={styles.courseIconContainer}>
        <Ionicons name="flag" size={24} color={GREEN} />
      </View>
      <View style={styles.listItemContent}>
        <View style={styles.courseNameRow}>
          <Text style={styles.listItemName}>{item.courseName}</Text>
          <View style={styles.verifiedBadge}>
            <Ionicons name="shield-checkmark" size={14} color="#FFD700" />
          </View>
        </View>
        {item.location && (
          <Text style={styles.listItemDetail}>
            {item.location.city}, {item.location.state}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#999" />
    </TouchableOpacity>
  );

  /* ========================= EMPTY STATES ========================= */
  const renderEmptyState = () => {
    const hasAnyData = partners.length > 0 || playerCourses.length > 0 || memberCourses.length > 0;
    if (hasAnyData) return null;

    return (
      <View style={styles.emptyState}>
        <Ionicons name="people-outline" size={64} color="#CCC" />
        <Text style={styles.emptyTitle}>
          {isOwnProfile
            ? "Partner up with golfers, become a player of courses, or declare your membership"
            : `${displayName} hasn't partnered up yet`}
        </Text>
      </View>
    );
  };

  const renderSectionEmpty = (text: string) => (
    <View style={styles.sectionEmpty}>
      <Text style={styles.sectionEmptyText}>{text}</Text>
    </View>
  );

  /* ========================= SORTED PARTNERS ========================= */
  // Sort: foursome first, then favorites, then rest
  const sortedPartners = [...partners].sort((a, b) => {
    const aFoursome = foursomePartners.indexOf(a.userId);
    const bFoursome = foursomePartners.indexOf(b.userId);
    const aFav = favoritedPartners.includes(a.userId);
    const bFav = favoritedPartners.includes(b.userId);

    // Foursome members first (by position)
    if (aFoursome !== -1 && bFoursome === -1) return -1;
    if (aFoursome === -1 && bFoursome !== -1) return 1;
    if (aFoursome !== -1 && bFoursome !== -1) return aFoursome - bFoursome;

    // Then favorites
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;

    // Then alphabetical
    return a.displayName.localeCompare(b.displayName);
  });

  /* ========================= UI ========================= */
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerButton} />
          <Text style={styles.headerTitle}>
            {isOwnProfile ? "My Partners & Courses" : `${displayName}'s Partners & Courses`}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={GREEN} />
          </View>
        ) : (
          <FlatList
            data={[{ type: "content" }]}
            keyExtractor={(item) => item.type}
            contentContainerStyle={styles.scrollContent}
            refreshing={refreshing}
            onRefresh={refreshData}
            ListEmptyComponent={renderEmptyState()}
            renderItem={() => (
              <>
                {/* Partners */}
                {sortedPartners.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      Partners of {isOwnProfile ? "You" : displayName}
                    </Text>
                    {isOwnProfile && (
                      <Text style={styles.sectionHint}>
                        Tap the ribbon to favorite • Tap ④ for your foursome
                      </Text>
                    )}
                    {sortedPartners.map((partner) => (
                      <View key={partner.userId}>
                        {renderPartner({ item: partner })}
                      </View>
                    ))}
                  </View>
                )}

                {/* Player Of */}
                {playerCourses.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Player Of</Text>
                    {playerCourses.map((course) => (
                      <View key={course.courseId}>
                        {renderCourse({ item: course })}
                      </View>
                    ))}
                  </View>
                )}

                {/* Declared Members Of */}
                {memberCourses.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Declared Members Of</Text>
                    {memberCourses.map((course) => (
                      <View key={course.courseId}>
                        {renderVerifiedCourse({ item: course })}
                      </View>
                    ))}
                  </View>
                )}

                {/* Empty states for individual sections */}
                {partners.length === 0 && (playerCourses.length > 0 || memberCourses.length > 0) && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      Partners of {isOwnProfile ? "You" : displayName}
                    </Text>
                    {renderSectionEmpty(
                      isOwnProfile ? "No partners yet" : `${displayName} has no partners yet`
                    )}
                  </View>
                )}

                {playerCourses.length === 0 && (partners.length > 0 || memberCourses.length > 0) && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Player Of</Text>
                    {renderSectionEmpty(
                      isOwnProfile ? "Not a player of any courses yet" : `${displayName} is not a player of any courses yet`
                    )}
                  </View>
                )}

                {memberCourses.length === 0 && (partners.length > 0 || playerCourses.length > 0) && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Declared Members Of</Text>
                    {renderSectionEmpty(
                      isOwnProfile ? "No declared memberships yet" : `${displayName} has no declared memberships yet`
                    )}
                  </View>
                )}
              </>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: GREEN,
  },
  headerButton: { width: 40, alignItems: "center" },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    flex: 1,
  },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  scrollContent: { padding: 16, paddingBottom: 40 },

  section: { marginBottom: 32 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: GREEN,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: "#999",
    marginBottom: 12,
  },
  sectionEmpty: { padding: 20, alignItems: "center" },
  sectionEmptyText: { fontSize: 14, color: "#999", fontStyle: "italic" },

  // ── Partner Row ──────────────────────────────────────────────
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  avatarContainer: {
    position: "relative",
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#E0E0E0",
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: GREEN,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  foursomeBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: GREEN,
    borderWidth: 2,
    borderColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
  },
  foursomeBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFF",
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  listItemContent: { flex: 1 },
  listItemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  listItemDetail: { fontSize: 13, color: "#666" },

  // ── Action Icons (favorite ribbon + foursome toggle) ──────
  actionIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  foursomeToggle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#DDD",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  foursomeToggleActive: {
    borderColor: GREEN,
    backgroundColor: GREEN,
  },
  foursomeToggleText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#DDD",
  },
  foursomeToggleTextActive: {
    color: "#FFF",
  },

  // ── Course items ──────────────────────────────────────────
  courseIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },
  courseNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  verifiedBadge: {
    backgroundColor: GREEN,
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },

  // ── Empty state ──────────────────────────────────────────
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 24,
  },
});