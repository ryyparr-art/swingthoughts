import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { auth, db } from "@/constants/firebaseConfig";
import { createNotification } from "@/utils/notificationHelpers";
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
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
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

  const [comments, setComments] = useState<Comment[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  // Edit mode
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [originalEditText, setOriginalEditText] = useState("");

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

  /* ✅ REAL-TIME COMMENTS LISTENER ---------------- */
  useEffect(() => {
    if (!visible || !thoughtId) return;

    setLoading(true);

    const q = query(
      collection(db, "thoughts", thoughtId, "comments"),
      orderBy("createdAt", "asc")
    );

    // ✅ Real-time listener - comments update automatically!
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const loaded: Comment[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      setComments(loaded);

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

      setUserMap(userData);
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

  /* ---------------- POST/UPDATE COMMENT ---------------- */
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

    try {
      if (editingCommentId) {
        // UPDATE existing comment
        await updateDoc(doc(db, "thoughts", thoughtId, "comments", editingCommentId), {
          content: text.trim(),
          taggedPartners: taggedPartners,
          taggedCourses: taggedCourses,
        });

        // ✅ No need to manually update state - real-time listener handles it!
        setEditingCommentId(null);
        setOriginalEditText("");
      } else {
        // CREATE new comment
        const commentRef = await addDoc(collection(db, "thoughts", thoughtId, "comments"), {
          content: text.trim(),
          userId: currentUserId,
          createdAt: new Date(),
          likes: 0,
          likedBy: [],
          taggedPartners: taggedPartners,
          taggedCourses: taggedCourses,
        });

        await updateDoc(doc(db, "thoughts", thoughtId), {
          comments: increment(1),
        });

        // Check if post owner was tagged
        const postOwnerWasTagged = taggedPartners.some(p => p.userId === postOwnerId);

        // Create comment notification for post owner (only if NOT tagged)
        if (postOwnerId && postOwnerId !== currentUserId && !postOwnerWasTagged) {
          await createNotification({
            userId: postOwnerId,
            type: "comment",
            actorId: currentUserId,
            postId: thoughtId,
          });
        }

        // Create mention notifications for tagged partners
        for (const partner of taggedPartners) {
          if (partner.userId !== currentUserId) {
            await createNotification({
              userId: partner.userId,
              type: "mention_comment",
              actorId: currentUserId,
              postId: thoughtId,
              commentId: commentRef.id,
            });
          }
        }

        // Create mention notifications for tagged courses (claimed courses)
        for (const course of taggedCourses) {
          try {
            // Find the user who owns this course
            const usersQuery = query(
              collection(db, "users"),
              where("ownedCourseId", "==", course.courseId)
            );
            const usersSnap = await getDocs(usersQuery);

            if (!usersSnap.empty) {
              const courseOwner = usersSnap.docs[0];
              const courseOwnerId = courseOwner.id;

              if (courseOwnerId !== currentUserId && courseOwnerId !== postOwnerId) {
                await createNotification({
                  userId: courseOwnerId,
                  type: "mention_comment",
                  actorId: currentUserId,
                  postId: thoughtId,
                  commentId: commentRef.id,
                });
              }
            }
          } catch (error) {
            console.error("Error notifying course owner:", error);
          }
        }

        // ✅ ANTI-BOT: Update rate limit timestamp
        await updateRateLimitTimestamp("comment");

        onCommentAdded();
      }

      setText("");
      setTaggedPartners([]);
      setTaggedCourses([]);
      setSelectedMentions([]);
      
      // ✅ No need to refetch - real-time listener shows new comment automatically!
      setPosting(false);
    } catch (error) {
      console.error("Error posting/updating comment:", error);
      soundPlayer.play('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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

              await updateDoc(doc(db, "thoughts", thoughtId), {
                comments: increment(-1),
              });

              // ✅ No need to manually update state - real-time listener handles it!
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

  /* ---------------- LONG PRESS MENU ---------------- */
  const handleLongPressComment = (comment: Comment) => {
    if (comment.userId !== currentUserId) return;

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

  /* ---------------- LIKE COMMENT ---------------- */
  const toggleLike = async (comment: Comment) => {
    if (!currentUserId) return;

    soundPlayer.play('dart');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const ref = doc(db, "thoughts", thoughtId, "comments", comment.id);
    const hasLiked = comment.likedBy?.includes(currentUserId);

    await updateDoc(ref, {
      likes: increment(hasLiked ? -1 : 1),
      likedBy: hasLiked
        ? comment.likedBy?.filter((id) => id !== currentUserId)
        : [...(comment.likedBy || []), currentUserId],
    });

    // ✅ No need to manually update state - real-time listener handles it!
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

          {/* LIST */}
          <View style={styles.list}>
            {loading ? (
              <ActivityIndicator />
            ) : comments.length === 0 ? (
              <Text style={styles.empty}>No comments yet</Text>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(i) => i.id}
                renderItem={({ item }) => {
                  const user = userMap[item.userId];
                  const hasLiked = item.likedBy?.includes(currentUserId || "");
                  const isOwnComment = item.userId === currentUserId;

                  return (
                    <TouchableOpacity
                      style={styles.commentRow}
                      onLongPress={() => handleLongPressComment(item)}
                      delayLongPress={500}
                      activeOpacity={isOwnComment ? 0.7 : 1}
                    >
                      <TouchableOpacity
                        onPress={() => {
                          soundPlayer.play('click');
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push(`/locker/${item.userId}`);
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
                            router.push(`/locker/${item.userId}`);
                          }}
                        >
                          <Text style={styles.name}>
                            {item.userId === currentUserId
                              ? "You"
                              : user?.displayName || "Anonymous"}
                          </Text>
                        </TouchableOpacity>

                        {renderCommentWithTags(item)}
                      </View>

                      <TouchableOpacity
                        onPress={() => toggleLike(item)}
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
                    </TouchableOpacity>
                  );
                }}
              />
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
                selectionColor="#0D5C3A" // Green selection color hints at mentions
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
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#DDD",
    backgroundColor: "#E8DCC3",
    gap: 10,
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








