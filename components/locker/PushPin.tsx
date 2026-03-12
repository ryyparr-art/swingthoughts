/**
 * PushPin
 * Decorative pushpin used on rival and achievement notecards.
 * Absolutely positioned above the card's top edge, centered horizontally.
 *
 * Parent wrapper needs: position: "relative", alignItems: "center"
 */

import React from "react";
import { View } from "react-native";

const PIN_COLORS = {
  green: { outer: "#1E8449", shadow: "#145A32" },
  blue:  { outer: "#1A5276", shadow: "#0D3B6E" },
  red:   { outer: "#C0392B", shadow: "#7B241C" },
  gold:  { outer: "#B7770D", shadow: "#7D6608" },
};

export type PinColor = keyof typeof PIN_COLORS;
export const PIN_ORDER: PinColor[] = ["green", "blue", "red", "gold"];

interface Props {
  color?: PinColor;
  size?: number;
}

export default function PushPin({ color = "red", size = 22 }: Props) {
  const c = PIN_COLORS[color] ?? PIN_COLORS.red;

  return (
    <View
      style={{
        position: "absolute",
        alignSelf: "center",
        top: -(size / 2),
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.outer,
        borderWidth: 1.5,
        borderColor: c.shadow,
        zIndex: 10,
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: 4,
        shadowColor: c.shadow,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.5,
        shadowRadius: 6,
        elevation: 6,
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: "rgba(255,255,255,0.45)",
        }}
      />
    </View>
  );
}