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
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Analytics {
  // User Metrics
  totalUsers: number;
  usersToday: number;
  usersThisWeek: number;
  usersThisMonth: number;
  
  // Activity Metrics
  dau: number;
  wau: number;
  mau: number;
  
  // Content Metrics
  totalPosts: number;
  postsToday: number;
  postsThisWeek: number;
  totalScores: number;
  scoresToday: number;
  scoresThisWeek: number;
  
  // Engagement Metrics
  avgPostsPerUser: number;
  avgScoresPerUser: number;
  avgPartnersPerUser: number;
  
  // Growth Metrics
  userGrowthRate: number;
  contentGrowthRate: number;
  
  // Top Users
  topPosters: Array<{ name: string; count: number }>;
  topScorers: Array<{ name: string; count: number }>;
}

export default function AnalyticsScreen() {
  const router = useRouter();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    checkAdminAccess();
  }, []);

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
          fetchAnalytics();
        } else {
          router.replace("/clubhouse");
        }
      }
    } catch (error) {
      console.error("Error checking admin access:", error);
      router.replace("/clubhouse");
    }
  };

  const fetchAnalytics = async () => {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      // Total Users
      const totalUsersCount = await getCountFromServer(collection(db, "users"));
      
      // Users by time period
      const usersTodayCount = await getCountFromServer(
        query(collection(db, "users"), where("createdAt", ">=", oneDayAgo))
      );
      const usersThisWeekCount = await getCountFromServer(
        query(collection(db, "users"), where("createdAt", ">=", sevenDaysAgo))
      );
      const usersThisMonthCount = await getCountFromServer(
        query(collection(db, "users"), where("createdAt", ">=", thirtyDaysAgo))
      );
      const usersLastMonthCount = await getCountFromServer(
        query(
          collection(db, "users"),
          where("createdAt", ">=", sixtyDaysAgo),
          where("createdAt", "<", thirtyDaysAgo)
        )
      );

      // Activity metrics (DAU/WAU/MAU)
      const dauCount = await getCountFromServer(
        query(collection(db, "users"), where("updatedAt", ">=", oneDayAgo.toISOString()))
      );
      const wauCount = await getCountFromServer(
        query(collection(db, "users"), where("updatedAt", ">=", sevenDaysAgo.toISOString()))
      );
      const mauCount = await getCountFromServer(
        query(collection(db, "users"), where("updatedAt", ">=", thirtyDaysAgo.toISOString()))
      );

      // Total Posts
      const totalPostsCount = await getCountFromServer(collection(db, "thoughts"));
      const postsTodayCount = await getCountFromServer(
        query(collection(db, "thoughts"), where("createdAt", ">=", oneDayAgo))
      );
      const postsThisWeekCount = await getCountFromServer(
        query(collection(db, "thoughts"), where("createdAt", ">=", sevenDaysAgo))
      );
      const postsLastWeekCount = await getCountFromServer(
        query(
          collection(db, "thoughts"),
          where("createdAt", ">=", new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)),
          where("createdAt", "<", sevenDaysAgo)
        )
      );

      // Total Scores
      const totalScoresCount = await getCountFromServer(collection(db, "scores"));
      const scoresTodayCount = await getCountFromServer(
        query(collection(db, "scores"), where("createdAt", ">=", oneDayAgo))
      );
      const scoresThisWeekCount = await getCountFromServer(
        query(collection(db, "scores"), where("createdAt", ">=", sevenDaysAgo))
      );

      // Calculate engagement metrics
      const allUsers = await getDocs(collection(db, "users"));
      let totalPartners = 0;
      allUsers.forEach((doc) => {
        const partners = doc.data().partners || [];
        totalPartners += partners.length;
      });

      const totalUsers = totalUsersCount.data().count;
      const totalPosts = totalPostsCount.data().count;
      const totalScores = totalScoresCount.data().count;

      const avgPostsPerUser = totalUsers > 0 ? (totalPosts / totalUsers).toFixed(2) : 0;
      const avgScoresPerUser = totalUsers > 0 ? (totalScores / totalUsers).toFixed(2) : 0;
      const avgPartnersPerUser = totalUsers > 0 ? (totalPartners / totalUsers).toFixed(1) : 0;

      // Growth rates
      const usersThisMonth = usersThisMonthCount.data().count;
      const usersLastMonth = usersLastMonthCount.data().count;
      const userGrowthRate =
        usersLastMonth > 0
          ? (((usersThisMonth - usersLastMonth) / usersLastMonth) * 100).toFixed(1)
          : 0;

      const postsThisWeek = postsThisWeekCount.data().count;
      const postsLastWeek = postsLastWeekCount.data().count;
      const contentGrowthRate =
        postsLastWeek > 0
          ? (((postsThisWeek - postsLastWeek) / postsLastWeek) * 100).toFixed(1)
          : 0;

      // Top users (simplified)
      const topPosters: Array<{ name: string; count: number }> = [];
      const topScorers: Array<{ name: string; count: number }> = [];

      setAnalytics({
        totalUsers,
        usersToday: usersTodayCount.data().count,
        usersThisWeek: usersThisWeekCount.data().count,
        usersThisMonth,
        dau: dauCount.data().count,
        wau: wauCount.data().count,
        mau: mauCount.data().count,
        totalPosts,
        postsToday: postsTodayCount.data().count,
        postsThisWeek,
        totalScores,
        scoresToday: scoresTodayCount.data().count,
        scoresThisWeek: scoresThisWeekCount.data().count,
        avgPostsPerUser: Number(avgPostsPerUser),
        avgScoresPerUser: Number(avgScoresPerUser),
        avgPartnersPerUser: Number(avgPartnersPerUser),
        userGrowthRate: Number(userGrowthRate),
        contentGrowthRate: Number(contentGrowthRate),
        topPosters,
        topScorers,
      });

      setRefreshing(false);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAnalytics();
  };

  if (loading || !analytics) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
        <Text style={styles.loadingText}>Loading analytics...</Text>
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
        <Text style={styles.headerTitle}>Analytics</Text>
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
        {/* USER GROWTH */}
        <Text style={styles.sectionTitle}>USER GROWTH</Text>
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, styles.metricCardPrimary]}>
            <Text style={styles.metricValue}>{analytics.totalUsers}</Text>
            <Text style={styles.metricLabel}>Total Users</Text>
          </View>
          <View style={[styles.metricCard, styles.metricCardGrowth]}>
            <Text style={styles.metricValue}>+{analytics.userGrowthRate}%</Text>
            <Text style={styles.metricLabel}>Monthly Growth</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.usersToday}</Text>
            <Text style={styles.metricLabel}>New Today</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.usersThisWeek}</Text>
            <Text style={styles.metricLabel}>New This Week</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.usersThisMonth}</Text>
            <Text style={styles.metricLabel}>New This Month</Text>
          </View>
        </View>

        {/* ACTIVE USERS */}
        <Text style={styles.sectionTitle}>ACTIVE USERS</Text>
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, styles.metricCardPrimary]}>
            <Text style={styles.metricValue}>{analytics.dau}</Text>
            <Text style={styles.metricLabel}>Daily Active (DAU)</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.wau}</Text>
            <Text style={styles.metricLabel}>Weekly Active (WAU)</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, styles.fullWidthCard]}>
            <Text style={styles.metricValue}>{analytics.mau}</Text>
            <Text style={styles.metricLabel}>Monthly Active Users (MAU)</Text>
            <Text style={styles.metricHelper}>
              DAU/MAU:{" "}
              {analytics.mau > 0
                ? ((analytics.dau / analytics.mau) * 100).toFixed(1)
                : 0}
              %
            </Text>
          </View>
        </View>

        {/* CONTENT METRICS */}
        <Text style={styles.sectionTitle}>CONTENT METRICS</Text>
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, styles.metricCardPrimary]}>
            <Text style={styles.metricValue}>{analytics.totalPosts}</Text>
            <Text style={styles.metricLabel}>Total Posts</Text>
          </View>
          <View style={[styles.metricCard, styles.metricCardGrowth]}>
            <Text style={styles.metricValue}>+{analytics.contentGrowthRate}%</Text>
            <Text style={styles.metricLabel}>Weekly Growth</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.postsToday}</Text>
            <Text style={styles.metricLabel}>Posts Today</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.postsThisWeek}</Text>
            <Text style={styles.metricLabel}>Posts This Week</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.totalScores}</Text>
            <Text style={styles.metricLabel}>Total Scores</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.scoresToday}</Text>
            <Text style={styles.metricLabel}>Scores Today</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.scoresThisWeek}</Text>
            <Text style={styles.metricLabel}>Scores This Week</Text>
          </View>
        </View>

        {/* ENGAGEMENT METRICS */}
        <Text style={styles.sectionTitle}>ENGAGEMENT</Text>
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.avgPostsPerUser}</Text>
            <Text style={styles.metricLabel}>Avg Posts/User</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.avgScoresPerUser}</Text>
            <Text style={styles.metricLabel}>Avg Scores/User</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{analytics.avgPartnersPerUser}</Text>
            <Text style={styles.metricLabel}>Avg Partners/User</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, styles.fullWidthCard]}>
            <Text style={styles.metricValue}>
              {((analytics.avgPostsPerUser + analytics.avgScoresPerUser) * 100).toFixed(
                0
              )}
              %
            </Text>
            <Text style={styles.metricLabel}>Overall Engagement Rate</Text>
            <Text style={styles.metricHelper}>
              (Posts + Scores) / Total Users × 100
            </Text>
          </View>
        </View>

        {/* INFO */}
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

  metricCardGrowth: {
    backgroundColor: "#FFF5E5",
    borderWidth: 2,
    borderColor: "#FFD700",
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