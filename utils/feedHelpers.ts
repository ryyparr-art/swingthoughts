/**
 * Feed Helpers
 * 
 * Utility functions for converting between different feed data formats.
 * Extracted from clubhouse/index.tsx to keep the main file clean.
 */

import { db } from "@/constants/firebaseConfig";
import { FeedItem, FeedPost, FeedScore } from "@/utils/feedAlgorithm";
import { doc, getDoc } from "firebase/firestore";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

export interface Thought {
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
  avatar?: string;
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
    latitude?: number | null;
    longitude?: number | null;
  };
  
  // Engagement metrics
  engagementScore?: number;
  viewCount?: number;
  
  // Media metadata
  hasMedia?: boolean;
  mediaType?: "images" | "video" | null;
  mediaAspectRatio?: number;
  
  // Score reference
  scoreId?: string;
  
  // Algorithm fields (for shuffle functions)
  displayBracket?: number;
  timeBracket?: number;
  withinBracketScore?: number;
  relevanceReason?: string;
}

/* ================================================================ */
/* CONVERSION FUNCTIONS                                             */
/* ================================================================ */

/**
 * Convert Firestore post document to Thought
 */
export const convertPostDataToThought = (postId: string, data: any): Thought => {
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
    
    userName: data.userName || data.displayName,
    userAvatar: data.userAvatar || data.avatar,
    avatar: data.avatar,
    userHandicap: data.userHandicap,
    userVerified: data.userVerified,
    
    displayName: data.userName || data.displayName,
    avatarUrl: data.userAvatar || data.avatarUrl || data.avatar,
    
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
    mediaAspectRatio: data.mediaAspectRatio,
    
    scoreId: data.scoreId,
  };
  
  return thought;
};

/**
 * Convert feed items to thoughts (fetches full post data from Firestore)
 */
export const convertFeedToThoughts = async (feedItems: FeedItem[]): Promise<Thought[]> => {
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
        
        // Preserve algorithm fields from feed item
        thought.displayBracket = postItem.displayBracket;
        thought.timeBracket = postItem.timeBracket;
        thought.withinBracketScore = postItem.withinBracketScore;
        thought.relevanceReason = postItem.relevanceReason;
        
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
        likes: scoreItem.likes || 0,
        likedBy: [],
        comments: scoreItem.comments || 0,
        displayName: scoreItem.displayName,
        avatarUrl: scoreItem.avatar,
        courseName: scoreItem.courseName,
        taggedCourses: [{ courseId: scoreItem.courseId, courseName: scoreItem.courseName }],
        
        // Preserve algorithm fields for scores too
        displayBracket: scoreItem.displayBracket,
        timeBracket: scoreItem.timeBracket,
        withinBracketScore: scoreItem.withinBracketScore,
        relevanceReason: scoreItem.relevanceReason,
      });
    }
  }
  
  return thoughts;
};

/**
 * Convert cached feed items to thoughts (no Firestore fetch needed)
 */
export const convertCachedFeedToThoughts = (feedItems: FeedItem[]): Thought[] => {
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
        avatar: postItem.avatar,
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
          latitude: postItem.location.latitude ?? undefined,
          longitude: postItem.location.longitude ?? undefined,
        } : undefined,
        
        hasMedia: postItem.hasMedia,
        mediaType: (postItem.mediaType === "images" || postItem.mediaType === "video") ? postItem.mediaType : null,
        mediaAspectRatio: (postItem as any).mediaAspectRatio,
        engagementScore: postItem.engagementScore,
        viewCount: postItem.viewCount,
        
        // Algorithm fields
        displayBracket: postItem.displayBracket,
        timeBracket: postItem.timeBracket,
        withinBracketScore: postItem.withinBracketScore,
        relevanceReason: postItem.relevanceReason,
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
        likes: scoreItem.likes || 0,
        likedBy: [],
        comments: scoreItem.comments || 0,
        displayName: scoreItem.displayName,
        avatarUrl: scoreItem.avatar,
        userName: scoreItem.displayName,
        userAvatar: scoreItem.avatar,
        avatar: scoreItem.avatar,
        courseName: scoreItem.courseName,
        taggedCourses: [{
          courseId: scoreItem.courseId,
          courseName: scoreItem.courseName
        }],
        
        // Algorithm fields
        displayBracket: scoreItem.displayBracket,
        timeBracket: scoreItem.timeBracket,
        withinBracketScore: scoreItem.withinBracketScore,
        relevanceReason: scoreItem.relevanceReason,
      });
    }
  }
  
  return thoughts;
};

/**
 * Get relative time string from timestamp
 */
export const getRelativeTime = (timestamp: any): string => {
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

/**
 * Calculate distance between two coordinates in miles (Haversine formula)
 */
export const calculateDistanceMiles = (
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