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
const CARD_WIDTH = (SCREEN_WIDTH - 34) / 3; // 3 columns with padding

interface UserProfile {
  displayName: string;
  avatar?: string;
  handicap: number;
  badges: string[];
  selectedBadges?: string[];
}

interface Post {
  postId: string;
  
  // NEW: Multi-image support
  imageUrl?: string; // Deprecated
  imageUrls?: string[]; // NEW
  imageCount?: number;
  
  videoUrl?: string;
  videoThumbnailUrl?: string;
  caption: string;
  createdAt: any;
  
  // NEW: Media metadata
  hasMedia?: boolean;
  mediaType?: "images" | "video" | null;
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
  const { getCache, setCache, cleanupOldProfiles } = useCache(); // ✅ Add cache hook

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState<Stats>({ swingThoughts: 0, leaderboardScores: 0 });
  const [partnerCount, setPartnerCount] = useState(0);
  const [partnersModalVisible, setPartnersModalVisible] = useState(false);
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [showingCached, setShowingCached] = useState(false); // ✅ Cache indicator
  const [refreshing, setRefreshing] = useState(false); // ✅ Pull to refresh

  useEffect(() => {
    if (userId && typeof userId === "string") {
      fetchProfileDataWithCache(userId);
      fetchPartnerCount();
    }
  }, [userId]);

  /* ========================= FETCH WITH CACHE ========================= */

  const fetchProfileDataWithCache = async (targetUserId: string) => {
    try {
      // Step 1: Try to load from cache (instant)
      const cached = await getCache(CACHE_KEYS.USER_PROFILE(targetUserId));
      
      if (cached) {
        console.log("⚡ User profile cache hit:", targetUserId);
        setProfile(cached.profile);
        setPosts(cached.posts);
        setStats(cached.stats);
        setShowingCached(true);
        setLoading(false);
      }

      // Step 2: Fetch fresh data (always)
      await fetchProfileData(targetUserId, true);

      // Step 3: Cleanup old profiles periodically (10% of the time)
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
        
        // NEW: Get images array (handle both old and new formats)
        let images: string[] = [];
        if (data.imageUrls && Array.isArray(data.imageUrls) && data.imageUrls.length > 0) {
          images = data.imageUrls;
        } else if (data.imageUrl) {
          images = [data.imageUrl];
        }
        
        postsData.push({
          postId: doc.id,
          
          // NEW: Multi-image support
          imageUrls: images,
          imageCount: images.length,
          imageUrl: data.imageUrl, // Keep for backwards compat
          
          videoUrl: data.videoUrl,
          videoThumbnailUrl: data.videoThumbnailUrl,
          caption: data.caption || data.content || "",
          createdAt: data.createdAt,
          
          // NEW: Media metadata
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

      const statsData = {
        swingThoughts: postsData.length,
        leaderboardScores: scoresSnap.size,
      };

      setStats(statsData);

      // ✅ Step 3: Update cache
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

  const renderPost = ({ item }: { item: Post }) => {
    // NEW: Get first image from array (for thumbnail)
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
        {/* Video post with thumbnail */}
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
          /* Image post (single or multiple) */
          <>
            <Image source={{ uri: firstImage }} style={styles.postImage} />
            
            {/* NEW: Multi-image indicator */}
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
          /* Text-only post */
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

  const displayBadges = profile.selectedBadges || profile.badges?.slice(0, 3) || [];

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
          <TouchableOpacity
            disabled={true}
            style={[styles.headerButton, styles.settingsButtonDisabled]}
          >
            <Ionicons name="settings-outline" size={24} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Cache indicator - only show when cache is displayed */}
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

              <View style={styles.badgesRow}>
                {displayBadges.slice(0, 3).map((badge, index) => (
                  <View key={index} style={styles.badgeIcon}>
                    <Text style={styles.badgeEmoji}>🏆</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.statsContainer}>
              <View style={styles.statTile}>
                <Text style={styles.statLabel}>Swing Thoughts</Text>
                <Text style={styles.statValue}>{stats.swingThoughts}</Text>
              </View>

              <View style={styles.statTile}>
                <Text style={styles.statLabel}>Handicap</Text>
                <Text style={styles.statValue}>
                  {profile.handicap || "—"}
                </Text>
              </View>

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

              <View style={styles.statTile}>
                <Text style={styles.statLabel}>Scores Posted</Text>
                <Text style={styles.statValue}>{stats.leaderboardScores}</Text>
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
  
  // NEW: Multi-image indicator
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