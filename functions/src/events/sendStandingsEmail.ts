import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore();

/**
 * sendStandingsEmail
 *
 * Callable Cloud Function that sends standings update emails
 * to all active followers of an event.
 *
 * Called manually by admin/host when standings change, or could be
 * triggered automatically when round scores are finalized.
 *
 * Writes to the `mail` collection which the Firebase Send Email
 * extension picks up and delivers via SMTP.
 *
 * Usage:
 *   const sendStandingsEmail = httpsCallable(functions, "sendStandingsEmail");
 *   await sendStandingsEmail({ eventId: "pinehurst-six", roundName: "Round 1 — Southern Pines" });
 */
export const sendStandingsEmail = onCall(async (request) => {
  // Auth check — only signed-in users (host) can trigger
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }

  const { eventId, roundName, standings } = request.data as {
    eventId: string;
    roundName?: string;
    standings?: Array<{ position: number; name: string; score: string }>;
  };

  if (!eventId) {
    throw new HttpsError("invalid-argument", "eventId is required.");
  }

  // Get all active followers
  const followersSnap = await db
    .collection("eventFollowers")
    .doc(eventId)
    .collection("followers")
    .where("unsubscribed", "==", false)
    .get();

  if (followersSnap.empty) {
    return { success: true, emailsSent: 0, message: "No active followers." };
  }

  // Build standings HTML
  const standingsHtml = standings
    ? standings
        .map(
          (s) =>
            `<tr>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e5e0d5; font-weight: ${s.position <= 3 ? "bold" : "normal"};">
                ${s.position}
              </td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e5e0d5;">
                ${s.name}
              </td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #e5e0d5; text-align: right; color: #2A6F44; font-weight: bold;">
                ${s.score}
              </td>
            </tr>`
        )
        .join("")
    : `<tr><td style="padding: 16px; text-align: center; color: #666;">Standings updated — visit the page for details.</td></tr>`;

  const roundLabel = roundName || "Latest Update";

  // Send email to each follower
  const batch = db.batch();
  let emailCount = 0;

  followersSnap.docs.forEach((doc) => {
    const follower = doc.data();
    const unsubscribeUrl = `https://www.swingthoughts.app/events/pinehurst-six/unsubscribe?id=${doc.id}`;

    const mailRef = db.collection("mail").doc();
    batch.set(mailRef, {
      to: follower.email,
      message: {
        subject: `🏆 The Pinehurst Six — ${roundLabel}`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #FAF8F3; font-family: Georgia, 'Times New Roman', serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">

    <!-- Header -->
    <div style="background-color: #2A6F44; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
      <h1 style="color: #C9A24D; margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">
        Founding Event · Est. 2020
      </h1>
      <h2 style="color: white; margin: 8px 0 4px; font-size: 28px;">
        The Pinehurst Six
      </h2>
      <p style="color: #C9A24D; margin: 0; font-style: italic; font-size: 16px;">
        Playing for "The Mink"
      </p>
    </div>

    <!-- Round Update -->
    <div style="background-color: white; padding: 24px; border-left: 1px solid #e5e0d5; border-right: 1px solid #e5e0d5;">
      <h3 style="color: #2A6F44; margin: 0 0 4px; font-size: 20px;">
        ${roundLabel}
      </h3>
      <p style="color: #666; margin: 0 0 16px; font-size: 14px;">
        Hey ${follower.name}, here are the latest standings:
      </p>

      <!-- Standings Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="background-color: #EFE6D3;">
            <th style="padding: 8px 12px; text-align: left; color: #2A6F44; font-size: 12px; text-transform: uppercase;">#</th>
            <th style="padding: 8px 12px; text-align: left; color: #2A6F44; font-size: 12px; text-transform: uppercase;">Player</th>
            <th style="padding: 8px 12px; text-align: right; color: #2A6F44; font-size: 12px; text-transform: uppercase;">Score</th>
          </tr>
        </thead>
        <tbody>
          ${standingsHtml}
        </tbody>
      </table>
    </div>

    <!-- CTA -->
    <div style="background-color: #EFE6D3; padding: 24px; text-align: center; border-left: 1px solid #e5e0d5; border-right: 1px solid #e5e0d5;">
      <a href="https://www.swingthoughts.app/events/pinehurst-six"
         style="display: inline-block; background-color: #C9A24D; color: #1a1a1a; padding: 12px 32px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 14px;">
        View Full Standings
      </a>
      <p style="color: #666; margin: 16px 0 12px; font-size: 13px;">
        Want real-time updates as scores come in?
      </p>
      <a href="https://www.swingthoughts.app/#download"
         style="display: inline-block; background-color: #2A6F44; color: white; padding: 10px 28px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 13px;">
        Download Swing Thoughts
      </a>
    </div>

    <!-- Footer -->
    <div style="background-color: #1F5C38; padding: 20px; border-radius: 0 0 12px 12px; text-align: center;">
      <p style="color: white; margin: 0 0 8px; font-size: 12px; opacity: 0.8;">
        Powered by Swing Thoughts — Where Golfers and Their Stories Live
      </p>
      <a href="${unsubscribeUrl}"
         style="color: #C9A24D; font-size: 11px; text-decoration: underline;">
        Unsubscribe from standings updates
      </a>
    </div>

  </div>
</body>
</html>
        `,
      },
    });

    emailCount++;
  });

  await batch.commit();

  return {
    success: true,
    emailsSent: emailCount,
    message: `Sent ${emailCount} email(s) for ${roundLabel}.`,
  };
});