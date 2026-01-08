import { auth, db } from "@/constants/firebaseConfig";
import { getNearbyCourses } from "@/utils/courseCache";
import { soundPlayer } from "@/utils/soundPlayer";
import { batchGetUserProfiles } from "@/utils/userProfileHelpers";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
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
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const LowLeaderTrophy = require("@/assets/icons/LowLeaderTrophy.png");

interface Score {
  scoreId: string;
  userId: string;
  courseId: number;
  courseName: string;
  grossScore: number;
  netScore: number;
  par: number;
  createdAt: any;
  userName?: string;
  userAvatar?: string | null;
}

interface CourseBoard {
  courseId: number;
  courseName: string;
  distance: number;
  scores: Score[];
  isPinned: boolean;
}

interface AllCoursesLeaderboardModalProps {
  visible: boolean;
  onClose: () => void;
  onPinChange?: () => void; // Callback to refresh main leaderboard
}

export default function AllCoursesLeaderboardModal({
  visible,
  onClose,
  onPinChange,
}: AllCoursesLeaderboardModalProps) {
  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<CourseBoard[]>([]);
  const [pinnedCourseId, setPinnedCourseId] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      loadAllCourses();
    }
  }, [visible]);

  const loadAllCourses = async () => {
    try {
      setLoading(true);
      const uid = auth.currentUser?.uid;

      if (!uid) {
        console.log("❌ No user authenticated");
        setLoading(false);
        return;
      }

      // Get user's pinned leaderboard
      const userDoc = await getDoc(doc(db, "users", uid));
      const pinnedLeaderboard = userDoc.data()?.pinnedLeaderboard;
      setPinnedCourseId(pinnedLeaderboard?.courseId || null);

      // Get all nearby courses (within 50 miles)
      const nearbyCourses = await getNearbyCourses(uid, 50);
      console.log(`📦 [Modal] Found ${nearbyCourses.length} courses within 50 miles`);

      if (nearbyCourses.length === 0) {
        setBoards([]);
        setLoading(false);
        return;
      }

      // Load all scores
      const scoresSnap = await getDocs(collection(db, "scores"));
      const userIds = new Set<string>();
      const scores: Score[] = [];

      scoresSnap.forEach((d) => {
        const data = d.data();
        scores.push({
          scoreId: d.id,
          userId: data.userId,
          courseId: data.courseId,
          courseName: data.courseName,
          grossScore: data.grossScore,
          netScore: data.netScore,
          par: data.par,
          createdAt: data.createdAt,
        });
        if (data.userId) userIds.add(data.userId);
      });

      // Load user profiles
      const profileMap = await batchGetUserProfiles(Array.from(userIds));
      const profiles: Record<string, any> = {};

      profileMap.forEach((profile, userId) => {
        profiles[userId] = {
          displayName: profile.displayName,
          avatar: profile.avatar,
          userType: profile.userType,
        };
      });

      // Merge scores with user data and filter out course accounts
      const mergedScores = scores
        .filter((s) => profiles[s.userId]?.userType !== "Course")
        .filter((s) => s.grossScore != null && s.netScore != null)
        .map((s) => ({
          ...s,
          userName: profiles[s.userId]?.displayName || "[Deleted User]",
          userAvatar: profiles[s.userId]?.avatar ?? null,
        }));

      // Build boards for each course
      const courseBoards: CourseBoard[] = nearbyCourses.map((course) => {
        const courseScores = mergedScores.filter((s) => s.courseId === course.courseId);
        const sortedScores = courseScores.sort((a, b) => a.netScore - b.netScore).slice(0, 3);

        return {
          courseId: course.courseId,
          courseName: course.courseName,
          distance: course.distance,
          scores: sortedScores,
          isPinned: course.courseId === pinnedCourseId,
        };
      });

      console.log(`✅ [Modal] Built ${courseBoards.length} course leaderboards`);
      setBoards(courseBoards);
      setLoading(false);
    } catch (error) {
      console.error("[Modal] Error loading courses:", error);
      soundPlayer.play("error");
      setLoading(false);
    }
  };

  const handlePinCourse = async (courseId: number, courseName: string) => {
    try {
      soundPlayer.play("achievement");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const uid = auth.currentUser?.uid;
      if (!uid) return;

      // Update user's pinned leaderboard
      await updateDoc(doc(db, "users", uid), {
        pinnedLeaderboard: {
          courseId,
          courseName,
          pinnedAt: new Date(),
        },
      });

      setPinnedCourseId(courseId);

      // Update boards to reflect pin change
      setBoards((prev) =>
        prev.map((board) => ({
          ...board,
          isPinned: board.courseId === courseId,
        }))
      );

      console.log("✅ Pinned leaderboard:", courseName);

      // Notify parent to refresh
      if (onPinChange) onPinChange();
    } catch (error) {
      console.error("Error pinning course:", error);
      soundPlayer.play("error");
    }
  };

  const handleUnpinCourse = async () => {
    try {
      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const uid = auth.currentUser?.uid;
      if (!uid) return;

      // Remove pinned leaderboard
      await updateDoc(doc(db, "users", uid), {
        pinnedLeaderboard: null,
      });

      setPinnedCourseId(null);

      // Update boards
      setBoards((prev) =>
        prev.map((board) => ({
          ...board,
          isPinned: false,
        }))
      );

      console.log("✅ Unpinned leaderboard");

      // Notify parent to refresh
      if (onPinChange) onPinChange();
    } catch (error) {
      console.error("Error unpinning course:", error);
      soundPlayer.play("error");
    }
  };

  const goToPlayer = (userId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push(`/locker/${userId}`);
  };

  const goToCourse = (courseId: number) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push(`/locker/course/${courseId}`);
  };

  const renderCourseBoard = ({ item }: { item: CourseBoard }) => {
    return (
      <View style={styles.board}>
        {/* COURSE HEADER */}
        <TouchableOpacity onPress={() => goToCourse(item.courseId)}>
          <View style={styles.boardHeader}>
            <View style={styles.boardHeaderLeft}>
              <Text style={styles.boardTitle}>
                {item.courseName} - {item.distance} mi
              </Text>
            </View>

            {/* PIN BUTTON */}
            <TouchableOpacity
              style={[styles.pinButton, item.isPinned && styles.pinButtonActive]}
              onPress={() => {
                if (item.isPinned) {
                  Alert.alert(
                    "Unpin Leaderboard",
                    `Remove ${item.courseName} from your pinned leaderboard?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Unpin", style: "destructive", onPress: handleUnpinCourse },
                    ]
                  );
                } else {
                  if (pinnedCourseId) {
                    Alert.alert(
                      "Replace Pinned Leaderboard",
                      `You can only pin 1 leaderboard. Replace your current pin with ${item.courseName}?`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Replace",
                          onPress: () => handlePinCourse(item.courseId, item.courseName),
                        },
                      ]
                    );
                  } else {
                    handlePinCourse(item.courseId, item.courseName);
                  }
                }
              }}
            >
              <Ionicons
                name={item.isPinned ? "pin" : "pin-outline"}
                size={20}
                color={item.isPinned ? "#FFD700" : "#666"}
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* COLUMN HEADER */}
        <View style={styles.rowHeader}>
          <Text style={styles.colPos}>POS</Text>
          <Text style={styles.colPlayer}>PLAYER</Text>
          <Text style={styles.colScore}>G</Text>
          <Text style={styles.colScore}>N</Text>
          <Text style={styles.colScore}>PAR</Text>
          <Text style={styles.colLow}>LOW</Text>
        </View>

        {/* SCORES OR EMPTY STATE */}
        {item.scores.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.boardEmptyTitle}>No Scores Yet</Text>
            <Text style={styles.boardEmptyText}>Be the first to post a score! ⛳</Text>
          </View>
        ) : (
          item.scores.map((s, i) => {
            const lowNet = Math.min(...item.scores.map((x) => x.netScore));
            const isLowman = s.netScore === lowNet;

            return (
              <View key={s.scoreId} style={styles.row}>
                <Text style={styles.colPos}>{i + 1}</Text>

                <TouchableOpacity
                  style={styles.playerCell}
                  onPress={() => goToPlayer(s.userId)}
                  activeOpacity={0.85}
                >
                  {s.userAvatar ? (
                    <Image source={{ uri: s.userAvatar }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback} />
                  )}

                  <Text style={styles.playerName} numberOfLines={1}>
                    {s.userName}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.colScore}>{s.grossScore}</Text>
                <Text style={[styles.colScore, isLowman && styles.lowNet]}>
                  {s.netScore}
                </Text>
                <Text style={styles.colScore}>{s.par || 72}</Text>
                <View style={styles.colLow}>
                  {isLowman && (
                    <Image source={LowLeaderTrophy} style={styles.trophyIcon} />
                  )}
                </View>
              </View>
            );
          })
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaProvider>
        <View style={styles.container}>
          {/* SafeAreaView WRAPS the header */}
          <SafeAreaView edges={["top"]} style={styles.safeTop}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>All Nearby Courses</Text>
              <TouchableOpacity
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onClose();
                }}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={28} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          {/* Subtitle */}
          <View style={styles.subtitle}>
            <Text style={styles.subtitleText}>
              {loading
                ? "Loading..."
                : `${boards.length} courses within 50 miles • Tap 📌 to pin`}
            </Text>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#0D5C3A" />
            </View>
          ) : boards.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="golf-outline" size={64} color="#CCC" />
              <Text style={styles.emptyTitle}>No Courses Found</Text>
              <Text style={styles.emptyText}>
                No golf courses found within 50 miles of your location
              </Text>
            </View>
          ) : (
            <FlatList
              data={boards}
              keyExtractor={(item) => item.courseId.toString()}
              renderItem={renderCourseBoard}
              contentContainerStyle={styles.listContent}
              ListFooterComponent={
                <View style={styles.footerContainer}>
                  <TouchableOpacity
                    style={styles.searchButton}
                    onPress={() => {
                      soundPlayer.play("click");
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      // Don't close modal, just navigate to open filter
                      router.push({
                        pathname: "/leaderboard",
                        params: { openFilter: "course" }, // Opens filter with course search selected
                      });
                      onClose(); // Close after navigation
                    }}
                  >
                    <Ionicons name="search" size={20} color="#0D5C3A" />
                    <Text style={styles.searchButtonText}>Can't Find Your Course?</Text>
                  </TouchableOpacity>
                  <Text style={styles.searchHint}>
                    Search by course name to find and pin any course
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  safeTop: {
    backgroundColor: "#0D5C3A",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#0D5C3A",
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  closeButton: {
    padding: 4,
  },

  subtitle: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },

  subtitleText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },

  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0D5C3A",
    marginTop: 16,
    marginBottom: 8,
  },

  emptyText: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
  },

  listContent: {
    padding: 16,
    paddingBottom: 32,
  },

  board: {
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#DDD",
    backgroundColor: "#FFF",
    borderRadius: 8,
  },

  boardHeader: {
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#DDD",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  boardHeaderLeft: {
    flex: 1,
  },

  boardTitle: {
    fontWeight: "900",
    fontSize: 16,
    color: "#0D5C3A",
  },

  pinButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#F0F0F0",
  },

  pinButtonActive: {
    backgroundColor: "#0D5C3A",
  },

  rowHeader: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#F0F0F0",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderColor: "#EEE",
  },

  colPos: { width: 40, fontWeight: "800", textAlign: "center", fontSize: 13 },
  colPlayer: { flex: 1, fontWeight: "800", fontSize: 13 },
  colScore: { width: 44, textAlign: "center", fontWeight: "700", fontSize: 13 },
  colLow: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  playerCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },

  avatar: { width: 24, height: 24, borderRadius: 12 },
  avatarFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#CCC",
  },

  playerName: { fontWeight: "700", flexShrink: 1, fontSize: 13 },

  lowNet: { color: "#C9A400", fontWeight: "900" },
  trophyIcon: {
    width: 20,
    height: 20,
    resizeMode: "contain",
  },

  emptyRow: {
    padding: 20,
    alignItems: "center",
  },

  boardEmptyTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  boardEmptyText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    textAlign: "center",
  },

  footerContainer: {
    padding: 20,
    alignItems: "center",
    gap: 8,
  },

  searchButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  searchButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  searchHint: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    textAlign: "center",
    marginTop: 4,
  },
});