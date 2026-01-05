import { db } from "@/constants/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

/**
 * User profile data with safe defaults for deleted users
 */
export interface UserProfile {
  userId: string;
  displayName: string;
  avatar: string | null;
  email: string;
  handicap?: string | number;
  userType?: string;
  accountPrivacy?: "public" | "private";
  deleted?: boolean;
  // Add other fields as needed
  [key: string]: any;
}

/**
 * Fetch user profile with automatic fallback for deleted users
 * 
 * @param userId - The user ID to fetch
 * @returns UserProfile object with safe defaults if user is deleted
 * 
 * @example
 * const user = await getUserProfile(userId);
 * console.log(user.displayName); // "[Deleted User]" if deleted, real name otherwise
 */
export async function getUserProfile(userId: string): Promise<UserProfile> {
  try {
    const userDoc = await getDoc(doc(db, "users", userId));
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      
      // Return actual user data
      return {
        userId,
        displayName: data.displayName || "Unknown User",
        avatar: data.avatar || null,
        email: data.email || "",
        handicap: data.handicap,
        userType: data.userType,
        accountPrivacy: data.accountPrivacy,
        deleted: data.deleted || false,
        ...data, // Include all other fields
      };
    } else {
      // User document doesn't exist (deleted account)
      return getDeletedUserProfile(userId);
    }
  } catch (error) {
    console.error(`Error fetching user profile for ${userId}:`, error);
    // Return deleted user profile on error
    return getDeletedUserProfile(userId);
  }
}

/**
 * Batch fetch multiple user profiles with fallback handling
 * More efficient than calling getUserProfile multiple times
 * 
 * @param userIds - Array of user IDs to fetch
 * @returns Map of userId to UserProfile
 * 
 * @example
 * const userMap = await batchGetUserProfiles([userId1, userId2, userId3]);
 * console.log(userMap.get(userId1)?.displayName);
 */
export async function batchGetUserProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
  const profileMap = new Map<string, UserProfile>();
  
  if (userIds.length === 0) return profileMap;

  try {
    // Fetch all user documents in parallel
    const fetchPromises = userIds.map(async (userId) => {
      try {
        const userDoc = await getDoc(doc(db, "users", userId));
        
        if (userDoc.exists()) {
          const data = userDoc.data();
          return {
            userId,
            profile: {
              userId,
              displayName: data.displayName || "Unknown User",
              avatar: data.avatar || null,
              email: data.email || "",
              handicap: data.handicap,
              userType: data.userType,
              accountPrivacy: data.accountPrivacy,
              deleted: data.deleted || false,
              ...data,
            } as UserProfile,
          };
        } else {
          // User deleted
          return {
            userId,
            profile: getDeletedUserProfile(userId),
          };
        }
      } catch (error) {
        console.error(`Error fetching user ${userId}:`, error);
        return {
          userId,
          profile: getDeletedUserProfile(userId),
        };
      }
    });

    const results = await Promise.all(fetchPromises);
    
    results.forEach(({ userId, profile }) => {
      profileMap.set(userId, profile);
    });

    return profileMap;
  } catch (error) {
    console.error("Error in batchGetUserProfiles:", error);
    
    // Return deleted profiles for all users on error
    userIds.forEach((userId) => {
      profileMap.set(userId, getDeletedUserProfile(userId));
    });
    
    return profileMap;
  }
}

/**
 * Get a safe profile object for deleted users
 * 
 * @param userId - The user ID
 * @returns UserProfile with [Deleted User] defaults
 */
function getDeletedUserProfile(userId: string): UserProfile {
  return {
    userId,
    displayName: "[Deleted User]",
    avatar: null,
    email: "",
    handicap: "N/A",
    userType: "Golfer",
    accountPrivacy: "private",
    deleted: true,
  };
}

/**
 * Check if a user profile represents a deleted user
 * 
 * @param profile - UserProfile object
 * @returns true if user is deleted
 */
export function isDeletedUser(profile: UserProfile): boolean {
  return profile.deleted === true || profile.displayName === "[Deleted User]";
}