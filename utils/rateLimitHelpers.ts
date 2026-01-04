import { auth, db } from "@/constants/firebaseConfig";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";

// ============================================================================
// RATE LIMIT CONSTANTS (in seconds)
// ============================================================================

export const RATE_LIMITS = {
  POST: 30,     // 30 seconds between posts
  COMMENT: 5,   // 5 seconds between comments
  MESSAGE: 10,  // 10 seconds between messages
  SCORE: 60,    // 60 seconds between scores
};

// ============================================================================
// CHECK RATE LIMIT
// ============================================================================

export async function checkRateLimit(
  action: "post" | "comment" | "message" | "score"
): Promise<{ allowed: boolean; remainingSeconds: number }> {
  const userId = auth.currentUser?.uid;
  
  if (!userId) {
    return { allowed: false, remainingSeconds: 0 };
  }

  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    
    if (!userDoc.exists()) {
      return { allowed: true, remainingSeconds: 0 };
    }

    const userData = userDoc.data();
    const fieldMap = {
      post: "lastPostTime",
      comment: "lastCommentTime",
      message: "lastMessageTime",
      score: "lastScoreTime",
    };

    const lastTimeField = fieldMap[action];
    const lastTime = userData[lastTimeField];

    if (!lastTime) {
      // Never performed this action before
      return { allowed: true, remainingSeconds: 0 };
    }

    const now = Date.now();
    const lastTimeMs = lastTime.toDate().getTime();
    const limitMs = RATE_LIMITS[action.toUpperCase() as keyof typeof RATE_LIMITS] * 1000;
    const elapsedMs = now - lastTimeMs;

    if (elapsedMs >= limitMs) {
      return { allowed: true, remainingSeconds: 0 };
    }

    const remainingMs = limitMs - elapsedMs;
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    return { allowed: false, remainingSeconds };
  } catch (error) {
    console.error("Error checking rate limit:", error);
    // On error, allow the action (fail open)
    return { allowed: true, remainingSeconds: 0 };
  }
}

// ============================================================================
// UPDATE RATE LIMIT TIMESTAMP
// ============================================================================

export async function updateRateLimitTimestamp(
  action: "post" | "comment" | "message" | "score"
): Promise<void> {
  const userId = auth.currentUser?.uid;
  
  if (!userId) return;

  try {
    const fieldMap = {
      post: "lastPostTime",
      comment: "lastCommentTime",
      message: "lastMessageTime",
      score: "lastScoreTime",
    };

    const field = fieldMap[action];

    await updateDoc(doc(db, "users", userId), {
      [field]: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error updating rate limit timestamp:", error);
  }
}

// ============================================================================
// CHECK EMAIL VERIFICATION (FIRESTORE VERSION)
// ============================================================================

export async function isEmailVerified(): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;

  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) return false;
    
    // ✅ Check Firestore field instead of Firebase Auth token
    return userDoc.data()?.emailVerified === true;
  } catch (error) {
    console.error("Error checking email verification:", error);
    return false;
  }
}

// ============================================================================
// GET FRIENDLY ERROR MESSAGE
// ============================================================================

export function getRateLimitMessage(
  action: "post" | "comment" | "message" | "score",
  remainingSeconds: number
): string {
  const actionLabels = {
    post: "post",
    comment: "comment",
    message: "message",
    score: "log a score",
  };

  const label = actionLabels[action];

  if (remainingSeconds > 60) {
    const minutes = Math.ceil(remainingSeconds / 60);
    return `Please wait ${minutes} minute${minutes > 1 ? "s" : ""} before you ${label} again.`;
  }

  return `Please wait ${remainingSeconds} second${remainingSeconds > 1 ? "s" : ""} before you ${label} again.`;
}

// ============================================================================
// EMAIL VERIFICATION ERROR MESSAGE
// ============================================================================

export const EMAIL_VERIFICATION_MESSAGE = 
  "Please verify your email address before posting. Check your inbox for a verification email.";