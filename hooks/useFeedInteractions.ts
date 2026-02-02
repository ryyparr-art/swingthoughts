/**
 * useFeedInteractions Hook
 * 
 * Handles all user interactions with feed posts:
 * - Like/unlike
 * - Open comments
 * - Report post
 * - Edit post navigation
 * 
 * Extracted from clubhouse/index.tsx for cleaner separation.
 */

import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
    addDoc,
    arrayRemove,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    getDocs,
    increment,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import { useCallback, useState } from "react";
import { Alert } from "react-native";

import { db } from "@/constants/firebaseConfig";
import { Thought } from "@/utils/feedHelpers";
import { soundPlayer } from "@/utils/soundPlayer";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface UseFeedInteractionsOptions {
  currentUserId: string;
  canInteract: boolean;
  thoughts: Thought[];
  setThoughts: React.Dispatch<React.SetStateAction<Thought[]>>;
}

interface UseFeedInteractionsReturn {
  // Comments modal
  commentsModalVisible: boolean;
  selectedThought: Thought | null;
  handleComments: (thought: Thought) => void;
  handleCloseComments: () => void;
  handleCommentAdded: () => void;
  
  // Report modal
  reportModalVisible: boolean;
  reportingThought: Thought | null;
  handleReportPost: (thought: Thought) => void;
  handleCloseReport: () => void;
  
  // Actions
  handleLike: (thought: Thought) => Promise<void>;
  handleEditPost: (thought: Thought) => void;
}

/* ================================================================ */
/* HOOK                                                             */
/* ================================================================ */

export function useFeedInteractions({
  currentUserId,
  canInteract,
  thoughts,
  setThoughts,
}: UseFeedInteractionsOptions): UseFeedInteractionsReturn {
  const router = useRouter();

  // Comments modal state
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedThought, setSelectedThought] = useState<Thought | null>(null);
  
  // Report modal state
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportingThought, setReportingThought] = useState<Thought | null>(null);

  /* ---------------------------------------------------------------- */
  /* LIKE / UNLIKE                                                    */
  /* ---------------------------------------------------------------- */

  const handleLike = useCallback(async (thought: Thought) => {
    if (!currentUserId) {
      soundPlayer.play('error');
      Alert.alert("Sign In Required", "Please sign in to like posts.");
      return;
    }

    if (!canInteract) {
      soundPlayer.play('error');
      Alert.alert(
        "Verification Required",
        "Your account must be verified before you can interact with posts. Please wait for admin verification."
      );
      return;
    }

    if (thought.userId === currentUserId) {
      soundPlayer.play('error');
      Alert.alert("Can't Like", "You can't like your own post.");
      return;
    }

    const wasLiked = thought.likedBy?.includes(currentUserId) || false;
    const originalLikes = thought.likes || 0;

    try {
      soundPlayer.play('dart');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const ref = doc(db, "thoughts", thought.id);

      // Optimistic update
      setThoughts((prev) =>
        prev.map((t) =>
          t.id === thought.id
            ? {
                ...t,
                likes: wasLiked ? Math.max(0, t.likes - 1) : t.likes + 1,
                likedBy: wasLiked
                  ? (t.likedBy || []).filter((id) => id !== currentUserId)
                  : [...(t.likedBy || []), currentUserId],
              }
            : t
        )
      );

      if (wasLiked) {
        // Unlike
        await updateDoc(ref, {
          likes: increment(-1),
          likedBy: arrayRemove(currentUserId),
        });

        // Remove like document
        const likesQuery = query(
          collection(db, "likes"),
          where("userId", "==", currentUserId),
          where("postId", "==", thought.id)
        );
        const likesSnapshot = await getDocs(likesQuery);
        for (const likeDoc of likesSnapshot.docs) {
          await deleteDoc(likeDoc.ref);
        }
      } else {
        // Like
        await updateDoc(ref, {
          likes: increment(1),
          likedBy: arrayUnion(currentUserId),
        });

        // Create like document (for notifications)
        await addDoc(collection(db, "likes"), {
          userId: currentUserId,
          postId: thought.id,
          postAuthorId: thought.userId,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error("Like error:", err);
      soundPlayer.play('error');
      
      // Revert optimistic update
      setThoughts((prev) =>
        prev.map((t) =>
          t.id === thought.id
            ? {
                ...t,
                likes: originalLikes,
                likedBy: wasLiked
                  ? [...(t.likedBy || []), currentUserId]
                  : (t.likedBy || []).filter((id) => id !== currentUserId),
              }
            : t
        )
      );
    }
  }, [currentUserId, canInteract, setThoughts]);

  /* ---------------------------------------------------------------- */
  /* COMMENTS                                                         */
  /* ---------------------------------------------------------------- */

  const handleComments = useCallback((thought: Thought) => {
    if (!canInteract) {
      soundPlayer.play('error');
      Alert.alert(
        "Verification Required",
        "Your account must be verified before you can comment. Please wait for admin verification."
      );
      return;
    }

    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedThought(thought);
    setCommentsModalVisible(true);
  }, [canInteract]);

  const handleCloseComments = useCallback(() => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCommentsModalVisible(false);
    setSelectedThought(null);
  }, []);

  const handleCommentAdded = useCallback(() => {
    console.log("📝 handleCommentAdded called");
    
    if (!selectedThought) {
      console.log("❌ No selectedThought, cannot update count");
      return;
    }

    soundPlayer.play('postThought');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Update comment count in thoughts
    setThoughts((prev) => {
      return prev.map((t) => {
        if (t.id === selectedThought.id) {
          console.log("✅ Found thought, updating comments from", t.comments, "to", (t.comments || 0) + 1);
          return { ...t, comments: (t.comments || 0) + 1 };
        }
        return t;
      });
    });

    // Update selected thought too
    setSelectedThought((prev) => 
      prev ? { ...prev, comments: (prev.comments || 0) + 1 } : prev
    );
  }, [selectedThought, setThoughts]);

  /* ---------------------------------------------------------------- */
  /* REPORT                                                           */
  /* ---------------------------------------------------------------- */

  const handleReportPost = useCallback((thought: Thought) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReportingThought(thought);
    setReportModalVisible(true);
  }, []);

  const handleCloseReport = useCallback(() => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReportModalVisible(false);
    setReportingThought(null);
  }, []);

  /* ---------------------------------------------------------------- */
  /* EDIT POST                                                        */
  /* ---------------------------------------------------------------- */

  const handleEditPost = useCallback((thought: Thought) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/create?editId=${thought.id}`);
  }, [router]);

  return {
    // Comments modal
    commentsModalVisible,
    selectedThought,
    handleComments,
    handleCloseComments,
    handleCommentAdded,
    
    // Report modal
    reportModalVisible,
    reportingThought,
    handleReportPost,
    handleCloseReport,
    
    // Actions
    handleLike,
    handleEditPost,
  };
}