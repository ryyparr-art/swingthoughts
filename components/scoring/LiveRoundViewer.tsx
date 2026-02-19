/**
 * LiveRoundViewer — Spectator/player view for a live round
 *
 * Green #147A52 header, three tabs: Scorecard | Chat | Settings
 * Settings: Take Over Marker, Edit Scores, Round Privacy, Abandon Round
 *
 * Route: /round/[roundId]
 * File: components/scoring/LiveRoundViewer.tsx
 */

import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { soundPlayer } from "@/utils/soundPlayer";
import { auth, db } from "@/constants/firebaseConfig";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getFormatById } from "@/constants/gameFormats";
import {
  useLiveRound,
  useRoundChat,
  type ChatMessage,
  type LeaderboardEntry,
} from "@/hooks/useLiveRound";
import MultiplayerScorecard from "./MultiplayerScorecard";

// Custom scorecard icon
const scorecardIcon = require("@/assets/icons/Post Score.png");

const HEADER_GREEN = "#147A52";
const WALNUT = "#4A3628";
const CREAM = "#F4EED8";

interface LiveRoundViewerProps {
  roundId: string;
}

type ViewerTab = "scorecard" | "chat" | "settings";

export default function LiveRoundViewer({ roundId }: LiveRoundViewerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUserId = auth.currentUser?.uid || "";
  const { round, isLoading, error, isLive, currentHole, leaderboard } = useLiveRound(roundId);
  const { messages, isLoading: chatLoading, sendMessage } = useRoundChat(roundId);

  const [activeTab, setActiveTab] = useState<ViewerTab>("scorecard");
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatListRef = useRef<FlatList<ChatMessage>>(null);

  const format = round ? getFormatById(round.formatId) : null;
  const isMarker = round?.markerId === currentUserId;
  const isPlayer = round?.players?.some((p) => p.playerId === currentUserId) ?? false;

  // ── Send chat message ─────────────────────────────────────
  const handleSendMessage = useCallback(async () => {
    if (!chatInput.trim() || sending) return;
    setSending(true);
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const user = auth.currentUser;
      const playerInfo = round?.players?.find((p) => p.playerId === currentUserId);
      const displayName = playerInfo?.displayName || user?.displayName || "User";
      const avatar = playerInfo?.avatar;
      await sendMessage(currentUserId, displayName, avatar, chatInput.trim());
      setChatInput("");
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (e) {
      console.error("Send message error:", e);
    } finally {
      setSending(false);
    }
  }, [chatInput, sending, currentUserId, round, sendMessage]);

  // ── Settings actions ────────────────────────────────────────
  const handleTakeOverMarker = () => {
    if (!isPlayer || isMarker) return;
    Alert.alert(
      "Take Over Scoring",
      "This will make you the scorekeeper for this round. The current marker will be notified.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Take Over",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "rounds", roundId), {
                markerId: currentUserId,
                markerTransferredAt: serverTimestamp(),
                previousMarkerId: round?.markerId,
              });
              soundPlayer.play("click");
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              // Navigate new marker into the scoring screen in resume mode
              router.replace(`/scoring?roundId=${roundId}&resume=true` as any);
            } catch (err) {
              console.error("Marker transfer error:", err);
              Alert.alert("Error", "Failed to transfer marker. Try again.");
            }
          },
        },
      ]
    );
  };

  const handleTogglePrivacy = () => {
    if (!isMarker) return;
    Alert.alert(
      "Round Visibility",
      "Choose who can see your live round.",
      [
        { text: "Public", onPress: async () => { await updateDoc(doc(db, "rounds", roundId), { privacy: "public" }); soundPlayer.play("click"); } },
        { text: "Partners Only", onPress: async () => { await updateDoc(doc(db, "rounds", roundId), { privacy: "partners" }); soundPlayer.play("click"); } },
        { text: "Private", onPress: async () => { await updateDoc(doc(db, "rounds", roundId), { privacy: "private" }); soundPlayer.play("click"); } },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const handleAbandonRound = () => {
    if (!isMarker) return;
    Alert.alert(
      "Abandon Round?",
      "This will end the round without saving scores. This cannot be undone.",
      [
        { text: "Keep Playing", style: "cancel" },
        {
          text: "Abandon",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "rounds", roundId), {
                status: "abandoned",
                abandonedAt: serverTimestamp(),
                abandonedBy: currentUserId,
              });
              soundPlayer.play("click");
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              router.back();
            } catch (err) {
              Alert.alert("Error", "Failed to abandon round.");
            }
          },
        },
      ]
    );
  };

  const handleEditScores = () => {
    if (!isMarker) return;
    Alert.alert(
      "Edit Scores",
      "Open the scorecard in edit mode? You can correct any scores that were entered incorrectly.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Edit",
          onPress: () => router.push(`/scoring?roundId=${roundId}&edit=true` as any),
        },
      ]
    );
  };

  // ── Render helpers ──────────────────────────────────────────
  const renderChatMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const isMe = item.userId === currentUserId;
      return (
        <View style={[s.msgRow, isMe && s.msgRowMe]}>
          {!isMe && (
            <View style={s.msgAvatarWrap}>
              {item.avatar ? (
                <Image source={{ uri: item.avatar }} style={s.msgAvatar} />
              ) : (
                <View style={[s.msgAvatar, s.msgAvatarPlaceholder]}>
                  <Text style={s.msgAvatarText}>
                    {item.displayName?.charAt(0)?.toUpperCase() || "?"}
                  </Text>
                </View>
              )}
            </View>
          )}
          <View style={[s.msgBubble, isMe && s.msgBubbleMe]}>
            {!isMe && <Text style={s.msgSender}>{item.displayName}</Text>}
            <Text style={[s.msgText, isMe && s.msgTextMe]}>{item.content}</Text>
          </View>
        </View>
      );
    },
    [currentUserId]
  );

  const renderLeaderboardEntry = (entry: LeaderboardEntry, index: number) => (
    <View key={entry.playerId} style={[s.lbRow, index === 0 && s.lbRowFirst]}>
      <Text style={s.lbPosition}>{index + 1}</Text>
      <View style={s.lbPlayerInfo}>
        {entry.avatar ? (
          <Image source={{ uri: entry.avatar }} style={s.lbAvatar} />
        ) : (
          <View style={[s.lbAvatar, s.lbAvatarPlaceholder]}>
            <Text style={s.lbAvatarText}>{entry.displayName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View>
          <Text style={[s.lbName, index === 0 && s.lbNameFirst]}>{entry.displayName}</Text>
          <Text style={s.lbThru}>Thru {entry.thru}</Text>
        </View>
      </View>
      <Text style={[s.lbScore, index === 0 && s.lbScoreFirst]}>{entry.displayValue}</Text>
    </View>
  );

  // ── Loading / Error ─────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={HEADER_GREEN} />
        <Text style={s.loadingText}>Loading round...</Text>
      </View>
    );
  }

  if (error || !round) {
    return (
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={48} color="#CC3333" />
        <Text style={s.errorText}>{error || "Round not found"}</Text>
        <TouchableOpacity style={s.backButton} onPress={() => router.back()}>
          <Text style={s.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const privacyLabel = round.privacy === "partners" ? "Partners Only" : round.privacy === "private" ? "Private" : "Public";

  // ── Render ──────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Status bar background */}
      <View style={{ backgroundColor: HEADER_GREEN, height: insets.top }} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.headerBack} onPress={() => { soundPlayer.play("click"); router.back(); }}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <View style={s.headerTop}>
            <Text style={s.headerCourse} numberOfLines={1}>{round.courseName}</Text>
            {isLive && (
              <View style={s.liveBadge}>
                <View style={s.liveDot} />
                <Text style={s.liveText}>LIVE</Text>
              </View>
            )}
            {!isLive && round.status !== "abandoned" && (
              <View style={s.completeBadge}><Text style={s.completeText}>COMPLETE</Text></View>
            )}
            {round.status === "abandoned" && (
              <View style={s.abandonedBadge}><Text style={s.abandonedText}>ABANDONED</Text></View>
            )}
          </View>
          <Text style={s.headerFormat}>
            {format?.name || "Stroke Play"} • {round.holeCount} Holes • Hole {currentHole}
          </Text>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={s.tabBar}>
        {(["scorecard", "chat", "settings"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && s.tabActive]}
            onPress={() => { soundPlayer.play("click"); setActiveTab(tab); }}
          >
            {tab === "scorecard" ? (
              <Image
                source={scorecardIcon}
                style={{ width: 16, height: 16, tintColor: activeTab === tab ? "#FFF" : "#888" }}
              />
            ) : (
              <Ionicons
                name={tab === "chat" ? "chatbubble-outline" : "settings-outline"}
                size={16}
                color={activeTab === tab ? "#FFF" : "#888"}
              />
            )}
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab === "scorecard" ? "Scorecard" : tab === "chat" ? `Chat${messages.length > 0 ? ` (${messages.length})` : ""}` : "Settings"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Scorecard Tab */}
      {activeTab === "scorecard" && (
        <View style={s.tabContent}>
          <View style={s.leaderboard}>
            <Text style={s.lbTitle}>Leaderboard</Text>
            {leaderboard.map((entry, idx) => renderLeaderboardEntry(entry, idx))}
          </View>
          <MultiplayerScorecard
            mode="view"
            formatId={round.formatId}
            players={round.players}
            holeCount={round.holeCount as 9 | 18}
            holes={round.players[0]?.tee?.holes || []}
            holeData={round.holeData || {}}
          />
        </View>
      )}

      {/* Chat Tab */}
      {activeTab === "chat" && (
        <View style={s.chatContainer}>
          <FlatList
            ref={chatListRef}
            data={messages}
            renderItem={renderChatMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.chatList}
            onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={s.chatEmpty}>
                <Ionicons name="chatbubble-ellipses-outline" size={40} color="#CCC" />
                <Text style={s.chatEmptyText}>
                  {isLive ? "No messages yet. Cheer on the group!" : "This round has ended. Chat is read-only."}
                </Text>
              </View>
            }
          />
          {isLive && (
            <View style={[s.chatInputBar, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
              <TextInput
                style={s.chatInput}
                placeholder="Send a message..."
                placeholderTextColor="#999"
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={handleSendMessage}
                returnKeyType="send"
                maxLength={280}
              />
              <TouchableOpacity
                style={[s.sendBtn, !chatInput.trim() && s.sendBtnDisabled]}
                onPress={handleSendMessage}
                disabled={!chatInput.trim() || sending}
              >
                {sending ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send" size={18} color="#FFF" />}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <ScrollView style={s.settingsContainer} contentContainerStyle={s.settingsContent}>
          {/* Round Info Card */}
          <Text style={s.settingsSection}>Round Info</Text>
          <View style={s.settingsCard}>
            {[
              ["Marker", `${round.players.find((p) => p.playerId === round.markerId)?.displayName || "Unknown"}${isMarker ? " (You)" : ""}`],
              ["Players", `${round.players.length}`],
              ["Format", format?.name || "Stroke Play"],
              ["Visibility", privacyLabel],
            ].map(([label, value], i, arr) => (
              <View key={label} style={[s.infoRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={s.infoLabel}>{label}</Text>
                <Text style={s.infoValue}>{value}</Text>
              </View>
            ))}
          </View>

          {/* Live Actions */}
          {isLive && (
            <>
              <Text style={s.settingsSection}>Actions</Text>
              <View style={s.settingsCard}>
                {isPlayer && !isMarker && (
                  <TouchableOpacity style={s.actionRow} onPress={handleTakeOverMarker}>
                    <View style={s.actionIcon}>
                      <Ionicons name="swap-horizontal-outline" size={20} color={HEADER_GREEN} />
                    </View>
                    <View style={s.actionInfo}>
                      <Text style={s.actionLabel}>Take Over Scoring</Text>
                      <Text style={s.actionSub}>Become the scorekeeper for this round</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#CCC" />
                  </TouchableOpacity>
                )}
                {isMarker && (
                  <TouchableOpacity style={s.actionRow} onPress={handleEditScores}>
                    <View style={s.actionIcon}>
                      <Ionicons name="pencil-outline" size={20} color={HEADER_GREEN} />
                    </View>
                    <View style={s.actionInfo}>
                      <Text style={s.actionLabel}>Edit Scores</Text>
                      <Text style={s.actionSub}>Correct scores entered incorrectly</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#CCC" />
                  </TouchableOpacity>
                )}
                {isMarker && (
                  <TouchableOpacity style={s.actionRow} onPress={handleTogglePrivacy}>
                    <View style={s.actionIcon}>
                      <Ionicons name={round.privacy === "partners" ? "lock-closed-outline" : "globe-outline"} size={20} color={HEADER_GREEN} />
                    </View>
                    <View style={s.actionInfo}>
                      <Text style={s.actionLabel}>Round Visibility</Text>
                      <Text style={s.actionSub}>Currently: {privacyLabel}</Text>
                    </View>
                    <Text style={s.actionRight}>{privacyLabel}</Text>
                  </TouchableOpacity>
                )}
                {isMarker && (
                  <TouchableOpacity style={[s.actionRow, { borderBottomWidth: 0 }]} onPress={handleAbandonRound}>
                    <View style={[s.actionIcon, { backgroundColor: "rgba(204,51,51,0.08)" }]}>
                      <Ionicons name="close-circle-outline" size={20} color="#CC3333" />
                    </View>
                    <View style={s.actionInfo}>
                      <Text style={[s.actionLabel, { color: "#CC3333" }]}>Abandon Round</Text>
                      <Text style={s.actionSub}>End round without saving scores</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#CCC" />
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* Post-Round Actions */}
          {!isLive && round.status === "complete" && isMarker && (
            <>
              <Text style={s.settingsSection}>Post-Round</Text>
              <View style={s.settingsCard}>
                <TouchableOpacity style={[s.actionRow, { borderBottomWidth: 0 }]} onPress={handleEditScores}>
                  <View style={s.actionIcon}>
                    <Ionicons name="pencil-outline" size={20} color={HEADER_GREEN} />
                  </View>
                  <View style={s.actionInfo}>
                    <Text style={s.actionLabel}>Edit Scores</Text>
                    <Text style={s.actionSub}>Correct any scoring errors</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#CCC" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: CREAM, padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14, color: "#888" },
  errorText: { marginTop: 12, fontSize: 16, color: "#CC3333", textAlign: "center" },
  backButton: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: HEADER_GREEN, borderRadius: 8 },
  backButtonText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

  // Header
  header: { flexDirection: "row", alignItems: "center", backgroundColor: HEADER_GREEN, paddingTop: 8, paddingBottom: 14, paddingHorizontal: 12, gap: 8 },
  headerBack: { padding: 6 },
  headerInfo: { flex: 1 },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerCourse: { fontSize: 18, fontWeight: "700", color: "#FFF", fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", flex: 1 },
  headerFormat: { fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 3 },

  // Badges
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#4CAF50" },
  liveText: { fontSize: 10, fontWeight: "800", color: "#4CAF50", letterSpacing: 0.5 },
  completeBadge: { backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  completeText: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.7)" },
  abandonedBadge: { backgroundColor: "rgba(204,51,51,0.15)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  abandonedText: { fontSize: 10, fontWeight: "700", color: "#CC3333" },

  // Tab Bar
  tabBar: { flexDirection: "row", backgroundColor: "#FFF", paddingVertical: 8, paddingHorizontal: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: "#E8E4DA" },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: "#F0EDE4" },
  tabActive: { backgroundColor: HEADER_GREEN },
  tabText: { fontSize: 13, fontWeight: "600", color: "#888" },
  tabTextActive: { color: "#FFF" },
  tabContent: { flex: 1 },

  // Leaderboard
  leaderboard: { backgroundColor: "#FFFCF0", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E8E4DA" },
  lbTitle: { fontSize: 13, fontWeight: "700", color: HEADER_GREEN, fontFamily: Platform.OS === "ios" ? "Georgia" : "serif", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  lbRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E8E4DA" },
  lbRowFirst: { borderBottomWidth: 0 },
  lbPosition: { width: 24, fontSize: 14, fontWeight: "700", color: "#888", textAlign: "center" },
  lbPlayerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, marginLeft: 8 },
  lbAvatar: { width: 28, height: 28, borderRadius: 14 },
  lbAvatarPlaceholder: { backgroundColor: "#E8F5E9", justifyContent: "center", alignItems: "center" },
  lbAvatarText: { fontSize: 12, fontWeight: "700", color: HEADER_GREEN },
  lbName: { fontSize: 14, fontWeight: "600", color: "#333" },
  lbNameFirst: { fontWeight: "800", color: HEADER_GREEN },
  lbThru: { fontSize: 11, color: "#999" },
  lbScore: { fontSize: 16, fontWeight: "700", color: "#333", minWidth: 60, textAlign: "right" },
  lbScoreFirst: { color: HEADER_GREEN, fontWeight: "800", fontSize: 18 },

  // Chat
  chatContainer: { flex: 1, backgroundColor: CREAM },
  chatList: { padding: 12, paddingBottom: 8 },
  chatEmpty: { alignItems: "center", paddingVertical: 60 },
  chatEmptyText: { fontSize: 14, color: "#999", textAlign: "center", marginTop: 12, maxWidth: 220 },
  msgRow: { flexDirection: "row", marginBottom: 10, alignItems: "flex-end" },
  msgRowMe: { flexDirection: "row-reverse" },
  msgAvatarWrap: { marginRight: 8 },
  msgAvatar: { width: 28, height: 28, borderRadius: 14 },
  msgAvatarPlaceholder: { backgroundColor: "#E8E4DA", justifyContent: "center", alignItems: "center" },
  msgAvatarText: { fontSize: 11, fontWeight: "700", color: "#888" },
  msgBubble: { maxWidth: "72%", backgroundColor: "#FFF", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderBottomLeftRadius: 4 },
  msgBubbleMe: { backgroundColor: HEADER_GREEN, borderBottomLeftRadius: 16, borderBottomRightRadius: 4 },
  msgSender: { fontSize: 11, fontWeight: "700", color: WALNUT, marginBottom: 3 },
  msgText: { fontSize: 14, color: "#333", lineHeight: 20 },
  msgTextMe: { color: "#FFF" },
  chatInputBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: "#E8E4DA", gap: 8 },
  chatInput: { flex: 1, backgroundColor: "#F5F2EB", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, fontSize: 15, maxHeight: 80 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: HEADER_GREEN, justifyContent: "center", alignItems: "center" },
  sendBtnDisabled: { opacity: 0.4 },

  // Settings
  settingsContainer: { flex: 1, backgroundColor: CREAM },
  settingsContent: { padding: 16, paddingBottom: 40 },
  settingsSection: { fontSize: 12, fontWeight: "700", color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 16, marginLeft: 4 },
  settingsCard: { backgroundColor: "#FFF", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#E8E4DA" },

  // Settings Info Rows
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E8E4DA" },
  infoLabel: { fontSize: 14, color: "#888" },
  infoValue: { fontSize: 14, fontWeight: "600", color: "#333" },

  // Settings Action Rows
  actionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E8E4DA" },
  actionIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(20,122,82,0.08)", justifyContent: "center", alignItems: "center" },
  actionInfo: { flex: 1 },
  actionLabel: { fontSize: 15, fontWeight: "600", color: "#333" },
  actionSub: { fontSize: 12, color: "#999", marginTop: 1 },
  actionRight: { fontSize: 13, fontWeight: "600", color: HEADER_GREEN },
});