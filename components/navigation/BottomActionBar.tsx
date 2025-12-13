import * as Haptics from "expo-haptics";
import { useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { auth, db } from "@/constants/firebaseConfig";
import { canWrite } from "@/utils";
import { canPostScores } from "@/utils/canPostScores";
import { doc, getDoc } from "firebase/firestore";

export default function BottomActionBar() {
  const segments = useSegments();
  const router = useRouter();

  const current = segments[0] ?? "clubhouse";

  const [userData, setUserData] = useState<any>(null);

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

  const writable = canWrite(userData);
  const canScore = canPostScores(userData);

  const handleNavigation = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  /* ---------------- ACTION HELPERS ---------------- */

  const requireWrite = (route: string, message: string) => {
    if (!writable) {
      Alert.alert("Verification Pending", message);
      return;
    }
    handleNavigation(route);
  };

  const requireScore = () => {
    if (!canScore) {
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
              style={styles.action}
            >
              <Image
                source={require("@/assets/icons/Add Swing Thought.png")}
                style={styles.icon}
                resizeMode="contain"
              />
              <Text style={styles.label}>Create</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                requireWrite(
                  "/messages",
                  "Messaging unlocks once verification is approved."
                )
              }
              style={styles.action}
            >
              <Image
                source={require("@/assets/icons/Mail.png")}
                style={styles.icon}
                resizeMode="contain"
              />
              <Text style={styles.label}>Fanmail</Text>
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
                style={styles.icon}
                resizeMode="contain"
              />
              <Text style={styles.label}>Filter</Text>
            </TouchableOpacity>
          </>
        );

      case "locker":
        return (
          <>
            <TouchableOpacity
              onPress={() =>
                requireWrite(
                  "/locker/modify-clubs",
                  "Locker editing unlocks once verification is approved."
                )
              }
              style={styles.action}
            >
              <Image
                source={require("@/assets/icons/Add Club.png")}
                style={styles.icon}
                resizeMode="contain"
              />
              <Text style={styles.label}>Update Locker</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleNavigation("/profile")}
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
  },
  action: {
    alignItems: "center",
  },
  icon: {
    width: 24,
    height: 24,
    tintColor: "#FFFFFF",
  },
  label: {
    color: "#FFFFFF",
    fontSize: 10,
    marginTop: 2,
    fontWeight: "600",
  },
});


