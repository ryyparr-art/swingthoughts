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
    getDocs,
    query,
    where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
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
  memberCount: number;
  format: "stroke" | "2v2";
  status: "upcoming" | "active" | "completed";
  currentWeek: number;
  totalWeeks: number;
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
  const [showSearch, setShowSearch] = useState(false);

  // Location
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [userRegion, setUserRegion] = useState<Region | null>(null);
  const [nearbyRegions, setNearbyRegions] = useState<Region[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Leagues
  const [localLeagues, setLocalLeagues] = useState<LeagueListItem[]>([]);
  const [nearbyLeagues, setNearbyLeagues] = useState<LeagueListItem[]>([]);
  const [searchResults, setSearchResults] = useState<LeagueListItem[]>([]);
  const [myLeagueIds, setMyLeagueIds] = useState<string[]>([]);

  /* ================================================================ */
  /* INITIALIZATION                                                  */
  /* ================================================================ */

  useEffect(() => {
    initializeLocation();
    loadMyLeagues();
  }, []);

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
            memberCount: data.memberCount || 0,
            format: data.format || "stroke",
            status: data.status,
            currentWeek: data.currentWeek || 0,
            totalWeeks: data.totalWeeks || 0,
          };
        })
        .filter((league) => ["upcoming", "active"].includes(league.status));

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

  const handleSearch = async (text: string) => {
    setSearchQuery(text);

    if (text.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      // Search all public leagues
      const leaguesSnap = await getDocs(
        query(
          collection(db, "leagues"),
          where("isPublic", "==", true)
        )
      );

      const results = leaguesSnap.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name,
            regionKey: data.regionKey,
            memberCount: data.memberCount || 0,
            format: data.format || "stroke",
            status: data.status,
            currentWeek: data.currentWeek || 0,
            totalWeeks: data.totalWeeks || 0,
          };
        })
        .filter(
          (league) =>
            ["upcoming", "active"].includes(league.status) &&
            league.name.toLowerCase().includes(text.toLowerCase())
        );

      setSearchResults(results);
    } catch (error) {
      console.error("Error searching leagues:", error);
    }
  };

  /* ================================================================ */
  /* HANDLERS                                                        */
  /* ================================================================ */

  const handleApplyToHost = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/leagues/apply" as any);
  };

  const handleToggleSearch = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowSearch(!showSearch);
    if (showSearch) {
      setSearchQuery("");
      setSearchResults([]);
    }
  };

  const handleLeaguePress = (leagueId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/leagues/${leagueId}` as any);
  };

  const handleTabChange = (tab: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (tab === "explore") return; // Already here
    
    router.replace(`/leagues/${tab}` as any);
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
      <View style={styles.headerRight} />
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

  const renderActionBar = () => (
    <View style={styles.actionBar}>
      <TouchableOpacity style={styles.applyButton} onPress={handleApplyToHost}>
        <Text style={styles.applyButtonText}>Apply to Host</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.searchButton} onPress={handleToggleSearch}>
        <Ionicons name="search" size={20} color="#0D5C3A" />
      </TouchableOpacity>
    </View>
  );

  const renderSearchBar = () => {
    if (!showSearch) return null;

    return (
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#999" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search leagues..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={handleSearch}
          autoFocus
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              setSearchQuery("");
              setSearchResults([]);
            }}
          >
            <Ionicons name="close" size={18} color="#999" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderLeagueItem = (league: LeagueListItem) => {
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

  const renderSearchResults = () => {
    if (!showSearch || searchQuery.length < 2) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Search Results</Text>
        {searchResults.length === 0 ? (
          <Text style={styles.noResults}>No leagues found for "{searchQuery}"</Text>
        ) : (
          searchResults.map(renderLeagueItem)
        )}
      </View>
    );
  };

  const renderLocalLeagues = () => {
    if (showSearch && searchQuery.length >= 2) return null;

    const locationName = userRegion?.primaryCity || "You";

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Leagues Near {locationName}</Text>
        {localLeagues.length === 0 ? (
          renderEmptyState()
        ) : (
          localLeagues.map(renderLeagueItem)
        )}
      </View>
    );
  };

  const renderNearbyLeagues = () => {
    if (showSearch && searchQuery.length >= 2) return null;
    if (nearbyLeagues.length === 0) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Leagues Close By</Text>
        {nearbyLeagues.map(renderLeagueItem)}
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
      {renderActionBar()}
      {renderSearchBar()}

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
            {renderSearchResults()}
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

  // Action Bar
  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  applyButton: {
    flex: 1,
    backgroundColor: "#0D5C3A",
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: "center",
  },
  applyButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },
  searchButton: {
    width: 44,
    height: 44,
    backgroundColor: "#FFF",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  // Search Bar
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: "#333",
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

  // No Results
  noResults: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    paddingVertical: 20,
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