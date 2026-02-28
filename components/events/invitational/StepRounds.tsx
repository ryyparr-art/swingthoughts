/**
 * StepRounds — Wizard Step 2
 *
 * Add one or more rounds to the invitational.
 * Each round uses the shared RoundEditor component.
 * Minimum 1 round required to proceed.
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import RoundEditor, {
    RoundData,
    createEmptyRound,
} from "../shared/RoundEditor";

interface StepRoundsProps {
  rounds: RoundData[];
  onChange: (rounds: RoundData[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StepRounds({
  rounds,
  onChange,
  onNext,
  onBack,
}: StepRoundsProps) {
  const handleRoundChange = (index: number, updated: RoundData) => {
    const newRounds = [...rounds];
    newRounds[index] = updated;
    onChange(newRounds);
  };

  const handleAddRound = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onChange([...rounds, createEmptyRound()]);
  };

  const handleRemoveRound = (index: number) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newRounds = rounds.filter((_, i) => i !== index);
    onChange(newRounds);
  };

  // All rounds must have a course selected
  const allRoundsValid = rounds.length > 0 && rounds.every((r) => r.course !== null);

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={18} color="#0D5C3A" />
          <Text style={styles.infoText}>
            Add at least one round. You can add more rounds later from the event dashboard.
          </Text>
        </View>

        {/* Round editors */}
        {rounds.map((round, index) => (
          <RoundEditor
            key={round.id}
            round={round}
            roundNumber={index + 1}
            onChange={(updated) => handleRoundChange(index, updated)}
            onRemove={() => handleRemoveRound(index)}
            canRemove={rounds.length > 1}
          />
        ))}

        {/* Add Round button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddRound}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={20} color="#0D5C3A" />
          <Text style={styles.addButtonText}>Add Another Round</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onBack();
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={18} color="#0D5C3A" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.nextButton, !allRoundsValid && styles.nextButtonDisabled]}
          onPress={() => {
            if (!allRoundsValid) return;
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onNext();
          }}
          disabled={!allRoundsValid}
          activeOpacity={0.8}
        >
          <Text style={styles.nextButtonText}>Next: Invite Players</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 16, gap: 16 },

  // Info banner
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(13, 92, 58, 0.06)",
    borderRadius: 10,
    padding: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#555",
    lineHeight: 18,
  },

  // Add button
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(13, 92, 58, 0.2)",
    borderStyle: "dashed",
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    backgroundColor: "#F4EED8",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#0D5C3A",
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  nextButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    borderRadius: 14,
    paddingVertical: 16,
  },
  nextButtonDisabled: {
    opacity: 0.4,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
});