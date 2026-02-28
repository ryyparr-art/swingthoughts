/**
 * FeedPostMedia Component
 * 
 * Renders post media (images carousel or video thumbnail).
 * - Multi-image carousel with pagination dots
 * - Video thumbnail with play button
 * - Tap to expand to fullscreen
 * - Dynamic aspect ratio (Instagram-style): clamped between 4:5 portrait and 1.91:1 landscape
 * - Self-measuring width to fit within card bounds (no overlap)
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image as ExpoImage } from "expo-image";
import React, { useCallback, useRef, useState } from "react";
import {
  FlatList,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from "react-native";

import { VideoThumbnail } from "@/components/video/VideoComponents";
import { soundPlayer } from "@/utils/soundPlayer";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface FeedPostMediaProps {
  thoughtId: string;
  imageUrls?: string[];
  imageUrl?: string;
  videoUrl?: string;
  videoThumbnailUrl?: string;
  videoDuration?: number;
  videoTrimStart?: number;
  videoTrimEnd?: number;
  mediaAspectRatio?: number;
  onImagePress: (imageUrls: string[], startIndex: number) => void;
  onVideoPress: (
    videoUrl: string,
    thumbnailUrl?: string,
    trimStart?: number,
    trimEnd?: number,
    duration?: number
  ) => void;
}

/* ================================================================ */
/* COMPONENT                                                        */
/* ================================================================ */

export default function FeedPostMedia({
  thoughtId,
  imageUrls,
  imageUrl,
  videoUrl,
  videoThumbnailUrl,
  videoDuration,
  videoTrimStart,
  videoTrimEnd,
  mediaAspectRatio,
  onImagePress,
  onVideoPress,
}: FeedPostMediaProps) {
  // Get images array
  const images = imageUrls || (imageUrl ? [imageUrl] : []);

  // Self-measure container width — no more SCREEN_WIDTH assumption
  const [containerWidth, setContainerWidth] = useState(0);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && width !== containerWidth) {
      setContainerWidth(width);
    }
  }, [containerWidth]);

  // Current image index for carousel
  const [currentIndex, setCurrentIndex] = useState(0);

  // Viewability config for accurate index tracking
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  // Clamp aspect ratio: min 0.8 (4:5 portrait), max 1.91 (landscape), default 1.0 (square)
  const clampedRatio = Math.min(1.91, Math.max(0.8, mediaAspectRatio || 1.0));
  const mediaHeight = containerWidth > 0 ? Math.round(containerWidth / clampedRatio) : 0;

  // Handle image tap — pass full array + tapped index
  const handleImagePress = (index: number) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onImagePress(images, index);
  };

  // Handle video tap
  const handleVideoPress = () => {
    onVideoPress(
      videoUrl!,
      videoThumbnailUrl,
      videoTrimStart,
      videoTrimEnd,
      videoDuration
    );
  };

  // Render images carousel
  if (images.length > 0) {
    return (
      <View onLayout={handleLayout}>
        {containerWidth > 0 && (
          <>
            <FlatList
              data={images}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              bounces={false}
              overScrollMode="never"
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              getItemLayout={(_, index) => ({
                length: containerWidth,
                offset: containerWidth * index,
                index,
              })}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => handleImagePress(index)}
                  style={{ width: containerWidth }}
                >
                  <ExpoImage
                    source={{ uri: item }}
                    style={{ width: containerWidth, height: mediaHeight }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                  />
                </TouchableOpacity>
              )}
              keyExtractor={(_, index) => `${thoughtId}-image-${index}`}
            />

            {/* Pagination dots */}
            {images.length > 1 && (
              <View style={styles.paginationDots}>
                {images.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.dot,
                      currentIndex === index && styles.dotActive,
                    ]}
                  />
                ))}
              </View>
            )}

            {/* Image count badge */}
            {images.length > 1 && (
              <View style={styles.countBadge}>
                <Ionicons name="images" size={14} color="#FFF" />
                <Text style={styles.countText}>
                  {currentIndex + 1}/{images.length}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    );
  }

  // Render video thumbnail
  if (videoUrl) {
    return (
      <VideoThumbnail
        videoUrl={videoUrl}
        thumbnailUrl={videoThumbnailUrl}
        videoDuration={videoDuration}
        mediaHeight={mediaHeight || 300}
        onPress={handleVideoPress}
      />
    );
  }

  // No media
  return null;
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  // Pagination dots
  paginationDots: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.2)",
  },
  dotActive: {
    backgroundColor: "#FFD700",
    width: 24,
    borderColor: "rgba(0, 0, 0, 0.3)",
  },

  // Count badge
  countBadge: {
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
  countText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },
});