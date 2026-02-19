/**
 * Ghost Claim Utility
 *
 * Handles claiming ghost scores when a new user signs up via a ghost invite link.
 * Called from deep link handler or post-signup flow.
 *
 * Flow:
 *   1. Ghost receives email/SMS with link: swingthoughts.com/claim/{token}
 *   2. Ghost opens app → signs up → this function runs
 *   3. Validates claim token in ghostClaims/{token}
 *   4. Batch-updates all ghost score docs: userId → real user, isGhost → false
 *   5. Marks claim as used
 *   6. Existing triggers (career stats, leaderboards, challenges) fire naturally
 *
 * File: utils/ghostClaim.ts
 */

import { db } from "@/constants/firebaseConfig";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    Timestamp,
    where,
    writeBatch,
} from "firebase/firestore";

// ============================================================================
// TYPES
// ============================================================================

export interface ClaimResult {
  success: boolean;
  scoresUpdated: number;
  courseName?: string;
  grossScore?: number;
  error?: string;
}

// ============================================================================
// CLAIM FUNCTION
// ============================================================================

/**
 * Claim ghost scores using a claim token.
 *
 * @param claimToken - The 32-char hex token from the invite URL
 * @param newUserId - The authenticated user's UID (from auth.currentUser.uid)
 * @returns ClaimResult with success status and updated score count
 */
export async function claimGhostScores(
  claimToken: string,
  newUserId: string
): Promise<ClaimResult> {
  try {
    // ── 1. Get the claim document ────────────────────────────────
    const claimRef = doc(db, "ghostClaims", claimToken);
    const claimSnap = await getDoc(claimRef);

    if (!claimSnap.exists()) {
      return { success: false, scoresUpdated: 0, error: "Invalid claim link." };
    }

    const claim = claimSnap.data();

    // ── 2. Validate claim state ──────────────────────────────────
    if (claim.claimed === true) {
      return {
        success: false,
        scoresUpdated: 0,
        error: "This invite has already been claimed.",
      };
    }

    if (claim.expiresAt) {
      const expiresDate =
        claim.expiresAt instanceof Timestamp
          ? claim.expiresAt.toDate()
          : new Date(claim.expiresAt);

      if (expiresDate < new Date()) {
        return { success: false, scoresUpdated: 0, error: "This invite has expired." };
      }
    }

    // ── 3. Find all ghost score docs from this round ─────────────
    const scoresQuery = query(
      collection(db, "scores"),
      where("roundId", "==", claim.roundId),
      where("isGhost", "==", true),
      where("ghostName", "==", claim.ghostName)
    );

    const scoresSnap = await getDocs(scoresQuery);

    if (scoresSnap.empty) {
      return {
        success: false,
        scoresUpdated: 0,
        error: "No scores found for this invite. They may have already been claimed.",
      };
    }

    // ── 4. Batch update: ghost → real user ───────────────────────
    const batch = writeBatch(db);
    let scoresUpdated = 0;

    for (const scoreDoc of scoresSnap.docs) {
      batch.update(scoreDoc.ref, {
        userId: newUserId,
        isGhost: false,
        ghostName: null,
        claimedAt: Timestamp.now(),
        claimToken,
      });
      scoresUpdated++;
    }

    // ── 5. Mark claim as used ────────────────────────────────────
    batch.update(claimRef, {
      claimed: true,
      claimedBy: newUserId,
      claimedAt: Timestamp.now(),
    });

    await batch.commit();

    console.log(
      `✅ Ghost claim successful: ${scoresUpdated} scores claimed for user ${newUserId}`
    );

    return {
      success: true,
      scoresUpdated,
      courseName: claim.courseName,
      grossScore: claim.grossScore,
    };
  } catch (err: any) {
    console.error("❌ Error claiming ghost scores:", err);
    return {
      success: false,
      scoresUpdated: 0,
      error: err.message || "Failed to claim scores. Please try again.",
    };
  }
}