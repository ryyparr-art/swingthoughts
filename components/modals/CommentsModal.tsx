import { auth, db } from "@/constants/firebaseConfig";
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
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
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
}

interface UserProfile {
  displayName: string;
  avatar?: string;
}

export default function CommentsModal({
  visible,
  thoughtId,
  onClose,
  onCommentAdded,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);

  const currentUserId = auth.currentUser?.uid;

  /* ---------------- FETCH COMMENTS ---------------- */
  useEffect(() => {
    if (!visible) return;

    const fetch = async () => {
      setLoading(true);

      const q = query(
        collection(db, "thoughts", thoughtId, "comments"),
        orderBy("createdAt", "asc")
      );

      const snap = await getDocs(q);
      const loaded: Comment[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      setComments(loaded);

      const uniqueUserIds = Array.from(new Set(loaded.map((c) => c.userId)));
      const userData: Record<string, UserProfile> = {};

      await Promise.all(
        uniqueUserIds.map(async (uid) => {
          const u = await getDoc(doc(db, "users", uid));
          if (u.exists()) {
            userData[uid] = {
              displayName: u.data().displayName,
              avatar: u.data().avatar,
            };
          }
        })
      );

      setUserMap(userData);
      setLoading(false);
    };

    fetch();
  }, [visible, thoughtId]);

  /* ---------------- POST COMMENT ---------------- */
  const post = async () => {
    if (!text.trim() || !currentUserId) return;

    setPosting(true);

    await addDoc(collection(db, "thoughts", thoughtId, "comments"), {
      content: text.trim(),
      userId: currentUserId,
      createdAt: new Date(),
      likes: 0,
      likedBy: [],
    });

    await updateDoc(doc(db, "thoughts", thoughtId), {
      comments: increment(1),
    });

    setText("");
    onCommentAdded();
    setPosting(false);
  };

  /* ---------------- LIKE COMMENT ---------------- */
  const toggleLike = async (comment: Comment) => {
    if (!currentUserId) return;

    const ref = doc(db, "thoughts", thoughtId, "comments", comment.id);
    const hasLiked = comment.likedBy?.includes(currentUserId);

    await updateDoc(ref, {
      likes: increment(hasLiked ? -1 : 1),
      likedBy: hasLiked
        ? comment.likedBy?.filter((id) => id !== currentUserId)
        : [...(comment.likedBy || []), currentUserId],
    });

    setComments((prev) =>
      prev.map((c) =>
        c.id === comment.id
          ? {
              ...c,
              likes: hasLiked ? (c.likes || 0) - 1 : (c.likes || 0) + 1,
              likedBy: hasLiked
                ? c.likedBy?.filter((id) => id !== currentUserId)
                : [...(c.likedBy || []), currentUserId],
            }
          : c
      )
    );
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
            <TouchableOpacity onPress={onClose} style={styles.headerButton}>
              <Image
                source={require("@/assets/icons/Close.png")}
                style={styles.closeIcon}
              />
            </TouchableOpacity>

            <Text style={styles.title}>Comments</Text>

            {/* Spacer to keep title centered */}
            <View style={styles.headerButton} />
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

                  return (
                    <View style={styles.commentRow}>
                      {user?.avatar ? (
                        <Image
                          source={{ uri: user.avatar }}
                          style={styles.avatar}
                        />
                      ) : (
                        <View style={styles.avatarPlaceholder} />
                      )}

                      <View style={styles.commentBody}>
                        <TouchableOpacity
                          onPress={() =>
                            router.push(`/locker/${item.userId}`)
                          }
                        >
                          <Text style={styles.name}>
                            {item.userId === currentUserId
                              ? "You"
                              : user?.displayName || "Anonymous"}
                          </Text>
                        </TouchableOpacity>

                        <Text>{item.content}</Text>
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
                    </View>
                  );
                }}
              />
            )}
          </View>

          {/* INPUT */}
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Add a comment…"
              value={text}
              onChangeText={setText}
            />
            <TouchableOpacity onPress={post} disabled={posting}>
              <Image
                source={require("@/assets/icons/Post Score.png")}
                style={styles.send}
              />
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
    height: "65%",
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
    width: 40,
    alignItems: "center",
  },
  closeIcon: {
    width: 24,
    height: 24,
    tintColor: "#0D5C3A",
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
    alignItems: "center",
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
    backgroundColor: "#CCC",
    marginRight: 10,
  },
  commentBody: {
    flex: 1,
  },
  name: {
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
  inputRow: {
    flexDirection: "row",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#DDD",
    backgroundColor: "#E8DCC3",
  },
  input: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 20,
    paddingHorizontal: 14,
    marginRight: 10,
  },
  send: {
    width: 28,
    height: 28,
    tintColor: "#0D5C3A",
  },
});











