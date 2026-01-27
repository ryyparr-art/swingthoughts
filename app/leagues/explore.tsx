/**
 * Leagues Explore - Find and join leagues
 * 
 * Features:
 * - Apply to Host button
 * - Search leagues
 * - Leagues in user's region (by regionKey)
 * - Leagues in nearby regions
 */

import { auth, db } from "@/constants/firebaseConfig";
import { REGIONS, Region, findRegionByKey } from "@/constants/regions";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface LeagueListItem {
  id: string;
  name: string;
  regionKey: string;
  regionName: string;
  memberCount: number;
  format: "stroke" | "2v2";
  leagueType: "live" | "sim";
  simPlatform: string | null;
  status: "upcoming" | "active" | "completed";
  currentWeek: number;
  totalWeeks: number;
  hashtags?: string[];
  searchKeywords?: string[];
}

/* ================================================================ */
/* HELPERS                                                          */
/* ================================================================ */

/**
 * Calculate distance between two lat/lon points in miles
 */
function getDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find user's region based on coordinates
 */
function findUserRegion(lat: number, lon: number): Region | null {
  let closestRegion: Region | null = null;
  let closestDistance = Infinity;

  for (const region of REGIONS) {
    if (region.isFallback) continue;
    
    const distance = getDistanceMiles(
      lat,
      lon,
      region.centerPoint.lat,
      region.centerPoint.lon
    );

    if (distance <= region.radiusMiles && distance < closestDistance) {
      closestDistance = distance;
      closestRegion = region;
    }
  }

  return closestRegion;
}

/**
 * Find nearby regions (within 150 miles)
 */
function findNearbyRegions(lat: number, lon: number, excludeKey?: string): Region[] {
  const nearby: { region: Region; distance: number }[] = [];

  for (const region of REGIONS) {
    if (region.isFallback) continue;
    if (region.key === excludeKey) continue;

    const distance = getDistanceMiles(
      lat,
      lon,
      region.centerPoint.lat,
      region.centerPoint.lon
    );

    if (distance <= 150) {
      nearby.push({ region, distance });
    }
  }

  // Sort by distance
  nearby.sort((a, b) => a.distance - b.distance);
  
  // Return top 5 nearby regions
  return nearby.slice(0, 5).map((n) => n.region);
}

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function ExploreLeagues() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUserId = auth.currentUser?.uid;

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Search filters
  const [filterType, setFilterType] = useState<"all" | "live" | "sim">("all");
  const [filterRegion, setFilterRegion] = useState<string>("all");
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [searchResults, setSearchResults] = useState<LeagueListItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  // Commissioner status
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [commissionerLeagueId, setCommissionerLeagueId] = useState<string | null>(null);

  // Location
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [userRegion, setUserRegion] = useState<Region | null>(null);
  const [nearbyRegions, setNearbyRegions] = useState<Region[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Leagues
  const [localLeagues, setLocalLeagues] = useState<LeagueListItem[]>([]);
  const [nearbyLeagues, setNearbyLeagues] = useState<LeagueListItem[]>([]);
  const [allLeaguesCache, setAllLeaguesCache] = useState<LeagueListItem[]>([]);
  const [myLeagueIds, setMyLeagueIds] = useState<string[]>([]);

  /* ================================================================ */
  /* INITIALIZATION                                                  */
  /* ================================================================ */

  useEffect(() => {
    initializeLocation();
    loadMyLeagues();
    checkCommissionerStatus();
  }, []);

  const checkCommissionerStatus = async () => {
    if (!currentUserId) return;

    try {
      const userDoc = await getDoc(doc(db, "users", currentUserId));
      if (!userDoc.exists()) return;

      const userData = userDoc.data();
      const approved = userData.isApprovedCommissioner === true;
      setIsCommissioner(approved);

      if (approved) {
        const leaguesSnap = await getDocs(
          query(
            collection(db, "leagues"),
            where("hostUserId", "==", currentUserId)
          )
        );

        if (!leaguesSnap.empty) {
          setCommissionerLeagueId(leaguesSnap.docs[0].id);
        }
      }
    } catch (error) {
      console.error("Error checking commissioner status:", error);
    }
  };

  const initializeLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== "granted") {
        setLocationError("Location permission required to find leagues near you");
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords = {
        lat: location.coords.latitude,
        lon: location.coords.longitude,
      };
      
      setUserLocation(coords);

      // Find user's region
      const region = findUserRegion(coords.lat, coords.lon);
      setUserRegion(region);

      // Find nearby regions
      const nearby = findNearbyRegions(coords.lat, coords.lon, region?.key);
      setNearbyRegions(nearby);

      // Load leagues
      await loadLeagues(region, nearby);
      
      setLoading(false);
    } catch (error) {
      console.error("Error getting location:", error);
      setLocationError("Could not determine your location");
      setLoading(false);
    }
  };

  const loadMyLeagues = async () => {
    if (!currentUserId) return;

    try {
      // Get all leagues user is a member of
      const leaguesSnap = await getDocs(collection(db, "leagues"));
      const memberIds: string[] = [];

      for (const leagueDoc of leaguesSnap.docs) {
        const memberRef = collection(db, "leagues", leagueDoc.id, "members");
        const memberSnap = await getDocs(
          query(memberRef, where("userId", "==", currentUserId))
        );
        
        if (!memberSnap.empty) {
          memberIds.push(leagueDoc.id);
        }
      }

      setMyLeagueIds(memberIds);
    } catch (error) {
      console.error("Error loading my leagues:", error);
    }
  };

  const loadLeagues = async (region: Region | null, nearby: Region[]) => {
    try {
      // Query all public leagues
      const leaguesSnap = await getDocs(
        query(
          collection(db, "leagues"),
          where("isPublic", "==", true)
        )
      );

      const allLeagues: LeagueListItem[] = leaguesSnap.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name,
            regionKey: data.regionKey,
            regionName: data.regionName || "",
            memberCount: data.memberCount || 0,
            format: data.format || "stroke",
            leagueType: data.leagueType || "live",
            simPlatform: data.simPlatform || null,
            status: data.status,
            currentWeek: data.currentWeek || 0,
            totalWeeks: data.totalWeeks || 0,
            hashtags: data.hashtags || [],
            searchKeywords: data.searchKeywords || [],
          };
        })
        .filter((league) => ["upcoming", "active"].includes(league.status));

      // Cache all leagues for search
      setAllLeaguesCache(allLeagues);

      // Filter local leagues (in user's region)
      if (region) {
        const local = allLeagues.filter((l) => l.regionKey === region.key);
        setLocalLeagues(local);
      }

      // Filter nearby leagues (in nearby regions, excluding user's region)
      const nearbyKeys = nearby.map((r) => r.key);
      const nearbyL = allLeagues.filter(
        (l) => nearbyKeys.includes(l.regionKey) && l.regionKey !== region?.key
      );
      setNearbyLeagues(nearbyL);
    } catch (error) {
      console.error("Error loading leagues:", error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await initializeLocation();
    await loadMyLeagues();
    setRefreshing(false);
  };

  /* ================================================================ */
  /* SEARCH                                                          */
  /* ================================================================ */

  const handleSearch = () => {
    setSearching(true);
    setHasSearched(true);

    const searchLower = searchQuery.toLowerCase().trim();

    let results = [...allLeaguesCache];

    // Filter by league type
    if (filterType !== "all") {
      results = results.filter((league) => league.leagueType === filterType);
    }

    // Filter by region
    if (filterRegion !== "all") {
      results = results.filter((league) => league.regionKey === filterRegion);
    }

    // Filter by name/hashtag
    if (searchLower.length >= 2) {
      const isHashtagSearch = searchLower.startsWith("#");
      const hashtagSearch = isHashtagSearch ? searchLower : `#${searchLower}`;

      results = results.filter((league) => {
        // Search by league name
        const nameMatch = league.name.toLowerCase().includes(searchLower);

        // Search by hashtag
        const hashtagMatch = league.hashtags?.some(
          (tag: string) =>
            tag.toLowerCase().includes(hashtagSearch) ||
            tag.toLowerCase().includes(searchLower)
        );

        // Search by keywords
        const keywordMatch = league.searchKeywords?.some((keyword: string) =>
          keyword.toLowerCase().includes(searchLower)
        );

        return nameMatch || hashtagMatch || keywordMatch;
      });
    }

    setSearchResults(results);
    setSearching(false);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setFilterType("all");
    setFilterRegion("all");
    setSearchResults([]);
    setHasSearched(false);
  };

  const handleOpenSearchModal = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowSearchModal(true);
  };

  const handleCloseSearchModal = () => {
    soundPlayer.play("click");
    setShowSearchModal(false);
  };

  /* ================================================================ */
  /* HANDLERS                                                        */
  /* ================================================================ */

  const handleApplyToHost = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/leagues/apply" as any);
  };

  const handleLeaguePress = (leagueId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowSearchModal(false);
    router.push(`/leagues/${leagueId}` as any);
  };

  const handleTabChange = (tab: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (tab === "explore") return; // Already here
    
    router.replace(`/leagues/${tab}` as any);
  };

  const handleCommissionerSettings = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (commissionerLeagueId) {
      router.push({
        pathname: "/leagues/settings" as any,
        params: { leagueId: commissionerLeagueId },
      });
    } else {
      router.push("/leagues/create" as any);
    }
  };

  /* ================================================================ */
  /* RENDER HELPERS                                                  */
  /* ================================================================ */

  const renderHeader = () => (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <TouchableOpacity
        onPress={() => {
          soundPlayer.play("click");
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}
        style={styles.headerButton}
      >
        <Image
          source={require("@/assets/icons/Back.png")}
          style={styles.headerIcon}
        />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>League Hub</Text>
      {isCommissioner ? (
        <TouchableOpacity
          onPress={handleCommissionerSettings}
          style={styles.headerButton}
        >
          <Image
            source={require("@/assets/icons/Settings.png")}
            style={styles.headerIcon}
          />
        </TouchableOpacity>
      ) : (
        <View style={styles.headerRight} />
      )}
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabBar}>
      {[
        { key: "home", label: "Home" },
        { key: "schedule", label: "Schedule" },
        { key: "standings", label: "Standings" },
        { key: "explore", label: "Explore" },
      ].map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.tab, tab.key === "explore" && styles.tabActive]}
          onPress={() => handleTabChange(tab.key)}
        >
          <Text
            style={[
              styles.tabText,
              tab.key === "explore" && styles.tabTextActive,
            ]}
          >
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderSearchTrigger = () => (
    <TouchableOpacity
      style={styles.searchTrigger}
      onPress={handleOpenSearchModal}
      activeOpacity={0.7}
    >
      <Ionicons name="search" size={18} color="#999" />
      <Text style={styles.searchTriggerText}>Search leagues...</Text>
      <Ionicons name="chevron-forward" size={18} color="#CCC" />
    </TouchableOpacity>
  );

  const renderSearchModal = () => (
    <Modal
      visible={showSearchModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCloseSearchModal}
    >
      <View style={styles.modalContainer}>
        {/* Modal Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={handleCloseSearchModal} style={styles.modalCloseButton}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Search Leagues</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView 
          style={styles.modalContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Search Input */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>League Name or #Hashtag</Text>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={18} color="#999" />
              <TextInput
                style={styles.searchInput}
                placeholder="e.g. Sunday Skins or #charlotte"
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={18} color="#999" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* League Type Filter */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>League Type</Text>
            <View style={styles.typeButtonsRow}>
              {[
                { key: "all", label: "All", emoji: null },
                { key: "live", label: "Live", emoji: "☀️" },
                { key: "sim", label: "Simulator", emoji: "🖥️" },
              ].map((type) => (
                <TouchableOpacity
                  key={type.key}
                  style={[
                    styles.typeButton,
                    filterType === type.key && styles.typeButtonActive,
                  ]}
                  onPress={() => {
                    soundPlayer.play("click");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setFilterType(type.key as "all" | "live" | "sim");
                  }}
                >
                  {type.emoji && <Text style={styles.typeEmoji}>{type.emoji}</Text>}
                  <Text
                    style={[
                      styles.typeButtonText,
                      filterType === type.key && styles.typeButtonTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Region Filter */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Region</Text>
            <TouchableOpacity
              style={styles.regionSelector}
              onPress={() => setShowRegionPicker(true)}
            >
              <Text style={styles.regionSelectorText}>
                {filterRegion === "all"
                  ? "All Regions"
                  : findRegionByKey(filterRegion)?.displayName || filterRegion}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Search Button */}
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              handleSearch();
            }}
          >
            {searching ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.searchButtonText}>Search Leagues</Text>
            )}
          </TouchableOpacity>

          {/* Clear Filters */}
          {(searchQuery || filterType !== "all" || filterRegion !== "all") && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                soundPlayer.play("click");
                handleClearSearch();
              }}
            >
              <Text style={styles.clearButtonText}>Clear Filters</Text>
            </TouchableOpacity>
          )}

          {/* Results */}
          {hasSearched && (
            <View style={styles.resultsSection}>
              <Text style={styles.resultsTitle}>
                Results ({searchResults.length})
              </Text>
              {searchResults.length === 0 ? (
                <View style={styles.noResultsContainer}>
                  <Ionicons name="search-outline" size={48} color="#CCC" />
                  <Text style={styles.noResultsText}>No leagues found</Text>
                  <Text style={styles.noResultsSubtext}>
                    Try adjusting your filters
                  </Text>
                </View>
              ) : (
                searchResults.map((league) => renderLeagueItem(league, true))
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      {/* Region Picker Modal */}
      <Modal
        visible={showRegionPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRegionPicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowRegionPicker(false)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Region</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            {/* All Regions Option */}
            <TouchableOpacity
              style={[
                styles.regionOption,
                filterRegion === "all" && styles.regionOptionActive,
              ]}
              onPress={() => {
                soundPlayer.play("click");
                setFilterRegion("all");
                setShowRegionPicker(false);
              }}
            >
              <Text
                style={[
                  styles.regionOptionText,
                  filterRegion === "all" && styles.regionOptionTextActive,
                ]}
              >
                All Regions
              </Text>
              {filterRegion === "all" && (
                <Ionicons name="checkmark" size={20} color="#0D5C3A" />
              )}
            </TouchableOpacity>

            {/* User's region first if available */}
            {userRegion && (
              <TouchableOpacity
                style={[
                  styles.regionOption,
                  filterRegion === userRegion.key && styles.regionOptionActive,
                ]}
                onPress={() => {
                  soundPlayer.play("click");
                  setFilterRegion(userRegion.key);
                  setShowRegionPicker(false);
                }}
              >
                <View>
                  <Text
                    style={[
                      styles.regionOptionText,
                      filterRegion === userRegion.key && styles.regionOptionTextActive,
                    ]}
                  >
                    {userRegion.displayName}
                  </Text>
                  <Text style={styles.regionOptionSubtext}>📍 Your location</Text>
                </View>
                {filterRegion === userRegion.key && (
                  <Ionicons name="checkmark" size={20} color="#0D5C3A" />
                )}
              </TouchableOpacity>
            )}

            {/* All other regions */}
            {REGIONS.filter((r) => !r.isFallback && r.key !== userRegion?.key).map(
              (region) => (
                <TouchableOpacity
                  key={region.key}
                  style={[
                    styles.regionOption,
                    filterRegion === region.key && styles.regionOptionActive,
                  ]}
                  onPress={() => {
                    soundPlayer.play("click");
                    setFilterRegion(region.key);
                    setShowRegionPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.regionOptionText,
                      filterRegion === region.key && styles.regionOptionTextActive,
                    ]}
                  >
                    {region.displayName}
                  </Text>
                  {filterRegion === region.key && (
                    <Ionicons name="checkmark" size={20} color="#0D5C3A" />
                  )}
                </TouchableOpacity>
              )
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </Modal>
  );

  const renderLeagueItem = (league: LeagueListItem, showType: boolean = false) => {
    const isJoined = myLeagueIds.includes(league.id);
    const region = findRegionByKey(league.regionKey);

    return (
      <TouchableOpacity
        key={league.id}
        style={styles.leagueItem}
        onPress={() => handleLeaguePress(league.id)}
      >
        <View style={styles.leagueInfo}>
          <Text style={styles.leagueName}>{league.name}</Text>
          <Text style={styles.leagueDetails}>
            {league.memberCount} members • {league.format === "stroke" ? "Stroke" : "2v2"}
            {region && ` • ${region.primaryCity}`}
          </Text>
          {showType && (
            <View style={styles.leagueTypeBadge}>
              <Text style={styles.leagueTypeText}>
                {league.leagueType === "live" ? "☀️ Live" : "🖥️ Sim"}
                {league.leagueType === "sim" && league.simPlatform && ` • ${league.simPlatform}`}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.leagueRight}>
          {isJoined ? (
            <View style={styles.joinedBadge}>
              <Text style={styles.joinedBadgeText}>Joined</Text>
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={20} color="#CCC" />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Image
        source={require("@/assets/icons/LowLeaderTrophy.png")}
        style={styles.emptyIcon}
      />
      <Text style={styles.emptyTitle}>No Leagues Near You</Text>
      <Text style={styles.emptySubtitle}>
        Be the first to create a league in your area!
      </Text>
      <TouchableOpacity style={styles.emptyButton} onPress={handleApplyToHost}>
        <Text style={styles.emptyButtonText}>Apply to Host a League</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLocalLeagues = () => {
    const locationName = userRegion?.primaryCity || "You";

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Leagues Near {locationName}</Text>
        {localLeagues.length === 0 ? (
          renderEmptyState()
        ) : (
          localLeagues.map((league) => renderLeagueItem(league, false))
        )}
      </View>
    );
  };

  const renderNearbyLeagues = () => {
    if (nearbyLeagues.length === 0) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Leagues Close By</Text>
        {nearbyLeagues.map((league) => renderLeagueItem(league, false))}
      </View>
    );
  };

  /* ================================================================ */
  /* MAIN RENDER                                                     */
  /* ================================================================ */

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#0D5C3A" />
        <Text style={styles.loadingText}>Finding leagues near you...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderHeader()}
      {renderTabs()}
      {renderSearchTrigger()}

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        keyboardShouldPersistTaps="handled"
      >
        {locationError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{locationError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={initializeLocation}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {renderLocalLeagues()}
            {renderNearbyLeagues()}
          </>
        )}

        {/* Apply to Host CTA at bottom */}
        {!locationError && (localLeagues.length > 0 || nearbyLeagues.length > 0) && (
          <View style={styles.bottomCTA}>
            <Text style={styles.bottomCTAText}>Want to run your own league?</Text>
            <TouchableOpacity
              style={styles.bottomCTAButton}
              onPress={handleApplyToHost}
            >
              <Text style={styles.bottomCTAButtonText}>Apply to Host</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {renderSearchModal()}
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F8F0",
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#0D5C3A",
  },
  headerButton: {
    padding: 8,
  },
  headerIcon: {
    width: 24,
    height: 24,
    tintColor: "#F4EED8",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F4EED8",
    fontFamily: "AmericanTypewriter-Bold",
  },
  headerRight: {
    width: 40,
  },

  // Tabs
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: "#0D5C3A",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  tabTextActive: {
    color: "#FFF",
  },

  // Search Trigger
  searchTrigger: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    gap: 10,
  },
  searchTriggerText: {
    flex: 1,
    fontSize: 15,
    color: "#999",
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
    backgroundColor: "#FFF",
  },
  modalCloseButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },

  // Filter Sections
  filterSection: {
    marginBottom: 20,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 10,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    gap: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: "#333",
  },

  // Type Buttons
  typeButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  typeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    gap: 6,
  },
  typeButtonActive: {
    borderColor: "#0D5C3A",
    backgroundColor: "#F0F8F0",
  },
  typeEmoji: {
    fontSize: 16,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  typeButtonTextActive: {
    color: "#0D5C3A",
  },

  // Region Selector
  regionSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  regionSelectorText: {
    fontSize: 15,
    color: "#333",
  },

  // Region Options
  regionOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  regionOptionActive: {
    backgroundColor: "#F0F8F0",
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },
  regionOptionText: {
    fontSize: 15,
    color: "#333",
  },
  regionOptionTextActive: {
    fontWeight: "600",
    color: "#0D5C3A",
  },
  regionOptionSubtext: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },

  // Search Button
  searchButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  searchButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  clearButton: {
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  clearButtonText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "600",
  },

  // Results
  resultsSection: {
    marginTop: 24,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 12,
  },
  noResultsContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  noResultsText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    marginTop: 12,
  },
  noResultsSubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 4,
  },

  // Content
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },

  // Sections
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 12,
  },

  // League Item
  leagueItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  leagueInfo: {
    flex: 1,
  },
  leagueName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  leagueDetails: {
    fontSize: 13,
    color: "#666",
  },
  leagueRight: {
    marginLeft: 12,
  },
  joinedBadge: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  joinedBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  leagueTypeBadge: {
    marginTop: 6,
  },
  leagueTypeText: {
    fontSize: 12,
    color: "#666",
  },

  // Empty State
  emptyState: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  emptyButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },

  // Error
  errorContainer: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    marginTop: 20,
  },
  errorText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },

  // Bottom CTA
  bottomCTA: {
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    marginTop: 8,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    borderStyle: "dashed",
  },
  bottomCTAText: {
    fontSize: 14,
    color: "#0D5C3A",
    marginBottom: 12,
  },
  bottomCTAButton: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  bottomCTAButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
});