/**
 * CourseActionButtons — Course Locker Action Row
 *
 * Four engraved plaque-style buttons matching the CoursePlaque aesthetic.
 * Colors:
 *   - Become a Player: gold gradient when active, muted when inactive
 *   - Declare Membership: green when approved, grey when pending, muted when none/rejected
 *   - Locker Note: green when course is claimed, grey when not
 *   - League: green when league exists, grey when not
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

// ============================================================================
// COLOR TOKENS
// ============================================================================

const GOLD_GRADIENT   = ["#E8C84A", "#C8A53C", "#B8922A", "#C8A53C", "#E2C048"] as const;
const GREEN_GRADIENT  = ["#1A7A4A", "#0D5C3A", "#0A4A2E", "#0D5C3A", "#1A7A4A"] as const;
const GREY_GRADIENT   = ["#9A9A9A", "#7A7A7A", "#666666", "#7A7A7A", "#9A9A9A"] as const;
const BORDER_GOLD     = "#6A4C08";
const BORDER_GREEN    = "#0A3D28";
const BORDER_GREY     = "#555555";

// ============================================================================
// TYPES
// ============================================================================

type MembershipStatus = "none" | "pending" | "approved" | "rejected";

interface CourseActionButtonsProps {
  isPlayer: boolean;
  membershipStatus: MembershipStatus;
  isClaimed: boolean;
  courseLeagueId: string | null;
  onBecomePlayer: () => void;
  onDeclareMembership: () => void;
  onLockerNote: () => void;
  onLeague: () => void;
}

// ============================================================================
// SINGLE ENGRAVED BUTTON
// ============================================================================

interface EngravedButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  gradientColors: readonly [string, string, string, string, string];
  borderColor: string;
  onPress: () => void;
  disabled?: boolean;
}

function EngravedButton({
  icon,
  label,
  gradientColors,
  borderColor,
  onPress,
  disabled = false,
}: EngravedButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={styles.buttonWrapper}
    >
      <LinearGradient
        colors={[...gradientColors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.button, { borderColor }]}
      >
        {/* Inset engraving border */}
        <View style={[styles.insetBorder, { borderColor: "rgba(0,0,0,0.18)" }]} />



        <Ionicons
          name={icon}
          size={13}
          color={gradientColors === GOLD_GRADIENT ? "#2C1600" : "#F4EED8"}
          style={styles.icon}
        />
        <Text
          style={[
            styles.label,
            { color: gradientColors === GOLD_GRADIENT ? "#2C1600" : "#F4EED8" },
          ]}
          numberOfLines={2}
        >
          {label}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CourseActionButtons({
  isPlayer,
  membershipStatus,
  isClaimed,
  courseLeagueId,
  onBecomePlayer,
  onDeclareMembership,
  onLockerNote,
  onLeague,
}: CourseActionButtonsProps) {

  // Player button — gold when active
  const playerGradient  = isPlayer ? GOLD_GRADIENT : GREY_GRADIENT;
  const playerBorder    = isPlayer ? BORDER_GOLD : BORDER_GREY;
  const playerIcon      = isPlayer
    ? ("checkmark-circle" as const)
    : ("golf" as const);
  const playerLabel     = isPlayer ? "Player ✓" : "Be a Player";

  // Membership button
  const membershipGradient =
    membershipStatus === "approved" ? GREEN_GRADIENT
    : membershipStatus === "pending" ? GREY_GRADIENT
    : GREY_GRADIENT;
  const membershipBorder =
    membershipStatus === "approved" ? BORDER_GREEN : BORDER_GREY;
  const membershipIcon =
    membershipStatus === "approved"
      ? ("checkmark-circle" as const)
      : membershipStatus === "pending"
      ? ("time-outline" as const)
      : membershipStatus === "rejected"
      ? ("alert-circle-outline" as const)
      : ("ribbon" as const);
  const membershipLabel =
    membershipStatus === "approved" ? "Member ✓"
    : membershipStatus === "pending" ? "Pending ⏳"
    : membershipStatus === "rejected" ? "Resubmit"
    : "Declare Member";

  // Locker note — green when claimed
  const noteGradient = isClaimed ? GREEN_GRADIENT : GREY_GRADIENT;
  const noteBorder   = isClaimed ? BORDER_GREEN : BORDER_GREY;

  // League — green when exists
  const leagueGradient = courseLeagueId ? GREEN_GRADIENT : GREY_GRADIENT;
  const leagueBorder   = courseLeagueId ? BORDER_GREEN : BORDER_GREY;

  return (
    <View style={styles.row}>
      <EngravedButton
        icon={playerIcon}
        label={playerLabel}
        gradientColors={playerGradient}
        borderColor={playerBorder}
        onPress={onBecomePlayer}
      />
      <EngravedButton
        icon={membershipIcon}
        label={membershipLabel}
        gradientColors={membershipGradient}
        borderColor={membershipBorder}
        onPress={onDeclareMembership}
      />
      <EngravedButton
        icon="mail"
        label="Locker Note"
        gradientColors={noteGradient}
        borderColor={noteBorder}
        onPress={onLockerNote}
        disabled={!isClaimed}
      />
      <EngravedButton
        icon="trophy"
        label="Tour"
        gradientColors={leagueGradient}
        borderColor={leagueBorder}
        onPress={onLeague}
        disabled={!courseLeagueId}
      />
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 6,
    gap: 6,
  },

  buttonWrapper: {
    flex: 1,
  },

  button: {
    borderRadius: 6,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
    gap: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 5,
  },

  insetBorder: {
    position: "absolute",
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    borderWidth: 1,
    borderRadius: 4,
  },

  icon: {
    flexShrink: 0,
  },

  label: {
    fontFamily: "Georgia",
    fontSize: 8,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.5,
    lineHeight: 11,
  },
});