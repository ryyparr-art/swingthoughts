/**
 * useFeed Hook
 * 
 * Manages feed loading, caching, and refresh logic.
 * Extracted from clubhouse/index.tsx for cleaner separation of concerns.
 * 
 * Features:
 * - Warm start (cache hit) with background refresh
 * - Cold start (cache miss) with loading state
 * - Pull-to-refresh support
 * - Algorithmic feed with shuffle
 * - Filter support
 * - App resume deferral (prevents watchdog kills from CPU pressure)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, AppStateStatus } from "react-native";
import { collection, doc, getDoc, getDocs, orderBy, query, where } from "firebase/firestore";

import { auth, db } from "@/constants/firebaseConfig";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import {
  coldStartShuffle,
  FeedItem,
  generateAlgorithmicFeed,
  warmStartShuffle,
} from "@/utils/feedAlgorithm";
import { getUserProfile } from "@/utils/userProfileHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import {
  convertCachedFeedToThoughts,
  convertFeedToThoughts,
  convertPostDataToThought,
  Thought,
} from "@/utils/feedHelpers";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface UseFeedOptions {
  currentUserId: string;
  currentUserData: any;
  targetPostId?: string | null;
  highlightScoreId?: string | null;
}

interface UseFeedReturn {
  thoughts: Thought[];
  setThoughts: React.Dispatch<React.SetStateAction<Thought[]>>;
  loading: boolean;
  refreshing: boolean;
  showingCached: boolean;
  hasLoadedOnce: boolean;
  activeFilters: any;
  setActiveFilters: React.Dispatch<React.SetStateAction<any>>;
  useAlgorithmicFeed: boolean;
  setUseAlgorithmicFeed: React.Dispatch<React.SetStateAction<boolean>>;
  foundPostIdFromScore: string | null;
  onRefresh: () => Promise<void>;
  loadFeed: (isBackgroundRefresh?: boolean) => Promise<void>;
  applyFilters: (filters: any) => void;
}

/* ================================================================ */
/* HOOK                                                             */
/* ================================================================ */

export function useFeed({
  currentUserId,
  currentUserData,
  targetPostId,
  highlightScoreId,
}: UseFeedOptions): UseFeedReturn {
  const { getCache, setCache } = useCache();

  // Feed state
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  
  // Loading state
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isCheckingCache, setIsCheckingCache] = useState(true);
  const [showingCached, setShowingCached] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [activeFilters, setActiveFilters] = useState<any>({});
  const [useAlgorithmicFeed, setUseAlgorithmicFeed] = useState(true);
  
  // Score ID lookup
  const [foundPostIdFromScore, setFoundPostIdFromScore] = useState<string | null>(null);

  // ── App resume guard ──────────────────────────────────────────────
  // Defers background refresh for 1.5s after app comes to foreground
  // to let the UI settle and prevent watchdog kills (0x8BADF00D)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isResumingRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRefreshRef = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        console.log("⏸️ App resuming — deferring background work for 1.5s");
        isResumingRef.current = true;

        // Clear any existing timer
        if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);

        resumeTimerRef.current = setTimeout(() => {
          isResumingRef.current = false;
          console.log("▶️ Resume cooldown complete — background work allowed");

          // If a background refresh was deferred, run it now
          if (pendingRefreshRef.current) {
            pendingRefreshRef.current = false;
            console.log("🔄 Running deferred background refresh");
            loadFeed(true);
          }
        }, 1500);
      }
      appStateRef.current = nextState;
    });

    return () => {
      sub.remove();
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* INITIAL LOAD WITH CACHE CHECK                                    */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!currentUserId || !currentUserData?.regionKey) return;

    const quickCacheCheck = async () => {
      const userRegionKey = currentUserData?.regionKey;
      
      if (!userRegionKey) {
        setIsCheckingCache(false);
        setLoading(true);
        await loadFeed(false);
        return;
      }

      // ✅ REMOVED region validation - algorithm handles proximity
      const cached = await getCache(CACHE_KEYS.FEED(currentUserId));
      
      if (cached && cached.length > 0) {
        console.log("⚡ Warm start - cache found, applying shuffle (top 3 preserved)");
        
        try {
          let thoughtsFromCache = convertCachedFeedToThoughts(cached);
          
          // Fetch and prepend highlighted post if navigating from notification
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
          
          // WARM START: Top 3 preserved, rest shuffled
          const thoughtsWithBracket = thoughtsFromCache.map(t => ({
            ...t,
            displayBracket: t.displayBracket ?? 7
          }));
          const shuffledThoughts = warmStartShuffle(thoughtsWithBracket);
          console.log("🔀 Warm start shuffle applied");
          
          setThoughts(shuffledThoughts);
          setFeedItems(cached);
          
          setLoading(false);
          setIsCheckingCache(false);
          setHasLoadedOnce(true);
          setShowingCached(true);
          
          // Background refresh - silent update
          await loadFeed(true);
        } catch (error) {
          console.error("❌ Error loading cached thoughts:", error);
          setIsCheckingCache(false);
          setLoading(true);
          await loadFeed(false);
        }
      } else {
        console.log("📭 Cold start - no cache, loading fresh");
        setIsCheckingCache(false);
        setLoading(true);
        await loadFeed(false);
      }
    };
    
    quickCacheCheck();
  }, [currentUserId, currentUserData?.regionKey, targetPostId, highlightScoreId]);

  /* ---------------------------------------------------------------- */
  /* LOAD FEED                                                        */
  /* ---------------------------------------------------------------- */

  const loadFeed = useCallback(async (isBackgroundRefresh: boolean = false) => {
    // ── Resume guard: defer background refresh while app is settling ──
    if (isBackgroundRefresh && isResumingRef.current) {
      console.log("⏸️ Deferring background refresh — app resuming");
      pendingRefreshRef.current = true;
      return;
    }

    try {
      if (!isBackgroundRefresh && !hasLoadedOnce) {
        setLoading(true);
      }
      
      let highlightedThought: Thought | null = null;
      
      // Handle highlightPostId or scrollToPostId
      if (targetPostId) {
        console.log("🎯 Fetching target post:", targetPostId);
        try {
          const postDoc = await getDoc(doc(db, "thoughts", targetPostId));
          
          if (postDoc.exists()) {
            highlightedThought = convertPostDataToThought(postDoc.id, postDoc.data());
            console.log("✅ Target post fetched successfully");
          }
        } catch (error) {
          console.error("❌ Error fetching target post:", error);
          soundPlayer.play('error');
        }
      }
      
      // Handle highlightScoreId (fallback for older notifications)
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
            highlightedThought = convertPostDataToThought(postDoc.id, postDoc.data());
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
        console.log("🚀 Using algorithmic feed v2 (recency + proximity + engagement)");
        
        const userRegionKey = currentUserData?.regionKey || "";
        
        if (!userRegionKey) {
          console.warn("⚠️ No regionKey available, feed may be slow");
        }
        
        const feed = await generateAlgorithmicFeed(currentUserId, userRegionKey, 20);
        
        // BACKGROUND REFRESH: Update thoughts with fresh data (no reshuffle)
        if (isBackgroundRefresh) {
          console.log("🔄 Background refresh - merging fresh data");
          setFeedItems(feed);
          
          // Convert fresh feed to thoughts
          const freshThoughts = convertCachedFeedToThoughts(feed);
          
          // Merge: Update existing posts with fresh data, keep order
          setThoughts(prev => {
            const freshMap = new Map(freshThoughts.map(t => [t.id, t]));
            
            // Update existing posts with fresh data
            const updated = prev.map(t => {
              const fresh = freshMap.get(t.id);
              if (fresh) {
                // Preserve position, update content
                return { ...fresh, displayBracket: t.displayBracket };
              }
              return t;
            });
            
            // Add any new posts that weren't in the cached feed (prepend)
            const existingIds = new Set(prev.map(t => t.id));
            const newPosts = freshThoughts.filter(t => !existingIds.has(t.id));
            
            if (newPosts.length > 0) {
              console.log(`✅ Adding ${newPosts.length} new posts from background refresh`);
              return [...newPosts, ...updated];
            }
            
            return updated;
          });
          
          // Update cache
          if (userRegionKey) {
            await setCache(CACHE_KEYS.FEED(currentUserId), feed);
            console.log("✅ Cache updated");
          }
          
          setShowingCached(false);
          return;
        }
        
        // COLD START / PULL-TO-REFRESH: Full reshuffle
        console.log("🔀 Cold start - applying full shuffle");
        setFeedItems(feed);
        
        const thoughtsFromFeed = convertCachedFeedToThoughts(feed);
        
        const thoughtsWithBracket = thoughtsFromFeed.map(t => ({
          ...t,
          displayBracket: t.displayBracket ?? 7
        }));
        
        const shuffledThoughts = coldStartShuffle(thoughtsWithBracket);
        
        if (highlightedThought) {
          const highlightedWithBracket = { ...highlightedThought, displayBracket: highlightedThought.displayBracket ?? 1 };
          const filteredThoughts = shuffledThoughts.filter(t => t.id !== highlightedWithBracket.id);
          setThoughts([highlightedWithBracket, ...filteredThoughts]);
          console.log("✅ Added highlighted post to top of algorithmic feed");
        } else {
          setThoughts(shuffledThoughts);
        }

        if (userRegionKey) {
          await setCache(CACHE_KEYS.FEED(currentUserId), feed);
          console.log("✅ Feed cached via CacheContext");
        }
      } else {
        console.log("🔍 Using filtered feed");
        await fetchThoughts(activeFilters, highlightedThought);
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
  }, [currentUserId, currentUserData?.regionKey, useAlgorithmicFeed, activeFilters, targetPostId, highlightScoreId, hasLoadedOnce]);

  /* ---------------------------------------------------------------- */
  /* FETCH FILTERED THOUGHTS                                          */
  /* ---------------------------------------------------------------- */

  const fetchThoughts = async (filters: any = {}, highlightedThought?: Thought | null) => {
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

      if (highlightedThought) {
        const filteredPrev = filteredList.filter(t => t.id !== highlightedThought.id);
        setThoughts([highlightedThought, ...filteredPrev]);
        console.log("✅ Added highlighted post to top of filtered feed");
      } else {
        setThoughts(filteredList);
      }
      
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
      soundPlayer.play('error');
      setLoading(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* PULL TO REFRESH                                                  */
  /* ---------------------------------------------------------------- */

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    console.log("🔄 Pull-to-refresh - full reshuffle (cold start behavior)");
    setShowingCached(false);
    
    await loadFeed(false);
    
    setRefreshing(false);
  }, [loadFeed]);

  /* ---------------------------------------------------------------- */
  /* APPLY FILTERS                                                    */
  /* ---------------------------------------------------------------- */

  const applyFilters = useCallback((filters: any) => {
    setActiveFilters(filters);
    setUseAlgorithmicFeed(Object.keys(filters).length === 0);
    loadFeed(false);
  }, [loadFeed]);

  return {
    thoughts,
    setThoughts,
    loading,
    refreshing,
    showingCached,
    hasLoadedOnce,
    activeFilters,
    setActiveFilters,
    useAlgorithmicFeed,
    setUseAlgorithmicFeed,
    foundPostIdFromScore,
    onRefresh,
    loadFeed,
    applyFilters,
  };
}