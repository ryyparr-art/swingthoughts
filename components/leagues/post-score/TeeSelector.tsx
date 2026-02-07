/**
 * TeeSelector - Tee selection component after course is chosen
 */

import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

import { getTeeColor } from "./helpers";
import { styles } from "./styles";
import { TeeOption } from "./types";

interface TeeSelectorProps {
  courseName: string;
  tees: TeeOption[];
  handicapIndex?: number;
  onSelectTee: (tee: TeeOption) => void;
  onBack: () => void;
}

export default function TeeSelector({
  courseName,
  tees,
  handicapIndex,
  onSelectTee,
  onBack,
}: TeeSelectorProps) {
  const handleSelectTee = (tee: TeeOption) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelectTee(tee);
  };

  return (
    <ScrollView style={styles.content}>
      <View style={styles.teeSelector}>
        <Text style={styles.teeSelectorTitle}>{courseName}</Text>
        <Text style={styles.teeSelectorSubtitle}>Choose your tees</Text>

        {tees.map((tee, index) => (
          <TouchableOpacity
            key={`tee-${index}`}
            style={styles.teeOption}
            onPress={() => handleSelectTee(tee)}
          >
            <View style={styles.teeOptionLeft}>
              <View
                style={[
                  styles.teeColorDot,
                  { backgroundColor: getTeeColor(tee.tee_name) },
                ]}
              />
              <View>
                <Text style={styles.teeOptionName}>{tee.tee_name}</Text>
                <Text style={styles.teeOptionDetails}>
                  {tee.total_yards?.toLocaleString()} yds • Par {tee.par_total}
                </Text>
              </View>
            </View>
            <View style={styles.teeOptionRight}>
              <Text style={styles.teeOptionRating}>
                {tee.course_rating?.toFixed(1)} / {tee.slope_rating}
              </Text>
              <Text style={styles.teeOptionRatingLabel}>Rating / Slope</Text>
            </View>
          </TouchableOpacity>
        ))}

        {handicapIndex !== undefined && handicapIndex > 0 ? (
          <View style={styles.handicapInfo}>
            <Text style={styles.handicapInfoText}>
              Your Handicap Index: {handicapIndex.toFixed(1)}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.backToRecentButton} onPress={onBack}>
          <Text style={styles.backToRecentText}>← Change Course</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}