/**
 * Invitational Hub - Entry point / Router
 *
 * Checks if user has invitationals and redirects:
 * - Has invitationals → /invitationals/home
 * - No invitationals → /invitationals/create
 */

import { auth, db } from "@/constants/firebaseConfig";
import { Redirect } from "expo-router";
import {
  collection,
  getDocs,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

export default function InvitationalHubRouter() {
  const [loading, setLoading] = useState(true);
  const [hasInvitationals, setHasInvitationals] = useState(false);
  const currentUserId = auth.currentUser?.uid;

  useEffect(() => {
    checkUserInvitationals();
  }, [currentUserId]);

  const checkUserInvitationals = async () => {
    if (!currentUserId) {
      setLoading(false);
      return;
    }

    try {
      const snap = await getDocs(collection(db, "invitationals"));
      const found = snap.docs.some((doc) => {
        const data = doc.data();
        if (data.hostUserId === currentUserId && data.status !== "cancelled") return true;
        const roster = data.roster || [];
        return roster.some(
          (r: any) =>
            r.userId === currentUserId &&
            data.status !== "cancelled"
        );
      });

      setHasInvitationals(found);
    } catch (error) {
      console.error("Error checking invitationals:", error);
      setHasInvitationals(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#B8860B" />
      </View>
    );
  }

  if (hasInvitationals) {
    return <Redirect href={"/invitationals/home" as any} />;
  } else {
    return <Redirect href={"/invitationals/create" as any} />;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
    justifyContent: "center",
    alignItems: "center",
  },
});