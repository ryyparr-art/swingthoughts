import React from "react";
import { Image, ImageSourcePropType } from "react-native";

interface CustomIconProps {
  name: string;
  size?: number;
  color?: string; // Note: color won't work with PNGs, only with tinted images
  style?: any;
}

const iconMap: { [key: string]: ImageSourcePropType } = {
  clubhouse: require("@/assets/icons/clubhouse.png"),
  leaderboard: require("@/assets/icons/leaderboard.png"),
  locker: require("@/assets/icons/locker.png"),
  mail: require("@/assets/icons/mail.png"),
  target: require("@/assets/icons/target.png"),
  settings: require("@/assets/icons/settings.png"),
  profile: require("@/assets/icons/profile.png"),
  messages: require("@/assets/icons/messages.png"),
  notifications: require("@/assets/icons/notifications.png"),
  close: require("@/assets/icons/close.png"),
  more: require("@/assets/icons/more.png"),
  back: require("@/assets/icons/back.png"),
  "add-swing-thought": require("@/assets/icons/add-swing-thought.png"),
  "post-score": require("@/assets/icons/post-score.png"),
  "add-club": require("@/assets/icons/add-club.png"),
  "start-round": require("@/assets/icons/start-round.png"),
  "leaderboard-filter": require("@/assets/icons/leaderboard-filter.png"),
  "leaderboard-sort": require("@/assets/icons/leaderboard-sort.png"),
};

export default function CustomIcon({ name, size = 24, color, style }: CustomIconProps) {
  const source = iconMap[name];

  if (!source) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }

  return (
    <Image
      source={source}
      style={[
        { width: size, height: size },
        color && { tintColor: color },
        style,
      ]}
      resizeMode="contain"
    />
  );
}