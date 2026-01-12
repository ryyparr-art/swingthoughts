import { auth, db } from "@/constants/firebaseConfig";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";

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
    userName?: string;
    hole: number;
    achievedAt: any;
    postId?: string;
  }>;
  location?: {
    city?: string;
    state?: string;
    latitude?: number;
    longitude?: number;
  };
  regionKey?: string;
}

interface CarouselItem {
  userId: string;
  displayName: string;
  netScore?: number;
  courseName: string;
  courseId: string;
  tier: "lowman" | "scratch" | "ace" | "holeinone";
  icon: any;
  hole?: number;
  postId?: string;
  regionKey?: string;
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
  const [userRegionKey, setUserRegionKey] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const isTouching = useRef(false);
  const scrollContentWidth = useRef(0);

  const shuffledOnce = useRef<CarouselItem[] | null>(null);

  const LowLeaderTrophy = require("@/assets/icons/LowLeaderTrophy.png");
  const LowLeaderScratch = require("@/assets/icons/LowLeaderScratch.png");
  const LowLeaderAce = require("@/assets/icons/LowLeaderAce.png");
  const HoleInOne = require("@/assets/icons/HoleinOne.png");

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setAuthReady(true);
        
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const region = userData.regionKey;
            
            if (region) {
              console.log("🌍 Carousel: User regionKey:", region);
              setUserRegionKey(region);
            } else {
              console.log("⚠️ Carousel: User has no regionKey");
              setUserRegionKey(null);
            }
          }
        } catch (error) {
          console.error("❌ Carousel: Error fetching user region:", error);
          setUserRegionKey(null);
        }
      } else {
        setAuthReady(false);
        setUserRegionKey(null);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!authReady) return;

    console.log("🏆 Carousel: Fetching leaders for regionKey:", userRegionKey || "ALL");
    
    let q;
    if (userRegionKey) {
      q = query(
        collection(db, "leaderboards"),
        where("regionKey", "==", userRegionKey)
      );
    } else {
      q = query(collection(db, "leaderboards"));
    }

    const unsub = onSnapshot(q, (snap) => {
      const docs: CourseLeader[] = [];
      
      console.log("📊 Carousel: Received", snap.size, "leaderboard documents");
      
      snap.forEach((d) => {
        const data = d.data();
        const docId = d.id;
        
        const lastUnderscoreIndex = docId.lastIndexOf('_');
        
        if (lastUnderscoreIndex === -1) {
          console.warn("⚠️ Carousel: Invalid doc ID format:", docId);
          return;
        }
        
        const regionKey = docId.substring(0, lastUnderscoreIndex);
        const courseIdStr = docId.substring(lastUnderscoreIndex + 1);
        
        // Extract lowman from topScores array (sorted ascending)
        if (data.topScores18 && Array.isArray(data.topScores18) && data.topScores18.length > 0) {
          const lowmanScore = data.topScores18[0];
          
          // Handle both displayName and userName fields
          const displayName = lowmanScore.displayName || lowmanScore.userName || "Unknown";
          
          // Extract holes-in-one (try both field names)
          const holesInOne = data.holesInOne || data.holeInOnes || [];
          
          console.log("  ✅", displayName, "at", data.courseName, "-", lowmanScore.netScore, "| HIOs:", holesInOne.length);
          
          docs.push({
            courseId: courseIdStr,
            courseName: data.courseName || "Unknown Course",
            lowman: {
              userId: lowmanScore.userId,
              displayName: displayName,
              netScore: lowmanScore.netScore,
            },
            holeinones: holesInOne.map((hio: any) => ({
              userId: hio.userId,
              displayName: hio.displayName || hio.userName || "Unknown",
              userName: hio.userName,
              hole: hio.hole,
              achievedAt: hio.achievedAt,
              postId: hio.postId,
            })),
            location: data.location,
            regionKey: regionKey,
          });
        }
      });
      
      console.log("✅ Carousel: Parsed", docs.length, "lowman achievements");
      setAllLeaders(docs);
      shuffledOnce.current = null;
      scrollX.current = 0;
    });

    return () => unsub();
  }, [authReady, userRegionKey]);

  const filteredLeaders = useMemo(() => {
    if (!courseIds || courseIds.length === 0) {
      return allLeaders;
    }

    const courseIdStrings = courseIds.map(id => String(id));
    const filtered = allLeaders.filter(l => courseIdStrings.includes(l.courseId));
    
    console.log("🔍 Carousel: Filtered to", filtered.length, "leaders");
    return filtered;
  }, [allLeaders, courseIds]);

  const carouselData = useMemo(() => {
    if (shuffledOnce.current) return shuffledOnce.current;

    const TARGET_COUNT = 6;
    let candidates = filteredLeaders;

    console.log("🔍 Carousel: Building from", candidates.length, "leaders");

    if (candidates.length === 0) {
      console.log("⚠️ Carousel: No achievements found");
      return [];
    }

    // Count wins across ALL leaders in the region
    const wins: Record<string, number> = {};
    allLeaders.forEach((l) => {
      wins[l.lowman.userId] = (wins[l.lowman.userId] || 0) + 1;
    });

    console.log("🏆 Carousel: Win counts:", wins);

    const built: CarouselItem[] = [];

    candidates.forEach((l) => {
      const userWins = wins[l.lowman.userId] || 1;
      let tier: "lowman" | "scratch" | "ace" = "lowman";
      let icon = LowLeaderTrophy;

      if (userWins === 2) {
        tier = "scratch";
        icon = LowLeaderScratch;
      } else if (userWins >= 3) {
        tier = "ace";
        icon = LowLeaderAce;
      }

      built.push({
        userId: l.lowman.userId,
        displayName: l.lowman.displayName,
        netScore: l.lowman.netScore,
        courseName: l.courseName,
        courseId: l.courseId,
        tier,
        icon,
        regionKey: l.regionKey,
      });

      // Add hole-in-ones (will show when populated by post scores)
      if (l.holeinones && l.holeinones.length > 0) {
        console.log(`  ⛳ Adding ${l.holeinones.length} hole-in-one(s) from ${l.courseName}`);
        
        l.holeinones.forEach((hio) => {
          built.push({
            userId: hio.userId,
            displayName: hio.displayName,
            courseName: l.courseName,
            courseId: l.courseId,
            tier: "holeinone",
            icon: HoleInOne,
            hole: hio.hole,
            postId: hio.postId,
            regionKey: l.regionKey,
          });
        });
      }
    });

    // Shuffle
    for (let i = built.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [built[i], built[j]] = [built[j], built[i]];
    }

    const final = built.slice(0, TARGET_COUNT);
    console.log("✅ Carousel: Final", final.length, "cards");
    
    shuffledOnce.current = final;
    return shuffledOnce.current;
  }, [allLeaders, filteredLeaders]);

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

  const handleItemPress = (item: CarouselItem) => {
    soundPlayer.play("click");
    Haptics.selectionAsync();
    
    onSelectUser?.(item.userId);
    
    if (item.tier === "holeinone") {
      if (item.postId) {
        console.log("🚀 Tapped hole-in-one, navigating to post:", item.postId);
        router.push({
          pathname: "/clubhouse",
          params: { highlightPostId: item.postId },
        });
      } else {
        console.log("⚠️ No postId for hole-in-one, navigating to clubhouse");
        router.push("/clubhouse");
      }
    } else {
      console.log("🚀 Tapped lowman, navigating to leaderboard");
      router.push({
        pathname: "/leaderboard",
        params: {
          courseId: item.courseId,
          playerId: item.userId,
        },
      });
    }
  };

  if (carouselData.length === 0) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scrollStrip}
        contentContainerStyle={styles.container}
      >
        <View style={styles.emptyCard}>
          <View style={styles.cardContent}>
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyCardIcon}>🏆</Text>
            </View>
            
            <View style={styles.textContent}>
              <Text style={styles.emptyCardTitle} numberOfLines={1}>
                No Leaders Yet
              </Text>
              <Text style={styles.emptyCardSubtitle} numberOfLines={1}>
                Be the first to post a score
              </Text>
            </View>
          </View>
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
      {Array.from({ length: 4 }).flatMap((_, repeatIndex) =>
        carouselData.map((item, idx) => (
          <TouchableOpacity
            key={`${item.userId}-${item.courseName}-${item.hole || 'lowman'}-${repeatIndex}-${idx}`}
            style={[styles.card, styles[item.tier]]}
            activeOpacity={0.85}
            onPress={() => handleItemPress(item)}
          >
            <View style={styles.cardContent}>
              <Image source={item.icon} style={styles.iconImage} />
              
              <View style={styles.textContent}>
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

const styles = StyleSheet.create({
  scrollStrip: {
    backgroundColor: "#FFFFFF",
  },

  container: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
  },

  emptyCard: {
    marginRight: 16,
    paddingVertical: 2,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: "#F7F8FA",
    borderWidth: 2,
    borderColor: "#0D5C3A",
    borderStyle: "dashed",
    minWidth: 180,
  },

  emptyIconContainer: {
    width: 42,
    height: 42,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyCardIcon: {
    fontSize: 32,
  },

  emptyCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  emptyCardSubtitle: {
    fontSize: 11,
    color: "#0D5C3A",
    opacity: 0.8,
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
  scratch: { borderColor: "#8FAF9D" },
  ace: { borderColor: "#9FA3A8", backgroundColor: "#F2F4F7" },
  holeinone: { borderColor: "#FFD700", backgroundColor: "#FFFEF5" },

  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  iconImage: {
    width: 42,
    height: 42,
    resizeMode: "contain",
  },

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














