/**
 * CreateInvitationalWizard
 *
 * Container component that manages the 3-step wizard:
 *   Step 1: Basics (name, dates, scoring, handicap)
 *   Step 2: Rounds (course, date, tee time, format per round)
 *   Step 3: Invite (partners, ghost players)
 *
 * All-or-nothing: nothing is saved to Firestore until the final
 * "Create Invitational" button on Step 3. Backing out = no data.
 */

import { auth, db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
} from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { RoundData, createEmptyRound } from "../shared/RoundEditor";
import StepBasics, { BasicsData } from "./StepBasics";
import StepInvite, { InvitedPlayer } from "./StepInvite";
import StepRounds from "./StepRounds";

const STEP_LABELS = ["Basics", "Rounds", "Invite"];

export default function CreateInvitationalWizard() {
  const router = useRouter();
  const currentUserId = auth.currentUser?.uid || "";
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 state
  const [basics, setBasics] = useState<BasicsData>({
    name: "",
    avatarUri: null,
    startDate: new Date(),
    endDate: new Date(),
    isSingleDay: true,
    maxPlayers: 24,
    overallScoring: "cumulative",
    handicapMethod: "swingthoughts",
  });

  // Step 2 state
  const [rounds, setRounds] = useState<RoundData[]>([createEmptyRound()]);

  // Step 3 state
  const [invitedPlayers, setInvitedPlayers] = useState<InvitedPlayer[]>([]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      // Get host user data
      const hostDoc = await getDoc(doc(db, "users", currentUserId));
      const hostData = hostDoc.data();
      const hostName = hostData?.displayName || "Unknown";

      // Upload avatar if selected
      let avatarUrl: string | null = null;
      if (basics.avatarUri) {
        try {
          const storage = getStorage();
          const response = await fetch(basics.avatarUri);
          const blob = await response.blob();
          const storageRef = ref(storage, `invitationals/${Date.now()}_avatar.jpg`);
          await uploadBytes(storageRef, blob);
          avatarUrl = await getDownloadURL(storageRef);
        } catch (uploadError) {
          console.warn("Avatar upload failed, continuing without:", uploadError);
        }
      }

      // Build roster
      const roster = [
        // Host is always on the roster as accepted
        {
          userId: currentUserId,
          displayName: hostName,
          avatar: hostData?.avatar || null,
          handicap: hostData?.handicapIndex || null,
          invitationalHandicap: null,
          status: "accepted",
          isGhost: false,
        },
        // Invited players
        ...invitedPlayers.map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
          avatar: p.avatar || null,
          handicap: p.handicap || null,
          invitationalHandicap: null,
          status: p.isGhost ? "ghost" : "invited",
          isGhost: p.isGhost,
          ghostName: p.ghostName || null,
          ghostEmail: p.ghostEmail || null,
          ghostPhone: p.ghostPhone || null,
          ghostClaimToken: null,
        })),
      ];

      // Build rounds array for Firestore
      const roundsDocs = rounds.map((r, index) => ({
        roundId: r.id,
        courseId: r.course?.courseId || null,
        courseName: r.course?.courseName || "",
        courseLocation: r.course?.location || { city: "", state: "" },
        date: Timestamp.fromDate(r.date),
        teeTime: r.hasTeeTime
          ? r.teeTime.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })
          : null,
        format: r.format,
        scoringType: r.scoringType,
        status: "upcoming",
        outingId: null,
        groups: [],
        roundNumber: index + 1,
      }));

      // Create the invitational document
      const invitationalData = {
        // Identity
        name: basics.name.trim(),
        avatar: avatarUrl,
        hostUserId: currentUserId,
        hostName,
        status: "open",

        // Schedule
        startDate: Timestamp.fromDate(basics.startDate),
        endDate: Timestamp.fromDate(basics.isSingleDay ? basics.startDate : basics.endDate),
        isSingleDay: basics.isSingleDay,

        // Settings
        maxPlayers: basics.maxPlayers,
        overallScoring: basics.overallScoring,
        handicapMethod: basics.handicapMethod,

        // Roster
        roster,
        playerCount: roster.length,

        // Rounds
        rounds: roundsDocs,

        // Results (populated on completion)
        standings: null,
        winnerId: null,

        // Metadata
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const docRef = await addDoc(
        collection(db, "invitationals"),
        invitationalData
      );

      // TODO: Send push notifications to invited users
      // TODO: Send email/SMS to ghost players with ghostEmail/ghostPhone

      // Navigate to the new invitational
      router.replace({
        pathname: "/invitationals/[id]" as any,
        params: { id: docRef.id },
      });
    } catch (error) {
      console.error("Error creating invitational:", error);
      Alert.alert(
        "Error",
        "Failed to create invitational. Please try again.",
        [{ text: "OK" }]
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Progress indicator */}
      <View style={styles.progressBar}>
        {STEP_LABELS.map((label, index) => (
          <View key={label} style={styles.progressStep}>
            <View
              style={[
                styles.progressDot,
                index <= step && styles.progressDotActive,
                index < step && styles.progressDotDone,
              ]}
            >
              {index < step ? (
                <Ionicons name="checkmark" size={12} color="#FFF" />
              ) : (
                <Text
                  style={[
                    styles.progressDotText,
                    index <= step && styles.progressDotTextActive,
                  ]}
                >
                  {index + 1}
                </Text>
              )}
            </View>
            <Text
              style={[
                styles.progressLabel,
                index <= step && styles.progressLabelActive,
              ]}
            >
              {label}
            </Text>
            {index < STEP_LABELS.length - 1 && (
              <View
                style={[
                  styles.progressLine,
                  index < step && styles.progressLineActive,
                ]}
              />
            )}
          </View>
        ))}
      </View>

      {/* Steps */}
      {step === 0 && (
        <StepBasics
          data={basics}
          onChange={setBasics}
          onNext={() => setStep(1)}
        />
      )}

      {step === 1 && (
        <StepRounds
          rounds={rounds}
          onChange={setRounds}
          onNext={() => setStep(2)}
          onBack={() => setStep(0)}
        />
      )}

      {step === 2 && (
        <StepInvite
          currentUserId={currentUserId}
          invitedPlayers={invitedPlayers}
          onChange={setInvitedPlayers}
          onBack={() => setStep(1)}
          onSubmit={handleSubmit}
          submitting={submitting}
          maxPlayers={basics.maxPlayers}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  // Progress bar
  progressBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: "#F4EED8",
  },
  progressStep: {
    flexDirection: "row",
    alignItems: "center",
  },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E0E0E0",
    alignItems: "center",
    justifyContent: "center",
  },
  progressDotActive: {
    backgroundColor: "#0D5C3A",
  },
  progressDotDone: {
    backgroundColor: "#0D5C3A",
  },
  progressDotText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#999",
  },
  progressDotTextActive: {
    color: "#FFF",
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
    marginLeft: 6,
  },
  progressLabelActive: {
    color: "#0D5C3A",
  },
  progressLine: {
    width: 24,
    height: 2,
    backgroundColor: "#E0E0E0",
    marginHorizontal: 8,
  },
  progressLineActive: {
    backgroundColor: "#0D5C3A",
  },
});