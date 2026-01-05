import LocationPreferencesModal from "@/components/modals/LocationPreferencesModal";
import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  signOut,
  updateEmail,
  updatePassword
} from "firebase/auth";
import { deleteDoc, doc, getDoc, updateDoc } from "firebase/firestore";
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
  Linking,
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

interface UserSettings {
  displayName: string;
  email: string;
  avatar?: string;
  handicap?: string | number;
  accountPrivacy?: "public" | "private";
  partnerRequests?: "anyone" | "partners_of_partners" | "no_one";
  defaultTees?: "back" | "forward";
}

export default function SettingsScreen() {
  const router = useRouter();
  const userId = auth.currentUser?.uid;

  const [settings, setSettings] = useState<UserSettings>({
    displayName: "",
    email: "",
    avatar: "",
    handicap: "",
    accountPrivacy: "public",
    partnerRequests: "anyone",
    defaultTees: "back",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [supportModalVisible, setSupportModalVisible] = useState(false);
  const [locationPrefsVisible, setLocationPrefsVisible] = useState(false);
  
  // Email change modal
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  
  // Password change modal
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Delete account modal (cross-platform)
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);

  // Sound settings
  const [soundsMuted, setSoundsMuted] = useState(false);
  const [allowSoundsInSilentMode, setAllowSoundsInSilentMode] = useState(false);

  useEffect(() => {
    fetchSettings();
    
    // Subscribe to sound settings changes
    const unsubscribe = soundPlayer.addListener((soundSettings) => {
      setSoundsMuted(soundSettings.isMuted);
      setAllowSoundsInSilentMode(soundSettings.allowSoundInSilentMode);
    });

    return () => unsubscribe();
  }, []);

  const fetchSettings = async () => {
    if (!userId) return;

    try {
      const userDoc = await getDoc(doc(db, "users", userId));

      if (userDoc.exists()) {
        const data = userDoc.data();
        setSettings({
          displayName: data.displayName || "",
          email: data.email || auth.currentUser?.email || "",
          avatar: data.avatar || "",
          handicap: data.handicap || "N/A",
          accountPrivacy: data.accountPrivacy || "public",
          partnerRequests: data.partnerRequests || "anyone",
          defaultTees: data.defaultTees || "back",
        });
      }
      
      // Check email verification status
      setEmailVerified(auth.currentUser?.emailVerified ?? false);
      
      setLoading(false);
    } catch (err) {
      console.error("Error fetching settings:", err);
      soundPlayer.play('error');
      setLoading(false);
    }
  };

  /* ------------------ SAVE PROFILE ------------------ */
  const handleSave = async () => {
    if (!userId) return;

    if (!settings.displayName.trim()) {
      soundPlayer.play('error');
      Alert.alert("Error", "Display name cannot be empty");
      return;
    }

    try {
      soundPlayer.play('click');
      setSaving(true);

      await updateDoc(doc(db, "users", userId), {
        displayName: settings.displayName.trim(),
        accountPrivacy: settings.accountPrivacy,
        partnerRequests: settings.partnerRequests,
        defaultTees: settings.defaultTees,
      });

      soundPlayer.play('postThought');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Settings updated successfully");
      setSaving(false);
    } catch (err) {
      console.error("Save error:", err);
      soundPlayer.play('error');
      setSaving(false);
      Alert.alert("Error", "Failed to update settings");
    }
  };

  /* ------------------ PICK + UPLOAD AVATAR ------------------ */
  const handlePickAvatar = async () => {
    try {
      soundPlayer.play('click');
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        soundPlayer.play('error');
        Alert.alert("Permission required", "Photo access is needed.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (result.canceled || !result.assets[0] || !userId) return;

      setUploadingAvatar(true);

      const imageUri = result.assets[0].uri;
      const response = await fetch(imageUri);
      const blob = await response.blob();

      const storage = getStorage();
      const avatarRef = ref(storage, `avatars/${userId}/avatar.jpg`);

      await uploadBytes(avatarRef, blob);
      const downloadURL = await getDownloadURL(avatarRef);

      await updateDoc(doc(db, "users", userId), {
        avatar: downloadURL,
      });

      setSettings({ ...settings, avatar: downloadURL });

      soundPlayer.play('postThought');
      setUploadingAvatar(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error("Avatar error:", err);
      soundPlayer.play('error');
      setUploadingAvatar(false);
      Alert.alert("Error", "Failed to update profile photo");
    }
  };

  /* ------------------ CHANGE EMAIL ------------------ */
  const handleChangeEmail = () => {
    soundPlayer.play('click');
    setNewEmail("");
    setEmailPassword("");
    setEmailModalVisible(true);
  };

  const handleSubmitEmailChange = async () => {
    if (!newEmail.trim() || !emailPassword.trim()) {
      soundPlayer.play('error');
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (!newEmail.includes("@")) {
      soundPlayer.play('error');
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }

    try {
      soundPlayer.play('click');
      const user = auth.currentUser;
      if (!user || !user.email) return;

      // Re-authenticate user
      const credential = EmailAuthProvider.credential(user.email, emailPassword);
      await reauthenticateWithCredential(user, credential);

      // Update email in Firebase Auth
      await updateEmail(user, newEmail.trim());

      // Update email in Firestore
      await updateDoc(doc(db, "users", userId!), {
        email: newEmail.trim(),
      });

      setSettings({ ...settings, email: newEmail.trim() });
      setEmailModalVisible(false);
      
      soundPlayer.play('postThought');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Email updated successfully");
    } catch (error: any) {
      console.error("Email change error:", error);
      soundPlayer.play('error');
      
      if (error.code === "auth/wrong-password") {
        Alert.alert("Error", "Incorrect password");
      } else if (error.code === "auth/email-already-in-use") {
        Alert.alert("Error", "This email is already in use");
      } else if (error.code === "auth/invalid-email") {
        Alert.alert("Error", "Invalid email address");
      } else {
        Alert.alert("Error", "Failed to update email. Please try again.");
      }
    }
  };

  /* ------------------ CHANGE PASSWORD ------------------ */
  const handleChangePassword = () => {
    soundPlayer.play('click');
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordModalVisible(true);
  };

  const handleSubmitPasswordChange = async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      soundPlayer.play('error');
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      soundPlayer.play('error');
      Alert.alert("Error", "New passwords don't match");
      return;
    }

    if (newPassword.length < 6) {
      soundPlayer.play('error');
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    try {
      soundPlayer.play('click');
      const user = auth.currentUser;
      if (!user || !user.email) return;

      // Re-authenticate user
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);

      setPasswordModalVisible(false);
      
      soundPlayer.play('postThought');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Password updated successfully");
    } catch (error: any) {
      console.error("Password change error:", error);
      soundPlayer.play('error');
      
      if (error.code === "auth/wrong-password") {
        Alert.alert("Error", "Incorrect current password");
      } else if (error.code === "auth/weak-password") {
        Alert.alert("Error", "Password is too weak");
      } else {
        Alert.alert("Error", "Failed to update password. Please try again.");
      }
    }
  };

  /* ------------------ DELETE ACCOUNT ------------------ */
  const handleDeleteAccount = () => {
    soundPlayer.play('click');
    Alert.alert(
      "Delete Account",
      "This will permanently delete your profile, scores, and posts. This cannot be undone.\n\nAre you sure?",
      [
        { 
          text: "Cancel", 
          style: "cancel",
          onPress: () => soundPlayer.play('click')
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            soundPlayer.play('click');
            setDeletePassword("");
            setDeleteModalVisible(true);
          },
        },
      ]
    );
  };

  const executeAccountDeletion = async () => {
    if (!deletePassword.trim()) {
      soundPlayer.play('error');
      Alert.alert("Error", "Password is required");
      return;
    }

    const user = auth.currentUser;
    if (!user || !user.email) {
      soundPlayer.play('error');
      Alert.alert("Error", "Not logged in");
      return;
    }

    try {
      soundPlayer.play('click');
      
      // Re-authenticate user with password
      const credential = EmailAuthProvider.credential(user.email, deletePassword);
      await reauthenticateWithCredential(user, credential);

      // Delete user document from Firestore (hard delete)
      if (userId) {
        await deleteDoc(doc(db, "users", userId));
      }

      // Delete Firebase Auth account
      await user.delete();

      setDeleteModalVisible(false);
      soundPlayer.play('postThought');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      Alert.alert(
        "Account Deleted",
        "Your account has been permanently deleted. We're sorry to see you go.",
        [
          {
            text: "OK",
            onPress: () => {
              soundPlayer.play('click');
              router.replace("/");
            },
          },
        ]
      );
    } catch (error: any) {
      console.error("Account deletion error:", error);
      soundPlayer.play('error');
      
      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        Alert.alert("Error", "Incorrect password. Please try again.");
      } else if (error.code === "auth/requires-recent-login") {
        Alert.alert(
          "Session Expired",
          "For security, please log out and log back in before deleting your account.",
          [{ 
            text: "OK",
            onPress: () => {
              soundPlayer.play('click');
              setDeleteModalVisible(false);
            }
          }]
        );
      } else {
        Alert.alert(
          "Error", 
          "Failed to delete account. Please contact support@swingthoughts.com for assistance.",
          [{ 
            text: "OK",
            onPress: () => soundPlayer.play('click')
          }]
        );
      }
    }
  };

  /* ------------------ SEND VERIFICATION EMAIL ------------------ */
  const handleSendVerificationEmail = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      soundPlayer.play('click');
      setSendingVerification(true);
      await sendEmailVerification(user);
      
      soundPlayer.play('postThought');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Verification Email Sent",
        "Please check your inbox and click the verification link. You may need to refresh the app after verifying.",
        [{ 
          text: "OK",
          onPress: () => soundPlayer.play('click')
        }]
      );
      setSendingVerification(false);
    } catch (error: any) {
      console.error("Verification email error:", error);
      soundPlayer.play('error');
      setSendingVerification(false);
      
      if (error.code === "auth/too-many-requests") {
        Alert.alert("Error", "Too many requests. Please wait a few minutes before trying again.");
      } else {
        Alert.alert("Error", "Failed to send verification email. Please try again.");
      }
    }
  };

  /* ------------------ SOUND SETTINGS ------------------ */
  const handleToggleMute = () => {
    const newMutedState = !soundsMuted;
    
    if (!newMutedState) {
      // Unmuting - play a sound to confirm
      soundPlayer.setMuted(false);
      soundPlayer.play('click');
    } else {
      // Muting - play sound first, then mute
      soundPlayer.play('click');
      setTimeout(() => {
        soundPlayer.setMuted(true);
      }, 200);
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleToggleSilentMode = async () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const newState = !allowSoundsInSilentMode;
    await soundPlayer.setAllowSoundInSilentMode(newState);
  };

  /* ------------------ SUPPORT ------------------ */
  const supportCategories = [
    { id: "score", label: "Score not saving", emoji: "📊" },
    { id: "course", label: "Can't find my course", emoji: "⛳" },
    { id: "partner", label: "Partner request issues", emoji: "🤝" },
    { id: "profile", label: "Profile/photo issues", emoji: "👤" },
    { id: "holeinone", label: "Hole-in-one verification", emoji: "🎯" },
    { id: "other", label: "Other", emoji: "❓" },
  ];

  const handleSupportCategory = (categoryId: string) => {
    soundPlayer.play('click');
    setSupportModalVisible(false);
    
    const category = supportCategories.find(c => c.id === categoryId);
    const subject = encodeURIComponent(`Support: ${category?.label || 'Help'}`);
    const body = encodeURIComponent(`\n\n---\nUser ID: ${userId}\nApp Version: 1.0.0`);
    
    Linking.openURL(`mailto:support@swingthoughts.com?subject=${subject}&body=${body}`);
  };

  /* ------------------ LOGOUT ------------------ */
  const handleLogout = async () => {
    soundPlayer.play('click');
    
    const confirmed =
      Platform.OS === "web"
        ? window.confirm("Log out?")
        : await new Promise<boolean>((resolve) =>
            Alert.alert("Log Out", "Are you sure?", [
              { 
                text: "Cancel", 
                style: "cancel", 
                onPress: () => {
                  soundPlayer.play('click');
                  resolve(false);
                }
              },
              {
                text: "Log Out",
                style: "destructive",
                onPress: () => {
                  soundPlayer.play('click');
                  resolve(true);
                },
              },
            ])
          );

    if (!confirmed) return;

    await signOut(auth);
    router.replace("/");
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
        <TouchableOpacity onPress={() => {
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}>
          <Image
            source={require("@/assets/icons/Back.png")}
            style={styles.backIcon}
          />
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
        {/* ==================== PROFILE SECTION ==================== */}
        <Text style={styles.sectionTitle}>PROFILE</Text>

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
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Display Name"
            placeholderTextColor="#999"
            value={settings.displayName}
            onChangeText={(t) => setSettings({ ...settings, displayName: t })}
          />
          <Text style={styles.helperText}>
            Note: This won't update your name in past posts/comments
          </Text>
        </View>

        {/* HANDICAP (Display Only) */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Handicap</Text>
          <View style={styles.disabledInput}>
            <Text style={styles.disabledInputText}>{settings.handicap}</Text>
          </View>
          <Text style={styles.helperText}>
            Updates automatically as you log scores
          </Text>
        </View>

        {/* EDIT LOCKER BUTTON */}
        <TouchableOpacity
          style={styles.lockerButton}
          onPress={() => {
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/locker/${userId}`);
          }}
        >
          <Ionicons name="create-outline" size={20} color="#0D5C3A" />
          <Text style={styles.lockerButtonText}>Edit Locker Details in Locker</Text>
          <Ionicons name="chevron-forward" size={20} color="#0D5C3A" />
        </TouchableOpacity>

        {/* ==================== PRIVACY & NOTIFICATIONS ==================== */}
        <Text style={styles.sectionTitle}>PRIVACY & NOTIFICATIONS</Text>

        {/* ACCOUNT PRIVACY */}
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <Ionicons name="lock-closed-outline" size={20} color="#0D5C3A" />
            <Text style={styles.settingLabel}>Account Privacy</Text>
          </View>
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[
                styles.toggleOption,
                settings.accountPrivacy === "public" && styles.toggleOptionActive,
              ]}
              onPress={() => {
                soundPlayer.play('click');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSettings({ ...settings, accountPrivacy: "public" });
              }}
            >
              <Text
                style={[
                  styles.toggleText,
                  settings.accountPrivacy === "public" && styles.toggleTextActive,
                ]}
              >
                Public
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleOption,
                settings.accountPrivacy === "private" && styles.toggleOptionActive,
              ]}
              onPress={() => {
                soundPlayer.play('click');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSettings({ ...settings, accountPrivacy: "private" });
              }}
            >
              <Text
                style={[
                  styles.toggleText,
                  settings.accountPrivacy === "private" && styles.toggleTextActive,
                ]}
              >
                Private
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.settingHelperText}>
          Private: Only partners can see your profile
        </Text>

        {/* PUSH NOTIFICATIONS (Placeholder) */}
        <View style={[styles.settingRow, styles.disabledSetting]}>
          <View style={styles.settingLeft}>
            <Ionicons name="notifications-outline" size={20} color="#999" />
            <Text style={styles.settingLabelDisabled}>Push Notifications</Text>
          </View>
          <Text style={styles.comingSoonBadge}>Coming Soon</Text>
        </View>

        {/* EMAIL NOTIFICATIONS (Placeholder) */}
        <View style={[styles.settingRow, styles.disabledSetting]}>
          <View style={styles.settingLeft}>
            <Ionicons name="mail-outline" size={20} color="#999" />
            <Text style={styles.settingLabelDisabled}>Email Notifications</Text>
          </View>
          <Text style={styles.comingSoonBadge}>Coming Soon</Text>
        </View>

        {/* PARTNER REQUESTS */}
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <Ionicons name="people-outline" size={20} color="#0D5C3A" />
            <View>
              <Text style={styles.settingLabel}>Partner Requests</Text>
              <Text style={styles.settingSubtext}>Who can send you requests</Text>
            </View>
          </View>
        </View>
        <View style={styles.dropdownContainer}>
          <TouchableOpacity
            style={[
              styles.dropdownOption,
              settings.partnerRequests === "anyone" && styles.dropdownOptionActive,
            ]}
            onPress={() => {
              soundPlayer.play('click');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSettings({ ...settings, partnerRequests: "anyone" });
            }}
          >
            <View style={styles.radio}>
              {settings.partnerRequests === "anyone" && (
                <View style={styles.radioInner} />
              )}
            </View>
            <Text style={styles.dropdownText}>Anyone</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.dropdownOption,
              settings.partnerRequests === "partners_of_partners" &&
                styles.dropdownOptionActive,
            ]}
            onPress={() => {
              soundPlayer.play('click');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSettings({ ...settings, partnerRequests: "partners_of_partners" });
            }}
          >
            <View style={styles.radio}>
              {settings.partnerRequests === "partners_of_partners" && (
                <View style={styles.radioInner} />
              )}
            </View>
            <Text style={styles.dropdownText}>Partners of Partners</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.dropdownOption,
              settings.partnerRequests === "no_one" && styles.dropdownOptionActive,
            ]}
            onPress={() => {
              soundPlayer.play('click');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSettings({ ...settings, partnerRequests: "no_one" });
            }}
          >
            <View style={styles.radio}>
              {settings.partnerRequests === "no_one" && (
                <View style={styles.radioInner} />
              )}
            </View>
            <Text style={styles.dropdownText}>No One</Text>
          </TouchableOpacity>
        </View>

        {/* ==================== SOUND SETTINGS ==================== */}
        <Text style={styles.sectionTitle}>SOUND SETTINGS</Text>

        {/* MUTE SOUNDS */}
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <Ionicons 
              name={soundsMuted ? "volume-mute" : "volume-high"} 
              size={20} 
              color="#0D5C3A" 
            />
            <View>
              <Text style={styles.settingLabel}>Sound Effects</Text>
              <Text style={styles.settingSubtext}>
                {soundsMuted ? "Sounds are muted" : "Sounds are enabled"}
              </Text>
            </View>
          </View>
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[
                styles.toggleOption,
                !soundsMuted && styles.toggleOptionActive,
              ]}
              onPress={handleToggleMute}
            >
              <Text
                style={[
                  styles.toggleText,
                  !soundsMuted && styles.toggleTextActive,
                ]}
              >
                On
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleOption,
                soundsMuted && styles.toggleOptionActive,
              ]}
              onPress={handleToggleMute}
            >
              <Text
                style={[
                  styles.toggleText,
                  soundsMuted && styles.toggleTextActive,
                ]}
              >
                Off
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* PLAY IN SILENT MODE (iOS only) */}
        {Platform.OS === 'ios' && (
          <>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="phone-portrait-outline" size={20} color="#0D5C3A" />
                <View>
                  <Text style={styles.settingLabel}>Play in Silent Mode</Text>
                  <Text style={styles.settingSubtext}>
                    Override device silent switch
                  </Text>
                </View>
              </View>
              <View style={styles.toggleContainer}>
                <TouchableOpacity
                  style={[
                    styles.toggleOption,
                    allowSoundsInSilentMode && styles.toggleOptionActive,
                  ]}
                  onPress={handleToggleSilentMode}
                  disabled={soundsMuted}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      allowSoundsInSilentMode && styles.toggleTextActive,
                      soundsMuted && styles.toggleTextDisabled,
                    ]}
                  >
                    On
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleOption,
                    !allowSoundsInSilentMode && styles.toggleOptionActive,
                  ]}
                  onPress={handleToggleSilentMode}
                  disabled={soundsMuted}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      !allowSoundsInSilentMode && styles.toggleTextActive,
                      soundsMuted && styles.toggleTextDisabled,
                    ]}
                  >
                    Off
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.settingHelperText}>
              When enabled, sounds will play even when your phone is on silent
            </Text>
          </>
        )}

        {/* ==================== LOCATION ==================== */}
        <Text style={styles.sectionTitle}>LOCATION</Text>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setLocationPrefsVisible(true);
          }}
        >
          <Ionicons name="location-outline" size={20} color="#0D5C3A" />
          <Text style={styles.actionButtonText}>Location Preferences</Text>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>

        {/* ==================== ACCOUNT ==================== */}
        <Text style={styles.sectionTitle}>ACCOUNT</Text>

        {/* VERIFY EMAIL - Only show if not verified */}
        {!emailVerified && (
          <TouchableOpacity 
            style={[styles.actionButton, styles.verifyButton]} 
            onPress={handleSendVerificationEmail}
            disabled={sendingVerification}
          >
            <Ionicons name="mail-outline" size={20} color="#FF9500" />
            {sendingVerification ? (
              <ActivityIndicator size="small" color="#FF9500" style={{ marginLeft: 12, flex: 1 }} />
            ) : (
              <>
                <Text style={styles.verifyButtonText}>Verify Email Address</Text>
                <Ionicons name="warning" size={20} color="#FF9500" />
              </>
            )}
          </TouchableOpacity>
        )}

        {/* EMAIL VERIFIED STATUS - Only show if verified */}
        {emailVerified && (
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
            <Text style={styles.verifiedText}>Email Verified</Text>
          </View>
        )}

        <TouchableOpacity style={styles.actionButton} onPress={handleChangeEmail}>
          <Ionicons name="mail-outline" size={20} color="#0D5C3A" />
          <Text style={styles.actionButtonText}>Change Email</Text>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleChangePassword}
        >
          <Ionicons name="key-outline" size={20} color="#0D5C3A" />
          <Text style={styles.actionButtonText}>Change Password</Text>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.dangerButton]}
          onPress={handleDeleteAccount}
        >
          <Ionicons name="trash-outline" size={20} color="#FF3B30" />
          <Text style={styles.dangerButtonText}>Delete Account</Text>
          <Ionicons name="chevron-forward" size={20} color="#FF3B30" />
        </TouchableOpacity>

        {/* ==================== APP PREFERENCES ==================== */}
        <Text style={styles.sectionTitle}>APP PREFERENCES</Text>

        {/* DEFAULT TEES */}
        <View style={styles.settingRow}>
          <View style={styles.settingLeft}>
            <Ionicons name="golf-outline" size={20} color="#0D5C3A" />
            <Text style={styles.settingLabel}>Default Tees</Text>
          </View>
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[
                styles.toggleOption,
                settings.defaultTees === "back" && styles.toggleOptionActive,
              ]}
              onPress={() => {
                soundPlayer.play('click');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSettings({ ...settings, defaultTees: "back" });
              }}
            >
              <Text
                style={[
                  styles.toggleText,
                  settings.defaultTees === "back" && styles.toggleTextActive,
                ]}
              >
                Back
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleOption,
                settings.defaultTees === "forward" && styles.toggleOptionActive,
              ]}
              onPress={() => {
                soundPlayer.play('click');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSettings({ ...settings, defaultTees: "forward" });
              }}
            >
              <Text
                style={[
                  styles.toggleText,
                  settings.defaultTees === "forward" && styles.toggleTextActive,
                ]}
              >
                Forward
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* THEME (Placeholder) */}
        <View style={[styles.settingRow, styles.disabledSetting]}>
          <View style={styles.settingLeft}>
            <Ionicons name="moon-outline" size={20} color="#999" />
            <Text style={styles.settingLabelDisabled}>Theme</Text>
          </View>
          <Text style={styles.comingSoonBadge}>Coming Soon</Text>
        </View>

        {/* ==================== LEGAL & SUPPORT ==================== */}
        <Text style={styles.sectionTitle}>LEGAL & SUPPORT</Text>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/legal/terms");
          }}
        >
          <Ionicons name="document-text-outline" size={20} color="#0D5C3A" />
          <Text style={styles.actionButtonText}>Terms of Service</Text>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/legal/privacy");
          }}
        >
          <Ionicons name="shield-checkmark-outline" size={20} color="#0D5C3A" />
          <Text style={styles.actionButtonText}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/legal/etiquette");
          }}
        >
          <Ionicons name="people-outline" size={20} color="#0D5C3A" />
          <Text style={styles.actionButtonText}>Community Etiquette</Text>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setSupportModalVisible(true);
          }}
        >
          <Ionicons name="help-circle-outline" size={20} color="#0D5C3A" />
          <Text style={styles.actionButtonText}>Support</Text>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>

        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>Version 1.0.0</Text>
        </View>

        {/* ==================== LOGOUT ==================== */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ==================== CHANGE EMAIL MODAL ==================== */}
      <Modal
        visible={emailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEmailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Email</Text>
              <TouchableOpacity
                onPress={() => {
                  soundPlayer.play('click');
                  setEmailModalVisible(false);
                }}
                style={styles.modalClose}
              >
                <Image
                  source={require("@/assets/icons/Close.png")}
                  style={styles.closeIcon}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              <Text style={styles.modalLabel}>New Email</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter new email"
                placeholderTextColor="#999"
                value={newEmail}
                onChangeText={setNewEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.modalLabel}>Current Password</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter your password to confirm"
                placeholderTextColor="#999"
                value={emailPassword}
                onChangeText={setEmailPassword}
                secureTextEntry
              />

              <TouchableOpacity
                style={styles.modalSubmitButton}
                onPress={handleSubmitEmailChange}
              >
                <Text style={styles.modalSubmitButtonText}>Update Email</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ==================== CHANGE PASSWORD MODAL ==================== */}
      <Modal
        visible={passwordModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity
                onPress={() => {
                  soundPlayer.play('click');
                  setPasswordModalVisible(false);
                }}
                style={styles.modalClose}
              >
                <Image
                  source={require("@/assets/icons/Close.png")}
                  style={styles.closeIcon}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              <Text style={styles.modalLabel}>Current Password</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter current password"
                placeholderTextColor="#999"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
              />

              <Text style={styles.modalLabel}>New Password</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter new password (min 6 characters)"
                placeholderTextColor="#999"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />

              <Text style={styles.modalLabel}>Confirm New Password</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Re-enter new password"
                placeholderTextColor="#999"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />

              <TouchableOpacity
                style={styles.modalSubmitButton}
                onPress={handleSubmitPasswordChange}
              >
                <Text style={styles.modalSubmitButtonText}>Update Password</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ==================== SUPPORT MODAL ==================== */}
      <Modal
        visible={supportModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSupportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>How can we help?</Text>
              <TouchableOpacity
                onPress={() => {
                  soundPlayer.play('click');
                  setSupportModalVisible(false);
                }}
                style={styles.modalClose}
              >
                <Image
                  source={require("@/assets/icons/Close.png")}
                  style={styles.closeIcon}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              {supportCategories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={styles.supportOption}
                  onPress={() => handleSupportCategory(category.id)}
                >
                  <Text style={styles.supportEmoji}>{category.emoji}</Text>
                  <Text style={styles.supportLabel}>{category.label}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ==================== DELETE ACCOUNT MODAL ==================== */}
      <Modal
        visible={deleteModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Delete Account</Text>
              <TouchableOpacity
                onPress={() => {
                  soundPlayer.play('click');
                  setDeleteModalVisible(false);
                }}
                style={styles.modalClose}
              >
                <Image
                  source={require("@/assets/icons/Close.png")}
                  style={styles.closeIcon}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              <Text style={styles.deleteWarningText}>
                ⚠️ This action cannot be undone. Your profile, scores, and posts will be permanently deleted.
              </Text>

              <Text style={styles.modalLabel}>Enter Your Password to Confirm</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter your password"
                placeholderTextColor="#999"
                value={deletePassword}
                onChangeText={setDeletePassword}
                secureTextEntry
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={styles.deleteSubmitButton}
                onPress={executeAccountDeletion}
              >
                <Text style={styles.deleteSubmitButtonText}>Delete Account Forever</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  soundPlayer.play('click');
                  setDeleteModalVisible(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ==================== LOCATION PREFERENCES MODAL ==================== */}
      <LocationPreferencesModal
        visible={locationPrefsVisible}
        onClose={() => {
          soundPlayer.play('click');
          setLocationPrefsVisible(false);
        }}
        userId={userId || ""}
        onUpdate={() => {
          fetchSettings();
        }}
      />
    </View>
  );
}

/* ==================== STYLES ==================== */
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
  
  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFF",
  },
  
  headerTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  /* SECTION TITLES */
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0D5C3A",
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 12,
  },

  /* AVATAR SECTION */
  avatarSection: {
    alignItems: "center",
    marginBottom: 24,
  },

  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
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

  /* INPUT FIELDS */
  inputContainer: {
    marginBottom: 16,
  },

  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 6,
  },

  input: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },

  disabledInput: {
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },

  disabledInputText: {
    fontSize: 16,
    color: "#999",
  },

  helperText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    fontStyle: "italic",
  },

  /* LOCKER BUTTON */
  lockerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },

  lockerButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
    marginLeft: 12,
  },

  /* SETTING ROWS */
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },

  disabledSetting: {
    backgroundColor: "#F5F5F5",
    opacity: 0.6,
  },

  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  settingLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },

  settingLabelDisabled: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
  },

  settingSubtext: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },

  settingHelperText: {
    fontSize: 12,
    color: "#666",
    marginLeft: 48,
    marginTop: -4,
    marginBottom: 8,
    fontStyle: "italic",
  },

  comingSoonBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
    backgroundColor: "#E5E5E5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },

  /* TOGGLE */
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#F0F0F0",
    borderRadius: 8,
    padding: 2,
  },

  toggleOption: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },

  toggleOptionActive: {
    backgroundColor: "#0D5C3A",
  },

  toggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },

  toggleTextActive: {
    color: "#FFF",
  },

  toggleTextDisabled: {
    opacity: 0.5,
  },

  /* DROPDOWN */
  dropdownContainer: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 8,
    marginBottom: 8,
  },

  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
  },

  dropdownOptionActive: {
    backgroundColor: "#E8F5E9",
  },

  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#0D5C3A",
  },

  dropdownText: {
    fontSize: 15,
    color: "#333",
  },

  /* ACTION BUTTONS */
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },

  actionButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    marginLeft: 12,
  },

  dangerButton: {
    borderWidth: 1,
    borderColor: "#FF3B30",
  },

  dangerButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#FF3B30",
    marginLeft: 12,
  },

  /* VERIFY EMAIL BUTTON */
  verifyButton: {
    borderWidth: 2,
    borderColor: "#FF9500",
    backgroundColor: "#FFF9F0",
  },

  verifyButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#FF9500",
    marginLeft: 12,
  },

  /* EMAIL VERIFIED BADGE */
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    gap: 12,
    borderWidth: 2,
    borderColor: "#4CAF50",
  },

  verifiedText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4CAF50",
  },

  /* VERSION */
  versionContainer: {
    alignItems: "center",
    paddingVertical: 16,
  },

  versionText: {
    fontSize: 12,
    color: "#999",
  },

  /* LOGOUT */
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
    marginTop: 16,
  },

  logoutText: {
    color: "#FF3B30",
    fontWeight: "700",
  },

  /* LOADING */
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  /* MODALS */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },

  modalContainer: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  modalClose: {
    padding: 4,
  },

  closeIcon: {
    width: 24,
    height: 24,
    tintColor: "#666",
  },

  modalContent: {
    padding: 20,
  },

  modalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 8,
    marginTop: 12,
  },

  modalInput: {
    backgroundColor: "#F7F8FA",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    marginBottom: 8,
  },

  modalSubmitButton: {
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },

  modalSubmitButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },

  supportOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#F7F8FA",
    borderRadius: 12,
    marginBottom: 10,
  },

  supportEmoji: {
    fontSize: 24,
    marginRight: 12,
  },

  supportLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },

  /* DELETE MODAL STYLES */
  deleteWarningText: {
    fontSize: 14,
    color: "#FF3B30",
    backgroundColor: "#FFF5F5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    textAlign: "center",
    fontWeight: "600",
  },

  deleteSubmitButton: {
    backgroundColor: "#FF3B30",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },

  deleteSubmitButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },

  cancelButton: {
    backgroundColor: "transparent",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },

  cancelButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
});