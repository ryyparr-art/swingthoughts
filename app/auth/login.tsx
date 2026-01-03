import { auth } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import React, { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    console.log("🔐 Login button pressed");
    console.log("📧 Email:", email);
    
    // Play click sound + light haptic
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (!email || !password) {
      setError("Please enter both email and password");
      // Play error sound for validation
      soundPlayer.play('error');
      return;
    }

    setError("");
    setLoading(true);

    try {
      console.log("🔄 Attempting Firebase login...");
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("✅ Login successful!", userCredential.user.uid);
      
      // Play success sound + medium haptic on successful login
      soundPlayer.play('postThought');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // _layout.tsx will handle:
      // 1. Onboarding redirects (if needed)
      // 2. Location check (background)
      // 3. Clubhouse redirect (if onboarding complete)
      
    } catch (err: any) {
      console.error("❌ Login error:", err.code, err.message);
      
      // Play error sound for failed login
      soundPlayer.play('error');
      
      if (err.code === "auth/user-not-found") {
        setError("No account found with this email");
      } else if (err.code === "auth/wrong-password") {
        setError("Incorrect password");
      } else if (err.code === "auth/invalid-email") {
        setError("Invalid email address");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later");
      } else {
        setError(err.message || "Failed to log in");
      }
      
      setLoading(false);
    }
  };

  const handleSignupNavigation = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/auth/signup");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>
      
      {error !== "" && <Text style={styles.error}>{error}</Text>}
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#999"
        onChangeText={setEmail}
        value={email}
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!loading}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#999"
        onChangeText={setPassword}
        value={password}
        secureTextEntry
        editable={!loading}
      />
      
      <TouchableOpacity 
        style={[styles.button, loading && styles.buttonDisabled]} 
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>
      
      <TouchableOpacity 
        onPress={handleSignupNavigation}
        disabled={loading}
      >
        <Text style={styles.link}>Don't have an account? Sign up</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    backgroundColor: "#F4EED8",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 30,
    color: "#0D5C3A",
  },
  error: {
    color: "#e74c3c",
    marginBottom: 10,
    textAlign: "center",
    backgroundColor: "#FFFFFF",
    padding: 10,
    borderRadius: 8,
    width: "100%",
  },
  input: {
    width: "100%",
    height: 50,
    borderWidth: 1,
    borderColor: "#0D5C3A",
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 12,
    backgroundColor: "white",
  },
  button: {
    width: "100%",
    backgroundColor: "#0D5C3A",
    paddingVertical: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "white",
    textAlign: "center",
    fontWeight: "600",
    fontSize: 16,
  },
  link: {
    color: "#0D5C3A",
    textAlign: "center",
  },
});