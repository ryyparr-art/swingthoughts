/**
 * Clubhouse Screen (Refactored)
 * 
 * Main feed screen for SwingThoughts.
 * 
 * Architecture:
 * - Hooks handle all business logic (useFeed, useFeedInteractions, etc.)
 * - Components handle rendering (FeedPost, FeedHeader, etc.)
 * - This file composes everything together
 * 
 * Features:
 * - Algorithmic feed with warm/cold start caching
 * - Pull-to-refresh
 * - Optimistic UI updates via NewPostContext
 * - Background preloading of other screens
 * - Image/video fullscreen viewers (swipeable gallery)
 * - Comments and report modals
 * - Tournament chat modal
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ImageZoom } from "@likashefqet/react-native-image-zoom";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { calculateDistanceMiles, Thought } from "@/utils/feedHelpers";
import type { ActiveTournament } from "@/hooks/useTournamentStatus";

// Hooks
import { useFeed } from "@/hooks/useFeed";
import { useFeedInteractions } from "@/hooks/useFeedInteractions";
import { usePendingPosts } from "@/hooks/usePendingPosts";
import { useBackgroundPreload } from "@/hooks/useBackgroundPreload";
import { useFeedInserts, FeedListItem } from "@/hooks/useFeedInserts";

// Components
import FeedHeader from "@/components/clubhouse/FeedHeader";
import FeedPost from "@/components/clubhouse/FeedPost";
import FeedDiscoveryCarousel from "@/components/clubhouse/FeedDiscoveryCarousel";
import FeedActivityCarousel from "@/components/clubhouse/FeedActivityCarousel";
import FeedHoleInOneCard from "@/components/clubhouse/FeedHoleInOneCard";
import { FullscreenVideoPlayer } from "@/components/video/VideoComponents";
import AdminPanelButton from "@/components/navigation/AdminPanelButton";
import BottomActionBar from "@/components/navigation/BottomActionBar";
import SwingFooter from "@/components/navigation/SwingFooter";
import CommentsModal from "@/components/modals/CommentsModal";
import ReportModal from "@/components/modals/ReportModal";
import TournamentChatModal from "@/components/modals/TournamentChatModal";
import FilterBottomSheet from "@/components/ui/FilterBottomSheet";
import FilterFAB from "@/components/ui/FilterFAB";

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function ClubhouseScreen() {
  const params = useLocalSearchParams();
  const flatListRef = useRef<FlatList<any>>(null);
  const galleryListRef = useRef<FlatList<any>>(null);

  /* ---------------------------------------------------------------- */
  /* AUTH & USER DATA                                                 */
  /* ---------------------------------------------------------------- */
  
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserData, setCurrentUserData] = useState<any>(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) return;

      setCurrentUserId(user.uid);

      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        setCurrentUserData(snap.data());
        console.log("📄 Clubhouse user data loaded");
      }
    });

    return () => unsub();
  }, []);

  /* ---------------------------------------------------------------- */
  /* PERMISSIONS                                                      */
  /* ---------------------------------------------------------------- */

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
      return currentUserData.verified === true;
    }

    return false;
  })();

  const canInteract = (() => {
    if (!currentUserId || !currentUserData) return false;

    if (
      currentUserData.userType === "Golfer" ||
      currentUserData.userType === "Junior"
    ) {
      return true;
    }

    if (
      currentUserData.userType === "Course" ||
      currentUserData.userType === "PGA Professional"
    ) {
      return currentUserData.verified === true;
    }

    return false;
  })();

  /* ---------------------------------------------------------------- */
  /* NAVIGATION PARAMS                                                */
  /* ---------------------------------------------------------------- */

  const highlightPostId = Array.isArray(params.highlightPostId) 
    ? params.highlightPostId[0] 
    : params.highlightPostId;

  const scrollToPostId = Array.isArray(params.scrollToPostId)
    ? params.scrollToPostId[0]
    : params.scrollToPostId;

  const highlightScoreId = Array.isArray(params.highlightScoreId)
    ? params.highlightScoreId[0]
    : params.highlightScoreId;

  const targetPostId = highlightPostId || scrollToPostId;
  const shouldHighlight = !!highlightPostId;

  /* ---------------------------------------------------------------- */
  /* FEED HOOK                                                        */
  /* ---------------------------------------------------------------- */

  const {
    thoughts,
    setThoughts,
    loading,
    refreshing,
    showingCached,
    hasLoadedOnce,
    activeFilters,
    setActiveFilters,
    useAlgorithmicFeed,
    foundPostIdFromScore,
    onRefresh,
    loadFeed,
    applyFilters,
  } = useFeed({
    currentUserId,
    currentUserData,
    targetPostId,
    highlightScoreId,
  });

  /* ---------------------------------------------------------------- */
  /* INTERACTIONS HOOK                                                */
  /* ---------------------------------------------------------------- */

  const {
    commentsModalVisible,
    selectedThought,
    handleComments,
    handleCloseComments,
    handleCommentAdded,
    reportModalVisible,
    reportingThought,
    handleReportPost,
    handleCloseReport,
    handleLike,
    handleEditPost,
  } = useFeedInteractions({
    currentUserId,
    canInteract,
    thoughts,
    setThoughts,
  });

  /* ---------------------------------------------------------------- */
  /* PENDING POSTS (OPTIMISTIC UI)                                    */
  /* ---------------------------------------------------------------- */

  usePendingPosts({
    thoughts,
    setThoughts,
    flatListRef,
    hasLoadedOnce,
  });

  /* ---------------------------------------------------------------- */
  /* BACKGROUND PRELOAD                                               */
  /* ---------------------------------------------------------------- */

  useBackgroundPreload({
    currentUserId,
    regionKey: currentUserData?.regionKey || "",
    hasLoadedOnce,
  });

  /* ---------------------------------------------------------------- */
  /* FILTER STATE                                                     */
  /* ---------------------------------------------------------------- */

  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  const hasActiveFilters = !!(
    activeFilters.type || 
    activeFilters.user || 
    activeFilters.course ||
    activeFilters.partnersOnly ||
    activeFilters.searchQuery
  );

  /* ---------------------------------------------------------------- */
  /* FEED INSERTS (discovery, activity, HIO cards)                    */
  /* ---------------------------------------------------------------- */

  const {
    feedWithInserts,
    handleDismissInsert,
    refreshInserts,
  } = useFeedInserts({
    thoughts,
    currentUserId,
    currentUserData,
    loading,
    hasActiveFilters,
  });

  /* ---------------------------------------------------------------- */
  /* MEDIA VIEWER STATE                                               */
  /* ---------------------------------------------------------------- */

  const [expandedImages, setExpandedImages] = useState<string[] | null>(null);
  const [expandedImageIndex, setExpandedImageIndex] = useState(0);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [expandedVideo, setExpandedVideo] = useState<{
    url: string;
    thumbnailUrl?: string;
    trimStart?: number;
    trimEnd?: number;
    duration?: number;
  } | null>(null);

  const handleImagePress = useCallback((imageUrls: string[], startIndex: number) => {
    setExpandedImages(imageUrls);
    setExpandedImageIndex(startIndex);
    setGalleryIndex(startIndex);
  }, []);

  const handleVideoPress = useCallback((
    videoUrl: string,
    thumbnailUrl?: string,
    trimStart?: number,
    trimEnd?: number,
    duration?: number
  ) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedVideo({
      url: videoUrl,
      thumbnailUrl,
      trimStart: trimStart || 0,
      trimEnd: trimEnd || duration || 30,
      duration: duration || 30,
    });
  }, []);

  /* ---------------------------------------------------------------- */
  /* TOURNAMENT CHAT STATE                                            */
  /* ---------------------------------------------------------------- */

  const [tournamentChatVisible, setTournamentChatVisible] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<ActiveTournament | null>(null);
  const [selectedChatType, setSelectedChatType] = useState<"live" | "onpremise">("live");

  const handleTournamentPress = useCallback(async (tournament: ActiveTournament) => {
    console.log("🏌️ Tournament banner pressed:", tournament.name);
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const hasVenueLocation = tournament.location?.latitude && tournament.location?.longitude;

    if (!hasVenueLocation) {
      setSelectedTournament(tournament);
      setSelectedChatType("live");
      setTournamentChatVisible(true);
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        setSelectedTournament(tournament);
        setSelectedChatType("live");
        setTournamentChatVisible(true);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const userLat = location.coords.latitude;
      const userLon = location.coords.longitude;
      const venueLat = tournament.location!.latitude!;
      const venueLon = tournament.location!.longitude!;

      const distance = calculateDistanceMiles(userLat, userLon, venueLat, venueLon);
      console.log("🏌️ Distance to venue:", distance.toFixed(2), "miles");

      const PROXIMITY_THRESHOLD_MILES = 2;

      if (distance <= PROXIMITY_THRESHOLD_MILES) {
        Alert.alert(
          "Join Tournament Chat",
          `You're at ${tournament.name}! Which chat would you like to join?`,
          [
            {
              text: "On-Premise Chat",
              onPress: () => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setSelectedTournament(tournament);
                setSelectedChatType("onpremise");
                setTournamentChatVisible(true);
              },
            },
            {
              text: "Tournament Discussion",
              onPress: () => {
                soundPlayer.play("click");
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedTournament(tournament);
                setSelectedChatType("live");
                setTournamentChatVisible(true);
              },
            },
            { text: "Cancel", style: "cancel" },
          ]
        );
      } else {
        setSelectedTournament(tournament);
        setSelectedChatType("live");
        setTournamentChatVisible(true);
      }
    } catch (error) {
      console.error("🏌️ Error checking location:", error);
      setSelectedTournament(tournament);
      setSelectedChatType("live");
      setTournamentChatVisible(true);
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /* HASHTAG PRESS (FOR FILTER)                                       */
  /* ---------------------------------------------------------------- */

  const handleHashtagPress = useCallback((name: string, type: "tournament" | "league") => {
    if (type === "tournament") {
      setActiveFilters({ searchQuery: name });
      setFilterSheetVisible(true);
    }
    // League navigation is handled in FeedPostContent directly
  }, [setActiveFilters]);

  /* ---------------------------------------------------------------- */
  /* SCROLL TO TARGET POST                                            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const scrollTargetId = targetPostId || foundPostIdFromScore;

    if (!scrollTargetId || loading || feedWithInserts.length === 0) return;

    console.log("🎯 Scrolling to post:", scrollTargetId, shouldHighlight ? "(highlighted)" : "");

    const postIndex = feedWithInserts.findIndex(
      (item) => item._feedItemType === "post" && item.id === scrollTargetId
    );

    if (postIndex !== -1) {
      console.log("✅ Post found at index:", postIndex);

      setTimeout(() => {
        try {
          flatListRef.current?.scrollToIndex({
            index: postIndex,
            animated: true,
            viewPosition: 0.2,
          });
        } catch (error) {
          flatListRef.current?.scrollToOffset({
            offset: postIndex * 400,
            animated: true,
          });
        }
      }, 500);
    } else {
      console.warn("⚠️ Target post not found in feed");
      soundPlayer.play('error');
      Alert.alert("Post Not Found", "This post may have been deleted.");
    }
  }, [targetPostId, foundPostIdFromScore, loading, feedWithInserts.length, shouldHighlight]);

  /* ---------------------------------------------------------------- */
  /* RENDER POST                                                      */
  /* ---------------------------------------------------------------- */

  const renderFeedItem = useCallback(({ item }: { item: FeedListItem }) => {
    // Feed insert card
    if (item._feedItemType === "insert") {
      switch (item.type) {
        case "discovery":
          return (
            <FeedDiscoveryCarousel
              insert={item}
            />
          );
        case "activity":
          return (
            <FeedActivityCarousel
              insert={item}
            />
          );
        case "hole_in_one":
          return (
            <FeedHoleInOneCard
              insert={item}
            />
          );
        default:
          return null;
      }
    }

    // Regular post
    const isHighlighted = shouldHighlight && (
      highlightPostId === item.id || foundPostIdFromScore === item.id
    );

    return (
      <FeedPost
        thought={item}
        currentUserId={currentUserId}
        isHighlighted={isHighlighted}
        onLike={handleLike}
        onComment={handleComments}
        onEdit={handleEditPost}
        onReport={handleReportPost}
        onImagePress={handleImagePress}
        onVideoPress={handleVideoPress}
        onHashtagPress={handleHashtagPress}
      />
    );
  }, [
    currentUserId,
    shouldHighlight,
    highlightPostId,
    foundPostIdFromScore,
    handleLike,
    handleComments,
    handleEditPost,
    handleReportPost,
    handleImagePress,
    handleVideoPress,
    handleHashtagPress,
    handleDismissInsert,
  ]);

  /* ---------------------------------------------------------------- */
  /* RENDER GALLERY IMAGE                                             */
  /* ---------------------------------------------------------------- */

  const renderGalleryImage = useCallback(({ item }: { item: string }) => (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <View style={styles.galleryPage}>
        <ImageZoom
          uri={item}
          minScale={1}
          maxScale={3}
          doubleTapScale={2}
          isDoubleTapEnabled
          isPinchEnabled
          isPanEnabled
          style={styles.zoomableImage}
          resizeMode="contain"
        />
      </View>
    </GestureHandlerRootView>
  ), []);

  /* ---------------------------------------------------------------- */
  /* RENDER                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <View style={styles.container}>
      {/* Header (carousel, nav, banner) */}
      <FeedHeader
        showingCached={showingCached}
        loading={loading}
        onTournamentPress={handleTournamentPress}
      />

      {/* Feed */}
      {loading && !showingCached ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D5C3A" />
          <Text style={styles.loadingText}>
            {useAlgorithmicFeed && !hasActiveFilters
              ? "Building your personalized feed..."
              : "Loading thoughts..."}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={feedWithInserts}
          renderItem={renderFeedItem}
          keyExtractor={(item) =>
            item._feedItemType === "insert"
              ? (item as any)._insertId
              : item.id
          }
          contentContainerStyle={styles.listContent}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              flatListRef.current?.scrollToOffset({
                offset: info.index * 400,
                animated: true,
              });
            }, 100);
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                await onRefresh();
                await refreshInserts();
              }}
              tintColor="#0D5C3A"
              colors={["#0D5C3A"]}
            />
          }
        />
      )}

      {/* Filter FAB */}
      <FilterFAB
        onPress={() => {
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setFilterSheetVisible(true);
        }}
        hasFilters={hasActiveFilters}
      />

      {/* Filter Bottom Sheet */}
      <FilterBottomSheet
        visible={filterSheetVisible}
        onClose={() => {
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setFilterSheetVisible(false);
        }}
        onApplyFilters={(f: any) => {
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          applyFilters(f);
        }}
        onSelectPost={(postId: string) => {
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

          const postIndex = feedWithInserts.findIndex(
            (item) => item._feedItemType === "post" && item.id === postId
          );

          if (postIndex !== -1) {
            setTimeout(() => {
              try {
                flatListRef.current?.scrollToIndex({
                  index: postIndex,
                  animated: true,
                  viewPosition: 0.2,
                });
              } catch (error) {
                flatListRef.current?.scrollToOffset({
                  offset: postIndex * 400,
                  animated: true,
                });
              }
            }, 300);
          } else {
            soundPlayer.play('error');
            Alert.alert("Post Not Found", "This post may not match your current filters.");
          }

          setFilterSheetVisible(false);
        }}
        posts={thoughts}
        currentFilters={activeFilters}
      />

      {/* Comments Modal */}
      {selectedThought && (
        <CommentsModal
          visible={commentsModalVisible}
          thoughtId={selectedThought.id}
          postContent={selectedThought.content}
          postOwnerId={selectedThought.userId}
          onClose={handleCloseComments}
          onCommentAdded={handleCommentAdded}
        />
      )}

      {/* Report Modal */}
      <ReportModal
        visible={reportModalVisible}
        onClose={handleCloseReport}
        postId={reportingThought?.id || ""}
        postAuthorId={reportingThought?.userId || ""}
        postAuthorName={reportingThought?.displayName || ""}
        postContent={reportingThought?.content || ""}
      />

      {/* Tournament Chat Modal */}
      {selectedTournament && (
        <TournamentChatModal
          visible={tournamentChatVisible}
          tournament={selectedTournament}
          chatType={selectedChatType}
          onClose={() => {
            setTournamentChatVisible(false);
            setSelectedTournament(null);
            setSelectedChatType("live");
          }}
        />
      )}

      {/* Image Gallery Viewer Modal */}
      <Modal
        visible={!!expandedImages}
        transparent
        animationType="fade"
        onRequestClose={() => setExpandedImages(null)}
      >
        <View style={styles.mediaViewerBackdrop}>
          {expandedImages && (
            <>
              <FlatList
                ref={galleryListRef}
                data={expandedImages}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={expandedImageIndex}
                getItemLayout={(_, index) => ({
                  length: SCREEN_WIDTH,
                  offset: SCREEN_WIDTH * index,
                  index,
                })}
                onMomentumScrollEnd={(event) => {
                  const index = Math.round(
                    event.nativeEvent.contentOffset.x / SCREEN_WIDTH
                  );
                  setGalleryIndex(index);
                }}
                renderItem={renderGalleryImage}
                keyExtractor={(item, index) => `gallery-${index}`}
              />

              {/* Counter badge */}
              {expandedImages.length > 1 && (
                <View style={styles.galleryCounter}>
                  <Text style={styles.galleryCounterText}>
                    {galleryIndex + 1} / {expandedImages.length}
                  </Text>
                </View>
              )}
            </>
          )}

          {/* Close button */}
          <TouchableOpacity
            style={styles.mediaViewerCloseButton}
            onPress={() => {
              soundPlayer.play('click');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setExpandedImages(null);
            }}
          >
            <Image
              source={require("@/assets/icons/Close.png")}
              style={styles.closeIcon}
            />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Fullscreen Video Player */}
      {expandedVideo && (
        <FullscreenVideoPlayer
          videoUrl={expandedVideo.url}
          trimStart={expandedVideo.trimStart}
          trimEnd={expandedVideo.trimEnd}
          duration={expandedVideo.duration}
          onClose={() => setExpandedVideo(null)}
        />
      )}

      {/* Bottom Navigation */}
      <BottomActionBar disabled={!canWrite} />
      {currentUserData?.role === "admin" ? (
        <AdminPanelButton />
      ) : (
        <SwingFooter />
      )}
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#0D5C3A",
    fontWeight: "600",
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },

  // Media viewer
  gestureRoot: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  mediaViewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  mediaViewerCloseButton: {
    position: "absolute",
    top: 60,
    right: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 24,
    padding: 12,
    zIndex: 10,
  },
  closeIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFF",
  },
  galleryPage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  zoomableImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  galleryCounter: {
    position: "absolute",
    top: 68,
    alignSelf: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  galleryCounterText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
});