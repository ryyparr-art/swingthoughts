import { auth, db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  collection,
  getCountFromServer,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
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

interface Metrics {
  totalUsers: number;
  activeUsersLast7Days: number;
  activeUsersLast30Days: number;
  totalScores: number;
  totalPosts: number;
  pendingReports: number;
  pendingVerifications: number;
  avgPartnersPerUser: number;
  dailyActiveUsers: number;
}

export default function AdminDashboardScreen() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics>({
    totalUsers: 0,
    activeUsersLast7Days: 0,
    activeUsersLast30Days: 0,
    totalScores: 0,
    totalPosts: 0,
    pendingReports: 0,
    pendingVerifications: 0,
    avgPartnersPerUser: 0,
    dailyActiveUsers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [syncingTournaments, setSyncingTournaments] = useState(false);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  /* ==================== ACCESS CONTROL ==================== */
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
          setUserRole("admin");
          fetchMetrics();
        } else {
          // Not admin - redirect
          router.replace("/clubhouse");
        }
      }
    } catch (error) {
      console.error("Error checking admin access:", error);
      router.replace("/clubhouse");
    }
  };

  /* ==================== FETCH METRICS ==================== */
  const fetchMetrics = async () => {
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Total Users
      const usersCount = await getCountFromServer(collection(db, "users"));

      // Active Users (last 7 days)
      const active7DaysQuery = query(
        collection(db, "users"),
        where("updatedAt", ">=", sevenDaysAgo.toISOString())
      );
      const active7Days = await getCountFromServer(active7DaysQuery);

      // Active Users (last 30 days)
      const active30DaysQuery = query(
        collection(db, "users"),
        where("updatedAt", ">=", thirtyDaysAgo.toISOString())
      );
      const active30Days = await getCountFromServer(active30DaysQuery);

      // Daily Active Users (last 24 hours)
      const dailyActiveQuery = query(
        collection(db, "users"),
        where("updatedAt", ">=", oneDayAgo.toISOString())
      );
      const dailyActive = await getCountFromServer(dailyActiveQuery);

      // Total Scores
      const scoresCount = await getCountFromServer(collection(db, "scores"));

      // Total Posts
      const postsCount = await getCountFromServer(collection(db, "thoughts"));

      // Pending Reports
      const pendingReportsQuery = query(
        collection(db, "reports"),
        where("status", "==", "pending")
      );
      const pendingReportsCount = await getCountFromServer(pendingReportsQuery);

      // Pending Verifications
      const pendingVerificationsQuery = query(
        collection(db, "verification_requests"),
        where("status", "==", "pending")
      );
      const pendingVerificationsCount = await getCountFromServer(pendingVerificationsQuery);

      // Average Partners Per User
      const usersSnapshot = await getDocs(collection(db, "users"));
      let totalPartners = 0;
      usersSnapshot.forEach((doc) => {
        const partners = doc.data().partners || [];
        totalPartners += partners.length;
      });
      const avgPartners =
        usersSnapshot.size > 0
          ? (totalPartners / usersSnapshot.size).toFixed(1)
          : 0;

      setMetrics({
        totalUsers: usersCount.data().count,
        activeUsersLast7Days: active7Days.data().count,
        activeUsersLast30Days: active30Days.data().count,
        totalScores: scoresCount.data().count,
        totalPosts: postsCount.data().count,
        pendingReports: pendingReportsCount.data().count,
        pendingVerifications: pendingVerificationsCount.data().count,
        avgPartnersPerUser: Number(avgPartners),
        dailyActiveUsers: dailyActive.data().count,
      });

      setLoading(false);
      setRefreshing(false);
    } catch (error) {
      console.error("Error fetching metrics:", error);
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchMetrics();
  };

  /* ==================== TOURNAMENT SYNC ==================== */
  const handleSyncTournaments = async () => {
    Alert.alert(
      "Sync 2026 Tournaments",
      "This will fetch all PGA Tour tournaments for 2026 from the API. This may take a few minutes.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sync",
          onPress: async () => {
            try {
              setSyncingTournaments(true);
              console.log("🏌️ Starting tournament sync...");

              const functions = getFunctions();
              const syncSchedule = httpsCallable(functions, "syncTournamentSchedule");

              const result = await syncSchedule({ year: "2026", orgId: "1" });
              const data = result.data as any;

              console.log("✅ Sync complete:", data);

              Alert.alert(
                "Sync Complete",
                `Successfully synced ${data.successCount} tournaments.\n${data.errorCount} errors.`,
                [{ text: "OK" }]
              );
            } catch (error: any) {
              console.error("❌ Sync failed:", error);
              Alert.alert("Sync Failed", error.message || "Unknown error occurred");
            } finally {
              setSyncingTournaments(false);
            }
          },
        },
      ]
    );
  };

  /* ==================== CALCULATED METRICS ==================== */
  const dau_mau_ratio =
    metrics.activeUsersLast30Days > 0
      ? ((metrics.dailyActiveUsers / metrics.activeUsersLast30Days) * 100).toFixed(1)
      : "0";

  const engagementRate =
    metrics.totalUsers > 0
      ? (((metrics.totalPosts + metrics.totalScores) / metrics.totalUsers) * 100).toFixed(1)
      : "0";

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
        <Text style={styles.loadingText}>Loading Admin Dashboard...</Text>
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
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <TouchableOpacity onPress={handleRefresh}>
          <Ionicons name="refresh" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* QUICK ACTIONS */}
        <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/admin/reports")}
          >
            <View style={styles.actionIconContainer}>
              <Ionicons name="flag" size={24} color="#FF3B30" />
              {metrics.pendingReports > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{metrics.pendingReports}</Text>
                </View>
              )}
            </View>
            <Text style={styles.actionLabel}>Reports</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/admin/verifications")}
          >
            <View style={styles.actionIconContainer}>
              <Ionicons name="checkmark-circle" size={24} color="#0D5C3A" />
              {metrics.pendingVerifications > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{metrics.pendingVerifications}</Text>
                </View>
              )}
            </View>
            <Text style={styles.actionLabel}>Verify Users</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/admin/users")}
          >
            <Ionicons name="people" size={24} color="#0D5C3A" />
            <Text style={styles.actionLabel}>User Mgmt</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/admin/analytics")}
          >
            <Ionicons name="stats-chart" size={24} color="#0D5C3A" />
            <Text style={styles.actionLabel}>Analytics</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push("/admin/migration")}
          >
            <Ionicons name="refresh-circle" size={24} color="#FF9500" />
            <Text style={styles.actionLabel}>Migration</Text>
          </TouchableOpacity>
        </View>

        {/* TOURNAMENT SYNC */}
        <Text style={styles.sectionTitle}>TOURNAMENT DATA</Text>
        <TouchableOpacity
          style={[styles.syncButton, syncingTournaments && styles.syncButtonDisabled]}
          onPress={handleSyncTournaments}
          disabled={syncingTournaments}
        >
          {syncingTournaments ? (
            <>
              <ActivityIndicator size="small" color="#FFF" />
              <Text style={styles.syncButtonText}>Syncing Tournaments...</Text>
            </>
          ) : (
            <>
              <Ionicons name="golf" size={20} color="#FFF" />
              <Text style={styles.syncButtonText}>Sync 2025 PGA Tour Schedule</Text>
            </>
          )}
        </TouchableOpacity>

        {/* KEY METRICS */}
        <Text style={styles.sectionTitle}>KEY METRICS</Text>

        {/* Engagement Metrics */}
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, styles.metricCardPrimary]}>
            <Text style={styles.metricValue}>{metrics.dailyActiveUsers}</Text>
            <Text style={styles.metricLabel}>Daily Active Users</Text>
          </View>
          <View style={[styles.metricCard, styles.metricCardPrimary]}>
            <Text style={styles.metricValue}>{dau_mau_ratio}%</Text>
            <Text style={styles.metricLabel}>DAU/MAU Ratio</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{metrics.activeUsersLast7Days}</Text>
            <Text style={styles.metricLabel}>Active (7d)</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{metrics.activeUsersLast30Days}</Text>
            <Text style={styles.metricLabel}>Active (30d)</Text>
          </View>
        </View>

        {/* Growth Metrics */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{metrics.totalUsers}</Text>
            <Text style={styles.metricLabel}>Total Users</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{metrics.avgPartnersPerUser}</Text>
            <Text style={styles.metricLabel}>Avg Partners/User</Text>
          </View>
        </View>

        {/* Content Metrics */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{metrics.totalScores}</Text>
            <Text style={styles.metricLabel}>Total Scores</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{metrics.totalPosts}</Text>
            <Text style={styles.metricLabel}>Total Posts</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, styles.fullWidthCard]}>
            <Text style={styles.metricValue}>{engagementRate}%</Text>
            <Text style={styles.metricLabel}>Engagement Rate</Text>
            <Text style={styles.metricHelper}>
              (Posts + Scores) / Total Users
            </Text>
          </View>
        </View>

        {/* ADMIN INFO */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color="#0D5C3A" />
          <Text style={styles.infoText}>
            Last refreshed: {new Date().toLocaleTimeString()}
          </Text>
        </View>
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
    borderBottomWidth: 2,
    borderBottomColor: "#FFD700",
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

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0D5C3A",
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 12,
  },

  /* QUICK ACTIONS */
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },

  actionCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  actionIconContainer: {
    position: "relative",
    marginBottom: 8,
  },

  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#FF3B30",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  badgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },

  actionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
  },

  /* TOURNAMENT SYNC BUTTON */
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },

  syncButtonDisabled: {
    backgroundColor: "#8FAF9D",
  },

  syncButtonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "700",
  },

  /* METRICS */
  metricsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },

  metricCard: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  metricCardPrimary: {
    backgroundColor: "#E8F5E9",
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },

  fullWidthCard: {
    flex: 1,
  },

  metricValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  metricLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    textAlign: "center",
  },

  metricHelper: {
    fontSize: 10,
    color: "#999",
    marginTop: 4,
    fontStyle: "italic",
    textAlign: "center",
  },

  /* INFO CARD */
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginTop: 8,
  },

  infoText: {
    fontSize: 12,
    color: "#0D5C3A",
    fontWeight: "500",
  },

  /* LOADING */
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#0D5C3A",
    fontWeight: "600",
  },
});