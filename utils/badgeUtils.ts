import { db } from "@/constants/firebaseConfig";
import {
    arrayUnion,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    updateDoc,
    where,
} from "firebase/firestore";

/**
 * Badge Types
 */
export type BadgeType = "lowman" | "scratch" | "ace" | "holeinone";

export interface Badge {
  type: BadgeType;
  courseId: number;
  courseName: string;
  achievedAt: Date;
  score?: number;
  displayName: string;
}

/**
 * Check and award badges after a score is posted
 */
export async function checkAndAwardBadges(
  userId: string,
  courseId: number,
  courseName: string,
  grossScore: number,
  hadHoleInOne: boolean = false
): Promise<Badge[]> {
  const newBadges: Badge[] = [];

  try {
    // 1. Check for Hole-in-One first
    if (hadHoleInOne) {
      const holeInOneBadge: Badge = {
        type: "holeinone",
        courseId,
        courseName,
        achievedAt: new Date(),
        displayName: "Hole-in-One",
      };
      
      await awardBadge(userId, holeInOneBadge);
      newBadges.push(holeInOneBadge);
      console.log("🏆 Awarded Hole-in-One badge!");
    }

    // 2. Check for Lowman (lowest score on this course)
    const isLowman = await checkIsLowman(userId, courseId, grossScore);
    
    if (isLowman) {
      console.log("🎯 User got lowman on", courseName);
      
      // Update course_leaders
      await updateCourseLowman(userId, courseId, courseName, grossScore);
      
      // Add lowman badge to user
      const lowmanBadge: Badge = {
        type: "lowman",
        courseId,
        courseName,
        achievedAt: new Date(),
        score: grossScore,
        displayName: "Lowman",
      };
      
      await awardBadge(userId, lowmanBadge);
      newBadges.push(lowmanBadge);
      
      // 3. Check for tier upgrades (Scratch/Ace)
      const lowmanCount = await getLowmanCount(userId);
      console.log("📊 User has lowman at", lowmanCount, "courses");
      
      if (lowmanCount >= 3) {
        // Award Ace (3+ courses)
        const aceBadge: Badge = {
          type: "ace",
          courseId: 0, // Not course-specific
          courseName: "Multiple Courses",
          achievedAt: new Date(),
          displayName: "Ace",
        };
        
        await awardBadge(userId, aceBadge);
        newBadges.push(aceBadge);
        console.log("🏆 Upgraded to Ace badge!");
        
      } else if (lowmanCount >= 2) {
        // Award Scratch (2+ courses)
        const scratchBadge: Badge = {
          type: "scratch",
          courseId: 0, // Not course-specific
          courseName: "Multiple Courses",
          achievedAt: new Date(),
          displayName: "Scratch",
        };
        
        await awardBadge(userId, scratchBadge);
        newBadges.push(scratchBadge);
        console.log("🏆 Upgraded to Scratch badge!");
      }
    }
  } catch (error) {
    console.error("❌ Error checking/awarding badges:", error);
  }

  return newBadges;
}

/**
 * Check if this score is the lowest on the course
 */
async function checkIsLowman(
  userId: string,
  courseId: number,
  grossScore: number
): Promise<boolean> {
  try {
    // Get all scores for this course
    const scoresQuery = query(
      collection(db, "scores"),
      where("courseId", "==", courseId)
    );
    
    const scoresSnap = await getDocs(scoresQuery);
    
    // Check if this is the lowest score (excluding current user's other scores)
    let isLowest = true;
    
    for (const scoreDoc of scoresSnap.docs) {
      const scoreData = scoreDoc.data();
      
      // Skip if it's the same user (they're updating their own lowman)
      if (scoreData.userId === userId) continue;
      
      // If someone else has a lower or equal score, not lowman
      if (scoreData.grossScore <= grossScore) {
        isLowest = false;
        break;
      }
    }
    
    return isLowest;
  } catch (error) {
    console.error("Error checking lowman:", error);
    return false;
  }
}

/**
 * Update the course_leaders collection with new lowman
 */
async function updateCourseLowman(
  userId: string,
  courseId: number,
  courseName: string,
  grossScore: number
): Promise<void> {
  try {
    // Get user data
    const userDoc = await getDoc(doc(db, "users", userId));
    const userData = userDoc.data();
    
    const courseLeaderRef = doc(db, "course_leaders", courseId.toString());
    
    await setDoc(
      courseLeaderRef,
      {
        courseId,
        courseName,
        lowman: {
          userId,
          displayName: userData?.displayName || "Player",
          netScore: grossScore - (userData?.handicap || 0),
          achievedAt: new Date(),
        },
      },
      { merge: true }
    );
    
    console.log("✅ Updated course_leaders for course", courseId);
  } catch (error) {
    console.error("Error updating course lowman:", error);
  }
}

/**
 * Add badge to user's Badges array
 */
async function awardBadge(userId: string, badge: Badge): Promise<void> {
  try {
    const userRef = doc(db, "users", userId);
    
    // Check if badge already exists (avoid duplicates for tier badges)
    const userDoc = await getDoc(userRef);
    const existingBadges = userDoc.data()?.Badges || [];
    
    // For tier badges (scratch/ace), remove lower tiers
    if (badge.type === "scratch" || badge.type === "ace") {
      // Filter out any existing tier badges
      const filteredBadges = existingBadges.filter((b: any) => 
        b.type !== "scratch" && b.type !== "ace"
      );
      
      // Update with filtered badges plus new badge
      await updateDoc(userRef, {
        Badges: [...filteredBadges, badge],
      });
    } else {
      // For course-specific badges (lowman, holeinone), use arrayUnion
      await updateDoc(userRef, {
        Badges: arrayUnion(badge),
      });
    }
    
    console.log("✅ Awarded badge:", badge.displayName);
  } catch (error) {
    console.error("Error awarding badge:", error);
  }
}

/**
 * Get count of unique courses where user has lowman
 */
async function getLowmanCount(userId: string): Promise<number> {
  try {
    // Query all course_leaders where user is lowman
    const leadersQuery = query(
      collection(db, "course_leaders"),
      where("lowman.userId", "==", userId)
    );
    
    const leadersSnap = await getDocs(leadersQuery);
    return leadersSnap.size;
  } catch (error) {
    console.error("Error getting lowman count:", error);
    return 0;
  }
}