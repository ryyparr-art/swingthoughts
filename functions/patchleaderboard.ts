/**
 * One-time script to patch us_nc_triad_17363 leaderboard
 * with Samuel and Nick's missing scores from the March 6 round.
 *
 * Run from your functions directory:
 *   npx ts-node patchLeaderboard.ts
 */

import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

const serviceAccount = require("./service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "swing-thoughts-1807b",
});

const db = admin.firestore();

async function patchLeaderboard() {
  const leaderboardRef = db.collection("leaderboards").doc("us_nc_triad_17363");

  const createdAt = Timestamp.fromDate(new Date("2026-03-06T21:33:55.000Z"));

  const samuelEntry = {
    userId: "VEILQIYyKrc1vvxLFL4LVGOryjC3",
    displayName: "Samuel_Keathley",
    userAvatar: null,
    challengeBadges: [],
    courseId: 17363,
    courseName: "Greensboro National Gc",
    grossScore: 99,
    netScore: 76,
    par: 72,
    teePar: 72,
    tees: "White Tees",
    teeYardage: null,
    scoreId: "UoifWMX3Uf0cV2Rrhtlo",
    createdAt,
  };

  const nickEntry = {
    userId: "sPdgbJxo7TRsUm1JC1I7jNe8nsF3",
    displayName: "Nick Pass",
    userAvatar: null,
    challengeBadges: [],
    courseId: 17363,
    courseName: "Greensboro National Gc",
    grossScore: 108,
    netScore: 91,
    par: 72,
    teePar: 72,
    tees: "White Tees",
    teeYardage: null,
    scoreId: "FX2orVfjtWZc8SfT2u0Z",
    createdAt,
  };

  const ryyparrEntry = {
    userId: "DbnGP8iHXwbztZmy0Pc1XIwdou33",
    displayName: "Ryyparr",
    userAvatar: "https://firebasestorage.googleapis.com/v0/b/swing-thoughts-1807b.firebasestorage.app/o/avatars%2FDbnGP8iHXwbztZmy0Pc1XIwdou33%2Favatar_1770446943294.jpg?alt=media&token=7d67763e-a537-4ffc-a5ad-bdfbe26894a2",
    challengeBadges: ["birdie_streak", "dtp", "ace"],
    courseId: 17363,
    courseName: "Greensboro National Gc",
    grossScore: 93,
    netScore: 79,
    par: 72,
    teePar: 72,
    tees: null,
    teeYardage: null,
    scoreId: "GJzab0EwKtkOOkAMKTYA",
    createdAt: Timestamp.fromDate(new Date("2026-03-06T21:33:58.000Z")),
  };

  // Sorted by netScore ascending: Samuel 76, Ryyparr 79, Nick 91
  const updatedTopScores18 = [samuelEntry, ryyparrEntry, nickEntry];

  await leaderboardRef.update({
    topScores18: updatedTopScores18,
    lowNetScore18: 76,
    totalScores18: 3,
    totalScores: 3,
    lastUpdated: Timestamp.now(),
  });

  console.log("✅ Leaderboard patched successfully!");
  console.log("   topScores18: Samuel (76), Ryyparr (79), Nick (91)");
  console.log("   lowNetScore18: 76");
  console.log("   totalScores18: 3");
  console.log("   totalScores: 3");
}

patchLeaderboard()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Patch failed:", err);
    process.exit(1);
  });