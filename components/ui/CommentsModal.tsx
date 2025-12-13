import { auth, db } from "@/constants/firebaseConfig";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    increment,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";

import * as Haptics from "expo-haptics";
import {
    ActivityIndicator,
    Animated,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import { useEffect, useRef, useState } from "react";

interface Comment {
  commentId: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt: any;
}

interface CommentsModalProps {
  visible: boolean;
  thoughtId: string;
  thoughtContent: string;
  onClose: () => void;
  onCommentAdded?: () => void;
}

export default function CommentsModal({
  visible,
  thoughtId,
  thoughtContent,
  onClose,
  onCommentAdded,
}: CommentsModalProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(false);

  const [currentUserId, setCurrentUserId] = useState("");

  // Animation values
  const slideAnim = useRef(new Animated.Value(1000)).current;
  const sheetHeight = useRef(new Animated.Value(0.4)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const scrollRef = useRef<ScrollView>(null);

  // ----------------------------------
  // AUTH LISTENER
  // ----------------------------------
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) setCurrentUserId(user.uid);
    });
    return () => unsub();
  }, []);

  // ----------------------------------
  // KEYBOARD LISTENERS
  // ----------------------------------
  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardWillShow", (e) => {
      setKeyboardHeight(e.endCoordinates.height);

      Animated.timing(sheetHeight, {
        toValue: 0.7,
        duration: 250,
        useNativeDriver: false,
      }).start();

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 80);
    });

    const hideSub = Keyboard.addListener("keyboardWillHide", () => {
      setKeyboardHeight(0);

      Animated.timing(sheetHeight, {
        toValue: 0.4,
        duration: 250,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ----------------------------------
  // OPEN / CLOSE ANIMATION
  // ----------------------------------
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: false,
      }).start();

      fetchComments();
    } else {
      slideAnim.setValue(1000);
    }
  }, [visible]);

  // ----------------------------------
  // FETCH COMMENTS
  // ----------------------------------
  const fetchComments = async () => {
    if (!thoughtId) return;

    try {
      setLoading(true);

      const q = query(
        collection(db, "thoughts", thoughtId, "comments"),
        orderBy("createdAt", "asc")
      );

      const snapshot = await getDocs(q);
      const list: Comment[] = [];

      for (const docSnap of snapshot.docs) {
        const c = docSnap.data() as Comment;
        c.commentId = docSnap.id;

        try {
          const userDoc = await getDoc(doc(db, "users", c.userId));
          c.displayName = userDoc.exists()
            ? userDoc.data().displayName
            : "Anonymous";
        } catch {
          c.displayName = "Anonymous";
        }

        list.push(c);
      }

      setComments(list);
      setLoading(false);

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: false });
      }, 70);
    } catch (err) {
      console.error("Fetch comments error:", err);
      setLoading(false);
    }
  };

  // ----------------------------------
  // POST COMMENT (with rate limiting)
  // ----------------------------------
  const handlePostComment = async () => {
    if (!newComment.trim() || !currentUserId) return;

    try {
      setPosting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Store comment
      await addDoc(collection(db, "thoughts", thoughtId, "comments"), {
        userId: currentUserId,
        content: newComment.trim(),
        createdAt: new Date(),
      });

      // Increment count on parent post
      await updateDoc(doc(db, "thoughts", thoughtId), {
        comments: increment(1),
      });

      // ⭐ Rate limiting: update lastCommentAt
      await updateDoc(doc(db, "users", currentUserId), {
        lastCommentAt: serverTimestamp(),
      });

      setNewComment("");
      await fetchComments();
      onCommentAdded?.();
      setPosting(false);
    } catch (err) {
      console.error("Post comment error:", err);
      setPosting(false);
    }
  };

  // ----------------------------------
  // DELETE COMMENT
  // ----------------------------------
  const handleDeleteComment = async (comment: Comment) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const ref = doc(
        db,
        "thoughts",
        thoughtId,
        "comments",
        comment.commentId
      );

      await deleteDoc(ref);

      // Decrement count
      await updateDoc(doc(db, "thoughts", thoughtId), {
        comments: increment(-1),
      });

      setComments((prev) =>
        prev.filter((c) => c.commentId !== comment.commentId)
      );

      onCommentAdded?.();
    } catch (err) {
      console.error("Delete comment error:", err);
    }
  };

  // ----------------------------------
  // CLOSE MODAL
  // ----------------------------------
  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Animated.timing(slideAnim, {
      toValue: 1000,
      duration: 250,
      useNativeDriver: false,
    }).start(() => {
      onClose();
      setNewComment("");
    });
  };

  if (!visible) return null;

  const modalHeight = sheetHeight.interpolate({
    inputRange: [0, 1],
    outputRange: ["40%", "100%"],
  });

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.backdrop}>
        <Pressable style={styles.touchArea} onPress={handleClose} />

        <Animated.View
          style={[
            styles.container,
            {
              height: modalHeight,
              transform: [{ translateY: slideAnim }],
              paddingBottom: keyboardHeight,
            },
          ]}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >

            {/* HEADER */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Comments</Text>

              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeButton}
              >
                <Image
                  source={require("@/assets/icons/Close.png")}
                  style={styles.closeIcon}
                />
              </TouchableOpacity>
            </View>

            {/* COMMENT LIST */}
            <ScrollView
              ref={scrollRef}
              style={styles.commentsContainer}
              contentContainerStyle={styles.commentsContent}
            >
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#0D5C3A" />
                </View>
              ) : comments.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>
                    🏌️ No comments yet — be the first!
                  </Text>
                </View>
              ) : (
                comments.map((c) => (
                  <View key={c.commentId} style={styles.commentCard}>
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentAuthor}>{c.displayName}</Text>

                      <View style={styles.commentRight}>
                        <Text style={styles.commentDate}>
                          {c.createdAt?.toDate?.()?.toLocaleDateString?.()}
                        </Text>

                        {/* Delete only for author or admin (rules enforce admin) */}
                        {c.userId === currentUserId && (
                          <TouchableOpacity
                            onPress={() => handleDeleteComment(c)}
                          >
                            <Text style={styles.deleteText}>Delete</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    <Text style={styles.commentContent}>{c.content}</Text>
                  </View>
                ))
              )}
            </ScrollView>

            {/* INPUT AREA */}
            <View style={styles.inputContainer}>
              <View style={styles.grassBorder} />

              <View style={styles.inputWrapper}>
                {/* Flag icon */}
                <View style={styles.flagContainer}>
                  <View style={styles.flagPole} />
                  <View style={styles.flag} />
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Add your comment..."
                  placeholderTextColor="#777"
                  value={newComment}
                  onChangeText={setNewComment}
                  multiline
                />

                <TouchableOpacity
                  onPress={handlePostComment}
                  disabled={!newComment.trim() || posting}
                  style={[
                    styles.postButton,
                    (!newComment.trim() || posting) &&
                      styles.postButtonDisabled,
                  ]}
                >
                  {posting ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Image
                      source={require("@/assets/icons/Post Score.png")}
                      style={styles.postIcon}
                    />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ----------------------- STYLES ----------------------- */
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  touchArea: { flex: 1 },

  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#A5D6A7",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  header: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },

  closeButton: {
    position: "absolute",
    right: 16,
    top: 12,
    padding: 4,
  },

  closeIcon: { width: 20, height: 20, tintColor: "#FFF" },

  commentsContainer: { flex: 1 },
  commentsContent: { padding: 14 },

  loadingContainer: { paddingVertical: 40 },

  emptyContainer: { padding: 30 },
  emptyText: { color: "#0D5C3A", fontSize: 15, textAlign: "center" },

  commentCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#0D5C3A",
  },

  commentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  commentRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  commentAuthor: {
    color: "#0D5C3A",
    fontWeight: "700",
    fontSize: 13,
  },

  commentDate: { color: "#666", fontSize: 11 },

  deleteText: {
    color: "#B00020",
    fontWeight: "700",
    fontSize: 12,
  },

  commentContent: {
    marginTop: 6,
    color: "#333",
    fontSize: 14,
    lineHeight: 20,
  },

  inputContainer: {
    backgroundColor: "#66BB6A",
  },

  grassBorder: {
    height: 6,
    backgroundColor: "#558B5A",
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
  },

  flagContainer: {
    width: 20,
    height: 36,
    justifyContent: "flex-end",
    alignItems: "center",
  },

  flagPole: {
    width: 2,
    height: 32,
    backgroundColor: "#333",
  },

  flag: {
    width: 10,
    height: 8,
    backgroundColor: "#FF5252",
    position: "absolute",
    top: 2,
    left: 2,
  },

  input: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    maxHeight: 100,
    textAlignVertical: "top",
    fontSize: 14,
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },

  postButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },

  postButtonDisabled: {
    opacity: 0.5,
    backgroundColor: "#999",
  },

  postIcon: { width: 22, height: 22, tintColor: "#FFF" },
});



