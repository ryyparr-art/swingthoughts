/**
 * VideoPostItem Component
 * 
 * A video player component using expo-video (replaces deprecated expo-av).
 * Designed to be used inside FlatList/map since it encapsulates the useVideoPlayer hook.
 * 
 * Features:
 * - Native controls on mobile (pause, scrub, seek)
 * - HTML5 video controls on web
 * - Initial play button overlay (disappears after first play)
 * - Replay button (appears after video ends)
 * - VIDEO and duration badges
 */

import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useState } from "react";
import {
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

/* ================================================================ */
/* WEB VIDEO COMPONENT                                              */
/* ================================================================ */

interface WebVideoPlayerProps {
  videoUrl: string;
  onEnded: () => void;
  onPlay: () => void;
  onPause: () => void;
}

const WebVideoPlayer = ({
  videoUrl,
  onEnded,
  onPlay,
  onPause,
}: WebVideoPlayerProps) => {
  return (
    <video
      src={videoUrl}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        backgroundColor: "#000",
      }}
      playsInline
      preload="metadata"
      crossOrigin="anonymous"
      controls
      onEnded={onEnded}
      onPlay={onPlay}
      onPause={onPause}
    />
  );
};

/* ================================================================ */
/* NATIVE VIDEO COMPONENT                                           */
/* ================================================================ */

interface NativeVideoPlayerProps {
  videoUrl: string;
  onStarted: () => void;
  onEnded: () => void;
  hasStarted: boolean;
  hasFinished: boolean;
  onReplay: () => void;
}

const NativeVideoPlayer = ({
  videoUrl,
  onStarted,
  onEnded,
  hasStarted,
  hasFinished,
  onReplay,
}: NativeVideoPlayerProps) => {
  // Create the video player
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.muted = false;
  });

  // Track playing state
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });

  // Track when video ends
  useEffect(() => {
    const subscription = player.addListener("playToEnd", () => {
      onEnded();
    });
    return () => subscription.remove();
  }, [player, onEnded]);

  // Handle initial play
  const handlePlay = useCallback(() => {
    player.play();
    onStarted();
  }, [player, onStarted]);

  // Handle replay
  const handleReplay = useCallback(() => {
    player.currentTime = 0;
    player.play();
    onReplay();
  }, [player, onReplay]);

  return (
    <>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={hasStarted}
        allowsFullscreen
        allowsPictureInPicture
      />

      {/* Initial Play Button Overlay - only before video starts */}
      {!hasStarted && (
        <TouchableOpacity
          style={styles.videoOverlay}
          onPress={handlePlay}
          activeOpacity={0.9}
        >
          <View style={styles.videoPlayButton}>
            <Ionicons name="play" size={56} color="#FFF" />
          </View>
        </TouchableOpacity>
      )}

      {/* Replay Button - only after video ends and not currently playing */}
      {hasFinished && !isPlaying && (
        <TouchableOpacity style={styles.replayButton} onPress={handleReplay}>
          <Ionicons name="refresh" size={18} color="#FFF" />
          <Text style={styles.replayText}>Replay</Text>
        </TouchableOpacity>
      )}
    </>
  );
};

/* ================================================================ */
/* MAIN EXPORT COMPONENT                                            */
/* ================================================================ */

interface VideoPostItemProps {
  videoUrl: string;
  videoDuration?: number;
}

export default function VideoPostItem({
  videoUrl,
  videoDuration,
}: VideoPostItemProps) {
  // Track video state
  const [hasStarted, setHasStarted] = useState(false);
  const [hasFinished, setHasFinished] = useState(false);

  const handleStarted = useCallback(() => {
    setHasStarted(true);
    setHasFinished(false);
  }, []);

  const handleEnded = useCallback(() => {
    setHasFinished(true);
  }, []);

  const handleReplay = useCallback(() => {
    setHasFinished(false);
  }, []);

  // Web handlers
  const handleWebPlay = useCallback(() => {
    setHasStarted(true);
    setHasFinished(false);
  }, []);

  const handleWebPause = useCallback(() => {
    // Could track pause state if needed
  }, []);

  const handleWebEnded = useCallback(() => {
    setHasFinished(true);
  }, []);

  return (
    <View style={styles.videoContainer}>
      {Platform.OS === "web" ? (
        <WebVideoPlayer
          videoUrl={videoUrl}
          onEnded={handleWebEnded}
          onPlay={handleWebPlay}
          onPause={handleWebPause}
        />
      ) : (
        <NativeVideoPlayer
          videoUrl={videoUrl}
          onStarted={handleStarted}
          onEnded={handleEnded}
          hasStarted={hasStarted}
          hasFinished={hasFinished}
          onReplay={handleReplay}
        />
      )}

      {/* VIDEO Badge */}
      <View style={styles.videoBadge}>
        <Ionicons name="videocam" size={16} color="#FFF" />
        <Text style={styles.videoBadgeText}>VIDEO</Text>
      </View>

      {/* Duration Badge */}
      {videoDuration && (
        <View style={styles.videoDurationBadge}>
          <Ionicons name="time-outline" size={12} color="#FFF" />
          <Text style={styles.videoDurationText}>
            {Math.round(videoDuration)}s
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
  videoContainer: {
    width: "100%",
    height: 300,
    backgroundColor: "#000",
    position: "relative",
  },

  video: {
    width: "100%",
    height: "100%",
  },

  videoBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(13, 92, 58, 0.95)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },

  videoBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  videoDurationBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },

  videoDurationText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },

  videoOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },

  videoPlayButton: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(13, 92, 58, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },

  replayButton: {
    position: "absolute",
    bottom: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(13, 92, 58, 0.95)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },

  replayText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
});