/**
 * League Settings Page
 * 
 * Commissioner/Manager dashboard for league management.
 * Uses modular tab components from @/components/leagues/settings.
 * 
 * ============================================================
 * NOTIFICATION ARCHITECTURE
 * ============================================================
 * All league notifications are handled server-side via Cloud Functions.
 * ============================================================
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
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  formatDate,
  JoinRequest,
  League,
  Member,
  MembersTab,
  RulesTab,
  ScoresTab,
  SettingsTab,
  TabType,
  Team,
  TeamEditRequest,
  TeamsTab,
} from "@/components/leagues/settings";
import { auth, db, storage } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";

export default function LeagueSettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const leagueId = (params.leagueId || params.id) as string;
  const initialTab = params.tab as TabType | undefined;
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || "members");

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamEditRequests, setTeamEditRequests] = useState<TeamEditRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isCommissioner, setIsCommissioner] = useState(false);

  const [showConfirmSetup, setShowConfirmSetup] = useState(false);
  const [showDelayPicker, setShowDelayPicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date | null>(null);

  const currentUserId = auth.currentUser?.uid;

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
      snap.forEach((d) => {
        memberList.push({ id: d.id, odcuserId: d.id, ...d.data() } as Member);
      });
      setMembers(memberList);
    });

    const teamsRef = collection(db, "leagues", leagueId, "teams");
    const teamsQuery = query(teamsRef, orderBy("createdAt", "asc"));
    const unsubTeams = onSnapshot(teamsQuery, (snap) => {
      const teamList: Team[] = [];
      snap.forEach((d) => {
        teamList.push({ id: d.id, ...d.data() } as Team);
      });
      setTeams(teamList);
    });

    const editRequestsRef = collection(db, "leagues", leagueId, "team_edit_requests");
    const editRequestsQuery = query(editRequestsRef, where("status", "==", "pending"), orderBy("createdAt", "asc"));
    const unsubEditRequests = onSnapshot(editRequestsQuery, (snap) => {
      const requests: TeamEditRequest[] = [];
      snap.forEach((d) => {
        requests.push({ id: d.id, ...d.data() } as TeamEditRequest);
      });
      setTeamEditRequests(requests);
    });

    const requestsRef = collection(db, "league_join_requests");
    const requestsQuery = query(requestsRef, where("leagueId", "==", leagueId), where("status", "==", "pending"), orderBy("createdAt", "asc"));
    const unsubRequests = onSnapshot(requestsQuery, (snap) => {
      const requests: JoinRequest[] = [];
      snap.forEach((d) => {
        requests.push({ id: d.id, ...d.data() } as JoinRequest);
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

  // JOIN REQUEST HANDLERS
  const handleApproveRequest = async (request: JoinRequest) => {
    if (!league || !currentUserId) return;
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
        status: "active",
        swingThoughtsHandicap: request.handicap || null,
        leagueHandicap: null,
        teamId: null,
        totalPoints: 0,
        roundsPlayed: 0,
        wins: 0,
        joinedAt: serverTimestamp(),
      });
      
      const requestRef = doc(db, "league_join_requests", request.id);
      batch.update(requestRef, { status: "approved", reviewedAt: serverTimestamp(), reviewedBy: currentUserId });
      
      const leagueRefDoc = doc(db, "leagues", leagueId);
      batch.update(leagueRefDoc, { memberCount: (league.memberCount || 0) + 1 });
      
      await batch.commit();
      Alert.alert("Approved! ⛳", `${request.displayName} has been added to the league.`);
    } catch (error) {
      console.error("Error approving request:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to approve request.");
    }
  };

  const handleRejectRequest = (request: JoinRequest) => {
    if (!league || !currentUserId) return;
    Alert.alert("Reject Request", `Are you sure you want to reject ${request.displayName}'s request?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: async () => {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const requestRef = doc(db, "league_join_requests", request.id);
            await updateDoc(requestRef, { status: "rejected", reviewedAt: serverTimestamp(), reviewedBy: currentUserId });
          } catch (error) {
            console.error("Error rejecting request:", error);
            Alert.alert("Error", "Failed to reject request.");
          }
        },
      },
    ]);
  };

  // MEMBER HANDLERS
  const handleRemoveMember = (member: Member) => {
    if (!league || !currentUserId) return;
    if (member.role === "commissioner") {
      Alert.alert("Cannot Remove", "The commissioner cannot be removed from the league.");
      return;
    }
    Alert.alert("Remove Member", `Are you sure you want to remove ${member.displayName} from the league?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const batch = writeBatch(db);
            
            if (member.teamId) {
              const teamRef = doc(db, "leagues", leagueId, "teams", member.teamId);
              const teamDoc = await getDoc(teamRef);
              if (teamDoc.exists()) {
                const teamData = teamDoc.data();
                batch.update(teamRef, { memberIds: (teamData.memberIds || []).filter((id: string) => id !== member.id) });
              }
            }
            
            batch.delete(doc(db, "leagues", leagueId, "members", member.id));
            batch.update(doc(db, "leagues", leagueId), { memberCount: Math.max(0, (league.memberCount || 1) - 1) });
            
            await batch.commit();
          } catch (error) {
            console.error("Error removing member:", error);
            Alert.alert("Error", "Failed to remove member.");
          }
        },
      },
    ]);
  };

  const handleEditHandicap = async (member: Member, newHandicap: number) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await updateDoc(doc(db, "leagues", leagueId, "members", member.id), { leagueHandicap: newHandicap });
      soundPlayer.play("postThought");
    } catch (error) {
      console.error("Error updating handicap:", error);
      Alert.alert("Error", "Failed to update handicap.");
    }
  };

  const handleAssignToTeam = async (member: Member, teamId: string | null) => {
    if (!league || !currentUserId) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const batch = writeBatch(db);
      
      if (member.teamId) {
        const oldTeamDoc = await getDoc(doc(db, "leagues", leagueId, "teams", member.teamId));
        if (oldTeamDoc.exists()) {
          batch.update(doc(db, "leagues", leagueId, "teams", member.teamId), { 
            memberIds: (oldTeamDoc.data().memberIds || []).filter((id: string) => id !== member.id) 
          });
        }
      }
      
      if (teamId) {
        const newTeamDoc = await getDoc(doc(db, "leagues", leagueId, "teams", teamId));
        if (newTeamDoc.exists()) {
          batch.update(doc(db, "leagues", leagueId, "teams", teamId), { 
            memberIds: [...(newTeamDoc.data().memberIds || []), member.id] 
          });
        }
      }
      
      batch.update(doc(db, "leagues", leagueId, "members", member.id), { teamId: teamId || null });
      await batch.commit();
      soundPlayer.play("click");
    } catch (error) {
      console.error("Error assigning to team:", error);
      Alert.alert("Error", "Failed to assign to team.");
    }
  };

  const handlePromoteToManager = async (member: Member) => {
    if (!league) return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const batch = writeBatch(db);
      batch.update(doc(db, "leagues", leagueId, "members", member.id), { role: "manager" });
      
      const currentManagerIds = league.managerIds || [];
      if (!currentManagerIds.includes(member.id)) {
        batch.update(doc(db, "leagues", leagueId), { 
          managerIds: [...currentManagerIds, member.id],
          updatedAt: serverTimestamp(),
        });
      }
      
      await batch.commit();
      soundPlayer.play("postThought");
      Alert.alert("Promoted! 🛡️", `${member.displayName} is now a manager.`);
    } catch (error) {
      console.error("Error promoting member:", error);
      Alert.alert("Error", "Failed to promote member.");
    }
  };

  const handleDemoteManager = async (member: Member) => {
    if (!league) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const batch = writeBatch(db);
      batch.update(doc(db, "leagues", leagueId, "members", member.id), { role: "member" });
      batch.update(doc(db, "leagues", leagueId), { 
        managerIds: (league.managerIds || []).filter(id => id !== member.id),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      soundPlayer.play("click");
    } catch (error) {
      console.error("Error demoting manager:", error);
      Alert.alert("Error", "Failed to remove manager role.");
    }
  };

  // TEAM HANDLERS
  const handleCreateTeam = async (name: string) => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await addDoc(collection(db, "leagues", leagueId, "teams"), {
        name, nameLower: name.toLowerCase(), avatar: null, nameChangeUsed: false,
        memberIds: [], captainId: null, wins: 0, losses: 0, totalPoints: 0, createdAt: serverTimestamp(),
      });
      soundPlayer.play("postThought");
      Alert.alert("Team Created! 🏌️", `"${name}" is ready for members.`);
    } catch (error) {
      console.error("Error creating team:", error);
      Alert.alert("Error", "Failed to create team.");
    }
  };

  const handleEditTeamName = async (team: Team, newName: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await updateDoc(doc(db, "leagues", leagueId, "teams", team.id), { 
        name: newName, nameLower: newName.toLowerCase(), nameChangeUsed: true 
      });
      soundPlayer.play("postThought");
    } catch (error) {
      console.error("Error updating team name:", error);
      Alert.alert("Error", "Failed to update team name.");
    }
  };

  const handleUploadTeamAvatar = async (team: Team) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const response = await fetch(result.assets[0].uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `leagues/${leagueId}/teams/${team.id}/avatar.jpg`);
      await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "leagues", leagueId, "teams", team.id), { avatar: downloadUrl });
      soundPlayer.play("postThought");
    } catch (error) {
      console.error("Error uploading avatar:", error);
      Alert.alert("Error", "Failed to upload avatar.");
    }
  };

  const handleDeleteTeam = async (team: Team) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const batch = writeBatch(db);
      for (const memberId of team.memberIds) {
        batch.update(doc(db, "leagues", leagueId, "members", memberId), { teamId: null });
      }
      batch.delete(doc(db, "leagues", leagueId, "teams", team.id));
      await batch.commit();
      soundPlayer.play("click");
    } catch (error) {
      console.error("Error deleting team:", error);
      Alert.alert("Error", "Failed to delete team.");
    }
  };

  const handleAddMemberToTeam = async (team: Team, memberId: string) => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "leagues", leagueId, "teams", team.id), { memberIds: [...team.memberIds, memberId] });
      batch.update(doc(db, "leagues", leagueId, "members", memberId), { teamId: team.id });
      await batch.commit();
      soundPlayer.play("click");
    } catch (error) {
      console.error("Error adding member to team:", error);
      Alert.alert("Error", "Failed to add member to team.");
    }
  };

  const handleRemoveMemberFromTeam = async (team: Team, memberId: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const batch = writeBatch(db);
      batch.update(doc(db, "leagues", leagueId, "teams", team.id), { memberIds: team.memberIds.filter((id) => id !== memberId) });
      batch.update(doc(db, "leagues", leagueId, "members", memberId), { teamId: null });
      await batch.commit();
      soundPlayer.play("click");
    } catch (error) {
      console.error("Error removing member from team:", error);
      Alert.alert("Error", "Failed to remove member from team.");
    }
  };

  // TEAM EDIT REQUEST HANDLERS
  const handleSubmitEditRequest = async (team: Team, type: "name" | "avatar", newValue: string) => {
    if (!league || !currentUserId) return;
    const currentUser = members.find((m) => m.id === currentUserId);
    if (!currentUser) { Alert.alert("Error", "You must be a member to submit requests."); return; }
    
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await addDoc(collection(db, "leagues", leagueId, "team_edit_requests"), {
        teamId: team.id, teamName: team.name, requestedBy: currentUserId,
        requestedByName: currentUser.displayName, requestedByAvatar: currentUser.avatar || null,
        type, currentValue: type === "name" ? team.name : (team.avatar || ""), newValue,
        status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      soundPlayer.play("postThought");
      Alert.alert("Request Submitted! 📝", "The commissioner will review your request.");
    } catch (error) {
      console.error("Error submitting request:", error);
      Alert.alert("Error", "Failed to submit request.");
    }
  };

  const handleApproveEditRequest = async (request: TeamEditRequest) => {
    if (!league || !currentUserId) return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const batch = writeBatch(db);
      batch.update(doc(db, "leagues", leagueId, "team_edit_requests", request.id), { 
        status: "approved", reviewedAt: serverTimestamp(), reviewedBy: currentUserId, updatedAt: serverTimestamp(),
      });
      if (request.type === "name") {
        batch.update(doc(db, "leagues", leagueId, "teams", request.teamId), { 
          name: request.newValue, nameLower: request.newValue.toLowerCase(), nameChangeUsed: true 
        });
      } else {
        batch.update(doc(db, "leagues", leagueId, "teams", request.teamId), { avatar: request.newValue });
      }
      await batch.commit();
      soundPlayer.play("postThought");
    } catch (error) {
      console.error("Error approving request:", error);
      Alert.alert("Error", "Failed to approve request.");
    }
  };

  const handleRejectEditRequest = async (request: TeamEditRequest, reason?: string) => {
    if (!league || !currentUserId) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await updateDoc(doc(db, "leagues", leagueId, "team_edit_requests", request.id), { 
        status: "rejected", rejectionReason: reason || null, reviewedAt: serverTimestamp(), 
        reviewedBy: currentUserId, updatedAt: serverTimestamp(),
      });
      soundPlayer.play("click");
    } catch (error) {
      console.error("Error rejecting request:", error);
      Alert.alert("Error", "Failed to reject request.");
    }
  };

  // RULES HANDLER
  const handleSaveRules = async (rules: string) => {
    if (!league) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await updateDoc(doc(db, "leagues", leagueId), { 
        customRules: rules,
        updatedAt: serverTimestamp(),
      });
      soundPlayer.play("postThought");
    } catch (error) {
      console.error("Error saving rules:", error);
      throw error; // Re-throw so LeagueInfoCard can handle the error
    }
  };

  // SETTINGS HANDLERS
  const handleSaveSetting = async (field: string, value: any) => {
    if (!league) return;
    try {
      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      if (field === "name") {
        await updateDoc(doc(db, "leagues", leagueId), { name: value, nameLower: value.toLowerCase() });
      } else if (field === "startDate") {
        const weeksMs = league.totalWeeks * 7 * 24 * 60 * 60 * 1000;
        const endDate = new Date(value.getTime() + weeksMs);
        await updateDoc(doc(db, "leagues", leagueId), { startDate: Timestamp.fromDate(value), endDate: Timestamp.fromDate(endDate) });
      } else {
        await updateDoc(doc(db, "leagues", leagueId), { [field]: value });
      }
      soundPlayer.play("click");
    } catch (error) {
      console.error("Error saving setting:", error);
      Alert.alert("Error", "Failed to save setting.");
    } finally {
      setSaving(false);
    }
  };

  // AVATAR HANDLER — receives an already-cropped URI from ImageCropModal
  const handleAvatarCropped = async (uri: string) => {
    if (!league) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const response = await fetch(uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `leagues/${leagueId}/avatar.jpg`);
      await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);
      await updateDoc(doc(db, "leagues", leagueId), { avatar: downloadUrl, updatedAt: serverTimestamp() });
      soundPlayer.play("postThought");
    } catch (error) {
      console.error("Error uploading league avatar:", error);
      Alert.alert("Error", "Failed to upload league avatar.");
    }
  };

  const handleArchiveLeague = () => {
    Alert.alert("Archive League", "This will end the season and archive all data. Continue?", [
      { text: "Cancel", style: "cancel" },
      { text: "Archive", style: "destructive", onPress: async () => {
        try { await updateDoc(doc(db, "leagues", leagueId), { status: "completed" }); router.back(); } 
        catch (e) { Alert.alert("Error", "Failed to archive league."); }
      }},
    ]);
  };

  const handleDeleteLeague = () => {
    Alert.alert("Delete League", "This will permanently delete the league. Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete Forever", style: "destructive", onPress: async () => {
        try { await deleteDoc(doc(db, "leagues", leagueId)); router.replace("/leagues"); } 
        catch (e) { Alert.alert("Error", "Failed to delete league."); }
      }},
    ]);
  };

  const handleStartNewSeason = () => {
    Alert.alert("Coming Soon", "New season creation will be available in a future update.");
  };

  // CONFIRM SETUP HANDLERS
  const handleConfirmReady = async () => {
    if (!league) return;
    try {
      setSaving(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      soundPlayer.play("achievement");
      await updateDoc(doc(db, "leagues", leagueId), { readyConfirmed: true });
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
      await updateDoc(doc(db, "leagues", leagueId), { 
        startDate: startTimestamp, 
        endDate: Timestamp.fromDate(new Date(newDate.getTime() + weeksMs)) 
      });
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

  const getDaysUntilStart = (): number => {
    if (!league) return 0;
    return Math.ceil((league.startDate.toMillis() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  // Helper to get tab label
  const getTabLabel = (tab: TabType): string => {
    switch (tab) {
      case "members": return `Members (${members.length})`;
      case "teams": return `Teams (${teams.length})`;
      case "rules": return "Rules";
      case "scores": return "Scores";
      case "settings": return "Settings";
      default: return tab;
    }
  };

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
  const isHost = league.hostUserId === currentUserId;
  const availableTabs: TabType[] = is2v2 
    ? ["members", "teams", "rules", "scores", "settings"] 
    : ["members", "rules", "scores", "settings"];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#0D5C3A" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{league.name}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, league.status === "active" && styles.statusActive]}>
              <Text style={styles.statusText}>
                {league.status === "upcoming" 
                  ? (league.readyConfirmed ? `Ready • ${daysUntilStart}d` : `Starts in ${daysUntilStart}d`) 
                  : league.status === "active" ? `Week ${league.currentWeek} of ${league.totalWeeks}` : "Completed"}
              </Text>
            </View>
          </View>
        </View>
        {showConfirmButton && (
          <TouchableOpacity style={styles.confirmButton} onPress={() => setShowConfirmSetup(true)}>
            <Text style={styles.confirmButtonText}>Confirm Setup</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {availableTabs.map((tab) => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} 
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab(tab); }}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {getTabLabel(tab)}
            </Text>
            {tab === "members" && pendingRequests.length > 0 && (
              <View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{pendingRequests.length}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>
      
      {/* Tab Content */}
      {activeTab === "members" && (
        <MembersTab
          league={league} members={members} teams={teams} pendingRequests={pendingRequests}
          isCommissioner={isCommissioner} isHost={isHost} currentUserId={currentUserId || ""}
          refreshing={refreshing} saving={saving} onRefresh={handleRefresh}
          onApproveRequest={handleApproveRequest} onRejectRequest={handleRejectRequest}
          onRemoveMember={handleRemoveMember} onEditHandicap={handleEditHandicap}
          onAssignToTeam={handleAssignToTeam} onPromoteToManager={handlePromoteToManager}
          onDemoteManager={handleDemoteManager}
        />
      )}
      
      {activeTab === "teams" && (
        <TeamsTab
          league={league} leagueId={leagueId} members={members} teams={teams}
          teamEditRequests={teamEditRequests} isCommissioner={isCommissioner}
          currentUserId={currentUserId} refreshing={refreshing} onRefresh={handleRefresh}
          onCreateTeam={handleCreateTeam} onEditTeamName={handleEditTeamName}
          onUploadTeamAvatar={handleUploadTeamAvatar} onDeleteTeam={handleDeleteTeam}
          onAddMemberToTeam={handleAddMemberToTeam} onRemoveMemberFromTeam={handleRemoveMemberFromTeam}
          onSubmitEditRequest={handleSubmitEditRequest} onApproveEditRequest={handleApproveEditRequest}
          onRejectEditRequest={handleRejectEditRequest}
        />
      )}
      
      {activeTab === "rules" && (
        <RulesTab
          league={league}
          isCommissioner={isCommissioner}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onSaveRules={handleSaveRules}
        />
      )}
      
      {activeTab === "scores" && (
        <ScoresTab leagueId={league.id} totalWeeks={league.totalWeeks} currentWeek={league.currentWeek} format={league.format} />
      )}
      
      {activeTab === "settings" && (
        <SettingsTab
          league={league}
          leagueId={leagueId}
          isCommissioner={isCommissioner}
          isHost={isHost}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onSaveSetting={handleSaveSetting}
          onAvatarCropped={handleAvatarCropped}
          onArchiveLeague={handleArchiveLeague}
          onDeleteLeague={handleDeleteLeague}
          onStartNewSeason={handleStartNewSeason}
        />
      )}
      
      {/* Confirm Setup Modal */}
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
            <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => { setShowConfirmSetup(false); setTempDate(league.startDate.toDate()); setShowDelayPicker(true); }}>
              <Ionicons name="calendar-outline" size={20} color="#0D5C3A" /><Text style={styles.modalSecondaryText}>Delay Start...</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowConfirmSetup(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Delay Picker */}
      {showDelayPicker && tempDate && (Platform.OS === "ios" ? (
        <Modal visible={showDelayPicker} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerHeader}>
                <TouchableOpacity onPress={() => setShowDelayPicker(false)}><Text style={styles.datePickerCancel}>Cancel</Text></TouchableOpacity>
                <Text style={styles.datePickerTitle}>Delay Start To</Text>
                <TouchableOpacity onPress={() => handleDelayStart(tempDate)}><Text style={styles.datePickerDone}>Confirm</Text></TouchableOpacity>
              </View>
              <DateTimePicker value={tempDate} mode="date" display="spinner" onChange={(e, date) => date && setTempDate(date)} minimumDate={new Date()} />
            </View>
          </View>
        </Modal>
      ) : (
        <DateTimePicker value={tempDate} mode="date" display="default" onChange={(e, date) => { setShowDelayPicker(false); if (date) handleDelayStart(date); }} minimumDate={new Date()} />
      ))}
    </SafeAreaView>
  );
}

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
  statusText: { fontSize: 12, fontWeight: "600", color: "#0D5C3A" },
  confirmButton: { backgroundColor: "#0D5C3A", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  confirmButtonText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  tabBar: { flexDirection: "row", backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.1)" },
  tab: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", paddingVertical: 14, gap: 6 },
  tabActive: { borderBottomWidth: 3, borderBottomColor: "#0D5C3A" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#999" },
  tabTextActive: { color: "#0D5C3A" },
  tabBadge: { backgroundColor: "#FF6B6B", minWidth: 18, height: 18, borderRadius: 9, justifyContent: "center", alignItems: "center", paddingHorizontal: 5 },
  tabBadgeText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
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
  datePickerContainer: { backgroundColor: "#FFF", borderRadius: 20, overflow: "hidden", width: "90%", maxWidth: 400 },
  datePickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#E5E5E5" },
  datePickerTitle: { fontSize: 17, fontWeight: "700", color: "#333" },
  datePickerCancel: { fontSize: 16, color: "#999", fontWeight: "600" },
  datePickerDone: { fontSize: 16, color: "#0D5C3A", fontWeight: "700" },
});