import CoursePlayersModal from "@/components/modals/CoursePlayersModal";
import CoursePostsGalleryModal from "@/components/modals/CoursePostsGalleryModal";
import BottomActionBar from "@/components/navigation/BottomActionBar";
import SwingFooter from "@/components/navigation/SwingFooter";
import { auth, db } from "@/constants/firebaseConfig";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import { soundPlayer } from "@/utils/soundPlayer";
import { batchGetUserProfiles } from "@/utils/userProfileHelpers";
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

interface CourseProfile {
  courseId: number;
  courseName: string;
  location?: {
    city: string;
    state: string;
  };
  par?: number;
  slope?: number;
  claimed: boolean;
  claimedByUserId?: string;
}

interface Post {
  postId: string;
  userId: string;
  imageUrl?: string;
  imageUrls?: string[];
  imageCount?: number;
  videoUrl?: string;
  videoThumbnailUrl?: string;
  caption: string;
  createdAt: any;
  userName?: string;
  userAvatar?: string;
  hasMedia?: boolean;
  mediaType?: "images" | "video" | null;
}

interface Stats {
  totalRounds: number;
  holeInOnes: number;
  totalPlayers: number;
  totalMembers: number;
}

export default function CourseProfileScreen() {
  const router = useRouter();
  const { courseId } = useLocalSearchParams();
  const currentUserId = auth.currentUser?.uid;
  const { getCache, setCache, cleanupOldProfiles } = useCache();

  const [profile, setProfile] = useState<CourseProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState<Stats>({ 
    totalRounds: 0, 
    holeInOnes: 0,
    totalPlayers: 0,
    totalMembers: 0
  });
  const [playersModalVisible, setPlayersModalVisible] = useState(false);
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [showingCached, setShowingCached] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isOwnCourse, setIsOwnCourse] = useState(false);

  useEffect(() => {
    if (courseId && typeof courseId === "string") {
      fetchCourseDataWithCache(courseId);
    }
  }, [courseId]);

  /* ========================= FETCH WITH CACHE ========================= */

  const fetchCourseDataWithCache = async (targetCourseId: string) => {
    try {
      const cached = await getCache(CACHE_KEYS.COURSE_PROFILE(targetCourseId));
      
      if (cached) {
        console.log("⚡ Course profile cache hit:", targetCourseId);
        setProfile(cached.profile);
        setPosts(cached.posts);
        setStats(cached.stats);
        setIsOwnCourse(cached.isOwnCourse || false);
        setShowingCached(true);
        setLoading(false);
      }

      await fetchCourseData(targetCourseId, true);

      if (Math.random() < 0.1) {
        cleanupOldProfiles();
      }
    } catch (error) {
      console.error("❌ Course profile cache error:", error);
      await fetchCourseData(targetCourseId);
    }
  };

  const fetchCourseData = async (targetCourseId: string, isBackgroundRefresh: boolean = false) => {
    try {
      if (!isBackgroundRefresh) {
        setLoading(true);
      }

      const coursesQuery = query(
        collection(db, "courses"),
        where("id", "==", Number(targetCourseId))
      );
      const coursesSnap = await getDocs(coursesQuery);
      
      if (coursesSnap.empty) {
        setShowingCached(false);
        setLoading(false);
        return;
      }

      const courseData = coursesSnap.docs[0].data();
      
      const profileData: CourseProfile = {
        courseId: Number(targetCourseId),
        courseName: courseData.courseName || courseData.course_name || "Course",
        location: courseData.location,
        par: courseData.par,
        slope: courseData.slope,
        claimed: courseData.claimed || false,
        claimedByUserId: courseData.claimedByUserId,
      };

      setProfile(profileData);

      let courseOwnerId: string | null = courseData.claimedByUserId || null;
      let isOwned = false;
      
      if (currentUserId) {
        const userDoc = await getDoc(doc(db, "users", currentUserId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.ownedCourseId === Number(targetCourseId)) {
            isOwned = true;
            setIsOwnCourse(true);
            courseOwnerId = currentUserId;
            profileData.claimed = true;
            profileData.claimedByUserId = currentUserId;
            setProfile(profileData);
          }
        }
      }

      const scoresQuery = query(
        collection(db, "scores"),
        where("courseId", "==", Number(targetCourseId))
      );
      const scoresSnap = await getDocs(scoresQuery);

      const leaderRef = doc(db, "course_leaders", targetCourseId);
      const leaderSnap = await getDoc(leaderRef);
      
      let holeInOnesCount = 0;
      
      if (leaderSnap.exists()) {
        const leaderData = leaderSnap.data();
        holeInOnesCount = leaderData.holeinones?.length || 0;
      }

      const usersSnap = await getDocs(collection(db, "users"));
      let playersCount = 0;
      let membersCount = 0;

      usersSnap.forEach((doc) => {
        const userData = doc.data();
        const playerCourses = userData.playerCourses || [];
        const memberCourses = userData.declaredMemberCourses || [];

        if (playerCourses.includes(Number(targetCourseId))) {
          playersCount++;
        }

        if (memberCourses.includes(Number(targetCourseId))) {
          membersCount++;
        }
      });

      const statsData: Stats = {
        totalRounds: scoresSnap.size,
        holeInOnes: holeInOnesCount,
        totalPlayers: playersCount,
        totalMembers: membersCount,
      };

      setStats(statsData);

      const postsQuery = query(collection(db, "thoughts"));
      const postsSnap = await getDocs(postsQuery);
      
      const postsData: Post[] = [];
      const userIds = new Set<string>();

      postsSnap.forEach((doc) => {
        const data = doc.data();
        
        const taggedCourses = data.taggedCourses || [];
        const isTagged = taggedCourses.some((c: any) => c.courseId === Number(targetCourseId));
        const isCreatedByCourseOwner = courseOwnerId && data.userId === courseOwnerId;
        
        if (isTagged || isCreatedByCourseOwner) {
          let images: string[] = [];
          if (data.imageUrls && Array.isArray(data.imageUrls) && data.imageUrls.length > 0) {
            images = data.imageUrls;
          } else if (data.imageUrl) {
            images = [data.imageUrl];
          }
          
          postsData.push({
            postId: doc.id,
            userId: data.userId,
            imageUrls: images,
            imageCount: images.length,
            imageUrl: data.imageUrl,
            videoUrl: data.videoUrl,
            videoThumbnailUrl: data.videoThumbnailUrl,
            caption: data.caption || data.content || "",
            createdAt: data.createdAt,
            userName: data.userName,
            userAvatar: data.userAvatar,
            hasMedia: data.hasMedia,
            mediaType: data.mediaType,
          });
          if (data.userId) userIds.add(data.userId);
        }
      });

      if (userIds.size > 0) {
        const profilesMap = await batchGetUserProfiles(Array.from(userIds));
        const profiles: Record<string, any> = {};

        profilesMap.forEach((profile, oduserId) => {
          profiles[oduserId] = {
            displayName: profile.displayName,
            avatar: profile.avatar,
          };
        });

        postsData.forEach((post: any) => {
          const postData = postsSnap.docs.find(d => d.id === post.postId)?.data();
          if (postData && postData.userId) {
            if (!post.userName && profiles[postData.userId]) {
              post.userName = profiles[postData.userId].displayName;
              post.userAvatar = profiles[postData.userId].avatar;
            }
          }
        });
      }

      postsData.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      setPosts(postsData);

      await setCache(CACHE_KEYS.COURSE_PROFILE(targetCourseId), {
        profile: profileData,
        posts: postsData,
        stats: statsData,
        isOwnCourse: isOwned,
      });
      console.log("✅ Course profile cached");

      setShowingCached(false);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching course data:", error);
      soundPlayer.play('error');
      setShowingCached(false);
      setLoading(false);
    }
  };

  /* ========================= PULL TO REFRESH ========================= */

  const onRefresh = async () => {
    if (!courseId || typeof courseId !== "string") return;
    
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    setShowingCached(false);
    await fetchCourseData(courseId);
    
    setRefreshing(false);
  };

  /* ========================= HANDLERS ========================= */

  const handleEditPost = (postId: string) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/create?editId=${postId}`);
  };

  const renderPost = ({ item }: { item: Post }) => {
    const isOwnPost = currentUserId && item.userId === currentUserId;
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
          </>
        ) : (
          <View style={styles.textOnlyCard}>
            <Text style={styles.textOnlyContent} numberOfLines={4}>
              {item.caption}
            </Text>
          </View>
        )}
        
        {isOwnPost && (
          <TouchableOpacity
            style={styles.editButton}
            onPress={(e) => {
              e.stopPropagation();
              handleEditPost(item.postId);
            }}
          >
            <Ionicons name="create-outline" size={20} color="#0D5C3A" />
          </TouchableOpacity>
        )}
        
        {item.userName && (
          <View style={styles.postOverlay}>
            {item.userAvatar ? (
              <Image source={{ uri: item.userAvatar }} style={styles.postUserAvatar} />
            ) : (
              <View style={styles.postUserAvatarPlaceholder}>
                <Ionicons name="person" size={12} color="#FFF" />
              </View>
            )}
            <Text style={styles.postUserName} numberOfLines={1}>
              {item.userName}
            </Text>
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
        <Text style={styles.errorText}>Course not found</Text>
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

        <Text style={styles.headerTitle}>Course Profile</Text>

        {isOwnCourse ? (
          <TouchableOpacity
            onPress={() => {
              soundPlayer.play('click');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
          <Text style={styles.cacheText}>Updating course profile...</Text>
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
            {/* ✅ NEW: Golf Membership Card Style Header */}
            <View style={styles.profileCard}>
              <View style={styles.profileCardInner}>
                {/* Course Icon with Gold Ring */}
                <View style={styles.iconContainer}>
                  <View style={styles.courseIconInner}>
                    <Ionicons name="flag" size={50} color="#0D5C3A" />
                  </View>
                </View>

                {/* Course Name */}
                <Text style={styles.courseName}>{profile.courseName}</Text>

                {/* Location & Details */}
                {profile.location && (
                  <Text style={styles.courseLocation}>
                    {profile.location.city}, {profile.location.state}
                  </Text>
                )}

                {(profile.par || profile.slope) && (
                  <Text style={styles.courseDetails}>
                    {profile.par ? `Par ${profile.par}` : ""}
                    {profile.par && profile.slope ? " • " : ""}
                    {profile.slope ? `Slope ${profile.slope}` : ""}
                  </Text>
                )}

                {/* Stats Row - Connected Bar */}
                <View style={styles.statsBar}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{stats.totalRounds}</Text>
                    <Text style={styles.statLabel}>ROUNDS</Text>
                  </View>

                  <View style={styles.statDivider} />

                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{stats.holeInOnes}</Text>
                    <Text style={styles.statLabel}>ACES</Text>
                  </View>

                  <View style={styles.statDivider} />

                  <TouchableOpacity 
                    style={styles.statItem}
                    onPress={() => {
                      soundPlayer.play('click');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPlayersModalVisible(true);
                    }}
                  >
                    <Text style={styles.statValue}>{stats.totalPlayers}</Text>
                    <View style={styles.statLabelRow}>
                      <Text style={styles.statLabel}>PLAYERS</Text>
                      <Ionicons name="chevron-forward" size={10} color="#999" />
                    </View>
                  </TouchableOpacity>

                  <View style={styles.statDivider} />

                  <TouchableOpacity 
                    style={styles.statItem}
                    onPress={() => {
                      soundPlayer.play('click');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPlayersModalVisible(true);
                    }}
                  >
                    <Text style={styles.statValue}>{stats.totalMembers}</Text>
                    <View style={styles.statLabelRow}>
                      <Text style={styles.statLabel}>MEMBERS</Text>
                      <Ionicons name="chevron-forward" size={10} color="#999" />
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Unclaimed Banner */}
                {!profile.claimed && (
                  <View style={styles.unclaimedBanner}>
                    <Ionicons name="information-circle-outline" size={18} color="#666" />
                    <Text style={styles.unclaimedText}>
                      This course hasn't claimed their profile yet
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.postsHeader}>
              <Text style={styles.postsTitle}>
                {posts.length > 0 ? "Thoughts Tagged Here" : "No Posts Yet"}
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={64} color="#CCC" />
            <Text style={styles.emptyText}>
              No posts tagged at this course yet
            </Text>
          </View>
        }
      />

      {profile && (
        <CoursePlayersModal
          visible={playersModalVisible}
          onClose={() => {
            soundPlayer.play('click');
            setPlayersModalVisible(false);
          }}
          courseId={profile.courseId}
          courseName={profile.courseName}
        />
      )}

      {profile && (
        <CoursePostsGalleryModal
          visible={galleryModalVisible}
          courseId={profile.courseId}
          courseName={profile.courseName}
          initialPostId={selectedPostId}
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

  /* ✅ NEW: Golf Membership Card Styles */
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

  iconContainer: {
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

  courseIconInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },

  courseName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0D5C3A",
    marginBottom: 4,
    textAlign: "center",
    paddingHorizontal: 8,
    letterSpacing: 0.5,
  },

  courseLocation: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666",
    marginBottom: 2,
  },

  courseDetails: {
    fontSize: 13,
    color: "#888",
    marginBottom: 20,
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
    paddingHorizontal: 4,
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

  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0D5C3A",
    marginBottom: 2,
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

  unclaimedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F5F5F5",
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    width: "100%",
  },

  unclaimedText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    fontStyle: "italic",
    flex: 1,
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
    position: 'relative',
  },

  editButton: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 12,
    padding: 6,
    zIndex: 10,
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

  postOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  postUserAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },

  postUserAvatarPlaceholder: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#666",
    justifyContent: "center",
    alignItems: "center",
  },

  postUserName: {
    fontSize: 9,
    fontWeight: "600",
    color: "#FFFFFF",
    flex: 1,
  },

  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },

  emptyText: {
    fontSize: 16,
    color: "#999",
    marginTop: 12,
    textAlign: "center",
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