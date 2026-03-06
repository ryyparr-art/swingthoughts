/**
 * Invitational Round — Manage Groups
 *
 * Wraps OutingGroupSetup with invitational roster data.
 * Route: /invitationals/groups?id=xxx&roundId=yyy
 *
 * Flow:
 *   1. Load invitational doc (roster + round data)
 *   2. Fetch tee options via loadFullCourseData (Firestore → Golf API fallback)
 *   3. Map invitational roster → OutingPlayer[] format
 *   4. Pass to OutingGroupSetup with showRosterBuilder=false
 *   5. On confirm, save groups back to the round's groups array
 *   6. Per-group tee times are editable via a tee time modal
 *
 * The commissioner can:
 *   - Auto-assign or manually drag players into groups
 *   - Set starting holes (shotgun support)
 *   - Set per-group tee times
 *   - Assign group markers
 */

import {
  calculateCourseHandicap,
  extractTees,
  loadFullCourseData,
} from "@/components/leagues/post-score/helpers";
import type { TeeOption } from "@/components/leagues/post-score/types";
import OutingGroupSetup from "@/components/outings/OutingGroupSetup";
import { auth, db } from "@/constants/firebaseConfig";
import type { OutingGroup, OutingPlayer } from "@/constants/outingTypes";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface Invitational {
  id: string;
  name: string;
  hostUserId: string;
  handicapMethod: string;
  maxPlayers: number;
  roster: RosterEntry[];
  rounds: InvitationalRound[];
}

interface RosterEntry {
  userId: string | null;
  displayName: string;
  avatar?: string;
  handicap?: number;
  invitationalHandicap: number | null;
  status: string;
  isGhost: boolean;
  ghostName?: string;
}

interface InvitationalRound {
  roundId: string;
  courseId: number | null;
  courseName: string;
  courseLocation: { city: string; state: string; country?: string };
  date: Timestamp;
  teeTime: string | null;
  formatId: string;
  format?: string; // legacy fallback
  scoringType: string;
  status: string;
  outingId: string | null;
  groups: SavedGroup[];
  roundNumber: number;
}

interface SavedGroup {
  groupId: string;
  name: string;
  startingHole: number;
  teeTime?: string | null;
  markerId: string;
  playerIds: string[];
}

/* ================================================================ */
/* MAIN COMPONENT                                                   */
/* ================================================================ */

export default function InvitationalManageGroups() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, roundId } = useLocalSearchParams();
  const invitationalId = Array.isArray(id) ? id[0] : id;
  const targetRoundId = Array.isArray(roundId) ? roundId[0] : roundId;
  const currentUserId = auth.currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invitational, setInvitational] = useState<Invitational | null>(null);
  const [availableTees, setAvailableTees] = useState<TeeOption[]>([]);
  const [teesLoaded, setTeesLoaded] = useState(false);

  // Per-group tee times
  const [showTeeTimeModal, setShowTeeTimeModal] = useState(false);
  const [groupTeeTimes, setGroupTeeTimes] = useState<Record<string, Date | null>>({});
  const [editingTeeTimeGroup, setEditingTeeTimeGroup] = useState<string | null>(null);
  const [tempTeeTime, setTempTeeTime] = useState<Date>(new Date());

  // Pending groups from OutingGroupSetup (held until tee times are set)
  const [pendingRoster, setPendingRoster] = useState<OutingPlayer[] | null>(null);
  const [pendingGroups, setPendingGroups] = useState<OutingGroup[] | null>(null);

  /* ================================================================ */
  /* DATA LOADING                                                    */
  /* ================================================================ */

  useEffect(() => {
    if (!invitationalId) return;

    const unsub = onSnapshot(
      doc(db, "invitationals", invitationalId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as Invitational;
          setInvitational(data);

          // Initialize per-group tee times from saved data (only on first load)
          const round = data.rounds?.find((r) => r.roundId === targetRoundId);
          if (round?.groups && round.groups.length > 0 && Object.keys(groupTeeTimes).length === 0) {
            const times: Record<string, Date | null> = {};
            for (const g of round.groups) {
              if (g.teeTime) {
                times[g.groupId] = parseTeeTimeString(g.teeTime);
              } else {
                times[g.groupId] = null;
              }
            }
            setGroupTeeTimes(times);
          }
        }
        setLoading(false);
      }
    );

    return () => unsub();
  }, [invitationalId, targetRoundId]);

  // Fetch tees from Firestore courses collection → Golf Course API fallback
  useEffect(() => {
    if (!invitational || teesLoaded) return;

    const round = invitational.rounds?.find((r) => r.roundId === targetRoundId);
    if (!round?.courseId) {
      setTeesLoaded(true);
      return;
    }

    const loadTees = async () => {
      try {
        // loadFullCourseData checks Firestore `courses` collection first,
        // then falls back to Golf Course API and caches the result
        const courseData = await loadFullCourseData(
          round.courseId!,
          round.courseName,
          round.courseLocation
        );

        if (courseData) {
          const tees = extractTees(courseData.tees);
          if (tees.length > 0) {
            setAvailableTees(tees);
          }
        }
      } catch (error) {
        console.error("Error loading course tees:", error);
      } finally {
        setTeesLoaded(true);
      }
    };

    loadTees();
  }, [invitational, targetRoundId, teesLoaded]);

  /* ================================================================ */
  /* HELPERS                                                         */
  /* ================================================================ */

  /** Parse a tee time string like "8:00 AM" into a Date object */
  const parseTeeTimeString = (timeStr: string): Date | null => {
    try {
      const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (!match) return null;

      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3].toUpperCase();

      if (ampm === "PM" && hours !== 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;

      const d = new Date();
      d.setHours(hours, minutes, 0, 0);
      return d;
    } catch {
      return null;
    }
  };

  /** Format a Date to a tee time string */
  const formatTeeTime = (date: Date): string => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  /* ================================================================ */
  /* MAP DATA                                                        */
  /* ================================================================ */

  const round = useMemo(
    () => invitational?.rounds?.find((r) => r.roundId === targetRoundId) || null,
    [invitational, targetRoundId]
  );

  // Use first available tee as default; if none loaded yet, cast a minimal fallback
  const defaultTee: TeeOption = useMemo(() => {
    if (availableTees.length > 0) return availableTees[0];
    // Minimal fallback — only used if course has no tee data at all
    return { tee_name: "Default", course_rating: 72, slope_rating: 113 } as TeeOption;
  }, [availableTees]);

  const holeCount: 9 | 18 = 18; // Invitationals are 18 holes

  // Map invitational roster → OutingPlayer[]
  const outingRoster: OutingPlayer[] = useMemo(() => {
    if (!invitational || !round) return [];

    const eligiblePlayers = invitational.roster.filter(
      (r) => r.status === "accepted" || r.status === "ghost"
    );

    // If groups already exist, preserve groupId assignments
    const existingGroupMap = new Map<string, string>();
    const existingMarkers = new Set<string>();
    if (round.groups && round.groups.length > 0) {
      for (const g of round.groups) {
        for (const pid of g.playerIds) {
          existingGroupMap.set(pid, g.groupId);
        }
        existingMarkers.add(g.markerId);
      }
    }

    return eligiblePlayers.map((entry) => {
      const playerId = entry.userId || `ghost_${entry.ghostName}`;
      const handicap =
        invitational.handicapMethod === "manual"
          ? entry.invitationalHandicap ?? 0
          : entry.handicap ?? 0;

      return {
        playerId,
        displayName: entry.displayName || entry.ghostName || "Unknown",
        avatar: entry.avatar,
        isGhost: entry.isGhost,
        handicapIndex: handicap,
        courseHandicap: calculateCourseHandicap(handicap, defaultTee.slope_rating, holeCount),
        tee: defaultTee,
        teeName: defaultTee.tee_name,
        slopeRating: defaultTee.slope_rating,
        courseRating: defaultTee.course_rating,
        groupId: existingGroupMap.get(playerId) || null,
        isGroupMarker: existingMarkers.has(playerId),
      };
    });
  }, [invitational, round, defaultTee, holeCount]);

  // Map saved groups → OutingGroup[]
  const outingGroups: OutingGroup[] = useMemo(() => {
    if (!round?.groups || round.groups.length === 0) return [];
    return round.groups.map((g) => ({
      groupId: g.groupId,
      name: g.name,
      startingHole: g.startingHole,
      playerIds: g.playerIds,
      markerId: g.markerId,
      teeTime: g.teeTime || null,
      status: "pending" as const,
    }));
  }, [round]);

  /* ================================================================ */
  /* SAVE HANDLER                                                    */
  /* ================================================================ */

  /** Called by OutingGroupSetup "Continue to Review" — opens tee time step */
  const handleConfirm = (
    finalRoster: OutingPlayer[],
    finalGroups: OutingGroup[]
  ) => {
    setPendingRoster(finalRoster);
    setPendingGroups(finalGroups);

    // Pre-populate tee time slots for any new groups
    const updated = { ...groupTeeTimes };
    for (const g of finalGroups) {
      if (!(g.groupId in updated)) {
        updated[g.groupId] = null;
      }
    }
    setGroupTeeTimes(updated);
    setShowTeeTimeModal(true);
  };

  /** Called from tee time modal "Save Groups" — writes to Firestore */
  const handleSaveGroups = async () => {
    if (!invitational || !invitationalId || !targetRoundId || !pendingGroups) return;

    setSaving(true);
    try {
      const savedGroups: SavedGroup[] = pendingGroups.map((g) => {
        const teeTimeDate = groupTeeTimes[g.groupId];
        return {
          groupId: g.groupId,
          name: g.name,
          startingHole: g.startingHole,
          teeTime: teeTimeDate ? formatTeeTime(teeTimeDate) : null,
          markerId: g.markerId,
          playerIds: g.playerIds,
        };
      });

      const updatedRounds = invitational.rounds.map((r) => {
        if (r.roundId !== targetRoundId) return r;
        return { ...r, groups: savedGroups };
      });

      await updateDoc(doc(db, "invitationals", invitationalId), {
        rounds: updatedRounds,
        updatedAt: serverTimestamp(),
      });

      soundPlayer.play("postThought");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowTeeTimeModal(false);

      Alert.alert(
        "Groups Saved",
        `${pendingGroups.length} group${pendingGroups.length !== 1 ? "s" : ""} assigned for Round ${round?.roundNumber}.`,
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (error) {
      console.error("Error saving groups:", error);
      Alert.alert("Error", "Failed to save groups. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  /* ================================================================ */
  /* RENDER                                                          */
  /* ================================================================ */

  if (loading || !invitational || !round || !teesLoaded) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#B8860B" />
        <Text style={styles.loadingText}>
          {!teesLoaded ? "Loading course data..." : "Loading groups..."}
        </Text>
      </View>
    );
  }

  // Permission check
  if (invitational.hostUserId !== currentUserId) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
            <Image source={require("@/assets/icons/Back.png")} style={styles.backIcon} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Manage Groups</Text>
          <View style={styles.headerButton} />
        </View>
        <View style={styles.loadingContainer}>
          <Ionicons name="lock-closed-outline" size={48} color="#CCC" />
          <Text style={styles.permissionText}>Only the host can manage groups.</Text>
        </View>
      </View>
    );
  }

  const eligibleCount = invitational.roster.filter(
    (r) => r.status === "accepted" || r.status === "ghost"
  ).length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Image source={require("@/assets/icons/Back.png")} style={styles.backIcon} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Groups</Text>
        <View style={styles.headerButton} />
      </View>

      {/* Round info banner */}
      <View style={styles.roundBanner}>
        <View style={styles.roundBadge}>
          <Text style={styles.roundBadgeText}>R{round.roundNumber}</Text>
        </View>
        <View style={styles.roundBannerInfo}>
          <Text style={styles.roundBannerCourse}>{round.courseName}</Text>
          <Text style={styles.roundBannerMeta}>
            {round.courseLocation?.city && round.courseLocation?.state
              ? `${round.courseLocation.city}, ${round.courseLocation.state} • `
              : ""}
            {eligibleCount} player{eligibleCount !== 1 ? "s" : ""}
            {availableTees.length > 1 ? ` • ${availableTees.length} tees` : ""}
          </Text>
        </View>
      </View>

      {/* OutingGroupSetup — the heavy lifter */}
      <OutingGroupSetup
        organizer={{
          userId: invitational.hostUserId,
          displayName: invitational.roster.find(
            (r) => r.userId === invitational.hostUserId
          )?.displayName || "Host",
          avatar: invitational.roster.find(
            (r) => r.userId === invitational.hostUserId
          )?.avatar,
          handicapIndex: 0,
        }}
        courseId={round.courseId || 0}
        courseName={round.courseName}
        holeCount={holeCount}
        formatId={round.formatId || round.format || "stroke_play"}
        defaultTee={defaultTee}
        availableTees={availableTees}
        initialRoster={outingRoster}
        initialGroups={outingGroups.length > 0 ? outingGroups : undefined}
        showRosterBuilder={false}
        maxPlayers={invitational.maxPlayers}
        groupSize={4}
        onConfirm={handleConfirm}
        onBack={() => {
          soundPlayer.play("click");
          router.back();
        }}
      />

      {/* ════════════════════════════════════════════════════════ */}
      {/* PER-GROUP TEE TIME MODAL                                */}
      {/* ════════════════════════════════════════════════════════ */}
      <Modal
        visible={showTeeTimeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTeeTimeModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            setShowTeeTimeModal(false);
            setEditingTeeTimeGroup(null);
          }}
        >
          <Pressable
            style={styles.teeTimeModalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.teeTimeModalHeader}>
              <Text style={styles.teeTimeModalTitle}>Group Tee Times</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowTeeTimeModal(false);
                  setEditingTeeTimeGroup(null);
                }}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <Text style={styles.teeTimeModalSubtitle}>
              Set individual tee times for each group. Leave blank if all groups share the same time.
            </Text>

            <ScrollView style={styles.teeTimeList} showsVerticalScrollIndicator={false}>
              {(!pendingGroups || pendingGroups.length === 0) ? (
                <View style={styles.teeTimeEmpty}>
                  <Ionicons name="people-outline" size={32} color="#CCC" />
                  <Text style={styles.teeTimeEmptyText}>
                    Assign groups first, then set tee times
                  </Text>
                </View>
              ) : (
                pendingGroups.map((group) => {
                  const teeTime = groupTeeTimes[group.groupId];
                  const playerNames = group.playerIds
                    .map((pid) => {
                      const p = (pendingRoster || outingRoster).find((r) => r.playerId === pid);
                      return p?.displayName || "Unknown";
                    })
                    .join(", ");

                  return (
                    <View key={group.groupId}>
                      <View style={styles.teeTimeRow}>
                        <View style={styles.teeTimeRowLeft}>
                          <View style={styles.teeTimeGroupBadge}>
                            <Text style={styles.teeTimeGroupBadgeText}>
                              {group.name.replace("Group ", "G")}
                            </Text>
                          </View>
                          <View style={styles.teeTimeRowInfo}>
                            <Text style={styles.teeTimeRowPlayers} numberOfLines={1}>
                              {playerNames}
                            </Text>
                            <Text style={styles.teeTimeRowHole}>
                              Hole {group.startingHole}
                            </Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          style={[
                            styles.teeTimeSetButton,
                            teeTime && styles.teeTimeSetButtonActive,
                          ]}
                          onPress={() => {
                            soundPlayer.play("click");
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            if (editingTeeTimeGroup === group.groupId) {
                              setEditingTeeTimeGroup(null);
                            } else {
                              const defaultTime = teeTime || (() => {
                                const d = new Date();
                                d.setHours(8, 0, 0, 0);
                                return d;
                              })();
                              setTempTeeTime(defaultTime);
                              setEditingTeeTimeGroup(group.groupId);
                            }
                          }}
                        >
                          <Ionicons
                            name="time-outline"
                            size={14}
                            color={teeTime ? "#FFF" : "#B8860B"}
                          />
                          <Text
                            style={[
                              styles.teeTimeSetText,
                              teeTime && styles.teeTimeSetTextActive,
                            ]}
                          >
                            {teeTime ? formatTeeTime(teeTime) : "Set Time"}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Inline picker appears under the group being edited */}
                      {editingTeeTimeGroup === group.groupId && (
                        <View style={styles.teeTimePickerSection}>
                          <DateTimePicker
                            value={tempTeeTime}
                            mode="time"
                            display={Platform.OS === "ios" ? "spinner" : "default"}
                            minuteInterval={5}
                            themeVariant="light"
                            onChange={(_, selected) => {
                              if (Platform.OS === "android") {
                                // Android: native dialog auto-dismisses
                                setEditingTeeTimeGroup(null);
                                if (selected) {
                                  setGroupTeeTimes((prev) => ({
                                    ...prev,
                                    [group.groupId]: selected,
                                  }));
                                }
                              } else {
                                // iOS: spinner updates live
                                if (selected) setTempTeeTime(selected);
                              }
                            }}
                          />
                          {/* iOS-only confirm/clear buttons */}
                          {Platform.OS === "ios" && (
                            <View style={styles.teeTimePickerActions}>
                              <TouchableOpacity
                                style={styles.teeTimeClearButton}
                                onPress={() => {
                                  setGroupTeeTimes((prev) => ({
                                    ...prev,
                                    [group.groupId]: null,
                                  }));
                                  setEditingTeeTimeGroup(null);
                                }}
                              >
                                <Text style={styles.teeTimeClearText}>Clear</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.teeTimeSaveButton}
                                onPress={() => {
                                  soundPlayer.play("click");
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                  setGroupTeeTimes((prev) => ({
                                    ...prev,
                                    [group.groupId]: tempTeeTime,
                                  }));
                                  setEditingTeeTimeGroup(null);
                                }}
                              >
                                <Text style={styles.teeTimeSaveText}>Set Time</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>

            {/* Save / Skip buttons */}
            {pendingGroups && pendingGroups.length > 0 && (
              <View style={styles.teeTimeModalFooter}>
                <TouchableOpacity
                  style={styles.teeTimeSkipButton}
                  onPress={() => {
                    // Save without tee times
                    handleSaveGroups();
                  }}
                >
                  <Text style={styles.teeTimeSkipText}>Skip Tee Times</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.teeTimeSaveGroupsButton, saving && { opacity: 0.6 }]}
                  onPress={handleSaveGroups}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                      <Text style={styles.teeTimeSaveGroupsText}>Save Groups</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#888",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#0D5C3A",
  },
  headerButton: {
    padding: 8,
    width: 40,
  },
  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#F4EED8",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F4EED8",
  },

  // Round banner
  roundBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 12,
  },
  roundBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  roundBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFF",
  },
  roundBannerInfo: {
    flex: 1,
    gap: 2,
  },
  roundBannerCourse: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
  },
  roundBannerMeta: {
    fontSize: 12,
    color: "#888",
  },

  // Permission
  permissionText: {
    fontSize: 15,
    color: "#999",
    marginTop: 8,
  },

  // Tee time button on banner
  teeTimeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(184, 134, 11, 0.1)",
  },
  teeTimeButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B8860B",
  },

  // Tee time modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  teeTimeModalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: "80%",
  },
  teeTimeModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  teeTimeModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  teeTimeModalSubtitle: {
    fontSize: 13,
    color: "#888",
    lineHeight: 18,
    marginBottom: 16,
  },
  teeTimeList: {
    maxHeight: 500,
  },
  teeTimeEmpty: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  teeTimeEmptyText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
  teeTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E4DA",
  },
  teeTimeRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  teeTimeGroupBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },
  teeTimeGroupBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFF",
  },
  teeTimeRowInfo: {
    flex: 1,
    gap: 1,
  },
  teeTimeRowPlayers: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  teeTimeRowHole: {
    fontSize: 11,
    color: "#999",
  },
  teeTimeSetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "rgba(184, 134, 11, 0.3)",
  },
  teeTimeSetButtonActive: {
    backgroundColor: "#B8860B",
    borderColor: "#B8860B",
  },
  teeTimeSetText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B8860B",
  },
  teeTimeSetTextActive: {
    color: "#FFF",
  },

  // Tee time picker
  teeTimePickerSection: {
    backgroundColor: "#F8F8F5",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 8,
  },
  teeTimePickerActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  teeTimeClearButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
  },
  teeTimeClearText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#999",
  },
  teeTimeSaveButton: {
    flex: 2,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#B8860B",
  },
  teeTimeSaveText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },

  // Tee time modal footer
  teeTimeModalFooter: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E8E4DA",
  },
  teeTimeSkipButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
  },
  teeTimeSkipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#999",
  },
  teeTimeSaveGroupsButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#0D5C3A",
  },
  teeTimeSaveGroupsText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
  },
});