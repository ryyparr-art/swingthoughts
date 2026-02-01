/**
 * CropModal Component
 * 
 * Full-screen modal for cropping images before upload
 */

import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import React from "react";
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PendingImage } from "./types";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface CropModalProps {
  visible: boolean;
  pendingImages: PendingImage[];
  currentCropIndex: number;
  cropOffset: { x: number; y: number };
  cropScale: number;
  isProcessingMedia: boolean;
  onCropOffsetChange: (offset: { x: number; y: number }) => void;
  onCropScaleChange: (scale: number) => void;
  onCropComplete: () => void;
  onSkipCrop: () => void;
  onCancel: () => void;
}

export default function CropModal({
  visible,
  pendingImages,
  currentCropIndex,
  cropOffset,
  cropScale,
  isProcessingMedia,
  onCropOffsetChange,
  onCropScaleChange,
  onCropComplete,
  onSkipCrop,
  onCancel,
}: CropModalProps) {
  if (!visible || pendingImages.length === 0) return null;

  const currentImage = pendingImages[currentCropIndex];
  if (!currentImage) return null;

  const imageAspect = currentImage.width / currentImage.height;
  const containerSize = SCREEN_WIDTH - 48;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.headerButton}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>

          <Text style={styles.title}>
            Crop Image {currentCropIndex + 1} of {pendingImages.length}
          </Text>

          <TouchableOpacity
            onPress={onCropComplete}
            style={styles.headerButton}
            disabled={isProcessingMedia}
          >
            {isProcessingMedia ? (
              <ActivityIndicator size="small" color="#FFD700" />
            ) : (
              <Ionicons name="checkmark" size={28} color="#FFD700" />
            )}
          </TouchableOpacity>
        </View>

        {/* Crop Area */}
        <View style={styles.cropAreaContainer}>
          <View style={[styles.cropArea, { width: containerSize, height: containerSize }]}>
            <Image
              source={{ uri: currentImage.uri }}
              style={[
                styles.cropImage,
                {
                  width:
                    imageAspect >= 1
                      ? containerSize * cropScale
                      : containerSize * imageAspect * cropScale,
                  height:
                    imageAspect >= 1
                      ? (containerSize / imageAspect) * cropScale
                      : containerSize * cropScale,
                  transform: [{ translateX: cropOffset.x }, { translateY: cropOffset.y }],
                },
              ]}
              resizeMode="contain"
            />

            {/* Grid Overlay */}
            <View style={styles.gridOverlay} pointerEvents="none">
              <View style={styles.gridRow}>
                <View style={styles.gridCell} />
                <View style={[styles.gridCell, styles.gridCellBorder]} />
                <View style={styles.gridCell} />
              </View>
              <View style={[styles.gridRow, styles.gridRowBorder]}>
                <View style={styles.gridCell} />
                <View style={[styles.gridCell, styles.gridCellBorder]} />
                <View style={styles.gridCell} />
              </View>
              <View style={styles.gridRow}>
                <View style={styles.gridCell} />
                <View style={[styles.gridCell, styles.gridCellBorder]} />
                <View style={styles.gridCell} />
              </View>
            </View>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <Text style={styles.controlLabel}>Zoom</Text>
          <Slider
            style={styles.slider}
            minimumValue={1}
            maximumValue={3}
            value={cropScale}
            onValueChange={onCropScaleChange}
            minimumTrackTintColor="#FFD700"
            maximumTrackTintColor="#444"
            thumbTintColor="#FFD700"
          />

          <View style={styles.offsetControls}>
            <View style={styles.offsetRow}>
              <Text style={styles.controlLabel}>Horizontal</Text>
              <Slider
                style={styles.slider}
                minimumValue={-100}
                maximumValue={100}
                value={cropOffset.x}
                onValueChange={(x) => onCropOffsetChange({ ...cropOffset, x })}
                minimumTrackTintColor="#FFD700"
                maximumTrackTintColor="#444"
                thumbTintColor="#FFD700"
              />
            </View>

            <View style={styles.offsetRow}>
              <Text style={styles.controlLabel}>Vertical</Text>
              <Slider
                style={styles.slider}
                minimumValue={-100}
                maximumValue={100}
                value={cropOffset.y}
                onValueChange={(y) => onCropOffsetChange({ ...cropOffset, y })}
                minimumTrackTintColor="#FFD700"
                maximumTrackTintColor="#444"
                thumbTintColor="#FFD700"
              />
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.skipButton}
              onPress={onSkipCrop}
              disabled={isProcessingMedia}
            >
              <Text style={styles.skipButtonText}>Skip Crop</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={onCropComplete}
              disabled={isProcessingMedia}
            >
              {isProcessingMedia ? (
                <ActivityIndicator size="small" color="#0D5C3A" />
              ) : (
                <Text style={styles.confirmButtonText}>
                  {currentCropIndex < pendingImages.length - 1 ? "Next Image" : "Done"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a1a" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },
  headerButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16, fontWeight: "700", color: "#FFF" },

  // Crop Area
  cropAreaContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  cropArea: {
    backgroundColor: "#000",
    overflow: "hidden",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#FFD700",
    position: "relative",
  },
  cropImage: { position: "absolute" },

  // Grid Overlay
  gridOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  gridRow: { flex: 1, flexDirection: "row" },
  gridRowBorder: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  gridCell: { flex: 1 },
  gridCellBorder: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },

  // Controls
  controls: {
    backgroundColor: "#2a2a2a",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  controlLabel: { fontSize: 12, fontWeight: "600", color: "#999", marginBottom: 8 },
  slider: { width: "100%", height: 40 },
  offsetControls: { marginTop: 16 },
  offsetRow: { marginBottom: 12 },

  // Action Buttons
  actionButtons: { flexDirection: "row", gap: 12, marginTop: 20 },
  skipButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#444",
    alignItems: "center",
  },
  skipButtonText: { color: "#FFF", fontWeight: "600", fontSize: 15 },
  confirmButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#FFD700",
    alignItems: "center",
  },
  confirmButtonText: { color: "#0D5C3A", fontWeight: "700", fontSize: 15 },
});