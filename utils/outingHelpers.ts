/**
 * Outing Helpers — Pure utility functions for group management
 *
 * All functions are stateless and testable. No Firestore dependencies.
 * Used by: OutingGroupSetup, OutingReview, OutingDashboard, Cloud Functions
 *
 * File: utils/outingHelpers.ts
 */

import type { LiveScoreEntry } from "@/components/scoring/scoringTypes";
import type {
    OutingGroup,
    OutingGroupStatus,
    OutingLeaderboardEntry,
    OutingPlayer,
    OutingValidationWarning,
} from "@/constants/outingTypes";

// ============================================================================
// GROUP ASSIGNMENT
// ============================================================================

/**
 * Auto-assigns players into groups of the given size.
 * Returns a new array of OutingGroup objects.
 * First on-platform player in each group is auto-designated as marker.
 */
export function autoAssignGroups(
  roster: OutingPlayer[],
  groupSize: number = 4
): OutingGroup[] {
  const groups: OutingGroup[] = [];
  const unassigned = [...roster];
  let groupIndex = 1;

  while (unassigned.length > 0) {
    const chunk = unassigned.splice(0, groupSize);
    const groupId = `group_${groupIndex}`;

    // First on-platform player becomes marker
    const markerPlayer = chunk.find((p) => !p.isGhost);
    const markerId = markerPlayer?.playerId ?? chunk[0].playerId;

    groups.push({
      groupId,
      name: `Group ${groupIndex}`,
      playerIds: chunk.map((p) => p.playerId),
      markerId,
      roundId: null,
      startingHole: 1,
      status: "pending" as OutingGroupStatus,
    });

    // Update roster items with group assignment
    chunk.forEach((p) => {
      p.groupId = groupId;
      p.isGroupMarker = p.playerId === markerId;
    });

    groupIndex++;
  }

  return groups;
}

/**
 * Assigns sequential starting holes to groups for shotgun starts.
 * Group 1 → Hole 1, Group 2 → Hole 2, etc.
 * Wraps around if more groups than holes.
 */
export function shotgunAssignStartingHoles(
  groups: OutingGroup[],
  holeCount: 9 | 18,
  baseHole: number = 1
): OutingGroup[] {
  return groups.map((group, index) => ({
    ...group,
    startingHole: baseHole + (index % holeCount),
    name: `Hole ${baseHole + (index % holeCount)} Start`,
  }));
}

/**
 * Moves a player from one group to another.
 * Updates both groups' playerIds and the player's groupId in the roster.
 * Returns updated groups and roster.
 */
export function movePlayerBetweenGroups(
  roster: OutingPlayer[],
  groups: OutingGroup[],
  playerId: string,
  targetGroupId: string
): { roster: OutingPlayer[]; groups: OutingGroup[] } {
  const updatedRoster = roster.map((p) => {
    if (p.playerId === playerId) {
      return { ...p, groupId: targetGroupId, isGroupMarker: false };
    }
    return p;
  });

  const updatedGroups = groups.map((g) => {
    // Remove from old group
    const filteredPlayerIds = g.playerIds.filter((id) => id !== playerId);

    if (g.groupId === targetGroupId) {
      // Add to target group
      return { ...g, playerIds: [...filteredPlayerIds, playerId] };
    }

    // If the removed player was the marker, reassign
    if (g.markerId === playerId && filteredPlayerIds.length > 0) {
      const newMarker =
        updatedRoster.find(
          (p) => filteredPlayerIds.includes(p.playerId) && !p.isGhost
        ) || updatedRoster.find((p) => filteredPlayerIds.includes(p.playerId));

      return {
        ...g,
        playerIds: filteredPlayerIds,
        markerId: newMarker?.playerId ?? filteredPlayerIds[0],
      };
    }

    return { ...g, playerIds: filteredPlayerIds };
  });

  return { roster: updatedRoster, groups: updatedGroups };
}

/**
 * Reassigns the marker for a group.
 * The new marker must be an on-platform player.
 */
export function reassignGroupMarker(
  roster: OutingPlayer[],
  groups: OutingGroup[],
  groupId: string,
  newMarkerId: string
): { roster: OutingPlayer[]; groups: OutingGroup[] } {
  const updatedRoster = roster.map((p) => {
    if (p.groupId === groupId) {
      return { ...p, isGroupMarker: p.playerId === newMarkerId };
    }
    return p;
  });

  const updatedGroups = groups.map((g) => {
    if (g.groupId === groupId) {
      return { ...g, markerId: newMarkerId };
    }
    return g;
  });

  return { roster: updatedRoster, groups: updatedGroups };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates outing setup and returns warnings.
 * Does not block launch — just informs the organizer.
 */
export function validateOutingSetup(
  roster: OutingPlayer[],
  groups: OutingGroup[]
): OutingValidationWarning[] {
  const warnings: OutingValidationWarning[] = [];

  // Check for unassigned players
  const unassigned = roster.filter((p) => !p.groupId);
  if (unassigned.length > 0) {
    warnings.push({
      type: "unassigned_players",
      message: `${unassigned.length} player${unassigned.length !== 1 ? "s" : ""} not assigned to a group`,
    });
  }

  groups.forEach((group) => {
    // Check for ghost marker
    const marker = roster.find((p) => p.playerId === group.markerId);
    if (marker?.isGhost) {
      warnings.push({
        type: "ghost_marker",
        groupId: group.groupId,
        message: `${group.name}: Marker "${marker.displayName}" is a ghost player and cannot score`,
      });
    }

    // Check for no on-platform marker
    const hasOnPlatformPlayer = group.playerIds.some((id) => {
      const player = roster.find((p) => p.playerId === id);
      return player && !player.isGhost;
    });
    if (!hasOnPlatformPlayer) {
      warnings.push({
        type: "no_marker",
        groupId: group.groupId,
        message: `${group.name}: No on-platform player available to score`,
      });
    }

    // Check for small groups (less than 2)
    if (group.playerIds.length < 2) {
      warnings.push({
        type: "small_group",
        groupId: group.groupId,
        message: `${group.name}: Only ${group.playerIds.length} player${group.playerIds.length !== 1 ? "s" : ""}`,
      });
    }
  });

  // Check for uneven groups
  const sizes = groups.map((g) => g.playerIds.length);
  const maxSize = Math.max(...sizes);
  const minSize = Math.min(...sizes);
  if (maxSize - minSize > 1) {
    warnings.push({
      type: "uneven_group",
      message: `Uneven groups: sizes range from ${minSize} to ${maxSize}`,
    });
  }

  return warnings;
}

// ============================================================================
// LEADERBOARD
// ============================================================================

/**
 * Builds a unified leaderboard from live scores across all groups.
 * Sorts by net score (ascending) for stroke play.
 * Handles ties with gross score tiebreaker.
 */
export function buildOutingLeaderboard(
  roster: OutingPlayer[],
  groups: OutingGroup[],
  allLiveScores: Record<string, Record<string, LiveScoreEntry>>,
  formatId: string
): OutingLeaderboardEntry[] {
  const entries: OutingLeaderboardEntry[] = [];

  groups.forEach((group) => {
    if (!group.roundId) return;

    const roundScores = allLiveScores[group.roundId];
    if (!roundScores) return;

    group.playerIds.forEach((playerId) => {
      const player = roster.find((p) => p.playerId === playerId);
      const scores = roundScores[playerId];
      if (!player || !scores) return;

      entries.push({
        playerId,
        displayName: player.displayName,
        avatar: player.avatar,
        groupId: group.groupId,
        groupName: group.name,
        grossScore: scores.currentGross,
        netScore: scores.currentNet,
        scoreToPar: scores.scoreToPar,
        thru: scores.thru,
        formatScore: scores.stablefordPoints,
        position: 0, // computed below
      });
    });
  });

  // Sort based on format
  if (formatId.includes("stableford")) {
    // Stableford: highest points first
    entries.sort((a, b) => (b.formatScore ?? 0) - (a.formatScore ?? 0));
  } else {
    // Stroke play: lowest net first, tiebreak by gross
    entries.sort((a, b) => {
      if (a.netScore !== b.netScore) return a.netScore - b.netScore;
      return a.grossScore - b.grossScore;
    });
  }

  // Assign positions with ties
  let currentPosition = 1;
  entries.forEach((entry, index) => {
    if (index === 0) {
      entry.position = 1;
    } else {
      const prev = entries[index - 1];
      const isTied = formatId.includes("stableford")
        ? entry.formatScore === prev.formatScore
        : entry.netScore === prev.netScore;

      entry.position = isTied ? prev.position : index + 1;
    }
    currentPosition = entry.position;
  });

  return entries;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Gets players not assigned to any group */
export function getUnassignedPlayers(roster: OutingPlayer[]): OutingPlayer[] {
  return roster.filter((p) => !p.groupId);
}

/** Gets players in a specific group */
export function getGroupPlayers(
  roster: OutingPlayer[],
  groupId: string
): OutingPlayer[] {
  return roster.filter((p) => p.groupId === groupId);
}

/** Checks if all groups in an outing are complete */
export function areAllGroupsComplete(groups: OutingGroup[]): boolean {
  return groups.length > 0 && groups.every((g) => g.status === "complete");
}

/** Gets the count of completed groups */
export function getCompletedGroupCount(groups: OutingGroup[]): number {
  return groups.filter((g) => g.status === "complete").length;
}

/** Generates a unique group ID */
export function generateGroupId(index: number): string {
  return `group_${index}`;
}