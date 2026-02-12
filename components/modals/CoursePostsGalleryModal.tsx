/**
 * Course Posts Gallery Modal
 *
 * Shows all clubhouse posts tagged at a specific course.
 * Reuses FeedPost component for rendering — supports polls,
 * league results, multi-image, video, and all future post types.
 *
 * Posts are displayed in reverse chronological order (no feed algorithm).
 */

import FeedPost from "@/components/clubhouse/FeedPost";
import CommentsModal from "@/components/modals/CommentsModal";
import ReportModal from "@/components/modals/ReportModal";
import { FullscreenVideoPlayer } from "@/components/video/VideoComponents";
import { auth, db } from "@/constants/firebaseConfig";
import { convertPostDataToThought, Thought } from "@/utils/feedHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import { batchGetUserProfiles } from "@/utils/userProfileHelpers";
import { Ionicons } from "@expo/vector-icons";
import { ImageZoom } from "@likashefqet/react-native-image-zoom";
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
  where,
} from "firebase/firestore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface CoursePostsGalleryModalProps {
  visible: boolean;
  courseId: number;
  courseName: string;
  initialPostId?: string;
  onClose: () => void;
}

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
  const galleryListRef = useRef<FlatList>(null);

  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");

  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedThought, setSelectedThought] = useState<Thought | null>(null);

  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportingThought, setReportingThought] = useState<Thought | null>(null);

  // Image gallery state (matches clubhouse pattern)
  const [expandedImages, setExpandedImages] = useState<string[] | null>(null);
  const [expandedImageIndex, setExpandedImageIndex] = useState(0);
  const [galleryIndex, setGalleryIndex] = useState(0);

  // Video viewer state
  const [expandedVideo, setExpandedVideo] = useState<{
    url: string;
    thumbnailUrl?: string;
    trimStart?: number;
    trimEnd?: number;
    duration?: number;
  } | null>(null);

  // Highlighted post (auto-scroll target)
  const [highlightedPostId, setHighlightedPostId] = useState<string | undefined>(initialPostId);

  /* ---------------------------------------------------------------- */
  /* AUTH                                                              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) setCurrentUserId(user.uid);
    });
    return () => unsub();
  }, []);

  /* ---------------------------------------------------------------- */
  /* FETCH POSTS                                                      */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (visible && courseId) {
      loadPosts();
    }
  }, [visible, courseId]);

  const loadPosts = async () => {
    try {
      setLoading(true);

      const postsQuery = query(
        collection(db, "thoughts"),
        orderBy("createdAt", "desc")
      );
      const postsSnap = await getDocs(postsQuery);

      const postsData: Thought[] = [];
      const userIds = new Set<string>();

      postsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const taggedCourses = data.taggedCourses || [];
        const isTagged = taggedCourses.some((c: any) => c.courseId === courseId);

        if (isTagged) {
          const thought = convertPostDataToThought(docSnap.id, data);
          postsData.push(thought);
          if (data.userId) userIds.add(data.userId);
        }
      });

      // Batch get user profiles for posts missing display names
      const profilesMap = await batchGetUserProfiles(Array.from(userIds));

      postsData.forEach((post) => {
        const profile = profilesMap.get(post.userId);
        if (profile) {
          if (!post.displayName) post.displayName = profile.displayName ?? undefined;
          if (!post.avatarUrl) post.avatarUrl = profile.avatar ?? undefined;
          if (!post.userName) post.userName = profile.displayName ?? undefined;
          if (!post.userAvatar) post.userAvatar = profile.avatar ?? undefined;
        }
      });

      setThoughts(postsData);
    } catch (err) {
      console.error("Fetch error:", err);
      soundPlayer.play("error");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* AUTO-SCROLL TO INITIAL POST                                      */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!highlightedPostId || loading || thoughts.length === 0) return;

    const postIndex = thoughts.findIndex((t) => t.id === highlightedPostId);
    if (postIndex !== -1) {
      setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: postIndex,
            animated: true,
            viewPosition: 0.2,
          });
          setTimeout(() => setHighlightedPostId(undefined), 2000);
        } catch {
          flatListRef.current?.scrollToOffset({
            offset: postIndex * 400,
            animated: true,
          });
        }
      }, 500);
    }
  }, [highlightedPostId, loading, thoughts.length]);

  /* ---------------------------------------------------------------- */
  /* HANDLERS                                                         */
  /* ---------------------------------------------------------------- */

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
        await updateDoc(ref, {
          likes: increment(-1),
          likedBy: arrayRemove(currentUserId),
        });

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
        await updateDoc(ref, {
          likes: increment(1),
          likedBy: arrayUnion(currentUserId),
        });

        await addDoc(collection(db, "likes"), {
          userId: currentUserId,
          postId: thought.id,
          postAuthorId: thought.userId,
          createdAt: serverTimestamp(),
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

  const handleComment = (thought: Thought) => {
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
        t.id === selectedThought.id
          ? { ...t, comments: (t.comments || 0) + 1 }
          : t
      )
    );
    setSelectedThought((prev) =>
      prev ? { ...prev, comments: (prev.comments || 0) + 1 } : prev
    );
  };

  const handleEdit = (thought: Thought) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    router.push(`/create?editId=${thought.id}`);
  };

  const handleReport = (thought: Thought) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReportingThought(thought);
    setReportModalVisible(true);
  };

  const handleImagePress = useCallback((imageUrls: string[], startIndex: number) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedImages(imageUrls);
    setExpandedImageIndex(startIndex);
    setGalleryIndex(startIndex);
  }, []);

  const handleVideoPress = useCallback((
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
  }, []);

  const handleHashtagPress = useCallback((name: string, type: "tournament" | "league") => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    if (type === "league") {
      router.push(`/leagues/${name}` as any);
    }
  }, [onClose, router]);

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await loadPosts();
    setRefreshing(false);
  };

  /* ---------------------------------------------------------------- */
  /* RENDER                                                           */
  /* ---------------------------------------------------------------- */

  const renderItem = useCallback(({ item }: { item: Thought }) => (
    <FeedPost
      thought={item}
      currentUserId={currentUserId}
      isHighlighted={highlightedPostId === item.id}
      onLike={handleLike}
      onComment={handleComment}
      onEdit={handleEdit}
      onReport={handleReport}
      onImagePress={handleImagePress}
      onVideoPress={handleVideoPress}
      onHashtagPress={handleHashtagPress}
    />
  ), [currentUserId, highlightedPostId, handleImagePress, handleVideoPress, handleHashtagPress]);

  const renderGalleryImage = useCallback(({ item }: { item: string }) => (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <View style={styles.galleryPage}>
        <ImageZoom
          uri={item}
          minScale={1}
          maxScale={3}
          doubleTapScale={2}
          isDoubleTapEnabled
          isPinchEnabled
          isPanEnabled
          style={styles.zoomableImage}
          resizeMode="contain"
        />
      </View>
    </GestureHandlerRootView>
  ), []);

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
          {/* Header */}
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
              <Text style={styles.emptyText}>
                No posts tagged at this course yet
              </Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={thoughts}
              renderItem={renderItem}
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

          {/* Image Gallery Viewer Modal */}
          <Modal
            visible={!!expandedImages}
            transparent
            animationType="fade"
            onRequestClose={() => setExpandedImages(null)}
          >
            <View style={styles.mediaViewerBackdrop}>
              {expandedImages && (
                <>
                  <FlatList
                    ref={galleryListRef}
                    data={expandedImages}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    initialScrollIndex={expandedImageIndex}
                    getItemLayout={(_, index) => ({
                      length: SCREEN_WIDTH,
                      offset: SCREEN_WIDTH * index,
                      index,
                    })}
                    onMomentumScrollEnd={(event) => {
                      const index = Math.round(
                        event.nativeEvent.contentOffset.x / SCREEN_WIDTH
                      );
                      setGalleryIndex(index);
                    }}
                    renderItem={renderGalleryImage}
                    keyExtractor={(item, index) => `gallery-${index}`}
                  />

                  {/* Counter badge */}
                  {expandedImages.length > 1 && (
                    <View style={styles.galleryCounter}>
                      <Text style={styles.galleryCounterText}>
                        {galleryIndex + 1} / {expandedImages.length}
                      </Text>
                    </View>
                  )}
                </>
              )}

              {/* Close button */}
              <TouchableOpacity
                style={styles.mediaViewerCloseButton}
                onPress={() => {
                  soundPlayer.play("click");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedImages(null);
                }}
              >
                <Image
                  source={require("@/assets/icons/Close.png")}
                  style={styles.mediaCloseIcon}
                />
              </TouchableOpacity>
            </View>
          </Modal>

          {/* Fullscreen Video Player */}
          {expandedVideo && (
            <FullscreenVideoPlayer
              videoUrl={expandedVideo.url}
              trimStart={expandedVideo.trimStart}
              trimEnd={expandedVideo.trimEnd}
              duration={expandedVideo.duration}
              onClose={() => setExpandedVideo(null)}
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

  /* Image Gallery Viewer */
  gestureRoot: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
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
    zIndex: 10,
  },
  mediaCloseIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFF",
  },
  galleryPage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  zoomableImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  galleryCounter: {
    position: "absolute",
    top: 68,
    alignSelf: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  galleryCounterText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
});