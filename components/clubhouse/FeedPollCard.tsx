/**
 * FeedPollCard Component
 *
 * Renders a poll inside a feed post. Handles:
 * - Displaying the poll question and options
 * - Casting / changing / removing votes via poll_votes collection
 * - Showing results with animated bars and percentages after voting
 * - Highlighting the user's selected option
 *
 * Vote flow:
 * 1. Client writes to poll_votes/{thoughtId}_{userId}
 * 2. Cloud Function (onPollVoteCreated/Updated/Deleted) atomically
 *    updates the thought's poll.options[].votes/voterIds and totalVotes
 * 3. The feed re-renders with updated counts on next refresh
 *
 * For instant local feedback, we optimistically update the UI before
 * the Cloud Function runs.
 */

import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface PollOption {
  text: string;
  votes: number;
  voterIds?: string[];
}

interface PollData {
  question: string;
  options: PollOption[];
  totalVotes: number;
}

interface FeedPollCardProps {
  thoughtId: string;
  poll: PollData;
  currentUserId: string;
}

/* ================================================================ */
/* COMPONENT                                                        */
/* ================================================================ */

export default function FeedPollCard({
  thoughtId,
  poll,
  currentUserId,
}: FeedPollCardProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [localOptions, setLocalOptions] = useState<PollOption[]>(poll.options);
  const [localTotalVotes, setLocalTotalVotes] = useState(poll.totalVotes || 0);
  const [isVoting, setIsVoting] = useState(false);
  const [hasCheckedVote, setHasCheckedVote] = useState(false);

  // Determine if user already voted (from poll data or local state)
  const hasVoted = selectedIndex !== null;

  /* ---------------------------------------------------------------- */
  /* CHECK EXISTING VOTE ON MOUNT                                     */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!currentUserId || !thoughtId) {
      setHasCheckedVote(true);
      return;
    }

    // First check locally from voterIds
    const existingIndex = poll.options.findIndex(
      (opt) => opt.voterIds?.includes(currentUserId)
    );

    if (existingIndex !== -1) {
      setSelectedIndex(existingIndex);
      setHasCheckedVote(true);
      return;
    }

    // Fallback: check poll_votes doc
    const checkVote = async () => {
      try {
        const voteDoc = await getDoc(
          doc(db, "poll_votes", `${thoughtId}_${currentUserId}`)
        );
        if (voteDoc.exists()) {
          setSelectedIndex(voteDoc.data().optionIndex);
        }
      } catch (err) {
        // Silently fail — user just hasn't voted
      } finally {
        setHasCheckedVote(true);
      }
    };

    checkVote();
  }, [currentUserId, thoughtId, poll.options]);

  /* ---------------------------------------------------------------- */
  /* SYNC LOCAL STATE WHEN POLL PROP UPDATES                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    setLocalOptions(poll.options);
    setLocalTotalVotes(poll.totalVotes || 0);
  }, [poll]);

  /* ---------------------------------------------------------------- */
  /* VOTE HANDLER                                                     */
  /* ---------------------------------------------------------------- */

  const handleVote = useCallback(
    async (optionIndex: number) => {
      if (!currentUserId || isVoting) return;

      soundPlayer.play("click");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsVoting(true);

      const voteDocId = `${thoughtId}_${currentUserId}`;
      const voteRef = doc(db, "poll_votes", voteDocId);

      try {
        if (selectedIndex === optionIndex) {
          // UNVOTE: Tap same option to remove vote
          // Optimistic update
          const newOptions = [...localOptions];
          newOptions[optionIndex] = {
            ...newOptions[optionIndex],
            votes: Math.max((newOptions[optionIndex].votes || 0) - 1, 0),
            voterIds: (newOptions[optionIndex].voterIds || []).filter(
              (id) => id !== currentUserId
            ),
          };
          setLocalOptions(newOptions);
          setLocalTotalVotes((prev) => Math.max(prev - 1, 0));
          setSelectedIndex(null);

          await deleteDoc(voteRef);
        } else if (selectedIndex !== null) {
          // CHANGE VOTE: Switch from one option to another
          const oldIndex = selectedIndex;

          // Optimistic update
          const newOptions = [...localOptions];
          // Remove from old
          newOptions[oldIndex] = {
            ...newOptions[oldIndex],
            votes: Math.max((newOptions[oldIndex].votes || 0) - 1, 0),
            voterIds: (newOptions[oldIndex].voterIds || []).filter(
              (id) => id !== currentUserId
            ),
          };
          // Add to new
          newOptions[optionIndex] = {
            ...newOptions[optionIndex],
            votes: (newOptions[optionIndex].votes || 0) + 1,
            voterIds: [
              ...(newOptions[optionIndex].voterIds || []),
              currentUserId,
            ],
          };
          setLocalOptions(newOptions);
          setSelectedIndex(optionIndex);
          // totalVotes unchanged (moved, not added)

          await updateDoc(voteRef, {
            optionIndex,
            optionText: localOptions[optionIndex].text,
            updatedAt: serverTimestamp(),
          });
        } else {
          // NEW VOTE
          // Optimistic update
          const newOptions = [...localOptions];
          newOptions[optionIndex] = {
            ...newOptions[optionIndex],
            votes: (newOptions[optionIndex].votes || 0) + 1,
            voterIds: [
              ...(newOptions[optionIndex].voterIds || []),
              currentUserId,
            ],
          };
          setLocalOptions(newOptions);
          setLocalTotalVotes((prev) => prev + 1);
          setSelectedIndex(optionIndex);

          await setDoc(voteRef, {
            thoughtId,
            userId: currentUserId,
            optionIndex,
            optionText: localOptions[optionIndex].text,
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.error("Vote error:", err);
        // Revert optimistic update
        setLocalOptions(poll.options);
        setLocalTotalVotes(poll.totalVotes || 0);
        // Re-check actual vote state
        const existingIndex = poll.options.findIndex(
          (opt) => opt.voterIds?.includes(currentUserId)
        );
        setSelectedIndex(existingIndex !== -1 ? existingIndex : null);

        soundPlayer.play("error");
      } finally {
        setIsVoting(false);
      }
    },
    [currentUserId, thoughtId, selectedIndex, localOptions, isVoting, poll]
  );

  /* ---------------------------------------------------------------- */
  /* RENDER                                                           */
  /* ---------------------------------------------------------------- */

  if (!hasCheckedVote) {
    return (
      <View style={styles.container}>
        <Text style={styles.question}>{poll.question}</Text>
        <ActivityIndicator size="small" color="#0D5C3A" style={{ marginTop: 12 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Poll Question */}
      <View style={styles.questionRow}>
        <Ionicons name="stats-chart" size={18} color="#0D5C3A" />
        <Text style={styles.question}>{poll.question}</Text>
      </View>

      {/* Options */}
      <View style={styles.optionsContainer}>
        {localOptions.map((option, index) => {
          const isSelected = selectedIndex === index;
          const percentage =
            localTotalVotes > 0
              ? Math.round((option.votes / localTotalVotes) * 100)
              : 0;

          if (hasVoted) {
            // RESULTS VIEW — show bars with percentages
            return (
              <TouchableOpacity
                key={index}
                style={[styles.resultRow, isSelected && styles.resultRowSelected]}
                onPress={() => handleVote(index)}
                disabled={isVoting}
                activeOpacity={0.7}
              >
                {/* Background bar */}
                <View
                  style={[
                    styles.resultBar,
                    isSelected ? styles.resultBarSelected : styles.resultBarDefault,
                    { width: `${Math.max(percentage, 2)}%` },
                  ]}
                />

                {/* Content */}
                <View style={styles.resultContent}>
                  <View style={styles.resultLeft}>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={18} color="#0D5C3A" />
                    )}
                    <Text
                      style={[
                        styles.resultText,
                        isSelected && styles.resultTextSelected,
                      ]}
                    >
                      {option.text}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.percentageText,
                      isSelected && styles.percentageTextSelected,
                    ]}
                  >
                    {percentage}%
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }

          // VOTING VIEW — tappable options
          return (
            <TouchableOpacity
              key={index}
              style={styles.optionButton}
              onPress={() => handleVote(index)}
              disabled={isVoting}
              activeOpacity={0.7}
            >
              <Text style={styles.optionText}>{option.text}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Vote count */}
      <Text style={styles.voteCount}>
        {localTotalVotes} {localTotalVotes === 1 ? "vote" : "votes"}
        {hasVoted && " · Tap to change"}
      </Text>
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },

  /* Question */
  questionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  question: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    flex: 1,
    lineHeight: 22,
  },

  /* Options container */
  optionsContainer: {
    gap: 8,
  },

  /* Voting view (before voting) */
  optionButton: {
    borderWidth: 1.5,
    borderColor: "#0D5C3A",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  optionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  /* Results view (after voting) */
  resultRow: {
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    minHeight: 44,
    justifyContent: "center",
  },
  resultRowSelected: {
    borderColor: "#0D5C3A",
  },
  resultBar: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 8,
  },
  resultBarDefault: {
    backgroundColor: "#E8F5E9",
  },
  resultBarSelected: {
    backgroundColor: "#C8E6C9",
  },
  resultContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    zIndex: 1,
  },
  resultLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  resultText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
  },
  resultTextSelected: {
    fontWeight: "700",
    color: "#0D5C3A",
  },
  percentageText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#666",
    minWidth: 40,
    textAlign: "right",
  },
  percentageTextSelected: {
    color: "#0D5C3A",
    fontWeight: "700",
  },

  /* Vote count */
  voteCount: {
    fontSize: 12,
    color: "#999",
    marginTop: 8,
    textAlign: "center",
  },
});