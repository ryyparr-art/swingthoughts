import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Partner {
  userId: string;
  displayName: string;
  avatar?: string;
}

export default function SelectPartnerScreen() {
  const router = useRouter();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [filteredPartners, setFilteredPartners] = useState<Partner[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  
  // Multi-select state
  const [selectedPartners, setSelectedPartners] = useState<Partner[]>([]);
  
  // ✅ NEW: Group name input (only shown when 2+ partners selected)
  const [groupName, setGroupName] = useState("");

  useEffect(() => {
    fetchPartners();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredPartners(partners);
    } else {
      const q = searchQuery.toLowerCase();
      setFilteredPartners(
        partners.filter((p) => p.displayName.toLowerCase().includes(q))
      );
    }
  }, [searchQuery, partners]);

  const fetchPartners = async () => {
    try {
      const currentUserId = auth.currentUser?.uid;
      if (!currentUserId) return;

      // Get all partnerships where current user is involved
      const partnersRef = collection(db, "partners");
      const q1 = query(partnersRef, where("user1Id", "==", currentUserId));
      const q2 = query(partnersRef, where("user2Id", "==", currentUserId));

      const [snapshot1, snapshot2] = await Promise.all([
        getDocs(q1),
        getDocs(q2),
      ]);

      const partnerIds = new Set<string>();

      snapshot1.forEach((doc) => {
        const data = doc.data();
        partnerIds.add(data.user2Id);
      });

      snapshot2.forEach((doc) => {
        const data = doc.data();
        partnerIds.add(data.user1Id);
      });

      if (partnerIds.size === 0) {
        setLoading(false);
        return;
      }

      // Fetch user details for all partners
      const usersRef = collection(db, "users");
      const partnerIdsArray = Array.from(partnerIds);
      const partnersList: Partner[] = [];

      // Batch in groups of 10 (Firestore 'in' limit)
      for (let i = 0; i < partnerIdsArray.length; i += 10) {
        const batch = partnerIdsArray.slice(i, i + 10);
        const usersQuery = query(usersRef, where("__name__", "in", batch));
        const usersSnap = await getDocs(usersQuery);

        usersSnap.forEach((doc) => {
          const data = doc.data();
          partnersList.push({
            userId: doc.id,
            displayName: data.displayName || "Unknown",
            avatar: data.avatar || null,
          });
        });
      }

      // Sort by displayName
      partnersList.sort((a, b) => a.displayName.localeCompare(b.displayName));

      setPartners(partnersList);
      setFilteredPartners(partnersList);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching partners:", error);
      soundPlayer.play("error");
      setLoading(false);
    }
  };

  const togglePartnerSelection = (partner: Partner) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setSelectedPartners((prev) => {
      const isSelected = prev.some((p) => p.userId === partner.userId);
      if (isSelected) {
        return prev.filter((p) => p.userId !== partner.userId);
      } else {
        return [...prev, partner];
      }
    });
  };

  const handleStartChat = async () => {
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId || selectedPartners.length === 0) return;

    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Single partner - use deterministic thread ID (1:1 chat)
    if (selectedPartners.length === 1) {
      const partner = selectedPartners[0];
      const sortedIds = [currentUserId, partner.userId].sort();
      const threadId = `${sortedIds[0]}_${sortedIds[1]}`;
      
      console.log("🧵 Navigating to 1:1 thread:", threadId);
      router.push(`/messages/${threadId}`);
      return;
    }

    // Multiple partners - create group chat
    setCreating(true);
    
    try {
      // Get current user data
      const currentUserSnap = await getDoc(doc(db, "users", currentUserId));
      let currentUserData = { displayName: "You", avatar: null };
      if (currentUserSnap.exists()) {
        const data = currentUserSnap.data();
        currentUserData = {
          displayName: data.displayName || "You",
          avatar: data.avatar || null,
        };
      }

      // Build participants array (including current user)
      const allParticipants = [currentUserId, ...selectedPartners.map((p) => p.userId)];
      
      // Build participant names and avatars maps
      const participantNames: Record<string, string> = {
        [currentUserId]: currentUserData.displayName,
      };
      const participantAvatars: Record<string, string | null> = {
        [currentUserId]: currentUserData.avatar,
      };
      
      selectedPartners.forEach((p) => {
        participantNames[p.userId] = p.displayName;
        participantAvatars[p.userId] = p.avatar || null;
      });

      // ✅ UPDATED: Use custom name if provided, otherwise auto-generate
      const otherNames = selectedPartners.map((p) => p.displayName);
      const autoGeneratedName = otherNames.length <= 3 
        ? otherNames.join(", ")
        : `${otherNames.slice(0, 2).join(", ")} +${otherNames.length - 2} more`;
      
      const finalGroupName = groupName.trim() || autoGeneratedName;

      // Create the group thread
      const threadRef = await addDoc(collection(db, "threads"), {
        participants: allParticipants,
        participantNames,
        participantAvatars,
        isGroup: true,
        groupName: finalGroupName,
        createdBy: currentUserId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: null,
        lastMessageAt: serverTimestamp(),
        unreadCount: allParticipants.reduce((acc, id) => {
          acc[id] = 0;
          return acc;
        }, {} as Record<string, number>),
      });

      console.log("🧵 Created group thread:", threadRef.id);
      soundPlayer.play("postThought");
      
      router.push(`/messages/${threadRef.id}`);
    } catch (error) {
      console.error("Error creating group chat:", error);
      soundPlayer.play("error");
      setCreating(false);
    }
  };

  const renderPartner = ({ item }: { item: Partner }) => {
    const initial = item.displayName?.[0]?.toUpperCase() || "?";
    const isSelected = selectedPartners.some((p) => p.userId === item.userId);

    return (
      <TouchableOpacity
        style={[styles.partnerRow, isSelected && styles.partnerRowSelected]}
        onPress={() => togglePartnerSelection(item)}
      >
        {/* Checkbox */}
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Ionicons name="checkmark" size={16} color="#FFF" />}
        </View>

        {/* Avatar */}
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        )}

        {/* Name */}
        <Text style={styles.partnerName} numberOfLines={1}>
          {item.displayName}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.wrapper}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
          >
            <Image
              source={require("@/assets/icons/Back.png")}
              style={styles.backIcon}
            />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>NEW MESSAGE</Text>

          <View style={styles.headerButton} />
        </View>

        {/* Selected Partners Preview */}
        {selectedPartners.length > 0 && (
          <View style={styles.selectedContainer}>
            <Text style={styles.selectedLabel}>
              {selectedPartners.length === 1
                ? "1 partner selected"
                : `${selectedPartners.length} partners selected (group chat)`}
            </Text>
            <View style={styles.selectedChips}>
              {selectedPartners.map((partner) => (
                <TouchableOpacity
                  key={partner.userId}
                  style={styles.chip}
                  onPress={() => togglePartnerSelection(partner)}
                >
                  <Text style={styles.chipText} numberOfLines={1}>
                    {partner.displayName}
                  </Text>
                  <Ionicons name="close-circle" size={18} color="#0D5C3A" />
                </TouchableOpacity>
              ))}
            </View>
            
            {/* ✅ NEW: Group name input (only for 2+ partners) */}
            {selectedPartners.length > 1 && (
              <View style={styles.groupNameContainer}>
                <TextInput
                  style={styles.groupNameInput}
                  placeholder="Group name (optional)"
                  placeholderTextColor="#999"
                  value={groupName}
                  onChangeText={setGroupName}
                  maxLength={50}
                />
              </View>
            )}
          </View>
        )}

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons
            name="search"
            size={20}
            color="#999"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search partners..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Partners List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0D5C3A" />
          </View>
        ) : filteredPartners.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#CCC" />
            <Text style={styles.emptyText}>
              {searchQuery ? "No partners found" : "No partners yet"}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery
                ? "Try a different search"
                : "Partner up with golfers to send messages"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredPartners}
            renderItem={renderPartner}
            keyExtractor={(item) => item.userId}
            contentContainerStyle={styles.listContent}
          />
        )}

        {/* Start Chat Button */}
        {selectedPartners.length > 0 && (
          <View style={styles.bottomContainer}>
            <TouchableOpacity
              style={[styles.startButton, creating && styles.startButtonDisabled]}
              onPress={handleStartChat}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons 
                    name={selectedPartners.length > 1 ? "people" : "chatbubble"} 
                    size={20} 
                    color="#FFF" 
                  />
                  <Text style={styles.startButtonText}>
                    {selectedPartners.length > 1 
                      ? `Start Group Chat (${selectedPartners.length})`
                      : "Start Chat"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  safeTop: {
    backgroundColor: "#0D5C3A",
  },

  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },

  headerButton: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFFFFF",
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 1,
  },

  // Selected partners preview
  selectedContainer: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#C8E6C9",
  },

  selectedLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 8,
  },

  selectedChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
    borderWidth: 1,
    borderColor: "#0D5C3A",
  },

  chipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
    maxWidth: 100,
  },

  // ✅ NEW: Group name input
  groupNameContainer: {
    marginTop: 12,
  },

  groupNameInput: {
    backgroundColor: "#FFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0D5C3A",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#333",
  },

  // Search
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 12,
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  searchIcon: {
    marginRight: 8,
  },

  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: "#333",
  },

  // List
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },

  emptyText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#666",
    marginTop: 16,
  },

  emptySubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
    textAlign: "center",
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },

  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },

  partnerRowSelected: {
    backgroundColor: "#E8F5E9",
    borderWidth: 1,
    borderColor: "#0D5C3A",
  },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#CCC",
    alignItems: "center",
    justifyContent: "center",
  },

  checkboxSelected: {
    backgroundColor: "#0D5C3A",
    borderColor: "#0D5C3A",
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },

  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },

  avatarText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },

  partnerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },

  // Bottom button
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: "#F4EED8",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },

  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D5C3A",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },

  startButtonDisabled: {
    opacity: 0.7,
  },

  startButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
});