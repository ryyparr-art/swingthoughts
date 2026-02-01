/**
 * Step 1: Basic Info
 * - League name (with availability check)
 * - Description
 * - Region (pre-filled)
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";

import { styles } from "./styles";
import { LeagueFormData } from "./types";

interface Step1Props {
  formData: LeagueFormData;
  updateFormData: (updates: Partial<LeagueFormData>) => void;
  checkingName: boolean;
  nameAvailable: boolean | null;
  setNameAvailable: (value: boolean | null) => void;
}

export default function Step1BasicInfo({
  formData,
  updateFormData,
  checkingName,
  nameAvailable,
  setNameAvailable,
}: Step1Props) {
  return (
    <View style={styles.stepContent}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          League Name <Text style={styles.required}>*</Text>
        </Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="e.g., Sunday Morning Skins"
            placeholderTextColor="#999"
            value={formData.name}
            onChangeText={(text) => {
              updateFormData({ name: text });
              setNameAvailable(null);
            }}
            maxLength={50}
          />
          {checkingName && <ActivityIndicator size="small" color="#0D5C3A" />}
          {!checkingName && nameAvailable === true && formData.name.length >= 3 && (
            <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
          )}
          {!checkingName && nameAvailable === false && (
            <Ionicons name="close-circle" size={20} color="#DC2626" />
          )}
        </View>
        {nameAvailable === false && (
          <Text style={styles.errorText}>This name is already taken</Text>
        )}
        <Text style={styles.helperText}>{formData.name.length}/50</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Tell potential members about your league..."
          placeholderTextColor="#999"
          value={formData.description}
          onChangeText={(text) => updateFormData({ description: text })}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />
        <Text style={styles.helperText}>{formData.description.length}/500</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Region</Text>
        <View style={styles.displayField}>
          <Ionicons name="location" size={20} color="#0D5C3A" />
          <Text style={styles.displayText}>{formData.regionName || "Not set"}</Text>
        </View>
        <Text style={styles.helperText}>Based on your commissioner application</Text>
      </View>
    </View>
  );
}