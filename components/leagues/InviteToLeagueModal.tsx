/**
 * InviteToLeagueModal Component
 * 
 * Modal for any league member to invite non-members to join.
 * - Search for users by name
 * - Select a user to invite
 * - Creates invite in Firestore
 * - Cloud Function handles notifications:
 *   1. Sends league_invite to invitee
 *   2. Sends league_invite_sent to commissioners/managers
 * 
 * Usage in home.tsx:
 * 1. Import: import InviteToLeagueModal from "@/components/leagues/InviteToLeagueModal";
 * 2. Add state: const [showInviteModal, setShowInviteModal] = useState(false);
 * 3. Render: <InviteToLeagueModal visible={showInviteModal} onClose={() => setShowInviteModal(false)} leagueId={selectedLeagueId} leagueName={selectedLeague?.name || ""} />
 * 
 * Firestore Structure:
 * league_invites/{inviteId}
 *   - leagueId, leagueName
 *   - invitedUserId, invitedUserName, invitedUserAvatar
 *   - invitedByUserId, invitedByUserName, invitedByUserAvatar
 *   - status: "pending" | "accepted" | "declined"
 *   - createdAt, updatedAt
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    query,
    serverTimestamp,
    where,
} from "firebase/firestore";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface User {
  id: string;
  displayName: string;
  avatar?: string;
  handicap?: number;
}

interface InviteToLeagueModalProps {
  visible: boolean;
  onClose: () => void;
  leagueId: string | null;
  leagueName: string;
}

export default function InviteToLeagueModal({
  visible,
  onClose,
  leagueId,
  leagueName,
}: InviteToLeagueModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [sending, setSending] = useState(false);
  const [existingMembers, setExistingMembers] = useState<Set<string>>(new Set());
  const [pendingInvites, setPendingInvites] = useState<Set<string>>(new Set());

  const currentUserId = auth.currentUser?.uid;

  // Load existing members and pending invites when modal opens
  React.useEffect(() => {
    if (visible && leagueId) {
      loadExistingMembersAndInvites();
    }
  }, [visible, leagueId]);

  const loadExistingMembersAndInvites = async () => {
    if (!leagueId) return;

    try {
      // Get existing members
      const membersSnap = await getDocs(
        collection(db, "leagues", leagueId, "members")
      );
      const memberIds = new Set<string>();
      membersSnap.forEach((doc) => {
        memberIds.add(doc.id);
      });
      setExistingMembers(memberIds);

      // Get pending invites
      const invitesSnap = await getDocs(
        query(
          collection(db, "league_invites"),
          where("leagueId", "==", leagueId),
          where("status", "==", "pending")
        )
      );
      const invitedIds = new Set<string>();
      invitesSnap.forEach((doc) => {
        const data = doc.data();
        invitedIds.add(data.invitedUserId);
      });
      setPendingInvites(invitedIds);
    } catch (error) {
      console.error("Error loading members/invites:", error);
    }
  };

  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    setSelectedUser(null);

    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);

      // Search users by displayName (case-insensitive using displayNameLower)
      const searchLower = text.toLowerCase();
      const usersQuery = query(
        collection(db, "users"),
        where("displayNameLower", ">=", searchLower),
        where("displayNameLower", "<=", searchLower + "\uf8ff"),
        limit(20)
      );

      const snapshot = await getDocs(usersQuery);
      const users: User[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        // Exclude current user, existing members, and those with pending invites
        if (
          doc.id !== currentUserId &&
          !existingMembers.has(doc.id) &&
          !pendingInvites.has(doc.id)
        ) {
          users.push({
            id: doc.id,
            displayName: data.displayName || "Unknown",
            avatar: data.avatar,
            handicap: data.handicap,
          });
        }
      });

      setSearchResults(users);
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectUser = (user: User) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedUser(user);
    setSearchResults([]);
    setSearchQuery(user.displayName);
  };

  const handleSendInvite = async () => {
    if (!selectedUser || !leagueId || !currentUserId) {
      Alert.alert("Error", "Please select a user to invite.");
      return;
    }

    try {
      setSending(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Get current user's info
      const currentUserDoc = await getDoc(doc(db, "users", currentUserId));
      const currentUserData = currentUserDoc.data();

      // Create the invite document
      const invitesRef = collection(db, "league_invites");
      await addDoc(invitesRef, {
        leagueId,
        leagueName,
        invitedUserId: selectedUser.id,
        invitedUserName: selectedUser.displayName,
        invitedUserAvatar: selectedUser.avatar || null,
        invitedByUserId: currentUserId,
        invitedByUserName: currentUserData?.displayName || "A member",
        invitedByUserAvatar: currentUserData?.avatar || null,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Cloud Function (onLeagueInviteCreated) handles:
      // 1. Sending league_invite notification to invitee
      // 2. Sending league_invite_sent notification to commissioners/managers

      soundPlayer.play("postThought");
      
      Alert.alert(
        "Invite Sent! 📨",
        `${selectedUser.displayName} has been invited to join ${leagueName}.`
      );

      // Reset and close
      setSelectedUser(null);
      setSearchQuery("");
      setSearchResults([]);
      onClose();
    } catch (error) {
      console.error("Error sending invite:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to send invite. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setSelectedUser(null);
    setSearchQuery("");
    setSearchResults([]);
    onClose();
  };

  const renderUserItem = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => handleSelectUser(item)}
    >
      {item.avatar ? (
        <Image source={{ uri: item.avatar }} style={styles.userAvatar} />
      ) : (
        <View style={styles.userAvatarPlaceholder}>
          <Text style={styles.userAvatarText}>
            {item.displayName?.charAt(0)?.toUpperCase() || "?"}
          </Text>
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.displayName}</Text>
        {item.handicap !== undefined && (
          <Text style={styles.userHandicap}>{item.handicap} HCP</Text>
        )}
      </View>
      <Ionicons name="add-circle-outline" size={24} color="#0D5C3A" />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              disabled={sending}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>

            <Text style={styles.title}>Invite to League</Text>

            <TouchableOpacity
              onPress={handleSendInvite}
              style={[
                styles.sendButton,
                (!selectedUser || sending) && styles.sendButtonDisabled,
              ]}
              disabled={!selectedUser || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.sendButtonText}>Send</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* League Name */}
          <View style={styles.leagueInfo}>
            <Ionicons name="trophy-outline" size={18} color="#0D5C3A" />
            <Text style={styles.leagueNameText}>{leagueName}</Text>
          </View>

          {/* Search Input */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={handleSearch}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!sending}
            />
            {searchQuery.length > 0 && !selectedUser && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                }}
              >
                <Ionicons name="close-circle" size={20} color="#999" />
              </TouchableOpacity>
            )}
          </View>

          {/* Selected User */}
          {selectedUser && (
            <View style={styles.selectedUserContainer}>
              <View style={styles.selectedUser}>
                {selectedUser.avatar ? (
                  <Image
                    source={{ uri: selectedUser.avatar }}
                    style={styles.selectedAvatar}
                  />
                ) : (
                  <View style={styles.selectedAvatarPlaceholder}>
                    <Text style={styles.selectedAvatarText}>
                      {selectedUser.displayName?.charAt(0)?.toUpperCase() || "?"}
                    </Text>
                  </View>
                )}
                <View style={styles.selectedInfo}>
                  <Text style={styles.selectedName}>
                    {selectedUser.displayName}
                  </Text>
                  <Text style={styles.selectedSubtext}>
                    Will receive an invite notification
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setSelectedUser(null);
                    setSearchQuery("");
                  }}
                  style={styles.removeButton}
                >
                  <Ionicons name="close-circle" size={24} color="#FF6B6B" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Search Results */}
          {!selectedUser && (
            <View style={styles.resultsContainer}>
              {searching ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#0D5C3A" />
                  <Text style={styles.loadingText}>Searching...</Text>
                </View>
              ) : searchResults.length > 0 ? (
                <FlatList
                  data={searchResults}
                  renderItem={renderUserItem}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                />
              ) : searchQuery.length >= 2 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="people-outline" size={40} color="#CCC" />
                  <Text style={styles.emptyText}>No users found</Text>
                  <Text style={styles.emptySubtext}>
                    Try a different search term
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="search-outline" size={40} color="#CCC" />
                  <Text style={styles.emptyText}>Search for users</Text>
                  <Text style={styles.emptySubtext}>
                    Type at least 2 characters to search
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Info Footer */}
          <View style={styles.footer}>
            <Ionicons name="information-circle-outline" size={16} color="#999" />
            <Text style={styles.footerText}>
              Invited users can join instantly without approval
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    minHeight: "50%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  sendButton: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 70,
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#CCC",
  },
  sendButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
  leagueInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    backgroundColor: "rgba(13, 92, 58, 0.05)",
  },
  leagueNameText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#333",
  },
  selectedUserContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  selectedUser: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(13, 92, 58, 0.08)",
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },
  selectedAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  selectedAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedAvatarText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },
  selectedInfo: {
    flex: 1,
    marginLeft: 12,
  },
  selectedName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  selectedSubtext: {
    fontSize: 13,
    color: "#0D5C3A",
    marginTop: 2,
  },
  removeButton: {
    padding: 4,
  },
  resultsContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  userHandicap: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: "#666",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: "#BBB",
    marginTop: 4,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    paddingBottom: 34,
  },
  footerText: {
    fontSize: 13,
    color: "#999",
  },
});