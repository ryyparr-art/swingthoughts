/**
 * Test Harness Setup
 *
 * Connects to Firebase Emulator Suite for safe, isolated testing.
 * Never touches production Firestore or Functions.
 *
 * Prerequisites:
 *   1. firebase emulators:start --only firestore,functions,auth
 *   2. npm run test (from functions/)
 */

import * as admin from "firebase-admin";

// Point all SDK calls at the local emulator
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST = "127.0.0.1:5001";

// Initialize admin SDK once for all tests
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "swingthoughts-test",
  });
}

export const db = admin.firestore();
export const auth = admin.auth();

/**
 * Wipe all emulator data between test suites.
 * Call in beforeEach/afterEach as needed.
 */
export async function clearEmulator() {
  const collections = [
    "users",
    "rounds",
    "scores",
    "leagues",
    "invitationals",
    "rivalries",
    "notifications",
    "outings",
    "feed",
  ];

  await Promise.all(
    collections.map(async (col) => {
      const snap = await db.collection(col).get();
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      if (snap.docs.length > 0) await batch.commit();
    })
  );
}

/**
 * Small helper — wait for async Cloud Function side effects
 * (triggers fire asynchronously, so we poll briefly)
 */
export async function waitFor(ms = 1500) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}