/**
 * Media Handlers for Create Thought
 * 
 * Handles image picking, compression, video picking,
 * compression, and thumbnail generation.
 * 
 * NOTE: Crop logic is now inside CropModal itself (pinch-to-zoom).
 * The modal returns the final cropped URI via onCropComplete.
 */

import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import { Alert } from "react-native";
import { Video as VideoCompressor } from "react-native-compressor";

import {
    IMAGE_QUALITY,
    MAX_IMAGE_WIDTH,
    MAX_IMAGES,
    MAX_VIDEO_DURATION,
    PendingImage,
} from "@/components/create-thought/types";

/* ================================================================ */
/* COMPRESSION                                                      */
/* ================================================================ */

export const compressImage = async (uri: string): Promise<string> => {
  try {
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_IMAGE_WIDTH } }],
      { compress: IMAGE_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );
    return manipResult.uri;
  } catch (error) {
    console.error("Image compression error:", error);
    return uri;
  }
};

export const compressVideo = async (uri: string): Promise<string> => {
  try {
    const compressedUri = await VideoCompressor.compress(
      uri,
      { compressionMethod: "auto", maxSize: 1080, bitrate: 2000000 },
      (progress) => {
        console.log(`📊 Compression: ${(progress * 100).toFixed(0)}%`);
      }
    );
    return compressedUri;
  } catch (error) {
    console.error("Video compression error:", error);
    return uri;
  }
};

export const generateVideoThumbnail = async (videoUri: string): Promise<string> => {
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: 0,
      quality: 0.8,
    });
    return uri;
  } catch (error) {
    console.error("Thumbnail generation error:", error);
    return videoUri;
  }
};

/* ================================================================ */
/* IMAGE PICKING                                                    */
/* ================================================================ */

interface PickImagesResult {
  pending: PendingImage[];
}

export const pickImages = async (): Promise<PickImagesResult | null> => {
  try {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      soundPlayer.play("error");
      Alert.alert(
        "Permission Required",
        "Please allow photo library access in your device settings to upload media.",
        [{ text: "Cancel", style: "cancel" }, { text: "Open Settings" }]
      );
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 1,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets.length > 0) {
      const selectedImages = result.assets.slice(0, MAX_IMAGES);
      const pending: PendingImage[] = selectedImages.map((asset) => ({
        uri: asset.uri,
        width: asset.width || 1080,
        height: asset.height || 1080,
      }));
      soundPlayer.play("click");
      return { pending };
    }

    return null;
  } catch (error) {
    console.error("Image picker error:", error);
    soundPlayer.play("error");
    Alert.alert("Error", "Failed to select images. Please try again.");
    return null;
  }
};

export const pickMoreImages = async (
  currentCount: number
): Promise<PickImagesResult | null> => {
  if (currentCount >= MAX_IMAGES) {
    soundPlayer.play("error");
    Alert.alert("Maximum Reached", `You can only add up to ${MAX_IMAGES} images.`);
    return null;
  }

  try {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return null;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 1,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets.length > 0) {
      const remainingSlots = MAX_IMAGES - currentCount;
      const selectedImages = result.assets.slice(0, remainingSlots);
      const pending: PendingImage[] = selectedImages.map((asset) => ({
        uri: asset.uri,
        width: asset.width || 1080,
        height: asset.height || 1080,
      }));
      return { pending };
    }

    return null;
  } catch (error) {
    console.error("Add images error:", error);
    soundPlayer.play("error");
    return null;
  }
};

/* ================================================================ */
/* VIDEO PICKING                                                    */
/* ================================================================ */

interface PickVideoResult {
  videoUri: string;
  thumbnailUri: string;
  durationSeconds: number;
  videoWidth: number;
  videoHeight: number;
}

export const pickVideo = async (): Promise<PickVideoResult | null> => {
  try {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      soundPlayer.play("error");
      Alert.alert(
        "Permission Required",
        "Please allow photo library access in your device settings to upload media.",
        [{ text: "Cancel", style: "cancel" }, { text: "Open Settings" }]
      );
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: false,
      quality: 0.8,
      videoMaxDuration: 120,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const duration = asset.duration || 0;

      if (duration / 1000 > 120) {
        soundPlayer.play("error");
        Alert.alert("Video Too Long", "Please select a video shorter than 2 minutes.");
        return null;
      }

      let compressedUri: string;
      try {
        compressedUri = await compressVideo(asset.uri);
      } catch (compErr: any) {
        Alert.alert("Compression Error", `${compErr?.message || compErr}`);
        compressedUri = asset.uri;
      }

      let thumbnailUri: string;
      try {
        thumbnailUri = await generateVideoThumbnail(compressedUri);
      } catch (thumbErr: any) {
        Alert.alert("Thumbnail Error", `${thumbErr?.message || thumbErr}`);
        thumbnailUri = "";
      }

      const durationSeconds = duration / 1000;
      const videoWidth = asset.width || 1080;
      const videoHeight = asset.height || 1920;

      if (durationSeconds > MAX_VIDEO_DURATION) {
        soundPlayer.play("click");
        Alert.alert(
          "Trim Your Video",
          `Your video is ${durationSeconds.toFixed(0)} seconds. Use the sliders to select the best ${MAX_VIDEO_DURATION}-second clip.`,
          [{ text: "Got it" }]
        );
      }

      return { videoUri: compressedUri, thumbnailUri, durationSeconds, videoWidth, videoHeight };
    }

    return null;
  } catch (error: any) {
    console.error("Video picker error:", error);
    soundPlayer.play("error");
    
    const errorMsg = error?.message || error || "Unknown error";
    
    if (errorMsg.includes("3164") || errorMsg.includes("PHPhotos")) {
      Alert.alert(
        "Video Unavailable",
        "This video may still be downloading from iCloud. Open it in your Photos app first to ensure it's fully downloaded, then try again."
      );
    } else {
      Alert.alert("Video Error", `${errorMsg}`);
    }
    
    return null;
   }
  };