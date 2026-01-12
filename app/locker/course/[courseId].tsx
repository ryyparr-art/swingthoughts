import MembershipRequestModal from "@/components/modals/MembershipRequestModal";
import BottomActionBar from "@/components/navigation/BottomActionBar";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import { soundPlayer } from "@/utils/soundPlayer";

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function CourseLockerScreen() {
  const params = useLocalSearchParams();
  const courseId = params.courseId as string;
  const currentUserId = auth.currentUser?.uid;
  const { getCache, setCache, cleanupOldProfiles } = useCache();

  const [courseData, setCourseData] = useState<any>(null);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [holeInOnes, setHoleInOnes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showingCached, setShowingCached] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isPlayer, setIsPlayer] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [isPendingMembership, setIsPendingMembership] = useState(false);
  const [membershipStatus, setMembershipStatus] = useState<"none" | "pending" | "approved" | "rejected">("none");
  const [isClaimed, setIsClaimed] = useState(false);
  const [claimedByUserId, setClaimedByUserId] = useState<string | null>(null);
  const [membershipModalVisible, setMembershipModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!courseId) return;

      const fetchCourseDataWithCache = async () => {
        try {
          const cached = await getCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""));
          
          if (cached) {
            console.log("⚡ Course locker cache hit:", courseId);
            setCourseData(cached.courseData);
            setLeaders(cached.leaders);
            setHoleInOnes(cached.holeInOnes);
            setIsClaimed(cached.isClaimed || false);
            setClaimedByUserId(cached.claimedByUserId || null);
            setIsPlayer(cached.isPlayer || false);
            setIsMember(cached.isMember || false);
            setIsPendingMembership(cached.isPendingMembership || false);
            setMembershipStatus(cached.membershipStatus || "none");
            setShowingCached(true);
            setLoading(false);
          }

          await fetchCourseData();

          if (Math.random() < 0.1) {
            cleanupOldProfiles();
          }
        } catch (error) {
          console.error("❌ Course locker cache error:", error);
          await fetchCourseData();
        }
      };

      fetchCourseDataWithCache();
    }, [courseId, currentUserId])
  );

  const fetchCourseData = async () => {
    try {
      setLoading(true);

      // Get course data from leaderboards
      const leaderboardsQuery = query(
        collection(db, "leaderboards"),
        where("courseId", "==", Number(courseId))
      );
      const leaderboardsSnap = await getDocs(leaderboardsQuery);

      let courseName = "Course";
      let holeinones: any[] = [];
      const allScores: any[] = [];

      if (!leaderboardsSnap.empty) {
        const firstDoc = leaderboardsSnap.docs[0].data();
        courseName = firstDoc.courseName || "Course";

        leaderboardsSnap.forEach(doc => {
          const data = doc.data();
          if (data.topScores18 && Array.isArray(data.topScores18)) {
            allScores.push(...data.topScores18);
          }
          if (data.holesInOne && Array.isArray(data.holesInOne)) {
            holeinones.push(...data.holesInOne);
          }
        });
      }

      // Get course details from courses collection
      const courseDocRef = doc(db, "courses", courseId);
      const courseSnap = await getDoc(courseDocRef);
      
      let courseDetails: any = {};
      
      if (courseSnap.exists()) {
        courseDetails = courseSnap.data();
        setIsClaimed(courseDetails.claimed || false);
        setClaimedByUserId(courseDetails.claimedByUserId || null);
      }

      const courseDataObj = {
        courseId: Number(courseId),
        courseName,
        par: courseDetails.par || 72,
        slope: courseDetails.slope || null,
        location: courseDetails.location || null,
      };

      setCourseData(courseDataObj);

      // Check user membership status
      let userIsPlayer = false;
      let userIsMember = false;
      let userIsPending = false;
      let userMembershipStatus: "none" | "pending" | "approved" | "rejected" = "none";

      if (currentUserId) {
        const userDoc = await getDoc(doc(db, "users", currentUserId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const playerCourses = userData.playerCourses || [];
          const memberCourses = userData.declaredMemberCourses || [];
          const pendingCourses = userData.pendingMembershipCourses || [];
          
          userIsPlayer = playerCourses.includes(Number(courseId));
          userIsMember = memberCourses.includes(Number(courseId));
          userIsPending = pendingCourses.includes(Number(courseId));

          setIsPlayer(userIsPlayer);
          setIsMember(userIsMember);
          setIsPendingMembership(userIsPending);

          const membershipQuery = query(
            collection(db, "course_memberships"),
            where("userId", "==", currentUserId),
            where("courseId", "==", Number(courseId))
          );
          const membershipSnap = await getDocs(membershipQuery);

          if (!membershipSnap.empty) {
            const membershipDoc = membershipSnap.docs[0];
            const status = membershipDoc.data().status as "pending" | "approved" | "rejected";
            userMembershipStatus = status;
            setMembershipStatus(status);
          } else {
            setMembershipStatus("none");
          }
        }
      }

      // Process scores
      allScores.sort((a, b) => a.netScore - b.netScore);
      const top6 = allScores.slice(0, 6).map(score => ({
        ...score,
        userName: score.displayName || score.userName || "Player",
        userAvatar: score.userAvatar || null,
      }));

      setLeaders(top6);

      // Process hole-in-ones
      const hioWithUsers = holeinones.slice(0, 6).map((hio: any) => ({
        ...hio,
        userName: hio.displayName || "Player",
        userAvatar: hio.userAvatar || null,
      }));

      setHoleInOnes(hioWithUsers);

      await setCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""), {
        courseData: courseDataObj,
        leaders: top6,
        holeInOnes: hioWithUsers,
        isClaimed: courseDetails.claimed || false,
        claimedByUserId: courseDetails.claimedByUserId || null,
        isPlayer: userIsPlayer,
        isMember: userIsMember,
        isPendingMembership: userIsPending,
        membershipStatus: userMembershipStatus,
      });
      console.log("✅ Course locker cached");

      setShowingCached(false);
      setLoading(false);
    } catch (error) {
      console.error("Error loading course data:", error);
      soundPlayer.play('error');
      setShowingCached(false);
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setShowingCached(false);
    await fetchCourseData();
    setRefreshing(false);
  }, [courseId, currentUserId]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "";
    try {
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

  const goToPlayer = (userId: string) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/locker/${userId}`);
  };

  const handleBecomePlayer = async () => {
    if (!currentUserId) return;
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const userRef = doc(db, "users", currentUserId);

      if (isPlayer) {
        await updateDoc(userRef, {
          playerCourses: arrayRemove(Number(courseId))
        });
        soundPlayer.play('postThought');
        setIsPlayer(false);
        
        const cached = await getCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""));
        if (cached) {
          await setCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""), {
            ...cached,
            isPlayer: false,
          });
        }
        
        Alert.alert("Removed", `You're no longer a player of ${courseData?.courseName}`);
      } else {
        await updateDoc(userRef, {
          playerCourses: arrayUnion(Number(courseId))
        });
        soundPlayer.play('postThought');
        setIsPlayer(true);
        
        const cached = await getCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""));
        if (cached) {
          await setCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""), {
            ...cached,
            isPlayer: true,
          });
        }
        
        Alert.alert("Player! ⛳", `You're now a player of ${courseData?.courseName}`);
      }
    } catch (error) {
      console.error("Error updating player status:", error);
      soundPlayer.play('error');
      Alert.alert("Error", "Failed to update player status");
    }
  };

  const handleDeclareMembership = async () => {
    if (!currentUserId) return;
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (membershipStatus === "pending") {
      soundPlayer.play('error');
      Alert.alert(
        "Request Pending",
        "Your membership request is currently being reviewed by our team. We'll notify you once it's been processed."
      );
      return;
    }

    if (membershipStatus === "rejected") {
      Alert.alert(
        "Previous Request Not Approved",
        "Your previous membership request was not approved. You can submit a new request with updated proof.",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Resubmit", 
            onPress: () => {
              soundPlayer.play('click');
              setMembershipModalVisible(true);
            }
          }
        ]
      );
      return;
    }

    if (membershipStatus === "approved" && isMember) {
      Alert.alert(
        "Remove Membership?",
        `Are you sure you want to remove your verified membership from ${courseData?.courseName}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                const userRef = doc(db, "users", currentUserId);
                await updateDoc(userRef, {
                  declaredMemberCourses: arrayRemove(Number(courseId))
                });

                const membershipQuery = query(
                  collection(db, "course_memberships"),
                  where("userId", "==", currentUserId),
                  where("courseId", "==", Number(courseId))
                );
                const membershipSnap = await getDocs(membershipQuery);

                if (!membershipSnap.empty) {
                  const membershipDocRef = membershipSnap.docs[0].ref;
                  await updateDoc(membershipDocRef, {
                    status: "cancelled"
                  });
                }

                soundPlayer.play('postThought');
                setIsMember(false);
                setMembershipStatus("none");
                
                const cached = await getCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""));
                if (cached) {
                  await setCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""), {
                    ...cached,
                    isMember: false,
                    membershipStatus: "none",
                  });
                }
                
                Alert.alert("Removed", `Membership removed from ${courseData?.courseName}`);
              } catch (error) {
                console.error("Error removing membership:", error);
                soundPlayer.play('error');
                Alert.alert("Error", "Failed to remove membership");
              }
            }
          }
        ]
      );
      return;
    }

    setMembershipModalVisible(true);
  };

  const handleLockerNote = () => {
    if (!isClaimed) {
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "Course Not Claimed",
        "This course hasn't claimed their profile yet. Locker notes are only available for claimed courses."
      );
      return;
    }

    if (!claimedByUserId) {
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("Error", "Unable to send locker note at this time");
      return;
    }

    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/messages/${claimedByUserId}`);
  };

  const handleMembershipSuccess = async () => {
    soundPlayer.play('postThought');
    if (!currentUserId) return;

    try {
      const userDoc = await getDoc(doc(db, "users", currentUserId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const pendingCourses = userData.pendingMembershipCourses || [];
        const isPending = pendingCourses.includes(Number(courseId));
        setIsPendingMembership(isPending);
      }

      const membershipQuery = query(
        collection(db, "course_memberships"),
        where("userId", "==", currentUserId),
        where("courseId", "==", Number(courseId))
      );
      const membershipSnap = await getDocs(membershipQuery);

      if (!membershipSnap.empty) {
        const membershipDoc = membershipSnap.docs[0];
        const status = membershipDoc.data().status as "pending" | "approved" | "rejected";
        setMembershipStatus(status);
        
        const cached = await getCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""));
        if (cached) {
          await setCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""), {
            ...cached,
            membershipStatus: status,
            isPendingMembership: status === "pending",
          });
        }
      }
    } catch (error) {
      console.error("Error refreshing membership status:", error);
      soundPlayer.play('error');
    }
  };

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

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      <View style={styles.lockerContainer}>
        <TopNavBar />

        <ImageBackground
          source={require("@/assets/locker/course-locker-bg.png")}
          resizeMode="cover"
          style={styles.background}
        >
          {showingCached && !loading && (
            <View style={styles.cacheIndicator}>
              <ActivityIndicator size="small" color="#0D5C3A" />
              <Text style={styles.cacheText}>Updating course locker...</Text>
            </View>
          )}

          {/* HEADER - Absolute positioned */}
          <View style={styles.headerArea}>
            <View style={styles.brassPlaque}>
              <Text style={styles.courseName}>
                {courseData?.courseName?.toUpperCase() || "COURSE"}
              </Text>
              <Text style={styles.courseDetails}>
                {courseData?.location?.city && courseData?.location?.state
                  ? `${courseData.location.city}, ${courseData.location.state}`
                  : "Location"}{" "}
                • Par {courseData?.par || 72}
                {courseData?.slope ? ` • Slope ${courseData.slope}` : ""}
              </Text>
            </View>

            {currentUserId && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={handleBecomePlayer}
                  style={[
                    styles.actionButton,
                    isPlayer && styles.activeButton,
                  ]}
                >
                  <Ionicons
                    name={isPlayer ? "checkmark-circle" : "golf"}
                    size={16}
                    color="#fff"
                  />
                  <Text style={styles.actionText}>
                    {isPlayer ? "Player ✓" : "Become a Player"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleDeclareMembership}
                  style={[
                    styles.actionButton,
                    membershipStatus === "approved" && styles.activeButton,
                    membershipStatus === "pending" && styles.pendingButton,
                  ]}
                >
                  <Ionicons
                    name={
                      membershipStatus === "approved"
                        ? "checkmark-circle"
                        : membershipStatus === "pending"
                        ? "time-outline"
                        : membershipStatus === "rejected"
                        ? "alert-circle-outline"
                        : "ribbon"
                    }
                    size={16}
                    color="#fff"
                  />
                  <Text style={styles.actionText}>
                    {membershipStatus === "approved"
                      ? "Member ✓"
                      : membershipStatus === "pending"
                      ? "Pending ⏳"
                      : membershipStatus === "rejected"
                      ? "Resubmit"
                      : "Declare Membership"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleLockerNote}
                  style={[
                    styles.actionButton,
                    !isClaimed && styles.lockerNoteLocked,
                  ]}
                >
                  <Ionicons name="mail" size={16} color="#fff" />
                  <Text style={styles.actionText}>Locker Note</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* SHELF 1 - Absolute positioned SIBLING to ScrollView */}
          <View style={styles.shelf1}>
            <Text style={styles.shelfTitle}>CURRENT LOW LEADERS</Text>
            
            {leaders.length > 0 ? (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardRow}
              >
                {leaders.map((leader, index) => (
                  <TouchableOpacity
                    key={leader.scoreId || index}
                    style={styles.smallCard}
                    onPress={() => goToPlayer(leader.userId)}
                  >
                    {leader.userAvatar ? (
                      <Image source={{ uri: leader.userAvatar }} style={styles.smallAvatar} />
                    ) : (
                      <View style={styles.smallAvatarFallback}>
                        <Ionicons name="person" size={14} color="#8B6914" />
                      </View>
                    )}
                    <Text style={styles.smallName} numberOfLines={1}>
                      {leader.userName}
                    </Text>
                    <Text style={styles.smallScore}>Net: {leader.netScore}</Text>
                    <Text style={styles.smallDate}>
                      {formatDate(leader.createdAt)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyPlaque}>
                <Text style={styles.emptyPlaqueText}>
                  Be the first to be commemorated
                </Text>
              </View>
            )}
          </View>

          {/* SHELF 2 - Absolute positioned SIBLING to ScrollView */}
          <View style={styles.shelf2}>
            <Text style={styles.shelfTitle}>HOLE-IN-ONES</Text>
            
            {holeInOnes.length > 0 ? (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardRow}
              >
                {holeInOnes.map((ace, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.smallCard}
                    onPress={() => goToPlayer(ace.userId)}
                  >
                    {ace.userAvatar ? (
                      <Image source={{ uri: ace.userAvatar }} style={styles.smallAvatar} />
                    ) : (
                      <View style={styles.smallAvatarFallback}>
                        <Ionicons name="person" size={14} color="#8B6914" />
                      </View>
                    )}
                    <Text style={styles.smallName} numberOfLines={1}>
                      {ace.userName || ace.displayName}
                    </Text>
                    <Text style={styles.smallScore}>
                      Hole {ace.hole || "?"}
                    </Text>
                    <Text style={styles.smallDate}>
                      {formatDate(ace.achievedAt)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyPlaque}>
                <Text style={styles.emptyPlaqueText}>
                  Be the first to achieve a hole in 1 commemoration
                </Text>
              </View>
            )}
          </View>

          {/* SHELF 3 - Absolute positioned SIBLING to ScrollView */}
          <View style={styles.shelf3}>
            <Text style={styles.shelfTitle}>COMING SOON</Text>
            
            <View style={styles.comingSoonPlaque}>
              <Text style={styles.comingSoonText}>
                More course statistics and records
              </Text>
            </View>
          </View>

          {/* Invisible ScrollView for pull-to-refresh */}
          <ScrollView
            style={styles.refreshScrollView}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#8B6914"
                colors={["#8B6914"]}
              />
            }
          />
        </ImageBackground>

        <MembershipRequestModal
          visible={membershipModalVisible}
          onClose={() => {
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setMembershipModalVisible(false);
          }}
          courseId={Number(courseId)}
          courseName={courseData?.courseName || "Course"}
          onSuccess={handleMembershipSuccess}
        />

        <BottomActionBar />
        <SwingFooter />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#F4EED8" 
  },
  
  safeTop: { 
    backgroundColor: "#0D5C3A" 
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  cacheIndicator: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    backgroundColor: "rgba(255, 243, 205, 0.95)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 236, 181, 0.95)",
    zIndex: 100,
  },
  
  cacheText: {
    fontSize: 12,
    color: "#664D03",
    fontWeight: "600",
  },
  
  lockerContainer: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  background: { 
    flex: 1,
  },

  refreshScrollView: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },

  headerArea: {
    position: 'absolute',
    top: '4.6%',
    left: 0,
    right: 0,
    minHeight: '6.6%',
    justifyContent: 'center',
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 8,
    zIndex: 10,
  },

  brassPlaque: {
    backgroundColor: "#D4AF37",
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#8B6914",
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 16,
    maxWidth: "80%",
  },

  courseName: {
    fontSize: 13,
    fontWeight: "900",
    color: "#2C1810",
    textAlign: "center",
    marginBottom: 2,
    letterSpacing: 0.5,
  },

  courseDetails: {
    fontSize: 8,
    fontWeight: "600",
    color: "#4A3728",
    textAlign: "center",
    letterSpacing: 0.2,
  },

  actionRow: {
    flexDirection: "row",
    gap: 4,
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 8,
  },

  actionButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: "#0D5C3A",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#8B6914",
    minHeight: 42,
  },

  activeButton: {
    backgroundColor: "#FFD700",
    borderColor: "#8B6914",
  },

  pendingButton: {
    backgroundColor: "#888",
    borderColor: "#666",
  },

  lockerNoteLocked: {
    backgroundColor: "#999",
    borderColor: "#666",
  },

  actionText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 11,
    maxWidth: "100%",
  },

  shelf1: {
    position: 'absolute',
    top: '20%',
    left: 0,
    right: 0,
    height: '25.2%',
    paddingHorizontal: 20,
    justifyContent: 'flex-start',
    paddingTop: 8,
  },

  shelf2: {
    position: 'absolute',
    top: '47%',
    left: 0,
    right: 0,
    height: '24.5%',
    paddingHorizontal: 20,
    justifyContent: 'flex-start',
    paddingTop: 8,
  },

  shelf3: {
    position: 'absolute',
    top: '73%',
    left: 0,
    right: 0,
    height: '29.5%',
    paddingHorizontal: 20,
    justifyContent: 'flex-start',
    paddingTop: 8,
  },

  shelfTitle: {
    fontSize: 9,
    fontWeight: "900",
    color: "#2C1810",
    textAlign: "center",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    backgroundColor: "#E8D7B8",
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#8B6914",
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignSelf: 'center',
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.75,
    shadowRadius: 10,
    elevation: 14,
  },

  cardRow: {
    flexDirection: "row",
    paddingHorizontal: 4,
    gap: 6,
  },

  smallCard: {
    width: 95,
    height: 95,
    backgroundColor: "#E8D7B8",
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#8B6914",
    paddingVertical: 6,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
  },

  smallAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginBottom: 4,
  },

  smallAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#D4AF37",
    borderWidth: 1,
    borderColor: "#8B6914",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },

  smallName: {
    fontSize: 10,
    fontWeight: "700",
    color: "#2C1810",
    textAlign: "center",
    lineHeight: 12,
    marginBottom: 2,
  },

  smallScore: {
    fontSize: 9,
    fontWeight: "600",
    color: "#8B6914",
    lineHeight: 11,
    marginBottom: 1,
  },

  smallDate: {
    fontSize: 8,
    fontWeight: "500",
    color: "#6B5D4F",
    lineHeight: 10,
  },

  emptyPlaque: {
    backgroundColor: "#E8D7B8",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#8B6914",
    padding: 16,
    alignItems: "center",
  },

  emptyPlaqueText: {
    fontSize: 12,
    fontWeight: "600",
    fontStyle: "italic",
    color: "#6B5D4F",
    textAlign: "center",
  },

  comingSoonPlaque: {
    backgroundColor: "#D4C4A8",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#9B8B6B",
    padding: 14,
    alignItems: "center",
    opacity: 0.7,
  },

  comingSoonText: {
    fontSize: 11,
    fontWeight: "600",
    fontStyle: "italic",
    color: "#6B5D4F",
    textAlign: "center",
  },
});