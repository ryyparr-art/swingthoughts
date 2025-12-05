import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";
import { StyleSheet, TouchableOpacity, View } from "react-native";

export default function TopNavBar() {
  const router = useRouter();
  const segments = useSegments();
  const current = segments[0] ?? "clubhouse";

  const iconColor = (name: string) =>
    current === name ? "#FFFFFF" : "#111111";

  return (
    <View style={styles.container}>
      
      <TouchableOpacity onPress={() => router.push("/clubhouse")}>
        <Ionicons name="flag-outline" size={26} color={iconColor("clubhouse")} />
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/leaderboard")}>
        <Ionicons name="stats-chart-outline" size={26} color={iconColor("leaderboard")} />
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/locker")}>
        <Ionicons name="briefcase-outline" size={26} color={iconColor("locker")} />
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 64,
    backgroundColor: "#0D5C3A", // Swing Thoughts green
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 40,
  },
});
