import { auth, db } from "@/constants/firebaseConfig";
import {
  collection,
  onSnapshot,
  query,
} from "firebase/firestore";

import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";

interface CourseLeader {
  courseId: string;
  courseName: string;
  lowman: {
    userId: string;
    userName: string;
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
  userName: string;
  netScore: number;
  courseName: string;
  tier: "lowman" | "scratch" | "ace";
  icon: string;
}

export default function LowmanCarousel({
  userLocation,
  onSelectUser,
}: {
  userLocation?: {
    city?: string;
    state?: string;
    latitude?: number;
    longitude?: number;
  };
  onSelectUser?: (userId: string) => void;
}) {
  const [leaders, setLeaders] = useState<CourseLeader[]>([]);
  const [authReady, setAuthReady] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const isTouching = useRef(false);

  /* =========================
     AUTH READY GATE
     ========================= */
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setAuthReady(!!user);
    });
    return unsub;
  }, []);

  /* =========================
     SUBSCRIBE TO COURSE LEADERS
     ========================= */
  useEffect(() => {
    if (!authReady) return;

    const q = query(collection(db, "course_leaders"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs: CourseLeader[] = [];
        snap.forEach((d) => docs.push(d.data() as CourseLeader));
        setLeaders(docs);
      },
      (err) => {
        console.error("LowmanCarousel snapshot error:", err);
      }
    );

    return () => unsub();
  }, [authReady]);

  /* =========================
     GEO FILTERING (CITY/STATE)
     ========================= */
  const geoFiltered = useMemo(() => {
    if (!userLocation?.city) return leaders;

    return leaders.filter((l) => {
      const c = l.location?.city?.toLowerCase();
      const s = l.location?.state?.toLowerCase();
      return (
        c === userLocation.city?.toLowerCase() &&
        (!userLocation.state || s === userLocation.state?.toLowerCase())
      );
    });
  }, [leaders, userLocation]);

  /* =========================
     ACHIEVEMENT TIERS
     ========================= */
  const carouselData = useMemo(() => {
    const counts: Record<string, number> = {};

    geoFiltered.forEach((l) => {
      counts[l.lowman.userId] = (counts[l.lowman.userId] || 0) + 1;
    });

    return geoFiltered.map((l) => {
      const wins = counts[l.lowman.userId];
      let tier: CarouselItem["tier"] = "lowman";
      let icon = "🏆";

      if (wins === 2) {
        tier = "scratch";
        icon = "👑";
      } else if (wins >= 3) {
        tier = "ace";
        icon = "🂡";
      }

      return {
        userId: l.lowman.userId,
        userName: l.lowman.userName,
        netScore: l.lowman.netScore,
        courseName: l.courseName,
        tier,
        icon,
      };
    });
  }, [geoFiltered]);

  /* =========================
     AUTO SCROLL
     ========================= */
  useEffect(() => {
    const interval = setInterval(() => {
      if (!scrollRef.current || isTouching.current) return;
      scrollX.current += 0.4;
      scrollRef.current.scrollTo({ x: scrollX.current, animated: false });
    }, 30);

    return () => clearInterval(interval);
  }, []);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
      onTouchStart={() => (isTouching.current = true)}
      onTouchEnd={() => (isTouching.current = false)}
    >
      {carouselData.map((item) => (
        <TouchableOpacity
          key={`${item.userId}-${item.courseName}`}
          style={[styles.card, styles[item.tier]]}
          onPress={() => {
            Haptics.selectionAsync();
            onSelectUser?.(item.userId);
          }}
        >
          <Text style={styles.icon}>{item.icon}</Text>
          <Text style={styles.name}>{item.userName}</Text>
          <Text style={styles.course}>{item.courseName}</Text>
          <Text style={styles.score}>{item.netScore}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 12, alignItems: "center" },
  card: {
    marginRight: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },
  lowman: { borderWidth: 1, borderColor: "#C9A400" },
  scratch: { borderWidth: 2, borderColor: "#0D5C3A" },
  ace: { borderWidth: 2, borderColor: "#000", backgroundColor: "#EFE7C5" },
  icon: { fontSize: 18 },
  name: { fontSize: 13, fontWeight: "700", color: "#0D5C3A" },
  course: { fontSize: 11, color: "#666" },
  score: { fontSize: 14, fontWeight: "900", color: "#111" },
});





