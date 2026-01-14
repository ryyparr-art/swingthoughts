import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
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

  const handleSelectPartner = (partner: Partner) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return;

    // ✅ Create deterministic thread ID from sorted user IDs
    const sortedIds = [currentUserId, partner.userId].sort();
    const threadId = `${sortedIds[0]}_${sortedIds[1]}`;

    console.log("🧵 Navigating to thread:", threadId);
    router.push(`/messages/${threadId}`);
  };

  const renderPartner = ({ item }: { item: Partner }) => {
    const initial = item.displayName?.[0]?.toUpperCase() || "?";

    return (
      <TouchableOpacity
        style={styles.partnerItem}
        onPress={() => handleSelectPartner(item)}
      >
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        <Text style={styles.partnerName}>{item.displayName}</Text>
        <Ionicons name="chevron-forward" size={20} color="#999" />
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
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.headerButton}
          >
            <Image
              source={require("@/assets/icons/Back.png")}
              style={styles.backIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>New Message</Text>

          <View style={styles.headerButton} />
        </View>

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

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
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

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },

  partnerItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },

  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  avatarInitial: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
  },

  partnerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },

  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
    textAlign: "center",
  },

  emptySubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
    textAlign: "center",
  },
});