/**
 * AddPlayerModal — Search for on-platform users or add guest players
 *
 * Two tabs:
 *   - "Search User": search by name, shows partners first
 *   - "Add Guest": manual entry with name, handicap, contact info
 *
 * File: components/scoring/AddPlayerModal.tsx
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";

// ============================================================================
// COLORS
// ============================================================================

const GREEN = "#0D5C3A";
const HEADER_GREEN = "#147A52";

// ============================================================================
// TYPES
// ============================================================================

export interface SearchResult {
  userId: string;
  displayName: string;
  avatar: string | null;
  handicapIndex: number;
  isPartner: boolean;
}

interface AddPlayerModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called when a user is selected from search */
  onAddUser: (user: SearchResult) => void;
  /** Called when a ghost player is added */
  onAddGhost: (ghost: {
    name: string;
    handicapIndex: number;
    contactInfo?: string;
    contactType?: "phone" | "email";
  }) => void;
  /** Current user's ID — excluded from search results */
  markerId: string;
  /** Player IDs already in the round — excluded from search results */
  existingPlayerIds: string[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AddPlayerModal({
  visible,
  onClose,
  onAddUser,
  onAddGhost,
  markerId,
  existingPlayerIds,
}: AddPlayerModalProps) {
  const [addMode, setAddMode] = useState<"user" | "ghost">("user");

  // User search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Ghost fields
  const [ghostName, setGhostName] = useState("");
  const [ghostContact, setGhostContact] = useState("");
  const [ghostContactType, setGhostContactType] = useState<"phone" | "email">("phone");
  const [ghostHandicap, setGhostHandicap] = useState("");

  // ── Reset state on close ──────────────────────────────────
  const handleClose = () => {
    setAddMode("user");
    setSearchQuery("");
    setSearchResults([]);
    setGhostName("");
    setGhostContact("");
    setGhostHandicap("");
    onClose();
  };

  // ── Search Users ──────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    soundPlayer.play("click");

    try {
      const searchLower = searchQuery.toLowerCase().trim();

      const usersRef = collection(db, "users");
      const snap = await getDocs(query(usersRef, limit(100)));

      const results: SearchResult[] = snap.docs
        .filter((d) => {
          const data = d.data();
          const name = (data.displayName || "").toLowerCase();
          return name.includes(searchLower) && d.id !== markerId;
        })
        .filter((d) => !existingPlayerIds.includes(d.id))
        .map((d) => {
          const data = d.data();
          return {
            userId: d.id,
            displayName: data.displayName || "Unknown",
            avatar: data.avatar || null,
            handicapIndex: parseFloat(data.handicap) || 0,
            isPartner: (data.partners || []).includes(markerId),
          };
        })
        .sort((a, b) => {
          if (a.isPartner && !b.isPartner) return -1;
          if (!a.isPartner && b.isPartner) return 1;
          return a.displayName.localeCompare(b.displayName);
        })
        .slice(0, 15);

      setSearchResults(results);
    } catch (e) {
      console.error("User search error:", e);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, markerId, existingPlayerIds]);

  // ── Add searched user ─────────────────────────────────────
  const handleSelectUser = (user: SearchResult) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAddUser(user);
    handleClose();
  };

  // ── Add ghost ─────────────────────────────────────────────
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

  // ============================================================================
  // RENDER
  // ============================================================================

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
          <Text style={s.headerTitle}>Add Player</Text>
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
              Search User
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

        {/* ── User Search ──────────────────────────────────── */}
        {addMode === "user" && (
          <View style={s.body}>
            <View style={s.searchRow}>
              <TextInput
                style={s.searchInput}
                placeholder="Search by name..."
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                autoFocus
              />
              <TouchableOpacity style={s.searchBtn} onPress={handleSearch} disabled={searching}>
                {searching ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="search" size={20} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>

            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.userId}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.resultRow}
                  onPress={() => handleSelectUser(item)}
                >
                  <View style={s.resultLeft}>
                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={s.resultAvatar} />
                    ) : (
                      <View style={[s.resultAvatar, s.avatarPlaceholder]}>
                        <Text style={s.avatarInitial}>
                          {item.displayName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View>
                      <Text style={s.resultName}>{item.displayName}</Text>
                      <Text style={s.resultHcp}>
                        HCP {item.handicapIndex.toFixed(1)}
                        {item.isPartner ? "  •  Partner" : ""}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="add-circle" size={24} color={GREEN} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                searchQuery.trim() && !searching ? (
                  <Text style={s.emptyText}>No users found. Try a different name.</Text>
                ) : null
              }
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          </View>
        )}

        {/* ── Ghost User Form ──────────────────────────────── */}
        {addMode === "ghost" && (
          <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
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
              style={[s.addBtn, !ghostName.trim() && { opacity: 0.5 }]}
              onPress={handleSubmitGhost}
              disabled={!ghostName.trim()}
            >
              <Text style={s.addBtnText}>Add Guest</Text>
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
  container: {
    flex: 1,
    backgroundColor: "#F5F5F0",
  },
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
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  body: {
    flex: 1,
    padding: 16,
  },

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
  tabActive: {
    backgroundColor: GREEN,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: GREEN,
  },
  tabTextActive: {
    color: "#FFF",
  },

  // ── Search ──────────────────────────────────────────────────
  searchRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    fontSize: 16,
    marginRight: 8,
  },
  searchBtn: {
    backgroundColor: GREEN,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E8E4DA",
  },
  resultLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  resultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: "#E8E4DA",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInitial: {
    fontSize: 14,
    fontWeight: "700",
    color: GREEN,
  },
  resultName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  resultHcp: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  emptyText: {
    textAlign: "center",
    color: "#999",
    marginTop: 24,
    fontSize: 14,
  },

  // ── Ghost Form ──────────────────────────────────────────────
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
  contactTypeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  contactTypeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F0EDE4",
  },
  contactTypeBtnActive: {
    backgroundColor: GREEN,
  },
  contactTypeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  contactTypeTextActive: {
    color: "#FFF",
  },
  addBtn: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GREEN,
    paddingVertical: 14,
    borderRadius: 12,
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
});