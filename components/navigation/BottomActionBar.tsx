import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter, useSegments } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { auth, db } from "@/constants/firebaseConfig";
import { canWrite } from "@/utils";
import { canPostScores } from "@/utils/canPostScores";
import { soundPlayer } from "@/utils/soundPlayer";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";

interface BottomActionBarProps {
  isViewingOtherUser?: boolean;
  viewingUserId?: string; // The userId whose locker/profile we're viewing
  disabled?: boolean;
}

export default function BottomActionBar({ 
  isViewingOtherUser = false,
  viewingUserId, // NEW PROP
  disabled = false
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
    // Check if route is /locker/course/[courseId]
    return segments[0] === "locker" && segments[1] === "course";
  }, [segments]);

  const courseId = isOnCourseLocker ? params.courseId : null;

  /* ---------------- CHECK IF FILTERS ARE ACTIVE ---------------- */
  const hasActiveFilter = useMemo(() => {
    if (current !== "leaderboard") return false;

    const filterType = params?.filterType;
    
    // Filter is active if it's anything other than "nearMe" (default)
    // Or if it's "nearMe" but was explicitly set (not default load)
    return filterType && filterType !== "nearMe";
  }, [current, params?.filterType]);

  /* ---------------- DETERMINE IF UPDATE LOCKER SHOULD BE DISABLED ---------------- */
  const isUpdateLockerDisabled = isOnCourseLocker || isViewingOtherUser;

  /* ---------------- LOAD USER ONCE ---------------- */
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

    // Real-time listener for unread notifications
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

  /* ---------------- LISTEN TO LOCKER NOTES ---------------- */
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    // Real-time listener for unread locker notes
    const messagesQuery = query(
      collection(db, "messages"),
      where("receiverId", "==", uid),
      where("read", "==", false)
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      setLockerNotesCount(snapshot.size);
    });

    return () => unsubscribe();
  }, []);

  const writable = canWrite(userData);
  const canScore = canPostScores(userData);

  const handleNavigation = (route: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  /* ---------------- ACTION HELPERS ---------------- */

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

  /* ---------------- RENDER ACTIONS ---------------- */

  const renderActions = () => {
    switch (current) {
      case "clubhouse":
        return (
          <>
            <TouchableOpacity
              onPress={() =>
                requireWrite(
                  "/create",
                  "Posting unlocks once verification is approved."
                )
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
                  resizeMode="contain"
                />
                {notificationCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[
                styles.label,
                notificationCount > 0 && styles.labelActive,
              ]}>
                Notifications
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                requireWrite(
                  "/messages",
                  "Messaging unlocks once verification is approved."
                )
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
                  resizeMode="contain"
                />
                {lockerNotesCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {lockerNotesCount > 99 ? '99+' : lockerNotesCount}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[
                styles.label,
                lockerNotesCount > 0 && styles.labelActive,
              ]}>
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
                resizeMode="contain"
              />
              <Text style={styles.label}>Post Score</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleNavigation("/leaderboard-filters")}
              style={styles.action}
            >
              <Image
                source={require("@/assets/icons/Leaderboard Filter.png")}
                style={[
                  styles.icon,
                  hasActiveFilter && styles.iconActive,
                ]}
                resizeMode="contain"
              />
              <Text style={[
                styles.label,
                hasActiveFilter && styles.labelActive,
              ]}>
                Filter
              </Text>
            </TouchableOpacity>
          </>
        );

      case "locker":
        return (
          <>
            {/* UPDATE LOCKER - Disabled on course lockers OR when viewing other users */}
            <TouchableOpacity
              onPress={() => {
                if (isUpdateLockerDisabled) {
                  // Do nothing - button is disabled
                  return;
                }
                requireWrite(
                  "/locker/modify-clubs",
                  "Locker editing unlocks once verification is approved."
                );
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
                resizeMode="contain"
              />
              <Text style={[
                styles.label,
                isUpdateLockerDisabled && styles.labelDisabled,
              ]}>
                Update Locker
              </Text>
            </TouchableOpacity>

            {/* VIEW PROFILE - FIXED: Routes to correct profile */}
            <TouchableOpacity
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                
                if (isOnCourseLocker && courseId) {
                  // On course locker → Go to course profile
                  console.log("📍 Navigating to course profile:", `/profile/course/${courseId}`);
                  router.replace(`/profile/course/${courseId}` as any);
                } else if (viewingUserId) {
                  // Viewing another user's locker → Go to THEIR profile
                  console.log("📍 Navigating to user profile:", `/profile/${viewingUserId}`);
                  router.replace(`/profile/${viewingUserId}` as any);
                } else {
                  // On own locker → Go to own profile
                  console.log("📍 Navigating to own profile");
                  const uid = auth.currentUser?.uid;
                  if (uid) {
                    router.replace(`/profile/${uid}` as any);
                  }
                }
              }}
              style={styles.action}
            >
              <Image
                source={require("@/assets/icons/Profile.png")}
                style={styles.icon}
                resizeMode="contain"
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

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: {
    height: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#0D5C3A",
    borderTopWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    paddingBottom: 8,
    paddingLeft: 56,
    paddingRight: 34,
  },
  action: {
    alignItems: "center",
  },
  actionLeft: {
    alignItems: "center",
  },
  actionCenter: {
    alignItems: "center",
    marginLeft: 24,
  },
  actionRight: {
    alignItems: "center",
    marginLeft: 12,
  },
  actionDisabled: {
    opacity: 0.3,
  },
  iconContainer: {
    position: "relative",
  },
  icon: {
    width: 24,
    height: 24,
    tintColor: "#FFFFFF",
  },
  iconActive: {
    tintColor: "#FFD700",
  },
  iconDisabled: {
    tintColor: "#999",
  },
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
  labelActive: {
    color: "#FFD700",
  },
  labelDisabled: {
    color: "#999",
  },
});