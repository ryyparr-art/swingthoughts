import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { auth, db, storage } from "@/constants/firebaseConfig";
import { POST_TYPES } from "@/constants/postTypes";
import { createNotification } from "@/utils/notificationHelpers";
import {
  checkRateLimit,
  EMAIL_VERIFICATION_MESSAGE,
  getRateLimitMessage,
  isEmailVerified,
  updateRateLimitTimestamp
} from "@/utils/rateLimitHelpers";
import { soundPlayer } from "@/utils/soundPlayer";

import Slider from "@react-native-community/slider";
import { ResizeMode, Video } from "expo-av";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as VideoThumbnails from "expo-video-thumbnails";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Video as VideoCompressor } from "react-native-compressor";
import { SafeAreaView } from "react-native-safe-area-context";

/* -------------------------------- UTILS -------------------------------- */

function canWrite(userData: any): boolean {
  if (!userData) return false;
  
  if (userData.userType === "Golfer" || userData.userType === "Junior") {
    return userData.acceptedTerms === true;
  }
  
  if (userData.userType === "Course" || userData.userType === "PGA Professional") {
    return userData.verified === true || userData.verification?.status === "approved";
  }
  
  return false;
}

/**
 * Calculate geohash for posts (5-char precision = 2.4 miles)
 */
function encodeGeohash(latitude: number, longitude: number, precision: number = 5): string {
  const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = "";

  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const lonMid = (lonMin + lonMax) / 2;
      if (longitude > lonMid) {
        idx |= (1 << (4 - bit));
        lonMin = lonMid;
      } else {
        lonMax = lonMid;
      }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (latitude > latMid) {
        idx |= (1 << (4 - bit));
        latMin = latMid;
      } else {
        latMax = latMid;
      }
    }
    evenBit = !evenBit;

    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32[idx];
      bit = 0;
      idx = 0;
    }
  }

  return geohash;
}

/**
 * Extract hashtags from content
 */
function extractHashtags(content: string): string[] {
  const hashtagRegex = /#(\w+)/g;
  const matches = content.match(hashtagRegex) || [];
  return matches.map(tag => tag.toLowerCase());
}

/* -------------------------------- CONFIG -------------------------------- */

const MAX_CHARACTERS = 280;
const MAX_VIDEO_DURATION = 30;
const MAX_IMAGE_WIDTH = 1080;
const IMAGE_QUALITY = 0.7;
const MAX_IMAGES = 3;

const SCREEN_WIDTH = Dimensions.get('window').width;

/* -------------------------------- TYPES -------------------------------- */

interface Partner {
  userId: string;
  displayName: string;
}

interface Course {
  courseId: number;
  courseName: string;
}

interface GolfCourse {
  id: number;
  club_name: string;
  course_name: string;
  location: {
    city: string;
    state: string;
  };
}

/* ======================================================================== */

export default function CreateScreen() {
  console.log("🎨 CREATE SCREEN MOUNTED");
  
  const router = useRouter();
  const { editId } = useLocalSearchParams();

  const [selectedType, setSelectedType] = useState("swing-thought");
  const [content, setContent] = useState("");
  
  // Media states - multi-image OR single video
  const [mediaType, setMediaType] = useState<"images" | "video" | null>(null);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [videoThumbnailUri, setVideoThumbnailUri] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);

  // Video states
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(30);
  const [showVideoTrimmer, setShowVideoTrimmer] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const videoRef = useRef<Video>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const [userData, setUserData] = useState<any>(null);
  const writable = canWrite(userData);

  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteType, setAutocompleteType] = useState<"partner" | "course" | null>(null);
  const [autocompleteResults, setAutocompleteResults] = useState<any[]>([]);
  const [currentMention, setCurrentMention] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);

  const [allPartners, setAllPartners] = useState<Partner[]>([]);

  const [isEditMode, setIsEditMode] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  /* --------------------------- KEYBOARD HANDLING --------------------------- */

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => {
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );

    return () => {
      keyboardDidShowListener.remove();
    };
  }, []);

  /* --------------------------- LOAD USER DATA --------------------------- */

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

  /* --------------------------- LOAD POST FOR EDITING --------------------------- */

  useEffect(() => {
    const loadPostForEdit = async () => {
      if (!editId || typeof editId !== 'string') return;

      try {
        const postDoc = await getDoc(doc(db, "thoughts", editId));
        if (!postDoc.exists()) {
          soundPlayer.play('error');
          Alert.alert("Error", "Post not found");
          return;
        }

        const postData = postDoc.data();
        
        if (postData.userId !== auth.currentUser?.uid) {
          soundPlayer.play('error');
          Alert.alert("Error", "You can only edit your own posts");
          router.back();
          return;
        }

        setIsEditMode(true);
        setEditingPostId(editId);
        setContent(postData.content || "");
        setSelectedType(postData.postType || "swing-thought");
        
        // Load media - handle both old (single) and new (multiple) formats
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
        }
        
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
      } catch (error) {
        console.error("Error loading post:", error);
        soundPlayer.play('error');
        Alert.alert("Error", "Failed to load post");
      }
    };

    loadPostForEdit();
  }, [editId]);

  /* --------------------------- POST TYPES BY USER --------------------------- */

  const availableTypes = (() => {
    if (!userData?.userType) return POST_TYPES.golfer;

    if (userData.userType === "PGA Professional") return POST_TYPES.pro;
    if (userData.userType === "Course") return POST_TYPES.course;
    return POST_TYPES.golfer;
  })();

  /* --------------------------- IMAGE COMPRESSION --------------------------- */

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
      soundPlayer.play('error');
      return uri;
    }
  };

  /* --------------------------- VIDEO COMPRESSION --------------------------- */

  const compressVideo = async (uri: string): Promise<string> => {
    try {
      console.log("🎥 Compressing video...");
      const compressedUri = await VideoCompressor.compress(
        uri,
        {
          compressionMethod: 'auto',
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
      soundPlayer.play('error');
      return uri;
    }
  };

  /* --------------------------- VIDEO THUMBNAIL --------------------------- */

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
      soundPlayer.play('error');
      return videoUri;
    }
  };

  /* --------------------------- UNIFIED MEDIA PICKER --------------------------- */

  const pickMedia = async () => {
    try {
      soundPlayer.play('click');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        soundPlayer.play('error');
        Alert.alert(
          'Permission Required',
          'Please allow photo library access in your device settings to upload media.',
          [
            { 
              text: 'Cancel', 
              style: 'cancel',
              onPress: () => soundPlayer.play('click')
            },
            { 
              text: 'Open Settings', 
              onPress: () => soundPlayer.play('click')
            }
          ]
        );
        return;
      }

      setIsProcessingMedia(true);

      // Allow both images and videos
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: true, // Enable multi-select for images
        allowsEditing: false, // Disable to allow multiple selection
        quality: 0.8,
        videoMaxDuration: 60,
      });

      if (!result.canceled && result.assets.length > 0) {
        const firstAsset = result.assets[0];
        
        // Check if it's a video
        if (firstAsset.type === 'video' || firstAsset.duration) {
          // VIDEO HANDLING
          const duration = firstAsset.duration || 0;
          
          if (duration / 1000 > 60) {
            soundPlayer.play('error');
            Alert.alert(
              "Video Too Long",
              "Please select a video shorter than 60 seconds.",
              [{ text: "OK", onPress: () => soundPlayer.play('click') }]
            );
            setIsProcessingMedia(false);
            return;
          }
          
          const compressedUri = await compressVideo(firstAsset.uri);
          const thumbnailUri = await generateVideoThumbnail(compressedUri);
          
          setVideoDuration(duration / 1000);
          setVideoUri(compressedUri);
          setVideoThumbnailUri(thumbnailUri);
          setMediaType("video");
          setImageUris([]); // Clear images
          setIsVideoPlaying(false);

          if (duration / 1000 > MAX_VIDEO_DURATION) {
            setTrimStart(0);
            setTrimEnd(MAX_VIDEO_DURATION);
            setShowVideoTrimmer(true);
            
            soundPlayer.play('click');
            Alert.alert(
              "Trim Your Video",
              `Your video is ${(duration / 1000).toFixed(0)} seconds. Use the sliders below to select the best 30-second clip.`,
              [{ text: "Got it", onPress: () => soundPlayer.play('click') }]
            );
          } else {
            setTrimStart(0);
            setTrimEnd(duration / 1000);
            setShowVideoTrimmer(false);
          }
          
          setIsProcessingMedia(false);
        } else {
          // IMAGE HANDLING (up to 3)
          const selectedImages = result.assets.slice(0, MAX_IMAGES);
          
          const compressedImages: string[] = [];
          for (const asset of selectedImages) {
            const compressed = await compressImage(asset.uri);
            compressedImages.push(compressed);
          }
          
          setImageUris(compressedImages);
          setMediaType("images");
          setVideoUri(null); // Clear video
          setVideoThumbnailUri(null);
          setCurrentImageIndex(0);
          setIsProcessingMedia(false);
        }
      } else {
        setIsProcessingMedia(false);
      }
    } catch (error) {
      console.error("Media picker error:", error);
      soundPlayer.play('error');
      Alert.alert("Error", "Failed to select media. Please try again.");
      setIsProcessingMedia(false);
    }
  };

  /* --------------------------- ADD MORE IMAGES --------------------------- */

  const addMoreImages = async () => {
    if (imageUris.length >= MAX_IMAGES) {
      soundPlayer.play('error');
      Alert.alert("Maximum Reached", `You can only add up to ${MAX_IMAGES} images.`);
      return;
    }

    try {
      soundPlayer.play('click');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;

      setIsProcessingMedia(true);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const remainingSlots = MAX_IMAGES - imageUris.length;
        const newImages = result.assets.slice(0, remainingSlots);
        
        const compressedImages: string[] = [];
        for (const asset of newImages) {
          const compressed = await compressImage(asset.uri);
          compressedImages.push(compressed);
        }
        
        setImageUris([...imageUris, ...compressedImages]);
        setIsProcessingMedia(false);
      } else {
        setIsProcessingMedia(false);
      }
    } catch (error) {
      console.error("Add images error:", error);
      soundPlayer.play('error');
      setIsProcessingMedia(false);
    }
  };

  /* --------------------------- REMOVE IMAGE --------------------------- */

  const removeImage = (index: number) => {
    soundPlayer.play('click');
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

  /* --------------------------- AUTOCOMPLETE LOGIC --------------------------- */

  const handleContentChange = (text: string) => {
    setContent(text);

    const cleanedMentions = selectedMentions.filter((mention) => 
      text.includes(mention)
    );
    if (cleanedMentions.length !== selectedMentions.length) {
      setSelectedMentions(cleanedMentions);
    }

    const lastAtIndex = text.lastIndexOf("@");
    if (lastAtIndex === -1) {
      setShowAutocomplete(false);
      return;
    }

    const afterAt = text.slice(lastAtIndex + 1);
    
    if (afterAt.endsWith("  ") || afterAt.includes("\n")) {
      setShowAutocomplete(false);
      return;
    }
    
    setCurrentMention(afterAt);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (afterAt.length >= 1) {
        searchMentions(afterAt);
      }
    }, 300);
  };

  const searchMentions = async (searchText: string) => {
    try {
      const partnerResults = allPartners.filter((p) =>
        p.displayName.toLowerCase().includes(searchText.toLowerCase())
      );

      const coursesQuery = query(collection(db, "courses"));
      const coursesSnap = await getDocs(coursesQuery);
      
      const courseResults: any[] = [];
      coursesSnap.forEach((doc) => {
        const data = doc.data();
        const courseName = data.course_name || data.courseName || "";
        
        if (courseName.toLowerCase().includes(searchText.toLowerCase())) {
          courseResults.push({
            courseId: data.id,
            courseName: courseName,
            location: data.location 
              ? `${data.location.city}, ${data.location.state}`
              : "",
            type: "course",
          });
        }
      });

      if (partnerResults.length > 0 || courseResults.length > 0) {
        const combined = [
          ...partnerResults.map((p) => ({ ...p, type: "partner" })),
          ...courseResults,
        ];
        setAutocompleteResults(combined);
        setShowAutocomplete(true);
        return;
      }

      if (courseResults.length === 0) {
        searchCoursesAutocomplete(searchText);
      }
    } catch (err) {
      console.error("Search error:", err);
      soundPlayer.play('error');
    }
  };

  const searchCoursesAutocomplete = async (searchText: string) => {
    try {
      const coursesQuery = query(collection(db, "courses"));
      const coursesSnap = await getDocs(coursesQuery);
      
      const cachedCourses: any[] = [];
      coursesSnap.forEach((doc) => {
        const data = doc.data();
        const courseName = data.course_name || data.courseName || "";
        
        if (courseName.toLowerCase().includes(searchText.toLowerCase())) {
          cachedCourses.push({
            courseId: data.id,
            courseName: courseName,
            location: data.location 
              ? `${data.location.city}, ${data.location.state}`
              : "",
          });
        }
      });

      if (cachedCourses.length > 0) {
        setAutocompleteType("course");
        setAutocompleteResults(cachedCourses);
        setShowAutocomplete(true);
        return;
      }

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
        setAutocompleteType("course");
        setAutocompleteResults(
          courses.map((c) => ({
            courseId: c.id,
            courseName: c.course_name,
            location: `${c.location.city}, ${c.location.state}`,
            type: "course",
          }))
        );
        setShowAutocomplete(true);
      }
    } catch (err) {
      console.error("Course search error:", err);
      soundPlayer.play('error');
    }
  };

  const handleSelectMention = async (item: any) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const lastAtIndex = content.lastIndexOf("@");
    const beforeAt = content.slice(0, lastAtIndex);
    const afterMention = content.slice(lastAtIndex + 1 + currentMention.length);
    
    let mentionText = "";
    
    if (item.type === "partner") {
      mentionText = `@${item.displayName}`;
      setContent(`${beforeAt}${mentionText} ${afterMention}`);
    } else if (item.type === "course") {
      mentionText = `@${item.courseName}`;
      setContent(`${beforeAt}${mentionText} ${afterMention}`);
      
      try {
        const courseQuery = query(
          collection(db, "courses"),
          where("id", "==", item.courseId)
        );
        const courseSnap = await getDocs(courseQuery);
        
        if (courseSnap.empty) {
          await addDoc(collection(db, "courses"), {
            id: item.courseId,
            course_name: item.courseName,
            location: item.location ? {
              city: item.location.split(", ")[0],
              state: item.location.split(", ")[1]
            } : null,
          });
        }
      } catch (err) {
        console.error("Error saving course:", err);
        soundPlayer.play('error');
      }
    }

    if (mentionText && !selectedMentions.includes(mentionText)) {
      setSelectedMentions([...selectedMentions, mentionText]);
    }

    setShowAutocomplete(false);
  };

  /* --------------------------- HANDLE CLOSE WITH WARNING --------------------------- */

  const handleClose = async () => {
    soundPlayer.play('click');
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
                soundPlayer.play('click');
                resolve(false);
              },
            },
            {
              text: "Discard",
              style: "destructive",
              onPress: () => {
                soundPlayer.play('error');
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

  /* --------------------------- DELETE POST ---------------------------- */

  const handleDelete = async () => {
    if (!editingPostId) return;

    soundPlayer.play('click');
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
                  soundPlayer.play('click');
                  resolve(false);
                }
              },
              { 
                text: "Delete", 
                style: "destructive", 
                onPress: () => {
                  soundPlayer.play('error');
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  resolve(true);
                }
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
      soundPlayer.play('dart');
      Alert.alert("Deleted 🗑️", "Your thought has been deleted.");
      router.back();
    } catch (err) {
      console.error("Delete error:", err);
      soundPlayer.play('error');
      Alert.alert("Error", "Failed to delete post. Please try again.");
      setIsPosting(false);
    }
  };

  /* --------------------------- POST HANDLING ---------------------------- */

  const handlePost = async () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const emailVerified = await isEmailVerified();
    if (!emailVerified) {
      soundPlayer.play('error');
      Alert.alert("Email Not Verified", EMAIL_VERIFICATION_MESSAGE);
      return;
    }

    if (!isEditMode) {
      const { allowed, remainingSeconds } = await checkRateLimit("post");
      if (!allowed) {
        soundPlayer.play('error');
        Alert.alert("Please Wait", getRateLimitMessage("post", remainingSeconds));
        return;
      }
    }

    if (!writable) {
      soundPlayer.play('error');
      Alert.alert(
        "Verification Pending",
        "Posting unlocks once your account is verified."
      );
      return;
    }

    if (!content.trim()) {
      soundPlayer.play('error');
      Alert.alert("Empty Post", "Please add some content.");
      return;
    }

    setIsPosting(true);

    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("No user");

      // Get user's location data for region/geohash
      const userDoc = await getDoc(doc(db, "users", uid));
      const currentUserData = userDoc.data();
      
      if (!currentUserData) throw new Error("No user data");

      const userLat = currentUserData.currentLatitude || currentUserData.latitude;
      const userLon = currentUserData.currentLongitude || currentUserData.longitude;
      const userCity = currentUserData.currentCity || currentUserData.city || "";
      const userState = currentUserData.currentState || currentUserData.state || "";

      // Calculate geohash (5-char precision)
      const geohash = userLat && userLon ? encodeGeohash(userLat, userLon, 5) : "";

      // Upload images (if any)
      const uploadedImageUrls: string[] = [];
      if (mediaType === "images" && imageUris.length > 0) {
        for (let i = 0; i < imageUris.length; i++) {
          const uri = imageUris[i];
          
          // Only upload if local file
          if (uri.startsWith('file://')) {
            const response = await fetch(uri);
            const blob = await response.blob();
            
            const path = `posts/${uid}/${Date.now()}_${i}.jpg`;
            const storageRef = ref(storage, path);
            
            await uploadBytes(storageRef, blob);
            const url = await getDownloadURL(storageRef);
            uploadedImageUrls.push(url);
          } else {
            // Existing URL (edit mode)
            uploadedImageUrls.push(uri);
          }
        }
      }

      // Upload video (if any)
      let uploadedVideoUrl: string | null = null;
      let uploadedThumbnailUrl: string | null = null;

      if (mediaType === "video" && videoUri) {
        if (videoUri.startsWith('file://')) {
          const response = await fetch(videoUri);
          const blob = await response.blob();
          
          const path = `posts/${uid}/${Date.now()}.mp4`;
          const storageRef = ref(storage, path);
          
          await uploadBytes(storageRef, blob);
          uploadedVideoUrl = await getDownloadURL(storageRef);

          // Upload thumbnail
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

      // Extract mentions
      const mentionRegex = /@([\w\s]+?)(?=\s{2,}|$|@|\n)/g;
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
          continue;
        }
        
        try {
          const coursesQuery = query(collection(db, "courses"));
          const coursesSnap = await getDocs(coursesQuery);
          
          coursesSnap.forEach((doc) => {
            const data = doc.data();
            const courseName = data.course_name || data.courseName || "";
            
            if (courseName.toLowerCase() === mentionText.toLowerCase() &&
                !extractedCourses.find((c) => c.courseId === data.id)) {
              extractedCourses.push({
                courseId: data.id,
                courseName: courseName,
              });
            }
          });
        } catch (err) {
          console.error("Error matching course mentions:", err);
        }
      }

      // Build post data with full architecture
      const postData: any = {
        content: content.trim(),
        postType: selectedType,
        
        // Region data
        regionKey: currentUserData.regionKey || "",
        geohash: geohash,
        location: {
          city: userCity,
          state: userState,
          latitude: userLat || null,
          longitude: userLon || null,
        },
        
        // Denormalized user data
        userName: currentUserData.displayName || "Unknown",
        userAvatar: currentUserData.avatar || null,
        userHandicap: currentUserData.handicap || null,
        userType: currentUserData.userType || "Golfer",
        userVerified: currentUserData.verified === true || currentUserData.verification?.status === "approved",
        
        // Media
        hasMedia: uploadedImageUrls.length > 0 || uploadedVideoUrl !== null,
        mediaType: uploadedImageUrls.length > 0 ? "images" : uploadedVideoUrl ? "video" : null,
        imageUrls: uploadedImageUrls,
        imageCount: uploadedImageUrls.length,
        imageUrl: null, // Deprecated
        videoUrl: uploadedVideoUrl,
        videoThumbnailUrl: uploadedThumbnailUrl,
        videoDuration: uploadedVideoUrl ? (trimEnd - trimStart) : null,
        videoTrimStart: uploadedVideoUrl ? trimStart : null,
        videoTrimEnd: uploadedVideoUrl ? trimEnd : null,
        
        // Engagement
        likes: 0,
        likedBy: [],
        comments: 0,
        engagementScore: 0,
        lastActivityAt: new Date(),
        viewCount: 0,
        
        // Search
        contentLowercase: content.trim().toLowerCase(),
        hashtags: extractHashtags(content),
        
        // Tags
        taggedPartners: extractedPartners.map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
        })),
        taggedCourses: extractedCourses.map((c) => ({
          courseId: c.courseId,
          courseName: c.courseName,
        })),
        
        // Moderation
        isReported: false,
        reportCount: 0,
        isHidden: false,
        moderatedAt: null,
        moderatedBy: null,
        
        // Performance
        createdAtTimestamp: Date.now(),
      };

      if (isEditMode && editingPostId) {
        await updateDoc(doc(db, "thoughts", editingPostId), postData);
        soundPlayer.play('postThought');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert("Updated ✏️", "Your thought has been updated.");
      } else {
        const newPostRef = await addDoc(collection(db, "thoughts"), {
          thoughtId: `thought_${Date.now()}`,
          userId: uid,
          ...postData,
          createdAt: new Date(),
        });

        await updateRateLimitTimestamp("post");

        if (extractedPartners.length > 0) {
          extractedPartners.forEach(async (partner) => {
            await createNotification({
              userId: partner.userId,
              type: "mention_post",
              actorId: uid,
              postId: newPostRef.id,
            });
          });
        }

        soundPlayer.play('postThought');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert("Tee'd Up ⛳️", "Your thought has been published.");
      }

      router.back();
    } catch (err) {
      console.error("Post error:", err);
      soundPlayer.play('error');
      Alert.alert("Error", "Failed to post. Please try again.");
      setIsPosting(false);
    }
  };

  /* --------------------------- TOGGLE VIDEO PLAYBACK --------------------------- */

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

  /* --------------------------- UI ---------------------------- */

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={handleClose}
          style={styles.closeButton}
        >
          <Image
            source={require("@/assets/icons/Close.png")}
            style={styles.closeIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {isEditMode ? "Edit Thought" : "Create Thought"}
        </Text>

        <View style={styles.headerRightButtons}>
          {isEditMode && (
            <TouchableOpacity
              onPress={handleDelete}
              disabled={isPosting}
              style={styles.deleteButton}
            >
              <Text style={styles.deleteIcon}>🗑️</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handlePost}
            disabled={!writable || isPosting}
            style={[
              styles.postButton,
              (!writable || isPosting) && styles.postButtonDisabled,
            ]}
          >
            <Text style={styles.flagIcon}>{isEditMode ? "✏️" : "⛳"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!writable && (
        <View style={styles.lockBanner}>
          <Text style={styles.lockText}>
            Posting unlocks once verification is approved.
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex1}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView 
          ref={scrollViewRef}
          style={styles.content} 
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* MEDIA SECTION */}
          <View style={styles.section}>
            {isProcessingMedia ? (
              <View style={styles.mediaPreviewBox}>
                <ActivityIndicator size="large" color="#0D5C3A" />
                <Text style={styles.processingText}>Processing media...</Text>
              </View>
            ) : (imageUris.length > 0 || videoUri) ? (
              <View>
                {/* IMAGE CAROUSEL */}
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
                            onPress={() => removeImage(index)}
                          >
                            <Text style={styles.removeImageText}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      keyExtractor={(item, index) => `image-${index}`}
                    />
                    
                    {/* Pagination Dots */}
                    {imageUris.length > 1 && (
                      <View style={styles.paginationDots}>
                        {imageUris.map((_, index) => (
                          <View
                            key={index}
                            style={[
                              styles.dot,
                              currentImageIndex === index && styles.dotActive,
                            ]}
                          />
                        ))}
                      </View>
                    )}
                    
                    {/* Add More Button */}
                    {imageUris.length < MAX_IMAGES && (
                      <TouchableOpacity
                        style={styles.addMoreButton}
                        onPress={addMoreImages}
                      >
                        <Text style={styles.addMoreText}>
                          + Add More ({imageUris.length}/{MAX_IMAGES})
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* VIDEO PREVIEW */}
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
                      
                      {/* Play Button Overlay */}
                      {!isVideoPlaying && (
                        <TouchableOpacity
                          style={styles.videoPlayOverlay}
                          onPress={toggleVideoPlayback}
                        >
                          <View style={styles.playButton}>
                            <Text style={styles.playIcon}>▶</Text>
                          </View>
                        </TouchableOpacity>
                      )}
                      
                      {isVideoPlaying && (
                        <TouchableOpacity
                          style={styles.videoPauseOverlay}
                          onPress={toggleVideoPlayback}
                        >
                          <View style={styles.pauseButton}>
                            <Text style={styles.pauseIcon}>⏸</Text>
                          </View>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Video Trimmer */}
                    {showVideoTrimmer && (
                      <View style={styles.videoTrimmer}>
                        <Text style={styles.trimmerLabel}>
                          Trim Video: {trimStart.toFixed(1)}s - {trimEnd.toFixed(1)}s 
                          ({(trimEnd - trimStart).toFixed(1)}s clip)
                        </Text>
                        
                        <View style={styles.sliderContainer}>
                          <Text style={styles.sliderLabel}>Start</Text>
                          <Slider
                            style={styles.slider}
                            minimumValue={0}
                            maximumValue={Math.max(0, videoDuration - 1)}
                            value={trimStart}
                            onValueChange={(value) => {
                              setTrimStart(value);
                              if (trimEnd - value > MAX_VIDEO_DURATION) {
                                setTrimEnd(value + MAX_VIDEO_DURATION);
                              }
                            }}
                            minimumTrackTintColor="#0D5C3A"
                            maximumTrackTintColor="#E0E0E0"
                            thumbTintColor="#0D5C3A"
                          />
                          <Text style={styles.sliderValue}>{trimStart.toFixed(1)}s</Text>
                        </View>

                        <View style={styles.sliderContainer}>
                          <Text style={styles.sliderLabel}>End</Text>
                          <Slider
                            style={styles.slider}
                            minimumValue={trimStart + 1}
                            maximumValue={Math.min(videoDuration, trimStart + MAX_VIDEO_DURATION)}
                            value={trimEnd}
                            onValueChange={setTrimEnd}
                            minimumTrackTintColor="#0D5C3A"
                            maximumTrackTintColor="#E0E0E0"
                            thumbTintColor="#0D5C3A"
                          />
                          <Text style={styles.sliderValue}>{trimEnd.toFixed(1)}s</Text>
                        </View>
                      </View>
                    )}

                    {/* Remove Video Button */}
                    <TouchableOpacity
                      style={styles.removeVideoButton}
                      onPress={() => {
                        soundPlayer.play('click');
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setVideoUri(null);
                        setVideoThumbnailUri(null);
                        setMediaType(null);
                        setShowVideoTrimmer(false);
                        setIsVideoPlaying(false);
                      }}
                    >
                      <Text style={styles.removeMediaText}>✕ Remove Video</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              /* UNIFIED MEDIA PICKER */
              <TouchableOpacity
                style={styles.mediaPickerButton}
                onPress={pickMedia}
                disabled={!writable}
              >
                <Text style={styles.mediaPickerIcon}>📷</Text>
                <Text style={styles.mediaPickerText}>Select Media</Text>
                <Text style={styles.mediaPickerHint}>Add up to 3 photos</Text>
                <Text style={styles.mediaPickerHint}>or 1 video (30s max)</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* THOUGHT TYPE SELECTOR */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Thought Type</Text>
            <View style={styles.typeGrid}>
              {availableTypes.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.typeCard,
                    selectedType === type.id && styles.typeCardActive,
                  ]}
                  onPress={() => {
                    soundPlayer.play('click');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedType(type.id);
                  }}
                >
                  <Text
                    style={[
                      styles.typeCardText,
                      selectedType === type.id && styles.typeCardTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* CONTENT INPUT */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              Tap @ to tag partners or courses
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="What clicked for you today?"
              placeholderTextColor="#999"
              multiline
              maxLength={MAX_CHARACTERS}
              value={content}
              onChangeText={handleContentChange}
              editable={writable}
              autoCorrect={true}
              autoCapitalize="sentences"
              spellCheck={true}
              textAlignVertical="top"
            />
            
            {selectedMentions.length > 0 && (
              <View style={styles.mentionsPreview}>
                <Text style={styles.mentionsLabel}>Tagged:</Text>
                <View style={styles.mentionChips}>
                  {selectedMentions.map((mention, idx) => (
                    <View key={idx} style={styles.mentionChip}>
                      <Text style={styles.mentionChipText}>{mention}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            
            <Text style={styles.charCount}>{content.length}/{MAX_CHARACTERS}</Text>

            {/* AUTOCOMPLETE DROPDOWN */}
            {showAutocomplete && autocompleteResults.length > 0 && (
              <View style={styles.autocompleteContainer}>
                <ScrollView 
                  style={styles.autocompleteScrollView}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {autocompleteResults.map((item, idx) => (
                    <TouchableOpacity
                      key={`${item.userId || item.courseId}-${idx}`}
                      style={styles.autocompleteItem}
                      onPress={() => handleSelectMention(item)}
                    >
                      <Text style={styles.autocompleteName}>
                        {item.type === "partner"
                          ? `@${item.displayName}`
                          : `@${item.courseName}`}
                      </Text>
                      {item.type === "course" && item.location && (
                        <Text style={styles.autocompleteLocation}>{item.location}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* --------------------------- STYLES ---------------------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  flex1: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  closeButton: {
    width: 40,
    alignItems: "flex-start",
  },

  closeIcon: {
    width: 28,
    height: 28,
    tintColor: "#FFFFFF",
  },

  headerTitle: { 
    color: "#FFFFFF", 
    fontWeight: "700", 
    fontSize: 18,
    flex: 1,
    textAlign: "center",
  },

  headerRightButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  deleteButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  deleteIcon: {
    fontSize: 22,
  },

  postButton: {
    width: 44,
    height: 44,
    backgroundColor: "#FFD700",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  postButtonDisabled: {
    opacity: 0.4,
  },

  flagIcon: {
    fontSize: 24,
  },

  lockBanner: {
    backgroundColor: "#FFF3CD",
    borderColor: "#FFECB5",
    borderWidth: 1,
    padding: 12,
    margin: 12,
    borderRadius: 10,
  },

  lockText: {
    color: "#664D03",
    textAlign: "center",
    fontWeight: "600",
  },

  content: {
    flex: 1,
    padding: 16,
  },

  section: {
    marginBottom: 24,
  },

  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 12,
  },

  // Unified Media Picker
  mediaPickerButton: {
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

  mediaPickerIcon: {
    fontSize: 48,
    marginBottom: 12,
  },

  mediaPickerText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
  },

  mediaPickerHint: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    marginTop: 2,
  },

  // Image Carousel
  imageCarouselItem: {
    height: 240,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },

  carouselImage: {
    width: "100%",
    height: "100%",
  },

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

  removeImageText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },

  paginationDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 12,
    gap: 6,
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#CCC",
  },

  dotActive: {
    backgroundColor: "#0D5C3A",
    width: 24,
  },

  addMoreButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
  },

  addMoreText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 14,
  },

  // Media Preview
  mediaPreviewBox: {
    width: "100%",
    height: 240,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  mediaPreview: {
    width: "100%",
    height: "100%",
  },

  processingText: {
    color: "#0D5C3A",
    marginTop: 12,
    fontSize: 14,
    fontWeight: "600",
  },

  // Video Controls
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },

  videoPauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },

  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },

  playIcon: {
    fontSize: 28,
    color: "#0D5C3A",
    marginLeft: 4,
  },

  pauseButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },

  pauseIcon: {
    fontSize: 24,
    color: "#0D5C3A",
  },

  removeVideoButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#FF3B30",
    alignItems: "center",
  },

  removeMediaText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 14,
  },

  // Video Trimmer
  videoTrimmer: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  trimmerLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 16,
    textAlign: "center",
  },

  sliderContainer: {
    marginBottom: 16,
  },

  sliderLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },

  slider: {
    width: "100%",
    height: 40,
  },

  sliderValue: {
    fontSize: 12,
    color: "#0D5C3A",
    fontWeight: "700",
    textAlign: "right",
    marginTop: 4,
  },

  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  typeCard: {
    flex: 1,
    minWidth: "45%",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 2,
    borderColor: "#E0E0E0",
    alignItems: "center",
  },

  typeCardActive: {
    backgroundColor: "#0D5C3A",
    borderColor: "#0D5C3A",
  },

  typeCardText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },

  typeCardTextActive: {
    color: "#FFF",
  },

  textInput: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  mentionsPreview: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "rgba(13, 92, 58, 0.05)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(13, 92, 58, 0.2)",
  },

  mentionsLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 6,
  },

  mentionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },

  mentionChip: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },

  mentionChipText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
  },

  charCount: {
    fontSize: 12,
    color: "#999",
    textAlign: "right",
    marginTop: 4,
  },

  autocompleteContainer: {
    backgroundColor: "#FFF",
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    maxHeight: 200,
  },

  autocompleteScrollView: {
    maxHeight: 200,
  },

  autocompleteItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },

  autocompleteName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  autocompleteLocation: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
});