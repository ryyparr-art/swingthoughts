/**
 * League Hub - Entry point / Router
 *
 * Checks if user has leagues and redirects:
 * - Has leagues → /leagues/home
 * - No leagues → /leagues/explore
 *
 * Reads leagueIds[] from user doc — single read, no collection group query.
 */

import { auth, db } from "@/constants/firebaseConfig";
import { Redirect } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

export default function LeagueHubRouter() {
  const [loading, setLoading] = useState(true);
  const [hasLeagues, setHasLeagues] = useState(false);
  const currentUserId = auth.currentUser?.uid;

  useEffect(() => {
    checkUserLeagues();
  }, [currentUserId]);

  const checkUserLeagues = async () => {
    if (!currentUserId) {
      setLoading(false);
      return;
    }

    try {
      const userSnap = await getDoc(doc(db, "users", currentUserId));
      const leagueIds: string[] = userSnap.data()?.leagueIds || [];
      setHasLeagues(leagueIds.length > 0);
    } catch (error) {
      console.error("Error checking leagues:", error);
      setHasLeagues(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  if (hasLeagues) {
    return <Redirect href="/leagues/home" />;
  } else {
    return <Redirect href="/leagues/explore" />;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F8F0",
    justifyContent: "center",
    alignItems: "center",
  },
});