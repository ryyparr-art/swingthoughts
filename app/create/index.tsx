/**
 * Create Thought Screen
 * 
 * Orchestrator that wires together:
 * - mediaHandlers (pick, compress)
 * - autocompleteHandlers (search mentions/hashtags)
 * - postBuilder (upload, extract tags, submit)
 * - editLoader (load existing post for editing)
 * - UI components (MediaSection, ContentInput, TypeSelector, CropModal, PollBuilder)
 */

import { auth, db } from "@/constants/firebaseConfig";
import { POST_TYPES } from "@/constants/postTypes";
import { useNewPost } from "@/contexts/NewPostContext";
import {
  checkRateLimit,
  EMAIL_VERIFICATION_MESSAGE,
  getRateLimitMessage,
  isEmailVerified,
  updateRateLimitTimestamp,
} from "@/utils/rateLimitHelpers";
import { soundPlayer } from "@/utils/soundPlayer";

import { AVPlaybackStatus, Video } from "expo-av";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";

// UI Components
import ContentInput from "@/components/create-thought/ContentInput";
import CropModal from "@/components/create-thought/CropModal";
import MediaSection from "@/components/create-thought/MediaSection";
import type { PollData } from "@/components/create-thought/PollBuilder";
import PollBuilder from "@/components/create-thought/PollBuilder";
import TypeSelector from "@/components/create-thought/TypeSelector";
import {
  AutocompleteItem,
  canWrite,
  MAX_VIDEO_DURATION,
  Partner,
  PendingImage,
} from "@/components/create-thought/types";

// Extracted utilities
import {
  cleanupRemovedTags,
  parseTrigger,
  searchHashtags,
  searchMentions,
} from "@/utils/create-thought/autocompleteHandlers";
import { loadPostForEdit } from "@/utils/create-thought/editLoader";
import {
  compressImage,
  pickImages,
  pickMoreImages,
  pickVideo,
} from "@/utils/create-thought/mediaHandlers";
import {
  buildOptimisticPost,
  buildPostData,
  extractHashtagsFromContent,
  extractMentionsFromContent,
  submitPost,
  uploadImages,
  uploadVideo,
} from "@/utils/create-thought/postBuilder";

/* ======================================================================== */
/* MAIN COMPONENT                                                           */
/* ======================================================================== */

export default function CreateScreen() {
  const router = useRouter();
  const { editId } = useLocalSearchParams();
  const { setPendingPost } = useNewPost();

  /* ---------------------------------------------------------------- */
  /* STATE                                                            */
  /* ---------------------------------------------------------------- */

  // Post content
  const [selectedType, setSelectedType] = useState("swing-thought");
  const [content, setContent] = useState("");

  // Media
  const [mediaType, setMediaType] = useState<"images" | "video" | null>(null);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoThumbnailUri, setVideoThumbnailUri] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);
  const [mediaAspectRatio, setMediaAspectRatio] = useState<number | null>(null);

  // Cropping (CropModal handles its own zoom/pan state internally)
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [currentCropIndex, setCurrentCropIndex] = useState(0);
  const [showCropModal, setShowCropModal] = useState(false);

  // Video trimming
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(30);
  const [showVideoTrimmer, setShowVideoTrimmer] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);

  // Refs
  const videoRef = useRef<Video>(null);
  const textInputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialLoadRef = useRef(false);

  // Keep trim bounds in refs for playback status callback
  const trimStartRef = useRef(trimStart);
  const trimEndRef = useRef(trimEnd);
  useEffect(() => { trimStartRef.current = trimStart; }, [trimStart]);
  useEffect(() => { trimEndRef.current = trimEnd; }, [trimEnd]);

  // User data
  const [userData, setUserData] = useState<any>(null);
  const writable = canWrite(userData);
  const [allPartners, setAllPartners] = useState<Partner[]>([]);

  // Autocomplete
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteType, setAutocompleteType] = useState<"mention" | "hashtag" | null>(null);
  const [autocompleteResults, setAutocompleteResults] = useState<AutocompleteItem[]>([]);
  const [currentSearchText, setCurrentSearchText] = useState("");
  const [activeTriggerIndex, setActiveTriggerIndex] = useState<number>(-1);

  // Tags
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [selectedTournaments, setSelectedTournaments] = useState<string[]>([]);
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);

  // Edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [originalPostData, setOriginalPostData] = useState<any>(null);

  // Image carousel
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Poll
  const [pollData, setPollData] = useState<PollData>({
    question: "",
    options: ["Yes", "No"],
  });

  /* ---------------------------------------------------------------- */
  /* LOAD USER DATA                                                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const loadUser = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) return;

      setUserData(snap.data());
      const partners = snap.data()?.partners || [];

      if (Array.isArray(partners) && partners.length > 0) {
        const partnerDocs = await Promise.all(
          partners.map((id: string) => getDoc(doc(db, "users", id)))
        );
        setAllPartners(
          partnerDocs
            .filter((d) => d.exists())
            .map((d) => ({ userId: d.id, displayName: d.data()?.displayName || "Unknown" }))
        );
      }
    };
    loadUser();
  }, []);

  /* ---------------------------------------------------------------- */
  /* LOAD POST FOR EDITING                                            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!editId || typeof editId !== "string") return;

    const load = async () => {
      const data = await loadPostForEdit(editId);
      if (!data) {
        soundPlayer.play("error");
        Alert.alert("Error", "Post not found or you don't have permission.");
        router.back();
        return;
      }

      isInitialLoadRef.current = true;
      setIsEditMode(true);
      setEditingPostId(editId);
      setOriginalPostData(data.originalPostData);

      // Media
      setMediaType(data.mediaType);
      setImageUris(data.imageUris);
      setVideoUri(data.videoUri);
      setVideoThumbnailUri(data.videoThumbnailUri);
      setVideoDuration(data.videoDuration);
      setTrimStart(data.trimStart);
      setTrimEnd(data.trimEnd);
      setShowVideoTrimmer(data.showVideoTrimmer);
      setMediaAspectRatio(data.mediaAspectRatio);

      // Tags
      setSelectedMentions(data.selectedMentions);
      setSelectedTournaments(data.selectedTournaments);
      setSelectedLeagues(data.selectedLeagues);

      // Poll
      if (data.pollData) {
        setPollData(data.pollData);
      }

      // Content LAST so cleanup doesn't remove tags
      setContent(data.content);
      setSelectedType(data.postType);

      setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 100);
    };
    load();
  }, [editId]);

  /* ---------------------------------------------------------------- */
  /* POST TYPE SELECTION                                              */
  /* ---------------------------------------------------------------- */

  const availableTypes = (() => {
    if (!userData?.userType) return POST_TYPES.golfer;
    if (userData.userType === "PGA Professional") return POST_TYPES.pro;
    if (userData.userType === "Course") return POST_TYPES.course;
    return POST_TYPES.golfer;
  })();

  /* ---------------------------------------------------------------- */
  /* MEDIA HANDLERS                                                   */
  /* ---------------------------------------------------------------- */

  const handleAddMedia = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Add Media", "Choose what to add", [
      { text: "📷 Photos (up to 3)", onPress: handlePickImages },
      { text: `🎥 Video (${MAX_VIDEO_DURATION}s max)`, onPress: handlePickVideo },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handlePickImages = async () => {
    const result = await pickImages();
    if (result) {
      setPendingImages(result.pending);
      setCurrentCropIndex(0);
      setShowCropModal(true);
    }
  };

  const handlePickVideo = async () => {
    setIsProcessingMedia(true);
    const result = await pickVideo();
    if (result) {
      setVideoDuration(result.durationSeconds);
      setVideoUri(result.videoUri);
      setVideoThumbnailUri(result.thumbnailUri);
      setMediaType("video");
      setImageUris([]);
      setIsVideoPlaying(false);
      setCurrentVideoTime(0);
      setTrimStart(0);
      setTrimEnd(Math.min(result.durationSeconds, MAX_VIDEO_DURATION));
      setShowVideoTrimmer(true);
      setMediaAspectRatio(result.videoWidth / result.videoHeight);
    }
    setIsProcessingMedia(false);
  };

  const handleAddMoreImages = async () => {
    const result = await pickMoreImages(imageUris.length);
    if (result) {
      setPendingImages(result.pending);
      setCurrentCropIndex(0);
      setShowCropModal(true);
    }
  };

  const handleRemoveImage = (index: number) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newUris = imageUris.filter((_, i) => i !== index);
    setImageUris(newUris);
    if (newUris.length === 0) {
      setMediaType(null);
      setMediaAspectRatio(null);
    }
    if (currentImageIndex >= newUris.length) {
      setCurrentImageIndex(Math.max(0, newUris.length - 1));
    }
  };

  const handleRemoveVideo = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVideoUri(null);
    setVideoThumbnailUri(null);
    setMediaType(null);
    setShowVideoTrimmer(false);
    setIsVideoPlaying(false);
    setCurrentVideoTime(0);
    setMediaAspectRatio(null);
  };

  /* ---------------------------------------------------------------- */
  /* CROP HANDLERS (new: CropModal does the cropping internally)      */
  /* ---------------------------------------------------------------- */

  const handleCropComplete = (croppedUri: string) => {
    const newImageUris = [...imageUris, croppedUri];
    setImageUris(newImageUris);

    if (newImageUris.length === 1) {
      setMediaAspectRatio(1.0);
    }

    if (currentCropIndex < pendingImages.length - 1) {
      setCurrentCropIndex(currentCropIndex + 1);
    } else {
      setShowCropModal(false);
      setPendingImages([]);
      setCurrentCropIndex(0);
      setMediaType("images");
      soundPlayer.play("postThought");
    }
  };

  const handleSkipCrop = async () => {
    if (currentCropIndex >= pendingImages.length) return;

    try {
      setIsProcessingMedia(true);
      const pending = pendingImages[currentCropIndex];
      const compressed = await compressImage(pending.uri);
      const newImageUris = [...imageUris, compressed];
      setImageUris(newImageUris);

      if (newImageUris.length === 1) {
        setMediaAspectRatio(pending.width / pending.height);
      }

      if (currentCropIndex < pendingImages.length - 1) {
        setCurrentCropIndex(currentCropIndex + 1);
      } else {
        setShowCropModal(false);
        setPendingImages([]);
        setCurrentCropIndex(0);
        setMediaType("images");
        soundPlayer.play("postThought");
      }
    } catch (error) {
      console.error("Skip crop error:", error);
    } finally {
      setIsProcessingMedia(false);
    }
  };

  const handleCancelCrop = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCropModal(false);
    setPendingImages([]);
    setCurrentCropIndex(0);
  };

  /* ---------------------------------------------------------------- */
  /* VIDEO PLAYBACK & TRIM                                            */
  /* ---------------------------------------------------------------- */

  /** Track playback position for the filmstrip playhead + loop within trim range */
  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    const posSeconds = (status.positionMillis || 0) / 1000;
    setCurrentVideoTime(posSeconds);

    // Loop within trim range
    if (posSeconds >= trimEndRef.current) {
      videoRef.current?.setPositionAsync(trimStartRef.current * 1000);
    }
  }, []);

  const toggleVideoPlayback = async () => {
    if (!videoRef.current) return;
    if (isVideoPlaying) {
      await videoRef.current.pauseAsync();
      setIsVideoPlaying(false);
    } else {
      // Start from trim start if outside range
      const status = await videoRef.current.getStatusAsync();
      if (status.isLoaded) {
        const pos = (status.positionMillis || 0) / 1000;
        if (pos < trimStart || pos >= trimEnd) {
          await videoRef.current.setPositionAsync(trimStart * 1000);
        }
      }
      await videoRef.current.playAsync();
      setIsVideoPlaying(true);
    }
  };

  /** Combined trim change handler from filmstrip trimmer */
  const handleTrimChange = useCallback((start: number, end: number) => {
    setTrimStart(start);
    setTrimEnd(end);
  }, []);

  /** Seek video to a specific position (called when handle drag ends) */
  const handleSeekToPosition = useCallback(async (seconds: number) => {
    if (videoRef.current) {
      await videoRef.current.setPositionAsync(seconds * 1000);
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /* AUTOCOMPLETE                                                     */
  /* ---------------------------------------------------------------- */

  const handleContentChange = useCallback(
    (text: string) => {
      setContent(text);

      // Clean up removed tags (skip during initial edit load)
      if (!isInitialLoadRef.current) {
        const cleaned = cleanupRemovedTags(text, {
          selectedMentions,
          selectedTournaments,
          selectedLeagues,
        });
        if (cleaned.changed) {
          setSelectedMentions(cleaned.mentions);
          setSelectedTournaments(cleaned.tournaments);
          setSelectedLeagues(cleaned.leagues);
        }
      }

      // Parse trigger — now returns triggerIndex
      const trigger = parseTrigger(text);
      if (!trigger.type) {
        setShowAutocomplete(false);
        setActiveTriggerIndex(-1);
        return;
      }

      setCurrentSearchText(trigger.searchText);
      setActiveTriggerIndex(trigger.triggerIndex);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        let results: AutocompleteItem[] = [];
        if (trigger.type === "mention") {
          setAutocompleteType("mention");
          results = await searchMentions(trigger.searchText, allPartners);
        } else {
          setAutocompleteType("hashtag");
          results = await searchHashtags(trigger.searchText);
        }

        if (results.length > 0) {
          setAutocompleteResults(results);
          setShowAutocomplete(true);
        } else {
          setShowAutocomplete(false);
        }
      }, 300);
    },
    [selectedMentions, selectedTournaments, selectedLeagues, allPartners]
  );

  const handleSelectAutocomplete = async (item: AutocompleteItem) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (autocompleteType === "mention") {
      // Clean replace: slice to trigger position, append tag + trailing space
      const idx = activeTriggerIndex >= 0 ? activeTriggerIndex : content.lastIndexOf("@");
      const beforeTrigger = content.slice(0, idx);

      let mentionText = "";
      if (item.type === "partner") {
        mentionText = `@${item.displayName}`;
      } else if (item.type === "course") {
        mentionText = `@${item.courseName}`;

        // Cache course to Firestore
        try {
          const courseQuery = query(collection(db, "courses"), where("id", "==", item.courseId));
          const courseSnap = await getDocs(courseQuery);
          if (courseSnap.empty) {
            await addDoc(collection(db, "courses"), {
              id: item.courseId,
              course_name: item.courseName,
              location: item.location
                ? { city: item.location.split(", ")[0], state: item.location.split(", ")[1] }
                : null,
            });
          }
        } catch (err) {
          console.error("Error caching course:", err);
        }
      }

      setContent(`${beforeTrigger}${mentionText} `);
      if (mentionText && !selectedMentions.includes(mentionText)) {
        setSelectedMentions([...selectedMentions, mentionText]);
      }
    } else if (autocompleteType === "hashtag") {
      // Clean replace: slice to trigger position, append tag + trailing space
      const idx = activeTriggerIndex >= 0 ? activeTriggerIndex : content.lastIndexOf("#");
      const beforeTrigger = content.slice(0, idx);
      const hashtagText = `#${item.name}`;

      setContent(`${beforeTrigger}${hashtagText} `);

      if (item.type === "tournament") {
        if (!selectedTournaments.includes(hashtagText)) {
          setSelectedTournaments([...selectedTournaments, hashtagText]);
        }
      } else if (item.type === "league") {
        if (!selectedLeagues.includes(hashtagText)) {
          setSelectedLeagues([...selectedLeagues, hashtagText]);
        }
      }
    }

    setShowAutocomplete(false);
    setActiveTriggerIndex(-1);
    setCurrentSearchText("");
  };

  /* ---------------------------------------------------------------- */
  /* NAVIGATION                                                       */
  /* ---------------------------------------------------------------- */

  const handleClose = async () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const hasUnsavedChanges =
      content.trim() ||
      imageUris.length > 0 ||
      videoUri ||
      (selectedType === "poll" && pollData.question.trim());

    if (hasUnsavedChanges) {
      const shouldDiscard = await new Promise<boolean>((resolve) => {
        Alert.alert("Discard Thought?", "You have unsaved changes.", [
          { text: "Keep Editing", style: "cancel", onPress: () => resolve(false) },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              soundPlayer.play("error");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              resolve(true);
            },
          },
        ]);
      });
      if (shouldDiscard) router.back();
    } else {
      router.back();
    }
  };

  const handleDelete = async () => {
    if (!editingPostId) return;
    soundPlayer.play("click");

    const shouldDelete = await new Promise<boolean>((resolve) => {
      if (Platform.OS === "web") {
        resolve(window.confirm("Delete this post permanently?"));
      } else {
        Alert.alert("Delete Post", "This cannot be undone.", [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              soundPlayer.play("error");
              resolve(true);
            },
          },
        ]);
      }
    });

    if (!shouldDelete) return;

    try {
      setIsPosting(true);
      await deleteDoc(doc(db, "thoughts", editingPostId));
      setPendingPost({ type: "delete", postId: editingPostId });
      soundPlayer.play("dart");
      Alert.alert("Deleted 🗑️", "Your thought has been deleted.");
      router.back();
    } catch (err) {
      console.error("Delete error:", err);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to delete post.");
      setIsPosting(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* POST / SUBMIT                                                    */
  /* ---------------------------------------------------------------- */

  const handlePost = async () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Validation
    const emailVerified = await isEmailVerified();
    if (!emailVerified) {
      soundPlayer.play("error");
      Alert.alert("Email Not Verified", EMAIL_VERIFICATION_MESSAGE);
      return;
    }

    if (!isEditMode) {
      const { allowed, remainingSeconds } = await checkRateLimit("post");
      if (!allowed) {
        soundPlayer.play("error");
        Alert.alert("Please Wait", getRateLimitMessage("post", remainingSeconds));
        return;
      }
    }

    if (!writable) {
      soundPlayer.play("error");
      Alert.alert("Verification Pending", "Posting unlocks once your account is verified.");
      return;
    }

    // Poll-specific validation
    if (selectedType === "poll") {
      if (!pollData.question.trim()) {
        soundPlayer.play("error");
        Alert.alert("Missing Question", "Please add a poll question.");
        return;
      }
      const filledOptions = pollData.options.filter((o) => o.trim());
      if (filledOptions.length < 2) {
        soundPlayer.play("error");
        Alert.alert("Need Options", "Please add at least 2 poll options.");
        return;
      }
    }

    // Content is required for non-poll types; optional for polls
    if (!content.trim() && selectedType !== "poll") {
      soundPlayer.play("error");
      Alert.alert("Empty Post", "Please add some content.");
      return;
    }

    setIsPosting(true);

    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("No user");

      // Upload media
      let uploadedImageUrls: string[] = [];
      let uploadedVideoUrl: string | null = null;
      let uploadedThumbnailUrl: string | null = null;

      if (mediaType === "images" && imageUris.length > 0) {
        uploadedImageUrls = await uploadImages(imageUris, uid);
      }
      if (mediaType === "video" && videoUri) {
        const videoResult = await uploadVideo(videoUri, videoThumbnailUri, uid);
        uploadedVideoUrl = videoResult.videoUrl;
        uploadedThumbnailUrl = videoResult.thumbnailUrl;
      }

      // Extract tags
      const { partners, courses } = await extractMentionsFromContent(content, allPartners);
      const { tournaments, leagues } = await extractHashtagsFromContent(content);

      // Build post data
      const { postData, userData: currentUserData } = await buildPostData({
        content,
        selectedType,
        mediaType,
        uploadedImageUrls,
        uploadedVideoUrl,
        uploadedThumbnailUrl,
        videoDuration,
        trimStart,
        trimEnd,
        extractedPartners: partners,
        extractedCourses: courses,
        extractedTournaments: tournaments,
        extractedLeagues: leagues,
        mediaAspectRatio: mediaAspectRatio || undefined,
        pollData: selectedType === "poll" ? pollData : undefined,
      });

      // Submit
      const { postId, isNew } = await submitPost(postData, isEditMode ? editingPostId : null);

      // Rate limit (new posts only)
      if (isNew) await updateRateLimitTimestamp("post");

      // Optimistic UI update
      const optimisticPost = buildOptimisticPost(
        postId,
        postData,
        currentUserData,
        isEditMode ? originalPostData : undefined
      );
      setPendingPost({
        type: isEditMode ? "edit" : "create",
        post: optimisticPost,
      });

      soundPlayer.play("postThought");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert(
        isEditMode ? "Updated ✏️" : "Tee'd Up ⛳️",
        isEditMode ? "Your thought has been updated." : "Your thought has been published."
      );
      router.back();
    } catch (err) {
      console.error("Post error:", err);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to post. Please try again.");
      setIsPosting(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* RENDER                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <Image
            source={require("@/assets/icons/Close.png")}
            style={styles.closeIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>{isEditMode ? "Edit Thought" : "Create Thought"}</Text>

        <View style={styles.headerRightButtons}>
          {isEditMode && (
            <TouchableOpacity onPress={handleDelete} disabled={isPosting} style={styles.deleteButton}>
              <Text style={styles.deleteIcon}>🗑️</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handlePost}
            disabled={!writable || isPosting}
            style={[styles.postButton, (!writable || isPosting) && styles.postButtonDisabled]}
          >
            <Text style={styles.flagIcon}>{isEditMode ? "✏️" : "⛳"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Lock Banner */}
      {!writable && (
        <View style={styles.lockBanner}>
          <Text style={styles.lockText}>Posting unlocks once verification is approved.</Text>
        </View>
      )}

      {/* Content */}
      <KeyboardAwareScrollView
        style={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        extraScrollHeight={Platform.OS === "ios" ? 150 : 80}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <MediaSection
          mediaType={mediaType}
          imageUris={imageUris}
          videoUri={videoUri}
          isProcessingMedia={isProcessingMedia}
          showCropModal={showCropModal}
          writable={writable}
          videoRef={videoRef}
          videoDuration={videoDuration}
          trimStart={trimStart}
          trimEnd={trimEnd}
          showVideoTrimmer={showVideoTrimmer}
          isVideoPlaying={isVideoPlaying}
          currentVideoTime={currentVideoTime}
          currentImageIndex={currentImageIndex}
          setCurrentImageIndex={setCurrentImageIndex}
          onAddMedia={handleAddMedia}
          onAddMoreImages={handleAddMoreImages}
          onRemoveImage={handleRemoveImage}
          onRemoveVideo={handleRemoveVideo}
          onToggleVideoPlayback={toggleVideoPlayback}
          onTrimChange={handleTrimChange}
          onSeekToPosition={handleSeekToPosition}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        />

        <TypeSelector
          availableTypes={availableTypes}
          selectedType={selectedType}
          onSelectType={setSelectedType}
        />

        {/* Poll Builder - only visible when poll type selected */}
        {selectedType === "poll" && (
          <PollBuilder
            pollData={pollData}
            onPollDataChange={setPollData}
            writable={writable}
          />
        )}

        <ContentInput
          content={content}
          onContentChange={handleContentChange}
          writable={writable}
          textInputRef={textInputRef}
          showAutocomplete={showAutocomplete}
          autocompleteResults={autocompleteResults}
          onSelectAutocomplete={handleSelectAutocomplete}
          selectedMentions={selectedMentions}
          selectedTournaments={selectedTournaments}
          selectedLeagues={selectedLeagues}
        />
      </KeyboardAwareScrollView>

      {/* Crop Modal - pinch-to-zoom with square mask */}
      <CropModal
        visible={showCropModal}
        pendingImages={pendingImages}
        currentCropIndex={currentCropIndex}
        isProcessingMedia={isProcessingMedia}
        onCropComplete={handleCropComplete}
        onSkipCrop={handleSkipCrop}
        onCancel={handleCancelCrop}
      />
    </SafeAreaView>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: { width: 40, alignItems: "flex-start" },
  closeIcon: { width: 28, height: 28, tintColor: "#FFFFFF" },
  headerTitle: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 18,
    flex: 1,
    textAlign: "center",
  },
  headerRightButtons: { flexDirection: "row", alignItems: "center", gap: 8 },
  deleteButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  deleteIcon: { fontSize: 22 },
  postButton: {
    width: 44,
    height: 44,
    backgroundColor: "#FFD700",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  postButtonDisabled: { opacity: 0.4 },
  flagIcon: { fontSize: 24 },

  lockBanner: {
    backgroundColor: "#FFF3CD",
    borderColor: "#FFECB5",
    borderWidth: 1,
    padding: 12,
    margin: 12,
    borderRadius: 10,
  },
  lockText: { color: "#664D03", textAlign: "center", fontWeight: "600" },

  content: { flex: 1, padding: 16 },
});