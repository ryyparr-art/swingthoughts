import { auth } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
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
    setLoginError("");

    if (!loginEmail || !loginPassword) {
      setLoginError("Please enter both email and password");
      return;
    }

    setLoginLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      console.log("✅ Login successful:", userCredential.user.email);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowLoginModal(false);
      setLoginLoading(false);
      
      // User should be automatically redirected by auth state listener
      // But we can add explicit navigation if needed
    } catch (err: any) {
      console.error("❌ Login error:", err.code, err.message);
      
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
    setSignupError("");

    if (!signupEmail || !signupPassword || !signupConfirmPassword) {
      setSignupError("Please fill in all fields");
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setSignupError("Passwords do not match");
      return;
    }

    if (signupPassword.length < 6) {
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
      
      console.log("✅ Signup successful:", userCredential.user.email);

      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      );

      setSignupLoading(false);
      setShowSignupModal(false);

      // ✅ EXPLICIT ROUTING (REQUIRED)
      console.log("🚀 Navigating to /auth/user-type");
      router.replace("/auth/user-type");
    } catch (err: any) {
      console.error("❌ Signup error:", err.code, err.message);
      
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoginEmail("");
    setLoginPassword("");
    setLoginError("");
    setShowLoginModal(true);
  };

  const openSignupModal = () => {
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
              <TouchableOpacity onPress={() => setShowLoginModal(false)}>
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
              <TouchableOpacity onPress={() => setShowSignupModal(false)}>
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
    </SafeAreaView>
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
});