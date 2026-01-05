import { auth } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { sendEmailVerification } from "firebase/auth";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";

export default function EmailVerificationScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    // Get current user's email
    const user = auth.currentUser;
    if (user?.email) {
      setEmail(user.email);
    } else {
      // If no user, redirect to login
      router.replace("/auth/login");
    }
  }, []);

  // Cooldown timer for resend button
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResendEmail = async () => {
    if (!auth.currentUser) {
      Alert.alert("Error", "No user found. Please sign up again.");
      return;
    }

    try {
      setLoading(true);
      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // 🔐 Force session initialization (CRITICAL in Expo)
      await auth.currentUser.reload();

      // Check if already verified
      if (auth.currentUser.emailVerified) {
        soundPlayer.play("achievement");
        Alert.alert(
          "Already Verified! ✅",
          "Your email is already verified. You can continue to the next step.",
          [
            {
              text: "Continue",
              onPress: () => {
                soundPlayer.play("click");
                router.push("/auth/user-type" as any);
              },
            },
          ]
        );
        setLoading(false);
        return;
      }

      await sendEmailVerification(auth.currentUser);
      console.log("✅ Verification email sent to:", auth.currentUser.email);

      soundPlayer.play("postThought");
      Alert.alert(
        "Email Sent! ✉️",
        "Verification email has been sent. Please check your inbox and spam folder.",
        [
          {
            text: "OK",
            onPress: () => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            },
          },
        ]
      );

      // Set 60 second cooldown
      setResendCooldown(60);
    } catch (error: any) {
      console.error("❌ Resend verification error:", error.code, error.message);
      soundPlayer.play("error");

      let errorMessage = "Failed to send verification email. Please try again.";
      
      if (error.code === "auth/too-many-requests") {
        errorMessage = "Too many requests. Please wait a few minutes before trying again.";
      }

      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = async () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // 🔐 Reload user to check verification status
    try {
      if (!auth.currentUser) {
        Alert.alert("Error", "No user found. Please sign up again.");
        return;
      }

      await auth.currentUser.reload();
      
      if (auth.currentUser.emailVerified) {
        soundPlayer.play("achievement");
        Alert.alert(
          "Email Verified! ✅",
          "Your email has been verified successfully.",
          [
            {
              text: "Continue",
              onPress: () => {
                soundPlayer.play("click");
                router.push("/auth/user-type" as any);
              },
            },
          ]
        );
      } else {
        soundPlayer.play("error");
        Alert.alert(
          "Not Verified Yet",
          "Please check your email and click the verification link before continuing. Don't forget to check your spam folder!",
          [
            {
              text: "OK",
              onPress: () => {
                soundPlayer.play("click");
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error("❌ Error checking verification:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to check verification status. Please try again.");
    }
  };

  const handleSkipForNow = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Alert.alert(
      "Skip Verification?",
      "You can continue setting up your account, but you won't be able to post, comment, or message until you verify your email.",
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            soundPlayer.play("click");
          },
        },
        {
          text: "Skip for Now",
          onPress: () => {
            soundPlayer.play("click");
            router.push("/auth/user-type" as any);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Email Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.emailIcon}>📧</Text>
        </View>

        <Text style={styles.title}>Verify Your Email</Text>

        <Text style={styles.description}>
          We've sent a verification email to:
        </Text>

        <Text style={styles.email}>{email}</Text>

        <Text style={styles.instructions}>
          Please check your inbox and click the verification link to continue.
        </Text>

        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>💡 Can't find the email?</Text>
          <Text style={styles.tip}>• Check your spam/junk folder</Text>
          <Text style={styles.tip}>• Check your promotions tab (Gmail)</Text>
          <Text style={styles.tip}>• Wait a few minutes and refresh</Text>
          <Text style={styles.tip}>• Click "Resend Email" below</Text>
        </View>

        {/* Resend Email Button */}
        <TouchableOpacity
          style={[
            styles.resendButton,
            (loading || resendCooldown > 0) && styles.buttonDisabled,
          ]}
          onPress={handleResendEmail}
          disabled={loading || resendCooldown > 0}
        >
          {loading ? (
            <ActivityIndicator color="#0D5C3A" />
          ) : (
            <Text style={styles.resendButtonText}>
              {resendCooldown > 0
                ? `Resend Email (${resendCooldown}s)`
                : "Resend Email"}
            </Text>
          )}
        </TouchableOpacity>

        {/* Continue Button */}
        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}
        >
          <Text style={styles.continueButtonText}>
            I've Verified My Email
          </Text>
        </TouchableOpacity>

        {/* Skip for Now */}
        <TouchableOpacity onPress={handleSkipForNow}>
          <Text style={styles.skipText}>Skip for Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    maxWidth: 500,
    width: "100%",
    alignSelf: "center",
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  emailIcon: {
    fontSize: 80,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#0D5C3A",
    textAlign: "center",
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 8,
  },
  email: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
    textAlign: "center",
    marginBottom: 24,
  },
  instructions: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  tipsContainer: {
    backgroundColor: "#E8F5E9",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0D5C3A",
    marginBottom: 24,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
  },
  tip: {
    fontSize: 13,
    color: "#666",
    marginBottom: 4,
    paddingLeft: 8,
  },
  resendButton: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 15,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },
  resendButtonText: {
    color: "#0D5C3A",
    textAlign: "center",
    fontWeight: "700",
    fontSize: 16,
  },
  continueButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 15,
    borderRadius: 8,
    marginBottom: 16,
  },
  continueButtonText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontWeight: "700",
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  skipText: {
    color: "#0D5C3A",
    textAlign: "center",
    fontWeight: "600",
    fontSize: 14,
    textDecorationLine: "underline",
  },
});