import { auth, db } from "@/constants/firebaseConfig";
import { collection, onSnapshot, query } from "firebase/firestore";

import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface CourseLeader {
  courseId: string;
  courseName: string;
  lowman: {
    userId: string;
    displayName: string;
    netScore: number;
  };
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
  netScore: number;
  courseName: string;
  courseId: string;
  tier: "lowman" | "scratch" | "ace";
  icon: string;
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
     BUILD CAROUSEL WITH EXPANSION LOGIC
     ========================= */
  const carouselData = useMemo(() => {
    if (shuffledOnce.current) return shuffledOnce.current;

    const TARGET_COUNT = 6;

    // ✅ EXPANSION LOGIC: Find at least 6 lowmen
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
      console.log("⚠️ No lowmen found anywhere");
      return [];
    }

    // ✅ Count wins across ALL leaders (not just candidates)
    const wins: Record<string, number> = {};
    allLeaders.forEach((l) => {
      wins[l.lowman.userId] = (wins[l.lowman.userId] || 0) + 1;
    });

    console.log("🏆 Win counts:", wins);

    // ✅ Build carousel from candidates
    const built: CarouselItem[] = candidates.map((l) => {
      const userWins = wins[l.lowman.userId] || 1;
      let tier: CarouselItem["tier"] = "lowman";
      let icon = "🏆";

      if (userWins === 2) {
        tier = "scratch";
        icon = "👑";
      } else if (userWins >= 3) {
        tier = "ace";
        icon = "🂡";
      }

      console.log(`  ${l.lowman.displayName} at ${l.courseName}: ${userWins} total wins → ${tier}`);

      return {
        userId: l.lowman.userId,
        displayName: l.lowman.displayName,
        netScore: l.lowman.netScore,
        courseName: l.courseName,
        courseId: l.courseId,
        tier,
        icon,
      };
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
    Haptics.selectionAsync();
    
    onSelectUser?.(item.userId);
    
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
  };

  // ✅ If no data, don't render anything (or show empty state)
  if (carouselData.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No lowman badges yet</Text>
      </View>
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
      {[...carouselData, ...carouselData].map((item, idx) => (
        <TouchableOpacity
          key={`${item.userId}-${item.courseName}-${idx}`}
          style={[styles.card, styles[item.tier]]}
          activeOpacity={0.85}
          onPress={() => handleItemPress(item)}
        >
          <View style={styles.topRow}>
            <Text style={styles.icon}>{item.icon}</Text>
            <Text
              style={styles.name}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.displayName}
            </Text>
            <Text style={styles.score}>{item.netScore}</Text>
          </View>

          <Text style={styles.course} numberOfLines={1}>
            {item.courseName}
          </Text>
        </TouchableOpacity>
      ))}
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

  card: {
    marginRight: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 22,
    justifyContent: "center",

    backgroundColor: "#F7F8FA",
    borderWidth: 1,
    borderColor: "#D6D9DE",

    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  lowman: {},
  scratch: {
    borderColor: "#8FAF9D",
  },
  ace: {
    borderColor: "#9FA3A8",
    backgroundColor: "#F2F4F7",
  },

  topRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  icon: { fontSize: 16 },

  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "700",
    color: "#2E3A2F",
  },

  score: {
    width: 34,
    textAlign: "right",
    fontSize: 15,
    fontWeight: "900",
    color: "#111",
  },

  course: {
    fontSize: 11,
    color: "#666",
    marginTop: 2,
  },
});















