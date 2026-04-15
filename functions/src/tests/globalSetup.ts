/**
 * Global Test Setup
 *
 * Runs once before all test suites.
 * Verifies the Firebase Emulator is running so tests fail fast
 * with a clear message rather than cryptic connection errors.
 */

import * as http from "http";

const EMULATOR_HOST = "127.0.0.1";
const FIRESTORE_PORT = 8080;

function checkEmulator(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: EMULATOR_HOST, port, path: "/" },
      () => resolve(true)
    );
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export default async function globalSetup() {
  const firestoreRunning = await checkEmulator(FIRESTORE_PORT);

  if (!firestoreRunning) {
    console.error(`
╔══════════════════════════════════════════════════════════╗
║  Firebase Emulator is not running!                       ║
║                                                          ║
║  Start it first:                                         ║
║    firebase emulators:start --only firestore,auth        ║
║                                                          ║
║  Then re-run tests:                                      ║
║    npm test                                              ║
╚══════════════════════════════════════════════════════════╝
    `);
    process.exit(1);
  }

  console.log("✅ Firebase Emulator is running — starting tests\n");
}