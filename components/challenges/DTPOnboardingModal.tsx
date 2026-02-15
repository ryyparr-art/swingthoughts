/**
 * DTPOnboardingModal
 *
 * Shown when a user taps "Register" on the DTP challenge.
 * Displays a putter reference diagram explaining how to
 * measure distance to pin, then lets them confirm registration.
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import Svg, {
    Circle,
    Defs,
    Ellipse,
    Line,
    Polygon,
    RadialGradient,
    Rect,
    Stop,
    Text as SvgText
} from "react-native-svg";

interface DTPOnboardingModalProps {
  visible: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function DTPOnboardingModal({
  visible,
  onConfirm,
  onClose,
}: DTPOnboardingModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Close button */}
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>

          {/* Title */}
          <Text style={styles.title}>Measuring Distance to Pin</Text>
          <Text style={styles.subtitle}>
            Use your putter as a reference — lay it on the ground to estimate distance.
          </Text>

          {/* Diagram */}
          <View style={styles.diagramContainer}>
            <Svg width={300} height={180} viewBox="0 0 300 180">
              <Defs>
                <RadialGradient id="greenGrad" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor="#2E7D32" />
                  <Stop offset="100%" stopColor="#1B5E20" />
                </RadialGradient>
              </Defs>

              {/* Green surface */}
              <Rect x={10} y={10} width={280} height={160} rx={12} fill="url(#greenGrad)" />

              {/* Hole */}
              <Ellipse cx={248} cy={90} rx={14} ry={6} fill="#111" opacity={0.8} />
              <Ellipse cx={248} cy={89} rx={12} ry={5} fill="#1a1a1a" opacity={0.5} />

              {/* Pin stick */}
              <Line x1={248} y1={84} x2={248} y2={38} stroke="#DDD" strokeWidth={1.5} />
              <Polygon points="248,38 248,52 234,45" fill="#D32F2F" opacity={0.9} />

              {/* Putter head at hole */}
              <Rect x={228} y={84} width={20} height={11} rx={2} fill="#AAA" opacity={0.9} />
              <Rect x={230} y={86} width={16} height={7} rx={1} fill="#999" opacity={0.6} />

              {/* Putter shaft */}
              <Rect x={78} y={87.5} width={152} height={3.5} rx={1.5} fill="#888" opacity={0.85} />

              {/* Putter grip */}
              <Rect x={56} y={85.5} width={26} height={7.5} rx={3.5} fill="#333" opacity={0.85} />

              {/* Measurement line — full putter length */}
              <Line
                x1={56} y1={118} x2={248} y2={118}
                stroke="#C5A55A" strokeWidth={1.5} strokeDasharray="4,3"
              />
              {/* End caps */}
              <Line x1={56} y1={112} x2={56} y2={124} stroke="#C5A55A" strokeWidth={1.5} />
              <Line x1={248} y1={112} x2={248} y2={124} stroke="#C5A55A" strokeWidth={1.5} />

              {/* Measurement label */}
              <Rect x={118} y={109} width={68} height={20} rx={4} fill="rgba(0,0,0,0.6)" />
              <SvgText
                x={152} y={123}
                textAnchor="middle"
                fill="#FFD700"
                fontSize={11}
                fontWeight="700"
              >
                ≈ 2.75 ft
              </SvgText>

              {/* Golf ball */}
              <Circle cx={38} cy={58} r={5.5} fill="#FFF" stroke="#DDD" strokeWidth={0.8} />
              <Circle cx={37} cy={57} r={0.5} fill="#DDD" />
              <Circle cx={39} cy={56.5} r={0.5} fill="#DDD" />
              <Circle cx={38} cy={59} r={0.5} fill="#DDD" />

              {/* Dotted line from ball to hole */}
              <Line
                x1={44} y1={60} x2={235} y2={88}
                stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeDasharray="3,4"
              />

              {/* Label near ball */}
              <Rect x={26} y={36} width={62} height={16} rx={4} fill="rgba(0,0,0,0.5)" />
              <SvgText
                x={57} y={47.5}
                textAnchor="middle"
                fill="#FFF"
                fontSize={8.5}
                fontWeight="600"
              >
                Your ball lands
              </SvgText>

              {/* Label near hole */}
              <Rect x={250} y={78} width={32} height={14} rx={3} fill="rgba(0,0,0,0.45)" />
              <SvgText
                x={266} y={88}
                textAnchor="middle"
                fill="#FFF"
                fontSize={7.5}
                fontWeight="600"
              >
                Hole
              </SvgText>
            </Svg>
          </View>

          {/* Tip */}
          <Text style={styles.tip}>
            Lay your putter on the ground and count lengths from your ball to the hole. Get as close to the exact distance as possible.
          </Text>

          {/* Confirm button */}
          <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
            <Ionicons name="flag" size={18} color="#FFF" />
            <Text style={styles.confirmText}>Got It — Register</Text>
          </TouchableOpacity>
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
    padding: 24,
  },
  modalContainer: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0D5C3A",
    marginBottom: 6,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  diagramContainer: {
    alignItems: "center",
    marginBottom: 16,
  },
  tip: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    lineHeight: 18,
    fontStyle: "italic",
    marginBottom: 20,
    paddingHorizontal: 12,
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
    width: "100%",
  },
  confirmText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
});