/**
 * Video Components for SwingThoughts
 * 
 * Optimized for golf swing analysis:
 * - Clean thumbnail with dynamic aspect ratio (Instagram-style)
 * - Quick-fading controls
 * - Speed controls (0.25x, 0.5x, 1x)
 * - Frame stepping for swing breakdown
 * - Real-time scrub preview
 * 
 * AUDIO FIX: The FullscreenVideoPlayer now properly manages audio sessions
 * to prevent sounds from bugging out when video starts/stops playing.
 */

import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import * as Haptics from "expo-haptics";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { soundPlayer } from "@/utils/soundPlayer";

const SCREEN_WIDTH = Dimensions.get("window").width;

/* ==================================================================
   IN-FEED VIDEO THUMBNAIL
   Clean design that doesn't obscure the content
   Dynamic height based on mediaAspectRatio
   ================================================================== */
interface VideoThumbnailProps {
  videoUrl: string;
  thumbnailUrl?: string;
  videoDuration?: number;
  mediaHeight?: number;
  onPress: () => void;
}

export const VideoThumbnail = ({
  videoUrl,
  thumbnailUrl,
  videoDuration,
  mediaHeight = 300,
  onPress,
}: VideoThumbnailProps) => {
  const handlePress = () => {
    // NOTE: Don't play click sound here - we're about to open video
    // The soundPlayer will be disabled once video starts
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
  };

  return (
    <TouchableOpacity activeOpacity={0.95} onPress={handlePress}>
      <View style={[thumbnailStyles.container, { height: mediaHeight }]}>
        {/* Thumbnail Image */}
        {thumbnailUrl ? (
          <Image
            source={{ uri: thumbnailUrl }}
            style={{ width: "100%", height: mediaHeight }}
            resizeMode="cover"
          />
        ) : (
          <View style={[thumbnailStyles.placeholderBg, { width: "100%", height: mediaHeight }]}>
            <Ionicons name="videocam" size={48} color="#666" />
          </View>
        )}

        {/* Top badges row */}
        <View style={thumbnailStyles.topRow}>
          {/* Video indicator - small and subtle */}
          <View style={thumbnailStyles.videoBadge}>
            <Ionicons name="videocam" size={12} color="#FFF" />
          </View>

          {/* Duration badge */}
          {videoDuration && (
            <View style={thumbnailStyles.durationBadge}>
              <Text style={thumbnailStyles.durationText}>
                {formatDuration(videoDuration)}
              </Text>
            </View>
          )}
        </View>

        {/* Subtle play hint - bottom corner, semi-transparent */}
        <View style={thumbnailStyles.playHint}>
          <Ionicons name="play" size={14} color="#FFF" />
          <Text style={thumbnailStyles.playHintText}>Tap to play</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

/* ==================================================================
   FULLSCREEN VIDEO PLAYER
   Optimized for swing analysis with speed controls
   ================================================================== */
interface FullscreenVideoPlayerProps {
  videoUrl: string;
  trimStart?: number;
  trimEnd?: number;
  duration?: number;
  onClose: () => void;
}

export const FullscreenVideoPlayer = ({
  videoUrl,
  trimStart = 0,
  trimEnd,
  duration = 30,
  onClose,
}: FullscreenVideoPlayerProps) => {
  const effectiveDuration = (trimEnd || duration) - trimStart;
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [showControls, setShowControls] = useState(false); // Start hidden
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const positionRef = useRef(0);
  const playerRef = useRef<any>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ============================================
  // AUDIO SESSION MANAGEMENT
  // Disable sounds while video is playing to prevent audio conflicts
  // ============================================
  useEffect(() => {
    // Tell soundPlayer that video is starting
    soundPlayer.prepareForVideo();
    console.log("🎬 Video modal opened - sounds disabled");

    return () => {
      // Tell soundPlayer that video has stopped
      soundPlayer.resumeAfterVideo();
      console.log("🎬 Video modal closed - sounds re-enabled");
    };
  }, []);

  // Create video player
  const player = useVideoPlayer(videoUrl, (p) => {
    playerRef.current = p;
    p.currentTime = trimStart;
    p.loop = false;
    p.muted = false;
    p.play();
  });

  // Track position
  useEffect(() => {
    if (!player || isSeeking) return;

    const interval = setInterval(() => {
      try {
        if (player.currentTime !== undefined) {
          const pos = player.currentTime;
          positionRef.current = pos;
          setCurrentPosition(pos - trimStart);

          const endTime = trimEnd || duration;
          if (pos >= endTime && isPlaying) {
            player.pause();
            setIsPlaying(false);
            setShowControls(true); // Show controls when video ends
          }
        }
      } catch (e) {
        // Player disposed
      }
    }, 100); // Faster updates for smoother scrubbing

    return () => clearInterval(interval);
  }, [player, trimStart, trimEnd, duration, isSeeking, isPlaying]);

  // Track playing state
  useEffect(() => {
    if (!player) return;

    const checkPlaying = setInterval(() => {
      try {
        setIsPlaying(player.playing);
      } catch (e) {
        // Player disposed
      }
    }, 250);

    return () => clearInterval(checkPlaying);
  }, [player]);

  // Auto-hide controls - faster fade (1.5s)
  useEffect(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    if (showControls && isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 1500); // 1.5 seconds - much faster
    }

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls, isPlaying]);

  const handlePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      if (player.playing) {
        player.pause();
        setIsPlaying(false);
        setShowControls(true); // Show controls when paused
      } else {
        const endTime = trimEnd || duration;
        if (player.currentTime >= endTime - 0.5) {
          player.currentTime = trimStart;
          setCurrentPosition(0);
        }
        player.play();
        setIsPlaying(true);
        // Controls will auto-hide via useEffect
      }
    } catch (e) {
      console.error("Play/pause error:", e);
    }
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
    // Pause during seek for better frame viewing
    try {
      player.pause();
    } catch (e) {}
  };

  const handleSeekChange = (value: number) => {
    // Real-time seek preview while dragging
    try {
      const seekPosition = trimStart + value;
      player.currentTime = seekPosition;
      setCurrentPosition(value);
      positionRef.current = seekPosition;
    } catch (e) {}
  };

  const handleSeekComplete = (value: number) => {
    setIsSeeking(false);
    try {
      const seekPosition = trimStart + value;
      player.currentTime = seekPosition;
      setCurrentPosition(value);
      positionRef.current = seekPosition;
      // Don't auto-play after seek - let user control
    } catch (e) {
      console.error("Seek error:", e);
    }
  };

  const handleFrameStep = (direction: "back" | "forward") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      player.pause();
      setIsPlaying(false);
      
      // Step by ~1 frame (assuming 30fps = 0.033s per frame)
      const frameTime = 0.033;
      const step = direction === "forward" ? frameTime : -frameTime;
      const newPosition = Math.max(
        trimStart,
        Math.min(trimEnd || duration, player.currentTime + step)
      );
      
      player.currentTime = newPosition;
      setCurrentPosition(newPosition - trimStart);
      positionRef.current = newPosition;
    } catch (e) {
      console.error("Frame step error:", e);
    }
  };

  const handleSpeedChange = (speed: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlaybackSpeed(speed);
    
    try {
      // expo-video uses playbackRate
      if (player.playbackRate !== undefined) {
        player.playbackRate = speed;
      }
    } catch (e) {
      console.error("Speed change error:", e);
    }
  };

  const handleReplay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      player.currentTime = trimStart;
      setCurrentPosition(0);
      positionRef.current = trimStart;
      player.play();
      setIsPlaying(true);
    } catch (e) {
      console.error("Replay error:", e);
    }
  };

  const toggleMute = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      player.muted = newMuted;
    } catch (e) {
      console.error("Mute error:", e);
    }
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      player.pause();
    } catch (e) {}
    
    // onClose will trigger the useEffect cleanup which calls resumeAfterVideo()
    onClose();
  };

  const handleScreenTap = () => {
    if (showControls) {
      // If controls visible, tap toggles play/pause
      handlePlayPause();
    } else {
      // If controls hidden, show them
      setShowControls(true);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(Math.max(0, seconds) / 60);
    const secs = Math.floor(Math.max(0, seconds) % 60);
    const ms = Math.floor((Math.max(0, seconds) % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
  };

  const isAtEnd = currentPosition >= effectiveDuration - 0.5;

  return (
    <Modal visible={true} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={fullscreenStyles.backdrop}>
        {/* Close button - always visible */}
        <TouchableOpacity style={fullscreenStyles.closeButton} onPress={handleClose}>
          <Ionicons name="close" size={28} color="#FFF" />
        </TouchableOpacity>

        {/* Mute button - always visible */}
        <TouchableOpacity style={fullscreenStyles.muteButton} onPress={toggleMute}>
          <Ionicons
            name={isMuted ? "volume-mute" : "volume-high"}
            size={22}
            color="#FFF"
          />
        </TouchableOpacity>

        {/* Video Player */}
        <TouchableOpacity
          style={fullscreenStyles.videoContainer}
          activeOpacity={1}
          onPress={handleScreenTap}
        >
          {Platform.OS === "web" ? (
            <WebFullscreenVideo
              videoUrl={videoUrl}
              trimStart={trimStart}
              trimEnd={trimEnd}
              duration={duration}
              muted={isMuted}
              playbackSpeed={playbackSpeed}
              onPlayingChange={setIsPlaying}
              onPositionChange={(pos) => setCurrentPosition(pos - trimStart)}
              onEnded={() => {
                setIsPlaying(false);
                setShowControls(true);
              }}
            />
          ) : (
            <VideoView
              player={player}
              style={fullscreenStyles.video}
              contentFit="contain"
              nativeControls={false}
            />
          )}
        </TouchableOpacity>

        {/* Bottom controls panel */}
        {showControls && (
          <View style={fullscreenStyles.controlsPanel}>
            {/* Progress bar with time */}
            <View style={fullscreenStyles.progressRow}>
              <Text style={fullscreenStyles.timeText}>{formatTime(currentPosition)}</Text>
              <Slider
                style={fullscreenStyles.slider}
                minimumValue={0}
                maximumValue={effectiveDuration}
                value={Math.min(currentPosition, effectiveDuration)}
                onSlidingStart={handleSeekStart}
                onValueChange={handleSeekChange}
                onSlidingComplete={handleSeekComplete}
                minimumTrackTintColor="#FFD700"
                maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
                thumbTintColor="#FFD700"
              />
              <Text style={fullscreenStyles.timeText}>{formatTime(effectiveDuration)}</Text>
            </View>

            {/* Playback controls row */}
            <View style={fullscreenStyles.controlsRow}>
              {/* Frame step buttons */}
              <View style={fullscreenStyles.frameControls}>
                <TouchableOpacity
                  style={fullscreenStyles.frameButton}
                  onPress={() => handleFrameStep("back")}
                >
                  <Ionicons name="play-back" size={18} color="#FFF" />
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={fullscreenStyles.playPauseButton}
                  onPress={handlePlayPause}
                >
                  <Ionicons
                    name={isAtEnd ? "refresh" : isPlaying ? "pause" : "play"}
                    size={24}
                    color="#FFF"
                  />
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={fullscreenStyles.frameButton}
                  onPress={() => handleFrameStep("forward")}
                >
                  <Ionicons name="play-forward" size={18} color="#FFF" />
                </TouchableOpacity>
              </View>

              {/* Speed controls */}
              <View style={fullscreenStyles.speedControls}>
                {[0.25, 0.5, 1].map((speed) => (
                  <TouchableOpacity
                    key={speed}
                    style={[
                      fullscreenStyles.speedButton,
                      playbackSpeed === speed && fullscreenStyles.speedButtonActive,
                    ]}
                    onPress={() => handleSpeedChange(speed)}
                  >
                    <Text
                      style={[
                        fullscreenStyles.speedText,
                        playbackSpeed === speed && fullscreenStyles.speedTextActive,
                      ]}
                    >
                      {speed}x
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Swing analysis hint */}
            <Text style={fullscreenStyles.hintText}>
              Use frame buttons to analyze your swing
            </Text>
          </View>
        )}

        {/* Replay button when at end and controls hidden */}
        {!showControls && isAtEnd && !isPlaying && (
          <TouchableOpacity style={fullscreenStyles.replayFloating} onPress={handleReplay}>
            <Ionicons name="refresh" size={20} color="#FFF" />
            <Text style={fullscreenStyles.replayText}>Replay</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
};

/* ==================================================================
   WEB FULLSCREEN VIDEO (unchanged logic, added speed support)
   ================================================================== */
interface WebFullscreenVideoProps {
  videoUrl: string;
  trimStart: number;
  trimEnd?: number;
  duration: number;
  muted: boolean;
  playbackSpeed: number;
  onPlayingChange: (playing: boolean) => void;
  onPositionChange: (position: number) => void;
  onEnded: () => void;
}

const WebFullscreenVideo = ({
  videoUrl,
  trimStart,
  trimEnd,
  duration,
  muted,
  playbackSpeed,
  onPlayingChange,
  onPositionChange,
  onEnded,
}: WebFullscreenVideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = trimStart;
    video.muted = muted;
    video.playbackRate = playbackSpeed;
    video.play().catch(console.error);

    const handleTimeUpdate = () => {
      const currentTime = video.currentTime;
      onPositionChange(currentTime);

      const endTime = trimEnd || duration;
      if (currentTime >= endTime) {
        video.pause();
        onEnded();
      }
    };

    const handlePlay = () => onPlayingChange(true);
    const handlePause = () => onPlayingChange(false);
    const handleEnded = () => onEnded();

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
    };
  }, [videoUrl, trimStart, trimEnd, duration, onPlayingChange, onPositionChange, onEnded]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  return (
    <video
      ref={videoRef}
      src={videoUrl}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        backgroundColor: "transparent",
      }}
      playsInline
      controls={false}
      crossOrigin="anonymous"
    />
  );
};

/* ==================================================================
   THUMBNAIL STYLES
   ================================================================== */
const thumbnailStyles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "#111",
    position: "relative",
  },
  placeholderBg: {
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },
  topRow: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  videoBadge: {
    backgroundColor: "rgba(13, 92, 58, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  durationBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  durationText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
  },
  // Subtle play hint in bottom-right corner
  playHint: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  playHintText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
    opacity: 0.9,
  },
});

/* ==================================================================
   FULLSCREEN PLAYER STYLES
   ================================================================== */
const fullscreenStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#000",
  },
  closeButton: {
    position: "absolute",
    top: 50,
    right: 16,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 20,
    padding: 10,
    zIndex: 10,
  },
  muteButton: {
    position: "absolute",
    top: 50,
    left: 16,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 20,
    padding: 10,
    zIndex: 10,
  },
  videoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  video: {
    width: "100%",
    height: "100%",
  },

  // Bottom controls panel
  controlsPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  timeText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    minWidth: 50,
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  frameControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  frameButton: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 20,
    padding: 10,
  },
  playPauseButton: {
    backgroundColor: "#0D5C3A",
    borderRadius: 24,
    padding: 12,
    marginHorizontal: 8,
  },
  speedControls: {
    flexDirection: "row",
    gap: 8,
  },
  speedButton: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  speedButtonActive: {
    backgroundColor: "#FFD700",
  },
  speedText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  speedTextActive: {
    color: "#000",
  },
  hintText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 11,
    textAlign: "center",
    marginTop: 4,
  },

  // Floating replay button
  replayFloating: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(13, 92, 58, 0.95)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  replayText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
});