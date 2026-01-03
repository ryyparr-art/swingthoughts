import { auth, db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
    collection,
    doc,
    getDocs,
    query,
    updateDoc,
    where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface User {
  id: string;
  displayName: string;
  email: string;
  userType: string;
  verified: boolean;
  handicap?: string | number;
  avatar?: string;
  createdAt: any;
  partners?: string[];
  role?: string;
}

type SuspensionType = "active" | "suspended_temp" | "suspended_perm" | "shadow_banned";

export default function UserManagementScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userModalVisible, setUserModalVisible] = useState(false);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/");
      return;
    }

    try {
      const userDoc = await getDocs(
        query(collection(db, "users"), where("__name__", "==", user.uid))
      );

      if (!userDoc.empty) {
        const userData = userDoc.docs[0].data();
        if (userData.role === "admin") {
          setLoading(false);
          fetchUsers();
        } else {
          router.replace("/clubhouse");
        }
      }
    } catch (error) {
      console.error("Error checking admin access:", error);
      router.replace("/clubhouse");
    }
  };

  const fetchUsers = async () => {
    try {
      const usersSnapshot = await getDocs(collection(db, "users"));
      const usersList: User[] = [];

      usersSnapshot.forEach((doc) => {
        usersList.push({ id: doc.id, ...doc.data() } as User);
      });

      // Sort by most recent
      usersList.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      setUsers(usersList);
      setFilteredUsers(usersList);
      setRefreshing(false);
    } catch (error) {
      console.error("Error fetching users:", error);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchUsers();
  };

  /* ==================== SEARCH & FILTER ==================== */

  useEffect(() => {
    let filtered = users;

    // Filter by type
    if (filterType !== "all") {
      if (filterType === "verified") {
        filtered = filtered.filter((u) => u.verified === true);
      } else if (filterType === "unverified") {
        filtered = filtered.filter((u) => u.verified === false);
      } else {
        filtered = filtered.filter((u) => u.userType === filterType);
      }
    }

    // Search by name or email
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.displayName?.toLowerCase().includes(query) ||
          u.email?.toLowerCase().includes(query)
      );
    }

    setFilteredUsers(filtered);
  }, [searchQuery, filterType, users]);

  /* ==================== USER ACTIONS ==================== */

  const handleViewUser = (user: User) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedUser(user);
    setUserModalVisible(true);
  };

  const handleChangeUserType = async (user: User, newType: string) => {
    Alert.alert(
      "Change User Type",
      `Change ${user.displayName} to ${newType}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Change",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "users", user.id), {
                userType: newType,
                verified: false, // Reset verification when changing type
              });

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Success", "User type updated");
              fetchUsers();
              setUserModalVisible(false);
            } catch (error) {
              console.error("Error updating user type:", error);
              Alert.alert("Error", "Failed to update user type");
            }
          },
        },
      ]
    );
  };

  const handleSuspendUser = async (user: User, suspensionType: SuspensionType) => {
    const labels: Record<SuspensionType, string> = {
      active: "Active",
      suspended_temp: "Temporary Suspension",
      suspended_perm: "Permanent Ban",
      shadow_banned: "Shadow Ban",
    };

    Alert.alert(
      "Change User Status",
      `Set ${user.displayName} to: ${labels[suspensionType]}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: suspensionType.includes("suspended") || suspensionType === "shadow_banned" ? "destructive" : "default",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "users", user.id), {
                accountStatus: suspensionType,
              });

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Success", `User status updated to: ${labels[suspensionType]}`);
              fetchUsers();
              setUserModalVisible(false);
            } catch (error) {
              console.error("Error updating user status:", error);
              Alert.alert("Error", "Failed to update user status");
            }
          },
        },
      ]
    );
  };

  const handleMakeAdmin = async (user: User) => {
    Alert.alert(
      "Make Admin",
      `Give ${user.displayName} admin privileges? This cannot be undone easily.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Make Admin",
          style: "destructive",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "users", user.id), {
                role: "admin",
              });

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Success", `${user.displayName} is now an admin`);
              fetchUsers();
              setUserModalVisible(false);
            } catch (error) {
              console.error("Error making admin:", error);
              Alert.alert("Error", "Failed to update admin role");
            }
          },
        },
      ]
    );
  };

  /* ==================== RENDER ==================== */

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A";
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "N/A";
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Image
            source={require("@/assets/icons/Back.png")}
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Management</Text>
        <TouchableOpacity onPress={handleRefresh}>
          <Ionicons name="refresh" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* SEARCH */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* FILTERS */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        {["all", "Golfer", "Course", "PGA Professional", "verified", "unverified"].map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.filterChip, filterType === type && styles.filterChipActive]}
            onPress={() => setFilterType(type)}
          >
            <Text
              style={[styles.filterChipText, filterType === type && styles.filterChipTextActive]}
            >
              {type === "all" ? "All Users" : type}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* USERS LIST */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <Text style={styles.resultCount}>
          {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}
        </Text>

        {filteredUsers.map((user) => (
          <TouchableOpacity
            key={user.id}
            style={styles.userCard}
            onPress={() => handleViewUser(user)}
          >
            <View style={styles.userInfo}>
              {user.avatar ? (
                <Image source={{ uri: user.avatar }} style={styles.userAvatar} />
              ) : (
                <View style={styles.userAvatarPlaceholder}>
                  <Text style={styles.userAvatarText}>
                    {user.displayName?.charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
              )}

              <View style={styles.userDetails}>
                <Text style={styles.userName}>{user.displayName}</Text>
                <Text style={styles.userEmail}>{user.email}</Text>
                <View style={styles.userBadges}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{user.userType}</Text>
                  </View>
                  {user.verified && (
                    <View style={[styles.badge, styles.badgeVerified]}>
                      <Ionicons name="checkmark-circle" size={12} color="#FFF" />
                      <Text style={styles.badgeText}>Verified</Text>
                    </View>
                  )}
                  {user.role === "admin" && (
                    <View style={[styles.badge, styles.badgeAdmin]}>
                      <Text style={styles.badgeText}>Admin</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* USER DETAIL MODAL */}
      {selectedUser && (
        <Modal
          visible={userModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setUserModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>User Details</Text>
                <TouchableOpacity onPress={() => setUserModalVisible(false)}>
                  <Image
                    source={require("@/assets/icons/Close.png")}
                    style={styles.closeIcon}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalContent}>
                {/* Avatar */}
                <View style={styles.modalAvatarContainer}>
                  {selectedUser.avatar ? (
                    <Image source={{ uri: selectedUser.avatar }} style={styles.modalAvatar} />
                  ) : (
                    <View style={styles.modalAvatarPlaceholder}>
                      <Text style={styles.modalAvatarText}>
                        {selectedUser.displayName?.charAt(0).toUpperCase() || "?"}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Info */}
                <Text style={styles.modalUserName}>{selectedUser.displayName}</Text>
                <Text style={styles.modalUserEmail}>{selectedUser.email}</Text>

                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalLabel}>User Type:</Text>
                  <Text style={styles.modalValue}>{selectedUser.userType}</Text>
                </View>

                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalLabel}>Verified:</Text>
                  <Text style={styles.modalValue}>
                    {selectedUser.verified ? "Yes ✓" : "No"}
                  </Text>
                </View>

                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalLabel}>Handicap:</Text>
                  <Text style={styles.modalValue}>{selectedUser.handicap || "N/A"}</Text>
                </View>

                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalLabel}>Partners:</Text>
                  <Text style={styles.modalValue}>
                    {selectedUser.partners?.length || 0}
                  </Text>
                </View>

                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalLabel}>Joined:</Text>
                  <Text style={styles.modalValue}>{formatDate(selectedUser.createdAt)}</Text>
                </View>

                {/* ACTIONS */}
                <Text style={styles.modalSectionTitle}>Actions</Text>

                <TouchableOpacity
                  style={styles.modalActionButton}
                  onPress={() => {
                    setUserModalVisible(false);
                    router.push(`/locker/${selectedUser.id}`);
                  }}
                >
                  <Ionicons name="person-outline" size={20} color="#0D5C3A" />
                  <Text style={styles.modalActionText}>View Profile</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalActionButton}
                  onPress={() => {
                    Alert.alert(
                      "Change User Type",
                      "Select new user type:",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Golfer", onPress: () => handleChangeUserType(selectedUser, "Golfer") },
                        { text: "Course", onPress: () => handleChangeUserType(selectedUser, "Course") },
                        { text: "PGA Pro", onPress: () => handleChangeUserType(selectedUser, "PGA Professional") },
                      ]
                    );
                  }}
                >
                  <Ionicons name="swap-horizontal-outline" size={20} color="#0D5C3A" />
                  <Text style={styles.modalActionText}>Change User Type</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalActionButton}
                  onPress={() => {
                    Alert.alert(
                      "User Status",
                      "Select status:",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Active", onPress: () => handleSuspendUser(selectedUser, "active") },
                        { text: "Temp Suspend", onPress: () => handleSuspendUser(selectedUser, "suspended_temp") },
                        { text: "Permanent Ban", style: "destructive", onPress: () => handleSuspendUser(selectedUser, "suspended_perm") },
                        { text: "Shadow Ban", onPress: () => handleSuspendUser(selectedUser, "shadow_banned") },
                      ]
                    );
                  }}
                >
                  <Ionicons name="ban-outline" size={20} color="#FF9500" />
                  <Text style={styles.modalActionTextWarning}>Manage Suspension</Text>
                </TouchableOpacity>

                {selectedUser.role !== "admin" && (
                  <TouchableOpacity
                    style={[styles.modalActionButton, styles.modalActionButtonDanger]}
                    onPress={() => handleMakeAdmin(selectedUser)}
                  >
                    <Ionicons name="shield-checkmark-outline" size={20} color="#FF3B30" />
                    <Text style={styles.modalActionTextDanger}>Make Admin</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

/* ==================== STYLES ==================== */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  safeTop: {
    backgroundColor: "#0D5C3A",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#0D5C3A",
  },

  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFF",
  },

  headerTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },

  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 8,
    fontSize: 16,
    color: "#333",
  },

  filterScroll: {
    maxHeight: 50,
    paddingHorizontal: 16,
    marginBottom: 8,
  },

  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFF",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },

  filterChipActive: {
    backgroundColor: "#0D5C3A",
    borderColor: "#0D5C3A",
  },

  filterChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },

  filterChipTextActive: {
    color: "#FFF",
  },

  scrollContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },

  resultCount: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
    fontWeight: "600",
  },

  userCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },

  userAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  userAvatarText: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "700",
  },

  userDetails: {
    flex: 1,
  },

  userName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 2,
  },

  userEmail: {
    fontSize: 13,
    color: "#666",
    marginBottom: 6,
  },

  userBadges: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E5E5E5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },

  badgeVerified: {
    backgroundColor: "#0D5C3A",
  },

  badgeAdmin: {
    backgroundColor: "#FFD700",
  },

  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFF",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },

  /* MODAL */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },

  modalContainer: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  closeIcon: {
    width: 24,
    height: 24,
    tintColor: "#666",
  },

  modalContent: {
    padding: 20,
  },

  modalAvatarContainer: {
    alignItems: "center",
    marginBottom: 16,
  },

  modalAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },

  modalAvatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },

  modalAvatarText: {
    color: "#FFF",
    fontSize: 32,
    fontWeight: "700",
  },

  modalUserName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0D5C3A",
    textAlign: "center",
    marginBottom: 4,
  },

  modalUserEmail: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },

  modalInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },

  modalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },

  modalValue: {
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
  },

  modalSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
    marginTop: 20,
    marginBottom: 12,
  },

  modalActionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#F7F8FA",
    borderRadius: 12,
    marginBottom: 10,
    gap: 12,
  },

  modalActionButtonDanger: {
    backgroundColor: "#FFF5F5",
    borderWidth: 1,
    borderColor: "#FF3B30",
  },

  modalActionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  modalActionTextWarning: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FF9500",
  },

  modalActionTextDanger: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FF3B30",
  },
});