import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
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
    onApplyFilters({
      type: type || undefined,
      user: user || undefined,
      course: selectedCourse?.course_name || undefined,
      courseId: selectedCourse?.id || undefined,
    });
    onClose();
  };

  // Handle close with haptic feedback
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
      
      <View style={styles.sheet}>
        {/* CLOSE BUTTON */}
        <TouchableOpacity 
          style={styles.closeButton} 
          onPress={handleClose}
          activeOpacity={0.7}
        >
          <Image
            source={require("@/assets/icons/Close.png")}
            style={styles.closeIcon}
          />
        </TouchableOpacity>

        <Text style={styles.title}>Filter Clubhouse</Text>

        {/* TYPE FILTER */}
        <Text style={styles.label}>Thought Type</Text>
        <View style={styles.typeButtons}>
          {["swing-thought", "question", "general", "meme", "witb"].map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeButton, type === t && styles.typeSelected]}
              onPress={() => setType(t)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  type === t && styles.typeButtonTextSelected,
                ]}
              >
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* USER FILTER */}
        <Text style={styles.label}>User</Text>
        <TextInput
          placeholder="Enter name"
          placeholderTextColor="#999"
          value={user}
          onChangeText={setUser}
          style={styles.input}
        />

        {/* COURSE FILTER WITH AUTOCOMPLETE */}
        <Text style={styles.label}>Course</Text>
        <View style={styles.autocompleteContainer}>
          <View style={styles.inputContainer}>
            <TextInput
              placeholder="Enter course name"
              placeholderTextColor="#999"
              value={courseSearch}
              onChangeText={handleCourseSearchChange}
              style={styles.input}
            />
            {loadingCourses && (
              <ActivityIndicator 
                size="small" 
                color="#0D5C3A" 
                style={styles.searchSpinner} 
              />
            )}
          </View>

          {/* Selected Course Display */}
          {selectedCourse && !showCourseDropdown && (
            <View style={styles.selectedCourseCard}>
              <View style={styles.selectedCourseInfo}>
                <Text style={styles.selectedCourseName}>
                  {selectedCourse.course_name}
                </Text>
                <Text style={styles.selectedCourseLocation}>
                  {selectedCourse.location.city}, {selectedCourse.location.state}
                </Text>
              </View>
              <TouchableOpacity 
                onPress={() => {
                  setSelectedCourse(null);
                  setCourseSearch("");
                }}
              >
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* DROPDOWN LIST */}
          {showCourseDropdown && (
            <View style={styles.dropdown}>
              {loadingCourses ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#0D5C3A" />
                  <Text style={styles.loadingText}>Searching courses...</Text>
                </View>
              ) : courseResults.length > 0 ? (
                <FlatList
                  data={courseResults}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.dropdownItem}
                      onPress={() => handleSelectCourse(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.dropdownItemContent}>
                        <Text style={styles.dropdownItemName}>
                          {item.course_name}
                        </Text>
                        <Text style={styles.dropdownItemLocation}>
                          {item.location.city}, {item.location.state}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  style={styles.dropdownList}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                />
              ) : (
                <View style={styles.noResultsContainer}>
                  <Text style={styles.noResultsText}>No courses found</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* BUTTONS */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClearFilters}
            activeOpacity={0.7}
          >
            <Text style={styles.clearText}>Clear Filters</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.applyButton}
            onPress={handleApplyFilters}
            activeOpacity={0.7}
          >
            <Text style={styles.applyText}>Apply</Text>
          </TouchableOpacity>
        </View>
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
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
    zIndex: 999,
  },
  overlayTouchable: {
    flex: 1,
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  closeButton: {
    position: "absolute",
    right: 20,
    top: 20,
    padding: 8,
    zIndex: 1001,
  },
  closeIcon: {
    width: 22,
    height: 22,
    tintColor: "#0D5C3A",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 20,
    marginTop: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 15,
    color: "#333",
  },
  typeButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
    marginBottom: 20,
  },
  typeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#EEE",
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  typeSelected: {
    backgroundColor: "#0D5C3A",
  },
  typeButtonText: {
    color: "#333",
    fontWeight: "600",
  },
  typeButtonTextSelected: {
    color: "#FFF",
  },
  input: {
    borderWidth: 1,
    borderColor: "#CCC",
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    color: "#333",
    backgroundColor: "#FFF",
  },
  autocompleteContainer: {
    position: "relative",
    zIndex: 100,
    marginBottom: 10,
  },
  inputContainer: {
    position: "relative",
  },
  searchSpinner: {
    position: "absolute",
    right: 10,
    top: 18,
  },
  selectedCourseCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    marginTop: 8,
    backgroundColor: "#0D5C3A",
    borderRadius: 8,
  },
  selectedCourseInfo: {
    flex: 1,
  },
  selectedCourseName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  selectedCourseLocation: {
    fontSize: 12,
    color: "#FFD700",
    marginTop: 2,
  },
  removeText: {
    fontSize: 20,
    color: "#FFFFFF",
    fontWeight: "600",
    paddingHorizontal: 8,
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#CCC",
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    maxHeight: 200,
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    marginTop: 8,
  },
  dropdownList: {
    maxHeight: 200,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEE",
  },
  dropdownItemContent: {
    flex: 1,
  },
  dropdownItemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  dropdownItemLocation: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  loadingContainer: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 8,
    color: "#666",
    fontSize: 14,
  },
  noResultsContainer: {
    padding: 20,
    alignItems: "center",
  },
  noResultsText: {
    color: "#999",
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 25,
  },
  clearButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  clearText: {
    color: "#666",
    fontWeight: "600",
  },
  applyButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  applyText: {
    color: "#FFF",
    fontWeight: "700",
  },
});