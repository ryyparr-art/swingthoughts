import { NOTIFICATION_ICONS } from "@/constants/notificationIcons";
import { Notification } from "@/constants/notificationTypes";
import { formatTimeAgo } from "@/utils/timestampHelpers";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface NotificationCardProps {
  notification: Notification;
  isArchived?: boolean;
  onPress: (notification: Notification) => void;
  onRestore?: (notificationId: string) => void;
}

const AvatarStack = ({ notification }: { notification: Notification }) => {
  const actors = notification.actors || [];
  const actorCount = notification.actorCount || 1;

  if (actors.length > 1) {
    const displayActors = actors.slice(0, 3);

    return (
      <View style={styles.avatarStack}>
        {displayActors.map((actor, index) => (
          <View
            key={actor.userId}
            style={[
              styles.stackedAvatarContainer,
              { zIndex: displayActors.length - index, marginLeft: index > 0 ? -12 : 0 },
            ]}
          >
            {actor.avatar ? (
              <Image source={{ uri: actor.avatar }} style={styles.stackedAvatar} />
            ) : (
              <View style={styles.stackedAvatarPlaceholder}>
                <Text style={styles.stackedAvatarInitial}>
                  {actor.displayName?.[0]?.toUpperCase() || "?"}
                </Text>
              </View>
            )}
          </View>
        ))}

        {actorCount > 3 && (
          <View style={[styles.stackedAvatarContainer, styles.moreAvatars, { marginLeft: -12 }]}>
            <Text style={styles.moreAvatarsText}>+{actorCount - 3}</Text>
          </View>
        )}
      </View>
    );
  }

  const avatar = actors[0]?.avatar || notification.actorAvatar;
  const displayName = actors[0]?.displayName || notification.actorName || "";

  return (
    <View style={styles.singleAvatarContainer}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>
            {displayName[0]?.toUpperCase() || "?"}
          </Text>
        </View>
      )}
    </View>
  );
};

const NotificationIcon = ({ type }: { type: string }) => {
  const iconConfig = NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.system;

  return (
    <View style={[styles.notificationIcon, { backgroundColor: `${iconConfig.color}E6` }]}>
      {iconConfig.image ? (
        <Image
          source={iconConfig.image}
          style={[styles.notificationIconImage, { tintColor: "#FFFFFF" }]}
          resizeMode="contain"
        />
      ) : (
        <Ionicons name={iconConfig.icon as any} size={14} color="#FFFFFF" />
      )}
    </View>
  );
};

export default function NotificationCard({
  notification,
  isArchived = false,
  onPress,
  onRestore,
}: NotificationCardProps) {
  return (
    <TouchableOpacity
      style={[
        styles.notificationCard,
        !notification.read && !isArchived && styles.notificationUnread,
        isArchived && styles.notificationArchived,
      ]}
      onPress={() => onPress(notification)}
      activeOpacity={0.7}
    >
      {/* Avatar Section */}
      <View style={styles.avatarSection}>
        <AvatarStack notification={notification} />
        {!notification.read && !isArchived && <View style={styles.unreadDot} />}
        <NotificationIcon type={notification.type} />
      </View>

      {/* Content */}
      <View style={styles.notificationContent}>
        <Text
          style={[
            styles.notificationMessage,
            !notification.read && !isArchived && styles.notificationMessageUnread,
            isArchived && styles.notificationMessageArchived,
          ]}
        >
          {notification.message}
        </Text>
        <Text style={styles.notificationTime}>
          {formatTimeAgo(notification.updatedAt || notification.createdAt)}
        </Text>
      </View>

      {/* Restore button for archived OR Chevron for active */}
      {isArchived ? (
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={(e) => {
            e.stopPropagation();
            onRestore?.(notification.id);
          }}
        >
          <Ionicons name="refresh" size={18} color="#0D5C3A" />
        </TouchableOpacity>
      ) : (
        <Ionicons name="chevron-forward" size={18} color="#CCC" />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  notificationCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", marginHorizontal: 16, marginVertical: 4, padding: 14, borderRadius: 12, gap: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  notificationUnread: { backgroundColor: "#FFFEF5", borderLeftWidth: 3, borderLeftColor: "#FFD700" },
  notificationArchived: { backgroundColor: "#F5F5F5", opacity: 0.85 },
  avatarSection: { position: "relative" },
  singleAvatarContainer: { width: 48, height: 48 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#E0E0E0" },
  avatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#0D5C3A", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 18, fontWeight: "700", color: "#FFFFFF" },
  avatarStack: { flexDirection: "row", alignItems: "center", width: 72, height: 48 },
  stackedAvatarContainer: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: "#FFFFFF", backgroundColor: "#FFFFFF", overflow: "hidden" },
  stackedAvatar: { width: 32, height: 32, borderRadius: 16 },
  stackedAvatarPlaceholder: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#0D5C3A", alignItems: "center", justifyContent: "center" },
  stackedAvatarInitial: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  moreAvatars: { backgroundColor: "#0D5C3A", alignItems: "center", justifyContent: "center" },
  moreAvatarsText: { fontSize: 11, fontWeight: "700", color: "#FFFFFF" },
  unreadDot: { position: "absolute", top: -2, right: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: "#FFD700", borderWidth: 2, borderColor: "#FFFFFF" },
  notificationIcon: { position: "absolute", bottom: -4, right: -4, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
  notificationIconImage: { width: 12, height: 12 },
  notificationContent: { flex: 1 },
  notificationMessage: { fontSize: 14, fontWeight: "500", color: "#333", marginBottom: 4, lineHeight: 20 },
  notificationMessageUnread: { fontWeight: "600", color: "#000" },
  notificationMessageArchived: { color: "#666" },
  notificationTime: { fontSize: 12, color: "#999" },
  restoreButton: { padding: 8, backgroundColor: "rgba(13, 92, 58, 0.1)", borderRadius: 20 },
});