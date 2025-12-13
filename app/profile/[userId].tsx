import { auth, db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, deleteDoc, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface UserProfile {
  displayName: string;
  avatar?: string;
  handicap: number;
  badges: string[];
  selectedBadges?: string[];
}

interface Post {
  postId: string;
  imageUrl: string;
  caption: string;
  createdAt: any;
}

interface Stats {
  swingThoughts: number;
  leaderboardScores: number;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams();
  const currentUserId = auth.currentUser?.uid;
  const isOwnProfile = userId === currentUserId;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState<Stats>({ swingThoughts: 0, leaderboardScores: 0 });
  const [loading, setLoading] = useState(true);
  const [isPartner, setIsPartner] = useState(false);

  useEffect(() => {
    if (userId) {
      fetchProfileData();
      if (!isOwnProfile) {
        checkPartnerStatus();
      }
    }
  }, [userId]);

  const fetchProfileData = async () => {
    try {
      // Fetch user profile
      const userDoc = await getDoc(doc(db, "users", userId as string));
      
      if (userDoc.exists()) {
        const data = userDoc.data() as UserProfile;
        setProfile(data);
      }

      // Fetch posts
      const postsQuery = query(
        collection(db, "thoughts"),
        where("userId", "==", userId)
      );
      const postsSnap = await getDocs(postsQuery);
      const postsData: Post[] = [];
      
      postsSnap.forEach((doc) => {
        const data = doc.data();
        postsData.push({
          postId: doc.id,
          imageUrl: data.imageUrl,
          caption: data.caption || "",
          createdAt: data.createdAt,
        });
      });

      // Sort by date (newest first)
      postsData.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      setPosts(postsData);

      // Fetch stats
      const scoresQuery = query(
        collection(db, "scores"),
        where("userId", "==", userId)
      );
      const scoresSnap = await getDocs(scoresQuery);

      setStats({
        swingThoughts: postsData.length,
        leaderboardScores: scoresSnap.size,
      });

      setLoading(false);
    } catch (error) {
      console.error("Error fetching profile data:", error);
      setLoading(false);
    }
  };

  const checkPartnerStatus = async () => {
    try {
      if (!currentUserId) return;

      // Check if already partners
      const partnersRef = collection(db, "partners");
      const q1 = query(
        partnersRef,
        where("user1Id", "==", currentUserId),
        where("user2Id", "==", userId)
      );
      const q2 = query(
        partnersRef,
        where("user1Id", "==", userId),
        where("user2Id", "==", currentUserId)
      );

      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

      if (!snap1.empty || !snap2.empty) {
        setIsPartner(true);
      }
    } catch (error) {
      console.error("Error checking partner status:", error);
    }
  };

  const handleDeletePost = async (postId: string) => {
    const confirmDelete = async () => {
      if (Platform.OS === 'web') {
        return window.confirm("Delete this post?");
      } else {
        return new Promise<boolean>((resolve) => {
          Alert.alert(
            "Delete Post",
            "Are you sure you want to delete this post?",
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              { text: "Delete", style: "destructive", onPress: () => resolve(true) },
            ]
          );
        });
      }
    };

    const shouldDelete = await confirmDelete();
    if (!shouldDelete) return;

    try {
      await deleteDoc(doc(db, "thoughts", postId));
      setPosts(posts.filter((p) => p.postId !== postId));
      setStats({ ...stats, swingThoughts: stats.swingThoughts - 1 });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error deleting post:", error);
      if (Platform.OS === 'web') {
        alert("Failed to delete post");
      } else {
        Alert.alert("Error", "Failed to delete post");
      }
    }
  };

  const handleSettings = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/profile/settings");
  };

  const handlePartnerUp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // TODO: Implement partner request
    console.log("Partner up with:", userId);
  };

  const handleSendMessage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/messages/${userId}`);
  };

  const renderPost = ({ item }: { item: Post }) => (
    <TouchableOpacity 
      style={styles.postCard}
      onLongPress={isOwnProfile ? () => handleDeletePost(item.postId) : undefined}
    >
      <Image source={{ uri: item.imageUrl }} style={styles.postImage} />
      {isOwnProfile && (
        <TouchableOpacity 
          style={styles.deleteIcon}
          onPress={() => handleDeletePost(item.postId)}
        >
          <Ionicons name="close-circle" size={24} color="#FF3B30" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Profile not found</Text>
      </View>
    );
  }

  const displayBadges = profile.selectedBadges || profile.badges?.slice(0, 3) || [];

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Profile</Text>

        <View style={styles.headerButton} />
      </View>

      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.postId}
        numColumns={3}
        contentContainerStyle={styles.postsGrid}
        ListHeaderComponent={
          <>
            {/* Avatar & Display Name */}
            <View style={styles.profileHeader}>
              {profile.avatar ? (
                <Image source={{ uri: profile.avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>
                    {profile.displayName[0]?.toUpperCase() || "?"}
                  </Text>
                </View>
              )}

              <Text style={styles.displayName}>{profile.displayName}</Text>

              {/* Badge Selector */}
              <View style={styles.badgesRow}>
                {displayBadges.slice(0, 3).map((badge, index) => (
                  <View key={index} style={styles.badgeIcon}>
                    <Text style={styles.badgeEmoji}>🏆</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Stats Tiles */}
            <View style={styles.statsContainer}>
              <View style={styles.statTile}>
                <Text style={styles.statValue}>{stats.swingThoughts}</Text>
                <Text style={styles.statLabel}>Swing Thoughts</Text>
              </View>

              <View style={styles.statTile}>
                <Text style={styles.statValue}>{profile.handicap}</Text>
                <Text style={styles.statLabel}>Handicap</Text>
              </View>

              <View style={styles.statTile}>
                <Text style={styles.statValue}>{stats.leaderboardScores}</Text>
                <Text style={styles.statLabel}>Scores Posted</Text>
              </View>
            </View>

            {/* Action Button */}
            {isOwnProfile ? (
              <TouchableOpacity style={styles.actionButton} onPress={handleSettings}>
                <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Settings</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity style={styles.actionButton} onPress={handlePartnerUp}>
                  <Ionicons name="people-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.actionButtonText}>Partner Up</Text>
                </TouchableOpacity>

                {isPartner && (
                  <TouchableOpacity style={styles.actionButton} onPress={handleSendMessage}>
                    <Ionicons name="mail-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.actionButtonText}>Message</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Posts Header */}
            <View style={styles.postsHeader}>
              <Text style={styles.postsTitle}>Posts</Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={64} color="#CCC" />
            <Text style={styles.emptyText}>No posts yet</Text>
          </View>
        }
      />
    </View>
  );
}

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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },

  headerButton: {
    width: 40,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 1,
  },

  profileHeader: {
    alignItems: "center",
    paddingVertical: 24,
  },

  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: "#0D5C3A",
  },

  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 3,
    borderColor: "#0D5C3A",
  },

  avatarInitial: {
    fontSize: 40,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  displayName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 12,
  },

  badgesRow: {
    flexDirection: "row",
    gap: 8,
  },

  badgeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
  },

  badgeEmoji: {
    fontSize: 20,
  },

  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
  },

  statTile: {
    alignItems: "center",
  },

  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  statLabel: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
  },

  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 20,
  },

  actionButtonsRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
  },

  actionButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  postsHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },

  postsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  postsGrid: {
    paddingHorizontal: 8,
    paddingBottom: 20,
  },

  postCard: {
    flex: 1,
    margin: 4,
    aspectRatio: 1,
    position: "relative",
  },

  postImage: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },

  deleteIcon: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 12,
  },

  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },

  emptyText: {
    fontSize: 16,
    color: "#999",
    marginTop: 12,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },

  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },

  errorText: {
    fontSize: 18,
    color: "#666",
  },
});