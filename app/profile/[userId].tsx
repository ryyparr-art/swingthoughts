import PartnersModal from "@/components/modals/PartnersModal";
import UserPostsGalleryModal from "@/components/modals/UserPostsGalleryModal";
import BottomActionBar from "@/components/navigation/BottomActionBar";
import SwingFooter from "@/components/navigation/SwingFooter";
import { auth, db } from "@/constants/firebaseConfig";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SCREEN_WIDTH = Dimensions.get('window').width;

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
  imageUrls?: string[];
  imageCount?: number;
  videoUrl?: string;
  videoThumbnailUrl?: string;
  caption: string;
  createdAt: any;
  hasMedia?: boolean;
  mediaType?: "images" | "video" | null;
}

interface Stats {
  swingThoughts: number;
  leaderboardScores: number;
}

// ✅ Default stats to prevent undefined errors
const DEFAULT_STATS: Stats = {
  swingThoughts: 0,
  leaderboardScores: 0,
};

export default function ProfileScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams();
  const currentUserId = auth.currentUser?.uid;
  const isOwnProfile = userId === currentUserId;
  const { getCache, setCache, cleanupOldProfiles } = useCache();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [partnerCount, setPartnerCount] = useState(0);
  const [partnersModalVisible, setPartnersModalVisible] = useState(false);
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [showingCached, setShowingCached] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (userId && typeof userId === "string") {
      fetchProfileDataWithCache(userId);
      fetchPartnerCount();
    }
  }, [userId]);

  /* ========================= FETCH WITH CACHE ========================= */

  const fetchProfileDataWithCache = async (targetUserId: string) => {
    try {
      const cached = await getCache(CACHE_KEYS.USER_PROFILE(targetUserId));
      
      if (cached) {
        console.log("⚡ User profile cache hit:", targetUserId);
        setProfile(cached.profile);
        setPosts(cached.posts || []);
        // ✅ Use default stats if cached.stats is undefined
        setStats(cached.stats ?? DEFAULT_STATS);
        setShowingCached(true);
        setLoading(false);
      }

      await fetchProfileData(targetUserId, true);

      if (Math.random() < 0.1) {
        cleanupOldProfiles();
      }
    } catch (error) {
      console.error("❌ User profile cache error:", error);
      await fetchProfileData(targetUserId as string);
    }
  };

  const fetchProfileData = async (targetUserId: string, isBackgroundRefresh: boolean = false) => {
    try {
      if (!isBackgroundRefresh) {
        setLoading(true);
      }

      const userDoc = await getDoc(doc(db, "users", targetUserId));
      
      if (userDoc.exists()) {
        const data = userDoc.data() as UserProfile;
        setProfile(data);
      } else {
        soundPlayer.play('error');
        setProfile(null);
        setShowingCached(false);
        setLoading(false);
        return;
      }

      const postsQuery = query(
        collection(db, "thoughts"),
        where("userId", "==", targetUserId)
      );
      const postsSnap = await getDocs(postsQuery);
      const postsData: Post[] = [];
      
      postsSnap.forEach((doc) => {
        const data = doc.data();
        
        let images: string[] = [];
        if (data.imageUrls && Array.isArray(data.imageUrls) && data.imageUrls.length > 0) {
          images = data.imageUrls;
        } else if (data.imageUrl) {
          images = [data.imageUrl];
        }
        
        postsData.push({
          postId: doc.id,
          imageUrls: images,
          imageCount: images.length,
          imageUrl: data.imageUrl,
          videoUrl: data.videoUrl,
          videoThumbnailUrl: data.videoThumbnailUrl,
          caption: data.caption || data.content || "",
          createdAt: data.createdAt,
          hasMedia: data.hasMedia,
          mediaType: data.mediaType,
        });
      });

      postsData.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      setPosts(postsData);

      const scoresQuery = query(
        collection(db, "scores"),
        where("userId", "==", targetUserId)
      );
      const scoresSnap = await getDocs(scoresQuery);

      const statsData: Stats = {
        swingThoughts: postsData.length,
        leaderboardScores: scoresSnap.size,
      };

      setStats(statsData);

      if (userDoc.exists()) {
        await setCache(CACHE_KEYS.USER_PROFILE(targetUserId), {
          profile: userDoc.data() as UserProfile,
          posts: postsData,
          stats: statsData,
        });
        console.log("✅ User profile cached");
      }

      setShowingCached(false);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching profile data:", error);
      soundPlayer.play('error');
      setShowingCached(false);
      setLoading(false);
    }
  };

  /* ========================= PULL TO REFRESH ========================= */

  const onRefresh = async () => {
    if (!userId || typeof userId !== "string") return;
    
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    setShowingCached(false);
    await fetchProfileData(userId);
    
    setRefreshing(false);
  };

  /* ========================= FETCH PARTNER COUNT ========================= */

  const fetchPartnerCount = async () => {
    try {
      const partnersQuery1 = query(
        collection(db, "partners"),
        where("user1Id", "==", userId)
      );
      
      const partnersQuery2 = query(
        collection(db, "partners"),
        where("user2Id", "==", userId)
      );
      
      const [snap1, snap2] = await Promise.all([
        getDocs(partnersQuery1),
        getDocs(partnersQuery2)
      ]);
      
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

  /* ========================= HELPER: FORMAT STAT VALUE ========================= */
  
  const formatStatValue = (value: number | undefined | null): string => {
    if (value === undefined || value === null) return "—";
    return value.toString();
  };

  const renderPost = ({ item }: { item: Post }) => {
    const images = item.imageUrls || (item.imageUrl ? [item.imageUrl] : []);
    const firstImage = images[0];
    const hasMultipleImages = images.length > 1;
    
    return (
      <TouchableOpacity 
        style={styles.postCard}
        onPress={() => {
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setSelectedPostId(item.postId);
          setGalleryModalVisible(true);
        }}
      >
        {item.videoThumbnailUrl ? (
          <>
            <Image source={{ uri: item.videoThumbnailUrl }} style={styles.postImage} />
            <View style={styles.videoIndicator}>
              <Ionicons name="play-circle" size={40} color="#FFF" />
            </View>
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
        ) : firstImage ? (
          <>
            <Image source={{ uri: firstImage }} style={styles.postImage} />
            
            {hasMultipleImages && (
              <View style={styles.multiImageIndicator}>
                <Ionicons name="images" size={16} color="#FFF" />
                <Text style={styles.multiImageText}>{images.length}</Text>
              </View>
            )}
            
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
  };

  if (loading && !showingCached) {
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

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

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
          <View style={styles.headerButton} />
        )}
      </View>

      {showingCached && !loading && (
        <View style={styles.cacheIndicator}>
          <ActivityIndicator size="small" color="#0D5C3A" />
          <Text style={styles.cacheText}>Updating profile...</Text>
        </View>
      )}

      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={(item) => item.postId}
        numColumns={3}
        contentContainerStyle={styles.postsGrid}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0D5C3A"
            colors={["#0D5C3A"]}
          />
        }
        ListHeaderComponent={
          <>
            {/* ✅ Golf Membership Card Style Header */}
            <View style={styles.profileCard}>
              <View style={styles.profileCardInner}>
                {/* Avatar with Gold Ring */}
                <View style={styles.avatarContainer}>
                  {profile.avatar ? (
                    <Image source={{ uri: profile.avatar }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarInitial}>
                        {profile.displayName[0]?.toUpperCase() || "?"}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Display Name */}
                <Text style={styles.displayName}>{profile.displayName}</Text>

                {/* Stats Row - Connected Bar */}
                <View style={styles.statsBar}>
                  {/* Thoughts */}
                  <View style={styles.statItem}>
                    <View style={styles.statValueRow}>
                      <Ionicons name="chatbubble-outline" size={14} color="#0D5C3A" style={styles.statIcon} />
                      <Text style={styles.statValue}>
                        {formatStatValue(stats?.swingThoughts)}
                      </Text>
                    </View>
                    <Text style={styles.statLabel}>THOUGHTS</Text>
                  </View>

                  <View style={styles.statDivider} />

                  {/* Handicap */}
                  <View style={styles.statItem}>
                    <View style={styles.statValueRow}>
                      <Ionicons name="golf-outline" size={14} color="#0D5C3A" style={styles.statIcon} />
                      <Text style={styles.statValue}>
                        {profile.handicap !== undefined && profile.handicap !== null 
                          ? profile.handicap 
                          : "—"}
                      </Text>
                    </View>
                    <Text style={styles.statLabel}>HANDICAP</Text>
                  </View>

                  <View style={styles.statDivider} />

                  {/* Partners */}
                  <TouchableOpacity 
                    style={styles.statItem}
                    onPress={() => {
                      soundPlayer.play('click');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPartnersModalVisible(true);
                    }}
                  >
                    <View style={styles.statValueRow}>
                      <Ionicons name="people-outline" size={14} color="#0D5C3A" style={styles.statIcon} />
                      <Text style={styles.statValue}>
                        {formatStatValue(partnerCount)}
                      </Text>
                    </View>
                    <View style={styles.statLabelRow}>
                      <Text style={styles.statLabel}>PARTNERS</Text>
                      <Ionicons name="chevron-forward" size={10} color="#999" />
                    </View>
                  </TouchableOpacity>

                  <View style={styles.statDivider} />

                  {/* Scores */}
                  <View style={styles.statItem}>
                    <View style={styles.statValueRow}>
                      <Ionicons name="trophy-outline" size={14} color="#0D5C3A" style={styles.statIcon} />
                      <Text style={styles.statValue}>
                        {formatStatValue(stats?.leaderboardScores)}
                      </Text>
                    </View>
                    <Text style={styles.statLabel}>SCORES</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.postsHeader}>
              <Text style={styles.postsTitle}>Thoughts</Text>
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

      {userId && profile && (
        <UserPostsGalleryModal
          visible={galleryModalVisible}
          userId={Array.isArray(userId) ? userId[0] : (userId || '')}
          initialPostId={selectedPostId}
          userName={profile.displayName}
          onClose={() => {
            soundPlayer.play('click');
            setGalleryModalVisible(false);
            setSelectedPostId(undefined);
          }}
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

  cacheIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    backgroundColor: "#FFF3CD",
    borderBottomWidth: 1,
    borderBottomColor: "#FFECB5",
  },
  
  cacheText: {
    fontSize: 12,
    color: "#664D03",
    fontWeight: "600",
  },

  /* ✅ Golf Membership Card Styles */
  profileCard: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D4D0C5",
    backgroundColor: "#F4EED8",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    overflow: "hidden",
  },

  profileCardInner: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },

  avatarContainer: {
    marginBottom: 16,
    borderRadius: 54,
    padding: 4,
    backgroundColor: "#FFD700",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },

  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#E0E0E0",
  },

  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },

  avatarInitial: {
    fontSize: 40,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  displayName: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0D5C3A",
    marginBottom: 20,
    letterSpacing: 0.5,
  },

  /* Stats Bar - Connected */
  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingVertical: 14,
    paddingHorizontal: 8,
    width: "100%",
  },

  statItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: "#E0E0E0",
  },

  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },

  statIcon: {
    marginRight: 4,
  },

  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0D5C3A",
  },

  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#888",
    letterSpacing: 0.5,
  },

  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
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

  videoIndicator: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  
  multiImageIndicator: {
    position: "absolute",
    top: 6,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
  },
  
  multiImageText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
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