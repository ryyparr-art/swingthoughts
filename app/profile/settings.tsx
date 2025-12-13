import { auth, db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
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
    } catch (error) {
      console.error("Error fetching settings:", error);
      setLoading(false);
    }
  };

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
      
      if (Platform.OS === 'web') {
        alert("Settings updated successfully!");
      } else {
        Alert.alert("Success", "Settings updated successfully!");
      }
      
      setSaving(false);
    } catch (error) {
      console.error("Error saving settings:", error);
      setSaving(false);
      
      if (Platform.OS === 'web') {
        alert("Failed to update settings. Please try again.");
      } else {
        Alert.alert("Error", "Failed to update settings. Please try again.");
      }
    }
  };

  const handlePickAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== "granted") {
        if (Platform.OS === 'web') {
          alert("Permission denied. Please enable photo access.");
        } else {
          Alert.alert("Permission Denied", "Please enable photo access in settings.");
        }
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingAvatar(true);
        
        // TODO: Upload to Firebase Storage
        // For now, just use the local URI (this won't persist)
        const avatarUrl = result.assets[0].uri;
        
        await updateDoc(doc(db, "users", userId!), {
          avatar: avatarUrl,
        });

        setSettings({ ...settings, avatar: avatarUrl });
        setUploadingAvatar(false);
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Error picking avatar:", error);
      setUploadingAvatar(false);
    }
  };

  const handleLogout = async () => {
    const confirmLogout = async () => {
      if (Platform.OS === 'web') {
        return window.confirm("Are you sure you want to log out?");
      } else {
        return new Promise<boolean>((resolve) => {
          Alert.alert(
            "Log Out",
            "Are you sure you want to log out?",
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Log Out", style: "destructive", onPress: () => resolve(true) },
            ]
          );
        });
      }
    };

    const shouldLogout = await confirmLogout();
    if (!shouldLogout) return;

    try {
      await signOut(auth);
      router.replace("/auth/login");
    } catch (error) {
      console.error("Error logging out:", error);
      if (Platform.OS === 'web') {
        alert("Failed to log out. Please try again.");
      } else {
        Alert.alert("Error", "Failed to log out. Please try again.");
      }
    }
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

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Settings</Text>

        <TouchableOpacity 
          onPress={handleSave} 
          style={styles.headerButton}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="checkmark" size={24} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Avatar Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile Photo</Text>
          
          <View style={styles.avatarSection}>
            {uploadingAvatar ? (
              <View style={styles.avatarPlaceholder}>
                <ActivityIndicator size="large" color="#0D5C3A" />
              </View>
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
              disabled={uploadingAvatar}
            >
              <Ionicons name="camera" size={20} color="#FFFFFF" />
              <Text style={styles.changeAvatarText}>Change Photo</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Display Name */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Display Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Display Name"
            placeholderTextColor="#999"
            value={settings.displayName}
            onChangeText={(text) => setSettings({ ...settings, displayName: text })}
          />
          <Text style={styles.helperText}>This is how your name appears to other users</Text>
        </View>

        {/* Email (Read-only) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Email</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={settings.email}
            editable={false}
          />
          <Text style={styles.helperText}>Email cannot be changed</Text>
        </View>

        {/* Personal Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="John Doe"
            placeholderTextColor="#999"
            value={settings.personalName}
            onChangeText={(text) => setSettings({ ...settings, personalName: text })}
          />

          <Text style={styles.label}>Birthday</Text>
          <TextInput
            style={styles.input}
            placeholder="MM/DD/YYYY"
            placeholderTextColor="#999"
            value={settings.birthday}
            onChangeText={(text) => setSettings({ ...settings, birthday: text })}
          />

          <Text style={styles.label}>Gender</Text>
          <TextInput
            style={styles.input}
            placeholder="Male / Female / Other"
            placeholderTextColor="#999"
            value={settings.gender}
            onChangeText={(text) => setSettings({ ...settings, gender: text })}
          />
        </View>

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          
          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            placeholder="City"
            placeholderTextColor="#999"
            value={settings.location?.city}
            onChangeText={(text) => 
              setSettings({ 
                ...settings, 
                location: { ...settings.location, city: text } 
              })
            }
          />

          <Text style={styles.label}>State</Text>
          <TextInput
            style={styles.input}
            placeholder="State"
            placeholderTextColor="#999"
            value={settings.location?.state}
            onChangeText={(text) => 
              setSettings({ 
                ...settings, 
                location: { ...settings.location, state: text } 
              })
            }
          />

          <Text style={styles.label}>Zip Code</Text>
          <TextInput
            style={styles.input}
            placeholder="Zip Code"
            placeholderTextColor="#999"
            keyboardType="number-pad"
            value={settings.location?.zip}
            onChangeText={(text) => 
              setSettings({ 
                ...settings, 
                location: { ...settings.location, zip: text } 
              })
            }
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity 
          style={[styles.saveButton, saving && styles.saveButtonDisabled]} 
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? "Saving..." : "Save Changes"}
          </Text>
        </TouchableOpacity>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  safeTop: {
    backgroundColor: "#0D5C3A",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },

  headerButton: {
    width: 40,
    alignItems: "center",
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 1,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  section: {
    marginBottom: 24,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 12,
  },

  avatarSection: {
    alignItems: "center",
    paddingVertical: 20,
  },

  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
    borderWidth: 3,
    borderColor: "#0D5C3A",
  },

  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 3,
    borderColor: "#0D5C3A",
  },

  avatarInitial: {
    fontSize: 48,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  changeAvatarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },

  changeAvatarText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 6,
    marginTop: 12,
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#333",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  inputDisabled: {
    backgroundColor: "#F5F5F5",
    color: "#999",
  },

  helperText: {
    fontSize: 12,
    color: "#999",
    marginTop: 6,
  },

  saveButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 12,
  },

  saveButtonDisabled: {
    backgroundColor: "rgba(13, 92, 58, 0.5)",
  },

  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FF3B30",
    backgroundColor: "#FFF5F5",
  },

  logoutButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FF3B30",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },
});