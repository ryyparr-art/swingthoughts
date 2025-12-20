import { Slot, router, usePathname } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

export default function RootLayout() {
  const [initializing, setInitializing] = useState(true);
  const pathname = usePathname();

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
            userType: userData.userType,
            displayName: userData.displayName,
            handicap: userData.handicap,
            lockerCompleted: userData.lockerCompleted,
            hasAcceptedTerms: userData.acceptedTerms,
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

          // ⛔ If already inside onboarding flow, DO NOT redirect
          if (isInOnboardingFlow) {
            console.log("🚧 Already in onboarding flow, staying put");
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

          // 2️⃣ Profile (displayName + handicap)
          if (!hasProfile) {
            console.log("🔄 No profile, redirecting to setup-profile");
            router.replace("/onboarding/setup-profile");
            setInitializing(false);
            return;
          }

          // 3️⃣ Locker (optional but required to proceed)
          if (!hasLocker) {
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

          // Prevent auth / onboarding / hero access once complete
          if (isPublicRoute || isAuthRoute) {
            console.log("🔄 Redirecting to clubhouse");
            router.replace("/clubhouse");
            setInitializing(false);
            return;
          }

          console.log("✅ User is in correct location");
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

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#0D5C3A" />
        <Text style={{ marginTop: 10 }}>Loading…</Text>
      </View>
    );
  }

  return <Slot />;
}

















