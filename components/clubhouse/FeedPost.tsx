/**
 * FeedPost Component
 * 
 * Complete post card for the feed.
 * Includes:
 * - Header (avatar, name, type badge, timestamp)
 * - Media (images carousel or video)
 * - Content (text with @mentions and #hashtags)
 * - Footer (like and comment buttons)
 */

import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

import { soundPlayer } from "@/utils/soundPlayer";
import { getPostTypeLabel } from "@/constants/postTypes";
import { getRelativeTime, Thought } from "@/utils/feedHelpers";
import FeedPostMedia from "./FeedPostMedia";
import FeedPostContent from "./FeedPostContent";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface FeedPostProps {
  thought: Thought;
  currentUserId: string;
  isHighlighted?: boolean;
  onLike: (thought: Thought) => void;
  onComment: (thought: Thought) => void;
  onEdit: (thought: Thought) => void;
  onReport: (thought: Thought) => void;
  onImagePress: (imageUrl: string) => void;
  onVideoPress: (
    videoUrl: string,
    thumbnailUrl?: string,
    trimStart?: number,
    trimEnd?: number,
    duration?: number
  ) => void;
  onHashtagPress: (name: string, type: "tournament" | "league") => void;
}

/* ================================================================ */
/* COMPONENT                                                        */
/* ================================================================ */

export default function FeedPost({
  thought,
  currentUserId,
  isHighlighted,
  onLike,
  onComment,
  onEdit,
  onReport,
  onImagePress,
  onVideoPress,
  onHashtagPress,
}: FeedPostProps) {
  const router = useRouter();

  // Computed values
  const hasLiked = thought.likedBy?.includes(currentUserId);
  const hasComments = (thought.comments || 0) > 0;
  const isOwnPost = thought.userId === currentUserId;
  const isLowLeader = thought.postType === "low-leader";
  const isScore = thought.postType === "score";
  
  const displayName = thought.userName || thought.displayName || "Unknown";
  const avatarUrl = thought.userAvatar || thought.avatarUrl || thought.avatar;
  
  // Header text for special post types
  let headerText = "";
  let thoughtTypeLabel = getPostTypeLabel(thought.postType);
  
  if (isLowLeader) {
    headerText = "Became the New Low Leader!";
    thoughtTypeLabel = "Low Leader";
  } else if (isScore) {
    headerText = "Logged a new round";
    thoughtTypeLabel = "Score";
  }

  // Navigate to profile
  const handleProfilePress = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (thought.userType === 'Course') {
      router.push(`/locker/course/${thought.ownedCourseId || thought.linkedCourseId}`);
    } else {
      router.push(`/locker/${thought.userId}`);
    }
  };

  return (
    <View style={[styles.card, isHighlighted && styles.cardHighlighted]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerLeft} onPress={handleProfilePress}>
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
              {headerText && (
                <Text style={styles.headerActionText}> {headerText}</Text>
              )}
            </View>
            
            <View style={styles.badgeRow}>
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{thoughtTypeLabel}</Text>
              </View>
              <Text style={styles.timestamp}>
                {getRelativeTime(thought.createdAt)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.headerRight}>
          {isOwnPost && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => onEdit(thought)}
            >
              <Ionicons name="create-outline" size={20} color="#0D5C3A" />
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => onReport(thought)}
          >
            <Image 
              source={require("@/assets/icons/More.png")} 
              style={styles.moreIcon}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Media */}
      <FeedPostMedia
        thoughtId={thought.id}
        imageUrls={thought.imageUrls}
        imageUrl={thought.imageUrl}
        videoUrl={thought.videoUrl}
        videoThumbnailUrl={thought.videoThumbnailUrl}
        videoDuration={thought.videoDuration}
        videoTrimStart={thought.videoTrimStart}
        videoTrimEnd={thought.videoTrimEnd}
        onImagePress={onImagePress}
        onVideoPress={onVideoPress}
      />

      {/* Content */}
      <View style={styles.contentContainer}>
        <FeedPostContent
          content={thought.content}
          taggedPartners={thought.taggedPartners}
          taggedCourses={thought.taggedCourses}
          taggedTournaments={thought.taggedTournaments}
          taggedLeagues={thought.taggedLeagues}
          onHashtagPress={onHashtagPress}
        />

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onLike(thought)}
          >
            <Image
              source={require("@/assets/icons/Throw Darts.png")}
              style={[styles.actionIcon, hasLiked && styles.actionIconLiked]}
            />
            <Text style={styles.actionText}>{thought.likes}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onComment(thought)}
          >
            <Image
              source={require("@/assets/icons/Comments.png")}
              style={[styles.actionIcon, hasComments && styles.actionIconCommented]}
            />
            <Text style={styles.actionText}>{thought.comments || 0}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    marginBottom: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardHighlighted: {
    backgroundColor: "#FFFEF5",
    borderWidth: 3,
    borderColor: "#FFD700",
  },
  
  // Header
  header: {
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
  typeBadge: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  timestamp: {
    fontSize: 12,
    color: "#999",
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
  
  // Content
  contentContainer: {
    padding: 16,
  },
  
  // Footer
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
});