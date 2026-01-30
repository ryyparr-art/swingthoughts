/**
 * Members Tab Component
 * 
 * Displays pending join requests and current members.
 * Commissioners can approve/reject requests and manage members.
 */

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import { styles } from "./styles";
import {
    JoinRequest,
    League,
    Member,
    Team,
    getRoleBadge,
    getTimeAgo,
} from "./types";

interface MembersTabProps {
  league: League;
  members: Member[];
  teams: Team[];
  pendingRequests: JoinRequest[];
  isCommissioner: boolean;
  refreshing: boolean;
  saving: boolean;
  onRefresh: () => void;
  onApproveRequest: (request: JoinRequest) => Promise<void>;
  onRejectRequest: (request: JoinRequest) => void;
  onRemoveMember: (member: Member) => void;
  onEditHandicap: (member: Member, handicap: number) => Promise<void>;
  onAssignToTeam: (member: Member, teamId: string | null) => Promise<void>;
}

export default function MembersTab({
  league,
  members,
  teams,
  pendingRequests,
  isCommissioner,
  refreshing,
  saving,
  onRefresh,
  onApproveRequest,
  onRejectRequest,
  onRemoveMember,
  onEditHandicap,
  onAssignToTeam,
}: MembersTabProps) {
  const router = useRouter();
  const is2v2 = league.format === "2v2";

  // Local modal state
  const [showMemberActions, setShowMemberActions] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showHandicapEdit, setShowHandicapEdit] = useState(false);
  const [handicapInput, setHandicapInput] = useState("");
  const [showAssignTeam, setShowAssignTeam] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);

  const handleMemberPress = (member: Member) => {
    if (!isCommissioner) return;
    setSelectedMember(member);
    setShowMemberActions(true);
  };

  const handleEditHandicap = () => {
    if (!selectedMember) return;
    setHandicapInput(selectedMember.leagueHandicap?.toString() || "");
    setShowMemberActions(false);
    setShowHandicapEdit(true);
  };

  const handleSaveHandicap = async () => {
    if (!selectedMember) return;

    const newHandicap = parseFloat(handicapInput);
    if (isNaN(newHandicap) || newHandicap < -10 || newHandicap > 54) {
      Alert.alert("Invalid Handicap", "Please enter a handicap between -10 and 54.");
      return;
    }

    try {
      setLocalSaving(true);
      await onEditHandicap(selectedMember, newHandicap);
      setShowHandicapEdit(false);
      setSelectedMember(null);
    } finally {
      setLocalSaving(false);
    }
  };

  const handleAssignToTeam = async (teamId: string | null) => {
    if (!selectedMember) return;

    try {
      setLocalSaving(true);
      await onAssignToTeam(selectedMember, teamId);
      setShowAssignTeam(false);
      setShowMemberActions(false);
      setSelectedMember(null);
    } finally {
      setLocalSaving(false);
    }
  };

  const handleRemoveMember = () => {
    if (!selectedMember) return;

    if (selectedMember.role === "commissioner") {
      Alert.alert("Cannot Remove", "The commissioner cannot be removed from the league.");
      return;
    }

    Alert.alert(
      "Remove Member",
      `Are you sure you want to remove ${selectedMember.displayName} from the league?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            onRemoveMember(selectedMember);
            setShowMemberActions(false);
            setSelectedMember(null);
          },
        },
      ]
    );
  };

  // Member Actions Modal
  const renderMemberActionsModal = () => (
    <Modal
      visible={showMemberActions}
      animationType="slide"
      transparent
      onRequestClose={() => setShowMemberActions(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowMemberActions(false)}
      >
        <View style={styles.actionSheet}>
          {selectedMember && (
            <>
              <View style={styles.actionSheetHeader}>
                {selectedMember.avatar ? (
                  <Image
                    source={{ uri: selectedMember.avatar }}
                    style={styles.actionSheetAvatar}
                  />
                ) : (
                  <View style={[styles.actionSheetAvatar, avatarStyles.placeholder]}>
                    <Text style={avatarStyles.initialLarge}>
                      {selectedMember.displayName?.[0]?.toUpperCase() || "?"}
                    </Text>
                  </View>
                )}
                <Text style={styles.actionSheetName}>{selectedMember.displayName}</Text>
              </View>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => {
                  setShowMemberActions(false);
                  router.push(`/locker/${selectedMember.odcuserId}`);
                }}
              >
                <Ionicons name="person-outline" size={22} color="#0D5C3A" />
                <Text style={styles.actionItemText}>View Profile</Text>
              </TouchableOpacity>

              {league.handicapSystem === "league_managed" && (
                <TouchableOpacity style={styles.actionItem} onPress={handleEditHandicap}>
                  <Ionicons name="golf-outline" size={22} color="#0D5C3A" />
                  <Text style={styles.actionItemText}>Edit Handicap</Text>
                </TouchableOpacity>
              )}

              {is2v2 && (
                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={() => {
                    setShowMemberActions(false);
                    setShowAssignTeam(true);
                  }}
                >
                  <Ionicons name="people-outline" size={22} color="#0D5C3A" />
                  <Text style={styles.actionItemText}>
                    {selectedMember.teamId ? "Change Team" : "Assign to Team"}
                  </Text>
                </TouchableOpacity>
              )}

              {selectedMember.role === "member" && (
                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={() => {
                    Alert.alert("Coming Soon", "Manager promotion will be available in Phase 3.");
                  }}
                >
                  <Ionicons name="shield-outline" size={22} color="#0D5C3A" />
                  <Text style={styles.actionItemText}>Promote to Manager</Text>
                </TouchableOpacity>
              )}

              {selectedMember.role !== "commissioner" && (
                <TouchableOpacity
                  style={[styles.actionItem, styles.actionItemDanger]}
                  onPress={handleRemoveMember}
                >
                  <Ionicons name="person-remove-outline" size={22} color="#FF6B6B" />
                  <Text style={[styles.actionItemText, styles.actionItemTextDanger]}>
                    Remove from League
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.actionCancelButton}
                onPress={() => setShowMemberActions(false)}
              >
                <Text style={styles.actionCancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // Assign to Team Modal
  const renderAssignTeamModal = () => (
    <Modal
      visible={showAssignTeam}
      animationType="slide"
      transparent
      onRequestClose={() => setShowAssignTeam(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowAssignTeam(false)}
      >
        <View style={styles.actionSheet}>
          <View style={styles.actionSheetHeader}>
            <Text style={styles.actionSheetTitle}>Assign to Team</Text>
          </View>

          {selectedMember?.teamId && (
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => handleAssignToTeam(null)}
            >
              <Ionicons name="close-circle-outline" size={22} color="#FF6B6B" />
              <Text style={[styles.actionItemText, { color: "#FF6B6B" }]}>Remove from Team</Text>
            </TouchableOpacity>
          )}

          {teams.map((team) => {
            const isCurrentTeam = selectedMember?.teamId === team.id;
            return (
              <TouchableOpacity
                key={team.id}
                style={[styles.actionItem, isCurrentTeam && styles.actionItemSelected]}
                onPress={() => handleAssignToTeam(team.id)}
                disabled={isCurrentTeam}
              >
                {team.avatar ? (
                  <Image
                    source={{ uri: team.avatar }}
                    style={styles.actionItemAvatar}
                  />
                ) : (
                  <View style={[styles.actionItemAvatar, avatarStyles.placeholder]}>
                    <Text style={avatarStyles.initial}>
                      {team.name?.[0]?.toUpperCase() || "?"}
                    </Text>
                  </View>
                )}
                <Text style={styles.actionItemText}>{team.name}</Text>
                {isCurrentTeam && (
                  <Ionicons name="checkmark-circle" size={22} color="#0D5C3A" />
                )}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={styles.actionCancelButton}
            onPress={() => setShowAssignTeam(false)}
          >
            <Text style={styles.actionCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // Handicap Edit Modal
  const renderHandicapEditModal = () => (
    <Modal
      visible={showHandicapEdit}
      animationType="slide"
      transparent
      onRequestClose={() => setShowHandicapEdit(false)}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Edit Handicap</Text>
          <Text style={styles.modalSubtitle}>{selectedMember?.displayName}</Text>

          <TextInput
            style={styles.handicapInput}
            value={handicapInput}
            onChangeText={setHandicapInput}
            keyboardType="decimal-pad"
            placeholder="Enter handicap"
            placeholderTextColor="#999"
            autoFocus
          />

          <View style={styles.modalButtonRow}>
            <TouchableOpacity
              style={styles.modalCancelButtonSmall}
              onPress={() => {
                setShowHandicapEdit(false);
                setSelectedMember(null);
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={handleSaveHandicap}
              disabled={localSaving}
            >
              {localSaving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Pending Requests</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{pendingRequests.length}</Text>
              </View>
            </View>

            {pendingRequests.map((request) => (
              <View key={request.id} style={styles.requestCard}>
                {request.avatar ? (
                  <Image
                    source={{ uri: request.avatar }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={[styles.avatar, avatarStyles.placeholder]}>
                    <Text style={avatarStyles.initial}>
                      {request.displayName?.[0]?.toUpperCase() || "?"}
                    </Text>
                  </View>
                )}
                <View style={styles.requestInfo}>
                  <Text style={styles.requestName}>{request.displayName}</Text>
                  <Text style={styles.requestMeta}>
                    {request.handicap !== undefined && `${request.handicap} HCP • `}
                    Applied {getTimeAgo(request.createdAt)}
                  </Text>
                </View>
                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={styles.approveButton}
                    onPress={() => onApproveRequest(request)}
                  >
                    <Ionicons name="checkmark" size={20} color="#FFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() => onRejectRequest(request)}
                  >
                    <Ionicons name="close" size={20} color="#FFF" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Current Members */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Members</Text>

          {members.map((member) => {
            const badge = getRoleBadge(member.role);
            const handicap =
              league.handicapSystem === "league_managed"
                ? member.leagueHandicap
                : member.swingThoughtsHandicap;
            const memberTeam = member.teamId ? teams.find((t) => t.id === member.teamId) : null;

            return (
              <TouchableOpacity
                key={member.id}
                style={styles.memberCard}
                onPress={() => handleMemberPress(member)}
                disabled={!isCommissioner}
                activeOpacity={isCommissioner ? 0.7 : 1}
              >
                {member.avatar ? (
                  <Image
                    source={{ uri: member.avatar }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={[styles.avatar, avatarStyles.placeholder]}>
                    <Text style={avatarStyles.initial}>
                      {member.displayName?.[0]?.toUpperCase() || "?"}
                    </Text>
                  </View>
                )}
                <View style={styles.memberInfo}>
                  <View style={styles.memberNameRow}>
                    <Text style={styles.memberName}>{member.displayName}</Text>
                    {badge && (
                      <View style={[styles.roleBadge, { backgroundColor: badge.color }]}>
                        <Text style={styles.roleBadgeText}>{badge.label}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.memberMeta}>
                    {handicap !== undefined && handicap !== null ? `${handicap} HCP` : "No HCP"}
                    {is2v2 && memberTeam && ` • ${memberTeam.name}`}
                    {member.roundsPlayed > 0 && ` • ${member.roundsPlayed} rounds`}
                  </Text>
                </View>
                {isCommissioner && member.role !== "commissioner" && (
                  <Ionicons name="chevron-forward" size={20} color="#CCC" />
                )}
              </TouchableOpacity>
            );
          })}

          {members.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="#CCC" />
              <Text style={styles.emptyText}>No members yet</Text>
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {renderMemberActionsModal()}
      {renderAssignTeamModal()}
      {renderHandicapEditModal()}
    </>
  );
}

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
  initialLarge: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFF",
  },
});