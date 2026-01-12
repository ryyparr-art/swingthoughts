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
  title: string;
  message: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    background: require("@/assets/guided-tour/TopNav.png"),
    title: "Welcome to the Clubhouse",
    message: "Explore Swing Thoughts, achievements, and activity from other golfers in your region.\n\nThis is the Top Navigation bar where you can navigate from the Clubhouse, to Leaderboards, or to your Locker.",
  },
  {
    background: require("@/assets/guided-tour/Low Leader.png"),
    title: "Low Leaders",
    message: "This shows active Low Leader scores from golfers and courses in your region.",
  },
  {
    background: require("@/assets/guided-tour/Bottom Action Bar.png"),
    title: "Bottom Action Bar",
    message: "Here you can create Swing Thoughts, check your notifications, and read notes left in your locker.",
  },
  {
    background: require("@/assets/guided-tour/Club House Wander.png"),
    title: "Wander the Clubhouse",
    message: "Find more thoughts, explore different posts, or discover other golfers in your area.",
  },
  {
    background: require("@/assets/guided-tour/LeaderBoard.png"),
    title: "Leaderboards",
    message: "Displays leaderboard scores from courses in your region.\n\nCompete for top spots and earn badges!",
  },
  {
    background: require("@/assets/guided-tour/Post Score Filter.png"),
    title: "Post a Score",
    message: "Post a score and become a Low Leader!\n\nOr filter the leaderboard to find partners, specific courses, or explore other regions.",
  },
  {
    background: require("@/assets/guided-tour/Locker.png"),
    title: "Your Locker",
    message: "This is your locker. Show off your achievements, your current game identity, and what gear you're currently using.\n\nYou can also request to Partner-up with other golfers when viewing their locker.",
  },
  {
    background: require("@/assets/guided-tour/Update Locker.png"),
    title: "Update Your Locker",
    message: "Update your locker to your liking, or view your profile.",
  },
  {
    background: require("@/assets/guided-tour/Profile.png"),
    title: "Your Profile",
    message: "This is your profile which captures your thoughts, scores, and more.\n\nYou can also access your settings here.",
  },
  {
    background: require("@/assets/guided-tour/Locker Notes.png"),
    title: "Locker Notes",
    message: "Leave notes for your partners, or read notes left for you.\n\nStay connected with your golf community!",
  },
];

export default function WelcomeTourScreen() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [autoAdvanceTimer, setAutoAdvanceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const step = TOUR_STEPS[currentStep];
  const isLastStep = currentStep === TOUR_STEPS.length - 1;
  const isFirstStep = currentStep === 0;

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

  const handleBack = () => {
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
    }

    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
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
      {/* Background screenshot with subtle dark overlay */}
      <ImageBackground
        source={step.background}
        style={styles.background}
        blurRadius={0}
        resizeMode="cover"
      >
        {/* Subtle dark overlay for readability */}
        <View style={styles.darkOverlay} />

        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            {/* Welcome Icon (First page only) */}
            {isFirstStep && (
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
              <Text style={styles.tooltipTitle}>{step.title}</Text>
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
              {/* Back Button (only show after first step) */}
              {!isFirstStep && (
                <TouchableOpacity
                  onPress={handleBack}
                  style={styles.backButton}
                >
                  <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                  <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
              )}

              {/* Skip Button (only show before last step) */}
              {!isLastStep && (
                <TouchableOpacity
                  onPress={handleSkip}
                  style={[styles.skipButton, !isFirstStep && styles.skipButtonSmaller]}
                >
                  <Text style={styles.skipText}>Skip Tour</Text>
                </TouchableOpacity>
              )}

              {/* Next/Get Started Button */}
              <TouchableOpacity
                onPress={handleNext}
                style={[styles.nextButton, isFirstStep && styles.nextButtonWide]}
              >
                <Text style={styles.nextText}>
                  {isLastStep ? "You're next on the Tee" : "Next"}
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
    backgroundColor: "rgba(0, 0, 0, 0.5)",
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
    flexWrap: "wrap",
    justifyContent: "center",
    maxWidth: width - 40,
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
    gap: 12,
    width: "100%",
    paddingHorizontal: 20,
  },

  backButton: {
    flexDirection: "row",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },

  backText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
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

  skipButtonSmaller: {
    flex: 0,
    paddingHorizontal: 20,
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

  nextButtonWide: {
    flex: 2,
  },

  nextText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});