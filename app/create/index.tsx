import { auth, db, storage } from "@/constants/firebaseConfig";

function canWrite(userData: any): boolean {
  if (!userData) return false;
  if (typeof userData.verified === "boolean") return userData.verified;
  if (typeof userData.verificationStatus === "string") return userData.verificationStatus === "approved";
  return !!userData.userType;
}

import { useRouter } from "expo-router";
import { addDoc, collection, doc, getDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/* -------------------------------- CONFIG -------------------------------- */

const POST_TYPES = [
  { id: "swing-thought", label: "Swing Thought", icon: "golf" },
  { id: "witb", label: "WITB", icon: "briefcase" },
  { id: "general", label: "General", icon: "chatbubbles" },
  { id: "meme", label: "Meme", icon: "happy" },
  { id: "question", label: "Question", icon: "help-circle" },
  { id: "pro-tip", label: "Pro Tip", icon: "star", restrictedTo: "PGA Professional" },
  { id: "course-announcement", label: "Course Announcement", icon: "megaphone", restrictedTo: "Course" },
];

const MAX_CHARACTERS = 500;

/* -------------------------------- TYPES -------------------------------- */

interface GolfCourse {
  id: number;
  club_name: string;
  course_name: string;
  location: {
    city: string;
    state: string;
    latitude: number;
    longitude: number;
  };
}

/* ======================================================================== */

export default function CreateScreen() {
  const router = useRouter();

  const [selectedType, setSelectedType] = useState("swing-thought");
  const [content, setContent] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);

  const [userData, setUserData] = useState<any>(null);
  const writable = canWrite(userData);

  const [selectedCourse, setSelectedCourse] = useState<GolfCourse | null>(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [localCourses, setLocalCourses] = useState<GolfCourse[]>([]);
  const [courseResults, setCourseResults] = useState<GolfCourse[]>([]);
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);

  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [detectedCity, setDetectedCity] = useState("");

  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  /* --------------------------- LOAD USER DATA --------------------------- */

  useEffect(() => {
    const loadUser = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) setUserData(snap.data());
    };

    loadUser();
  }, []);

  /* --------------------------- POST HANDLING ---------------------------- */

  const handlePost = async () => {
    if (!writable) {
      Alert.alert(
        "Verification Pending",
        "Posting unlocks once your account is verified."
      );
      return;
    }

    if (!content.trim()) {
      Alert.alert("Empty Post", "Please add some content.");
      return;
    }

    setIsPosting(true);

    try {
      let imageUrl = null;

      if (imageUri) {
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const path = `posts/${auth.currentUser?.uid}/${Date.now()}.jpg`;
        const storageRef = ref(storage, path);

        await uploadBytes(storageRef, blob);
        imageUrl = await getDownloadURL(storageRef);
      }

      await addDoc(collection(db, "thoughts"), {
        thoughtId: `thought_${Date.now()}`,
        userId: auth.currentUser?.uid,
        userType: userData?.userType,
        content: content.trim(),
        postType: selectedType,
        imageUrl,
        courseId: selectedCourse?.id || null,
        courseName: selectedCourse?.course_name || null,
        createdAt: new Date(),
        likes: 0,
        likedBy: [],
        comments: 0,
      });

      Alert.alert("Tee’d Up ⛳️", "Your post has been published.");
      router.back();
    } catch (err) {
      console.error("Post error:", err);
      Alert.alert("Error", "Failed to post. Please try again.");
      setIsPosting(false);
    }
  };

  /* --------------------------- UI ---------------------------- */

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.cancelText}>Re-Tee</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Create Post</Text>

          <TouchableOpacity
            onPress={handlePost}
            disabled={!writable || isPosting}
            style={[
              styles.postButton,
              (!writable || isPosting) && styles.postButtonDisabled,
            ]}
          >
            <Text style={styles.postText}>
              {isPosting ? "Posting…" : "Tee’d Up"}
            </Text>
          </TouchableOpacity>
        </View>

        {!writable && (
          <View style={styles.lockBanner}>
            <Text style={styles.lockText}>
              Posting unlocks once verification is approved.
            </Text>
          </View>
        )}

        {/* Rest of your UI remains unchanged */}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* --------------------------- STYLES ---------------------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4EED8" },
  keyboardView: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0D5C3A",
    padding: 12,
  },

  headerTitle: { color: "#fff", fontWeight: "700", fontSize: 18 },
  cancelText: { color: "#fff", fontWeight: "600" },

  postButton: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },

  postButtonDisabled: {
    opacity: 0.4,
  },

  postText: { color: "#0D5C3A", fontWeight: "700" },

  lockBanner: {
    backgroundColor: "#FFF3CD",
    borderColor: "#FFECB5",
    borderWidth: 1,
    padding: 12,
    margin: 12,
    borderRadius: 10,
  },

  lockText: {
    color: "#664D03",
    textAlign: "center",
    fontWeight: "600",
  },
});






