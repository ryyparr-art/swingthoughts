import CommentsModal from "@/components/modals/CommentsModal";
import ReportModal from "@/components/modals/ReportModal";
import { FullscreenVideoPlayer, VideoThumbnail } from "@/components/video/VideoComponents";
import { auth, db } from "@/constants/firebaseConfig";
import { getPostTypeLabel } from "@/constants/postTypes";
import { soundPlayer } from "@/utils/soundPlayer";
import { getUserProfile } from "@/utils/userProfileHelpers";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const SCREEN_WIDTH = Dimensions.get('window').width;

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
  
  // Multi-image support
  imageUrl?: string; // Deprecated
  imageUrls?: string[];
  imageCount?: number;
  
  videoUrl?: string;
  videoThumbnailUrl?: string;
  videoDuration?: number;
  videoTrimStart?: number;
  videoTrimEnd?: number;
  createdAt: any;
  likes: number;
  likedBy?: string[];
  comments?: number;
  
  // Denormalized user data
  userName?: string;
  userAvatar?: string;
  displayName?: string;
  avatarUrl?: string;
  
  courseName?: string;
  taggedPartners?: Array<{ userId: string; displayName: string }>;
  taggedCourses?: Array<{ courseId: number; courseName: string }>;
  ownedCourseId?: number;
  linkedCourseId?: number;
  
  // Media metadata
  hasMedia?: boolean;
  mediaType?: "images" | "video" | null;
}

interface UserPostsGalleryModalProps {
  visible: boolean;
  userId: string;
  initialPostId?: string;
  userName?: string;
  onClose: () => void;
}

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function UserPostsGalleryModal({
  visible,
  userId,
  initialPostId,
  userName,
  onClose,
}: UserPostsGalleryModalProps) {
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

  // Image viewer state
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  // Video viewer state (fullscreen modal)
  const [expandedVideo, setExpandedVideo] = useState<{
    url: string;
    thumbnailUrl?: string;
    trimStart?: number;
    trimEnd?: number;
    duration?: number;
  } | null>(null);
  
  // Image carousel states
  const [currentImageIndexes, setCurrentImageIndexes] = useState<{ [key: string]: number }>({});

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
    if (visible && userId) {
      loadPosts();
    }
  }, [visible, userId]);

  const loadPosts = async () => {
    try {
      setLoading(true);

      const postsQuery = query(
        collection(db, "thoughts"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(postsQuery);
      const list: Thought[] = [];

      const userProfile = await getUserProfile(userId);

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        
        // Get images array (handle both old and new formats)
        let images: string[] = [];
        if (data.imageUrls && Array.isArray(data.imageUrls) && data.imageUrls.length > 0) {
          images = data.imageUrls;
        } else if (data.imageUrl) {
          images = [data.imageUrl];
        }

        const thought: Thought = {
          id: docSnap.id,
          thoughtId: data.thoughtId || docSnap.id,
          userId: data.userId,
          userType: data.userType || "Golfer",
          content: data.content || data.caption || "",
          postType: data.postType,
          
          // Multi-image support
          imageUrls: images,
          imageCount: images.length,
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
          
          // Use denormalized data if available
          userName: data.userName,
          userAvatar: data.userAvatar,
          displayName: data.userName || userProfile.displayName,
          avatarUrl: data.userAvatar || userProfile.avatar || undefined,
          
          courseName: data.courseName,
          taggedPartners: data.taggedPartners || [],
          taggedCourses: data.taggedCourses || [],
          ownedCourseId: data.ownedCourseId,
          linkedCourseId: data.linkedCourseId,
          
          // Media metadata
          hasMedia: data.hasMedia,
          mediaType: data.mediaType,
        };

        list.push(thought);
      }

      setThoughts(list);
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

  /* ------------------ EXPAND IMAGE ------------------ */
  const handleExpandImage = (imageUrl: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedImage(imageUrl);
  };

  /* ------------------ EXPAND VIDEO TO FULLSCREEN ------------------ */
  const handleExpandVideo = (
    videoUrl: string,
    thumbnailUrl?: string,
    trimStart?: number,
    trimEnd?: number,
    duration?: number
  ) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedVideo({
      url: videoUrl,
      thumbnailUrl,
      trimStart: trimStart || 0,
      trimEnd: trimEnd || duration || 30,
      duration: duration || 30,
    });
  };

  const handleCloseExpandedVideo = () => {
    setExpandedVideo(null);
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

      if (hasLiked) {
        // Unlike: Update thought + delete like document
        await updateDoc(ref, {
          likes: increment(-1),
          likedBy: arrayRemove(currentUserId),
        });

        // Delete the like document
        const likesQuery = query(
          collection(db, "likes"),
          where("userId", "==", currentUserId),
          where("postId", "==", thought.id)
        );
        const likesSnap = await getDocs(likesQuery);
        likesSnap.forEach(async (likeDoc) => {
          await deleteDoc(likeDoc.ref);
        });
      } else {
        // Like: Update thought + create like document (triggers onLikeCreated Cloud Function)
        await updateDoc(ref, {
          likes: increment(1),
          likedBy: arrayUnion(currentUserId),
        });

        // Create like document - triggers Cloud Function notification
        await addDoc(collection(db, "likes"), {
          userId: currentUserId,
          postId: thought.id,
          postAuthorId: thought.userId,
          createdAt: serverTimestamp(),
        });
      }

      // ✅ NO CLIENT-SIDE NOTIFICATION
      // like notification is sent by onLikeCreated Cloud Function

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
    onClose();
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
                  onClose();
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

  /* ------------------ RENDER IMAGES CAROUSEL ------------------ */
  const renderImagesCarousel = (thought: Thought) => {
    const images = thought.imageUrls || (thought.imageUrl ? [thought.imageUrl] : []);
    if (images.length === 0) return null;
    
    const currentIndex = currentImageIndexes[thought.id] || 0;
    
    return (
      <View>
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const index = Math.round(
              event.nativeEvent.contentOffset.x / SCREEN_WIDTH
            );
            setCurrentImageIndexes(prev => ({
              ...prev,
              [thought.id]: index
            }));
          }}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => handleExpandImage(item)}
              style={{ width: SCREEN_WIDTH }}
            >
              <Image 
                source={{ uri: item }} 
                style={styles.thoughtImage}
                resizeMode="cover"
              />
            </TouchableOpacity>
          )}
          keyExtractor={(item, index) => `${thought.id}-image-${index}`}
        />
        
        {images.length > 1 && (
          <View style={styles.imagePaginationDots}>
            {images.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.imageDot,
                  currentIndex === index && styles.imageDotActive,
                ]}
              />
            ))}
          </View>
        )}
        
        {images.length > 1 && (
          <View style={styles.imageCountBadge}>
            <Ionicons name="images" size={14} color="#FFF" />
            <Text style={styles.imageCountText}>
              {currentIndex + 1}/{images.length}
            </Text>
          </View>
        )}
      </View>
    );
  };

  /* ------------------ RENDER THOUGHT ------------------ */
  const renderThought = ({ item }: { item: Thought }) => {
    const hasLiked = item.likedBy?.includes(currentUserId);
    const hasComments = !!item.comments && item.comments > 0;
    const isOwnPost = item.userId === currentUserId;
    const isHighlighted = highlightedPostId === item.id;

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
    
    const displayName = item.userName || item.displayName || "Unknown";
    const avatarUrl = item.userAvatar || item.avatarUrl;

    return (
      <View style={[styles.thoughtCard, isHighlighted && styles.thoughtCardHighlighted]}>
        <View style={styles.cardHeader}>
          <TouchableOpacity
            style={styles.headerLeft}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose();
              if (item.userType === "Course") {
                router.push(`/locker/course/${item.ownedCourseId || item.linkedCourseId}`);
              } else {
                router.push(`/locker/${item.userId}`);
              }
            }}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarPlaceholderText}>
                  {displayName?.charAt(0).toUpperCase() || "?"}
                </Text>
              </View>
            )}
            <View style={styles.headerInfo}>
              <View style={styles.headerTextContainer}>
                <Text style={styles.displayName}>{displayName}</Text>
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

        {/* Image Carousel - tap to expand */}
        {renderImagesCarousel(item)}

        {/* Video Thumbnail - tap to play fullscreen */}
        {item.videoUrl && (
          <VideoThumbnail
            videoUrl={item.videoUrl}
            thumbnailUrl={item.videoThumbnailUrl}
            videoDuration={item.videoDuration}
            onPress={() =>
              handleExpandVideo(
                item.videoUrl!,
                item.videoThumbnailUrl,
                item.videoTrimStart,
                item.videoTrimEnd,
                item.videoDuration
              )
            }
          />
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
                Thoughts {userName ? `- ${userName}` : ""}
              </Text>

              <View style={styles.closeButton} />
            </View>
          </SafeAreaView>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0D5C3A" />
              <Text style={styles.loadingText}>Loading posts...</Text>
            </View>
          ) : thoughts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="images-outline" size={64} color="#CCC" />
              <Text style={styles.emptyText}>No posts yet</Text>
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

          {/* Image Viewer Modal */}
          <Modal
            visible={!!expandedImage}
            transparent
            animationType="fade"
            onRequestClose={() => setExpandedImage(null)}
          >
            <Pressable
              style={styles.mediaViewerBackdrop}
              onPress={() => setExpandedImage(null)}
            >
              <Image
                source={{ uri: expandedImage || "" }}
                style={styles.imageViewerImage}
                resizeMode="contain"
              />
              <TouchableOpacity
                style={styles.mediaViewerCloseButton}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedImage(null);
                }}
              >
                <Image
                  source={require("@/assets/icons/Close.png")}
                  style={styles.mediaCloseIcon}
                />
              </TouchableOpacity>
            </Pressable>
          </Modal>

          {/* Fullscreen Video Player Modal */}
          {expandedVideo && (
            <FullscreenVideoPlayer
              videoUrl={expandedVideo.url}
              trimStart={expandedVideo.trimStart}
              trimEnd={expandedVideo.trimEnd}
              duration={expandedVideo.duration}
              onClose={handleCloseExpandedVideo}
            />
          )}

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
  
  // Image Carousel Styles
  imagePaginationDots: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  imageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.2)",
  },
  imageDotActive: {
    backgroundColor: "#FFD700",
    width: 24,
    borderColor: "rgba(0, 0, 0, 0.3)",
  },
  imageCountBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  imageCountText: {
    color: "#FFF",
    fontSize: 12,
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

  // Media Viewer Modal styles
  mediaViewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },

  mediaViewerCloseButton: {
    position: "absolute",
    top: 60,
    right: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 24,
    padding: 12,
  },

  mediaCloseIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFF",
  },

  imageViewerImage: {
    width: "100%",
    height: "80%",
  },
});