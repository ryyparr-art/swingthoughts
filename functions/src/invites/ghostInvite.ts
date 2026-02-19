/**
 * Ghost Invite — Invite non-platform players to claim their scores
 *
 * After a round completes, ghost players with contact info receive:
 *   - Email (via Firestore `mail` collection → Firebase Trigger Email extension)
 *   - SMS (via Twilio — optional, skipped if not configured)
 *   - Deep link to download Swing Thoughts and claim their scores
 *   - Claim token stored in Firestore for matching on signup
 *
 * Email setup:
 *   Uses the "Trigger Email from Firestore" Firebase Extension.
 *   Install it and configure with your Google Workspace SMTP:
 *     SMTP host: smtp.gmail.com
 *     SMTP port: 587
 *     SMTP user: your-email@yourdomain.com
 *     SMTP password: Google App Password (not your regular password)
 *   The extension watches the `mail` collection — any doc written there
 *   gets sent automatically.
 *
 * Claim flow:
 *   1. Ghost taps deep link: swingthoughts.com/claim/{claimToken}
 *   2. New user signs up → claim flow matches token to ghost scores
 *   3. Score docs updated: userId → new user, isGhost → false
 *   4. Career stats, leaderboards, challenges retroactively fire
 *
 * File: functions/src/invites/ghostInvite.ts
 */

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import * as crypto from "crypto";

const db = getFirestore();

// ============================================================================
// TYPES
// ============================================================================

export interface GhostInviteParams {
  roundId: string;
  ghostName: string;
  contactInfo: string;
  contactType: "phone" | "email";
  courseName: string;
  grossScore: number;
  markerName: string;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

export async function sendGhostInvite(params: GhostInviteParams): Promise<void> {
  const { roundId, ghostName, contactInfo, contactType, courseName, grossScore, markerName } =
    params;

  // ── 1. Generate claim token ───────────────────────────────
  const claimToken = crypto.randomBytes(16).toString("hex");
  const deepLink = `https://swingthoughts.com/claim/${claimToken}`;

  // ── 2. Store claim token in Firestore ─────────────────────
  await db.collection("ghostClaims").doc(claimToken).set({
    roundId,
    ghostName,
    contactInfo,
    contactType,
    courseName,
    grossScore,
    markerName,
    claimToken,
    claimed: false,
    claimedBy: null,
    createdAt: Timestamp.now(),
    // Expire after 90 days
    expiresAt: Timestamp.fromMillis(Date.now() + 90 * 24 * 60 * 60 * 1000),
  });

  logger.info(
    `Claim token ${claimToken} created for ghost ${ghostName} (${contactType}: ${contactInfo})`
  );

  // ── 3. Send message ───────────────────────────────────────
  if (contactType === "email") {
    await sendEmail(contactInfo, ghostName, courseName, grossScore, markerName, deepLink);
  } else {
    await sendSMS(contactInfo, ghostName, courseName, grossScore, markerName, deepLink);
  }
}

// ============================================================================
// EMAIL — Via Firestore `mail` collection (Firebase Trigger Email extension)
// ============================================================================

async function sendEmail(
  email: string,
  ghostName: string,
  courseName: string,
  grossScore: number,
  markerName: string,
  deepLink: string
): Promise<void> {
  try {
    // Writing to the `mail` collection triggers the Firebase extension
    // which sends the email via your configured SMTP (Google Workspace)
    await db.collection("mail").add({
      to: email,
      message: {
        subject: `Your round at ${courseName} — ${grossScore}`,
        html: buildEmailHtml(ghostName, courseName, grossScore, markerName, deepLink),
      },
    });

    logger.info(`Email queued for ${email} (ghost: ${ghostName})`);
  } catch (err) {
    logger.error(`Email queue failed for ${email}:`, err);
    throw err;
  }
}

/**
 * Build heritage-themed HTML email for ghost invite.
 */
function buildEmailHtml(
  ghostName: string,
  courseName: string,
  grossScore: number,
  markerName: string,
  deepLink: string
): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 500px; margin: 0 auto; background: #F4EED8; padding: 32px; border-radius: 12px;">
      <div style="background: #4A3628; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 24px;">
        <h1 style="color: #C5A55A; margin: 0; font-size: 24px;">⛳ Swing Thoughts</h1>
      </div>

      <p style="color: #333; font-size: 16px; line-height: 1.6;">
        Hey <strong>${ghostName}</strong>,
      </p>

      <p style="color: #333; font-size: 16px; line-height: 1.6;">
        <strong>${markerName}</strong> scored your round at <strong>${courseName}</strong>.
      </p>

      <div style="background: #FFF; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <p style="color: #888; font-size: 12px; margin: 0; text-transform: uppercase; letter-spacing: 1px;">Your Score</p>
        <p style="color: #4A3628; font-size: 48px; font-weight: 700; margin: 8px 0 0 0; font-family: Georgia, serif;">${grossScore}</p>
      </div>

      <p style="color: #333; font-size: 16px; line-height: 1.6;">
        Claim your scores on Swing Thoughts — track your handicap, compete in challenges, and play with friends.
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${deepLink}" style="background: #0D5C3A; color: #FFF; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 16px; display: inline-block;">
          Claim Your Scores
        </a>
      </div>

      <p style="color: #999; font-size: 12px; text-align: center;">
        Swing Thoughts — The Golf Social Network
      </p>
    </div>
  `;
}

// ============================================================================
// SMS — Via Twilio (optional — skipped if not configured)
// ============================================================================

async function sendSMS(
  phone: string,
  ghostName: string,
  courseName: string,
  grossScore: number,
  markerName: string,
  deepLink: string
): Promise<void> {
  // Check if Twilio credentials exist in environment
  const twilioSid = process.env.TWILIO_SID;
  const twilioToken = process.env.TWILIO_TOKEN;
  const twilioFrom = process.env.TWILIO_FROM;

  if (!twilioSid || !twilioToken || !twilioFrom) {
    // Twilio not configured — fall back to email-style Firestore doc
    // so you can see the invite was attempted
    logger.warn("Twilio not configured — logging ghost SMS invite to ghostClaims only");
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const twilio = require("twilio") as any;
    const client = twilio(twilioSid, twilioToken);

    const message = [
      `⛳ Hey ${ghostName}!`,
      ``,
      `${markerName} scored your round at ${courseName} — you shot ${grossScore}.`,
      ``,
      `Download Swing Thoughts to save your scores, track your handicap, and play with friends:`,
      deepLink,
    ].join("\n");

    await client.messages.create({
      body: message,
      from: twilioFrom,
      to: phone,
    });

    logger.info(`SMS sent to ${phone} for ghost ${ghostName}`);
  } catch (err) {
    logger.error(`Twilio SMS failed for ${phone}:`, err);
    throw err;
  }
}

// ============================================================================
// CLAIM GHOST SCORES (called during new user signup)
// ============================================================================

/**
 * Claim ghost scores for a new user.
 * Called from the signup flow when a claim token is present in the deep link.
 *
 * Updates:
 *   - ghostClaims doc: claimed → true, claimedBy → userId
 *   - All score docs where isGhost=true and roundId matches: userId → new, isGhost → false
 *   - Career stats, leaderboards, challenges will fire via existing onScoreUpdate triggers
 */
export async function claimGhostScores(
  claimToken: string,
  newUserId: string
): Promise<{ success: boolean; scoresUpdated: number }> {
  const claimRef = db.collection("ghostClaims").doc(claimToken);
  const claimDoc = await claimRef.get();

  if (!claimDoc.exists) {
    logger.warn(`Claim token ${claimToken} not found`);
    return { success: false, scoresUpdated: 0 };
  }

  const claimData = claimDoc.data()!;

  if (claimData.claimed) {
    logger.warn(`Claim token ${claimToken} already claimed`);
    return { success: false, scoresUpdated: 0 };
  }

  // Check expiry
  const expiresAt = claimData.expiresAt?.toMillis?.() || 0;
  if (Date.now() > expiresAt) {
    logger.warn(`Claim token ${claimToken} expired`);
    return { success: false, scoresUpdated: 0 };
  }

  // Find all ghost score docs from this round
  const scoresSnap = await db
    .collection("scores")
    .where("roundId", "==", claimData.roundId)
    .where("isGhost", "==", true)
    .where("ghostName", "==", claimData.ghostName)
    .get();

  const batch = db.batch();
  let updated = 0;

  for (const scoreDoc of scoresSnap.docs) {
    batch.update(scoreDoc.ref, {
      userId: newUserId,
      isGhost: false,
      ghostName: null,
      claimedAt: Timestamp.now(),
      claimToken,
    });
    updated++;
  }

  // Mark claim as used
  batch.update(claimRef, {
    claimed: true,
    claimedBy: newUserId,
    claimedAt: Timestamp.now(),
  });

  await batch.commit();

  logger.info(
    `Ghost claim ${claimToken}: ${updated} scores transferred to user ${newUserId}`
  );

  return { success: true, scoresUpdated: updated };
}