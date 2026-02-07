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
 * IMPORTANT: The crop area is flex:1 so its height varies by device. We measure
 * it with onLayout and use the measured value for both mask positioning and crop math.
 * The image and circle are both centered in that measured area.
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
  LayoutChangeEvent,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CROP_SIZE = SCREEN_WIDTH * 0.75;
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

  // Display dimensions: image scaled so its short side = CROP_SIZE
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });

  // Measured crop area dimensions (from onLayout)
  const [cropAreaSize, setCropAreaSize] = useState({ width: SCREEN_WIDTH, height: SCREEN_WIDTH });

  // User transform: scale=1 means short side fills the crop circle exactly
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);

  const gestureState = useRef({
    startX: 0,
    startY: 0,
    startScale: 1,
    startDistance: 0,
    isZooming: false,
  });

  const resetState = useCallback(() => {
    setSourceUri(null);
    setImageSize({ width: 0, height: 0 });
    setDisplaySize({ width: 0, height: 0 });
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
    };
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  // ─── Measure crop area ──────────────────────────────────────

  const onCropAreaLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCropAreaSize({ width, height });
  }, []);

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

        // Scale image so its shorter side = CROP_SIZE (fills the circle at scale=1)
        const aspect = width / height;
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

  // ─── Touch Handlers ─────────────────────────────────────────

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

  // ─── Crop & Export ──────────────────────────────────────────
  //
  // Both the image and the crop circle are centered in the cropArea.
  // The image is rendered at displaySize and then CSS-transformed.
  //
  // Image center in cropArea coords: (cropAreaW/2, cropAreaH/2)
  // Circle center in cropArea coords: (cropAreaW/2, cropAreaH/2)
  // → They are the same point. Only translateX/Y offsets the image.
  //
  // When translateX=+T, the image moves right by T, so the crop circle
  // "sees" content T pixels to the LEFT of image center.
  //
  // Crop circle top-left in rendered-image-local coords:
  //   cropX = (renderedW - CROP_SIZE) / 2 - translateX
  //   cropY = (renderedH - CROP_SIZE) / 2 - translateY

  const handleCrop = async () => {
    if (!sourceUri || displaySize.width === 0) return;

    try {
      setProcessing(true);

      const renderedW = displaySize.width * scale;
      const renderedH = displaySize.height * scale;

      // Crop circle top-left in rendered-image coordinates
      const cropX = (renderedW - CROP_SIZE) / 2 - translateX;
      const cropY = (renderedH - CROP_SIZE) / 2 - translateY;

      // Convert rendered coords → original image pixels
      const ratioX = imageSize.width / renderedW;
      const ratioY = imageSize.height / renderedH;

      const originX = Math.round(cropX * ratioX);
      const originY = Math.round(cropY * ratioY);
      const cropW = Math.round(CROP_SIZE * ratioX);
      const cropH = Math.round(CROP_SIZE * ratioY);

      // Use the smaller to keep it square
      const cropSide = Math.min(cropW, cropH);

      // Clamp to image bounds
      const safeX = Math.max(0, Math.min(originX, imageSize.width - cropSide));
      const safeY = Math.max(0, Math.min(originY, imageSize.height - cropSide));
      const safeSize = Math.max(
        1,
        Math.min(cropSide, imageSize.width - safeX, imageSize.height - safeY)
      );

      console.log("[ImageCropModal] crop debug:", {
        imageSize,
        displaySize,
        scale,
        translateX,
        translateY,
        renderedW,
        renderedH,
        cropX,
        cropY,
        originX,
        originY,
        cropSide,
        safeX,
        safeY,
        safeSize,
      });

      const result = await ImageManipulator.manipulateAsync(
        sourceUri,
        [
          {
            crop: {
              originX: safeX,
              originY: safeY,
              width: safeSize,
              height: safeSize,
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
      <Text style={cropStyles.pickSubtitle}>
        Choose a photo to crop as your avatar
      </Text>

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
  //
  // The mask circle must be centered in the cropArea. Since cropArea uses
  // flex:1, we measure it and compute offsets dynamically.

  const circleTop = (cropAreaSize.height - CROP_SIZE) / 2;
  const circleLeft = (cropAreaSize.width - CROP_SIZE) / 2;

  // For the border-trick mask: we create a circle larger than the crop area
  // with a huge borderWidth. The "hole" is CROP_SIZE.
  const maskPadding = Math.max(SCREEN_WIDTH, cropAreaSize.height);

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

      {/* Crop area - measured with onLayout */}
      <View
        style={cropStyles.cropArea}
        onLayout={onCropAreaLayout}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {sourceUri && displaySize.width > 0 && (
          <Image
            source={{ uri: sourceUri }}
            style={{
              width: displaySize.width,
              height: displaySize.height,
              transform: [
                { translateX: translateX },
                { translateY: translateY },
                { scale: scale },
              ],
            }}
            resizeMode="cover"
          />
        )}

        {/* Circle mask overlay */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View
            style={{
              position: "absolute",
              top: circleTop - maskPadding,
              left: circleLeft - maskPadding,
              width: CROP_SIZE + maskPadding * 2,
              height: CROP_SIZE + maskPadding * 2,
              borderRadius: (CROP_SIZE + maskPadding * 2) / 2,
              borderWidth: maskPadding,
              borderColor: "rgba(0, 0, 0, 0.6)",
            }}
          />
          {/* Circle border ring */}
          <View
            style={{
              position: "absolute",
              top: circleTop,
              left: circleLeft,
              width: CROP_SIZE,
              height: CROP_SIZE,
              borderRadius: CROP_SIZE / 2,
              borderWidth: 2,
              borderColor: "rgba(255, 255, 255, 0.8)",
            }}
          />
        </View>
      </View>

      {/* Footer */}
      <View style={cropStyles.cropFooter}>
        <TouchableOpacity
          style={cropStyles.footerCancelButton}
          onPress={handleClose}
        >
          <Text style={cropStyles.footerCancelText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            cropStyles.footerSaveButton,
            processing && cropStyles.footerSaveDisabled,
          ]}
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

const cropStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
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