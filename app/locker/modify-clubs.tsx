import BadgeSelectionModal from "@/components/modals/BadgeSelectionModal";
import { auth, db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
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

interface Badge {
  type: string;
  displayName: string;
  courseName?: string;
  achievedAt?: any;
  score?: number;
  courseId?: number;
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

  // Badge selection
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [selectedBadges, setSelectedBadges] = useState<Badge[]>([]);
  const [showBadgeModal, setShowBadgeModal] = useState(false);

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

        // Load badges
        const badgesData = data.Badges || [];
        const validBadges = badgesData.filter((badge: any) => {
          if (!badge) return false;
          if (typeof badge === "string" && badge.trim() === "") return false;
          return true;
        });
        setAllBadges(validBadges);

        // Load selected badges (or default to first 3)
        const displayBadges = data.displayBadges || validBadges.slice(0, 3);
        setSelectedBadges(displayBadges);
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Error fetching locker data:", error);
      soundPlayer.play('error');
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;

    try {
      soundPlayer.play('click');
      setSaving(true);

      await setDoc(
        doc(db, "users", userId),
        {
          homeCourse: homeCourse.trim(),
          gameIdentity: gameIdentity.trim(),
          clubs: clubs,
          displayBadges: selectedBadges, // Save selected badges
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      soundPlayer.play('postThought');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      if (Platform.OS === 'web') {
        alert("Locker updated successfully!");
      } else {
        Alert.alert("Success", "Locker updated successfully!");
      }
      
      router.replace("/locker");
    } catch (error) {
      console.error("Error saving locker:", error);
      soundPlayer.play('error');
      setSaving(false);
      
      if (Platform.OS === 'web') {
        alert("Failed to update locker. Please try again.");
      } else {
        Alert.alert("Error", "Failed to update locker. Please try again.");
      }
    }
  };

  const handleClear = (field: keyof Clubs) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setClubs({ ...clubs, [field]: "" });
  };

  const handleSaveBadgeSelection = (badges: Badge[]) => {
    setSelectedBadges(badges);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />
      
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => {
              soundPlayer.play('click');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }} 
            style={styles.headerButton}
          >
            <Image
              source={require("@/assets/icons/Back.png")}
              style={styles.backIcon}
              resizeMode="contain"
            />
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
                  <TouchableOpacity 
                    onPress={() => {
                      soundPlayer.play('click');
                      setHomeCourse("");
                    }}
                  >
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
                  <TouchableOpacity 
                    onPress={() => {
                      soundPlayer.play('click');
                      setGameIdentity("");
                    }}
                  >
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

          {/* Achievements Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Achievements</Text>
            <Text style={styles.sectionSubtitle}>
              Select up to 3 badges to display in your locker
            </Text>

            <TouchableOpacity
              style={styles.selectBadgesButton}
              onPress={() => {
                soundPlayer.play('click');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowBadgeModal(true);
              }}
            >
              <View style={styles.selectBadgesContent}>
                <Ionicons name="trophy" size={20} color="#0D5C3A" />
                <Text style={styles.selectBadgesText}>
                  Select Your Achievements to Display
                </Text>
                <View style={styles.badgeCount}>
                  <Text style={styles.badgeCountText}>
                    {selectedBadges.length}/3
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </TouchableOpacity>

            {selectedBadges.length > 0 && (
              <View style={styles.selectedBadgesPreview}>
                <Text style={styles.previewLabel}>Currently Selected:</Text>
                {selectedBadges.map((badge, index) => (
                  <View key={index} style={styles.previewBadge}>
                    <Text style={styles.previewBadgeNumber}>{index + 1}.</Text>
                    <Text style={styles.previewBadgeText}>
                      {badge.displayName}
                      {badge.courseName && ` • ${badge.courseName}`}
                    </Text>
                  </View>
                ))}
              </View>
            )}
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
      </KeyboardAvoidingView>

      {/* Badge Selection Modal */}
      <BadgeSelectionModal
        visible={showBadgeModal}
        badges={allBadges}
        selectedBadges={selectedBadges}
        onClose={() => {
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowBadgeModal(false);
        }}
        onSave={handleSaveBadgeSelection}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  safeTop: {
    backgroundColor: "#0D5C3A",
  },

  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
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
    justifyContent: "center",
  },

  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFFFFF",
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

  // ✅ Badge Selection Button
  selectBadgesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#0D5C3A",
  },

  selectBadgesContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  selectBadgesText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0D5C3A",
    flex: 1,
  },

  badgeCount: {
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  badgeCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // ✅ Selected Badges Preview
  selectedBadgesPreview: {
    marginTop: 12,
    backgroundColor: "#F0F7F4",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#0D5C3A",
  },

  previewLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
    letterSpacing: 0.5,
  },

  previewBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },

  previewBadgeNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0D5C3A",
    marginRight: 8,
    width: 20,
  },

  previewBadgeText: {
    fontSize: 13,
    color: "#333",
    flex: 1,
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