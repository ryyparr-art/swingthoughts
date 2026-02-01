/**
 * TypeSelector Component
 * 
 * Grid of thought type cards for selecting post type
 */

import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface PostType {
  id: string;
  label: string;
}

interface TypeSelectorProps {
  availableTypes: PostType[];
  selectedType: string;
  onSelectType: (type: string) => void;
}

export default function TypeSelector({
  availableTypes,
  selectedType,
  onSelectType,
}: TypeSelectorProps) {
  const handleSelect = (typeId: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectType(typeId);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Thought Type</Text>
      <View style={styles.typeGrid}>
        {availableTypes.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[styles.typeCard, selectedType === type.id && styles.typeCardActive]}
            onPress={() => handleSelect(type.id)}
          >
            <Text
              style={[
                styles.typeCardText,
                selectedType === type.id && styles.typeCardTextActive,
              ]}
            >
              {type.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 14, fontWeight: "700", color: "#0D5C3A", marginBottom: 12 },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  typeCard: {
    flex: 1,
    minWidth: "45%",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FFF",
    borderWidth: 2,
    borderColor: "#E0E0E0",
    alignItems: "center",
  },
  typeCardActive: { backgroundColor: "#0D5C3A", borderColor: "#0D5C3A" },
  typeCardText: { fontSize: 14, fontWeight: "600", color: "#666" },
  typeCardTextActive: { color: "#FFF" },
});