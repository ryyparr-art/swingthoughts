/**
 * ContentInput Component
 * 
 * Text input with autocomplete for @mentions and #hashtags
 * Shows tagged partners, courses, tournaments, and leagues separately
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import { AutocompleteItem, MAX_CHARACTERS } from "./types";

interface ContentInputProps {
  content: string;
  onContentChange: (text: string) => void;
  writable: boolean;
  textInputRef: React.RefObject<TextInput | null>;
  // Autocomplete
  showAutocomplete: boolean;
  autocompleteResults: AutocompleteItem[];
  onSelectAutocomplete: (item: AutocompleteItem) => void;
  // Tagged items
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
  
  // Render content with styled mentions and hashtags
  const renderStyledContent = () => {
    if (!content) return null;
    
    // Build patterns from selected items
    const mentionPatterns = selectedMentions
      .map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    
    const tournamentPatterns = selectedTournaments
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    
    const leaguePatterns = selectedLeagues
      .map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    
    const allPatterns = [...mentionPatterns, ...tournamentPatterns, ...leaguePatterns]
      .sort((a, b) => b.length - a.length);
    
    if (allPatterns.length === 0) {
      return <Text style={styles.overlayText}>{content}</Text>;
    }
    
    const combinedRegex = new RegExp(`(${allPatterns.join('|')})`, 'g');
    const parts = content.split(combinedRegex);
    
    return (
      <Text style={styles.overlayText}>
        {parts.map((part, index) => {
          if (selectedMentions.includes(part)) {
            return <Text key={index} style={styles.styledMention}>{part}</Text>;
          }
          if (selectedTournaments.includes(part)) {
            return <Text key={index} style={styles.styledTournament}>{part}</Text>;
          }
          if (selectedLeagues.includes(part)) {
            return <Text key={index} style={styles.styledLeague}>{part}</Text>;
          }
          return <Text key={index}>{part}</Text>;
        })}
      </Text>
    );
  };
  
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>
        Use @ for partners/courses, # for tournaments/leagues
      </Text>
      
      {/* Rich Text Input Container */}
      <View style={styles.textInputContainer}>
        {/* Styled overlay - shows colored/bold text */}
        <View style={styles.textOverlay} pointerEvents="none">
          {renderStyledContent()}
        </View>
        
        {/* Actual TextInput - transparent text */}
        <TextInput
          ref={textInputRef}
          style={[
            styles.textInput,
            (selectedMentions.length > 0 || selectedTournaments.length > 0 || selectedLeagues.length > 0) 
              ? styles.textInputTransparent 
              : null
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
        />
      </View>

      {/* Tagged Partners/Courses */}
      {selectedMentions.length > 0 && (
        <View style={styles.mentionsPreview}>
          <Text style={styles.mentionsLabel}>Tagged:</Text>
          <View style={styles.mentionChips}>
            {selectedMentions.map((mention, idx) => (
              <View key={idx} style={styles.mentionChip}>
                <Text style={styles.mentionChipText}>{mention}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Tagged Tournaments */}
      {selectedTournaments.length > 0 && (
        <View style={styles.tournamentsPreview}>
          <Text style={styles.tournamentsLabel}>Tournaments:</Text>
          <View style={styles.mentionChips}>
            {selectedTournaments.map((tournament, idx) => (
              <View key={idx} style={styles.tournamentChip}>
                <Text style={styles.tournamentChipText}>{tournament}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Tagged Leagues */}
      {selectedLeagues.length > 0 && (
        <View style={styles.leaguesPreview}>
          <Text style={styles.leaguesLabel}>Leagues:</Text>
          <View style={styles.mentionChips}>
            {selectedLeagues.map((league, idx) => (
              <View key={idx} style={styles.leagueChip}>
                <Text style={styles.leagueChipText}>{league}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

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
      case "partner":
        return "person";
      case "course":
        return "golf";
      case "tournament":
        return "trophy";
      case "league":
        return "ribbon";
      default:
        return "help";
    }
  };

  const getTypeLabel = (type: string): string => {
    switch (type) {
      case "partner":
        return "Partner";
      case "course":
        return "Course";
      case "tournament":
        return "Tournament";
      case "league":
        return "League";
      default:
        return type;
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
        style={styles.autocompleteScrollView}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {results.map((item, idx) => (
          <TouchableOpacity
            key={`${item.userId || item.courseId || item.id || item.leagueId}-${idx}`}
            style={styles.autocompleteItem}
            onPress={() => handleSelect(item)}
          >
            <View style={styles.autocompleteItemContent}>
              <View
                style={[
                  styles.autocompleteIcon,
                  item.type === "tournament" && styles.tournamentIcon,
                  item.type === "league" && styles.leagueIcon,
                ]}
              >
                <Ionicons name={getIconName(item.type)} size={16} color="#FFF" />
              </View>

              <View style={styles.autocompleteTextContainer}>
                <Text style={styles.autocompleteName}>{getDisplayName(item)}</Text>
                {item.location && (
                  <Text style={styles.autocompleteLocation}>{item.location}</Text>
                )}
                <Text style={styles.autocompleteType}>{getTypeLabel(item.type)}</Text>
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

  // Rich Text Input Container
  textInputContainer: {
    position: "relative",
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    minHeight: 120,
  },
  
  // Styled overlay - positioned exactly over the TextInput
  textOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    padding: 16,
    zIndex: 1,
  },
  overlayText: {
    fontSize: 16,
    lineHeight: 22,
    color: "#333",
  },
  
  // Styled mentions in overlay
  styledMention: {
    fontWeight: "700",
    color: "#0D5C3A",
  },
  styledTournament: {
    fontWeight: "700",
    color: "#B8860B",
  },
  styledLeague: {
    fontWeight: "700",
    color: "#FF6B35",
  },

  // Text Input - transparent when overlay is active
  textInput: {
    padding: 16,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: "top",
    lineHeight: 22,
    color: "#333",
  },
  textInputTransparent: {
    color: "transparent",
  },

  // Tagged Items - Partners/Courses
  mentionsPreview: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "rgba(13, 92, 58, 0.05)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(13, 92, 58, 0.2)",
  },
  mentionsLabel: { fontSize: 12, fontWeight: "600", color: "#0D5C3A", marginBottom: 6 },
  mentionChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  mentionChip: {
    backgroundColor: "#0D5C3A",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  mentionChipText: { color: "#FFF", fontSize: 12, fontWeight: "600" },

  // Tagged Items - Tournaments
  tournamentsPreview: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  tournamentsLabel: { fontSize: 12, fontWeight: "600", color: "#B8860B", marginBottom: 6 },
  tournamentChip: {
    backgroundColor: "#FFD700",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  tournamentChipText: { color: "#0D5C3A", fontSize: 12, fontWeight: "700" },

  // Tagged Items - Leagues
  leaguesPreview: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "rgba(255, 107, 53, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 53, 0.3)",
  },
  leaguesLabel: { fontSize: 12, fontWeight: "600", color: "#FF6B35", marginBottom: 6 },
  leagueChip: {
    backgroundColor: "#FF6B35",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  leagueChipText: { color: "#FFF", fontSize: 12, fontWeight: "700" },

  // Character Count
  charCount: { fontSize: 12, color: "#999", textAlign: "right", marginTop: 4 },

  // Autocomplete
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
  autocompleteScrollView: { maxHeight: 250 },
  autocompleteItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  autocompleteItemContent: { flexDirection: "row", alignItems: "center", gap: 12 },
  autocompleteIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  tournamentIcon: { backgroundColor: "#FFD700" },
  leagueIcon: { backgroundColor: "#FF6B35" },
  autocompleteTextContainer: { flex: 1 },
  autocompleteName: { fontSize: 14, fontWeight: "600", color: "#0D5C3A" },
  autocompleteLocation: { fontSize: 12, color: "#666", marginTop: 2 },
  autocompleteType: {
    fontSize: 10,
    color: "#999",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});