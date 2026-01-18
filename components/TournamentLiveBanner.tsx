/**
 * TournamentLiveBanner Component
 * 
 * Displays a pulsing banner when a PGA Tour tournament is live.
 * Shows tournament name and participant count.
 * Positioned between TopNavBar and feed in Clubhouse.
 */

import { useTournamentStatus, type ActiveTournament } from "@/hooks/useTournamentStatus";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface TournamentLiveBannerProps {
  onPress: (tournament: ActiveTournament) => void;
}

export default function TournamentLiveBanner({ onPress }: TournamentLiveBannerProps) {
  const { isLive, tournament, participantCount, loading } = useTournamentStatus();
  
  // Pulsing animation for the live dot
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Glow animation for the banner
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isLive) {
      // Pulse animation for live dot
      const pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      
      // Subtle glow animation for banner
      const glowAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: false,
          }),
        ])
      );
      
      pulseAnimation.start();
      glowAnimation.start();
      
      return () => {
        pulseAnimation.stop();
        glowAnimation.stop();
      };
    }
  }, [isLive, pulseAnim, glowAnim]);

  // Don't render if not live or loading
  if (loading || !isLive || !tournament) {
    return null;
  }

  const handlePress = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(tournament);
  };

  // Interpolate glow opacity
  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.25],
  });

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      {/* Animated glow background */}
      <Animated.View
        style={[
          styles.glowBackground,
          { opacity: glowOpacity },
        ]}
      />
      
      <View style={styles.content}>
        {/* Left side: Live indicator + Tournament name */}
        <View style={styles.leftSection}>
          {/* Pulsing live dot */}
          <View style={styles.liveIndicator}>
            <Animated.View
              style={[
                styles.liveDotOuter,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />
            <View style={styles.liveDot} />
          </View>
          
          <Text style={styles.liveText}>LIVE</Text>
          
          <View style={styles.divider} />
          
          {/* Trophy icon */}
          <Image
            source={require("@/assets/icons/LowLeaderTrophy.png")}
            style={styles.trophyIcon}
          />
          
          {/* Tournament name */}
          <Text style={styles.tournamentName} numberOfLines={1}>
            {tournament.name}
          </Text>
        </View>
        
        {/* Right side: Participant count + arrow */}
        <View style={styles.rightSection}>
          {participantCount > 0 && (
            <View style={styles.participantBadge}>
              <Ionicons name="people" size={12} color="#0D5C3A" />
              <Text style={styles.participantCount}>{participantCount}</Text>
            </View>
          )}
          
          <Ionicons name="chevron-forward" size={18} color="#0D5C3A" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#0D5C3A",
    overflow: "hidden",
    position: "relative",
    
    // Shadow
    shadowColor: "#0D5C3A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  
  glowBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFD700",
  },
  
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 8,
  },
  
  liveIndicator: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  
  liveDotOuter: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(255, 59, 48, 0.3)",
  },
  
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF3B30",
  },
  
  liveText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#FF3B30",
    letterSpacing: 1,
  },
  
  divider: {
    width: 1,
    height: 16,
    backgroundColor: "#E0E0E0",
    marginHorizontal: 4,
  },
  
  trophyIcon: {
    width: 18,
    height: 18,
  },
  
  tournamentName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    flex: 1,
  },
  
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  
  participantBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  
  participantCount: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D5C3A",
  },
});