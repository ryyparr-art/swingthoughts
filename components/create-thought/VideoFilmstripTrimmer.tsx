/**
 * VideoFilmstripTrimmer — Instagram-style video trim UI
 *
 * Features:
 *   - Filmstrip of thumbnails extracted from the video at even intervals
 *   - Draggable left/right handles to set trim start/end
 *   - Dimmed overlay outside the selected range
 *   - Animated playhead that tracks video position within trim range
 *   - Duration badge showing selected clip length
 *   - Max duration enforcement (handles snap to limit)
 *   - Haptic feedback on handle drag
 *
 * Uses expo-video-thumbnails to extract frames.
 *
 * File: components/create-thought/VideoFilmstripTrimmer.tsx
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as VideoThumbnails from "expo-video-thumbnails";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Image,
    LayoutChangeEvent,
    PanResponder,
    StyleSheet,
    Text,
    View
} from "react-native";

import { MAX_VIDEO_DURATION } from "./types";

// ============================================================================
// CONSTANTS
// ============================================================================

const SCREEN_WIDTH = Dimensions.get("window").width;
const STRIP_HORIZONTAL_PADDING = 16;
const STRIP_WIDTH = SCREEN_WIDTH - 32 - STRIP_HORIZONTAL_PADDING * 2;
const STRIP_HEIGHT = 56;
const HANDLE_WIDTH = 16;
const HANDLE_HIT_SLOP = 20; // Extra touch area beyond visible handle
const THUMBNAIL_COUNT = 10;
const MIN_TRIM_DURATION = 1; // seconds

const GREEN = "#0D5C3A";
const GOLD = "#C5A55A";

// ============================================================================
// TYPES
// ============================================================================

interface VideoFilmstripTrimmerProps {
  videoUri: string;
  videoDuration: number; // in seconds
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
  /** Current playback position in seconds (for playhead) */
  currentTime?: number;
  /** Called when user finishes dragging a handle — seek video to new position */
  onSeekToPosition?: (seconds: number) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function VideoFilmstripTrimmer({
  videoUri,
  videoDuration,
  trimStart,
  trimEnd,
  onTrimChange,
  currentTime = 0,
  onSeekToPosition,
}: VideoFilmstripTrimmerProps) {
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [stripWidth, setStripWidth] = useState(STRIP_WIDTH);

  // Refs for pan gesture tracking
  const trimStartRef = useRef(trimStart);
  const trimEndRef = useRef(trimEnd);
  const isDraggingLeft = useRef(false);
  const isDraggingRight = useRef(false);

  // Keep refs in sync with props
  useEffect(() => {
    trimStartRef.current = trimStart;
    trimEndRef.current = trimEnd;
  }, [trimStart, trimEnd]);

  // ── Extract thumbnails ────────────────────────────────────
  useEffect(() => {
    if (!videoUri || videoDuration <= 0) return;

    let cancelled = false;

    const extractThumbnails = async () => {
      setLoading(true);
      const thumbs: string[] = [];
      const interval = videoDuration / THUMBNAIL_COUNT;

      for (let i = 0; i < THUMBNAIL_COUNT; i++) {
        if (cancelled) return;
        const time = Math.min(i * interval, videoDuration - 0.1);
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
            time: time * 1000, // ms
            quality: 0.4,
          });
          thumbs.push(uri);
        } catch (err) {
          console.warn(`Thumbnail ${i} failed:`, err);
          // Push empty string as placeholder
          thumbs.push("");
        }
      }

      if (!cancelled) {
        setThumbnails(thumbs);
        setLoading(false);
      }
    };

    extractThumbnails();
    return () => { cancelled = true; };
  }, [videoUri, videoDuration]);

  // ── Position helpers ──────────────────────────────────────
  const usableWidth = stripWidth - HANDLE_WIDTH * 2;

  const secondsToX = useCallback(
    (seconds: number) => (seconds / videoDuration) * usableWidth,
    [videoDuration, usableWidth]
  );

  const xToSeconds = useCallback(
    (x: number) => Math.max(0, Math.min((x / usableWidth) * videoDuration, videoDuration)),
    [videoDuration, usableWidth]
  );

  // ── Left handle pan responder ─────────────────────────────
  const leftStartX = useRef(0);

  const leftPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        leftStartX.current = secondsToX(trimStartRef.current);
        isDraggingLeft.current = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (_, gestureState) => {
        const newX = Math.max(0, leftStartX.current + gestureState.dx);
        let newStart = xToSeconds(newX);

        // Enforce min duration
        const maxStart = trimEndRef.current - MIN_TRIM_DURATION;
        newStart = Math.min(newStart, maxStart);

        // Enforce max duration
        if (trimEndRef.current - newStart > MAX_VIDEO_DURATION) {
          newStart = trimEndRef.current - MAX_VIDEO_DURATION;
        }

        newStart = Math.max(0, newStart);
        trimStartRef.current = newStart;
        onTrimChange(newStart, trimEndRef.current);
      },
      onPanResponderRelease: () => {
        isDraggingLeft.current = false;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSeekToPosition?.(trimStartRef.current);
      },
    })
  ).current;

  // ── Right handle pan responder ────────────────────────────
  const rightStartX = useRef(0);

  const rightPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        rightStartX.current = secondsToX(trimEndRef.current);
        isDraggingRight.current = true;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (_, gestureState) => {
        const newX = Math.min(usableWidth, rightStartX.current + gestureState.dx);
        let newEnd = xToSeconds(newX);

        // Enforce min duration
        const minEnd = trimStartRef.current + MIN_TRIM_DURATION;
        newEnd = Math.max(newEnd, minEnd);

        // Enforce max duration
        if (newEnd - trimStartRef.current > MAX_VIDEO_DURATION) {
          newEnd = trimStartRef.current + MAX_VIDEO_DURATION;
        }

        newEnd = Math.min(newEnd, videoDuration);
        trimEndRef.current = newEnd;
        onTrimChange(trimStartRef.current, newEnd);
      },
      onPanResponderRelease: () => {
        isDraggingRight.current = false;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSeekToPosition?.(trimStartRef.current);
      },
    })
  ).current;

  // ── Layout ────────────────────────────────────────────────
  const onLayout = (e: LayoutChangeEvent) => {
    setStripWidth(e.nativeEvent.layout.width);
  };

  // ── Derived positions ─────────────────────────────────────
  const leftHandleX = secondsToX(trimStart);
  const rightHandleX = secondsToX(trimEnd);
  const selectedWidth = rightHandleX - leftHandleX;
  const clipDuration = trimEnd - trimStart;

  // Playhead position within the selected range
  const playheadX =
    currentTime >= trimStart && currentTime <= trimEnd
      ? secondsToX(currentTime)
      : secondsToX(trimStart);

  // ── Format time ───────────────────────────────────────────
  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `${secs}s`;
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingStrip}>
          <ActivityIndicator size="small" color={GREEN} />
          <Text style={styles.loadingText}>Generating preview...</Text>
        </View>
      </View>
    );
  }

  const thumbWidth = stripWidth / THUMBNAIL_COUNT;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="cut-outline" size={16} color={GREEN} />
        <Text style={styles.headerLabel}>Trim Video</Text>
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{clipDuration.toFixed(1)}s</Text>
        </View>
      </View>

      {/* Filmstrip area */}
      <View style={styles.filmstripContainer}>
        {/* Thumbnail strip */}
        <View style={styles.thumbnailStrip}>
          {thumbnails.map((uri, i) => (
            <View key={i} style={[styles.thumbnailFrame, { width: thumbWidth }]}>
              {uri ? (
                <Image source={{ uri }} style={styles.thumbnailImage} />
              ) : (
                <View style={styles.thumbnailPlaceholder} />
              )}
            </View>
          ))}
        </View>

        {/* Dimmed overlay — left (before trim start) */}
        <View
          style={[
            styles.dimOverlay,
            {
              left: 0,
              width: leftHandleX + HANDLE_WIDTH,
            },
          ]}
        />

        {/* Dimmed overlay — right (after trim end) */}
        <View
          style={[
            styles.dimOverlay,
            {
              right: 0,
              width: stripWidth - (rightHandleX + HANDLE_WIDTH),
            },
          ]}
        />

        {/* Selected region border (top + bottom highlight) */}
        <View
          style={[
            styles.selectedBorderTop,
            {
              left: leftHandleX + HANDLE_WIDTH,
              width: selectedWidth,
            },
          ]}
        />
        <View
          style={[
            styles.selectedBorderBottom,
            {
              left: leftHandleX + HANDLE_WIDTH,
              width: selectedWidth,
            },
          ]}
        />

        {/* Left handle */}
        <View
          style={[styles.handle, styles.handleLeft, { left: leftHandleX }]}
          {...leftPanResponder.panHandlers}
          hitSlop={{ top: HANDLE_HIT_SLOP, bottom: HANDLE_HIT_SLOP, left: HANDLE_HIT_SLOP, right: HANDLE_HIT_SLOP }}
        >
          <View style={styles.handleBar} />
        </View>

        {/* Right handle */}
        <View
          style={[styles.handle, styles.handleRight, { left: rightHandleX + HANDLE_WIDTH }]}
          {...rightPanResponder.panHandlers}
          hitSlop={{ top: HANDLE_HIT_SLOP, bottom: HANDLE_HIT_SLOP, left: HANDLE_HIT_SLOP, right: HANDLE_HIT_SLOP }}
        >
          <View style={styles.handleBar} />
        </View>

        {/* Playhead */}
        <View
          style={[
            styles.playhead,
            { left: playheadX + HANDLE_WIDTH },
          ]}
        />
      </View>

      {/* Time labels */}
      <View style={styles.timeLabels}>
        <Text style={styles.timeLabel}>{formatTime(trimStart)}</Text>
        <Text style={styles.timeLabel}>{formatTime(trimEnd)}</Text>
      </View>

      {/* Warning for long videos */}
      {videoDuration > MAX_VIDEO_DURATION && (
        <View style={styles.warning}>
          <Ionicons name="information-circle-outline" size={14} color="#664D03" />
          <Text style={styles.warningText}>
            Max clip length is {MAX_VIDEO_DURATION}s — drag handles to select your clip
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  // ── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  headerLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: GREEN,
    flex: 1,
  },
  durationBadge: {
    backgroundColor: GREEN,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  durationText: {
    fontSize: 13,
    fontWeight: "700",
    color: GOLD,
  },

  // ── Loading ─────────────────────────────────────────────────
  loadingStrip: {
    height: STRIP_HEIGHT,
    borderRadius: 8,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: "#999",
  },

  // ── Filmstrip ───────────────────────────────────────────────
  filmstripContainer: {
    height: STRIP_HEIGHT,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  thumbnailStrip: {
    flexDirection: "row",
    height: STRIP_HEIGHT,
  },
  thumbnailFrame: {
    height: STRIP_HEIGHT,
    overflow: "hidden",
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  thumbnailPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#E0E0E0",
  },

  // ── Dim overlays ────────────────────────────────────────────
  dimOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },

  // ── Selected region borders ─────────────────────────────────
  selectedBorderTop: {
    position: "absolute",
    top: 0,
    height: 3,
    backgroundColor: GREEN,
  },
  selectedBorderBottom: {
    position: "absolute",
    bottom: 0,
    height: 3,
    backgroundColor: GREEN,
  },

  // ── Handles ─────────────────────────────────────────────────
  handle: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: HANDLE_WIDTH,
    backgroundColor: GREEN,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  handleLeft: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  handleRight: {
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  handleBar: {
    width: 3,
    height: 20,
    borderRadius: 1.5,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
  },

  // ── Playhead ────────────────────────────────────────────────
  playhead: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2.5,
    backgroundColor: "#FFF",
    zIndex: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 2,
    elevation: 3,
  },

  // ── Time labels ─────────────────────────────────────────────
  timeLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  timeLabel: {
    fontSize: 11,
    color: "#999",
    fontWeight: "500",
  },

  // ── Warning ─────────────────────────────────────────────────
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFF3CD",
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  warningText: {
    fontSize: 12,
    color: "#664D03",
    flex: 1,
  },
});