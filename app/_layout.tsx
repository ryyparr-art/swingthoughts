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
          const publicRoutes = ["/", "/index"];
          const isPublicRoute = publicRoutes.includes(pathname);
          const isAuthRoute = pathname.startsWith("/auth");
          const isOnboardingRoute = pathname.startsWith("/onboarding");

          // 🚪 No user
          if (!user) {
            if (isPublicRoute || isAuthRoute) {
              setInitializing(false);
              return;
            }
            router.replace("/");
            setInitializing(false);
            return;
          }

          // 👤 User
          const userSnap = await getDoc(doc(db, "users", user.uid));
          if (!userSnap.exists()) {
            router.replace("/auth/user-type");
            setInitializing(false);
            return;
          }

          const userData = userSnap.data();

          const hasUserType =
            typeof userData.userType === "string" &&
            userData.userType.trim() !== "";

          const hasProfile =
            typeof userData.displayName === "string" &&
            userData.displayName.trim() !== "" &&
            userData.handicap !== null &&
            userData.handicap !== undefined;

          const hasAcceptedTerms = userData.acceptedTerms === true;

          // 1️⃣ User type
          if (!hasUserType) {
            router.replace("/auth/user-type");
            setInitializing(false);
            return;
          }

          // 2️⃣ Verification (SHOW ONCE ONLY)
          const shouldShowVerification =
            (userData.userType === "PGA Professional" ||
              userData.userType === "Course") &&
            userData.verification?.status == null &&
            pathname === "/auth/user-type";

          if (shouldShowVerification) {
            router.replace("/onboarding/verification");
            setInitializing(false);
            return;
          }

          // 3️⃣ Profile
          if (!hasProfile) {
            router.replace("/onboarding/setup-profile");
            setInitializing(false);
            return;
          }

          // 4️⃣ Starter / terms
          if (!hasAcceptedTerms) {
            router.replace("/onboarding/starter");
            setInitializing(false);
            return;
          }

          // ✅ Done
          if (isPublicRoute || isAuthRoute || isOnboardingRoute) {
            router.replace("/clubhouse");
            setInitializing(false);
            return;
          }

          setInitializing(false);
        });

        return () => unsubscribe();
      } catch (err) {
        console.error("Auth init error:", err);
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













