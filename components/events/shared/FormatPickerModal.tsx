/**
 * FormatPickerModal — Modal format selector for Invitationals
 *
 * Reuses the card-based format UI from the outing FormatPicker
 * but without the Compete section (Leagues/Cup/Tours) and
 * without team assignment (handled separately).
 *
 * Opens as a full-screen modal from RoundEditor.
 *
 * File: components/events/shared/FormatPickerModal.tsx
 */

import {
    GAME_FORMATS,
    type GameFormatDefinition,
} from "@/constants/gameFormats";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
    Image,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const WALNUT = "#4A3628";
const CREAM = "#F4EED8";
const GREEN = "#0D5C3A";
const GOLD = "#C5A55A";

// ============================================================================
// HELPERS
// ============================================================================

function getCategoryLabel(cat: string): string {
  switch (cat) {
    case "individual": return "Individual";
    case "two_player_team": return "Team — Pairs";
    case "four_player_team": return "Team — Foursome";
    default: return cat;
  }
}

function getCategoryIcon(cat: string): string {
  switch (cat) {
    case "individual": return "person-outline";
    case "two_player_team": return "people-outline";
    case "four_player_team": return "people-circle-outline";
    default: return "golf-outline";
  }
}

function getScoringBadge(method: string): { label: string; color: string } {
  switch (method) {
    case "total_strokes": return { label: "Strokes", color: GREEN };
    case "points": return { label: "Points", color: "#7B61FF" };
    case "holes_won": return { label: "Holes", color: "#C5A55A" };
    default: return { label: method, color: "#666" };
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface FormatPickerModalProps {
  visible: boolean;
  currentFormatId: string;
  onSelect: (formatId: string) => void;
  onClose: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function FormatPickerModal({
  visible,
  currentFormatId,
  onSelect,
  onClose,
}: FormatPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedFormatId, setSelectedFormatId] = useState(currentFormatId);

  // Reset selection when modal opens
  React.useEffect(() => {
    if (visible) setSelectedFormatId(currentFormatId);
  }, [visible, currentFormatId]);

  // All formats available — no player count filter for invitational setup
  const groupedFormats = useMemo(() => {
    const groups: Record<string, GameFormatDefinition[]> = {};
    for (const fmt of GAME_FORMATS) {
      if (!groups[fmt.category]) groups[fmt.category] = [];
      groups[fmt.category].push(fmt);
    }
    return groups;
  }, []);

  const selectedFormat = useMemo(
    () => GAME_FORMATS.find((f) => f.id === selectedFormatId) || GAME_FORMATS[0],
    [selectedFormatId]
  );

  const handleSelectFormat = (fmt: GameFormatDefinition) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedFormatId(fmt.id);
  };

  const handleConfirm = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect(selectedFormatId);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[s.container, Platform.OS === "android" && { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => { soundPlayer.play("click"); onClose(); }}
            style={s.headerCloseBtn}
          >
            <Image
              source={require("@/assets/icons/Close.png")}
              style={s.closeIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Choose Format</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Format Cards */}
        <ScrollView
          style={s.scrollView}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {Object.entries(groupedFormats).map(([category, formats]) => (
            <View key={category} style={s.categorySection}>
              <View style={s.categoryHeader}>
                <Ionicons name={getCategoryIcon(category) as any} size={18} color={GOLD} />
                <Text style={s.categoryLabel}>{getCategoryLabel(category)}</Text>
              </View>

              <View style={s.cardGrid}>
                {formats.map((fmt) => {
                  const isSelected = selectedFormatId === fmt.id;
                  const badge = getScoringBadge(fmt.scoringMethod);
                  return (
                    <TouchableOpacity
                      key={fmt.id}
                      style={[s.formatCard, isSelected && s.formatCardSelected]}
                      onPress={() => handleSelectFormat(fmt)}
                      activeOpacity={0.7}
                    >
                      <View style={[s.formatIconWrap, isSelected && s.formatIconWrapSelected]}>
                        <Ionicons name={fmt.icon as any} size={24} color={isSelected ? "#FFF" : WALNUT} />
                      </View>
                      <Text style={[s.formatName, isSelected && s.formatNameSelected]} numberOfLines={2}>
                        {fmt.name}
                      </Text>
                      <Text style={s.formatDesc} numberOfLines={2}>
                        {fmt.description}
                      </Text>
                      <View style={[s.scoringBadge, { backgroundColor: badge.color + "18" }]}>
                        <Text style={[s.scoringBadgeText, { color: badge.color }]}>{badge.label}</Text>
                      </View>
                      {isSelected && (
                        <View style={s.selectedCheck}>
                          <Ionicons name="checkmark-circle" size={22} color={GREEN} />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          {/* Selected format detail */}
          {selectedFormat && (
            <View style={s.detailCard}>
              <View style={s.detailHeader}>
                <Ionicons name={selectedFormat.icon as any} size={20} color={GREEN} />
                <Text style={s.detailTitle}>{selectedFormat.name}</Text>
              </View>
              <Text style={s.detailRules}>{selectedFormat.rulesSummary}</Text>
              <View style={s.detailChips}>
                {selectedFormat.supports9Hole && (
                  <View style={s.chip}><Text style={s.chipText}>9-Hole ✓</Text></View>
                )}
                {selectedFormat.supports18Hole && (
                  <View style={s.chip}><Text style={s.chipText}>18-Hole ✓</Text></View>
                )}
                {selectedFormat.holeByHole && (
                  <View style={s.chip}><Text style={s.chipText}>Hole-by-Hole</Text></View>
                )}
                {selectedFormat.handicapMode !== "scratch" && (
                  <View style={s.chip}>
                    <Text style={s.chipText}>Handicap: {selectedFormat.handicapMode}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom Bar */}
        <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm} activeOpacity={0.8}>
            <Text style={s.confirmBtnText}>Select Format</Text>
            <Ionicons name="checkmark" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#0D5C3A",
  },
  headerCloseBtn: { width: 40, alignItems: "flex-start" },
  closeIcon: { width: 28, height: 28, tintColor: "#FFF" },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
    textAlign: "center",
  },

  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { padding: 16 },

  // Category Sections
  categorySection: { marginBottom: 20 },
  categoryHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  categoryLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: WALNUT,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  // Format Cards
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  formatCard: {
    width: "48%" as any,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    minHeight: 140,
  },
  formatCardSelected: { borderColor: GREEN, backgroundColor: "#F0FFF4" },
  formatIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: CREAM,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  formatIconWrapSelected: { backgroundColor: GREEN },
  formatName: {
    fontSize: 14,
    fontWeight: "800",
    color: WALNUT,
    marginBottom: 4,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  formatNameSelected: { color: GREEN },
  formatDesc: { fontSize: 11, color: "#888", lineHeight: 15, marginBottom: 8 },
  scoringBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  scoringBadgeText: { fontSize: 10, fontWeight: "700" },
  selectedCheck: { position: "absolute", top: 10, right: 10 },

  // Detail Card
  detailCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderLeftWidth: 4,
    borderLeftColor: GREEN,
  },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  detailTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: WALNUT,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
  detailRules: { fontSize: 13, color: "#555", lineHeight: 19, marginBottom: 10 },
  detailChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { backgroundColor: CREAM, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  chipText: { fontSize: 11, fontWeight: "700", color: WALNUT },

  // Bottom Bar
  bottomBar: {
    paddingTop: 12,
    paddingHorizontal: 16,
    backgroundColor: CREAM,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  confirmBtn: {
    backgroundColor: GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  confirmBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
});