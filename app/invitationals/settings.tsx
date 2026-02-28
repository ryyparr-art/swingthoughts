/**
 * Invitational Hub - Settings
 *
 * Host-only management screen:
 * - Event details (name, dates, scoring — editable)
 * - Roster management (add/remove players, add ghosts, resend invites)
 * - Handicap management (set manual handicaps if method = manual)
 * - Danger zone (cancel invitational)
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    doc,
    onSnapshot,
    serverTimestamp,
    Timestamp,
    updateDoc
} from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

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
  roster: RosterEntry[];
  playerCount: number;
  rounds: any[];
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
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function InvitationalSettings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const invitationalId = Array.isArray(id) ? id[0] : id;
  const currentUserId = auth.currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [invitational, setInvitational] = useState<Invitational | null>(null);
  const [isHost, setIsHost] = useState(false);

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
        }
        setLoading(false);
      }
    );

    return () => unsub();
  }, [invitationalId]);

  /* ================================================================ */
  /* HANDLERS                                                        */
  /* ================================================================ */

  const handleRemovePlayer = (entry: RosterEntry) => {
    if (!invitational || !invitationalId) return;

    // Can't remove host
    if (entry.userId === invitational.hostUserId) {
      Alert.alert("Can't Remove", "The host cannot be removed.");
      return;
    }

    const name = entry.displayName || entry.ghostName || "this player";

    Alert.alert("Remove Player", `Remove ${name} from the invitational?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            const updatedRoster = invitational.roster.filter((r) =>
              entry.isGhost
                ? r.ghostName !== entry.ghostName
                : r.userId !== entry.userId
            );

            await updateDoc(doc(db, "invitationals", invitationalId), {
              roster: updatedRoster,
              playerCount: updatedRoster.filter(
                (r) => r.status === "accepted" || r.status === "ghost"
              ).length,
              updatedAt: serverTimestamp(),
            });

            soundPlayer.play("click");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (error) {
            console.error("Error removing player:", error);
            Alert.alert("Error", "Failed to remove player.");
          }
        },
      },
    ]);
  };

  const handleSaveHandicap = async () => {
    if (!editHandicapPlayer || !invitational || !invitationalId) return;

    const hcp = parseFloat(handicapValue);
    if (isNaN(hcp) || hcp < 0 || hcp > 54) {
      Alert.alert("Invalid", "Enter a handicap between 0 and 54.");
      return;
    }

    try {
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
    }
  };

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
              console.error("Error cancelling invitational:", error);
              Alert.alert("Error", "Failed to cancel invitational.");
            }
          },
        },
      ]
    );
  };

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
      console.error("Error uploading invitational avatar:", error);
      Alert.alert("Error", "Failed to upload avatar.");
    }
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "accepted": return { label: "Accepted", color: "#0D5C3A", bg: "rgba(13, 92, 58, 0.1)" };
      case "invited": return { label: "Invited", color: "#2196F3", bg: "rgba(33, 150, 243, 0.1)" };
      case "declined": return { label: "Declined", color: "#999", bg: "rgba(0, 0, 0, 0.05)" };
      case "ghost": return { label: "Ghost", color: "#B8860B", bg: "rgba(184, 134, 11, 0.1)" };
      default: return { label: status, color: "#666", bg: "#F0F0F0" };
    }
  };

  /* ================================================================ */
  /* RENDER                                                          */
  /* ================================================================ */

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#B8860B" />
      </View>
    );
  }

  if (!isHost) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
            <Image source={require("@/assets/icons/Back.png")} style={styles.backIcon} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.emptyStateContainer}>
          <Ionicons name="lock-closed-outline" size={48} color="#CCC" />
          <Text style={styles.emptyTitle}>Host Only</Text>
          <Text style={styles.emptySubtitle}>
            Only the commissioner can manage settings
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => {
            soundPlayer.play("click");
            router.back();
          }}
        >
          <Image
            source={require("@/assets/icons/Back.png")}
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══ AVATAR ═══ */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={handleUploadAvatar}
            activeOpacity={0.7}
          >
            {invitational?.avatar ? (
              <Image
                source={{ uri: invitational.avatar }}
                style={styles.avatarImage}
              />
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
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Name</Text>
              <Text style={styles.infoValue}>{invitational?.name}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Dates</Text>
              <Text style={styles.infoValue}>
                {invitational?.isSingleDay
                  ? formatDate(invitational.startDate)
                  : `${formatDate(invitational!.startDate)} — ${formatDate(invitational!.endDate)}`}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Scoring</Text>
              <Text style={styles.infoValue}>
                {invitational?.overallScoring === "cumulative"
                  ? "Cumulative"
                  : invitational?.overallScoring === "points"
                  ? "Points"
                  : "Best Of"}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Handicap</Text>
              <Text style={styles.infoValue}>
                {invitational?.handicapMethod === "swingthoughts"
                  ? "SwingThoughts HCI"
                  : "Manual"}
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

        {/* ═══ ROSTER ═══ */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Roster ({invitational?.roster?.length || 0})
            </Text>
          </View>

          {invitational?.roster?.map((entry, index) => {
            const badge = getStatusBadge(entry.status);
            const isHostEntry = entry.userId === invitational.hostUserId;

            return (
              <View key={`roster-${index}`} style={styles.rosterRow}>
                {/* Avatar */}
                <View style={[
                  styles.rosterAvatar,
                  entry.isGhost && styles.rosterAvatarGhost,
                ]}>
                  {entry.avatar ? (
                    <Image source={{ uri: entry.avatar }} style={styles.rosterAvatarImg} />
                  ) : (
                    <Text style={styles.rosterAvatarText}>
                      {(entry.displayName || entry.ghostName || "?").charAt(0)}
                    </Text>
                  )}
                </View>

                {/* Info */}
                <View style={styles.rosterInfo}>
                  <View style={styles.rosterNameRow}>
                    <Text style={styles.rosterName}>
                      {entry.displayName || entry.ghostName}
                    </Text>
                    {isHostEntry && (
                      <View style={styles.hostBadge}>
                        <Text style={styles.hostBadgeText}>Host</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.rosterMeta}>
                    <View style={[styles.rosterStatusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.rosterStatusText, { color: badge.color }]}>
                        {badge.label}
                      </Text>
                    </View>
                    {invitational.handicapMethod === "manual" && (
                      <TouchableOpacity
                        onPress={() => {
                          setEditHandicapPlayer(entry);
                          setHandicapValue(
                            entry.invitationalHandicap != null
                              ? entry.invitationalHandicap.toString()
                              : ""
                          );
                        }}
                        style={styles.handicapChip}
                      >
                        <Text style={styles.handicapChipText}>
                          HCP: {entry.invitationalHandicap ?? "—"}
                        </Text>
                        <Ionicons name="pencil" size={10} color="#B8860B" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Remove */}
                {!isHostEntry && (
                  <TouchableOpacity
                    style={styles.removePlayerButton}
                    onPress={() => handleRemovePlayer(entry)}
                  >
                    <Ionicons name="close-circle" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* ═══ DANGER ZONE ═══ */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: "#FF3B30" }]}>
            Danger Zone
          </Text>
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

      {/* Handicap Edit Modal */}
      <Modal
        visible={!!editHandicapPlayer}
        transparent
        animationType="fade"
        onRequestClose={() => setEditHandicapPlayer(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setEditHandicapPlayer(null)}
        >
          <Pressable
            style={styles.handicapModalContent}
            onPress={(e) => e.stopPropagation()}
          >
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
              <TouchableOpacity
                onPress={() => setEditHandicapPlayer(null)}
                style={styles.handicapCancelButton}
              >
                <Text style={styles.handicapCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveHandicap}
                style={styles.handicapSaveButton}
              >
                <Text style={styles.handicapSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#0D5C3A",
  },
  headerButton: { padding: 8 },
  backIcon: { width: 24, height: 24, tintColor: "#F4EED8" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#F4EED8" },
  headerRight: { width: 40 },

  // Content
  content: { flex: 1 },
  contentContainer: { padding: 16, gap: 24 },

  // Avatar
  avatarSection: {
    alignItems: "center",
    gap: 6,
  },
  avatarButton: {
    position: "relative",
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: "#B8860B",
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#B8860B",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(184, 134, 11, 0.3)",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#F4EED8",
  },
  avatarName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginTop: 4,
  },
  avatarHint: {
    fontSize: 12,
    color: "#999",
  },

  // Section
  section: { gap: 10 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },

  // Card
  card: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 14,
    color: "#666",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginVertical: 2,
  },

  // Roster
  rosterRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  rosterAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  rosterAvatarGhost: {
    backgroundColor: "#B8860B",
  },
  rosterAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  rosterAvatarText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },
  rosterInfo: {
    flex: 1,
    gap: 4,
  },
  rosterNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rosterName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  hostBadge: {
    backgroundColor: "rgba(13, 92, 58, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  rosterMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rosterStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rosterStatusText: {
    fontSize: 10,
    fontWeight: "700",
  },
  handicapChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(184, 134, 11, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  handicapChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#B8860B",
  },
  removePlayerButton: {
    padding: 4,
  },

  // Danger zone
  dangerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 59, 48, 0.2)",
  },
  dangerButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FF3B30",
  },

  // Handicap Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  handicapModalContent: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    width: "85%",
    gap: 16,
  },
  handicapModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
  },
  handicapInput: {
    backgroundColor: "#F8F8F8",
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  handicapModalActions: {
    flexDirection: "row",
    gap: 12,
  },
  handicapCancelButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DDD",
  },
  handicapCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#999",
  },
  handicapSaveButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#B8860B",
  },
  handicapSaveText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
  },

  // Empty state
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
});