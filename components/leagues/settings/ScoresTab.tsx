/**
 * ScoresTab - League Settings
 *
 * Allows commissioners/managers to:
 * - View all scores by week
 * - Filter by status (All, Pending, Approved, DQ'd)
 * - Edit scores with change history
 * - DQ scores with required reason
 * - Approve pending scores
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
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

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface ScoresTabProps {
  leagueId: string;
  totalWeeks: number;
  currentWeek: number;
  format: "stroke" | "2v2";
}

interface Score {
  id: string;
  userId: string;
  displayName: string;
  avatar?: string;
  teamId?: string;
  teamName?: string;
  week: number;
  courseId: number;
  courseName: string;
  holeScores: number[];
  grossScore: number;
  netScore: number;
  handicapUsed: number;
  totalPar: number;
  scoreToPar: number;
  createdAt: any;
  status: "approved" | "pending" | "disqualified";
  dqReason?: string;
  dqBy?: string;
  dqAt?: any;
  editHistory?: EditRecord[];
}

interface EditRecord {
  editedBy: string;
  editedByName: string;
  editedAt: any;
  previousGross: number;
  previousNet: number;
  newGross: number;
  newNet: number;
  reason: string;
}

type StatusFilter = "all" | "approved" | "pending" | "disqualified";

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function ScoresTab({
  leagueId,
  totalWeeks,
  currentWeek,
  format,
}: ScoresTabProps) {
  const currentUserId = auth.currentUser?.uid;

  // Data
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeek);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showWeekPicker, setShowWeekPicker] = useState(false);

  // Modals
  const [selectedScore, setSelectedScore] = useState<Score | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDQModal, setShowDQModal] = useState(false);

  // Edit state
  const [editedHoleScores, setEditedHoleScores] = useState<number[]>([]);
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);

  // DQ state
  const [dqReason, setDqReason] = useState("");
  const [notifyPlayer, setNotifyPlayer] = useState(true);

  /* ================================================================ */
  /* DATA LOADING                                                    */
  /* ================================================================ */

  useEffect(() => {
    loadScores();
  }, [leagueId, selectedWeek]);

  const loadScores = async () => {
    try {
      setLoading(true);

      const scoresQuery = query(
        collection(db, "leagues", leagueId, "scores"),
        where("week", "==", selectedWeek),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(scoresQuery);
      const scoresList: Score[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        scoresList.push({
          id: docSnap.id,
          userId: data.userId,
          displayName: data.displayName,
          avatar: data.avatar,
          teamId: data.teamId,
          teamName: data.teamName,
          week: data.week,
          courseId: data.courseId,
          courseName: data.courseName,
          holeScores: data.holeScores || [],
          grossScore: data.grossScore,
          netScore: data.netScore,
          handicapUsed: data.handicapUsed || 0,
          totalPar: data.totalPar,
          scoreToPar: data.scoreToPar,
          createdAt: data.createdAt,
          status: data.status || "approved", // Default auto-approved
          dqReason: data.dqReason,
          dqBy: data.dqBy,
          dqAt: data.dqAt,
          editHistory: data.editHistory,
        });
      });

      setScores(scoresList);
    } catch (error) {
      console.error("Error loading scores:", error);
      Alert.alert("Error", "Failed to load scores");
    } finally {
      setLoading(false);
    }
  };

  /* ================================================================ */
  /* HANDLERS                                                        */
  /* ================================================================ */

  const handleViewDetails = (score: Score) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedScore(score);
    setShowDetailsModal(true);
  };

  const handleEditScore = (score: Score) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedScore(score);
    setEditedHoleScores([...score.holeScores]);
    setEditReason("");
    setShowEditModal(true);
  };

  const handleDQScore = (score: Score) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedScore(score);
    setDqReason("");
    setNotifyPlayer(true);
    setShowDQModal(true);
  };

  const handleApproveScore = async (score: Score) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await updateDoc(doc(db, "leagues", leagueId, "scores", score.id), {
        status: "approved",
      });

      setScores((prev) =>
        prev.map((s) => (s.id === score.id ? { ...s, status: "approved" } : s))
      );

      Alert.alert("Success", "Score approved");
    } catch (error) {
      console.error("Error approving score:", error);
      Alert.alert("Error", "Failed to approve score");
    }
  };

  const handleReinstateScore = async (score: Score) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Alert.alert(
      "Reinstate Score",
      `Are you sure you want to reinstate ${score.displayName}'s score?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reinstate",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "leagues", leagueId, "scores", score.id), {
                status: "approved",
                dqReason: null,
                dqBy: null,
                dqAt: null,
              });

              setScores((prev) =>
                prev.map((s) =>
                  s.id === score.id
                    ? { ...s, status: "approved", dqReason: undefined }
                    : s
                )
              );

              Alert.alert("Success", "Score reinstated");
            } catch (error) {
              console.error("Error reinstating score:", error);
              Alert.alert("Error", "Failed to reinstate score");
            }
          },
        },
      ]
    );
  };

  const handleSaveEdit = async () => {
    if (!selectedScore || !currentUserId) return;

    if (!editReason.trim()) {
      Alert.alert("Required", "Please provide a reason for the edit");
      return;
    }

    try {
      setSaving(true);

      const newGross = editedHoleScores.reduce((sum, s) => sum + s, 0);
      const newNet = newGross - selectedScore.handicapUsed;

      const editRecord: EditRecord = {
        editedBy: currentUserId,
        editedByName: auth.currentUser?.displayName || "Unknown",
        editedAt: serverTimestamp(),
        previousGross: selectedScore.grossScore,
        previousNet: selectedScore.netScore,
        newGross,
        newNet,
        reason: editReason.trim(),
      };

      await updateDoc(doc(db, "leagues", leagueId, "scores", selectedScore.id), {
        holeScores: editedHoleScores,
        grossScore: newGross,
        netScore: newNet,
        scoreToPar: newGross - selectedScore.totalPar,
        editHistory: [...(selectedScore.editHistory || []), editRecord],
      });

      setScores((prev) =>
        prev.map((s) =>
          s.id === selectedScore.id
            ? {
                ...s,
                holeScores: editedHoleScores,
                grossScore: newGross,
                netScore: newNet,
                scoreToPar: newGross - selectedScore.totalPar,
                editHistory: [...(s.editHistory || []), editRecord],
              }
            : s
        )
      );

      setShowEditModal(false);
      Alert.alert("Success", "Score updated");
    } catch (error) {
      console.error("Error saving edit:", error);
      Alert.alert("Error", "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDQ = async () => {
    if (!selectedScore || !currentUserId) return;

    if (!dqReason.trim()) {
      Alert.alert("Required", "Please provide a reason for disqualification");
      return;
    }

    try {
      setSaving(true);

      await updateDoc(doc(db, "leagues", leagueId, "scores", selectedScore.id), {
        status: "disqualified",
        dqReason: dqReason.trim(),
        dqBy: currentUserId,
        dqAt: serverTimestamp(),
      });

      setScores((prev) =>
        prev.map((s) =>
          s.id === selectedScore.id
            ? { ...s, status: "disqualified", dqReason: dqReason.trim() }
            : s
        )
      );

      // TODO: Send notification to player if notifyPlayer is true

      setShowDQModal(false);
      Alert.alert("Success", "Score disqualified");
    } catch (error) {
      console.error("Error disqualifying score:", error);
      Alert.alert("Error", "Failed to disqualify score");
    } finally {
      setSaving(false);
    }
  };

  const handleHoleScoreChange = (index: number, value: string) => {
    const numValue = parseInt(value, 10);
    if (value === "" || (numValue >= 1 && numValue <= 15)) {
      const newScores = [...editedHoleScores];
      newScores[index] = value === "" ? 0 : numValue;
      setEditedHoleScores(newScores);
    }
  };

  /* ================================================================ */
  /* HELPERS                                                         */
  /* ================================================================ */

  const getFilteredScores = () => {
    if (statusFilter === "all") return scores;
    return scores.filter((s) => s.status === statusFilter);
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "Unknown";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return { text: "Approved", color: "#4CAF50", bg: "#E8F5E9" };
      case "pending":
        return { text: "Pending", color: "#FF9800", bg: "#FFF3E0" };
      case "disqualified":
        return { text: "DQ", color: "#F44336", bg: "#FFEBEE" };
      default:
        return { text: status, color: "#666", bg: "#F5F5F5" };
    }
  };

  const getScoreToParDisplay = (scoreToPar: number) => {
    if (scoreToPar === 0) return "E";
    return scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar.toString();
  };

  /* ================================================================ */
  /* RENDER                                                          */
  /* ================================================================ */

  const renderFilters = () => (
    <View style={styles.filtersContainer}>
      {/* Week Selector */}
      <TouchableOpacity
        style={styles.weekSelector}
        onPress={() => setShowWeekPicker(true)}
      >
        <Text style={styles.weekSelectorLabel}>Week</Text>
        <View style={styles.weekSelectorValue}>
          <Text style={styles.weekSelectorText}>{selectedWeek}</Text>
          <Ionicons name="chevron-down" size={16} color="#0D5C3A" />
        </View>
      </TouchableOpacity>

      {/* Status Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.statusFilters}
        contentContainerStyle={styles.statusFiltersContent}
      >
        {(["all", "approved", "pending", "disqualified"] as StatusFilter[]).map(
          (status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.statusFilterBtn,
                statusFilter === status && styles.statusFilterBtnActive,
              ]}
              onPress={() => {
                soundPlayer.play("click");
                setStatusFilter(status);
              }}
            >
              <Text
                style={[
                  styles.statusFilterText,
                  statusFilter === status && styles.statusFilterTextActive,
                ]}
              >
                {status === "all"
                  ? "All"
                  : status === "disqualified"
                  ? "DQ'd"
                  : status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </TouchableOpacity>
          )
        )}
      </ScrollView>
    </View>
  );

  const renderScoreCard = (score: Score) => {
    const badge = getStatusBadge(score.status);

    return (
      <View key={score.id} style={styles.scoreCard}>
        {/* Header */}
        <View style={styles.scoreCardHeader}>
          <View style={styles.playerInfo}>
            {score.avatar ? (
              <Image source={{ uri: score.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {score.displayName?.charAt(0) || "?"}
                </Text>
              </View>
            )}
            <View style={styles.playerDetails}>
              <Text style={styles.playerName}>{score.displayName}</Text>
              {score.teamName ? (
                <Text style={styles.teamName}>{score.teamName}</Text>
              ) : null}
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusBadgeText, { color: badge.color }]}>
              {badge.text}
            </Text>
          </View>
        </View>

        {/* Score Details */}
        <View style={styles.scoreDetails}>
          <Text style={styles.courseName}>{score.courseName}</Text>
          <View style={styles.scoreRow}>
            <View style={styles.scoreStat}>
              <Text style={styles.scoreStatLabel}>Gross</Text>
              <Text style={styles.scoreStatValue}>{score.grossScore}</Text>
            </View>
            <View style={styles.scoreDivider} />
            <View style={styles.scoreStat}>
              <Text style={styles.scoreStatLabel}>Net</Text>
              <Text style={styles.scoreStatValue}>{score.netScore}</Text>
            </View>
            <View style={styles.scoreDivider} />
            <View style={styles.scoreStat}>
              <Text style={styles.scoreStatLabel}>HCP</Text>
              <Text style={styles.scoreStatValue}>{score.handicapUsed}</Text>
            </View>
            <View style={styles.scoreDivider} />
            <View style={styles.scoreStat}>
              <Text style={styles.scoreStatLabel}>To Par</Text>
              <Text
                style={[
                  styles.scoreStatValue,
                  score.scoreToPar < 0 && styles.underPar,
                  score.scoreToPar > 0 && styles.overPar,
                ]}
              >
                {getScoreToParDisplay(score.scoreToPar)}
              </Text>
            </View>
          </View>
          <Text style={styles.postedDate}>Posted: {formatDate(score.createdAt)}</Text>
        </View>

        {/* DQ Reason if applicable */}
        {score.status === "disqualified" && score.dqReason ? (
          <View style={styles.dqReasonContainer}>
            <Ionicons name="warning" size={14} color="#F44336" />
            <Text style={styles.dqReasonText}>{score.dqReason}</Text>
          </View>
        ) : null}

        {/* Edit History Indicator */}
        {score.editHistory && score.editHistory.length > 0 ? (
          <View style={styles.editHistoryIndicator}>
            <Ionicons name="create-outline" size={14} color="#666" />
            <Text style={styles.editHistoryText}>
              Edited {score.editHistory.length} time
              {score.editHistory.length > 1 ? "s" : ""}
            </Text>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleViewDetails(score)}
          >
            <Ionicons name="eye-outline" size={18} color="#0D5C3A" />
            <Text style={styles.actionBtnText}>Details</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleEditScore(score)}
          >
            <Ionicons name="pencil-outline" size={18} color="#2196F3" />
            <Text style={[styles.actionBtnText, { color: "#2196F3" }]}>Edit</Text>
          </TouchableOpacity>

          {score.status === "disqualified" ? (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleReinstateScore(score)}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#4CAF50" />
              <Text style={[styles.actionBtnText, { color: "#4CAF50" }]}>
                Reinstate
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              {score.status === "pending" ? (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleApproveScore(score)}
                >
                  <Ionicons name="checkmark-outline" size={18} color="#4CAF50" />
                  <Text style={[styles.actionBtnText, { color: "#4CAF50" }]}>
                    Approve
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleDQScore(score)}
              >
                <Ionicons name="close-circle-outline" size={18} color="#F44336" />
                <Text style={[styles.actionBtnText, { color: "#F44336" }]}>DQ</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  const renderWeekPickerModal = () => (
    <Modal
      visible={showWeekPicker}
      transparent
      animationType="fade"
      onRequestClose={() => setShowWeekPicker(false)}
    >
      <Pressable
        style={styles.modalBackdrop}
        onPress={() => setShowWeekPicker(false)}
      >
        <View style={styles.weekPickerContent}>
          <Text style={styles.weekPickerTitle}>Select Week</Text>
          <ScrollView style={styles.weekList}>
            {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((week) => (
              <TouchableOpacity
                key={week}
                style={[
                  styles.weekOption,
                  selectedWeek === week && styles.weekOptionSelected,
                ]}
                onPress={() => {
                  soundPlayer.play("click");
                  setSelectedWeek(week);
                  setShowWeekPicker(false);
                }}
              >
                <Text
                  style={[
                    styles.weekOptionText,
                    selectedWeek === week && styles.weekOptionTextSelected,
                  ]}
                >
                  Week {week}
                  {week === currentWeek ? " (Current)" : ""}
                </Text>
                {selectedWeek === week ? (
                  <Ionicons name="checkmark" size={20} color="#0D5C3A" />
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );

  const renderDetailsModal = () => {
    if (!selectedScore) return null;

    return (
      <Modal
        visible={showDetailsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.detailsModalContent}>
            {/* Header */}
            <View style={styles.detailsHeader}>
              <Text style={styles.detailsTitle}>Score Details</Text>
              <TouchableOpacity onPress={() => setShowDetailsModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.detailsBody}>
              {/* Player Info */}
              <View style={styles.detailsSection}>
                <Text style={styles.detailsSectionTitle}>Player</Text>
                <View style={styles.detailsPlayerRow}>
                  {selectedScore.avatar ? (
                    <Image
                      source={{ uri: selectedScore.avatar }}
                      style={styles.detailsAvatar}
                    />
                  ) : (
                    <View style={styles.detailsAvatarPlaceholder}>
                      <Text style={styles.avatarText}>
                        {selectedScore.displayName?.charAt(0) || "?"}
                      </Text>
                    </View>
                  )}
                  <View>
                    <Text style={styles.detailsPlayerName}>
                      {selectedScore.displayName}
                    </Text>
                    {selectedScore.teamName ? (
                      <Text style={styles.detailsTeamName}>
                        {selectedScore.teamName}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* Course & Date */}
              <View style={styles.detailsSection}>
                <Text style={styles.detailsSectionTitle}>Round Info</Text>
                <Text style={styles.detailsText}>{selectedScore.courseName}</Text>
                <Text style={styles.detailsSubtext}>
                  {formatDate(selectedScore.createdAt)}
                </Text>
              </View>

              {/* Hole by Hole */}
              <View style={styles.detailsSection}>
                <Text style={styles.detailsSectionTitle}>Scorecard</Text>
                <View style={styles.holesGrid}>
                  {selectedScore.holeScores.map((score, idx) => (
                    <View key={idx} style={styles.holeItem}>
                      <Text style={styles.holeNumber}>{idx + 1}</Text>
                      <Text style={styles.holeScore}>{score}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Summary */}
              <View style={styles.detailsSection}>
                <Text style={styles.detailsSectionTitle}>Summary</Text>
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Gross</Text>
                    <Text style={styles.summaryValue}>
                      {selectedScore.grossScore}
                    </Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Handicap</Text>
                    <Text style={styles.summaryValue}>
                      {selectedScore.handicapUsed}
                    </Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Net</Text>
                    <Text style={styles.summaryValue}>{selectedScore.netScore}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>To Par</Text>
                    <Text style={styles.summaryValue}>
                      {getScoreToParDisplay(selectedScore.scoreToPar)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Edit History */}
              {selectedScore.editHistory && selectedScore.editHistory.length > 0 ? (
                <View style={styles.detailsSection}>
                  <Text style={styles.detailsSectionTitle}>Edit History</Text>
                  {selectedScore.editHistory.map((edit, idx) => (
                    <View key={idx} style={styles.editHistoryItem}>
                      <Text style={styles.editHistoryHeader}>
                        {edit.editedByName} • {formatDate(edit.editedAt)}
                      </Text>
                      <Text style={styles.editHistoryChange}>
                        {edit.previousGross} → {edit.newGross} gross
                      </Text>
                      <Text style={styles.editHistoryReason}>
                        Reason: {edit.reason}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderEditModal = () => {
    if (!selectedScore) return null;

    const newGross = editedHoleScores.reduce((sum, s) => sum + s, 0);
    const newNet = newGross - selectedScore.handicapUsed;

    return (
      <Modal
        visible={showEditModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.editModalContent}>
            {/* Header */}
            <View style={styles.editHeader}>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Text style={styles.editCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.editTitle}>Edit Score</Text>
              <TouchableOpacity onPress={handleSaveEdit} disabled={saving}>
                <Text
                  style={[styles.editSaveText, saving && styles.editSaveDisabled]}
                >
                  {saving ? "..." : "Save"}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.editBody}>
              {/* Player */}
              <Text style={styles.editPlayerName}>{selectedScore.displayName}</Text>
              <Text style={styles.editCourseName}>{selectedScore.courseName}</Text>

              {/* Hole Scores */}
              <View style={styles.editHolesContainer}>
                <Text style={styles.editSectionTitle}>Hole Scores</Text>
                <View style={styles.editHolesGrid}>
                  {editedHoleScores.map((score, idx) => (
                    <View key={idx} style={styles.editHoleItem}>
                      <Text style={styles.editHoleNumber}>{idx + 1}</Text>
                      <TextInput
                        style={styles.editHoleInput}
                        value={score.toString()}
                        onChangeText={(v) => handleHoleScoreChange(idx, v)}
                        keyboardType="number-pad"
                        maxLength={2}
                        selectTextOnFocus
                      />
                    </View>
                  ))}
                </View>
              </View>

              {/* New Totals */}
              <View style={styles.editTotals}>
                <View style={styles.editTotalItem}>
                  <Text style={styles.editTotalLabel}>New Gross</Text>
                  <Text style={styles.editTotalValue}>{newGross}</Text>
                </View>
                <View style={styles.editTotalItem}>
                  <Text style={styles.editTotalLabel}>New Net</Text>
                  <Text style={styles.editTotalValue}>{newNet}</Text>
                </View>
              </View>

              {/* Edit Reason */}
              <View style={styles.editReasonContainer}>
                <Text style={styles.editReasonLabel}>Reason for edit *</Text>
                <TextInput
                  style={styles.editReasonInput}
                  value={editReason}
                  onChangeText={setEditReason}
                  placeholder="e.g., Corrected hole 7 score per player request"
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderDQModal = () => {
    if (!selectedScore) return null;

    return (
      <Modal
        visible={showDQModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDQModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.dqModalContent}>
            <Text style={styles.dqTitle}>Disqualify Score</Text>

            <View style={styles.dqPlayerInfo}>
              <Text style={styles.dqPlayerName}>{selectedScore.displayName}</Text>
              <Text style={styles.dqScoreInfo}>
                {selectedScore.grossScore} gross / {selectedScore.netScore} net
              </Text>
            </View>

            <View style={styles.dqReasonInputContainer}>
              <Text style={styles.dqReasonLabel}>Reason (required)</Text>
              <TextInput
                style={styles.dqReasonInput}
                value={dqReason}
                onChangeText={setDqReason}
                placeholder="e.g., Incorrect handicap used, score not verifiable..."
                placeholderTextColor="#999"
                multiline
                numberOfLines={4}
              />
            </View>

            <TouchableOpacity
              style={styles.notifyToggle}
              onPress={() => setNotifyPlayer(!notifyPlayer)}
            >
              <Ionicons
                name={notifyPlayer ? "checkbox" : "square-outline"}
                size={24}
                color="#0D5C3A"
              />
              <Text style={styles.notifyToggleText}>
                Notify player of disqualification
              </Text>
            </TouchableOpacity>

            <View style={styles.dqActions}>
              <TouchableOpacity
                style={styles.dqCancelBtn}
                onPress={() => setShowDQModal(false)}
              >
                <Text style={styles.dqCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dqConfirmBtn, saving && styles.dqConfirmDisabled]}
                onPress={handleConfirmDQ}
                disabled={saving}
              >
                <Text style={styles.dqConfirmText}>
                  {saving ? "..." : "Disqualify"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  /* ================================================================ */
  /* MAIN RENDER                                                     */
  /* ================================================================ */

  const filteredScores = getFilteredScores();

  return (
    <View style={styles.container}>
      {renderFilters()}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D5C3A" />
        </View>
      ) : filteredScores.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="golf-outline" size={48} color="#CCC" />
          <Text style={styles.emptyTitle}>No Scores</Text>
          <Text style={styles.emptySubtitle}>
            {statusFilter === "all"
              ? `No scores posted for Week ${selectedWeek} yet`
              : `No ${statusFilter} scores for Week ${selectedWeek}`}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scoresList}
          contentContainerStyle={styles.scoresListContent}
        >
          {filteredScores.map(renderScoreCard)}
        </ScrollView>
      )}

      {renderWeekPickerModal()}
      {renderDetailsModal()}
      {renderEditModal()}
      {renderDQModal()}
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Filters
  filtersContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  weekSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    gap: 8,
  },
  weekSelectorLabel: {
    fontSize: 12,
    color: "#666",
  },
  weekSelectorValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  weekSelectorText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  statusFilters: {
    flex: 1,
  },
  statusFiltersContent: {
    gap: 8,
  },
  statusFilterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  statusFilterBtnActive: {
    backgroundColor: "#0D5C3A",
    borderColor: "#0D5C3A",
  },
  statusFilterText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#666",
  },
  statusFilterTextActive: {
    color: "#FFF",
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 8,
    textAlign: "center",
  },

  // Scores List
  scoresList: {
    flex: 1,
  },
  scoresListContent: {
    padding: 16,
    gap: 12,
  },

  // Score Card
  scoreCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  scoreCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  playerInfo: {
    flexDirection: "row",
    alignItems: "center",
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
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
  playerDetails: {
    marginLeft: 12,
    flex: 1,
  },
  playerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  teamName: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },

  // Score Details
  scoreDetails: {
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    paddingTop: 12,
  },
  courseName: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  scoreStat: {
    flex: 1,
    alignItems: "center",
  },
  scoreStatLabel: {
    fontSize: 11,
    color: "#999",
    marginBottom: 2,
  },
  scoreStatValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  scoreDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#E0E0E0",
  },
  underPar: {
    color: "#E53935",
  },
  overPar: {
    color: "#333",
  },
  postedDate: {
    fontSize: 12,
    color: "#999",
    marginTop: 12,
  },

  // DQ Reason
  dqReasonContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFEBEE",
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  dqReasonText: {
    flex: 1,
    fontSize: 13,
    color: "#C62828",
  },

  // Edit History Indicator
  editHistoryIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 6,
  },
  editHistoryText: {
    fontSize: 12,
    color: "#666",
  },

  // Actions
  actions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    marginTop: 12,
    paddingTop: 12,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 4,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  // Modal Backdrop
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },

  // Week Picker Modal
  weekPickerContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "60%",
  },
  weekPickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    padding: 16,
    textAlign: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  weekList: {
    padding: 8,
  },
  weekOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 8,
  },
  weekOptionSelected: {
    backgroundColor: "#E8F5E9",
  },
  weekOptionText: {
    fontSize: 16,
    color: "#333",
  },
  weekOptionTextSelected: {
    fontWeight: "600",
    color: "#0D5C3A",
  },

  // Details Modal
  detailsModalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
  },
  detailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  detailsBody: {
    padding: 16,
  },
  detailsSection: {
    marginBottom: 24,
  },
  detailsSectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  detailsPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  detailsAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  detailsAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  detailsPlayerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  detailsTeamName: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  detailsText: {
    fontSize: 16,
    color: "#333",
  },
  detailsSubtext: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  holesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  holeItem: {
    width: 36,
    alignItems: "center",
    padding: 6,
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
  },
  holeNumber: {
    fontSize: 10,
    color: "#999",
    marginBottom: 2,
  },
  holeScore: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 16,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 11,
    color: "#666",
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },
  editHistoryItem: {
    backgroundColor: "#F9F9F9",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  editHistoryHeader: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  editHistoryChange: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  editHistoryReason: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
  },

  // Edit Modal
  editModalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
  },
  editHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  editCancelText: {
    fontSize: 16,
    color: "#666",
  },
  editTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  editSaveText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  editSaveDisabled: {
    opacity: 0.5,
  },
  editBody: {
    padding: 16,
  },
  editPlayerName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  editCourseName: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
    marginBottom: 16,
  },
  editHolesContainer: {
    marginBottom: 16,
  },
  editSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  editHolesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  editHoleItem: {
    width: 44,
    alignItems: "center",
  },
  editHoleNumber: {
    fontSize: 11,
    color: "#666",
    marginBottom: 4,
  },
  editHoleInput: {
    width: 40,
    height: 40,
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  editTotals: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  editTotalItem: {
    flex: 1,
    backgroundColor: "#E8F5E9",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  editTotalLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  editTotalValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  editReasonContainer: {
    marginBottom: 24,
  },
  editReasonLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  editReasonInput: {
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: "#333",
    minHeight: 80,
    textAlignVertical: "top",
  },

  // DQ Modal
  dqModalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  dqTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    marginBottom: 16,
  },
  dqPlayerInfo: {
    backgroundColor: "#F5F5F5",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  dqPlayerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  dqScoreInfo: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  dqReasonInputContainer: {
    marginBottom: 16,
  },
  dqReasonLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  dqReasonInput: {
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: "#333",
    minHeight: 100,
    textAlignVertical: "top",
  },
  notifyToggle: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  notifyToggleText: {
    fontSize: 15,
    color: "#333",
  },
  dqActions: {
    flexDirection: "row",
    gap: 12,
  },
  dqCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
  },
  dqCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  dqConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F44336",
    alignItems: "center",
  },
  dqConfirmDisabled: {
    opacity: 0.6,
  },
  dqConfirmText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
});