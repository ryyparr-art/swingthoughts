// app/welcome-tour.tsx
import { auth, db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { doc, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width, height } = Dimensions.get("window");

interface TourStep {
  background: any;
  title?: string;
  message: string;
  spotlight?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

const TOUR_STEPS: TourStep[] = [
  {
    background: require("@/assets/welcome-tour/clubhouse.png"),
    title: "Welcome to SwingThoughts",
    message: "Your golf community in one place.\nConnect, compete, and share your journey.",
  },
  {
    background: require("@/assets/welcome-tour/clubhouse.png"),
    title: "The Clubhouse",
    message: "Share your swing thoughts, celebrate wins, and connect with golfers.\n\nTap the Create button to post thoughts or photos.",
    spotlight: {
      x: 40,
      y: height - 90,
      width: 70,
      height: 40,
    },
  },
  {
    background: require("@/assets/welcome-tour/clubhouse.png"),
    title: "Low Leader Carousel",
    message: "See who's dominating courses near you.\n\nCompete for badges: Lowman, Scratch, Ace, and Hole-in-One!",
    spotlight: {
      x: 0,
      y: 65,
      width: width,
      height: 50,
    },
  },
  {
    background: require("@/assets/welcome-tour/leaderboard.png"),
    title: "Leaderboards",
    message: "Rankings by your location, tier, and time period.\n\nPost scores to climb the ranks and earn badges!",
    spotlight: {
      x: 16,
      y: 184,
      width: width - 32,
      height: height - 400,
    },
  },
  {
    background: require("@/assets/welcome-tour/leaderboard.png"),
    title: "Post Your Score",
    message: "Tap 'Post Score' to log your rounds and compete on the leaderboards!",
    spotlight: {
      x: 40,
      y: height - 90,
      width: 90,
      height: 40,
    },
  },
  {
    background: require("@/assets/welcome-tour/locker.png"),
    title: "Your Locker",
    message: "Showcase your achievements and golf equipment.\n\nTap 'Update Locker' to customize your badges and clubs!",
    spotlight: {
      x: 40,
      y: height - 90,
      width: 110,
      height: 40,
    },
  },
  {
    background: require("@/assets/welcome-tour/clubhouse.png"),
    title: "You're Ready!",
    message: "Start sharing your golf journey.\n\nPost scores, earn badges, and connect with golfers in your area.",
  },
];

export default function WelcomeTourScreen() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [autoAdvanceTimer, setAutoAdvanceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const step = TOUR_STEPS[currentStep];
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  // Auto-advance after 30 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      handleNext();
    }, 30000);

    setAutoAdvanceTimer(timer);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [currentStep]);

  const handleNext = () => {
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
    }

    if (isLastStep) {
      handleDone();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSkip = () => {
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
    }
    handleDone();
  };

  const handleDone = async () => {
    const userId = auth.currentUser?.uid;
    if (userId) {
      try {
        await updateDoc(doc(db, "users", userId), {
          hasSeenWelcomeTour: true,
        });
      } catch (error) {
        console.error("Error marking tour complete:", error);
      }
    }

    router.replace("/clubhouse" as any);
  };

  return (
    <View style={styles.container}>
      {/* Clear background with no blur */}
      <ImageBackground
        source={step.background}
        style={styles.background}
        blurRadius={0}
        resizeMode="cover"
      >
        {/* Dark overlay with spotlight cutouts */}
        {step.spotlight ? (
          <>
            {/* Top overlay */}
            <View
              style={[
                styles.overlaySection,
                {
                  top: 0,
                  left: 0,
                  right: 0,
                  height: step.spotlight.y,
                },
              ]}
            />
            {/* Left overlay */}
            <View
              style={[
                styles.overlaySection,
                {
                  top: step.spotlight.y,
                  left: 0,
                  width: step.spotlight.x,
                  height: step.spotlight.height,
                },
              ]}
            />
            {/* Right overlay */}
            <View
              style={[
                styles.overlaySection,
                {
                  top: step.spotlight.y,
                  left: step.spotlight.x + step.spotlight.width,
                  right: 0,
                  height: step.spotlight.height,
                },
              ]}
            />
            {/* Bottom overlay */}
            <View
              style={[
                styles.overlaySection,
                {
                  top: step.spotlight.y + step.spotlight.height,
                  left: 0,
                  right: 0,
                  bottom: 0,
                },
              ]}
            />

            {/* Golden border around spotlight */}
            <View
              style={[
                styles.spotlightBorder,
                {
                  top: step.spotlight.y - 4,
                  left: step.spotlight.x - 4,
                  width: step.spotlight.width + 8,
                  height: step.spotlight.height + 8,
                },
              ]}
            />
          </>
        ) : (
          <View style={styles.darkOverlay} />
        )}

        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            {/* Welcome Icon (Page 1 only) */}
            {currentStep === 0 && (
              <Image
                source={require("@/assets/icons/Clubhouse.png")}
                style={styles.welcomeIcon}
              />
            )}

            {/* Ready Icon (Last page only) */}
            {isLastStep && (
              <Ionicons name="golf" size={80} color="#FFD700" />
            )}

            {/* Tooltip Dialog */}
            <View style={styles.tooltip}>
              {step.title && (
                <Text style={styles.tooltipTitle}>{step.title}</Text>
              )}
              <Text style={styles.tooltipMessage}>{step.message}</Text>
            </View>

            {/* Progress Dots */}
            <View style={styles.dotsContainer}>
              {TOUR_STEPS.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    index === currentStep
                      ? styles.dotActive
                      : styles.dotInactive,
                  ]}
                />
              ))}
            </View>

            {/* Buttons */}
            <View style={styles.buttons}>
              <TouchableOpacity
                onPress={handleSkip}
                style={styles.skipButton}
              >
                <Text style={styles.skipText}>Skip Tour</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleNext}
                style={styles.nextButton}
              >
                <Text style={styles.nextText}>
                  {isLastStep ? "Get Started" : "Next"}
                </Text>
                {!isLastStep && (
                  <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  background: {
    flex: 1,
    width: "100%",
    height: "100%",
  },

  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
  },

  overlaySection: {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },

  spotlightBorder: {
    position: "absolute",
    borderWidth: 5,
    borderColor: "#FFD700",
    borderRadius: 12,
    shadowColor: "#FFD700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 25,
    elevation: 25,
  },

  safeArea: {
    flex: 1,
  },

  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 30,
  },

  welcomeIcon: {
    width: 100,
    height: 100,
    tintColor: "#FFFFFF",
  },

  tooltip: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    maxWidth: width - 60,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },

  tooltipTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0D5C3A",
    marginBottom: 12,
    textAlign: "center",
  },

  tooltipMessage: {
    fontSize: 16,
    color: "#333",
    lineHeight: 24,
    textAlign: "center",
  },

  dotsContainer: {
    flexDirection: "row",
    gap: 8,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  dotActive: {
    backgroundColor: "#FFD700",
    width: 24,
  },

  dotInactive: {
    backgroundColor: "rgba(255, 255, 255, 0.4)",
  },

  buttons: {
    flexDirection: "row",
    gap: 16,
    width: "100%",
    paddingHorizontal: 20,
  },

  skipButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },

  skipText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  nextButton: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#0D5C3A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },

  nextText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});