import { db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
    collection,
    getDocs
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Player {
  userId: string;
  displayName: string;
  avatar?: string;
  handicap: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  courseId: number;
  courseName: string;
}

export default function CoursePlayersModal({
  visible,
  onClose,
  courseId,
  courseName,
}: Props) {
  const router = useRouter();

  const [players, setPlayers] = useState<Player[]>([]);
  const [members, setMembers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (visible) {
      loadAllData();
    }
  }, [visible, courseId]);

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([loadPlayers(), loadMembers()]);
    setLoading(false);
  };

  const refreshData = async () => {
    setRefreshing(true);
    await Promise.all([loadPlayers(), loadMembers()]);
    setRefreshing(false);
  };

  /* ========================= LOAD PLAYERS ========================= */
  const loadPlayers = async () => {
    try {
      // Get all users and filter for those with this course in playerCourses
      const usersSnap = await getDocs(collection(db, "users"));
      const playerProfiles: Player[] = [];

      for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data();
        const playerCourses = userData.playerCourses || [];

        if (playerCourses.includes(courseId)) {
          playerProfiles.push({
            userId: userDoc.id,
            displayName: userData.displayName || "Unknown",
            avatar: userData.avatar,
            handicap: userData.handicap || 0,
          });
        }
      }

      // Sort alphabetically
      playerProfiles.sort((a, b) => a.displayName.localeCompare(b.displayName));

      setPlayers(playerProfiles);
    } catch (error) {
      console.error("Error loading players:", error);
      setPlayers([]);
    }
  };

  /* ========================= LOAD DECLARED MEMBERS ========================= */
  const loadMembers = async () => {
    try {
      // Get all users and filter for those with this course in declaredMemberCourses
      const usersSnap = await getDocs(collection(db, "users"));
      const memberProfiles: Player[] = [];

      for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data();
        const memberCourses = userData.declaredMemberCourses || [];

        if (memberCourses.includes(courseId)) {
          memberProfiles.push({
            userId: userDoc.id,
            displayName: userData.displayName || "Unknown",
            avatar: userData.avatar,
            handicap: userData.handicap || 0,
          });
        }
      }

      // Sort alphabetically
      memberProfiles.sort((a, b) => a.displayName.localeCompare(b.displayName));

      setMembers(memberProfiles);
    } catch (error) {
      console.error("Error loading members:", error);
      setMembers([]);
    }
  };

  /* ========================= RENDER ITEMS ========================= */
  const renderPlayer = ({ item }: { item: Player }) => (
    <TouchableOpacity
      style={styles.listItem}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onClose();
        router.push(`/locker/${item.userId}`);
      }}
    >
      {item.avatar ? (
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.displayName[0]?.toUpperCase() || "?"}
          </Text>
        </View>
      )}

      <View style={styles.listItemContent}>
        <Text style={styles.listItemName}>{item.displayName}</Text>
        <Text style={styles.listItemDetail}>Handicap: {item.handicap}</Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color="#999" />
    </TouchableOpacity>
  );

  const renderMember = ({ item }: { item: Player }) => (
    <TouchableOpacity
      style={styles.listItem}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onClose();
        router.push(`/locker/${item.userId}`);
      }}
    >
      {item.avatar ? (
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {item.displayName[0]?.toUpperCase() || "?"}
          </Text>
        </View>
      )}

      <View style={styles.listItemContent}>
        <View style={styles.memberNameRow}>
          <Text style={styles.listItemName}>{item.displayName}</Text>
          <View style={styles.verifiedBadge}>
            <Ionicons name="shield-checkmark" size={14} color="#FFD700" />
          </View>
        </View>
        <Text style={styles.listItemDetail}>Handicap: {item.handicap}</Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color="#999" />
    </TouchableOpacity>
  );

  /* ========================= EMPTY STATES ========================= */
  const renderEmptyState = () => {
    const hasAnyData = players.length > 0 || members.length > 0;

    if (hasAnyData) return null;

    return (
      <View style={styles.emptyState}>
        <Ionicons name="people-outline" size={64} color="#CCC" />
        <Text style={styles.emptyTitle}>
          No players or members yet at {courseName}
        </Text>
      </View>
    );
  };

  const renderSectionEmpty = (text: string) => (
    <View style={styles.sectionEmpty}>
      <Text style={styles.sectionEmptyText}>{text}</Text>
    </View>
  );

  /* ========================= UI ========================= */
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerButton} />

          <Text style={styles.headerTitle} numberOfLines={1}>
            {courseName}
          </Text>

          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0D5C3A" />
          </View>
        ) : (
          <FlatList
            data={[{ type: "content" }]}
            keyExtractor={(item) => item.type}
            contentContainerStyle={styles.scrollContent}
            refreshing={refreshing}
            onRefresh={refreshData}
            ListEmptyComponent={renderEmptyState()}
            renderItem={() => (
              <>
                {/* SECTION 1: Players */}
                {players.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      Players ({players.length})
                    </Text>
                    {players.map((player) => (
                      <View key={player.userId}>
                        {renderPlayer({ item: player })}
                      </View>
                    ))}
                  </View>
                )}

                {/* SECTION 2: Declared Members */}
                {members.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      Declared Members ({members.length})
                    </Text>
                    {members.map((member) => (
                      <View key={member.userId}>
                        {renderMember({ item: member })}
                      </View>
                    ))}
                  </View>
                )}

                {/* Show individual empty states if needed */}
                {players.length === 0 && members.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Players (0)</Text>
                    {renderSectionEmpty("No players yet")}
                  </View>
                )}

                {members.length === 0 && players.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Declared Members (0)</Text>
                    {renderSectionEmpty("No declared members yet")}
                  </View>
                )}
              </>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    flex: 1,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  section: {
    marginBottom: 32,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 12,
  },

  sectionEmpty: {
    padding: 20,
    alignItems: "center",
  },

  sectionEmptyText: {
    fontSize: 14,
    color: "#999",
    fontStyle: "italic",
  },

  listItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },

  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#E0E0E0",
  },

  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },

  avatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  listItemContent: {
    flex: 1,
  },

  memberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  verifiedBadge: {
    backgroundColor: "#0D5C3A",
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },

  listItemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },

  listItemDetail: {
    fontSize: 13,
    color: "#666",
  },

  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 24,
  },
});