import { auth, db } from "@/constants/firebaseConfig";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Comment {
  commentId: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt: any;
}

export default function CommentsScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const thoughtId = params.thoughtId as string;
  const postContent = params.postContent as string;

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserName, setCurrentUserName] = useState<string>("");

  // Animation value for slide-in effect (from BOTTOM to TOP)
  const slideAnim = useState(new Animated.Value(1000))[0];

  useEffect(() => {
    // Slide up animation from bottom
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, []);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setCurrentUserId(user.uid);
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            setCurrentUserName(userDoc.data().displayName || "Anonymous");
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          setCurrentUserName("Anonymous");
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

        // Fetch user display name
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

  const handlePostComment = async () => {
    if (!newComment.trim() || !currentUserId) return;

    try {
      setPosting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Add comment to subcollection
      await addDoc(collection(db, "thoughts", thoughtId, "comments"), {
        userId: currentUserId,
        content: newComment.trim(),
        createdAt: new Date(),
      });

      // Increment comment count on the thought
      await updateDoc(doc(db, "thoughts", thoughtId), {
        comments: increment(1),
      });

      setNewComment("");
      await fetchComments();
      setPosting(false);
    } catch (error) {
      console.error("Error posting comment:", error);
      setPosting(false);
    }
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Slide down animation
    Animated.timing(slideAnim, {
      toValue: 1000,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      router.back();
    });
  };

  return (
    <View style={styles.backdrop}>
      {/* Transparent touchable area to close */}
      <Pressable style={styles.touchableBackdrop} onPress={handleClose} />

      <Animated.View
        style={[
          styles.container,
          {
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
          <KeyboardAvoidingView
            style={styles.keyboardView}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerContent}>
                <Text style={styles.headerTitle}>Comments</Text>
                <Text style={styles.headerSubtitle} numberOfLines={2}>
                  {postContent}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeButton}
                activeOpacity={0.7}
              >
                <Image
                  source={require("@/assets/icons/Close.png")}
                  style={styles.closeIcon}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            </View>

            {/* Comments List - Lighter Green Background */}
            <ScrollView
              style={styles.commentsContainer}
              contentContainerStyle={styles.commentsContent}
            >
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#0D5C3A" />
                  <Text style={styles.loadingText}>Loading comments...</Text>
                </View>
              ) : comments.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    🏌️ No comments yet. Be the first to share your thoughts!
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
                        {comment.createdAt?.toDate?.()?.toLocaleDateString() ||
                          "Today"}
                      </Text>
                    </View>
                    <Text style={styles.commentContent}>{comment.content}</Text>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Fairway-Inspired Input Area - Darker Green */}
            <View style={styles.inputContainer}>
              {/* Grass texture top border */}
              <View style={styles.grassBorder} />

              <View style={styles.inputWrapper}>
                <View style={styles.flagContainer}>
                  <View style={styles.flagPole} />
                  <View style={styles.flag} />
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Add your comment..."
                  placeholderTextColor="#999"
                  value={newComment}
                  onChangeText={setNewComment}
                  multiline
                  maxLength={500}
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

              {/* Character count */}
              <Text style={styles.charCount}>{newComment.length}/500</Text>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
  },

  touchableBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },

  container: {
    position: "absolute",
    bottom: 0,
    right: 0,
    left: 0,
    height: "40%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },

  safeArea: {
    flex: 1,
    backgroundColor: "#A5D6A7", // Light green for comments area
  },

  keyboardView: {
    flex: 1,
  },

  header: {
    backgroundColor: "#0D5C3A",
    padding: 16,
    paddingBottom: 20,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },

  headerContent: {
    flex: 1,
    marginRight: 12,
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFF",
    marginBottom: 4,
  },

  headerSubtitle: {
    fontSize: 13,
    color: "#B8D4C6",
    lineHeight: 17,
  },

  closeButton: {
    padding: 8,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 8,
  },

  closeIcon: {
    width: 22,
    height: 22,
    tintColor: "#FFF",
  },

  commentsContainer: {
    flex: 1,
    backgroundColor: "#A5D6A7", // Light green
  },

  commentsContent: {
    padding: 12,
    paddingBottom: 24,
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

  emptyText: {
    fontSize: 15,
    color: "#0D5C3A",
    textAlign: "center",
    lineHeight: 22,
    fontWeight: "500",
  },

  commentCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#0D5C3A",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },

  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },

  commentAuthor: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  commentDate: {
    fontSize: 11,
    color: "#666",
  },

  commentContent: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },

  inputContainer: {
    backgroundColor: "#66BB6A", // Darker green for input area
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 8,
  },

  grassBorder: {
    height: 6,
    backgroundColor: "#558B5A",
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },

  flagContainer: {
    position: "relative",
    width: 20,
    height: 36,
    justifyContent: "flex-end",
    alignItems: "center",
  },

  flagPole: {
    width: 2,
    height: 32,
    backgroundColor: "#333",
    position: "absolute",
    bottom: 0,
  },

  flag: {
    width: 10,
    height: 8,
    backgroundColor: "#FF5252",
    position: "absolute",
    top: 2,
    left: 2,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },

  input: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#333",
    maxHeight: 90,
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },

  postButton: {
    backgroundColor: "#0D5C3A",
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },

  postButtonDisabled: {
    backgroundColor: "#999",
    opacity: 0.5,
  },

  postIcon: {
    width: 22,
    height: 22,
    tintColor: "#FFF",
  },

  charCount: {
    fontSize: 10,
    color: "#FFF",
    textAlign: "right",
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontWeight: "600",
  },
});