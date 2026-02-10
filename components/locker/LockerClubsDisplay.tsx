/**
 * LockerClubsDisplay
 * 
 * Expandable club cards for the locker view.
 * Reads both legacy (simple strings) and new structured format.
 * 
 * - Only shows sections that have data (no "Not added" clutter)
 * - Compact cards with tap-to-expand for Woods, Irons, Wedges
 * - Putter & Ball are always single-line (no expand)
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface LockerClubsDisplayProps {
  clubs: any; // Raw clubs data from Firestore (could be legacy or new)
  isOwnLocker: boolean;
}

interface WoodEntry { label: string; name: string }
interface WedgeEntry { loft: string; name: string }
interface IronEntry { number: string; name: string }

/* ================================================================ */
/* DATA PARSING                                                     */
/* ================================================================ */

function parseClubsForDisplay(clubs: any) {
  if (!clubs) return { woods: [], irons: null, wedges: [], putter: "", ball: "" };

  // --- WOODS ---
  const woods: WoodEntry[] = [];
  if (clubs.driver) {
    woods.push({ label: "Driver", name: clubs.driver });
  }
  // New structured woods
  if (clubs.woods && typeof clubs.woods === "object") {
    const woodOrder = ["3W", "5W", "7W", "9W"];
    woodOrder.forEach((w) => {
      if (clubs.woods[w]) {
        woods.push({ label: w, name: clubs.woods[w] });
      }
    });
  }

  // --- IRONS ---
  let irons: { summary: string; details: IronEntry[] } | null = null;

  if (clubs.ironSet && clubs.ironSet.name) {
    // New structured format
    const details: IronEntry[] = [];
    if (clubs.ironSet.range !== "mixed") {
      details.push({ number: clubs.ironSet.range, name: clubs.ironSet.name });
    }
    // Individual irons
    if (Array.isArray(clubs.individualIrons)) {
      clubs.individualIrons.forEach((iron: any) => {
        if (iron.name) {
          details.push({ number: iron.number, name: iron.name });
        }
      });
    }
    const summary =
      clubs.ironSet.range === "mixed"
        ? `Mixed Bag · ${details.length} clubs`
        : `${clubs.ironSet.name} (${clubs.ironSet.range})`;
    irons = { summary, details };
  } else if (clubs.irons && typeof clubs.irons === "string" && clubs.irons.trim()) {
    // Legacy string format
    irons = { summary: clubs.irons, details: [] };
  }

  // --- WEDGES ---
  const wedges: WedgeEntry[] = [];

  if (Array.isArray(clubs.wedgesList) && clubs.wedgesList.length > 0) {
    // New structured format
    clubs.wedgesList.forEach((w: any) => {
      if (w.name || w.loft) {
        wedges.push({ loft: w.loft || "?", name: w.name || "" });
      }
    });
  } else if (clubs.wedges && typeof clubs.wedges === "string" && clubs.wedges.trim()) {
    // Legacy string: store as single entry with no loft
    wedges.push({ loft: "", name: clubs.wedges });
  }

  // --- PUTTER & BALL ---
  const putter = clubs.putter || "";
  const ball = clubs.ball || "";

  return { woods, irons, wedges, putter, ball };
}

/* ================================================================ */
/* COMPONENT                                                        */
/* ================================================================ */

export default function LockerClubsDisplay({ clubs, isOwnLocker }: LockerClubsDisplayProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const parsed = parseClubsForDisplay(clubs);

  const toggleSection = (section: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const hasAnyClubs =
    parsed.woods.length > 0 ||
    parsed.irons !== null ||
    parsed.wedges.length > 0 ||
    parsed.putter !== "" ||
    parsed.ball !== "";

  if (!hasAnyClubs) {
    return (
      <View style={styles.clubsSection}>
        <Text style={styles.sectionTitle}>
          {isOwnLocker ? "My Clubs" : "Their Clubs"}
        </Text>
        <Text style={styles.emptyText}>No clubs added yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.clubsSection}>
      <Text style={styles.sectionTitle}>
        {isOwnLocker ? "My Clubs" : "Their Clubs"}
      </Text>

      {/* WOODS */}
      {parsed.woods.length > 0 && (
        <TouchableOpacity
          style={styles.clubCard}
          onPress={() => parsed.woods.length > 1 && toggleSection("woods")}
          activeOpacity={parsed.woods.length > 1 ? 0.7 : 1}
        >
          <View style={styles.clubCardHeader}>
            <Text style={styles.clubLabel}>WOODS</Text>
            {parsed.woods.length > 1 && (
              <View style={styles.clubCardRight}>
                <Text style={styles.clubSummary}>
                  {parsed.woods[0].name}
                  {parsed.woods.length > 1 && ` · +${parsed.woods.length - 1} more`}
                </Text>
                <Ionicons
                  name={expandedSections.woods ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="rgba(255,255,255,0.6)"
                />
              </View>
            )}
            {parsed.woods.length === 1 && (
              <Text style={styles.clubValue}>{parsed.woods[0].name}</Text>
            )}
          </View>

          {expandedSections.woods && parsed.woods.length > 1 && (
            <View style={styles.expandedContent}>
              {parsed.woods.map((wood, i) => (
                <View key={i} style={styles.expandedRow}>
                  <Text style={styles.expandedLabel}>{wood.label}</Text>
                  <Text style={styles.expandedValue}>{wood.name}</Text>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* IRONS */}
      {parsed.irons && (
        <TouchableOpacity
          style={styles.clubCard}
          onPress={() => parsed.irons!.details.length > 1 && toggleSection("irons")}
          activeOpacity={parsed.irons.details.length > 1 ? 0.7 : 1}
        >
          <View style={styles.clubCardHeader}>
            <Text style={styles.clubLabel}>IRONS</Text>
            <View style={styles.clubCardRight}>
              <Text style={styles.clubSummary}>{parsed.irons.summary}</Text>
              {parsed.irons.details.length > 1 && (
                <Ionicons
                  name={expandedSections.irons ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="rgba(255,255,255,0.6)"
                />
              )}
            </View>
          </View>

          {expandedSections.irons && parsed.irons.details.length > 1 && (
            <View style={styles.expandedContent}>
              {parsed.irons.details.map((iron, i) => (
                <View key={i} style={styles.expandedRow}>
                  <Text style={styles.expandedLabel}>{iron.number}</Text>
                  <Text style={styles.expandedValue}>{iron.name}</Text>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* WEDGES */}
      {parsed.wedges.length > 0 && (
        <TouchableOpacity
          style={styles.clubCard}
          onPress={() => parsed.wedges.length > 1 && toggleSection("wedges")}
          activeOpacity={parsed.wedges.length > 1 ? 0.7 : 1}
        >
          <View style={styles.clubCardHeader}>
            <Text style={styles.clubLabel}>WEDGES</Text>
            <View style={styles.clubCardRight}>
              <Text style={styles.clubSummary}>
                {parsed.wedges[0].loft
                  ? parsed.wedges.map((w) => `${w.loft}°`).join(" · ")
                  : parsed.wedges[0].name}
              </Text>
              {parsed.wedges.length > 1 && parsed.wedges[0].loft !== "" && (
                <Ionicons
                  name={expandedSections.wedges ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="rgba(255,255,255,0.6)"
                />
              )}
            </View>
          </View>

          {expandedSections.wedges && parsed.wedges.length > 1 && parsed.wedges[0].loft !== "" && (
            <View style={styles.expandedContent}>
              {parsed.wedges.map((wedge, i) => (
                <View key={i} style={styles.expandedRow}>
                  <Text style={styles.expandedLabel}>{wedge.loft}°</Text>
                  <Text style={styles.expandedValue}>{wedge.name}</Text>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* PUTTER - simple, no expand */}
      {parsed.putter !== "" && (
        <View style={styles.clubCard}>
          <View style={styles.clubCardHeader}>
            <Text style={styles.clubLabel}>PUTTER</Text>
            <Text style={styles.clubValue}>{parsed.putter}</Text>
          </View>
        </View>
      )}

      {/* BALL - simple, no expand */}
      {parsed.ball !== "" && (
        <View style={styles.clubCard}>
          <View style={styles.clubCardHeader}>
            <Text style={styles.clubLabel}>BALL</Text>
            <Text style={styles.clubValue}>{parsed.ball}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  clubsSection: {
    width: "100%",
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "white",
    marginBottom: 14,
  },
  emptyText: {
    color: "rgba(255,255,255,0.6)",
    fontStyle: "italic",
    textAlign: "center",
  },

  // Card
  clubCard: {
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  clubCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  clubCardRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    justifyContent: "flex-end",
  },
  clubLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "rgba(255,255,255,0.9)",
    letterSpacing: 1.5,
    minWidth: 70,
  },
  clubSummary: {
    fontSize: 15,
    fontWeight: "700",
    color: "white",
    textAlign: "right",
    flexShrink: 1,
  },
  clubValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "white",
    flex: 1,
    textAlign: "right",
  },

  // Expanded content
  expandedContent: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.15)",
  },
  expandedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  expandedLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 0.5,
    minWidth: 50,
  },
  expandedValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "white",
    flex: 1,
    textAlign: "right",
  },
});