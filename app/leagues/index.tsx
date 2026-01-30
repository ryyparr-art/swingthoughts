/**
 * League Hub - Entry point / Router
 *
 * Checks if user has leagues and redirects:
 * - Has leagues → /leagues/home
 * - No leagues → /leagues/explore
 *
 * Uses collection group query for efficient membership check
 */

import { auth, db } from "@/constants/firebaseConfig";
import { Redirect } from "expo-router";
import {
  collectionGroup,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
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
      // Collection group query - finds user in ANY league's members subcollection
      // Much more efficient than querying each league individually
      // NOTE: Requires Firestore rule: match /{path=**}/members/{memberId} { allow read, list: if isSignedIn(); }
      const membersQuery = query(
        collectionGroup(db, "members"),
        where("userId", "==", currentUserId),
        limit(1)
      );

      const snap = await getDocs(membersQuery);
      setHasLeagues(!snap.empty);
    } catch (error) {
      console.error("Error checking leagues:", error);
      // On error, default to explore page
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