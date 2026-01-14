import { db } from "@/constants/firebaseConfig";
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
 * 
 * ✅ Notifications handled by Cloud Function: onPartnerRequestUpdated
 * When status changes to "approved", Cloud Function sends partner_accepted notification
 */
export async function acceptPartnerRequest(
  currentUserId: string,
  otherUserId: string
): Promise<void> {
  console.log("🤝 Starting acceptPartnerRequest", { currentUserId, otherUserId });
  
  // Find the request where otherUser sent to currentUser
  const requestQuery = query(
    collection(db, "partnerRequests"),
    where("fromUserId", "==", otherUserId),
    where("toUserId", "==", currentUserId),
    where("status", "==", "pending")
  );
  
  const requestSnap = await getDocs(requestQuery);
  
  if (requestSnap.empty) {
    console.error("❌ No partner request found");
    throw new Error("No partner request found");
  }
  
  const requestDoc = requestSnap.docs[0];
  console.log("✅ Found partner request:", requestDoc.id);
  
  // Update request status to approved (triggers onPartnerRequestUpdated Cloud Function)
  await updateDoc(doc(db, "partnerRequests", requestDoc.id), {
    status: "approved",
    approvedAt: serverTimestamp(),
  });
  console.log("✅ Updated request status to approved (triggers Cloud Function notification)");
  
  // Create partnership record
  const partnershipRef = await addDoc(collection(db, "partners"), {
    user1Id: currentUserId,
    user2Id: otherUserId,
    createdAt: serverTimestamp(),
  });
  console.log("✅ Created partnership:", partnershipRef.id);
  
  // Add each user to the other's partners array
  const currentUserRef = doc(db, "users", currentUserId);
  const otherUserRef = doc(db, "users", otherUserId);
  
  await updateDoc(currentUserRef, {
    partners: arrayUnion(otherUserId),
  });
  console.log("✅ Updated currentUser partners array");
  
  await updateDoc(otherUserRef, {
    partners: arrayUnion(currentUserId),
  });
  console.log("✅ Updated otherUser partners array");
  
  // ✅ NO CLIENT-SIDE NOTIFICATION
  // partner_accepted notification is sent by onPartnerRequestUpdated Cloud Function
  console.log("📬 Notification handled by Cloud Function");
  
  console.log("🎉 Partner accept complete!");
}

/**
 * Send a partner request
 * 
 * ✅ Notifications handled by Cloud Function: onPartnerRequestCreated
 * When partnerRequests document is created, Cloud Function sends partner_request notification
 */
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

  // Create the partner request (triggers onPartnerRequestCreated Cloud Function)
  await addDoc(collection(db, "partnerRequests"), {
    fromUserId,
    toUserId,
    status: "pending",
    createdAt: serverTimestamp(),
  });

  // ✅ NO CLIENT-SIDE NOTIFICATION
  // partner_request notification is sent by onPartnerRequestCreated Cloud Function
  console.log("📬 Partner request created (notification handled by Cloud Function)");
}