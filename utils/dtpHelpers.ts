/**
 * DTP (Distance to Pin) Helpers
 *
 * Utilities for the Closest to Pin challenge scorecard integration.
 *
 * DTP Logic:
 *   - User must have "dtp" in activeChallenges
 *   - On scorecard, par 3 holes can show a DTP input field
 *   - If course has a designated hole → only that hole shows DTP input
 *   - If no designated hole yet → ALL par 3 holes show DTP (first entry sets designated)
 *   - Distance stored on score doc as dtpMeasurements: { [holeNumber]: distanceFt }
 *   - Cloud Functions handle pin claiming, holder updates, notifications
 *
 * File: utils/dtpHelpers.ts
 */

import { HoleInfo } from "@/components/leagues/post-score/types";
import { db } from "@/constants/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

export interface DtpCourseInfo {
  /** Whether a designated hole has been set for this course */
  hasDesignatedHole: boolean;
  /** The designated hole number (1-indexed), null if none set yet */
  designatedHole: number | null;
  /** Current pin holder userId */
  currentHolderId: string | null;
  /** Current pin holder display name */
  currentHolderName: string | null;
  /** Current closest distance in feet */
  currentDistance: number | null;
}

/**
 * Fetch DTP course info from Firestore.
 * Path: challenges/dtp/courses/{courseId}
 *
 * Returns null if no DTP data exists for this course yet,
 * meaning ALL par 3s are eligible (first entry sets designated hole).
 */
export async function getDtpCourseInfo(
  courseId: string | number
): Promise<DtpCourseInfo | null> {
  try {
    const courseRef = doc(db, "challenges", "dtp", "courses", String(courseId));
    const courseDoc = await getDoc(courseRef);

    if (!courseDoc.exists()) {
      return null;
    }

    const data = courseDoc.data();
    return {
      hasDesignatedHole: !!data.designatedHole,
      designatedHole: data.designatedHole ?? null,
      currentHolderId: data.currentHolderId ?? null,
      currentHolderName: data.currentHolderName ?? null,
      currentDistance: data.currentDistance ?? null,
    };
  } catch (error) {
    console.error("Error fetching DTP course info:", error);
    return null;
  }
}

/**
 * Determine which hole indexes (0-based) should show a DTP input field.
 *
 * Rules:
 *   - Only par 3 holes are eligible
 *   - If course has a designated hole → only that hole (converted to 0-indexed)
 *   - If no designated hole → all par 3 holes
 *
 * @returns Set of 0-based hole indexes that should show DTP input
 */
export function getDtpEligibleHoles(
  holes: HoleInfo[],
  holesCount: number,
  dtpCourseInfo: DtpCourseInfo | null
): Set<number> {
  const eligible = new Set<number>();

  if (dtpCourseInfo?.hasDesignatedHole && dtpCourseInfo.designatedHole) {
    // Only the designated hole (convert 1-indexed to 0-indexed)
    const idx = dtpCourseInfo.designatedHole - 1;
    if (idx >= 0 && idx < holesCount && holes[idx]?.par <= 3) {
      eligible.add(idx);
    }
  } else {
    // No designated hole yet — all par 3s are eligible
    for (let i = 0; i < holesCount; i++) {
      if (holes[i]?.par <= 3) {
        eligible.add(i);
      }
    }
  }

  return eligible;
}