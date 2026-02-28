/**
 * ContentInput Component
 * 
 * Text input with inline @mention and #hashtag highlighting.
 * Uses an overlay that sits on top of the TextInput.
 * 
 * How it works:
 * - TextInput text is always visible (#333) for normal text
 * - When tags exist, an overlay renders on top with:
 *   - Normal text portions = #333 (matching TextInput)
 *   - Tagged text portions = colored + semibold (painted over the input text)
 * - Both layers use identical text metrics (fontSize, lineHeight, padding, fontFamily, fontWeight)
 *   to ensure perfect alignment and cursor positioning
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { AutocompleteItem, MAX_CHARACTERS } from "./types";

/* ================================================================ */
/* SHARED TEXT METRICS - must match exactly between overlay & input  */
/* ================================================================ */

const TEXT_STYLE = {
  fontSize: 16,
  lineHeight: 22,
  fontFamily: Platform.OS === "ios" ? "System" : undefined,
  fontWeight: "400" as const,
  paddingTop: 16,
  paddingBottom: 16,
  paddingLeft: 16,
  paddingRight: 16,
};

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

interface ContentInputProps {
  content: string;
  onContentChange: (text: string) => void;
  writable: boolean;
  textInputRef: React.RefObject<TextInput | null>;
  showAutocomplete: boolean;
  autocompleteResults: AutocompleteItem[];
  onSelectAutocomplete: (item: AutocompleteItem) => void;
  selectedMentions: string[];
  selectedTournaments: string[];
  selectedLeagues: string[];
}

export default function ContentInput({
  content,
  onContentChange,
  writable,
  textInputRef,
  showAutocomplete,
  autocompleteResults,
  onSelectAutocomplete,
  selectedMentions,
  selectedTournaments,
  selectedLeagues,
}: ContentInputProps) {

  const hasTags =
    selectedMentions.length > 0 ||
    selectedTournaments.length > 0 ||
    selectedLeagues.length > 0;

  /* ---------------------------------------------------------------- */
  /* STYLED OVERLAY                                                   */
  /* ---------------------------------------------------------------- */

  const renderOverlay = () => {
    if (!content || !hasTags) return null;

    // Build tagged items sorted longest-first to prevent partial matches
    const allTagged = [
      ...selectedMentions.map(m => ({ text: m, type: "mention" as const })),
      ...selectedTournaments.map(t => ({ text: t, type: "tournament" as const })),
      ...selectedLeagues.map(l => ({ text: l, type: "league" as const })),
    ].sort((a, b) => b.text.length - a.text.length);

    // Build regex
    const escaped = allTagged.map(t =>
      t.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    const regex = new RegExp(`(${escaped.join('|')})`, 'g');
    const parts = content.split(regex);

    // Fast lookup
    const typeMap = new Map<string, "mention" | "tournament" | "league">();
    allTagged.forEach(t => typeMap.set(t.text, t.type));

    return (
      <Text style={styles.overlayText}>
        {parts.map((part, i) => {
          const tagType = typeMap.get(part);
          if (tagType === "mention") {
            return <Text key={i} style={styles.tagMention}>{part}</Text>;
          }
          if (tagType === "tournament") {
            return <Text key={i} style={styles.tagTournament}>{part}</Text>;
          }
          if (tagType === "league") {
            return <Text key={i} style={styles.tagLeague}>{part}</Text>;
          }
          // Normal text: same color as TextInput
          return <Text key={i} style={styles.tagNone}>{part}</Text>;
        })}
      </Text>
    );
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>
        Use @ for partners/courses, # for tournaments/leagues
      </Text>

      <View style={styles.inputWrapper}>
        {/* Overlay: sits on top, tagged text colored, normal text matches input */}
        {hasTags && (
          <View style={styles.overlay} pointerEvents="none">
            {renderOverlay()}
          </View>
        )}

        {/* TextInput: transparent when overlay active so overlay handles rendering */}
        <TextInput
          ref={textInputRef}
          style={[
            styles.textInput,
            hasTags && { color: "transparent" },
          ]}
          placeholder="What clicked for you today?"
          placeholderTextColor="#999"
          multiline
          maxLength={MAX_CHARACTERS}
          value={content}
          onChangeText={onContentChange}
          editable={writable}
          autoCorrect={true}
          autoCapitalize="sentences"
          spellCheck={true}
          textAlignVertical="top"
          selectionColor="#0D5C3A"
          caretHidden={false}
        />
      </View>

      <Text style={styles.charCount}>
        {content.length}/{MAX_CHARACTERS}
      </Text>

      {/* Autocomplete Dropdown */}
      {showAutocomplete && autocompleteResults.length > 0 && (
        <AutocompleteDropdown
          results={autocompleteResults}
          onSelect={onSelectAutocomplete}
        />
      )}
    </View>
  );
}

/* ================================================================ */
/* AUTOCOMPLETE DROPDOWN                                             */
/* ================================================================ */

interface AutocompleteDropdownProps {
  results: AutocompleteItem[];
  onSelect: (item: AutocompleteItem) => void;
}

function AutocompleteDropdown({ results, onSelect }: AutocompleteDropdownProps) {
  const handleSelect = (item: AutocompleteItem) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(item);
  };

  const getIconName = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case "partner": return "person";
      case "course": return "golf";
      case "tournament": return "trophy";
      case "league": return "ribbon";
      default: return "help";
    }
  };

  const getTypeLabel = (type: string): string => {
    switch (type) {
      case "partner": return "Partner";
      case "course": return "Course";
      case "tournament": return "Tournament";
      case "league": return "League";
      default: return type;
    }
  };

  const getDisplayName = (item: AutocompleteItem): string => {
    if (item.type === "partner") return `@${item.displayName}`;
    if (item.type === "course") return `@${item.courseName}`;
    return `#${item.name}`;
  };

  return (
    <View style={styles.autocompleteContainer}>
      <ScrollView
        style={styles.autocompleteScroll}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {results.map((item, idx) => (
          <TouchableOpacity
            key={`${item.userId || item.courseId || item.id || item.leagueId}-${idx}`}
            style={styles.acItem}
            onPress={() => handleSelect(item)}
          >
            <View style={styles.acRow}>
              <View style={[
                styles.acIcon,
                item.type === "tournament" && styles.acIconTournament,
                item.type === "league" && styles.acIconLeague,
              ]}>
                <Ionicons name={getIconName(item.type)} size={16} color="#FFF" />
              </View>
              <View style={styles.acText}>
                <Text style={styles.acName}>{getDisplayName(item)}</Text>
                {item.location ? (
                  <Text style={styles.acLocation}>{item.location}</Text>
                ) : null}
                <Text style={styles.acType}>{getTypeLabel(item.type)}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 14, fontWeight: "700", color: "#0D5C3A", marginBottom: 12 },

  /* --- Input wrapper (holds both layers) --- */
  inputWrapper: {
    position: "relative",
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    minHeight: 120,
  },

  /* --- Overlay layer --- */
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: TEXT_STYLE.paddingTop,
    paddingBottom: TEXT_STYLE.paddingBottom,
    paddingLeft: TEXT_STYLE.paddingLeft,
    paddingRight: TEXT_STYLE.paddingRight,
    zIndex: 2,
  },
  overlayText: {
    fontSize: TEXT_STYLE.fontSize,
    lineHeight: TEXT_STYLE.lineHeight,
    fontWeight: TEXT_STYLE.fontWeight,
    fontFamily: TEXT_STYLE.fontFamily,
  },
  // Non-tagged text: matches TextInput color
  tagNone: {
    color: "#333",
  },
  // Tagged text: colored + semibold (600 not 700 to keep character widths
  // close to normal weight for accurate cursor alignment)
  tagMention: {
    fontWeight: "600",
    color: "#0D5C3A",
  },
  tagTournament: {
    fontWeight: "600",
    color: "#B8860B",
  },
  tagLeague: {
    fontWeight: "600",
    color: "#FF6B35",
  },

  /* --- TextInput layer --- */
  textInput: {
    paddingTop: TEXT_STYLE.paddingTop,
    paddingBottom: TEXT_STYLE.paddingBottom,
    paddingLeft: TEXT_STYLE.paddingLeft,
    paddingRight: TEXT_STYLE.paddingRight,
    fontSize: TEXT_STYLE.fontSize,
    lineHeight: TEXT_STYLE.lineHeight,
    fontWeight: TEXT_STYLE.fontWeight,
    fontFamily: TEXT_STYLE.fontFamily,
    minHeight: 120,
    textAlignVertical: "top",
    color: "#333",
    zIndex: 1,
  },

  /* --- Char count --- */
  charCount: { fontSize: 12, color: "#999", textAlign: "right", marginTop: 4 },

  /* --- Autocomplete --- */
  autocompleteContainer: {
    backgroundColor: "#FFF",
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    maxHeight: 250,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  autocompleteScroll: { maxHeight: 250 },
  acItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  acRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  acIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "#0D5C3A",
    alignItems: "center", justifyContent: "center",
  },
  acIconTournament: { backgroundColor: "#FFD700" },
  acIconLeague: { backgroundColor: "#FF6B35" },
  acText: { flex: 1 },
  acName: { fontSize: 14, fontWeight: "600", color: "#0D5C3A" },
  acLocation: { fontSize: 12, color: "#666", marginTop: 2 },
  acType: {
    fontSize: 10, color: "#999", marginTop: 2,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
});