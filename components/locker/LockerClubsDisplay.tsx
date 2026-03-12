/**
 * LockerClubsDisplay
 *
 * Expandable club rows for the locker — Section 6.
 * Logic unchanged from v2. Visual treatment updated to spec v3:
 * - Row bg: rgba(18,8,2,0.74)
 * - Border: 1px solid rgba(197,165,90,0.20)
 * - Category label: Georgia, 10px, #C5A55A
 * - Club value: Georgia, 13px, #F4EED8
 * - Chevron: #C5A55A at 40% opacity
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

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface LockerClubsDisplayProps {
  clubs: any;
  isOwnLocker: boolean;
}

interface WoodEntry  { label: string; name: string }
interface WedgeEntry { loft: string;  name: string }
interface IronEntry  { number: string; name: string }

function parseClubsForDisplay(clubs: any) {
  if (!clubs) return { woods: [], irons: null, wedges: [], putter: "", ball: "" };

  const woods: WoodEntry[] = [];
  if (clubs.driver) woods.push({ label: "Driver", name: clubs.driver });
  if (clubs.woods && typeof clubs.woods === "object") {
    ["3W", "5W", "7W", "9W"].forEach((w) => {
      if (clubs.woods[w]) woods.push({ label: w, name: clubs.woods[w] });
    });
  }

  let irons: { summary: string; details: IronEntry[] } | null = null;
  if (clubs.ironSet?.name) {
    const details: IronEntry[] = [];
    if (clubs.ironSet.range !== "mixed") {
      details.push({ number: clubs.ironSet.range, name: clubs.ironSet.name });
    }
    if (Array.isArray(clubs.individualIrons)) {
      clubs.individualIrons.forEach((iron: any) => {
        if (iron.name) details.push({ number: iron.number, name: iron.name });
      });
    }
    const summary =
      clubs.ironSet.range === "mixed"
        ? `Mixed Bag · ${details.length} clubs`
        : `${clubs.ironSet.name} (${clubs.ironSet.range})`;
    irons = { summary, details };
  } else if (clubs.irons && typeof clubs.irons === "string" && clubs.irons.trim()) {
    irons = { summary: clubs.irons, details: [] };
  }

  const wedges: WedgeEntry[] = [];
  if (Array.isArray(clubs.wedgesList) && clubs.wedgesList.length > 0) {
    clubs.wedgesList.forEach((w: any) => {
      if (w.name || w.loft) wedges.push({ loft: w.loft || "?", name: w.name || "" });
    });
  } else if (clubs.wedges && typeof clubs.wedges === "string" && clubs.wedges.trim()) {
    wedges.push({ loft: "", name: clubs.wedges });
  }

  return { woods, irons, wedges, putter: clubs.putter || "", ball: clubs.ball || "" };
}

export default function LockerClubsDisplay({ clubs, isOwnLocker }: LockerClubsDisplayProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const parsed = parseClubsForDisplay(clubs);

  const toggleSection = (section: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const hasAnyClubs =
    parsed.woods.length > 0 || parsed.irons !== null ||
    parsed.wedges.length > 0 || parsed.putter !== "" || parsed.ball !== "";

  if (!hasAnyClubs) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{isOwnLocker ? "MY CLUBS" : "THEIR CLUBS"}</Text>
        <Text style={styles.emptyText}>No clubs added yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{isOwnLocker ? "MY CLUBS" : "THEIR CLUBS"}</Text>

      {/* WOODS */}
      {parsed.woods.length > 0 && (
        <TouchableOpacity
          style={styles.row}
          onPress={() => parsed.woods.length > 1 && toggleSection("woods")}
          activeOpacity={parsed.woods.length > 1 ? 0.7 : 1}
        >
          <View style={styles.rowHeader}>
            <Text style={styles.categoryLabel}>WOODS</Text>
            {parsed.woods.length > 1 ? (
              <View style={styles.rowRight}>
                <Text style={styles.clubValue}>
                  {parsed.woods[0].name}{parsed.woods.length > 1 ? ` · +${parsed.woods.length - 1}` : ""}
                </Text>
                <Text style={styles.chevron}>{expandedSections.woods ? "▲" : "▼"}</Text>
              </View>
            ) : (
              <Text style={styles.clubValue}>{parsed.woods[0].name}</Text>
            )}
          </View>
          {expandedSections.woods && parsed.woods.length > 1 && (
            <View style={styles.expanded}>
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
          style={styles.row}
          onPress={() => parsed.irons!.details.length > 1 && toggleSection("irons")}
          activeOpacity={parsed.irons.details.length > 1 ? 0.7 : 1}
        >
          <View style={styles.rowHeader}>
            <Text style={styles.categoryLabel}>IRONS</Text>
            <View style={styles.rowRight}>
              <Text style={styles.clubValue}>{parsed.irons.summary}</Text>
              {parsed.irons.details.length > 1 && (
                <Text style={styles.chevron}>{expandedSections.irons ? "▲" : "▼"}</Text>
              )}
            </View>
          </View>
          {expandedSections.irons && parsed.irons.details.length > 1 && (
            <View style={styles.expanded}>
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
          style={styles.row}
          onPress={() => parsed.wedges.length > 1 && toggleSection("wedges")}
          activeOpacity={parsed.wedges.length > 1 ? 0.7 : 1}
        >
          <View style={styles.rowHeader}>
            <Text style={styles.categoryLabel}>WEDGES</Text>
            <View style={styles.rowRight}>
              <Text style={styles.clubValue}>
                {parsed.wedges[0].loft
                  ? parsed.wedges.map((w) => `${w.loft}°`).join(" · ")
                  : parsed.wedges[0].name}
              </Text>
              {parsed.wedges.length > 1 && parsed.wedges[0].loft !== "" && (
                <Text style={styles.chevron}>{expandedSections.wedges ? "▲" : "▼"}</Text>
              )}
            </View>
          </View>
          {expandedSections.wedges && parsed.wedges.length > 1 && parsed.wedges[0].loft !== "" && (
            <View style={styles.expanded}>
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

      {/* PUTTER */}
      {parsed.putter !== "" && (
        <View style={styles.row}>
          <View style={styles.rowHeader}>
            <Text style={styles.categoryLabel}>PUTTER</Text>
            <Text style={styles.clubValue}>{parsed.putter}</Text>
          </View>
        </View>
      )}

      {/* BALL */}
      {parsed.ball !== "" && (
        <View style={styles.row}>
          <View style={styles.rowHeader}>
            <Text style={styles.categoryLabel}>BALL</Text>
            <Text style={styles.clubValue}>{parsed.ball}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: "100%",
  },
  sectionTitle: {
    fontFamily: "Georgia",
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(244,238,216,0.73)",
    letterSpacing: 2.5,
    marginBottom: 10,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  emptyText: {
    fontFamily: "Caveat_400Regular",
    fontSize: 15,
    color: "rgba(255,255,255,0.5)",
    fontStyle: "italic",
    textAlign: "center",
  },

  // Row
  row: {
    backgroundColor: "rgba(18,8,2,0.74)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(197,165,90,0.20)",
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    justifyContent: "flex-end",
  },
  categoryLabel: {
    fontFamily: "Georgia",
    fontSize: 10,
    fontWeight: "700",
    color: "#C5A55A",
    letterSpacing: 2,
    minWidth: 60,
  },
  clubValue: {
    fontFamily: "Georgia",
    fontSize: 13,
    color: "#F4EED8",
    textAlign: "right",
    flexShrink: 1,
  },
  chevron: {
    color: "rgba(197,165,90,0.4)",
    fontSize: 11,
  },

  // Expanded
  expanded: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(197,165,90,0.15)",
  },
  expandedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  expandedLabel: {
    fontFamily: "Georgia",
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(197,165,90,0.7)",
    letterSpacing: 0.5,
    minWidth: 50,
  },
  expandedValue: {
    fontFamily: "Georgia",
    fontSize: 13,
    color: "#F4EED8",
    flex: 1,
    textAlign: "right",
  },
});
