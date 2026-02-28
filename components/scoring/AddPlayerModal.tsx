/**
 * AddPlayerModal — Hierarchical partner selection + guest entry
 *
 * Two tabs:
 *   "Find Player" — sections: My Foursome → Usual Suspects → Partners
 *                   search bar with dropdown overlay, multi-select
 *   "Add Guest"   — manual name/handicap/contact entry (unchanged)
 *
 * Data sources (from PartnersModal):
 *   - foursomePartners[]    → "My Foursome" section
 *   - favoritedPartners[]   → "Usual Suspects" section
 *   - partners collection   → "Partners" section (minus above)
 *
 * Fixes:
 *   - zIndex on searchSection only when dropdown visible (touch fix)
 *   - remainingSlots uses maxSelect prop (not hardcoded 4)
 *   - onAddUsers (batch) callback to avoid stale-closure overwrites
 *
 * File: components/scoring/AddPlayerModal.tsx
 */

import { db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import PlayerRow, { type PlayerRowUser } from "./PlayerRow";

// ============================================================================
// COLORS
// ============================================================================

const GREEN = "#0D5C3A";

// ============================================================================
// TYPES
// ============================================================================

/** Kept for backwards compatibility with GroupSetup.handleAddUser */
export interface SearchResult {
  userId: string;
  displayName: string;
  avatar: string | null;
  handicapIndex: number;
  isPartner: boolean;
  earnedChallengeBadges?: string[];
}

interface SectionData {
  title: string;
  icon: string;
  data: PlayerRowUser[];
}

interface AddPlayerModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called once per player — used by foursome GroupSetup (legacy) */
  onAddUser: (user: SearchResult) => void;
  /** Called once with ALL selected players — preferred for batch adds (outings) */
  onAddUsers?: (users: SearchResult[]) => void;
  /** Called when a ghost player is added */
  onAddGhost: (ghost: {
    name: string;
    handicapIndex: number;
    contactInfo?: string;
    contactType?: "phone" | "email";
  }) => void;
  /** Current user's ID */
  markerId: string;
  /** Player IDs already in the round */
  existingPlayerIds: string[];
  /** Max selectable players — defaults to 3 */
  maxSelect?: number;
}

// ============================================================================
// HELPER — fetch user profiles from array of IDs
// ============================================================================

async function fetchProfiles(
  userIds: string[],
  excludeIds: Set<string>
): Promise<PlayerRowUser[]> {
  const filtered = userIds.filter((id) => !excludeIds.has(id));
  console.log("🔍 fetchProfiles — input:", userIds.length, "after filter:", filtered.length);
  if (filtered.length === 0) return [];

  const profiles: PlayerRowUser[] = [];
  for (const uid of filtered) {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) continue;
      const d = snap.data();
      profiles.push({
        userId: uid,
        displayName: d.displayName || "Unknown",
        avatar: d.avatar || null,
        handicapIndex: parseFloat(d.handicap) || 0,
        earnedChallengeBadges: d.earnedChallengeBadges || [],
        isPartner: true,
      });
    } catch {
      // skip
    }
  }
  return profiles;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AddPlayerModal({
  visible,
  onClose,
  onAddUser,
  onAddUsers,
  onAddGhost,
  markerId,
  existingPlayerIds,
  maxSelect = 3,
}: AddPlayerModalProps) {
  console.log("🔍 AddPlayerModal render — visible:", visible, "markerId:", markerId);
  
  const [addMode, setAddMode] = useState<"user" | "ghost">("user");

  // Multi-select state
  const [selectedUsers, setSelectedUsers] = useState<PlayerRowUser[]>([]);

  // Section data
  const [foursomeUsers, setFoursomeUsers] = useState<PlayerRowUser[]>([]);
  const [usualSuspects, setUsualSuspects] = useState<PlayerRowUser[]>([]);
  const [partnerUsers, setPartnerUsers] = useState<PlayerRowUser[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [sectionsLoaded, setSectionsLoaded] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PlayerRowUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Ghost fields
  const [ghostName, setGhostName] = useState("");
  const [ghostContact, setGhostContact] = useState("");
  const [ghostContactType, setGhostContactType] = useState<"phone" | "email">("phone");
  const [ghostHandicap, setGhostHandicap] = useState("");

  // IDs to exclude from all lists (existing round players + currently selected)
  const excludedIds = useMemo(() => {
    const ids = new Set(existingPlayerIds);
    ids.add(markerId);
    selectedUsers.forEach((u) => ids.add(u.userId));
    return ids;
  }, [existingPlayerIds, markerId, selectedUsers]);

  // How many more can be selected — uses maxSelect prop
  const remainingSlots = useMemo(() => {
    return Math.max(0, maxSelect - selectedUsers.length);
  }, [maxSelect, selectedUsers.length]);

  const canSelectMore = remainingSlots > 0;

  // ── Load sections when modal opens ────────────────────────
  useEffect(() => {
    console.log("🔍 AddPlayerModal useEffect — visible:", visible, "sectionsLoaded:", sectionsLoaded);
    if (visible && !sectionsLoaded) {
      loadSections();
    }
  }, [visible]);

  // ── Reset on close ────────────────────────────────────────
  const handleClose = () => {
    setAddMode("user");
    setSearchQuery("");
    setSearchResults([]);
    setShowSearchDropdown(false);
    setSelectedUsers([]);
    setGhostName("");
    setGhostContact("");
    setGhostHandicap("");
    setSectionsLoaded(false);
    onClose();
  };

  // ── Load section data ─────────────────────────────────────
  const loadSections = async () => {
    setLoadingSections(true);
    try {
      console.log("🔍 markerId:", markerId);
      const markerDoc = await getDoc(doc(db, "users", markerId));
      console.log("🔍 markerDoc exists:", markerDoc.exists());
      const markerData = markerDoc.exists() ? markerDoc.data() : {};
      console.log("🔍 foursomePartners:", markerData.foursomePartners);
      console.log("🔍 favoritedPartners:", markerData.favoritedPartners);

      const foursomeIds: string[] = markerData.foursomePartners || [];
      const favoritedIds: string[] = markerData.favoritedPartners || [];

      const baseExclude = new Set(existingPlayerIds);
      baseExclude.add(markerId);
      console.log("🔍 baseExclude:", [...baseExclude]);

      // 1. My Foursome
      const foursome = await fetchProfiles(foursomeIds, baseExclude);
      console.log("🔍 foursome loaded:", foursome.length);
      setFoursomeUsers(foursome);

      // 2. Usual Suspects (minus foursome)
      const foursomeSet = new Set([...foursomeIds, markerId, ...existingPlayerIds]);
      const suspects = await fetchProfiles(favoritedIds, foursomeSet);
      console.log("🔍 suspects loaded:", suspects.length);
      setUsualSuspects(suspects);

      // 3. Partners (minus foursome & suspects)
      const allAbove = new Set([
        markerId,
        ...existingPlayerIds,
        ...foursomeIds,
        ...favoritedIds,
      ]);
      const partnerIds = await fetchPartnerIds(markerId);
      console.log("🔍 partnerIds:", partnerIds);
      const partners = await fetchProfiles(partnerIds, allAbove);
      console.log("🔍 partners loaded:", partners.length);
      setPartnerUsers(partners);

      setSectionsLoaded(true);
    } catch (e: any) {
      console.error("🔍 Load sections ERROR:", e?.code, e?.message, e);
    } finally {
      setLoadingSections(false);
    }
  };

  // ── Fetch partner IDs from partners collection ────────────
  const fetchPartnerIds = async (uid: string): Promise<string[]> => {
    try {
      console.log("🔍 fetchPartnerIds for:", uid);
      const q1 = query(collection(db, "partners"), where("user1Id", "==", uid));
      const q2 = query(collection(db, "partners"), where("user2Id", "==", uid));
      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      console.log("🔍 snap1 size:", snap1.size, "snap2 size:", snap2.size);

      const ids: string[] = [];
      snap1.forEach((d) => ids.push(d.data().user2Id));
      snap2.forEach((d) => ids.push(d.data().user1Id));
      console.log("🔍 partner IDs found:", ids.length, ids);
      return ids;
    } catch (e: any) {
      console.error("🔍 fetchPartnerIds ERROR:", e?.code, e?.message);
      return [];
    }
  };

  // ── Build display sections (filter out already-selected) ──
  const sections: SectionData[] = useMemo(() => {
    const result: SectionData[] = [];
    const filterOut = (users: PlayerRowUser[]) =>
      users.filter((u) => !excludedIds.has(u.userId));

    const f = filterOut(foursomeUsers);
    if (f.length > 0) result.push({ title: "My Foursome", icon: "people", data: f });

    const u = filterOut(usualSuspects);
    if (u.length > 0) result.push({ title: "Usual Suspects", icon: "ribbon", data: u });

    const p = filterOut(partnerUsers);
    if (p.length > 0) result.push({ title: "Partners", icon: "person-add-outline", data: p });

    return result;
  }, [foursomeUsers, usualSuspects, partnerUsers, excludedIds]);

  // ── Search (debounced, auto-fire on 2+ chars) ─────────────
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    const timeout = setTimeout(() => runSearch(searchQuery), 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const runSearch = async (q: string) => {
    setSearching(true);
    try {
      const lower = q.toLowerCase();

      // Search local section data first
      const allLocal = [...foursomeUsers, ...usualSuspects, ...partnerUsers];
      const localMatches = allLocal.filter(
        (u) =>
          u.displayName.toLowerCase().includes(lower) &&
          !excludedIds.has(u.userId)
      );

      // Then broader Firestore query
      const usersRef = collection(db, "users");
      const snap = await getDocs(query(usersRef, limit(100)));
      const localIds = new Set(localMatches.map((m) => m.userId));

      const remoteMatches: PlayerRowUser[] = snap.docs
        .filter((d) => {
          const data = d.data();
          const name = (data.displayName || "").toLowerCase();
          return (
            name.includes(lower) &&
            !excludedIds.has(d.id) &&
            !localIds.has(d.id)
          );
        })
        .map((d) => {
          const data = d.data();
          return {
            userId: d.id,
            displayName: data.displayName || "Unknown",
            avatar: data.avatar || null,
            handicapIndex: parseFloat(data.handicap) || 0,
            earnedChallengeBadges: data.earnedChallengeBadges || [],
            isPartner: false,
          };
        });

      const combined = [...localMatches, ...remoteMatches].slice(0, 10);
      setSearchResults(combined);
      setShowSearchDropdown(combined.length > 0);
    } catch (e) {
      console.error("Search error:", e);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // ── Toggle selection ──────────────────────────────────────
  const toggleSelect = useCallback(
    (user: PlayerRowUser) => {
      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      setSelectedUsers((prev) => {
        const exists = prev.some((u) => u.userId === user.userId);
        if (exists) {
          return prev.filter((u) => u.userId !== user.userId);
        }
        if (!canSelectMore) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          return prev;
        }
        return [...prev, user];
      });

      // Close search dropdown after selecting
      setSearchQuery("");
      setShowSearchDropdown(false);
    },
    [canSelectMore]
  );

  // ── Remove chip ───────────────────────────────────────────
  const removeChip = useCallback((userId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedUsers((prev) => prev.filter((u) => u.userId !== userId));
  }, []);

  // ── Confirm — batch via onAddUsers if available, else per-user fallback
  const handleAddPlayers = useCallback(() => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const batch: SearchResult[] = selectedUsers.map((user) => ({
      userId: user.userId,
      displayName: user.displayName,
      avatar: user.avatar || null,
      handicapIndex: user.handicapIndex || 0,
      isPartner: user.isPartner || false,
      earnedChallengeBadges: user.earnedChallengeBadges,
    }));

    if (onAddUsers) {
      // Batch callback — single call with all players (preferred)
      onAddUsers(batch);
    } else {
      // Legacy per-user fallback (foursome GroupSetup)
      batch.forEach((user) => onAddUser(user));
    }

    handleClose();
  }, [selectedUsers, onAddUser, onAddUsers]);

  // ── Ghost submit (unchanged logic) ────────────────────────
  const handleSubmitGhost = () => {
    if (!ghostName.trim()) return;
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAddGhost({
      name: ghostName.trim(),
      handicapIndex: parseFloat(ghostHandicap) || 0,
      contactInfo: ghostContact.trim() || undefined,
      contactType: ghostContact.trim() ? ghostContactType : undefined,
    });
    handleClose();
  };

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

  const isUserSelected = (userId: string) =>
    selectedUsers.some((u) => u.userId === userId);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView
        style={s.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={handleClose}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Add Players</Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Tab Toggle */}
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tab, addMode === "user" && s.tabActive]}
            onPress={() => { soundPlayer.play("click"); setAddMode("user"); }}
          >
            <Ionicons name="person" size={16} color={addMode === "user" ? "#FFF" : GREEN} />
            <Text style={[s.tabText, addMode === "user" && s.tabTextActive]}>
              Find Player
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, addMode === "ghost" && s.tabActive]}
            onPress={() => { soundPlayer.play("click"); setAddMode("ghost"); }}
          >
            <Ionicons name="person-add" size={16} color={addMode === "ghost" ? "#FFF" : GREEN} />
            <Text style={[s.tabText, addMode === "ghost" && s.tabTextActive]}>
              Add Guest
            </Text>
          </TouchableOpacity>
        </View>

        {/* ══ FIND PLAYER TAB ══════════════════════════════════ */}
        {addMode === "user" && (
          <View style={s.body}>
            {/* Selected Chips */}
            {selectedUsers.length > 0 && (
              <View style={s.chipsContainer}>
                <Text style={s.chipsLabel}>
                  {selectedUsers.length} selected
                  {remainingSlots > 0 ? ` • ${remainingSlots} slot${remainingSlots !== 1 ? "s" : ""} left` : " • Full"}
                </Text>
                <View style={s.chipsRow}>
                  {selectedUsers.map((user) => (
                    <View key={user.userId} style={s.chip}>
                      {user.avatar ? (
                        <Image source={{ uri: user.avatar }} style={s.chipAvatar} />
                      ) : (
                        <View style={s.chipAvatarFallback}>
                          <Text style={s.chipAvatarText}>
                            {user.displayName[0]?.toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <Text style={s.chipName} numberOfLines={1}>
                        {user.displayName}
                      </Text>
                      <TouchableOpacity onPress={() => removeChip(user.userId)} hitSlop={8}>
                        <Ionicons name="close-circle" size={18} color={GREEN} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Search Bar — only elevate zIndex when dropdown is visible */}
            <View style={[s.searchSection, showSearchDropdown && { zIndex: 10 }]}>
              <View style={s.searchBar}>
                <Ionicons name="search" size={18} color="#999" style={{ marginLeft: 12 }} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search by name..."
                  placeholderTextColor="#999"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  returnKeyType="search"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => { setSearchQuery(""); setShowSearchDropdown(false); }}
                    style={{ paddingHorizontal: 10 }}
                  >
                    <Ionicons name="close" size={18} color="#999" />
                  </TouchableOpacity>
                )}
                {searching && (
                  <ActivityIndicator size="small" color={GREEN} style={{ marginRight: 12 }} />
                )}
              </View>

              {/* Search Dropdown Overlay */}
              {showSearchDropdown && searchResults.length > 0 && (
                <View style={s.searchDropdown}>
                  <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                    {searchResults.map((user) => (
                      <PlayerRow
                        key={user.userId}
                        user={user}
                        selected={isUserSelected(user.userId)}
                        showCheckbox
                        compact
                        onPress={() => toggleSelect(user)}
                        disabled={!canSelectMore && !isUserSelected(user.userId)}
                      />
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Sections */}
            <ScrollView
              style={s.sectionScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {loadingSections ? (
                <View style={s.loadingWrap}>
                  <ActivityIndicator size="large" color={GREEN} />
                  <Text style={s.loadingText}>Loading your crew...</Text>
                </View>
              ) : sections.length === 0 && sectionsLoaded ? (
                <View style={s.emptyWrap}>
                  <Ionicons name="people-outline" size={48} color="#CCC" />
                  <Text style={s.emptyText}>No partners yet</Text>
                  <Text style={s.emptySubtext}>
                    Partner up with golfers in the Clubhouse
                  </Text>
                </View>
              ) : (
                sections.map((section) => (
                  <View key={section.title} style={s.sectionBlock}>
                    <View style={s.sectionHeader}>
                      <Ionicons name={section.icon as any} size={16} color={GREEN} />
                      <Text style={s.sectionTitle}>{section.title}</Text>
                    </View>
                    {section.data.map((user) => (
                      <PlayerRow
                        key={user.userId}
                        user={user}
                        selected={isUserSelected(user.userId)}
                        showCheckbox
                        onPress={() => toggleSelect(user)}
                        disabled={!canSelectMore && !isUserSelected(user.userId)}
                      />
                    ))}
                  </View>
                ))
              )}
              <View style={{ height: 100 }} />
            </ScrollView>

            {/* Add Players Button */}
            {selectedUsers.length > 0 && (
              <View style={s.addPlayersBar}>
                <TouchableOpacity style={s.addPlayersBtn} onPress={handleAddPlayers}>
                  <Text style={s.addPlayersBtnText}>
                    Add {selectedUsers.length} Player{selectedUsers.length > 1 ? "s" : ""}
                  </Text>
                  <Ionicons name="checkmark" size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ══ ADD GUEST TAB ════════════════════════════════════ */}
        {addMode === "ghost" && (
          <ScrollView style={s.ghostBody} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>Name *</Text>
            <TextInput
              style={s.fieldInput}
              placeholder="Player name"
              placeholderTextColor="#999"
              value={ghostName}
              onChangeText={setGhostName}
              autoFocus
            />

            <Text style={s.fieldLabel}>Handicap Index</Text>
            <TextInput
              style={s.fieldInput}
              placeholder="0.0 (optional)"
              placeholderTextColor="#999"
              value={ghostHandicap}
              onChangeText={setGhostHandicap}
              keyboardType="decimal-pad"
            />

            <Text style={s.fieldLabel}>Invite After Round (optional)</Text>
            <View style={s.contactTypeRow}>
              <TouchableOpacity
                style={[s.contactTypeBtn, ghostContactType === "phone" && s.contactTypeBtnActive]}
                onPress={() => setGhostContactType("phone")}
              >
                <Ionicons name="call" size={14} color={ghostContactType === "phone" ? "#FFF" : "#666"} />
                <Text style={[s.contactTypeText, ghostContactType === "phone" && s.contactTypeTextActive]}>Phone</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.contactTypeBtn, ghostContactType === "email" && s.contactTypeBtnActive]}
                onPress={() => setGhostContactType("email")}
              >
                <Ionicons name="mail" size={14} color={ghostContactType === "email" ? "#FFF" : "#666"} />
                <Text style={[s.contactTypeText, ghostContactType === "email" && s.contactTypeTextActive]}>Email</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={s.fieldInput}
              placeholder={ghostContactType === "phone" ? "Phone number" : "Email address"}
              placeholderTextColor="#999"
              value={ghostContact}
              onChangeText={setGhostContact}
              keyboardType={ghostContactType === "phone" ? "phone-pad" : "email-address"}
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[s.ghostAddBtn, !ghostName.trim() && { opacity: 0.5 }]}
              onPress={handleSubmitGhost}
              disabled={!ghostName.trim()}
            >
              <Text style={s.ghostAddBtnText}>Add Guest</Text>
              <Ionicons name="add" size={20} color="#FFF" />
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F0" },

  // ── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#333" },

  // ── Tabs ────────────────────────────────────────────────────
  tabRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFF",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F0EDE4",
  },
  tabActive: { backgroundColor: GREEN },
  tabText: { fontSize: 14, fontWeight: "600", color: GREEN },
  tabTextActive: { color: "#FFF" },

  // ── Body (find player) ─────────────────────────────────────
  body: { flex: 1 },

  // ── Chips ───────────────────────────────────────────────────
  chipsContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  chipsLabel: { fontSize: 12, color: "#888", marginBottom: 6 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 20,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(13, 92, 58, 0.2)",
  },
  chipAvatar: { width: 24, height: 24, borderRadius: 12 },
  chipAvatarFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: GREEN,
    justifyContent: "center",
    alignItems: "center",
  },
  chipAvatarText: { color: "#FFF", fontWeight: "700", fontSize: 11 },
  chipName: { fontSize: 13, fontWeight: "600", color: "#333", maxWidth: 90 },

  // ── Search ──────────────────────────────────────────────────
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    // zIndex only applied dynamically when dropdown is visible
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 10,
    height: 44,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#333",
    paddingHorizontal: 10,
    height: "100%",
  },
  searchDropdown: {
    position: "absolute",
    top: 56, // searchBar height + padding
    left: 16,
    right: 16,
    backgroundColor: "#FFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    maxHeight: 240,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
    overflow: "hidden",
  },

  // ── Sections ────────────────────────────────────────────────
  sectionScroll: { flex: 1 },
  sectionBlock: { marginTop: 8 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: GREEN,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  // ── Loading / Empty ─────────────────────────────────────────
  loadingWrap: { alignItems: "center", paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 14, color: "#888" },
  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: "600", color: "#999" },
  emptySubtext: { fontSize: 13, color: "#BBB" },

  // ── Add Players Button ──────────────────────────────────────
  addPlayersBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  addPlayersBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GREEN,
    paddingVertical: 14,
    borderRadius: 12,
  },
  addPlayersBtnText: { fontSize: 16, fontWeight: "700", color: "#FFF" },

  // ── Ghost Body ──────────────────────────────────────────────
  ghostBody: { flex: 1, padding: 16 },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#555",
    marginBottom: 6,
    marginTop: 16,
  },
  fieldInput: {
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    fontSize: 16,
  },
  contactTypeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  contactTypeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F0EDE4",
  },
  contactTypeBtnActive: { backgroundColor: GREEN },
  contactTypeText: { fontSize: 13, fontWeight: "600", color: "#666" },
  contactTypeTextActive: { color: "#FFF" },
  ghostAddBtn: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GREEN,
    paddingVertical: 14,
    borderRadius: 12,
  },
  ghostAddBtnText: { fontSize: 16, fontWeight: "700", color: "#FFF" },
});