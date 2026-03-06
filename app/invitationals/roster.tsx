/**
 * Invitational Hub - Roster Tab
 *
 * Shows:
 * - Full roster with status badges (accepted, invited, ghost, declined)
 * - Host actions: add partners, invite via text (ghost + invite code), remove players
 * - Handicap display (manual or ST)
 * - Player count vs max
 *
 * Route: /invitationals/roster?id=xxx
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import * as Haptics from "expo-haptics";
import * as SMS from "expo-sms";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
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
  maxPlayers: number;
  handicapMethod: string;
  roster: RosterEntry[];
  playerCount: number;
}

interface RosterEntry {
  userId: string | null;
  displayName: string;
  avatar?: string | null;
  handicap?: number | null;
  invitationalHandicap: number | null;
  status: string;
  isGhost: boolean;
  ghostName?: string;
  ghostPhone?: string;
  inviteCode?: string;
}

interface PartnerOption {
  userId: string;
  displayName: string;
  avatar?: string;
  handicap?: number;
}

/* ================================================================ */
/* HELPERS                                                          */
/* ================================================================ */

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getPhoneNumber(contact: Contacts.Contact): string | null {
  if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) return null;
  const mobile = contact.phoneNumbers.find(
    (p) =>
      p.label?.toLowerCase().includes("mobile") ||
      p.label?.toLowerCase().includes("cell")
  );
  return (mobile || contact.phoneNumbers[0])?.number || null;
}

function getContactName(contact: Contacts.Contact): string {
  if (contact.name) return contact.name;
  const parts = [contact.firstName, contact.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Unknown";
}

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function InvitationalRoster() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const invitationalId = Array.isArray(id) ? id[0] : id;
  const currentUserId = auth.currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invitational, setInvitational] = useState<Invitational | null>(null);
  const [isHost, setIsHost] = useState(false);

  // Add player modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [searchText, setSearchText] = useState("");

  // Handicap edit modal
  const [editHandicapPlayer, setEditHandicapPlayer] = useState<RosterEntry | null>(null);
  const [handicapValue, setHandicapValue] = useState("");

  // Add ghost modal
  const [showGhostModal, setShowGhostModal] = useState(false);
  const [ghostName, setGhostName] = useState("");

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

  const loadPartners = async () => {
    if (!currentUserId) return;
    setLoadingPartners(true);

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

      // Filter out players already on the roster
      const existingUserIds = new Set(
        invitational?.roster?.map((r) => r.userId).filter(Boolean) || []
      );

      const partnerList: PartnerOption[] = [];
      for (const uid of partnerIds) {
        if (existingUserIds.has(uid)) continue;
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

  const onRefresh = async () => {
    setRefreshing(true);
    // Firestore listener handles data refresh, just wait a beat
    setTimeout(() => setRefreshing(false), 500);
  };

  /* ================================================================ */
  /* HANDLERS                                                        */
  /* ================================================================ */

  const handleAddPartner = async (partner: PartnerOption) => {
    if (!invitational || !invitationalId) return;

    if (invitational.roster.length >= invitational.maxPlayers) {
      Alert.alert("Max Players", `This invitational is limited to ${invitational.maxPlayers} players.`);
      return;
    }

    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const newEntry: RosterEntry = {
        userId: partner.userId,
        displayName: partner.displayName,
        avatar: partner.avatar || null,
        handicap: partner.handicap || null,
        invitationalHandicap: null,
        status: "invited",
        isGhost: false,
      };

      const updatedRoster = [...invitational.roster, newEntry];

      await updateDoc(doc(db, "invitationals", invitationalId), {
        roster: updatedRoster,
        playerCount: updatedRoster.filter(
          (r) => r.status === "accepted" || r.status === "ghost"
        ).length,
        updatedAt: serverTimestamp(),
      });

      // Remove from partners list
      setPartners((prev) => prev.filter((p) => p.userId !== partner.userId));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error adding player:", error);
      Alert.alert("Error", "Failed to add player.");
    }
  };

  const handleInviteViaText = async () => {
    if (!invitational || !invitationalId) return;

    if (invitational.roster.length >= invitational.maxPlayers) {
      Alert.alert("Max Players", `This invitational is limited to ${invitational.maxPlayers} players.`);
      return;
    }

    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Contacts Access Needed",
        "SwingThoughts needs access to your contacts to invite players. You can enable this in Settings.",
        [{ text: "OK" }]
      );
      return;
    }

    const contact = await Contacts.presentContactPickerAsync();
    if (!contact) return;

    const name = getContactName(contact);
    const phone = getPhoneNumber(contact);

    if (!phone) {
      Alert.alert(
        "No Phone Number",
        `${name} doesn't have a phone number in your contacts. Please add one and try again.`
      );
      return;
    }

    const inviteCode = generateInviteCode();

    try {
      const ghostEntry: RosterEntry = {
        userId: null,
        displayName: name,
        avatar: null,
        handicap: null,
        invitationalHandicap: null,
        status: "ghost",
        isGhost: true,
        ghostName: name,
        ghostPhone: phone,
        inviteCode,
      };

      const updatedRoster = [...invitational.roster, ghostEntry];

      await updateDoc(doc(db, "invitationals", invitationalId), {
        roster: updatedRoster,
        playerCount: updatedRoster.filter(
          (r) => r.status === "accepted" || r.status === "ghost"
        ).length,
        updatedAt: serverTimestamp(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Send SMS
      const smsAvailable = await SMS.isAvailableAsync();
      if (smsAvailable) {
        const message =
          `You're invited to "${invitational.name}" on Swing Thoughts! 🏌️\n\n` +
          `Your invite code: ${inviteCode}\n\n` +
          `Download the app and enter your code to join:\n` +
          `https://apps.apple.com/app/swing-thoughts/id6739196498`;

        await SMS.sendSMSAsync([phone], message);
      } else {
        Alert.alert(
          "Player Added",
          `${name} was added to the roster. Share their invite code (${inviteCode}) manually.`
        );
      }
    } catch (error) {
      console.error("Error adding ghost player:", error);
      Alert.alert("Error", "Failed to add player.");
    }
  };

  const handleResendInvite = async (entry: RosterEntry) => {
    if (!entry.ghostPhone || !entry.inviteCode || !invitational) return;

    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const smsAvailable = await SMS.isAvailableAsync();
    if (!smsAvailable) {
      Alert.alert("SMS Not Available", `Invite code: ${entry.inviteCode}`);
      return;
    }

    const message =
      `Reminder: You're invited to "${invitational.name}" on Swing Thoughts! 🏌️\n\n` +
      `Your invite code: ${entry.inviteCode}\n\n` +
      `Download the app and enter your code to join:\n` +
      `https://apps.apple.com/app/swing-thoughts/id6739196498`;

    await SMS.sendSMSAsync([entry.ghostPhone], message);
  };

  const handleRemovePlayer = (entry: RosterEntry) => {
    if (!invitational || !invitationalId) return;

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
                ? r.ghostName !== entry.ghostName || r.inviteCode !== entry.inviteCode
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
          (editHandicapPlayer.isGhost && r.ghostName === editHandicapPlayer.ghostName && r.inviteCode === editHandicapPlayer.inviteCode) ||
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

  const handleAddGhost = async () => {
    if (!ghostName.trim() || !invitational || !invitationalId) return;

    if (invitational.roster.length >= invitational.maxPlayers) {
      Alert.alert("Max Players", `This invitational is limited to ${invitational.maxPlayers} players.`);
      return;
    }

    try {
      const ghostEntry: RosterEntry = {
        userId: null,
        displayName: ghostName.trim(),
        avatar: null,
        handicap: null,
        invitationalHandicap: null,
        status: "ghost",
        isGhost: true,
        ghostName: ghostName.trim(),
      };

      const updatedRoster = [...invitational.roster, ghostEntry];

      await updateDoc(doc(db, "invitationals", invitationalId), {
        roster: updatedRoster,
        playerCount: updatedRoster.filter(
          (r) => r.status === "accepted" || r.status === "ghost"
        ).length,
        updatedAt: serverTimestamp(),
      });

      soundPlayer.play("postThought");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setGhostName("");
      setShowGhostModal(false);
    } catch (error) {
      console.error("Error adding ghost player:", error);
      Alert.alert("Error", "Failed to add player.");
    }
  };

  /* ================================================================ */
  /* HELPERS                                                         */
  /* ================================================================ */

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "accepted":
        return { label: "Accepted", bg: "rgba(13, 92, 58, 0.1)", color: "#0D5C3A" };
      case "invited":
        return { label: "Invited", bg: "#FFF8E1", color: "#F59E0B" };
      case "ghost":
        return { label: "Ghost", bg: "rgba(184, 134, 11, 0.12)", color: "#B8860B" };
      case "declined":
        return { label: "Declined", bg: "rgba(0,0,0,0.05)", color: "#999" };
      default:
        return { label: status, bg: "rgba(0,0,0,0.05)", color: "#666" };
    }
  };

  const getHandicapDisplay = (entry: RosterEntry) => {
    if (invitational?.handicapMethod === "manual") {
      return entry.invitationalHandicap != null
        ? entry.invitationalHandicap.toString()
        : "—";
    }
    return entry.handicap != null ? entry.handicap.toFixed(1) : "—";
  };

  const acceptedCount = invitational?.roster?.filter(
    (r) => r.status === "accepted" || r.status === "ghost"
  ).length || 0;

  const sortedRoster = [...(invitational?.roster || [])].sort((a, b) => {
    // Host first
    if (a.userId === invitational?.hostUserId) return -1;
    if (b.userId === invitational?.hostUserId) return 1;
    // Accepted, then ghost, then invited, then declined
    const order: Record<string, number> = { accepted: 0, ghost: 1, invited: 2, declined: 3 };
    return (order[a.status] ?? 4) - (order[b.status] ?? 4);
  });

  /* ================================================================ */
  /* RENDER                                                          */
  /* ================================================================ */

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => {
          soundPlayer.play("click");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}
      >
        <Image
          source={require("@/assets/icons/Back.png")}
          style={styles.backIcon}
        />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Invitational</Text>
      <View style={styles.headerButton} />
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabBar}>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => {
          soundPlayer.play("click");
          router.replace(`/invitationals/home` as any);
        }}
      >
        <Text style={styles.tabText}>Home</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => {
          soundPlayer.play("click");
          router.replace(`/invitationals/standings?id=${invitationalId}` as any);
        }}
      >
        <Text style={styles.tabText}>Standings</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => {
          soundPlayer.play("click");
          router.replace(`/invitationals/schedule?id=${invitationalId}` as any);
        }}
      >
        <Text style={styles.tabText}>Schedule</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, styles.tabActive]}>
        <Text style={[styles.tabText, styles.tabTextActive]}>Roster</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#B8860B" />
      </View>
    );
  }

  if (!invitational) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <Text style={{ color: "#999" }}>Invitational not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderHeader()}
      {renderTabs()}

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#B8860B"
          />
        }
      >
        {/* Player count */}
        <View style={styles.countBar}>
          <Ionicons name="people" size={18} color="#0D5C3A" />
          <Text style={styles.countText}>
            {acceptedCount} of {invitational.maxPlayers} players
          </Text>
          <Text style={styles.countHint}>
            ({invitational.roster.length} total on roster)
          </Text>
        </View>

        {/* Host actions */}
        {isHost && (
          <View style={styles.hostActions}>
            <View style={styles.hostActionsRow}>
              <TouchableOpacity
                style={styles.addPartnerButton}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  loadPartners();
                  setShowAddModal(true);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="person-add" size={16} color="#0D5C3A" />
                <Text style={styles.addPartnerText}>Add Partner</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.smsButton}
                onPress={handleInviteViaText}
                activeOpacity={0.7}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color="#B8860B" />
                <Text style={styles.smsButtonText}>Invite via Text</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.addGhostButton}
              onPress={() => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowGhostModal(true);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={16} color="#666" />
              <Text style={styles.addGhostText}>Add Player Manually</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Roster list */}
        <View style={styles.rosterSection}>
          {sortedRoster.map((entry, index) => {
            const badge = getStatusBadge(entry.status);
            const isHostEntry = entry.userId === invitational.hostUserId;

            return (
              <View key={`${entry.userId || entry.ghostName}-${index}`} style={styles.playerCard}>
                <View style={styles.playerLeft}>
                  {/* Avatar */}
                  {entry.avatar ? (
                    <Image source={{ uri: entry.avatar }} style={styles.avatar} />
                  ) : (
                    <View
                      style={[
                        styles.avatarPlaceholder,
                        entry.isGhost && styles.avatarGhost,
                      ]}
                    >
                      <Ionicons
                        name={entry.isGhost ? "person-outline" : "person"}
                        size={16}
                        color="#FFF"
                      />
                    </View>
                  )}

                  {/* Info */}
                  <View style={styles.playerInfo}>
                    <View style={styles.playerNameRow}>
                      <Text style={styles.playerName}>
                        {entry.displayName || entry.ghostName}
                      </Text>
                      {isHostEntry && (
                        <View style={styles.hostBadge}>
                          <Text style={styles.hostBadgeText}>Host</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.playerMetaRow}>
                      <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: badge.color }]}>
                          {badge.label}
                        </Text>
                      </View>

                      {entry.isGhost && entry.inviteCode && (
                        <View style={styles.codeBadge}>
                          <Text style={styles.codeBadgeText}>{entry.inviteCode}</Text>
                        </View>
                      )}

                      <Text style={styles.handicapText}>
                        HCP: {getHandicapDisplay(entry)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Actions (host only, not self) */}
                {isHost && !isHostEntry && (
                  <View style={styles.playerActions}>
                    {invitational.handicapMethod === "manual" && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => {
                          soundPlayer.play("click");
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setEditHandicapPlayer(entry);
                          setHandicapValue(
                            entry.invitationalHandicap != null
                              ? entry.invitationalHandicap.toString()
                              : ""
                          );
                        }}
                      >
                        <Ionicons name="create-outline" size={18} color="#B8860B" />
                      </TouchableOpacity>
                    )}

                    {entry.isGhost && entry.ghostPhone && (
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleResendInvite(entry)}
                      >
                        <Ionicons name="send-outline" size={16} color="#0D5C3A" />
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleRemovePlayer(entry)}
                    >
                      <Ionicons name="close-circle-outline" size={18} color="#CC3333" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ════════════════════════════════════════════════════════ */}
      {/* ADD PARTNER MODAL                                       */}
      {/* ════════════════════════════════════════════════════════ */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardAvoidingView}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowAddModal(false)}
          >
            <Pressable
              style={styles.addModalContent}
              onPress={(e) => e.stopPropagation()}
            >
            <View style={styles.addModalHeader}>
              <Text style={styles.addModalTitle}>Add Partner</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color="#999" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search partners..."
                placeholderTextColor="#999"
                value={searchText}
                onChangeText={setSearchText}
                autoCorrect={false}
              />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={() => setSearchText("")}>
                  <Ionicons name="close-circle" size={18} color="#CCC" />
                </TouchableOpacity>
              )}
            </View>

            {/* Partners list */}
            <ScrollView
              style={styles.partnersList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {loadingPartners ? (
                <ActivityIndicator
                  size="small"
                  color="#0D5C3A"
                  style={{ paddingVertical: 24 }}
                />
              ) : partners.filter((p) =>
                  p.displayName.toLowerCase().includes(searchText.toLowerCase())
                ).length === 0 ? (
                <Text style={styles.emptyText}>
                  {searchText
                    ? "No partners match your search"
                    : "No available partners to add"}
                </Text>
              ) : (
                partners
                  .filter((p) =>
                    p.displayName.toLowerCase().includes(searchText.toLowerCase())
                  )
                  .map((partner) => (
                    <TouchableOpacity
                      key={partner.userId}
                      style={styles.partnerRow}
                      onPress={() => handleAddPartner(partner)}
                      activeOpacity={0.7}
                    >
                      {partner.avatar ? (
                        <Image
                          source={{ uri: partner.avatar }}
                          style={styles.partnerAvatar}
                        />
                      ) : (
                        <View style={styles.partnerAvatarPlaceholder}>
                          <Ionicons name="person" size={16} color="#FFF" />
                        </View>
                      )}
                      <View style={styles.partnerInfo}>
                        <Text style={styles.partnerName}>{partner.displayName}</Text>
                        {partner.handicap != null && (
                          <Text style={styles.partnerHandicap}>
                            HCP: {partner.handicap.toFixed(1)}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="add-circle" size={22} color="#0D5C3A" />
                    </TouchableOpacity>
                  ))
              )}
            </ScrollView>

            {/* Invite via text from modal */}
            <TouchableOpacity
              style={styles.modalSmsButton}
              onPress={() => {
                setShowAddModal(false);
                setTimeout(() => handleInviteViaText(), 300);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color="#B8860B" />
              <Text style={styles.modalSmsText}>Invite via Text Instead</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════════════════════════════════════════ */}
      {/* HANDICAP EDIT MODAL                                     */}
      {/* ════════════════════════════════════════════════════════ */}
      <Modal
        visible={!!editHandicapPlayer}
        transparent
        animationType="fade"
        onRequestClose={() => setEditHandicapPlayer(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardAvoidingView}
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
                placeholder="e.g. 12.5"
                placeholderTextColor="#999"
                keyboardType="decimal-pad"
                value={handicapValue}
                onChangeText={setHandicapValue}
                autoFocus
              />
              <View style={styles.handicapModalActions}>
                <TouchableOpacity
                  style={styles.handicapCancelButton}
                  onPress={() => {
                    setEditHandicapPlayer(null);
                    setHandicapValue("");
                  }}
                >
                  <Text style={styles.handicapCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.handicapSaveButton}
                  onPress={handleSaveHandicap}
                >
                  <Text style={styles.handicapSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ════════════════════════════════════════════════════════ */}
      {/* ADD PLAYER MANUALLY MODAL                               */}
      {/* ════════════════════════════════════════════════════════ */}
      <Modal
        visible={showGhostModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGhostModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardAvoidingView}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowGhostModal(false)}
          >
            <Pressable
              style={styles.ghostModalContent}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.ghostModalTitle}>Add Player</Text>
              <Text style={styles.ghostModalSubtitle}>
                Add someone who won't be using the app. Their scores can still be entered by the group marker.
              </Text>
              <TextInput
                style={styles.ghostNameInput}
                placeholder="Player name"
                placeholderTextColor="#999"
                value={ghostName}
                onChangeText={setGhostName}
                autoFocus
                autoCapitalize="words"
                maxLength={40}
              />
              <View style={styles.ghostModalActions}>
                <TouchableOpacity
                  style={styles.ghostCancelButton}
                  onPress={() => {
                    setShowGhostModal(false);
                    setGhostName("");
                  }}
                >
                  <Text style={styles.ghostCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.ghostAddButton,
                    !ghostName.trim() && { opacity: 0.4 },
                  ]}
                  onPress={handleAddGhost}
                  disabled={!ghostName.trim()}
                >
                  <Ionicons name="person-add" size={16} color="#FFF" />
                  <Text style={styles.ghostAddText}>Add to Roster</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
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
    flex: 1,
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
  headerButton: {
    padding: 8,
    width: 40,
  },
  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#F4EED8",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F4EED8",
  },

  // Tabs
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: "#B8860B",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  tabTextActive: {
    color: "#FFF",
    fontWeight: "700",
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
  },

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

  // Host actions
  hostActions: {
    gap: 8,
  },
  hostActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  addPartnerButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: "#0D5C3A",
  },
  addPartnerText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  smsButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: "rgba(184, 134, 11, 0.4)",
  },
  smsButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#B8860B",
  },
  addGhostButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderStyle: "dashed",
  },
  addGhostText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },

  // Roster section
  rosterSection: {
    gap: 8,
  },

  // Player card
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
  },
  playerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarGhost: {
    backgroundColor: "#B8860B",
  },
  playerInfo: {
    flex: 1,
    gap: 4,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  playerName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
  },
  hostBadge: {
    backgroundColor: "rgba(184, 134, 11, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#B8860B",
  },
  playerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
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
  handicapText: {
    fontSize: 11,
    color: "#888",
  },

  // Player actions
  playerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionButton: {
    padding: 6,
  },

  // Modal shared
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  keyboardAvoidingView: {
    flex: 1,
  },

  // Add partner modal
  addModalContent: {
    backgroundColor: "#F4EED8",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: "70%",
  },
  addModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
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
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#333",
  },
  partnersList: {
    maxHeight: 300,
  },
  emptyText: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
    paddingVertical: 24,
  },
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 10,
    gap: 10,
    marginBottom: 6,
  },
  partnerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  partnerAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  partnerInfo: {
    flex: 1,
    gap: 1,
  },
  partnerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  partnerHandicap: {
    fontSize: 12,
    color: "#888",
  },
  modalSmsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(184, 134, 11, 0.3)",
    borderStyle: "dashed",
  },
  modalSmsText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#B8860B",
  },

  // Handicap modal
  handicapModalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 16,
  },
  handicapModalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
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
    gap: 10,
  },
  handicapCancelButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
  },
  handicapCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#999",
  },
  handicapSaveButton: {
    flex: 2,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#B8860B",
  },
  handicapSaveText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
  },

  // Ghost modal
  ghostModalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 14,
  },
  ghostModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  ghostModalSubtitle: {
    fontSize: 13,
    color: "#888",
    lineHeight: 18,
  },
  ghostNameInput: {
    backgroundColor: "#F8F8F8",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#333",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  ghostModalActions: {
    flexDirection: "row",
    gap: 10,
  },
  ghostCancelButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
  },
  ghostCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#999",
  },
  ghostAddButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#0D5C3A",
  },
  ghostAddText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
  },
});