import { db } from "@/constants/firebaseConfig";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";

/**
 * MIGRATION SCRIPT: Add Anti-Bot Fields to Existing Users
 * 
 * Run this ONCE after deploying anti-bot features.
 * This adds required fields to all existing user documents.
 */

export async function migrateUsersForAntiBotFeatures(): Promise<{
  success: boolean;
  migratedCount: number;
  errors: number;
}> {
  try {
    console.log("🔄 Starting user migration for anti-bot features...");

    // Get all users
    const usersSnapshot = await getDocs(collection(db, "users"));
    
    if (usersSnapshot.empty) {
      console.log("✅ No users to migrate");
      return { success: true, migratedCount: 0, errors: 0 };
    }

    console.log(`📊 Found ${usersSnapshot.size} users to migrate`);

    // Firestore allows max 500 operations per batch
    const batchSize = 500;
    let currentBatch = writeBatch(db);
    let batchCount = 0;
    let totalMigrated = 0;
    let errors = 0;

    for (const userDoc of usersSnapshot.docs) {
      try {
        const userData = userDoc.data();
        const updates: any = {};

        // Add displayNameLower if displayName exists but displayNameLower doesn't
        if (userData.displayName && !userData.displayNameLower) {
          updates.displayNameLower = userData.displayName.toLowerCase().trim();
        }

        // Add rate limit timestamps if they don't exist
        if (!("lastPostTime" in userData)) {
          updates.lastPostTime = null;
        }
        if (!("lastCommentTime" in userData)) {
          updates.lastCommentTime = null;
        }
        if (!("lastMessageTime" in userData)) {
          updates.lastMessageTime = null;
        }
        if (!("lastScoreTime" in userData)) {
          updates.lastScoreTime = null;
        }

        // Add ban status if it doesn't exist
        if (!("banned" in userData)) {
          updates.banned = false;
        }

        // Only update if there are changes
        if (Object.keys(updates).length > 0) {
          currentBatch.update(doc(db, "users", userDoc.id), updates);
          batchCount++;
          totalMigrated++;

          console.log(`✅ Queued user ${userDoc.id} for migration (${Object.keys(updates).length} fields)`);
        }

        // Commit batch if we've reached the limit
        if (batchCount >= batchSize) {
          await currentBatch.commit();
          console.log(`💾 Committed batch of ${batchCount} users`);
          currentBatch = writeBatch(db);
          batchCount = 0;
        }
      } catch (error) {
        console.error(`❌ Error processing user ${userDoc.id}:`, error);
        errors++;
      }
    }

    // Commit remaining batch
    if (batchCount > 0) {
      await currentBatch.commit();
      console.log(`💾 Committed final batch of ${batchCount} users`);
    }

    console.log(`
✅ Migration complete!
📊 Total users migrated: ${totalMigrated}
❌ Errors: ${errors}
    `);

    return { success: true, migratedCount: totalMigrated, errors };
  } catch (error) {
    console.error("❌ Migration failed:", error);
    return { success: false, migratedCount: 0, errors: 1 };
  }
}

/**
 * Check if migration is needed
 */
export async function checkMigrationStatus(): Promise<{
  needsMigration: boolean;
  usersWithoutFields: number;
  totalUsers: number;
}> {
  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    let usersWithoutFields = 0;

    usersSnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Check if user is missing any anti-bot fields
      if (
        (data.displayName && !data.displayNameLower) ||
        !("lastPostTime" in data) ||
        !("lastCommentTime" in data) ||
        !("lastMessageTime" in data) ||
        !("lastScoreTime" in data) ||
        !("banned" in data)
      ) {
        usersWithoutFields++;
      }
    });

    return {
      needsMigration: usersWithoutFields > 0,
      usersWithoutFields,
      totalUsers: usersSnapshot.size,
    };
  } catch (error) {
    console.error("Error checking migration status:", error);
    return {
      needsMigration: false,
      usersWithoutFields: 0,
      totalUsers: 0,
    };
  }
}