import { GOLF_COURSE_API_KEY, GOLF_COURSE_API_URL } from "@/constants/apiConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
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
  onSelectPost?: (postId: string) => void; // ✅ NEW: Callback when post is selected
  posts: any[];
  currentFilters?: any;
}

type FilterMode = "type" | "course" | null;

export default function FilterBottomSheet({
  visible,
  onClose,
  onApplyFilters,
  onSelectPost,
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
  
  // ✅ NEW: Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [showUserSuggestions, setShowUserSuggestions] = useState(false);
  const [userSuggestions, setUserSuggestions] = useState<Array<{userId: string, displayName: string, avatar?: string}>>([]);

  // ✅ NEW: Handle user suggestion selection
  const handleSelectUser = (userId: string, displayName: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log('👤 User selected:', displayName);
    
    // Filter posts by this user
    setSearchQuery(displayName);
    setShowUserSuggestions(false);
  };

  // ✅ NEW: Extract unique users and filter by search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setShowUserSuggestions(false);
      setUserSuggestions([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    
    // Extract unique users from posts
    const usersMap = new Map<string, {userId: string, displayName: string, avatar?: string}>();
    
    posts.forEach(post => {
      if (post.userId && post.displayName && !usersMap.has(post.userId)) {
        usersMap.set(post.userId, {
          userId: post.userId,
          displayName: post.displayName,
          avatar: post.avatarUrl || post.avatar,
        });
      }
    });
    
    // Filter users by search query
    const matchingUsers = Array.from(usersMap.values()).filter(user =>
      user.displayName.toLowerCase().includes(query)
    );
    
    console.log(`👥 Found ${matchingUsers.length} users matching "${query}"`);
    
    setUserSuggestions(matchingUsers.slice(0, 5)); // Limit to 5 suggestions
    setShowUserSuggestions(matchingUsers.length > 0);
  }, [searchQuery, posts]);

  const initializedRef = useRef(false);

  // Initialize from currentFilters ONLY ONCE when modal opens
  useEffect(() => {
    if (visible && !initializedRef.current) {
      console.log('📥 Initializing from currentFilters:', currentFilters);
      setType(currentFilters.type || null);
      setPartnersOnly(currentFilters.partnersOnly || false);
      setSearchQuery(currentFilters.searchQuery || "");
      
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
    setSearchQuery("");
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
      searchQuery: searchQuery.trim() || undefined,
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

  // ✅ NEW: Handle post selection
  const handleSelectPost = (postId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log('📸 Post selected:', postId);
    
    if (onSelectPost) {
      onSelectPost(postId);
    }
    
    handleClose();
  };

  // ✅ NEW: Filter posts by search query
  const filteredPosts = searchQuery.trim()
    ? posts.filter((post) => {
        const query = searchQuery.toLowerCase();
        const content = (post.content || "").toLowerCase();
        const userName = (post.displayName || "").toLowerCase();
        
        const contentMatch = content.includes(query);
        const userMatch = userName.includes(query);
        
        if (contentMatch || userMatch) {
          console.log(`✅ Match found: "${post.displayName}" - content:${contentMatch}, user:${userMatch}`);
        }
        
        return contentMatch || userMatch;
      })
    : posts;
  
  console.log(`🔍 Search query: "${searchQuery}", Total posts: ${posts.length}, Filtered: ${filteredPosts.length}`);

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

          {/* ✅ NEW: SEARCH INPUT */}
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={20} color="#999" style={styles.searchInputIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search users or content..."
              placeholderTextColor="#999"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  soundPlayer.play("click");
                  setSearchQuery("");
                  setShowUserSuggestions(false);
                }}
                style={styles.searchClearButton}
              >
                <Ionicons name="close-circle" size={20} color="#999" />
              </TouchableOpacity>
            )}
          </View>

          {/* ✅ NEW: USER SUGGESTIONS DROPDOWN */}
          {showUserSuggestions && userSuggestions.length > 0 && (
            <View style={styles.userSuggestionsContainer}>
              <Text style={styles.suggestionLabel}>Users</Text>
              <ScrollView 
                style={styles.userSuggestionsList}
                nestedScrollEnabled={true}
              >
                {userSuggestions.map((user) => (
                  <TouchableOpacity
                    key={user.userId}
                    style={styles.userSuggestionItem}
                    onPress={() => handleSelectUser(user.userId, user.displayName)}
                  >
                    {user.avatar ? (
                      <Image
                        source={{ uri: user.avatar }}
                        style={styles.userSuggestionAvatar}
                      />
                    ) : (
                      <View style={styles.userSuggestionAvatarPlaceholder}>
                        <Text style={styles.userSuggestionAvatarText}>
                          {user.displayName[0]?.toUpperCase() || "?"}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.userSuggestionName}>{user.displayName}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#999" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

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
              data={filteredPosts}
              numColumns={3}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.postGrid}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.postTile}
                  onPress={() => handleSelectPost(item.id)}
                >
                  {item.imageUrl ? (
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.postImage}
                      resizeMode="cover"
                    />
                  ) : item.videoThumbnailUrl ? (
                    <View>
                      <Image
                        source={{ uri: item.videoThumbnailUrl }}
                        style={styles.postImage}
                        resizeMode="cover"
                      />
                      <View style={styles.videoIndicator}>
                        <Ionicons name="play-circle" size={32} color="#FFFFFF" />
                      </View>
                    </View>
                  ) : (
                    <View style={styles.postPlaceholder}>
                      <Text style={styles.postPlaceholderText} numberOfLines={3}>
                        {item.content || item.caption}
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
                  <Text style={styles.emptyText}>
                    {searchQuery ? "No posts match your search" : "No posts found"}
                  </Text>
                  <Text style={styles.emptySubtext}>
                    {searchQuery ? "Try a different search term" : "Try adjusting your filters"}
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

  // ✅ NEW: Search Input
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  searchInputIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: "#333",
  },
  searchClearButton: {
    padding: 4,
  },

  // ✅ NEW: User Suggestions
  userSuggestionsContainer: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    maxHeight: 200,
    overflow: "hidden",
  },
  suggestionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    padding: 12,
    paddingBottom: 8,
    backgroundColor: "#F8F8F8",
  },
  userSuggestionsList: {
    maxHeight: 160,
  },
  userSuggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
    gap: 12,
  },
  userSuggestionAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  userSuggestionAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  userSuggestionAvatarText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  userSuggestionName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#0D5C3A",
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
  videoIndicator: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
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