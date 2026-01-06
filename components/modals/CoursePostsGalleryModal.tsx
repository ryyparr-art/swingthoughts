import CommentsModal from "@/components/modals/CommentsModal";
import ReportModal from "@/components/modals/ReportModal";
import { auth, db } from "@/constants/firebaseConfig";
import { getPostTypeLabel } from "@/constants/postTypes";
import { createNotification } from "@/utils/notificationHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import { batchGetUserProfiles } from "@/utils/userProfileHelpers";
import { Ionicons } from "@expo/vector-icons";
import { AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
    arrayRemove,
    arrayUnion,
    collection,
    doc,
    getDocs,
    increment,
    orderBy,
    query,
    updateDoc,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Modal,
    Platform,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface Thought {
  id: string;
  thoughtId: string;
  userId: string;
  userType: string;
  content: string;
  postType?: string;
  imageUrl?: string;
  videoUrl?: string;
  videoThumbnailUrl?: string;
  videoDuration?: number;
  videoTrimStart?: number;
  videoTrimEnd?: number;
  createdAt: any;
  likes: number;
  likedBy?: string[];
  comments?: number;
  displayName?: string;
  courseName?: string;
  avatarUrl?: string;
  taggedPartners?: Array<{ userId: string; displayName: string }>;
  taggedCourses?: Array<{ courseId: number; courseName: string }>;
  ownedCourseId?: number;
  linkedCourseId?: number;
}

interface CoursePostsGalleryModalProps {
  visible: boolean;
  courseId: number;
  courseName: string;
  initialPostId?: string;
  onClose: () => void;
}

/* ================================================================ */
/* WEB VIDEO COMPONENT                                              */
/* ================================================================ */

const WebVideoPlayer = ({
  videoUrl,
  thoughtId,
  onRefSet,
  onEnded,
}: {
  videoUrl: string;
  thoughtId: string;
  onRefSet: (ref: HTMLVideoElement | null) => void;
  onEnded: () => void;
}) => {
  return (
    <video
      ref={onRefSet}
      src={videoUrl}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        backgroundColor: "#000",
      }}
      playsInline
      preload="metadata"
      crossOrigin="anonymous"
      onLoadedData={() => console.log("📹 Video loaded for:", thoughtId)}
      onError={(e) => {
        console.error("❌ Video error for:", thoughtId, e);
      }}
      onEnded={onEnded}
    />
  );
};

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function CoursePostsGalleryModal({
  visible,
  courseId,
  courseName,
  initialPostId,
  onClose,
}: CoursePostsGalleryModalProps) {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);

  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");

  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedThought, setSelectedThought] = useState<Thought | null>(null);

  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportingThought, setReportingThought] = useState<Thought | null>(null);

  // Video playback states
  const [playingVideos, setPlayingVideos] = useState<Set<string>>(new Set());
  const videoRefs = useRef<{ [key: string]: any }>({});

  // Highlighted post (auto-scroll target)
  const [highlightedPostId, setHighlightedPostId] = useState<string | undefined>(initialPostId);

  /* ------------------ AUTH ------------------ */
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) setCurrentUserId(user.uid);
    });
    return () => unsub();
  }, []);

  /* ------------------ FETCH POSTS ------------------ */
  useEffect(() => {
    if (visible && courseId) {
      loadPosts();
    }
  }, [visible, courseId]);

  const loadPosts = async () => {
    try {
      setLoading(true);

      // Get ALL posts from thoughts collection
      const postsQuery = query(collection(db, "thoughts"), orderBy("createdAt", "desc"));
      const postsSnap = await getDocs(postsQuery);

      const postsData: Thought[] = [];
      const userIds = new Set<string>();

      // Filter posts that are tagged with this course OR created by course owner
      postsSnap.forEach((doc) => {
        const data = doc.data();

        const taggedCourses = data.taggedCourses || [];
        const isTagged = taggedCourses.some((c: any) => c.courseId === courseId);
        
        // Note: courseOwnerId would need to be passed as prop if we want to include course owner posts
        // For now, just check tagged courses

        if (isTagged) {
          postsData.push({
            id: doc.id,
            thoughtId: data.thoughtId || doc.id,
            userId: data.userId,
            userType: data.userType || "Golfer",
            content: data.content || data.caption || "",
            postType: data.postType,
            imageUrl: data.imageUrl,
            videoUrl: data.videoUrl,
            videoThumbnailUrl: data.videoThumbnailUrl,
            videoDuration: data.videoDuration,
            videoTrimStart: data.videoTrimStart,
            videoTrimEnd: data.videoTrimEnd,
            createdAt: data.createdAt,
            likes: data.likes || 0,
            likedBy: data.likedBy || [],
            comments: data.comments || 0,
            courseName: data.courseName,
            taggedPartners: data.taggedPartners || [],
            taggedCourses: data.taggedCourses || [],
            ownedCourseId: data.ownedCourseId,
            linkedCourseId: data.linkedCourseId,
          });

          if (data.userId) userIds.add(data.userId);
        }
      });

      // Batch get user profiles
      const profilesMap = await batchGetUserProfiles(Array.from(userIds));
      const profiles: Record<string, any> = {};

      profilesMap.forEach((profile, userId) => {
        profiles[userId] = {
          displayName: profile.displayName,
          avatar: profile.avatar,
        };
      });

      // Add user info to posts
      postsData.forEach((post) => {
        if (profiles[post.userId]) {
          post.displayName = profiles[post.userId].displayName;
          post.avatarUrl = profiles[post.userId].avatar;
        }
      });

      setThoughts(postsData);
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
      soundPlayer.play("error");
      setLoading(false);
    }
  };

  /* ------------------ AUTO-SCROLL TO INITIAL POST ------------------ */
  useEffect(() => {
    if (!highlightedPostId || loading || thoughts.length === 0) return;

    console.log("🎯 Scrolling to post:", highlightedPostId);

    const postIndex = thoughts.findIndex((t) => t.id === highlightedPostId);

    if (postIndex !== -1) {
      console.log("✅ Post found at index:", postIndex);

      setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: postIndex,
            animated: true,
            viewPosition: 0.2,
          });
          console.log("✅ Scrolled to post");

          // Remove highlight after 2 seconds
          setTimeout(() => {
            setHighlightedPostId(undefined);
          }, 2000);
        } catch (error) {
          console.log("⚠️ Scroll error, using offset");
          flatListRef.current?.scrollToOffset({
            offset: postIndex * 400,
            animated: true,
          });
        }
      }, 500);
    }
  }, [highlightedPostId, loading, thoughts.length]);

  /* ------------------ VIDEO PLAYBACK ------------------ */
  const handleVideoPlayback = async (thoughtId: string) => {
    const videoRef = videoRefs.current[thoughtId];
    if (!videoRef) return;

    try {
      soundPlayer.play("click");

      if (Platform.OS === "web") {
        const videoElement = videoRef as HTMLVideoElement;

        if (videoElement.paused) {
          await videoElement.play();
          setPlayingVideos((prev) => new Set(prev).add(thoughtId));
        } else {
          videoElement.pause();
          setPlayingVideos((prev) => {
            const newSet = new Set(prev);
            newSet.delete(thoughtId);
            return newSet;
          });
        }
      } else {
        const status = await videoRef.getStatusAsync();

        if (status.isLoaded) {
          if (status.isPlaying) {
            await videoRef.pauseAsync();
            setPlayingVideos((prev) => {
              const newSet = new Set(prev);
              newSet.delete(thoughtId);
              return newSet;
            });
          } else {
            await videoRef.playAsync();
            setPlayingVideos((prev) => new Set(prev).add(thoughtId));
          }
        }
      }
    } catch (error) {
      console.error("❌ Video playback error:", error);
      soundPlayer.play("error");
    }
  };

  const handleVideoEnd = (thoughtId: string) => {
    setPlayingVideos((prev) => {
      const newSet = new Set(prev);
      newSet.delete(thoughtId);
      return newSet;
    });
  };

  const handleReplayVideo = async (thoughtId: string) => {
    const videoRef = videoRefs.current[thoughtId];
    if (!videoRef) return;

    try {
      soundPlayer.play("click");

      if (Platform.OS === "web") {
        const videoElement = videoRef as HTMLVideoElement;
        videoElement.currentTime = 0;
        await videoElement.play();
        setPlayingVideos((prev) => new Set(prev).add(thoughtId));
      } else {
        await videoRef.replayAsync();
        setPlayingVideos((prev) => new Set(prev).add(thoughtId));
      }
    } catch (error) {
      console.error("Video replay error:", error);
      soundPlayer.play("error");
    }
  };

  /* ------------------ LIKE ------------------ */
  const handleLike = async (thought: Thought) => {
    if (!currentUserId) {
      soundPlayer.play("error");
      return Alert.alert("Please sign in to like posts");
    }

    if (thought.userId === currentUserId) {
      soundPlayer.play("error");
      return Alert.alert("You can't like your own post");
    }

    try {
      soundPlayer.play("dart");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const ref = doc(db, "thoughts", thought.id);
      const hasLiked = thought.likedBy?.includes(currentUserId);

      await updateDoc(ref, {
        likes: increment(hasLiked ? -1 : 1),
        likedBy: hasLiked ? arrayRemove(currentUserId) : arrayUnion(currentUserId),
      });

      if (!hasLiked) {
        await createNotification({
          userId: thought.userId,
          type: "like",
          actorId: currentUserId,
          postId: thought.id,
        });
      }

      setThoughts((prev) =>
        prev.map((t) =>
          t.id === thought.id
            ? {
                ...t,
                likes: hasLiked ? t.likes - 1 : t.likes + 1,
                likedBy: hasLiked
                  ? t.likedBy?.filter((id) => id !== currentUserId)
                  : [...(t.likedBy || []), currentUserId],
              }
            : t
        )
      );
    } catch (err) {
      console.error("Like error:", err);
      soundPlayer.play("error");
    }
  };

  /* ------------------ COMMENTS ------------------ */
  const handleComments = (thought: Thought) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedThought(thought);
    setCommentsModalVisible(true);
  };

  const handleCommentAdded = () => {
    if (!selectedThought) return;

    soundPlayer.play("postThought");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setThoughts((prev) =>
      prev.map((t) =>
        t.id === selectedThought.id ? { ...t, comments: (t.comments || 0) + 1 } : t
      )
    );

    setSelectedThought((prev) =>
      prev ? { ...prev, comments: (prev.comments || 0) + 1 } : prev
    );
  };

  /* ------------------ EDIT POST ------------------ */
  const handleEditPost = (thought: Thought) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose(); // Close modal before navigating
    router.push(`/create?editId=${thought.id}`);
  };

  /* ------------------ REPORT POST ------------------ */
  const handleReportPost = (thought: Thought) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReportingThought(thought);
    setReportModalVisible(true);
  };

  /* ------------------ PULL TO REFRESH ------------------ */
  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await loadPosts();
    setRefreshing(false);
  };

  /* ------------------ RENDER CONTENT WITH MENTIONS ------------------ */
  const renderContentWithMentions = (
    content: string,
    taggedPartners: any[] = [],
    taggedCourses: any[] = []
  ) => {
    const mentionMap: { [key: string]: { type: string; id: string | number } } = {};

    taggedPartners.forEach((partner) => {
      mentionMap[`@${partner.displayName}`] = { type: "partner", id: partner.userId };
    });

    taggedCourses.forEach((course) => {
      const courseTagNoSpaces = `@${course.courseName.replace(/\s+/g, "")}`;
      mentionMap[courseTagNoSpaces] = { type: "course", id: course.courseId };
      mentionMap[`@${course.courseName}`] = { type: "course", id: course.courseId };
    });

    const mentionPatterns = Object.keys(mentionMap)
      .map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .sort((a, b) => b.length - a.length);

    if (mentionPatterns.length === 0) {
      return <Text style={styles.content}>{content}</Text>;
    }

    const mentionRegex = new RegExp(`(${mentionPatterns.join("|")})`, "g");
    const parts = content.split(mentionRegex);

    return (
      <Text style={styles.content}>
        {parts.map((part, index) => {
          const mention = mentionMap[part];

          if (mention) {
            return (
              <Text
                key={index}
                style={styles.mention}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onClose(); // Close modal before navigating
                  if (mention.type === "partner") {
                    router.push(`/locker/${mention.id}`);
                  } else if (mention.type === "course") {
                    router.push(`/locker/course/${mention.id}`);
                  }
                }}
              >
                {part}
              </Text>
            );
          }

          return <Text key={index}>{part}</Text>;
        })}
      </Text>
    );
  };

  /* ------------------ RENDER THOUGHT ------------------ */
  const renderThought = ({ item }: { item: Thought }) => {
    const hasLiked = item.likedBy?.includes(currentUserId);
    const hasComments = !!item.comments && item.comments > 0;
    const isOwnPost = item.userId === currentUserId;
    const isHighlighted = highlightedPostId === item.id;
    const isVideoPlaying = playingVideos.has(item.id);

    const isLowLeader = item.postType === "low-leader";
    const isScore = item.postType === "score";

    let headerText = "";
    let thoughtTypeLabel = getPostTypeLabel(item.postType);

    if (isLowLeader) {
      headerText = "Became the New Low Leader!";
      thoughtTypeLabel = "Low Leader";
    } else if (isScore) {
      headerText = "Logged a new round";
      thoughtTypeLabel = "Score";
    }

    const getRelativeTime = (timestamp: any) => {
      if (!timestamp?.toDate) return "";

      const now = new Date();
      const postDate = timestamp.toDate();
      const diffMs = now.getTime() - postDate.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "just now";
      if (diffMins === 1) return "1 minute ago";
      if (diffMins < 60) return `${diffMins} minutes ago`;
      if (diffHours === 1) return "1 hour ago";
      if (diffHours < 24) return `${diffHours} hours ago`;
      if (diffDays === 1) return "1 day ago";
      if (diffDays < 7) return `${diffDays} days ago`;

      return postDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: postDate.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      });
    };

    return (
      <View style={[styles.thoughtCard, isHighlighted && styles.thoughtCardHighlighted]}>
        <View style={styles.cardHeader}>
          <TouchableOpacity
            style={styles.headerLeft}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose(); // Close modal before navigating
              if (item.userType === "Course") {
                router.push(`/locker/course/${item.ownedCourseId || item.linkedCourseId}`);
              } else {
                router.push(`/locker/${item.userId}`);
              }
            }}
          >
            {item.avatarUrl ? (
              <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarPlaceholderText}>
                  {item.displayName?.charAt(0).toUpperCase() || "?"}
                </Text>
              </View>
            )}
            <View style={styles.headerInfo}>
              <View style={styles.headerTextContainer}>
                <Text style={styles.displayName}>{item.displayName}</Text>
                {headerText && <Text style={styles.headerActionText}> {headerText}</Text>}
              </View>
              <View style={styles.badgeRow}>
                <View style={styles.thoughtTypeBadge}>
                  <Text style={styles.thoughtTypeText}>{thoughtTypeLabel}</Text>
                </View>
                <Text style={styles.timestamp}>{getRelativeTime(item.createdAt)}</Text>
              </View>
            </View>
          </TouchableOpacity>

          <View style={styles.headerRight}>
            {isOwnPost && (
              <TouchableOpacity style={styles.iconButton} onPress={() => handleEditPost(item)}>
                <Ionicons name="create-outline" size={20} color="#0D5C3A" />
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.iconButton} onPress={() => handleReportPost(item)}>
              <Image
                source={require("@/assets/icons/More.png")}
                style={styles.moreIcon}
              />
            </TouchableOpacity>
          </View>
        </View>

        {item.imageUrl && (
          <Image source={{ uri: item.imageUrl }} style={styles.thoughtImage} />
        )}

        {item.videoUrl && (
          <View style={styles.videoContainer}>
            {Platform.OS === "web" ? (
              <WebVideoPlayer
                videoUrl={item.videoUrl}
                thoughtId={item.id}
                onRefSet={(ref) => {
                  if (ref) {
                    videoRefs.current[item.id] = ref;
                  }
                }}
                onEnded={() => handleVideoEnd(item.id)}
              />
            ) : (
              <Video
                ref={(ref) => {
                  if (ref) {
                    videoRefs.current[item.id] = ref;
                  }
                }}
                source={{ uri: item.videoUrl }}
                style={styles.thoughtVideo}
                resizeMode={ResizeMode.COVER}
                shouldPlay={false}
                isLooping={false}
                isMuted={false}
                useNativeControls={false}
                onPlaybackStatusUpdate={(status: AVPlaybackStatus) => {
                  if (status.isLoaded && status.didJustFinish) {
                    handleVideoEnd(item.id);
                  }
                }}
              />
            )}

            <View style={styles.videoBadge}>
              <Ionicons name="videocam" size={16} color="#FFF" />
              <Text style={styles.videoBadgeText}>VIDEO</Text>
            </View>

            {item.videoDuration && (
              <View style={styles.videoDurationBadge}>
                <Ionicons name="time-outline" size={12} color="#FFF" />
                <Text style={styles.videoDurationText}>{Math.round(item.videoDuration)}s</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.videoOverlay}
              onPress={() => handleVideoPlayback(item.id)}
              activeOpacity={0.9}
            >
              {!isVideoPlaying && (
                <View style={styles.videoPlayButton}>
                  <Ionicons name="play" size={56} color="#FFF" />
                </View>
              )}
            </TouchableOpacity>

            {!isVideoPlaying && (
              <TouchableOpacity
                style={styles.replayButton}
                onPress={() => handleReplayVideo(item.id)}
              >
                <Ionicons name="refresh" size={18} color="#FFF" />
                <Text style={styles.replayText}>Replay</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.contentContainer}>
          {renderContentWithMentions(
            item.content,
            item.taggedPartners || [],
            item.taggedCourses || []
          )}

          <View style={styles.footer}>
            <TouchableOpacity style={styles.actionButton} onPress={() => handleLike(item)}>
              <Image
                source={require("@/assets/icons/Throw Darts.png")}
                style={[styles.actionIcon, hasLiked && styles.actionIconLiked]}
              />
              <Text style={styles.actionText}>{item.likes}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleComments(item)}
            >
              <Image
                source={require("@/assets/icons/Comments.png")}
                style={[styles.actionIcon, hasComments && styles.actionIconCommented]}
              />
              <Text style={styles.actionText}>{item.comments || 0}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaProvider>
        <View style={styles.container}>
          {/* SafeAreaView WRAPS the header to push it below notch */}
          <SafeAreaView edges={["top"]} style={styles.safeTop}>
            <View style={styles.header}>
              <TouchableOpacity
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onClose();
                }}
                style={styles.closeButton}
              >
                <Image
                  source={require("@/assets/icons/Close.png")}
                  style={styles.closeIcon}
                  resizeMode="contain"
                />
              </TouchableOpacity>

              <Text style={styles.headerTitle}>
                Clubhouse - {courseName}
              </Text>

              <View style={styles.closeButton} />
            </View>
          </SafeAreaView>

        {/* Posts List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0D5C3A" />
            <Text style={styles.loadingText}>Loading course posts...</Text>
          </View>
        ) : thoughts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={64} color="#CCC" />
            <Text style={styles.emptyText}>No posts tagged at this course yet</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={thoughts}
            renderItem={renderThought}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                flatListRef.current?.scrollToOffset({
                  offset: info.index * 400,
                  animated: true,
                });
              }, 100);
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#0D5C3A"
                colors={["#0D5C3A"]}
              />
            }
          />
        )}

        {/* Comments Modal */}
        {selectedThought && (
          <CommentsModal
            visible={commentsModalVisible}
            thoughtId={selectedThought.id}
            postContent={selectedThought.content}
            postOwnerId={selectedThought.userId}
            onClose={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setCommentsModalVisible(false);
              setSelectedThought(null);
            }}
            onCommentAdded={handleCommentAdded}
          />
        )}

        {/* Report Modal */}
        <ReportModal
          visible={reportModalVisible}
          onClose={() => {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setReportModalVisible(false);
            setReportingThought(null);
          }}
          postId={reportingThought?.id || ""}
          postAuthorId={reportingThought?.userId || ""}
          postAuthorName={reportingThought?.displayName || ""}
          postContent={reportingThought?.content || ""}
        />
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

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

  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },

  closeIcon: {
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

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  loadingText: {
    marginTop: 10,
    color: "#0D5C3A",
    fontWeight: "600",
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyText: {
    fontSize: 16,
    color: "#999",
    marginTop: 12,
    textAlign: "center",
    paddingHorizontal: 32,
  },

  listContent: {
    padding: 16,
    paddingBottom: 32,
  },

  thoughtCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    marginBottom: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },

  thoughtCardHighlighted: {
    backgroundColor: "#FFFEF5",
    borderWidth: 3,
    borderColor: "#FFD700",
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },

  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },

  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },

  avatarPlaceholderText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },

  headerInfo: {
    flex: 1,
  },

  headerTextContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 6,
  },

  displayName: {
    fontWeight: "900",
    color: "#0D5C3A",
    fontSize: 16,
  },

  headerActionText: {
    fontWeight: "600",
    color: "#333",
    fontSize: 15,
  },

  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  timestamp: {
    fontSize: 12,
    color: "#999",
  },

  thoughtTypeBadge: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },

  thoughtTypeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  iconButton: {
    padding: 4,
    marginLeft: 8,
  },

  moreIcon: {
    width: 20,
    height: 20,
    tintColor: "#666",
  },

  thoughtImage: {
    width: "100%",
    height: 300,
  },

  videoContainer: {
    width: "100%",
    height: 300,
    backgroundColor: "#000",
    position: "relative",
  },

  thoughtVideo: {
    width: "100%",
    height: "100%",
  },

  videoBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(13, 92, 58, 0.95)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },

  videoBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  videoDurationBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },

  videoDurationText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },

  videoOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },

  videoPlayButton: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(13, 92, 58, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },

  replayButton: {
    position: "absolute",
    bottom: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(13, 92, 58, 0.95)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },

  replayText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },

  contentContainer: {
    padding: 16,
  },

  content: {
    fontSize: 16,
    marginBottom: 12,
    color: "#333",
  },

  mention: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  footer: {
    flexDirection: "row",
    gap: 20,
  },

  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  actionIcon: {
    width: 20,
    height: 20,
    tintColor: "#666",
  },

  actionIconLiked: {
    tintColor: "#FF3B30",
  },

  actionIconCommented: {
    tintColor: "#FFD700",
  },

  actionText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
});