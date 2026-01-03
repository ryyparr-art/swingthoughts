import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { auth, db, storage } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Course {
  courseId: number;
  courseName: string;
  city?: string;
  state?: string;
  location?: string;
}

export default function VerificationScreen() {
  const router = useRouter();
  const [userType, setUserType] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // PGA Pro fields
  const [pgaId, setPgaId] = useState("");
  const [credentials, setCredentials] = useState("");
  const [pgaIdImageUri, setPgaIdImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Course fields
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [searching, setSearching] = useState(false);
  const [courseProofImageUri, setCourseProofImageUri] = useState<string | null>(null);

  // Request new course modal
  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseCity, setNewCourseCity] = useState("");
  const [newCourseState, setNewCourseState] = useState("");
  const [newCourseWebsite, setNewCourseWebsite] = useState("");
  const [newCoursePhone, setNewCoursePhone] = useState("");

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadUserType();
  }, []);

  const loadUserType = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        router.replace("/auth/login");
        return;
      }

      const userDoc = await getDoc(doc(db, "users", uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUserType(userData.userType || "");
      }

      setLoading(false);
    } catch (error) {
      console.error("Error loading user type:", error);
      soundPlayer.play('error');
      setLoading(false);
    }
  };

  /* ==================== IMAGE PICKERS ==================== */

  const pickPgaIdImage = async () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      soundPlayer.play('postThought');
      setPgaIdImageUri(result.assets[0].uri);
    }
  };

  const pickCourseProofImage = async () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      soundPlayer.play('postThought');
      setCourseProofImageUri(result.assets[0].uri);
    }
  };

  /* ==================== COURSE SEARCH ==================== */

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (!text.trim()) {
      setSearchResults([]);
      return;
    }

    searchDebounceRef.current = setTimeout(() => {
      searchCourses(text);
    }, 300);
  };

  const searchCourses = async (searchText: string) => {
    try {
      setSearching(true);

      // Search Firestore cached courses first
      const coursesQuery = query(collection(db, "courses"));
      const coursesSnap = await getDocs(coursesQuery);

      const cachedCourses: Course[] = [];
      const seenCourseIds = new Set<number>();

      coursesSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const courseName = data.course_name || data.courseName || "";
        const courseId = data.id || Number(docSnap.id);

        if (
          courseName.toLowerCase().includes(searchText.toLowerCase()) &&
          !seenCourseIds.has(courseId)
        ) {
          seenCourseIds.add(courseId);
          
          cachedCourses.push({
            courseId: courseId,
            courseName: courseName,
            city: data.location?.city,
            state: data.location?.state,
            location: data.location
              ? `${data.location.city}, ${data.location.state}`
              : "",
          });
        }
      });

      if (cachedCourses.length > 0) {
        console.log("Found cached courses:", cachedCourses);
        setSearchResults(cachedCourses);
        setSearching(false);
        return;
      }

      // Fall back to API
      const res = await fetch(
        `${GOLF_COURSE_API_URL}/search?search_query=${encodeURIComponent(
          searchText
        )}`,
        {
          method: "GET",
          headers: {
            Authorization: `Key ${GOLF_COURSE_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        soundPlayer.play('error');
        setSearching(false);
        return;
      }

      const data = await res.json();
      const courses = data.courses || [];

      setSearchResults(
        courses.map((c: any) => ({
          courseId: c.id,
          courseName: c.course_name,
          city: c.location?.city,
          state: c.location?.state,
          location: `${c.location?.city}, ${c.location?.state}`,
        }))
      );
      setSearching(false);
    } catch (error) {
      console.error("Course search error:", error);
      soundPlayer.play('error');
      setSearching(false);
    }
  };

  const handleSelectCourse = (course: Course) => {
    console.log("Selected course:", course);
    soundPlayer.play('click');
    setSelectedCourse(course);
    setSearchQuery("");
    setSearchResults([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleRemoveSelectedCourse = () => {
    soundPlayer.play('click');
    setSelectedCourse(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  /* ==================== REQUEST NEW COURSE ==================== */

  const handleRequestCourse = async () => {
    if (!newCourseName.trim() || !newCourseCity.trim() || !newCourseState.trim()) {
      soundPlayer.play('error');
      Alert.alert("Missing Info", "Please fill in course name, city, and state.");
      return;
    }

    if (!courseProofImageUri) {
      soundPlayer.play('error');
      Alert.alert("Missing Proof", "Please upload proof of ownership/management.");
      return;
    }

    soundPlayer.play('click');

    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      setUploadingImage(true);

      // Get user data for userName and email
      const userDoc = await getDoc(doc(db, "users", uid));
      const userData = userDoc.data();

      // Upload course proof image
      const response = await fetch(courseProofImageUri);
      const blob = await response.blob();
      const imagePath = `course-proofs/${uid}/${Date.now()}.jpg`;
      const storageRef = ref(storage, imagePath);

      await uploadBytes(storageRef, blob);
      const proofImageUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, "verification_requests"), {
        userId: uid,
        userName: userData?.displayName || "",
        userEmail: auth.currentUser?.email || "",
        requestType: "course",
        status: "pending",
        courseName: newCourseName.trim(),
        notes: `New course request: ${newCourseName.trim()}, ${newCourseCity.trim()}, ${newCourseState.trim()}`,
        proofImageUrl: proofImageUrl,
        createdAt: serverTimestamp(),
      });

      // Update user document to mark verification as submitted
      await updateDoc(doc(db, "users", uid), {
        "verification.submittedAt": serverTimestamp(),
      });

      soundPlayer.play('postThought');
      setUploadingImage(false);
      setRequestModalVisible(false);

      Alert.alert(
        "Request Submitted",
        "Your course verification request has been submitted. You can explore SwingThoughts, but posting and messaging will unlock once approved.",
        [{ text: "Continue", onPress: () => router.replace("/onboarding/starter") }]
      );
    } catch (error) {
      console.error("Error submitting course request:", error);
      soundPlayer.play('error');
      setUploadingImage(false);
      Alert.alert("Error", "Failed to submit request. Please try again.");
    }
  };

  /* ==================== SUBMIT VERIFICATION ==================== */

  const handleSubmit = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      // Get user data for userName and email
      const userDoc = await getDoc(doc(db, "users", uid));
      const userData = userDoc.data();

      if (userType === "PGA Professional") {
        if (!pgaId.trim() || !credentials.trim() || !pgaIdImageUri) {
          soundPlayer.play('error');
          Alert.alert("Missing Info", "Please fill in all fields and upload your PGA ID photo.");
          return;
        }

        soundPlayer.play('click');

        try {
          setUploadingImage(true);

          // Upload PGA ID image
          const response = await fetch(pgaIdImageUri);
          const blob = await response.blob();
          const imagePath = `pga-ids/${uid}/${Date.now()}.jpg`;
          const storageRef = ref(storage, imagePath);

          await uploadBytes(storageRef, blob);
          const proofImageUrl = await getDownloadURL(storageRef);

          await addDoc(collection(db, "verification_requests"), {
            userId: uid,
            userName: userData?.displayName || "",
            userEmail: auth.currentUser?.email || "",
            requestType: "pga_pro",
            status: "pending",
            credentials: credentials.trim(),
            notes: `PGA ID: ${pgaId.trim()}`,
            proofImageUrl: proofImageUrl,
            createdAt: serverTimestamp(),
          });

          // Update user document to mark verification as submitted
          await updateDoc(doc(db, "users", uid), {
            "verification.submittedAt": serverTimestamp(),
          });

          soundPlayer.play('postThought');
          setUploadingImage(false);

          Alert.alert(
            "Verification Submitted",
            "Your PGA Professional verification has been submitted. You can explore SwingThoughts, but posting and messaging will unlock once approved.",
            [{ text: "Continue", onPress: () => router.replace("/onboarding/starter") }]
          );
        } catch (error) {
          console.error("Error uploading PGA ID image:", error);
          soundPlayer.play('error');
          setUploadingImage(false);
          Alert.alert("Error", "Failed to upload PGA ID image. Please try again.");
          return;
        }
      } else if (userType === "Course") {
        if (!selectedCourse) {
          soundPlayer.play('error');
          Alert.alert("No Course Selected", "Please search and select your course.");
          return;
        }

        if (!selectedCourse.courseId) {
          soundPlayer.play('error');
          Alert.alert("Invalid Course", "The selected course is missing an ID. Please try searching again.");
          return;
        }

        if (!courseProofImageUri) {
          soundPlayer.play('error');
          Alert.alert("Missing Proof", "Please upload proof of ownership/management.");
          return;
        }

        soundPlayer.play('click');

        try {
          setUploadingImage(true);

          // Upload course proof image
          const response = await fetch(courseProofImageUri);
          const blob = await response.blob();
          const imagePath = `course-proofs/${uid}/${Date.now()}.jpg`;
          const storageRef = ref(storage, imagePath);

          await uploadBytes(storageRef, blob);
          const proofImageUrl = await getDownloadURL(storageRef);

          await addDoc(collection(db, "verification_requests"), {
            userId: uid,
            userName: userData?.displayName || "",
            userEmail: auth.currentUser?.email || "",
            requestType: "course",
            status: "pending",
            courseId: Number(selectedCourse.courseId),
            courseName: selectedCourse.courseName,
            proofImageUrl: proofImageUrl,
            createdAt: serverTimestamp(),
          });

          // Update user document with course info
          await updateDoc(doc(db, "users", uid), {
            "verification.submittedAt": serverTimestamp(),
            displayName: selectedCourse.courseName,
            ownedCourseId: Number(selectedCourse.courseId),
            city: selectedCourse.city,
            state: selectedCourse.state,
            location: {
              city: selectedCourse.city,
              state: selectedCourse.state,
            },
          });

          // Update courses collection to mark as claimed
          const courseDocRef = doc(db, "courses", selectedCourse.courseId.toString());
          console.log("Updating course document:", selectedCourse.courseId, "with userId:", uid);
          try {
            await updateDoc(courseDocRef, {
              claimed: true,
              claimedByUserId: uid,
              claimedAt: serverTimestamp(),
            });
            console.log("Successfully updated course document");
          } catch (courseError) {
            console.error("Error updating course document:", courseError);
            console.log("Course document may not exist yet, will be updated on admin approval");
          }

          soundPlayer.play('postThought');
          setUploadingImage(false);

          Alert.alert(
            "Verification Submitted",
            "Your course claim has been submitted. You can explore SwingThoughts, but posting and messaging will unlock once approved.",
            [{ text: "Continue", onPress: () => router.replace("/onboarding/starter") }]
          );
        } catch (error) {
          console.error("Error uploading course proof image:", error);
          soundPlayer.play('error');
          setUploadingImage(false);
          Alert.alert("Error", "Failed to upload proof image. Please try again.");
          return;
        }
      }
    } catch (error) {
      console.error("Error submitting verification:", error);
      soundPlayer.play('error');
      Alert.alert("Error", "Failed to submit verification. Please try again.");
    }
  };

  /* ==================== RENDER ==================== */

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              soundPlayer.play('click');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.replace("/auth/user-type");
            }}
            style={styles.backButton}
          >
            <Image
              source={require("@/assets/icons/Back.png")}
              style={styles.backIcon}
            />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Verification</Text>

          <View style={styles.headerButton} />
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.infoBox}>
            <Ionicons name="shield-checkmark" size={40} color="#0D5C3A" />
            <Text style={styles.infoTitle}>Verification Required</Text>
            <Text style={styles.infoText}>
              {userType === "PGA Professional"
                ? "PGA Professionals must verify their credentials to unlock posting and messaging."
                : "Golf courses must claim their profile to unlock posting and messaging."}
            </Text>
          </View>

          {/* PGA PROFESSIONAL VERIFICATION */}
          {userType === "PGA Professional" && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>PGA Member ID</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your PGA member ID"
                value={pgaId}
                onChangeText={setPgaId}
                autoCapitalize="none"
              />

              <Text style={styles.sectionLabel}>Upload Photo of PGA ID *</Text>
              <TouchableOpacity
                style={styles.imageUploadBox}
                onPress={pickPgaIdImage}
              >
                {pgaIdImageUri ? (
                  <Image
                    source={{ uri: pgaIdImageUri }}
                    style={styles.uploadedImage}
                  />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons name="camera" size={40} color="#0D5C3A" />
                    <Text style={styles.imagePlaceholderText}>
                      Tap to upload PGA ID photo
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {pgaIdImageUri && (
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => {
                    soundPlayer.play('click');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setPgaIdImageUri(null);
                  }}
                >
                  <Text style={styles.removeImageText}>✕ Remove Image</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.sectionLabel}>Credentials/Certifications</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="List your certifications and credentials"
                value={credentials}
                onChangeText={setCredentials}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          )}

          {/* COURSE VERIFICATION */}
          {userType === "Course" && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Search for Your Course</Text>
              <TextInput
                style={styles.input}
                placeholder="Type course name..."
                value={searchQuery}
                onChangeText={handleSearchChange}
                autoCapitalize="words"
              />

              {searching && (
                <View style={styles.searchingContainer}>
                  <ActivityIndicator size="small" color="#0D5C3A" />
                  <Text style={styles.searchingText}>Searching...</Text>
                </View>
              )}

              {searchResults.length > 0 && (
                <View style={styles.resultsContainer}>
                  <FlatList
                    data={searchResults}
                    keyExtractor={(item, index) => item.courseId ? item.courseId.toString() : `course-${index}`}
                    scrollEnabled={false}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.resultItem}
                        onPress={() => handleSelectCourse(item)}
                      >
                        <Text style={styles.resultName}>{item.courseName}</Text>
                        {item.location && (
                          <Text style={styles.resultLocation}>{item.location}</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  />
                </View>
              )}

              {selectedCourse && (
                <View style={styles.selectedCourseContainer}>
                  <View style={styles.selectedCourseInfo}>
                    <Ionicons name="checkmark-circle" size={24} color="#0D5C3A" />
                    <View style={styles.selectedCourseText}>
                      <Text style={styles.selectedCourseName}>
                        {selectedCourse.courseName}
                      </Text>
                      {selectedCourse.location && (
                        <Text style={styles.selectedCourseLocation}>
                          {selectedCourse.location}
                        </Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity onPress={handleRemoveSelectedCourse}>
                    <Ionicons name="close-circle" size={24} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Course Proof Upload - Only show if course is selected */}
              {selectedCourse && (
                <>
                  <Text style={styles.sectionLabel}>Upload Proof of Ownership/Management *</Text>
                  <TouchableOpacity
                    style={styles.imageUploadBox}
                    onPress={pickCourseProofImage}
                  >
                    {courseProofImageUri ? (
                      <Image
                        source={{ uri: courseProofImageUri }}
                        style={styles.uploadedImage}
                      />
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <Ionicons name="camera" size={40} color="#0D5C3A" />
                        <Text style={styles.imagePlaceholderText}>
                          Upload business license, manager ID, or official course documentation
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {courseProofImageUri && (
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => {
                        soundPlayer.play('click');
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setCourseProofImageUri(null);
                      }}
                    >
                      <Text style={styles.removeImageText}>✕ Remove Image</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {/* Request New Course Button */}
              <TouchableOpacity
                style={styles.requestButton}
                onPress={() => {
                  soundPlayer.play('click');
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setRequestModalVisible(true);
                }}
              >
                <Ionicons name="add-circle-outline" size={20} color="#0D5C3A" />
                <Text style={styles.requestButtonText}>
                  Course not listed? Request to add it
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              (uploadingImage || searching) && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={uploadingImage || searching}
          >
            {uploadingImage ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Submit for Verification</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* REQUEST NEW COURSE MODAL */}
      <Modal
        visible={requestModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setRequestModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalKeyboardView}
          >
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Request New Course</Text>
                <TouchableOpacity
                  onPress={() => {
                    soundPlayer.play('click');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setRequestModalVisible(false);
                  }}
                >
                  <Ionicons name="close" size={28} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalContent}>
                <Text style={styles.modalDescription}>
                  Fill in the details below and we'll add your course to the database.
                </Text>

                <Text style={styles.modalLabel}>Course Name *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., Pine Valley Golf Club"
                  value={newCourseName}
                  onChangeText={setNewCourseName}
                  autoCapitalize="words"
                />

                <Text style={styles.modalLabel}>City *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., Pine Valley"
                  value={newCourseCity}
                  onChangeText={setNewCourseCity}
                  autoCapitalize="words"
                />

                <Text style={styles.modalLabel}>State *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., NJ"
                  value={newCourseState}
                  onChangeText={setNewCourseState}
                  autoCapitalize="characters"
                  maxLength={2}
                />

                <Text style={styles.modalLabel}>Website (Optional)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., https://example.com"
                  value={newCourseWebsite}
                  onChangeText={setNewCourseWebsite}
                  autoCapitalize="none"
                  keyboardType="url"
                />

                <Text style={styles.modalLabel}>Phone (Optional)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g., (555) 123-4567"
                  value={newCoursePhone}
                  onChangeText={setNewCoursePhone}
                  keyboardType="phone-pad"
                />

                <Text style={styles.sectionLabel}>Upload Proof of Ownership/Management *</Text>
                <TouchableOpacity
                  style={styles.imageUploadBox}
                  onPress={pickCourseProofImage}
                >
                  {courseProofImageUri ? (
                    <Image
                      source={{ uri: courseProofImageUri }}
                      style={styles.uploadedImage}
                    />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Ionicons name="camera" size={40} color="#0D5C3A" />
                      <Text style={styles.imagePlaceholderText}>
                        Upload business license or official documentation
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {courseProofImageUri && (
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => {
                      soundPlayer.play('click');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setCourseProofImageUri(null);
                    }}
                  >
                    <Text style={styles.removeImageText}>✕ Remove Image</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.modalSubmitButton}
                  onPress={handleRequestCourse}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalSubmitButtonText}>
                      Submit Request
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ==================== STYLES ==================== */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  keyboardView: {
    flex: 1,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },

  backButton: {
    width: 40,
  },

  backIcon: {
    width: 28,
    height: 28,
    tintColor: "#FFFFFF",
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

  content: {
    flex: 1,
    padding: 16,
  },

  infoBox: {
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#0D5C3A",
  },

  infoTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
    marginTop: 12,
    marginBottom: 8,
  },

  infoText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },

  section: {
    marginBottom: 24,
  },

  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
  },

  input: {
    backgroundColor: "#FFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },

  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },

  imageUploadBox: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    borderStyle: "dashed",
    backgroundColor: "#F5F5F5",
    marginBottom: 12,
    overflow: "hidden",
  },

  uploadedImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  imagePlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  imagePlaceholderText: {
    fontSize: 14,
    color: "#0D5C3A",
    marginTop: 12,
    textAlign: "center",
    fontWeight: "600",
  },

  removeImageButton: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#FF3B30",
    borderRadius: 6,
    marginBottom: 16,
  },

  removeImageText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 13,
  },

  searchingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
  },

  searchingText: {
    fontSize: 14,
    color: "#666",
  },

  resultsContainer: {
    backgroundColor: "#FFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    marginTop: 8,
    marginBottom: 16,
    maxHeight: 250,
  },

  resultItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },

  resultName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  resultLocation: {
    fontSize: 14,
    color: "#666",
  },

  selectedCourseContainer: {
    backgroundColor: "#E8F5E9",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  selectedCourseInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  selectedCourseText: {
    flex: 1,
  },

  selectedCourseName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  selectedCourseLocation: {
    fontSize: 14,
    color: "#666",
  },

  requestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    borderStyle: "dashed",
  },

  requestButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  submitButton: {
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 40,
  },

  submitButtonDisabled: {
    opacity: 0.5,
  },

  submitButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  /* MODAL STYLES */

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },

  modalKeyboardView: {
    maxHeight: "90%",
  },

  modalContainer: {
    backgroundColor: "#F4EED8",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "100%",
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
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  modalContent: {
    padding: 16,
  },

  modalDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
    lineHeight: 20,
  },

  modalLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
  },

  modalInput: {
    backgroundColor: "#FFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },

  modalSubmitButton: {
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 40,
  },

  modalSubmitButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});