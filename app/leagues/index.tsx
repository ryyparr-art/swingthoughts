/**
 * League Hub - Entry point / Router
 * 
 * Checks if user has leagues and redirects:
 * - Has leagues → /leagues/home
 * - No leagues → /leagues/explore
 */

import { auth, db } from "@/constants/firebaseConfig";
import { Redirect } from "expo-router";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
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
      // Check if user is a member of any league
      const leaguesSnap = await getDocs(collection(db, "leagues"));
      
      for (const leagueDoc of leaguesSnap.docs) {
        // Check if user document exists in members subcollection
        const memberDoc = await getDoc(
          doc(db, "leagues", leagueDoc.id, "members", currentUserId)
        );
        
        if (memberDoc.exists()) {
          setHasLeagues(true);
          break;
        }
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Error checking leagues:", error);
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

  // Redirect based on whether user has leagues
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