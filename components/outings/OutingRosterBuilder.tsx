/**
 * OutingRosterBuilder — Add players to an outing roster
 *
 * Two modes of adding players:
 *   1. Bulk add from partners list (multi-select checkboxes)
 *   2. Individual add via AddPlayerModal (search + ghost)
 *
 * All players default to the organizer's tee. Tee changes happen
 * per-player in OutingGroupCard after group assignment.
 *
 * Context-agnostic: leagues pass pre-filled rosters and skip this.
 *
 * Fixes:
 *   - Uses onAddUsers (batch) to avoid stale-closure roster overwrites
 *   - Passes maxSelect so AddPlayerModal allows up to remaining slots
 *
 * File: components/outings/OutingRosterBuilder.tsx
 */

import { calculateCourseHandicap } from "@/components/leagues/post-score/helpers";
import type { TeeOption } from "@/components/leagues/post-score/types";
import AddPlayerModal, { type SearchResult } from "@/components/scoring/AddPlayerModal";
import { auth, db } from "@/constants/firebaseConfig";
import type { OutingPlayer } from "@/constants/outingTypes";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const GREEN = "#0D5C3A";

interface Partner {
  odcuserId: string;
  odcuserName: string;
  odcuserAvatar?: string;
  handicapIndex?: number;
}

interface OutingRosterBuilderProps {
  /** Current roster (organizer is always first) */
  roster: OutingPlayer[];
  /** Called when roster changes */
  onRosterChange: (roster: OutingPlayer[]) => void;
  /** Max players allowed in the outing */
  maxPlayers: number;
  /** The organizer's user ID (cannot be removed) */
  organizerId: string;
  /** Default tee to assign to new players */
  defaultTee: TeeOption;
  /** Hole count for handicap calculations */
  holeCount: 9 | 18;
  /** Default handicap for players with no data */
  defaultHandicap?: number;
}

export default function OutingRosterBuilder({
  roster,
  onRosterChange,
  maxPlayers,
  organizerId,
  defaultTee,
  holeCount,
  defaultHandicap = 20,
}: OutingRosterBuilderProps) {
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [showIndividualAdd, setShowIndividualAdd] = useState(false);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState("");

  const canAddMore = roster.length < maxPlayers;
  const existingIds = new Set(roster.map((p) => p.playerId));

  /** Build an OutingPlayer with default tee */
  const buildPlayer = useCallback(
    (id: string, name: string, avatar: string | undefined, handicap: number, isGhost: boolean, contactInfo?: string, contactType?: "phone" | "email"): OutingPlayer => ({
      playerId: id,
      displayName: name,
      avatar,
      isGhost,
      handicapIndex: handicap,
      courseHandicap: calculateCourseHandicap(handicap, defaultTee.slope_rating, holeCount),
      tee: defaultTee,
      teeName: defaultTee.tee_name,
      slopeRating: defaultTee.slope_rating,
      courseRating: defaultTee.course_rating,
      groupId: null,
      isGroupMarker: false,
      contactInfo,
      contactType,
    }),
    [defaultTee, holeCount]
  );

  // ── Load partners for bulk add ──
  const loadPartners = useCallback(async () => {
    setLoadingPartners(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      const partnerIds: string[] = userDoc.data()?.partners || [];
      if (partnerIds.length === 0) {
        setPartners([]);
        setLoadingPartners(false);
        return;
      }

      const results: Partner[] = [];
      for (let i = 0; i < partnerIds.length; i += 10) {
        const batch = partnerIds.slice(i, i + 10);
        const q = query(collection(db, "users"), where("__name__", "in", batch));
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          const data = d.data();
          results.push({
            odcuserId: d.id,
            odcuserName: data.displayName || "Unknown",
            odcuserAvatar: data.avatar,
            handicapIndex: data.handicapIndex ?? defaultHandicap,
          });
        });
      }

      results.sort((a, b) => a.odcuserName.localeCompare(b.odcuserName));
      setPartners(results);
    } catch (err) {
      console.error("Failed to load partners:", err);
    } finally {
      setLoadingPartners(false);
    }
  }, [defaultHandicap]);

  // ── Toggle partner selection ──
  const togglePartner = (partnerId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(partnerId)) {
        next.delete(partnerId);
      } else {
        if (next.size + 1 > maxPlayers - roster.length) return prev;
        next.add(partnerId);
      }
      return next;
    });
  };

  // ── Confirm bulk add ──
  const handleBulkConfirm = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const newPlayers: OutingPlayer[] = [];
    selectedIds.forEach((id) => {
      if (existingIds.has(id)) return;
      const partner = partners.find((p) => p.odcuserId === id);
      if (!partner) return;
      newPlayers.push(
        buildPlayer(partner.odcuserId, partner.odcuserName, partner.odcuserAvatar, partner.handicapIndex ?? defaultHandicap, false)
      );
    });

    onRosterChange([...roster, ...newPlayers]);
    setSelectedIds(new Set());
    setShowBulkAdd(false);
  };

  // ── Batch add from AddPlayerModal (all selected players at once) ──
  const handleAddUsers = useCallback(
    (users: SearchResult[]) => {
      const newPlayers: OutingPlayer[] = users
        .filter((u) => !existingIds.has(u.userId))
        .map((u) =>
          buildPlayer(
            u.userId,
            u.displayName,
            u.avatar || undefined,
            u.handicapIndex ?? defaultHandicap,
            false
          )
        );
      if (newPlayers.length > 0) {
        onRosterChange([...roster, ...newPlayers]);
      }
    },
    [roster, existingIds, buildPlayer, defaultHandicap, onRosterChange]
  );

  // ── Legacy per-user fallback (kept for compatibility but unused now) ──
  const handleAddUser = useCallback(
    (user: SearchResult) => {
      if (existingIds.has(user.userId)) return;
      onRosterChange([
        ...roster,
        buildPlayer(user.userId, user.displayName, user.avatar || undefined, user.handicapIndex ?? defaultHandicap, false),
      ]);
    },
    [roster, existingIds, buildPlayer, defaultHandicap, onRosterChange]
  );

  // ── Individual add (ghost) ──
  const handleAddGhost = useCallback(
    (ghost: { name: string; handicapIndex: number; contactInfo?: string; contactType?: "phone" | "email" }) => {
      const ghostId = `ghost_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      onRosterChange([
        ...roster,
        buildPlayer(ghostId, ghost.name, undefined, ghost.handicapIndex, true, ghost.contactInfo, ghost.contactType),
      ]);
    },
    [roster, buildPlayer, onRosterChange]
  );

  // ── Remove player ──
  const handleRemove = useCallback(
    (playerId: string) => {
      if (playerId === organizerId) return;
      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onRosterChange(roster.filter((p) => p.playerId !== playerId));
    },
    [roster, organizerId, onRosterChange]
  );

  const filteredPartners = partners.filter((p) => {
    if (existingIds.has(p.odcuserId)) return false;
    if (!searchText) return true;
    return p.odcuserName.toLowerCase().includes(searchText.toLowerCase());
  });

  const slotsRemaining = maxPlayers - roster.length;

  return (
    <View>
      {/* Roster count */}
      <View style={s.rosterHeader}>
        <Text style={s.rosterTitle}>Roster ({roster.length}/{maxPlayers})</Text>
        {slotsRemaining > 0 && (
          <Text style={s.rosterSlots}>{slotsRemaining} spot{slotsRemaining !== 1 ? "s" : ""} left</Text>
        )}
      </View>

      {/* Player chips */}
      <View style={s.chipGrid}>
        {roster.map((player) => {
          const isOrganizer = player.playerId === organizerId;
          return (
            <View key={player.playerId} style={s.chip}>
              {player.avatar ? (
                <Image source={{ uri: player.avatar }} style={s.chipAvatar} />
              ) : (
                <View style={[s.chipAvatar, s.chipAvatarFallback]}>
                  <Text style={s.chipAvatarText}>{player.displayName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={s.chipName} numberOfLines={1}>{player.displayName}</Text>
              {isOrganizer && <View style={s.organizerTag}><Text style={s.organizerTagText}>You</Text></View>}
              {player.isGhost && <View style={s.ghostTag}><Text style={s.ghostTagText}>Guest</Text></View>}
              {!isOrganizer && (
                <TouchableOpacity style={s.chipRemove} onPress={() => handleRemove(player.playerId)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color="#CC3333" />
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

      {/* Add buttons */}
      {canAddMore && (
        <View style={s.addButtons}>
          <TouchableOpacity style={s.addBtn} onPress={() => { soundPlayer.play("click"); loadPartners(); setShowBulkAdd(true); }}>
            <Ionicons name="people-outline" size={20} color={GREEN} />
            <Text style={s.addBtnText}>Add Partners</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={() => { soundPlayer.play("click"); setShowIndividualAdd(true); }}>
            <Ionicons name="person-add-outline" size={20} color={GREEN} />
            <Text style={s.addBtnText}>Add Player</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Bulk Add Modal ── */}
      <Modal visible={showBulkAdd} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Add Partners</Text>
                <Text style={s.modalSubtitle}>{selectedIds.size} selected • {slotsRemaining} spot{slotsRemaining !== 1 ? "s" : ""} available</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowBulkAdd(false); setSelectedIds(new Set()); setSearchText(""); }}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={s.searchBar}>
              <Ionicons name="search" size={18} color="#999" />
              <TextInput style={s.searchInput} placeholder="Search partners..." placeholderTextColor="#999" value={searchText} onChangeText={setSearchText} autoCorrect={false} />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={() => setSearchText("")}><Ionicons name="close-circle" size={18} color="#999" /></TouchableOpacity>
              )}
            </View>

            {loadingPartners ? (
              <View style={s.loadingWrap}><ActivityIndicator color={GREEN} /><Text style={s.loadingText}>Loading partners...</Text></View>
            ) : filteredPartners.length === 0 ? (
              <View style={s.emptyWrap}><Ionicons name="people-outline" size={40} color="#CCC" /><Text style={s.emptyText}>{partners.length === 0 ? "No partners yet" : "All partners already added"}</Text></View>
            ) : (
              <FlatList
                data={filteredPartners}
                keyExtractor={(item) => item.odcuserId}
                style={s.partnerList}
                renderItem={({ item }) => {
                  const isSelected = selectedIds.has(item.odcuserId);
                  const isDisabled = !isSelected && selectedIds.size >= slotsRemaining;
                  return (
                    <TouchableOpacity style={[s.partnerRow, isDisabled && s.partnerRowDisabled]} onPress={() => !isDisabled && togglePartner(item.odcuserId)} activeOpacity={isDisabled ? 1 : 0.6}>
                      <View style={[s.checkbox, isSelected && s.checkboxActive]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                      </View>
                      {item.odcuserAvatar ? (
                        <Image source={{ uri: item.odcuserAvatar }} style={s.partnerAvatar} />
                      ) : (
                        <View style={[s.partnerAvatar, s.partnerAvatarFallback]}>
                          <Text style={s.partnerAvatarText}>{item.odcuserName.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={s.partnerInfo}>
                        <Text style={s.partnerName}>{item.odcuserName}</Text>
                        <Text style={s.partnerHcp}>HCP {(item.handicapIndex ?? defaultHandicap).toFixed(1)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            {selectedIds.size > 0 && (
              <View style={s.bulkConfirmBar}>
                <TouchableOpacity style={s.bulkConfirmBtn} onPress={handleBulkConfirm}>
                  <Text style={s.bulkConfirmText}>Add {selectedIds.size} Player{selectedIds.size !== 1 ? "s" : ""}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Individual Add Modal ── */}
      <AddPlayerModal
        visible={showIndividualAdd}
        onClose={() => setShowIndividualAdd(false)}
        onAddUser={handleAddUser}
        onAddUsers={handleAddUsers}
        onAddGhost={handleAddGhost}
        markerId={organizerId}
        existingPlayerIds={[...existingIds]}
        maxSelect={slotsRemaining}
      />
    </View>
  );
}

const s = StyleSheet.create({
  rosterHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  rosterTitle: { fontSize: 16, fontWeight: "700", color: "#333", fontFamily: Platform.OS === "ios" ? "Georgia" : "serif" },
  rosterSlots: { fontSize: 13, color: "#999" },
  chipGrid: { gap: 8, marginBottom: 14 },
  chip: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#E8E4DA", gap: 10 },
  chipAvatar: { width: 34, height: 34, borderRadius: 17 },
  chipAvatarFallback: { backgroundColor: "#E8F5E9", justifyContent: "center", alignItems: "center" },
  chipAvatarText: { fontSize: 14, fontWeight: "700", color: GREEN },
  chipName: { fontSize: 15, fontWeight: "600", color: "#333", flex: 1 },
  chipRemove: { padding: 2 },
  organizerTag: { backgroundColor: GREEN, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  organizerTagText: { fontSize: 10, fontWeight: "700", color: "#FFF" },
  ghostTag: { backgroundColor: "#E8E4DA", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  ghostTagText: { fontSize: 10, fontWeight: "700", color: "#888" },
  addButtons: { flexDirection: "row", gap: 10, marginBottom: 14 },
  addBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 2, borderColor: GREEN, borderStyle: "dashed" },
  addBtnText: { fontSize: 14, fontWeight: "700", color: GREEN },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%", paddingBottom: Platform.OS === "ios" ? 40 : 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E8E4DA" },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#333", fontFamily: Platform.OS === "ios" ? "Georgia" : "serif" },
  modalSubtitle: { fontSize: 13, color: "#999", marginTop: 2 },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#F5F2EB", marginHorizontal: 16, marginVertical: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === "ios" ? 10 : 6, borderRadius: 10, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, color: "#333", padding: 0 },
  partnerList: { maxHeight: 400 },
  partnerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#F0EDE4", gap: 12 },
  partnerRowDisabled: { opacity: 0.4 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#CCC", justifyContent: "center", alignItems: "center" },
  checkboxActive: { backgroundColor: GREEN, borderColor: GREEN },
  partnerAvatar: { width: 40, height: 40, borderRadius: 20 },
  partnerAvatarFallback: { backgroundColor: "#E8F5E9", justifyContent: "center", alignItems: "center" },
  partnerAvatarText: { fontSize: 16, fontWeight: "700", color: GREEN },
  partnerInfo: { flex: 1 },
  partnerName: { fontSize: 15, fontWeight: "600", color: "#333" },
  partnerHcp: { fontSize: 12, color: "#999", marginTop: 2 },
  loadingWrap: { alignItems: "center", paddingVertical: 40, gap: 10 },
  loadingText: { fontSize: 14, color: "#999" },
  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, color: "#999" },
  bulkConfirmBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E8E4DA" },
  bulkConfirmBtn: { backgroundColor: GREEN, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  bulkConfirmText: { fontSize: 16, fontWeight: "700", color: "#FFF" },
});