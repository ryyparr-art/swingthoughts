import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Redirect } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

export default function ProfileScreen() {
  const userId = auth.currentUser?.uid;
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    const loadUserData = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        }
      } catch (error) {
        console.error("Error loading user data:", error);
        soundPlayer.play('error');
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [userId]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F4EED8" }}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  if (!userId) {
    return <Redirect href="/auth/login" />;
  }

  // If user is a Course, redirect to their course profile
  if (userData?.userType === "Course" && userData?.ownedCourseId) {
    return <Redirect href={`/profile/course/${userData.ownedCourseId}`} />;
  }

  // Redirect to the dynamic profile page with current user's ID
  return <Redirect href={`/profile/${userId}`} />;
}