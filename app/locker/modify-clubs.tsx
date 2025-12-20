import { auth, db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Clubs {
  driver?: string;
  irons?: string;
  wedges?: string;
  putter?: string;
  ball?: string;
}

export default function ModifyLockerScreen() {
  const router = useRouter();
  const userId = auth.currentUser?.uid;

  // Identity fields
  const [homeCourse, setHomeCourse] = useState("");
  const [gameIdentity, setGameIdentity] = useState("");

  // Equipment fields
  const [clubs, setClubs] = useState<Clubs>({
    driver: "",
    irons: "",
    wedges: "",
    putter: "",
    ball: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLockerData();
  }, []);

  const fetchLockerData = async () => {
    if (!userId) return;

    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        
        // Load identity
        setHomeCourse(data.homeCourse || "");
        setGameIdentity(data.gameIdentity || "");
        
        // Load equipment
        setClubs({
          driver: data.clubs?.driver || "",
          irons: data.clubs?.irons || "",
          wedges: data.clubs?.wedges || "",
          putter: data.clubs?.putter || "",
          ball: data.clubs?.ball || "",
        });
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Error fetching locker data:", error);
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;

    try {
      setSaving(true);

      await setDoc(
        doc(db, "users", userId),
        {
          homeCourse: homeCourse.trim(),
          gameIdentity: gameIdentity.trim(),
          clubs: clubs,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      if (Platform.OS === 'web') {
        alert("Locker updated successfully!");
      } else {
        Alert.alert("Success", "Locker updated successfully!");
      }
      
      router.replace("/locker");
    } catch (error) {
      console.error("Error saving locker:", error);
      setSaving(false);
      
      if (Platform.OS === 'web') {
        alert("Failed to update locker. Please try again.");
      } else {
        Alert.alert("Error", "Failed to update locker. Please try again.");
      }
    }
  };

  const handleClear = (field: keyof Clubs) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setClubs({ ...clubs, [field]: "" });
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

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Update Locker</Text>

        <TouchableOpacity 
          onPress={handleSave} 
          style={styles.headerButton}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="checkmark" size={24} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Identity Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Golf Identity</Text>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <View style={styles.labelWithIcon}>
                <Ionicons name="flag" size={16} color="#0D5C3A" />
                <Text style={styles.label}>HOME COURSE</Text>
              </View>
              {homeCourse !== "" && (
                <TouchableOpacity onPress={() => setHomeCourse("")}>
                  <Text style={styles.clearButton}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={styles.input}
              placeholder="e.g., Pebble Beach Golf Links"
              placeholderTextColor="#999"
              value={homeCourse}
              onChangeText={setHomeCourse}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <View style={styles.labelWithIcon}>
                <Ionicons name="chatbubble-ellipses" size={16} color="#0D5C3A" />
                <Text style={styles.label}>GAME IDENTITY</Text>
              </View>
              {gameIdentity !== "" && (
                <TouchableOpacity onPress={() => setGameIdentity("")}>
                  <Text style={styles.clearButton}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={styles.input}
              placeholder='e.g., "Short game king" or "3-putt champion"'
              placeholderTextColor="#999"
              value={gameIdentity}
              onChangeText={setGameIdentity}
              autoCapitalize="sentences"
              maxLength={60}
            />
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Equipment Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Equipment</Text>
          <Text style={styles.sectionSubtitle}>
            Leave fields blank if you don't want to display them
          </Text>

          {/* Driver */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>DRIVER</Text>
              {clubs.driver !== "" && (
                <TouchableOpacity onPress={() => handleClear("driver")}>
                  <Text style={styles.clearButton}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={styles.input}
              placeholder="e.g., TaylorMade Stealth • 9°"
              placeholderTextColor="#999"
              value={clubs.driver}
              onChangeText={(text) => setClubs({ ...clubs, driver: text })}
            />
          </View>

          {/* Irons */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>IRONS</Text>
              {clubs.irons !== "" && (
                <TouchableOpacity onPress={() => handleClear("irons")}>
                  <Text style={styles.clearButton}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={styles.input}
              placeholder="e.g., Titleist T200"
              placeholderTextColor="#999"
              value={clubs.irons}
              onChangeText={(text) => setClubs({ ...clubs, irons: text })}
            />
          </View>

          {/* Wedges */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>WEDGES</Text>
              {clubs.wedges !== "" && (
                <TouchableOpacity onPress={() => handleClear("wedges")}>
                  <Text style={styles.clearButton}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={styles.input}
              placeholder="e.g., Vokey SM9 • 52° 56° 60°"
              placeholderTextColor="#999"
              value={clubs.wedges}
              onChangeText={(text) => setClubs({ ...clubs, wedges: text })}
            />
          </View>

          {/* Putter */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>PUTTER</Text>
              {clubs.putter !== "" && (
                <TouchableOpacity onPress={() => handleClear("putter")}>
                  <Text style={styles.clearButton}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={styles.input}
              placeholder="e.g., Scotty Cameron Newport 2"
              placeholderTextColor="#999"
              value={clubs.putter}
              onChangeText={(text) => setClubs({ ...clubs, putter: text })}
            />
          </View>

          {/* Ball */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>BALL</Text>
              {clubs.ball !== "" && (
                <TouchableOpacity onPress={() => handleClear("ball")}>
                  <Text style={styles.clearButton}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={styles.input}
              placeholder="e.g., Titleist Pro V1"
              placeholderTextColor="#999"
              value={clubs.ball}
              onChangeText={(text) => setClubs({ ...clubs, ball: text })}
            />
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity 
          style={[styles.saveButton, saving && styles.saveButtonDisabled]} 
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <>
              <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.saveButtonText}>Saving...</Text>
            </>
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.saveButtonText}>Save All Changes</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0D5C3A",
  },

  headerButton: {
    width: 40,
    alignItems: "center",
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 1,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  section: {
    marginBottom: 24,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  sectionSubtitle: {
    fontSize: 13,
    color: "#666",
    marginBottom: 16,
  },

  divider: {
    height: 1,
    backgroundColor: "#E0E0E0",
    marginVertical: 24,
  },

  inputGroup: {
    marginBottom: 20,
  },

  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  labelWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D5C3A",
    letterSpacing: 1,
  },

  clearButton: {
    fontSize: 12,
    fontWeight: "600",
    color: "#DC2626",
  },

  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#333",
    borderWidth: 2,
    borderColor: "#E0E0E0",
  },

  saveButton: {
    flexDirection: "row",
    backgroundColor: "#0D5C3A",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  saveButtonDisabled: {
    backgroundColor: "rgba(13, 92, 58, 0.5)",
  },

  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },
});