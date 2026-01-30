import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, useSegments } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { auth, db } from "@/constants/firebaseConfig";
import { canWrite } from "@/utils";
import { canPostScores } from "@/utils/canPostScores";
import { soundPlayer } from "@/utils/soundPlayer";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

interface BottomActionBarProps {
  isViewingOtherUser?: boolean;
  viewingUserId?: string;
  disabled?: boolean;
}

export default function BottomActionBar({
  isViewingOtherUser = false,
  viewingUserId,
  disabled = false,
}: BottomActionBarProps) {
  const segments = useSegments();
  const router = useRouter();
  const params = useLocalSearchParams();

  const current = segments[0] ?? "clubhouse";

  const [userData, setUserData] = useState<any>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [lockerNotesCount, setLockerNotesCount] = useState(0);

  /* ---------------- DETECT IF ON COURSE LOCKER ---------------- */
  const isOnCourseLocker = useMemo(() => {
    return segments[0] === "locker" && segments[1] === "course";
  }, [segments]);

  const courseId = isOnCourseLocker ? params.courseId : null;

  /* ---------------- CHECK IF FILTERS ARE ACTIVE ---------------- */
  const hasActiveFilter = useMemo(() => {
    if (current !== "leaderboard") return false;
    const filterType = params?.filterType;
    return filterType && filterType !== "nearMe";
  }, [current, params?.filterType]);

  /* ---------------- DISABLE UPDATE LOCKER ---------------- */
  const isUpdateLockerDisabled = isOnCourseLocker || isViewingOtherUser;

  /* ---------------- LOAD USER ---------------- */
  useEffect(() => {
    const loadUser = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        setUserData(snap.data());
      }
    };

    loadUser();
  }, []);

  /* ---------------- LISTEN TO NOTIFICATIONS ---------------- */
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", uid),
      where("read", "==", false)
    );

    const unsubscribe = onSnapshot(notificationsQuery, (snapshot) => {
      setNotificationCount(snapshot.size);
    });

    return () => unsubscribe();
  }, []);

  /* ---------------- LISTEN TO LOCKER NOTES (THREADS) ---------------- */
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const threadsQuery = query(
      collection(db, "threads"),
      where("participants", "array-contains", uid)
    );

    const unsubscribe = onSnapshot(threadsQuery, (snapshot) => {
      let totalUnread = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();
        const unreadForUser = data?.unreadCount?.[uid] ?? 0;
        totalUnread += unreadForUser;
      });

      setLockerNotesCount(totalUnread);
    });

    return () => unsubscribe();
  }, []);

  /* ---------------- PERMISSIONS ---------------- */
  const writable = canWrite(userData);
  const canScore = canPostScores(userData);

  /* ---------------- NAVIGATION ---------------- */
  const handleNavigation = (route: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  const requireWrite = (route: string, message: string) => {
    if (!writable) {
      soundPlayer.play("error");
      Alert.alert("Verification Pending", message);
      return;
    }
    handleNavigation(route);
  };

  const requireScore = () => {
    if (!canScore) {
      soundPlayer.play("error");
      Alert.alert(
        "Score Posting Locked",
        "Only golfers and juniors can post scores. Courses cannot post scores."
      );
      return;
    }
    handleNavigation("/post-score");
  };

  /* ---------------- RENDER ---------------- */
  const renderActions = () => {
    switch (current) {
      case "clubhouse":
        return (
          <>
            <TouchableOpacity
              onPress={() =>
                requireWrite("/create", "Posting unlocks once verification is approved.")
              }
              style={styles.actionLeft}
            >
              <Image
                source={require("@/assets/icons/Add Swing Thought.png")}
                style={styles.icon}
                resizeMode="contain"
              />
              <Text style={styles.label}>Create</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleNavigation("/notifications")}
              style={styles.actionCenter}
            >
              <View style={styles.iconContainer}>
                <Image
                  source={require("@/assets/icons/Notifications.png")}
                  style={[
                    styles.icon,
                    notificationCount > 0 && styles.iconActive,
                  ]}
                />
                {notificationCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {notificationCount > 99 ? "99+" : notificationCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.label, notificationCount > 0 && styles.labelActive]}>
                Notifications
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                requireWrite("/messages", "Messaging unlocks once verification is approved.")
              }
              style={styles.actionRight}
            >
              <View style={styles.iconContainer}>
                <Image
                  source={require("@/assets/icons/Mail.png")}
                  style={[
                    styles.icon,
                    lockerNotesCount > 0 && styles.iconActive,
                  ]}
                />
                {lockerNotesCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {lockerNotesCount > 99 ? "99+" : lockerNotesCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.label, lockerNotesCount > 0 && styles.labelActive]}>
                Locker Notes
              </Text>
            </TouchableOpacity>
          </>
        );

      case "leaderboard":
        return (
          <>
            <TouchableOpacity onPress={requireScore} style={styles.action}>
              <Image
                source={require("@/assets/icons/Post Score.png")}
                style={styles.icon}
              />
              <Text style={styles.label}>Post Score</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleNavigation("/leaderboard-filters")}
              style={styles.action}
            >
              <Image
                source={require("@/assets/icons/Leaderboard Filter.png")}
                style={[styles.icon, hasActiveFilter && styles.iconActive]}
              />
              <Text style={[styles.label, hasActiveFilter && styles.labelActive]}>
                Filter
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleNavigation("/leagues")}
              style={styles.action}
            >
              <Image
                source={require("@/assets/icons/LowLeaderTrophy.png")}
                style={styles.icon}
              />
              <Text style={styles.label}>Leagues</Text>
            </TouchableOpacity>
          </>
        );

      case "locker":
        return (
          <>
            <TouchableOpacity
              onPress={() => {
                if (!isUpdateLockerDisabled) {
                  requireWrite(
                    "/locker/modify-clubs",
                    "Locker editing unlocks once verification is approved."
                  );
                }
              }}
              style={[
                styles.action,
                isUpdateLockerDisabled && styles.actionDisabled,
              ]}
              disabled={isUpdateLockerDisabled}
            >
              <Image
                source={require("@/assets/icons/Add Club.png")}
                style={[
                  styles.icon,
                  isUpdateLockerDisabled && styles.iconDisabled,
                ]}
              />
              <Text
                style={[
                  styles.label,
                  isUpdateLockerDisabled && styles.labelDisabled,
                ]}
              >
                Update Locker
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

                if (isOnCourseLocker && courseId) {
                  router.replace(`/profile/course/${courseId}` as any);
                } else if (viewingUserId) {
                  router.replace(`/profile/${viewingUserId}` as any);
                } else {
                  const uid = auth.currentUser?.uid;
                  if (uid) router.replace(`/profile/${uid}` as any);
                }
              }}
              style={styles.action}
            >
              <Image
                source={require("@/assets/icons/Profile.png")}
                style={styles.icon}
              />
              <Text style={styles.label}>View Profile</Text>
            </TouchableOpacity>
          </>
        );

      default:
        return null;
    }
  };

  return <View style={styles.container}>{renderActions()}</View>;
}

/* ---------------- STYLES (UNCHANGED) ---------------- */

const styles = StyleSheet.create({
  container: {
    height: 50,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#0D5C3A",
    borderTopWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  action: { flex: 1, alignItems: "center" },
  actionLeft: { flex: 1, alignItems: "center" },
  actionCenter: { flex: 1, alignItems: "center" },
  actionRight: { flex: 1, alignItems: "center" },
  actionDisabled: { opacity: 0.3 },
  iconContainer: { position: "relative" },
  icon: { width: 24, height: 24, tintColor: "#FFFFFF" },
  iconActive: { tintColor: "#FFD700" },
  iconDisabled: { tintColor: "#999" },
  badge: {
    position: "absolute",
    top: -6,
    right: -8,
    backgroundColor: "#FFD700",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },
  badgeText: {
    color: "#0D5C3A",
    fontSize: 10,
    fontWeight: "700",
  },
  label: {
    color: "#FFFFFF",
    fontSize: 10,
    marginTop: 2,
    fontWeight: "600",
  },
  labelActive: { color: "#FFD700" },
  labelDisabled: { color: "#999" },
});