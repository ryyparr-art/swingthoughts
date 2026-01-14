import { auth, db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface VerificationRequest {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  requestType: "course" | "pga_pro" | "course_membership";
  status: "pending" | "approved" | "denied" | "rejected";
  proofImageUrl?: string;
  courseId?: number;
  courseName?: string;
  credentials?: string;
  notes?: string;
  membershipNumber?: string;
  createdAt: any;
  reviewedAt?: any;
  reviewedBy?: string;
  rejectionReason?: string;
}

export default function VerificationsQueueScreen() {
  const router = useRouter();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionModalVisible, setRejectionModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<VerificationRequest | null>(null);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  useEffect(() => {
    if (loading) return;
    fetchRequests();
  }, [filter]);

  const checkAdminAccess = async () => {
    const user = auth.currentUser;
    if (!user) {
      router.replace("/");
      return;
    }

    try {
      const userDoc = await getDocs(
        query(collection(db, "users"), where("__name__", "==", user.uid))
      );

      if (!userDoc.empty) {
        const userData = userDoc.docs[0].data();
        if (userData.role === "admin") {
          setLoading(false);
          fetchRequests();
        } else {
          router.replace("/clubhouse");
        }
      }
    } catch (error) {
      console.error("Error checking admin access:", error);
      router.replace("/clubhouse");
    }
  };

  const fetchRequests = async () => {
    try {
      // Fetch verification requests
      let verificationQuery;
      if (filter === "pending") {
        verificationQuery = query(
          collection(db, "verification_requests"),
          where("status", "==", "pending"),
          orderBy("createdAt", "desc")
        );
      } else {
        verificationQuery = query(
          collection(db, "verification_requests"),
          orderBy("createdAt", "desc")
        );
      }

      const verificationSnapshot = await getDocs(verificationQuery);
      const requestsData: VerificationRequest[] = [];

      verificationSnapshot.forEach((doc) => {
        requestsData.push({ id: doc.id, ...doc.data() } as VerificationRequest);
      });

      // Fetch course membership requests
      let membershipQuery;
      if (filter === "pending") {
        membershipQuery = query(
          collection(db, "course_memberships"),
          where("status", "==", "pending"),
          orderBy("submittedAt", "desc")
        );
      } else {
        membershipQuery = query(
          collection(db, "course_memberships"),
          orderBy("submittedAt", "desc")
        );
      }

      const membershipSnapshot = await getDocs(membershipQuery);

      // Fetch user data for memberships
      const userIds = new Set<string>();
      membershipSnapshot.forEach((doc) => {
        userIds.add(doc.data().userId);
      });

      const userProfiles: Record<string, any> = {};
      if (userIds.size > 0) {
        const ids = Array.from(userIds);
        for (let i = 0; i < ids.length; i += 10) {
          const batch = ids.slice(i, i + 10);
          const uq = query(collection(db, "users"), where("__name__", "in", batch));
          const us = await getDocs(uq);
          us.forEach((u) => {
            userProfiles[u.id] = u.data();
          });
        }
      }

      membershipSnapshot.forEach((doc) => {
        const data = doc.data();
        const userProfile = userProfiles[data.userId] || {};
        
        requestsData.push({
          id: doc.id,
          userId: data.userId,
          userName: userProfile.displayName || "Unknown User",
          userEmail: auth.currentUser?.email || "",
          requestType: "course_membership",
          status: data.status,
          proofImageUrl: data.proofImageUrl,
          courseId: data.courseId,
          courseName: data.courseName,
          membershipNumber: data.membershipNumber,
          createdAt: data.submittedAt,
          reviewedAt: data.reviewedAt,
          reviewedBy: data.reviewedBy,
          rejectionReason: data.rejectionReason,
        } as VerificationRequest);
      });

      // Sort all requests by date
      requestsData.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      setRequests(requestsData);
      setRefreshing(false);
    } catch (error) {
      console.error("Error fetching verification requests:", error);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  /* ==================== ACTIONS ==================== */

  const handleApprove = async (request: VerificationRequest) => {
    const typeLabel =
      request.requestType === "course"
        ? "Course Account"
        : request.requestType === "pga_pro"
        ? "PGA Professional"
        : "Course Membership";

    Alert.alert(
      "Approve Request",
      `Approve ${request.userName} as ${typeLabel}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve",
          onPress: async () => {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

              if (request.requestType === "course_membership") {
                // Course membership approval
                // Update triggers onMembershipUpdated Cloud Function → membership_approved notification
                await updateDoc(doc(db, "course_memberships", request.id), {
                  status: "approved",
                  reviewedAt: serverTimestamp(),
                  reviewedBy: auth.currentUser?.uid,
                });

                // Update user document
                const userRef = doc(db, "users", request.userId);
                await updateDoc(userRef, {
                  declaredMemberCourses: arrayUnion(request.courseId),
                  pendingMembershipCourses: arrayRemove(request.courseId),
                });

                // ✅ NO CLIENT-SIDE NOTIFICATION
                // membership_approved notification is sent by onMembershipUpdated Cloud Function
                console.log("📬 Membership approved (notification handled by Cloud Function)");
              } else {
                // User verification approval (PGA Pro or Course account)
                await updateDoc(doc(db, "users", request.userId), {
                  userType: request.requestType === "course" ? "Course" : "PGA Pro",
                  verified: true,
                  verifiedAt: serverTimestamp(),
                  "verification.status": "approved",
                  "verification.reviewedAt": serverTimestamp(),
                  "verification.reviewedBy": auth.currentUser?.uid,
                });

                // Update triggers onVerificationRequestUpdated Cloud Function (if exists)
                await updateDoc(doc(db, "verification_requests", request.id), {
                  status: "approved",
                  reviewedAt: serverTimestamp(),
                  reviewedBy: auth.currentUser?.uid,
                });

                // For user verification, we still create notification directly
                // since this is an admin action and we may not have a Cloud Function for it
                await addDoc(collection(db, "notifications"), {
                  userId: request.userId,
                  type: "verification_approved",
                  message: `Your ${request.requestType === "course" ? "course" : "PGA Professional"} account has been verified! You can now post and message.`,
                  read: false,
                  createdAt: serverTimestamp(),
                });
              }

              Alert.alert("Success", "Request approved and user notified");
              fetchRequests();
            } catch (error) {
              console.error("Error approving request:", error);
              Alert.alert("Error", "Failed to approve request");
            }
          },
        },
      ]
    );
  };

  const handleDeny = async (request: VerificationRequest) => {
    if (request.requestType === "course_membership") {
      // For memberships, require rejection reason
      setSelectedRequest(request);
      setRejectionReason("");
      setRejectionModalVisible(true);
    } else {
      // For user verifications, use simple deny
      Alert.alert(
        "Deny Verification",
        `Deny verification for ${request.userName}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Deny",
            style: "destructive",
            onPress: async () => {
              try {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

                await updateDoc(doc(db, "verification_requests", request.id), {
                  status: "denied",
                  reviewedAt: serverTimestamp(),
                  reviewedBy: auth.currentUser?.uid,
                });

                // For user verification denial, create notification directly
                await addDoc(collection(db, "notifications"), {
                  userId: request.userId,
                  type: "verification_denied",
                  message: "Your verification request was not approved. Please contact support if you have questions.",
                  read: false,
                  createdAt: serverTimestamp(),
                });

                Alert.alert("Success", "Verification denied and user notified");
                fetchRequests();
              } catch (error) {
                console.error("Error denying verification:", error);
                Alert.alert("Error", "Failed to deny verification");
              }
            },
          },
        ]
      );
    }
  };

  const handleRejectMembership = async () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      Alert.alert("Missing Reason", "Please provide a reason for rejection");
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Update membership document
      // Update triggers onMembershipUpdated Cloud Function → membership_rejected notification
      await updateDoc(doc(db, "course_memberships", selectedRequest.id), {
        status: "rejected",
        rejectionReason: rejectionReason.trim(),
        reviewedAt: serverTimestamp(),
        reviewedBy: auth.currentUser?.uid,
      });

      // Update user document - remove from pending
      const userRef = doc(db, "users", selectedRequest.userId);
      await updateDoc(userRef, {
        pendingMembershipCourses: arrayRemove(selectedRequest.courseId),
      });

      // ✅ NO CLIENT-SIDE NOTIFICATION
      // membership_rejected notification is sent by onMembershipUpdated Cloud Function
      console.log("📬 Membership rejected (notification handled by Cloud Function)");

      Alert.alert("Success", "Membership rejected and user notified");
      setRejectionModalVisible(false);
      setSelectedRequest(null);
      setRejectionReason("");
      fetchRequests();
    } catch (error) {
      console.error("Error rejecting membership:", error);
      Alert.alert("Error", "Failed to reject membership");
    }
  };

  const handleViewImage = (imageUrl: string) => {
    setSelectedImageUrl(imageUrl);
    setImageModalVisible(true);
  };

  /* ==================== RENDER ==================== */

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "";
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const getRequestTypeLabel = (type: string) => {
    switch (type) {
      case "course":
        return "Course Account";
      case "pga_pro":
        return "PGA Professional";
      case "course_membership":
        return "Course Membership";
      default:
        return type;
    }
  };

  const getRequestTypeIcon = (type: string) => {
    switch (type) {
      case "course":
        return "golf";
      case "pga_pro":
        return "ribbon";
      case "course_membership":
        return "shield-checkmark";
      default:
        return "document";
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Image
            source={require("@/assets/icons/Back.png")}
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verification Queue</Text>
        <TouchableOpacity onPress={handleRefresh}>
          <Ionicons name="refresh" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* FILTER TABS */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterTab, filter === "pending" && styles.filterTabActive]}
          onPress={() => setFilter("pending")}
        >
          <Text
            style={[
              styles.filterText,
              filter === "pending" && styles.filterTextActive,
            ]}
          >
            Pending ({requests.filter((r) => r.status === "pending").length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === "all" && styles.filterTabActive]}
          onPress={() => setFilter("all")}
        >
          <Text
            style={[styles.filterText, filter === "all" && styles.filterTextActive]}
          >
            All ({requests.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {requests.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={64} color="#0D5C3A" />
            <Text style={styles.emptyText}>No verification requests</Text>
          </View>
        ) : (
          requests.map((request) => (
            <View
              key={request.id}
              style={[
                styles.requestCard,
                request.status !== "pending" && styles.requestCardResolved,
              ]}
            >
              {/* HEADER */}
              <View style={styles.requestHeader}>
                <Ionicons
                  name={getRequestTypeIcon(request.requestType)}
                  size={24}
                  color="#0D5C3A"
                />
                <View style={styles.requestHeaderText}>
                  <Text style={styles.requestType}>
                    {getRequestTypeLabel(request.requestType)}
                  </Text>
                  <Text style={styles.requestDate}>
                    {formatDate(request.createdAt)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    request.status === "pending" && styles.statusBadgePending,
                    request.status === "approved" && styles.statusBadgeApproved,
                    (request.status === "denied" || request.status === "rejected") && styles.statusBadgeDenied,
                  ]}
                >
                  <Text style={styles.statusText}>{request.status}</Text>
                </View>
              </View>

              {/* CONTENT */}
              <View style={styles.requestContent}>
                <Text style={styles.userName}>{request.userName}</Text>
                {request.userEmail && (
                  <Text style={styles.userEmail}>{request.userEmail}</Text>
                )}

                {request.requestType === "course_membership" && (
                  <>
                    <Text style={styles.label}>Course:</Text>
                    <Text style={styles.value}>{request.courseName}</Text>

                    {request.membershipNumber && (
                      <>
                        <Text style={styles.label}>Membership Number:</Text>
                        <Text style={styles.value}>{request.membershipNumber}</Text>
                      </>
                    )}

                    {request.rejectionReason && request.status === "rejected" && (
                      <>
                        <Text style={styles.label}>Rejection Reason:</Text>
                        <Text style={styles.rejectionValue}>{request.rejectionReason}</Text>
                      </>
                    )}
                  </>
                )}

                {request.requestType === "course" && request.courseName && (
                  <>
                    <Text style={styles.label}>Course Claimed:</Text>
                    <Text style={styles.value}>{request.courseName}</Text>
                  </>
                )}

                {request.credentials && (
                  <>
                    <Text style={styles.label}>Credentials:</Text>
                    <Text style={styles.value}>{request.credentials}</Text>
                  </>
                )}

                {request.notes && (
                  <>
                    <Text style={styles.label}>Notes:</Text>
                    <Text style={styles.value}>{request.notes}</Text>
                  </>
                )}

                {/* PROOF IMAGE */}
                {request.proofImageUrl && (
                  <TouchableOpacity
                    style={styles.proofImageContainer}
                    onPress={() => handleViewImage(request.proofImageUrl!)}
                  >
                    <Image
                      source={{ uri: request.proofImageUrl }}
                      style={styles.proofImageThumb}
                    />
                    <View style={styles.viewImageOverlay}>
                      <Ionicons name="expand" size={24} color="#FFF" />
                      <Text style={styles.viewImageText}>View Proof</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              {/* ACTIONS */}
              {request.status === "pending" && (
                <View style={styles.actionsContainer}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.approveButton]}
                    onPress={() => handleApprove(request)}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                    <Text style={styles.approveButtonText}>Approve</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.denyButton]}
                    onPress={() => handleDeny(request)}
                  >
                    <Ionicons name="close-circle" size={20} color="#FFF" />
                    <Text style={styles.denyButtonText}>
                      {request.requestType === "course_membership" ? "Reject" : "Deny"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* IMAGE MODAL */}
      <Modal
        visible={imageModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setImageModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalClose}
            onPress={() => setImageModalVisible(false)}
          >
            <Image
              source={require("@/assets/icons/Close.png")}
              style={styles.closeIcon}
            />
          </TouchableOpacity>
          <Image
            source={{ uri: selectedImageUrl }}
            style={styles.fullImage}
            resizeMode="contain"
          />
        </View>
      </Modal>

      {/* REJECTION REASON MODAL */}
      <Modal
        visible={rejectionModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setRejectionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.rejectionModal}>
            <Text style={styles.rejectionModalTitle}>Rejection Reason</Text>
            <Text style={styles.rejectionModalDescription}>
              Please provide a reason for rejecting this membership request. The user will see this message.
            </Text>

            <TextInput
              style={styles.rejectionInput}
              placeholder="e.g., Proof image is unclear, please resubmit with a clearer photo"
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            <View style={styles.rejectionModalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setRejectionModalVisible(false);
                  setRejectionReason("");
                  setSelectedRequest(null);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalRejectButton]}
                onPress={handleRejectMembership}
                disabled={!rejectionReason.trim()}
              >
                <Text style={styles.modalRejectText}>Reject Request</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ==================== STYLES ==================== */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  safeTop: {
    backgroundColor: "#0D5C3A",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#0D5C3A",
  },

  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFF",
  },

  headerTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },

  filterContainer: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },

  filterTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },

  filterTabActive: {
    borderBottomColor: "#0D5C3A",
  },

  filterText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },

  filterTextActive: {
    color: "#0D5C3A",
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  requestCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: "hidden",
  },

  requestCardResolved: {
    opacity: 0.7,
  },

  requestHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#F7F8FA",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },

  requestHeaderText: {
    flex: 1,
    marginLeft: 12,
  },

  requestType: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  },

  requestDate: {
    fontSize: 11,
    color: "#666",
    marginTop: 2,
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },

  statusBadgePending: {
    backgroundColor: "#FF9500",
  },

  statusBadgeApproved: {
    backgroundColor: "#0D5C3A",
  },

  statusBadgeDenied: {
    backgroundColor: "#FF3B30",
  },

  statusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFF",
    textTransform: "uppercase",
  },

  requestContent: {
    padding: 12,
  },

  userName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 2,
  },

  userEmail: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },

  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginTop: 8,
    marginBottom: 4,
  },

  value: {
    fontSize: 14,
    color: "#333",
  },

  rejectionValue: {
    fontSize: 14,
    color: "#FF3B30",
    fontStyle: "italic",
  },

  proofImageContainer: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },

  proofImageThumb: {
    width: "100%",
    height: 200,
    backgroundColor: "#F0F0F0",
  },

  viewImageOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },

  viewImageText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },

  actionsContainer: {
    flexDirection: "row",
    padding: 8,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
  },

  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
  },

  approveButton: {
    backgroundColor: "#0D5C3A",
  },

  approveButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },

  denyButton: {
    backgroundColor: "#FF3B30",
  },

  denyButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },

  emptyText: {
    fontSize: 16,
    color: "#666",
    marginTop: 16,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },

  /* IMAGE MODAL */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalClose: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },

  closeIcon: {
    width: 32,
    height: 32,
    tintColor: "#FFF",
  },

  fullImage: {
    width: "90%",
    height: "80%",
  },

  /* REJECTION MODAL */
  rejectionModal: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    width: "85%",
    maxWidth: 400,
  },

  rejectionModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
  },

  rejectionModalDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
    lineHeight: 20,
  },

  rejectionInput: {
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    padding: 12,
    fontSize: 14,
    minHeight: 100,
    marginBottom: 16,
  },

  rejectionModalActions: {
    flexDirection: "row",
    gap: 8,
  },

  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },

  modalCancelButton: {
    backgroundColor: "#E0E0E0",
  },

  modalCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#666",
  },

  modalRejectButton: {
    backgroundColor: "#FF3B30",
  },

  modalRejectText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },
});