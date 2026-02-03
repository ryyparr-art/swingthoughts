/**
 * ImageCropModal
 *
 * A reusable modal for picking and cropping images to a circle/square.
 * Uses expo-image-picker for selection and expo-image-manipulator for final crop.
 *
 * Features:
 * - Pick from library or take a photo
 * - Pan & pinch-to-zoom on the selected image
 * - Circular mask overlay so users see exactly what the final avatar looks like
 * - Crops + resizes to a clean 512×512 square (displays as circle via borderRadius)
 *
 * Usage:
 *   <ImageCropModal
 *     visible={showCropModal}
 *     onClose={() => setShowCropModal(false)}
 *     onCropComplete={(uri) => handleUpload(uri)}
 *     title="League Avatar"
 *   />
 */

import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useRef, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CROP_SIZE = SCREEN_WIDTH * 0.75;
const CROP_AREA_HEIGHT = SCREEN_WIDTH;
const OUTPUT_SIZE = 512;

interface ImageCropModalProps {
  visible: boolean;
  onClose: () => void;
  onCropComplete: (uri: string) => Promise<void> | void;
  title?: string;
  outputSize?: number;
}

export default function ImageCropModal({
  visible,
  onClose,
  onCropComplete,
  title = "Crop Image",
  outputSize = OUTPUT_SIZE,
}: ImageCropModalProps) {
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<"pick" | "crop">("pick");

  // Use state for transform so the image re-renders on changes
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);

  // Refs for gesture tracking (don't trigger renders mid-gesture)
  const gestureState = useRef({
    startX: 0,
    startY: 0,
    startScale: 1,
    startDistance: 0,
    isZooming: false,
    baseScale: 1, // minimum scale to fill crop area
  });

  const resetState = useCallback(() => {
    setSourceUri(null);
    setImageSize({ width: 0, height: 0 });
    setProcessing(false);
    setStep("pick");
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    gestureState.current = {
      startX: 0,
      startY: 0,
      startScale: 1,
      startDistance: 0,
      isZooming: false,
      baseScale: 1,
    };
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  // ─── Image Picking ──────────────────────────────────────────

  const pickFromLibrary = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        loadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error picking image:", error);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") return;

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        loadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Error taking photo:", error);
    }
  };

  const loadImage = (uri: string) => {
    Image.getSize(
      uri,
      (width, height) => {
        setImageSize({ width, height });
        setSourceUri(uri);
        setStep("crop");

        // Calculate scale so the shorter dimension fills the crop circle
        const minDim = Math.min(width, height);
        const fillScale = CROP_SIZE / minDim;

        gestureState.current.baseScale = fillScale;
        setScale(fillScale);
        setTranslateX(0);
        setTranslateY(0);
      },
      () => console.error("Failed to get image size")
    );
  };

  // ─── Gesture Helpers ────────────────────────────────────────

  const getDistance = (touches: any[]): number => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const clampTranslation = (
    tx: number,
    ty: number,
    s: number,
    imgW: number,
    imgH: number
  ): { x: number; y: number } => {
    const displayW = imgW * s;
    const displayH = imgH * s;
    const maxX = Math.max(0, (displayW - CROP_SIZE) / 2);
    const maxY = Math.max(0, (displayH - CROP_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, tx)),
      y: Math.min(maxY, Math.max(-maxY, ty)),
    };
  };

  // ─── Touch Handlers (direct, no PanResponder) ──────────────

  const onTouchStart = useCallback(
    (e: any) => {
      const touches = e.nativeEvent.touches;
      const gs = gestureState.current;

      if (touches.length === 2) {
        gs.isZooming = true;
        gs.startDistance = getDistance(touches);
        gs.startScale = scale;
        gs.startX = translateX;
        gs.startY = translateY;
      } else if (touches.length === 1) {
        gs.isZooming = false;
        gs.startX = translateX - touches[0].pageX;
        gs.startY = translateY - touches[0].pageY;
      }
    },
    [scale, translateX, translateY]
  );

  const onTouchMove = useCallback(
    (e: any) => {
      const touches = e.nativeEvent.touches;
      const gs = gestureState.current;

      if (touches.length === 2 && gs.startDistance > 0) {
        // Pinch zoom
        const dist = getDistance(touches);
        const pinchRatio = dist / gs.startDistance;
        const newScale = Math.min(
          Math.max(gs.startScale * pinchRatio, gs.baseScale * 0.8),
          gs.baseScale * 6
        );
        const clamped = clampTranslation(gs.startX, gs.startY, newScale, imageSize.width, imageSize.height);
        setScale(newScale);
        setTranslateX(clamped.x);
        setTranslateY(clamped.y);
      } else if (touches.length === 1 && !gs.isZooming) {
        // Pan
        const newX = gs.startX + touches[0].pageX;
        const newY = gs.startY + touches[0].pageY;
        const clamped = clampTranslation(newX, newY, scale, imageSize.width, imageSize.height);
        setTranslateX(clamped.x);
        setTranslateY(clamped.y);
      }
    },
    [scale, imageSize]
  );

  const onTouchEnd = useCallback(() => {
    const gs = gestureState.current;
    gs.isZooming = false;
    gs.startDistance = 0;

    // Snap back if zoomed out too far
    if (scale < gs.baseScale) {
      const clamped = clampTranslation(translateX, translateY, gs.baseScale, imageSize.width, imageSize.height);
      setScale(gs.baseScale);
      setTranslateX(clamped.x);
      setTranslateY(clamped.y);
    }
  }, [scale, translateX, translateY, imageSize]);

  // ─── Crop & Export ──────────────────────────────────────────

  const handleCrop = async () => {
    if (!sourceUri) return;

    try {
      setProcessing(true);

      const displayW = imageSize.width * scale;
      const displayH = imageSize.height * scale;

      // Crop area center is at the center of the view.
      // Image center is offset by (translateX, translateY) from crop center.
      // Top-left of crop area in display coords, relative to image top-left:
      const cropDisplayX = displayW / 2 - translateX - CROP_SIZE / 2;
      const cropDisplayY = displayH / 2 - translateY - CROP_SIZE / 2;

      // Convert to original image pixel coordinates
      const originX = Math.round(Math.max(0, cropDisplayX / scale));
      const originY = Math.round(Math.max(0, cropDisplayY / scale));
      const cropSizeOriginal = Math.round(CROP_SIZE / scale);

      // Clamp to image bounds
      const safeWidth = Math.min(cropSizeOriginal, imageSize.width - originX);
      const safeHeight = Math.min(cropSizeOriginal, imageSize.height - originY);
      const safeCropSize = Math.min(safeWidth, safeHeight);

      const result = await ImageManipulator.manipulateAsync(
        sourceUri,
        [
          {
            crop: {
              originX: Math.max(0, originX),
              originY: Math.max(0, originY),
              width: Math.max(1, safeCropSize),
              height: Math.max(1, safeCropSize),
            },
          },
          { resize: { width: outputSize, height: outputSize } },
        ],
        {
          compress: 0.85,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      await onCropComplete(result.uri);
      handleClose();
    } catch (error) {
      console.error("Error cropping image:", error);
    } finally {
      setProcessing(false);
    }
  };

  // ─── Render: Pick Step ──────────────────────────────────────

  const renderPickStep = () => (
    <View style={cropStyles.pickContainer}>
      <View style={cropStyles.pickIconCircle}>
        <Ionicons name="image-outline" size={48} color="#0D5C3A" />
      </View>
      <Text style={cropStyles.pickTitle}>{title}</Text>
      <Text style={cropStyles.pickSubtitle}>Choose a photo to crop as your avatar</Text>

      <TouchableOpacity style={cropStyles.pickButton} onPress={pickFromLibrary}>
        <Ionicons name="images-outline" size={22} color="#FFF" />
        <Text style={cropStyles.pickButtonText}>Choose from Library</Text>
      </TouchableOpacity>

      <TouchableOpacity style={cropStyles.pickButtonSecondary} onPress={takePhoto}>
        <Ionicons name="camera-outline" size={22} color="#0D5C3A" />
        <Text style={cropStyles.pickButtonSecondaryText}>Take a Photo</Text>
      </TouchableOpacity>

      <TouchableOpacity style={cropStyles.cancelButton} onPress={handleClose}>
        <Text style={cropStyles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── Render: Crop Step ──────────────────────────────────────

  const maskTopBottom = (CROP_AREA_HEIGHT - CROP_SIZE) / 2;
  const maskLeftRight = (SCREEN_WIDTH - CROP_SIZE) / 2;

  const renderCropStep = () => (
    <View style={cropStyles.cropContainer}>
      {/* Header */}
      <View style={cropStyles.cropHeader}>
        <TouchableOpacity
          onPress={() => {
            resetState();
            setStep("pick");
          }}
          style={cropStyles.headerButton}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={cropStyles.cropHeaderTitle}>Move & Scale</Text>
        <View style={cropStyles.headerButton} />
      </View>

      {/* Crop area */}
      <View
        style={cropStyles.cropArea}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {sourceUri && (
          <Image
            source={{ uri: sourceUri }}
            style={{
              width: imageSize.width,
              height: imageSize.height,
              transform: [
                { translateX: translateX },
                { translateY: translateY },
                { scale: scale },
              ],
            }}
            resizeMode="contain"
          />
        )}

        {/* Circle mask overlay */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Top bar */}
          <View style={[cropStyles.maskBlock, { top: 0, left: 0, right: 0, height: maskTopBottom }]} />
          {/* Bottom bar */}
          <View style={[cropStyles.maskBlock, { bottom: 0, left: 0, right: 0, height: maskTopBottom }]} />
          {/* Left bar */}
          <View style={[cropStyles.maskBlock, { top: maskTopBottom, left: 0, width: maskLeftRight, height: CROP_SIZE }]} />
          {/* Right bar */}
          <View style={[cropStyles.maskBlock, { top: maskTopBottom, right: 0, width: maskLeftRight, height: CROP_SIZE }]} />
          {/* Circle border */}
          <View
            style={[
              cropStyles.circleBorder,
              {
                top: maskTopBottom,
                left: maskLeftRight,
                width: CROP_SIZE,
                height: CROP_SIZE,
                borderRadius: CROP_SIZE / 2,
              },
            ]}
          />
        </View>
      </View>

      {/* Footer */}
      <View style={cropStyles.cropFooter}>
        <TouchableOpacity style={cropStyles.footerCancelButton} onPress={handleClose}>
          <Text style={cropStyles.footerCancelText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[cropStyles.footerSaveButton, processing && cropStyles.footerSaveDisabled]}
          onPress={handleCrop}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color="#FFF" />
              <Text style={cropStyles.footerSaveText}>Use Photo</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  // ─── Main Render ────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={cropStyles.container}>
        {step === "pick" ? renderPickStep() : renderCropStep()}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────

const cropStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  // ─── Pick step ──────────────────────────
  pickContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    backgroundColor: "#F4EED8",
  },
  pickIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(13, 92, 58, 0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  pickTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0D5C3A",
    marginBottom: 8,
  },
  pickSubtitle: {
    fontSize: 15,
    color: "#666",
    marginBottom: 32,
    textAlign: "center",
  },
  pickButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#0D5C3A",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: "100%",
    marginBottom: 12,
  },
  pickButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFF",
  },
  pickButtonSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(13, 92, 58, 0.1)",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    width: "100%",
    marginBottom: 24,
  },
  pickButtonSecondaryText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  cancelButton: {
    paddingVertical: 12,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
  },

  // ─── Crop step ──────────────────────────
  cropContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  cropHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 60 : 16,
    paddingBottom: 12,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  cropHeaderTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFF",
  },
  cropArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  maskBlock: {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  circleBorder: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.8)",
  },

  // ─── Footer ────────────────────────────
  cropFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: Platform.OS === "ios" ? 40 : 16,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    gap: 12,
  },
  footerCancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  footerCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
  footerSaveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#0D5C3A",
  },
  footerSaveDisabled: {
    opacity: 0.6,
  },
  footerSaveText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
});