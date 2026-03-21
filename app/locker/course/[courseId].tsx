import CourseActionButtons from "@/components/locker/course/CourseActionButtons";
import CoursePlaque from "@/components/locker/course/CoursePlaque";
import ShelfCard from "@/components/locker/course/ShelfCard";
import ShelfTitle from "@/components/locker/course/ShelfTitle";
import MembershipRequestModal from "@/components/modals/MembershipRequestModal";
import BottomActionBar from "@/components/navigation/BottomActionBar";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import { soundPlayer } from "@/utils/soundPlayer";

import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
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
  const [courseLeagueId, setCourseLeagueId] = useState<string | null>(null);
  const [courseLeagueName, setCourseLeagueName] = useState<string | null>(null);

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
            setCourseLeagueId(cached.courseLeagueId || null);
            setCourseLeagueName(cached.courseLeagueName || null);
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

      let foundLeagueId: string | null = null;
      let foundLeagueName: string | null = null;

      try {
        const leaguesQuery = query(
          collection(db, "leagues"),
          where("status", "in", ["upcoming", "active"])
        );
        const leaguesSnap = await getDocs(leaguesQuery);

        for (const leagueDoc of leaguesSnap.docs) {
          const leagueData = leagueDoc.data();
          const restricted = leagueData.restrictedCourses || [];
          const hasCourse = restricted.some(
            (c: any) => c.courseId === Number(courseId)
          );

          if (hasCourse) {
            foundLeagueId = leagueDoc.id;
            foundLeagueName = leagueData.name || "League";
            break;
          }
        }

        if (!foundLeagueId && courseDetails.claimedByUserId) {
          const ownerLeaguesQuery = query(
            collection(db, "leagues"),
            where("hostUserId", "==", courseDetails.claimedByUserId),
            where("status", "in", ["upcoming", "active"])
          );
          const ownerLeaguesSnap = await getDocs(ownerLeaguesQuery);
          if (!ownerLeaguesSnap.empty) {
            const firstLeague = ownerLeaguesSnap.docs[0];
            foundLeagueId = firstLeague.id;
            foundLeagueName = firstLeague.data().name || "League";
          }
        }
      } catch (err) {
        console.log("⚠️ League lookup failed:", err);
      }

      setCourseLeagueId(foundLeagueId);
      setCourseLeagueName(foundLeagueName);

      allScores.sort((a, b) => a.netScore - b.netScore);
      const top6 = allScores.slice(0, 6).map(score => ({
        ...score,
        userName: score.displayName || score.userName || "Player",
        userAvatar: score.userAvatar || null,
      }));

      setLeaders(top6);

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
        courseLeagueId: foundLeagueId,
        courseLeagueName: foundLeagueName,
      });
      console.log("✅ Course locker cached");

      setShowingCached(false);
      setLoading(false);
    } catch (error) {
      console.error("Error loading course data:", error);
      soundPlayer.play("error");
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
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  const goToPlayer = (userId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/locker/${userId}`);
  };

  const handleBecomePlayer = async () => {
    if (!currentUserId) return;
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const userRef = doc(db, "users", currentUserId);

      if (isPlayer) {
        await updateDoc(userRef, { playerCourses: arrayRemove(Number(courseId)) });
        soundPlayer.play("postThought");
        setIsPlayer(false);
        const cached = await getCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""));
        if (cached) await setCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""), { ...cached, isPlayer: false });
        Alert.alert("Removed", `You're no longer a player of ${courseData?.courseName}`);
      } else {
        await updateDoc(userRef, { playerCourses: arrayUnion(Number(courseId)) });
        soundPlayer.play("postThought");
        setIsPlayer(true);
        const cached = await getCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""));
        if (cached) await setCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""), { ...cached, isPlayer: true });
        Alert.alert("Player! ⛳", `You're now a player of ${courseData?.courseName}`);
      }
    } catch (error) {
      console.error("Error updating player status:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to update player status");
    }
  };

  const handleDeclareMembership = async () => {
    if (!currentUserId) return;
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (membershipStatus === "pending") {
      soundPlayer.play("error");
      Alert.alert("Request Pending", "Your membership request is currently being reviewed.");
      return;
    }

    if (membershipStatus === "rejected") {
      Alert.alert(
        "Previous Request Not Approved",
        "Your previous membership request was not approved. You can submit a new request with updated proof.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Resubmit", onPress: () => { soundPlayer.play("click"); setMembershipModalVisible(true); } },
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
                await updateDoc(userRef, { declaredMemberCourses: arrayRemove(Number(courseId)) });

                const membershipQuery = query(
                  collection(db, "course_memberships"),
                  where("userId", "==", currentUserId),
                  where("courseId", "==", Number(courseId))
                );
                const membershipSnap = await getDocs(membershipQuery);
                if (!membershipSnap.empty) {
                  await updateDoc(membershipSnap.docs[0].ref, { status: "cancelled" });
                }

                soundPlayer.play("postThought");
                setIsMember(false);
                setMembershipStatus("none");
                const cached = await getCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""));
                if (cached) await setCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""), { ...cached, isMember: false, membershipStatus: "none" });
                Alert.alert("Removed", `Membership removed from ${courseData?.courseName}`);
              } catch (error) {
                soundPlayer.play("error");
                Alert.alert("Error", "Failed to remove membership");
              }
            },
          },
        ]
      );
      return;
    }

    setMembershipModalVisible(true);
  };

  const handleLockerNote = () => {
    if (!isClaimed) {
      soundPlayer.play("error");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("Course Not Claimed", "This course hasn't claimed their profile yet.");
      return;
    }
    if (!claimedByUserId) {
      soundPlayer.play("error");
      Alert.alert("Error", "Unable to send locker note at this time");
      return;
    }
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/messages/${claimedByUserId}`);
  };

  const handleLeague = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (courseLeagueId) {
      router.push(`/leagues/home?leagueId=${courseLeagueId}`);
    } else {
      Alert.alert("No League Yet", `${courseData?.courseName || "This course"} hasn't created a league yet.`);
    }
  };

  const handleMembershipSuccess = async () => {
    soundPlayer.play("postThought");
    if (!currentUserId) return;

    try {
      const userDoc = await getDoc(doc(db, "users", currentUserId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const pendingCourses = userData.pendingMembershipCourses || [];
        setIsPendingMembership(pendingCourses.includes(Number(courseId)));
      }

      const membershipQuery = query(
        collection(db, "course_memberships"),
        where("userId", "==", currentUserId),
        where("courseId", "==", Number(courseId))
      );
      const membershipSnap = await getDocs(membershipQuery);

      if (!membershipSnap.empty) {
        const status = membershipSnap.docs[0].data().status as "pending" | "approved" | "rejected";
        setMembershipStatus(status);
        const cached = await getCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""));
        if (cached) await setCache(CACHE_KEYS.COURSE_LEADERBOARD(courseId, ""), { ...cached, membershipStatus: status, isPendingMembership: status === "pending" });
      }
    } catch (error) {
      soundPlayer.play("error");
    }
  };

  // ============================================================================
  // LOADING
  // ============================================================================

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

  // ============================================================================
  // RENDER
  // ============================================================================

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
          {/* Cache updating indicator */}
          {showingCached && !loading && (
            <View style={styles.cacheIndicator}>
              <ActivityIndicator size="small" color="#0D5C3A" />
              <Text style={styles.cacheText}>Updating course locker...</Text>
            </View>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* HEADER — CoursePlaque + action buttons                           */}
          {/* ---------------------------------------------------------------- */}
          <View style={styles.headerArea}>
            <CoursePlaque
              courseName={courseData?.courseName || "Course"}
              city={courseData?.location?.city}
              state={courseData?.location?.state}
              par={courseData?.par || 72}
              slope={courseData?.slope}
            />

            {currentUserId && (
              <CourseActionButtons
                isPlayer={isPlayer}
                membershipStatus={membershipStatus}
                isClaimed={isClaimed}
                courseLeagueId={courseLeagueId}
                onBecomePlayer={handleBecomePlayer}
                onDeclareMembership={handleDeclareMembership}
                onLockerNote={handleLockerNote}
                onLeague={handleLeague}
              />
            )}
          </View>

          {/* ---------------------------------------------------------------- */}
          {/* SHELF 1 — Current Low Leaders                                   */}
          {/* ---------------------------------------------------------------- */}
          <View style={styles.shelf1}>
            <ShelfTitle title="Current Low Leaders" />

            {leaders.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardRow}
                removeClippedSubviews={false}
              >
                {leaders.map((leader, index) => (
                  <ShelfCard
                    key={leader.scoreId || index}
                    avatarUri={leader.userAvatar}
                    name={leader.userName}
                    stat={`Net: ${leader.netScore}`}
                    date={formatDate(leader.createdAt)}
                    onPress={() => goToPlayer(leader.userId)}
                  />
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

          {/* ---------------------------------------------------------------- */}
          {/* SHELF 2 — Hole-in-Ones                                          */}
          {/* ---------------------------------------------------------------- */}
          <View style={styles.shelf2}>
            <ShelfTitle title="Hole-in-Ones" />

            {holeInOnes.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardRow}
                removeClippedSubviews={false}
              >
                {holeInOnes.map((ace, index) => (
                  <ShelfCard
                    key={index}
                    avatarUri={ace.userAvatar}
                    name={ace.userName || ace.displayName}
                    stat={`Hole ${ace.hole || "?"}`}
                    date={formatDate(ace.achievedAt)}
                    onPress={() => goToPlayer(ace.userId)}
                  />
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyPlaque}>
                <Text style={styles.emptyPlaqueText}>
                  Be the first to achieve a hole-in-one commemoration
                </Text>
              </View>
            )}
          </View>

          {/* ---------------------------------------------------------------- */}
          {/* SHELF 3 — Tour Champions                                        */}
          {/* ---------------------------------------------------------------- */}
          <View style={styles.shelf3}>
            <ShelfTitle title="Tour Champions" />

            {/* Placeholder — data to be wired in a future build */}
            <View style={styles.emptyPlaque}>
              <Text style={styles.emptyPlaqueText}>
                Tour champions will be commemorated here
              </Text>
            </View>
          </View>

          {/* Invisible pull-to-refresh scroll view */}
          <ScrollView
            style={styles.refreshScrollView}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#C8A53C"
                colors={["#C8A53C"]}
              />
            }
          />
        </ImageBackground>

        <MembershipRequestModal
          visible={membershipModalVisible}
          onClose={() => {
            soundPlayer.play("click");
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

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  safeTop: {
    backgroundColor: "#0D5C3A",
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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },

  headerArea: {
    position: "absolute",
    top: "0.5%",
    left: 0,
    right: 0,
    zIndex: 10,
  },

  shelf1: {
    position: "absolute",
    top: "15%",
    left: 0,
    right: 0,
    height: "25.2%",
    paddingHorizontal: 20,
    justifyContent: "flex-start",
    paddingTop: 8,
  },

  shelf2: {
    position: "absolute",
    top: "42%",
    left: 0,
    right: 0,
    height: "24.5%",
    paddingHorizontal: 20,
    justifyContent: "flex-start",
    paddingTop: 8,
  },

  shelf3: {
    position: "absolute",
    top: "70%",
    left: 0,
    right: 0,
    height: "29.5%",
    paddingHorizontal: 20,
    justifyContent: "flex-start",
    paddingTop: 8,
  },

  cardRow: {
    flexDirection: "row",
    paddingHorizontal: 4,
    gap: 8,
  },

  emptyPlaque: {
    backgroundColor: "rgba(232, 200, 74, 0.15)",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#6A4C08",
    padding: 16,
    alignItems: "center",
  },

  emptyPlaqueText: {
    fontFamily: "Georgia",
    fontSize: 12,
    fontStyle: "italic",
    color: "#3A2000",
    textAlign: "center",
    opacity: 0.75,
  },
});