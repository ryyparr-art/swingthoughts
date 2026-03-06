/**
 * Invitational Hub - Settings
 *
 * Host-only management screen:
 * - Avatar upload
 * - Event details (name, dates, visibility — all editable)
 * - Handicap management (set manual handicaps if method = manual)
 * - Reschedule for Next Year (creates new doc, preserves history)
 * - Danger zone (cancel invitational)
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

type Visibility = "public" | "private" | "partners only";

interface Invitational {
  id: string;
  name: string;
  avatar?: string;
  hostUserId: string;
  hostName: string;
  status: string;
  startDate: Timestamp;
  endDate: Timestamp;
  isSingleDay: boolean;
  maxPlayers: number;
  overallScoring: string;
  handicapMethod: string;
  visibility: Visibility;
  roster: RosterEntry[];
  playerCount: number;
  rounds: any[];
  location?: string;
}

interface RosterEntry {
  userId: string | null;
  displayName: string;
  avatar?: string;
  handicap?: number;
  invitationalHandicap: number | null;
  status: string;
  isGhost: boolean;
  ghostName?: string;
  ghostEmail?: string;
}

/* ================================================================ */
/* CONSTANTS                                                        */
/* ================================================================ */

const VISIBILITY_OPTIONS: { value: Visibility; label: string; description: string; icon: string }[] = [
  { value: "public", label: "Public", description: "Anyone can find and follow", icon: "globe-outline" },
  { value: "private", label: "Private", description: "Invite only, not discoverable", icon: "lock-closed-outline" },
  { value: "partners only", label: "Partners Only", description: "Visible to SwingThoughts partners", icon: "people-outline" },
];

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function InvitationalSettings() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const invitationalId = Array.isArray(id) ? id[0] : id;
  const currentUserId = auth.currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invitational, setInvitational] = useState<Invitational | null>(null);
  const [isHost, setIsHost] = useState(false);

  // Inline edit states
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [editingVisibility, setEditingVisibility] = useState(false);

  // Date picker states
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [tempStartDate, setTempStartDate] = useState<Date | null>(null);
  const [tempEndDate, setTempEndDate] = useState<Date | null>(null);

  // Handicap edit modal
  const [editHandicapPlayer, setEditHandicapPlayer] = useState<RosterEntry | null>(null);
  const [handicapValue, setHandicapValue] = useState("");

  /* ================================================================ */
  /* DATA LOADING                                                    */
  /* ================================================================ */

  useEffect(() => {
    if (!invitationalId) return;

    const unsub = onSnapshot(
      doc(db, "invitationals", invitationalId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as Invitational;
          setInvitational(data);
          setIsHost(data.hostUserId === currentUserId);
          setNameValue(data.name);
        }
        setLoading(false);
      }
    );

    return () => unsub();
  }, [invitationalId]);

  /* ================================================================ */
  /* HANDLERS — NAME                                                 */
  /* ================================================================ */

  const handleSaveName = async () => {
    if (!invitational || !invitationalId || !nameValue.trim()) return;
    if (nameValue.trim() === invitational.name) {
      setEditingName(false);
      return;
    }

    try {
      setSaving(true);
      await updateDoc(doc(db, "invitationals", invitationalId), {
        name: nameValue.trim(),
        updatedAt: serverTimestamp(),
      });
      soundPlayer.play("click");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingName(false);
    } catch (error) {
      console.error("Error saving name:", error);
      Alert.alert("Error", "Failed to update name.");
    } finally {
      setSaving(false);
    }
  };

  /* ================================================================ */
  /* HANDLERS — DATES                                                */
  /* ================================================================ */

  const handleSaveStartDate = async (date: Date) => {
    if (!invitational || !invitationalId) return;

    // Ensure end date is at least 3 days after start (4 day minimum)
    const minEnd = new Date(date);
    minEnd.setDate(minEnd.getDate() + 3);
    const newEnd = invitational.endDate.toDate() < minEnd ? minEnd : invitational.endDate.toDate();

    try {
      setSaving(true);
      await updateDoc(doc(db, "invitationals", invitationalId), {
        startDate: Timestamp.fromDate(date),
        endDate: Timestamp.fromDate(newEnd),
        isSingleDay: false,
        updatedAt: serverTimestamp(),
      });
      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error("Error saving start date:", error);
      Alert.alert("Error", "Failed to update start date.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEndDate = async (date: Date) => {
    if (!invitational || !invitationalId) return;

    const startDate = invitational.startDate.toDate();
    const minEnd = new Date(startDate);
    minEnd.setDate(minEnd.getDate() + 3);

    if (date < minEnd) {
      Alert.alert("Invalid Date", "End date must be at least 4 days after start date.");
      return;
    }

    try {
      setSaving(true);
      await updateDoc(doc(db, "invitationals", invitationalId), {
        endDate: Timestamp.fromDate(date),
        isSingleDay: false,
        updatedAt: serverTimestamp(),
      });
      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error("Error saving end date:", error);
      Alert.alert("Error", "Failed to update end date.");
    } finally {
      setSaving(false);
    }
  };

  /* ================================================================ */
  /* HANDLERS — VISIBILITY                                           */
  /* ================================================================ */

  const handleSaveVisibility = async (value: Visibility) => {
    if (!invitationalId) return;
    try {
      setSaving(true);
      await updateDoc(doc(db, "invitationals", invitationalId), {
        visibility: value,
        updatedAt: serverTimestamp(),
      });
      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setEditingVisibility(false);
    } catch (error) {
      console.error("Error saving visibility:", error);
      Alert.alert("Error", "Failed to update visibility.");
    } finally {
      setSaving(false);
    }
  };

  /* ================================================================ */
  /* HANDLERS — HANDICAP                                             */
  /* ================================================================ */

  const handleSaveHandicap = async () => {
    if (!editHandicapPlayer || !invitational || !invitationalId) return;

    const hcp = parseFloat(handicapValue);
    if (isNaN(hcp) || hcp < 0 || hcp > 54) {
      Alert.alert("Invalid", "Enter a handicap between 0 and 54.");
      return;
    }

    try {
      setSaving(true);
      const updatedRoster = invitational.roster.map((r) => {
        if (
          (editHandicapPlayer.isGhost && r.ghostName === editHandicapPlayer.ghostName) ||
          (!editHandicapPlayer.isGhost && r.userId === editHandicapPlayer.userId)
        ) {
          return { ...r, invitationalHandicap: hcp };
        }
        return r;
      });

      await updateDoc(doc(db, "invitationals", invitationalId), {
        roster: updatedRoster,
        updatedAt: serverTimestamp(),
      });

      soundPlayer.play("click");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditHandicapPlayer(null);
      setHandicapValue("");
    } catch (error) {
      console.error("Error saving handicap:", error);
      Alert.alert("Error", "Failed to update handicap.");
    } finally {
      setSaving(false);
    }
  };

  /* ================================================================ */
  /* HANDLERS — AVATAR                                               */
  /* ================================================================ */

  const handleUploadAvatar = async () => {
    if (!invitationalId) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) return;

      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();
      const storage = getStorage();
      const storageRef = ref(storage, `invitationals/${invitationalId}/avatar.jpg`);
      await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);

      await updateDoc(doc(db, "invitationals", invitationalId), {
        avatar: downloadUrl,
        updatedAt: serverTimestamp(),
      });

      soundPlayer.play("postThought");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error uploading avatar:", error);
      Alert.alert("Error", "Failed to upload avatar.");
    } finally {
      setSaving(false);
    }
  };

  /* ================================================================ */
  /* HANDLERS — RESCHEDULE FOR NEXT YEAR                             */
  /* ================================================================ */

  const handleRescheduleNextYear = () => {
    if (!invitational || !invitationalId) return;

    const nextStartDate = new Date(invitational.startDate.toDate());
    nextStartDate.setFullYear(nextStartDate.getFullYear() + 1);

    const nextEndDate = new Date(invitational.endDate.toDate());
    nextEndDate.setFullYear(nextEndDate.getFullYear() + 1);

    const nextYear = nextStartDate.getFullYear();

    Alert.alert(
      "Run It Back 🏌️",
      `Create ${invitational.name} ${nextYear}?\n\nDates will shift to ${formatDate(Timestamp.fromDate(nextStartDate))} — ${formatDate(Timestamp.fromDate(nextEndDate))}. Roster carries over as invited. This event stays as your historical record.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: `Create ${nextYear} Event`,
          onPress: async () => {
            try {
              setSaving(true);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

              // Reset roster statuses to invited, clear scores
              const resetRoster = invitational.roster.map((r) => ({
                ...r,
                status: r.isGhost ? "ghost" : "invited",
                invitationalHandicap: null,
              }));

              await addDoc(collection(db, "invitationals"), {
                name: invitational.name,
                avatar: invitational.avatar || null,
                hostUserId: invitational.hostUserId,
                hostName: invitational.hostName,
                status: "upcoming",
                startDate: Timestamp.fromDate(nextStartDate),
                endDate: Timestamp.fromDate(nextEndDate),
                isSingleDay: false,
                maxPlayers: invitational.maxPlayers,
                overallScoring: invitational.overallScoring,
                handicapMethod: invitational.handicapMethod,
                visibility: invitational.visibility ?? "public",
                location: invitational.location ?? null,
                roster: resetRoster,
                playerCount: resetRoster.filter(
                  (r) => r.status === "ghost"
                ).length,
                rounds: [],
                previousInvitationalId: invitationalId,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });

              soundPlayer.play("achievement");
              Alert.alert(
                "Created! 🏆",
                `${invitational.name} ${nextYear} is ready. Find it in your invitationals.`
              );
            } catch (error) {
              console.error("Error rescheduling:", error);
              Alert.alert("Error", "Failed to create next year's event.");
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  /* ================================================================ */
  /* HANDLERS — CANCEL                                               */
  /* ================================================================ */

  const handleCancelInvitational = () => {
    if (!invitational || !invitationalId) return;

    const hasActiveRounds = invitational.rounds?.some(
      (r: any) => r.status === "active"
    );

    if (hasActiveRounds) {
      Alert.alert(
        "Can't Cancel",
        "There are active rounds in progress. Complete or abandon them first."
      );
      return;
    }

    Alert.alert(
      "Cancel Invitational",
      `Are you sure you want to cancel "${invitational.name}"? This cannot be undone.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel Event",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "invitationals", invitationalId), {
                status: "cancelled",
                updatedAt: serverTimestamp(),
              });
              soundPlayer.play("click");
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              router.back();
            } catch (error) {
              console.error("Error cancelling:", error);
              Alert.alert("Error", "Failed to cancel invitational.");
            }
          },
        },
      ]
    );
  };

  /* ================================================================ */
  /* HELPERS                                                         */
  /* ================================================================ */

  const formatDate = (timestamp: Timestamp) => {
    if (!timestamp?.toDate) return "TBD";
    return timestamp.toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const currentVisibility = invitational?.visibility ?? "public";
  const visibilityOption = VISIBILITY_OPTIONS.find((v) => v.value === currentVisibility) || VISIBILITY_OPTIONS[0];

  /* ================================================================ */
  /* RENDER — LOADING                                                */
  /* ================================================================ */

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#B8860B" />
      </View>
    );
  }

  /* ================================================================ */
  /* RENDER — NOT HOST                                               */
  /* ================================================================ */

  if (!isHost) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="#F4EED8" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.emptyStateContainer}>
          <Ionicons name="lock-closed-outline" size={48} color="#CCC" />
          <Text style={styles.emptyTitle}>Host Only</Text>
          <Text style={styles.emptySubtitle}>Only the host can manage settings</Text>
        </View>
      </SafeAreaView>
    );
  }

  /* ================================================================ */
  /* RENDER — MAIN                                                   */
  /* ================================================================ */

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => { soundPlayer.play("click"); router.back(); }}
        >
          <Ionicons name="chevron-back" size={28} color="#F4EED8" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerRight}>
          {saving && <ActivityIndicator size="small" color="#F4EED8" />}
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══ AVATAR ═══ */}
        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarButton} onPress={handleUploadAvatar} activeOpacity={0.7}>
            {invitational?.avatar ? (
              <Image source={{ uri: invitational.avatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="trophy" size={36} color="#FFF" />
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={12} color="#FFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarName}>{invitational?.name}</Text>
          <Text style={styles.avatarHint}>Tap photo to change</Text>
        </View>

        {/* ═══ EVENT DETAILS ═══ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Event Details</Text>
          <View style={styles.card}>

            {/* Name — editable */}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name</Text>
              {editingName ? (
                <View style={styles.inlineEditRow}>
                  <TextInput
                    style={styles.inlineInput}
                    value={nameValue}
                    onChangeText={setNameValue}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSaveName}
                  />
                  <TouchableOpacity onPress={handleSaveName} style={styles.inlineSaveButton}>
                    <Text style={styles.inlineSaveText}>Save</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setEditingName(false); setNameValue(invitational?.name ?? ""); }}>
                    <Ionicons name="close" size={18} color="#999" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.editableValueRow}
                  onPress={() => setEditingName(true)}
                >
                  <Text style={styles.infoValue}>{invitational?.name}</Text>
                  <Ionicons name="pencil" size={14} color="#B8860B" style={styles.editIcon} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.divider} />

            {/* Start Date — editable */}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Start Date</Text>
              <TouchableOpacity
                style={styles.editableValueRow}
                onPress={() => {
                  setTempStartDate(invitational!.startDate.toDate());
                  setShowStartPicker(true);
                }}
              >
                <Text style={styles.infoValue}>{formatDate(invitational!.startDate)}</Text>
                <Ionicons name="pencil" size={14} color="#B8860B" style={styles.editIcon} />
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {/* End Date — editable */}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>End Date</Text>
              <TouchableOpacity
                style={styles.editableValueRow}
                onPress={() => {
                  setTempEndDate(invitational!.endDate.toDate());
                  setShowEndPicker(true);
                }}
              >
                <Text style={styles.infoValue}>{formatDate(invitational!.endDate)}</Text>
                <Ionicons name="pencil" size={14} color="#B8860B" style={styles.editIcon} />
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {/* Visibility — editable */}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Visibility</Text>
              <TouchableOpacity
                style={styles.editableValueRow}
                onPress={() => setEditingVisibility(true)}
              >
                <Ionicons name={visibilityOption.icon as any} size={14} color="#0D5C3A" style={{ marginRight: 4 }} />
                <Text style={styles.infoValue}>{visibilityOption.label}</Text>
                <Ionicons name="pencil" size={14} color="#B8860B" style={styles.editIcon} />
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {/* Read-only fields */}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Scoring</Text>
              <Text style={styles.infoValue}>
                {invitational?.overallScoring === "cumulative" ? "Cumulative"
                  : invitational?.overallScoring === "points" ? "Points"
                  : "Best Of"}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Handicap</Text>
              <Text style={styles.infoValue}>
                {invitational?.handicapMethod === "swingthoughts" ? "SwingThoughts HCI" : "Manual"}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Max Players</Text>
              <Text style={styles.infoValue}>{invitational?.maxPlayers}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Rounds</Text>
              <Text style={styles.infoValue}>{invitational?.rounds?.length || 0}</Text>
            </View>
          </View>
        </View>

        {/* ═══ HANDICAPS ═══ */}
        {invitational?.handicapMethod === "manual" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Handicaps</Text>
            {invitational.roster.map((entry, index) => (
              <View key={`hcp-${index}`} style={styles.rosterRow}>
                <View style={[styles.rosterAvatar, entry.isGhost && styles.rosterAvatarGhost]}>
                  {entry.avatar ? (
                    <Image source={{ uri: entry.avatar }} style={styles.rosterAvatarImg} />
                  ) : (
                    <Text style={styles.rosterAvatarText}>
                      {(entry.displayName || entry.ghostName || "?").charAt(0)}
                    </Text>
                  )}
                </View>
                <Text style={styles.rosterName}>{entry.displayName || entry.ghostName}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setEditHandicapPlayer(entry);
                    setHandicapValue(
                      entry.invitationalHandicap != null ? entry.invitationalHandicap.toString() : ""
                    );
                  }}
                  style={styles.handicapChip}
                >
                  <Text style={styles.handicapChipText}>
                    HCP: {entry.invitationalHandicap ?? "—"}
                  </Text>
                  <Ionicons name="pencil" size={10} color="#B8860B" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ═══ RUN IT BACK ═══ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Annual Event</Text>
          <TouchableOpacity
            style={styles.runItBackButton}
            onPress={handleRescheduleNextYear}
            activeOpacity={0.7}
          >
            <View style={styles.runItBackIcon}>
              <Ionicons name="calendar" size={20} color="#B8860B" />
            </View>
            <View style={styles.runItBackText}>
              <Text style={styles.runItBackTitle}>Run It Back 🏌️</Text>
              <Text style={styles.runItBackSubtitle}>
                Create next year's event with the same group
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#CCC" />
          </TouchableOpacity>
        </View>

        {/* ═══ DANGER ZONE ═══ */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: "#FF3B30" }]}>Danger Zone</Text>
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={handleCancelInvitational}
            activeOpacity={0.7}
          >
            <Ionicons name="warning-outline" size={18} color="#FF3B30" />
            <Text style={styles.dangerButtonText}>Cancel Invitational</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ═══ DATE PICKERS ═══ */}
      {showStartPicker && tempStartDate && (
        Platform.OS === "ios" ? (
          <Modal visible={showStartPicker} animationType="slide" transparent>
            <View style={styles.pickerModalOverlay}>
              <View style={styles.pickerContainer}>
                <View style={styles.pickerHeader}>
                  <TouchableOpacity onPress={() => setShowStartPicker(false)}>
                    <Text style={styles.pickerCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.pickerTitle}>Start Date</Text>
                  <TouchableOpacity onPress={() => { handleSaveStartDate(tempStartDate); setShowStartPicker(false); }}>
                    <Text style={styles.pickerDone}>Confirm</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={tempStartDate}
                  mode="date"
                  display="spinner"
                  onChange={(e, date) => date && setTempStartDate(date)}
                  minimumDate={new Date()}
                />
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={tempStartDate}
            mode="date"
            display="default"
            onChange={(e, date) => { setShowStartPicker(false); if (date) handleSaveStartDate(date); }}
            minimumDate={new Date()}
          />
        )
      )}

      {showEndPicker && tempEndDate && (
        Platform.OS === "ios" ? (
          <Modal visible={showEndPicker} animationType="slide" transparent>
            <View style={styles.pickerModalOverlay}>
              <View style={styles.pickerContainer}>
                <View style={styles.pickerHeader}>
                  <TouchableOpacity onPress={() => setShowEndPicker(false)}>
                    <Text style={styles.pickerCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.pickerTitle}>End Date</Text>
                  <TouchableOpacity onPress={() => { handleSaveEndDate(tempEndDate); setShowEndPicker(false); }}>
                    <Text style={styles.pickerDone}>Confirm</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={tempEndDate}
                  mode="date"
                  display="spinner"
                  onChange={(e, date) => date && setTempEndDate(date)}
                  minimumDate={(() => { const d = new Date(invitational!.startDate.toDate()); d.setDate(d.getDate() + 3); return d; })()}
                />
              </View>
            </View>
          </Modal>
        ) : (
          <DateTimePicker
            value={tempEndDate}
            mode="date"
            display="default"
            onChange={(e, date) => { setShowEndPicker(false); if (date) handleSaveEndDate(date); }}
            minimumDate={(() => { const d = new Date(invitational!.startDate.toDate()); d.setDate(d.getDate() + 3); return d; })()}
          />
        )
      )}

      {/* ═══ VISIBILITY MODAL ═══ */}
      <Modal
        visible={editingVisibility}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingVisibility(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setEditingVisibility(false)}>
          <Pressable style={styles.visibilityModalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.visibilityModalTitle}>Visibility</Text>
            {VISIBILITY_OPTIONS.map((option) => {
              const isSelected = currentVisibility === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.visibilityOption, isSelected && styles.visibilityOptionSelected]}
                  onPress={() => handleSaveVisibility(option.value)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.visibilityIconWrap, isSelected && styles.visibilityIconWrapSelected]}>
                    <Ionicons name={option.icon as any} size={20} color={isSelected ? "#FFF" : "#666"} />
                  </View>
                  <View style={styles.visibilityTextWrap}>
                    <Text style={[styles.visibilityLabel, isSelected && styles.visibilityLabelSelected]}>
                      {option.label}
                    </Text>
                    <Text style={styles.visibilityDescription}>{option.description}</Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark-circle" size={20} color="#0D5C3A" />}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══ HANDICAP EDIT MODAL ═══ */}
      <Modal
        visible={!!editHandicapPlayer}
        transparent
        animationType="fade"
        onRequestClose={() => setEditHandicapPlayer(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setEditHandicapPlayer(null)}>
          <Pressable style={styles.handicapModalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.handicapModalTitle}>
              Set Handicap — {editHandicapPlayer?.displayName || editHandicapPlayer?.ghostName}
            </Text>
            <TextInput
              style={styles.handicapInput}
              placeholder="Enter handicap (0-54)"
              placeholderTextColor="#999"
              value={handicapValue}
              onChangeText={setHandicapValue}
              keyboardType="decimal-pad"
              autoFocus
            />
            <View style={styles.handicapModalActions}>
              <TouchableOpacity onPress={() => setEditHandicapPlayer(null)} style={styles.handicapCancelButton}>
                <Text style={styles.handicapCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveHandicap} style={styles.handicapSaveButton}>
                <Text style={styles.handicapSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  loadingContainer: { justifyContent: "center", alignItems: "center" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },
  headerButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#F4EED8" },
  headerRight: { width: 40, alignItems: "flex-end" },

  // Content
  content: { flex: 1 },
  contentContainer: { padding: 16, gap: 24 },

  // Avatar
  avatarSection: { alignItems: "center", gap: 6 },
  avatarButton: { position: "relative" },
  avatarImage: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: "#B8860B" },
  avatarPlaceholder: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: "#B8860B",
    alignItems: "center", justifyContent: "center", borderWidth: 3,
    borderColor: "rgba(184, 134, 11, 0.3)",
  },
  avatarEditBadge: {
    position: "absolute", bottom: 2, right: 2, width: 28, height: 28,
    borderRadius: 14, backgroundColor: "#0D5C3A", alignItems: "center",
    justifyContent: "center", borderWidth: 2, borderColor: "#F4EED8",
  },
  avatarName: { fontSize: 18, fontWeight: "700", color: "#333", marginTop: 4 },
  avatarHint: { fontSize: 12, color: "#999" },

  // Section
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#333" },

  // Card
  card: { backgroundColor: "#FFF", borderRadius: 12, padding: 14 },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", paddingVertical: 6,
  },
  infoLabel: { fontSize: 14, color: "#666" },
  infoValue: { fontSize: 14, fontWeight: "600", color: "#333" },
  divider: { height: 1, backgroundColor: "#F0F0F0", marginVertical: 2 },

  // Editable row
  editableValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  editIcon: { marginLeft: 4 },
  inlineEditRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "flex-end" },
  inlineInput: {
    flex: 1, fontSize: 14, fontWeight: "600", color: "#333",
    borderBottomWidth: 1, borderBottomColor: "#B8860B", paddingVertical: 2,
    textAlign: "right",
  },
  inlineSaveButton: {
    backgroundColor: "#0D5C3A", paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: 6,
  },
  inlineSaveText: { color: "#FFF", fontSize: 12, fontWeight: "700" },

  // Handicaps section
  rosterRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#FFF", borderRadius: 10, padding: 12, gap: 10,
  },
  rosterAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "#0D5C3A",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  rosterAvatarGhost: { backgroundColor: "#B8860B" },
  rosterAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  rosterAvatarText: { fontSize: 14, fontWeight: "700", color: "#FFF" },
  rosterName: { flex: 1, fontSize: 14, fontWeight: "600", color: "#333" },
  handicapChip: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(184, 134, 11, 0.1)", paddingHorizontal: 8,
    paddingVertical: 4, borderRadius: 6,
  },
  handicapChipText: { fontSize: 12, fontWeight: "700", color: "#B8860B" },

  // Run It Back
  runItBackButton: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#FFF",
    borderRadius: 12, padding: 14, gap: 12,
    borderWidth: 1, borderColor: "rgba(184, 134, 11, 0.2)",
  },
  runItBackIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(184, 134, 11, 0.1)",
    alignItems: "center", justifyContent: "center",
  },
  runItBackText: { flex: 1 },
  runItBackTitle: { fontSize: 15, fontWeight: "700", color: "#333" },
  runItBackSubtitle: { fontSize: 12, color: "#999", marginTop: 2 },

  // Danger zone
  dangerButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: "#FFF", borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: "rgba(255, 59, 48, 0.2)",
  },
  dangerButtonText: { fontSize: 15, fontWeight: "700", color: "#FF3B30" },

  // Date picker modal
  pickerModalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  pickerContainer: { backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  pickerHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#E5E5E5",
  },
  pickerTitle: { fontSize: 17, fontWeight: "700", color: "#333" },
  pickerCancel: { fontSize: 16, color: "#999", fontWeight: "600" },
  pickerDone: { fontSize: 16, color: "#0D5C3A", fontWeight: "700" },

  // Visibility modal
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  visibilityModalContent: {
    backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, gap: 12,
  },
  visibilityModalTitle: { fontSize: 18, fontWeight: "700", color: "#333", marginBottom: 4 },
  visibilityOption: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#F0F0F0",
  },
  visibilityOptionSelected: { borderColor: "#0D5C3A", backgroundColor: "rgba(13, 92, 58, 0.03)" },
  visibilityIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "#F5F5F5", alignItems: "center", justifyContent: "center",
  },
  visibilityIconWrapSelected: { backgroundColor: "#0D5C3A" },
  visibilityTextWrap: { flex: 1 },
  visibilityLabel: { fontSize: 15, fontWeight: "700", color: "#333" },
  visibilityLabelSelected: { color: "#0D5C3A" },
  visibilityDescription: { fontSize: 12, color: "#999", marginTop: 2 },

  // Handicap modal
  handicapModalContent: {
    backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, gap: 16,
  },
  handicapModalTitle: { fontSize: 16, fontWeight: "700", color: "#333", textAlign: "center" },
  handicapInput: {
    backgroundColor: "#F8F8F8", borderRadius: 10, padding: 14,
    fontSize: 18, fontWeight: "700", color: "#333", textAlign: "center",
    borderWidth: 1, borderColor: "#E0E0E0",
  },
  handicapModalActions: { flexDirection: "row", gap: 12 },
  handicapCancelButton: {
    flex: 1, alignItems: "center", paddingVertical: 12,
    borderRadius: 8, borderWidth: 1, borderColor: "#DDD",
  },
  handicapCancelText: { fontSize: 15, fontWeight: "600", color: "#999" },
  handicapSaveButton: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 8, backgroundColor: "#B8860B" },
  handicapSaveText: { fontSize: 15, fontWeight: "700", color: "#FFF" },

  // Empty state
  emptyStateContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#333" },
  emptySubtitle: { fontSize: 14, color: "#999", textAlign: "center" },
});