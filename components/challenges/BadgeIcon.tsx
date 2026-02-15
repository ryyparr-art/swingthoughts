/**
 * BadgeIcon
 *
 * Renders a single challenge badge as a colored circle with SVG icon.
 * Works at any size — 14px for comments, 16px inline, 36px cards, 48px profile.
 *
 * Usage:
 *   <BadgeIcon badgeId="par3" size={16} />
 *   <BadgeIcon badgeId="tier_tour" size={36} />
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
    Circle,
    Ellipse,
    G,
    Path,
    Text as SvgText,
} from "react-native-svg";

// Badge visual config — matches the approved designs
const BADGE_CONFIG: Record<
  string,
  { bgColor: string; iconColor: string; iconType: string }
> = {
  // Individual challenges
  par3: { bgColor: "#0D5C3A", iconColor: "#FFF", iconType: "par3" },
  fir: { bgColor: "#4CAF50", iconColor: "#FFF", iconType: "location" },
  gir: { bgColor: "#1B5E20", iconColor: "#FFF", iconType: "disc" },
  birdie_streak: { bgColor: "#F57C00", iconColor: "#FFF", iconType: "bird" },
  iron_player: { bgColor: "#333333", iconColor: "#FFD700", iconType: "shield" },
  dtp: { bgColor: "#D32F2F", iconColor: "#FFF", iconType: "golf" },
  ace: { bgColor: "#E8B800", iconColor: "#FFF", iconType: "ace" },
  // Cumulative tiers
  tier_amateur: { bgColor: "#CD7F32", iconColor: "#FFF", iconType: "ribbon" },
  tier_next_tour: { bgColor: "#8A9BAE", iconColor: "#FFF", iconType: "medal" },
  tier_tour: { bgColor: "#C5A55A", iconColor: "#FFF", iconType: "trophy" },
};

interface BadgeIconProps {
  badgeId: string;
  size?: number;
}

function renderIcon(iconType: string, color: string, bgColor: string) {
  switch (iconType) {
    case "par3":
      return (
        <G>
          <SvgText
            x="10"
            y="8.5"
            textAnchor="middle"
            fill={color}
            fontSize="6.5"
            fontWeight="800"
          >
            PAR
          </SvgText>
          <SvgText
            x="10"
            y="16"
            textAnchor="middle"
            fill={color}
            fontSize="9"
            fontWeight="900"
          >
            3
          </SvgText>
        </G>
      );

    case "location":
      return (
        <G>
          <Path
            d="M10 1C6.1 1 3 4.1 3 8c0 5.2 7 11 7 11s7-5.8 7-11C17 4.1 13.9 1 10 1z"
            fill={color}
          />
          <Circle cx={10} cy={8} r={2.5} fill={bgColor} />
        </G>
      );

    case "disc":
      return (
        <G>
          <Circle
            cx={10}
            cy={10}
            r={7}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
          />
          <Circle
            cx={10}
            cy={10}
            r={4}
            fill="none"
            stroke={color}
            strokeWidth={1.2}
          />
          <Circle cx={10} cy={10} r={1.5} fill={color} />
        </G>
      );

    case "bird":
      return (
        <G
          fill="none"
          stroke={color}
          strokeWidth={1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Ellipse cx={10} cy={11} rx={5} ry={3.5} fill={color} opacity={0.15} />
          <Ellipse cx={10} cy={11} rx={5} ry={3.5} />
          <Circle cx={14.5} cy={7.5} r={2.5} fill={color} opacity={0.15} />
          <Circle cx={14.5} cy={7.5} r={2.5} />
          <Circle cx={15.3} cy={7} r={0.7} fill={color} />
          <Path d="M17 7.5l2-0.5-2 1" fill={color} />
          <Path d="M7 10c1.5-2 4-2.5 5.5-1.5" strokeWidth={1.2} />
          <Path d="M5 11l-2.5-1.5M5 11.5l-3 0" strokeWidth={1.1} />
        </G>
      );

    case "shield":
      return (
        <G>
          <Path
            d="M10 1L2 5v5c0 4.5 3.4 8.7 8 9.9 4.6-1.2 8-5.4 8-9.9V5L10 1z"
            fill="none"
            stroke={color}
            strokeWidth={1.3}
          />
          <Path
            d="M6.5 10l2.5 2.5 4.5-5"
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      );

    case "golf":
      return (
        <G>
          <Circle cx={10} cy={4} r={2.5} fill={color} />
          <Path
            d="M10 7v8"
            stroke={color}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
          />
          <Ellipse
            cx={10}
            cy={16.5}
            rx={5}
            ry={1.5}
            fill="none"
            stroke={color}
            strokeWidth={1}
          />
        </G>
      );

    case "ace":
      return (
        <SvgText
          x="10"
          y="14.5"
          textAnchor="middle"
          fill={color}
          fontSize="14"
          fontWeight="900"
        >
          A
        </SvgText>
      );

    case "ribbon":
      return (
        <G>
          <Circle
            cx={10}
            cy={8}
            r={5}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
          />
          <Path
            d="M7 12.5L5 19l5-2.5L15 19l-2-6.5"
            fill="none"
            stroke={color}
            strokeWidth={1.3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      );

    case "medal":
      return (
        <G>
          <Path
            d="M7 1L5 7h3"
            fill="none"
            stroke={color}
            strokeWidth={1.3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M13 1l2 6h-3"
            fill="none"
            stroke={color}
            strokeWidth={1.3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle
            cx={10}
            cy={12.5}
            r={5}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
          />
          <Path
            d="M10 9.5v3l2 1.5"
            fill="none"
            stroke={color}
            strokeWidth={1}
            strokeLinecap="round"
          />
        </G>
      );

    case "trophy":
      return (
        <G>
          <Path
            d="M6 3h8v5c0 2.2-1.8 4-4 4s-4-1.8-4-4V3z"
            fill="none"
            stroke={color}
            strokeWidth={1.3}
          />
          <Path
            d="M6 5H3c0 2.2 1.3 4 3 4"
            fill="none"
            stroke={color}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
          <Path
            d="M14 5h3c0 2.2-1.3 4-3 4"
            fill="none"
            stroke={color}
            strokeWidth={1.2}
            strokeLinecap="round"
          />
          <Path
            d="M10 12v2"
            stroke={color}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
          <Path
            d="M7 16h6"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </G>
      );

    default:
      return null;
  }
}

export default function BadgeIcon({ badgeId, size = 16 }: BadgeIconProps) {
  const config = BADGE_CONFIG[badgeId];
  if (!config) return null;

  const svgSize = size * 0.6;

  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: config.bgColor,
        },
      ]}
    >
      <Svg width={svgSize} height={svgSize} viewBox="0 0 20 20">
        {renderIcon(config.iconType, config.iconColor, config.bgColor)}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 1,
    elevation: 1,
  },
});