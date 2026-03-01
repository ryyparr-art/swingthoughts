import { auth, db, functions } from "@/constants/firebaseConfig";
import { registerForPushNotificationsAsync } from "@/utils/pushNotificationHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { doc, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

  // Invite code
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteStatus, setInviteStatus] = useState<"idle" | "claiming" | "success" | "error">("idle");
  const [inviteMessage, setInviteMessage] = useState("");

  const handleClaimInviteCode = async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code || code.length !== 6) {
      setInviteStatus("error");
      setInviteMessage("Please enter a 6-character invite code.");
      soundPlayer.play("error");
      return;
    }

    setInviteStatus("claiming");
    setInviteMessage("");

    try {
      const claimFn = httpsCallable(functions, "claimInviteCode");
      const result = await claimFn({ inviteCode: code });
      const data = result.data as any;

      if (data.success) {
        setInviteStatus("success");
        setInviteMessage(`You've joined ${data.invitationalName}! 🏆`);
        soundPlayer.play("achievement");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setInviteStatus("error");
        setInviteMessage(data.error || "Invalid invite code.");
        soundPlayer.play("error");
      }
    } catch (err) {
      console.error("Claim invite code error:", err);
      setInviteStatus("error");
      setInviteMessage("Something went wrong. You can try again from the Events tab.");
      soundPlayer.play("error");
    }
  };

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

      // 🔔 Request push notification permissions after terms acceptance
      try {
        console.log("📱 Requesting push notification permissions...");
        const token = await registerForPushNotificationsAsync(user.uid);
        if (token) {
          console.log("✅ Push notifications enabled");
        } else {
          console.log("⏭️ Push notifications skipped (user may have denied or on simulator)");
        }
      } catch (pushError) {
        // Don't block user from continuing if push notifications fail
        console.warn("⚠️ Push notification setup failed (non-critical):", pushError);
      }

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

        {/* Invite Code (optional) */}
        <TouchableOpacity
          style={styles.inviteToggle}
          onPress={() => {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowInviteCode(!showInviteCode);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.inviteToggleText}>Have an invite code?</Text>
          <Text style={styles.inviteToggleIcon}>{showInviteCode ? "▲" : "▼"}</Text>
        </TouchableOpacity>

        {showInviteCode && (
          <View style={styles.inviteSection}>
            {inviteStatus === "success" ? (
              <View style={styles.inviteSuccessBox}>
                <Text style={styles.inviteSuccessText}>{inviteMessage}</Text>
              </View>
            ) : (
              <>
                <View style={styles.inviteInputRow}>
                  <TextInput
                    style={styles.inviteInput}
                    placeholder="Enter 6-digit code"
                    placeholderTextColor="#999"
                    value={inviteCode}
                    onChangeText={(text) => {
                      setInviteCode(text.toUpperCase().slice(0, 6));
                      if (inviteStatus === "error") setInviteStatus("idle");
                    }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={6}
                    editable={inviteStatus !== "claiming"}
                  />
                  <TouchableOpacity
                    style={[
                      styles.inviteClaimButton,
                      (inviteCode.trim().length !== 6 || inviteStatus === "claiming") &&
                        styles.buttonDisabled,
                    ]}
                    onPress={handleClaimInviteCode}
                    disabled={inviteCode.trim().length !== 6 || inviteStatus === "claiming"}
                    activeOpacity={0.8}
                  >
                    {inviteStatus === "claiming" ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <Text style={styles.inviteClaimText}>Claim</Text>
                    )}
                  </TouchableOpacity>
                </View>
                {inviteStatus === "error" && inviteMessage ? (
                  <Text style={styles.inviteError}>{inviteMessage}</Text>
                ) : null}
                <Text style={styles.inviteHint}>
                  You can also enter invite codes later from the Events tab.
                </Text>
              </>
            )}
          </View>
        )}

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

  // Invite code
  inviteToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginBottom: 4,
  },
  inviteToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  inviteToggleIcon: {
    fontSize: 10,
    color: "#0D5C3A",
  },
  inviteSection: {
    marginBottom: 16,
  },
  inviteInputRow: {
    flexDirection: "row",
    gap: 10,
  },
  inviteInput: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 12,
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    letterSpacing: 4,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  inviteClaimButton: {
    backgroundColor: "#B8860B",
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  inviteClaimText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
  inviteError: {
    color: "#C00",
    fontSize: 12,
    marginTop: 6,
    textAlign: "center",
  },
  inviteHint: {
    fontSize: 11,
    color: "#999",
    textAlign: "center",
    marginTop: 6,
  },
  inviteSuccessBox: {
    backgroundColor: "rgba(13, 92, 58, 0.08)",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(13, 92, 58, 0.2)",
  },
  inviteSuccessText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
    textAlign: "center",
  },
});




