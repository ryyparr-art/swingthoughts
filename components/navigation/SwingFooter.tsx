import { Image, StyleSheet, View } from "react-native";

export default function SwingFooter() {
  return (
    <View style={styles.footerContainer}>
      <Image
        source={require("@/assets/images/Footer.png")}
        style={styles.footerLogo}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  footerContainer: {
    width: "100%",
    backgroundColor: "#0D5C3A",
    paddingVertical: 1,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: "#D9CBA3",
    height: 44,
  },
  footerLogo: {
    width: 300,
    height: 42,
    tintColor: "#F4EED8", // Applies the cream color to the logo
  },
});