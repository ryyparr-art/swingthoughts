import { db } from "@/constants/firebaseConfig";
import { createNotification } from "@/utils/notificationHelpers";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

/**
 * Check if two users are already partners
 */
export async function arePartnersAlready(
  userId1: string,
  userId2: string
): Promise<boolean> {
  const q1 = query(
    collection(db, "partners"),
    where("user1Id", "==", userId1),
    where("user2Id", "==", userId2)
  );

  const q2 = query(
    collection(db, "partners"),
    where("user1Id", "==", userId2),
    where("user2Id", "==", userId1)
  );

  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

  return !snap1.empty || !snap2.empty;
}

/**
 * Check if there's already a pending request between two users
 * Returns information about the request direction
 */
export async function checkExistingRequest(
  currentUserId: string,
  otherUserId: string
): Promise<{
  exists: boolean;
  status?: "pending" | "approved" | "rejected";
  sentByMe?: boolean; // true if currentUser sent the request
  sentToMe?: boolean; // true if currentUser received the request
  requestId?: string;
}> {
  // Check if I sent a request to them
  const q1 = query(
    collection(db, "partnerRequests"),
    where("fromUserId", "==", currentUserId),
    where("toUserId", "==", otherUserId),
    where("status", "==", "pending")
  );

  // Check if they sent a request to me
  const q2 = query(
    collection(db, "partnerRequests"),
    where("fromUserId", "==", otherUserId),
    where("toUserId", "==", currentUserId),
    where("status", "==", "pending")
  );

  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

  if (!snap1.empty) {
    return {
      exists: true,
      status: snap1.docs[0].data().status as "pending",
      sentByMe: true,
      sentToMe: false,
      requestId: snap1.docs[0].id,
    };
  }

  if (!snap2.empty) {
    return {
      exists: true,
      status: snap2.docs[0].data().status as "pending",
      sentByMe: false,
      sentToMe: true,
      requestId: snap2.docs[0].id,
    };
  }

  return { exists: false };
}

/**
 * Accept a partner request
 */
export async function acceptPartnerRequest(
  currentUserId: string,
  otherUserId: string
): Promise<void> {
  // Find the request where otherUser sent to currentUser
  const requestQuery = query(
    collection(db, "partnerRequests"),
    where("fromUserId", "==", otherUserId),
    where("toUserId", "==", currentUserId),
    where("status", "==", "pending")
  );
  
  const requestSnap = await getDocs(requestQuery);
  
  if (requestSnap.empty) {
    throw new Error("No partner request found");
  }
  
  const requestDoc = requestSnap.docs[0];
  
  // Update request status to approved
  await updateDoc(doc(db, "partnerRequests", requestDoc.id), {
    status: "approved",
  });
  
  // Create partnership record
  await addDoc(collection(db, "partners"), {
    user1Id: currentUserId,
    user2Id: otherUserId,
    createdAt: serverTimestamp(),
  });
  
  // Add each user to the other's partners array
  const currentUserRef = doc(db, "users", currentUserId);
  const otherUserRef = doc(db, "users", otherUserId);
  
  await updateDoc(currentUserRef, {
    partners: arrayUnion(otherUserId),
  });
  
  await updateDoc(otherUserRef, {
    partners: arrayUnion(currentUserId),
  });
  
  // Create notification for the other user
  await createNotification({
    userId: otherUserId,
    type: "partner_accepted",
    actorId: currentUserId,
  });
}

export async function sendPartnerRequest(
  fromUserId: string,
  toUserId: string
): Promise<void> {
  // Check if already partners
  const alreadyPartners = await arePartnersAlready(fromUserId, toUserId);
  if (alreadyPartners) {
    throw new Error("You're already partners with this user");
  }

  // Check if request already exists
  const existing = await checkExistingRequest(fromUserId, toUserId);
  if (existing.exists) {
    throw new Error("A partner request already exists between you");
  }

  // Create the partner request
  await addDoc(collection(db, "partnerRequests"), {
    fromUserId,
    toUserId,
    status: "pending",
    createdAt: serverTimestamp(),
  });

  // Create notification for the recipient
  console.log("📧 Creating partner request notification:", {
    userId: toUserId,
    type: "partner_request",
    actorId: fromUserId,
  });
  
  await createNotification({
    userId: toUserId,
    type: "partner_request",
    actorId: fromUserId,
  });
  
  console.log("✅ Partner request notification created successfully");
}