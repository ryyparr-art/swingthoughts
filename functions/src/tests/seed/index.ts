/**
 * Seed Helpers
 *
 * Generates realistic fake data for SwingThoughts test scenarios.
 * All writes go to the local emulator — never production.
 */

import * as admin from "firebase-admin";
import { db } from "../setup";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface SeedUser {
  uid: string;
  displayName: string;
  email: string;
  handicapIndex: number;
  homeCourse: string;
  totalRounds: number;
}

export interface SeedRound {
  id: string;
  userId: string;
  courseId: string;
  courseName: string;
  totalScore: number;
  scoreToPar: number;
  holesPlayed: number;
  tee: string;
  status: "completed" | "active" | "abandoned";
}

// ─────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────

const FIRST_NAMES = ["James", "Tyler", "Scott", "Mike", "Ryan", "Chris", "Jake", "Drew", "Matt", "Kyle"];
const LAST_NAMES = ["Williams", "Johnson", "Smith", "Brown", "Davis", "Wilson", "Moore", "Taylor", "Anderson", "Thomas"];
const COURSES = [
  { id: "pinehurst-no2", name: "Pinehurst No. 2", par: 70 },
  { id: "pebble-beach", name: "Pebble Beach Golf Links", par: 72 },
  { id: "augusta-national", name: "Augusta National", par: 72 },
  { id: "bethpage-black", name: "Bethpage Black", par: 71 },
  { id: "torrey-pines-south", name: "Torrey Pines South", par: 72 },
];

export function makeFakeUser(index: number): SeedUser {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  return {
    uid: `test-user-${index}`,
    displayName: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}${index}@test.com`,
    handicapIndex: Math.round(Math.random() * 280) / 10, // 0.0 – 28.0
    homeCourse: COURSES[index % COURSES.length].name,
    totalRounds: Math.floor(Math.random() * 50) + 1,
  };
}

export async function seedUsers(count: number): Promise<SeedUser[]> {
  const users: SeedUser[] = [];
  const batch = db.batch();

  for (let i = 0; i < count; i++) {
    const user = makeFakeUser(i);
    users.push(user);
    batch.set(db.collection("users").doc(user.uid), {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      handicapIndex: user.handicapIndex,
      homeCourse: user.homeCourse,
      totalRounds: user.totalRounds,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      partnerIds: [],
      followers: [],
      following: [],
    });
  }

  await batch.commit();
  console.log(`✅ Seeded ${count} users`);
  return users;
}

// ─────────────────────────────────────────────
// ROUNDS
// ─────────────────────────────────────────────

export async function seedRound(
  userId: string,
  overrides: Partial<SeedRound> = {}
): Promise<SeedRound> {
  const course = COURSES[Math.floor(Math.random() * COURSES.length)];
  const scoreToPar = Math.floor(Math.random() * 20) - 5; // -5 to +15
  const ref = db.collection("rounds").doc();

  const round: SeedRound = {
    id: ref.id,
    userId,
    courseId: course.id,
    courseName: course.name,
    totalScore: course.par + scoreToPar,
    scoreToPar,
    holesPlayed: 18,
    tee: "white",
    status: "completed",
    ...overrides,
  };

  await ref.set({
    ...round,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return round;
}

export async function seedRoundsForUsers(
  users: SeedUser[],
  roundsPerUser: number
): Promise<SeedRound[]> {
  const allRounds: SeedRound[] = [];

  for (const user of users) {
    for (let i = 0; i < roundsPerUser; i++) {
      const round = await seedRound(user.uid);
      allRounds.push(round);
    }
  }

  console.log(`✅ Seeded ${allRounds.length} rounds for ${users.length} users`);
  return allRounds;
}

// ─────────────────────────────────────────────
// LEAGUES
// ─────────────────────────────────────────────

export async function seedLeague(
  commissionerId: string,
  memberIds: string[],
  overrides: Record<string, any> = {}
) {
  const ref = db.collection("leagues").doc();

  await ref.set({
    id: ref.id,
    name: overrides.name || "Test League",
    commissionerId,
    format: overrides.format || "stroke",
    status: overrides.status || "active",
    currentWeek: 1,
    totalWeeks: 10,
    memberCount: memberIds.length,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...overrides,
  });

  // Add members subcollection
  const batch = db.batch();
  for (const uid of memberIds) {
    batch.set(ref.collection("members").doc(uid), {
      userId: uid,
      role: uid === commissionerId ? "commissioner" : "member",
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      points: 0,
      rank: 0,
    });
  }
  await batch.commit();

  console.log(`✅ Seeded league "${overrides.name || "Test League"}" with ${memberIds.length} members`);
  return ref.id;
}

// ─────────────────────────────────────────────
// INVITATIONALS
// ─────────────────────────────────────────────

export async function seedInvitational(
  hostUserId: string,
  rosterUserIds: string[],
  overrides: Record<string, any> = {}
) {
  const ref = db.collection("invitationals").doc();
  const course = COURSES[0];

  const roster = [
    { userId: hostUserId, status: "accepted", role: "host" },
    ...rosterUserIds.map((uid) => ({
      userId: uid,
      status: overrides.rosterStatus || "invited",
      role: "player",
    })),
  ];

  await ref.set({
    id: ref.id,
    name: overrides.name || "The Test Invitational",
    hostUserId,
    hostName: "Test Host",
    courseId: course.id,
    courseName: course.name,
    date: admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 1 week from now
    ),
    status: overrides.status || "open",
    format: overrides.format || "stroke",
    maxPlayers: 24,
    playerCount: roster.length,
    roster,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ...overrides,
  });

  console.log(`✅ Seeded invitational "${overrides.name || "The Test Invitational"}" with ${roster.length} players`);
  return ref.id;
}

// ─────────────────────────────────────────────
// RIVALRIES
// ─────────────────────────────────────────────

export async function seedRivalry(
  playerAId: string,
  playerBId: string,
  roundCount: number = 3
) {
  const ref = db.collection("rivalries").doc();
  const playerIds = [playerAId, playerBId].sort();

  await ref.set({
    id: ref.id,
    playerIds,
    playerAId,
    playerBId,
    roundCount,
    playerAWins: Math.floor(roundCount / 2),
    playerBWins: roundCount - Math.floor(roundCount / 2),
    level: roundCount >= 10 ? 3 : roundCount >= 5 ? 2 : 1,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return ref.id;
}

// ─────────────────────────────────────────────
// FULL WORLD SEED
// ─────────────────────────────────────────────

/**
 * Seeds a complete realistic world for integration testing.
 * Returns all created entities for use in test assertions.
 */
export async function seedWorld(options: {
  userCount?: number;
  roundsPerUser?: number;
  leagueCount?: number;
  invitationalCount?: number;
} = {}) {
  const {
    userCount = 10,
    roundsPerUser = 5,
    leagueCount = 2,
    invitationalCount = 2,
  } = options;

  console.log("\n🌱 Seeding test world...");

  const users = await seedUsers(userCount);
  const rounds = await seedRoundsForUsers(users, roundsPerUser);

  const leagueIds: string[] = [];
  for (let i = 0; i < leagueCount; i++) {
    const commissioner = users[i];
    const members = users.slice(i, i + 5).map((u) => u.uid);
    const id = await seedLeague(commissioner.uid, members, {
      name: `Test League ${i + 1}`,
    });
    leagueIds.push(id);
  }

  const invitationalIds: string[] = [];
  for (let i = 0; i < invitationalCount; i++) {
    const host = users[i + leagueCount];
    const players = users.slice(0, 6).map((u) => u.uid);
    const id = await seedInvitational(host.uid, players, {
      name: `Test Invitational ${i + 1}`,
    });
    invitationalIds.push(id);
  }

  console.log("✅ World seed complete\n");

  return { users, rounds, leagueIds, invitationalIds };
}