import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { auth, db, storage } from "@/constants/firebaseConfig";
import { POST_TYPES } from "@/constants/postTypes";

import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { addDoc, collection, doc, getDoc, getDocs, query } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useRef, useState } from "react";
import {
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
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/* -------------------------------- UTILS -------------------------------- */

function canWrite(userData: any): boolean {
  if (!userData) return false;
  if (typeof userData.verified === "boolean") return userData.verified;
  if (typeof userData.verificationStatus === "string") return userData.verificationStatus === "approved";
  return !!userData.userType;
}

/* -------------------------------- CONFIG -------------------------------- */

const MAX_CHARACTERS = 280;
const MAX_PARTNERS = 5;
const MAX_COURSES = 5;

/* -------------------------------- TYPES -------------------------------- */

interface Partner {
  userId: string;
  displayName: string;
}

interface Course {
  courseId: number;
  courseName: string;
}

interface GolfCourse {
  id: number;
  club_name: string;
  course_name: string;
  location: {
    city: string;
    state: string;
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

  const [taggedPartners, setTaggedPartners] = useState<Partner[]>([]);
  const [taggedCourses, setTaggedCourses] = useState<Course[]>([]);

  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteType, setAutocompleteType] = useState<"partner" | "course" | null>(null);
  const [autocompleteResults, setAutocompleteResults] = useState<any[]>([]);
  const [currentMention, setCurrentMention] = useState("");

  const [partnerModalVisible, setPartnerModalVisible] = useState(false);
  const [courseModalVisible, setCourseModalVisible] = useState(false);
  const [allPartners, setAllPartners] = useState<Partner[]>([]);
  const [courseSearchQuery, setCourseSearchQuery] = useState("");
  const [courseSearchResults, setCourseSearchResults] = useState<any[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const courseDebounceRef = useRef<NodeJS.Timeout | null>(null);

  /* --------------------------- LOAD USER DATA --------------------------- */

  useEffect(() => {
    const loadUser = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        setUserData(snap.data());
        
        // Load user's partners
        const partners = snap.data()?.partners || [];
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
    };

    loadUser();
  }, []);

  /* --------------------------- POST TYPES BY USER --------------------------- */

  const availableTypes = (() => {
    if (!userData?.userType) return POST_TYPES.golfer;

    if (userData.userType === "PGA Professional") return POST_TYPES.pro;
    if (userData.userType === "Course") return POST_TYPES.course;
    return POST_TYPES.golfer;
  })();

  /* --------------------------- IMAGE PICKER --------------------------- */

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  /* --------------------------- AUTOCOMPLETE LOGIC --------------------------- */

  const handleContentChange = (text: string) => {
    setContent(text);

    // Detect @ mention
    const lastAtIndex = text.lastIndexOf("@");
    if (lastAtIndex === -1) {
      setShowAutocomplete(false);
      return;
    }

    // Get text after last @
    const afterAt = text.slice(lastAtIndex + 1);
    
    // Check if there's a space after @ (mention ended)
    if (afterAt.includes(" ")) {
      setShowAutocomplete(false);
      return;
    }

    setCurrentMention(afterAt);

    // Debounce search
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
      // Search partners first
      const partnerResults = allPartners.filter((p) =>
        p.displayName.toLowerCase().includes(searchText.toLowerCase())
      );

      if (partnerResults.length > 0) {
        setAutocompleteType("partner");
        setAutocompleteResults(partnerResults);
        setShowAutocomplete(true);
        return;
      }

      // If no partners match, search courses
      searchCoursesAutocomplete(searchText);
    } catch (err) {
      console.error("Search error:", err);
    }
  };

  const searchCoursesAutocomplete = async (searchText: string) => {
    try {
      // Search cached courses first
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

      // Fall back to API
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
      const courses: GolfCourse[] = data.courses || [];

      if (courses.length > 0) {
        setAutocompleteType("course");
        setAutocompleteResults(
          courses.map((c) => ({
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
      if (taggedPartners.length >= MAX_PARTNERS) {
        Alert.alert("Limit Reached", `You can only tag up to ${MAX_PARTNERS} partners per post.`);
        return;
      }

      if (taggedPartners.find((p) => p.userId === item.userId)) {
        setShowAutocomplete(false);
        return;
      }

      const lastAtIndex = content.lastIndexOf("@");
      const beforeAt = content.slice(0, lastAtIndex);
      const afterMention = content.slice(lastAtIndex + 1 + currentMention.length);
      
      setContent(`${beforeAt}@${item.displayName}${afterMention}`);
      setTaggedPartners([...taggedPartners, { userId: item.userId, displayName: item.displayName }]);
    } else if (autocompleteType === "course") {
      if (taggedCourses.length >= MAX_COURSES) {
        Alert.alert("Limit Reached", `You can only tag up to ${MAX_COURSES} courses per post.`);
        return;
      }

      if (taggedCourses.find((c) => c.courseId === item.courseId)) {
        setShowAutocomplete(false);
        return;
      }

      const lastAtIndex = content.lastIndexOf("@");
      const beforeAt = content.slice(0, lastAtIndex);
      const afterMention = content.slice(lastAtIndex + 1 + currentMention.length);
      
      const courseTag = item.courseName.replace(/\s+/g, "");
      
      setContent(`${beforeAt}@${courseTag}${afterMention}`);
      setTaggedCourses([...taggedCourses, { courseId: item.courseId, courseName: item.courseName }]);
    }

    setShowAutocomplete(false);
  };

  /* --------------------------- PARTNER MODAL --------------------------- */

  const handleOpenPartnerModal = () => {
    if (allPartners.length === 0) {
      Alert.alert("No Partners", "You haven't partnered up with anyone yet.");
      return;
    }
    setPartnerModalVisible(true);
  };

  const handleSelectPartner = (partner: Partner) => {
    if (taggedPartners.length >= MAX_PARTNERS) {
      Alert.alert("Limit Reached", `You can only tag up to ${MAX_PARTNERS} partners per post.`);
      return;
    }

    if (taggedPartners.find((p) => p.userId === partner.userId)) {
      Alert.alert("Already Tagged", `@${partner.displayName} is already tagged.`);
      return;
    }

    setTaggedPartners([...taggedPartners, partner]);
    setPartnerModalVisible(false);
  };

  /* --------------------------- COURSE MODAL --------------------------- */

  const handleCourseSearchChange = (text: string) => {
    setCourseSearchQuery(text);

    if (courseDebounceRef.current) {
      clearTimeout(courseDebounceRef.current);
    }

    if (!text.trim()) {
      setCourseSearchResults([]);
      return;
    }

    courseDebounceRef.current = setTimeout(() => {
      searchCoursesModal(text);
    }, 300);
  };

  const searchCoursesModal = async (searchText: string) => {
    try {
      setLoadingCourses(true);

      // Search cached courses first
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
        setCourseSearchResults(cachedCourses);
        setLoadingCourses(false);
        return;
      }

      // Fall back to API
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

      if (!res.ok) {
        setLoadingCourses(false);
        return;
      }

      const data = await res.json();
      const courses: GolfCourse[] = data.courses || [];

      setCourseSearchResults(
        courses.map((c) => ({
          courseId: c.id,
          courseName: c.course_name,
          location: `${c.location.city}, ${c.location.state}`,
        }))
      );
      setLoadingCourses(false);
    } catch (err) {
      console.error("Course search error:", err);
      setLoadingCourses(false);
    }
  };

  const handleSelectCourse = (course: { courseId: number; courseName: string }) => {
    if (taggedCourses.length >= MAX_COURSES) {
      Alert.alert("Limit Reached", `You can only tag up to ${MAX_COURSES} courses per post.`);
      return;
    }

    if (taggedCourses.find((c) => c.courseId === course.courseId)) {
      Alert.alert("Already Tagged", `@${course.courseName} is already tagged.`);
      return;
    }

    setTaggedCourses([...taggedCourses, course]);
    setCourseModalVisible(false);
    setCourseSearchQuery("");
    setCourseSearchResults([]);
  };

  /* --------------------------- REMOVE TAGS --------------------------- */

  const removePartner = (userId: string) => {
    setTaggedPartners(taggedPartners.filter((p) => p.userId !== userId));
  };

  const removeCourse = (courseId: number) => {
    setTaggedCourses(taggedCourses.filter((c) => c.courseId !== courseId));
  };

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
        taggedPartners: taggedPartners.map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
        })),
        taggedCourses: taggedCourses.map((c) => ({
          courseId: c.courseId,
          courseName: c.courseName,
        })),
        createdAt: new Date(),
        likes: 0,
        likedBy: [],
        comments: 0,
      });

      Alert.alert("Tee'd Up ⛳️", "Your thought has been published.");
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
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <Image
              source={require("@/assets/icons/Close.png")}
              style={styles.closeIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Create Thought</Text>

          <TouchableOpacity
            onPress={handlePost}
            disabled={!writable || isPosting}
            style={[
              styles.postButton,
              (!writable || isPosting) && styles.postButtonDisabled,
            ]}
          >
            <Text style={styles.flagIcon}>⛳</Text>
          </TouchableOpacity>
        </View>

        {/* LOCK BANNER */}
        {!writable && (
          <View style={styles.lockBanner}>
            <Text style={styles.lockText}>
              Posting unlocks once verification is approved.
            </Text>
          </View>
        )}

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {/* IMAGE PREVIEW (ALWAYS VISIBLE) */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.imagePreviewBox}
              onPress={pickImage}
              disabled={!writable}
            >
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.imagePreview} />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Text style={styles.imagePlaceholderIcon}>📸</Text>
                  <Text style={styles.imagePlaceholderText}>Add Image</Text>
                  <Text style={styles.imagePlaceholderHint}>Thoughts with images get 3x more engagement</Text>
                </View>
              )}
            </TouchableOpacity>
            
            {imageUri && (
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => setImageUri(null)}
              >
                <Text style={styles.removeImageText}>✕ Remove Image</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* THOUGHT TYPE SELECTOR */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Thought Type</Text>
            <View style={styles.typeGrid}>
              {availableTypes.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.typeCard,
                    selectedType === type.id && styles.typeCardActive,
                  ]}
                  onPress={() => setSelectedType(type.id)}
                >
                  <Text
                    style={[
                      styles.typeCardText,
                      selectedType === type.id && styles.typeCardTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* CONTENT INPUT */}
          <View style={styles.section}>
            <TextInput
              style={styles.textInput}
              placeholder="What clicked for you today?"
              placeholderTextColor="#999"
              multiline
              maxLength={MAX_CHARACTERS}
              value={content}
              onChangeText={handleContentChange}
              editable={writable}
            />
            <Text style={styles.charCount}>{content.length}/{MAX_CHARACTERS}</Text>

            {/* AUTOCOMPLETE DROPDOWN */}
            {showAutocomplete && (
              <View style={styles.autocompleteContainer}>
                <FlatList
                  data={autocompleteResults}
                  keyExtractor={(item, idx) => `${item.userId || item.courseId}-${idx}`}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity
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
                  )}
                />
              </View>
            )}
          </View>

          {/* TAG BUTTONS */}
          <View style={styles.section}>
            <View style={styles.tagButtonsRow}>
              <TouchableOpacity
                style={styles.tagButton}
                onPress={handleOpenPartnerModal}
                disabled={!writable}
              >
                <Text style={styles.tagButtonIcon}>👤</Text>
                <Text style={styles.tagButtonText}>Tag Partners</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tagButton}
                onPress={() => setCourseModalVisible(true)}
                disabled={!writable}
              >
                <Text style={styles.tagButtonIcon}>⛳</Text>
                <Text style={styles.tagButtonText}>Tag Course</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* TAGGED PARTNERS */}
          {taggedPartners.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Tagged Partners</Text>
              <View style={styles.tagContainer}>
                {taggedPartners.map((partner) => (
                  <View key={partner.userId} style={styles.tagChip}>
                    <Text style={styles.tagText}>@{partner.displayName}</Text>
                    <TouchableOpacity onPress={() => removePartner(partner.userId)}>
                      <Text style={styles.tagRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* TAGGED COURSES */}
          {taggedCourses.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Tagged Courses</Text>
              <View style={styles.tagContainer}>
                {taggedCourses.map((course) => (
                  <View key={course.courseId} style={styles.tagChip}>
                    <Text style={styles.tagText}>@{course.courseName}</Text>
                    <TouchableOpacity onPress={() => removeCourse(course.courseId)}>
                      <Text style={styles.tagRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* PARTNER MODAL */}
      <Modal
        visible={partnerModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPartnerModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Partner</Text>
              <TouchableOpacity onPress={() => setPartnerModalVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={allPartners}
              keyExtractor={(item) => item.userId}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => handleSelectPartner(item)}
                >
                  <Text style={styles.modalItemText}>@{item.displayName}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.modalEmptyText}>No partners found</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* COURSE MODAL */}
      <Modal
        visible={courseModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setCourseModalVisible(false);
          setCourseSearchQuery("");
          setCourseSearchResults([]);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Search Course</Text>
              <TouchableOpacity
                onPress={() => {
                  setCourseModalVisible(false);
                  setCourseSearchQuery("");
                  setCourseSearchResults([]);
                }}
              >
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.modalSearchInput}
              placeholder="Type course name..."
              placeholderTextColor="#999"
              value={courseSearchQuery}
              onChangeText={handleCourseSearchChange}
              autoFocus
            />

            {loadingCourses && (
              <Text style={styles.modalLoadingText}>Searching...</Text>
            )}

            <FlatList
              data={courseSearchResults}
              keyExtractor={(item) => item.courseId.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => handleSelectCourse(item)}
                >
                  <Text style={styles.modalItemText}>{item.courseName}</Text>
                  <Text style={styles.modalItemSubtext}>{item.location}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                courseSearchQuery.length >= 2 && !loadingCourses ? (
                  <Text style={styles.modalEmptyText}>No courses found</Text>
                ) : null
              }
            />
          </View>
        </View>
      </Modal>
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

  headerTitle: { 
    color: "#FFFFFF", 
    fontWeight: "700", 
    fontSize: 18,
    flex: 1,
    textAlign: "center",
  },

  postButton: {
    width: 44,
    height: 44,
    backgroundColor: "#FFD700",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  postButtonDisabled: {
    opacity: 0.4,
  },

  flagIcon: {
    fontSize: 24,
  },

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

  content: {
    flex: 1,
    padding: 16,
  },

  section: {
    marginBottom: 24,
  },

  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 12,
  },

  imagePreviewBox: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#E8E8E8",
    borderWidth: 2,
    borderColor: "#0D5C3A",
    borderStyle: "dashed",
  },

  imagePreview: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  imagePlaceholderIcon: {
    fontSize: 48,
    marginBottom: 8,
  },

  imagePlaceholderText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  imagePlaceholderHint: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
  },

  removeImageButton: {
    marginTop: 8,
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#FF3B30",
    borderRadius: 6,
  },

  removeImageText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 12,
  },

  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  typeCard: {
    flex: 1,
    minWidth: "45%",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 2,
    borderColor: "#E0E0E0",
    alignItems: "center",
  },

  typeCardActive: {
    backgroundColor: "#0D5C3A",
    borderColor: "#0D5C3A",
  },

  typeCardText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },

  typeCardTextActive: {
    color: "#FFF",
  },

  textInput: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  charCount: {
    fontSize: 12,
    color: "#999",
    textAlign: "right",
    marginTop: 4,
  },

  autocompleteContainer: {
    backgroundColor: "#FFF",
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    maxHeight: 200,
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

  tagButtonsRow: {
    flexDirection: "row",
    gap: 12,
  },

  tagButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
    borderRadius: 8,
  },

  tagButtonIcon: {
    fontSize: 18,
  },

  tagButtonText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 14,
  },

  tagContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D5C3A",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
  },

  tagText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
  },

  tagRemove: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },

  modalContainer: {
    backgroundColor: "#F4EED8",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingBottom: 40,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  modalClose: {
    fontSize: 24,
    color: "#666",
    fontWeight: "700",
  },

  modalSearchInput: {
    backgroundColor: "#FFF",
    margin: 16,
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  modalLoadingText: {
    textAlign: "center",
    color: "#666",
    padding: 20,
  },

  modalItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },

  modalItemText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  modalItemSubtext: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
  },

  modalEmptyText: {
    textAlign: "center",
    color: "#999",
    padding: 40,
    fontSize: 14,
  },
});





