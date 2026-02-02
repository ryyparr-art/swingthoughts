/**
 * usePendingPosts Hook
 * 
 * Consumes pending posts from NewPostContext and applies them to the feed.
 * This enables Instagram-like instant feedback after create/edit/delete.
 * 
 * Flow:
 * 1. User creates/edits/deletes post in Create screen
 * 2. Create screen calls setPendingPost()
 * 3. User navigates back to Clubhouse
 * 4. This hook runs and applies the pending post to thoughts state
 * 5. User sees update instantly without refetching
 */

import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { FlatList } from "react-native";

import { PendingPostData, useNewPost } from "@/contexts/NewPostContext";
import { Thought } from "@/utils/feedHelpers";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface UsePendingPostsOptions {
  thoughts: Thought[];
  setThoughts: React.Dispatch<React.SetStateAction<Thought[]>>;
  flatListRef: React.RefObject<FlatList<any> | null>;
  hasLoadedOnce: boolean;
}

/* ================================================================ */
/* HOOK                                                             */
/* ================================================================ */

export function usePendingPosts({
  thoughts,
  setThoughts,
  flatListRef,
  hasLoadedOnce,
}: UsePendingPostsOptions) {
  const { consumePendingPost, hasPendingPost } = useNewPost();
  const hasProcessedRef = useRef(false);

  /**
   * Convert PendingPostData to Thought
   */
  const convertPendingToThought = useCallback((post: PendingPostData): Thought => {
    return {
      id: post.id,
      thoughtId: post.thoughtId,
      userId: post.userId,
      userType: post.userType || "Golfer",
      content: post.content,
      postType: post.postType,
      
      imageUrls: post.imageUrls || [],
      imageCount: post.imageCount || 0,
      videoUrl: post.videoUrl || undefined,
      videoThumbnailUrl: post.videoThumbnailUrl || undefined,
      videoDuration: post.videoDuration || undefined,
      videoTrimStart: post.videoTrimStart || undefined,
      videoTrimEnd: post.videoTrimEnd || undefined,
      
      createdAt: post.createdAt,
      likes: post.likes || 0,
      likedBy: post.likedBy || [],
      comments: post.comments || 0,
      
      userName: post.userName,
      displayName: post.displayName,
      userAvatar: post.userAvatar,
      avatarUrl: post.avatarUrl,
      userVerified: post.userVerified,
      
      taggedPartners: post.taggedPartners || [],
      taggedCourses: post.taggedCourses || [],
      taggedTournaments: post.taggedTournaments || [],
      taggedLeagues: post.taggedLeagues || [],
      
      regionKey: post.regionKey,
      geohash: post.geohash,
      location: post.location,
      
      hasMedia: post.hasMedia,
      mediaType: post.mediaType,
      
      // Set high priority for display
      displayBracket: 1,
    };
  }, []);

  /**
   * Process pending posts when screen focuses
   */
  useFocusEffect(
    useCallback(() => {
      // Only process if feed has loaded
      if (!hasLoadedOnce) return;
      
      // Check if there's a pending post
      if (!hasPendingPost()) return;
      
      // Consume the pending post
      const pending = consumePendingPost();
      if (!pending) return;
      
      console.log("📝 Processing pending post:", pending.type);
      
      if (pending.type === "create" && pending.post) {
        // Prepend new post to feed
        const newThought = convertPendingToThought(pending.post);
        
        setThoughts(prev => [newThought, ...prev]);
        console.log("✅ New post prepended to feed");
        
        // Scroll to top to show new post
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        }, 100);
        
      } else if (pending.type === "edit" && pending.post) {
        // Update existing post in feed
        setThoughts(prev => prev.map(t => {
          if (t.id === pending.post!.id) {
            return {
              ...t, // Preserve likes, comments, createdAt, position
              content: pending.post!.content,
              postType: pending.post!.postType,
              
              imageUrls: pending.post!.imageUrls || [],
              imageCount: pending.post!.imageCount || 0,
              videoUrl: pending.post!.videoUrl || undefined,
              videoThumbnailUrl: pending.post!.videoThumbnailUrl || undefined,
              videoDuration: pending.post!.videoDuration || undefined,
              videoTrimStart: pending.post!.videoTrimStart || undefined,
              videoTrimEnd: pending.post!.videoTrimEnd || undefined,
              
              taggedPartners: pending.post!.taggedPartners || [],
              taggedCourses: pending.post!.taggedCourses || [],
              taggedTournaments: pending.post!.taggedTournaments || [],
              taggedLeagues: pending.post!.taggedLeagues || [],
              
              hasMedia: pending.post!.hasMedia,
              mediaType: pending.post!.mediaType,
            };
          }
          return t;
        }));
        console.log("✅ Post updated in feed");
        
      } else if (pending.type === "delete" && pending.postId) {
        // Remove post from feed
        setThoughts(prev => prev.filter(t => t.id !== pending.postId));
        console.log("✅ Post removed from feed");
      }
    }, [hasLoadedOnce, hasPendingPost, consumePendingPost, setThoughts, flatListRef, convertPendingToThought])
  );
}