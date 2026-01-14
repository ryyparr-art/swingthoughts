/**
 * Global Cache Context - FIXED
 * 
 * Provides persistent caching across all app screens to improve navigation speed.
 * Screens can:
 * 1. Load cached data instantly on mount
 * 2. Refresh in background
 * 3. Auto-update when new data arrives
 * 
 * Cache expires after 5 minutes but persists across navigation.
 * 
 * FIXES:
 * - Properly handles empty arrays ([] !== null)
 * - Optimized memory cache (no recreating on every render)
 * - Better cache hit detection
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useRef } from "react";

const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: any;
  timestamp: number;
  regionKey?: string;
}

interface CacheContextType {
  // Get cache
  getCache: (key: string, regionKey?: string) => Promise<any | null>;
  
  // Set cache
  setCache: (key: string, data: any, regionKey?: string) => Promise<void>;
  
  // Clear specific cache
  clearCache: (key: string) => Promise<void>;
  
  // Clear all caches
  clearAllCaches: () => Promise<void>;
  
  // Check if cache is valid
  isCacheValid: (key: string, regionKey?: string) => Promise<boolean>;
  
  // Cleanup old profile caches (keep only 20 most recent)
  cleanupOldProfiles: () => Promise<void>;
}

const CacheContext = createContext<CacheContextType | undefined>(undefined);

export const CacheProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // ✅ Use useRef instead of useState to avoid re-renders
  const memoryCacheRef = useRef<Map<string, CacheEntry>>(new Map());

  /**
   * Get cached data (checks memory first, then AsyncStorage)
   */
  const getCache = useCallback(async (key: string, regionKey?: string): Promise<any | null> => {
    try {
      // Check memory cache first (fastest)
      const memoryCached = memoryCacheRef.current.get(key);
      if (memoryCached) {
        const age = Date.now() - memoryCached.timestamp;
        
        // Check expiry
        if (age < CACHE_EXPIRY_MS) {
          // Check region match (if regionKey provided)
          if (!regionKey || memoryCached.regionKey === regionKey) {
            console.log("⚡ Memory cache hit:", key);
            return memoryCached.data;
          } else {
            console.log("🔄 Region mismatch (memory):", key, "expected:", regionKey, "got:", memoryCached.regionKey);
          }
        } else {
          console.log("🕒 Memory cache expired:", key, "age:", Math.round(age / 1000), "seconds");
        }
      }

      // Check AsyncStorage (slower but persists)
      const cached = await AsyncStorage.getItem(key);
      if (cached) {
        const entry: CacheEntry = JSON.parse(cached);
        const age = Date.now() - entry.timestamp;
        
        // Check expiry
        if (age < CACHE_EXPIRY_MS) {
          // Check region match (if regionKey provided)
          if (!regionKey || entry.regionKey === regionKey) {
            console.log("💾 AsyncStorage cache hit:", key);
            
            // Update memory cache
            memoryCacheRef.current.set(key, entry);
            
            return entry.data;
          } else {
            console.log("🔄 Region mismatch (AsyncStorage):", key);
          }
        } else {
          console.log("🕒 AsyncStorage cache expired:", key);
        }
      }

      console.log("❌ Cache miss:", key);
      return null;
    } catch (error) {
      console.error("❌ Cache get error:", key, error);
      return null;
    }
  }, []);

  /**
   * Set cache (writes to both memory and AsyncStorage)
   */
  const setCache = useCallback(async (key: string, data: any, regionKey?: string): Promise<void> => {
    try {
      const entry: CacheEntry = {
        data,
        timestamp: Date.now(),
        regionKey,
      };

      // Write to memory cache (instant)
      memoryCacheRef.current.set(key, entry);

      // Write to AsyncStorage (persistent)
      await AsyncStorage.setItem(key, JSON.stringify(entry));
      
      console.log("✅ Cache set:", key, "items:", Array.isArray(data) ? data.length : "N/A");
    } catch (error) {
      console.error("❌ Cache set error:", key, error);
    }
  }, []);

  /**
   * Clear specific cache
   */
  const clearCache = useCallback(async (key: string): Promise<void> => {
    try {
      // Clear from memory
      memoryCacheRef.current.delete(key);

      // Clear from AsyncStorage
      await AsyncStorage.removeItem(key);
      
      console.log("🗑️ Cache cleared:", key);
    } catch (error) {
      console.error("❌ Cache clear error:", key, error);
    }
  }, []);

  /**
   * Clear all caches (logout, etc)
   */
  const clearAllCaches = useCallback(async (): Promise<void> => {
    try {
      // Clear memory cache
      memoryCacheRef.current.clear();

      // Clear all AsyncStorage keys that are caches
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter(k => k.endsWith('_cache') || k.includes('_cache_'));
      
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
      
      console.log("🗑️ All caches cleared");
    } catch (error) {
      console.error("❌ Clear all caches error:", error);
    }
  }, []);

  /**
   * Clear old profile caches (keep only last 20 visited)
   * Call this periodically or when cache gets large
   */
  const cleanupOldProfiles = useCallback(async (): Promise<void> => {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Get all user profile caches
      const userProfileKeys = allKeys.filter(k => k.startsWith('user_profile_cache_'));
      const courseProfileKeys = allKeys.filter(k => k.startsWith('course_profile_cache_'));
      
      // Sort by last access time (most recent first)
      const getUserProfileTime = async (key: string) => {
        const cached = await AsyncStorage.getItem(key);
        if (cached) {
          const entry: CacheEntry = JSON.parse(cached);
          return entry.timestamp;
        }
        return 0;
      };
      
      // Keep only 20 most recent user profiles
      if (userProfileKeys.length > 20) {
        const sorted = await Promise.all(
          userProfileKeys.map(async (key) => ({
            key,
            timestamp: await getUserProfileTime(key),
          }))
        );
        
        sorted.sort((a, b) => b.timestamp - a.timestamp);
        const toRemove = sorted.slice(20).map(item => item.key);
        
        await AsyncStorage.multiRemove(toRemove);
        console.log(`🧹 Cleaned up ${toRemove.length} old user profile caches`);
      }
      
      // Keep only 20 most recent course profiles
      if (courseProfileKeys.length > 20) {
        const sorted = await Promise.all(
          courseProfileKeys.map(async (key) => ({
            key,
            timestamp: await getUserProfileTime(key),
          }))
        );
        
        sorted.sort((a, b) => b.timestamp - a.timestamp);
        const toRemove = sorted.slice(20).map(item => item.key);
        
        await AsyncStorage.multiRemove(toRemove);
        console.log(`🧹 Cleaned up ${toRemove.length} old course profile caches`);
      }
    } catch (error) {
      console.error("❌ Cleanup old profiles error:", error);
    }
  }, []);

  /**
   * Check if cache is valid (not expired, region matches)
   */
  const isCacheValid = useCallback(async (key: string, regionKey?: string): Promise<boolean> => {
    const cached = await getCache(key, regionKey);
    return cached !== null;
  }, [getCache]);

  const value: CacheContextType = {
    getCache,
    setCache,
    clearCache,
    clearAllCaches,
    isCacheValid,
    cleanupOldProfiles,
  };

  return <CacheContext.Provider value={value}>{children}</CacheContext.Provider>;
};

/**
 * Hook to use cache in components
 */
export const useCache = () => {
  const context = useContext(CacheContext);
  if (!context) {
    throw new Error("useCache must be used within CacheProvider");
  }
  return context;
};

/**
 * Cache keys (consistent naming across app)
 */
export const CACHE_KEYS = {
  // Main screens (always cache)
  FEED: (userId: string) => `feed_cache_${userId}`,
  LEADERBOARD: (userId: string, regionKey: string, holeCount: "9" | "18" = "18") =>
    `leaderboard_${userId}_${regionKey}_${holeCount}h`,
  NOTIFICATIONS: (userId: string) => `notifications_cache_${userId}`,
  LOCKER: (userId: string) => `locker_cache_${userId}`,
  LOCKER_NOTES: (userId: string) => `locker_notes_cache_${userId}`,

  // 🔐 Messages
  MESSAGE_THREAD: (userId: string, otherUserId: string) =>
    `message_thread_${userId}_${otherUserId}`,

  // Dynamic profiles
  USER_PROFILE: (userId: string) => `user_profile_cache_${userId}`,
  COURSE_PROFILE: (courseId: number | string) => `course_profile_cache_${courseId}`,

  // Leaderboard details
  COURSE_LEADERBOARD: (courseId: number | string, regionKey: string) =>
    `course_leaderboard_cache_${courseId}_${regionKey}`,
};
