/**
 * Teams Tab Component
 * 
 * Team management for 2v2 format leagues.
 * Commissioners can create/edit teams and assign members.
 * Team members can request name/avatar changes.
 */

import { Ionicons } from "@expo/vector-icons";
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
    League,
    Member,
    Team,
    TeamEditRequest
} from "./types";

interface TeamsTabProps {
  league: League;
  leagueId: string;
  members: Member[];
  teams: Team[];
  teamEditRequests: TeamEditRequest[];
  isCommissioner: boolean;
  currentUserId: string | undefined;
  refreshing: boolean;
  onRefresh: () => void;
  onCreateTeam: (name: string) => Promise<void>;
  onEditTeamName: (team: Team, newName: string) => Promise<void>;
  onUploadTeamAvatar: (team: Team) => Promise<void>;
  onDeleteTeam: (team: Team) => Promise<void>;
  onAddMemberToTeam: (team: Team, memberId: string) => Promise<void>;
  onRemoveMemberFromTeam: (team: Team, memberId: string) => Promise<void>;
  onSubmitEditRequest: (team: Team, type: "name" | "avatar", newValue: string) => Promise<void>;
  onApproveEditRequest: (request: TeamEditRequest) => Promise<void>;
  onRejectEditRequest: (request: TeamEditRequest, reason?: string) => Promise<void>;
}

export default function TeamsTab({
  league,
  leagueId,
  members,
  teams,
  teamEditRequests,
  isCommissioner,
  currentUserId,
  refreshing,
  onRefresh,
  onCreateTeam,
  onEditTeamName,
  onUploadTeamAvatar,
  onDeleteTeam,
  onAddMemberToTeam,
  onRemoveMemberFromTeam,
  onSubmitEditRequest,
  onApproveEditRequest,
  onRejectEditRequest,
}: TeamsTabProps) {
  // Local state
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(new Set());
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [showTeamActions, setShowTeamActions] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showEditTeamName, setShowEditTeamName] = useState(false);
  const [teamNameInput, setTeamNameInput] = useState("");
  const [showAddMemberToTeam, setShowAddMemberToTeam] = useState(false);
  const [showTeamEditRequestActions, setShowTeamEditRequestActions] = useState(false);
  const [selectedEditRequest, setSelectedEditRequest] = useState<TeamEditRequest | null>(null);
  const [showRequestTeamEdit, setShowRequestTeamEdit] = useState(false);
  const [requestEditType, setRequestEditType] = useState<"name" | "avatar">("name");
  const [requestNewValue, setRequestNewValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Helpers
  const getUnassignedMembers = (): Member[] => {
    return members.filter((m) => !m.teamId);
  };

  const getTeamMembers = (teamId: string): Member[] => {
    return members.filter((m) => m.teamId === teamId);
  };

  const getCurrentUserTeam = (): Team | null => {
    const currentMember = members.find((m) => m.id === currentUserId);
    if (!currentMember?.teamId) return null;
    return teams.find((t) => t.id === currentMember.teamId) || null;
  };

  const toggleTeamExpand = (teamId: string) => {
    setExpandedTeamIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(teamId)) {
        newSet.delete(teamId);
      } else {
        newSet.add(teamId);
      }
      return newSet;
    });
  };

  const handleTeamPress = (team: Team) => {
    if (isCommissioner) {
      setSelectedTeam(team);
      setShowTeamActions(true);
    } else {
      toggleTeamExpand(team.id);
    }
  };

  // Handlers
  const handleCreateTeam = async () => {
    if (!teamNameInput.trim()) {
      Alert.alert("Error", "Please enter a team name.");
      return;
    }

    const nameLower = teamNameInput.trim().toLowerCase();
    const duplicateName = teams.some((t) => t.nameLower === nameLower);
    if (duplicateName) {
      Alert.alert("Name Taken", "A team with this name already exists.");
      return;
    }

    try {
      setSaving(true);
      await onCreateTeam(teamNameInput.trim());
      setShowCreateTeam(false);
      setTeamNameInput("");
    } finally {
      setSaving(false);
    }
  };

  const handleEditTeamName = () => {
    if (!selectedTeam) return;

    if (selectedTeam.nameChangeUsed) {
      Alert.alert("Name Locked", "This team has already used their one free name change.");
      return;
    }

    setTeamNameInput(selectedTeam.name);
    setShowTeamActions(false);
    setShowEditTeamName(true);
  };

  const handleSaveTeamName = async () => {
    if (!selectedTeam || !teamNameInput.trim()) return;

    const nameLower = teamNameInput.trim().toLowerCase();
    const duplicateName = teams.some((t) => t.id !== selectedTeam.id && t.nameLower === nameLower);
    if (duplicateName) {
      Alert.alert("Name Taken", "A team with this name already exists.");
      return;
    }

    try {
      setSaving(true);
      await onEditTeamName(selectedTeam, teamNameInput.trim());
      setShowEditTeamName(false);
      setSelectedTeam(null);
      setTeamNameInput("");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadTeamAvatar = async () => {
    if (!selectedTeam) return;

    try {
      setUploadingAvatar(true);
      await onUploadTeamAvatar(selectedTeam);
      setShowTeamActions(false);
      setSelectedTeam(null);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleDeleteTeam = () => {
    if (!selectedTeam) return;

    Alert.alert(
      "Delete Team",
      `Are you sure you want to delete "${selectedTeam.name}"? Members will become unassigned.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await onDeleteTeam(selectedTeam);
            setShowTeamActions(false);
            setSelectedTeam(null);
          },
        },
      ]
    );
  };

  const handleRemoveMemberFromTeam = (memberId: string) => {
    if (!selectedTeam) return;

    Alert.alert(
      "Remove from Team",
      "Remove this member from the team?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await onRemoveMemberFromTeam(selectedTeam, memberId);
          },
        },
      ]
    );
  };

  const handleSubmitTeamEditRequest = async () => {
    if (!selectedTeam || !requestNewValue.trim()) {
      Alert.alert("Error", "Please enter a value.");
      return;
    }

    if (requestEditType === "name" && selectedTeam.nameChangeUsed) {
      Alert.alert("Not Allowed", "This team has already used their one free name change.");
      return;
    }

    try {
      setSaving(true);
      await onSubmitEditRequest(selectedTeam, requestEditType, requestNewValue.trim());
      setShowRequestTeamEdit(false);
      setRequestNewValue("");
    } finally {
      setSaving(false);
    }
  };

  const handleApproveEditRequest = async () => {
    if (!selectedEditRequest) return;

    try {
      setSaving(true);
      await onApproveEditRequest(selectedEditRequest);
      setShowTeamEditRequestActions(false);
      setSelectedEditRequest(null);
    } finally {
      setSaving(false);
    }
  };

  const handleRejectEditRequest = () => {
    if (!selectedEditRequest) return;

    Alert.prompt(
      "Reject Request",
      "Enter a reason (optional):",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reject",
          style: "destructive",
          onPress: async (reason?: string) => {
            try {
              setSaving(true);
              await onRejectEditRequest(selectedEditRequest, reason);
              setShowTeamEditRequestActions(false);
              setSelectedEditRequest(null);
            } finally {
              setSaving(false);
            }
          },
        },
      ],
      "plain-text"
    );
  };

  const unassignedMembers = getUnassignedMembers();
  const userTeam = getCurrentUserTeam();

  // Create Team Modal
  const renderCreateTeamModal = () => (
    <Modal
      visible={showCreateTeam}
      animationType="slide"
      transparent
      onRequestClose={() => setShowCreateTeam(false)}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalEmoji}>🏌️</Text>
          <Text style={styles.modalTitle}>Create Team</Text>

          <TextInput
            style={styles.textEditInput}
            value={teamNameInput}
            onChangeText={setTeamNameInput}
            placeholder="Team name"
            placeholderTextColor="#999"
            autoFocus
            maxLength={30}
          />

          <View style={styles.modalButtonRow}>
            <TouchableOpacity
              style={styles.modalCancelButtonSmall}
              onPress={() => {
                setShowCreateTeam(false);
                setTeamNameInput("");
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={handleCreateTeam}
              disabled={saving || !teamNameInput.trim()}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>Create</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  // Team Actions Modal
  const renderTeamActionsModal = () => (
    <Modal
      visible={showTeamActions}
      animationType="slide"
      transparent
      onRequestClose={() => setShowTeamActions(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowTeamActions(false)}
      >
        <View style={styles.actionSheet}>
          {selectedTeam && (
            <>
              <View style={styles.actionSheetHeader}>
                {selectedTeam.avatar ? (
                  <Image
                    source={{ uri: selectedTeam.avatar }}
                    style={styles.actionSheetAvatar}
                  />
                ) : (
                  <View style={[styles.actionSheetAvatar, avatarStyles.placeholder]}>
                    <Text style={avatarStyles.initialLarge}>
                      {selectedTeam.name?.[0]?.toUpperCase() || "?"}
                    </Text>
                  </View>
                )}
                <Text style={styles.actionSheetName}>{selectedTeam.name}</Text>
              </View>

              <TouchableOpacity style={styles.actionItem} onPress={handleEditTeamName}>
                <Ionicons name="create-outline" size={22} color="#0D5C3A" />
                <Text style={styles.actionItemText}>
                  Edit Name {selectedTeam.nameChangeUsed ? "(Locked)" : ""}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={handleUploadTeamAvatar}
                disabled={uploadingAvatar}
              >
                <Ionicons name="image-outline" size={22} color="#0D5C3A" />
                <Text style={styles.actionItemText}>
                  {uploadingAvatar ? "Uploading..." : "Change Avatar"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => {
                  setShowTeamActions(false);
                  setShowAddMemberToTeam(true);
                }}
              >
                <Ionicons name="person-add-outline" size={22} color="#0D5C3A" />
                <Text style={styles.actionItemText}>Add Members</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionItem, styles.actionItemDanger]}
                onPress={handleDeleteTeam}
              >
                <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
                <Text style={[styles.actionItemText, styles.actionItemTextDanger]}>Delete Team</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCancelButton}
                onPress={() => setShowTeamActions(false)}
              >
                <Text style={styles.actionCancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // Add Members to Team Modal
  const renderAddMemberToTeamModal = () => (
    <Modal
      visible={showAddMemberToTeam}
      animationType="slide"
      transparent
      onRequestClose={() => setShowAddMemberToTeam(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowAddMemberToTeam(false)}
      >
        <View style={styles.actionSheet}>
          <View style={styles.actionSheetHeader}>
            <Text style={styles.actionSheetTitle}>Add to {selectedTeam?.name}</Text>
          </View>

          {unassignedMembers.length === 0 ? (
            <View style={styles.emptyActionSheet}>
              <Ionicons name="people-outline" size={40} color="#CCC" />
              <Text style={styles.emptyActionText}>All members are assigned</Text>
            </View>
          ) : (
            unassignedMembers.map((member) => (
              <TouchableOpacity
                key={member.id}
                style={styles.actionItem}
                onPress={async () => {
                  if (!selectedTeam) return;
                  await onAddMemberToTeam(selectedTeam, member.id);
                }}
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
                <Ionicons name="add-circle-outline" size={22} color="#0D5C3A" />
              </TouchableOpacity>
            ))
          )}

          <TouchableOpacity
            style={styles.actionCancelButton}
            onPress={() => setShowAddMemberToTeam(false)}
          >
            <Text style={styles.actionCancelText}>Done</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // Edit Team Name Modal
  const renderEditTeamNameModal = () => (
    <Modal
      visible={showEditTeamName}
      animationType="slide"
      transparent
      onRequestClose={() => setShowEditTeamName(false)}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Edit Team Name</Text>
          <Text style={styles.modalSubtitle}>This is the one free name change</Text>

          <TextInput
            style={styles.textEditInput}
            value={teamNameInput}
            onChangeText={setTeamNameInput}
            placeholder="Team name"
            placeholderTextColor="#999"
            autoFocus
            maxLength={30}
          />

          <View style={styles.modalButtonRow}>
            <TouchableOpacity
              style={styles.modalCancelButtonSmall}
              onPress={() => {
                setShowEditTeamName(false);
                setSelectedTeam(null);
                setTeamNameInput("");
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={handleSaveTeamName}
              disabled={saving || !teamNameInput.trim()}
            >
              {saving ? (
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

  // Team Edit Request Actions Modal
  const renderTeamEditRequestActionsModal = () => (
    <Modal
      visible={showTeamEditRequestActions}
      animationType="slide"
      transparent
      onRequestClose={() => setShowTeamEditRequestActions(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowTeamEditRequestActions(false)}
      >
        <View style={styles.actionSheet}>
          {selectedEditRequest && (
            <>
              <View style={styles.actionSheetHeader}>
                <Text style={styles.actionSheetTitle}>
                  {selectedEditRequest.type === "name" ? "Name Change Request" : "Avatar Change Request"}
                </Text>
                <Text style={styles.actionSheetSubtitle}>
                  From {selectedEditRequest.requestedByName}
                </Text>
              </View>

              <View style={styles.requestDetailBox}>
                <Text style={styles.requestDetailLabel}>Team</Text>
                <Text style={styles.requestDetailValue}>{selectedEditRequest.teamName}</Text>

                {selectedEditRequest.type === "name" && (
                  <>
                    <Text style={styles.requestDetailLabel}>Current Name</Text>
                    <Text style={styles.requestDetailValue}>{selectedEditRequest.currentValue}</Text>
                    <Text style={styles.requestDetailLabel}>Requested Name</Text>
                    <Text style={[styles.requestDetailValue, styles.requestNewValue]}>
                      {selectedEditRequest.newValue}
                    </Text>
                  </>
                )}

                {selectedEditRequest.type === "avatar" && selectedEditRequest.newValue && (
                  <>
                    <Text style={styles.requestDetailLabel}>New Avatar</Text>
                    <Image
                      source={{ uri: selectedEditRequest.newValue }}
                      style={styles.requestAvatarPreview}
                    />
                  </>
                )}
              </View>

              <TouchableOpacity
                style={[styles.actionItem, { backgroundColor: "rgba(13, 92, 58, 0.1)" }]}
                onPress={handleApproveEditRequest}
              >
                <Ionicons name="checkmark-circle" size={22} color="#0D5C3A" />
                <Text style={[styles.actionItemText, { color: "#0D5C3A" }]}>Approve</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionItem, styles.actionItemDanger]}
                onPress={handleRejectEditRequest}
              >
                <Ionicons name="close-circle" size={22} color="#FF6B6B" />
                <Text style={[styles.actionItemText, styles.actionItemTextDanger]}>Reject</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCancelButton}
                onPress={() => setShowTeamEditRequestActions(false)}
              >
                <Text style={styles.actionCancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // Request Team Edit Modal (for team members)
  const renderRequestTeamEditModal = () => (
    <Modal
      visible={showRequestTeamEdit}
      animationType="slide"
      transparent
      onRequestClose={() => setShowRequestTeamEdit(false)}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {requestEditType === "name" ? "Request Name Change" : "Request Avatar Change"}
          </Text>
          <Text style={styles.modalSubtitle}>{selectedTeam?.name}</Text>

          {requestEditType === "name" ? (
            <TextInput
              style={styles.textEditInput}
              value={requestNewValue}
              onChangeText={setRequestNewValue}
              placeholder="New team name"
              placeholderTextColor="#999"
              autoFocus
              maxLength={30}
            />
          ) : (
            <>
              <Text style={styles.inputLabel}>Paste image URL:</Text>
              <TextInput
                style={styles.textEditInput}
                value={requestNewValue}
                onChangeText={setRequestNewValue}
                placeholder="https://..."
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}

          <View style={styles.modalButtonRow}>
            <TouchableOpacity
              style={styles.modalCancelButtonSmall}
              onPress={() => {
                setShowRequestTeamEdit(false);
                setSelectedTeam(null);
                setRequestNewValue("");
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={handleSubmitTeamEditRequest}
              disabled={saving || !requestNewValue.trim()}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.modalSaveText}>Submit</Text>
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
        {/* Pending Edit Requests (Commissioner only) */}
        {isCommissioner && teamEditRequests.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Pending Requests</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{teamEditRequests.length}</Text>
              </View>
            </View>

            {teamEditRequests.map((request) => (
              <TouchableOpacity
                key={request.id}
                style={styles.requestCard}
                onPress={() => {
                  setSelectedEditRequest(request);
                  setShowTeamEditRequestActions(true);
                }}
              >
                {request.requestedByAvatar ? (
                  <Image
                    source={{ uri: request.requestedByAvatar }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={[styles.avatar, avatarStyles.placeholder]}>
                    <Text style={avatarStyles.initial}>
                      {request.requestedByName?.[0]?.toUpperCase() || "?"}
                    </Text>
                  </View>
                )}
                <View style={styles.requestInfo}>
                  <Text style={styles.requestName}>
                    {request.type === "name" ? "Name Change" : "Avatar Change"}
                  </Text>
                  <Text style={styles.requestMeta}>
                    {request.teamName} • {request.requestedByName}
                  </Text>
                  {request.type === "name" && (
                    <Text style={styles.requestDetail}>
                      "{request.currentValue}" → "{request.newValue}"
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color="#CCC" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Teams List */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Teams</Text>
            {isCommissioner && (
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => {
                  setTeamNameInput("");
                  setShowCreateTeam(true);
                }}
              >
                <Ionicons name="add" size={22} color="#0D5C3A" />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>

          {teams.map((team) => {
            const teamMembers = getTeamMembers(team.id);
            const isExpanded = expandedTeamIds.has(team.id);
            const isMyTeam = userTeam?.id === team.id;

            return (
              <View key={team.id} style={styles.teamCard}>
                <TouchableOpacity
                  style={styles.teamHeader}
                  onPress={() => handleTeamPress(team)}
                  activeOpacity={0.7}
                >
                  {team.avatar ? (
                    <Image
                      source={{ uri: team.avatar }}
                      style={styles.teamAvatar}
                    />
                  ) : (
                    <View style={[styles.teamAvatar, avatarStyles.placeholder]}>
                      <Text style={avatarStyles.initialLarge}>
                        {team.name?.[0]?.toUpperCase() || "?"}
                      </Text>
                    </View>
                  )}
                  <View style={styles.teamInfo}>
                    <View style={styles.teamNameRow}>
                      <Text style={styles.teamName}>{team.name}</Text>
                      {isMyTeam && !isCommissioner && (
                        <View style={styles.myTeamBadge}>
                          <Text style={styles.myTeamBadgeText}>My Team</Text>
                        </View>
                      )}
                      {!team.nameChangeUsed && (
                        <View style={styles.freeChangeBadge}>
                          <Ionicons name="create-outline" size={12} color="#0D5C3A" />
                        </View>
                      )}
                    </View>
                    <Text style={styles.teamMeta}>
                      {teamMembers.length} member{teamMembers.length !== 1 ? "s" : ""}
                      {team.wins + team.losses > 0 && ` • ${team.wins}-${team.losses}`}
                      {team.totalPoints > 0 && ` • ${team.totalPoints} pts`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.expandButton}
                    onPress={() => toggleTeamExpand(team.id)}
                  >
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={20}
                      color="#999"
                    />
                  </TouchableOpacity>
                </TouchableOpacity>

                {/* Expanded Roster */}
                {isExpanded && (
                  <View style={styles.teamRoster}>
                    {teamMembers.length === 0 ? (
                      <Text style={styles.noMembersText}>No members assigned</Text>
                    ) : (
                      teamMembers.map((member) => (
                        <View key={member.id} style={styles.rosterMember}>
                          {member.avatar ? (
                            <Image
                              source={{ uri: member.avatar }}
                              style={styles.rosterAvatar}
                            />
                          ) : (
                            <View style={[styles.rosterAvatar, avatarStyles.placeholder]}>
                              <Text style={avatarStyles.initialSmall}>
                                {member.displayName?.[0]?.toUpperCase() || "?"}
                              </Text>
                            </View>
                          )}
                          <Text style={styles.rosterName}>{member.displayName}</Text>
                          {isCommissioner && (
                            <TouchableOpacity
                              style={styles.rosterRemove}
                              onPress={() => handleRemoveMemberFromTeam(member.id)}
                            >
                              <Ionicons name="close-circle" size={20} color="#FF6B6B" />
                            </TouchableOpacity>
                          )}
                        </View>
                      ))
                    )}

                    {/* Request Edit (for team members who aren't commissioners) */}
                    {isMyTeam && !isCommissioner && (
                      <View style={styles.teamMemberActions}>
                        {!team.nameChangeUsed && (
                          <TouchableOpacity
                            style={styles.requestEditButton}
                            onPress={() => {
                              setSelectedTeam(team);
                              setRequestEditType("name");
                              setRequestNewValue("");
                              setShowRequestTeamEdit(true);
                            }}
                          >
                            <Ionicons name="create-outline" size={16} color="#0D5C3A" />
                            <Text style={styles.requestEditText}>Request Name Change</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={styles.requestEditButton}
                          onPress={() => {
                            setSelectedTeam(team);
                            setRequestEditType("avatar");
                            setRequestNewValue("");
                            setShowRequestTeamEdit(true);
                          }}
                        >
                          <Ionicons name="image-outline" size={16} color="#0D5C3A" />
                          <Text style={styles.requestEditText}>Request Avatar Change</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          {teams.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color="#CCC" />
              <Text style={styles.emptyText}>No teams created</Text>
              {isCommissioner && (
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => {
                    setTeamNameInput("");
                    setShowCreateTeam(true);
                  }}
                >
                  <Text style={styles.emptyButtonText}>Create First Team</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Unassigned Members (Commissioner only) */}
        {isCommissioner && unassignedMembers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Unassigned ({unassignedMembers.length})</Text>

            {unassignedMembers.map((member) => (
              <View key={member.id} style={styles.unassignedCard}>
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
                <Text style={styles.unassignedName}>{member.displayName}</Text>
                <TouchableOpacity
                  style={styles.assignButton}
                  onPress={() => {
                    // Open team picker for this member
                    // For now, we'll use the first team for simplicity
                    // In practice, you'd want a picker modal
                    if (teams.length > 0) {
                      onAddMemberToTeam(teams[0], member.id);
                    }
                  }}
                >
                  <Text style={styles.assignButtonText}>Assign</Text>
                  <Ionicons name="chevron-down" size={16} color="#0D5C3A" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {renderCreateTeamModal()}
      {renderTeamActionsModal()}
      {renderAddMemberToTeamModal()}
      {renderEditTeamNameModal()}
      {renderTeamEditRequestActionsModal()}
      {renderRequestTeamEditModal()}
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
  initialSmall: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },
});