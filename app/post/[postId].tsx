import CommentsModal from "@/components/modals/CommentsModal";
import { auth, db } from "@/constants/firebaseConfig";
import { getPostTypeLabel } from "@/constants/postTypes";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
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
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Thought {
  id: string;
  thoughtId: string;
  userId: string;
  userType: string;
  content: string;
  postType?: string;
  imageUrl?: string;
  createdAt: any;
  likes: number;
  likedBy?: string[];
  comments?: number;
  displayName?: string;
  courseName?: string;
  avatarUrl?: string;
}

export default function PostDetailScreen() {
  const router = useRouter();
  const { postId } = useLocalSearchParams();

  const [thought, setThought] = useState<Thought | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserData, setCurrentUserData] = useState<any>(null);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);

  /* ------------------ AUTH ------------------ */
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

      setCurrentUserId(user.uid);

      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) setCurrentUserData(snap.data());
    });

    return () => unsub();
  }, []);

  /* ------------------ PERMISSIONS ------------------ */
  const canWrite = (() => {
    if (!currentUserData) return false;

    if (
      currentUserData.userType === "Golfer" ||
      currentUserData.userType === "Junior"
    ) {
      return currentUserData.acceptedTerms === true;
    }

    if (
      currentUserData.userType === "Course" ||
      currentUserData.userType === "PGA Professional"
    ) {
      return currentUserData.isVerified === true;
    }

    return false;
  })();

  /* ------------------ FETCH POST ------------------ */
  useEffect(() => {
    if (postId) {
      fetchPost();
    }
  }, [postId]);

  const fetchPost = async () => {
    try {
      setLoading(true);

      const docSnap = await getDoc(doc(db, "thoughts", postId as string));

      if (!docSnap.exists()) {
        soundPlayer.play("error");
        Alert.alert("Post not found");
        router.back();
        return;
      }

      const data = docSnap.data() as Thought;

      const post: Thought = {
        ...data,
        id: docSnap.id,
        thoughtId: data.thoughtId || docSnap.id,
      };

      // Fetch user info
      try {
        const userDoc = await getDoc(doc(db, "users", post.userId));
        if (userDoc.exists()) {
          post.displayName = userDoc.data().displayName || "Anonymous";
          post.avatarUrl = userDoc.data().avatar || undefined;
        } else {
          post.displayName = "Anonymous";
        }
      } catch {
        post.displayName = "Anonymous";
      }

      setThought(post);
      setLoading(false);
    } catch (err) {
      console.error("Fetch post error:", err);
      soundPlayer.play("error");
      Alert.alert("Error loading post");
      router.back();
    }
  };

  /* ------------------ LIKE ------------------ */
  const handleLike = async () => {
    if (!thought) return;

    if (!canWrite) {
      soundPlayer.play("error");
      return Alert.alert(
        "Verification Required",
        "You'll be able to interact once your account is verified."
      );
    }

    if (thought.userId === currentUserId) {
      soundPlayer.play("error");
      return Alert.alert("You can't like your own post");
    }

    try {
      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const ref = doc(db, "thoughts", thought.id);
      const hasLiked = thought.likedBy?.includes(currentUserId);

      if (hasLiked) {
        // ✅ UNLIKE: Update post + delete like document
        await updateDoc(ref, {
          likes: increment(-1),
          likedBy: arrayRemove(currentUserId),
        });

        // Find and delete the like document
        const likesQuery = query(
          collection(db, "likes"),
          where("userId", "==", currentUserId),
          where("postId", "==", thought.id)
        );
        const likesSnap = await getDocs(likesQuery);
        likesSnap.forEach(async (likeDoc) => {
          await deleteDoc(likeDoc.ref);
        });
      } else {
        // ✅ LIKE: Update post + create like document (triggers Cloud Function)
        await updateDoc(ref, {
          likes: increment(1),
          likedBy: arrayUnion(currentUserId),
        });

        // Create like document - this triggers onLikeCreated Cloud Function
        await addDoc(collection(db, "likes"), {
          userId: currentUserId,
          postId: thought.id,
          postAuthorId: thought.userId,
          createdAt: serverTimestamp(),
        });

        soundPlayer.play("postThought");
      }

      // Update local state
      setThought({
        ...thought,
        likes: hasLiked ? thought.likes - 1 : thought.likes + 1,
        likedBy: hasLiked
          ? thought.likedBy?.filter((id) => id !== currentUserId)
          : [...(thought.likedBy || []), currentUserId],
      });
    } catch (err) {
      console.error("Like error:", err);
      soundPlayer.play("error");
    }
  };

  /* ------------------ COMMENTS ------------------ */
  const handleComments = () => {
    if (!canWrite) {
      soundPlayer.play("error");
      return Alert.alert(
        "Verification Required",
        "Commenting unlocks after verification."
      );
    }

    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCommentsModalVisible(true);
  };

  const handleCommentAdded = () => {
    if (!thought) return;

    soundPlayer.play("postThought");

    setThought({
      ...thought,
      comments: (thought.comments || 0) + 1,
    });
  };

  /* ------------------ RENDER ------------------ */

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  if (!thought) {
    return null;
  }

  const hasLiked = thought.likedBy?.includes(currentUserId);
  const hasComments = !!thought.comments && thought.comments > 0;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Post</Text>

        <View style={styles.headerButton} />
      </View>

      <ScrollView style={styles.content}>
        {/* Post Card - Same design as clubhouse */}
        <View style={styles.thoughtCard}>
          <View style={styles.cardHeader}>
            <View style={styles.headerLeft}>
              <Image
                source={{ uri: thought.avatarUrl }}
                style={styles.avatar}
              />
              <View style={styles.headerInfo}>
                <Text style={styles.displayName}>{thought.displayName}</Text>
                <Text style={styles.timestamp}>
                  {thought.createdAt?.toDate
                    ? thought.createdAt.toDate().toLocaleDateString()
                    : ""}
                </Text>
              </View>
            </View>

            <View style={styles.thoughtTypeBadge}>
              <Text style={styles.thoughtTypeText}>
                {getPostTypeLabel(thought.postType)}
              </Text>
            </View>
          </View>

          {thought.imageUrl && (
            <Image
              source={{ uri: thought.imageUrl }}
              style={styles.thoughtImage}
            />
          )}

          <View style={styles.contentContainer}>
            <Text style={styles.thoughtContent}>{thought.content}</Text>

            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleLike}
              >
                <Image
                  source={require("@/assets/icons/Throw Darts.png")}
                  style={[
                    styles.actionIcon,
                    hasLiked && styles.actionIconLiked,
                  ]}
                />
                <Text style={styles.actionText}>{thought.likes}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleComments}
              >
                <Image
                  source={require("@/assets/icons/Comments.png")}
                  style={[
                    styles.actionIcon,
                    hasComments && styles.actionIconCommented,
                  ]}
                />
                <Text style={styles.actionText}>{thought.comments || 0}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Comments Modal */}
      <CommentsModal
        visible={commentsModalVisible}
        thoughtId={thought.id}
        postOwnerId={thought.userId}
        postContent={thought.content}
        onClose={() => {
          soundPlayer.play("click");
          setCommentsModalVisible(false);
        }}
        onCommentAdded={handleCommentAdded}
      />
    </View>
  );
}

/* ------------------ STYLES ------------------ */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  safeTop: {
    backgroundColor: "#0D5C3A",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },

  backButton: {
    width: 40,
  },

  headerButton: {
    width: 40,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 1,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },

  content: {
    flex: 1,
  },

  thoughtCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    margin: 16,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },

  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },

  headerInfo: {
    flex: 1,
  },

  displayName: {
    fontWeight: "700",
    color: "#0D5C3A",
    fontSize: 16,
  },

  timestamp: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },

  thoughtTypeBadge: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },

  thoughtTypeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  thoughtImage: {
    width: "100%",
    height: 300,
  },

  contentContainer: {
    padding: 16,
  },

  thoughtContent: {
    fontSize: 16,
    marginBottom: 12,
    color: "#333",
  },

  footer: {
    flexDirection: "row",
    gap: 20,
  },

  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  actionIcon: {
    width: 20,
    height: 20,
    tintColor: "#666",
  },

  actionIconLiked: {
    tintColor: "#FF3B30",
  },

  actionIconCommented: {
    tintColor: "#FFD700",
  },

  actionText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
});