import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HeroLandingPage() {
  const router = useRouter();

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showEmailVerificationModal, setShowEmailVerificationModal] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);

  /* ================= LOGIN ================= */

  const handleLogin = async () => {
    soundPlayer.play('click');
    setLoginError("");

    if (!loginEmail || !loginPassword) {
      soundPlayer.play('error');
      setLoginError("Please enter both email and password");
      return;
    }

    setLoginLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      console.log("✅ Login successful:", userCredential.user.email);
      
      soundPlayer.play('postThought');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowLoginModal(false);
      setLoginLoading(false);
      
      // User should be automatically redirected by auth state listener
      // But we can add explicit navigation if needed
    } catch (err: any) {
      console.error("❌ Login error:", err.code, err.message);
      
      soundPlayer.play('error');
      
      let errorMessage = "Login failed. Please try again.";
      
      // Provide specific error messages
      if (err.code === "auth/invalid-email") {
        errorMessage = "Invalid email address format.";
      } else if (err.code === "auth/user-not-found") {
        errorMessage = "No account found with this email.";
      } else if (err.code === "auth/wrong-password") {
        errorMessage = "Incorrect password.";
      } else if (err.code === "auth/too-many-requests") {
        errorMessage = "Too many failed attempts. Try again later.";
      } else if (err.code === "auth/invalid-credential") {
        errorMessage = "Invalid email or password.";
      }
      
      setLoginError(errorMessage);
      setLoginLoading(false);
      
      // Also show in Alert for debugging
      if (__DEV__) {
        Alert.alert("Login Error", `${err.code}: ${err.message}`);
      }
    }
  };

  /* ================= SIGNUP ================= */

  const handleSignup = async () => {
    soundPlayer.play('click');
    setSignupError("");

    if (!signupEmail || !signupPassword || !signupConfirmPassword) {
      soundPlayer.play('error');
      setSignupError("Please fill in all fields");
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      soundPlayer.play('error');
      setSignupError("Passwords do not match");
      return;
    }

    if (signupPassword.length < 6) {
      soundPlayer.play('error');
      setSignupError("Password must be at least 6 characters");
      return;
    }

    setSignupLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        signupEmail,
        signupPassword
      );
      
      const user = userCredential.user;
      console.log("✅ Signup successful:", user.email);

      // 🔐 Force session initialization (CRITICAL in Expo)
      await user.reload();

      // ✅ SEND EMAIL VERIFICATION
      try {
        await sendEmailVerification(user);
        console.log("✅ Verification email sent to:", user.email);
      } catch (verifyError: any) {
        console.error(
          "❌ Verification email failed:",
          verifyError.code,
          verifyError.message
        );
      }

      // 📍 CREATE FIRESTORE USER DOCUMENT
      const { doc: firestoreDoc, setDoc, serverTimestamp } = await import("firebase/firestore");
      
      await setDoc(firestoreDoc(db, "users", user.uid), {
        userId: user.uid,
        email: user.email,
        emailVerified: false, // ← Will be set to true when user verifies email
        createdAt: serverTimestamp(),

        // Location data (empty for now, will be filled during onboarding)
        homeCity: "",
        homeState: "",
        currentCity: "",
        currentState: "",
        locationPermission: false,
        locationMethod: "manual",
        homeLocation: null,
        currentLocation: null,
        currentLocationUpdatedAt: serverTimestamp(),
        locationHistory: [],

        // ✅ ANTI-BOT FIELDS
        displayName: null,
        displayNameLower: null,
        lastPostTime: null,
        lastCommentTime: null,
        lastMessageTime: null,
        lastScoreTime: null,
        banned: false,

        // Onboarding status
        userType: null,
        handicap: null,
        acceptedTerms: false,
        verified: false,
        lockerCompleted: false,
      });

      console.log("✅ Firestore user document created with emailVerified: false");

      soundPlayer.play('postThought');
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );

      setSignupLoading(false);
      setShowSignupModal(false);

      // Show email verification modal
      setVerificationEmail(user.email || signupEmail);
      setShowEmailVerificationModal(true);
    } catch (err: any) {
      console.error("❌ Signup error:", err.code, err.message);
      
      soundPlayer.play('error');
      
      let errorMessage = "Signup failed. Please try again.";
      
      // Provide specific error messages
      if (err.code === "auth/email-already-in-use") {
        errorMessage = "This email is already registered.";
      } else if (err.code === "auth/invalid-email") {
        errorMessage = "Invalid email address format.";
      } else if (err.code === "auth/weak-password") {
        errorMessage = "Password is too weak.";
      }
      
      setSignupError(errorMessage);
      setSignupLoading(false);
      
      // Also show in Alert for debugging
      if (__DEV__) {
        Alert.alert("Signup Error", `${err.code}: ${err.message}`);
      }
    }
  };

  const openLoginModal = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoginEmail("");
    setLoginPassword("");
    setLoginError("");
    setShowLoginModal(true);
  };

  const openSignupModal = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSignupEmail("");
    setSignupPassword("");
    setSignupConfirmPassword("");
    setSignupError("");
    setShowSignupModal(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Image
            source={require("@/assets/images/HeroPage.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.tagline}>
          Where Golfers and their stories Live
          <Text style={styles.trademark}>™</Text>
        </Text>

        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={openLoginModal}
          >
            <Ionicons
              name="golf"
              size={24}
              color="#0D5C3A"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.primaryButtonText}>
              Enter Clubhouse
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={openSignupModal}
          >
            <Ionicons
              name="person-add"
              size={24}
              color="#FFFFFF"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.secondaryButtonText}>
              Become a Member
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ================= LOGIN MODAL ================= */}
      <Modal
        visible={showLoginModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLoginModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter Clubhouse</Text>
              <TouchableOpacity onPress={() => {
                soundPlayer.play('click');
                setShowLoginModal(false);
              }}>
                <Ionicons name="close" size={28} color="#0D5C3A" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#999"
              value={loginEmail}
              onChangeText={setLoginEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#999"
              value={loginPassword}
              onChangeText={setLoginPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
            />

            {loginError ? (
              <Text style={styles.errorText}>{loginError}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.modalButton, loginLoading && styles.disabledButton]}
              onPress={handleLogin}
              disabled={loginLoading}
            >
              {loginLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.modalButtonText}>Login</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                soundPlayer.play('click');
                setShowLoginModal(false);
                openSignupModal();
              }}
            >
              <Text style={styles.switchText}>
                Don't have an account?{" "}
                <Text style={styles.switchTextBold}>Sign up</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ================= SIGNUP MODAL ================= */}
      <Modal
        visible={showSignupModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSignupModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Become a Member</Text>
              <TouchableOpacity onPress={() => {
                soundPlayer.play('click');
                setShowSignupModal(false);
              }}>
                <Ionicons name="close" size={28} color="#0D5C3A" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#999"
              value={signupEmail}
              onChangeText={setSignupEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#999"
              value={signupPassword}
              onChangeText={setSignupPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
            />

            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              placeholderTextColor="#999"
              value={signupConfirmPassword}
              onChangeText={setSignupConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
            />

            {signupError ? (
              <Text style={styles.errorText}>{signupError}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.modalButton, signupLoading && styles.disabledButton]}
              onPress={handleSignup}
              disabled={signupLoading}
            >
              {signupLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.modalButtonText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                soundPlayer.play('click');
                setShowSignupModal(false);
                openLoginModal();
              }}
            >
              <Text style={styles.switchText}>
                Already have an account?{" "}
                <Text style={styles.switchTextBold}>Login</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* ================= EMAIL VERIFICATION MODAL ================= */}
      <Modal
        visible={showEmailVerificationModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {}} // Prevent dismissing - must verify
      >
        <EmailVerificationModal
          email={verificationEmail}
          onVerified={() => {
            setShowEmailVerificationModal(false);
            router.replace("/auth/user-type" as any);
          }}
        />
      </Modal>
    </SafeAreaView>
  );
}

/* ================= EMAIL VERIFICATION MODAL COMPONENT ================= */

function EmailVerificationModal({ 
  email, 
  onVerified
}: { 
  email: string; 
  onVerified: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // ✅ AUTO-CHECK FOR VERIFICATION every 3 seconds
  React.useEffect(() => {
    const checkInterval = setInterval(async () => {
      if (!auth.currentUser) return;

      try {
        // Force reload to get latest verification status from Firebase Auth
        await auth.currentUser.reload();

        if (auth.currentUser.emailVerified) {
          console.log("✅ Email verified! Auto-advancing...");
          
          // Update Firestore document
          try {
            await updateDoc(doc(db, "users", auth.currentUser.uid), {
              emailVerified: true,
            });
            console.log("✅ Firestore emailVerified updated to true");
          } catch (firestoreError) {
            console.error("❌ Failed to update Firestore:", firestoreError);
          }

          // Play success sound
          soundPlayer.play('achievement');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

          // Auto-advance to next step
          clearInterval(checkInterval);
          onVerified();
        }
      } catch (error) {
        console.error("❌ Auto-check error:", error);
      }
    }, 3000); // Check every 3 seconds

    // Cleanup on unmount
    return () => clearInterval(checkInterval);
  }, [onVerified]);

  // Cooldown timer
  React.useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleResendEmail = async () => {
    if (!auth.currentUser) return;

    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // 🔐 Force session reload (CRITICAL in Expo)
      await auth.currentUser.reload();

      // Check if already verified
      if (auth.currentUser.emailVerified) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "Already Verified! ✅",
          "Your email is already verified.",
          [{ text: "Continue", onPress: onVerified }]
        );
        setLoading(false);
        return;
      }

      // Send verification email
      await sendEmailVerification(auth.currentUser);
      console.log("✅ Verification email resent to:", auth.currentUser.email);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Email Sent! ✉️",
        "Verification email sent. Check your inbox and spam folder."
      );

      setResendCooldown(60);
    } catch (error: any) {
      console.error("❌ Resend error:", error.code, error.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      
      let errorMessage = "Failed to send email. Please try again.";
      if (error.code === "auth/too-many-requests") {
        errorMessage = "Too many requests. Wait a few minutes.";
      }
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.modalOverlay}
    >
      <View style={styles.emailModalContent}>
        {/* Email Icon */}
        <View style={styles.emailIconContainer}>
          <Text style={styles.emailIconText}>📧</Text>
        </View>

        <Text style={styles.emailModalTitle}>Verify Your Email</Text>

        <Text style={styles.emailDescription}>
          We've sent a verification email to:
        </Text>

        <Text style={styles.emailAddress}>{email}</Text>

        <Text style={styles.emailInstructions}>
          Please check your inbox and click the verification link.
        </Text>

        {/* Tips Box */}
        <View style={styles.tipsBox}>
          <Text style={styles.tipsTitle}>💡 Can't find the email?</Text>
          <Text style={styles.tipText}>• Check spam/junk folder</Text>
          <Text style={styles.tipText}>• Check promotions tab (Gmail)</Text>
          <Text style={styles.tipText}>• Wait a few minutes</Text>
          <Text style={styles.tipText}>• Click "Resend Email" below</Text>
        </View>

        {/* Resend Button */}
        <TouchableOpacity
          style={[
            styles.emailSecondaryButton,
            (loading || resendCooldown > 0) && styles.disabledButton
          ]}
          onPress={handleResendEmail}
          disabled={loading || resendCooldown > 0}
        >
          {loading ? (
            <ActivityIndicator color="#0D5C3A" />
          ) : (
            <Text style={styles.emailSecondaryButtonText}>
              {resendCooldown > 0
                ? `Resend Email (${resendCooldown}s)`
                : "Resend Email"}
            </Text>
          )}
        </TouchableOpacity>

        {/* Auto-detection message */}
        <View style={styles.autoDetectBox}>
          <Text style={styles.autoDetectText}>
            ✨ Waiting for verification...
          </Text>
          <Text style={styles.autoDetectSubtext}>
            Click the link in your email and we'll automatically continue
          </Text>
          <ActivityIndicator 
            size="small" 
            color="#0D5C3A" 
            style={{ marginTop: 8 }}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D5C3A" },
  content: {
    flex: 1,
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  logoContainer: {
    marginBottom: 40,
    shadowColor: "#FFD700",
    shadowOpacity: 0.3,
    shadowRadius: 15,
  },
  logo: {
    width: 380,
    height: 190,
    tintColor: "#FFFFFF",
  },
  tagline: {
    fontSize: 18,
    color: "#FFFFFF",
    fontStyle: "italic",
  },
  trademark: { fontSize: 12 },
  buttonsContainer: { width: "100%", gap: 16 },
  primaryButton: {
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: "#FFD700",
    paddingVertical: 16,
    borderRadius: 12,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  secondaryButton: {
    flexDirection: "row",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    paddingVertical: 16,
    borderRadius: 12,
  },
  secondaryButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  input: {
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
  },
  modalButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.6,
  },
  switchText: {
    textAlign: "center",
    color: "#666",
    fontSize: 14,
  },
  switchTextBold: {
    color: "#0D5C3A",
    fontWeight: "700",
  },
  // Email Verification Modal
  emailModalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "90%",
  },
  emailIconContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  emailIconText: {
    fontSize: 64,
  },
  emailModalTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0D5C3A",
    textAlign: "center",
    marginBottom: 16,
  },
  emailDescription: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 8,
  },
  emailAddress: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
    textAlign: "center",
    marginBottom: 16,
  },
  emailInstructions: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  tipsBox: {
    backgroundColor: "#F0F9F4",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0D5C3A",
    marginBottom: 20,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
  },
  tipText: {
    fontSize: 13,
    color: "#666",
    marginBottom: 4,
    paddingLeft: 8,
  },
  emailSecondaryButton: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },
  emailSecondaryButtonText: {
    color: "#0D5C3A",
    fontSize: 16,
    fontWeight: "700",
  },
  emailPrimaryButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  emailPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  emailSkipText: {
    textAlign: "center",
    color: "#0D5C3A",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  autoDetectBox: {
    backgroundColor: "#F0F9F4",
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0D5C3A",
    alignItems: "center",
  },
  autoDetectText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 4,
  },
  autoDetectSubtext: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
  },
});