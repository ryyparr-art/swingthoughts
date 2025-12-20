import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { auth, db } from "@/constants/firebaseConfig";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

interface Comment {
  commentId: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt: any;
  taggedPartners?: { userId: string; displayName: string }[];
  taggedCourses?: { courseId: number; courseName: string }[];
}

interface CommentsScreenProps {
  thoughtId: string;
  postContent: string;
  onClose: () => void;
  onCommentAdded?: () => void;
}

export default function CommentsScreen({
  thoughtId,
  postContent,
  onClose,
  onCommentAdded,
}: CommentsScreenProps) {
  const router = useRouter();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const [taggedPartners, setTaggedPartners] = useState<{ userId: string; displayName: string }[]>([]);
  const [taggedCourses, setTaggedCourses] = useState<{ courseId: number; courseName: string }[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteType, setAutocompleteType] = useState<"partner" | "course" | null>(null);
  const [autocompleteResults, setAutocompleteResults] = useState<any[]>([]);
  const [currentMention, setCurrentMention] = useState("");
  const [allPartners, setAllPartners] = useState<{ userId: string; displayName: string }[]>([]);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setCurrentUserId(user.uid);
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            // Load user's partners for tagging
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
            }
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    fetchComments();
  }, [thoughtId]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, "thoughts", thoughtId, "comments"),
        orderBy("createdAt", "asc")
      );

      const querySnapshot = await getDocs(q);
      const commentsData: Comment[] = [];

      for (const docSnap of querySnapshot.docs) {
        const commentData = docSnap.data() as Comment;
        commentData.commentId = docSnap.id;

        try {
          const userDoc = await getDoc(doc(db, "users", commentData.userId));
          commentData.displayName = userDoc.exists()
            ? userDoc.data().displayName
            : "Anonymous";
        } catch {
          commentData.displayName = "Anonymous";
        }

        commentsData.push(commentData);
      }

      setComments(commentsData);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching comments:", error);
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return "";
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString();
  };

  /* ------------------ AUTOCOMPLETE LOGIC ------------------ */
  const handleCommentChange = (text: string) => {
    setNewComment(text);

    const lastAtIndex = text.lastIndexOf("@");
    if (lastAtIndex === -1) {
      setShowAutocomplete(false);
      return;
    }

    const afterAt = text.slice(lastAtIndex + 1);
    
    if (afterAt.includes(" ")) {
      setShowAutocomplete(false);
      return;
    }

    setCurrentMention(afterAt);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (afterAt.length >= 2) {
        searchMentions(afterAt);
      }
    }, 300);
  };

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
    if (autocompleteType === "partner") {
      if (taggedPartners.find((p) => p.userId === item.userId)) {
        setShowAutocomplete(false);
        return;
      }

      const lastAtIndex = newComment.lastIndexOf("@");
      const beforeAt = newComment.slice(0, lastAtIndex);
      const afterMention = newComment.slice(lastAtIndex + 1 + currentMention.length);
      
      setNewComment(`${beforeAt}@${item.displayName}${afterMention}`);
      setTaggedPartners([...taggedPartners, { userId: item.userId, displayName: item.displayName }]);
    } else if (autocompleteType === "course") {
      if (taggedCourses.find((c) => c.courseId === item.courseId)) {
        setShowAutocomplete(false);
        return;
      }

      const lastAtIndex = newComment.lastIndexOf("@");
      const beforeAt = newComment.slice(0, lastAtIndex);
      const afterMention = newComment.slice(lastAtIndex + 1 + currentMention.length);
      
      const courseTag = item.courseName.replace(/\s+/g, "");
      
      setNewComment(`${beforeAt}@${courseTag}${afterMention}`);
      setTaggedCourses([...taggedCourses, { courseId: item.courseId, courseName: item.courseName }]);
    }

    setShowAutocomplete(false);
  };

  /* ------------------ RENDER CLICKABLE TAGS ------------------ */
  const renderCommentWithTags = (comment: Comment) => {
    const { content, taggedPartners = [], taggedCourses = [] } = comment;
    
    const tagMap = new Map();
    taggedPartners.forEach((p) => {
      tagMap.set(`@${p.displayName}`, { type: 'partner', data: p });
    });
    taggedCourses.forEach((c) => {
      const tag = `@${c.courseName.replace(/\s+/g, "")}`;
      tagMap.set(tag, { type: 'course', data: c });
    });

    const parts = content.split(/(@\w+)/g);
    
    return (
      <Text style={styles.commentContent}>
        {parts.map((part, index) => {
          const tagInfo = tagMap.get(part);
          
          if (tagInfo) {
            return (
              <Text
                key={index}
                style={styles.commentTag}
                onPress={() => handleTagPress(tagInfo)}
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

  const handleTagPress = (tagInfo: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (tagInfo.type === 'partner') {
      router.push(`/locker/${tagInfo.data.userId}`);
    } else if (tagInfo.type === 'course') {
      router.push(`/course/${tagInfo.data.courseId}`);
    }
  };

  const handlePostComment = async () => {
    if (!newComment.trim() || !currentUserId) return;

    try {
      setPosting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      await addDoc(collection(db, "thoughts", thoughtId, "comments"), {
        userId: currentUserId,
        content: newComment.trim(),
        taggedPartners: taggedPartners,
        taggedCourses: taggedCourses,
        createdAt: new Date(),
      });

      await updateDoc(doc(db, "thoughts", thoughtId), {
        comments: increment(1),
      });

      setNewComment("");
      setTaggedPartners([]);
      setTaggedCourses([]);
      await fetchComments();
      onCommentAdded?.();
      setPosting(false);
    } catch (error) {
      console.error("Error posting comment:", error);
      setPosting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Image
            source={require("@/assets/icons/Close.png")}
            style={styles.closeIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Comments</Text>
        </View>

        <View style={styles.closeButton} />
      </View>

      {/* COMMENTS LIST */}
      <ScrollView
        style={styles.commentsContainer}
        contentContainerStyle={styles.commentsContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0D5C3A" />
            <Text style={styles.loadingText}>Loading comments...</Text>
          </View>
        ) : comments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyText}>
              No comments yet. Be the first to share your thoughts!
            </Text>
          </View>
        ) : (
          comments.map((comment) => (
            <View key={comment.commentId} style={styles.commentCard}>
              <View style={styles.commentHeader}>
                <Text style={styles.commentAuthor}>
                  {comment.displayName}
                </Text>
                <Text style={styles.commentDate}>
                  {formatTimestamp(comment.createdAt)}
                </Text>
              </View>
              {renderCommentWithTags(comment)}
            </View>
          ))
        )}
      </ScrollView>

      {/* INPUT AREA */}
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Add your comment..."
            placeholderTextColor="#999"
            value={newComment}
            onChangeText={handleCommentChange}
            multiline
            maxLength={500}
            autoFocus={false}
            blurOnSubmit={false}
          />

          <TouchableOpacity
            onPress={handlePostComment}
            style={[
              styles.postButton,
              (!newComment.trim() || posting) &&
                styles.postButtonDisabled,
            ]}
            disabled={!newComment.trim() || posting}
            activeOpacity={0.7}
          >
            {posting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Image
                source={require("@/assets/icons/Post Score.png")}
                style={styles.postIcon}
                resizeMode="contain"
              />
            )}
          </TouchableOpacity>
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
                      : `@${item.courseName.replace(/\s+/g, "")}`}
                  </Text>
                  {autocompleteType === "course" && (
                    <Text style={styles.autocompleteLocation}>{item.location}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <Text style={styles.charCount}>{newComment.length}/500</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F8F0", // Match modal background (not transparent)
  },

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

  headerContent: {
    flex: 1,
    alignItems: "center",
  },

  headerTitle: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 18,
    textAlign: "center",
  },

  postPreview: {
    backgroundColor: "#E8DCC3",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#D6C9A8",
  },

  postPreviewLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  postPreviewText: {
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
  },

  commentsContainer: {
    flex: 1,
  },

  commentsContent: {
    padding: 16,
    paddingBottom: 200, // Large padding so content scrolls above keyboard
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },

  loadingText: {
    marginTop: 12,
    color: "#0D5C3A",
    fontSize: 14,
    fontWeight: "600",
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 24,
  },

  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },

  emptyText: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },

  commentCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },

  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  commentAuthor: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  commentDate: {
    fontSize: 12,
    color: "#999",
  },

  commentContent: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },

  commentTag: {
    color: "#0D5C3A",
    fontWeight: "700",
    textDecorationLine: "underline",
  },

  inputContainer: {
    backgroundColor: "#E8DCC3",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#D6C9A8",
  },

  autocompleteContainer: {
    backgroundColor: "#FFF",
    marginHorizontal: 16,
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

  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },

  input: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: "#333",
    maxHeight: 100,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    textAlignVertical: "top",
  },

  postButton: {
    backgroundColor: "#0D5C3A",
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
  },

  postButtonDisabled: {
    opacity: 0.4,
  },

  postIcon: {
    width: 28,
    height: 28,
    tintColor: "#FFF",
  },

  charCount: {
    fontSize: 11,
    color: "#999",
    textAlign: "right",
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontWeight: "600",
  },
});

