/**
 * StepInvite — Wizard Step 3
 *
 * Two invite paths:
 *   1. On-platform: Search partners → toggle to invite → push notification on create
 *   2. Off-platform: "Invite via Text" → contacts picker → ghost entry with
 *      invite code → SMS with pre-filled message
 *
 * Ghost players get a 6-character invite code. New users enter the code
 * during onboarding to auto-join the invitational.
 */

import { db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import * as Haptics from "expo-haptics";
import * as SMS from "expo-sms";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// ============================================================================
// TYPES
// ============================================================================

export interface InvitedPlayer {
  userId: string | null; // null for ghost players
  displayName: string;
  avatar?: string;
  handicap?: number;
  ghostName?: string;
  ghostPhone?: string;
  inviteCode?: string; // 6-char code for ghost players
  isGhost: boolean;
}

interface StepInviteProps {
  currentUserId: string;
  invitedPlayers: InvitedPlayer[];
  onChange: (players: InvitedPlayer[]) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  maxPlayers: number;
  /** Invitational name — used in the SMS invite message */
  invitationalName: string;
}

interface PartnerOption {
  userId: string;
  displayName: string;
  avatar?: string;
  handicap?: number;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Generate a 6-character alphanumeric invite code (uppercase) */
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I/O/1/0 to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/** Extract the best phone number from a contact */
function getPhoneNumber(contact: Contacts.Contact): string | null {
  if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) return null;
  // Prefer mobile, then any
  const mobile = contact.phoneNumbers.find(
    (p) => p.label?.toLowerCase().includes("mobile") || p.label?.toLowerCase().includes("cell")
  );
  return (mobile || contact.phoneNumbers[0])?.number || null;
}

/** Get display name from contact */
function getContactName(contact: Contacts.Contact): string {
  if (contact.name) return contact.name;
  const parts = [contact.firstName, contact.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Unknown";
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function StepInvite({
  currentUserId,
  invitedPlayers,
  onChange,
  onBack,
  onSubmit,
  submitting,
  maxPlayers,
  invitationalName,
}: StepInviteProps) {
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    loadPartners();
  }, []);

  const loadPartners = async () => {
    try {
      const q1 = query(
        collection(db, "partners"),
        where("user1Id", "==", currentUserId)
      );
      const q2 = query(
        collection(db, "partners"),
        where("user2Id", "==", currentUserId)
      );

      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      const partnerIds = new Set<string>();

      snap1.docs.forEach((d) => partnerIds.add(d.data().user2Id));
      snap2.docs.forEach((d) => partnerIds.add(d.data().user1Id));

      const partnerList: PartnerOption[] = [];
      for (const uid of partnerIds) {
        try {
          const userDoc = await getDocs(
            query(collection(db, "users"), where("__name__", "==", uid))
          );
          if (!userDoc.empty) {
            const data = userDoc.docs[0].data();
            partnerList.push({
              userId: uid,
              displayName: data.displayName || "Unknown",
              avatar: data.avatar,
              handicap: data.handicapIndex,
            });
          }
        } catch (e) {
          // Skip failed lookups
        }
      }

      partnerList.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setPartners(partnerList);
    } catch (error) {
      console.error("Error loading partners:", error);
    } finally {
      setLoadingPartners(false);
    }
  };

  // ── On-platform invite (partners) ────────────────────────
  const isSelected = (userId: string) =>
    invitedPlayers.some((p) => p.userId === userId);

  const togglePartner = (partner: PartnerOption) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isSelected(partner.userId)) {
      onChange(invitedPlayers.filter((p) => p.userId !== partner.userId));
    } else {
      if (invitedPlayers.length >= maxPlayers - 1) {
        Alert.alert("Max Players", `This invitational is limited to ${maxPlayers} players.`);
        return;
      }
      onChange([
        ...invitedPlayers,
        {
          userId: partner.userId,
          displayName: partner.displayName,
          avatar: partner.avatar,
          handicap: partner.handicap,
          isGhost: false,
        },
      ]);
    }
  };

  // ── Off-platform invite (contacts + SMS) ─────────────────
  const handleInviteViaText = async () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Check player limit
    if (invitedPlayers.length >= maxPlayers - 1) {
      Alert.alert("Max Players", `This invitational is limited to ${maxPlayers} players.`);
      return;
    }

    // Request contacts permission
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Contacts Access Needed",
        "SwingThoughts needs access to your contacts to invite players. You can enable this in Settings.",
        [{ text: "OK" }]
      );
      return;
    }

    // Open contacts picker
    const contact = await Contacts.presentContactPickerAsync();

    if (!contact) return; // User cancelled

    const name = getContactName(contact);
    const phone = getPhoneNumber(contact);

    if (!phone) {
      Alert.alert(
        "No Phone Number",
        `${name} doesn't have a phone number in your contacts. Please add one and try again.`
      );
      return;
    }

    // Generate invite code
    const inviteCode = generateInviteCode();

    // Add ghost player to roster
    const ghostPlayer: InvitedPlayer = {
      userId: null,
      displayName: name,
      ghostName: name,
      ghostPhone: phone,
      inviteCode,
      isGhost: true,
    };

    onChange([...invitedPlayers, ghostPlayer]);

    // Check if SMS is available
    const smsAvailable = await SMS.isAvailableAsync();
    if (!smsAvailable) {
      Alert.alert(
        "SMS Not Available",
        `${name} was added to the roster. You'll need to share their invite code (${inviteCode}) manually.`
      );
      return;
    }

    // Compose and open SMS
    const message = `You've been invited to ${invitationalName || "an invitational"} on SwingThoughts! 🏌️\n\nDownload the app and enter invite code ${inviteCode} during signup to join.\n\nhttps://apps.apple.com/app/swingthoughts/id0000000000`;

    const { result } = await SMS.sendSMSAsync([phone], message);

    if (result === "sent") {
      soundPlayer.play("postThought");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  // ── Remove player ────────────────────────────────────────
  const removePlayer = (index: number) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(invitedPlayers.filter((_, i) => i !== index));
  };

  // ── Resend SMS for ghost player ──────────────────────────
  const handleResendSMS = async (player: InvitedPlayer) => {
    if (!player.ghostPhone || !player.inviteCode) return;

    const smsAvailable = await SMS.isAvailableAsync();
    if (!smsAvailable) {
      Alert.alert("SMS Not Available", `Invite code: ${player.inviteCode}`);
      return;
    }

    const message = `You've been invited to ${invitationalName || "an invitational"} on SwingThoughts! 🏌️\n\nDownload the app and enter invite code ${player.inviteCode} during signup to join.\n\nhttps://apps.apple.com/app/swingthoughts/id0000000000`;

    await SMS.sendSMSAsync([player.ghostPhone], message);
  };

  const filteredPartners = partners.filter((p) =>
    p.displayName.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.flex}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Invited count */}
        <View style={styles.countBar}>
          <Ionicons name="people" size={18} color="#0D5C3A" />
          <Text style={styles.countText}>
            {invitedPlayers.length + 1} / {maxPlayers} players
          </Text>
          <Text style={styles.countHint}>(including you as host)</Text>
        </View>

        {/* Selected players */}
        {invitedPlayers.length > 0 && (
          <View style={styles.selectedSection}>
            <Text style={styles.sectionLabel}>Invited</Text>
            {invitedPlayers.map((player, index) => (
              <View key={`invited-${index}`} style={styles.selectedRow}>
                <View
                  style={[
                    styles.avatarCircle,
                    player.isGhost && styles.avatarGhost,
                  ]}
                >
                  <Ionicons
                    name={player.isGhost ? "person-outline" : "person"}
                    size={16}
                    color="#FFF"
                  />
                </View>
                <View style={styles.selectedInfo}>
                  <Text style={styles.selectedName}>{player.displayName}</Text>
                  {player.isGhost && (
                    <View style={styles.ghostMetaRow}>
                      <Text style={styles.ghostLabel}>Off-platform</Text>
                      {player.inviteCode && (
                        <View style={styles.codeBadge}>
                          <Text style={styles.codeBadgeText}>{player.inviteCode}</Text>
                        </View>
                      )}
                    </View>
                  )}
                  {player.ghostPhone && (
                    <Text style={styles.ghostMeta}>{player.ghostPhone}</Text>
                  )}
                </View>
                <View style={styles.selectedActions}>
                  {player.isGhost && player.ghostPhone && (
                    <TouchableOpacity
                      onPress={() => handleResendSMS(player)}
                      style={styles.resendButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="chatbubble-outline" size={16} color="#0D5C3A" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => removePlayer(index)}
                    style={styles.removeButton}
                  >
                    <Ionicons name="close-circle" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Partners list */}
        <View style={styles.partnersSection}>
          <Text style={styles.sectionLabel}>Your Partners</Text>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search partners..."
              placeholderTextColor="#999"
              value={searchText}
              onChangeText={setSearchText}
              autoCorrect={false}
            />
          </View>

          {loadingPartners ? (
            <ActivityIndicator size="small" color="#0D5C3A" style={{ marginTop: 16 }} />
          ) : filteredPartners.length === 0 ? (
            <Text style={styles.emptyText}>
              {searchText
                ? "No partners match your search"
                : "No partners yet — add partners from the messaging tab"}
            </Text>
          ) : (
            filteredPartners.map((partner) => {
              const selected = isSelected(partner.userId);
              return (
                <TouchableOpacity
                  key={partner.userId}
                  style={[styles.partnerRow, selected && styles.partnerRowSelected]}
                  onPress={() => togglePartner(partner)}
                  activeOpacity={0.7}
                >
                  <View style={styles.avatarCircle}>
                    <Ionicons name="person" size={16} color="#FFF" />
                  </View>
                  <View style={styles.partnerInfo}>
                    <Text style={styles.partnerName}>{partner.displayName}</Text>
                    {partner.handicap != null && (
                      <Text style={styles.partnerHandicap}>
                        HCI: {partner.handicap.toFixed(1)}
                      </Text>
                    )}
                  </View>
                  <Ionicons
                    name={selected ? "checkmark-circle" : "add-circle-outline"}
                    size={22}
                    color={selected ? "#0D5C3A" : "#CCC"}
                  />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Invite via Text */}
        <View style={styles.smsSection}>
          <Text style={styles.sectionLabel}>Not on SwingThoughts?</Text>
          <TouchableOpacity
            style={styles.smsButton}
            onPress={handleInviteViaText}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#B8860B" />
            <View style={styles.smsButtonTextWrap}>
              <Text style={styles.smsButtonTitle}>Invite via Text</Text>
              <Text style={styles.smsButtonDesc}>
                Pick a contact and send them an invite code
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#B8860B" />
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onBack();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={18} color="#0D5C3A" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.createButton, submitting && styles.createButtonDisabled]}
          onPress={() => {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            onSubmit();
          }}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="trophy" size={18} color="#FFF" />
              <Text style={styles.createButtonText}>Create Invitational</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 16, gap: 20 },

  // Count bar
  countBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(13, 92, 58, 0.06)",
    borderRadius: 10,
    padding: 12,
  },
  countText: { fontSize: 14, fontWeight: "700", color: "#0D5C3A" },
  countHint: { fontSize: 12, color: "#888" },

  // Section labels
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },

  // Selected players
  selectedSection: { gap: 6 },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  selectedInfo: { flex: 1, gap: 2 },
  selectedName: { fontSize: 14, fontWeight: "600", color: "#333" },
  ghostMetaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  ghostLabel: { fontSize: 11, fontWeight: "600", color: "#B8860B" },
  codeBadge: {
    backgroundColor: "rgba(184, 134, 11, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  codeBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#B8860B",
    letterSpacing: 1,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  ghostMeta: { fontSize: 11, color: "#999" },
  selectedActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  resendButton: { padding: 4 },
  removeButton: { padding: 4 },

  // Avatar
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarGhost: { backgroundColor: "#B8860B" },

  // Partners section
  partnersSection: { gap: 6 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  searchInput: { flex: 1, fontSize: 14, color: "#333" },
  emptyText: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
    paddingVertical: 16,
  },
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 10,
    gap: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },
  partnerRowSelected: {
    borderColor: "#0D5C3A",
    backgroundColor: "rgba(13, 92, 58, 0.03)",
  },
  partnerInfo: { flex: 1, gap: 1 },
  partnerName: { fontSize: 14, fontWeight: "600", color: "#333" },
  partnerHandicap: { fontSize: 12, color: "#888" },

  // SMS invite section
  smsSection: {},
  smsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "rgba(184, 134, 11, 0.3)",
  },
  smsButtonTextWrap: { flex: 1, gap: 2 },
  smsButtonTitle: { fontSize: 14, fontWeight: "700", color: "#B8860B" },
  smsButtonDesc: { fontSize: 12, color: "#999" },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    backgroundColor: "#F4EED8",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#0D5C3A",
  },
  backButtonText: { fontSize: 15, fontWeight: "700", color: "#0D5C3A" },
  createButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#B8860B",
    borderRadius: 14,
    paddingVertical: 16,
  },
  createButtonDisabled: { opacity: 0.6 },
  createButtonText: { fontSize: 16, fontWeight: "700", color: "#FFF" },
});