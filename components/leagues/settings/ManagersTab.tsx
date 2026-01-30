/**
 * Managers Tab Component
 * 
 * Manage league managers (co-commissioners).
 * Only the host commissioner can invite/remove managers.
 * Managers have same permissions as commissioner except inviting other managers.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    RefreshControl,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { styles } from "./styles";
import { League, ManagerInvite, Member, getTimeAgo } from "./types";

interface ManagersTabProps {
  league: League;
  leagueId: string;
  members: Member[];
  managerInvites: ManagerInvite[];
  isHost: boolean;
  currentUserId: string | undefined;
  refreshing: boolean;
  onRefresh: () => void;
  onInviteManager: (member: Member) => Promise<void>;
  onCancelInvite: (invite: ManagerInvite) => Promise<void>;
  onAcceptInvite: (invite: ManagerInvite) => Promise<void>;
  onDeclineInvite: (invite: ManagerInvite) => Promise<void>;
  onRemoveManager: (member: Member) => Promise<void>;
}

export default function ManagersTab({
  league,
  leagueId,
  members,
  managerInvites,
  isHost,
  currentUserId,
  refreshing,
  onRefresh,
  onInviteManager,
  onCancelInvite,
  onAcceptInvite,
  onDeclineInvite,
  onRemoveManager,
}: ManagersTabProps) {
  // Local state
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Get managers (commissioner + managers)
  const managers = members.filter(
    (m) => m.role === "commissioner" || m.role === "manager"
  );

  // Get invitable members (regular members not already invited)
  const pendingInviteUserIds = managerInvites
    .filter((i) => i.status === "pending")
    .map((i) => i.userId);
  
  const invitableMembers = members.filter(
    (m) => m.role === "member" && !pendingInviteUserIds.includes(m.id)
  );

  // Get pending invites for current user
  const myPendingInvite = managerInvites.find(
    (i) => i.userId === currentUserId && i.status === "pending"
  );

  // Get all pending invites (for host view)
  const pendingInvites = managerInvites.filter((i) => i.status === "pending");

  const handleInvite = async (member: Member) => {
    try {
      setSaving(true);
      await onInviteManager(member);
      setShowInvitePicker(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelInvite = (invite: ManagerInvite) => {
    Alert.alert(
      "Cancel Invite",
      `Cancel the manager invite for ${invite.displayName}?`,
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              setSaving(true);
              await onCancelInvite(invite);
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleAcceptInvite = async () => {
    if (!myPendingInvite) return;
    try {
      setSaving(true);
      await onAcceptInvite(myPendingInvite);
    } finally {
      setSaving(false);
    }
  };

  const handleDeclineInvite = () => {
    if (!myPendingInvite) return;
    Alert.alert(
      "Decline Invite",
      "Are you sure you want to decline the manager invitation?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Decline",
          style: "destructive",
          onPress: async () => {
            try {
              setSaving(true);
              await onDeclineInvite(myPendingInvite);
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleRemoveManager = (member: Member) => {
    Alert.alert(
      "Remove Manager",
      `Remove ${member.displayName} as a manager? They will remain a league member.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              setSaving(true);
              await onRemoveManager(member);
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  // Invite Picker Modal
  const renderInvitePickerModal = () => (
    <Modal
      visible={showInvitePicker}
      animationType="slide"
      transparent
      onRequestClose={() => setShowInvitePicker(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowInvitePicker(false)}
      >
        <View style={styles.actionSheet}>
          <View style={styles.actionSheetHeader}>
            <Text style={styles.actionSheetTitle}>Invite Manager</Text>
            <Text style={styles.actionSheetSubtitle}>
              Select a member to invite
            </Text>
          </View>

          {invitableMembers.length === 0 ? (
            <View style={styles.emptyActionSheet}>
              <Ionicons name="people-outline" size={40} color="#CCC" />
              <Text style={styles.emptyActionText}>
                No members available to invite
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 300 }}>
              {invitableMembers.map((member) => (
                <TouchableOpacity
                  key={member.id}
                  style={styles.actionItem}
                  onPress={() => handleInvite(member)}
                  disabled={saving}
                >
                  {member.avatar ? (
                    <Image
                      source={{ uri: member.avatar }}
                      style={styles.actionItemAvatar}
                    />
                  ) : (
                    <View style={[styles.actionItemAvatar, avatarStyles.placeholder]}>
                      <Text style={avatarStyles.initial}>
                        {member.displayName?.[0]?.toUpperCase() || "?"}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.actionItemText}>{member.displayName}</Text>
                  {saving ? (
                    <ActivityIndicator size="small" color="#0D5C3A" />
                  ) : (
                    <Ionicons name="add-circle-outline" size={22} color="#0D5C3A" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity
            style={styles.actionCancelButton}
            onPress={() => setShowInvitePicker(false)}
          >
            <Text style={styles.actionCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <>
      <ScrollView
        style={styles.tabContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0D5C3A" />
        }
      >
        {/* Pending Invite for Current User */}
        {myPendingInvite && !isHost && (
          <View style={styles.section}>
            <View style={inviteCardStyles.inviteCard}>
              <View style={inviteCardStyles.inviteIcon}>
                <Ionicons name="shield" size={28} color="#0D5C3A" />
              </View>
              <Text style={inviteCardStyles.inviteTitle}>
                You've Been Invited!
              </Text>
              <Text style={inviteCardStyles.inviteText}>
                The commissioner has invited you to become a manager of this league.
              </Text>
              <Text style={inviteCardStyles.invitePerks}>
                As a manager, you can approve members, manage teams, and edit league settings.
              </Text>
              <View style={inviteCardStyles.inviteButtons}>
                <TouchableOpacity
                  style={inviteCardStyles.declineButton}
                  onPress={handleDeclineInvite}
                  disabled={saving}
                >
                  <Text style={inviteCardStyles.declineButtonText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={inviteCardStyles.acceptButton}
                  onPress={handleAcceptInvite}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={inviteCardStyles.acceptButtonText}>Accept</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Pending Invites (Host View) */}
        {isHost && pendingInvites.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Pending Invites</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{pendingInvites.length}</Text>
              </View>
            </View>

            {pendingInvites.map((invite) => (
              <View key={invite.id} style={styles.requestCard}>
                {invite.avatar ? (
                  <Image
                    source={{ uri: invite.avatar }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={[styles.avatar, avatarStyles.placeholder]}>
                    <Text style={avatarStyles.initial}>
                      {invite.displayName?.[0]?.toUpperCase() || "?"}
                    </Text>
                  </View>
                )}
                <View style={styles.requestInfo}>
                  <Text style={styles.requestName}>{invite.displayName}</Text>
                  <Text style={styles.requestMeta}>
                    Invited {getTimeAgo(invite.createdAt)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.rejectButton}
                  onPress={() => handleCancelInvite(invite)}
                  disabled={saving}
                >
                  <Ionicons name="close" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Current Managers */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Managers</Text>
            {isHost && (
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowInvitePicker(true)}
              >
                <Ionicons name="add" size={22} color="#0D5C3A" />
                <Text style={styles.addButtonText}>Invite</Text>
              </TouchableOpacity>
            )}
          </View>

          {managers.map((manager) => {
            const isCommissioner = manager.role === "commissioner";
            const isCurrentUser = manager.id === currentUserId;

            return (
              <View key={manager.id} style={styles.memberCard}>
                {manager.avatar ? (
                  <Image
                    source={{ uri: manager.avatar }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={[styles.avatar, avatarStyles.placeholder]}>
                    <Text style={avatarStyles.initial}>
                      {manager.displayName?.[0]?.toUpperCase() || "?"}
                    </Text>
                  </View>
                )}
                <View style={styles.memberInfo}>
                  <View style={styles.memberNameRow}>
                    <Text style={styles.memberName}>
                      {manager.displayName}
                      {isCurrentUser && " (You)"}
                    </Text>
                    <View
                      style={[
                        styles.roleBadge,
                        {
                          backgroundColor: isCommissioner ? "#FFD700" : "#0D5C3A",
                        },
                      ]}
                    >
                      <Text style={styles.roleBadgeText}>
                        {isCommissioner ? "Commissioner" : "Manager"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.memberMeta}>
                    {isCommissioner ? "League Host" : "Can manage members & settings"}
                  </Text>
                </View>
                {isHost && !isCommissioner && (
                  <TouchableOpacity
                    style={managerActionStyles.removeButton}
                    onPress={() => handleRemoveManager(manager)}
                    disabled={saving}
                  >
                    <Ionicons name="remove-circle-outline" size={22} color="#FF6B6B" />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {managers.length === 1 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No additional managers</Text>
              {isHost && (
                <Text style={managerActionStyles.emptyHint}>
                  Invite members to help manage the league
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Info Section */}
        <View style={styles.section}>
          <View style={infoStyles.infoCard}>
            <Ionicons name="information-circle-outline" size={24} color="#0D5C3A" />
            <View style={infoStyles.infoContent}>
              <Text style={infoStyles.infoTitle}>What can managers do?</Text>
              <Text style={infoStyles.infoText}>
                • Approve/reject join requests{"\n"}
                • Add/remove league members{"\n"}
                • Create and manage teams{"\n"}
                • Edit league settings{"\n"}
                • Post scores for members
              </Text>
              <Text style={infoStyles.infoNote}>
                Only the commissioner can invite or remove managers.
              </Text>
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {renderInvitePickerModal()}
    </>
  );
}

/* ================================================================ */
/* ADDITIONAL STYLES                                                */
/* ================================================================ */

import { StyleSheet } from "react-native";

const inviteCardStyles = StyleSheet.create({
  inviteCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0D5C3A",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inviteIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(13, 92, 58, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  inviteTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0D5C3A",
    marginBottom: 8,
  },
  inviteText: {
    fontSize: 15,
    color: "#333",
    textAlign: "center",
    marginBottom: 12,
  },
  invitePerks: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
    fontStyle: "italic",
  },
  inviteButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  declineButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#666",
  },
  acceptButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
});

const managerActionStyles = StyleSheet.create({
  removeButton: {
    padding: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: "#999",
    marginTop: 4,
  },
});

const infoStyles = StyleSheet.create({
  infoCard: {
    flexDirection: "row",
    backgroundColor: "rgba(13, 92, 58, 0.08)",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: "#333",
    lineHeight: 20,
  },
  infoNote: {
    fontSize: 12,
    color: "#666",
    marginTop: 10,
    fontStyle: "italic",
  },
});

const avatarStyles = StyleSheet.create({
  placeholder: {
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },
  initial: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },
});