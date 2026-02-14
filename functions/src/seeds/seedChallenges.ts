/**
 * Seed Challenges Collection
 *
 * One-time script to create challenge definition docs in Firestore.
 * Run from the functions directory:
 *
 *   npx ts-node src/seeds/seedChallenges.ts
 *
 * Or call from Firebase shell / admin script.
 * Safe to re-run — uses set() with merge so existing data isn't lost.
 */

import * as admin from "firebase-admin";

/**
 * Initialize for local execution.
 *
 * Before running, set your credentials:
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\serviceAccountKey.json
 *
 * Or download from Firebase Console → Project Settings → Service Accounts → Generate New Private Key
 * and place it in the functions/ directory.
 */
if (!admin.apps.length) {
  try {
    // serviceAccountKey.json lives in functions/ root
    // This script is at functions/src/seeds/ so go up two levels
    const serviceAccount = require("../../serviceAccountKey.json");
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (e) {
    console.error("⚠️  Could not load serviceAccountKey.json:", (e as Error).message);
    console.error("   Make sure serviceAccountKey.json is in the functions/ directory.");
    process.exit(1);
  }
}

const db = admin.firestore();

interface ChallengeSeed {
  id: string;
  type: string;
  name: string;
  description: string;
  shortDescription: string;
  minSample: number;
  minSampleUnit: string;
  isConsecutive: boolean;
  hasHCIScaling: boolean;
  thresholds: {
    elite: number;
    low: number;
    mid: number;
    high: number;
    beginner: number;
  };
  thresholdLabel: string;
  thresholdUnit: string;
  badge: {
    iconType: string;
    bgColor: string;
    iconColor: string;
  };
  registeredCount: number;
  earnedCount: number;
  status: string;
  createdAt: admin.firestore.FieldValue;
}

const challenges: Omit<ChallengeSeed, "registeredCount" | "earnedCount" | "status" | "createdAt">[] = [
  {
    id: "par3",
    type: "par3",
    name: "Par 3 Champion",
    description:
      "Prove your short game by averaging under your target score across 50 par 3 holes. Every par 3 you play counts toward your progress.",
    shortDescription: "Average under target on par 3 holes",
    minSample: 50,
    minSampleUnit: "par 3 holes",
    isConsecutive: false,
    hasHCIScaling: true,
    thresholds: { elite: 3.0, low: 3.3, mid: 3.5, high: 3.8, beginner: 4.0 },
    thresholdLabel: "Avg ≤",
    thresholdUnit: "",
    badge: { iconType: "svg", bgColor: "#0D5C3A", iconColor: "#FFF" },
  },
  {
    id: "fir",
    type: "fir",
    name: "Fairway Finder",
    description:
      "Keep it in the short grass. Maintain your target FIR% across 10 qualifying rounds. Only rounds where you track fairways count.",
    shortDescription: "Hit fairways consistently",
    minSample: 10,
    minSampleUnit: "rounds",
    isConsecutive: false,
    hasHCIScaling: true,
    thresholds: { elite: 70, low: 60, mid: 50, high: 40, beginner: 30 },
    thresholdLabel: "FIR% ≥",
    thresholdUnit: "%",
    badge: { iconType: "svg", bgColor: "#4CAF50", iconColor: "#FFF" },
  },
  {
    id: "gir",
    type: "gir",
    name: "GIR Master",
    description:
      "Hit more greens in regulation. Maintain your target GIR% across 10 qualifying rounds. Only rounds where you track greens count.",
    shortDescription: "Hit greens in regulation consistently",
    minSample: 10,
    minSampleUnit: "rounds",
    isConsecutive: false,
    hasHCIScaling: true,
    thresholds: { elite: 65, low: 55, mid: 45, high: 35, beginner: 25 },
    thresholdLabel: "GIR% ≥",
    thresholdUnit: "%",
    badge: { iconType: "svg", bgColor: "#1B5E20", iconColor: "#FFF" },
  },
  {
    id: "birdie_streak",
    type: "birdie_streak",
    name: "Birdie Streak",
    description:
      "Catch fire on the course. Make consecutive birdies (or better) in a single round. One hot streak is all it takes.",
    shortDescription: "Consecutive birdies in one round",
    minSample: 1,
    minSampleUnit: "round",
    isConsecutive: false,
    hasHCIScaling: true,
    thresholds: { elite: 4, low: 3, mid: 3, high: 2, beginner: 2 },
    thresholdLabel: "Streak ≥",
    thresholdUnit: " consecutive",
    badge: { iconType: "svg", bgColor: "#F57C00", iconColor: "#FFF" },
  },
  {
    id: "iron_player",
    type: "iron_player",
    name: "Iron Player",
    description:
      "Consistency is king. Break your target score in 5 consecutive 18-hole rounds. One bad round resets the counter.",
    shortDescription: "Break target score 5 rounds in a row",
    minSample: 5,
    minSampleUnit: "consecutive rounds",
    isConsecutive: true,
    hasHCIScaling: true,
    thresholds: { elite: 75, low: 80, mid: 90, high: 100, beginner: 110 },
    thresholdLabel: "Break",
    thresholdUnit: "",
    badge: { iconType: "svg", bgColor: "#333333", iconColor: "#FFD700" },
  },
  {
    id: "dtp",
    type: "dtp",
    name: "Closest to Pin",
    description:
      "A living challenge. Claim the pin on any course's designated par 3 by recording the closest distance-to-pin. But watch out — other golfers can take it from you.",
    shortDescription: "Hold the closest DTP on any course",
    minSample: 1,
    minSampleUnit: "pin",
    isConsecutive: false,
    hasHCIScaling: false,
    thresholds: { elite: 0, low: 0, mid: 0, high: 0, beginner: 0 },
    thresholdLabel: "Hold ≥ 1",
    thresholdUnit: " pin",
    badge: { iconType: "svg", bgColor: "#D32F2F", iconColor: "#FFF" },
  },
  {
    id: "ace",
    type: "ace",
    name: "Ace Hunter",
    description:
      "The rarest badge in SwingThoughts. Record and verify a hole-in-one. There are no shortcuts.",
    shortDescription: "Verified hole-in-one",
    minSample: 1,
    minSampleUnit: "verified ace",
    isConsecutive: false,
    hasHCIScaling: false,
    thresholds: { elite: 1, low: 1, mid: 1, high: 1, beginner: 1 },
    thresholdLabel: "",
    thresholdUnit: "",
    badge: { iconType: "svg", bgColor: "#E8B800", iconColor: "#FFF" },
  },
];

async function seedChallenges() {
  console.log("🌱 Seeding challenges collection...\n");

  const batch = db.batch();

  for (const challenge of challenges) {
    const ref = db.collection("challenges").doc(challenge.id);
    batch.set(
      ref,
      {
        ...challenge,
        registeredCount: 0,
        earnedCount: 0,
        status: "active",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true } // Safe to re-run
    );
    console.log(`  ✅ ${challenge.name} (${challenge.id})`);
  }

  await batch.commit();
  console.log("\n🏌️ All 7 challenges seeded successfully!");
}

// Run directly
seedChallenges()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });