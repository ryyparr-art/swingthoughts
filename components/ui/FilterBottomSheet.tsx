import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { getAllThoughtTypes } from "@/constants/postTypes";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface GolfCourse {
  id: number;
  club_name: string;
  course_name: string;
  location: {
    city: string;
    state: string;
  };
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onApplyFilters: (filters: any) => void;
}

export default function FilterBottomSheet({
  visible,
  onClose,
  onApplyFilters,
}: Props) {
  const [type, setType] = useState<string | null>(null);
  const [user, setUser] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [courseResults, setCourseResults] = useState<GolfCourse[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<GolfCourse | null>(null);
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const allThoughtTypes = getAllThoughtTypes();

  // Search courses from API
  const searchCourses = async (query: string) => {
    try {
      setLoadingCourses(true);

      const res = await fetch(
        `${GOLF_COURSE_API_URL}/search?search_query=${encodeURIComponent(query)}`,
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
        setCourseResults([]);
        return;
      }

      const data = await res.json();
      const courses: GolfCourse[] = data.courses || [];

      setCourseResults(courses);
      setLoadingCourses(false);
    } catch (err) {
      console.error("Course search error:", err);
      setLoadingCourses(false);
      setCourseResults([]);
    }
  };

  // Debounced course search
  const handleCourseSearchChange = (text: string) => {
    setCourseSearch(text);
    setSelectedCourse(null);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!text.trim()) {
      setCourseResults([]);
      setShowCourseDropdown(false);
      setLoadingCourses(false);
      return;
    }

    setShowCourseDropdown(true);

    debounceRef.current = setTimeout(() => {
      const query = text.trim();
      if (query.length >= 2) {
        searchCourses(query);
      }
    }, 300);
  };

  // Handle course selection
  const handleSelectCourse = (course: GolfCourse) => {
    setSelectedCourse(course);
    setCourseSearch(course.course_name);
    setShowCourseDropdown(false);
    setCourseResults([]);
  };

  // Reset when sheet closes
  useEffect(() => {
    if (!visible) {
      setType(null);
      setUser("");
      setCourseSearch("");
      setSelectedCourse(null);
      setCourseResults([]);
      setShowCourseDropdown(false);
      setLoadingCourses(false);
    }
  }, [visible]);

  // Clear all filters
  const handleClearFilters = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setType(null);
    setUser("");
    setCourseSearch("");
    setSelectedCourse(null);
    setCourseResults([]);
    setShowCourseDropdown(false);
    onApplyFilters({});
  };

  // Apply filters
  const handleApplyFilters = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onApplyFilters({
      type: type || undefined,
      user: user || undefined,
      course: selectedCourse?.course_name || undefined,
      courseId: selectedCourse?.id || undefined,
    });
    onClose();
  };

  // Handle close
  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity 
        style={styles.overlayTouchable} 
        activeOpacity={1} 
        onPress={handleClose}
      />
      
      <View style={styles.modalContainer}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          {/* HEADER - Inside modal container */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Image
                source={require("@/assets/icons/Close.png")}
                style={styles.closeIcon}
                resizeMode="contain"
              />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Filter Clubhouse</Text>

            <View style={styles.closeButton} />
          </View>

          <ScrollView 
            style={styles.content} 
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* THOUGHT TYPE SELECTOR - Matches create screen cards */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Thought Type</Text>
              <View style={styles.typeGrid}>
                {allThoughtTypes.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.typeCard,
                      type === t.id && styles.typeCardActive,
                    ]}
                    onPress={() => setType(t.id)}
                  >
                    <Text
                      style={[
                        styles.typeCardText,
                        type === t.id && styles.typeCardTextActive,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* USER FILTER */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>User</Text>
              <TextInput
                placeholder="Enter display name..."
                placeholderTextColor="#999"
                value={user}
                onChangeText={setUser}
                style={styles.textInput}
              />
            </View>

            {/* COURSE FILTER */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Course</Text>
              <TextInput
                placeholder="Search for a course..."
                placeholderTextColor="#999"
                value={courseSearch}
                onChangeText={handleCourseSearchChange}
                style={styles.textInput}
              />

              {loadingCourses && (
                <ActivityIndicator 
                  size="small" 
                  color="#0D5C3A" 
                  style={styles.searchSpinner} 
                />
              )}

              {/* Selected Course Chip */}
              {selectedCourse && !showCourseDropdown && (
                <View style={styles.selectedCourseContainer}>
                  <View style={styles.tagChip}>
                    <Text style={styles.tagText}>{selectedCourse.course_name}</Text>
                    <TouchableOpacity 
                      onPress={() => {
                        setSelectedCourse(null);
                        setCourseSearch("");
                      }}
                    >
                      <Text style={styles.tagRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.courseLocation}>
                    {selectedCourse.location.city}, {selectedCourse.location.state}
                  </Text>
                </View>
              )}

              {/* Autocomplete Dropdown - Matches create screen */}
              {showCourseDropdown && (
                <View style={styles.autocompleteContainer}>
                  {loadingCourses ? (
                    <View style={styles.autocompleteItem}>
                      <Text style={styles.autocompleteLoadingText}>Searching...</Text>
                    </View>
                  ) : courseResults.length > 0 ? (
                    <FlatList
                      data={courseResults}
                      keyExtractor={(item) => item.id.toString()}
                      scrollEnabled={false}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={styles.autocompleteItem}
                          onPress={() => handleSelectCourse(item)}
                        >
                          <Text style={styles.autocompleteName}>
                            {item.course_name}
                          </Text>
                          <Text style={styles.autocompleteLocation}>
                            {item.location.city}, {item.location.state}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  ) : courseSearch.length >= 2 ? (
                    <View style={styles.autocompleteItem}>
                      <Text style={styles.autocompleteEmptyText}>No courses found</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          </ScrollView>

          {/* ACTION BUTTONS - Matches create screen style */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={handleClearFilters}
            >
              <Text style={styles.clearButtonText}>Clear Filters</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.applyButton}
              onPress={handleApplyFilters}
            >
              <Text style={styles.applyButtonText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
    zIndex: 999,
  },
  overlayTouchable: {
    flex: 1,
  },
  modalContainer: {
    backgroundColor: "#F4EED8",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: "85%", // Fixed height instead of maxHeight
  },
  keyboardView: {
    flex: 1,
  },

  // Header - Matches create screen
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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

  content: {
    flex: 1,
    padding: 16,
  },

  scrollContent: {
    paddingBottom: 100, // Extra padding so content is visible above keyboard
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

  // Type Cards - Matches create screen
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

  // Text Input - Matches create screen
  textInput: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  searchSpinner: {
    position: "absolute",
    right: 16,
    top: 55,
  },

  // Selected Course - Matches create screen tags
  selectedCourseContainer: {
    marginTop: 12,
  },

  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D5C3A",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
    alignSelf: "flex-start",
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

  courseLocation: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    marginLeft: 4,
  },

  // Autocomplete - Matches create screen
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

  autocompleteLoadingText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },

  autocompleteEmptyText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },

  // Action Buttons - Matches create screen
  actionButtons: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },

  clearButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    backgroundColor: "#F4EED8",
    alignItems: "center",
    justifyContent: "center",
  },

  clearButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  applyButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },

  applyButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});