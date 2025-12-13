import { auth } from "@/constants/firebaseConfig";
import { Redirect } from "expo-router";

export default function ProfileScreen() {
  const userId = auth.currentUser?.uid;

  if (!userId) {
    // If not logged in, redirect to login
    return <Redirect href="/auth/login" />;
  }

  // Redirect to the dynamic profile page with current user's ID
  return <Redirect href={`/profile/${userId}`} />;
}