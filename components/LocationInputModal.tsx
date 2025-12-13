import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    Alert,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface LocationInputModalProps {
  visible: boolean;
  onSubmit: (city: string, state: string, zip: string) => void;
  onCancel: () => void;
}

export default function LocationInputModal({
  visible,
  onSubmit,
  onCancel,
}: LocationInputModalProps) {
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  const handleSubmit = () => {
    if (!city.trim() || !state.trim()) {
      if (Platform.OS === 'web') {
        alert("Please enter at least city and state.");
      } else {
        Alert.alert("Missing Information", "Please enter at least city and state.");
      }
      return;
    }

    onSubmit(city.trim(), state.trim(), zip.trim());
    
    // Reset fields
    setCity("");
    setState("");
    setZip("");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Ionicons name="location-outline" size={32} color="#0D5C3A" />
            <Text style={styles.title}>Set Your Location</Text>
            <Text style={styles.subtitle}>
              Help us show you courses near you
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>City *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Lexington"
                placeholderTextColor="#999"
                value={city}
                onChangeText={setCity}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>State *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., North Carolina"
                placeholderTextColor="#999"
                value={state}
                onChangeText={setState}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>ZIP Code (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 27292"
                placeholderTextColor="#999"
                value={zip}
                onChangeText={setZip}
                keyboardType="number-pad"
                maxLength={5}
              />
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Skip for Now</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
              <Text style={styles.submitButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  container: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#F4EED8",
    borderRadius: 16,
    padding: 24,
  },

  header: {
    alignItems: "center",
    marginBottom: 24,
  },

  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0D5C3A",
    marginTop: 12,
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },

  form: {
    marginBottom: 24,
  },

  inputGroup: {
    marginBottom: 16,
  },

  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 8,
  },

  input: {
    backgroundColor: "#FFFFFF", // Force white background
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#333", // Force dark text
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  actions: {
    flexDirection: "row",
    gap: 12,
  },

  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    backgroundColor: "#F4EED8", // Force background
    alignItems: "center",
    justifyContent: "center",
  },

  cancelButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  submitButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },

  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});