import { checkMigrationStatus, migrateUsersForAntiBotFeatures } from "@/utils/userMigration";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MigrationScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [status, setStatus] = useState<{
    needsMigration: boolean;
    usersWithoutFields: number;
    totalUsers: number;
  } | null>(null);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setLoading(true);
    const result = await checkMigrationStatus();
    setStatus(result);
    setLoading(false);
  };

  const handleMigrate = async () => {
    Alert.alert(
      "Migrate Users",
      `This will add anti-bot fields to ${status?.usersWithoutFields} users. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Migrate",
          onPress: async () => {
            setMigrating(true);
            const result = await migrateUsersForAntiBotFeatures();
            setMigrating(false);

            if (result.success) {
              Alert.alert(
                "Migration Complete",
                `✅ Migrated ${result.migratedCount} users\n❌ Errors: ${result.errors}`,
                [{ text: "OK", onPress: checkStatus }]
              );
            } else {
              Alert.alert("Migration Failed", "Check console for errors");
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Migration</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Migration Status</Text>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total Users:</Text>
            <Text style={styles.statValue}>{status?.totalUsers || 0}</Text>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Users Without Anti-Bot Fields:</Text>
            <Text
              style={[
                styles.statValue,
                status?.usersWithoutFields ? styles.statValueWarning : styles.statValueSuccess,
              ]}
            >
              {status?.usersWithoutFields || 0}
            </Text>
          </View>

          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Migration Needed:</Text>
            <Text
              style={[
                styles.statValue,
                status?.needsMigration ? styles.statValueWarning : styles.statValueSuccess,
              ]}
            >
              {status?.needsMigration ? "YES" : "NO"}
            </Text>
          </View>
        </View>

        {status?.needsMigration ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>⚠️ Migration Required</Text>
            <Text style={styles.description}>
              {status.usersWithoutFields} user{status.usersWithoutFields !== 1 ? "s" : ""} need to
              be updated with anti-bot fields:
            </Text>

            <View style={styles.fieldsList}>
              <Text style={styles.fieldItem}>• displayNameLower (for uniqueness)</Text>
              <Text style={styles.fieldItem}>• lastPostTime (rate limiting)</Text>
              <Text style={styles.fieldItem}>• lastCommentTime (rate limiting)</Text>
              <Text style={styles.fieldItem}>• lastMessageTime (rate limiting)</Text>
              <Text style={styles.fieldItem}>• lastScoreTime (rate limiting)</Text>
              <Text style={styles.fieldItem}>• banned (ban status)</Text>
            </View>

            <TouchableOpacity
              style={[styles.migrateButton, migrating && styles.migrateButtonDisabled]}
              onPress={handleMigrate}
              disabled={migrating}
            >
              {migrating ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.migrateButtonText}>Run Migration</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>✅ All Set!</Text>
            <Text style={styles.description}>
              All users have the required anti-bot fields. No migration needed.
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.refreshButton} onPress={checkStatus}>
          <Text style={styles.refreshButtonText}>🔄 Refresh Status</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#0D5C3A",
  },
  backButton: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  headerTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 16,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 14,
    color: "#666",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  statValueWarning: {
    color: "#FF9500",
  },
  statValueSuccess: {
    color: "#0D5C3A",
  },
  description: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
    lineHeight: 20,
  },
  fieldsList: {
    backgroundColor: "#F7F8FA",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  fieldItem: {
    fontSize: 13,
    color: "#333",
    marginBottom: 6,
  },
  migrateButton: {
    backgroundColor: "#0D5C3A",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  migrateButtonDisabled: {
    opacity: 0.6,
  },
  migrateButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
  refreshButton: {
    backgroundColor: "#E0E0E0",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  refreshButtonText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "600",
  },
});