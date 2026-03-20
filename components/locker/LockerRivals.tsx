/**
 * LockerRivals — Section 2
 *
 * Rivals displayed as cream paper notecards pinned to the upper locker panel.
 * Auto-calculated via useRivalries — no Add Rival card.
 * Tapping a card opens RivalryDetailModal (unchanged).
 */

import RivalryDetailModal from "@/components/locker/RivalryDetailModal";
import { RivalRole, useRivalries } from "@/hooks/useRivalries";
import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import PushPin, { PIN_ORDER } from "./PushPin";
import RivalNotecard, { seededRotation } from "./RivalNotecard";

interface Props {
  userId: string;
}

export default function LockerRivals({ userId }: Props) {
  const { roles, loading } = useRivalries(userId);
  const [selectedRole, setSelectedRole] = useState<RivalRole | null>(null);

  if (loading) return null;

  const handlePress = (role: RivalRole) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedRole(role);
  };

  // Empty state — single notecard matching RivalNotecard square dimensions
  if (roles.length === 0) {
    return (
      <>
        <View style={styles.emptyWrapper}>
          <PushPin color="gold" size={22} />
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No rivals yet</Text>
            <Text style={styles.emptySub}>Play 3+ rounds{"\n"}with someone</Text>
          </View>
        </View>

        <RivalryDetailModal
          visible={!!selectedRole}
          role={selectedRole}
          onClose={() => setSelectedRole(null)}
        />
      </>
    );
  }

  return (
    <>
      <View style={styles.cardsRow}>
        {roles.map((role, i) => {
          const rotation = seededRotation(role.rivalryDoc?.id ?? role.rival.userId ?? String(i));
          const pinColor = PIN_ORDER[i % PIN_ORDER.length];
          return (
            <TouchableOpacity
              key={role.type}
              onPress={() => handlePress(role)}
              activeOpacity={0.85}
            >
              <RivalNotecard
                role={role}
                rotation={rotation}
                pinColor={pinColor}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      <RivalryDetailModal
        visible={!!selectedRole}
        role={selectedRole}
        onClose={() => setSelectedRole(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  cardsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingTop: 6,
  },

  // Empty state — matches RivalNotecard square (97×95)
  emptyWrapper: {
    position: "relative",
    alignItems: "center",
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 4,
    overflow: "visible",
  },
  emptyCard: {
    width: 97,
    height: 95,
    backgroundColor: "#EDE0B5",
    borderRadius: 5,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 7,
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(160,130,80,0.2)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  emptyTitle: {
    fontFamily: "Caveat_700Bold",
    fontSize: 14,
    color: "#4A3628",
    textAlign: "center",
  },
  emptySub: {
    fontFamily: "Caveat_400Regular",
    fontSize: 11,
    color: "#9B8B6A",
    textAlign: "center",
    lineHeight: 17,
  },
});