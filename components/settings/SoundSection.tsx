/**
 * SoundSection
 * Sound effects on/off toggle
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { settingsStyles as sharedStyles } from "./styles";

interface Props {
  soundsEnabled: boolean;
  onToggle: () => void;
}

export default function SoundSection({ soundsEnabled, onToggle }: Props) {
  return (
    <>
      <Text style={sharedStyles.sectionTitle}>SOUND SETTINGS</Text>

      <View style={sharedStyles.settingRow}>
        <View style={sharedStyles.settingLeft}>
          <Ionicons
            name={soundsEnabled ? "volume-high" : "volume-mute"}
            size={20}
            color="#0D5C3A"
          />
          <View>
            <Text style={sharedStyles.settingLabel}>Sound Effects</Text>
            <Text style={sharedStyles.settingSubtext}>
              {soundsEnabled ? "Sounds are enabled" : "Sounds are muted"}
            </Text>
          </View>
        </View>
        <View style={sharedStyles.toggleContainer}>
          <TouchableOpacity
            style={[
              sharedStyles.toggleOption,
              soundsEnabled && sharedStyles.toggleOptionActive,
            ]}
            onPress={onToggle}
          >
            <Text
              style={[
                sharedStyles.toggleText,
                soundsEnabled && sharedStyles.toggleTextActive,
              ]}
            >
              On
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              sharedStyles.toggleOption,
              !soundsEnabled && sharedStyles.toggleOptionActive,
            ]}
            onPress={onToggle}
          >
            <Text
              style={[
                sharedStyles.toggleText,
                !soundsEnabled && sharedStyles.toggleTextActive,
              ]}
            >
              Off
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}