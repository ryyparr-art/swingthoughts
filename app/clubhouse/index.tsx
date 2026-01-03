import AdminPanelButton from "@/components/navigation/AdminPanelButton";
import BottomActionBar from "@/components/navigation/BottomActionBar";
import LowmanCarousel from "@/components/navigation/LowmanCarousel";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";
import { getPostTypeLabel } from "@/constants/postTypes";
import { FeedItem, FeedPost, FeedScore, generateAlgorithmicFeed } from "@/utils/feedAlgorithm";
import { createNotification } from "@/utils/notificationHelpers";
import { soundPlayer } from "@/utils/soundPlayer";

import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import { AVPlaybackStatus, ResizeMode, Video } from "expo-av";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import CommentsModal from "@/components/modals/CommentsModal";
import ReportModal from "@/components/modals/ReportModal";
import FilterBottomSheet from "@/components/ui/FilterBottomSheet";
import FilterFAB from "@/components/ui/FilterFAB";
import { Ionicons } from "@expo/vector-icons";

interface Thought {
  id: string;
  thoughtId: string;
  userId: string;
  userType: string;
  content: string;
  postType?: string;
  imageUrl?: string;
  videoUrl?: string;
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

/* ------------------ WEB VIDEO COMPONENT ------------------ */
const WebVideoPlayer = ({ 
  videoUrl, 
  thoughtId, 
  onRefSet, 
  onEnded 
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
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        backgroundColor: '#000',
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

export default function ClubhouseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const flatListRef = useRef<FlatList>(null);
  
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserData, setCurrentUserData] = useState<any>(null);
  const [useAlgorithmicFeed, setUseAlgorithmicFeed] = useState(true);

  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState<any>({});

  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedThought, setSelectedThought] = useState<Thought | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportingThought, setReportingThought] = useState<Thought | null>(null);

  // Video playback states
  const [playingVideos, setPlayingVideos] = useState<Set<string>>(new Set());
  const videoRefs = useRef<{ [key: string]: any }>({});
  
  // Get highlight param from navigation
  const highlightPostId = Array.isArray(params.highlightPostId) 
    ? params.highlightPostId[0] 
    : params.highlightPostId;

  console.log("🎯 Clubhouse highlightPostId from params:", highlightPostId);

  /* ------------------ AUTH ------------------ */
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

      setCurrentUserId(user.uid);

      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        setCurrentUserData(snap.data());
        console.log("📄 Clubhouse user data:", snap.data());
      }
    });

    return () => unsub();
  }, []);

  /* ------------------ PERMISSIONS ------------------ */
  const canWrite = (() => {
    if (!currentUserData) return false;

    if (
      currentUserData.userType === "Golfer" ||
      currentUserData.userType === "Junior"
    ) {
      return currentUserData.acceptedTerms === true;
    }

    if (
      currentUserData.userType === "Course" ||
      currentUserData.userType === "PGA Professional"
    ) {
      return currentUserData.verified === true;
    }

    return false;
  })();

  /* ------------------ FETCH ------------------ */
  useEffect(() => {
    if (currentUserId) {
      loadFeed();
    }
  }, [currentUserId]);

  const loadFeed = async () => {
    try {
      setLoading(true);
      
      if (useAlgorithmicFeed && Object.keys(activeFilters).length === 0) {
        // Use algorithmic feed when no filters are active
        console.log("🎯 Using algorithmic feed");
        const feed = await generateAlgorithmicFeed(currentUserId, 50);
        setFeedItems(feed);
        
        // Also load into thoughts for compatibility (convert feed items to thoughts)
        const thoughtsFromFeed = await convertFeedToThoughts(feed);
        setThoughts(thoughtsFromFeed);
      } else {
        // Use traditional fetch when filters are active
        console.log("🔍 Using filtered feed");
        await fetchThoughts(activeFilters);
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Feed load error:", error);
      // Play error sound on feed load failure
      soundPlayer.play('error');
      setLoading(false);
    }
  };

  const convertFeedToThoughts = async (feedItems: FeedItem[]): Promise<Thought[]> => {
    const thoughts: Thought[] = [];
    
    for (const item of feedItems) {
      if (item.type === "post") {
        const postItem = item as FeedPost;
        
        // Fetch full post data
        const postDoc = await getDoc(doc(db, "thoughts", postItem.id));
        if (postDoc.exists()) {
          const data = postDoc.data();
          thoughts.push({
            id: postDoc.id,
            thoughtId: data.thoughtId || postDoc.id,
            userId: data.userId,
            userType: data.userType || "Golfer",
            content: data.content || data.caption || "",
            postType: data.postType,
            imageUrl: data.imageUrl,
            videoUrl: data.videoUrl,
            videoDuration: data.videoDuration,
            videoTrimStart: data.videoTrimStart,
            videoTrimEnd: data.videoTrimEnd,
            createdAt: data.createdAt,
            likes: data.likes || 0,
            likedBy: data.likedBy || [],
            comments: data.comments || 0,
            displayName: postItem.userName,
            avatarUrl: postItem.userAvatar,
            courseName: data.courseName,
            taggedPartners: data.taggedPartners || [],
            taggedCourses: postItem.taggedCourses || [],
            ownedCourseId: data.ownedCourseId,
            linkedCourseId: data.linkedCourseId,
          });
        }
      } else {
        // Score item - create a synthetic post
        const scoreItem = item as FeedScore;
        
        thoughts.push({
          id: scoreItem.id,
          thoughtId: scoreItem.id,
          userId: scoreItem.userId,
          userType: "Golfer",
          content: `Posted ${scoreItem.netScore} (${scoreItem.netScore - scoreItem.par > 0 ? '+' : ''}${scoreItem.netScore - scoreItem.par}) at ${scoreItem.courseName}${scoreItem.isLowman ? ' 🏆 NEW LOWMAN!' : ''}`,
          postType: scoreItem.isLowman ? "low-leader" : "score",
          createdAt: scoreItem.createdAt,
          likes: 0,
          likedBy: [],
          comments: 0,
          displayName: scoreItem.userName,
          avatarUrl: scoreItem.userAvatar,
          courseName: scoreItem.courseName,
          taggedCourses: [{ courseId: scoreItem.courseId, courseName: scoreItem.courseName }],
        });
      }
    }
    
    return thoughts;
  };

  const fetchThoughts = async (filters: any = {}) => {
    try {
      setLoading(true);

      let q: any = collection(db, "thoughts");
      const conditions: any[] = [];

      // Only add where clauses if the filter value is actually defined
      if (filters.type) conditions.push(where("postType", "==", filters.type));
      if (filters.user) conditions.push(where("displayName", "==", filters.user));

      if (conditions.length > 0) q = query(q, ...conditions);
      q = query(q, orderBy("createdAt", "desc"));

      const snapshot = await getDocs(q);
      const list: Thought[] = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as Thought;

        const thought: Thought = {
          ...data,
          id: docSnap.id,
          thoughtId: data.thoughtId || docSnap.id,
        };

        try {
          const userDoc = await getDoc(doc(db, "users", thought.userId));
          if (userDoc.exists()) {
            thought.displayName = userDoc.data().displayName || "Anonymous";
            thought.avatarUrl = userDoc.data().avatar || undefined;
          } else {
            thought.displayName = "Anonymous";
          }
        } catch {
          thought.displayName = "Anonymous";
        }

        list.push(thought);
      }

      // Apply client-side filters
      let filteredList = list;
      
      if (filters.course) {
        console.log('🔍 Filtering by course:', filters.course);
        filteredList = filteredList.filter(thought => {
          if (thought.courseName === filters.course) return true;
          
          if (thought.taggedCourses && Array.isArray(thought.taggedCourses)) {
            return thought.taggedCourses.some(
              course => course.courseName === filters.course
            );
          }
          
          return false;
        });
        console.log('✅ Filtered to', filteredList.length, 'posts for course');
      }
      
      if (filters.partnersOnly && currentUserData?.partners) {
        console.log('🔍 Filtering by partners');
        filteredList = filteredList.filter(thought => 
          currentUserData.partners.includes(thought.userId)
        );
        console.log('✅ Filtered to', filteredList.length, 'posts from partners');
      }

      setThoughts(filteredList);
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
      // Play error sound on fetch failure
      soundPlayer.play('error');
      setLoading(false);
    }
  };

  /* ------------------ VIDEO PLAYBACK ------------------ */
  const handleVideoPlayback = async (thoughtId: string) => {
    const videoRef = videoRefs.current[thoughtId];
    if (!videoRef) {
      console.log("❌ No video ref found for:", thoughtId);
      return;
    }

    try {
      console.log("🎬 Video overlay pressed for:", thoughtId);
      
      // Play click sound when toggling video
      soundPlayer.play('click');
      
      if (Platform.OS === 'web') {
        const videoElement = videoRef as HTMLVideoElement;
        
        if (videoElement.paused) {
          console.log("▶️ Playing video (web):", thoughtId);
          await videoElement.play();
          setPlayingVideos(prev => new Set(prev).add(thoughtId));
        } else {
          console.log("⏸️ Pausing video (web):", thoughtId);
          videoElement.pause();
          setPlayingVideos(prev => {
            const newSet = new Set(prev);
            newSet.delete(thoughtId);
            return newSet;
          });
        }
      } else {
        const status = await videoRef.getStatusAsync();
        console.log("📹 Video status:", status);
        
        if (status.isLoaded) {
          if (status.isPlaying) {
            console.log("⏸️ Pausing video:", thoughtId);
            await videoRef.pauseAsync();
            setPlayingVideos(prev => {
              const newSet = new Set(prev);
              newSet.delete(thoughtId);
              return newSet;
            });
          } else {
            console.log("▶️ Playing video:", thoughtId);
            await videoRef.playAsync();
            setPlayingVideos(prev => new Set(prev).add(thoughtId));
          }
        } else {
          console.log("⚠️ Video not loaded, attempting to load...");
          await videoRef.loadAsync({ uri: status.uri || '' }, {}, false);
          await videoRef.playAsync();
          setPlayingVideos(prev => new Set(prev).add(thoughtId));
        }
      }
    } catch (error) {
      console.error("❌ Video playback error:", error);
      // Play error sound on video failure
      soundPlayer.play('error');
      Alert.alert("Video Error", "Failed to play video. Please try again.");
    }
  };

  const handleVideoEnd = (thoughtId: string) => {
    setPlayingVideos(prev => {
      const newSet = new Set(prev);
      newSet.delete(thoughtId);
      return newSet;
    });
  };

  const handleReplayVideo = async (thoughtId: string) => {
    const videoRef = videoRefs.current[thoughtId];
    if (!videoRef) return;

    try {
      // Play click sound on replay
      soundPlayer.play('click');
      
      if (Platform.OS === 'web') {
        const videoElement = videoRef as HTMLVideoElement;
        videoElement.currentTime = 0;
        await videoElement.play();
        setPlayingVideos(prev => new Set(prev).add(thoughtId));
      } else {
        await videoRef.replayAsync();
        setPlayingVideos(prev => new Set(prev).add(thoughtId));
      }
    } catch (error) {
      console.error("Video replay error:", error);
      soundPlayer.play('error');
    }
  };

  /* ------------------ LIKE ------------------ */
  const handleLike = async (thought: Thought) => {
    if (!canWrite) {
      // Play error sound for verification required
      soundPlayer.play('error');
      return Alert.alert(
        "Verification Required",
        "You'll be able to interact once your account is verified."
      );
    }

    if (thought.userId === currentUserId) {
      // Play error sound for own post like
      soundPlayer.play('error');
      return Alert.alert("You can't like your own post");
    }

    try {
      // Play dart sound + medium haptic for like
      soundPlayer.play('dart');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const ref = doc(db, "thoughts", thought.id);
      const hasLiked = thought.likedBy?.includes(currentUserId);

      await updateDoc(ref, {
        likes: increment(hasLiked ? -1 : 1),
        likedBy: hasLiked
          ? arrayRemove(currentUserId)
          : arrayUnion(currentUserId),
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
      // Play error sound on like failure
      soundPlayer.play('error');
    }
  };

  /* ------------------ COMMENTS ------------------ */
  const handleComments = (thought: Thought) => {
    if (!canWrite) {
      // Play error sound for verification required
      soundPlayer.play('error');
      return Alert.alert(
        "Verification Required",
        "Commenting unlocks after verification."
      );
    }

    // Play click sound + light haptic for opening comments
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedThought(thought);
    setCommentsModalVisible(true);
  };

  /* ------------------ EDIT POST ------------------ */
  const handleEditPost = (thought: Thought) => {
    // Play click sound + light haptic for edit
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/create?editId=${thought.id}`);
  };

  /* ------------------ REPORT POST ------------------ */
  const handleReportPost = (thought: Thought) => {
    // Play click sound + light haptic for report
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReportingThought(thought);
    setReportModalVisible(true);
  };

  // Check if any filters are active
  const hasActiveFilters = !!(
    activeFilters.type || 
    activeFilters.user || 
    activeFilters.course ||
    activeFilters.partnersOnly
  );

  // Optimistic comment count
  const handleCommentAdded = () => {
    if (!selectedThought) return;

    setThoughts((prev) =>
      prev.map((t) =>
        t.id === selectedThought.id
          ? { ...t, comments: (t.comments || 0) + 1 }
          : t
      )
    );
  };

  /* ------------------ PULL TO REFRESH ------------------ */
  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    await loadFeed();
    
    setRefreshing(false);
  };

  /* ------------------ SCROLL TO HIGHLIGHTED POST ------------------ */
  useEffect(() => {
    if (!highlightPostId || loading || thoughts.length === 0) return;

    const postIndex = thoughts.findIndex((t) => t.id === highlightPostId);
    
    if (postIndex !== -1) {
      console.log("🎯 Scrolling to highlighted post at index:", postIndex);
      
      setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: postIndex,
            animated: true,
            viewPosition: 0.5,
          });
        } catch (error) {
          console.log("⚠️ Scroll error, using offset instead");
          flatListRef.current?.scrollToOffset({
            offset: postIndex * 400,
            animated: true,
          });
        }
      }, 300);
    }
  }, [highlightPostId, loading, thoughts]);

  /* ------------------ RENDER CONTENT WITH MENTIONS ------------------ */
  const renderContentWithMentions = (content: string, taggedPartners: any[] = [], taggedCourses: any[] = []) => {
    const mentionMap: { [key: string]: { type: string; id: string | number } } = {};
    
    taggedPartners.forEach((partner) => {
      mentionMap[`@${partner.displayName}`] = { type: 'partner', id: partner.userId };
    });
    
    taggedCourses.forEach((course) => {
      const courseTagNoSpaces = `@${course.courseName.replace(/\s+/g, "")}`;
      mentionMap[courseTagNoSpaces] = { type: 'course', id: course.courseId };
      mentionMap[`@${course.courseName}`] = { type: 'course', id: course.courseId };
    });
    
    const mentionPatterns = Object.keys(mentionMap)
      .map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length);
    
    if (mentionPatterns.length === 0) {
      return <Text style={styles.content}>{content}</Text>;
    }
    
    const mentionRegex = new RegExp(`(${mentionPatterns.join('|')})`, 'g');
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
                  // Play click sound + light haptic for mention tap
                  soundPlayer.play('click');
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (mention.type === 'partner') {
                    router.push(`/locker/${mention.id}`);
                  } else if (mention.type === 'course') {
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

  /* ------------------ RENDER ------------------ */
  const renderThought = ({ item }: { item: Thought }) => {
    const hasLiked = item.likedBy?.includes(currentUserId);
    const hasComments = !!item.comments && item.comments > 0;
    const isOwnPost = item.userId === currentUserId;
    const isHighlighted = highlightPostId === item.id;
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
      <View style={[
        styles.thoughtCard,
        isHighlighted && styles.thoughtCardHighlighted
      ]}>
        <View style={styles.cardHeader}>
          <TouchableOpacity 
            style={styles.headerLeft}
            onPress={() => {
              // Play click sound + light haptic for profile navigation
              soundPlayer.play('click');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (item.userType === 'Course') {
                router.push(`/locker/course/${item.ownedCourseId || item.linkedCourseId}`);
              } else {
                router.push(`/locker/${item.userId}`);
              }
            }}
          >
            {item.avatarUrl ? (
              <Image
                source={{ uri: item.avatarUrl }}
                style={styles.avatar}
              />
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
                {headerText && (
                  <Text style={styles.headerActionText}> {headerText}</Text>
                )}
              </View>
              <View style={styles.badgeRow}>
                <View style={styles.thoughtTypeBadge}>
                  <Text style={styles.thoughtTypeText}>
                    {thoughtTypeLabel}
                  </Text>
                </View>
                <Text style={styles.timestamp}>
                  {getRelativeTime(item.createdAt)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          <View style={styles.headerRight}>
            {isOwnPost && (
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => handleEditPost(item)}
              >
                <Ionicons name="create-outline" size={20} color="#0D5C3A" />
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => handleReportPost(item)}
            >
              <Image 
                source={require("@/assets/icons/More.png")} 
                style={styles.moreIcon}
              />
            </TouchableOpacity>
          </View>
        </View>

        {item.imageUrl && (
          <Image source={{ uri: item.imageUrl}} style={styles.thoughtImage} />
        )}

        {item.videoUrl && (
          <View style={styles.videoContainer}>
            {Platform.OS === 'web' ? (
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
                <Text style={styles.videoDurationText}>
                  {Math.round(item.videoDuration)}s
                </Text>
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
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleLike(item)}
            >
              <Image
                source={require("@/assets/icons/Throw Darts.png")}
                style={[
                  styles.actionIcon,
                  hasLiked && styles.actionIconLiked,
                ]}
              />
              <Text style={styles.actionText}>{item.likes}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleComments(item)}
            >
              <Image
                source={require("@/assets/icons/Comments.png")}
                style={[
                  styles.actionIcon,
                  hasComments && styles.actionIconCommented,
                ]}
              />
              <Text style={styles.actionText}>{item.comments || 0}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      <View style={styles.carouselWrapper}>
        <LowmanCarousel />
      </View>

      <TopNavBar />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D5C3A" />
          <Text style={styles.loadingText}>
            {useAlgorithmicFeed && !hasActiveFilters ? "Building your personalized feed..." : "Loading thoughts..."}
          </Text>
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

      <FilterFAB 
        onPress={() => {
          // Play click sound when opening filter
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setFilterSheetVisible(true);
        }} 
        hasFilters={hasActiveFilters}
      />

      <FilterBottomSheet
        visible={filterSheetVisible}
        onClose={() => {
          // Play click sound when closing filter
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setFilterSheetVisible(false);
        }}
        onApplyFilters={(f) => {
          // Play click sound when applying filters
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setActiveFilters(f);
          setUseAlgorithmicFeed(Object.keys(f).length === 0);
          loadFeed();
        }}
        posts={thoughts}
        currentFilters={activeFilters}
      />

      <CommentsModal
        visible={commentsModalVisible}
        thoughtId={selectedThought?.id || ""}
        postContent={selectedThought?.content || ""}
        postOwnerId={selectedThought?.userId || ""}
        onClose={() => {
          // Play click sound when closing comments
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setCommentsModalVisible(false);
          setSelectedThought(null);
        }}
        onCommentAdded={handleCommentAdded}
      />

      <ReportModal
        visible={reportModalVisible}
        onClose={() => {
          // Play click sound when closing report
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setReportModalVisible(false);
          setReportingThought(null);
        }}
        postId={reportingThought?.id || ""}
        postAuthorId={reportingThought?.userId || ""}
        postAuthorName={reportingThought?.displayName || ""}
        postContent={reportingThought?.content || ""}
      />

      <BottomActionBar disabled={!canWrite} />
      {currentUserData?.role === "admin" ? (
        <AdminPanelButton />
      ) : (
        <SwingFooter />
      )}
    </View>
  );
}

/* ------------------ STYLES ------------------ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  safeTop: { backgroundColor: "#0D5C3A" },
  carouselWrapper: { height: 50, justifyContent: "center" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#0D5C3A", fontWeight: "600" },
  listContent: { padding: 16, paddingBottom: 32 },
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
    height: 300 
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
  contentContainer: { padding: 16 },
  content: { fontSize: 16, marginBottom: 12, color: "#333" },
  mention: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  footer: { flexDirection: "row", gap: 20 },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionIcon: { width: 20, height: 20, tintColor: "#666" },
  actionIconLiked: { tintColor: "#FF3B30" },
  actionIconCommented: { tintColor: "#FFD700" },
  actionText: { fontSize: 14, color: "#666", fontWeight: "600" },
});




