import { StyleSheet, Text, View } from "react-native";

export default function LeaderboardFiltersScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Leaderboard Filters Screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    fontSize: 22,
    fontWeight: "600",
  },
});
