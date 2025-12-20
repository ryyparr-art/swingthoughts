import { auth, db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "firebase/storage";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface UserSettings {
  displayName: string;
  email: string;
  avatar?: string;
  personalName?: string;
  birthday?: string;
  gender?: string;
  location?: {
    city?: string;
    state?: string;
    zip?: string;
  };
}

export default function SettingsScreen() {
  const router = useRouter();
  const userId = auth.currentUser?.uid;

  const [settings, setSettings] = useState<UserSettings>({
    displayName: "",
    email: "",
    avatar: "",
    personalName: "",
    birthday: "",
    gender: "",
    location: {
      city: "",
      state: "",
      zip: "",
    },
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    if (!userId) return;

    try {
      const userDoc = await getDoc(doc(db, "users", userId));

      if (userDoc.exists()) {
        const data = userDoc.data();
        setSettings({
          displayName: data.displayName || "",
          email: data.email || "",
          avatar: data.avatar || "",
          personalName: data.personalName || "",
          birthday: data.birthday || "",
          gender: data.gender || "",
          location: {
            city: data.location?.city || "",
            state: data.location?.state || "",
            zip: data.location?.zip || "",
          },
        });
      }
      setLoading(false);
    } catch (err) {
      console.error("Error fetching settings:", err);
      setLoading(false);
    }
  };

  /* ------------------ SAVE PROFILE ------------------ */
  const handleSave = async () => {
    if (!userId) return;

    try {
      setSaving(true);

      await updateDoc(doc(db, "users", userId), {
        displayName: settings.displayName,
        personalName: settings.personalName,
        birthday: settings.birthday,
        gender: settings.gender,
        location: settings.location,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Settings updated successfully");
      setSaving(false);
    } catch (err) {
      console.error("Save error:", err);
      setSaving(false);
      Alert.alert("Error", "Failed to update settings");
    }
  };

  /* ------------------ PICK + UPLOAD AVATAR ------------------ */
  const handlePickAvatar = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        Alert.alert("Permission required", "Photo access is needed.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // square crop (will render as circle)
        quality: 0.9,
      });

      if (result.canceled || !result.assets[0] || !userId) return;

      setUploadingAvatar(true);

      const imageUri = result.assets[0].uri;

      // Convert image to blob
      const response = await fetch(imageUri);
      const blob = await response.blob();

      // Upload to Firebase Storage
      const storage = getStorage();
      const avatarRef = ref(storage, `avatars/${userId}/avatar.jpg`);

      await uploadBytes(avatarRef, blob);

      // Get public URL
      const downloadURL = await getDownloadURL(avatarRef);

      // Save URL to Firestore
      await updateDoc(doc(db, "users", userId), {
        avatar: downloadURL,
      });

      // Update local state
      setSettings({ ...settings, avatar: downloadURL });

      setUploadingAvatar(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error("Avatar error:", err);
      setUploadingAvatar(false);
      Alert.alert("Error", "Failed to update profile photo");
    }
  };

  /* ------------------ LOGOUT ------------------ */
  const handleLogout = async () => {
    const confirmed =
      Platform.OS === "web"
        ? window.confirm("Log out?")
        : await new Promise<boolean>((resolve) =>
            Alert.alert("Log Out", "Are you sure?", [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              {
                text: "Log Out",
                style: "destructive",
                onPress: () => resolve(true),
              },
            ])
          );

    if (!confirmed) return;

    await signOut(auth);
    router.replace("/auth/login");
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Ionicons name="checkmark" size={24} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* AVATAR */}
        <View style={styles.avatarSection}>
          {uploadingAvatar ? (
            <ActivityIndicator size="large" color="#0D5C3A" />
          ) : settings.avatar ? (
            <Image source={{ uri: settings.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {settings.displayName[0]?.toUpperCase() || "?"}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.changeAvatarButton}
            onPress={handlePickAvatar}
          >
            <Ionicons name="camera" size={18} color="#FFF" />
            <Text style={styles.changeAvatarText}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        {/* DISPLAY NAME */}
        <TextInput
          style={styles.input}
          placeholder="Display Name"
          value={settings.displayName}
          onChangeText={(t) =>
            setSettings({ ...settings, displayName: t })
          }
        />

        {/* LOGOUT */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

/* ------------------ STYLES ------------------ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  safeTop: { backgroundColor: "#0D5C3A" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#0D5C3A",
  },
  headerTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },

  scrollContent: {
    padding: 20,
  },

  avatarSection: {
    alignItems: "center",
    marginBottom: 24,
  },

  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60, // ✅ circular
    borderWidth: 3,
    borderColor: "#0D5C3A",
    marginBottom: 12,
  },

  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },

  avatarInitial: {
    fontSize: 48,
    color: "#FFF",
    fontWeight: "700",
  },

  changeAvatarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },

  changeAvatarText: {
    color: "#FFF",
    fontWeight: "600",
  },

  input: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    fontSize: 16,
  },

  logoutButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FF3B30",
    backgroundColor: "#FFF5F5",
  },

  logoutText: {
    color: "#FF3B30",
    fontWeight: "700",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
