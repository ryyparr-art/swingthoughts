import { soundPlayer } from "@/utils/soundPlayer";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { deleteUser } from "firebase/auth";
import { deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../constants/firebaseConfig";

const BackIcon = require("@/assets/icons/Back.png");

type UserType =
  | "Golfer"
  | "Junior"
  | "PGA Professional"
  | "Course";

export default function UserTypeScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    checkIfUserAlreadyCompletedOnboarding();
  }, []);

  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [loading]);

  const checkIfUserAlreadyCompletedOnboarding = async () => {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/");
      return;
    }

    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) {
        setLoading(false);
        return;
      }

      const data = snap.data();
      const onboardingComplete =
        data.userType &&
        data.displayName &&
        data.handicap !== null &&
        data.acceptedTerms === true;

      if (onboardingComplete) {
        router.replace("/clubhouse");
        return;
      }

      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  /* =======================
     BACK → START FRESH CONFIRMATION
     ======================= */
  const handleBack = () => {
    // Play click sound + light haptic
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Alert.alert(
      "Start Fresh?",
      "Going back will delete your account so you can start over. You'll need to sign up again.",
      [
        { 
          text: "Cancel", 
          style: "cancel",
          onPress: () => {
            // Play click on cancel
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        },
        {
          text: "Start Fresh",
          style: "destructive",
          onPress: async () => {
            try {
              // Play error sound for destructive action
              soundPlayer.play('error');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

              setSavingType(true);
              const user = auth.currentUser;
              
              if (user) {
                // Delete Firestore document
                try {
                  await deleteDoc(doc(db, "users", user.uid));
                  console.log("✅ Deleted Firestore document");
                } catch (err) {
                  console.log("⚠️ No Firestore doc to delete or error:", err);
                }

                // Delete Auth user
                try {
                  await deleteUser(user);
                  console.log("✅ Deleted Auth user");
                } catch (err: any) {
                  console.error("❌ Delete user error:", err);
                  
                  // If requires recent login, just sign out
                  if (err.code === "auth/requires-recent-login") {
                    console.log("⚠️ Requires recent login, signing out instead");
                    await auth.signOut();
                  }
                }
              }

              // Play success notification
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              
              // Return to hero page
              router.replace("/");
            } catch (err) {
              console.warn("Start fresh failed:", err);
              // Play error sound
              soundPlayer.play('error');
              router.replace("/");
            }
          },
        },
      ]
    );
  };

  const handleSelectType = async (type: UserType) => {
    // Play click sound + medium haptic for selection
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const user = auth.currentUser;
    if (!user) {
      // Play error sound if no user
      soundPlayer.play('error');
      router.replace("/");
      return;
    }

    try {
      setSavingType(true);

      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        // ✅ New user - create document
        await setDoc(ref, {
          userId: user.uid,
          email: user.email,
          createdAt: new Date(),
          userType: type,
          displayName: null,
          displayNameLower: null,
          handicap: null,
          badges: [],
          avatar: null,
          acceptedTerms: false,
          verified: false,
          banned: false,
          // Location fields (will be set in setup-profile)
          location: null,
          homeCity: "",
          homeState: "",
          homeLocation: null,
          homeCountry: "",
          currentCity: "",
          currentState: "",
          currentLocation: null,
          locationMethod: "manual",
          locationPermission: false,
          locationHistory: [],
          // Rate limiting
          lastPostTime: null,
          lastCommentTime: null,
          lastMessageTime: null,
          lastScoreTime: null,
          // Only add verification for PGA Pro / Course
          ...(type === "PGA Professional" || type === "Course"
            ? {
                verification: {
                  required: true,
                  status: "pending",
                },
              }
            : {}),
        });
      } else {
        // ✅ Existing user - update type
        if (type === "PGA Professional" || type === "Course") {
          // Add verification object for pro/course types
          await setDoc(
            ref,
            {
              userType: type,
              verified: false,
              verification: {
                required: true,
                status: "pending",
              },
            },
            { merge: true }
          );
        } else {
          // ✅ FIX: Remove verification object for Golfer/Junior
          // They don't need verification - use deleteField() to actually remove it
          await updateDoc(ref, {
            userType: type,
            verified: false,
            verification: deleteField(),
          });
        }
      }

      // Play success sound after saving
      soundPlayer.play('postThought');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // ✅ Route based on user type
      if (type === "Course") {
        // Courses skip profile/locker and go straight to verification
        router.replace("/onboarding/verification");
      } else {
        // Everyone else goes to setup-profile
        router.replace("/onboarding/setup-profile");
      }
    } catch (error) {
      console.error("Error saving user type:", error);
      // Play error sound on failure
      soundPlayer.play('error');
      setSavingType(false);
    }
  };

  if (loading || savingType) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
        <Text style={styles.loadingText}>
          {savingType ? "Setting up your account..." : "Loading..."}
        </Text>
      </View>
    );
  }

  return (
    <ImageBackground
      source={require("../../assets/images/PlayerType.png")}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.topNav}>
        <TouchableOpacity onPress={handleBack}>
          <Image source={BackIcon} style={styles.navIcon} />
        </TouchableOpacity>
      </View>

      <View style={styles.overlay}>
        <Animated.View
          style={{
            width: "100%",
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          <Text style={styles.title}>Select your golfer type</Text>

          {[
            { label: "GOLFER", value: "Golfer" },
            { label: "JUNIOR", value: "Junior" },
            { label: "PGA PRO", value: "PGA Professional" },
            { label: "COURSE", value: "Course" },
          ].map((item) => (
            <TouchableOpacity
              key={item.value}
              activeOpacity={0.85}
              onPress={() => handleSelectType(item.value as UserType)}
              style={styles.buttonWrapper}
            >
              <BlurView intensity={45} tint="dark" style={styles.blurButton}>
                <Text style={styles.typeButtonText}>{item.label}</Text>
              </BlurView>
            </TouchableOpacity>
          ))}
        </Animated.View>
      </View>
    </ImageBackground>
  );
}

/* -------- STYLES -------- */
const styles = StyleSheet.create({
  background: { flex: 1 },
  topNav: { position: "absolute", top: 48, left: 20, zIndex: 10 },
  navIcon: { width: 28, height: 28 },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 28,
    color: "#FFFFFF",
    textAlign: "center",
  },
  buttonWrapper: {
    width: "100%",
    marginBottom: 14,
    borderRadius: 14,
    overflow: "hidden",
  },
  blurButton: {
    paddingVertical: 16,
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  typeButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#0D5C3A",
  },
});



