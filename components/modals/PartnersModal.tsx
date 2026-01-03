import { db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
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

interface Partner {
  userId: string;
  displayName: string;
  avatar?: string;
  handicap: number;
  partnerId: string; // Firestore document ID for deletion
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
  userId: string; // User whose partners we're viewing
  isOwnProfile: boolean; // Whether viewing own profile or another user's
}

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

  useEffect(() => {
    if (visible) {
      loadAllData();
    }
  }, [visible, userId]);

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([
      loadUserDisplayName(),
      loadPartners(),
      loadPlayerCourses(),
      loadMemberCourses()
    ]);
    setLoading(false);
  };

  const refreshData = async () => {
    setRefreshing(true);
    await Promise.all([
      loadUserDisplayName(),
      loadPartners(),
      loadPlayerCourses(),
      loadMemberCourses()
    ]);
    setRefreshing(false);
  };

  /* ========================= LOAD USER DISPLAY NAME ========================= */
  const loadUserDisplayName = async () => {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        setDisplayName(userDoc.data().displayName || "User");
      }
    } catch (error) {
      console.error("Error loading user display name:", error);
      setDisplayName("User");
    }
  };

  /* ========================= LOAD PARTNERS ========================= */
  const loadPartners = async () => {
    try {
      // Query partners collection where userId is either user1Id or user2Id
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

      // Extract partner user IDs from both queries
      snap1.forEach((doc) => {
        const data = doc.data();
        partnerUserIds.push({
          userId: data.user2Id, // Other user is user2Id
          partnerId: doc.id,
        });
      });

      snap2.forEach((doc) => {
        const data = doc.data();
        partnerUserIds.push({
          userId: data.user1Id, // Other user is user1Id
          partnerId: doc.id,
        });
      });

      // Fetch user profiles for all partners
      const partnerProfiles: Partner[] = [];

      for (const { userId: partnerUserId, partnerId } of partnerUserIds) {
        const userDoc = await getDoc(doc(db, "users", partnerUserId));
        if (userDoc.exists()) {
          const data = userDoc.data();
          partnerProfiles.push({
            userId: partnerUserId,
            displayName: data.displayName || "Unknown",
            avatar: data.avatar,
            handicap: data.handicap || 0,
            partnerId: partnerId,
          });
        }
      }

      setPartners(partnerProfiles);
    } catch (error) {
      console.error("Error loading partners:", error);
      setPartners([]);
    }
  };

  /* ========================= LOAD PLAYER COURSES ========================= */
  const loadPlayerCourses = async () => {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) {
        setPlayerCourses([]);
        return;
      }

      const playerCourseIds = userDoc.data().playerCourses || [];
      if (playerCourseIds.length === 0) {
        setPlayerCourses([]);
        return;
      }

      // Fetch course details for each courseId
      const courses: Course[] = [];
      for (const courseId of playerCourseIds) {
        const coursesQuery = query(
          collection(db, "courses"),
          where("id", "==", courseId)
        );
        const coursesSnap = await getDocs(coursesQuery);

        if (!coursesSnap.empty) {
          const courseData = coursesSnap.docs[0].data();
          courses.push({
            courseId: courseId,
            courseName: courseData.courseName || courseData.course_name || "Course",
            location: courseData.location,
          });
        }
      }

      setPlayerCourses(courses);
    } catch (error) {
      console.error("Error loading player courses:", error);
      setPlayerCourses([]);
    }
  };

  /* ========================= LOAD MEMBER COURSES ========================= */
  const loadMemberCourses = async () => {
    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (!userDoc.exists()) {
        setMemberCourses([]);
        return;
      }

      const memberCourseIds = userDoc.data().declaredMemberCourses || [];
      if (memberCourseIds.length === 0) {
        setMemberCourses([]);
        return;
      }

      // Fetch course details for each courseId
      const courses: Course[] = [];
      for (const courseId of memberCourseIds) {
        const coursesQuery = query(
          collection(db, "courses"),
          where("id", "==", courseId)
        );
        const coursesSnap = await getDocs(coursesQuery);

        if (!coursesSnap.empty) {
          const courseData = coursesSnap.docs[0].data();
          courses.push({
            courseId: courseId,
            courseName: courseData.courseName || courseData.course_name || "Course",
            location: courseData.location,
          });
        }
      }

      setMemberCourses(courses);
    } catch (error) {
      console.error("Error loading member courses:", error);
      setMemberCourses([]);
    }
  };

  /* ========================= REMOVE PARTNER ========================= */
  const handleRemovePartner = (partner: Partner) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(
      "Remove Partner?",
      `Remove ${partner.displayName} from your partners?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              // Delete the partnership document
              await deleteDoc(doc(db, "partners", partner.partnerId));

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("✅ Partner Removed", `${partner.displayName} removed from partners`);

              // Refresh the list
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

  /* ========================= RENDER ITEMS ========================= */
  const renderPartner = ({ item }: { item: Partner }) => (
    <TouchableOpacity
      style={styles.listItem}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onClose();
        router.push(`/locker/${item.userId}`);
      }}
      onLongPress={() => {
        if (isOwnProfile) {
          handleRemovePartner(item);
        }
      }}
      delayLongPress={500}
    >
      {item.avatar ? (
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.displayName[0]?.toUpperCase() || "?"}
          </Text>
        </View>
      )}

      <View style={styles.listItemContent}>
        <Text style={styles.listItemName}>{item.displayName}</Text>
        <Text style={styles.listItemDetail}>Handicap: {item.handicap}</Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color="#999" />
    </TouchableOpacity>
  );

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
        <Ionicons name="flag" size={24} color="#0D5C3A" />
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
        <Ionicons name="flag" size={24} color="#0D5C3A" />
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
            <ActivityIndicator size="large" color="#0D5C3A" />
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
                {/* SECTION 1: Partners */}
                {partners.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      Partners of {isOwnProfile ? "You" : displayName}
                    </Text>
                    {partners.map((partner) => (
                      <View key={partner.userId}>
                        {renderPartner({ item: partner })}
                      </View>
                    ))}
                  </View>
                )}

                {/* SECTION 2: Player Of */}
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

                {/* SECTION 3: Declared Members Of */}
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

                {/* Show individual empty states if user has some data but not all */}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },

  headerButton: {
    width: 40,
    alignItems: "center",
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    flex: 1,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  section: {
    marginBottom: 32,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 12,
  },

  sectionEmpty: {
    padding: 20,
    alignItems: "center",
  },

  sectionEmptyText: {
    fontSize: 14,
    color: "#999",
    fontStyle: "italic",
  },

  listItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
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
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },

  avatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  courseIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },

  listItemContent: {
    flex: 1,
  },

  courseNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  verifiedBadge: {
    backgroundColor: "#0D5C3A",
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },

  listItemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },

  listItemDetail: {
    fontSize: 13,
    color: "#666",
  },

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