/**
 * Round Notifications — Helper functions for round lifecycle events
 *
 * Notification types:
 *   - round_invite:   "Ry Par started a round at Maple Hill" → open round viewer
 *   - round_complete: "Your round at Maple Hill is complete — you shot 84" → open summary
 *   - round_notable:  "Ry Par's group is on Hole 7 at Maple Hill" (throttled)
 *
 * Uses the existing notification pipeline:
 *   createNotificationDocument() → top-level `notifications` collection
 *   → triggers sendPushNotification via onDocumentCreated
 *
 * File: functions/src/notifications/roundNotifications.ts
 */

import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import {
    createNotificationDocument,
    generateGroupedMessage,
} from "./helpers";

const db = getFirestore();

// ============================================================================
// TYPES
// ============================================================================

export type RoundNotificationType = "round_invite" | "round_complete" | "round_notable";

export interface RoundNotificationParams {
  type: RoundNotificationType;
  recipientUserId: string;
  roundId: string;
  courseName: string;
  markerName: string;
  markerId?: string;
  markerAvatar?: string;
  grossScore?: number;
  holeNumber?: number;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export async function sendRoundNotification(params: RoundNotificationParams): Promise<void> {
  const {
    type,
    recipientUserId,
    roundId,
    courseName,
    markerName,
    markerId,
    markerAvatar,
    grossScore,
    holeNumber,
  } = params;

  // ── Build message using existing helper ───────────────────
  const message = generateGroupedMessage(type, markerName, 1, {
    courseName,
    holeNumber,
    message: grossScore
      ? `Your round at ${courseName} is complete — you shot ${grossScore}`
      : `Your round at ${courseName} is complete`,
  });

  // ── Write to top-level notifications collection ───────────
  // This triggers sendPushNotification via onDocumentCreated("notifications/{id}")
  try {
    await createNotificationDocument({
      userId: recipientUserId,
      type,
      actorId: markerId,
      actorName: markerName,
      actorAvatar: markerAvatar,
      courseName,
      message,
      // roundId is added to CreateNotificationParams
      roundId,
    });
  } catch (err) {
    logger.error(`Round notification failed for ${recipientUserId}:`, err);
  }
}

// ============================================================================
// ROUND INVITE — Notify all on-platform players when round starts
// ============================================================================

export async function sendRoundInviteNotifications(
  roundId: string,
  courseName: string,
  markerName: string,
  markerId: string,
  markerAvatar: string | undefined,
  playerIds: string[]
): Promise<void> {
  for (const playerId of playerIds) {
    await sendRoundNotification({
      type: "round_invite",
      recipientUserId: playerId,
      roundId,
      courseName,
      markerName,
      markerId,
      markerAvatar,
    });
  }
}

// ============================================================================
// THROTTLE HELPER — Prevent notification spam for live rounds
// ============================================================================

const THROTTLE_COLLECTION = "notificationThrottles";
const THROTTLE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Check if a notification should be throttled for a specific user + round.
 * Returns true if the notification should be SKIPPED (throttled).
 */
export async function isThrottled(
  userId: string,
  roundId: string,
  type: RoundNotificationType
): Promise<boolean> {
  const throttleKey = `${userId}_${roundId}_${type}`;
  const throttleRef = db.collection(THROTTLE_COLLECTION).doc(throttleKey);
  const throttleDoc = await throttleRef.get();

  if (throttleDoc.exists) {
    const lastSent = throttleDoc.data()?.lastSent?.toMillis?.() || 0;
    if (Date.now() - lastSent < THROTTLE_WINDOW_MS) {
      return true; // Throttled
    }
  }

  // Update throttle timestamp
  await throttleRef.set({
    lastSent: new Date(),
    userId,
    roundId,
    type,
  });

  return false; // Not throttled
}