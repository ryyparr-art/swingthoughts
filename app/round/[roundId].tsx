/**
 * Round Viewer Route
 *
 * Renders LiveRoundViewer for a specific round.
 * Entry points:
 *   - LiveRoundFAB tap (clubhouse → /round/{roundId})
 *   - Push notification deep link (round_invite, round_complete, round_notable)
 *   - Post-round redirect after marker finishes scoring
 *
 * For the marker: shows completed round summary (mode="review")
 * For spectators: shows live scorecard + chat (mode="view")
 *
 * File: app/round/[roundId].tsx
 */

import LiveRoundViewer from "@/components/scoring/LiveRoundViewer";
import { useLocalSearchParams } from "expo-router";
import React from "react";

export default function RoundViewerScreen() {
  const { roundId } = useLocalSearchParams<{ roundId: string }>();

  if (!roundId) {
    return null;
  }

  return <LiveRoundViewer roundId={roundId} />;
}