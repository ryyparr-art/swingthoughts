import * as Haptics from "expo-haptics";
import { Image, StyleSheet, TouchableOpacity, View } from "react-native";

interface Props {
  onPress: () => void;
  hasFilters?: boolean;
}

export default function FilterFAB({ onPress, hasFilters = false }: Props) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <Image
        source={require("@/assets/icons/Leaderboard Sort.png")}
        resizeMode="contain"
        style={[
          styles.icon,
          { tintColor: hasFilters ? "#FFD700" : "#FFFFFF" } // ✅ ONLY CHANGE
        ]}
      />

      {hasFilters && (
        <View style={styles.badge}>
          <View style={styles.badgeDot} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    bottom: 120,
    right: 20,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#0D5C3A",
    opacity: 0.85,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  icon: {
    width: 28,
    height: 28,
    tintColor: "#FFFFFF", // default
  },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFD700",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF6B00",
  },
});


