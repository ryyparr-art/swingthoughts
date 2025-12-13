import { auth } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HeroLandingPage() {
  const router = useRouter();

  // Modal states
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSignupModal, setShowSignupModal] = useState(false);

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Signup form
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);

  // ========== LOGIN HANDLERS ==========
  const handleLogin = async () => {
    setLoginError("");

    if (!loginEmail || !loginPassword) {
      setLoginError("Please enter both email and password");
      return;
    }

    setLoginLoading(true);

    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // _layout.tsx will handle redirect based on onboarding status
      setShowLoginModal(false);
    } catch (err: any) {
      console.error("Login error:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      
      // User-friendly error messages
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        setLoginError("Invalid email or password");
      } else if (err.code === "auth/invalid-email") {
        setLoginError("Invalid email address");
      } else {
        setLoginError("Login failed. Please try again.");
      }
      
      setLoginLoading(false);
    }
  };

  // ========== SIGNUP HANDLERS ==========
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
      await createUserWithEmailAndPassword(auth, signupEmail, signupPassword);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // _layout.tsx will redirect to /auth/user-type
      setShowSignupModal(false);
    } catch (err: any) {
      console.error("Signup error:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      // User-friendly error messages
      if (err.code === "auth/email-already-in-use") {
        setSignupError("This email is already registered");
      } else if (err.code === "auth/invalid-email") {
        setSignupError("Invalid email address");
      } else if (err.code === "auth/weak-password") {
        setSignupError("Password is too weak");
      } else {
        setSignupError("Signup failed. Please try again.");
      }

      setSignupLoading(false);
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
        {/* Logo with white tint and subtle glow */}
        <View style={styles.logoContainer}>
          <Image
            source={require("@/assets/images/HeroPage.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Tagline */}
        <Text style={styles.tagline}>
          Where Golfers and their stories Live<Text style={styles.trademark}>™</Text>
        </Text>

        {/* Buttons */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={openLoginModal}
            activeOpacity={0.8}
          >
            <Ionicons name="golf" size={24} color="#0D5C3A" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>Enter Clubhouse</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={openSignupModal}
            activeOpacity={0.8}
          >
            <Ionicons name="person-add" size={24} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.secondaryButtonText}>Become a Member</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ========== LOGIN MODAL ========== */}
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
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowLoginModal(false)}
          />

          <View style={styles.modalContent}>
            {/* Close Button */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowLoginModal(false)}
            >
              <Ionicons name="close" size={28} color="#0D5C3A" />
            </TouchableOpacity>

            <ScrollView 
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalTitle}>Welcome Back</Text>
              <Text style={styles.modalSubtitle}>Enter your credentials to continue</Text>

              {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}

              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#999"
                value={loginEmail}
                onChangeText={setLoginEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!loginLoading}
                returnKeyType="next"
                blurOnSubmit={false}
              />

              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#999"
                value={loginPassword}
                onChangeText={setLoginPassword}
                secureTextEntry
                editable={!loginLoading}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />

              <TouchableOpacity
                style={[styles.modalButton, loginLoading && styles.modalButtonDisabled]}
                onPress={handleLogin}
                disabled={loginLoading}
                activeOpacity={0.8}
              >
                {loginLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalButtonText}>Sign In</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => {
                setShowLoginModal(false);
                setTimeout(() => openSignupModal(), 300);
              }}>
                <Text style={styles.switchText}>
                  Don't have an account? <Text style={styles.switchTextBold}>Sign up</Text>
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ========== SIGNUP MODAL ========== */}
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
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowSignupModal(false)}
          />

          <View style={styles.modalContent}>
            {/* Close Button */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowSignupModal(false)}
            >
              <Ionicons name="close" size={28} color="#0D5C3A" />
            </TouchableOpacity>

            <ScrollView 
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalTitle}>Join the Clubhouse</Text>
              <Text style={styles.modalSubtitle}>Create your account to get started</Text>

              {signupError ? <Text style={styles.errorText}>{signupError}</Text> : null}

              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#999"
                value={signupEmail}
                onChangeText={setSignupEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!signupLoading}
                returnKeyType="next"
                blurOnSubmit={false}
              />

              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#999"
                value={signupPassword}
                onChangeText={setSignupPassword}
                secureTextEntry
                editable={!signupLoading}
                returnKeyType="next"
                blurOnSubmit={false}
              />

              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor="#999"
                value={signupConfirmPassword}
                onChangeText={setSignupConfirmPassword}
                secureTextEntry
                editable={!signupLoading}
                returnKeyType="done"
                onSubmitEditing={handleSignup}
              />

              <TouchableOpacity
                style={[styles.modalButton, signupLoading && styles.modalButtonDisabled]}
                onPress={handleSignup}
                disabled={signupLoading}
                activeOpacity={0.8}
              >
                {signupLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalButtonText}>Create Account</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => {
                setShowSignupModal(false);
                setTimeout(() => openLoginModal(), 300);
              }}>
                <Text style={styles.switchText}>
                  Already have an account? <Text style={styles.switchTextBold}>Sign in</Text>
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D5C3A",
  },

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
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
  },

  logo: {
    width: 380,
    height: 190,
    tintColor: "#FFFFFF",
  },

  tagline: {
    fontSize: 18,
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 0,
    fontWeight: "500",
    fontStyle: "italic",
    letterSpacing: 0.5,
  },

  trademark: {
    fontSize: 12,
    verticalAlign: "top",
  },

  buttonsContainer: {
    width: "100%",
    maxWidth: 400,
    gap: 16,
  },

  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFD700",
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  primaryButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
    letterSpacing: 0.5,
  },

  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  secondaryButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },

  // ========== MODAL STYLES ==========
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },

  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },

  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    maxHeight: "85%",
  },

  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 8,
  },

  modalTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
    textAlign: "center",
  },

  modalSubtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 24,
    textAlign: "center",
  },

  errorText: {
    fontSize: 14,
    color: "#FF3B30",
    backgroundColor: "#FFE5E5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    textAlign: "center",
  },

  input: {
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#333",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  modalButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
  },

  modalButtonDisabled: {
    opacity: 0.6,
  },

  modalButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  switchText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },

  switchTextBold: {
    fontWeight: "700",
    color: "#0D5C3A",
  },
});