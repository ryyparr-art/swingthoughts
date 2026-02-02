/**
 * FeedHeader Component
 * 
 * Top section of the Clubhouse screen:
 * - Lowman carousel
 * - Top navigation bar
 * - Tournament live banner
 * - Cache indicator
 */

import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import LowmanCarousel from "@/components/navigation/LowmanCarousel";
import TopNavBar from "@/components/navigation/TopNavBar";
import TournamentLiveBanner from "@/components/TournamentLiveBanner";
import type { ActiveTournament } from "@/hooks/useTournamentStatus";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface FeedHeaderProps {
  showingCached: boolean;
  loading: boolean;
  onTournamentPress: (tournament: ActiveTournament) => void;
}

/* ================================================================ */
/* COMPONENT                                                        */
/* ================================================================ */

export default function FeedHeader({
  showingCached,
  loading,
  onTournamentPress,
}: FeedHeaderProps) {
  return (
    <>
      {/* Safe area for status bar */}
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      {/* Lowman carousel */}
      <View style={styles.carouselWrapper}>
        <LowmanCarousel />
      </View>

      {/* Top navigation */}
      <TopNavBar />

      {/* Tournament banner */}
      <TournamentLiveBanner onPress={onTournamentPress} />

      {/* Cache indicator - shows when loading fresh data in background */}
      {showingCached && !loading && (
        <View style={styles.cacheIndicator}>
          <ActivityIndicator size="small" color="#0D5C3A" />
          <Text style={styles.cacheText}>Updating feed...</Text>
        </View>
      )}
    </>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  safeTop: {
    backgroundColor: "#0D5C3A",
  },
  carouselWrapper: {
    height: 70,
  },
  cacheIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
    backgroundColor: "#FFF3CD",
    borderBottomWidth: 1,
    borderBottomColor: "#FFECB5",
  },
  cacheText: {
    fontSize: 12,
    color: "#664D03",
    fontWeight: "600",
  },
});