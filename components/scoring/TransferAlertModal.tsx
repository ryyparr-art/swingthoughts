/**
 * TransferAlertModal — iOS Liquid Glass style alert for marker transfer requests
 *
 * Uses an absolute-positioned overlay instead of <Modal> so that
 * BlurView can actually sample and blur the content behind it,
 * producing the real liquid glass effect on iOS.
 *
 * On Android, falls back to a solid card since BlurView is experimental.
 *
 * Requires: expo-blur (npx expo install expo-blur)
 *
 * File: components/scoring/TransferAlertModal.tsx
 */

import { BlurView } from "expo-blur";
import React from "react";
import {
    Animated,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";

interface TransferAlertModalProps {
  visible: boolean;
  requestedByName: string;
  onDecline: () => void;
  onApprove: () => void;
}

export default function TransferAlertModal({
  visible,
  requestedByName,
  onDecline,
  onApprove,
}: TransferAlertModalProps) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(1.05)).current;
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 18,
          stiffness: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setMounted(false);
        scale.setValue(1.05);
      });
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <Animated.View style={[s.fullscreen, { opacity }]} pointerEvents={visible ? "auto" : "none"}>
      {/* Dimmed backdrop */}
      <TouchableWithoutFeedback>
        <View style={s.backdrop} />
      </TouchableWithoutFeedback>

      {/* Alert card */}
      <Animated.View style={[s.alertPosition, { transform: [{ scale }] }]}>
        {Platform.OS === "ios" ? (
          <View style={s.alertWrapperIOS}>
            {/* Real blur — samples the scorecard content behind */}
            <BlurView
              intensity={60}
              tint="systemThickMaterialLight"
              style={StyleSheet.absoluteFill}
            />

            {/* Content */}
            <View style={s.body}>
              <Text style={s.titleIOS}>Scoring Request</Text>
              <Text style={s.messageIOS}>
                {requestedByName} wants to take over scoring.
                {"\n\n"}
                If you don't respond, they'll be auto-approved in 2 minutes.
              </Text>
            </View>

            {/* Separator */}
            <View style={s.separatorIOS} />

            {/* Buttons */}
            <View style={s.buttonRow}>
              <TouchableOpacity
                style={[s.button, s.buttonBorderRightIOS]}
                onPress={onDecline}
                activeOpacity={0.4}
              >
                <Text style={s.buttonTextIOS}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.button}
                onPress={onApprove}
                activeOpacity={0.4}
              >
                <Text style={[s.buttonTextIOS, s.buttonTextBold]}>Approve</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* Android fallback — solid card */
          <View style={s.alertWrapperAndroid}>
            <View style={s.body}>
              <Text style={s.titleAndroid}>Scoring Request</Text>
              <Text style={s.messageAndroid}>
                {requestedByName} wants to take over scoring.
                {"\n\n"}
                If you don't respond, they'll be auto-approved in 2 minutes.
              </Text>
            </View>
            <View style={s.separatorAndroid} />
            <View style={s.buttonRow}>
              <TouchableOpacity
                style={[s.button, s.buttonBorderRightAndroid]}
                onPress={onDecline}
                activeOpacity={0.6}
              >
                <Text style={s.buttonTextAndroid}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.button}
                onPress={onApprove}
                activeOpacity={0.6}
              >
                <Text style={[s.buttonTextAndroid, s.buttonTextBold]}>Approve</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  // ── Layout ──
  fullscreen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  alertPosition: {
    // Centered by parent flexbox
  },

  // ── Shared ──
  buttonRow: {
    flexDirection: "row",
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonTextBold: {
    fontWeight: "600",
  },
  body: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 16,
    alignItems: "center",
  },

  // ── iOS — Liquid Glass ──
  alertWrapperIOS: {
    width: 270,
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
  },
  titleIOS: {
    fontSize: 17,
    fontWeight: "600",
    color: "#000",
    textAlign: "center",
    letterSpacing: -0.4,
  },
  messageIOS: {
    fontSize: 13,
    color: "rgba(0,0,0,0.56)",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
    letterSpacing: -0.08,
  },
  separatorIOS: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(60,60,67,0.36)",
  },
  buttonBorderRightIOS: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "rgba(60,60,67,0.36)",
  },
  buttonTextIOS: {
    fontSize: 17,
    color: "#007AFF",
    letterSpacing: -0.4,
  },

  // ── Android — Material Card ──
  alertWrapperAndroid: {
    width: 280,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#FFF",
    elevation: 8,
  },
  titleAndroid: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1a1a1a",
    textAlign: "center",
  },
  messageAndroid: {
    fontSize: 13,
    color: "#555",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18,
  },
  separatorAndroid: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#DDD",
  },
  buttonBorderRightAndroid: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "#DDD",
  },
  buttonTextAndroid: {
    fontSize: 17,
    color: "#007AFF",
  },
});