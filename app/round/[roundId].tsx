/**
 * Round Viewer Route
 *
 * Renders LiveRoundViewer for a specific round.
 * Entry points:
 *   - LiveRoundFAB tap (clubhouse → /round/{roundId})
 *   - Push notification deep link (round_invite, round_complete, round_notable)
 *   - Post-round redirect after marker finishes scoring
 *
 * If the round is linked to an outing (has outingId), renders the
 * OutingLeaderboardFAB as a floating overlay showing the cross-group
 * live leaderboard. Tapping it opens the full leaderboard modal.
 *
 * File: app/round/[roundId].tsx
 */

import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/constants/firebaseConfig";
import LiveRoundViewer from "@/components/scoring/LiveRoundViewer";
import OutingLeaderboardFAB from "./OutingLeaderboardFAB";

export default function RoundViewerScreen() {
  const { roundId, outingId: paramOutingId } = useLocalSearchParams<{
    roundId: string;
    outingId?: string;
  }>();

  const [outingId, setOutingId] = useState<string | null>(paramOutingId ?? null);

  // If outingId wasn't passed as a param, check the round doc
  useEffect(() => {
    if (paramOutingId || !roundId) return;

    getDoc(doc(db, "rounds", roundId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.outingId) {
          setOutingId(data.outingId);
        }
      }
    }).catch(() => {});
  }, [roundId, paramOutingId]);

  if (!roundId) return null;

  return (
    <View style={{ flex: 1 }}>
      <LiveRoundViewer roundId={roundId} />
      {outingId && <OutingLeaderboardFAB outingId={outingId} />}
    </View>
  );
}