import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function LowmanCarousel() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={{ paddingHorizontal: 12 }}
    >
      {/* Temporary placeholders — will later be dynamic */}
      <View style={styles.badge}><Text style={styles.text}>Lowman - Oaks GC</Text></View>
      <View style={styles.badge}><Text style={styles.text}>Lowman - Valhalla</Text></View>
      <View style={styles.badge}><Text style={styles.text}>Lowman - Pebble</Text></View>
      <View style={styles.badge}><Text style={styles.text}>Lowman - Pinehurst</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F4EED8", // cream scorecard color
    paddingVertical: 8,
  },
  badge: {
    backgroundColor: "#0D5C3A", // dark green accent
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 10,
  },
  text: {
    color: "white",
    fontWeight: "600",
    fontSize: 13,
  },
});
