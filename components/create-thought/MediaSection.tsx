/**
 * MediaSection Component
 * 
 * Handles image and video display, selection, and trimming
 */

import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { ResizeMode, Video } from "expo-av";
import React from "react";
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { MAX_IMAGES, MAX_VIDEO_DURATION } from "./types";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface MediaSectionProps {
  // State
  mediaType: "images" | "video" | null;
  imageUris: string[];
  videoUri: string | null;
  isProcessingMedia: boolean;
  showCropModal: boolean;
  writable: boolean;
  // Video state
  videoRef: React.RefObject<Video | null>;
  videoDuration: number;
  trimStart: number;
  trimEnd: number;
  showVideoTrimmer: boolean;
  isVideoPlaying: boolean;
  // Image carousel
  currentImageIndex: number;
  setCurrentImageIndex: (index: number) => void;
  // Handlers
  onAddMedia: () => void;
  onAddMoreImages: () => void;
  onRemoveImage: (index: number) => void;
  onRemoveVideo: () => void;
  onToggleVideoPlayback: () => void;
  onTrimStartChange: (value: number) => void;
  onTrimEndChange: (value: number) => void;
  onSeekToTrimStart: () => void;
}

export default function MediaSection({
  mediaType,
  imageUris,
  videoUri,
  isProcessingMedia,
  showCropModal,
  writable,
  videoRef,
  videoDuration,
  trimStart,
  trimEnd,
  showVideoTrimmer,
  isVideoPlaying,
  currentImageIndex,
  setCurrentImageIndex,
  onAddMedia,
  onAddMoreImages,
  onRemoveImage,
  onRemoveVideo,
  onToggleVideoPlayback,
  onTrimStartChange,
  onTrimEndChange,
  onSeekToTrimStart,
}: MediaSectionProps) {
  // Processing state
  if (isProcessingMedia && !showCropModal) {
    return (
      <View style={styles.section}>
        <View style={styles.mediaPreviewBox}>
          <ActivityIndicator size="large" color="#0D5C3A" />
          <Text style={styles.processingText}>Processing media...</Text>
        </View>
      </View>
    );
  }

  // Has media
  if (imageUris.length > 0 || videoUri) {
    return (
      <View style={styles.section}>
        {/* Images */}
        {imageUris.length > 0 && (
          <View>
            <FlatList
              data={imageUris}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(
                  event.nativeEvent.contentOffset.x / (SCREEN_WIDTH - 32)
                );
                setCurrentImageIndex(index);
              }}
              renderItem={({ item, index }) => (
                <View style={[styles.imageCarouselItem, { width: SCREEN_WIDTH - 32 }]}>
                  <Image source={{ uri: item }} style={styles.carouselImage} />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => onRemoveImage(index)}
                  >
                    <Text style={styles.removeImageText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              keyExtractor={(item, index) => `image-${index}`}
            />

            {imageUris.length > 1 && (
              <View style={styles.paginationDots}>
                {imageUris.map((_, index) => (
                  <View
                    key={index}
                    style={[styles.dot, currentImageIndex === index && styles.dotActive]}
                  />
                ))}
              </View>
            )}

            {imageUris.length < MAX_IMAGES && (
              <TouchableOpacity style={styles.addMoreButton} onPress={onAddMoreImages}>
                <Ionicons name="add-circle-outline" size={20} color="#FFF" />
                <Text style={styles.addMoreText}>
                  Add More ({imageUris.length}/{MAX_IMAGES})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Video */}
        {videoUri && (
          <View>
            <View style={styles.mediaPreviewBox}>
              <Video
                ref={videoRef}
                source={{ uri: videoUri }}
                style={styles.mediaPreview}
                resizeMode={ResizeMode.COVER}
                isLooping
                isMuted
                shouldPlay={false}
              />

              {!isVideoPlaying && (
                <TouchableOpacity
                  style={styles.videoPlayOverlay}
                  onPress={onToggleVideoPlayback}
                >
                  <View style={styles.playButton}>
                    <Ionicons name="play" size={32} color="#0D5C3A" />
                  </View>
                </TouchableOpacity>
              )}

              {isVideoPlaying && (
                <TouchableOpacity
                  style={styles.videoPauseOverlay}
                  onPress={onToggleVideoPlayback}
                >
                  <View style={styles.pauseButton}>
                    <Ionicons name="pause" size={28} color="#0D5C3A" />
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* Video Trimmer */}
            {showVideoTrimmer && (
              <VideoTrimmer
                videoDuration={videoDuration}
                trimStart={trimStart}
                trimEnd={trimEnd}
                onTrimStartChange={onTrimStartChange}
                onTrimEndChange={onTrimEndChange}
                onSeekToTrimStart={onSeekToTrimStart}
              />
            )}

            <TouchableOpacity style={styles.removeVideoButton} onPress={onRemoveVideo}>
              <Ionicons name="trash-outline" size={18} color="#FFF" />
              <Text style={styles.removeMediaText}>Remove Video</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // No media - show add button
  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.addMediaButton}
        onPress={onAddMedia}
        disabled={!writable}
      >
        <Ionicons name="camera-outline" size={48} color="#0D5C3A" />
        <Text style={styles.addMediaText}>Add Media</Text>
        <Text style={styles.addMediaHint}>Up to {MAX_IMAGES} photos or 1 video</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ================================================================ */
/* VIDEO TRIMMER SUB-COMPONENT                                       */
/* ================================================================ */

interface VideoTrimmerProps {
  videoDuration: number;
  trimStart: number;
  trimEnd: number;
  onTrimStartChange: (value: number) => void;
  onTrimEndChange: (value: number) => void;
  onSeekToTrimStart: () => void;
}

function VideoTrimmer({
  videoDuration,
  trimStart,
  trimEnd,
  onTrimStartChange,
  onTrimEndChange,
  onSeekToTrimStart,
}: VideoTrimmerProps) {
  return (
    <View style={styles.videoTrimmer}>
      <View style={styles.trimmerHeader}>
        <Ionicons name="cut-outline" size={20} color="#0D5C3A" />
        <Text style={styles.trimmerLabel}>
          Select Clip: {trimStart.toFixed(1)}s - {trimEnd.toFixed(1)}s
        </Text>
        <Text style={styles.trimmerDuration}>({(trimEnd - trimStart).toFixed(1)}s)</Text>
      </View>

      <View style={styles.timelineContainer}>
        <View style={styles.timeline}>
          <View
            style={[
              styles.timelineSelected,
              {
                left: `${(trimStart / videoDuration) * 100}%`,
                width: `${((trimEnd - trimStart) / videoDuration) * 100}%`,
              },
            ]}
          />
        </View>
        <View style={styles.timelineLabels}>
          <Text style={styles.timelineLabel}>0s</Text>
          <Text style={styles.timelineLabel}>{videoDuration.toFixed(0)}s</Text>
        </View>
      </View>

      <View style={styles.sliderContainer}>
        <Text style={styles.sliderLabel}>Start Time</Text>
        <View style={styles.sliderRow}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={Math.max(0, videoDuration - 1)}
            value={trimStart}
            onValueChange={(value) => {
              onTrimStartChange(value);
            }}
            onSlidingComplete={onSeekToTrimStart}
            minimumTrackTintColor="#0D5C3A"
            maximumTrackTintColor="#E0E0E0"
            thumbTintColor="#0D5C3A"
          />
          <Text style={styles.sliderValue}>{trimStart.toFixed(1)}s</Text>
        </View>
      </View>

      <View style={styles.sliderContainer}>
        <Text style={styles.sliderLabel}>End Time</Text>
        <View style={styles.sliderRow}>
          <Slider
            style={styles.slider}
            minimumValue={Math.max(trimStart + 0.5, 0.5)}
            maximumValue={Math.min(videoDuration, trimStart + MAX_VIDEO_DURATION)}
            value={trimEnd}
            onValueChange={onTrimEndChange}
            minimumTrackTintColor="#0D5C3A"
            maximumTrackTintColor="#E0E0E0"
            thumbTintColor="#0D5C3A"
          />
          <Text style={styles.sliderValue}>{trimEnd.toFixed(1)}s</Text>
        </View>
      </View>

      {videoDuration > MAX_VIDEO_DURATION && (
        <View style={styles.trimmerWarning}>
          <Ionicons name="information-circle-outline" size={16} color="#664D03" />
          <Text style={styles.trimmerWarningText}>
            Maximum clip length is {MAX_VIDEO_DURATION} seconds
          </Text>
        </View>
      )}
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  
  // Add Media Button
  addMediaButton: {
    height: 180,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 2,
    borderColor: "#0D5C3A",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  addMediaText: { fontSize: 17, fontWeight: "700", color: "#0D5C3A", marginTop: 12 },
  addMediaHint: { fontSize: 13, color: "#666", textAlign: "center", marginTop: 6 },

  // Image Carousel
  imageCarouselItem: { height: 280, borderRadius: 12, overflow: "hidden", position: "relative" },
  carouselImage: { width: "100%", height: "100%" },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeImageText: { color: "#FFF", fontSize: 18, fontWeight: "700" },
  paginationDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#CCC" },
  dotActive: { backgroundColor: "#0D5C3A", width: 24 },
  addMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#0D5C3A",
  },
  addMoreText: { color: "#FFF", fontWeight: "600", fontSize: 14 },

  // Media Preview
  mediaPreviewBox: {
    width: "100%",
    height: 280,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  mediaPreview: { width: "100%", height: "100%" },
  processingText: { color: "#0D5C3A", marginTop: 12, fontSize: 14, fontWeight: "600" },

  // Video Playback
  videoPlayOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  videoPauseOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 4,
  },
  pauseButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeVideoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#FF3B30",
  },
  removeMediaText: { color: "#FFF", fontWeight: "600", fontSize: 14 },

  // Video Trimmer
  videoTrimmer: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  trimmerHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  trimmerLabel: { fontSize: 14, fontWeight: "700", color: "#0D5C3A", flex: 1 },
  trimmerDuration: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFD700",
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timelineContainer: { marginBottom: 16 },
  timeline: {
    height: 8,
    backgroundColor: "#E0E0E0",
    borderRadius: 4,
    overflow: "hidden",
    position: "relative",
  },
  timelineSelected: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "#0D5C3A",
    borderRadius: 4,
  },
  timelineLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  timelineLabel: { fontSize: 10, color: "#999" },
  sliderContainer: { marginBottom: 12 },
  sliderLabel: { fontSize: 12, fontWeight: "600", color: "#666", marginBottom: 4 },
  sliderRow: { flexDirection: "row", alignItems: "center" },
  slider: { flex: 1, height: 40 },
  sliderValue: { fontSize: 13, color: "#0D5C3A", fontWeight: "700", width: 45, textAlign: "right" },
  trimmerWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF3CD",
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  trimmerWarningText: { fontSize: 12, color: "#664D03", flex: 1 },
});