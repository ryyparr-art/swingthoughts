import LocationPickerModal from "@/components/modals/LocationPickerModal";
import ResumeRoundSheet from "@/components/scoring/ResumeRoundSheet";
import { CacheProvider } from "@/contexts/CacheContext";
import { NewPostProvider } from "@/contexts/NewPostContext";
import { claimGhostScores } from "@/utils/ghostClaim";
import { markNotificationAsRead } from "@/utils/notificationHelpers";
import { registerForPushNotificationsAsync, setupNotificationResponseListener } from "@/utils/pushNotificationHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import { Caveat_400Regular, Caveat_700Bold, useFonts } from '@expo-google-fonts/caveat';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Asset } from "expo-asset";
import * as Notifications from 'expo-notifications';
import { Slot, router, usePathname } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Text, View } from "react-native";
import "../patches/disableClippedSubviews";

export default function RootLayout() {
  const [initializing, setInitializing] = useState(true);
  const pathname = usePathname();
  const hasPlayedAppOpenSound = useRef(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Load Caveat font
  const [fontsLoaded] = useFonts({
    Caveat_400Regular,
    Caveat_700Bold,
  });

  // Initialize sounds on mount - MUST happen early to activate audio session
  useEffect(() => {
    // Initialize audio session immediately so sounds work from first tap
    soundPlayer.init();

    // Preload locker background so it renders instantly on first visit
    Asset.loadAsync(require("@/assets/locker/locker-bg.png"));
    
    return () => {
      soundPlayer.release();
    };
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { auth, db } = await import("../constants/firebaseConfig");
        const { onAuthStateChanged } = await import("firebase/auth");
        const { doc, getDoc } = await import("firebase/firestore");

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
          console.log("🔍 Auth state changed. User:", user?.email || "none", "Path:", pathname);

          const isPublicRoute = pathname === "/" || pathname === "/index";
          const isAuthRoute = pathname.startsWith("/auth");
          const isOnboardingRoute = pathname.startsWith("/onboarding");
          const isWelcomeTour = pathname === "/welcome-tour";
          
          // 🔑 Auth flow pages (login/signup only - email verification is now a modal on hero page)
          const isInAuthFlow = pathname === "/auth/login";
          const isInOnboardingFlow = isOnboardingRoute || pathname === "/auth/user-type";

          /* =====================================================
             🚪 NO USER (LOGGED OUT)
             ===================================================== */
          if (!user) {
            console.log("❌ No user logged in");
            
            if (isPublicRoute || isInAuthFlow) {
              setInitializing(false);
              return;
            }

            console.log("🔄 Redirecting to hero page");
            router.replace("/");
            setInitializing(false);
            return;
          }

          /* =====================================================
             👤 USER EXISTS
             ===================================================== */
          console.log("✅ User logged in:", user.email);

          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);

          if (!userSnap.exists()) {
            console.log("📝 No Firestore doc, allowing to stay on current page");
            
            if (isPublicRoute || pathname === "/auth/user-type") {
              setInitializing(false);
              return;
            }
            
            router.replace("/");
            setInitializing(false);
            return;
          }

          const userData = userSnap.data();
          console.log("📄 User data:", {
            displayName: userData.displayName,
            handicap: userData.handicap,
            hasAcceptedTerms: userData.acceptedTerms,
            lockerCompleted: userData.lockerCompleted,
            userType: userData.userType,
            regionKey: userData.regionKey,
          });

          const hasUserType =
            typeof userData.userType === "string" &&
            userData.userType.trim() !== "";

          const hasProfile =
            typeof userData.displayName === "string" &&
            userData.displayName.trim() !== "" &&
            userData.handicap !== null &&
            userData.handicap !== undefined;

          const hasLocker = userData.lockerCompleted === true;
          const hasAcceptedTerms = userData.acceptedTerms === true;

          /* =====================================================
             🧭 ONBOARDING GATE (ENTRY ONLY)
             ===================================================== */

          if (isInOnboardingFlow || isWelcomeTour) {
            console.log("🚧 Already in onboarding flow or welcome tour, staying put");
            setInitializing(false);
            return;
          }

          // 🔐 Email Verification Gate
          const hasVerifiedEmail = userData.emailVerified === true;
          if (!hasVerifiedEmail) {
            console.log("📧 Email not verified, staying on hero page for verification modal");
            if (!isPublicRoute) {
              router.replace("/");
            }
            setInitializing(false);
            return;
          }

          // 1️⃣ User type
          if (!hasUserType) {
            console.log("🔄 No user type, redirecting to user-type");
            router.replace("/auth/user-type");
            setInitializing(false);
            return;
          }

          // 2️⃣ Profile
          if (!hasProfile && userData.userType !== "Course") {
            console.log("🔄 No profile, redirecting to setup-profile");
            router.replace("/onboarding/setup-profile");
            setInitializing(false);
            return;
          }

          // 3️⃣ Locker
          if (!hasLocker && userData.userType !== "Course") {
            console.log("🔄 Locker not completed, redirecting to setup-locker");
            router.replace("/onboarding/setup-locker");
            setInitializing(false);
            return;
          }

          // 4️⃣ Verification (PGA / Course only)
          const needsVerification =
            (userData.userType === "PGA Professional" ||
              userData.userType === "Course") &&
            !userData.verification?.submittedAt;

          if (needsVerification) {
            console.log("🔄 Needs verification, redirecting");
            router.replace("/onboarding/verification");
            setInitializing(false);
            return;
          }

          // 5️⃣ Terms / Starter
          if (!hasAcceptedTerms) {
            console.log("🔄 No terms accepted, redirecting to starter");
            router.replace("/onboarding/starter");
            setInitializing(false);
            return;
          }

          /* =====================================================
             ✅ ONBOARDING COMPLETE
             ===================================================== */
          console.log("✅ Onboarding complete!");

          // 🎓 CHECK IF USER NEEDS WELCOME TOUR
          const hasSeenWelcomeTour = userData.hasSeenWelcomeTour === true;
          
          if (!hasSeenWelcomeTour) {
            console.log("🎓 First time after onboarding, showing welcome tour");
            router.replace("/welcome-tour" as any);
            setInitializing(false);
            return;
          }

          // 👻 CHECK FOR PENDING GHOST CLAIM
          try {
            const pendingToken = await AsyncStorage.getItem("pendingClaimToken");
            if (pendingToken) {
              await AsyncStorage.removeItem("pendingClaimToken");
              const result = await claimGhostScores(pendingToken, user.uid);
              if (result.success) {
                setTimeout(() => {
                  Alert.alert(
                    "Welcome! Scores Claimed!",
                    `${result.scoresUpdated} score(s) from ${result.courseName} added to your profile.`
                  );
                }, 1000);
              }
            }
          } catch (claimErr) {
            console.error("⚠️ Ghost claim check failed (non-critical):", claimErr);
          }

          // 🔊 PLAY APP OPEN SOUND (ONLY ONCE on initial app launch)
          if (!hasPlayedAppOpenSound.current) {
            try {
              console.log("🔊 Playing app open sound (first time only)");
              hasPlayedAppOpenSound.current = true;
              
              setTimeout(async () => {
                await soundPlayer.play('appOpen');
              }, 300);
            } catch (soundErr) {
              console.error("⚠️ App open sound failed:", soundErr);
            }
          }

          // 📍 CHECK AND UPDATE LOCATION + REGION (silent background check)
          try {
            const { checkAndUpdateLocation } = await import("../utils/locationHelpers");
            console.log("📍 Checking location and region on app launch...");
            await checkAndUpdateLocation(user.uid);
            console.log("✅ Location and region check complete");
          } catch (locationErr) {
            console.error("⚠️ Location check failed (non-critical):", locationErr);
          }

          // ✅ REGION-BASED ARCHITECTURE
          // - Courses are now cached on-demand in leaderboard/index.tsx
          // - Leaderboards are hydrated when user visits their region
          // - No need for upfront course caching on app launch
          // - User's regionKey is assigned/updated via locationHelpers

          // ⚠️ Check if user has regionKey (for migration period)
          if (!userData.regionKey) {
            console.log("⚠️ User missing regionKey, showing location picker");
            setShowLocationPicker(true);
          }

          // ✅ Only redirect if user is on public/auth routes - allow all app routes
          if (isPublicRoute || (isAuthRoute && !isInAuthFlow)) {
            console.log("🔄 Redirecting to clubhouse");
            router.replace("/clubhouse");
            setInitializing(false);
            return;
          }

          // ✅ User is authenticated and on a valid app route
          console.log("✅ User authenticated, allowing navigation to:", pathname);
          setInitializing(false);
        });

        return () => unsubscribe();
      } catch (err) {
        console.error("❌ Auth init error:", err);
        setInitializing(false);
      }
    };

    initAuth();
  }, [pathname]);

  // 🔔 PUSH NOTIFICATIONS SETUP
  useEffect(() => {
    let authModule: any = null;

    Notifications.setBadgeCountAsync(0);
    
    const setupPushNotifications = async () => {
      try {
        authModule = await import("../constants/firebaseConfig");
        const uid = authModule.auth.currentUser?.uid;
        
        if (!uid) {
          console.log("⏭️ Skipping push notification setup - no user logged in");
          return;
        }

        const token = await registerForPushNotificationsAsync(uid);
        if (token) {
          console.log("✅ Push notifications registered successfully");
        }
      } catch (error) {
        console.error("❌ Error setting up push notifications:", error);
      }
    };

    const notificationResponseSubscription = setupNotificationResponseListener(async (response) => {
      const data = response.notification.request.content.data;
      const type = data.type as string;
      const notificationId = data.notificationId as string;
      
      console.log("📬 Notification tapped:", { type, notificationId, ...data });

      if (notificationId) {
        try {
          await markNotificationAsRead(notificationId);
          console.log("✅ Notification marked as read:", notificationId);
        } catch (error) {
          console.error("❌ Error marking notification as read:", error);
        }
      }

      if (!authModule) {
        authModule = await import("../constants/firebaseConfig");
      }

      switch (type) {
        case "like":
        case "comment":
        case "comment_like":
        case "reply":
        case "share":
        case "mention_post":
        case "mention_comment":
        case "partner_posted":
        case "trending":
          if (data.postId) {
            router.push({
              pathname: "/clubhouse",
              params: { highlightPostId: data.postId as string },
            });
          }
          break;

        case "partner_scored":
        case "partner_holeinone":
        case "holeinone_verified":
        case "holeinone_pending_poster":
          if (data.postId) {
            router.push({
              pathname: "/clubhouse",
              params: { highlightPostId: data.postId as string },
            });
          } else if (data.scoreId) {
            router.push({
              pathname: "/clubhouse",
              params: { highlightScoreId: data.scoreId as string },
            });
          }
          break;

        case "partner_lowman":
          if (data.courseId) {
            router.push({
              pathname: "/leaderboard",
              params: {
                filterType: "course",
                courseId: String(data.courseId),
                highlightCourseId: String(data.courseId),
                highlightUserId: data.actorId as string,
              },
            });
          }
          break;

        case "holeinone_verification_request":
          if (data.scoreId) {
            router.push(`/verify-holeinone/${data.scoreId}`);
          }
          break;

        case "holeinone_denied":
          if (data.userId) {
            router.push(`/locker/${data.userId}`);
          }
          break;

        case "partner_request":
        case "partner_accepted":
          if (data.actorId) {
            router.push(`/locker/${data.actorId}`);
          }
          break;

        case "message":
        case "group_message":
          if (data.threadId) {
            router.push(`/messages/${data.threadId}`);
          } else if (data.actorId) {
            const currentUserId = authModule.auth.currentUser?.uid;
            if (currentUserId) {
              const threadId = [currentUserId, data.actorId as string].sort().join("_");
              router.push(`/messages/${threadId}`);
            } else {
              router.push("/messages");
            }
          } else {
            router.push("/messages");
          }
          break;

       case "round_invite":
          if (data.roundId) {
            if (data.navigationTarget === "scoring") {
            router.push(`/scoring?roundId=${data.roundId}&resume=true`);
          } else {
            router.push(`/round/${data.roundId}`);
          }
        }
        break;

        case "round_complete":
        case "round_notable":
          if (data.roundId) {
            router.push(`/round/${data.roundId}`);
          }
          break;

        case "marker_transfer":
          if (data.roundId) {
            router.push(`/scoring?roundId=${data.roundId}&resume=true`);
          }
          break;

        case "marker_transfer_request":
          if (data.roundId) {
            router.push(`/scoring?roundId=${data.roundId}&resume=true`);
          }
          break;

        case "outing_complete":
          if (data.roundId) {
            router.push(`/round/${data.roundId}`);
          }
          break;  

        default:
          console.log("⚠️ Unknown notification type, using fallback routing:", type);
          
          if (data.postId) {
            router.push({
              pathname: "/clubhouse",
              params: { highlightPostId: data.postId as string },
            });
          } else if (data.scoreId) {
            router.push({
              pathname: "/clubhouse",
              params: { highlightScoreId: data.scoreId as string },
            });
          } else if (data.actorId) {
            router.push(`/locker/${data.actorId}`);
          } else if (data.courseId) {
            router.push({
              pathname: "/leaderboard",
              params: { highlightCourseId: String(data.courseId) },
            });
          } else {
            router.push("/notifications");
          }
          break;
      }
    });

    setupPushNotifications();

    return () => {
      notificationResponseSubscription.remove();
    };
  }, []);

  // 👻 GHOST CLAIM DEEP LINK HANDLER
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const claimMatch = event.url.match(/\/claim\/([a-f0-9]+)/);
      if (!claimMatch) return;

      const token = claimMatch[1];
      const { auth } = await import("../constants/firebaseConfig");
      const user = auth.currentUser;

      if (user) {
        const result = await claimGhostScores(token, user.uid);
        if (result.success) {
          Alert.alert(
            "Scores Claimed!",
            `${result.scoresUpdated} score(s) from ${result.courseName} added to your profile.`
          );
        } else {
          Alert.alert("Claim Failed", result.error || "Something went wrong.");
        }
      } else {
        await AsyncStorage.setItem("pendingClaimToken", token);
      }
    };

    const sub = Linking.addEventListener("url", handleDeepLink);
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => sub.remove();
  }, []);

  if (!fontsLoaded || initializing) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0D5C3A" />
        <Text style={{ marginTop: 10 }}>Loading…</Text>
      </View>
    );
  }

  return (
    <CacheProvider>
      <NewPostProvider>
        <Slot />
        <ResumeRoundSheet />
        <LocationPickerModal
          visible={showLocationPicker}
          onClose={() => setShowLocationPicker(false)}
          onLocationSet={() => setShowLocationPicker(false)}
        />
      </NewPostProvider>
    </CacheProvider>
  );
}