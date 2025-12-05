import { StyleSheet, Text, View } from "react-native";

export default function AddClubScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Add Club Screen</Text>
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
