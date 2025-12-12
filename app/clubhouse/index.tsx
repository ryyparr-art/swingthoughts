import BottomActionBar from "@/components/navigation/BottomActionBar";
import LowmanCarousel from "@/components/navigation/LowmanCarousel";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";

import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import CommentsModal from "@/components/ui/CommentsModal";
import FilterBottomSheet from "@/components/ui/FilterBottomSheet";
import FilterFAB from "@/components/ui/FilterFAB";

interface Thought {
  id: string;            // Firestore document ID
  thoughtId: string;     // legacy field
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
}

export default function ClubhouseScreen() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");

  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState<any>({});

  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedThought, setSelectedThought] = useState<Thought | null>(null);

  const router = useRouter();

  /* ------------------ AUTH ------------------ */
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) setCurrentUserId(user.uid);
    });
    return () => unsub();
  }, []);

  /* ------------------ FETCH ------------------ */
  useEffect(() => {
    fetchThoughts(activeFilters);
  }, []);

  const fetchThoughts = async (filters: any = {}) => {
    try {
      setLoading(true);

      let q: any = collection(db, "thoughts");
      const conditions = [];

      if (filters.type) conditions.push(where("postType", "==", filters.type));
      if (filters.user) conditions.push(where("displayName", "==", filters.user));
      if (filters.course) conditions.push(where("courseName", "==", filters.course));

      if (conditions.length > 0) q = query(q, ...conditions);
      q = query(q, orderBy("createdAt", "desc"));

      const snapshot = await getDocs(q);
      const list: Thought[] = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as Thought;

        const thought: Thought = {
          id: docSnap.id,
          ...data,
        };

        try {
          const userDoc = await getDoc(doc(db, "users", thought.userId));
          thought.displayName = userDoc.exists()
            ? userDoc.data().displayName
            : "Anonymous";
        } catch {
          thought.displayName = "Anonymous";
        }

        list.push(thought);
      }

      setThoughts(list);
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
      setLoading(false);
    }
  };

  /* ------------------ LIKE ------------------ */
  const handleLike = async (thought: Thought) => {
    if (!currentUserId) return Alert.alert("Login required.");

    if (thought.userId === currentUserId) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return Alert.alert("Can't Like Your Own Post");
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const ref = doc(db, "thoughts", thought.id);
      const hasLiked = thought.likedBy?.includes(currentUserId);

      if (hasLiked) {
        await updateDoc(ref, {
          likes: increment(-1),
          likedBy: arrayRemove(currentUserId),
        });
      } else {
        await updateDoc(ref, {
          likes: increment(1),
          likedBy: arrayUnion(currentUserId),
        });
      }

      setThoughts((prev) =>
        prev.map((t) =>
          t.id === thought.id
            ? {
                ...t,
                likes: hasLiked ? t.likes - 1 : t.likes + 1,
                likedBy: hasLiked
                  ? t.likedBy?.filter((id) => id !== currentUserId)
                  : [...(t.likedBy || []), currentUserId],
              }
            : t
        )
      );
    } catch (err) {
      console.error("Like error:", err);
    }
  };

  /* ------------------ COMMENTS ------------------ */
  const handleComments = (thought: Thought) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedThought(thought);
    setCommentsModalVisible(true);
  };

  const handleCommentAdded = () => {
    if (!selectedThought) return;

    setThoughts((prev) =>
      prev.map((t) =>
        t.id === selectedThought.id
          ? { ...t, comments: (t.comments || 0) + 1 }
          : t
      )
    );
  };

  /* ------------------ REPORT ------------------ */
  const handleReport = (thought: Thought) => {
    if (!currentUserId) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert("Report Post", "Why are you reporting?", [
      { text: "Cancel", style: "cancel" },
      { text: "Spam", onPress: () => submitReport(thought.id, "spam") },
      { text: "Inappropriate", onPress: () => submitReport(thought.id, "inappropriate") },
      { text: "Harassment", onPress: () => submitReport(thought.id, "harassment") },
      { text: "Other", onPress: () => submitReport(thought.id, "other") },
    ]);
  };

  const submitReport = async (thoughtId: string, reason: string) => {
    try {
      await addDoc(collection(db, "reports"), {
        thoughtId,
        reportedBy: currentUserId,
        reason,
        createdAt: new Date(),
      });

      Alert.alert("Thank you", "Your report has been submitted.");
    } catch (err) {
      console.error("Report error:", err);
    }
  };

  /* ------------------ RENDER ------------------ */
  const renderThought = ({ item }: { item: Thought }) => {
    const hasLiked = item.likedBy?.includes(currentUserId);

    return (
      <View style={styles.thoughtCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.displayName}>{item.displayName}</Text>

          <View style={styles.headerRight}>
            <View style={styles.thoughtTypeBadge}>
              <Text style={styles.thoughtTypeText}>
                {item.postType || "General"}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.reportButton}
              onPress={() => handleReport(item)}
            >
              <Text style={styles.reportText}>⋯</Text>
            </TouchableOpacity>
          </View>
        </View>

        {item.imageUrl && (
          <Image source={{ uri: item.imageUrl }} style={styles.thoughtImage} />
        )}

        <View style={styles.contentContainer}>
          <Text style={styles.content}>{item.content}</Text>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleLike(item)}
            >
              <Image
                source={require("@/assets/icons/Throw Darts.png")}
                style={[
                  styles.actionIcon,
                  hasLiked && styles.actionIconActive,
                ]}
              />
              <Text
                style={[
                  styles.actionText,
                  hasLiked && styles.actionTextActive,
                ]}
              >
                {item.likes}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleComments(item)}
            >
              <Image
                source={require("@/assets/icons/Comments.png")}
                style={styles.actionIcon}
              />
              <Text style={styles.actionText}>{item.comments || 0}</Text>
            </TouchableOpacity>

            <Text style={styles.date}>
              {item.createdAt?.toDate?.()?.toLocaleDateString?.() || "Today"}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      <View style={styles.carouselWrapper}>
        <LowmanCarousel />
      </View>

      <TopNavBar />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D5C3A" />
          <Text style={styles.loadingText}>Loading thoughts...</Text>
        </View>
      ) : (
        <FlatList
          data={thoughts}
          renderItem={renderThought}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}

      <FilterFAB onPress={() => setFilterSheetVisible(true)} />

      <FilterBottomSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        onApplyFilters={(f) => {
          setActiveFilters(f);
          fetchThoughts(f);
        }}
      />

      <CommentsModal
        visible={commentsModalVisible}
        thoughtId={selectedThought?.id || ""}
        thoughtContent={selectedThought?.content || ""}
        onClose={() => {
          setCommentsModalVisible(false);
          setSelectedThought(null);
        }}
        onCommentAdded={handleCommentAdded}
      />

      <BottomActionBar />
      <SwingFooter />
    </View>
  );
}

/* ------------------ STYLES ------------------ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  safeTop: { backgroundColor: "#0D5C3A" },

  carouselWrapper: {
    height: 50,
    justifyContent: "center",
    backgroundColor: "#F4EED8",
  },

  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#0D5C3A", fontSize: 16 },

  listContent: { padding: 16, paddingBottom: 32 },

  thoughtCard: {
    backgroundColor: "white",
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE",
  },

  displayName: { fontSize: 16, fontWeight: "700", color: "#0D5C3A" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },

  thoughtTypeBadge: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },

  thoughtTypeText: { color: "#FFF", fontWeight: "600", fontSize: 11 },

  reportButton: { padding: 4 },
  reportText: { fontSize: 20, color: "#666", fontWeight: "700" },

  thoughtImage: { width: "100%", height: 300 },

  contentContainer: { padding: 16 },
  content: { fontSize: 16, color: "#333", lineHeight: 24, marginBottom: 12 },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#EEE",
    paddingTop: 12,
    gap: 20,
  },

  actionButton: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionIcon: { width: 20, height: 20, tintColor: "#666" },
  actionIconActive: { tintColor: "#0D5C3A" },

  actionText: { fontSize: 14, color: "#666", fontWeight: "600" },
  actionTextActive: { color: "#0D5C3A" },

  date: { fontSize: 12, color: "#999", marginLeft: "auto" },
});





