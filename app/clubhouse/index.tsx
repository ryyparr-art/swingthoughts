import BottomActionBar from "@/components/navigation/BottomActionBar";
import LowmanCarousel from "@/components/navigation/LowmanCarousel";
import SwingFooter from "@/components/navigation/SwingFooter";
import TopNavBar from "@/components/navigation/TopNavBar";
import { auth, db } from "@/constants/firebaseConfig";

import {
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
  where
} from "firebase/firestore";

import * as Haptics from "expo-haptics";
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
}

export default function ClubhouseScreen() {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserData, setCurrentUserData] = useState<any>(null);

  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState<any>({});

  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedThought, setSelectedThought] = useState<Thought | null>(null);

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

  /* ------------------ FETCH ------------------ */
  useEffect(() => {
    fetchThoughts(activeFilters);
  }, []);

  const fetchThoughts = async (filters: any = {}) => {
    try {
      setLoading(true);

      let q: any = collection(db, "thoughts");
      const conditions: any[] = [];

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
    if (!canWrite) {
      return Alert.alert(
        "Verification Required",
        "You’ll be able to interact once your account is verified."
      );
    }

    if (thought.userId === currentUserId) {
      return Alert.alert("You can’t like your own post");
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const ref = doc(db, "thoughts", thought.id);
      const hasLiked = thought.likedBy?.includes(currentUserId);

      await updateDoc(ref, {
        likes: increment(hasLiked ? -1 : 1),
        likedBy: hasLiked
          ? arrayRemove(currentUserId)
          : arrayUnion(currentUserId),
      });

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
    if (!canWrite) {
      return Alert.alert(
        "Verification Required",
        "Commenting unlocks after verification."
      );
    }

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

  /* ------------------ RENDER ------------------ */
  const renderThought = ({ item }: { item: Thought }) => {
    const hasLiked = item.likedBy?.includes(currentUserId);

    return (
      <View style={styles.thoughtCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.displayName}>{item.displayName}</Text>
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
              <Text style={styles.actionText}>{item.likes}</Text>
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

      <BottomActionBar disabled={!canWrite} />
      <SwingFooter />
    </View>
  );
}

/* ------------------ STYLES ------------------ */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  safeTop: { backgroundColor: "#0D5C3A" },
  carouselWrapper: { height: 50, justifyContent: "center" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#0D5C3A" },
  listContent: { padding: 16, paddingBottom: 32 },
  thoughtCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    marginBottom: 16,
    elevation: 3,
  },
  cardHeader: { padding: 12 },
  displayName: { fontWeight: "700", color: "#0D5C3A" },
  thoughtImage: { width: "100%", height: 300 },
  contentContainer: { padding: 16 },
  content: { fontSize: 16, marginBottom: 12 },
  footer: { flexDirection: "row", gap: 20 },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionIcon: { width: 20, height: 20, tintColor: "#666" },
  actionIconActive: { tintColor: "#0D5C3A" },
  actionText: { fontSize: 14, color: "#666" },
});







