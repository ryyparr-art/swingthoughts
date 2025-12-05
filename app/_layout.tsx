import { Stack } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import BottomActionBar from "../components/navigation/BottomActionBar";
import LowmanCarousel from "../components/navigation/LowmanCarousel";
import TopNavBar from "../components/navigation/TopNavBar";

export default function RootLayout() {
  return (
    <View style={{ flex: 1 }}>
      
      {/* TOP AREA */}
      <SafeAreaView edges={["top"]} style={{ backgroundColor: "#F4EED8" }}>
        <LowmanCarousel />
        <TopNavBar />
      </SafeAreaView>

      {/* SCREEN CONTENT */}
      <Stack screenOptions={{ headerShown: false }} />

      {/* BOTTOM ACTION BAR */}
      <BottomActionBar />

    </View>
  );
}






