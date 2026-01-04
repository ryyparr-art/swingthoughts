import { soundPlayer } from "@/utils/soundPlayer";
import { Caveat_400Regular, Caveat_700Bold, useFonts } from '@expo-google-fonts/caveat';
import { Slot, router, usePathname } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

export default function RootLayout() {
  const [initializing, setInitializing] = useState(true);
  const pathname = usePathname();
  const hasPlayedAppOpenSound = useRef(false);

  // Load Caveat font
  const [fontsLoaded] = useFonts({
    Caveat_400Regular,
    Caveat_700Bold,
  });

  // Load sounds on mount
  useEffect(() => {
    const initializeSounds = async () => {
      try {
        await soundPlayer.loadSounds();
        console.log("🔊 Sound system initialized");
      } catch (error) {
        console.error("⚠️ Sound initialization failed:", error);
      }
    };

    initializeSounds();

    // Cleanup on unmount
    return () => {
      soundPlayer.cleanup();
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
          
          // 🔑 Treat /auth/user-type as part of onboarding flow
          const isInOnboardingFlow = isOnboardingRoute || pathname === "/auth/user-type";

          /* =====================================================
             🚪 NO USER (LOGGED OUT)
             ===================================================== */
          if (!user) {
            console.log("❌ No user logged in");
            
            // Allowed when logged out:
            // - Hero page
            // - Auth flows (login/signup pages only, NOT user-type)
            if (isPublicRoute || (isAuthRoute && pathname !== "/auth/user-type")) {
              setInitializing(false);
              return;
            }

            // Block access to onboarding / app / user-type
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

          // User exists in Auth but not Firestore yet
          if (!userSnap.exists()) {
            console.log("📝 No Firestore doc, redirecting to user-type");
            
            // Only redirect if not already on user-type page
            if (pathname !== "/auth/user-type") {
              router.replace("/auth/user-type");
            }
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

          // ⛔ If already inside onboarding flow OR welcome tour, DO NOT redirect
          if (isInOnboardingFlow || isWelcomeTour) {
            console.log("🚧 Already in onboarding flow or welcome tour, staying put");
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

          // 2️⃣ Profile (displayName + handicap) - SKIP FOR COURSES
          if (!hasProfile && userData.userType !== "Course") {
            console.log("🔄 No profile, redirecting to setup-profile");
            router.replace("/onboarding/setup-profile");
            setInitializing(false);
            return;
          }

          // 3️⃣ Locker - SKIP FOR COURSES
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

          // 🔊 PLAY APP OPEN SOUND (ONLY ONCE on initial app launch)
          if (!hasPlayedAppOpenSound.current) {
            try {
              console.log("🔊 Playing app open sound (first time only)");
              hasPlayedAppOpenSound.current = true;
              
              // Small delay to ensure sounds are loaded
              setTimeout(async () => {
                await soundPlayer.play('appOpen');
              }, 300);
            } catch (soundErr) {
              console.error("⚠️ App open sound failed:", soundErr);
            }
          }

          // 📍 CHECK AND UPDATE LOCATION (silent background check)
          try {
            const { checkAndUpdateLocation } = await import("../utils/locationHelpers");
            console.log("📍 Checking location on app launch...");
            await checkAndUpdateLocation(user.uid);
            console.log("✅ Location check complete");
          } catch (locationErr) {
            console.error("⚠️ Location check failed (non-critical):", locationErr);
          }

          // 🏌️ CACHE NEARBY COURSES FOR NEW USERS
          try {
            const { cacheNearbyCourses } = await import("../utils/courseCache");
            const cachedCourses = userData.cachedCourses || [];
            
            // If user has no cached courses, populate them now
            if (cachedCourses.length === 0) {
              console.log("📦 No cached courses found, fetching nearby courses...");
              
              // Get user location data
              const userLat = userData.location?.latitude;
              const userLon = userData.location?.longitude;
              const userCity = userData.currentCity || userData.homeCity || userData.city;
              const userState = userData.currentState || userData.homeState || userData.state;
              
              if (userLat && userLon) {
                await cacheNearbyCourses(user.uid, userLat, userLon, userCity, userState);
                console.log("✅ Nearby courses cached");
              } else {
                console.log("⚠️ No GPS coordinates available, skipping course cache");
              }
            }
          } catch (cacheErr) {
            console.error("⚠️ Course caching failed (non-critical):", cacheErr);
          }

          // ✅ Only redirect if user is on public/auth routes - allow all app routes
          if (isPublicRoute || isAuthRoute) {
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

  if (!fontsLoaded || initializing) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0D5C3A" />
        <Text style={{ marginTop: 10 }}>Loading…</Text>
      </View>
    );
  }

  return <Slot />;
}















