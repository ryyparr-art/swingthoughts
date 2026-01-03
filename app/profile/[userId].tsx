import PartnersModal from "@/components/modals/PartnersModal";
import BottomActionBar from "@/components/navigation/BottomActionBar";
import SwingFooter from "@/components/navigation/SwingFooter";
import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
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
  imageUrl?: string;
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
  const [partnerCount, setPartnerCount] = useState(0);
  const [partnersModalVisible, setPartnersModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      fetchProfileData();
      fetchPartnerCount();
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
          caption: data.caption || data.content || "",
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
      soundPlayer.play('error');
      setLoading(false);
    }
  };

  const fetchPartnerCount = async () => {
    try {
      // Query where user is user1Id
      const partnersQuery1 = query(
        collection(db, "partners"),
        where("user1Id", "==", userId)
      );
      
      // Query where user is user2Id
      const partnersQuery2 = query(
        collection(db, "partners"),
        where("user2Id", "==", userId)
      );
      
      const [snap1, snap2] = await Promise.all([
        getDocs(partnersQuery1),
        getDocs(partnersQuery2)
      ]);
      
      // Combine results (dedupe by document ID)
      const partnerDocIds = new Set<string>();
      snap1.forEach(doc => partnerDocIds.add(doc.id));
      snap2.forEach(doc => partnerDocIds.add(doc.id));
      
      setPartnerCount(partnerDocIds.size);
    } catch (error) {
      console.error("Error fetching partner count:", error);
      setPartnerCount(0);
    }
  };

  const handleEditPost = (postId: string) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/create?editId=${postId}`);
  };

  const renderPost = ({ item }: { item: Post }) => (
    <TouchableOpacity 
      style={styles.postCard}
      onPress={() => {
        soundPlayer.play('click');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/post/${item.postId}`);
      }}
    >
      {item.imageUrl ? (
        <>
          <Image source={{ uri: item.imageUrl }} style={styles.postImage} />
          {isOwnProfile && (
            <TouchableOpacity 
              style={styles.editIcon}
              onPress={(e) => {
                e.stopPropagation();
                handleEditPost(item.postId);
              }}
            >
              <Ionicons name="create-outline" size={20} color="#0D5C3A" />
            </TouchableOpacity>
          )}
        </>
      ) : (
        // Text-only post card
        <View style={styles.textOnlyCard}>
          <Text style={styles.textOnlyContent} numberOfLines={4}>
            {item.caption}
          </Text>
          {isOwnProfile && (
            <TouchableOpacity 
              style={styles.editIconText}
              onPress={(e) => {
                e.stopPropagation();
                handleEditPost(item.postId);
              }}
            >
              <Ionicons name="create-outline" size={20} color="#0D5C3A" />
            </TouchableOpacity>
          )}
        </View>
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
        <TouchableOpacity 
          onPress={() => {
            soundPlayer.play('click');
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

        <Text style={styles.headerTitle}>Profile</Text>

        {isOwnProfile ? (
          <TouchableOpacity
            onPress={() => {
              soundPlayer.play('click');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/profile/settings");
            }}
            style={styles.headerButton}
          >
            <Ionicons name="settings-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            disabled={true}
            style={[styles.headerButton, styles.settingsButtonDisabled]}
          >
            <Ionicons name="settings-outline" size={24} color="#999" />
          </TouchableOpacity>
        )}
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

            {/* Stats Tiles - NOW 4 TILES */}
            <View style={styles.statsContainer}>
              {/* Tile 1: Swing Thoughts */}
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>Swing Thoughts</Text>
                <Text style={styles.statValue}>{stats.swingThoughts}</Text>
              </View>

              {/* Tile 2: Handicap */}
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>Handicap</Text>
                <Text style={styles.statValue}>
                  {profile.handicap || "—"}
                </Text>
              </View>

              {/* Tile 3: Partners - TAPPABLE with Icons */}
              <TouchableOpacity 
                style={styles.statTile}
                onPress={() => {
                  soundPlayer.play('click');
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPartnersModalVisible(true);
                }}
              >
                <View style={styles.statLabelRow}>
                  <Text style={styles.statLabel}>Partners</Text>
                  <View style={styles.iconPair}>
                    <Ionicons name="person" size={12} color="#0D5C3A" />
                    <Ionicons name="golf" size={12} color="#0D5C3A" />
                  </View>
                </View>
                <Text style={styles.statValue}>{partnerCount}</Text>
              </TouchableOpacity>

              {/* Tile 4: Scores Posted */}
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>Scores Posted</Text>
                <Text style={styles.statValue}>{stats.leaderboardScores}</Text>
              </View>
            </View>

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

      {/* Partners Modal */}
      {userId && (
        <PartnersModal
          visible={partnersModalVisible}
          onClose={() => {
            soundPlayer.play('click');
            setPartnersModalVisible(false);
          }}
          userId={Array.isArray(userId) ? userId[0] : (userId || '')}
          isOwnProfile={isOwnProfile}
        />
      )}

      <BottomActionBar />
      <SwingFooter />
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

  settingsButtonDisabled: {
    opacity: 0.4,
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
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 8,
    marginBottom: 16,
  },

  statTile: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },

  iconPair: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: 2,
  },

  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#666",
    textAlign: "center",
  },

  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
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
    paddingBottom: 140,
  },

  postCard: {
    width: '33.33%',
    aspectRatio: 1,
    padding: 1,
  },

  postImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#E0E0E0",
  },

  textOnlyCard: {
    width: "100%",
    height: "100%",
    backgroundColor: "#0D5C3A",
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  textOnlyContent: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
  },

  editIcon: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 12,
    padding: 6,
  },

  editIconText: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 12,
    padding: 6,
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