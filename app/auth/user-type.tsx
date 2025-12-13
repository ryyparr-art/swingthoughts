import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import BackIcon from "@/assets/icons/Back.png"; // back icon
import LocationInputModal from "../../components/LocationInputModal";
import { auth, db } from "../../constants/firebaseConfig";

type UserType =
  | "Golfer"
  | "Junior"
  | "PGA Professional"
  | "Course";

export default function UserTypeScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingLocation, setSavingLocation] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [selectedType, setSelectedType] =
    useState<UserType | null>(null);

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
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      const { status } =
        await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") return false;

      const location =
        await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      const geocode = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      const user = auth.currentUser;
      if (!user) return false;

      await setDoc(
        doc(db, "users", user.uid),
        {
          location: {
            type: "gps",
            latitude,
            longitude,
            city: geocode[0]?.city || null,
            state: geocode[0]?.region || null,
            lastUpdated: new Date(),
          },
        },
        { merge: true }
      );

      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  const routeAfterTypeSelection = (type: UserType) => {
    if (type === "PGA Professional" || type === "Course") {
      router.replace("/onboarding/verification");
    } else {
      router.replace("/onboarding/setup-profile");
    }
  };

  const handleManualLocation = async (
    city: string,
    state: string,
    zip: string
  ) => {
    const user = auth.currentUser;
    if (!user || !selectedType) return;

    await setDoc(
      doc(db, "users", user.uid),
      {
        location: {
          type: "manual",
          city,
          state,
          zip: zip || null,
          lastUpdated: new Date(),
        },
      },
      { merge: true }
    );

    setShowLocationModal(false);
    routeAfterTypeSelection(selectedType);
  };

  const handleSelectType = async (type: UserType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedType(type);

    const user = auth.currentUser;
    if (!user) {
      router.replace("/");
      return;
    }

    try {
      setSavingLocation(true);

      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        await setDoc(ref, {
          userId: user.uid,
          email: user.email,
          createdAt: new Date(),
          userType: type,
          displayName: "",
          handicap: null,
          badges: [],
          avatar: null,
          acceptedTerms: false,
        });
      } else {
        await setDoc(
          ref,
          { userType: type },
          { merge: true }
        );
      }

      const locationGranted =
        await requestLocationPermission();

      if (!locationGranted) {
        setSavingLocation(false);
        setShowLocationModal(true);
      } else {
        routeAfterTypeSelection(type);
      }
    } catch (error) {
      console.error(error);
      setSavingLocation(false);
    }
  };

  if (loading || savingLocation) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
        <Text style={styles.loadingText}>
          {savingLocation
            ? "Setting up your profile..."
            : "Loading..."}
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
      {/* ===== Back Button ===== */}
      <View style={styles.topNav}>
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(
              Haptics.ImpactFeedbackStyle.Light
            );
            router.replace("/");
          }}
        >
          <Image
            source={BackIcon}
            style={styles.navIcon}
          />
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
          <Text style={styles.title}>
            Select your golfer type
          </Text>

          {[
            { label: "GOLFER", value: "Golfer" },
            { label: "JUNIOR", value: "Junior" },
            {
              label: "PGA PRO",
              value: "PGA Professional",
            },
            { label: "COURSE", value: "Course" },
          ].map((item) => (
            <TouchableOpacity
              key={item.value}
              activeOpacity={0.85}
              onPress={() =>
                handleSelectType(item.value as UserType)
              }
              style={styles.buttonWrapper}
            >
              <BlurView
                intensity={45}
                tint="dark"
                style={styles.blurButton}
              >
                <Text style={styles.typeButtonText}>
                  {item.label}
                </Text>
              </BlurView>
            </TouchableOpacity>
          ))}
        </Animated.View>

        <LocationInputModal
          visible={showLocationModal}
          onSubmit={handleManualLocation}
          onCancel={() => {
            setShowLocationModal(false);
            if (selectedType) {
              routeAfterTypeSelection(selectedType);
            }
          }}
        />
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },

  topNav: {
    position: "absolute",
    top: 48,
    left: 20,
    zIndex: 10,
  },

  navIcon: {
    width: 28,
    height: 28,
  },

  /* your other styles remain unchanged */

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
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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

