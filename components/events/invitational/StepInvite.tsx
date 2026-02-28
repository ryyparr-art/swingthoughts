/**
 * StepInvite — Wizard Step 3
 *
 * Invite players from partners list, add ghost players,
 * or share an invite link. Final "Create Invitational" button.
 *
 * Ghost players: commissioner enters a name (+ optional email/phone)
 * for players not on the app. They appear on the roster and can
 * claim their data later.
 */

import { db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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

export interface InvitedPlayer {
  userId: string | null;       // null for ghost players
  displayName: string;
  avatar?: string;
  handicap?: number;
  ghostName?: string;
  ghostEmail?: string;
  ghostPhone?: string;
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
}

interface PartnerOption {
  userId: string;
  displayName: string;
  avatar?: string;
  handicap?: number;
}

export default function StepInvite({
  currentUserId,
  invitedPlayers,
  onChange,
  onBack,
  onSubmit,
  submitting,
  maxPlayers,
}: StepInviteProps) {
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [showGhostForm, setShowGhostForm] = useState(false);
  const [ghostName, setGhostName] = useState("");
  const [ghostEmail, setGhostEmail] = useState("");

  useEffect(() => {
    loadPartners();
  }, []);

  const loadPartners = async () => {
    try {
      // Query partnerships where current user is participant
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

      // Load partner user docs
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

  const addGhostPlayer = () => {
    if (!ghostName.trim()) return;

    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (invitedPlayers.length >= maxPlayers - 1) {
      Alert.alert("Max Players", `This invitational is limited to ${maxPlayers} players.`);
      return;
    }

    onChange([
      ...invitedPlayers,
      {
        userId: null,
        displayName: ghostName.trim(),
        ghostName: ghostName.trim(),
        ghostEmail: ghostEmail.trim() || undefined,
        isGhost: true,
      },
    ]);

    setGhostName("");
    setGhostEmail("");
    setShowGhostForm(false);
  };

  const removePlayer = (index: number) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(invitedPlayers.filter((_, i) => i !== index));
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
                <View style={[
                  styles.avatarCircle,
                  player.isGhost && styles.avatarGhost,
                ]}>
                  <Ionicons
                    name={player.isGhost ? "person-outline" : "person"}
                    size={16}
                    color="#FFF"
                  />
                </View>
                <View style={styles.selectedInfo}>
                  <Text style={styles.selectedName}>{player.displayName}</Text>
                  {player.isGhost && (
                    <Text style={styles.ghostLabel}>Ghost Player</Text>
                  )}
                  {player.ghostEmail && (
                    <Text style={styles.ghostMeta}>{player.ghostEmail}</Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => removePlayer(index)}
                  style={styles.removeButton}
                >
                  <Ionicons name="close-circle" size={20} color="#FF3B30" />
                </TouchableOpacity>
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
              {searchText ? "No partners match your search" : "No partners yet — add partners from the messaging tab"}
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

        {/* Ghost Player */}
        <View style={styles.ghostSection}>
          <Text style={styles.sectionLabel}>Not on SwingThoughts?</Text>

          {showGhostForm ? (
            <View style={styles.ghostForm}>
              <TextInput
                style={styles.ghostInput}
                placeholder="Player name"
                placeholderTextColor="#999"
                value={ghostName}
                onChangeText={setGhostName}
                autoCapitalize="words"
              />
              <TextInput
                style={styles.ghostInput}
                placeholder="Email (optional — for invite notification)"
                placeholderTextColor="#999"
                value={ghostEmail}
                onChangeText={setGhostEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <View style={styles.ghostFormActions}>
                <TouchableOpacity
                  style={styles.ghostCancelButton}
                  onPress={() => {
                    setShowGhostForm(false);
                    setGhostName("");
                    setGhostEmail("");
                  }}
                >
                  <Text style={styles.ghostCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.ghostAddButton,
                    !ghostName.trim() && styles.ghostAddDisabled,
                  ]}
                  onPress={addGhostPlayer}
                  disabled={!ghostName.trim()}
                >
                  <Ionicons name="person-add" size={16} color="#FFF" />
                  <Text style={styles.ghostAddText}>Add Ghost Player</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addGhostButton}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowGhostForm(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add-outline" size={18} color="#B8860B" />
              <Text style={styles.addGhostText}>Add a Player Manually</Text>
            </TouchableOpacity>
          )}
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
  countText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  countHint: {
    fontSize: 12,
    color: "#888",
  },

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
  selectedInfo: { flex: 1, gap: 1 },
  selectedName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  ghostLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#B8860B",
  },
  ghostMeta: {
    fontSize: 11,
    color: "#999",
  },
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
  avatarGhost: {
    backgroundColor: "#B8860B",
  },

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
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#333",
  },
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
  partnerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  partnerHandicap: {
    fontSize: 12,
    color: "#888",
  },

  // Ghost player section
  ghostSection: {},
  addGhostButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(184, 134, 11, 0.3)",
    borderStyle: "dashed",
  },
  addGhostText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#B8860B",
  },
  ghostForm: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  ghostInput: {
    backgroundColor: "#F8F8F8",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#333",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  ghostFormActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  ghostCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  ghostCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#999",
  },
  ghostAddButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#B8860B",
    borderRadius: 10,
    paddingVertical: 10,
  },
  ghostAddDisabled: {
    opacity: 0.4,
  },
  ghostAddText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },

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
  backButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0D5C3A",
  },
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
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
});