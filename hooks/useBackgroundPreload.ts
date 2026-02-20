/**
 * useBackgroundPreload Hook
 * 
 * Preloads data for other screens in the background after the feed loads.
 * This makes navigation to other tabs feel instant.
 * 
 * Strategy:
 * 1. Wait for feed to load (hasLoadedOnce = true)
 * 2. Stagger preload requests to avoid overwhelming the network
 * 3. Cache results via CacheContext
 * 4. Silent failures - don't affect UX if preload fails
 */

import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { useEffect, useRef } from "react";

import { db } from "@/constants/firebaseConfig";
import { CACHE_KEYS, useCache } from "@/contexts/CacheContext";
import { preloadLeaderboardData } from "@/hooks/useLeaderboardData";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface UseBackgroundPreloadOptions {
  currentUserId: string;
  regionKey: string;
  hasLoadedOnce: boolean;
}

/* ================================================================ */
/* PRELOAD FUNCTIONS                                                */
/* ================================================================ */

/**
 * Preload user's locker data
 */
const prefetchLocker = async (
  userId: string,
  setCache: (key: string, data: any, regionKey?: string) => Promise<void>
) => {
  try {
    console.log("🔄 Preloading locker...");
    
    // Fetch user's scores
    const scoresQuery = query(
      collection(db, "scores"),
      where("userId", "==", userId),
      orderBy("playedAt", "desc"),
      limit(20)
    );
    
    const snapshot = await getDocs(scoresQuery);
    const scores = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    // Cache the results
    await setCache(CACHE_KEYS.LOCKER(userId), scores);
    
    console.log("✅ Locker preloaded:", scores.length, "scores");
  } catch (error) {
    console.log("⚠️ Locker preload failed (non-critical):", error);
  }
};

/**
 * Preload notifications
 */
const prefetchNotifications = async (
  userId: string,
  setCache: (key: string, data: any, regionKey?: string) => Promise<void>
) => {
  try {
    console.log("🔄 Preloading notifications...");
    
    // Fetch recent notifications
    const notificationsQuery = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      where("isArchived", "==", false),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    
    const snapshot = await getDocs(notificationsQuery);
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    // Cache the results
    await setCache(CACHE_KEYS.NOTIFICATIONS(userId), notifications);
    
    console.log("✅ Notifications preloaded:", notifications.length, "items");
  } catch (error) {
    console.log("⚠️ Notifications preload failed (non-critical):", error);
  }
};

/**
 * Preload user's leagues
 */
const prefetchLeagues = async (
  userId: string,
  setCache: (key: string, data: any, regionKey?: string) => Promise<void>
) => {
  try {
    console.log("🔄 Preloading leagues...");
    
    // Fetch user's leagues (where they are a member)
    const leaguesQuery = query(
      collection(db, "leagues"),
      where("memberIds", "array-contains", userId),
      limit(10)
    );
    
    const snapshot = await getDocs(leaguesQuery);
    const leagues = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    // Cache the results using consistent cache key
    await setCache(CACHE_KEYS.LEAGUES(userId), leagues);
    
    console.log("✅ Leagues preloaded:", leagues.length, "leagues");
  } catch (error) {
    console.log("⚠️ Leagues preload failed (non-critical):", error);
  }
};

/**
 * Preload user's profile (for quick access)
 */
const prefetchUserProfile = async (
  userId: string,
  setCache: (key: string, data: any, regionKey?: string) => Promise<void>
) => {
  try {
    console.log("🔄 Preloading user profile...");
    
    const userDoc = await getDoc(doc(db, "users", userId));
    
    if (userDoc.exists()) {
      await setCache(CACHE_KEYS.USER_PROFILE(userId), userDoc.data());
      console.log("✅ User profile preloaded");
    }
  } catch (error) {
    console.log("⚠️ User profile preload failed (non-critical):", error);
  }
};

/* ================================================================ */
/* HOOK                                                             */
/* ================================================================ */

export function useBackgroundPreload({
  currentUserId,
  regionKey,
  hasLoadedOnce,
}: UseBackgroundPreloadOptions) {
  const { setCache, getCache } = useCache();
  const hasPreloadedRef = useRef(false);

  useEffect(() => {
    // Only preload once, after feed loads
    if (!hasLoadedOnce || !currentUserId || hasPreloadedRef.current) return;
    
    hasPreloadedRef.current = true;
    
    console.log("🚀 Starting background preload...");

    // Stagger preloads to avoid overwhelming the network
    // Each preload starts after a delay from the previous one
    
    const preloadTasks = async () => {
      // 1. Leaderboard (immediate - most visited after clubhouse)
      setTimeout(async () => {
        if (regionKey) {
          await preloadLeaderboardData(currentUserId, regionKey, "18", setCache);
          console.log("✅ Leaderboard preloaded (always refresh)");
        }
      }, 100);

      // 2. Notifications (1000ms delay)
      setTimeout(async () => {
        const cached = await getCache(CACHE_KEYS.NOTIFICATIONS(currentUserId));
        if (!cached) {
          await prefetchNotifications(currentUserId, setCache);
        } else {
          console.log("⚡ Notifications already cached");
        }
      }, 1000);

      // 3. Locker (1500ms delay)
      setTimeout(async () => {
        const cached = await getCache(CACHE_KEYS.LOCKER(currentUserId));
        if (!cached) {
          await prefetchLocker(currentUserId, setCache);
        } else {
          console.log("⚡ Locker already cached");
        }
      }, 1500);

      // 4. Leagues (2000ms delay)
      setTimeout(async () => {
        const cached = await getCache(CACHE_KEYS.LEAGUES(currentUserId));
        if (!cached) {
          await prefetchLeagues(currentUserId, setCache);
        } else {
          console.log("⚡ Leagues already cached");
        }
      }, 2000);

      // 5. User Profile (2500ms delay)
      setTimeout(async () => {
        const cached = await getCache(CACHE_KEYS.USER_PROFILE(currentUserId));
        if (!cached) {
          await prefetchUserProfile(currentUserId, setCache);
        } else {
          console.log("⚡ User profile already cached");
        }
      }, 2500);
    };

    preloadTasks();
    
  }, [hasLoadedOnce, currentUserId, regionKey, setCache, getCache]);
}