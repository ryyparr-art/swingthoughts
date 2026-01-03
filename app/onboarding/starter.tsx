import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { doc, setDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const StarterImage = require("@/assets/images/StarterImage.png");

export default function Starter() {
  const router = useRouter();

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!acceptedTerms || !acceptedPrivacy) {
      setError("Please accept the Privacy Policy and Terms to continue.");
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    soundPlayer.play('click');
    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No user");

      await setDoc(
        doc(db, "users", user.uid),
        {
          acceptedTerms: true,
          acceptedPrivacy: true,
          termsAcceptedAt: new Date().toISOString(),
          privacyAcceptedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      soundPlayer.play('postThought');

      // ✅ Everyone goes to clubhouse after accepting terms
      router.replace("/clubhouse");
    } catch (err) {
      console.error(err);
      setError("Failed to complete setup. Please try again.");
      soundPlayer.play('error');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* HORIZONTAL INTRO SECTION */}
        <View style={styles.introRow}>
          <View style={styles.introText}>
            <Text style={styles.title}>Welcome to the Clubhouse</Text>
            <Text style={styles.subtitle}>
              Before getting to the first tee, first meet the starter.
            </Text>
          </View>

          <Image
            source={StarterImage}
            style={styles.introImage}
            resizeMode="contain"
          />
        </View>

        {/* ETIQUETTE BOX */}
        <View style={styles.termsSection}>
          <Text style={styles.termsTitle}>
            Swing Thoughts Community Etiquette
          </Text>

          <ScrollView style={styles.termsScroll} nestedScrollEnabled>
            <Text style={styles.termsText}>
              <Text style={styles.bold}>
                1. Respect the Course — Respect the Community{"\n"}
              </Text>
              Treat everyone as you would on the first tee.{"\n"}
              • Be courteous, supportive, and respectful.{"\n"}
              • No harassment, bullying, or abusive behavior.{"\n"}
              • Celebrate others' progress and stories.{"\n\n"}

              <Text style={styles.bold}>
                2. Play at a Good Pace{"\n"}
              </Text>
              • Avoid spamming or disruptive posting.{"\n"}
              • Engage thoughtfully with others.{"\n\n"}

              <Text style={styles.bold}>
                3. Mind Your Surroundings{"\n"}
              </Text>
              • Do not share private information.{"\n"}
              • Only post content you own.{"\n"}
              • Keep content appropriate for all.{"\n\n"}

              <Text style={styles.bold}>
                4. Honor the Integrity of the Game{"\n"}
              </Text>
              • Share genuine swings & stories.{"\n"}
              • No impersonation or fraud.{"\n\n"}

              <Text style={styles.bold}>
                5. Maintain a Clean Scorecard{"\n"}
              </Text>
              • No hate speech or explicit content.{"\n"}
              • No harmful or illegal activity.{"\n\n"}

              <Text style={styles.bold}>
                6. Play Ready Golf — But Safely{"\n"}
              </Text>
              • Report inappropriate behavior.{"\n"}
              • Prioritize safety online.{"\n\n"}

              <Text style={styles.bold}>
                7. Leave the Course Better Than You Found It{"\n"}
              </Text>
              • Encourage and uplift others.{"\n"}
              • Support a respectful community.
            </Text>
          </ScrollView>
        </View>

        {/* PRIVACY */}
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => {
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setAcceptedPrivacy(!acceptedPrivacy);
            setError("");
          }}
        >
          <View
            style={[
              styles.checkbox,
              acceptedPrivacy && styles.checkboxChecked,
            ]}
          />
          <Text style={styles.checkboxLabel}>
            I agree to the{" "}
            <Text
              style={styles.link}
              onPress={() => {
                soundPlayer.play('click');
                Linking.openURL("https://example.com/privacy");
              }}
            >
              Privacy Policy
            </Text>
          </Text>
        </TouchableOpacity>

        {/* TERMS */}
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => {
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setAcceptedTerms(!acceptedTerms);
            setError("");
          }}
        >
          <View
            style={[
              styles.checkbox,
              acceptedTerms && styles.checkboxChecked,
            ]}
          />
          <Text style={styles.checkboxLabel}>
            I agree to the{" "}
            <Text
              style={styles.link}
              onPress={() => {
                soundPlayer.play('click');
                Linking.openURL("https://example.com/terms");
              }}
            >
              Terms & Conditions
            </Text>
          </Text>
        </TouchableOpacity>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[
            styles.continueButton,
            (!acceptedTerms || !acceptedPrivacy || loading) &&
              styles.buttonDisabled,
          ]}
          onPress={handleContinue}
          disabled={!acceptedTerms || !acceptedPrivacy || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.continueText}>Enter Clubhouse</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  scrollContent: {
    paddingTop: 80,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  introRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 16,
  },

  introText: {
    flex: 1,
  },

  introImage: {
    width: 120,
    height: 120,
  },

  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 6,
  },

  subtitle: {
    fontSize: 15,
    color: "#666",
  },

  termsSection: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    marginBottom: 20,
  },

  termsTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 12,
  },

  termsScroll: {
    maxHeight: 360,
  },

  termsText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#333",
  },

  bold: {
    fontWeight: "700",
  },

  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    marginRight: 10,
  },

  checkboxChecked: {
    backgroundColor: "#0D5C3A",
  },

  checkboxLabel: {
    fontSize: 15,
    color: "#333",
    flexShrink: 1,
  },

  link: {
    color: "#0D5C3A",
    textDecorationLine: "underline",
    fontWeight: "600",
  },

  error: {
    color: "#C00",
    textAlign: "center",
    marginBottom: 12,
  },

  continueButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },

  buttonDisabled: {
    opacity: 0.4,
  },

  continueText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
});





