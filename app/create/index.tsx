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
  
  // Golfers and Juniors only need to accept terms
  if (userData.userType === "Golfer" || userData.userType === "Junior") {
    return userData.acceptedTerms === true;
  }
  
  // Courses and PGA Professionals need verification
  if (userData.userType === "Course" || userData.userType === "PGA Professional") {
    return userData.verified === true || userData.verification?.status === "approved";
  }
  
  return false;
}

/* -------------------------------- CONFIG -------------------------------- */

const MAX_CHARACTERS = 280;
const MAX_VIDEO_DURATION = 30; // seconds
const MAX_IMAGE_WIDTH = 1080; // Compress images to max 1080px width
const IMAGE_QUALITY = 0.7; // JPEG quality

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
  const router = useRouter();
  const { editId } = useLocalSearchParams();

  const [selectedType, setSelectedType] = useState("swing-thought");
  const [content, setContent] = useState("");
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [videoThumbnailUri, setVideoThumbnailUri] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);

  // Video trimming states
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(30);
  const [showVideoTrimmer, setShowVideoTrimmer] = useState(false);

  const videoRef = useRef<Video>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const [userData, setUserData] = useState<any>(null);
  const writable = canWrite(userData);

  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteType, setAutocompleteType] = useState<"partner" | "course" | null>(null);
  const [autocompleteResults, setAutocompleteResults] = useState<any[]>([]);
  const [currentMention, setCurrentMention] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]); // Track validated mentions

  const [allPartners, setAllPartners] = useState<Partner[]>([]);

  // Edit mode states
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* --------------------------- KEYBOARD HANDLING --------------------------- */

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => {
        // Scroll to bottom when keyboard shows
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
        
        // Load user's partners
        const partners = snap.data()?.partners || [];
        console.log("👥 Raw partners array:", partners);
        
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
          
          console.log("✅ Loaded partners:", partnerList);
          setAllPartners(partnerList);
        } else {
          console.log("❌ No partners found in user document");
          setAllPartners([]); // Set empty array
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
        
        // Check if current user owns this post
        if (postData.userId !== auth.currentUser?.uid) {
          soundPlayer.play('error');
          Alert.alert("Error", "You can only edit your own posts");
          router.back();
          return;
        }

        // Load post data into form
        setIsEditMode(true);
        setEditingPostId(editId);
        setContent(postData.content || "");
        setSelectedType(postData.postType || "swing-thought");
        
        // Load media
        if (postData.imageUrl) {
          setMediaUri(postData.imageUrl);
          setMediaType("image");
        } else if (postData.videoUrl) {
          setMediaUri(postData.videoUrl);
          setMediaType("video");
        }
        
        // Populate selectedMentions from existing tags
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
      return uri; // Return original if compression fails
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
          maxSize: 1080, // Max 1080p
          bitrate: 2000000, // 2 Mbps
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
      return uri; // Return original if compression fails
    }
  };

  /* --------------------------- VIDEO THUMBNAIL --------------------------- */

  const generateVideoThumbnail = async (videoUri: string): Promise<string> => {
    try {
      console.log("📸 Generating video thumbnail...");
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: 0, // Get first frame (0 milliseconds)
        quality: 0.8,
      });
      console.log("✅ Thumbnail generated:", uri);
      return uri;
    } catch (error) {
      console.error("❌ Thumbnail generation error:", error);
      soundPlayer.play('error');
      return videoUri; // Fallback to video URI if thumbnail generation fails
    }
  };

  /* --------------------------- MEDIA PICKER --------------------------- */

  const pickMedia = async (type: "image" | "video") => {
    try {
      // Play click sound for media selection
      soundPlayer.play('click');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // ✅ REQUEST PERMISSIONS FIRST
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
              onPress: () => {
                soundPlayer.play('click');
              }
            },
            { 
              text: 'Open Settings', 
              onPress: () => {
                soundPlayer.play('click');
                // On iOS, this will open app settings
                if (Platform.OS === 'ios') {
                  // Linking.openURL('app-settings:');
                }
              }
            }
          ]
        );
        return;
      }

      setIsProcessingMedia(true);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: type === "image" 
          ? ["images"]
          : ["videos"],
        allowsEditing: true, // ✅ Enable editing for BOTH image and video (iOS will let users crop/trim)
        aspect: [4, 3], // ✅ Force 4:3 aspect ratio for consistency across all media
        quality: 0.8,
        videoMaxDuration: 60, // Allow up to 60s, we'll trim to 30s
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];

        if (type === "image") {
          // Compress image
          const compressedUri = await compressImage(asset.uri);
          setMediaUri(compressedUri);
          setMediaType("image");
          setIsProcessingMedia(false);
        } else {
          // Video handling
          const duration = asset.duration || 0;
          
          // ✅ Validate video duration
          if (duration / 1000 > 60) {
            soundPlayer.play('error');
            Alert.alert(
              "Video Too Long",
              "Please select a video shorter than 60 seconds. You can trim it to 30 seconds in the next step.",
              [{ text: "OK", onPress: () => soundPlayer.play('click') }]
            );
            setIsProcessingMedia(false);
            return;
          }
          
          // Compress video
          const compressedUri = await compressVideo(asset.uri);
          
          // ✅ Generate thumbnail from first frame
          const thumbnailUri = await generateVideoThumbnail(compressedUri);
          
          setVideoDuration(duration / 1000); // Convert to seconds
          setMediaUri(compressedUri);
          setMediaType("video");
          setVideoThumbnailUri(thumbnailUri); // Store thumbnail URI

          if (duration / 1000 > MAX_VIDEO_DURATION) {
            // Show trimmer if video is longer than 30s
            setTrimStart(0);
            setTrimEnd(MAX_VIDEO_DURATION);
            setShowVideoTrimmer(true);
            
            // Show helpful message
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

  /* --------------------------- AUTOCOMPLETE LOGIC --------------------------- */

  const handleContentChange = (text: string) => {
    setContent(text);

    // Clean up selectedMentions - remove any that are no longer in the content
    const cleanedMentions = selectedMentions.filter((mention) => 
      text.includes(mention)
    );
    if (cleanedMentions.length !== selectedMentions.length) {
      setSelectedMentions(cleanedMentions);
    }

    // Detect @ mention
    const lastAtIndex = text.lastIndexOf("@");
    if (lastAtIndex === -1) {
      setShowAutocomplete(false);
      return;
    }

    // Get text after last @
    const afterAt = text.slice(lastAtIndex + 1);
    
    // Close autocomplete if user types double space (end of mention)
    if (afterAt.endsWith("  ") || afterAt.includes("\n")) {
      setShowAutocomplete(false);
      return;
    }
    
    setCurrentMention(afterAt);

    // Debounce search - trigger after 1 character now
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
      // Search partners
      const partnerResults = allPartners.filter((p) =>
        p.displayName.toLowerCase().includes(searchText.toLowerCase())
      );

      // Search cached courses
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

      // If we have both, show partners first, then courses
      if (partnerResults.length > 0 || courseResults.length > 0) {
        const combined = [
          ...partnerResults.map((p) => ({ ...p, type: "partner" })),
          ...courseResults,
        ];
        setAutocompleteResults(combined);
        setShowAutocomplete(true);
        return;
      }

      // If no cached courses, try API
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
      // Search cached courses first
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

      // Fall back to API
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
    // Play click sound for mention selection
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const lastAtIndex = content.lastIndexOf("@");
    const beforeAt = content.slice(0, lastAtIndex);
    const afterMention = content.slice(lastAtIndex + 1 + currentMention.length);
    
    let mentionText = "";
    
    if (item.type === "partner") {
      // Insert partner displayName with @ (keeping spaces)
      mentionText = `@${item.displayName}`;
      setContent(`${beforeAt}${mentionText} ${afterMention}`);
    } else if (item.type === "course") {
      // Insert course name with @ (keeping spaces)
      mentionText = `@${item.courseName}`;
      setContent(`${beforeAt}${mentionText} ${afterMention}`);
      
      // Save course to Firestore if it doesn't exist yet
      try {
        const courseQuery = query(
          collection(db, "courses"),
          where("id", "==", item.courseId)
        );
        const courseSnap = await getDocs(courseQuery);
        
        if (courseSnap.empty) {
          // Course doesn't exist in Firestore, add it
          await addDoc(collection(db, "courses"), {
            id: item.courseId,
            course_name: item.courseName,
            location: item.location ? {
              city: item.location.split(", ")[0],
              state: item.location.split(", ")[1]
            } : null,
          });
          console.log("✅ Saved new course to Firestore:", item.courseName);
        }
      } catch (err) {
        console.error("Error saving course to Firestore:", err);
        soundPlayer.play('error');
      }
    }

    // Add to validated mentions list
    if (mentionText && !selectedMentions.includes(mentionText)) {
      setSelectedMentions([...selectedMentions, mentionText]);
    }

    setShowAutocomplete(false);
  };

  /* --------------------------- HANDLE CLOSE WITH WARNING --------------------------- */

  const handleClose = async () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // If there's content or media, show warning
    if (content.trim() || mediaUri) {
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
      // No content, just close
      router.back();
    }
  };

  /* --------------------------- DELETE POST ---------------------------- */

  const handleDelete = async () => {
    if (!editingPostId) return;

    // Play click sound for delete button
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
    // Play click sound for post button
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // ✅ ANTI-BOT CHECK 1: Email Verification
    const emailVerified = await isEmailVerified();
    if (!emailVerified) {
      soundPlayer.play('error');
      Alert.alert("Email Not Verified", EMAIL_VERIFICATION_MESSAGE);
      return;
    }

    // ✅ ANTI-BOT CHECK 2: Rate Limiting (skip for edit mode)
    if (!isEditMode) {
      const { allowed, remainingSeconds } = await checkRateLimit("post");
      if (!allowed) {
        soundPlayer.play('error');
        Alert.alert("Please Wait", getRateLimitMessage("post", remainingSeconds));
        return;
      }
    }

    // Existing checks
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
      let uploadedMediaUrl = mediaUri; // Keep existing URL if not changed
      let uploadedThumbnailUrl: string | null = null;
      let mediaUrlField: "imageUrl" | "videoUrl" | null = null;

      // Only upload new media if mediaUri is a local file (starts with file://)
      if (mediaUri && mediaUri.startsWith('file://')) {
        const response = await fetch(mediaUri);
        const blob = await response.blob();
        
        const fileExtension = mediaType === "video" ? "mp4" : "jpg";
        const path = `posts/${auth.currentUser?.uid}/${Date.now()}.${fileExtension}`;
        const storageRef = ref(storage, path);

        await uploadBytes(storageRef, blob);
        uploadedMediaUrl = await getDownloadURL(storageRef);
        
        mediaUrlField = mediaType === "video" ? "videoUrl" : "imageUrl";
        console.log(`✅ Uploaded ${mediaType} to:`, uploadedMediaUrl);

        // ✅ If video, also upload thumbnail
        if (mediaType === "video" && videoThumbnailUri) {
          try {
            console.log("📸 Uploading video thumbnail...");
            const thumbnailResponse = await fetch(videoThumbnailUri);
            const thumbnailBlob = await thumbnailResponse.blob();
            const thumbnailPath = `posts/${auth.currentUser?.uid}/${Date.now()}_thumb.jpg`;
            const thumbnailRef = ref(storage, thumbnailPath);
            
            await uploadBytes(thumbnailRef, thumbnailBlob);
            uploadedThumbnailUrl = await getDownloadURL(thumbnailRef);
            console.log("✅ Thumbnail uploaded to:", uploadedThumbnailUrl);
          } catch (thumbError) {
            console.error("⚠️ Thumbnail upload failed:", thumbError);
            // Continue without thumbnail if upload fails
          }
        }
      } else if (mediaUri) {
        // Existing media URL from edit mode
        mediaUrlField = mediaType === "video" ? "videoUrl" : "imageUrl";
      }

      // Extract @mentions from content using same regex as rendering
      const mentionRegex = /@([\w\s]+?)(?=\s{2,}|$|@|\n)/g;
      const mentions = content.match(mentionRegex) || [];
      
      console.log("🔍 Extracted mentions from content:", mentions);
      
      const extractedPartners: Partner[] = [];
      const extractedCourses: Course[] = [];
      
      // Match mentions against partners and courses
      for (const mention of mentions) {
        const mentionText = mention.substring(1).trim(); // Remove @ and trim
        
        console.log("🔎 Checking mention:", mentionText);
        
        // Check if it's a partner
        const matchedPartner = allPartners.find(
          (p) => p.displayName.toLowerCase() === mentionText.toLowerCase()
        );
        
        if (matchedPartner && !extractedPartners.find((p) => p.userId === matchedPartner.userId)) {
          console.log("✅ Matched partner:", matchedPartner.displayName);
          extractedPartners.push(matchedPartner);
          continue;
        }
        
        // Check if it's a course (from cached courses)
        try {
          const coursesQuery = query(collection(db, "courses"));
          const coursesSnap = await getDocs(coursesQuery);
          
          let foundCourse = false;
          coursesSnap.forEach((doc) => {
            const data = doc.data();
            const courseName = data.course_name || data.courseName || "";
            
            console.log("📍 Comparing with course:", courseName);
            
            if (courseName.toLowerCase() === mentionText.toLowerCase() &&
                !extractedCourses.find((c) => c.courseId === data.id)) {
              console.log("✅ Matched course:", courseName);
              extractedCourses.push({
                courseId: data.id,
                courseName: courseName,
              });
              foundCourse = true;
            }
          });
          
          if (!foundCourse) {
            console.log("❌ No course match found for:", mentionText);
          }
        } catch (err) {
          console.error("Error matching course mentions:", err);
        }
      }
      
      console.log("📦 Final extracted partners:", extractedPartners);
      console.log("📦 Final extracted courses:", extractedCourses);

      const postData: any = {
        content: content.trim(),
        postType: selectedType,
        taggedPartners: extractedPartners.map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
        })),
        taggedCourses: extractedCourses.map((c) => ({
          courseId: c.courseId,
          courseName: c.courseName,
        })),
      };

      // Add media URL to appropriate field
      if (mediaUrlField === "imageUrl") {
        postData.imageUrl = uploadedMediaUrl;
        postData.videoUrl = null; // Clear video if switching to image
        postData.videoThumbnailUrl = null; // Clear thumbnail
      } else if (mediaUrlField === "videoUrl") {
        postData.videoUrl = uploadedMediaUrl;
        postData.imageUrl = null; // Clear image if switching to video
        postData.videoThumbnailUrl = uploadedThumbnailUrl; // Add thumbnail URL
        
        // Add video metadata
        postData.videoDuration = trimEnd - trimStart;
        postData.videoTrimStart = trimStart;
        postData.videoTrimEnd = trimEnd;
      } else {
        // No media
        postData.imageUrl = null;
        postData.videoUrl = null;
        postData.videoThumbnailUrl = null;
      }

      if (isEditMode && editingPostId) {
        // UPDATE existing post
        await updateDoc(doc(db, "thoughts", editingPostId), postData);
        soundPlayer.play('postThought');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Alert.alert("Updated ✏️", "Your thought has been updated.");
      } else {
        // CREATE new post
        const newPostRef = await addDoc(collection(db, "thoughts"), {
          thoughtId: `thought_${Date.now()}`,
          userId: auth.currentUser?.uid,
          userType: userData?.userType,
          ...postData,
          createdAt: new Date(),
          likes: 0,
          likedBy: [],
          comments: 0,
        });

        // ✅ ANTI-BOT: Update rate limit timestamp
        await updateRateLimitTimestamp("post");

        // Create mention notifications for tagged partners
        const currentUserId = auth.currentUser?.uid;
        if (extractedPartners.length > 0 && currentUserId) {
          extractedPartners.forEach(async (partner) => {
            await createNotification({
              userId: partner.userId,
              type: "mention_post",
              actorId: currentUserId,
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

  /* --------------------------- UI ---------------------------- */

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* HEADER - Outside KeyboardAvoidingView so it stays fixed */}
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
          {/* Delete button (only in edit mode) */}
          {isEditMode && (
            <TouchableOpacity
              onPress={handleDelete}
              disabled={isPosting}
              style={styles.deleteButton}
            >
              <Text style={styles.deleteIcon}>🗑️</Text>
            </TouchableOpacity>
          )}

          {/* Submit button */}
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

      {/* LOCK BANNER */}
      {!writable && (
        <View style={styles.lockBanner}>
          <Text style={styles.lockText}>
            Posting unlocks once verification is approved.
          </Text>
        </View>
      )}

      {/* Content wrapped in KeyboardAvoidingView */}
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
          {/* MEDIA PREVIEW */}
          <View style={styles.section}>
            {isProcessingMedia ? (
              <View style={styles.mediaPreviewBox}>
                <ActivityIndicator size="large" color="#0D5C3A" />
                <Text style={styles.processingText}>Compressing media...</Text>
              </View>
            ) : mediaUri ? (
              <View>
                <View style={styles.mediaPreviewBox}>
                  {mediaType === "image" ? (
                    <Image source={{ uri: mediaUri }} style={styles.mediaPreview} />
                  ) : (
                    <Video
                      ref={videoRef}
                      source={{ uri: mediaUri }}
                      style={styles.mediaPreview}
                      resizeMode={ResizeMode.COVER}
                      shouldPlay
                      isLooping
                      isMuted
                    />
                  )}
                </View>

                {/* Video Trimmer */}
                {mediaType === "video" && showVideoTrimmer && (
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

                {/* Media Type Toggle & Remove Button */}
                <View style={styles.mediaActions}>
                  <TouchableOpacity
                    style={styles.changeMediaButton}
                    onPress={() => pickMedia(mediaType === "image" ? "video" : "image")}
                  >
                    <Text style={styles.changeMediaText}>
                      Switch to {mediaType === "image" ? "Video 🎥" : "Image 📸"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.removeMediaButton}
                    onPress={() => {
                      soundPlayer.play('click');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setMediaUri(null);
                      setMediaType(null);
                      setVideoThumbnailUri(null); // Clear thumbnail
                      setShowVideoTrimmer(false);
                    }}
                  >
                    <Text style={styles.removeMediaText}>✕ Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.mediaPickerButtons}>
                <TouchableOpacity
                  style={styles.mediaPickerButton}
                  onPress={() => pickMedia("image")}
                  disabled={!writable}
                >
                  <Text style={styles.mediaPickerIcon}>📸</Text>
                  <Text style={styles.mediaPickerText}>Add Image</Text>
                  <Text style={styles.mediaPickerHint}>Photos get 3x more likes</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.mediaPickerButton}
                  onPress={() => pickMedia("video")}
                  disabled={!writable}
                >
                  <Text style={styles.mediaPickerIcon}>🎥</Text>
                  <Text style={styles.mediaPickerText}>Add Video</Text>
                  <Text style={styles.mediaPickerHint}>Up to 30 seconds</Text>
                  <Text style={styles.mediaPickerHint2}>✂️ Crop & trim in picker</Text>
                </TouchableOpacity>
              </View>
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
            
            {/* Show validated mentions below input */}
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

          {/* Extra padding for keyboard */}
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

  // Media Picker Buttons
  mediaPickerButtons: {
    flexDirection: "row",
    gap: 12,
  },

  mediaPickerButton: {
    flex: 1,
    height: 160,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 2,
    borderColor: "#0D5C3A",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },

  mediaPickerIcon: {
    fontSize: 40,
    marginBottom: 8,
  },

  mediaPickerText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  mediaPickerHint: {
    fontSize: 11,
    color: "#666",
    textAlign: "center",
  },

  mediaPickerHint2: {
    fontSize: 10,
    color: "#0D5C3A",
    textAlign: "center",
    marginTop: 4,
    fontWeight: "600",
  },

  // Media Preview
  mediaPreviewBox: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
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

  // Media Actions
  mediaActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },

  changeMediaButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#0D5C3A",
    borderRadius: 8,
    alignItems: "center",
  },

  changeMediaText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 13,
  },

  removeMediaButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#FF3B30",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  removeMediaText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 13,
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