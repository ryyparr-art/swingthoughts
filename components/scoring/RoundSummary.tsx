/**
 * RoundSummary — Post-round summary & share screen
 *
 * Shown after all holes are scored and marker taps "Finish".
 * Displays:
 *   - Group scorecard summary (all players, totals, winner)
 *   - Text input for round description (140 char limit)
 *   - Image picker with compression for a round photo
 *   - "Post Round" button → sets round status to "complete"
 *
 * The Cloud Function pipeline handles everything after status change:
 *   scores docs → leaderboards → career stats → feedActivity
 *
 * File: components/scoring/RoundSummary.tsx
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import BadgeRow from "@/components/challenges/BadgeRow";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ============================================================================
// TYPES
// ============================================================================

interface PlayerSummary {
  playerId: string;
  displayName: string;
  avatar?: string;
  isGhost: boolean;
  isMarker: boolean;
  handicapIndex: number;
  courseHandicap: number;
  grossScore: number;
  netScore: number;
  scoreToPar: number;
  earnedChallengeBadges?: string[];
}

interface RoundSummaryProps {
  roundId: string;
  courseName: string;
  courseId: number;
  holeCount: 9 | 18;
  formatId: string;
  players: PlayerSummary[];
  holePars: number[];
  isSimulator: boolean;
  onPost: (description: string, imageUrl: string | null) => Promise<void>;
  onBack: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GREEN = "#0D5C3A";
const HEADER_GREEN = "#147A52";
const GOLD = "#C5A55A";
const WALNUT = "#3E2B1E";
const MAX_DESCRIPTION = 140;

// Leaderboard-eligible formats under USGA rules
const HANDICAP_ELIGIBLE_FORMATS = [
  "stroke_play",
  "individual_stableford",
  "par_bogey",
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function RoundSummary({
  roundId,
  courseName,
  courseId,
  holeCount,
  formatId,
  players,
  holePars,
  isSimulator,
  onPost,
  onBack,
}: RoundSummaryProps) {
  const [description, setDescription] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const insets = useSafeAreaInsets();

  // ── Derived data ──────────────────────────────────────────
  const totalPar = useMemo(
    () => holePars.slice(0, holeCount).reduce((a, b) => a + b, 0),
    [holePars, holeCount]
  );

  const sortedByNet = useMemo(
    () => [...players].sort((a, b) => a.netScore - b.netScore),
    [players]
  );

  const winner = sortedByNet[0];

  const isLeaderboardEligible =
    holeCount === 18 &&
    !isSimulator &&
    HANDICAP_ELIGIBLE_FORMATS.includes(formatId);

  const formatLabel = useMemo(() => {
    const labels: Record<string, string> = {
      stroke_play: "Stroke Play",
      individual_stableford: "Stableford",
      par_bogey: "Par/Bogey",
      match_play: "Match Play",
      four_ball: "Four-Ball",
      foursomes: "Foursomes",
      scramble: "Scramble",
      best_ball: "Best Ball",
      chapman: "Chapman",
      texas_scramble: "Texas Scramble",
      shamble: "Shamble",
      skins: "Skins",
      nassau: "Nassau",
      wolf: "Wolf",
      bingo_bango_bongo: "Bingo Bango Bongo",
      stableford_team: "Team Stableford",
    };
    return labels[formatId] || formatId;
  }, [formatId]);

  // ── Image picker ──────────────────────────────────────────
  const handlePickImage = async () => {
    soundPlayer.play("click");

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Needed", "Please allow access to your photo library.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setImageUri(asset.uri);

    // Compress for feed card thumbnail
    await compressAndUpload(asset.uri);
  };

  const handleTakePhoto = async () => {
    soundPlayer.play("click");

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Needed", "Please allow access to your camera.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setImageUri(asset.uri);
    await compressAndUpload(asset.uri);
  };

  const compressAndUpload = async (uri: string) => {
    setUploading(true);
    try {
      // Compress to max 800px wide, 0.6 quality for feed thumbnails
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 800 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Upload to Firebase Storage
      const filename = `round_photos/${roundId}_${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);

      const response = await fetch(compressed.uri);
      const blob = await response.blob();

      await uploadBytesResumable(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);

      setImageUrl(downloadUrl);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error("Image upload error:", err);
      Alert.alert("Upload Failed", "Could not upload image. You can try again or post without one.");
      setImageUri(null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = () => {
    soundPlayer.play("click");
    setImageUri(null);
    setImageUrl(null);
  };

  // ── Post round ────────────────────────────────────────────
  const handlePost = async () => {
    if (posting) return;

    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Wait for upload if still going
    if (uploading) {
      Alert.alert("Please Wait", "Image is still uploading...");
      return;
    }

    setPosting(true);
    try {
      await onPost(description.trim(), imageUrl);
    } catch (err) {
      console.error("Post round error:", err);
      Alert.alert("Error", "Failed to post round. Please try again.");
      setPosting(false);
    }
  };

  // ── Score to par label ────────────────────────────────────
  const scoreToParLabel = (scoreToPar: number) => {
    if (scoreToPar === 0) return "E";
    return scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity onPress={onBack} style={s.headerBackBtn}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Round Summary</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Status bar background */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, backgroundColor: HEADER_GREEN, zIndex: 10 }} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Course & Format ──────────────────────────── */}
          <View style={s.courseCard}>
            <Ionicons name="golf-outline" size={20} color={GREEN} />
            <View style={s.courseInfo}>
              <Text style={s.courseCardName}>{courseName}</Text>
              <Text style={s.courseCardMeta}>
                {holeCount} holes • {formatLabel} • Par {totalPar}
                {isSimulator ? " • Simulator" : ""}
              </Text>
            </View>
          </View>

          {/* Eligibility badges */}
          <View style={s.badgeRow}>
            {isLeaderboardEligible && (
              <View style={s.eligibilityBadge}>
                <Ionicons name="trophy-outline" size={12} color={GOLD} />
                <Text style={s.eligibilityText}>Leaderboard Eligible</Text>
              </View>
            )}
            {!isSimulator && HANDICAP_ELIGIBLE_FORMATS.includes(formatId) && (
              <View style={s.eligibilityBadge}>
                <Ionicons name="stats-chart-outline" size={12} color={GREEN} />
                <Text style={s.eligibilityText}>Counts for HCI</Text>
              </View>
            )}
            {isSimulator && (
              <View style={[s.eligibilityBadge, { borderColor: "#999" }]}>
                <Ionicons name="tv-outline" size={12} color="#999" />
                <Text style={[s.eligibilityText, { color: "#999" }]}>Simulator — No HCI</Text>
              </View>
            )}
          </View>

          {/* ── Scoreboard ───────────────────────────────── */}
          <View style={s.scoreboard}>
            <View style={s.scoreboardHeader}>
              <Text style={s.scoreboardTitle}>Final Scores</Text>
            </View>

            {/* Column headers */}
            <View style={s.scoreRow}>
              <Text style={[s.scoreCol, s.scoreColPlayer, s.scoreHeaderText]}>PLAYER</Text>
              <Text style={[s.scoreCol, s.scoreColNum, s.scoreHeaderText]}>GRS</Text>
              <Text style={[s.scoreCol, s.scoreColNum, s.scoreHeaderText]}>NET</Text>
              <Text style={[s.scoreCol, s.scoreColNum, s.scoreHeaderText]}>+/-</Text>
            </View>

            {/* Player rows */}
            {sortedByNet.map((player, i) => {
              const isWinner = i === 0;
              return (
                <View
                  key={player.playerId}
                  style={[s.scoreRow, s.scoreDataRow, isWinner && s.winnerRow]}
                >
                  <View style={[s.scoreCol, s.scoreColPlayer]}>
                    <View style={s.playerInfo}>
                      {player.avatar ? (
                        <Image source={{ uri: player.avatar }} style={s.playerAvatar} />
                      ) : (
                        <View style={[s.playerAvatar, s.playerAvatarPlaceholder]}>
                          <Text style={s.playerAvatarText}>
                            {player.displayName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={s.playerNameRow}>
                          <Text style={[s.playerName, isWinner && s.winnerName]} numberOfLines={1}>
                            {player.displayName}
                          </Text>
                          {isWinner && players.length > 1 && (
                            <Ionicons name="trophy" size={14} color={GOLD} />
                          )}
                        </View>
                        <Text style={s.playerHcp}>HCP {player.courseHandicap}</Text>
                      </View>
                    </View>
                  </View>
                  <Text style={[s.scoreCol, s.scoreColNum, s.scoreNum]}>
                    {player.grossScore}
                  </Text>
                  <Text style={[s.scoreCol, s.scoreColNum, s.scoreNum, isWinner && s.winnerScore]}>
                    {player.netScore}
                  </Text>
                  <Text style={[s.scoreCol, s.scoreColNum, s.scoreNum, s.parCol]}>
                    {scoreToParLabel(player.scoreToPar)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* ── Image Upload ─────────────────────────────── */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Round Photo</Text>
            {imageUri ? (
              <View style={s.imagePreview}>
                <Image source={{ uri: imageUri }} style={s.previewImage} />
                {uploading && (
                  <View style={s.uploadOverlay}>
                    <ActivityIndicator size="small" color="#FFF" />
                    <Text style={s.uploadText}>Uploading...</Text>
                  </View>
                )}
                <TouchableOpacity style={s.removeImageBtn} onPress={handleRemoveImage}>
                  <Ionicons name="close-circle" size={26} color="#FFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.imageActions}>
                <TouchableOpacity style={s.imageBtn} onPress={handlePickImage}>
                  <Ionicons name="image-outline" size={22} color={GREEN} />
                  <Text style={s.imageBtnText}>Choose Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.imageBtn} onPress={handleTakePhoto}>
                  <Ionicons name="camera-outline" size={22} color={GREEN} />
                  <Text style={s.imageBtnText}>Take Photo</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ── Description ──────────────────────────────── */}
          <View style={s.section}>
            <View style={s.descLabelRow}>
              <Text style={s.sectionLabel}>Round Notes</Text>
              <Text style={s.charCount}>
                {description.length}/{MAX_DESCRIPTION}
              </Text>
            </View>
            <TextInput
              style={s.descInput}
              placeholder="How was the round? Any highlights?"
              placeholderTextColor="#999"
              value={description}
              onChangeText={(t) => setDescription(t.slice(0, MAX_DESCRIPTION))}
              maxLength={MAX_DESCRIPTION}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Spacer for button */}
          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Post Button (fixed bottom) ───────────────────── */}
      <View style={s.bottomBar}>
        <TouchableOpacity
          style={[s.postBtn, (posting || uploading) && s.postBtnDisabled]}
          onPress={handlePost}
          disabled={posting || uploading}
        >
          {posting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color="#FFF" />
              <Text style={s.postBtnText}>Post Round</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F2EB" },

  // ── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: HEADER_GREEN,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  headerBackBtn: { width: 32, alignItems: "flex-start" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#FFF" },

  // ── Scroll ──────────────────────────────────────────────────
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  // ── Course Card ─────────────────────────────────────────────
  courseCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  courseInfo: { flex: 1 },
  courseCardName: { fontSize: 16, fontWeight: "700", color: "#333" },
  courseCardMeta: { fontSize: 13, color: "#888", marginTop: 2 },

  // ── Eligibility Badges ──────────────────────────────────────
  badgeRow: { flexDirection: "row", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  eligibilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GOLD,
    backgroundColor: "rgba(197, 165, 90, 0.06)",
  },
  eligibilityText: { fontSize: 11, fontWeight: "600", color: GOLD },

  // ── Scoreboard ──────────────────────────────────────────────
  scoreboard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 20,
  },
  scoreboardHeader: {
    backgroundColor: GREEN,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  scoreboardTitle: { fontSize: 15, fontWeight: "700", color: "#FFF" },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  scoreDataRow: {
    borderTopWidth: 1,
    borderTopColor: "#F0EDE4",
  },
  winnerRow: {
    backgroundColor: "rgba(197, 165, 90, 0.06)",
  },
  scoreCol: {},
  scoreColPlayer: { flex: 1 },
  scoreColNum: { width: 50, textAlign: "center" },
  scoreHeaderText: { fontSize: 11, fontWeight: "700", color: "#999", letterSpacing: 0.5 },
  scoreNum: { fontSize: 15, fontWeight: "700", color: "#333" },
  winnerScore: { color: GOLD, fontWeight: "800" },
  parCol: { color: "#888" },

  playerInfo: { flexDirection: "row", alignItems: "center", gap: 10 },
  playerAvatar: { width: 32, height: 32, borderRadius: 16 },
  playerAvatarPlaceholder: {
    backgroundColor: GREEN,
    justifyContent: "center",
    alignItems: "center",
  },
  playerAvatarText: { fontSize: 13, fontWeight: "700", color: "#FFF" },
  playerNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  playerName: { fontSize: 14, fontWeight: "600", color: "#333", flexShrink: 1 },
  winnerName: { color: GOLD, fontWeight: "700" },
  playerHcp: { fontSize: 11, color: "#999" },

  // ── Section ─────────────────────────────────────────────────
  section: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#555",
    marginBottom: 8,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },

  // ── Image ───────────────────────────────────────────────────
  imageActions: { flexDirection: "row", gap: 10 },
  imageBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFF",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderStyle: "dashed",
  },
  imageBtnText: { fontSize: 14, fontWeight: "600", color: GREEN },
  imagePreview: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  uploadText: { fontSize: 12, color: "#FFF", fontWeight: "600" },
  removeImageBtn: {
    position: "absolute",
    top: 8,
    right: 8,
  },

  // ── Description ─────────────────────────────────────────────
  descLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  charCount: { fontSize: 12, color: "#999" },
  descInput: {
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    fontSize: 15,
    minHeight: 80,
  },

  // ── Bottom Bar ──────────────────────────────────────────────
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#F5F2EB",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  postBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GREEN,
    paddingVertical: 16,
    borderRadius: 14,
  },
  postBtnDisabled: { opacity: 0.6 },
  postBtnText: { fontSize: 17, fontWeight: "800", color: "#FFF" },
});