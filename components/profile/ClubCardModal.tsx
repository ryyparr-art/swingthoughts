/**
 * ClubCardModal
 *
 * Full screen modal showing an expanded version of the user's Club Card.
 * Single metallic walnut LinearGradient — no gold nameplate strip.
 * Includes: avatar, displayName, real name, HCI, ST Power Ranking, stats,
 * member since date, and SwingThoughts branding.
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
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
  // ST Power Ranking (optional — hides panel if powerRating is null/undefined)
  powerRating?: number | null;
  globalRank?: number | null;
  roundsInWindow?: number;
  previousRating?: number | null;
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
  powerRating,
  globalRank,
  roundsInWindow = 0,
  previousRating,
}: ClubCardModalProps) {
  const formatMemberSince = (): string => {
    if (!memberSince) return "—";
    try {
      const date = memberSince.toDate ? memberSince.toDate() : new Date(memberSince);
      return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
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

  const showPowerRankingInfo = () => {
    Alert.alert(
      "ST Power Ranking",
      "Your Power Rating is a rolling 12-month score based on net performance, course difficulty, field strength, and event type. Requires 3 rounds to earn a Global Rank.",
      [{ text: "Got it" }]
    );
  };

  const formatStat = (value: number | undefined | null): string => {
    if (value === undefined || value === null) return "—";
    return value.toString();
  };

  // Derive trend from previousRating
  const trendDelta =
    powerRating != null && previousRating != null
      ? powerRating - previousRating
      : null;

  const isUnranked = globalRank == null;
  const hasRankingData = powerRating != null;
  const roundsNeeded = Math.max(0, 3 - roundsInWindow);

  console.log("🃏 ClubCardModal props — powerRating:", powerRating, "globalRank:", globalRank, "hasRankingData:", hasRankingData);

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

          {/* CARD — single metallic walnut gradient, no gold nameplate */}
          <LinearGradient
            colors={["#9B7055", "#6B4830", "#3D2415", "#2A1A0A", "#3D2415", "#6B4830", "#9B7055"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            {/* Inset engraving border — mirrors HonorPlaque treatment */}
            <View style={styles.cardInsetBorder} />

            {/* ===== ENGRAVED HEADER ===== */}
            <View style={styles.cardHeader}>
              <Text style={styles.cardHeaderLabel}>CLUB CARD</Text>
              <Text style={styles.cardHeaderName} numberOfLines={1}>
                {displayName}
              </Text>
            </View>

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

                  {/* ===== ST POWER RANKING PANEL ===== */}
                  {hasRankingData && (
                    <View style={styles.rankingPanel}>
                      <View style={styles.rankingHairline} />

                      <View style={styles.rankingInner}>
                        {/* LEFT: Power Rating */}
                        <View style={styles.rankingCell}>
                          <View style={styles.rankingLabelRow}>
                            <Text style={styles.rankingMetaLabel}>ST POWER</Text>
                            <TouchableOpacity
                              onPress={() => {
                                soundPlayer.play("click");
                                showPowerRankingInfo();
                              }}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Ionicons
                                name="information-circle-outline"
                                size={11}
                                color="#8B7355"
                              />
                            </TouchableOpacity>
                          </View>

                          <View style={styles.rankingValueRow}>
                            <Text style={styles.rankingRating}>
                              {powerRating!.toFixed(1)}
                            </Text>
                            {trendDelta !== null && Math.abs(trendDelta) >= 0.5 && (
                              <View style={styles.trendBadge}>
                                <Text
                                  style={[
                                    styles.trendArrow,
                                    trendDelta > 0
                                      ? styles.trendUp
                                      : styles.trendDown,
                                  ]}
                                >
                                  {trendDelta > 0 ? "↑" : "↓"}
                                </Text>
                                <Text
                                  style={[
                                    styles.trendDelta,
                                    trendDelta > 0
                                      ? styles.trendUp
                                      : styles.trendDown,
                                  ]}
                                >
                                  {Math.abs(trendDelta).toFixed(1)}
                                </Text>
                              </View>
                            )}
                          </View>

                          <Text style={styles.rankingSubLabel}>
                            {roundsInWindow} round{roundsInWindow !== 1 ? "s" : ""} in window
                          </Text>
                        </View>

                        {/* CENTER DIVIDER */}
                        <View style={styles.rankingCellDivider} />

                        {/* RIGHT: Global Rank */}
                        <View style={styles.rankingCell}>
                          <Text style={styles.rankingMetaLabel}>GLOBAL RANK</Text>

                          {isUnranked ? (
                            <>
                              <Text style={styles.rankingUnranked}>UNRANKED</Text>
                              <Text style={styles.rankingSubLabel}>
                                {roundsNeeded} round{roundsNeeded !== 1 ? "s" : ""} to qualify
                              </Text>
                            </>
                          ) : (
                            <>
                              <View style={styles.rankNumberRow}>
                                <Text style={styles.rankHash}>#</Text>
                                <Text style={styles.rankNumber}>{globalRank}</Text>
                              </View>
                              <Text style={styles.rankingSubLabel}>worldwide</Text>
                            </>
                          )}
                        </View>
                      </View>
                    </View>
                  )}
                  {/* ===== END RANKING PANEL ===== */}
                </View>
              </View>

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

          </LinearGradient>
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(197, 165, 90, 0.3)",
  },

  /* Inset engraving border */
  cardInsetBorder: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: 1,
    borderColor: "rgba(197, 165, 90, 0.15)",
    borderRadius: 13,
    pointerEvents: "none",
  },

  /* ===== ENGRAVED HEADER (replaces gold nameplate) ===== */
  cardHeader: {
    paddingTop: 18,
    paddingBottom: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  cardHeaderLabel: {
    fontSize: 9,
    fontWeight: "900",
    color: "rgba(197, 165, 90, 0.6)",
    letterSpacing: 4,
    marginBottom: 3,
  },

  cardHeaderName: {
    fontFamily: "Georgia",
    fontSize: 22,
    fontWeight: "700",
    color: "#F4EED8",
    letterSpacing: 2,
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
    backgroundColor: "#4A3628",
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
    marginBottom: 10,
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

  /* ===== ST POWER RANKING PANEL ===== */
  rankingPanel: {
    width: "100%",
    borderRadius: 8,
    backgroundColor: "rgba(0, 0, 0, 0.28)",
    borderWidth: 1,
    borderColor: "rgba(197, 165, 90, 0.22)",
    overflow: "hidden",
  },

  rankingHairline: {
    height: 1,
    backgroundColor: "rgba(197, 165, 90, 0.45)",
  },

  rankingInner: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 10,
  },

  rankingCell: {
    flex: 1,
    alignItems: "center",
  },

  rankingCellDivider: {
    width: 1,
    backgroundColor: "rgba(197, 165, 90, 0.2)",
    marginHorizontal: 8,
    marginVertical: 2,
  },

  rankingLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },

  rankingMetaLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: "#8B7355",
    letterSpacing: 1.5,
  },

  rankingValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },

  rankingRating: {
    fontSize: 26,
    fontWeight: "800",
    color: "#C5A55A",
    lineHeight: 30,
  },

  trendBadge: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 1,
    marginBottom: 2,
  },

  trendArrow: {
    fontSize: 12,
    fontWeight: "700",
  },

  trendDelta: {
    fontSize: 9,
    fontWeight: "600",
  },

  trendUp: {
    color: "#5DBE7A",
  },

  trendDown: {
    color: "#E07070",
  },

  rankingSubLabel: {
    fontSize: 8,
    color: "#8B7355",
    marginTop: 3,
    letterSpacing: 0.2,
    textAlign: "center",
  },

  rankingUnranked: {
    fontSize: 11,
    fontWeight: "800",
    color: "#8B7355",
    letterSpacing: 2,
    marginTop: 2,
    marginBottom: 2,
    lineHeight: 26,
  },

  rankNumberRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 1,
  },

  rankHash: {
    fontSize: 14,
    fontWeight: "700",
    color: "#8B7355",
    lineHeight: 30,
  },

  rankNumber: {
    fontSize: 26,
    fontWeight: "800",
    color: "#F4EED8",
    lineHeight: 30,
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
    backgroundColor: "rgba(0, 0, 0, 0.2)",
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