import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { getAllThoughtTypes } from "@/constants/postTypes";
import { soundPlayer } from "@/utils/soundPlayer";
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
  posts: any[];
  currentFilters?: any;
}

type FilterMode = "type" | "course" | null;

export default function FilterBottomSheet({
  visible,
  onClose,
  onApplyFilters,
  posts,
  currentFilters = {},
}: Props) {
  const [activeFilterMode, setActiveFilterMode] = useState<FilterMode>(null);
  const [type, setType] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [courseResults, setCourseResults] = useState<GolfCourse[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<GolfCourse | null>(null);
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [partnersOnly, setPartnersOnly] = useState(false);

  const debounceRef = useRef<number | null>(null);
  const allThoughtTypes = getAllThoughtTypes();

  const initializedRef = useRef(false);

  // Initialize from currentFilters ONLY ONCE when modal opens
  useEffect(() => {
    if (visible && !initializedRef.current) {
      console.log('📥 Initializing from currentFilters:', currentFilters);
      setType(currentFilters.type || null);
      setPartnersOnly(currentFilters.partnersOnly || false);
      
      if (currentFilters.course && currentFilters.courseId) {
        setSelectedCourse({
          id: currentFilters.courseId,
          course_name: currentFilters.course,
          club_name: "",
          location: { city: "", state: "" },
        });
      } else {
        setSelectedCourse(null);
      }
      initializedRef.current = true;
    }
    
    if (!visible) {
      initializedRef.current = false;
    }
  }, [visible]);

  // Search courses from API
  const searchCourses = async (query: string) => {
    try {
      console.log('🔎 Searching courses for:', query);
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
        console.log('❌ Course search failed');
        setLoadingCourses(false);
        setCourseResults([]);
        return;
      }

      const data = await res.json();
      const courses: GolfCourse[] = data.courses || [];
      console.log('✅ Found courses:', courses.length);

      setCourseResults(courses);
      setLoadingCourses(false);
    } catch (err) {
      console.error("❌ Course search error:", err);
      setLoadingCourses(false);
      setCourseResults([]);
    }
  };

  // Debounced course search
  const handleCourseSearchChange = (text: string) => {
    console.log('⌨️ Course search input:', text);
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
    soundPlayer.play("click");
    console.log('🏌️ Course selected:', course.course_name);
    setSelectedCourse(course);
    setCourseSearch(course.course_name);
    setShowCourseDropdown(false);
    setCourseResults([]);
    setActiveFilterMode(null);
  };

  // Reset when sheet closes
  useEffect(() => {
    if (!visible) {
      console.log('🚪 Modal closed - resetting search state');
      setActiveFilterMode(null);
      setCourseSearch("");
      setCourseResults([]);
      setShowCourseDropdown(false);
      setLoadingCourses(false);
    }
  }, [visible]);

  // Clear all filters
  const handleClearFilters = () => {
    soundPlayer.play("click");
    console.log('🧹 CLEAR FILTERS CLICKED');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setType(null);
    setCourseSearch("");
    setSelectedCourse(null);
    setPartnersOnly(false);
    setCourseResults([]);
    setShowCourseDropdown(false);
    setActiveFilterMode(null);
    console.log('🧹 Calling onApplyFilters with {}');
    onApplyFilters({});
    console.log('🧹 Calling onClose');
    onClose();
  };

  // Apply filters
  const handleApplyFilters = () => {
    soundPlayer.play("click");
    const filters = {
      type: type || undefined,
      course: selectedCourse?.course_name || undefined,
      courseId: selectedCourse?.id || undefined,
      partnersOnly: partnersOnly || undefined,
    };
    console.log('✅ APPLY FILTERS CLICKED with:', filters);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onApplyFilters(filters);
    onClose();
  };

  // Handle close
  const handleClose = () => {
    soundPlayer.play("click");
    console.log('❌ CLOSE BUTTON CLICKED');
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
          {/* HEADER */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Image
                source={require("@/assets/icons/Close.png")}
                style={styles.closeIcon}
                resizeMode="contain"
              />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Explore Clubhouse</Text>

            <View style={styles.closeButton} />
          </View>

          {/* FILTER PILLS */}
          <View style={styles.filterPillsContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterPillsContent}
            >
              {/* Swing Thought Pill */}
              <TouchableOpacity
                style={[
                  styles.filterPill,
                  activeFilterMode === "type" && styles.filterPillActive,
                  type && styles.filterPillSelected,
                ]}
                onPress={() => {
                  soundPlayer.play("click");
                  console.log('🔘 Swing Thought pill clicked. Current mode:', activeFilterMode, 'Current type:', type);
                  setActiveFilterMode(activeFilterMode === "type" ? null : "type");
                }}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    type && styles.filterPillTextActive,
                  ]}
                >
                  {type 
                    ? allThoughtTypes.find(t => t.id === type)?.label || "Swing Thought"
                    : "Swing Thought"}
                </Text>
                {type && (
                  <TouchableOpacity
                    onPress={() => {
                      soundPlayer.play("click");
                      console.log('✕ Removing type filter');
                      setType(null);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.pillRemove}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              {/* Course Pill */}
              <TouchableOpacity
                style={[
                  styles.filterPill,
                  activeFilterMode === "course" && styles.filterPillActive,
                  selectedCourse && styles.filterPillSelected,
                ]}
                onPress={() => {
                  soundPlayer.play("click");
                  console.log('🔘 Course pill clicked. Current mode:', activeFilterMode);
                  setActiveFilterMode(activeFilterMode === "course" ? null : "course");
                }}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    selectedCourse && styles.filterPillTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {selectedCourse ? selectedCourse.course_name : "Course"}
                </Text>
                {selectedCourse && (
                  <TouchableOpacity
                    onPress={() => {
                      soundPlayer.play("click");
                      console.log('✕ Removing course filter');
                      setSelectedCourse(null);
                      setCourseSearch("");
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.pillRemove}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              {/* Partners Only Pill */}
              <TouchableOpacity
                style={[
                  styles.filterPill,
                  partnersOnly && styles.filterPillSelected,
                ]}
                onPress={() => {
                  soundPlayer.play("click");
                  console.log('👥 Partners Only clicked. Current:', partnersOnly, '→ New:', !partnersOnly);
                  setPartnersOnly(!partnersOnly);
                }}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    partnersOnly && styles.filterPillTextActive,
                  ]}
                >
                  Partners Only
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* FILTER CONTENT AREA */}
          {activeFilterMode === "type" && (
            <View style={styles.filterContent}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.typeChipsContent}
              >
                {allThoughtTypes.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.typeChip,
                      type === t.id && styles.typeChipSelected,
                    ]}
                    onPress={() => {
                      soundPlayer.play("click");
                      console.log('🎯 Type chip clicked:', t.id, 'Current type:', type);
                      setType(type === t.id ? null : t.id);
                    }}
                  >
                    <Text
                      style={[
                        styles.typeChipText,
                        type === t.id && styles.typeChipTextSelected,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {activeFilterMode === "course" && (
            <View style={styles.filterContent}>
              <View style={styles.searchContainer}>
                <TextInput
                  placeholder="Search for a course..."
                  placeholderTextColor="#999"
                  value={courseSearch}
                  onChangeText={handleCourseSearchChange}
                  style={styles.textInput}
                  autoFocus
                />
                {loadingCourses && (
                  <ActivityIndicator
                    size="small"
                    color="#0D5C3A"
                    style={styles.searchSpinner}
                  />
                )}
              </View>

              {showCourseDropdown && (
                <ScrollView 
                  style={styles.courseResultsScroll}
                  nestedScrollEnabled={true}
                >
                  {loadingCourses ? (
                    <View style={styles.autocompleteItem}>
                      <Text style={styles.autocompleteLoadingText}>Searching...</Text>
                    </View>
                  ) : courseResults.length > 0 ? (
                    courseResults.map((course) => (
                      <TouchableOpacity
                        key={course.id}
                        style={styles.autocompleteItem}
                        onPress={() => handleSelectCourse(course)}
                      >
                        <Text style={styles.autocompleteName}>
                          {course.course_name}
                        </Text>
                        <Text style={styles.autocompleteLocation}>
                          {course.location.city}, {course.location.state}
                        </Text>
                      </TouchableOpacity>
                    ))
                  ) : courseSearch.length >= 2 ? (
                    <View style={styles.autocompleteItem}>
                      <Text style={styles.autocompleteEmptyText}>No courses found</Text>
                    </View>
                  ) : null}
                </ScrollView>
              )}
            </View>
          )}

          {/* POST GRID */}
          <View style={styles.postsContainer}>
            <FlatList
              data={posts}
              numColumns={3}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.postGrid}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.postTile}
                  onPress={() => {
                    soundPlayer.play("click");
                    console.log('📸 Post tile clicked');
                    handleClose();
                  }}
                >
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.postImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.postPlaceholder}>
                      <Text style={styles.postPlaceholderText} numberOfLines={3}>
                        {item.content}
                      </Text>
                    </View>
                  )}
                  
                  <View style={styles.postTypeBadge}>
                    <Text style={styles.postTypeBadgeText}>
                      {item.postType?.substring(0, 3).toUpperCase() || "POST"}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyStateFullScreen}>
                  <Text style={styles.emptyIcon}>🏌️</Text>
                  <Text style={styles.emptyText}>No posts found</Text>
                  <Text style={styles.emptySubtext}>
                    Try adjusting your filters
                  </Text>
                </View>
              }
            />
          </View>

          {/* ACTION BUTTONS */}
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
    height: "85%",
  },
  keyboardView: {
    flex: 1,
  },
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

  // Filter Pills
  filterPillsContainer: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  filterPillsContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#E0E0E0",
    gap: 6,
    maxWidth: 200,
  },
  filterPillActive: {
    borderColor: "#0D5C3A",
  },
  filterPillSelected: {
    backgroundColor: "#0D5C3A",
    borderColor: "#0D5C3A",
  },
  filterPillText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
    flexShrink: 1,
  },
  filterPillTextActive: {
    color: "#FFFFFF",
  },
  pillRemove: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },

  // Filter Content Area
  filterContent: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },

  // Type Chips
  typeChipsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },
  typeChipSelected: {
    backgroundColor: "#0D5C3A",
    borderColor: "#0D5C3A",
  },
  typeChipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  typeChipTextSelected: {
    color: "#FFFFFF",
  },

  // Course Search
  searchContainer: {
    paddingHorizontal: 16,
    position: "relative",
  },
  textInput: {
    backgroundColor: "#F4EED8",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  searchSpinner: {
    position: "absolute",
    right: 28,
    top: 12,
  },
  courseResultsScroll: {
    maxHeight: 200,
    marginTop: 8,
    marginHorizontal: 16,
    backgroundColor: "#FFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
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

  // Posts Grid
  postsContainer: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  postGrid: {
    padding: 2,
    paddingBottom: 20,
  },
  postTile: {
    width: "33.33%",
    aspectRatio: 1,
    padding: 2,
    position: "relative",
  },
  postImage: {
    width: "100%",
    height: "100%",
    borderRadius: 4,
  },
  postPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  postPlaceholderText: {
    fontSize: 11,
    color: "#666",
    textAlign: "center",
    lineHeight: 14,
  },
  postTypeBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(13, 92, 58, 0.9)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  postTypeBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },

  // Empty State
  emptyStateFullScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    width: "100%",
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
  },

  // Action Buttons
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