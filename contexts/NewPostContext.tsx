/**
 * NewPostContext
 * 
 * Handles optimistic UI updates for posts.
 * When a user creates, edits, or deletes a post, this context
 * stores the change so Clubhouse can update instantly without refetching.
 * 
 * Flow:
 * 1. User creates/edits/deletes post in Create screen
 * 2. After Firestore success, save to this context
 * 3. Navigate back to Clubhouse
 * 4. Clubhouse reads from context and updates local state
 * 5. Context is cleared after consumption
 * 
 * This provides Instagram-like instant feedback without cold starts.
 */

import React, { createContext, useCallback, useContext, useRef } from "react";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

export interface PendingPostData {
  // Core fields
  id: string;
  thoughtId: string;
  userId: string;
  userType: string;
  content: string;
  postType?: string;
  
  // Media
  imageUrls?: string[];
  imageCount?: number;
  videoUrl?: string | null;
  videoThumbnailUrl?: string | null;
  videoDuration?: number | null;
  videoTrimStart?: number | null;
  videoTrimEnd?: number | null;
  
  // Timestamps
  createdAt: any;
  
  // Engagement (defaults for new posts)
  likes: number;
  likedBy: string[];
  comments: number;
  
  // User info (denormalized)
  userName?: string;
  displayName?: string;
  userAvatar?: string;
  avatarUrl?: string;
  userHandicap?: number;
  userVerified?: boolean;
  
  // Tagged items
  taggedPartners?: Array<{ userId: string; displayName: string }>;
  taggedCourses?: Array<{ courseId: number; courseName: string }>;
  taggedTournaments?: Array<{ tournamentId: string; name: string }>;
  taggedLeagues?: Array<{ leagueId: string; name: string }>;
  
  // Location
  regionKey?: string;
  geohash?: string;
  location?: {
    city: string;
    state: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  
  // Media metadata
  hasMedia?: boolean;
  mediaType?: "images" | "video" | null;
}

export interface PendingPost {
  type: "create" | "edit" | "delete";
  post?: PendingPostData;  // Full post data for create/edit
  postId?: string;         // Just the ID for delete
  timestamp: number;       // When this was set (for expiry)
}

interface NewPostContextType {
  /**
   * Set a pending post after create/edit/delete
   */
  setPendingPost: (pending: Omit<PendingPost, "timestamp">) => void;
  
  /**
   * Get and clear the pending post (consume it)
   * Returns null if no pending post or if expired (>30 seconds old)
   */
  consumePendingPost: () => PendingPost | null;
  
  /**
   * Check if there's a pending post without consuming it
   */
  hasPendingPost: () => boolean;
  
  /**
   * Clear any pending post (if navigation was cancelled, etc)
   */
  clearPendingPost: () => void;
}

/* ================================================================ */
/* CONTEXT                                                          */
/* ================================================================ */

const NewPostContext = createContext<NewPostContextType | undefined>(undefined);

// Pending posts expire after 30 seconds (in case user doesn't return to feed)
const PENDING_POST_EXPIRY_MS = 30 * 1000;

export const NewPostProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Use ref to avoid re-renders when pending post changes
  const pendingPostRef = useRef<PendingPost | null>(null);

  /**
   * Set a pending post
   */
  const setPendingPost = useCallback((pending: Omit<PendingPost, "timestamp">) => {
    pendingPostRef.current = {
      ...pending,
      timestamp: Date.now(),
    };
    
    console.log("📝 Pending post set:", pending.type, pending.postId || pending.post?.id);
  }, []);

  /**
   * Get and clear the pending post
   */
  const consumePendingPost = useCallback((): PendingPost | null => {
    const pending = pendingPostRef.current;
    
    if (!pending) {
      return null;
    }
    
    // Check if expired
    const age = Date.now() - pending.timestamp;
    if (age > PENDING_POST_EXPIRY_MS) {
      console.log("⏰ Pending post expired, ignoring");
      pendingPostRef.current = null;
      return null;
    }
    
    // Clear and return
    pendingPostRef.current = null;
    console.log("✅ Pending post consumed:", pending.type);
    
    return pending;
  }, []);

  /**
   * Check if there's a pending post
   */
  const hasPendingPost = useCallback((): boolean => {
    const pending = pendingPostRef.current;
    
    if (!pending) return false;
    
    // Check expiry
    const age = Date.now() - pending.timestamp;
    if (age > PENDING_POST_EXPIRY_MS) {
      pendingPostRef.current = null;
      return false;
    }
    
    return true;
  }, []);

  /**
   * Clear pending post
   */
  const clearPendingPost = useCallback(() => {
    pendingPostRef.current = null;
    console.log("🗑️ Pending post cleared");
  }, []);

  const value: NewPostContextType = {
    setPendingPost,
    consumePendingPost,
    hasPendingPost,
    clearPendingPost,
  };

  return (
    <NewPostContext.Provider value={value}>
      {children}
    </NewPostContext.Provider>
  );
};

/* ================================================================ */
/* HOOK                                                             */
/* ================================================================ */

export const useNewPost = () => {
  const context = useContext(NewPostContext);
  if (!context) {
    throw new Error("useNewPost must be used within NewPostProvider");
  }
  return context;
};