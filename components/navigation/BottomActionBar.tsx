import { Ionicons } from "@expo/vector-icons";
import { useRouter, useSegments } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function BottomActionBar() {
  const segments = useSegments();
  const router = useRouter();

  const current = segments[0] ?? "clubhouse";

  // Different actions based on active section
  const renderActions = () => {
    switch (current) {

      case "clubhouse":
        return (
          <>
            <TouchableOpacity onPress={() => router.push("/create")} style={styles.action}>
              <Ionicons name="add-circle-outline" size={32} color="#FFFFFF" />
              <Text style={styles.label}>Create</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/messages")} style={styles.action}>
              <Ionicons name="mail-outline" size={28} color="#FFFFFF" />
              <Text style={styles.label}>Fanmail</Text>
            </TouchableOpacity>
          </>
        );

      case "leaderboard":
        return (
          <>
            <TouchableOpacity onPress={() => router.push("/post-score")} style={styles.action}>
              <Ionicons name="golf-outline" size={30} color="#FFFFFF" />
              <Text style={styles.label}>Post Score</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/leaderboard-filters")} style={styles.action}>
              <Ionicons name="filter-outline" size={28} color="#FFFFFF" />
              <Text style={styles.label}>Filter</Text>
            </TouchableOpacity>
          </>
        );

      case "locker":
        return (
          <>
            <TouchableOpacity onPress={() => router.push("/profile/edit")} style={styles.action}>
              <Ionicons name="create-outline" size={30} color="#FFFFFF" />
              <Text style={styles.label}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/locker/add-club")} style={styles.action}>
              <Ionicons name="add-outline" size={28} color="#FFFFFF" />
              <Text style={styles.label}>Add Club</Text>
            </TouchableOpacity>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView edges={["bottom"]} style={styles.safe}>
      <View style={styles.container}>{renderActions()}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: "#0D5C3A",
  },
  container: {
    height: 70,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingBottom: 6,
    backgroundColor: "#0D5C3A",
    borderTopWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
  },
  action: {
    alignItems: "center",
  },
  label: {
    color: "#FFFFFF",
    fontSize: 12,
    marginTop: 2,
  },
});


