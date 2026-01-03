import * as Haptics from "expo-haptics";
import { useRouter, useSegments } from "expo-router";
import { Image, StyleSheet, TouchableOpacity, View } from "react-native";

export default function TopNavBar() {
  const router = useRouter();
  const segments = useSegments();
  const current = segments[0] ?? "clubhouse";

  const getIconStyle = (name: string) => {
    const baseStyle = current === name ? styles.iconActive : styles.iconInactive;
    
    // Individual size adjustments to make icons appear uniform
    switch(name) {
      case "clubhouse":
        return [styles.iconClubhouse, baseStyle];
      case "leaderboard":
        return [styles.iconLeaderboard, baseStyle];
      case "locker":
        return [styles.iconLocker, baseStyle];
      default:
        return [styles.iconBase, baseStyle];
    }
  };

  const handleNavigation = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(route as any);
  };

  return (
    <View style={styles.container}>
      
      <TouchableOpacity onPress={() => handleNavigation("/clubhouse")}>
        <Image 
          source={require("@/assets/icons/Clubhouse.png")} 
          style={getIconStyle("clubhouse")}
          resizeMode="contain"
        />
      </TouchableOpacity>

      <TouchableOpacity 
        onPress={() => handleNavigation("/leaderboard")}
        style={styles.leaderboardButton}
      >
        <Image 
          source={require("@/assets/icons/Leaderboard.png")} 
          style={getIconStyle("leaderboard")}
          resizeMode="contain"
        />
      </TouchableOpacity>

      <TouchableOpacity onPress={() => handleNavigation("/locker")}>
        <Image 
          source={require("@/assets/icons/Locker.png")} 
          style={getIconStyle("locker")}
          resizeMode="contain"
        />
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 64,
    backgroundColor: "#0D5C3A",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  leaderboardButton: {
    marginRight: 12, // Pull leaderboard left
  },
  iconBase: {
    width: 42,
    height: 42,
  },
  // Individual icon sizes - adjust these values to make them appear uniform
  iconClubhouse: {
    width: 54,  // Slightly larger to compensate for shorter appearance
    height: 54,
  },
  iconLeaderboard: {
    width: 42,
    height: 42,
  },
  iconLocker: {
    width: 42,
    height: 42,
  },
  iconActive: {
    tintColor: "#FFFFFF", // White when active
  },
  iconInactive: {
    tintColor: "rgba(255, 255, 255, 0.65)", // Darker gray when inactive
  },
});