import { auth, db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  postId: string;
  postAuthorId: string;
  postAuthorName: string;
  postContent: string;
  category: string;
  details?: string;
  status: "pending" | "reviewed" | "resolved" | "dismissed";
  createdAt: any;
}

interface UserPattern {
  userId: string;
  displayName: string;
  reportCount: number;
  accountAge: number;
  postCount: number;
  recentReportDates: Date[];
  isSuspicious: boolean;
}

export default function ReportsQueueScreen() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [patterns, setPatterns] = useState<UserPattern[]>([]);
  const [showPatterns, setShowPatterns] = useState(true);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  useEffect(() => {
    if (loading) return;
    fetchReports();
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
          fetchReports();
        } else {
          router.replace("/clubhouse");
        }
      }
    } catch (error) {
      console.error("Error checking admin access:", error);
      router.replace("/clubhouse");
    }
  };

  const fetchReports = async () => {
    try {
      let q;
      if (filter === "pending") {
        q = query(
          collection(db, "reports"),
          where("status", "==", "pending"),
          orderBy("createdAt", "desc")
        );
      } else {
        q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
      }

      const snapshot = await getDocs(q);
      const reportsData: Report[] = [];

      snapshot.forEach((doc) => {
        reportsData.push({ id: doc.id, ...doc.data() } as Report);
      });

      setReports(reportsData);
      
      // Detect patterns
      await detectPatterns(reportsData);
      
      setRefreshing(false);
    } catch (error) {
      console.error("Error fetching reports:", error);
      setRefreshing(false);
    }
  };

  /* ==================== PATTERN DETECTION ==================== */
  const detectPatterns = async (reports: Report[]) => {
    try {
      // Group reports by reported user
      const userReportMap: { [userId: string]: Report[] } = {};

      reports.forEach((report) => {
        if (report.status === "pending") { // Only count pending reports
          if (!userReportMap[report.postAuthorId]) {
            userReportMap[report.postAuthorId] = [];
          }
          userReportMap[report.postAuthorId].push(report);
        }
      });

      const patternList: UserPattern[] = [];
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      for (const [userId, userReports] of Object.entries(userReportMap)) {
        try {
          // Get user data
          const userDoc = await getDoc(doc(db, "users", userId));
          if (!userDoc.exists()) continue;

          const userData = userDoc.data();
          const createdAt = userData.createdAt?.toDate() || now;
          const accountAgeDays = Math.floor(
            (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
          );

          // Count user's posts
          const postsQuery = query(
            collection(db, "thoughts"),
            where("userId", "==", userId)
          );
          const postsSnap = await getDocs(postsQuery);
          const postCount = postsSnap.size;

          // Get recent report dates
          const recentReportDates = userReports
            .filter((r) => r.createdAt?.toDate() >= oneDayAgo)
            .map((r) => r.createdAt.toDate());

          const reportCount = userReports.length;

          // Determine if suspicious
          const isSuspicious =
            reportCount >= 5 || // 5+ reports = HIGH RISK
            (reportCount >= 3 && accountAgeDays < 3) || // 3+ reports on new account
            (recentReportDates.length >= 5); // 5+ reports in 24 hours

          // Flag if pattern detected (3+ reports or suspicious)
          if (reportCount >= 3 || isSuspicious) {
            patternList.push({
              userId,
              displayName: userData.displayName || "Unknown",
              reportCount,
              accountAge: accountAgeDays,
              postCount,
              recentReportDates,
              isSuspicious,
            });
          }
        } catch (error) {
          console.error("Error analyzing user pattern:", error);
        }
      }

      // Sort by report count (highest first)
      patternList.sort((a, b) => b.reportCount - a.reportCount);

      setPatterns(patternList);
    } catch (error) {
      console.error("Error detecting patterns:", error);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchReports();
  };

  /* ==================== ACTIONS ==================== */

  const handleRemovePost = async (report: Report) => {
    Alert.alert(
      "Remove Post",
      "This will permanently delete the post. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

              // Delete the post
              await deleteDoc(doc(db, "thoughts", report.postId));

              // Mark report as resolved
              await updateDoc(doc(db, "reports", report.id), {
                status: "resolved",
                action: "removed",
                reviewedAt: new Date(),
                reviewedBy: auth.currentUser?.uid,
              });

              Alert.alert("Success", "Post removed and report resolved");
              fetchReports();
            } catch (error) {
              console.error("Error removing post:", error);
              Alert.alert("Error", "Failed to remove post");
            }
          },
        },
      ]
    );
  };

  const handleBanUser = async (userId: string, displayName: string) => {
    Alert.alert(
      "Ban User",
      `This will ban "${displayName}" and delete all their content. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Ban",
          style: "destructive",
          onPress: async () => {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

              // Update user document (mark as banned)
              await updateDoc(doc(db, "users", userId), {
                banned: true,
                bannedAt: new Date(),
              });

              // Delete all their posts
              const postsQuery = query(
                collection(db, "thoughts"),
                where("userId", "==", userId)
              );
              const postsSnap = await getDocs(postsQuery);

              const deletePromises = postsSnap.docs.map((doc) =>
                deleteDoc(doc.ref)
              );
              await Promise.all(deletePromises);

              // Mark all reports against this user as resolved
              const reportsQuery = query(
                collection(db, "reports"),
                where("postAuthorId", "==", userId)
              );
              const reportsSnap = await getDocs(reportsQuery);

              const updatePromises = reportsSnap.docs.map((doc) =>
                updateDoc(doc.ref, { status: "resolved" })
              );
              await Promise.all(updatePromises);

              Alert.alert("User Banned", `All content from "${displayName}" has been removed.`);
              fetchReports();
            } catch (error) {
              console.error("Error banning user:", error);
              Alert.alert("Error", "Failed to ban user");
            }
          },
        },
      ]
    );
  };

  const handleWarning = async (report: Report) => {
    Alert.alert(
      "Issue Warning",
      `Send a warning to ${report.postAuthorName}? (Feature coming soon)`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Warn",
          onPress: async () => {
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

              // Mark report as resolved with warning
              await updateDoc(doc(db, "reports", report.id), {
                status: "resolved",
                action: "warning",
                reviewedAt: new Date(),
                reviewedBy: auth.currentUser?.uid,
              });

              // TODO: Send notification to user

              Alert.alert("Success", "Warning issued and report resolved");
              fetchReports();
            } catch (error) {
              console.error("Error issuing warning:", error);
              Alert.alert("Error", "Failed to issue warning");
            }
          },
        },
      ]
    );
  };

  const handleDismiss = async (report: Report) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      await updateDoc(doc(db, "reports", report.id), {
        status: "dismissed",
        reviewedAt: new Date(),
        reviewedBy: auth.currentUser?.uid,
      });

      Alert.alert("Success", "Report dismissed");
      fetchReports();
    } catch (error) {
      console.error("Error dismissing report:", error);
      Alert.alert("Error", "Failed to dismiss report");
    }
  };

  const handleViewPost = (postId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/clubhouse",
      params: { highlightPostId: postId },
    });
  };

  /* ==================== RENDER ==================== */

  const getCategoryEmoji = (category: string) => {
    if (!category) return "🚩";
    
    const map: Record<string, string> = {
      spam: "🚫",
      harassment: "😡",
      violence: "⚠️",
      inappropriate: "🔞",
      false_info: "❌",
      other: "📝",
    };
    return map[category] || "🚩";
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "";
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
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
        <Text style={styles.headerTitle}>Reports Queue</Text>
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
            Pending ({reports.filter((r) => r.status === "pending").length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === "all" && styles.filterTabActive]}
          onPress={() => setFilter("all")}
        >
          <Text
            style={[styles.filterText, filter === "all" && styles.filterTextActive]}
          >
            All ({reports.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* PATTERN WARNINGS */}
        {patterns.length > 0 && filter === "pending" && (
          <View style={styles.patternsSection}>
            <TouchableOpacity
              style={styles.patternsSectionHeader}
              onPress={() => setShowPatterns(!showPatterns)}
            >
              <Text style={styles.patternsSectionTitle}>
                ⚠️ Suspicious Patterns ({patterns.length})
              </Text>
              <Ionicons
                name={showPatterns ? "chevron-up" : "chevron-down"}
                size={20}
                color="#FF3B30"
              />
            </TouchableOpacity>

            {showPatterns && patterns.map((pattern) => (
              <View
                key={pattern.userId}
                style={[
                  styles.patternCard,
                  pattern.isSuspicious && styles.patternCardSuspicious,
                ]}
              >
                <View style={styles.patternHeader}>
                  <Text style={styles.patternUser}>{pattern.displayName}</Text>
                  {pattern.isSuspicious && (
                    <View style={styles.severityBadge}>
                      <Text style={styles.severityText}>HIGH RISK</Text>
                    </View>
                  )}
                </View>

                <View style={styles.patternStats}>
                  <Text style={styles.patternStat}>
                    📊 {pattern.reportCount} pending reports
                  </Text>
                  <Text style={styles.patternStat}>
                    📅 Account age: {pattern.accountAge} days
                  </Text>
                  <Text style={styles.patternStat}>
                    📝 {pattern.postCount} total posts
                  </Text>
                  {pattern.recentReportDates.length > 0 && (
                    <Text style={styles.patternStat}>
                      🔥 {pattern.recentReportDates.length} reports in last 24 hours
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.banButton}
                  onPress={() => handleBanUser(pattern.userId, pattern.displayName)}
                >
                  <Ionicons name="ban" size={18} color="#FFF" />
                  <Text style={styles.banButtonText}>Ban User & Delete All Content</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* REPORTS LIST */}
        {reports.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={64} color="#0D5C3A" />
            <Text style={styles.emptyText}>No reports to review</Text>
          </View>
        ) : (
          reports.map((report) => (
            <View
              key={report.id}
              style={[
                styles.reportCard,
                report.status !== "pending" && styles.reportCardResolved,
              ]}
            >
              {/* HEADER */}
              <View style={styles.reportHeader}>
                <Text style={styles.categoryEmoji}>
                  {getCategoryEmoji(report.category)}
                </Text>
                <View style={styles.reportHeaderText}>
                  <Text style={styles.reportCategory}>
                    {report.category ? report.category.replace("_", " ").toUpperCase() : "UNKNOWN"}
                  </Text>
                  <Text style={styles.reportDate}>{formatDate(report.createdAt)}</Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    report.status === "pending" && styles.statusBadgePending,
                    report.status === "resolved" && styles.statusBadgeResolved,
                    report.status === "dismissed" && styles.statusBadgeDismissed,
                  ]}
                >
                  <Text style={styles.statusText}>{report.status}</Text>
                </View>
              </View>

              {/* CONTENT */}
              <View style={styles.reportContent}>
                <Text style={styles.reportLabel}>Post Author:</Text>
                <Text style={styles.reportValue}>{report.postAuthorName}</Text>

                <Text style={styles.reportLabel}>Reported By:</Text>
                <Text style={styles.reportValue}>{report.reporterName}</Text>

                <Text style={styles.reportLabel}>Post Content:</Text>
                <Text style={styles.postContent} numberOfLines={3}>
                  {report.postContent}
                </Text>

                {report.details && (
                  <>
                    <Text style={styles.reportLabel}>Details:</Text>
                    <Text style={styles.reportValue}>{report.details}</Text>
                  </>
                )}
              </View>

              {/* ACTIONS */}
              {report.status === "pending" && (
                <View style={styles.actionsContainer}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleViewPost(report.postId)}
                  >
                    <Ionicons name="eye-outline" size={18} color="#0D5C3A" />
                    <Text style={styles.actionButtonText}>View</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.warningButton]}
                    onPress={() => handleWarning(report)}
                  >
                    <Ionicons name="warning-outline" size={18} color="#FF9500" />
                    <Text style={styles.warningButtonText}>Warn</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.removeButton]}
                    onPress={() => handleRemovePost(report)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.dismissButton]}
                    onPress={() => handleDismiss(report)}
                  >
                    <Ionicons name="close-outline" size={18} color="#666" />
                    <Text style={styles.dismissButtonText}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
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

  /* PATTERN SECTION */
  patternsSection: {
    marginBottom: 16,
  },

  patternsSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFE5E5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },

  patternsSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FF3B30",
  },

  patternCard: {
    backgroundColor: "#FFF3CD",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#FFC107",
  },

  patternCardSuspicious: {
    backgroundColor: "#FFE5E5",
    borderColor: "#FF3B30",
  },

  patternHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  patternUser: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  severityBadge: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },

  severityText: {
    color: "#FFF",
    fontSize: 10,
    fontWeight: "700",
  },

  patternStats: {
    marginBottom: 12,
  },

  patternStat: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },

  banButton: {
    flexDirection: "row",
    backgroundColor: "#FF3B30",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  banButtonText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 14,
  },

  /* REPORTS */
  reportCard: {
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

  reportCardResolved: {
    opacity: 0.7,
  },

  reportHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#F7F8FA",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },

  categoryEmoji: {
    fontSize: 24,
    marginRight: 12,
  },

  reportHeaderText: {
    flex: 1,
  },

  reportCategory: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  },

  reportDate: {
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

  statusBadgeResolved: {
    backgroundColor: "#0D5C3A",
  },

  statusBadgeDismissed: {
    backgroundColor: "#999",
  },

  statusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFF",
    textTransform: "uppercase",
  },

  reportContent: {
    padding: 12,
  },

  reportLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginTop: 8,
    marginBottom: 4,
  },

  reportValue: {
    fontSize: 14,
    color: "#333",
  },

  postContent: {
    fontSize: 14,
    color: "#333",
    backgroundColor: "#F7F8FA",
    padding: 8,
    borderRadius: 8,
    fontStyle: "italic",
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
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F0F0F0",
  },

  actionButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  warningButton: {
    backgroundColor: "#FFF5E5",
  },

  warningButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FF9500",
  },

  removeButton: {
    backgroundColor: "#FFF5F5",
  },

  removeButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FF3B30",
  },

  dismissButton: {
    backgroundColor: "#F0F0F0",
  },

  dismissButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
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
});