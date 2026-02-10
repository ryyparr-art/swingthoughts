/**
 * Settings Screen (Refactored)
 * 
 * Thin coordinator that composes section components and modals.
 * All business logic for auth operations lives here;
 * UI for each section is delegated to components.
 * 
 * Original: ~900 lines → Now: ~350 lines
 */

import LocationPreferencesModal from "@/components/modals/LocationPreferencesModal";
import AccountSection from "@/components/settings/AccountSection";
import LegalSupportSection from "@/components/settings/LegalSupportSection";
import ChangeEmailModal from "@/components/settings/modals/ChangeEmailModal";
import ChangePasswordModal from "@/components/settings/modals/ChangePasswordModal";
import DeleteAccountModal from "@/components/settings/modals/DeleteAccountModal";
import SupportModal from "@/components/settings/modals/SupportModal";
import PrivacySection from "@/components/settings/PrivacySection";
import ProfileSection from "@/components/settings/ProfileSection";
import SoundSection from "@/components/settings/SoundSection";
import { auth, db } from "@/constants/firebaseConfig";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import ImageCropModal from "@/components/leagues/settings/ImageCropModal";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  signOut,
  updateEmail,
  updatePassword,
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
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface UserSettings {
  displayName: string;
  email: string;
  avatar?: string;
  handicap?: string | number;
  accountPrivacy: "public" | "private";
  partnerRequests: "anyone" | "partners_of_partners" | "no_one";
}

export default function SettingsScreen() {
  const router = useRouter();
  const userId = auth.currentUser?.uid;
  const { clearCache } = useCache();

  const [settings, setSettings] = useState<UserSettings>({
    displayName: "",
    email: "",
    avatar: "",
    handicap: "",
    accountPrivacy: "public",
    partnerRequests: "anyone",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [personalDetailsComplete, setPersonalDetailsComplete] = useState(false);
  const [soundsEnabled, setSoundsEnabled] = useState(soundPlayer.isEnabled());

  // Modal visibility
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [supportModalVisible, setSupportModalVisible] = useState(false);
  const [locationPrefsVisible, setLocationPrefsVisible] = useState(false);
  const [avatarCropVisible, setAvatarCropVisible] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  /* ========================= FETCH ========================= */

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
        });

        // Check personal details completion
        const pd = data.personalDetails || {};
        const filled = [pd.firstName, pd.lastName, pd.dateOfBirth, pd.gender, pd.handedness].filter(Boolean).length;
        setPersonalDetailsComplete(filled >= 3);
      }

      setEmailVerified(auth.currentUser?.emailVerified ?? false);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching settings:", err);
      soundPlayer.play("error");
      setLoading(false);
    }
  };

  /* ========================= SAVE ========================= */

  const handleSave = async () => {
    if (!userId) return;
    if (!settings.displayName.trim()) {
      soundPlayer.play("error");
      Alert.alert("Error", "Display name cannot be empty");
      return;
    }

    try {
      soundPlayer.play("click");
      setSaving(true);
      await updateDoc(doc(db, "users", userId), {
        displayName: settings.displayName.trim(),
        accountPrivacy: settings.accountPrivacy,
        partnerRequests: settings.partnerRequests,
      });
      soundPlayer.play("postThought");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Settings updated successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      console.error("Save error:", err);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to update settings");
    }
    setSaving(false);
  };

  /* ========================= AVATAR ========================= */

  const handleAvatarCropComplete = async (uri: string) => {
    if (!userId) return;
    try {
      setUploadingAvatar(true);
      const response = await fetch(uri);
      const blob = await response.blob();
      const storage = getStorage();
      const avatarRef = ref(storage, `avatars/${userId}/avatar_${Date.now()}.jpg`);
      await uploadBytes(avatarRef, blob);
      const downloadURL = await getDownloadURL(avatarRef);
      await updateDoc(doc(db, "users", userId), { avatar: downloadURL });
      setSettings({ ...settings, avatar: downloadURL });
      await clearCache(CACHE_KEYS.USER_PROFILE(userId));
      await clearCache(CACHE_KEYS.FEED(userId));
      await clearCache(CACHE_KEYS.LOCKER(userId));
      soundPlayer.play("postThought");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error("Avatar error:", err);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to update profile photo");
    } finally {
      setUploadingAvatar(false);
    }
  };

  /* ========================= AUTH OPERATIONS ========================= */

  const handleSubmitEmailChange = async (newEmail: string, password: string) => {
    try {
      const user = auth.currentUser;
      if (!user || !user.email) return;
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      await updateEmail(user, newEmail);
      await updateDoc(doc(db, "users", userId!), { email: newEmail });
      setSettings({ ...settings, email: newEmail });
      setEmailModalVisible(false);
      soundPlayer.play("postThought");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Email updated successfully");
    } catch (error: any) {
      soundPlayer.play("error");
      if (error.code === "auth/wrong-password") Alert.alert("Error", "Incorrect password");
      else if (error.code === "auth/email-already-in-use") Alert.alert("Error", "This email is already in use");
      else if (error.code === "auth/invalid-email") Alert.alert("Error", "Invalid email address");
      else Alert.alert("Error", "Failed to update email. Please try again.");
    }
  };

  const handleSubmitPasswordChange = async (currentPwd: string, newPwd: string) => {
    try {
      const user = auth.currentUser;
      if (!user || !user.email) return;
      const credential = EmailAuthProvider.credential(user.email, currentPwd);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPwd);
      setPasswordModalVisible(false);
      soundPlayer.play("postThought");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Password updated successfully");
    } catch (error: any) {
      soundPlayer.play("error");
      if (error.code === "auth/wrong-password") Alert.alert("Error", "Incorrect current password");
      else if (error.code === "auth/weak-password") Alert.alert("Error", "Password is too weak");
      else Alert.alert("Error", "Failed to update password. Please try again.");
    }
  };

  const handleDeleteAccount = () => {
    soundPlayer.play("click");
    Alert.alert(
      "Delete Account",
      "This will permanently delete your profile, scores, and posts. This cannot be undone.\n\nAre you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => setDeleteModalVisible(true),
        },
      ]
    );
  };

  const executeAccountDeletion = async (password: string) => {
    const user = auth.currentUser;
    if (!user || !user.email) {
      soundPlayer.play("error");
      Alert.alert("Error", "Not logged in");
      return;
    }
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
      if (userId) await deleteDoc(doc(db, "users", userId));
      await user.delete();
      setDeleteModalVisible(false);
      soundPlayer.play("postThought");
      Alert.alert("Account Deleted", "Your account has been permanently deleted.", [
        { text: "OK", onPress: () => router.replace("/") },
      ]);
    } catch (error: any) {
      soundPlayer.play("error");
      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
        Alert.alert("Error", "Incorrect password. Please try again.");
      } else if (error.code === "auth/requires-recent-login") {
        Alert.alert("Session Expired", "Please log out and log back in before deleting your account.", [
          { text: "OK", onPress: () => setDeleteModalVisible(false) },
        ]);
      } else {
        Alert.alert("Error", "Failed to delete account. Please contact support@swingthoughts.com for assistance.");
      }
    }
  };

  const handleSendVerificationEmail = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      setSendingVerification(true);
      await sendEmailVerification(user);
      soundPlayer.play("postThought");
      Alert.alert("Verification Email Sent", "Check your inbox and click the verification link.");
    } catch (error: any) {
      soundPlayer.play("error");
      if (error.code === "auth/too-many-requests") Alert.alert("Error", "Too many requests. Wait a few minutes.");
      else Alert.alert("Error", "Failed to send verification email.");
    }
    setSendingVerification(false);
  };

  /* ========================= SOUND TOGGLE ========================= */

  const handleToggleSounds = () => {
    const newState = !soundsEnabled;
    if (newState) {
      soundPlayer.setEnabled(true);
      setSoundsEnabled(true);
      soundPlayer.play("click");
    } else {
      soundPlayer.play("click");
      setTimeout(() => {
        soundPlayer.setEnabled(false);
        setSoundsEnabled(false);
      }, 200);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  /* ========================= LOGOUT ========================= */

  const handleLogout = async () => {
    soundPlayer.play("click");
    const confirmed = Platform.OS === "web"
      ? window.confirm("Log out?")
      : await new Promise<boolean>((resolve) =>
          Alert.alert("Log Out", "Are you sure?", [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: "Log Out", style: "destructive", onPress: () => resolve(true) },
          ])
        );
    if (!confirmed) return;
    await signOut(auth);
    router.replace("/");
  };

  /* ========================= UI ========================= */

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
        <TouchableOpacity onPress={() => { soundPlayer.play("click"); router.back(); }}>
          <Image source={require("@/assets/icons/Back.png")} style={styles.backIcon} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFF" /> : <Ionicons name="checkmark" size={24} color="#FFF" />}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ProfileSection
          displayName={settings.displayName}
          onDisplayNameChange={(t) => setSettings({ ...settings, displayName: t })}
          avatar={settings.avatar}
          handicap={settings.handicap}
          uploadingAvatar={uploadingAvatar}
          onPickAvatar={() => { soundPlayer.play("click"); setAvatarCropVisible(true); }}
          userId={userId}
        />

        <PrivacySection
          accountPrivacy={settings.accountPrivacy}
          partnerRequests={settings.partnerRequests}
          onPrivacyChange={(v) => setSettings({ ...settings, accountPrivacy: v })}
          onPartnerRequestsChange={(v) => setSettings({ ...settings, partnerRequests: v })}
        />

        <SoundSection soundsEnabled={soundsEnabled} onToggle={handleToggleSounds} />

        {/* LOCATION */}
        <Text style={styles.sectionTitle}>LOCATION</Text>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setLocationPrefsVisible(true);
          }}
        >
          <Ionicons name="location-outline" size={20} color="#0D5C3A" />
          <Text style={styles.actionButtonText}>Location Preferences</Text>
          <Ionicons name="chevron-forward" size={20} color="#999" />
        </TouchableOpacity>

        <AccountSection
          emailVerified={emailVerified}
          sendingVerification={sendingVerification}
          personalDetailsComplete={personalDetailsComplete}
          onSendVerification={handleSendVerificationEmail}
          onChangeEmail={() => { soundPlayer.play("click"); setEmailModalVisible(true); }}
          onChangePassword={() => { soundPlayer.play("click"); setPasswordModalVisible(true); }}
          onDeleteAccount={handleDeleteAccount}
        />

        <LegalSupportSection
          onOpenSupport={() => setSupportModalVisible(true)}
          onLogout={handleLogout}
        />
      </ScrollView>

      {/* MODALS */}
      <ChangeEmailModal
        visible={emailModalVisible}
        onClose={() => setEmailModalVisible(false)}
        onSubmit={handleSubmitEmailChange}
      />
      <ChangePasswordModal
        visible={passwordModalVisible}
        onClose={() => setPasswordModalVisible(false)}
        onSubmit={handleSubmitPasswordChange}
      />
      <DeleteAccountModal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
        onSubmit={executeAccountDeletion}
      />
      <SupportModal
        visible={supportModalVisible}
        onClose={() => setSupportModalVisible(false)}
        userId={userId}
      />
      <LocationPreferencesModal
        visible={locationPrefsVisible}
        onClose={() => { soundPlayer.play("click"); setLocationPrefsVisible(false); }}
        userId={userId || ""}
        onUpdate={fetchSettings}
      />
      <ImageCropModal
        visible={avatarCropVisible}
        onClose={() => setAvatarCropVisible(false)}
        onCropComplete={handleAvatarCropComplete}
        title="Profile Photo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  safeTop: { backgroundColor: "#0D5C3A" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#0D5C3A",
  },
  backIcon: { width: 24, height: 24, tintColor: "#FFF" },
  headerTitle: { color: "#FFF", fontSize: 18, fontWeight: "700" },
  scrollContent: { padding: 20, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0D5C3A",
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 12,
  },
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
});