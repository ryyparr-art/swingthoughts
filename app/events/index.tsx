/**
 * Events Hub
 *
 * Entry point for all competitive features in SwingThoughts.
 * Three tabs:
 *   Gallery    – Condensed overview, CTAs, active progress previews
 *   Challenges – ST-created skill challenges (FIR, GIR, Par 3 Champion, etc.)
 *   Compete    – Leagues, Cups, Tournaments
 *
 * Accepts optional `tab` search param to open on a specific tab.
 * e.g. router.replace("/events?tab=challenges")
 *
 * Route: /events
 */

import Challenges from "@/components/events/Challenges";
import Compete from "@/components/events/Compete";
import Gallery from "@/components/events/Gallery";
import { auth } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Tab = "gallery" | "challenges" | "compete";

const VALID_TABS: Tab[] = ["gallery", "challenges", "compete"];

export default function EventsHub() {
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const currentUserId = auth.currentUser?.uid || "";

  // Use tab param if valid, otherwise default to gallery
  const initialTab: Tab = VALID_TABS.includes(tab as Tab) ? (tab as Tab) : "gallery";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const switchTab = (newTab: Tab) => {
    if (newTab === activeTab) return;
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(newTab);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      {/* Header + Tabs (unified green) */}
      <View style={styles.headerBlock}>
        {/* Title Row */}
        <View style={styles.titleRow}>
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
              style={styles.backIcon}
            />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Event Hub</Text>
          </View>
          <View style={styles.headerButton} />
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "gallery" && styles.tabActive]}
            onPress={() => switchTab("gallery")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "gallery" && styles.tabTextActive,
              ]}
            >
              Gallery
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "challenges" && styles.tabActive]}
            onPress={() => switchTab("challenges")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "challenges" && styles.tabTextActive,
              ]}
            >
              Challenges
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "compete" && styles.tabActive]}
            onPress={() => switchTab("compete")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "compete" && styles.tabTextActive,
              ]}
            >
              Compete
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab Content */}
      {activeTab === "gallery" && (
        <Gallery userId={currentUserId} onSwitchTab={setActiveTab} />
      )}
      {activeTab === "challenges" && <Challenges userId={currentUserId} />}
      {activeTab === "compete" && <Compete userId={currentUserId} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  safeTop: {
    backgroundColor: "#0D5C3A",
  },

  // Unified green header block
  headerBlock: {
    backgroundColor: "#0D5C3A",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFF",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },

  // Tabs (inside green header)
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#FFD700",
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.55)",
  },
  tabTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});