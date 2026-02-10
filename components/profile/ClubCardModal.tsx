/**
 * ClubCardModal
 * 
 * Full screen modal showing an expanded version of the user's Club Card.
 * Includes: avatar, displayName, real name, HCI, stats, member since date,
 * and SwingThoughts branding.
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Alert,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ClubCardModalProps {
  visible: boolean;
  onClose: () => void;
  displayName: string;
  avatar?: string;
  realName: { text: string; isPlaceholder: boolean } | null;
  handicap: number | undefined | null;
  swingThoughts: number;
  partnerCount: number;
  leaderboardScores: number;
  memberSince?: any; // Firestore Timestamp or Date
  isOwnProfile: boolean;
  onPartnersPress: () => void;
}

export default function ClubCardModal({
  visible,
  onClose,
  displayName,
  avatar,
  realName,
  handicap,
  swingThoughts,
  partnerCount,
  leaderboardScores,
  memberSince,
  isOwnProfile,
  onPartnersPress,
}: ClubCardModalProps) {
  const formatMemberSince = (): string => {
    if (!memberSince) return "—";
    try {
      const date = memberSince.toDate ? memberSince.toDate() : new Date(memberSince);
      return date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  const showHciInfo = () => {
    Alert.alert(
      "Handicap Index (HCI)",
      "Your Handicap Index is automatically calculated based on your posted scores using the SwingThoughts handicap system. It represents your potential scoring ability.",
      [{ text: "Got it" }]
    );
  };

  const formatStat = (value: number | undefined | null): string => {
    if (value === undefined || value === null) return "—";
    return value.toString();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safeArea}>
          {/* CLOSE BUTTON */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => {
              soundPlayer.play("click");
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose();
            }}
          >
            <Image
              source={require("@/assets/icons/Close.png")}
              style={styles.closeIcon}
            />
          </TouchableOpacity>

          {/* CARD */}
          <View style={styles.card}>
            {/* Gold edge top */}
            <View style={styles.cardEdge} />

            <View style={styles.cardContent}>
              {/* ===== TOP SECTION: Avatar + Info ===== */}
              <View style={styles.topSection}>
                {/* LEFT: Avatar */}
                <View style={styles.avatarCol}>
                  <View style={styles.avatarRing}>
                    {avatar ? (
                      <Image source={{ uri: avatar }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarInitial}>
                          {displayName[0]?.toUpperCase() || "?"}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* RIGHT: Club Card info */}
                <View style={styles.infoCol}>
                  <Text style={styles.clubCardLabel}>CLUB CARD</Text>

                  {realName && (
                    <Text
                      style={[
                        styles.realName,
                        realName.isPlaceholder && styles.realNamePlaceholder,
                      ]}
                      numberOfLines={1}
                    >
                      {realName.text}
                    </Text>
                  )}

                  <View style={styles.hciRow}>
                    <Text style={styles.hciLabel}>HCI</Text>
                    <TouchableOpacity
                      onPress={() => {
                        soundPlayer.play("click");
                        showHciInfo();
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="information-circle-outline"
                        size={16}
                        color="#C5A55A"
                      />
                    </TouchableOpacity>
                    <Text style={styles.hciValue}>
                      {handicap !== undefined && handicap !== null ? handicap : "—"}
                    </Text>
                  </View>
                </View>
              </View>

              {/* DISPLAY NAME */}
              <Text style={styles.displayName} numberOfLines={1}>
                {displayName}
              </Text>

              {/* ===== DIVIDER ===== */}
              <View style={styles.divider} />

              {/* ===== STATS ROW ===== */}
              <View style={styles.statsBar}>
                <View style={styles.statItem}>
                  <View style={styles.statValueRow}>
                    <Ionicons name="chatbubble-outline" size={16} color="#C5A55A" style={styles.statIcon} />
                    <Text style={styles.statValue}>{formatStat(swingThoughts)}</Text>
                  </View>
                  <Text style={styles.statLabel}>THOUGHTS</Text>
                </View>

                <View style={styles.statDivider} />

                <TouchableOpacity
                  style={styles.statItem}
                  onPress={() => {
                    soundPlayer.play("click");
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onPartnersPress();
                  }}
                >
                  <View style={styles.statValueRow}>
                    <Ionicons name="people-outline" size={16} color="#C5A55A" style={styles.statIcon} />
                    <Text style={styles.statValue}>{formatStat(partnerCount)}</Text>
                  </View>
                  <View style={styles.statLabelRow}>
                    <Text style={styles.statLabel}>PARTNERS</Text>
                    <Ionicons name="chevron-forward" size={10} color="#8B7355" />
                  </View>
                </TouchableOpacity>

                <View style={styles.statDivider} />

                <View style={styles.statItem}>
                  <View style={styles.statValueRow}>
                    <Ionicons name="trophy-outline" size={16} color="#C5A55A" style={styles.statIcon} />
                    <Text style={styles.statValue}>{formatStat(leaderboardScores)}</Text>
                  </View>
                  <Text style={styles.statLabel}>SCORES</Text>
                </View>
              </View>

              {/* ===== MEMBER SINCE ===== */}
              <View style={styles.memberSinceRow}>
                <Ionicons name="calendar-outline" size={14} color="#8B7355" />
                <Text style={styles.memberSinceLabel}>Member Since</Text>
                <Text style={styles.memberSinceValue}>{formatMemberSince()}</Text>
              </View>

              {/* ===== DIVIDER ===== */}
              <View style={styles.divider} />

              {/* ===== SWING THOUGHTS BRANDING ===== */}
              <View style={styles.brandingSection}>
                <Image
                  source={require("@/assets/images/HeroPage.png")}
                  style={styles.logo}
                  resizeMode="contain"
                />
                <Text style={styles.tagline}>
                  Where Golfers & Their Stories Live™
                </Text>
              </View>
            </View>

            {/* Gold edge bottom */}
            <View style={styles.cardEdge} />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },

  safeArea: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },

  closeButton: {
    position: "absolute",
    top: 72,
    right: 20,
    zIndex: 10,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 20,
    padding: 10,
  },

  closeIcon: {
    width: 22,
    height: 22,
    tintColor: "#F4EED8",
  },

  /* ===== CARD ===== */
  card: {
    width: "88%",
    borderRadius: 16,
    backgroundColor: "#4A3628",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
    overflow: "hidden",
  },

  cardEdge: {
    height: 4,
    backgroundColor: "#C5A55A",
    opacity: 0.5,
  },

  cardContent: {
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(197, 165, 90, 0.12)",
  },

  /* TOP SECTION */
  topSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },

  avatarCol: {
    marginRight: 20,
  },

  avatarRing: {
    borderRadius: 50,
    padding: 2,
    borderWidth: 2,
    borderColor: "#C5A55A",
  },

  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#4A3528",
  },

  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },

  avatarInitial: {
    fontSize: 36,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  infoCol: {
    flex: 1,
    paddingTop: 8,
    alignItems: "center",
  },

  clubCardLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: "#C5A55A",
    letterSpacing: 4,
    marginBottom: 8,
  },

  realName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#F4EED8",
    marginBottom: 8,
  },

  realNamePlaceholder: {
    fontSize: 13,
    fontWeight: "500",
    color: "#8B7355",
    fontStyle: "italic",
  },

  hciRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  hciLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#8B7355",
    letterSpacing: 1,
  },

  hciValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#C5A55A",
  },

  displayName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F4EED8",
    marginBottom: 18,
    marginLeft: 4,
  },

  /* DIVIDER */
  divider: {
    height: 1,
    backgroundColor: "rgba(197, 165, 90, 0.2)",
    marginBottom: 16,
  },

  /* STATS BAR */
  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(197, 165, 90, 0.18)",
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 18,
  },

  statItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  statDivider: {
    width: 1,
    height: 34,
    backgroundColor: "rgba(197, 165, 90, 0.2)",
  },

  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },

  statIcon: {
    marginRight: 5,
  },

  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#F4EED8",
  },

  statLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#8B7355",
    letterSpacing: 0.5,
  },

  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },

  /* MEMBER SINCE */
  memberSinceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 18,
    paddingHorizontal: 4,
  },

  memberSinceLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8B7355",
  },

  memberSinceValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#F4EED8",
  },

  /* BRANDING */
  brandingSection: {
    alignItems: "center",
    paddingTop: 4,
  },

  logo: {
    width: "100%",
    height: 80,
    tintColor: "#C5A55A",
    marginBottom: 8,
  },

  tagline: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8B7355",
    letterSpacing: 1.5,
    fontStyle: "italic",
  },
});