import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { auth, db, storage } from "@/constants/firebaseConfig";
import {
  checkRateLimit,
  EMAIL_VERIFICATION_MESSAGE,
  getRateLimitMessage,
  isEmailVerified,
  updateRateLimitTimestamp
} from "@/utils/rateLimitHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import { getUserProfile } from "@/utils/userProfileHelpers";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BadgeRow from "@/components/challenges/BadgeRow";

interface Props {
  visible: boolean;
  thoughtId: string;
  postContent: string;
  postOwnerId: string;
  onClose: () => void;
  onCommentAdded: () => void;
}

interface TaggedEvent {
  eventId: string;
  eventName: string;
  eventType: "tournament" | "outing" | "league";
}

interface Comment {
  id: string;
  content: string;
  userId: string;
  createdAt: any;
  likes?: number;
  likedBy?: string[];
  taggedPartners?: { userId: string; displayName: string }[];
  taggedCourses?: { courseId: number; courseName: string }[];
  taggedEvents?: TaggedEvent[];
  imageUrl?: string;
  parentCommentId?: string;
  depth: number;
  replyCount: number;
  isOptimistic?: boolean;
}

interface UserProfile {
  displayName: string;
  avatar?: string;
  challengeBadges?: string[];
}

export default function CommentsModal({
  visible,
  thoughtId,
  postOwnerId,
  onClose,
  onCommentAdded,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hashDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [originalEditText, setOriginalEditText] = useState("");
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyingToUsername, setReplyingToUsername] = useState("");
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  // @ tagging state
  const [taggedPartners, setTaggedPartners] = useState<{ userId: string; displayName: string }[]>([]);
  const [taggedCourses, setTaggedCourses] = useState<{ courseId: number; courseName: string }[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteType, setAutocompleteType] = useState<"partner" | "course" | null>(null);
  const [autocompleteResults, setAutocompleteResults] = useState<any[]>([]);
  const [currentMention, setCurrentMention] = useState("");
  const [triggerIndex, setTriggerIndex] = useState<number>(-1);
  const [allPartners, setAllPartners] = useState<{ userId: string; displayName: string }[]>([]);
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);

  // # tagging state
  const [taggedEvents, setTaggedEvents] = useState<TaggedEvent[]>([]);
  const [showHashAutocomplete, setShowHashAutocomplete] = useState(false);
  const [hashAutocompleteResults, setHashAutocompleteResults] = useState<any[]>([]);
  const [currentHashTag, setCurrentHashTag] = useState("");
  const [hashTriggerIndex, setHashTriggerIndex] = useState<number>(-1);
  const [selectedHashTags, setSelectedHashTags] = useState<string[]>([]);

  // Image state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [viewerImage, setViewerImage] = useState<string | null>(null);

  const currentUserId = auth.currentUser?.uid;

  // ============================================================================
  // LOAD CURRENT USER + PARTNERS
  // ============================================================================

  useEffect(() => {
    if (!visible || !currentUserId) return;
    const loadCurrentUser = async () => {
      try {
        const userProfile = await getUserProfile(currentUserId);
        setUserMap(prev => ({
          ...prev,
          [currentUserId]: {
            displayName: userProfile.displayName,
            avatar: userProfile.avatar || undefined,
            challengeBadges: userProfile.challengeBadges || [],
          },
        }));
      } catch (error) {
        console.error("Error loading current user profile:", error);
      }
    };
    loadCurrentUser();
  }, [visible, currentUserId]);

  useEffect(() => {
    if (!visible || !currentUserId) return;
    const loadPartners = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", currentUserId));
        if (userDoc.exists()) {
          const partners = userDoc.data()?.partners || [];
          if (partners.length > 0) {
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
        } else {
          setAllPartners([]);
        }
      } catch (error) {
        console.error("Error loading partners:", error);
        setAllPartners([]);
      }
    };
    loadPartners();
  }, [visible, currentUserId]);

  // ============================================================================
  // COMMENTS LISTENER
  // ============================================================================

  useEffect(() => {
    if (!visible || !thoughtId) return;
    setLoading(true);
    const q = query(
      collection(db, "thoughts", thoughtId, "comments"),
      orderBy("createdAt", "asc")
    );
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const loaded: Comment[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          parentCommentId: data.parentCommentId || null,
          depth: data.depth ?? 0,
          replyCount: data.replyCount ?? 0,
          isOptimistic: false,
        } as Comment;
      });
      setComments(prev => {
        const stillPendingOptimistic = prev.filter(c =>
          c.isOptimistic && !loaded.some(real =>
            real.content === c.content && real.userId === c.userId
          )
        );
        return [...loaded, ...stillPendingOptimistic];
      });
      const uniqueUserIds = Array.from(new Set(loaded.map((c) => c.userId)));
      const userData: Record<string, UserProfile> = {};
      await Promise.all(
        uniqueUserIds.map(async (uid) => {
          try {
            const userProfile = await getUserProfile(uid);
            userData[uid] = {
              displayName: userProfile.displayName,
              avatar: userProfile.avatar || undefined,
              challengeBadges: userProfile.challengeBadges || [],
            };
          } catch {
            userData[uid] = { displayName: "[Deleted User]", avatar: undefined };
          }
        })
      );
      setUserMap(prev => ({ ...prev, ...userData }));
      setLoading(false);
    }, (error) => {
      console.error("Comments listener error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [visible, thoughtId]);

  // ============================================================================
  // IMAGE HANDLING
  // ============================================================================

  const pickImage = async () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Add Photo", "Choose a source", [
      { text: "Camera", onPress: () => launchCamera() },
      { text: "Photo Library", onPress: () => launchLibrary() },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "Camera access is required to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      await compressAndSetImage(result.assets[0].uri);
    }
  };

  const launchLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "Photo library access is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      await compressAndSetImage(result.assets[0].uri);
    }
  };

  const compressAndSetImage = async (uri: string) => {
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 600 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
      );
      setSelectedImage(compressed.uri);
      soundPlayer.play('click');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Image compression error:", error);
      soundPlayer.play('error');
      Alert.alert("Error", "Failed to process image. Please try again.");
    }
  };

  const removeSelectedImage = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedImage(null);
  };

  const uploadImageToStorage = async (commentId: string): Promise<string | null> => {
    if (!selectedImage) return null;
    try {
      setUploadingImage(true);
      const response = await fetch(selectedImage);
      const blob = await response.blob();
      const storageRef = ref(storage, `comments/${thoughtId}/${commentId}.jpg`);
      await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(storageRef);
      setUploadingImage(false);
      return downloadUrl;
    } catch (error) {
      console.error("Image upload error:", error);
      setUploadingImage(false);
      throw error;
    }
  };

  // ============================================================================
  // TEXT INPUT + AUTOCOMPLETE TRIGGERS (@ and #)
  // ============================================================================

  const handleTextChange = (newText: string) => {
    setText(newText);

    // Clean up removed @ mentions
    const cleanedMentions = selectedMentions.filter((mention) => newText.includes(mention));
    if (cleanedMentions.length !== selectedMentions.length) {
      setSelectedMentions(cleanedMentions);
    }

    // Clean up removed # tags
    const cleanedHashTags = selectedHashTags.filter((tag) => newText.includes(tag));
    if (cleanedHashTags.length !== selectedHashTags.length) {
      setSelectedHashTags(cleanedHashTags);
    }

    // --- Detect # trigger ---
    const lastHashIndex = newText.lastIndexOf("#");
    const lastAtIndex = newText.lastIndexOf("@");

    // Determine which trigger is more recent (further right in the string)
    if (lastHashIndex > lastAtIndex) {
      // # is the active trigger
      const afterHash = newText.slice(lastHashIndex + 1);
      // Cancel if user typed double space or newline after #
      if (afterHash.endsWith("  ") || afterHash.includes("\n")) {
        setShowHashAutocomplete(false);
        setShowAutocomplete(false);
        return;
      }
      // Only trigger if # is at start or preceded by a space
      const charBefore = lastHashIndex > 0 ? newText[lastHashIndex - 1] : " ";
      if (charBefore !== " " && lastHashIndex !== 0) {
        setShowHashAutocomplete(false);
        return;
      }
      setCurrentHashTag(afterHash);
      setHashTriggerIndex(lastHashIndex);
      setShowAutocomplete(false); // dismiss @ autocomplete

      if (hashDebounceRef.current) clearTimeout(hashDebounceRef.current);
      hashDebounceRef.current = setTimeout(() => {
        if (afterHash.length >= 1) searchEvents(afterHash);
      }, 300);
      return;
    }

    // --- Detect @ trigger ---
    setShowHashAutocomplete(false); // dismiss # autocomplete

    if (lastAtIndex === -1) {
      setShowAutocomplete(false);
      return;
    }

    const afterAt = newText.slice(lastAtIndex + 1);
    if (afterAt.endsWith("  ") || afterAt.includes("\n")) {
      setShowAutocomplete(false);
      return;
    }

    setCurrentMention(afterAt);
    setTriggerIndex(lastAtIndex);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (afterAt.length >= 1) searchMentions(afterAt);
    }, 300);
  };

  // ============================================================================
  // @ SEARCH (Partners → Courses)
  // ============================================================================

  const searchMentions = async (searchText: string) => {
    try {
      const partnerResults = allPartners.filter((p) =>
        p.displayName.toLowerCase().includes(searchText.toLowerCase())
      );
      if (partnerResults.length > 0) {
        setAutocompleteType("partner");
        setAutocompleteResults(partnerResults);
        setShowAutocomplete(true);
        return;
      }
      searchCourses(searchText);
    } catch (err) {
      console.error("Search error:", err);
    }
  };

  const searchCourses = async (searchText: string) => {
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
            location: data.location ? `${data.location.city}, ${data.location.state}` : "",
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
      const courses = data.courses || [];
      if (courses.length > 0) {
        setAutocompleteType("course");
        setAutocompleteResults(
          courses.map((c: any) => ({
            courseId: c.id,
            courseName: c.course_name,
            location: `${c.location.city}, ${c.location.state}`,
          }))
        );
        setShowAutocomplete(true);
      }
    } catch (err) {
      console.error("Course search error:", err);
    }
  };

  // ============================================================================
  // # SEARCH (Tournaments → Outings → Leagues)
  // ============================================================================

  const searchEvents = async (searchText: string) => {
    try {
      const results: any[] = [];
      const lowerSearch = searchText.toLowerCase();

      // Search tournaments
      try {
        const tournamentsSnap = await getDocs(collection(db, "tournaments"));
        tournamentsSnap.forEach((d) => {
          const data = d.data();
          const name = data.name || "";
          if (name.toLowerCase().includes(lowerSearch)) {
            results.push({
              eventId: d.id,
              eventName: name,
              eventType: "tournament" as const,
              subtitle: data.course || "",
            });
          }
        });
      } catch (err) {
        console.error("Tournament search error:", err);
      }

      // Search outings
      try {
        const outingsSnap = await getDocs(collection(db, "outings"));
        outingsSnap.forEach((d) => {
          const data = d.data();
          const name = data.name || data.courseName || "";
          if (name.toLowerCase().includes(lowerSearch)) {
            results.push({
              eventId: d.id,
              eventName: name,
              eventType: "outing" as const,
              subtitle: data.parentType ? data.parentType.charAt(0).toUpperCase() + data.parentType.slice(1) : "Outing",
            });
          }
        });
      } catch (err) {
        console.error("Outing search error:", err);
      }

      // Search leagues
      try {
        const leaguesSnap = await getDocs(collection(db, "leagues"));
        leaguesSnap.forEach((d) => {
          const data = d.data();
          const name = data.name || "";
          if (name.toLowerCase().includes(lowerSearch)) {
            results.push({
              eventId: d.id,
              eventName: name,
              eventType: "league" as const,
              subtitle: data.format || "League",
            });
          }
        });
      } catch (err) {
        console.error("League search error:", err);
      }

      if (results.length > 0) {
        setHashAutocompleteResults(results);
        setShowHashAutocomplete(true);
      } else {
        setShowHashAutocomplete(false);
      }
    } catch (err) {
      console.error("Event search error:", err);
    }
  };

  // ============================================================================
  // AUTOCOMPLETE SELECTION — CLEAN REPLACE + TRAILING SPACE
  // ============================================================================

  const handleSelectMention = (item: any) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (autocompleteType === "partner") {
      if (taggedPartners.find((p) => p.userId === item.userId)) {
        setShowAutocomplete(false);
        return;
      }
      const beforeTrigger = text.slice(0, triggerIndex);
      const mentionText = `@${item.displayName}`;
      const newText = `${beforeTrigger}${mentionText} `;
      setText(newText);
      setTaggedPartners(prev => [...prev, { userId: item.userId, displayName: item.displayName }]);
      if (!selectedMentions.includes(mentionText)) {
        setSelectedMentions(prev => [...prev, mentionText]);
      }
    } else if (autocompleteType === "course") {
      if (taggedCourses.find((c) => c.courseId === item.courseId)) {
        setShowAutocomplete(false);
        return;
      }
      const beforeTrigger = text.slice(0, triggerIndex);
      const mentionText = `@${item.courseName}`;
      const newText = `${beforeTrigger}${mentionText} `;
      setText(newText);
      setTaggedCourses(prev => [...prev, { courseId: item.courseId, courseName: item.courseName }]);
      if (!selectedMentions.includes(mentionText)) {
        setSelectedMentions(prev => [...prev, mentionText]);
      }
    }

    setShowAutocomplete(false);
    setCurrentMention("");
    setTriggerIndex(-1);
  };

  const handleSelectHashTag = (item: any) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Prevent duplicate tags
    if (taggedEvents.find((e) => e.eventId === item.eventId)) {
      setShowHashAutocomplete(false);
      return;
    }

    const beforeTrigger = text.slice(0, hashTriggerIndex);
    const hashText = `#${item.eventName}`;
    const newText = `${beforeTrigger}${hashText} `;
    setText(newText);

    setTaggedEvents(prev => [...prev, {
      eventId: item.eventId,
      eventName: item.eventName,
      eventType: item.eventType,
    }]);

    if (!selectedHashTags.includes(hashText)) {
      setSelectedHashTags(prev => [...prev, hashText]);
    }

    setShowHashAutocomplete(false);
    setCurrentHashTag("");
    setHashTriggerIndex(-1);
  };

  // ============================================================================
  // RENDER COMMENT WITH @ AND # TAGS
  // ============================================================================

  const renderCommentWithTags = (comment: Comment) => {
    const { content, taggedPartners = [], taggedCourses = [], taggedEvents = [] } = comment;

    const mentionMap: { [key: string]: { type: string; data: any } } = {};

    taggedPartners.forEach((partner) => {
      mentionMap[`@${partner.displayName}`] = { type: 'partner', data: partner };
    });
    taggedCourses.forEach((course) => {
      const courseTagNoSpaces = `@${course.courseName.replace(/\s+/g, "")}`;
      mentionMap[courseTagNoSpaces] = { type: 'course', data: course };
      mentionMap[`@${course.courseName}`] = { type: 'course', data: course };
    });
    taggedEvents.forEach((event) => {
      mentionMap[`#${event.eventName}`] = { type: 'event', data: event };
      const noSpaces = `#${event.eventName.replace(/\s+/g, "")}`;
      mentionMap[noSpaces] = { type: 'event', data: event };
    });

    const mentionPatterns = Object.keys(mentionMap)
      .map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length);

    if (mentionPatterns.length === 0) {
      return <Text style={styles.commentText}>{content}</Text>;
    }

    const mentionRegex = new RegExp(`(${mentionPatterns.join('|')})`, 'g');
    const parts = content.split(mentionRegex);

    return (
      <Text style={styles.commentText}>
        {parts.map((part, index) => {
          const mention = mentionMap[part];
          if (mention) {
            return (
              <Text
                key={index}
                style={mention.type === 'event' ? styles.hashTag : styles.mention}
                onPress={() => {
                  soundPlayer.play('click');
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (mention.type === 'partner') {
                    router.push(`/locker/${mention.data.userId}`);
                  } else if (mention.type === 'course') {
                    router.push(`/locker/course/${mention.data.courseId}`);
                  } else if (mention.type === 'event') {
                    const event = mention.data as TaggedEvent;
                    if (event.eventType === "tournament") {
                      router.push(`/events/tournament/${event.eventId}` as any);
                    } else if (event.eventType === "outing") {
                      router.push(`/events/outing/${event.eventId}` as any);
                    } else if (event.eventType === "league") {
                      router.push(`/events/league/${event.eventId}` as any);
                    }
                  }
                }}
              >
                {part}
              </Text>
            );
          }
          return <Text key={index}>{part}</Text>;
        })}
      </Text>
    );
  };

  // ============================================================================
  // POST / EDIT COMMENT
  // ============================================================================

  const post = async () => {
    if (!text.trim() || !currentUserId) return;
    if (!isEmailVerified()) {
      soundPlayer.play('error');
      Alert.alert("Email Not Verified", EMAIL_VERIFICATION_MESSAGE);
      return;
    }
    if (!editingCommentId) {
      const { allowed, remainingSeconds } = await checkRateLimit("comment");
      if (!allowed) {
        soundPlayer.play('error');
        Alert.alert("Please Wait", getRateLimitMessage("comment", remainingSeconds));
        return;
      }
    }
    setPosting(true);
    soundPlayer.play('postThought');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const commentContent = text.trim();
    const commentTaggedPartners = [...taggedPartners];
    const commentTaggedCourses = [...taggedCourses];
    const commentTaggedEvents = [...taggedEvents];
    const commentReplyingTo = replyingToCommentId;
    const commentImage = selectedImage;

    try {
      if (editingCommentId) {
        await updateDoc(doc(db, "thoughts", thoughtId, "comments", editingCommentId), {
          content: commentContent,
          taggedPartners: commentTaggedPartners,
          taggedCourses: commentTaggedCourses,
          taggedEvents: commentTaggedEvents,
        });
        setEditingCommentId(null);
        setOriginalEditText("");
      } else {
        const parentComment = commentReplyingTo ? comments.find(c => c.id === commentReplyingTo) : null;
        const optimisticComment: Comment = {
          id: `optimistic-${Date.now()}`,
          content: commentContent,
          userId: currentUserId,
          createdAt: Timestamp.now(),
          likes: 0,
          likedBy: [],
          taggedPartners: commentTaggedPartners,
          taggedCourses: commentTaggedCourses,
          taggedEvents: commentTaggedEvents,
          parentCommentId: commentReplyingTo || undefined,
          depth: parentComment ? (parentComment.depth + 1) : 0,
          replyCount: 0,
          isOptimistic: true,
          imageUrl: commentImage || undefined,
        };
        setComments(prev => [...prev, optimisticComment]);
        if (commentReplyingTo) setExpandedComments(prev => new Set(prev).add(commentReplyingTo));
        setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

        const taggedUserIds: string[] = commentTaggedPartners.map(p => p.userId);
        for (const course of commentTaggedCourses) {
          try {
            const usersQuery = query(collection(db, "users"), where("ownedCourseId", "==", course.courseId));
            const usersSnap = await getDocs(usersQuery);
            if (!usersSnap.empty) {
              const courseOwnerId = usersSnap.docs[0].id;
              if (!taggedUserIds.includes(courseOwnerId)) taggedUserIds.push(courseOwnerId);
            }
          } catch (error) {
            console.error("Error finding course owner:", error);
          }
        }

        const subcollectionCommentData: any = {
          content: commentContent,
          userId: currentUserId,
          createdAt: serverTimestamp(),
          likes: 0,
          likedBy: [],
          taggedPartners: commentTaggedPartners,
          taggedCourses: commentTaggedCourses,
          taggedEvents: commentTaggedEvents,
          parentCommentId: commentReplyingTo || null,
          depth: parentComment ? (parentComment.depth + 1) : 0,
          replyCount: 0,
        };
        const subcollectionRef = await addDoc(collection(db, "thoughts", thoughtId, "comments"), subcollectionCommentData);

        let imageUrl: string | null = null;
        if (commentImage) {
          imageUrl = await uploadImageToStorage(subcollectionRef.id);
          if (imageUrl) {
            await updateDoc(doc(db, "thoughts", thoughtId, "comments", subcollectionRef.id), { imageUrl });
          }
        }

        await addDoc(collection(db, "comments"), {
          userId: currentUserId,
          postId: thoughtId,
          postAuthorId: postOwnerId,
          content: commentContent,
          taggedUsers: taggedUserIds,
          taggedEvents: commentTaggedEvents,
          parentCommentId: commentReplyingTo || null,
          parentCommentAuthorId: parentComment?.userId || null,
          createdAt: serverTimestamp(),
          subcollectionCommentId: subcollectionRef.id,
          imageUrl: imageUrl || null,
        });

        if (commentReplyingTo) {
          await updateDoc(doc(db, "thoughts", thoughtId, "comments", commentReplyingTo), { replyCount: increment(1) });
        }
        await updateDoc(doc(db, "thoughts", thoughtId), { comments: increment(1) });
        await updateRateLimitTimestamp("comment");
        onCommentAdded();
      }
      setText("");
      setTaggedPartners([]);
      setTaggedCourses([]);
      setTaggedEvents([]);
      setSelectedMentions([]);
      setSelectedHashTags([]);
      setReplyingToCommentId(null);
      setReplyingToUsername("");
      setSelectedImage(null);
      setPosting(false);
    } catch (error) {
      console.error("Error posting/updating comment:", error);
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setComments(prev => prev.filter(c => !c.isOptimistic));
      setPosting(false);
    }
  };

  // ============================================================================
  // EDIT / DELETE / REPLY / LIKE HANDLERS
  // ============================================================================

  const handleEditComment = (comment: Comment) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingCommentId(comment.id);
    setText(comment.content);
    setOriginalEditText(comment.content);
    setTaggedPartners(comment.taggedPartners || []);
    setTaggedCourses(comment.taggedCourses || []);
    setTaggedEvents(comment.taggedEvents || []);
    const existingMentions: string[] = [];
    if (comment.taggedPartners) comment.taggedPartners.forEach((p) => existingMentions.push(`@${p.displayName}`));
    if (comment.taggedCourses) comment.taggedCourses.forEach((c) => existingMentions.push(`@${c.courseName}`));
    setSelectedMentions(existingMentions);
    const existingHashTags: string[] = [];
    if (comment.taggedEvents) comment.taggedEvents.forEach((e) => existingHashTags.push(`#${e.eventName}`));
    setSelectedHashTags(existingHashTags);
    inputRef.current?.focus();
  };

  const handleCancelEdit = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingCommentId(null);
    setText("");
    setOriginalEditText("");
    setTaggedPartners([]);
    setTaggedCourses([]);
    setTaggedEvents([]);
    setSelectedMentions([]);
    setSelectedHashTags([]);
  };

  const handleDeleteComment = (comment: Comment) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Delete Comment", "Are you sure you want to delete this comment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            soundPlayer.play('dart');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (comment.imageUrl) {
              try {
                const imageRef = ref(storage, `comments/${thoughtId}/${comment.id}.jpg`);
                await deleteObject(imageRef);
              } catch (storageError) {
                console.warn("Could not delete image:", storageError);
              }
            }
            await deleteDoc(doc(db, "thoughts", thoughtId, "comments", comment.id));
            if (comment.parentCommentId) {
              await updateDoc(doc(db, "thoughts", thoughtId, "comments", comment.parentCommentId), { replyCount: increment(-1) });
            }
            await updateDoc(doc(db, "thoughts", thoughtId), { comments: increment(-1) });
          } catch (error) {
            console.error("Error deleting comment:", error);
            soundPlayer.play('error');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert("Error", "Failed to delete comment");
          }
        },
      },
    ]);
  };

  const handleReply = (comment: Comment) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const user = userMap[comment.userId];
    setReplyingToCommentId(comment.id);
    setReplyingToUsername(user?.displayName || "Unknown");
    inputRef.current?.focus();
  };

  const handleCancelReply = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReplyingToCommentId(null);
    setReplyingToUsername("");
  };

  const toggleReplies = (commentId: string) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedComments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) newSet.delete(commentId);
      else newSet.add(commentId);
      return newSet;
    });
  };

  const buildCommentTree = () => {
    const topLevel: Comment[] = [];
    const repliesMap: { [key: string]: Comment[] } = {};
    comments.forEach(comment => {
      if (!comment.parentCommentId) topLevel.push(comment);
      else {
        if (!repliesMap[comment.parentCommentId]) repliesMap[comment.parentCommentId] = [];
        repliesMap[comment.parentCommentId].push(comment);
      }
    });
    return { topLevel, repliesMap };
  };

  const handleLongPressComment = (comment: Comment) => {
    if (comment.userId !== currentUserId) return;
    if (comment.isOptimistic) return;
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Comment Options", "What would you like to do?", [
      { text: "Edit", onPress: () => handleEditComment(comment) },
      { text: "Delete", style: "destructive", onPress: () => handleDeleteComment(comment) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const toggleLike = async (comment: Comment) => {
    if (!currentUserId) return;
    if (comment.isOptimistic) return;
    soundPlayer.play('dart');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const commentRef = doc(db, "thoughts", thoughtId, "comments", comment.id);
    const hasLiked = comment.likedBy?.includes(currentUserId);
    if (hasLiked) {
      await updateDoc(commentRef, { likes: increment(-1), likedBy: arrayRemove(currentUserId) });
      try {
        const likesQuery = query(collection(db, "comment_likes"), where("userId", "==", currentUserId), where("commentId", "==", comment.id));
        const likesSnap = await getDocs(likesQuery);
        likesSnap.forEach(async (likeDoc) => await deleteDoc(likeDoc.ref));
      } catch (error) {
        console.error("Error deleting comment_like:", error);
      }
    } else {
      await updateDoc(commentRef, { likes: increment(1), likedBy: arrayUnion(currentUserId) });
      await addDoc(collection(db, "comment_likes"), {
        userId: currentUserId,
        commentId: comment.id,
        commentAuthorId: comment.userId,
        postId: thoughtId,
        createdAt: serverTimestamp(),
      });
    }
  };

  const openImageViewer = (imageUrl: string) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewerImage(imageUrl);
  };

  const closeImageViewer = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewerImage(null);
  };

  // ============================================================================
  // INPUT OVERLAY (inline colored tags while typing)
  // ============================================================================

  const inputHasTags =
    selectedMentions.length > 0 ||
    selectedHashTags.length > 0;

  const renderInputOverlay = () => {
    if (!text || !inputHasTags) return null;

    // Build all tagged items, longest first to prevent partial matches
    const allTagged = [
      ...selectedMentions.map(m => ({ text: m, color: "#0D5C3A" as const })),
      ...selectedHashTags.map(h => ({ text: h, color: "#B8860B" as const })),
    ].sort((a, b) => b.text.length - a.text.length);

    const escaped = allTagged.map(t =>
      t.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    const regex = new RegExp(`(${escaped.join('|')})`, 'g');
    const parts = text.split(regex);

    const colorMap = new Map<string, string>();
    allTagged.forEach(t => colorMap.set(t.text, t.color));

    return parts.map((part, i) => {
      const tagColor = colorMap.get(part);
      if (tagColor) {
        return <Text key={i} style={{ fontWeight: "600", color: tagColor }}>{part}</Text>;
      }
      // Normal text: same weight as TextInput for exact cursor alignment
      return <Text key={i} style={{ color: "#333" }}>{part}</Text>;
    });
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => { soundPlayer.play('click'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onClose(); }} style={styles.headerButton}>
              <Image source={require("@/assets/icons/Close.png")} style={styles.closeIcon} />
            </TouchableOpacity>
            <Text style={styles.title}>{editingCommentId ? "Edit Comment" : "Comments"}</Text>
            {editingCommentId && (
              <TouchableOpacity onPress={handleCancelEdit} style={styles.headerButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            )}
            {!editingCommentId && <View style={styles.headerButton} />}
          </View>

          <View style={styles.list}>
            {loading ? (
              <ActivityIndicator />
            ) : comments.length === 0 ? (
              <Text style={styles.empty}>No comments yet</Text>
            ) : (
              <ScrollView ref={scrollViewRef}>
                {(() => {
                  const { topLevel, repliesMap } = buildCommentTree();
                  const renderComment = (comment: Comment, isReply = false) => {
                    const user = userMap[comment.userId];
                    const hasLiked = comment.likedBy?.includes(currentUserId || "");
                    const isOwnComment = comment.userId === currentUserId;
                    const replies = repliesMap[comment.id] || [];
                    const isExpanded = expandedComments.has(comment.id);
                    return (
                      <View key={comment.id}>
                        <TouchableOpacity
                          style={[styles.commentRow, isReply && styles.commentRowReply, { marginLeft: comment.depth * 20 }, comment.isOptimistic && styles.commentRowOptimistic]}
                          onLongPress={() => handleLongPressComment(comment)}
                          delayLongPress={500}
                          activeOpacity={isOwnComment ? 0.7 : 1}
                        >
                          <TouchableOpacity onPress={() => { soundPlayer.play('click'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/locker/${comment.userId}`); }}>
                            {user?.avatar ? (
                              <Image source={{ uri: user.avatar }} style={styles.avatar} />
                            ) : (
                              <View style={styles.avatarPlaceholder}>
                                <Text style={styles.avatarText}>{user?.displayName?.charAt(0).toUpperCase() || "?"}</Text>
                              </View>
                            )}
                          </TouchableOpacity>
                          <View style={styles.commentBody}>
                            <TouchableOpacity onPress={() => { soundPlayer.play('click'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/locker/${comment.userId}`); }}>
                              <View style={{ flexDirection: "row", alignItems: "center" }}>
                                <Text style={styles.name}>{comment.userId === currentUserId ? "You" : user?.displayName || "Anonymous"}</Text>
                                <BadgeRow challengeBadges={user?.challengeBadges} size={12} />
                              </View>
                            </TouchableOpacity>
                            {renderCommentWithTags(comment)}
                            {comment.imageUrl && (
                              <TouchableOpacity onPress={() => openImageViewer(comment.imageUrl!)} style={styles.commentImageContainer}>
                                <Image source={{ uri: comment.imageUrl }} style={styles.commentImage} resizeMode="cover" />
                              </TouchableOpacity>
                            )}
                            {!comment.isOptimistic && (
                              <View style={styles.commentActions}>
                                <TouchableOpacity onPress={() => handleReply(comment)} style={styles.replyButton}>
                                  <Text style={styles.replyButtonText}>Reply</Text>
                                </TouchableOpacity>
                                {comment.replyCount > 0 && (
                                  <TouchableOpacity onPress={() => toggleReplies(comment.id)} style={styles.viewRepliesButton}>
                                    <Text style={styles.viewRepliesText}>{isExpanded ? "▼" : "▶"} {comment.replyCount} {comment.replyCount === 1 ? "reply" : "replies"}</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            )}
                            {comment.isOptimistic && (
                              <View style={styles.postingIndicator}>
                                <ActivityIndicator size="small" color="#0D5C3A" />
                                <Text style={styles.postingText}>Posting...</Text>
                              </View>
                            )}
                          </View>
                          {!comment.isOptimistic && (
                            <TouchableOpacity onPress={() => toggleLike(comment)} style={styles.likeButton}>
                              <Image source={require("@/assets/icons/Throw Darts.png")} style={[styles.likeIcon, hasLiked && styles.likeIconActive]} />
                              {(comment.likes ?? 0) > 0 && <Text style={[styles.likeCount, hasLiked && styles.likeCountActive]}>{comment.likes}</Text>}
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                        {isExpanded && replies.length > 0 && (
                          <View style={styles.repliesContainer}>
                            {replies.map(reply => <View key={`reply-${reply.id}`}>{renderComment(reply, true)}</View>)}
                          </View>
                        )}
                      </View>
                    );
                  };
                  return topLevel.map(comment => <View key={`top-${comment.id}`}>{renderComment(comment)}</View>);
                })()}
              </ScrollView>
            )}
          </View>

          {/* @ Autocomplete dropdown */}
          {showAutocomplete && (
            <View style={styles.autocompleteContainer}>
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.autocompleteScroll}>
                {autocompleteResults.map((item, idx) => (
                  <TouchableOpacity key={`${item.userId || item.courseId}-${idx}`} style={styles.autocompleteItem} onPress={() => handleSelectMention(item)}>
                    <Text style={styles.autocompleteName}>{autocompleteType === "partner" ? `@${item.displayName}` : `@${item.courseName}`}</Text>
                    {autocompleteType === "course" && <Text style={styles.autocompleteLocation}>{item.location}</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* # Autocomplete dropdown */}
          {showHashAutocomplete && (
            <View style={styles.autocompleteContainer}>
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.autocompleteScroll}>
                {hashAutocompleteResults.map((item, idx) => (
                  <TouchableOpacity key={`${item.eventId}-${idx}`} style={styles.autocompleteItem} onPress={() => handleSelectHashTag(item)}>
                    <View style={styles.hashAutocompleteRow}>
                      <Text style={styles.hashAutocompleteBadge}>
                        {item.eventType === "tournament" ? "🏆" : item.eventType === "league" ? "🏅" : "⛳"}
                      </Text>
                      <View>
                        <Text style={styles.autocompleteName}>#{item.eventName}</Text>
                        {item.subtitle ? <Text style={styles.autocompleteLocation}>{item.subtitle}</Text> : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={[styles.inputWrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            {replyingToCommentId && (
              <View style={styles.replyingIndicator}>
                <Text style={styles.replyingText}>Replying to @{replyingToUsername}</Text>
                <TouchableOpacity onPress={handleCancelReply}>
                  <Image source={require("@/assets/icons/Close.png")} style={styles.replyingCloseIcon} />
                </TouchableOpacity>
              </View>
            )}
            {selectedImage && (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: selectedImage }} style={styles.imagePreview} resizeMode="cover" />
                <TouchableOpacity onPress={removeSelectedImage} style={styles.removeImageButton}>
                  <Image source={require("@/assets/icons/Close.png")} style={styles.removeImageIcon} />
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.inputRow}>
              <TouchableOpacity onPress={pickImage} style={styles.imagePickerButton} disabled={posting || !!editingCommentId}>
                <Text style={[styles.imagePickerIcon, (posting || !!editingCommentId) && styles.imagePickerIconDisabled]}>📷</Text>
              </TouchableOpacity>
              <View style={styles.inputContainer}>
                {/* Overlay: colored tags painted over transparent input text */}
                {inputHasTags && text.length > 0 && (
                  <View style={styles.inputOverlay} pointerEvents="none">
                    <Text style={styles.inputOverlayText}>
                      {renderInputOverlay()}
                    </Text>
                  </View>
                )}
                <TextInput
                  ref={inputRef}
                  style={[
                    styles.input,
                    inputHasTags && text.length > 0 && { color: "transparent" },
                  ]}
                  placeholder={editingCommentId ? "Update your comment…" : "Add a comment… @ tag  # event"}
                  placeholderTextColor="#999"
                  value={text}
                  onChangeText={handleTextChange}
                  multiline
                  maxLength={500}
                  autoCorrect={true}
                  autoCapitalize="sentences"
                  spellCheck={true}
                  textAlignVertical="top"
                  selectionColor="#0D5C3A"
                />
              </View>
              <TouchableOpacity onPress={post} disabled={posting || uploadingImage || !text.trim()}>
                {posting || uploadingImage ? (
                  <ActivityIndicator size="small" color="#0D5C3A" />
                ) : (
                  <Image source={require("@/assets/icons/Post Score.png")} style={[styles.send, !text.trim() && styles.sendDisabled]} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {viewerImage && (
          <Modal visible={!!viewerImage} transparent animationType="fade" onRequestClose={closeImageViewer}>
            <Pressable style={styles.imageViewerBackdrop} onPress={closeImageViewer}>
              <Image source={{ uri: viewerImage }} style={styles.imageViewerImage} resizeMode="contain" />
              <TouchableOpacity style={styles.imageViewerCloseButton} onPress={closeImageViewer}>
                <Image source={require("@/assets/icons/Close.png")} style={styles.imageViewerCloseIcon} />
              </TouchableOpacity>
            </Pressable>
          </Modal>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { height: "75%", backgroundColor: "#F0F8F0", borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  header: { height: 52, borderBottomWidth: 1, borderBottomColor: "#DDD", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  headerButton: { width: 60, alignItems: "center" },
  closeIcon: { width: 24, height: 24, tintColor: "#0D5C3A" },
  cancelText: { color: "#FF3B30", fontSize: 14, fontWeight: "600" },
  title: { fontWeight: "700", fontSize: 16, color: "#0D5C3A" },
  list: { flex: 1, padding: 16 },
  empty: { textAlign: "center", marginTop: 40, color: "#0D5C3A" },
  commentRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 14 },
  commentRowReply: { backgroundColor: "rgba(13, 92, 58, 0.03)", borderLeftWidth: 2, borderLeftColor: "#0D5C3A", paddingLeft: 8, borderRadius: 4 },
  commentRowOptimistic: { opacity: 0.7 },
  repliesContainer: { marginTop: -10 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  avatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#0D5C3A", marginRight: 10, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  commentBody: { flex: 1 },
  name: { fontWeight: "700", color: "#0D5C3A", marginBottom: 2 },
  commentText: { fontSize: 14, color: "#333", lineHeight: 20 },
  mention: { fontSize: 14, fontWeight: "700", color: "#0D5C3A" },
  hashTag: { fontSize: 14, fontWeight: "700", color: "#B8860B" },
  commentImageContainer: { marginTop: 8, borderRadius: 8, overflow: "hidden" },
  commentImage: { width: 150, height: 112, borderRadius: 8 },
  commentActions: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  replyButton: { paddingVertical: 2, paddingHorizontal: 8 },
  replyButtonText: { fontSize: 12, fontWeight: "600", color: "#0D5C3A" },
  viewRepliesButton: { paddingVertical: 2, paddingHorizontal: 8 },
  viewRepliesText: { fontSize: 12, fontWeight: "600", color: "#666" },
  postingIndicator: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  postingText: { fontSize: 11, color: "#666", fontStyle: "italic" },
  likeButton: { padding: 6, flexDirection: "row", alignItems: "center", gap: 4 },
  likeIcon: { width: 18, height: 18, tintColor: "#999" },
  likeIconActive: { tintColor: "#FF3B30" },
  likeCount: { fontSize: 12, fontWeight: "600", color: "#999" },
  likeCountActive: { color: "#FF3B30" },
  autocompleteContainer: { backgroundColor: "#FFF", marginHorizontal: 12, marginBottom: 8, borderRadius: 8, maxHeight: 150, borderWidth: 1, borderColor: "#E0E0E0", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  autocompleteScroll: { maxHeight: 150 },
  autocompleteItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  autocompleteName: { fontSize: 14, fontWeight: "600", color: "#0D5C3A" },
  autocompleteLocation: { fontSize: 12, color: "#666", marginTop: 2 },
  hashAutocompleteRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hashAutocompleteBadge: { fontSize: 18 },
  inputWrapper: { flexDirection: "column", padding: 12, borderTopWidth: 1, borderTopColor: "#DDD", backgroundColor: "#E8DCC3", gap: 10 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  replyingIndicator: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "rgba(13, 92, 58, 0.1)", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  replyingText: { fontSize: 13, fontWeight: "600", color: "#0D5C3A" },
  replyingCloseIcon: { width: 16, height: 16, tintColor: "#0D5C3A" },
  imagePickerButton: { padding: 6, justifyContent: "center", alignItems: "center" },
  imagePickerIcon: { fontSize: 24 },
  imagePickerIconDisabled: { opacity: 0.4 },
  imagePreviewContainer: { position: "relative", alignSelf: "flex-start" },
  imagePreview: { width: 80, height: 60, borderRadius: 8 },
  removeImageButton: { position: "absolute", top: -8, right: -8, backgroundColor: "#FF3B30", borderRadius: 12, width: 24, height: 24, justifyContent: "center", alignItems: "center" },
  removeImageIcon: { width: 12, height: 12, tintColor: "#FFF" },
  inputContainer: { flex: 1, position: "relative" },
  inputOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === "ios" ? 7 : 8,
    paddingBottom: 8,
    zIndex: 2,
  },
  inputOverlayText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400",
    fontFamily: Platform.OS === "ios" ? "System" : undefined,
  },
  input: { backgroundColor: "#FFF", borderRadius: 20, paddingHorizontal: 14, paddingTop: Platform.OS === "ios" ? 7 : 8, paddingBottom: 8, maxHeight: 100, fontSize: 14, lineHeight: 20, fontFamily: Platform.OS === "ios" ? "System" : undefined, color: "#333", zIndex: 1 },
  send: { width: 28, height: 28, tintColor: "#0D5C3A" },
  sendDisabled: { opacity: 0.4 },
  imageViewerBackdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.9)", justifyContent: "center", alignItems: "center" },
  imageViewerImage: { width: "90%", height: "80%" },
  imageViewerCloseButton: { position: "absolute", top: 60, right: 20, backgroundColor: "rgba(255, 255, 255, 0.2)", borderRadius: 20, padding: 10 },
  imageViewerCloseIcon: { width: 24, height: 24, tintColor: "#FFF" },
});






