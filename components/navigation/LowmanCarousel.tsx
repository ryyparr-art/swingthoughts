import { auth, db } from "@/constants/firebaseConfig";
import { collection, onSnapshot, query } from "firebase/firestore";

import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { soundPlayer } from "@/utils/soundPlayer";

interface CourseLeader {
  courseId: string;
  courseName: string;
  lowman: {
    userId: string;
    displayName: string;
    netScore: number;
  };
  holeinones?: Array<{
    userId: string;
    displayName: string;
    hole: number;
    achievedAt: any;
    postId?: string; // Clubhouse post ID
  }>;
  location?: {
    city?: string;
    state?: string;
    latitude?: number;
    longitude?: number;
  };
}

interface CarouselItem {
  userId: string;
  displayName: string;
  netScore?: number;
  courseName: string;
  courseId: string;
  tier: "lowman" | "scratch" | "ace" | "holeinone";
  icon: any; // ✅ Changed from string to any for Image source
  hole?: number; // For hole-in-ones
  postId?: string; // For navigating to clubhouse post
}

export default function LowmanCarousel({
  courseIds,
  userLocation,
  onSelectUser,
}: {
  courseIds?: number[];
  userLocation?: {
    city?: string;
    state?: string;
    latitude?: number;
    longitude?: number;
  };
  onSelectUser?: (userId: string) => void;
}) {
  const [allLeaders, setAllLeaders] = useState<CourseLeader[]>([]);
  const [authReady, setAuthReady] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const isTouching = useRef(false);
  const scrollContentWidth = useRef(0);

  const shuffledOnce = useRef<CarouselItem[] | null>(null);

  // ✅ Badge icon imports
  const LowLeaderTrophy = require("@/assets/icons/LowLeaderTrophy.png");
  const LowLeaderScratch = require("@/assets/icons/LowLeaderScratch.png");
  const LowLeaderAce = require("@/assets/icons/LowLeaderAce.png");
  const HoleInOne = require("@/assets/icons/HoleinOne.png");

  /* =========================
     AUTH READY
     ========================= */
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setAuthReady(!!user);
    });
    return unsub;
  }, []);

  /* =========================
     SUBSCRIBE TO ALL LEADERS
     ========================= */
  useEffect(() => {
    if (!authReady) return;

    console.log("🏆 Fetching ALL leaders for tier calculation");
    const q = query(collection(db, "course_leaders"));

    const unsub = onSnapshot(q, (snap) => {
      const docs: CourseLeader[] = [];
      
      snap.forEach((d) => {
        const data = d.data() as CourseLeader;
        docs.push(data);
      });
      
      console.log("✅ Found", docs.length, "total leaders");
      setAllLeaders(docs);
      shuffledOnce.current = null;
      scrollX.current = 0;
    });

    return () => unsub();
  }, [authReady]);

  /* =========================
     FILTER BY courseIds
     ========================= */
  const filteredLeaders = useMemo(() => {
    if (!courseIds || courseIds.length === 0) {
      return allLeaders;
    }

    const courseIdStrings = courseIds.map(id => String(id));
    const filtered = allLeaders.filter(l => courseIdStrings.includes(l.courseId));
    
    console.log("🔍 Filtered to", filtered.length, "leaders from", courseIds.length, "courses");
    return filtered;
  }, [allLeaders, courseIds]);

  /* =========================
     GEO FILTERING
     ========================= */
  const geoFiltered = useMemo(() => {
    if (!userLocation?.city) return filteredLeaders;

    return filteredLeaders.filter((l) => {
      const c = l.location?.city?.toLowerCase();
      const s = l.location?.state?.toLowerCase();
      return (
        c === userLocation.city?.toLowerCase() &&
        (!userLocation.state || s === userLocation.state?.toLowerCase())
      );
    });
  }, [filteredLeaders, userLocation]);

  /* =========================
     BUILD CAROUSEL WITH LOWMAN + HOLE-IN-ONES
     ========================= */
  const carouselData = useMemo(() => {
    if (shuffledOnce.current) return shuffledOnce.current;

    const TARGET_COUNT = 6;

    // ✅ EXPANSION LOGIC: Find at least 6 achievements
    let candidates = geoFiltered;
    
    console.log("🔍 Step 1 - Geo-filtered:", candidates.length, "leaders");

    // If not enough, expand to same state
    if (candidates.length < TARGET_COUNT && userLocation?.state) {
      const stateFiltered = filteredLeaders.filter((l) => {
        const s = l.location?.state?.toLowerCase();
        return s === userLocation.state?.toLowerCase();
      });
      
      candidates = stateFiltered;
      console.log("🔍 Step 2 - Expanded to state:", candidates.length, "leaders");
    }

    // If still not enough, expand nationwide (all filtered leaders)
    if (candidates.length < TARGET_COUNT) {
      candidates = filteredLeaders;
      console.log("🔍 Step 3 - Expanded to filtered leaders:", candidates.length, "leaders");
    }

    // If STILL not enough, expand to all leaders nationwide
    if (candidates.length < TARGET_COUNT) {
      candidates = allLeaders;
      console.log("🔍 Step 4 - Expanded nationwide:", candidates.length, "leaders");
    }

    if (candidates.length === 0) {
      console.log("⚠️ No achievements found anywhere");
      return [];
    }

    // ✅ Count wins across ALL leaders (not just candidates)
    const wins: Record<string, number> = {};
    allLeaders.forEach((l) => {
      wins[l.lowman.userId] = (wins[l.lowman.userId] || 0) + 1;
    });

    console.log("🏆 Win counts:", wins);

    // ✅ Build carousel from candidates (lowman + hole-in-ones)
    const built: CarouselItem[] = [];

    candidates.forEach((l) => {
      // ✅ DEBUG: Log every lowman being processed
      console.log("🔍 Processing lowman:", l.lowman.displayName, "userId:", l.lowman.userId, "course:", l.courseName, "location:", l.location);
      
      // Add lowman achievement
      const userWins = wins[l.lowman.userId] || 1;
      let tier: "lowman" | "scratch" | "ace" = "lowman";
      let icon = LowLeaderTrophy; // ✅ Default to Trophy

      if (userWins === 2) {
        tier = "scratch";
        icon = LowLeaderScratch; // ✅ Scratch badge
      } else if (userWins >= 3) {
        tier = "ace";
        icon = LowLeaderAce; // ✅ Ace badge
      }

      console.log(`  ${l.lowman.displayName} at ${l.courseName}: ${userWins} total wins → ${tier}`);

      built.push({
        userId: l.lowman.userId,
        displayName: l.lowman.displayName,
        netScore: l.lowman.netScore,
        courseName: l.courseName,
        courseId: l.courseId,
        tier,
        icon,
      });

      // Add hole-in-ones for this course
      console.log(`  🔍 Checking hole-in-ones for ${l.courseName}:`, l.holeinones);
      
      if (l.holeinones && l.holeinones.length > 0) {
        console.log(`  ✅ Found ${l.holeinones.length} hole-in-one(s) at ${l.courseName}`);
        
        l.holeinones.forEach((hio) => {
          console.log(`    ⛳ ${hio.displayName} hole-in-one at ${l.courseName} on hole ${hio.hole}, postId: ${hio.postId}`);
          
          built.push({
            userId: hio.userId,
            displayName: hio.displayName,
            courseName: l.courseName,
            courseId: l.courseId,
            tier: "holeinone",
            icon: HoleInOne, // ✅ Hole-in-one badge
            hole: hio.hole,
            postId: hio.postId, // Store the post ID
          });
        });
      } else {
        console.log(`  ⚠️ No hole-in-ones at ${l.courseName}`);
      }
    });

    // ✅ Shuffle
    for (let i = built.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [built[i], built[j]] = [built[j], built[i]];
    }

    // ✅ Take up to 6 (or all if less than 6)
    const final = built.slice(0, TARGET_COUNT);
    console.log("✅ Final carousel:", final.length, "cards");
    
    shuffledOnce.current = final;
    return shuffledOnce.current;
  }, [allLeaders, filteredLeaders, geoFiltered, userLocation]);

  /* =========================
     AUTO SCROLL
     ========================= */
  useEffect(() => {
    const interval = setInterval(() => {
      if (!scrollRef.current || isTouching.current) return;

      scrollX.current += 0.45;

      if (
        scrollContentWidth.current > 0 &&
        scrollX.current >= scrollContentWidth.current / 2
      ) {
        scrollX.current = 0;
        scrollRef.current.scrollTo({ x: 0, animated: false });
        return;
      }

      scrollRef.current.scrollTo({
        x: scrollX.current,
        animated: false,
      });
    }, 30);

    return () => clearInterval(interval);
  }, []);

  /* =========================
     HANDLE TAP
     ========================= */
  const handleItemPress = (item: CarouselItem) => {
    soundPlayer.play("click");
    Haptics.selectionAsync();
    
    onSelectUser?.(item.userId);
    
    if (item.tier === "holeinone") {
      if (item.postId) {
        console.log("🚀 Navigating to clubhouse with highlighted hole-in-one post:", item.postId);
        
        router.push({
          pathname: "/clubhouse",
          params: { highlightPostId: item.postId },
        });
      } else {
        console.log("⚠️ No postId for hole-in-one, navigating to clubhouse");
        router.push("/clubhouse");
      }
    } else {
      console.log("🚀 Navigating to leaderboard with:", {
        courseId: item.courseId,
        playerId: item.userId,
      });
      
      router.push({
        pathname: "/leaderboard",
        params: {
          courseId: item.courseId,
          playerId: item.userId,
        },
      });
    }
  };

  // ✅ If no data, show motivational card
  if (carouselData.length === 0) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollStrip}
        contentContainerStyle={styles.container}
        scrollEnabled={false}
      >
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardIcon}>🏆</Text>
          <Text style={styles.emptyCardText}>
            Be the first to post a score and achieve Low Leader status
          </Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scrollStrip}
      contentContainerStyle={styles.container}
      onContentSizeChange={(w) => (scrollContentWidth.current = w)}
      onTouchStart={() => (isTouching.current = true)}
      onTouchEnd={() => (isTouching.current = false)}
    >
      {/* Duplicate cards enough times to ensure continuous scroll */}
      {Array.from({ length: 4 }).flatMap((_, repeatIndex) =>
        carouselData.map((item, idx) => (
          <TouchableOpacity
            key={`${item.userId}-${item.courseName}-${item.hole || 'lowman'}-${repeatIndex}-${idx}`}
            style={[styles.card, styles[item.tier]]}
            activeOpacity={0.85}
            onPress={() => handleItemPress(item)}
          >
            <View style={styles.cardContent}>
              {/* ✅ Icon on left, spanning both rows */}
              <Image source={item.icon} style={styles.iconImage} />
              
              <View style={styles.textContent}>
                {/* ✅ First row: DisplayName and Score */}
                <View style={styles.topRow}>
                  <Text
                    style={styles.name}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.displayName}
                  </Text>
                  <Text style={styles.score}>
                    {item.tier === "holeinone" ? `#${item.hole}` : item.netScore}
                  </Text>
                </View>

                {/* ✅ Second row: CourseName */}
                <Text style={styles.course} numberOfLines={1}>
                  {item.courseName}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

/* =========================
   STYLES
   ========================= */
const styles = StyleSheet.create({
  scrollStrip: {
    backgroundColor: "#FFFFFF",
  },

  container: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
  },

  emptyContainer: {
    backgroundColor: "#FFFFFF",
    height: 50,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyText: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
  },

  emptyCard: {
    marginRight: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F7F8FA",
    borderWidth: 2,
    borderColor: "#0D5C3A",
    borderStyle: "dashed",
    minWidth: 280,
  },

  emptyCardIcon: {
    fontSize: 32,
    marginBottom: 8,
  },

  emptyCardText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D5C3A",
    textAlign: "center",
    lineHeight: 18,
  },

  card: {
    marginRight: 16,
    paddingVertical: 2,
    paddingHorizontal: 12,
    borderRadius: 22,

    backgroundColor: "#F7F8FA",
    borderWidth: 1,
    borderColor: "#D6D9DE",

    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    minWidth: 160,
  },

  lowman: {},
  scratch: {
    borderColor: "#8FAF9D",
  },
  ace: {
    borderColor: "#9FA3A8",
    backgroundColor: "#F2F4F7",
  },
  holeinone: {
    borderColor: "#FFD700",
    backgroundColor: "#FFFEF5",
  },

  // ✅ Card content: horizontal layout
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  // ✅ Icon on left, spanning both rows
  iconImage: {
    width: 42,
    height: 42,
    resizeMode: "contain",
  },

  // ✅ Text content container
  textContent: {
    flex: 1,
    minWidth: 0,
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },

  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "700",
    color: "#2E3A2F",
  },

  score: {
    fontSize: 15,
    fontWeight: "900",
    color: "#111",
    marginLeft: 6,
  },

  course: {
    fontSize: 11,
    color: "#666",
  },
});














