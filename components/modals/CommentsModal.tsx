import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { auth, db } from "@/constants/firebaseConfig";
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
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

interface Props {
  visible: boolean;
  thoughtId: string;
  postContent: string;
  postOwnerId: string;
  onClose: () => void;
  onCommentAdded: () => void;
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
  
  // ✅ Threading fields
  parentCommentId?: string;  // null/undefined = top-level, commentId = reply
  depth: number;             // 0 = top-level, 1+ = nested
  replyCount: number;        // How many direct replies
  
  // ✅ Optimistic UI flag
  isOptimistic?: boolean;
}

interface UserProfile {
  displayName: string;
  avatar?: string;
}

export default function CommentsModal({
  visible,
  thoughtId,
  postOwnerId,
  onClose,
  onCommentAdded,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  // Edit mode
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [originalEditText, setOriginalEditText] = useState("");

  // ✅ Reply mode
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyingToUsername, setReplyingToUsername] = useState("");
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  // @ Mention autocomplete state
  const [taggedPartners, setTaggedPartners] = useState<{ userId: string; displayName: string }[]>([]);
  const [taggedCourses, setTaggedCourses] = useState<{ courseId: number; courseName: string }[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteType, setAutocompleteType] = useState<"partner" | "course" | null>(null);
  const [autocompleteResults, setAutocompleteResults] = useState<any[]>([]);
  const [currentMention, setCurrentMention] = useState("");
  const [allPartners, setAllPartners] = useState<{ userId: string; displayName: string }[]>([]);
  
  // ✅ Track validated mentions for styling
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);

  const currentUserId = auth.currentUser?.uid;

  /* ---------------- LOAD CURRENT USER PROFILE ---------------- */
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
          },
        }));
      } catch (error) {
        console.error("Error loading current user profile:", error);
      }
    };

    loadCurrentUser();
  }, [visible, currentUserId]);

  /* ---------------- LOAD USER PARTNERS ---------------- */
  useEffect(() => {
    if (!visible || !currentUserId) return;

    const loadPartners = async () => {
      try {
        console.log("🔍 Loading partners for:", currentUserId);
        const userDoc = await getDoc(doc(db, "users", currentUserId));
        
        if (userDoc.exists()) {
          const partners = userDoc.data()?.partners || [];
          console.log("👥 Raw partners array:", partners);
          
          if (partners.length > 0) {
            const partnerDocs = await Promise.all(
              partners.map((partnerId: string) => getDoc(doc(db, "users", partnerId)))
            );
            
            const partnerList = partnerDocs
              .filter((d) => {
                if (!d.exists()) {
                  console.warn("⚠️ Partner document doesn't exist:", d.id);
                  return false;
                }
                return true;
              })
              .map((d) => ({
                userId: d.id,
                displayName: d.data()?.displayName || "Unknown",
              }));
            
            console.log("✅ Loaded partners:", partnerList);
            setAllPartners(partnerList);
          } else {
            console.log("❌ No partners in user document");
            setAllPartners([]);
          }
        } else {
          console.error("❌ User document doesn't exist:", currentUserId);
          setAllPartners([]);
        }
      } catch (error) {
        console.error("❌ Error loading partners:", error);
        setAllPartners([]);
      }
    };

    loadPartners();
  }, [visible, currentUserId]);

  /* ✅ REAL-TIME COMMENTS LISTENER WITH THREADING ---------------- */
  useEffect(() => {
    if (!visible || !thoughtId) return;

    setLoading(true);

    const q = query(
      collection(db, "thoughts", thoughtId, "comments"),
      orderBy("createdAt", "asc")
    );

    // ✅ Real-time listener - comments update automatically!
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const loaded: Comment[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          // ✅ Ensure threading fields exist with defaults
          parentCommentId: data.parentCommentId || null,
          depth: data.depth ?? 0,
          replyCount: data.replyCount ?? 0,
          isOptimistic: false,
        } as Comment;
      });

      // ✅ Remove any optimistic comments that now have real versions
      setComments(prev => {
        const optimisticIds = prev.filter(c => c.isOptimistic).map(c => c.id);
        // Keep optimistic comments that haven't been confirmed yet
        const stillPendingOptimistic = prev.filter(c => 
          c.isOptimistic && !loaded.some(real => 
            real.content === c.content && real.userId === c.userId
          )
        );
        return [...loaded, ...stillPendingOptimistic];
      });

      // ✅ Load user profiles with helper (handles deleted users)
      const uniqueUserIds = Array.from(new Set(loaded.map((c) => c.userId)));
      const userData: Record<string, UserProfile> = {};

      await Promise.all(
        uniqueUserIds.map(async (uid) => {
          try {
            const userProfile = await getUserProfile(uid);
            userData[uid] = {
              displayName: userProfile.displayName, // "[Deleted User]" if deleted
              avatar: userProfile.avatar || undefined,
            };
          } catch {
            userData[uid] = {
              displayName: "[Deleted User]",
              avatar: undefined,
            };
          }
        })
      );

      setUserMap(prev => ({ ...prev, ...userData }));
      setLoading(false);
    }, (error) => {
      console.error("Comments listener error:", error);
      setLoading(false);
    });

    // Cleanup listener on unmount
    return () => unsubscribe();
  }, [visible, thoughtId]);

  /* ---------------- @ MENTION AUTOCOMPLETE ---------------- */
  const handleTextChange = (newText: string) => {
    setText(newText);

    // ✅ Clean up selectedMentions - remove any that are no longer in the content
    const cleanedMentions = selectedMentions.filter((mention) => 
      newText.includes(mention)
    );
    if (cleanedMentions.length !== selectedMentions.length) {
      setSelectedMentions(cleanedMentions);
    }

    const lastAtIndex = newText.lastIndexOf("@");
    if (lastAtIndex === -1) {
      setShowAutocomplete(false);
      return;
    }

    const afterAt = newText.slice(lastAtIndex + 1);
    console.log("📝 After @ symbol:", `"${afterAt}"`);
    
    // Close autocomplete if user types double space or newline
    if (afterAt.endsWith("  ") || afterAt.includes("\n")) {
      console.log("❌ Closing autocomplete - double space or newline");
      setShowAutocomplete(false);
      return;
    }

    setCurrentMention(afterAt);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      // ✅ FIXED: Trigger after 1 character instead of 2
      if (afterAt.length >= 1) {
        console.log("✅ Triggering search for:", afterAt);
        searchMentions(afterAt);
      } else {
        console.log("⏳ Waiting for more characters...");
      }
    }, 300);
  };

  const searchMentions = async (searchText: string) => {
    try {
      console.log("🔎 Searching for:", searchText);
      console.log("👥 Available partners:", allPartners);
      
      const partnerResults = allPartners.filter((p) => {
        const matches = p.displayName.toLowerCase().includes(searchText.toLowerCase());
        console.log(`  ${p.displayName} matches "${searchText}"?`, matches);
        return matches;
      });

      console.log("✅ Partner results:", partnerResults);

      if (partnerResults.length > 0) {
        setAutocompleteType("partner");
        setAutocompleteResults(partnerResults);
        setShowAutocomplete(true);
        console.log("📋 Showing partner autocomplete");
        return;
      }

      console.log("🏌️ No partners found, searching courses...");
      searchCourses(searchText);
    } catch (err) {
      console.error("❌ Search error:", err);
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

  const handleSelectMention = (item: any) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    let mentionText = "";
    
    if (autocompleteType === "partner") {
      if (taggedPartners.find((p) => p.userId === item.userId)) {
        setShowAutocomplete(false);
        return;
      }

      const lastAtIndex = text.lastIndexOf("@");
      const beforeAt = text.slice(0, lastAtIndex);
      const afterMention = text.slice(lastAtIndex + 1 + currentMention.length);
      
      mentionText = `@${item.displayName}`;
      setText(`${beforeAt}${mentionText} ${afterMention}`);
      setTaggedPartners([...taggedPartners, { userId: item.userId, displayName: item.displayName }]);
    } else if (autocompleteType === "course") {
      if (taggedCourses.find((c) => c.courseId === item.courseId)) {
        setShowAutocomplete(false);
        return;
      }

      const lastAtIndex = text.lastIndexOf("@");
      const beforeAt = text.slice(0, lastAtIndex);
      const afterMention = text.slice(lastAtIndex + 1 + currentMention.length);
      
      mentionText = `@${item.courseName}`;
      setText(`${beforeAt}${mentionText} ${afterMention}`);
      setTaggedCourses([...taggedCourses, { courseId: item.courseId, courseName: item.courseName }]);
    }

    // ✅ Track validated mention for styling
    if (mentionText && !selectedMentions.includes(mentionText)) {
      setSelectedMentions([...selectedMentions, mentionText]);
    }

    setShowAutocomplete(false);
  };

  /* ---------------- RENDER COMMENT WITH STYLED MENTIONS ---------------- */
  const renderCommentWithTags = (comment: Comment) => {
    const { content, taggedPartners = [], taggedCourses = [] } = comment;
    
    const mentionMap: { [key: string]: { type: string; data: any } } = {};
    
    taggedPartners.forEach((partner) => {
      mentionMap[`@${partner.displayName}`] = { type: 'partner', data: partner };
    });
    
    taggedCourses.forEach((course) => {
      const courseTagNoSpaces = `@${course.courseName.replace(/\s+/g, "")}`;
      mentionMap[courseTagNoSpaces] = { type: 'course', data: course };
      mentionMap[`@${course.courseName}`] = { type: 'course', data: course };
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
                style={styles.mention}
                onPress={() => {
                  soundPlayer.play('click');
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (mention.type === 'partner') {
                    router.push(`/locker/${mention.data.userId}`);
                  } else if (mention.type === 'course') {
                    router.push(`/locker/course/${mention.data.courseId}`);
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

  /* ---------------- POST/UPDATE COMMENT WITH CLOUD FUNCTIONS ---------------- */
  const post = async () => {
    if (!text.trim() || !currentUserId) return;

    // ✅ ANTI-BOT CHECK 1: Email Verification
    if (!isEmailVerified()) {
      soundPlayer.play('error');
      Alert.alert("Email Not Verified", EMAIL_VERIFICATION_MESSAGE);
      return;
    }

    // ✅ ANTI-BOT CHECK 2: Rate Limiting (skip for edit mode)
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

    // ✅ Store comment data before clearing
    const commentContent = text.trim();
    const commentTaggedPartners = [...taggedPartners];
    const commentTaggedCourses = [...taggedCourses];
    const commentReplyingTo = replyingToCommentId;

    try {
      if (editingCommentId) {
        // UPDATE existing comment (no notifications needed)
        await updateDoc(doc(db, "thoughts", thoughtId, "comments", editingCommentId), {
          content: commentContent,
          taggedPartners: commentTaggedPartners,
          taggedCourses: commentTaggedCourses,
        });

        setEditingCommentId(null);
        setOriginalEditText("");
      } else {
        // ✅ OPTIMISTIC UI: Add comment immediately before Firestore write
        const parentComment = commentReplyingTo 
          ? comments.find(c => c.id === commentReplyingTo)
          : null;

        const optimisticComment: Comment = {
          id: `optimistic-${Date.now()}`,
          content: commentContent,
          userId: currentUserId,
          createdAt: Timestamp.now(),
          likes: 0,
          likedBy: [],
          taggedPartners: commentTaggedPartners,
          taggedCourses: commentTaggedCourses,
          parentCommentId: commentReplyingTo || undefined,
          depth: parentComment ? (parentComment.depth + 1) : 0,
          replyCount: 0,
          isOptimistic: true,
        };

        // Add optimistic comment to state immediately
        setComments(prev => [...prev, optimisticComment]);

        // If replying, auto-expand parent to show new reply
        if (commentReplyingTo) {
          setExpandedComments(prev => new Set(prev).add(commentReplyingTo));
        }

        // Scroll to bottom to show new comment
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);

        // ✅ Build taggedUsers array for Cloud Function (just user IDs)
        const taggedUserIds: string[] = commentTaggedPartners.map(p => p.userId);

        // ✅ Also find course owners to include in taggedUsers
        for (const course of commentTaggedCourses) {
          try {
            const usersQuery = query(
              collection(db, "users"),
              where("ownedCourseId", "==", course.courseId)
            );
            const usersSnap = await getDocs(usersQuery);
            if (!usersSnap.empty) {
              const courseOwnerId = usersSnap.docs[0].id;
              if (!taggedUserIds.includes(courseOwnerId)) {
                taggedUserIds.push(courseOwnerId);
              }
            }
          } catch (error) {
            console.error("Error finding course owner:", error);
          }
        }

        // ✅ Step 1: Create comment in subcollection (for display)
        const subcollectionCommentData = {
          content: commentContent,
          userId: currentUserId,
          createdAt: serverTimestamp(),
          likes: 0,
          likedBy: [],
          taggedPartners: commentTaggedPartners,
          taggedCourses: commentTaggedCourses,
          // Threading fields
          parentCommentId: commentReplyingTo || null,
          depth: parentComment ? (parentComment.depth + 1) : 0,
          replyCount: 0,
        };

        const subcollectionRef = await addDoc(
          collection(db, "thoughts", thoughtId, "comments"),
          subcollectionCommentData
        );

        // ✅ Step 2: Create comment in top-level "comments" collection (triggers Cloud Function)
        await addDoc(collection(db, "comments"), {
          userId: currentUserId,
          postId: thoughtId,
          postAuthorId: postOwnerId,
          content: commentContent,
          taggedUsers: taggedUserIds,
          parentCommentId: commentReplyingTo || null,
          parentCommentAuthorId: parentComment?.userId || null,
          createdAt: serverTimestamp(),
          // Reference to subcollection comment
          subcollectionCommentId: subcollectionRef.id,
        });

        // ✅ If replying, increment parent's replyCount
        if (commentReplyingTo) {
          const parentRef = doc(db, "thoughts", thoughtId, "comments", commentReplyingTo);
          await updateDoc(parentRef, {
            replyCount: increment(1),
          });
        }

        // Update post comment count
        await updateDoc(doc(db, "thoughts", thoughtId), {
          comments: increment(1),
        });

        // ✅ ANTI-BOT: Update rate limit timestamp
        await updateRateLimitTimestamp("comment");

        onCommentAdded();
      }

      // ✅ Clear input AFTER successful post
      setText("");
      setTaggedPartners([]);
      setTaggedCourses([]);
      setSelectedMentions([]);
      setReplyingToCommentId(null);
      setReplyingToUsername("");
      
      setPosting(false);
    } catch (error) {
      console.error("Error posting/updating comment:", error);
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      
      // ✅ Remove optimistic comment on error
      setComments(prev => prev.filter(c => !c.isOptimistic));
      
      setPosting(false);
    }
  };

  /* ---------------- EDIT COMMENT ---------------- */
  const handleEditComment = (comment: Comment) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingCommentId(comment.id);
    setText(comment.content);
    setOriginalEditText(comment.content);
    setTaggedPartners(comment.taggedPartners || []);
    setTaggedCourses(comment.taggedCourses || []);
    
    // ✅ Populate selectedMentions from existing tags
    const existingMentions: string[] = [];
    if (comment.taggedPartners) {
      comment.taggedPartners.forEach((p) => {
        existingMentions.push(`@${p.displayName}`);
      });
    }
    if (comment.taggedCourses) {
      comment.taggedCourses.forEach((c) => {
        existingMentions.push(`@${c.courseName}`);
      });
    }
    setSelectedMentions(existingMentions);
    
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
    setSelectedMentions([]);
  };

  /* ---------------- DELETE COMMENT ---------------- */
  const handleDeleteComment = (comment: Comment) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Alert.alert(
      "Delete Comment",
      "Are you sure you want to delete this comment?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              soundPlayer.play('dart');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

              await deleteDoc(doc(db, "thoughts", thoughtId, "comments", comment.id));

              // ✅ If deleting a reply, decrement parent's replyCount
              if (comment.parentCommentId) {
                const parentRef = doc(db, "thoughts", thoughtId, "comments", comment.parentCommentId);
                await updateDoc(parentRef, {
                  replyCount: increment(-1),
                });
              }

              await updateDoc(doc(db, "thoughts", thoughtId), {
                comments: increment(-1),
              });

            } catch (error) {
              console.error("Error deleting comment:", error);
              soundPlayer.play('error');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert("Error", "Failed to delete comment");
            }
          },
        },
      ]
    );
  };

  /* ---------------- THREADING HELPERS ---------------- */
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
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });
  };

  // Build threaded comment tree
  const buildCommentTree = () => {
    const topLevel: Comment[] = [];
    const repliesMap: { [key: string]: Comment[] } = {};

    // Separate top-level comments and replies
    comments.forEach(comment => {
      if (!comment.parentCommentId) {
        topLevel.push(comment);
      } else {
        if (!repliesMap[comment.parentCommentId]) {
          repliesMap[comment.parentCommentId] = [];
        }
        repliesMap[comment.parentCommentId].push(comment);
      }
    });

    return { topLevel, repliesMap };
  };

  /* ---------------- LONG PRESS MENU ---------------- */
  const handleLongPressComment = (comment: Comment) => {
    if (comment.userId !== currentUserId) return;
    if (comment.isOptimistic) return; // Don't allow actions on optimistic comments

    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(
      "Comment Options",
      "What would you like to do?",
      [
        {
          text: "Edit",
          onPress: () => handleEditComment(comment),
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => handleDeleteComment(comment),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  };

  /* ---------------- LIKE COMMENT (WITH CLOUD FUNCTION TRIGGER) ---------------- */
  const toggleLike = async (comment: Comment) => {
    if (!currentUserId) return;
    if (comment.isOptimistic) return; // Don't allow likes on optimistic comments

    soundPlayer.play('dart');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const ref = doc(db, "thoughts", thoughtId, "comments", comment.id);
    const hasLiked = comment.likedBy?.includes(currentUserId);

    if (hasLiked) {
      // ✅ UNLIKE: Update comment + delete comment_like document
      await updateDoc(ref, {
        likes: increment(-1),
        likedBy: arrayRemove(currentUserId),
      });

      // Find and delete the comment_like document
      try {
        const likesQuery = query(
          collection(db, "comment_likes"),
          where("userId", "==", currentUserId),
          where("commentId", "==", comment.id)
        );
        const likesSnap = await getDocs(likesQuery);
        likesSnap.forEach(async (likeDoc) => {
          await deleteDoc(likeDoc.ref);
        });
      } catch (error) {
        console.error("Error deleting comment_like:", error);
      }
    } else {
      // ✅ LIKE: Update comment + create comment_like document (triggers Cloud Function)
      await updateDoc(ref, {
        likes: increment(1),
        likedBy: arrayUnion(currentUserId),
      });

      // Create comment_like document - triggers onCommentLikeCreated Cloud Function
      await addDoc(collection(db, "comment_likes"), {
        userId: currentUserId,
        commentId: comment.id,
        commentAuthorId: comment.userId,
        postId: thoughtId,
        createdAt: serverTimestamp(),
      });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
          {/* HEADER */}
          <View style={styles.header}>
            <TouchableOpacity 
              onPress={() => {
                soundPlayer.play('click');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }} 
              style={styles.headerButton}
            >
              <Image
                source={require("@/assets/icons/Close.png")}
                style={styles.closeIcon}
              />
            </TouchableOpacity>

            <Text style={styles.title}>
              {editingCommentId ? "Edit Comment" : "Comments"}
            </Text>

            {editingCommentId && (
              <TouchableOpacity onPress={handleCancelEdit} style={styles.headerButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            )}

            {!editingCommentId && <View style={styles.headerButton} />}
          </View>

          {/* LIST WITH THREADING */}
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
                          style={[
                            styles.commentRow,
                            isReply && styles.commentRowReply,
                            { marginLeft: comment.depth * 20 }, // Indent based on depth
                            comment.isOptimistic && styles.commentRowOptimistic,
                          ]}
                          onLongPress={() => handleLongPressComment(comment)}
                          delayLongPress={500}
                          activeOpacity={isOwnComment ? 0.7 : 1}
                        >
                          <TouchableOpacity
                            onPress={() => {
                              soundPlayer.play('click');
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              router.push(`/locker/${comment.userId}`);
                            }}
                          >
                            {user?.avatar ? (
                              <Image
                                source={{ uri: user.avatar }}
                                style={styles.avatar}
                              />
                            ) : (
                              <View style={styles.avatarPlaceholder}>
                                <Text style={styles.avatarText}>
                                  {user?.displayName?.charAt(0).toUpperCase() || "?"}
                                </Text>
                              </View>
                            )}
                          </TouchableOpacity>

                          <View style={styles.commentBody}>
                            <TouchableOpacity
                              onPress={() => {
                                soundPlayer.play('click');
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                router.push(`/locker/${comment.userId}`);
                              }}
                            >
                              <Text style={styles.name}>
                                {comment.userId === currentUserId
                                  ? "You"
                                  : user?.displayName || "Anonymous"}
                              </Text>
                            </TouchableOpacity>

                            {renderCommentWithTags(comment)}
                            
                            {/* ✅ Reply and View Replies buttons */}
                            {!comment.isOptimistic && (
                              <View style={styles.commentActions}>
                                <TouchableOpacity 
                                  onPress={() => handleReply(comment)}
                                  style={styles.replyButton}
                                >
                                  <Text style={styles.replyButtonText}>Reply</Text>
                                </TouchableOpacity>
                                
                                {comment.replyCount > 0 && (
                                  <TouchableOpacity 
                                    onPress={() => toggleReplies(comment.id)}
                                    style={styles.viewRepliesButton}
                                  >
                                    <Text style={styles.viewRepliesText}>
                                      {isExpanded ? "▼" : "▶"} {comment.replyCount} {comment.replyCount === 1 ? "reply" : "replies"}
                                    </Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            )}
                            
                            {/* ✅ Posting indicator for optimistic comments */}
                            {comment.isOptimistic && (
                              <View style={styles.postingIndicator}>
                                <ActivityIndicator size="small" color="#0D5C3A" />
                                <Text style={styles.postingText}>Posting...</Text>
                              </View>
                            )}
                          </View>

                          {!comment.isOptimistic && (
                            <TouchableOpacity
                              onPress={() => toggleLike(comment)}
                              style={styles.likeButton}
                            >
                              <Image
                                source={require("@/assets/icons/Throw Darts.png")}
                                style={[
                                  styles.likeIcon,
                                  hasLiked && styles.likeIconActive,
                                ]}
                              />
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                        
                        {/* ✅ Render replies if expanded */}
                        {isExpanded && replies.length > 0 && (
                          <View style={styles.repliesContainer}>
                            {replies.map(reply => (
                              <View key={`reply-${reply.id}`}>
                                {renderComment(reply, true)}
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  };
                  
                  return topLevel.map(comment => (
                    <View key={`top-${comment.id}`}>
                      {renderComment(comment)}
                    </View>
                  ));
                })()}
              </ScrollView>
            )}
          </View>

          {/* AUTOCOMPLETE DROPDOWN */}
          {showAutocomplete && (
            <View style={styles.autocompleteContainer}>
              <ScrollView 
                keyboardShouldPersistTaps="handled"
                style={styles.autocompleteScroll}
              >
                {autocompleteResults.map((item, idx) => (
                  <TouchableOpacity
                    key={`${item.userId || item.courseId}-${idx}`}
                    style={styles.autocompleteItem}
                    onPress={() => handleSelectMention(item)}
                  >
                    <Text style={styles.autocompleteName}>
                      {autocompleteType === "partner"
                        ? `@${item.displayName}`
                        : `@${item.courseName}`}
                    </Text>
                    {autocompleteType === "course" && (
                      <Text style={styles.autocompleteLocation}>{item.location}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* INPUT */}
          <View style={styles.inputWrapper}>
            {/* ✅ Replying indicator */}
            {replyingToCommentId && (
              <View style={styles.replyingIndicator}>
                <Text style={styles.replyingText}>
                  Replying to @{replyingToUsername}
                </Text>
                <TouchableOpacity onPress={handleCancelReply}>
                  <Image
                    source={require("@/assets/icons/Close.png")}
                    style={styles.replyingCloseIcon}
                  />
                </TouchableOpacity>
              </View>
            )}
            
            <View style={styles.inputRow}>
              <View style={styles.inputContainer}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder={editingCommentId ? "Update your comment…" : "Add a comment…"}
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
              
              {/* Show validated mentions as chips below when typing */}
              {selectedMentions.length > 0 && text.includes("@") && (
                <View style={styles.mentionChipsContainer}>
                  <Text style={styles.mentionChipsLabel}>Tagged:</Text>
                  <View style={styles.mentionChips}>
                    {selectedMentions.map((mention, idx) => (
                      <View key={idx} style={styles.mentionChip}>
                        <Text style={styles.mentionChipText}>{mention}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
            
            <TouchableOpacity onPress={post} disabled={posting || !text.trim()}>
              {posting ? (
                <ActivityIndicator size="small" color="#0D5C3A" />
              ) : (
                <Image
                  source={require("@/assets/icons/Post Score.png")}
                  style={[
                    styles.send,
                    !text.trim() && styles.sendDisabled,
                  ]}
                />
              )}
            </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    height: "75%",
    backgroundColor: "#F0F8F0",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: "#DDD",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  headerButton: {
    width: 60,
    alignItems: "center",
  },
  closeIcon: {
    width: 24,
    height: 24,
    tintColor: "#0D5C3A",
  },
  cancelText: {
    color: "#FF3B30",
    fontSize: 14,
    fontWeight: "600",
  },
  title: {
    fontWeight: "700",
    fontSize: 16,
    color: "#0D5C3A",
  },
  list: {
    flex: 1,
    padding: 16,
  },
  empty: {
    textAlign: "center",
    marginTop: 40,
    color: "#0D5C3A",
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  
  commentRowReply: {
    backgroundColor: "rgba(13, 92, 58, 0.03)",
    borderLeftWidth: 2,
    borderLeftColor: "#0D5C3A",
    paddingLeft: 8,
    borderRadius: 4,
  },
  
  commentRowOptimistic: {
    opacity: 0.7,
  },
  
  repliesContainer: {
    marginTop: -10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0D5C3A",
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  commentBody: {
    flex: 1,
  },
  name: {
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 2,
  },
  commentText: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  mention: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  
  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 6,
  },
  
  replyButton: {
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  
  replyButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  
  viewRepliesButton: {
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  
  viewRepliesText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },
  
  postingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  
  postingText: {
    fontSize: 11,
    color: "#666",
    fontStyle: "italic",
  },
  
  likeButton: {
    padding: 6,
  },
  likeIcon: {
    width: 18,
    height: 18,
    tintColor: "#999",
  },
  likeIconActive: {
    tintColor: "#FF3B30",
  },

  /* AUTOCOMPLETE */
  autocompleteContainer: {
    backgroundColor: "#FFF",
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    maxHeight: 150,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  autocompleteScroll: {
    maxHeight: 150,
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

  /* INPUT */
  inputWrapper: {
    flexDirection: "column",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#DDD",
    backgroundColor: "#E8DCC3",
    gap: 10,
  },
  
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  
  replyingIndicator: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(13, 92, 58, 0.1)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  
  replyingText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  
  replyingCloseIcon: {
    width: 16,
    height: 16,
    tintColor: "#0D5C3A",
  },
  
  inputContainer: {
    flex: 1,
  },
  
  input: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 14,
    textAlignVertical: "top",
    color: "#333",
  },

  mentionChipsContainer: {
    marginTop: 6,
    paddingHorizontal: 4,
  },

  mentionChipsLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  mentionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },

  mentionChip: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },

  mentionChipText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "600",
  },
  
  send: {
    width: 28,
    height: 28,
    tintColor: "#0D5C3A",
  },
  sendDisabled: {
    opacity: 0.4,
  },
});







