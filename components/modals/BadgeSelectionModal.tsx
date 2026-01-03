import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ✅ Badge icon imports
const LowLeaderTrophy = require("@/assets/icons/LowLeaderTrophy.png");
const LowLeaderScratch = require("@/assets/icons/LowLeaderScratch.png");
const LowLeaderAce = require("@/assets/icons/LowLeaderAce.png");
const HoleInOne = require("@/assets/icons/HoleinOne.png");

interface Badge {
  type: string;
  displayName: string;
  courseName?: string;
  achievedAt?: any;
  score?: number;
  courseId?: number;
}

interface BadgeSelectionModalProps {
  visible: boolean;
  badges: Badge[];
  selectedBadges: Badge[];
  onClose: () => void;
  onSave: (selectedBadges: Badge[]) => void;
}

export default function BadgeSelectionModal({
  visible,
  badges,
  selectedBadges,
  onClose,
  onSave,
}: BadgeSelectionModalProps) {
  const [tempSelected, setTempSelected] = useState<Badge[]>(selectedBadges);

  // ✅ Reset tempSelected when modal opens
  useEffect(() => {
    if (visible) {
      console.log("🎯 Modal opened with badges:", badges.length);
      console.log("🎯 Selected badges:", selectedBadges.length);
      setTempSelected(selectedBadges);
    }
  }, [visible, selectedBadges]);

  const getBadgeIcon = (badgeType: string) => {
    switch (badgeType.toLowerCase()) {
      case "lowman":
        return LowLeaderTrophy;
      case "scratch":
        return LowLeaderScratch;
      case "ace":
        return LowLeaderAce;
      case "holeinone":
        return HoleInOne;
      default:
        return LowLeaderTrophy;
    }
  };

  const formatBadgeDate = (timestamp: any) => {
    if (!timestamp) return "";
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString("en-US", { 
        month: "short", 
        day: "numeric", 
        year: "numeric" 
      });
    } catch {
      return "";
    }
  };

  const isBadgeSelected = (badge: Badge) => {
    return tempSelected.some(
      (b) => 
        b.type === badge.type && 
        b.courseName === badge.courseName && 
        b.courseId === badge.courseId
    );
  };

  const getSelectionOrder = (badge: Badge) => {
    const index = tempSelected.findIndex(
      (b) => 
        b.type === badge.type && 
        b.courseName === badge.courseName && 
        b.courseId === badge.courseId
    );
    return index >= 0 ? index + 1 : null;
  };

  const handleToggleBadge = (badge: Badge) => {
    Haptics.selectionAsync();

    const isSelected = isBadgeSelected(badge);

    if (isSelected) {
      // Remove badge
      console.log("➖ Removing badge:", badge.displayName);
      setTempSelected(
        tempSelected.filter(
          (b) => 
            !(b.type === badge.type && 
              b.courseName === badge.courseName && 
              b.courseId === badge.courseId)
        )
      );
    } else {
      // Add badge (max 3)
      if (tempSelected.length < 3) {
        console.log("➕ Adding badge:", badge.displayName);
        setTempSelected([...tempSelected, badge]);
      } else {
        console.log("⚠️ Max badges reached");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    }
  };

  const handleSave = () => {
    console.log("💾 Saving badges:", tempSelected.length);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(tempSelected);
    onClose();
  };

  const handleCancel = () => {
    console.log("❌ Canceling selection");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempSelected(selectedBadges); // Reset to original
    onClose();
  };

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
              <Text style={styles.title}>Select Your Achievements</Text>
              <Text style={styles.subtitle}>
                Choose up to 3 badges to display ({tempSelected.length}/3)
              </Text>
            </View>
            <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
              <Image 
                source={require("@/assets/icons/Close.png")} 
                style={styles.closeIcon}
              />
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
                <Image 
                  source={LowLeaderTrophy}
                  style={styles.emptyIcon}
                />
                <Text style={styles.emptyText}>No badges earned yet</Text>
                <Text style={styles.emptySubtext}>
                  Post scores and achieve course records to earn your first achievement!
                </Text>
              </View>
            ) : (
              <>
                {badges.map((badge, index) => {
                  const isSelected = isBadgeSelected(badge);
                  const order = getSelectionOrder(badge);
                  const icon = getBadgeIcon(badge.type);

                  return (
                    <TouchableOpacity
                      key={`${badge.type}-${badge.courseId}-${index}`}
                      style={[
                        styles.badgeCard,
                        isSelected && styles.badgeCardSelected,
                      ]}
                      onPress={() => handleToggleBadge(badge)}
                      activeOpacity={0.7}
                    >
                      {/* Selection Order Badge */}
                      {isSelected && (
                        <View style={styles.orderBadge}>
                          <Text style={styles.orderText}>{order}</Text>
                        </View>
                      )}

                      {/* Badge Icon */}
                      <Image source={icon} style={styles.badgeIcon} />

                      {/* Badge Info */}
                      <View style={styles.badgeInfo}>
                        <Text style={styles.badgeName}>{badge.displayName}</Text>
                        {badge.courseName && (
                          <Text style={styles.badgeCourse} numberOfLines={1}>
                            {badge.courseName}
                          </Text>
                        )}
                        {badge.achievedAt && (
                          <Text style={styles.badgeDate}>
                            {formatBadgeDate(badge.achievedAt)}
                          </Text>
                        )}
                      </View>

                      {/* Selection Indicator */}
                      <View style={styles.checkContainer}>
                        {isSelected ? (
                          <Ionicons name="checkmark-circle" size={28} color="#0D5C3A" />
                        ) : (
                          <View style={styles.uncheckedCircle} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveButton,
                tempSelected.length === 0 && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={tempSelected.length === 0}
            >
              <Text style={styles.saveButtonText}>
                Save Selection
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

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
    height: "85%", // Works well on both iOS and Android
    ...Platform.select({
      android: {
        // Android might need explicit flex to prevent overflow
        flex: 0,
      },
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

  closeIcon: {
    width: 24,
    height: 24,
    tintColor: "#666",
  },

  scrollView: {
    flex: 1,
    minHeight: 200, // ✅ Ensure minimum visible height
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 8,
    flexGrow: 1, // ✅ Allow content to expand
    backgroundColor: "#FAFAFA", // ✅ Add background to confirm it's rendering
  },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },

  emptyIcon: {
    width: 64,
    height: 64,
    resizeMode: "contain",
    opacity: 0.4,
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

  badgeIcon: {
    width: 48,
    height: 48,
    resizeMode: "contain",
    marginRight: 16,
  },

  badgeInfo: {
    flex: 1,
  },

  badgeName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 2,
  },

  badgeCourse: {
    fontSize: 13,
    color: "#666",
    marginBottom: 2,
  },

  badgeDate: {
    fontSize: 11,
    color: "#999",
  },

  checkContainer: {
    marginLeft: 12,
  },

  uncheckedCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#CCC",
  },

  actions: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    paddingBottom: 24,
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

  saveButtonDisabled: {
    backgroundColor: "#CCC",
  },

  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});