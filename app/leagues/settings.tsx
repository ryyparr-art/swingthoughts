/**
 * League Settings Page - Phase 1 & 2
 * 
 * Commissioner/Manager dashboard for league management.
 * 
 * Tabs:
 * - Members: Pending requests, current members, actions
 * - Teams: Team management (2v2 format only)
 * - Settings: League configuration
 * 
 * Features:
 * - Confirm Setup flow (ready check before season)
 * - Approve/reject join requests
 * - Member management (handicap, remove, assign to team)
 * - Team management (create, edit, add/remove members)
 * - Team edit requests (members can request name/avatar changes)
 * - Edit league settings (respects lock rules)
 */

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useState } from "react";
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import ScoresTab from "@/components/leagues/settings/ScoresTab";
import { auth, db, storage } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface League {
  id: string;
  name: string;
  description?: string;
  leagueType: "live" | "sim";
  simPlatform?: string;
  format: "stroke" | "2v2";
  holesPerRound: 9 | 18;
  handicapSystem: "swingthoughts" | "league_managed";
  isPublic: boolean;
  regionKey: string;
  regionName: string;
  startDate: Timestamp;
  endDate: Timestamp;
  frequency: "weekly" | "biweekly" | "monthly";
  scoreDeadlineDays: number;
  totalWeeks: number;
  currentWeek: number;
  memberCount: number;
  status: "upcoming" | "active" | "completed";
  readyConfirmed?: boolean;
  hostUserId: string;
  managerIds?: string[];
  restrictedCourses?: Array<{ courseId: number; courseName: string }>;
  elevatedEvents?: {
    enabled: boolean;
    weeks: number[];
    multiplier: number;
  };
  createdAt: Timestamp;
}

interface Member {
  id: string;
  userId: string;
  displayName: string;
  avatar?: string;
  role: "commissioner" | "manager" | "member";
  leagueHandicap?: number;
  swingThoughtsHandicap?: number;
  teamId?: string;
  totalPoints: number;
  roundsPlayed: number;
  wins: number;
  joinedAt: Timestamp;
}

interface Team {
  id: string;
  name: string;
  nameLower: string;
  avatar?: string;
  nameChangeUsed: boolean;
  memberIds: string[];
  captainId?: string;
  wins: number;
  losses: number;
  totalPoints: number;
  createdAt: Timestamp;
}

interface TeamEditRequest {
  id: string;
  teamId: string;
  teamName: string;
  requestedBy: string;
  requestedByName: string;
  requestedByAvatar?: string;
  type: "name" | "avatar";
  currentValue: string;
  newValue: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  createdAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;
}

interface JoinRequest {
  id: string;
  leagueId: string;
  leagueName: string;
  userId: string;
  displayName: string;
  avatar?: string;
  handicap?: number;
  status: "pending" | "approved" | "rejected";
  createdAt: Timestamp;
}

type TabType = "members" | "teams" | "scores" | "settings";

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function LeagueSettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const leagueId = params.id as string;

  // State
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamEditRequests, setTeamEditRequests] = useState<TeamEditRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("members");
  const [isCommissioner, setIsCommissioner] = useState(false);

  // Member modals
  const [showConfirmSetup, setShowConfirmSetup] = useState(false);
  const [showDelayPicker, setShowDelayPicker] = useState(false);
  const [showMemberActions, setShowMemberActions] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showHandicapEdit, setShowHandicapEdit] = useState(false);
  const [handicapInput, setHandicapInput] = useState("");
  const [showAssignTeam, setShowAssignTeam] = useState(false);

  // Team modals
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [showTeamActions, setShowTeamActions] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showEditTeamName, setShowEditTeamName] = useState(false);
  const [teamNameInput, setTeamNameInput] = useState("");
  const [showAddMemberToTeam, setShowAddMemberToTeam] = useState(false);
  const [showTeamEditRequestActions, setShowTeamEditRequestActions] = useState(false);
  const [selectedEditRequest, setSelectedEditRequest] = useState<TeamEditRequest | null>(null);
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(new Set());

  // Team member request modal (for non-commissioners)
  const [showRequestTeamEdit, setShowRequestTeamEdit] = useState(false);
  const [requestEditType, setRequestEditType] = useState<"name" | "avatar">("name");
  const [requestNewValue, setRequestNewValue] = useState("");

  // Settings edit state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<any>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const currentUserId = auth.currentUser?.uid;

  /* ================================================================ */
  /* DATA LOADING                                                     */
  /* ================================================================ */

  useEffect(() => {
    if (!leagueId || !currentUserId) return;

    const leagueRef = doc(db, "leagues", leagueId);
    const unsubLeague = onSnapshot(leagueRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Omit<League, "id">;
        setLeague({ id: snap.id, ...data });
        const isHost = data.hostUserId === currentUserId;
        const isManager = data.managerIds?.includes(currentUserId) || false;
        setIsCommissioner(isHost || isManager);
      }
    });

    const membersRef = collection(db, "leagues", leagueId, "members");
    const membersQuery = query(membersRef, orderBy("joinedAt", "asc"));
    const unsubMembers = onSnapshot(membersQuery, (snap) => {
      const memberList: Member[] = [];
      snap.forEach((doc) => {
        memberList.push({ id: doc.id, userId: doc.id, ...doc.data() } as Member);
      });
      setMembers(memberList);
    });

    const teamsRef = collection(db, "leagues", leagueId, "teams");
    const teamsQuery = query(teamsRef, orderBy("createdAt", "asc"));
    const unsubTeams = onSnapshot(teamsQuery, (snap) => {
      const teamList: Team[] = [];
      snap.forEach((doc) => {
        teamList.push({ id: doc.id, ...doc.data() } as Team);
      });
      setTeams(teamList);
    });

    const editRequestsRef = collection(db, "leagues", leagueId, "team_edit_requests");
    const editRequestsQuery = query(editRequestsRef, where("status", "==", "pending"), orderBy("createdAt", "asc"));
    const unsubEditRequests = onSnapshot(editRequestsQuery, (snap) => {
      const requests: TeamEditRequest[] = [];
      snap.forEach((doc) => {
        requests.push({ id: doc.id, ...doc.data() } as TeamEditRequest);
      });
      setTeamEditRequests(requests);
    });

    const requestsRef = collection(db, "league_join_requests");
    const requestsQuery = query(requestsRef, where("leagueId", "==", leagueId), where("status", "==", "pending"), orderBy("createdAt", "asc"));
    const unsubRequests = onSnapshot(requestsQuery, (snap) => {
      const requests: JoinRequest[] = [];
      snap.forEach((doc) => {
        requests.push({ id: doc.id, ...doc.data() } as JoinRequest);
      });
      setPendingRequests(requests);
      setLoading(false);
    });

    return () => {
      unsubLeague();
      unsubMembers();
      unsubTeams();
      unsubEditRequests();
      unsubRequests();
    };
  }, [leagueId, currentUserId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 500));
    setRefreshing(false);
  };

  /* ================================================================ */
  /* JOIN REQUEST HANDLERS                                            */
  /* ================================================================ */

  const handleApproveRequest = async (request: JoinRequest) => {
    if (!league) return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      soundPlayer.play("postThought");
      const batch = writeBatch(db);
      const memberRef = doc(db, "leagues", leagueId, "members", request.userId);
      batch.set(memberRef, {
        userId: request.userId,
        displayName: request.displayName,
        avatar: request.avatar || null,
        role: "member",
        swingThoughtsHandicap: request.handicap || null,
        leagueHandicap: null,
        teamId: null,
        totalPoints: 0,
        roundsPlayed: 0,
        wins: 0,
        joinedAt: serverTimestamp(),
      });
      const requestRef = doc(db, "league_join_requests", request.id);
      batch.update(requestRef, { status: "approved" });
      const leagueRef = doc(db, "leagues", leagueId);
      batch.update(leagueRef, { memberCount: (league.memberCount || 0) + 1 });
      await batch.commit();
      Alert.alert("Approved! ⛳", `${request.displayName} has been added to the league.`);
    } catch (error) {
      console.error("Error approving request:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to approve request. Please try again.");
    }
  };

  const handleRejectRequest = async (request: JoinRequest) => {
    Alert.alert("Reject Request", `Are you sure you want to reject ${request.displayName}'s request?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: async () => {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const requestRef = doc(db, "league_join_requests", request.id);
            await updateDoc(requestRef, { status: "rejected" });
          } catch (error) {
            console.error("Error rejecting request:", error);
            Alert.alert("Error", "Failed to reject request.");
          }
        },
      },
    ]);
  };

  /* ================================================================ */
  /* MEMBER HANDLERS                                                  */
  /* ================================================================ */

  const handleMemberPress = (member: Member) => {
    if (!isCommissioner) return;
    setSelectedMember(member);
    setShowMemberActions(true);
  };

  const handleRemoveMember = async () => {
    if (!selectedMember || !league) return;
    if (selectedMember.role === "commissioner") {
      Alert.alert("Cannot Remove", "The commissioner cannot be removed from the league.");
      return;
    }
    Alert.alert("Remove Member", `Are you sure you want to remove ${selectedMember.displayName} from the league?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const batch = writeBatch(db);
            if (selectedMember.teamId) {
              const teamRef = doc(db, "leagues", leagueId, "teams", selectedMember.teamId);
              const teamDoc = await getDoc(teamRef);
              if (teamDoc.exists()) {
                const teamData = teamDoc.data();
                const updatedMemberIds = (teamData.memberIds || []).filter((id: string) => id !== selectedMember.id);
                batch.update(teamRef, { memberIds: updatedMemberIds });
              }
            }
            const memberRef = doc(db, "leagues", leagueId, "members", selectedMember.id);
            batch.delete(memberRef);
            const leagueRef = doc(db, "leagues", leagueId);
            batch.update(leagueRef, { memberCount: Math.max(0, (league.memberCount || 1) - 1) });
            await batch.commit();
            setShowMemberActions(false);
            setSelectedMember(null);
          } catch (error) {
            console.error("Error removing member:", error);
            Alert.alert("Error", "Failed to remove member.");
          }
        },
      },
    ]);
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
      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const memberRef = doc(db, "leagues", leagueId, "members", selectedMember.id);
      await updateDoc(memberRef, { leagueHandicap: newHandicap });
      soundPlayer.play("postThought");
      setShowHandicapEdit(false);
      setSelectedMember(null);
    } catch (error) {
      console.error("Error updating handicap:", error);
      Alert.alert("Error", "Failed to update handicap.");
    } finally {
      setSaving(false);
    }
  };

  const handleAssignToTeam = async (teamId: string | null) => {
    if (!selectedMember) return;
    try {
      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const batch = writeBatch(db);
      if (selectedMember.teamId) {
        const oldTeamRef = doc(db, "leagues", leagueId, "teams", selectedMember.teamId);
        const oldTeamDoc = await getDoc(oldTeamRef);
        if (oldTeamDoc.exists()) {
          const oldTeamData = oldTeamDoc.data();
          const updatedMemberIds = (oldTeamData.memberIds || []).filter((id: string) => id !== selectedMember.id);
          batch.update(oldTeamRef, { memberIds: updatedMemberIds });
        }
      }
      if (teamId) {
        const newTeamRef = doc(db, "leagues", leagueId, "teams", teamId);
        const newTeamDoc = await getDoc(newTeamRef);
        if (newTeamDoc.exists()) {
          const newTeamData = newTeamDoc.data();
          const updatedMemberIds = [...(newTeamData.memberIds || []), selectedMember.id];
          batch.update(newTeamRef, { memberIds: updatedMemberIds });
        }
      }
      const memberRef = doc(db, "leagues", leagueId, "members", selectedMember.id);
      batch.update(memberRef, { teamId: teamId || null });
      await batch.commit();
      soundPlayer.play("click");
      setShowAssignTeam(false);
      setShowMemberActions(false);
      setSelectedMember(null);
    } catch (error) {
      console.error("Error assigning to team:", error);
      Alert.alert("Error", "Failed to assign to team.");
    } finally {
      setSaving(false);
    }
  };

  /* ================================================================ */
  /* TEAM HANDLERS                                                    */
  /* ================================================================ */

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const teamsRef = collection(db, "leagues", leagueId, "teams");
      await addDoc(teamsRef, {
        name: teamNameInput.trim(),
        nameLower,
        avatar: null,
        nameChangeUsed: false,
        memberIds: [],
        captainId: null,
        wins: 0,
        losses: 0,
        totalPoints: 0,
        createdAt: serverTimestamp(),
      });
      soundPlayer.play("postThought");
      setShowCreateTeam(false);
      setTeamNameInput("");
      Alert.alert("Team Created! 🏌️", `"${teamNameInput.trim()}" is ready for members.`);
    } catch (error) {
      console.error("Error creating team:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to create team.");
    } finally {
      setSaving(false);
    }
  };

  const handleTeamPress = (team: Team) => {
    if (isCommissioner) {
      setSelectedTeam(team);
      setShowTeamActions(true);
    } else {
      toggleTeamExpand(team.id);
    }
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const teamRef = doc(db, "leagues", leagueId, "teams", selectedTeam.id);
      await updateDoc(teamRef, { name: teamNameInput.trim(), nameLower, nameChangeUsed: true });
      soundPlayer.play("postThought");
      setShowEditTeamName(false);
      setSelectedTeam(null);
      setTeamNameInput("");
    } catch (error) {
      console.error("Error updating team name:", error);
      Alert.alert("Error", "Failed to update team name.");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadTeamAvatar = async () => {
    if (!selectedTeam) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      setUploadingAvatar(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `leagues/${leagueId}/teams/${selectedTeam.id}/avatar.jpg`);
      await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);
      const teamRef = doc(db, "leagues", leagueId, "teams", selectedTeam.id);
      await updateDoc(teamRef, { avatar: downloadUrl });
      soundPlayer.play("postThought");
      setShowTeamActions(false);
      setSelectedTeam(null);
    } catch (error) {
      console.error("Error uploading avatar:", error);
      Alert.alert("Error", "Failed to upload avatar.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveMemberFromTeam = async (memberId: string) => {
    if (!selectedTeam) return;
    Alert.alert("Remove from Team", "Remove this member from the team?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const batch = writeBatch(db);
            const teamRef = doc(db, "leagues", leagueId, "teams", selectedTeam.id);
            const updatedMemberIds = selectedTeam.memberIds.filter((id) => id !== memberId);
            batch.update(teamRef, { memberIds: updatedMemberIds });
            const memberRef = doc(db, "leagues", leagueId, "members", memberId);
            batch.update(memberRef, { teamId: null });
            await batch.commit();
            soundPlayer.play("click");
          } catch (error) {
            console.error("Error removing member from team:", error);
            Alert.alert("Error", "Failed to remove member from team.");
          }
        },
      },
    ]);
  };

  const handleDeleteTeam = async () => {
    if (!selectedTeam) return;
    Alert.alert("Delete Team", `Are you sure you want to delete "${selectedTeam.name}"? Members will become unassigned.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const batch = writeBatch(db);
            for (const memberId of selectedTeam.memberIds) {
              const memberRef = doc(db, "leagues", leagueId, "members", memberId);
              batch.update(memberRef, { teamId: null });
            }
            const teamRef = doc(db, "leagues", leagueId, "teams", selectedTeam.id);
            batch.delete(teamRef);
            await batch.commit();
            setShowTeamActions(false);
            setSelectedTeam(null);
            soundPlayer.play("click");
          } catch (error) {
            console.error("Error deleting team:", error);
            Alert.alert("Error", "Failed to delete team.");
          }
        },
      },
    ]);
  };

  /* ================================================================ */
  /* TEAM EDIT REQUEST HANDLERS                                       */
  /* ================================================================ */

  const handleSubmitTeamEditRequest = async () => {
    if (!selectedTeam || !requestNewValue.trim()) {
      Alert.alert("Error", "Please enter a value.");
      return;
    }
    if (requestEditType === "name" && selectedTeam.nameChangeUsed) {
      Alert.alert("Not Allowed", "This team has already used their one free name change.");
      return;
    }
    const currentUser = members.find((m) => m.id === currentUserId);
    if (!currentUser) {
      Alert.alert("Error", "You must be a member to submit requests.");
      return;
    }
    try {
      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const requestsRef = collection(db, "leagues", leagueId, "team_edit_requests");
      await addDoc(requestsRef, {
        teamId: selectedTeam.id,
        teamName: selectedTeam.name,
        requestedBy: currentUserId,
        requestedByName: currentUser.displayName,
        requestedByAvatar: currentUser.avatar || null,
        type: requestEditType,
        currentValue: requestEditType === "name" ? selectedTeam.name : (selectedTeam.avatar || ""),
        newValue: requestNewValue.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      });
      soundPlayer.play("postThought");
      setShowRequestTeamEdit(false);
      setRequestNewValue("");
      Alert.alert("Request Submitted! 📝", "The commissioner will review your request.");
    } catch (error) {
      console.error("Error submitting request:", error);
      Alert.alert("Error", "Failed to submit request.");
    } finally {
      setSaving(false);
    }
  };

  const handleApproveEditRequest = async (request: TeamEditRequest) => {
    try {
      setSaving(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const batch = writeBatch(db);
      const requestRef = doc(db, "leagues", leagueId, "team_edit_requests", request.id);
      batch.update(requestRef, { status: "approved", reviewedAt: serverTimestamp(), reviewedBy: currentUserId });
      const teamRef = doc(db, "leagues", leagueId, "teams", request.teamId);
      if (request.type === "name") {
        batch.update(teamRef, { name: request.newValue, nameLower: request.newValue.toLowerCase(), nameChangeUsed: true });
      } else {
        batch.update(teamRef, { avatar: request.newValue });
      }
      await batch.commit();
      soundPlayer.play("postThought");
      setShowTeamEditRequestActions(false);
      setSelectedEditRequest(null);
    } catch (error) {
      console.error("Error approving request:", error);
      Alert.alert("Error", "Failed to approve request.");
    } finally {
      setSaving(false);
    }
  };

  const handleRejectEditRequest = async (request: TeamEditRequest, reason?: string) => {
    try {
      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const requestRef = doc(db, "leagues", leagueId, "team_edit_requests", request.id);
      await updateDoc(requestRef, { status: "rejected", rejectionReason: reason || null, reviewedAt: serverTimestamp(), reviewedBy: currentUserId });
      soundPlayer.play("click");
      setShowTeamEditRequestActions(false);
      setSelectedEditRequest(null);
    } catch (error) {
      console.error("Error rejecting request:", error);
      Alert.alert("Error", "Failed to reject request.");
    } finally {
      setSaving(false);
    }
  };

  /* ================================================================ */
  /* CONFIRM SETUP / READY CHECK                                      */
  /* ================================================================ */

  const handleConfirmReady = async () => {
    if (!league) return;
    try {
      setSaving(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      soundPlayer.play("achievement");
      const leagueRef = doc(db, "leagues", leagueId);
      await updateDoc(leagueRef, { readyConfirmed: true });
      setShowConfirmSetup(false);
      Alert.alert("You're All Set! ⛳", `League will start on ${formatDate(league.startDate)}.`);
    } catch (error) {
      console.error("Error confirming setup:", error);
      Alert.alert("Error", "Failed to confirm setup.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelayStart = async (newDate: Date) => {
    if (!league) return;
    try {
      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const startTimestamp = Timestamp.fromDate(newDate);
      const weeksMs = league.totalWeeks * 7 * 24 * 60 * 60 * 1000;
      const endDate = new Date(newDate.getTime() + weeksMs);
      const leagueRef = doc(db, "leagues", leagueId);
      await updateDoc(leagueRef, { startDate: startTimestamp, endDate: Timestamp.fromDate(endDate) });
      setShowDelayPicker(false);
      setShowConfirmSetup(false);
      soundPlayer.play("postThought");
      Alert.alert("Start Date Updated", `League will now start on ${formatDate(startTimestamp)}.`);
    } catch (error) {
      console.error("Error updating start date:", error);
      Alert.alert("Error", "Failed to update start date.");
    } finally {
      setSaving(false);
    }
  };

  /* ================================================================ */
  /* SETTINGS HANDLERS                                                */
  /* ================================================================ */

  const handleSaveSetting = async (field: string, value: any) => {
    if (!league) return;
    try {
      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const leagueRef = doc(db, "leagues", leagueId);
      if (field === "name") {
        await updateDoc(leagueRef, { name: value, nameLower: value.toLowerCase() });
      } else if (field === "startDate") {
        const weeksMs = league.totalWeeks * 7 * 24 * 60 * 60 * 1000;
        const endDate = new Date(value.getTime() + weeksMs);
        await updateDoc(leagueRef, { startDate: Timestamp.fromDate(value), endDate: Timestamp.fromDate(endDate) });
      } else {
        await updateDoc(leagueRef, { [field]: value });
      }
      soundPlayer.play("click");
      setEditingField(null);
      setTempValue(null);
    } catch (error) {
      console.error("Error saving setting:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to save setting.");
    } finally {
      setSaving(false);
    }
  };

  /* ================================================================ */
  /* HELPERS                                                          */
  /* ================================================================ */

  const formatDate = (timestamp: Timestamp): string => {
    const date = timestamp.toDate();
    return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  };

  const formatDateShort = (timestamp: Timestamp): string => {
    const date = timestamp.toDate();
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getDaysUntilStart = (): number => {
    if (!league) return 0;
    const now = Date.now();
    const start = league.startDate.toMillis();
    return Math.ceil((start - now) / (1000 * 60 * 60 * 24));
  };

  const canEditSchedule = (): boolean => {
    return league?.status === "upcoming" && !league?.readyConfirmed;
  };

  const getRoleBadge = (role: Member["role"]) => {
    switch (role) {
      case "commissioner":
        return { label: "Commissioner", color: "#FFD700" };
      case "manager":
        return { label: "Manager", color: "#0D5C3A" };
      default:
        return null;
    }
  };

  const getTimeAgo = (timestamp: Timestamp): string => {
    const now = Date.now();
    const time = timestamp.toMillis();
    const diff = now - time;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return timestamp.toDate().toLocaleDateString();
  };

  const getUnassignedMembers = (): Member[] => members.filter((m) => !m.teamId);
  const getTeamMembers = (teamId: string): Member[] => members.filter((m) => m.teamId === teamId);
  const getCurrentUserTeam = (): Team | null => {
    const currentMember = members.find((m) => m.id === currentUserId);
    if (!currentMember?.teamId) return null;
    return teams.find((t) => t.id === currentMember.teamId) || null;
  };

  /* ================================================================ */
  /* RENDER - LOADING                                                 */
  /* ================================================================ */

  if (loading || !league) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D5C3A" />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const daysUntilStart = getDaysUntilStart();
  const showConfirmButton = league.status === "upcoming" && !league.readyConfirmed && daysUntilStart <= 7;
  const is2v2 = league.format === "2v2";

  /* ================================================================ */
  /* RENDER - HEADER                                                  */
  /* ================================================================ */

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="chevron-back" size={28} color="#0D5C3A" />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle} numberOfLines={1}>{league.name}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, league.status === "active" && styles.statusActive, league.status === "completed" && styles.statusCompleted]}>
            <Text style={styles.statusText}>
              {league.status === "upcoming" ? (league.readyConfirmed ? `Ready • ${daysUntilStart}d` : `Starts in ${daysUntilStart}d`) : league.status === "active" ? `Week ${league.currentWeek} of ${league.totalWeeks}` : "Completed"}
            </Text>
          </View>
        </View>
      </View>
      {showConfirmButton && (
        <TouchableOpacity style={styles.confirmButton} onPress={() => setShowConfirmSetup(true)}>
          <Text style={styles.confirmButtonText}>Confirm Setup</Text>
        </TouchableOpacity>
      )}
      {league.readyConfirmed && league.status === "upcoming" && (
        <View style={styles.readyBadge}>
          <Ionicons name="checkmark-circle" size={20} color="#0D5C3A" />
        </View>
      )}
    </View>
  );

  /* ================================================================ */
  /* RENDER - TABS                                                    */
  /* ================================================================ */

  const availableTabs: TabType[] = is2v2 ? ["members", "teams", "scores", "settings"] : ["members", "scores", "settings"];

  const renderTabs = () => (
    <View style={styles.tabBar}>
      {availableTabs.map((tab) => (
        <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab(tab); }}>
          <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
            {tab === "members" ? `Members (${members.length})` : tab === "teams" ? `Teams (${teams.length})` : tab === "scores" ? "Scores" : "Settings"}
          </Text>
          {tab === "members" && pendingRequests.length > 0 && (
            <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{pendingRequests.length}</Text></View>
          )}
          {tab === "teams" && teamEditRequests.length > 0 && isCommissioner && (
            <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{teamEditRequests.length}</Text></View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  /* ================================================================ */
  /* RENDER - MEMBERS TAB                                             */
  /* ================================================================ */

  const renderMembersTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0D5C3A" />}>
      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pending Requests</Text>
            <View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>{pendingRequests.length}</Text></View>
          </View>
          {pendingRequests.map((request) => (
            <View key={request.id} style={styles.requestCard}>
              {request.avatar ? (
                <Image source={{ uri: request.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>{request.displayName?.[0]?.toUpperCase() || "?"}</Text>
                </View>
              )}
              <View style={styles.requestInfo}>
                <Text style={styles.requestName}>{request.displayName}</Text>
                <Text style={styles.requestMeta}>{request.handicap !== undefined && `${request.handicap} HCP • `}Applied {getTimeAgo(request.createdAt)}</Text>
              </View>
              <View style={styles.requestActions}>
                <TouchableOpacity style={styles.approveButton} onPress={() => handleApproveRequest(request)}><Ionicons name="checkmark" size={20} color="#FFF" /></TouchableOpacity>
                <TouchableOpacity style={styles.rejectButton} onPress={() => handleRejectRequest(request)}><Ionicons name="close" size={20} color="#FFF" /></TouchableOpacity>
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
          const handicap = league.handicapSystem === "league_managed" ? member.leagueHandicap : member.swingThoughtsHandicap;
          const memberTeam = member.teamId ? teams.find((t) => t.id === member.teamId) : null;
          return (
            <TouchableOpacity key={member.id} style={styles.memberCard} onPress={() => handleMemberPress(member)} disabled={!isCommissioner} activeOpacity={isCommissioner ? 0.7 : 1}>
              {member.avatar ? (
                <Image source={{ uri: member.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>{member.displayName?.[0]?.toUpperCase() || "?"}</Text>
                </View>
              )}
              <View style={styles.memberInfo}>
                <View style={styles.memberNameRow}>
                  <Text style={styles.memberName}>{member.displayName}</Text>
                  {badge && <View style={[styles.roleBadge, { backgroundColor: badge.color }]}><Text style={styles.roleBadgeText}>{badge.label}</Text></View>}
                </View>
                <Text style={styles.memberMeta}>
                  {handicap !== undefined && handicap !== null ? `${handicap} HCP` : "No HCP"}
                  {is2v2 && memberTeam && ` • ${memberTeam.name}`}
                  {member.roundsPlayed > 0 && ` • ${member.roundsPlayed} rounds`}
                </Text>
              </View>
              {isCommissioner && member.role !== "commissioner" && <Ionicons name="chevron-forward" size={20} color="#CCC" />}
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
  );

  /* ================================================================ */
  /* RENDER - TEAMS TAB                                               */
  /* ================================================================ */

  const renderTeamsTab = () => {
    const unassignedMembers = getUnassignedMembers();
    const userTeam = getCurrentUserTeam();
    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0D5C3A" />}>
        {/* Pending Edit Requests */}
        {isCommissioner && teamEditRequests.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Pending Requests</Text>
              <View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>{teamEditRequests.length}</Text></View>
            </View>
            {teamEditRequests.map((request) => (
              <TouchableOpacity key={request.id} style={styles.requestCard} onPress={() => { setSelectedEditRequest(request); setShowTeamEditRequestActions(true); }}>
                {request.requestedByAvatar ? (
                  <Image source={{ uri: request.requestedByAvatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitial}>{request.requestedByName?.[0]?.toUpperCase() || "?"}</Text>
                  </View>
                )}
                <View style={styles.requestInfo}>
                  <Text style={styles.requestName}>{request.type === "name" ? "Name Change" : "Avatar Change"}</Text>
                  <Text style={styles.requestMeta}>{request.teamName} • {request.requestedByName}</Text>
                  {request.type === "name" && <Text style={styles.requestDetail}>"{request.currentValue}" → "{request.newValue}"</Text>}
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
              <TouchableOpacity style={styles.addButton} onPress={() => { setTeamNameInput(""); setShowCreateTeam(true); }}>
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
                <TouchableOpacity style={styles.teamHeader} onPress={() => handleTeamPress(team)} activeOpacity={0.7}>
                  {team.avatar ? (
                    <Image source={{ uri: team.avatar }} style={styles.teamAvatar} />
                  ) : (
                    <View style={[styles.teamAvatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitial}>{team.name?.[0]?.toUpperCase() || "?"}</Text>
                    </View>
                  )}
                  <View style={styles.teamInfo}>
                    <View style={styles.teamNameRow}>
                      <Text style={styles.teamName}>{team.name}</Text>
                      {isMyTeam && !isCommissioner && <View style={styles.myTeamBadge}><Text style={styles.myTeamBadgeText}>My Team</Text></View>}
                      {!team.nameChangeUsed && <View style={styles.freeChangeBadge}><Ionicons name="create-outline" size={12} color="#0D5C3A" /></View>}
                    </View>
                    <Text style={styles.teamMeta}>{teamMembers.length} member{teamMembers.length !== 1 ? "s" : ""}{team.wins + team.losses > 0 && ` • ${team.wins}-${team.losses}`}{team.totalPoints > 0 && ` • ${team.totalPoints} pts`}</Text>
                  </View>
                  <TouchableOpacity style={styles.expandButton} onPress={() => toggleTeamExpand(team.id)}>
                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color="#999" />
                  </TouchableOpacity>
                </TouchableOpacity>
                {isExpanded && (
                  <View style={styles.teamRoster}>
                    {teamMembers.length === 0 ? (
                      <Text style={styles.noMembersText}>No members assigned</Text>
                    ) : (
                      teamMembers.map((member) => (
                        <View key={member.id} style={styles.rosterMember}>
                          {member.avatar ? (
                            <Image source={{ uri: member.avatar }} style={styles.rosterAvatar} />
                          ) : (
                            <View style={[styles.rosterAvatar, styles.avatarFallback]}>
                              <Text style={styles.avatarInitialSmall}>{member.displayName?.[0]?.toUpperCase() || "?"}</Text>
                            </View>
                          )}
                          <Text style={styles.rosterName}>{member.displayName}</Text>
                          {isCommissioner && <TouchableOpacity style={styles.rosterRemove} onPress={() => handleRemoveMemberFromTeam(member.id)}><Ionicons name="close-circle" size={20} color="#FF6B6B" /></TouchableOpacity>}
                        </View>
                      ))
                    )}
                    {isMyTeam && !isCommissioner && (
                      <View style={styles.teamMemberActions}>
                        {!team.nameChangeUsed && (
                          <TouchableOpacity style={styles.requestEditButton} onPress={() => { setSelectedTeam(team); setRequestEditType("name"); setRequestNewValue(""); setShowRequestTeamEdit(true); }}>
                            <Ionicons name="create-outline" size={16} color="#0D5C3A" />
                            <Text style={styles.requestEditText}>Request Name Change</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.requestEditButton} onPress={() => { setSelectedTeam(team); setRequestEditType("avatar"); setRequestNewValue(""); setShowRequestTeamEdit(true); }}>
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
              {isCommissioner && <TouchableOpacity style={styles.emptyButton} onPress={() => { setTeamNameInput(""); setShowCreateTeam(true); }}><Text style={styles.emptyButtonText}>Create First Team</Text></TouchableOpacity>}
            </View>
          )}
        </View>

        {/* Unassigned Members */}
        {isCommissioner && unassignedMembers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Unassigned ({unassignedMembers.length})</Text>
            {unassignedMembers.map((member) => (
              <View key={member.id} style={styles.unassignedCard}>
                {member.avatar ? (
                  <Image source={{ uri: member.avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitial}>{member.displayName?.[0]?.toUpperCase() || "?"}</Text>
                  </View>
                )}
                <Text style={styles.unassignedName}>{member.displayName}</Text>
                <TouchableOpacity style={styles.assignButton} onPress={() => { setSelectedMember(member); setShowAssignTeam(true); }}>
                  <Text style={styles.assignButtonText}>Assign</Text>
                  <Ionicons name="chevron-down" size={16} color="#0D5C3A" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    );
  };

  /* ================================================================ */
  /* RENDER - SETTINGS TAB                                            */
  /* ================================================================ */

  const renderSettingsTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0D5C3A" />}>
      {/* Basic Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Basic Info</Text>
        <SettingRow label="League Name" value={league.name} editable={isCommissioner} onEdit={() => { setEditingField("name"); setTempValue(league.name); }} />
        <SettingRow label="Description" value={league.description || "No description"} editable={isCommissioner} multiline onEdit={() => { setEditingField("description"); setTempValue(league.description || ""); }} />
        <SettingRow label="Visibility" value={league.isPublic ? "Public" : "Private"} editable={isCommissioner} onEdit={() => { Alert.alert("Change Visibility", league.isPublic ? "Make this league private? Only invited members can join." : "Make this league public? Anyone can request to join.", [{ text: "Cancel", style: "cancel" }, { text: league.isPublic ? "Make Private" : "Make Public", onPress: () => handleSaveSetting("isPublic", !league.isPublic) }]); }} />
      </View>

      {/* Schedule */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Schedule</Text>
        {!canEditSchedule() && <Text style={styles.sectionNote}>{league.readyConfirmed ? "Schedule locked after confirming setup" : "Schedule locked after season starts"}</Text>}
        <SettingRow label="Start Date" value={formatDateShort(league.startDate)} editable={canEditSchedule() && isCommissioner} onEdit={() => { setTempValue(league.startDate.toDate()); setShowDatePicker(true); }} />
        <SettingRow label="End Date" value={formatDateShort(league.endDate)} editable={false} />
        <SettingRow label="Frequency" value={league.frequency.charAt(0).toUpperCase() + league.frequency.slice(1)} editable={canEditSchedule() && isCommissioner} onEdit={() => { Alert.alert("Change Frequency", "Select round frequency:", [{ text: "Cancel", style: "cancel" }, { text: "Weekly", onPress: () => handleSaveSetting("frequency", "weekly") }, { text: "Biweekly", onPress: () => handleSaveSetting("frequency", "biweekly") }, { text: "Monthly", onPress: () => handleSaveSetting("frequency", "monthly") }]); }} />
        <SettingRow label="Total Weeks" value={`${league.totalWeeks} weeks`} editable={canEditSchedule() && isCommissioner} onEdit={() => { setEditingField("totalWeeks"); setTempValue(league.totalWeeks.toString()); }} />
        <SettingRow label="Score Deadline" value={`${league.scoreDeadlineDays} days after round`} editable={canEditSchedule() && isCommissioner} onEdit={() => { Alert.alert("Score Deadline", "How many days to submit scores?", [{ text: "Cancel", style: "cancel" }, { text: "1 Day", onPress: () => handleSaveSetting("scoreDeadlineDays", 1) }, { text: "2 Days", onPress: () => handleSaveSetting("scoreDeadlineDays", 2) }, { text: "3 Days", onPress: () => handleSaveSetting("scoreDeadlineDays", 3) }, { text: "7 Days", onPress: () => handleSaveSetting("scoreDeadlineDays", 7) }]); }} />
      </View>

      {/* Format (Read-Only) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Format</Text>
        <Text style={styles.sectionNote}>Set at creation, cannot be changed</Text>
        <SettingRow label="Type" value={league.leagueType === "live" ? "☀️ Live Golf" : `🖥️ Simulator (${league.simPlatform})`} editable={false} />
        <SettingRow label="Format" value={league.format === "stroke" ? "Stroke Play" : "2v2 Match Play"} editable={false} />
        <SettingRow label="Holes" value={`${league.holesPerRound} holes per round`} editable={false} />
        <SettingRow label="Handicap System" value={league.handicapSystem === "swingthoughts" ? "SwingThoughts Handicaps" : "League Managed"} editable={false} />
      </View>

      {/* Elevated Events */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Elevated Events</Text>
        <SettingRow label="Enabled" value={league.elevatedEvents?.enabled ? "Yes" : "No"} editable={isCommissioner} onEdit={() => { const current = league.elevatedEvents?.enabled || false; handleSaveSetting("elevatedEvents", { ...league.elevatedEvents, enabled: !current, weeks: league.elevatedEvents?.weeks || [], multiplier: league.elevatedEvents?.multiplier || 2 }); }} />
        {league.elevatedEvents?.enabled && (
          <>
            <SettingRow label="Weeks" value={league.elevatedEvents.weeks.length > 0 ? league.elevatedEvents.weeks.map((w) => `Week ${w}`).join(", ") : "None selected"} editable={isCommissioner} onEdit={() => { Alert.alert("Coming Soon", "Week selection will be available in the next update."); }} />
            <SettingRow label="Multiplier" value={`${league.elevatedEvents.multiplier}x points`} editable={isCommissioner} onEdit={() => { Alert.alert("Points Multiplier", "Select multiplier for elevated events:", [{ text: "Cancel", style: "cancel" }, { text: "1.5x", onPress: () => handleSaveSetting("elevatedEvents", { ...league.elevatedEvents, multiplier: 1.5 }) }, { text: "2x", onPress: () => handleSaveSetting("elevatedEvents", { ...league.elevatedEvents, multiplier: 2 }) }, { text: "3x", onPress: () => handleSaveSetting("elevatedEvents", { ...league.elevatedEvents, multiplier: 3 }) }]); }} />
          </>
        )}
      </View>

      {/* Danger Zone */}
      {isCommissioner && (
        <View style={[styles.section, styles.dangerSection]}>
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>
          <TouchableOpacity style={styles.dangerButton} onPress={() => { Alert.alert("Archive League", "This will end the season and archive all data. Members can still view past results. Continue?", [{ text: "Cancel", style: "cancel" }, { text: "Archive", style: "destructive", onPress: async () => { try { await updateDoc(doc(db, "leagues", leagueId), { status: "completed" }); router.back(); } catch (e) { Alert.alert("Error", "Failed to archive league."); } } }]); }}>
            <Ionicons name="archive-outline" size={20} color="#FF6B6B" />
            <Text style={styles.dangerButtonText}>Archive League</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dangerButton} onPress={() => { Alert.alert("Delete League", "This will permanently delete the league and all data. This cannot be undone. Are you absolutely sure?", [{ text: "Cancel", style: "cancel" }, { text: "Delete Forever", style: "destructive", onPress: async () => { try { await deleteDoc(doc(db, "leagues", leagueId)); router.replace("/leagues"); } catch (e) { Alert.alert("Error", "Failed to delete league."); } } }]); }}>
            <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
            <Text style={styles.dangerButtonText}>Delete League</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  /* ================================================================ */
  /* RENDER - MODALS                                                  */
  /* ================================================================ */

  const renderConfirmSetupModal = () => (
    <Modal visible={showConfirmSetup} animationType="slide" transparent onRequestClose={() => setShowConfirmSetup(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalEmoji}>⛳</Text>
          <Text style={styles.modalTitle}>Ready to Go?</Text>
          <Text style={styles.modalSubtitle}>Your league is set to begin{"\n"}<Text style={styles.modalDate}>{formatDate(league.startDate)}</Text></Text>
          <View style={styles.modalStats}>
            <View style={styles.modalStat}><Text style={styles.modalStatValue}>{members.length}</Text><Text style={styles.modalStatLabel}>members</Text></View>
            <View style={styles.modalStatDivider} />
            <View style={styles.modalStat}><Text style={styles.modalStatValue}>{teams.length}</Text><Text style={styles.modalStatLabel}>teams</Text></View>
            <View style={styles.modalStatDivider} />
            <View style={styles.modalStat}><Text style={styles.modalStatValue}>{league.totalWeeks}</Text><Text style={styles.modalStatLabel}>weeks</Text></View>
          </View>
          <TouchableOpacity style={styles.modalPrimaryButton} onPress={handleConfirmReady} disabled={saving}>
            {saving ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark-circle" size={22} color="#FFF" /><Text style={styles.modalPrimaryText}>We're Ready</Text></>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => { setShowConfirmSetup(false); setTempValue(league.startDate.toDate()); setShowDelayPicker(true); }}>
            <Ionicons name="calendar-outline" size={20} color="#0D5C3A" /><Text style={styles.modalSecondaryText}>Delay Start...</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowConfirmSetup(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderMemberActionsModal = () => (
    <Modal visible={showMemberActions} animationType="slide" transparent onRequestClose={() => setShowMemberActions(false)}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowMemberActions(false)}>
        <View style={styles.actionSheet}>
          {selectedMember && (
            <>
              <View style={styles.actionSheetHeader}>
                {selectedMember.avatar ? (
                  <Image source={{ uri: selectedMember.avatar }} style={styles.actionSheetAvatar} />
                ) : (
                  <View style={[styles.actionSheetAvatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitialLarge}>{selectedMember.displayName?.[0]?.toUpperCase() || "?"}</Text>
                  </View>
                )}
                <Text style={styles.actionSheetName}>{selectedMember.displayName}</Text>
              </View>
              <TouchableOpacity style={styles.actionItem} onPress={() => { setShowMemberActions(false); router.push(`/locker/${selectedMember.userId}`); }}>
                <Ionicons name="person-outline" size={22} color="#0D5C3A" /><Text style={styles.actionItemText}>View Profile</Text>
              </TouchableOpacity>
              {league.handicapSystem === "league_managed" && (
                <TouchableOpacity style={styles.actionItem} onPress={handleEditHandicap}>
                  <Ionicons name="golf-outline" size={22} color="#0D5C3A" /><Text style={styles.actionItemText}>Edit Handicap</Text>
                </TouchableOpacity>
              )}
              {is2v2 && (
                <TouchableOpacity style={styles.actionItem} onPress={() => { setShowMemberActions(false); setShowAssignTeam(true); }}>
                  <Ionicons name="people-outline" size={22} color="#0D5C3A" /><Text style={styles.actionItemText}>{selectedMember.teamId ? "Change Team" : "Assign to Team"}</Text>
                </TouchableOpacity>
              )}
              {selectedMember.role === "member" && (
                <TouchableOpacity style={styles.actionItem} onPress={() => { Alert.alert("Coming Soon", "Manager promotion will be available in Phase 3."); }}>
                  <Ionicons name="shield-outline" size={22} color="#0D5C3A" /><Text style={styles.actionItemText}>Promote to Manager</Text>
                </TouchableOpacity>
              )}
              {selectedMember.role !== "commissioner" && (
                <TouchableOpacity style={[styles.actionItem, styles.actionItemDanger]} onPress={handleRemoveMember}>
                  <Ionicons name="person-remove-outline" size={22} color="#FF6B6B" /><Text style={[styles.actionItemText, styles.actionItemTextDanger]}>Remove from League</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.actionCancelButton} onPress={() => setShowMemberActions(false)}><Text style={styles.actionCancelText}>Cancel</Text></TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderAssignTeamModal = () => (
    <Modal visible={showAssignTeam} animationType="slide" transparent onRequestClose={() => setShowAssignTeam(false)}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAssignTeam(false)}>
        <View style={styles.actionSheet}>
          <View style={styles.actionSheetHeader}><Text style={styles.actionSheetTitle}>Assign to Team</Text></View>
          {selectedMember?.teamId && (
            <TouchableOpacity style={styles.actionItem} onPress={() => handleAssignToTeam(null)}>
              <Ionicons name="close-circle-outline" size={22} color="#FF6B6B" /><Text style={[styles.actionItemText, { color: "#FF6B6B" }]}>Remove from Team</Text>
            </TouchableOpacity>
          )}
          {teams.map((team) => {
            const isCurrentTeam = selectedMember?.teamId === team.id;
            return (
              <TouchableOpacity key={team.id} style={[styles.actionItem, isCurrentTeam && styles.actionItemSelected]} onPress={() => handleAssignToTeam(team.id)} disabled={isCurrentTeam}>
                {team.avatar ? (
                  <Image source={{ uri: team.avatar }} style={styles.actionItemAvatar} />
                ) : (
                  <View style={[styles.actionItemAvatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitialSmall}>{team.name?.[0]?.toUpperCase() || "?"}</Text>
                  </View>
                )}
                <Text style={styles.actionItemText}>{team.name}</Text>
                {isCurrentTeam && <Ionicons name="checkmark-circle" size={22} color="#0D5C3A" />}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.actionCancelButton} onPress={() => setShowAssignTeam(false)}><Text style={styles.actionCancelText}>Cancel</Text></TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderCreateTeamModal = () => (
    <Modal visible={showCreateTeam} animationType="slide" transparent onRequestClose={() => setShowCreateTeam(false)}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.modalContent}>
          <Text style={styles.modalEmoji}>🏌️</Text>
          <Text style={styles.modalTitle}>Create Team</Text>
          <TextInput style={styles.textEditInput} value={teamNameInput} onChangeText={setTeamNameInput} placeholder="Team name" placeholderTextColor="#999" autoFocus maxLength={30} />
          <View style={styles.modalButtonRow}>
            <TouchableOpacity style={styles.modalCancelButtonSmall} onPress={() => { setShowCreateTeam(false); setTeamNameInput(""); }}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveButton} onPress={handleCreateTeam} disabled={saving || !teamNameInput.trim()}>
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.modalSaveText}>Create</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderTeamActionsModal = () => (
    <Modal visible={showTeamActions} animationType="slide" transparent onRequestClose={() => setShowTeamActions(false)}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTeamActions(false)}>
        <View style={styles.actionSheet}>
          {selectedTeam && (
            <>
              <View style={styles.actionSheetHeader}>
                {selectedTeam.avatar ? (
                  <Image source={{ uri: selectedTeam.avatar }} style={styles.actionSheetAvatar} />
                ) : (
                  <View style={[styles.actionSheetAvatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitialLarge}>{selectedTeam.name?.[0]?.toUpperCase() || "?"}</Text>
                  </View>
                )}
                <Text style={styles.actionSheetName}>{selectedTeam.name}</Text>
              </View>
              <TouchableOpacity style={styles.actionItem} onPress={handleEditTeamName}>
                <Ionicons name="create-outline" size={22} color="#0D5C3A" /><Text style={styles.actionItemText}>Edit Name {selectedTeam.nameChangeUsed ? "(Locked)" : ""}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionItem} onPress={handleUploadTeamAvatar} disabled={uploadingAvatar}>
                <Ionicons name="image-outline" size={22} color="#0D5C3A" /><Text style={styles.actionItemText}>{uploadingAvatar ? "Uploading..." : "Change Avatar"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionItem} onPress={() => { setShowTeamActions(false); setShowAddMemberToTeam(true); }}>
                <Ionicons name="person-add-outline" size={22} color="#0D5C3A" /><Text style={styles.actionItemText}>Add Members</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionItem, styles.actionItemDanger]} onPress={handleDeleteTeam}>
                <Ionicons name="trash-outline" size={22} color="#FF6B6B" /><Text style={[styles.actionItemText, styles.actionItemTextDanger]}>Delete Team</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCancelButton} onPress={() => setShowTeamActions(false)}><Text style={styles.actionCancelText}>Cancel</Text></TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderAddMemberToTeamModal = () => {
    const unassignedMembers = getUnassignedMembers();
    return (
      <Modal visible={showAddMemberToTeam} animationType="slide" transparent onRequestClose={() => setShowAddMemberToTeam(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAddMemberToTeam(false)}>
          <View style={styles.actionSheet}>
            <View style={styles.actionSheetHeader}><Text style={styles.actionSheetTitle}>Add to {selectedTeam?.name}</Text></View>
            {unassignedMembers.length === 0 ? (
              <View style={styles.emptyActionSheet}><Ionicons name="people-outline" size={40} color="#CCC" /><Text style={styles.emptyActionText}>All members are assigned</Text></View>
            ) : (
              unassignedMembers.map((member) => (
                <TouchableOpacity key={member.id} style={styles.actionItem} onPress={async () => {
                  if (!selectedTeam) return;
                  try {
                    const batch = writeBatch(db);
                    const teamRef = doc(db, "leagues", leagueId, "teams", selectedTeam.id);
                    const updatedMemberIds = [...selectedTeam.memberIds, member.id];
                    batch.update(teamRef, { memberIds: updatedMemberIds });
                    const memberRef = doc(db, "leagues", leagueId, "members", member.id);
                    batch.update(memberRef, { teamId: selectedTeam.id });
                    await batch.commit();
                    soundPlayer.play("click");
                  } catch (error) { console.error("Error adding member:", error); Alert.alert("Error", "Failed to add member."); }
                }}>
                  {member.avatar ? (
                    <Image source={{ uri: member.avatar }} style={styles.actionItemAvatar} />
                  ) : (
                    <View style={[styles.actionItemAvatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitialSmall}>{member.displayName?.[0]?.toUpperCase() || "?"}</Text>
                    </View>
                  )}
                  <Text style={styles.actionItemText}>{member.displayName}</Text>
                  <Ionicons name="add-circle-outline" size={22} color="#0D5C3A" />
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity style={styles.actionCancelButton} onPress={() => setShowAddMemberToTeam(false)}><Text style={styles.actionCancelText}>Done</Text></TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  const renderEditTeamNameModal = () => (
    <Modal visible={showEditTeamName} animationType="slide" transparent onRequestClose={() => setShowEditTeamName(false)}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Edit Team Name</Text>
          <Text style={styles.modalSubtitle}>This is the one free name change</Text>
          <TextInput style={styles.textEditInput} value={teamNameInput} onChangeText={setTeamNameInput} placeholder="Team name" placeholderTextColor="#999" autoFocus maxLength={30} />
          <View style={styles.modalButtonRow}>
            <TouchableOpacity style={styles.modalCancelButtonSmall} onPress={() => { setShowEditTeamName(false); setSelectedTeam(null); setTeamNameInput(""); }}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveButton} onPress={handleSaveTeamName} disabled={saving || !teamNameInput.trim()}>
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.modalSaveText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderTeamEditRequestActionsModal = () => (
    <Modal visible={showTeamEditRequestActions} animationType="slide" transparent onRequestClose={() => setShowTeamEditRequestActions(false)}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTeamEditRequestActions(false)}>
        <View style={styles.actionSheet}>
          {selectedEditRequest && (
            <>
              <View style={styles.actionSheetHeader}>
                <Text style={styles.actionSheetTitle}>{selectedEditRequest.type === "name" ? "Name Change Request" : "Avatar Change Request"}</Text>
                <Text style={styles.actionSheetSubtitle}>From {selectedEditRequest.requestedByName}</Text>
              </View>
              <View style={styles.requestDetailBox}>
                <Text style={styles.requestDetailLabel}>Team</Text>
                <Text style={styles.requestDetailValue}>{selectedEditRequest.teamName}</Text>
                {selectedEditRequest.type === "name" && (
                  <>
                    <Text style={styles.requestDetailLabel}>Current Name</Text>
                    <Text style={styles.requestDetailValue}>{selectedEditRequest.currentValue}</Text>
                    <Text style={styles.requestDetailLabel}>Requested Name</Text>
                    <Text style={[styles.requestDetailValue, styles.requestNewValue]}>{selectedEditRequest.newValue}</Text>
                  </>
                )}
                {selectedEditRequest.type === "avatar" && selectedEditRequest.newValue && (
                  <>
                    <Text style={styles.requestDetailLabel}>New Avatar</Text>
                    <Image source={{ uri: selectedEditRequest.newValue }} style={styles.requestAvatarPreview} />
                  </>
                )}
              </View>
              <TouchableOpacity style={[styles.actionItem, { backgroundColor: "rgba(13, 92, 58, 0.1)" }]} onPress={() => handleApproveEditRequest(selectedEditRequest)}>
                <Ionicons name="checkmark-circle" size={22} color="#0D5C3A" /><Text style={[styles.actionItemText, { color: "#0D5C3A" }]}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionItem, styles.actionItemDanger]} onPress={() => { Alert.prompt("Reject Request", "Enter a reason (optional):", [{ text: "Cancel", style: "cancel" }, { text: "Reject", style: "destructive", onPress: (reason: string | undefined) => handleRejectEditRequest(selectedEditRequest, reason) }], "plain-text"); }}>
                <Ionicons name="close-circle" size={22} color="#FF6B6B" /><Text style={[styles.actionItemText, styles.actionItemTextDanger]}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionCancelButton} onPress={() => setShowTeamEditRequestActions(false)}><Text style={styles.actionCancelText}>Cancel</Text></TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderRequestTeamEditModal = () => (
    <Modal visible={showRequestTeamEdit} animationType="slide" transparent onRequestClose={() => setShowRequestTeamEdit(false)}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{requestEditType === "name" ? "Request Name Change" : "Request Avatar Change"}</Text>
          <Text style={styles.modalSubtitle}>{selectedTeam?.name}</Text>
          {requestEditType === "name" ? (
            <TextInput style={styles.textEditInput} value={requestNewValue} onChangeText={setRequestNewValue} placeholder="New team name" placeholderTextColor="#999" autoFocus maxLength={30} />
          ) : (
            <>
              <Text style={styles.inputLabel}>Paste image URL:</Text>
              <TextInput style={styles.textEditInput} value={requestNewValue} onChangeText={setRequestNewValue} placeholder="https://..." placeholderTextColor="#999" autoCapitalize="none" autoCorrect={false} />
            </>
          )}
          <View style={styles.modalButtonRow}>
            <TouchableOpacity style={styles.modalCancelButtonSmall} onPress={() => { setShowRequestTeamEdit(false); setSelectedTeam(null); setRequestNewValue(""); }}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveButton} onPress={handleSubmitTeamEditRequest} disabled={saving || !requestNewValue.trim()}>
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.modalSaveText}>Submit</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderHandicapEditModal = () => (
    <Modal visible={showHandicapEdit} animationType="slide" transparent onRequestClose={() => setShowHandicapEdit(false)}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Edit Handicap</Text>
          <Text style={styles.modalSubtitle}>{selectedMember?.displayName}</Text>
          <TextInput style={styles.handicapInput} value={handicapInput} onChangeText={setHandicapInput} keyboardType="decimal-pad" placeholder="Enter handicap" placeholderTextColor="#999" autoFocus />
          <View style={styles.modalButtonRow}>
            <TouchableOpacity style={styles.modalCancelButtonSmall} onPress={() => { setShowHandicapEdit(false); setSelectedMember(null); }}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveButton} onPress={handleSaveHandicap} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.modalSaveText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderTextEditModal = () => (
    <Modal visible={editingField === "name" || editingField === "description" || editingField === "totalWeeks"} animationType="slide" transparent onRequestClose={() => setEditingField(null)}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Edit {editingField === "name" ? "League Name" : editingField === "totalWeeks" ? "Total Weeks" : "Description"}</Text>
          <TextInput style={[styles.textEditInput, editingField === "description" && styles.textEditInputMultiline]} value={tempValue} onChangeText={setTempValue} multiline={editingField === "description"} numberOfLines={editingField === "description" ? 4 : 1} keyboardType={editingField === "totalWeeks" ? "number-pad" : "default"} placeholder={editingField === "description" ? "Enter description..." : ""} placeholderTextColor="#999" autoFocus />
          <View style={styles.modalButtonRow}>
            <TouchableOpacity style={styles.modalCancelButtonSmall} onPress={() => { setEditingField(null); setTempValue(null); }}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveButton} onPress={() => { if (editingField === "totalWeeks") { const weeks = parseInt(tempValue); if (isNaN(weeks) || weeks < 1 || weeks > 52) { Alert.alert("Invalid", "Please enter a number between 1 and 52."); return; } handleSaveSetting("totalWeeks", weeks); } else { handleSaveSetting(editingField!, tempValue); } }} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.modalSaveText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderDatePicker = () => {
    if (!showDatePicker || !tempValue) return null;
    if (Platform.OS === "ios") {
      return (
        <Modal visible={showDatePicker} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerHeader}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}><Text style={styles.datePickerCancel}>Cancel</Text></TouchableOpacity>
                <Text style={styles.datePickerTitle}>Select Date</Text>
                <TouchableOpacity onPress={() => { handleSaveSetting("startDate", tempValue); setShowDatePicker(false); }}><Text style={styles.datePickerDone}>Done</Text></TouchableOpacity>
              </View>
              <DateTimePicker value={tempValue} mode="date" display="spinner" onChange={(e, date) => date && setTempValue(date)} minimumDate={new Date()} />
            </View>
          </View>
        </Modal>
      );
    }
    return <DateTimePicker value={tempValue} mode="date" display="default" onChange={(e, date) => { setShowDatePicker(false); if (date) { handleSaveSetting("startDate", date); } }} minimumDate={new Date()} />;
  };

  const renderDelayPicker = () => {
    if (!showDelayPicker || !tempValue) return null;
    if (Platform.OS === "ios") {
      return (
        <Modal visible={showDelayPicker} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerHeader}>
                <TouchableOpacity onPress={() => setShowDelayPicker(false)}><Text style={styles.datePickerCancel}>Cancel</Text></TouchableOpacity>
                <Text style={styles.datePickerTitle}>Delay Start To</Text>
                <TouchableOpacity onPress={() => handleDelayStart(tempValue)}><Text style={styles.datePickerDone}>Confirm</Text></TouchableOpacity>
              </View>
              <DateTimePicker value={tempValue} mode="date" display="spinner" onChange={(e, date) => date && setTempValue(date)} minimumDate={new Date()} />
            </View>
          </View>
        </Modal>
      );
    }
    return <DateTimePicker value={tempValue} mode="date" display="default" onChange={(e, date) => { setShowDelayPicker(false); if (date) { handleDelayStart(date); } }} minimumDate={new Date()} />;
  };

  /* ================================================================ */
  /* MAIN RENDER                                                      */
  /* ================================================================ */

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {renderHeader()}
      {renderTabs()}
      {activeTab === "members" && renderMembersTab()}
      {activeTab === "teams" && renderTeamsTab()}
      {activeTab === "scores" && league && <ScoresTab leagueId={league.id} totalWeeks={league.totalWeeks} currentWeek={league.currentWeek} format={league.format} />}
      {activeTab === "settings" && renderSettingsTab()}
      {renderConfirmSetupModal()}
      {renderMemberActionsModal()}
      {renderAssignTeamModal()}
      {renderHandicapEditModal()}
      {renderTextEditModal()}
      {renderDatePicker()}
      {renderDelayPicker()}
      {renderCreateTeamModal()}
      {renderTeamActionsModal()}
      {renderAddMemberToTeamModal()}
      {renderEditTeamNameModal()}
      {renderTeamEditRequestActionsModal()}
      {renderRequestTeamEditModal()}
    </SafeAreaView>
  );
}

/* ================================================================ */
/* SETTING ROW COMPONENT                                            */
/* ================================================================ */

interface SettingRowProps {
  label: string;
  value: string;
  editable: boolean;
  multiline?: boolean;
  onEdit?: () => void;
}

const SettingRow = ({ label, value, editable, multiline, onEdit }: SettingRowProps) => (
  <TouchableOpacity style={[styles.settingRow, !editable && styles.settingRowDisabled]} onPress={editable ? onEdit : undefined} disabled={!editable} activeOpacity={editable ? 0.7 : 1}>
    <View style={styles.settingRowContent}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={[styles.settingValue, multiline && styles.settingValueMultiline]} numberOfLines={multiline ? 3 : 1}>{value}</Text>
    </View>
    {editable && <Ionicons name="chevron-forward" size={20} color="#CCC" />}
  </TouchableOpacity>
);

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 16, color: "#666" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.1)", backgroundColor: "#F4EED8" },
  backButton: { width: 40, height: 40, justifyContent: "center", alignItems: "center", marginLeft: -8 },
  headerCenter: { flex: 1, marginLeft: 4 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#0D5C3A" },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  statusBadge: { backgroundColor: "rgba(13, 92, 58, 0.1)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusActive: { backgroundColor: "rgba(13, 92, 58, 0.2)" },
  statusCompleted: { backgroundColor: "rgba(0, 0, 0, 0.1)" },
  statusText: { fontSize: 12, fontWeight: "600", color: "#0D5C3A" },
  confirmButton: { backgroundColor: "#0D5C3A", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  confirmButtonText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  readyBadge: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  tabBar: { flexDirection: "row", backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.1)" },
  tab: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", paddingVertical: 14, gap: 6 },
  tabActive: { borderBottomWidth: 3, borderBottomColor: "#0D5C3A" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#999" },
  tabTextActive: { color: "#0D5C3A" },
  tabBadge: { backgroundColor: "#FF6B6B", minWidth: 18, height: 18, borderRadius: 9, justifyContent: "center", alignItems: "center", paddingHorizontal: 5 },
  tabBadgeText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  tabContent: { flex: 1 },
  section: { marginTop: 20, marginHorizontal: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#0D5C3A" },
  sectionBadge: { backgroundColor: "#FF6B6B", minWidth: 24, height: 24, borderRadius: 12, justifyContent: "center", alignItems: "center", marginLeft: 8 },
  sectionBadgeText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  sectionNote: { fontSize: 13, color: "#999", marginTop: -8, marginBottom: 12 },
  addButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(13, 92, 58, 0.1)", borderRadius: 16 },
  addButtonText: { fontSize: 14, fontWeight: "700", color: "#0D5C3A" },
  requestCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", padding: 12, borderRadius: 12, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#E5E5E5" },
  avatarFallback: { backgroundColor: "#0D5C3A", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 20, fontWeight: "700", color: "#FFF" },
  avatarInitialSmall: { fontSize: 14, fontWeight: "700", color: "#FFF" },
  avatarInitialLarge: { fontSize: 28, fontWeight: "700", color: "#FFF" },
  requestInfo: { flex: 1, marginLeft: 12 },
  requestName: { fontSize: 16, fontWeight: "700", color: "#333" },
  requestMeta: { fontSize: 13, color: "#666", marginTop: 2 },
  requestDetail: { fontSize: 12, color: "#0D5C3A", marginTop: 4, fontStyle: "italic" },
  requestActions: { flexDirection: "row", gap: 8 },
  approveButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#0D5C3A", justifyContent: "center", alignItems: "center" },
  rejectButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FF6B6B", justifyContent: "center", alignItems: "center" },
  memberCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", padding: 12, borderRadius: 12, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  memberName: { fontSize: 16, fontWeight: "700", color: "#333" },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  roleBadgeText: { fontSize: 11, fontWeight: "700", color: "#FFF" },
  memberMeta: { fontSize: 13, color: "#666", marginTop: 2 },
  teamCard: { backgroundColor: "#FFF", borderRadius: 12, marginBottom: 8, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1, overflow: "hidden" },
  teamHeader: { flexDirection: "row", alignItems: "center", padding: 12 },
  teamAvatar: { width: 48, height: 48, borderRadius: 12, backgroundColor: "#E5E5E5" },
  teamInfo: { flex: 1, marginLeft: 12 },
  teamNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  teamName: { fontSize: 16, fontWeight: "700", color: "#333" },
  myTeamBadge: { backgroundColor: "#0D5C3A", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  myTeamBadgeText: { fontSize: 10, fontWeight: "700", color: "#FFF" },
  freeChangeBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(13, 92, 58, 0.1)", justifyContent: "center", alignItems: "center" },
  teamMeta: { fontSize: 13, color: "#666", marginTop: 2 },
  expandButton: { width: 36, height: 36, justifyContent: "center", alignItems: "center" },
  teamRoster: { borderTopWidth: 1, borderTopColor: "#F0F0F0", paddingHorizontal: 12, paddingVertical: 8 },
  noMembersText: { fontSize: 14, color: "#999", textAlign: "center", paddingVertical: 12 },
  rosterMember: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  rosterAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#E5E5E5" },
  rosterName: { flex: 1, fontSize: 14, fontWeight: "600", color: "#333", marginLeft: 10 },
  rosterRemove: { padding: 4 },
  teamMemberActions: { borderTopWidth: 1, borderTopColor: "#F0F0F0", paddingTop: 12, marginTop: 8, gap: 8 },
  requestEditButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: "rgba(13, 92, 58, 0.08)", borderRadius: 8 },
  requestEditText: { fontSize: 14, fontWeight: "600", color: "#0D5C3A" },
  unassignedCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", padding: 12, borderRadius: 12, marginBottom: 8 },
  unassignedName: { flex: 1, fontSize: 15, fontWeight: "600", color: "#333", marginLeft: 12 },
  assignButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(13, 92, 58, 0.1)", borderRadius: 12 },
  assignButtonText: { fontSize: 13, fontWeight: "600", color: "#0D5C3A" },
  emptyState: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: 16, color: "#999", marginTop: 12 },
  emptyButton: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: "#0D5C3A", borderRadius: 20 },
  emptyButtonText: { fontSize: 14, fontWeight: "700", color: "#FFF" },
  emptyActionSheet: { alignItems: "center", paddingVertical: 32 },
  emptyActionText: { fontSize: 14, color: "#999", marginTop: 8 },
  settingRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", padding: 14, borderRadius: 12, marginBottom: 8 },
  settingRowDisabled: { opacity: 0.6 },
  settingRowContent: { flex: 1 },
  settingLabel: { fontSize: 13, color: "#666", marginBottom: 2 },
  settingValue: { fontSize: 16, fontWeight: "600", color: "#333" },
  settingValueMultiline: { fontSize: 14, lineHeight: 20 },
  dangerSection: { marginTop: 32, paddingTop: 20, borderTopWidth: 1, borderTopColor: "rgba(255, 107, 107, 0.3)" },
  dangerTitle: { color: "#FF6B6B" },
  dangerButton: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFF", padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: "rgba(255, 107, 107, 0.3)" },
  dangerButtonText: { fontSize: 16, fontWeight: "600", color: "#FF6B6B" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)", justifyContent: "center", alignItems: "center" },
  modalContent: { backgroundColor: "#FFF", borderRadius: 20, padding: 24, width: "85%", maxWidth: 340, alignItems: "center" },
  modalEmoji: { fontSize: 48, marginBottom: 12 },
  modalTitle: { fontSize: 24, fontWeight: "800", color: "#0D5C3A", marginBottom: 8, textAlign: "center" },
  modalSubtitle: { fontSize: 16, color: "#666", textAlign: "center", lineHeight: 24 },
  modalDate: { fontWeight: "700", color: "#333" },
  modalStats: { flexDirection: "row", alignItems: "center", marginVertical: 24, paddingHorizontal: 16 },
  modalStat: { alignItems: "center", flex: 1 },
  modalStatValue: { fontSize: 28, fontWeight: "800", color: "#0D5C3A" },
  modalStatLabel: { fontSize: 13, color: "#666", marginTop: 2 },
  modalStatDivider: { width: 1, height: 40, backgroundColor: "#E5E5E5" },
  modalPrimaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#0D5C3A", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: "100%", marginBottom: 12 },
  modalPrimaryText: { fontSize: 17, fontWeight: "700", color: "#FFF" },
  modalSecondaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(13, 92, 58, 0.1)", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: "100%", marginBottom: 12 },
  modalSecondaryText: { fontSize: 17, fontWeight: "700", color: "#0D5C3A" },
  modalCancelButton: { paddingVertical: 12 },
  modalCancelText: { fontSize: 16, color: "#999", fontWeight: "600" },
  modalButtonRow: { flexDirection: "row", gap: 12, marginTop: 20, width: "100%" },
  modalCancelButtonSmall: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#F0F0F0", alignItems: "center" },
  modalSaveButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#0D5C3A", alignItems: "center" },
  modalSaveText: { fontSize: 16, fontWeight: "700", color: "#FFF" },
  actionSheet: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, maxHeight: "70%" },
  actionSheetHeader: { alignItems: "center", paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: "#E5E5E5" },
  actionSheetAvatar: { width: 64, height: 64, borderRadius: 32, marginBottom: 8 },
  actionSheetName: { fontSize: 18, fontWeight: "700", color: "#333" },
  actionSheetTitle: { fontSize: 18, fontWeight: "700", color: "#333" },
  actionSheetSubtitle: { fontSize: 14, color: "#666", marginTop: 4 },
  actionItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  actionItemSelected: { backgroundColor: "rgba(13, 92, 58, 0.05)" },
  actionItemDanger: { borderBottomWidth: 0 },
  actionItemText: { flex: 1, fontSize: 17, fontWeight: "600", color: "#333" },
  actionItemTextDanger: { color: "#FF6B6B" },
  actionItemAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#E5E5E5" },
  actionCancelButton: { alignItems: "center", paddingVertical: 16, marginTop: 8, marginHorizontal: 20, borderRadius: 12, backgroundColor: "#F0F0F0" },
  actionCancelText: { fontSize: 17, fontWeight: "700", color: "#666" },
  requestDetailBox: { backgroundColor: "#F8F8F8", borderRadius: 12, padding: 16, marginHorizontal: 20, marginVertical: 12 },
  requestDetailLabel: { fontSize: 12, fontWeight: "600", color: "#666", marginTop: 8 },
  requestDetailValue: { fontSize: 16, fontWeight: "600", color: "#333", marginTop: 2 },
  requestNewValue: { color: "#0D5C3A" },
  requestAvatarPreview: { width: 80, height: 80, borderRadius: 12, marginTop: 8 },
  handicapInput: { width: "100%", fontSize: 24, fontWeight: "700", color: "#333", textAlign: "center", paddingVertical: 16, borderWidth: 2, borderColor: "#E5E5E5", borderRadius: 12, marginTop: 16 },
  textEditInput: { width: "100%", fontSize: 18, fontWeight: "600", color: "#333", paddingVertical: 14, paddingHorizontal: 16, borderWidth: 2, borderColor: "#E5E5E5", borderRadius: 12, marginTop: 16 },
  textEditInputMultiline: { height: 120, textAlignVertical: "top" },
  inputLabel: { alignSelf: "flex-start", fontSize: 14, fontWeight: "600", color: "#666", marginTop: 16 },
  datePickerContainer: { backgroundColor: "#FFF", borderRadius: 20, overflow: "hidden", width: "90%", maxWidth: 400 },
  datePickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#E5E5E5" },
  datePickerTitle: { fontSize: 17, fontWeight: "700", color: "#333" },
  datePickerCancel: { fontSize: 16, color: "#999", fontWeight: "600" },
  datePickerDone: { fontSize: 16, color: "#0D5C3A", fontWeight: "700" },
});