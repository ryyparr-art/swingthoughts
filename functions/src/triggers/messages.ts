/**
 * Message Triggers
 * 
 * Handles: onMessageCreated
 * Manages 1:1 and group message threads and notifications.
 */

import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { createNotificationDocument, getUserData } from "../notifications/helpers";

const db = getFirestore();

export const onMessageCreated = onDocumentCreated(
  "threads/{threadId}/messages/{messageId}",
  async (event) => {
    try {
      const snap = event.data;
      if (!snap) return;

      const message = snap.data();
      if (!message) return;

      const { senderId, receiverId, content, createdAt, senderName, senderAvatar } = message;
      if (!senderId) { console.log("⛔ Message missing senderId"); return; }

      const { threadId } = event.params;
      const threadRef = db.collection("threads").doc(threadId);
      const threadSnap = await threadRef.get();
      const messageTimestamp = createdAt || Timestamp.now();

      const senderData = await getUserData(senderId);
      if (!senderData) { console.log("⚠️ Sender not found:", senderId); return; }

      const actualSenderName = senderName || senderData.displayName || "Someone";
      const actualSenderAvatar = senderAvatar || senderData.avatar || null;

      const existingThreadData = threadSnap.exists ? threadSnap.data() : null;
      const isGroup = existingThreadData?.isGroup || false;
      const participants = existingThreadData?.participants || [];

      console.log(`📨 New message in ${isGroup ? "GROUP" : "1:1"} thread:`, threadId);

      // GROUP CHAT
      if (isGroup && threadSnap.exists) {
        const unreadUpdates: Record<string, any> = {};
        for (const participantId of participants) {
          if (participantId !== senderId) {
            unreadUpdates[`unreadCount.${participantId}`] = FieldValue.increment(1);
          }
        }

        await threadRef.update({
          ...unreadUpdates,
          lastMessage: { senderId, senderName: actualSenderName, content, createdAt: messageTimestamp },
          lastSenderId: senderId, lastMessageAt: messageTimestamp,
          updatedAt: Timestamp.now(), deletedBy: [],
        });

        const groupName = existingThreadData?.groupName || "Group Chat";
        for (const participantId of participants) {
          if (participantId === senderId) continue;
          await createNotificationDocument({
            userId: participantId, type: "group_message",
            actorId: senderId, actorName: actualSenderName, actorAvatar: actualSenderAvatar,
            threadId,
            message: `${actualSenderName} sent a message in ${groupName}`,
          });
        }
        console.log(`✅ Group message notifications sent to ${participants.length - 1} participants`);
        return;
      }

      // 1:1 CHAT
      if (!receiverId) { console.log("⛔ 1:1 message missing receiverId"); return; }
      console.log("📨 1:1 message:", senderId, "→", receiverId);

      const receiverData = await getUserData(receiverId);
      if (!receiverData) { console.log("⚠️ Receiver not found:", receiverId); return; }

      if (!threadSnap.exists) {
        await threadRef.set({
          participants: [senderId, receiverId],
          participantNames: { [senderId]: senderData.displayName || "Unknown", [receiverId]: receiverData.displayName || "Unknown" },
          participantAvatars: { [senderId]: senderData.avatar || null, [receiverId]: receiverData.avatar || null },
          unreadCount: { [receiverId]: 1, [senderId]: 0 },
          lastMessage: { senderId, content, createdAt: messageTimestamp },
          lastSenderId: senderId, lastMessageAt: messageTimestamp,
          createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
        });
        console.log("🧵 1:1 Thread created:", threadId);
      } else {
        const threadData = threadSnap.data();
        const updateData: any = {
          [`unreadCount.${receiverId}`]: FieldValue.increment(1),
          participantNames: { [senderId]: senderData.displayName || "Unknown", [receiverId]: receiverData.displayName || "Unknown" },
          participantAvatars: { [senderId]: senderData.avatar || null, [receiverId]: receiverData.avatar || null },
          lastMessage: { senderId, content, createdAt: messageTimestamp },
          lastSenderId: senderId, lastMessageAt: messageTimestamp, updatedAt: Timestamp.now(),
        };
        if (threadData?.deletedBy && threadData.deletedBy.length > 0) updateData.deletedBy = [];
        await threadRef.update(updateData);
        console.log("🧵 1:1 Thread updated:", threadId);
      }

      await createNotificationDocument({
        userId: receiverId, type: "message",
        actorId: senderId, actorName: senderData.displayName || "Someone",
        actorAvatar: senderData.avatar || undefined, threadId,
        message: `${senderData.displayName || "Someone"} left a note in your locker`,
      });

      console.log("✅ 1:1 message thread + notification processed");
    } catch (error) {
      console.error("🔥 onMessageCreated failed:", error);
    }
  }
);