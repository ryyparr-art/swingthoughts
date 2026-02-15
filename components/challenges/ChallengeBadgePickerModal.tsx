/**
 * ChallengeBadgePickerModal
 *
 * Bottom-sheet modal that lets users choose which earned
 * challenge badges (up to 3) to display next to their displayName.
 *
 * Flow:
 *   1. Reads earnedChallengeBadges from user doc (all badges earned)
 *   2. Shows each with BadgeIcon, name, and a selectable checkbox
 *   3. On save, writes selected IDs to challengeBadges on user doc
 *
 * Usage:
 *   <ChallengeBadgePickerModal
 *     visible={showPicker}
 *     userId={currentUserId}
 *     earnedBadgeIds={["par3", "fir", "tier_amateur"]}
 *     selectedBadgeIds={["par3"]}
 *     onClose={() => setShowPicker(false)}
 *     onSave={(ids) => handleSave(ids)}
 *   />
 */

import BadgeIcon from "@/components/challenges/BadgeIcon";
import { CHALLENGES, CUMULATIVE_TIERS } from "@/constants/challengeTypes";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface BadgeInfo {
  id: string;
  name: string;
  description: string;
}

interface ChallengeBadgePickerModalProps {
  visible: boolean;
  earnedBadgeIds: string[];
  selectedBadgeIds: string[];
  onClose: () => void;
  onSave: (selectedIds: string[]) => void;
}

/* ================================================================ */
/* HELPERS                                                          */
/* ================================================================ */

/** Build a lookup of badge id → display info from challenge constants */
function getBadgeInfo(badgeId: string): BadgeInfo {
  // Check main challenges
  const challenge = CHALLENGES.find((c) => c.id === badgeId);
  if (challenge) {
    return {
      id: challenge.id,
      name: challenge.name,
      description: challenge.shortDescription || challenge.description,
    };
  }

  // Check cumulative tiers
  const tier = CUMULATIVE_TIERS.find((t) => t.id === badgeId);
  if (tier) {
    return {
      id: tier.id,
      name: tier.name,
      description: `Earn ${tier.requiredBadges} challenge badges`,
    };
  }

  return { id: badgeId, name: badgeId, description: "" };
}

/* ================================================================ */
/* COMPONENT                                                        */
/* ================================================================ */

export default function ChallengeBadgePickerModal({
  visible,
  earnedBadgeIds,
  selectedBadgeIds,
  onClose,
  onSave,
}: ChallengeBadgePickerModalProps) {
  const [tempSelected, setTempSelected] = useState<string[]>([]);

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setTempSelected([...selectedBadgeIds]);
    }
  }, [visible, selectedBadgeIds]);

  const isSelected = (id: string) => tempSelected.includes(id);

  const getSelectionOrder = (id: string) => {
    const idx = tempSelected.indexOf(id);
    return idx >= 0 ? idx + 1 : null;
  };

  const handleToggle = (id: string) => {
    Haptics.selectionAsync();

    if (isSelected(id)) {
      setTempSelected(tempSelected.filter((b) => b !== id));
    } else {
      if (tempSelected.length < 3) {
        setTempSelected([...tempSelected, id]);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    }
  };

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(tempSelected);
    onClose();
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempSelected([...selectedBadgeIds]);
    onClose();
  };

  // Build badge info list from earned IDs
  const badges = earnedBadgeIds.map(getBadgeInfo);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Display Badges</Text>
              <Text style={styles.subtitle}>
                Choose up to 3 to show next to your name ({tempSelected.length}/3)
              </Text>
            </View>
            <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Badge List */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {badges.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="trophy-outline" size={48} color="#CCC" />
                <Text style={styles.emptyText}>Display Challenge Badges</Text>
                <Text style={styles.emptySubtext}>
                  Complete challenges to earn badges that appear for you throughout SwingThoughts
                </Text>
              </View>
            ) : (
              badges.map((badge) => {
                const selected = isSelected(badge.id);
                const order = getSelectionOrder(badge.id);

                return (
                  <TouchableOpacity
                    key={badge.id}
                    style={[
                      styles.badgeCard,
                      selected && styles.badgeCardSelected,
                    ]}
                    onPress={() => handleToggle(badge.id)}
                    activeOpacity={0.7}
                  >
                    {/* Selection Order */}
                    {selected && (
                      <View style={styles.orderBadge}>
                        <Text style={styles.orderText}>{order}</Text>
                      </View>
                    )}

                    {/* Badge Icon */}
                    <BadgeIcon badgeId={badge.id} size={44} />

                    {/* Badge Info */}
                    <View style={styles.badgeInfo}>
                      <Text style={styles.badgeName}>{badge.name}</Text>
                      {badge.description ? (
                        <Text style={styles.badgeDesc} numberOfLines={1}>
                          {badge.description}
                        </Text>
                      ) : null}
                    </View>

                    {/* Checkbox */}
                    <View style={styles.checkContainer}>
                      {selected ? (
                        <Ionicons name="checkmark-circle" size={28} color="#0D5C3A" />
                      ) : (
                        <View style={styles.uncheckedCircle} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
            >
              <Text style={styles.saveButtonText}>
                {tempSelected.length === 0 ? "Clear Badges" : "Save Selection"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },

  modalContainer: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "75%",
    ...Platform.select({
      android: { flex: 0 },
    }),
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },

  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },

  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },

  scrollView: {
    flex: 1,
    minHeight: 200,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
    lineHeight: 18,
  },

  // Badge cards
  badgeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    position: "relative",
    gap: 14,
  },
  badgeCardSelected: {
    borderColor: "#0D5C3A",
    backgroundColor: "#F0F7F4",
  },

  orderBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  orderText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  badgeInfo: {
    flex: 1,
    gap: 2,
  },
  badgeName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  badgeDesc: {
    fontSize: 12,
    color: "#888",
  },

  checkContainer: {
    marginLeft: 4,
  },
  uncheckedCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#CCC",
  },

  // Action buttons
  actions: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#E0E0E0",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#666",
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});