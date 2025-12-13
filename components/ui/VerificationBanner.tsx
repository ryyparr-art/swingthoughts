import { StyleSheet, Text, View } from "react-native";

export default function VerificationBanner() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Read-Only Mode</Text>
      <Text style={styles.text}>
        Your account is pending verification.
        You can explore Swing Thoughts, but posting,
        commenting, and edits unlock after approval.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFF3CD",
    borderColor: "#FFECB5",
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#664D03",
    marginBottom: 4,
    textAlign: "center",
  },
  text: {
    fontSize: 14,
    color: "#664D03",
    textAlign: "center",
    lineHeight: 20,
  },
});
