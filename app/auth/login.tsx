import { auth } from "@/constants/firebaseConfig";
import { useRouter } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    console.log("🔐 Login button pressed");
    console.log("📧 Email:", email);
    
    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }

    setError("");
    setLoading(true);

    try {
      console.log("🔄 Attempting Firebase login...");
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log("✅ Login successful!", userCredential.user.uid);
      // _layout.tsx will handle the redirect automatically
    } catch (err: any) {
      console.error("❌ Login error:", err.code, err.message);
      setError(err.message);
      setLoading(false);
    }
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
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#999"
        onChangeText={setPassword}
        value={password}
        secureTextEntry
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
      
      <TouchableOpacity onPress={() => router.push("/auth/signup")}>
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
    color: "red",
    marginBottom: 10,
    textAlign: "center",
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