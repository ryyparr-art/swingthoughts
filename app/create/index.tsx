/**
 * Create Thought Screen
 * 
 * Refactored to use modular components while preserving all functionality
 * and data schema. Key fix: Tournaments and Leagues are now tracked separately.
 */

import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { auth, db, storage } from "@/constants/firebaseConfig";
import { POST_TYPES } from "@/constants/postTypes";
import {
  checkRateLimit,
  EMAIL_VERIFICATION_MESSAGE,
  getRateLimitMessage,
  isEmailVerified,
  updateRateLimitTimestamp,
} from "@/utils/rateLimitHelpers";
import { soundPlayer } from "@/utils/soundPlayer";

import { Video } from "expo-av";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as VideoThumbnails from "expo-video-thumbnails";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Video as VideoCompressor } from "react-native-compressor";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";

// Import modular components
import ContentInput from "@/components/create-thought/ContentInput";
import CropModal from "@/components/create-thought/CropModal";
import MediaSection from "@/components/create-thought/MediaSection";
import TypeSelector from "@/components/create-thought/TypeSelector";
import {
  AutocompleteItem,
  canWrite,
  Course,
  encodeGeohash,
  extractHashtags,
  GolfCourse,
  IMAGE_QUALITY,
  MAX_IMAGE_WIDTH,
  MAX_IMAGES,
  MAX_VIDEO_DURATION,
  Partner,
  PendingImage,
  TaggedLeague,
  TaggedTournament
} from "@/components/create-thought/types";

const SCREEN_WIDTH = Dimensions.get("window").width;

/* ======================================================================== */
/* MAIN COMPONENT                                                           */
/* ======================================================================== */

export default function CreateScreen() {
  console.log("🎨 CREATE SCREEN MOUNTED");

  const router = useRouter();
  const { editId } = useLocalSearchParams();

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

  // Image cropping
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [currentCropIndex, setCurrentCropIndex] = useState(0);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropScale, setCropScale] = useState(1);

  // Video trimming
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(30);
  const [showVideoTrimmer, setShowVideoTrimmer] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // Refs
  const videoRef = useRef<Video>(null);
  const textInputRef = useRef<TextInput>(null);

  // User data
  const [userData, setUserData] = useState<any>(null);
  const writable = canWrite(userData);

  // Autocomplete
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteType, setAutocompleteType] = useState<"mention" | "hashtag" | null>(null);
  const [autocompleteResults, setAutocompleteResults] = useState<AutocompleteItem[]>([]);
  const [currentSearchText, setCurrentSearchText] = useState("");

  // Tagged items - FIXED: Separate tournaments and leagues
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [selectedTournaments, setSelectedTournaments] = useState<string[]>([]);
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);

  // Partners list
  const [allPartners, setAllPartners] = useState<Partner[]>([]);

  // Edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  // Debounce
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track initial edit load to prevent tag cleanup
  const isInitialLoadRef = useRef(false);

  // Image carousel
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  /* ---------------------------------------------------------------- */
  /* LOAD USER DATA                                                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const loadUser = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        setUserData(snap.data());

        const partners = snap.data()?.partners || [];

        if (Array.isArray(partners) && partners.length > 0) {
          const partnerDocs = await Promise.all(
            partners.map((partnerId: string) => getDoc(doc(db, "users", partnerId)))
          );

          const partnerList = partnerDocs
            .filter((d) => d.exists())
            .map((d) => ({
              userId: d.id,
              displayName: d.data()?.displayName || "Unknown",
            }));

          setAllPartners(partnerList);
        } else {
          setAllPartners([]);
        }
      }
    };

    loadUser();
  }, []);

  /* ---------------------------------------------------------------- */
  /* LOAD POST FOR EDITING                                            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const loadPostForEdit = async () => {
      if (!editId || typeof editId !== "string") return;

      try {
        const postDoc = await getDoc(doc(db, "thoughts", editId));
        if (!postDoc.exists()) {
          soundPlayer.play("error");
          Alert.alert("Error", "Post not found");
          return;
        }

        const postData = postDoc.data();

        if (postData.userId !== auth.currentUser?.uid) {
          soundPlayer.play("error");
          Alert.alert("Error", "You can only edit your own posts");
          router.back();
          return;
        }

        setIsEditMode(true);
        setEditingPostId(editId);
        
        // Prevent tag cleanup during initial load
        isInitialLoadRef.current = true;

        // Load media
        if (postData.imageUrls && postData.imageUrls.length > 0) {
          setImageUris(postData.imageUrls);
          setMediaType("images");
        } else if (postData.imageUrl) {
          setImageUris([postData.imageUrl]);
          setMediaType("images");
        } else if (postData.videoUrl) {
          setVideoUri(postData.videoUrl);
          setVideoThumbnailUri(postData.videoThumbnailUrl || null);
          setMediaType("video");
          if (postData.videoDuration) {
            setVideoDuration(postData.videoDuration);
            setTrimStart(postData.videoTrimStart || 0);
            setTrimEnd(postData.videoTrimEnd || Math.min(postData.videoDuration, MAX_VIDEO_DURATION));
            setShowVideoTrimmer(true);
          }
        }

        // Load mentions (partners + courses)
        const existingMentions: string[] = [];
        if (postData.taggedPartners) {
          postData.taggedPartners.forEach((p: any) => {
            existingMentions.push(`@${p.displayName}`);
          });
        }
        if (postData.taggedCourses) {
          postData.taggedCourses.forEach((c: any) => {
            existingMentions.push(`@${c.courseName}`);
          });
        }
        setSelectedMentions(existingMentions);

        // Load tournaments - FIXED: Separate from leagues
        const existingTournaments: string[] = [];
        if (postData.taggedTournaments) {
          postData.taggedTournaments.forEach((t: any) => {
            existingTournaments.push(`#${t.name}`);
          });
        }
        setSelectedTournaments(existingTournaments);

        // Load leagues - FIXED: Separate from tournaments
        const existingLeagues: string[] = [];
        if (postData.taggedLeagues) {
          postData.taggedLeagues.forEach((l: any) => {
            existingLeagues.push(`#${l.name}`);
          });
        }
        setSelectedLeagues(existingLeagues);

        // Set content LAST so cleanup doesn't remove tags
        setContent(postData.content || "");
        setSelectedType(postData.postType || "swing-thought");

        // Reset the flag after a short delay to allow state to settle
        setTimeout(() => {
          isInitialLoadRef.current = false;
        }, 100);
      } catch (error) {
        console.error("Error loading post:", error);
        soundPlayer.play("error");
        Alert.alert("Error", "Failed to load post");
      }
    };

    loadPostForEdit();
  }, [editId]);

  /* ---------------------------------------------------------------- */
  /* POST TYPES BY USER                                               */
  /* ---------------------------------------------------------------- */

  const availableTypes = (() => {
    if (!userData?.userType) return POST_TYPES.golfer;

    if (userData.userType === "PGA Professional") return POST_TYPES.pro;
    if (userData.userType === "Course") return POST_TYPES.course;
    return POST_TYPES.golfer;
  })();

  /* ---------------------------------------------------------------- */
  /* IMAGE/VIDEO COMPRESSION                                          */
  /* ---------------------------------------------------------------- */

  const compressImage = async (uri: string): Promise<string> => {
    try {
      console.log("🖼️ Compressing image...");
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_IMAGE_WIDTH } }],
        { compress: IMAGE_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
      );
      console.log("✅ Image compressed");
      return manipResult.uri;
    } catch (error) {
      console.error("Image compression error:", error);
      soundPlayer.play("error");
      return uri;
    }
  };

  const compressVideo = async (uri: string): Promise<string> => {
    try {
      console.log("🎥 Compressing video...");
      const compressedUri = await VideoCompressor.compress(
        uri,
        {
          compressionMethod: "auto",
          maxSize: 1080,
          bitrate: 2000000,
        },
        (progress) => {
          console.log(`📊 Compression progress: ${(progress * 100).toFixed(0)}%`);
        }
      );
      console.log("✅ Video compressed");
      return compressedUri;
    } catch (error) {
      console.error("Video compression error:", error);
      soundPlayer.play("error");
      return uri;
    }
  };

  const generateVideoThumbnail = async (videoUri: string): Promise<string> => {
    try {
      console.log("📸 Generating video thumbnail...");
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: 0,
        quality: 0.8,
      });
      console.log("✅ Thumbnail generated:", uri);
      return uri;
    } catch (error) {
      console.error("❌ Thumbnail generation error:", error);
      soundPlayer.play("error");
      return videoUri;
    }
  };

  /* ---------------------------------------------------------------- */
  /* MEDIA PICKER HANDLERS                                            */
  /* ---------------------------------------------------------------- */

  const handleAddMedia = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Alert.alert("Add Media", "Choose what to add", [
      {
        text: `📷 Photos (up to ${MAX_IMAGES})`,
        onPress: () => pickImages(),
      },
      {
        text: `🎥 Video (${MAX_VIDEO_DURATION}s max)`,
        onPress: () => pickVideo(),
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  };

  const pickImages = async () => {
    try {
      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        soundPlayer.play("error");
        Alert.alert(
          "Permission Required",
          "Please allow photo library access in your device settings to upload media.",
          [{ text: "Cancel", style: "cancel" }, { text: "Open Settings" }]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 1,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets.length > 0) {
        const selectedImages = result.assets.slice(0, MAX_IMAGES);

        const pending: PendingImage[] = selectedImages.map((asset) => ({
          uri: asset.uri,
          width: asset.width || 1080,
          height: asset.height || 1080,
        }));

        setPendingImages(pending);
        setCurrentCropIndex(0);
        setCropOffset({ x: 0, y: 0 });
        setCropScale(1);
        setShowCropModal(true);

        soundPlayer.play("click");
      }
    } catch (error) {
      console.error("Image picker error:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to select images. Please try again.");
    }
  };

  const pickVideo = async () => {
    try {
      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        soundPlayer.play("error");
        Alert.alert(
          "Permission Required",
          "Please allow photo library access in your device settings to upload media.",
          [{ text: "Cancel", style: "cancel" }, { text: "Open Settings" }]
        );
        return;
      }

      setIsProcessingMedia(true);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: false,
        quality: 0.8,
        videoMaxDuration: 120,
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        const duration = asset.duration || 0;

        if (duration / 1000 > 120) {
          soundPlayer.play("error");
          Alert.alert("Video Too Long", "Please select a video shorter than 2 minutes.", [
            { text: "OK" },
          ]);
          setIsProcessingMedia(false);
          return;
        }

        const compressedUri = await compressVideo(asset.uri);
        const thumbnailUri = await generateVideoThumbnail(compressedUri);

        const durationSeconds = duration / 1000;
        setVideoDuration(durationSeconds);
        setVideoUri(compressedUri);
        setVideoThumbnailUri(thumbnailUri);
        setMediaType("video");
        setImageUris([]);
        setIsVideoPlaying(false);

        setTrimStart(0);
        setTrimEnd(Math.min(durationSeconds, MAX_VIDEO_DURATION));
        setShowVideoTrimmer(true);

        if (durationSeconds > MAX_VIDEO_DURATION) {
          soundPlayer.play("click");
          Alert.alert(
            "Trim Your Video",
            `Your video is ${durationSeconds.toFixed(0)} seconds. Use the sliders below to select the best ${MAX_VIDEO_DURATION}-second clip.`,
            [{ text: "Got it" }]
          );
        }

        setIsProcessingMedia(false);
      } else {
        setIsProcessingMedia(false);
      }
    } catch (error) {
      console.error("Video picker error:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to select video. Please try again.");
      setIsProcessingMedia(false);
    }
  };

  const addMoreImages = async () => {
    if (imageUris.length >= MAX_IMAGES) {
      soundPlayer.play("error");
      Alert.alert("Maximum Reached", `You can only add up to ${MAX_IMAGES} images.`);
      return;
    }

    try {
      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 1,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets.length > 0) {
        const remainingSlots = MAX_IMAGES - imageUris.length;
        const selectedImages = result.assets.slice(0, remainingSlots);

        const pending: PendingImage[] = selectedImages.map((asset) => ({
          uri: asset.uri,
          width: asset.width || 1080,
          height: asset.height || 1080,
        }));

        setPendingImages(pending);
        setCurrentCropIndex(0);
        setCropOffset({ x: 0, y: 0 });
        setCropScale(1);
        setShowCropModal(true);
      }
    } catch (error) {
      console.error("Add images error:", error);
      soundPlayer.play("error");
    }
  };

  /* ---------------------------------------------------------------- */
  /* CROP HANDLERS                                                    */
  /* ---------------------------------------------------------------- */

  const handleCropComplete = async () => {
    if (currentCropIndex >= pendingImages.length) return;

    const currentImage = pendingImages[currentCropIndex];

    try {
      setIsProcessingMedia(true);

      const cropSize = Math.min(currentImage.width, currentImage.height) / cropScale;
      const originX = Math.max(
        0,
        (currentImage.width - cropSize) / 2 - cropOffset.x * (currentImage.width / SCREEN_WIDTH)
      );
      const originY = Math.max(
        0,
        (currentImage.height - cropSize) / 2 - cropOffset.y * (currentImage.height / SCREEN_WIDTH)
      );

      const manipResult = await ImageManipulator.manipulateAsync(
        currentImage.uri,
        [
          {
            crop: {
              originX: Math.max(0, Math.min(originX, currentImage.width - cropSize)),
              originY: Math.max(0, Math.min(originY, currentImage.height - cropSize)),
              width: cropSize,
              height: cropSize,
            },
          },
          { resize: { width: MAX_IMAGE_WIDTH } },
        ],
        { compress: IMAGE_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
      );

      const newImageUris = [...imageUris, manipResult.uri];
      setImageUris(newImageUris);

      if (currentCropIndex < pendingImages.length - 1) {
        setCurrentCropIndex(currentCropIndex + 1);
        setCropOffset({ x: 0, y: 0 });
        setCropScale(1);
        setIsProcessingMedia(false);
      } else {
        setShowCropModal(false);
        setPendingImages([]);
        setCurrentCropIndex(0);
        setMediaType("images");
        setIsProcessingMedia(false);
        soundPlayer.play("postThought");
      }
    } catch (error) {
      console.error("Crop error:", error);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to crop image. Please try again.");
      setIsProcessingMedia(false);
    }
  };

  const handleSkipCrop = async () => {
    if (currentCropIndex >= pendingImages.length) return;

    const currentImage = pendingImages[currentCropIndex];

    try {
      setIsProcessingMedia(true);

      const compressed = await compressImage(currentImage.uri);

      const newImageUris = [...imageUris, compressed];
      setImageUris(newImageUris);

      if (currentCropIndex < pendingImages.length - 1) {
        setCurrentCropIndex(currentCropIndex + 1);
        setCropOffset({ x: 0, y: 0 });
        setCropScale(1);
        setIsProcessingMedia(false);
      } else {
        setShowCropModal(false);
        setPendingImages([]);
        setCurrentCropIndex(0);
        setMediaType("images");
        setIsProcessingMedia(false);
        soundPlayer.play("postThought");
      }
    } catch (error) {
      console.error("Skip crop error:", error);
      setIsProcessingMedia(false);
    }
  };

  const handleCancelCrop = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCropModal(false);
    setPendingImages([]);
    setCurrentCropIndex(0);
    setCropOffset({ x: 0, y: 0 });
    setCropScale(1);
  };

  /* ---------------------------------------------------------------- */
  /* MEDIA REMOVAL HANDLERS                                           */
  /* ---------------------------------------------------------------- */

  const removeImage = (index: number) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const newUris = imageUris.filter((_, i) => i !== index);
    setImageUris(newUris);

    if (newUris.length === 0) {
      setMediaType(null);
    }

    if (currentImageIndex >= newUris.length) {
      setCurrentImageIndex(Math.max(0, newUris.length - 1));
    }
  };

  const removeVideo = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVideoUri(null);
    setVideoThumbnailUri(null);
    setMediaType(null);
    setShowVideoTrimmer(false);
    setIsVideoPlaying(false);
  };

  /* ---------------------------------------------------------------- */
  /* VIDEO PLAYBACK                                                   */
  /* ---------------------------------------------------------------- */

  const toggleVideoPlayback = async () => {
    if (!videoRef.current) return;

    if (isVideoPlaying) {
      await videoRef.current.pauseAsync();
      setIsVideoPlaying(false);
    } else {
      await videoRef.current.playAsync();
      setIsVideoPlaying(true);
    }
  };

  const seekToTrimStart = async () => {
    if (videoRef.current) {
      await videoRef.current.setPositionAsync(trimStart * 1000);
    }
  };

  const handleTrimStartChange = (value: number) => {
    setTrimStart(value);
    if (trimEnd - value > MAX_VIDEO_DURATION) {
      setTrimEnd(value + MAX_VIDEO_DURATION);
    }
    if (trimEnd <= value) {
      setTrimEnd(Math.min(value + 1, videoDuration));
    }
  };

  /* ---------------------------------------------------------------- */
  /* AUTOCOMPLETE LOGIC                                               */
  /* ---------------------------------------------------------------- */

  const handleContentChange = (text: string) => {
    setContent(text);

    // Skip cleanup during initial edit load
    if (isInitialLoadRef.current) return;

    // Clean up removed mentions
    const cleanedMentions = selectedMentions.filter((mention) => text.includes(mention));
    if (cleanedMentions.length !== selectedMentions.length) {
      setSelectedMentions(cleanedMentions);
    }

    // Clean up removed tournaments - FIXED
    const cleanedTournaments = selectedTournaments.filter((t) => text.includes(t));
    if (cleanedTournaments.length !== selectedTournaments.length) {
      setSelectedTournaments(cleanedTournaments);
    }

    // Clean up removed leagues - FIXED
    const cleanedLeagues = selectedLeagues.filter((l) => text.includes(l));
    if (cleanedLeagues.length !== selectedLeagues.length) {
      setSelectedLeagues(cleanedLeagues);
    }

    const lastAtIndex = text.lastIndexOf("@");
    const lastHashIndex = text.lastIndexOf("#");

    const triggerIndex = Math.max(lastAtIndex, lastHashIndex);
    const triggerChar = lastAtIndex > lastHashIndex ? "@" : "#";

    if (triggerIndex === -1) {
      setShowAutocomplete(false);
      return;
    }

    const afterTrigger = text.slice(triggerIndex + 1);

    if (afterTrigger.includes("  ") || afterTrigger.includes("\n")) {
      setShowAutocomplete(false);
      return;
    }

    const searchText = afterTrigger.split(" ")[0];
    setCurrentSearchText(searchText);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (searchText.length >= 1) {
        if (triggerChar === "@") {
          setAutocompleteType("mention");
          searchMentions(searchText);
        } else {
          setAutocompleteType("hashtag");
          searchHashtags(searchText);
        }
      }
    }, 300);
  };

  const searchMentions = async (searchText: string) => {
    try {
      const searchLower = searchText.toLowerCase();

      const partnerResults = allPartners.filter((p) =>
        p.displayName.toLowerCase().includes(searchLower)
      );

      const coursesSnap = await getDocs(collection(db, "courses"));

      const courseResults: AutocompleteItem[] = [];
      coursesSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const courseName = data.course_name || data.courseName || "";
        const clubName = data.club_name || data.clubName || "";

        const matchesCourseName = courseName.toLowerCase().includes(searchLower);
        const matchesClubName = clubName.toLowerCase().includes(searchLower);

        if (matchesCourseName || matchesClubName) {
          let displayName = "";
          if (clubName && courseName && clubName !== courseName) {
            displayName = `${clubName} - ${courseName}`;
          } else if (clubName) {
            displayName = clubName;
          } else {
            displayName = courseName;
          }

          courseResults.push({
            courseId: data.id,
            courseName: displayName,
            location: data.location ? `${data.location.city}, ${data.location.state}` : "",
            type: "course",
          });
        }
      });

      if (partnerResults.length > 0 || courseResults.length > 0) {
        const combined: AutocompleteItem[] = [
          ...partnerResults.map((p) => ({ ...p, type: "partner" as const })),
          ...courseResults,
        ];
        setAutocompleteResults(combined);
        setShowAutocomplete(true);
        return;
      }

      if (courseResults.length === 0) {
        searchCoursesAPI(searchText);
      }
    } catch (err) {
      console.error("Search mentions error:", err);
      soundPlayer.play("error");
    }
  };

  const searchHashtags = async (searchText: string) => {
    try {
      const searchLower = searchText.toLowerCase();
      const results: AutocompleteItem[] = [];

      // Search tournaments
      const tournamentsSnap = await getDocs(collection(db, "tournaments"));
      tournamentsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const name = data.name || "";

        if (name.toLowerCase().includes(searchLower)) {
          results.push({
            id: docSnap.id,
            tournamentId: data.tournId || docSnap.id,
            name: name,
            type: "tournament",
            location: data.location ? `${data.location.city}, ${data.location.state}` : "",
            startDate: data.startDate,
          });
        }
      });

      // Search leagues
      try {
        const leaguesSnap = await getDocs(collection(db, "leagues"));
        leaguesSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const name = data.name || "";

          if (name.toLowerCase().includes(searchLower)) {
            results.push({
              id: docSnap.id,
              leagueId: docSnap.id,
              name: name,
              type: "league",
              location: data.regionName || "",
            });
          }
        });
      } catch (e) {
        console.log("Leagues collection not found, skipping");
      }

      if (results.length > 0) {
        setAutocompleteResults(results);
        setShowAutocomplete(true);
      } else {
        setShowAutocomplete(false);
      }
    } catch (err) {
      console.error("Search hashtags error:", err);
      soundPlayer.play("error");
    }
  };

  const searchCoursesAPI = async (searchText: string) => {
    try {
      const res = await fetch(
        `${GOLF_COURSE_API_URL}/search?search_query=${encodeURIComponent(searchText)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Key ${GOLF_COURSE_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) return;

      const data = await res.json();
      const courses: GolfCourse[] = data.courses || [];

      if (courses.length > 0) {
        setAutocompleteResults(
          courses.map((c) => {
            let displayName = "";
            if (c.club_name && c.course_name && c.club_name !== c.course_name) {
              displayName = `${c.club_name} - ${c.course_name}`;
            } else if (c.club_name) {
              displayName = c.club_name;
            } else {
              displayName = c.course_name;
            }

            return {
              courseId: c.id,
              courseName: displayName,
              location: `${c.location.city}, ${c.location.state}`,
              type: "course" as const,
            };
          })
        );
        setShowAutocomplete(true);
      }
    } catch (err) {
      console.error("Course API search error:", err);
      soundPlayer.play("error");
    }
  };

  const handleSelectAutocomplete = async (item: AutocompleteItem) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (autocompleteType === "mention") {
      const lastAtIndex = content.lastIndexOf("@");
      const beforeAt = content.slice(0, lastAtIndex);
      const afterSearch = content.slice(lastAtIndex + 1 + currentSearchText.length);

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
                ? {
                    city: item.location.split(", ")[0],
                    state: item.location.split(", ")[1],
                  }
                : null,
            });
          }
        } catch (err) {
          console.error("Error caching course:", err);
        }
      }

      setContent(`${beforeAt}${mentionText} ${afterSearch}`);

      if (mentionText && !selectedMentions.includes(mentionText)) {
        setSelectedMentions([...selectedMentions, mentionText]);
      }
    } else if (autocompleteType === "hashtag") {
      const lastHashIndex = content.lastIndexOf("#");
      const beforeHash = content.slice(0, lastHashIndex);
      const afterSearch = content.slice(lastHashIndex + 1 + currentSearchText.length);

      const hashtagText = `#${item.name}`;

      setContent(`${beforeHash}${hashtagText} ${afterSearch}`);

      // FIXED: Add to correct list based on type
      if (item.type === "tournament") {
        if (hashtagText && !selectedTournaments.includes(hashtagText)) {
          setSelectedTournaments([...selectedTournaments, hashtagText]);
        }
      } else if (item.type === "league") {
        if (hashtagText && !selectedLeagues.includes(hashtagText)) {
          setSelectedLeagues([...selectedLeagues, hashtagText]);
        }
      }
    }

    setShowAutocomplete(false);
  };

  /* ---------------------------------------------------------------- */
  /* NAVIGATION HANDLERS                                              */
  /* ---------------------------------------------------------------- */

  const handleClose = async () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (content.trim() || imageUris.length > 0 || videoUri) {
      const shouldDiscard = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Discard Thought?",
          "You have unsaved changes. Are you sure you want to discard this thought?",
          [
            {
              text: "Keep Editing",
              style: "cancel",
              onPress: () => {
                soundPlayer.play("click");
                resolve(false);
              },
            },
            {
              text: "Discard",
              style: "destructive",
              onPress: () => {
                soundPlayer.play("error");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                resolve(true);
              },
            },
          ]
        );
      });

      if (shouldDiscard) {
        router.back();
      }
    } else {
      router.back();
    }
  };

  const handleDelete = async () => {
    if (!editingPostId) return;

    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const confirmDelete = async () => {
      if (Platform.OS === "web") {
        return window.confirm("Delete this post permanently?");
      } else {
        return new Promise<boolean>((resolve) => {
          Alert.alert(
            "Delete Post",
            "Are you sure you want to delete this post? This cannot be undone.",
            [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => {
                  soundPlayer.play("click");
                  resolve(false);
                },
              },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => {
                  soundPlayer.play("error");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  resolve(true);
                },
              },
            ]
          );
        });
      }
    };

    const shouldDelete = await confirmDelete();
    if (!shouldDelete) return;

    try {
      setIsPosting(true);
      await deleteDoc(doc(db, "thoughts", editingPostId));
      soundPlayer.play("dart");
      Alert.alert("Deleted 🗑️", "Your thought has been deleted.");
      router.back();
    } catch (err) {
      console.error("Delete error:", err);
      soundPlayer.play("error");
      Alert.alert("Error", "Failed to delete post. Please try again.");
      setIsPosting(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* POST HANDLING                                                    */
  /* ---------------------------------------------------------------- */

  const handlePost = async () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

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

    if (!content.trim()) {
      soundPlayer.play("error");
      Alert.alert("Empty Post", "Please add some content.");
      return;
    }

    setIsPosting(true);

    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("No user");

      const userDoc = await getDoc(doc(db, "users", uid));
      const currentUserData = userDoc.data();

      if (!currentUserData) throw new Error("No user data");

      const userLat = currentUserData.currentLatitude || currentUserData.latitude;
      const userLon = currentUserData.currentLongitude || currentUserData.longitude;
      const userCity = currentUserData.currentCity || currentUserData.city || "";
      const userState = currentUserData.currentState || currentUserData.state || "";

      const geohash = userLat && userLon ? encodeGeohash(userLat, userLon, 5) : "";

      // Upload images
      const uploadedImageUrls: string[] = [];
      if (mediaType === "images" && imageUris.length > 0) {
        for (let i = 0; i < imageUris.length; i++) {
          const uri = imageUris[i];

          if (uri.startsWith("file://")) {
            const response = await fetch(uri);
            const blob = await response.blob();

            const path = `posts/${uid}/${Date.now()}_${i}.jpg`;
            const storageRef = ref(storage, path);

            await uploadBytes(storageRef, blob);
            const url = await getDownloadURL(storageRef);
            uploadedImageUrls.push(url);
          } else {
            uploadedImageUrls.push(uri);
          }
        }
      }

      // Upload video
      let uploadedVideoUrl: string | null = null;
      let uploadedThumbnailUrl: string | null = null;

      if (mediaType === "video" && videoUri) {
        if (videoUri.startsWith("file://")) {
          const response = await fetch(videoUri);
          const blob = await response.blob();

          const path = `posts/${uid}/${Date.now()}.mp4`;
          const storageRef = ref(storage, path);

          await uploadBytes(storageRef, blob);
          uploadedVideoUrl = await getDownloadURL(storageRef);

          if (videoThumbnailUri) {
            try {
              const thumbnailResponse = await fetch(videoThumbnailUri);
              const thumbnailBlob = await thumbnailResponse.blob();
              const thumbnailPath = `posts/${uid}/${Date.now()}_thumb.jpg`;
              const thumbnailRef = ref(storage, thumbnailPath);

              await uploadBytes(thumbnailRef, thumbnailBlob);
              uploadedThumbnailUrl = await getDownloadURL(thumbnailRef);
            } catch (thumbError) {
              console.error("⚠️ Thumbnail upload failed:", thumbError);
            }
          }
        } else {
          uploadedVideoUrl = videoUri;
          uploadedThumbnailUrl = videoThumbnailUri;
        }
      }

      // Extract @ mentions from content
      const mentionRegex = /@([^@#\n]+?)(?=\s{2,}|$|@|#|\n)/g;
      const mentions = content.match(mentionRegex) || [];

      const extractedPartners: Partner[] = [];
      const extractedCourses: Course[] = [];

      for (const mention of mentions) {
        const mentionText = mention.substring(1).trim();

        const matchedPartner = allPartners.find(
          (p) => p.displayName.toLowerCase() === mentionText.toLowerCase()
        );

        if (matchedPartner && !extractedPartners.find((p) => p.userId === matchedPartner.userId)) {
          extractedPartners.push(matchedPartner);
          console.log("✅ Matched partner:", matchedPartner.displayName);
          continue;
        }

        try {
          const coursesSnap = await getDocs(collection(db, "courses"));

          let foundCourse = false;
          coursesSnap.forEach((docSnap) => {
            if (foundCourse) return;

            const data = docSnap.data();
            const courseName = data.course_name || data.courseName || "";
            const clubName = data.club_name || data.clubName || "";
            const courseId = data.id || parseInt(docSnap.id) || docSnap.id;

            let displayName = "";
            if (clubName && courseName && clubName !== courseName) {
              displayName = `${clubName} - ${courseName}`;
            } else if (clubName) {
              displayName = clubName;
            } else {
              displayName = courseName;
            }

            const mentionLower = mentionText.toLowerCase();

            if (
              (displayName.toLowerCase() === mentionLower ||
                clubName.toLowerCase() === mentionLower ||
                courseName.toLowerCase() === mentionLower) &&
              !extractedCourses.find((c) => c.courseId === courseId)
            ) {
              extractedCourses.push({
                courseId: courseId,
                courseName: displayName,
              });
              foundCourse = true;
              console.log("✅ Matched course:", displayName, "ID:", courseId);
            }
          });

          if (!foundCourse) {
            console.log("⚠️ No course match found for:", mentionText);
          }
        } catch (err) {
          console.error("Error matching course mentions:", err);
        }
      }

      // Extract # hashtags from content
      const hashtagRegex = /#([^@#\n]+?)(?=\s{2,}|$|@|#|\n)/g;
      const hashtags = content.match(hashtagRegex) || [];

      const extractedTournaments: TaggedTournament[] = [];
      const extractedLeagues: TaggedLeague[] = [];

      for (const hashtag of hashtags) {
        const hashtagText = hashtag.substring(1).trim();

        // Check tournaments
        try {
          const tournamentsSnap = await getDocs(collection(db, "tournaments"));

          let foundTournament = false;
          tournamentsSnap.forEach((docSnap) => {
            if (foundTournament) return;

            const data = docSnap.data();
            const name = data.name || "";

            if (
              name.toLowerCase() === hashtagText.toLowerCase() &&
              !extractedTournaments.find((t) => t.tournamentId === docSnap.id)
            ) {
              extractedTournaments.push({
                tournamentId: data.tournId || docSnap.id,
                name: name,
                type: "tournament",
              });
              foundTournament = true;
              console.log("✅ Matched tournament:", name);
            }
          });
        } catch (err) {
          console.error("Error matching tournament:", err);
        }

        // Check leagues
        try {
          const leaguesSnap = await getDocs(collection(db, "leagues"));

          let foundLeague = false;
          leaguesSnap.forEach((docSnap) => {
            if (foundLeague) return;

            const data = docSnap.data();
            const name = data.name || "";

            if (
              name.toLowerCase() === hashtagText.toLowerCase() &&
              !extractedLeagues.find((l) => l.leagueId === docSnap.id)
            ) {
              extractedLeagues.push({
                leagueId: docSnap.id,
                name: name,
                type: "league",
              });
              foundLeague = true;
              console.log("✅ Matched league:", name);
            }
          });
        } catch (err) {
          console.log("Leagues collection not found");
        }
      }

      console.log("📝 Extracted partners:", extractedPartners);
      console.log("📝 Extracted courses:", extractedCourses);
      console.log("📝 Extracted tournaments:", extractedTournaments);
      console.log("📝 Extracted leagues:", extractedLeagues);

      // Build post data - SAME SCHEMA AS BEFORE
      const postData: any = {
        content: content.trim(),
        postType: selectedType,

        regionKey: currentUserData.regionKey || "",
        geohash: geohash,
        location: {
          city: userCity,
          state: userState,
          latitude: userLat || null,
          longitude: userLon || null,
        },

        userName: currentUserData.displayName || "Unknown",
        displayName: currentUserData.displayName || "Unknown",
        userAvatar: currentUserData.avatar || null,
        avatar: currentUserData.avatar || null,
        handicap: currentUserData.handicap || null,
        userType: currentUserData.userType || "Golfer",
        verified:
          currentUserData.verified === true ||
          currentUserData.verification?.status === "approved",

        hasMedia: uploadedImageUrls.length > 0 || uploadedVideoUrl !== null,
        mediaType: uploadedImageUrls.length > 0 ? "images" : uploadedVideoUrl ? "video" : null,
        imageUrls: uploadedImageUrls,
        imageCount: uploadedImageUrls.length,
        imageUrl: null,
        videoUrl: uploadedVideoUrl,
        videoThumbnailUrl: uploadedThumbnailUrl,
        videoDuration: uploadedVideoUrl ? videoDuration : null,
        videoTrimStart: uploadedVideoUrl ? trimStart : null,
        videoTrimEnd: uploadedVideoUrl ? trimEnd : null,

        likes: 0,
        likedBy: [],
        comments: 0,
        engagementScore: 0,
        lastActivityAt: serverTimestamp(),
        viewCount: 0,

        contentLowercase: content.trim().toLowerCase(),
        hashtags: extractHashtags(content),

        taggedPartners: extractedPartners.map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
        })),
        taggedCourses: extractedCourses.map((c) => ({
          courseId: c.courseId,
          courseName: c.courseName,
        })),
        taggedTournaments: extractedTournaments.map((t) => ({
          tournamentId: t.tournamentId,
          name: t.name,
        })),
        taggedLeagues: extractedLeagues.map((l) => ({
          leagueId: l.leagueId,
          name: l.name,
        })),

        isReported: false,
        reportCount: 0,
        isHidden: false,
        moderatedAt: null,
        moderatedBy: null,

        createdAtTimestamp: Date.now(),
      };

      if (isEditMode && editingPostId) {
        await updateDoc(doc(db, "thoughts", editingPostId), postData);
        soundPlayer.play("postThought");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert("Updated ✏️", "Your thought has been updated.");
      } else {
        await addDoc(collection(db, "thoughts"), {
          thoughtId: `thought_${Date.now()}`,
          userId: uid,
          ...postData,
          createdAt: new Date(),
        });

        await updateRateLimitTimestamp("post");

        soundPlayer.play("postThought");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert("Tee'd Up ⛳️", "Your thought has been published.");
      }

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
        extraScrollHeight={120}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Media Section */}
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
          currentImageIndex={currentImageIndex}
          setCurrentImageIndex={setCurrentImageIndex}
          onAddMedia={handleAddMedia}
          onAddMoreImages={addMoreImages}
          onRemoveImage={removeImage}
          onRemoveVideo={removeVideo}
          onToggleVideoPlayback={toggleVideoPlayback}
          onTrimStartChange={handleTrimStartChange}
          onTrimEndChange={setTrimEnd}
          onSeekToTrimStart={seekToTrimStart}
        />

        {/* Type Selector */}
        <TypeSelector
          availableTypes={availableTypes}
          selectedType={selectedType}
          onSelectType={setSelectedType}
        />

        {/* Content Input */}
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

      {/* Crop Modal */}
      <CropModal
        visible={showCropModal}
        pendingImages={pendingImages}
        currentCropIndex={currentCropIndex}
        cropOffset={cropOffset}
        cropScale={cropScale}
        isProcessingMedia={isProcessingMedia}
        onCropOffsetChange={setCropOffset}
        onCropScaleChange={setCropScale}
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
  
  // Header
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

  // Lock Banner
  lockBanner: {
    backgroundColor: "#FFF3CD",
    borderColor: "#FFECB5",
    borderWidth: 1,
    padding: 12,
    margin: 12,
    borderRadius: 10,
  },
  lockText: { color: "#664D03", textAlign: "center", fontWeight: "600" },

  // Content
  content: { flex: 1, padding: 16 },
});