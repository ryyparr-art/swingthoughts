import TournamentChatModal from "@/components/modals/TournamentChatModal";
import AdminPanelButton from "@/components/navigation/AdminPanelButton";
import BottomActionBar from "@/components/navigation/BottomActionBar";
import LowmanCarousel from "@/components/navigation/LowmanCarousel";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import TournamentLiveBanner from "@/components/TournamentLiveBanner";
import { FullscreenVideoPlayer, VideoThumbnail } from "@/components/video/VideoComponents";
import { auth, db } from "@/constants/firebaseConfig";
import { getPostTypeLabel } from "@/constants/postTypes";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import type { ActiveTournament } from "@/hooks/useTournamentStatus";
import { FeedItem, FeedPost, FeedScore, generateAlgorithmicFeed } from "@/utils/feedAlgorithm";
import { soundPlayer } from "@/utils/soundPlayer";
import { getUserProfile } from "@/utils/userProfileHelpers";

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { ImageZoom } from "@likashefqet/react-native-image-zoom";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
  View
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import CommentsModal from "@/components/modals/CommentsModal";
import ReportModal from "@/components/modals/ReportModal";
import FilterBottomSheet from "@/components/ui/FilterBottomSheet";
import FilterFAB from "@/components/ui/FilterFAB";
import { Ionicons } from "@expo/vector-icons";

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

interface Thought {
  id: string;
  thoughtId: string;
  userId: string;
  userType: string;
  content: string;
  postType?: string;
  
  // Multi-image support
  imageUrl?: string;
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
  
  // Denormalized user data (from post)
  userName?: string;
  userAvatar?: string;
  userHandicap?: number;
  userVerified?: boolean;
  
  // Legacy fields (for fetched profiles)
  displayName?: string;
  avatarUrl?: string;
  
  courseName?: string;
  taggedPartners?: Array<{ userId: string; displayName: string }>;
  taggedCourses?: Array<{ courseId: number; courseName: string }>;
  taggedTournaments?: Array<{ tournamentId: string; name: string }>;
  taggedLeagues?: Array<{ leagueId: string; name: string }>;
  ownedCourseId?: number;
  linkedCourseId?: number;
  
  // Region data
  regionKey?: string;
  geohash?: string;
  location?: {
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
  };
  
  // Engagement metrics
  engagementScore?: number;
  viewCount?: number;
  
  // Media metadata
  hasMedia?: boolean;
  mediaType?: "images" | "video" | null;
  
  // Score reference
  scoreId?: string;
}

/* ==================================================================
   MAIN CLUBHOUSE SCREEN
   ================================================================== */
export default function ClubhouseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const flatListRef = useRef<FlatList>(null);
  const { getCache, setCache } = useCache();

  // Tournament chat state
  const [tournamentChatVisible, setTournamentChatVisible] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<ActiveTournament | null>(null);
  const [selectedChatType, setSelectedChatType] = useState<"live" | "onpremise">("live");
  
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isCheckingCache, setIsCheckingCache] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserData, setCurrentUserData] = useState<any>(null);
  const [useAlgorithmicFeed, setUseAlgorithmicFeed] = useState(true);
  const [showingCached, setShowingCached] = useState(false);

  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState<any>({});

  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedThought, setSelectedThought] = useState<Thought | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportingThought, setReportingThought] = useState<Thought | null>(null);

  // Image carousel states
  const [currentImageIndexes, setCurrentImageIndexes] = useState<{ [key: string]: number }>({});
  
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
  
  // ============================================
  // NOTIFICATION NAVIGATION PARAMS
  // ============================================
  const highlightPostId = Array.isArray(params.highlightPostId) 
    ? params.highlightPostId[0] 
    : params.highlightPostId;

  const scrollToPostId = Array.isArray(params.scrollToPostId)
    ? params.scrollToPostId[0]
    : params.scrollToPostId;

  const highlightScoreId = Array.isArray(params.highlightScoreId)
    ? params.highlightScoreId[0]
    : params.highlightScoreId;

  // Determine which post to scroll to (and whether to highlight)
  const targetPostId = highlightPostId || scrollToPostId;
  const shouldHighlight = !!highlightPostId; // Only highlight if highlightPostId is set

  // Track the found post ID when searching by scoreId
  const [foundPostIdFromScore, setFoundPostIdFromScore] = useState<string | null>(null);

  console.log("🎯 Clubhouse params:", { highlightPostId, scrollToPostId, highlightScoreId });

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

  const canInteract = (() => {
    if (!currentUserId || !currentUserData) return false;

    if (
      currentUserData.userType === "Golfer" ||
      currentUserData.userType === "Junior"
    ) {
      return true;
    }

    if (
      currentUserData.userType === "Course" ||
      currentUserData.userType === "PGA Professional"
    ) {
      return currentUserData.verified === true;
    }

    return false;
  })();

  /* ------------------ FETCH WITH CACHE ------------------ */
  useEffect(() => {
    if (currentUserId && currentUserData?.regionKey) {
      const quickCacheCheck = async () => {
        const userRegionKey = currentUserData?.regionKey;
        
        if (!userRegionKey) {
          setIsCheckingCache(false);
          setLoading(true);
          await loadFeed();
          return;
        }

        const cached = await getCache(CACHE_KEYS.FEED(currentUserId), userRegionKey);
        
        if (cached && cached.length > 0) {
          console.log("⚡ Cache found - loading cached thoughts immediately");
          
          try {
            let thoughtsFromCache = convertCachedFeedToThoughts(cached);
            
            // ✅ Fetch and prepend highlighted post if navigating from notification
            const scrollTargetId = targetPostId || highlightScoreId;
            if (scrollTargetId) {
              console.log("🎯 Fetching highlighted post for cache view:", scrollTargetId);
              
              let highlightedThought: Thought | null = null;
              
              // Try by postId first
              if (targetPostId) {
                const postDoc = await getDoc(doc(db, "thoughts", targetPostId));
                if (postDoc.exists()) {
                  highlightedThought = convertPostDataToThought(postDoc.id, postDoc.data());
                }
              }
              
              // Fallback to scoreId
              if (!highlightedThought && highlightScoreId) {
                const thoughtsQuery = query(
                  collection(db, "thoughts"),
                  where("scoreId", "==", highlightScoreId)
                );
                const snapshot = await getDocs(thoughtsQuery);
                if (!snapshot.empty) {
                  const postDoc = snapshot.docs[0];
                  highlightedThought = convertPostDataToThought(postDoc.id, postDoc.data());
                  setFoundPostIdFromScore(postDoc.id);
                }
              }
              
              // Prepend highlighted post to cached feed
              if (highlightedThought) {
                console.log("✅ Prepending highlighted post to cached feed");
                thoughtsFromCache = [
                  highlightedThought,
                  ...thoughtsFromCache.filter(t => t.id !== highlightedThought!.id)
                ];
              }
            }
            
            setThoughts(thoughtsFromCache);
            setFeedItems(cached);
            
            setLoading(false);
            setIsCheckingCache(false);
            setHasLoadedOnce(true);
            setShowingCached(true);
            
            await loadFeed(true);
          } catch (error) {
            console.error("❌ Error loading cached thoughts:", error);
            setIsCheckingCache(false);
            setLoading(true);
            await loadFeed();
          }
        } else {
          console.log("📭 No cache - loading fresh");
          setIsCheckingCache(false);
          setLoading(true);
          await loadFeed();
        }
      };
      
      quickCacheCheck();
    }
  }, [currentUserId, currentUserData?.regionKey, targetPostId, highlightScoreId]);

  const loadFeed = async (isBackgroundRefresh: boolean = false) => {
    try {
      if (!isBackgroundRefresh && !hasLoadedOnce) {
        setLoading(true);
      }
      
      let highlightedThought: Thought | null = null;
      
      // ============================================
      // HANDLE highlightPostId or scrollToPostId
      // ============================================
      if (targetPostId) {
        console.log("🎯 Fetching target post:", targetPostId);
        try {
          const postDoc = await getDoc(doc(db, "thoughts", targetPostId));
          
          if (postDoc.exists()) {
            const data = postDoc.data();
            highlightedThought = convertPostDataToThought(postDoc.id, data);
            console.log("✅ Target post fetched successfully");
          }
        } catch (error) {
          console.error("❌ Error fetching target post:", error);
          soundPlayer.play('error');
        }
      }
      
      // ============================================
      // HANDLE highlightScoreId (fallback for older notifications)
      // ============================================
      if (!highlightedThought && highlightScoreId) {
        console.log("🎯 Fetching post by scoreId:", highlightScoreId);
        try {
          const thoughtsQuery = query(
            collection(db, "thoughts"),
            where("scoreId", "==", highlightScoreId)
          );
          const snapshot = await getDocs(thoughtsQuery);
          
          if (!snapshot.empty) {
            const postDoc = snapshot.docs[0];
            const data = postDoc.data();
            highlightedThought = convertPostDataToThought(postDoc.id, data);
            setFoundPostIdFromScore(postDoc.id);
            console.log("✅ Found post by scoreId:", postDoc.id);
          } else {
            console.warn("⚠️ No post found for scoreId:", highlightScoreId);
          }
        } catch (error) {
          console.error("❌ Error fetching post by scoreId:", error);
          soundPlayer.play('error');
        }
      }
      
      if (useAlgorithmicFeed && Object.keys(activeFilters).length === 0) {
        console.log("🚀 Using algorithmic feed");
        
        const userRegionKey = currentUserData?.regionKey || "";
        
        if (!userRegionKey) {
          console.warn("⚠️ No regionKey available, feed may be slow");
        }
        
        const feed = await generateAlgorithmicFeed(currentUserId, userRegionKey, 20);
        setFeedItems(feed);
        
        const thoughtsFromFeed = await convertFeedToThoughts(feed);
        
        if (highlightedThought) {
          const filteredThoughts = thoughtsFromFeed.filter(t => t.id !== highlightedThought!.id);
          setThoughts([highlightedThought, ...filteredThoughts]);
          console.log("✅ Added highlighted post to top of algorithmic feed");
        } else {
          setThoughts(thoughtsFromFeed);
        }

        if (userRegionKey) {
          await setCache(
            CACHE_KEYS.FEED(currentUserId),
            feed,
            userRegionKey
          );
          console.log("✅ Feed cached via CacheContext");
        }
      } else {
        console.log("🔍 Using filtered feed");
        await fetchThoughts(activeFilters);
        
        if (highlightedThought) {
          setThoughts(prev => {
            const filteredPrev = prev.filter(t => t.id !== highlightedThought!.id);
            return [highlightedThought!, ...filteredPrev];
          });
          console.log("✅ Added highlighted post to top of filtered feed");
        }
      }
      
      setShowingCached(false);
      setLoading(false);
      setHasLoadedOnce(true);
    } catch (error) {
      console.error("❌ Feed load error:", error);
      soundPlayer.play('error');
      setShowingCached(false);
      setLoading(false);
    }
  };

  const convertPostDataToThought = (postId: string, data: any): Thought => {
    let images: string[] = [];
    if (data.imageUrls && Array.isArray(data.imageUrls) && data.imageUrls.length > 0) {
      images = data.imageUrls;
    } else if (data.imageUrl) {
      images = [data.imageUrl];
    }
    
    const thought: Thought = {
      id: postId,
      thoughtId: data.thoughtId || postId,
      userId: data.userId,
      userType: data.userType || "Golfer",
      content: data.content || data.caption || "",
      postType: data.postType,
      
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
      
      userName: data.userName,
      userAvatar: data.userAvatar,
      userHandicap: data.userHandicap,
      userVerified: data.userVerified,
      
      displayName: data.userName || data.displayName,
      avatarUrl: data.userAvatar || data.avatarUrl,
      
      courseName: data.courseName,
      taggedPartners: data.taggedPartners || [],
      taggedCourses: data.taggedCourses || [],
      taggedTournaments: data.taggedTournaments || [],
      taggedLeagues: data.taggedLeagues || [],
      ownedCourseId: data.ownedCourseId,
      linkedCourseId: data.linkedCourseId,
      
      regionKey: data.regionKey,
      geohash: data.geohash,
      location: data.location,
      
      engagementScore: data.engagementScore,
      viewCount: data.viewCount,
      
      hasMedia: data.hasMedia,
      mediaType: data.mediaType,
      
      scoreId: data.scoreId,
    };
    
    return thought;
  };

  const convertFeedToThoughts = async (feedItems: FeedItem[]): Promise<Thought[]> => {
    const thoughts: Thought[] = [];
    
    for (const item of feedItems) {
      if (item.type === "post") {
        const postItem = item as FeedPost;
        
        const postDoc = await getDoc(doc(db, "thoughts", postItem.id));
        if (postDoc.exists()) {
          const data = postDoc.data();
          const thought = convertPostDataToThought(postDoc.id, data);
          
          if (!thought.displayName) thought.displayName = postItem.displayName;
          if (!thought.avatarUrl) thought.avatarUrl = postItem.avatar;
          
          thoughts.push(thought);
        }
      } else {
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
          displayName: scoreItem.displayName,
          avatarUrl: scoreItem.avatar,
          courseName: scoreItem.courseName,
          taggedCourses: [{ courseId: scoreItem.courseId, courseName: scoreItem.courseName }],
        });
      }
    }
    
    return thoughts;
  };

  const convertCachedFeedToThoughts = (feedItems: FeedItem[]): Thought[] => {
    const thoughts: Thought[] = [];
    
    for (const item of feedItems) {
      if (item.type === "post") {
        const postItem = item as FeedPost;
        
        thoughts.push({
          id: postItem.id,
          thoughtId: postItem.thoughtId || postItem.id,
          userId: postItem.userId,
          userType: postItem.userType || "Golfer",
          content: postItem.content || postItem.caption || "",
          postType: postItem.postType,
          
          imageUrl: postItem.imageUrl || undefined,
          imageUrls: postItem.imageUrls || [],
          imageCount: postItem.imageCount || 0,
          videoUrl: postItem.videoUrl || undefined,
          videoThumbnailUrl: postItem.videoThumbnailUrl || undefined,
          videoDuration: postItem.videoDuration || undefined,
          videoTrimStart: postItem.videoTrimStart || undefined,
          videoTrimEnd: postItem.videoTrimEnd || undefined,
          
          createdAt: postItem.createdAt,
          likes: postItem.likes || 0,
          likedBy: postItem.likedBy || [],
          comments: postItem.comments || 0,
          
          displayName: postItem.displayName,
          avatarUrl: postItem.avatar,
          userName: postItem.displayName,
          userAvatar: postItem.avatar,
          userHandicap: postItem.handicap ? parseInt(postItem.handicap) : undefined,
          userVerified: postItem.verified,
          
          taggedCourses: (postItem.taggedCourses || []).map(c => ({
            courseId: typeof c.courseId === 'string' ? parseInt(c.courseId) : c.courseId,
            courseName: c.courseName
          })),
          taggedPartners: postItem.taggedPartners || [],
          taggedTournaments: (postItem as any).taggedTournaments || [],
          taggedLeagues: (postItem as any).taggedLeagues || [],
          
          regionKey: postItem.regionKey,
          geohash: postItem.geohash,
          location: postItem.location ? {
            city: postItem.location.city,
            state: postItem.location.state,
            latitude: postItem.location.latitude || undefined,
            longitude: postItem.location.longitude || undefined,
          } : undefined,
          
          hasMedia: postItem.hasMedia,
          mediaType: (postItem.mediaType === "images" || postItem.mediaType === "video") ? postItem.mediaType : null,
          engagementScore: postItem.relevanceScore,
          viewCount: postItem.viewCount,
        });
      } else {
        const scoreItem = item as FeedScore;
        
        thoughts.push({
          id: scoreItem.id,
          thoughtId: scoreItem.id,
          userId: scoreItem.userId,
          userType: scoreItem.userType || "Golfer",
          content: `Posted ${scoreItem.netScore} (${scoreItem.netScore - scoreItem.par > 0 ? '+' : ''}${scoreItem.netScore - scoreItem.par}) at ${scoreItem.courseName}${scoreItem.isLowman ? ' 🏆 NEW LOWMAN!' : ''}`,
          postType: scoreItem.isLowman ? "low-leader" : "score",
          createdAt: scoreItem.createdAt,
          likes: 0,
          likedBy: [],
          comments: 0,
          displayName: scoreItem.displayName,
          avatarUrl: scoreItem.avatar,
          userName: scoreItem.displayName,
          userAvatar: scoreItem.avatar,
          courseName: scoreItem.courseName,
          taggedCourses: [{
            courseId: scoreItem.courseId,
            courseName: scoreItem.courseName
          }],
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

      if (filters.type) conditions.push(where("postType", "==", filters.type));
      if (filters.user) conditions.push(where("displayName", "==", filters.user));

      if (conditions.length > 0) q = query(q, ...conditions);
      q = query(q, orderBy("createdAt", "desc"));

      const snapshot = await getDocs(q);
      const list: Thought[] = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const thought = convertPostDataToThought(docSnap.id, data);
        
        if (!thought.displayName || !thought.userName) {
          try {
            const userProfile = await getUserProfile(thought.userId);
            thought.displayName = userProfile.displayName;
            thought.avatarUrl = userProfile.avatar || undefined;
          } catch {
            thought.displayName = "[Deleted User]";
          }
        }

        list.push(thought);
      }

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

      if (filters.searchQuery) {
        const searchLower = filters.searchQuery.toLowerCase();
        console.log('🔍 Filtering by search query:', searchLower);
        filteredList = filteredList.filter(thought => {
          const content = (thought.content || "").toLowerCase();
          const userName = (thought.displayName || "").toLowerCase();
          return content.includes(searchLower) || userName.includes(searchLower);
        });
        console.log('✅ Filtered to', filteredList.length, 'posts matching search');
      }

      setThoughts(filteredList);
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
      soundPlayer.play('error');
      setLoading(false);
    }
  };

  /* ------------------ EXPAND VIDEO TO FULLSCREEN ------------------ */
  const handleExpandVideo = (
    videoUrl: string, 
    thumbnailUrl?: string,
    trimStart?: number,
    trimEnd?: number,
    duration?: number
  ) => {
    // Sound plays here BEFORE video modal opens - this is safe
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedVideo({ 
      url: videoUrl, 
      thumbnailUrl,
      trimStart: trimStart || 0,
      trimEnd: trimEnd || duration || 30,
      duration: duration || 30
    });
  };

  const handleCloseExpandedVideo = () => {
    setExpandedVideo(null);
  };

  /* ------------------ LIKE ------------------ */
  const handleLike = async (thought: Thought) => {
    if (!currentUserId) {
      soundPlayer.play('error');
      return Alert.alert("Sign In Required", "Please sign in to like posts.");
    }

    if (!canInteract) {
      soundPlayer.play('error');
      return Alert.alert(
        "Verification Required",
        "Your account must be verified before you can interact with posts. Please wait for admin verification."
      );
    }

    if (thought.userId === currentUserId) {
      soundPlayer.play('error');
      return Alert.alert("Can't Like", "You can't like your own post.");
    }

    const wasLiked = thought.likedBy?.includes(currentUserId) || false;
    const originalLikes = thought.likes || 0;

    try {
      soundPlayer.play('dart');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const ref = doc(db, "thoughts", thought.id);

      setThoughts((prev) =>
        prev.map((t) =>
          t.id === thought.id
            ? {
                ...t,
                likes: wasLiked ? Math.max(0, t.likes - 1) : t.likes + 1,
                likedBy: wasLiked
                  ? (t.likedBy || []).filter((id) => id !== currentUserId)
                  : [...(t.likedBy || []), currentUserId],
              }
            : t
        )
      );

      if (wasLiked) {
        await updateDoc(ref, {
          likes: increment(-1),
          likedBy: arrayRemove(currentUserId),
        });

        const likesQuery = query(
          collection(db, "likes"),
          where("userId", "==", currentUserId),
          where("postId", "==", thought.id)
        );
        const likesSnapshot = await getDocs(likesQuery);
        for (const likeDoc of likesSnapshot.docs) {
          await deleteDoc(likeDoc.ref);
        }
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
    } catch (err) {
      console.error("Like error:", err);
      soundPlayer.play('error');
      
      setThoughts((prev) =>
        prev.map((t) =>
          t.id === thought.id
            ? {
                ...t,
                likes: originalLikes,
                likedBy: wasLiked
                  ? [...(t.likedBy || []), currentUserId]
                  : (t.likedBy || []).filter((id) => id !== currentUserId),
              }
            : t
        )
      );
    }
  };

  /* ------------------ COMMENTS ------------------ */
  const handleComments = (thought: Thought) => {
    if (!canInteract) {
      soundPlayer.play('error');
      return Alert.alert(
        "Verification Required",
        "Your account must be verified before you can comment. Please wait for admin verification."
      );
    }

    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedThought(thought);
    setCommentsModalVisible(true);
  };

  /* ------------------ EDIT POST ------------------ */
  const handleEditPost = (thought: Thought) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/create?editId=${thought.id}`);
  };

  /* ------------------ REPORT POST ------------------ */
  const handleReportPost = (thought: Thought) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReportingThought(thought);
    setReportModalVisible(true);
  };

  /* ------------------ TOURNAMENT BANNER PRESS ------------------ */
  const handleTournamentPress = async (tournament: ActiveTournament) => {
    console.log("🏌️ Tournament banner pressed:", tournament.name);
  
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Check if tournament has location data
    const hasVenueLocation = tournament.location?.latitude && tournament.location?.longitude;
  
    if (!hasVenueLocation) {
      // No venue location - go directly to Tournament Discussion
      console.log("🏌️ No venue location, opening Tournament Discussion");
      setSelectedTournament(tournament);
      setSelectedChatType("live");
      setTournamentChatVisible(true);
      return;
    }

    // Check user's current location
    try {
      // Request location permission if needed
      const { status } = await Location.requestForegroundPermissionsAsync();
    
      if (status !== "granted") {
        // No location permission - go directly to Tournament Discussion
        console.log("🏌️ Location permission denied, opening Tournament Discussion");
        setSelectedTournament(tournament);
        setSelectedChatType("live");
        setTournamentChatVisible(true);
        return;
      }

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const userLat = location.coords.latitude;
      const userLon = location.coords.longitude;
      const venueLat = tournament.location!.latitude!;
      const venueLon = tournament.location!.longitude!;

      // Calculate distance to venue (in miles)
      const distance = calculateDistanceMiles(userLat, userLon, venueLat, venueLon);
    
      console.log("🏌️ Distance to venue:", distance.toFixed(2), "miles");

      // If within 2 miles of venue, offer choice
      const PROXIMITY_THRESHOLD_MILES = 2;
    
      if (distance <= PROXIMITY_THRESHOLD_MILES) {
        // User is near the venue - show selection alert
        console.log("🏌️ User is near venue, showing chat type selection");
      
        Alert.alert(
          "Join Tournament Chat",
          `You're at ${tournament.name}! Which chat would you like to join?`,
          [
            {
              text: "On-Premise Chat",
              onPress: () => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setSelectedTournament(tournament);
                setSelectedChatType("onpremise");
                setTournamentChatVisible(true);
              },
            },
            {
              text: "Tournament Discussion",
              onPress: () => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedTournament(tournament);
                setSelectedChatType("live");
                setTournamentChatVisible(true);
              },
            },
            {
              text: "Cancel",
              style: "cancel",
            },
          ]
        );
      } else {
        // User is not near venue - go directly to Tournament Discussion
        console.log("🏌️ User is not near venue, opening Tournament Discussion");
        setSelectedTournament(tournament);
        setSelectedChatType("live");
        setTournamentChatVisible(true);
      }
    } catch (error) {
      console.error("🏌️ Error checking location:", error);
      // On error, just open Tournament Discussion
      setSelectedTournament(tournament);
      setSelectedChatType("live");
      setTournamentChatVisible(true);
    }
  };

  /**
   * Calculate distance between two coordinates in miles
   * Uses Haversine formula
   */
  const calculateDistanceMiles = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const toRad = (deg: number): number => {
    return deg * (Math.PI / 180);
  };

  const hasActiveFilters = !!(
    activeFilters.type || 
    activeFilters.user || 
    activeFilters.course ||
    activeFilters.partnersOnly ||
    activeFilters.searchQuery
  );

  const handleCommentAdded = () => {
    console.log("📝 handleCommentAdded called");
    console.log("📝 selectedThought:", selectedThought?.id);
    
    if (!selectedThought) {
      console.log("❌ No selectedThought, cannot update count");
      return;
    }

    soundPlayer.play('postThought');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setThoughts((prev) => {
      console.log("📝 Updating thoughts, looking for:", selectedThought.id);
      return prev.map((t) => {
        if (t.id === selectedThought.id) {
          console.log("✅ Found thought, updating comments from", t.comments, "to", (t.comments || 0) + 1);
          return { ...t, comments: (t.comments || 0) + 1 };
        }
        return t;
      });
    });

    setSelectedThought((prev) => 
      prev ? { ...prev, comments: (prev.comments || 0) + 1 } : prev
    );
  };

  /* ------------------ PULL TO REFRESH ------------------ */
  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    setShowingCached(false);
    await loadFeed();
    
    setRefreshing(false);
  };

  /* ------------------ SCROLL TO TARGET POST ------------------ */
  useEffect(() => {
    // Determine the actual post ID to scroll to
    const scrollTargetId = targetPostId || foundPostIdFromScore;
    
    if (!scrollTargetId || loading || thoughts.length === 0) return;

    console.log("🎯 Scrolling to post:", scrollTargetId, shouldHighlight ? "(highlighted)" : "(no highlight)");
    
    const postIndex = thoughts.findIndex((t) => t.id === scrollTargetId);
    
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
        } catch (error) {
          console.log("⚠️ Scroll error, using offset instead");
          flatListRef.current?.scrollToOffset({
            offset: postIndex * 400,
            animated: true,
          });
        }
      }, 500);
    } else {
      console.warn("⚠️ Target post not found in feed");
      soundPlayer.play('error');
      Alert.alert("Post Not Found", "This post may have been deleted.");
    }
  }, [targetPostId, foundPostIdFromScore, loading, thoughts.length]);

  /* ------------------ RENDER CONTENT WITH TAGS (@ mentions and # hashtags) ------------------ */
  const renderContentWithTags = (
    content: string, 
    taggedPartners: any[] = [], 
    taggedCourses: any[] = [],
    taggedTournaments: any[] = [],
    taggedLeagues: any[] = []
  ) => {
    // Build mention map for @ tags (partners and courses)
    const mentionMap: { [key: string]: { type: string; id: string | number } } = {};
    
    taggedPartners.forEach((partner) => {
      mentionMap[`@${partner.displayName}`] = { type: 'partner', id: partner.userId };
    });
    
    taggedCourses.forEach((course) => {
      mentionMap[`@${course.courseName}`] = { type: 'course', id: course.courseId };
    });
    
    // Build hashtag map for # tags (tournaments and leagues)
    const hashtagMap: { [key: string]: { type: string; id: string; name: string } } = {};
    
    taggedTournaments.forEach((tournament) => {
      hashtagMap[`#${tournament.name}`] = { type: 'tournament', id: tournament.tournamentId, name: tournament.name };
    });
    
    taggedLeagues.forEach((league) => {
      hashtagMap[`#${league.name}`] = { type: 'league', id: league.leagueId, name: league.name };
    });
    
    // Combine all patterns
    const mentionPatterns = Object.keys(mentionMap)
      .map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    
    const hashtagPatterns = Object.keys(hashtagMap)
      .map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    
    const allPatterns = [...mentionPatterns, ...hashtagPatterns]
      .sort((a, b) => b.length - a.length);
    
    if (allPatterns.length === 0) {
      return <Text style={styles.content}>{content}</Text>;
    }
    
    const combinedRegex = new RegExp(`(${allPatterns.join('|')})`, 'g');
    const parts = content.split(combinedRegex);
    
    return (
      <Text style={styles.content}>
        {parts.map((part, index) => {
          // Check if it's a mention (@)
          const mention = mentionMap[part];
          if (mention) {
            return (
              <Text
                key={index}
                style={styles.mention}
                onPress={() => {
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
          
          // Check if it's a hashtag (#)
          const hashtag = hashtagMap[part];
          if (hashtag) {
            // Tournaments are tappable, leagues are not (yet)
            if (hashtag.type === 'tournament') {
              return (
                <Text
                  key={index}
                  style={styles.hashtag}
                  onPress={() => {
                    soundPlayer.play('click');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    // Open FilterBottomSheet with tournament name as search query
                    setActiveFilters({ searchQuery: hashtag.name });
                    setFilterSheetVisible(true);
                  }}
                >
                  {part}
                </Text>
              );
            } else {
              // League - styled but not tappable (feature coming soon)
              return (
                <Text
                  key={index}
                  style={styles.hashtagInactive}
                >
                  {part}
                </Text>
              );
            }
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
              onPress={() => {
                soundPlayer.play('click');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setExpandedImage(item);
              }}
            >
              <View style={{ width: SCREEN_WIDTH }}>
                <Image 
                  source={{ uri: item }} 
                  style={styles.thoughtImage}
                  resizeMode="cover"
                />
              </View>
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

  /* ------------------ RENDER ------------------ */
  const renderThought = ({ item }: { item: Thought }) => {
    const hasLiked = item.likedBy?.includes(currentUserId);
    const hasComments = (item.comments || 0) > 0;
    const isOwnPost = item.userId === currentUserId;
    
    // ✅ Only highlight if highlightPostId matches (not scrollToPostId)
    const isHighlighted = shouldHighlight && (
      highlightPostId === item.id || 
      foundPostIdFromScore === item.id
    );
    
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
      <View style={[
        styles.thoughtCard,
        isHighlighted && styles.thoughtCardHighlighted
      ]}>
        <View style={styles.cardHeader}>
          <TouchableOpacity 
            style={styles.headerLeft}
            onPress={() => {
              soundPlayer.play('click');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (item.userType === 'Course') {
                router.push(`/locker/course/${item.ownedCourseId || item.linkedCourseId}`);
              } else {
                router.push(`/locker/${item.userId}`);
              }
            }}
          >
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatar}
              />
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

        {renderImagesCarousel(item)}

        {/* Video Thumbnail - uses VideoThumbnail from VideoComponents */}
        {item.videoUrl && (
          <VideoThumbnail
            videoUrl={item.videoUrl}
            thumbnailUrl={item.videoThumbnailUrl}
            videoDuration={item.videoDuration}
            onPress={() => handleExpandVideo(
              item.videoUrl!, 
              item.videoThumbnailUrl,
              item.videoTrimStart,
              item.videoTrimEnd,
              item.videoDuration
            )}
          />
        )}

        <View style={styles.contentContainer}>
          {renderContentWithTags(
            item.content,
            item.taggedPartners || [],
            item.taggedCourses || [],
            item.taggedTournaments || [],
            item.taggedLeagues || []
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

      <TournamentLiveBanner onPress={handleTournamentPress} />

      {showingCached && !loading && (
        <View style={styles.cacheIndicator}>
          <ActivityIndicator size="small" color="#0D5C3A" />
          <Text style={styles.cacheText}>Updating feed...</Text>
        </View>
      )}

      {(loading && !showingCached && !isCheckingCache) ? (
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
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setFilterSheetVisible(true);
        }} 
        hasFilters={hasActiveFilters}
      />

      <FilterBottomSheet
        visible={filterSheetVisible}
        onClose={() => {
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setFilterSheetVisible(false);
        }}
        onApplyFilters={(f: any) => {
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setActiveFilters(f);
          setUseAlgorithmicFeed(Object.keys(f).length === 0);
          loadFeed();
        }}
        onSelectPost={(postId: string) => {
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          console.log('🎯 Post selected from filter:', postId);
          
          const postIndex = thoughts.findIndex(t => t.id === postId);
          
          if (postIndex !== -1) {
            setTimeout(() => {
              try {
                flatListRef.current?.scrollToIndex({
                  index: postIndex,
                  animated: true,
                  viewPosition: 0.2,
                });
                console.log('✅ Scrolled to post');
              } catch (error) {
                console.log('⚠️ Scroll error, using offset instead');
                flatListRef.current?.scrollToOffset({
                  offset: postIndex * 400,
                  animated: true,
                });
              }
            }, 300);
          } else {
            console.warn('⚠️ Post not found in current feed');
            soundPlayer.play('error');
            Alert.alert("Post Not Found", "This post may not match your current filters.");
          }
          
          setFilterSheetVisible(false);
        }}
        posts={thoughts}
        currentFilters={activeFilters}
      />

      {selectedThought && (
        <CommentsModal
          visible={commentsModalVisible}
          thoughtId={selectedThought.id}
          postContent={selectedThought.content}
          postOwnerId={selectedThought.userId}
          onClose={() => {
            soundPlayer.play('click');
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

      {/* Tournament Chat Modal */}
      {selectedTournament && (
        <TournamentChatModal
          visible={tournamentChatVisible}
          tournament={selectedTournament}
          chatType={selectedChatType}
          onClose={() => {
            setTournamentChatVisible(false);
            setSelectedTournament(null);
            setSelectedChatType("live");
          }}
        />
      )}

      {/* Image Viewer Modal with Pinch-to-Zoom */}
      <Modal 
        visible={!!expandedImage} 
        transparent 
        animationType="fade" 
        onRequestClose={() => setExpandedImage(null)}
      >
        <GestureHandlerRootView style={styles.gestureRoot}>
          <View style={styles.mediaViewerBackdrop}>
            <ImageZoom
              uri={expandedImage || ''}
              minScale={1}
              maxScale={3}
              doubleTapScale={2}
              isDoubleTapEnabled
              isPinchEnabled
              isPanEnabled
              style={styles.zoomableImage}
              resizeMode="contain"
            />
            <TouchableOpacity 
              style={styles.mediaViewerCloseButton} 
              onPress={() => {
                soundPlayer.play('click');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setExpandedImage(null);
              }}
            >
              <Image 
                source={require("@/assets/icons/Close.png")} 
                style={styles.closeIcon}
              />
            </TouchableOpacity>
          </View>
        </GestureHandlerRootView>
      </Modal>

      {/* Fullscreen Video Player Modal - uses FullscreenVideoPlayer from VideoComponents */}
      {expandedVideo && (
        <FullscreenVideoPlayer
          videoUrl={expandedVideo.url}
          trimStart={expandedVideo.trimStart}
          trimEnd={expandedVideo.trimEnd}
          duration={expandedVideo.duration}
          onClose={handleCloseExpandedVideo}
        />
      )}

      <BottomActionBar disabled={!canWrite} />
      {currentUserData?.role === "admin" ? (
        <AdminPanelButton />
      ) : (
        <SwingFooter />
      )}
    </View>
  );
}

/* ==================================================================
   MAIN STYLES
   ================================================================== */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  safeTop: { backgroundColor: "#0D5C3A" },
  carouselWrapper: { height: 70 },
  
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
  
  // Media Viewer Modal styles (shared)
  gestureRoot: {
    flex: 1,
  },
  mediaViewerBackdrop: { 
    flex: 1, 
    backgroundColor: "rgba(0, 0, 0, 0.95)", 
    justifyContent: "center", 
    alignItems: "center" 
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
  closeIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFF",
  },
  
  // Image viewer specific - zoomable
  zoomableImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  
  // Legacy style (keep for reference)
  imageViewerImage: { 
    width: "100%", 
    height: "80%" 
  },
  
  // Hashtag styles
  hashtag: {
    fontSize: 16,
    fontWeight: "700",
    color: "#B8860B",
  },
  hashtagInactive: {
    fontSize: 16,
    fontWeight: "700",
    color: "#DAA520",
    opacity: 0.8,
  },
});