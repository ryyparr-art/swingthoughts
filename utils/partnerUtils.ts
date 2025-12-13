import { auth, db } from "@/constants/firebaseConfig";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    query,
    updateDoc,
    where
} from "firebase/firestore";

export interface PartnerRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: any;
}

export interface Partner {
  id: string;
  user1Id: string;
  user2Id: string;
  createdAt: any;
}

// Send a partner request
export const sendPartnerRequest = async (toUserId: string) => {
  const fromUserId = auth.currentUser?.uid;
  if (!fromUserId) throw new Error("Not authenticated");

  // Check if request already exists
  const existingRequest = await checkExistingRequest(fromUserId, toUserId);
  if (existingRequest) {
    throw new Error("Partner request already exists");
  }

  // Check if already partners
  const alreadyPartners = await arePartnersAlready(fromUserId, toUserId);
  if (alreadyPartners) {
    throw new Error("Already partners");
  }

  await addDoc(collection(db, "partnerRequests"), {
    fromUserId,
    toUserId,
    status: "pending",
    createdAt: new Date(),
  });
};

// Check if a request already exists between two users
export const checkExistingRequest = async (userId1: string, userId2: string) => {
  const q1 = query(
    collection(db, "partnerRequests"),
    where("fromUserId", "==", userId1),
    where("toUserId", "==", userId2),
    where("status", "==", "pending")
  );

  const q2 = query(
    collection(db, "partnerRequests"),
    where("fromUserId", "==", userId2),
    where("toUserId", "==", userId1),
    where("status", "==", "pending")
  );

  const [snapshot1, snapshot2] = await Promise.all([getDocs(q1), getDocs(q2)]);

  return !snapshot1.empty || !snapshot2.empty;
};

// Check if two users are already partners
export const arePartnersAlready = async (userId1: string, userId2: string) => {
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

  const [snapshot1, snapshot2] = await Promise.all([getDocs(q1), getDocs(q2)]);

  return !snapshot1.empty || !snapshot2.empty;
};

// Accept a partner request
export const acceptPartnerRequest = async (requestId: string) => {
  const requestRef = doc(db, "partnerRequests", requestId);
  
  // Get the request details
  const requestQuery = query(
    collection(db, "partnerRequests"),
    where("__name__", "==", requestId)
  );
  const requestSnapshot = await getDocs(requestQuery);
  
  if (requestSnapshot.empty) {
    throw new Error("Request not found");
  }

  const requestData = requestSnapshot.docs[0].data() as PartnerRequest;

  // Create partnership
  await addDoc(collection(db, "partners"), {
    user1Id: requestData.fromUserId,
    user2Id: requestData.toUserId,
    createdAt: new Date(),
  });

  // Update request status to accepted
  await updateDoc(requestRef, {
    status: "accepted",
  });
};

// Decline a partner request
export const declinePartnerRequest = async (requestId: string) => {
  const requestRef = doc(db, "partnerRequests", requestId);
  
  await updateDoc(requestRef, {
    status: "declined",
  });
};

// Get all pending requests for current user
export const getPendingRequests = async () => {
  const userId = auth.currentUser?.uid;
  if (!userId) return [];

  const q = query(
    collection(db, "partnerRequests"),
    where("toUserId", "==", userId),
    where("status", "==", "pending")
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as PartnerRequest[];
};

// Get all partners for current user
export const getMyPartners = async () => {
  const userId = auth.currentUser?.uid;
  if (!userId) return [];

  const q1 = query(
    collection(db, "partners"),
    where("user1Id", "==", userId)
  );

  const q2 = query(
    collection(db, "partners"),
    where("user2Id", "==", userId)
  );

  const [snapshot1, snapshot2] = await Promise.all([getDocs(q1), getDocs(q2)]);

  const partners: Partner[] = [];
  
  snapshot1.docs.forEach(doc => {
    partners.push({
      id: doc.id,
      ...doc.data()
    } as Partner);
  });

  snapshot2.docs.forEach(doc => {
    partners.push({
      id: doc.id,
      ...doc.data()
    } as Partner);
  });

  return partners;
};

// Get partner user IDs (returns array of user IDs who are your partners)
export const getPartnerUserIds = async () => {
  const userId = auth.currentUser?.uid;
  if (!userId) return [];

  const partners = await getMyPartners();
  
  return partners.map(partner => 
    partner.user1Id === userId ? partner.user2Id : partner.user1Id
  );
};

// Remove partnership
export const removePartnership = async (partnerId: string) => {
  await deleteDoc(doc(db, "partners", partnerId));
};