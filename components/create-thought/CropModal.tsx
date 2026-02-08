/**
 * CropModal Component
 *
 * Full-screen modal for cropping images to a square before upload.
 * Based on ImageCropModal (pinch-to-zoom + pan) but with a square mask
 * instead of circular. Supports cropping multiple images in sequence.
 *
 * Features:
 * - Pan & pinch-to-zoom on the selected image
 * - Square mask overlay so users see exactly what the final crop looks like
 * - Crops + resizes to MAX_IMAGE_WIDTH square
 * - "Skip Crop" to use original without cropping
 * - Multi-image support with "Next Image" / "Done" flow
 */

import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  LayoutChangeEvent,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { IMAGE_QUALITY, MAX_IMAGE_WIDTH, PendingImage } from "./types";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CROP_SIZE = SCREEN_WIDTH - 48;

interface CropModalProps {
  visible: boolean;
  pendingImages: PendingImage[];
  currentCropIndex: number;
  isProcessingMedia: boolean;
  onCropComplete: (croppedUri: string) => void;
  onSkipCrop: () => void;
  onCancel: () => void;
}

export default function CropModal({
  visible,
  pendingImages,
  currentCropIndex,
  isProcessingMedia,
  onCropComplete,
  onSkipCrop,
  onCancel,
}: CropModalProps) {
  // Display dimensions: image scaled so its short side = CROP_SIZE
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });

  // Measured crop area (from onLayout)
  const [cropAreaSize, setCropAreaSize] = useState({ width: SCREEN_WIDTH, height: SCREEN_WIDTH });

  // User transform
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [processing, setProcessing] = useState(false);

  const gestureState = useRef({
    startX: 0,
    startY: 0,
    startScale: 1,
    startDistance: 0,
    isZooming: false,
  });

  // Current image
  const currentImage = pendingImages[currentCropIndex];
  const isLastImage = currentCropIndex >= pendingImages.length - 1;

  /* ---------------------------------------------------------------- */
  /* RESET ON IMAGE CHANGE                                            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!currentImage) return;

    const { width, height } = currentImage;
    const aspect = width / height;

    // Scale so short side fills CROP_SIZE
    let dw: number;
    let dh: number;
    if (aspect >= 1) {
      dh = CROP_SIZE;
      dw = CROP_SIZE * aspect;
    } else {
      dw = CROP_SIZE;
      dh = CROP_SIZE / aspect;
    }

    setDisplaySize({ width: dw, height: dh });
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    gestureState.current = {
      startX: 0,
      startY: 0,
      startScale: 1,
      startDistance: 0,
      isZooming: false,
    };
  }, [currentCropIndex, currentImage?.uri]);

  /* ---------------------------------------------------------------- */
  /* LAYOUT MEASUREMENT                                               */
  /* ---------------------------------------------------------------- */

  const onCropAreaLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCropAreaSize({ width, height });
  }, []);

  /* ---------------------------------------------------------------- */
  /* GESTURE HELPERS                                                  */
  /* ---------------------------------------------------------------- */

  const getDistance = (touches: any[]): number => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const clampTranslation = (
    tx: number,
    ty: number,
    s: number
  ): { x: number; y: number } => {
    const renderedW = displaySize.width * s;
    const renderedH = displaySize.height * s;
    const maxX = Math.max(0, (renderedW - CROP_SIZE) / 2);
    const maxY = Math.max(0, (renderedH - CROP_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, tx)),
      y: Math.min(maxY, Math.max(-maxY, ty)),
    };
  };

  /* ---------------------------------------------------------------- */
  /* TOUCH HANDLERS                                                   */
  /* ---------------------------------------------------------------- */

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
        const dist = getDistance(touches);
        const pinchRatio = dist / gs.startDistance;
        const newScale = Math.min(Math.max(gs.startScale * pinchRatio, 0.8), 6);
        const clamped = clampTranslation(gs.startX, gs.startY, newScale);
        setScale(newScale);
        setTranslateX(clamped.x);
        setTranslateY(clamped.y);
      } else if (touches.length === 1 && !gs.isZooming) {
        const newX = gs.startX + touches[0].pageX;
        const newY = gs.startY + touches[0].pageY;
        const clamped = clampTranslation(newX, newY, scale);
        setTranslateX(clamped.x);
        setTranslateY(clamped.y);
      }
    },
    [scale, displaySize]
  );

  const onTouchEnd = useCallback(() => {
    const gs = gestureState.current;
    gs.isZooming = false;
    gs.startDistance = 0;

    if (scale < 1) {
      const clamped = clampTranslation(translateX, translateY, 1);
      setScale(1);
      setTranslateX(clamped.x);
      setTranslateY(clamped.y);
    }
  }, [scale, translateX, translateY, displaySize]);

  /* ---------------------------------------------------------------- */
  /* CROP & EXPORT                                                    */
  /* ---------------------------------------------------------------- */

  const handleCrop = async () => {
    if (!currentImage || displaySize.width === 0) return;

    try {
      setProcessing(true);

      const renderedW = displaySize.width * scale;
      const renderedH = displaySize.height * scale;

      // Square crop area top-left in rendered-image coordinates
      const cropX = (renderedW - CROP_SIZE) / 2 - translateX;
      const cropY = (renderedH - CROP_SIZE) / 2 - translateY;

      // Convert rendered coords → original image pixels
      const ratioX = currentImage.width / renderedW;
      const ratioY = currentImage.height / renderedH;

      const originX = Math.round(cropX * ratioX);
      const originY = Math.round(cropY * ratioY);
      const cropW = Math.round(CROP_SIZE * ratioX);
      const cropH = Math.round(CROP_SIZE * ratioY);

      const cropSide = Math.min(cropW, cropH);

      // Clamp to image bounds
      const safeX = Math.max(0, Math.min(originX, currentImage.width - cropSide));
      const safeY = Math.max(0, Math.min(originY, currentImage.height - cropSide));
      const safeSize = Math.max(
        1,
        Math.min(cropSide, currentImage.width - safeX, currentImage.height - safeY)
      );

      const result = await ImageManipulator.manipulateAsync(
        currentImage.uri,
        [
          {
            crop: {
              originX: safeX,
              originY: safeY,
              width: safeSize,
              height: safeSize,
            },
          },
          { resize: { width: MAX_IMAGE_WIDTH } },
        ],
        {
          compress: IMAGE_QUALITY,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      onCropComplete(result.uri);
    } catch (error) {
      console.error("Crop error:", error);
    } finally {
      setProcessing(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* RENDER                                                           */
  /* ---------------------------------------------------------------- */

  if (!visible || pendingImages.length === 0 || !currentImage) return null;

  // Square mask positioning
  const squareTop = (cropAreaSize.height - CROP_SIZE) / 2;
  const squareLeft = (cropAreaSize.width - CROP_SIZE) / 2;
  const maskPadding = Math.max(SCREEN_WIDTH, cropAreaSize.height);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.headerBtn}>
            <Ionicons name="close" size={26} color="#FFF" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>
            Crop {currentCropIndex + 1} of {pendingImages.length}
          </Text>

          <View style={styles.headerBtn} />
        </View>

        {/* Crop Area */}
        <View
          style={styles.cropArea}
          onLayout={onCropAreaLayout}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          {displaySize.width > 0 && (
            <Image
              source={{ uri: currentImage.uri }}
              style={{
                width: displaySize.width,
                height: displaySize.height,
                transform: [
                  { translateX },
                  { translateY },
                  { scale },
                ],
              }}
              resizeMode="cover"
            />
          )}

          {/* Square mask overlay */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* Top dark band */}
            <View style={[styles.maskBand, { top: 0, left: 0, right: 0, height: Math.max(0, squareTop) }]} />
            {/* Bottom dark band */}
            <View style={[styles.maskBand, { bottom: 0, left: 0, right: 0, height: Math.max(0, squareTop) }]} />
            {/* Left dark band */}
            <View style={[styles.maskBand, { top: squareTop, left: 0, width: Math.max(0, squareLeft), height: CROP_SIZE }]} />
            {/* Right dark band */}
            <View style={[styles.maskBand, { top: squareTop, right: 0, width: Math.max(0, squareLeft), height: CROP_SIZE }]} />

            {/* Square border */}
            <View
              style={{
                position: "absolute",
                top: squareTop,
                left: squareLeft,
                width: CROP_SIZE,
                height: CROP_SIZE,
                borderWidth: 1.5,
                borderColor: "rgba(255, 255, 255, 0.6)",
              }}
            />

            {/* Grid lines (rule of thirds) */}
            <View
              style={{
                position: "absolute",
                top: squareTop + CROP_SIZE / 3,
                left: squareLeft,
                width: CROP_SIZE,
                height: 1,
                backgroundColor: "rgba(255, 255, 255, 0.2)",
              }}
            />
            <View
              style={{
                position: "absolute",
                top: squareTop + (CROP_SIZE * 2) / 3,
                left: squareLeft,
                width: CROP_SIZE,
                height: 1,
                backgroundColor: "rgba(255, 255, 255, 0.2)",
              }}
            />
            <View
              style={{
                position: "absolute",
                top: squareTop,
                left: squareLeft + CROP_SIZE / 3,
                width: 1,
                height: CROP_SIZE,
                backgroundColor: "rgba(255, 255, 255, 0.2)",
              }}
            />
            <View
              style={{
                position: "absolute",
                top: squareTop,
                left: squareLeft + (CROP_SIZE * 2) / 3,
                width: 1,
                height: CROP_SIZE,
                backgroundColor: "rgba(255, 255, 255, 0.2)",
              }}
            />
          </View>
        </View>

        {/* Instruction */}
        <Text style={styles.instruction}>Pinch to zoom · Drag to move</Text>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={onSkipCrop}
            disabled={processing || isProcessingMedia}
          >
            <Text style={styles.skipBtnText}>Skip</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.cropBtn, (processing || isProcessingMedia) && styles.cropBtnDisabled]}
            onPress={handleCrop}
            disabled={processing || isProcessingMedia}
          >
            {processing || isProcessingMedia ? (
              <ActivityIndicator color="#0D5C3A" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#0D5C3A" />
                <Text style={styles.cropBtnText}>
                  {isLastImage ? "Done" : "Next"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 60 : 16,
    paddingBottom: 12,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  headerBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFF",
  },

  // Crop area
  cropArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },

  // Mask bands (dark overlay outside the square)
  maskBand: {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },

  // Instruction
  instruction: {
    textAlign: "center",
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 13,
    fontWeight: "500",
    paddingVertical: 8,
  },

  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: Platform.OS === "ios" ? 40 : 16,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    gap: 12,
  },
  skipBtn: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  skipBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFF",
  },
  cropBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#FFD700",
  },
  cropBtnDisabled: {
    opacity: 0.6,
  },
  cropBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },
});