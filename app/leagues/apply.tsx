import { auth, db } from "@/constants/firebaseConfig";
import { REGIONS } from "@/constants/regions";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type LeagueType = "live" | "sim";
type LeagueFormat = "stroke" | "2v2";

interface RegionOption {
  key: string;
  name: string;
  primaryCity: string;
}

export default function ApplyToHostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUser = auth.currentUser;

  // Loading states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // User data
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRegionKey, setUserRegionKey] = useState<string | null>(null);

  // Check states
  const [alreadyApproved, setAlreadyApproved] = useState(false);
  const [hasPendingApplication, setHasPendingApplication] = useState(false);

  // Form fields
  const [leagueName, setLeagueName] = useState("");
  const [leagueType, setLeagueType] = useState<LeagueType | null>(null);
  const [format, setFormat] = useState<LeagueFormat | null>(null);
  const [expectedMembers, setExpectedMembers] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [previousExperience, setPreviousExperience] = useState("");
  const [description, setDescription] = useState("");
  const [acknowledgedLimit, setAcknowledgedLimit] = useState(false);

  // Region picker modal
  const [regionModalVisible, setRegionModalVisible] = useState(false);
  const [regionSearch, setRegionSearch] = useState("");
  const [suggestedRegions, setSuggestedRegions] = useState<RegionOption[]>([]);

  // Get sorted regions for picker
  const sortedRegions: RegionOption[] = REGIONS
    .filter((r) => !r.isFallback)
    .map((r) => ({
      key: r.key,
      name: r.displayName,
      primaryCity: r.primaryCity,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filteredRegions = regionSearch.trim()
    ? sortedRegions.filter(
        (r) =>
          r.name.toLowerCase().includes(regionSearch.toLowerCase()) ||
          r.primaryCity.toLowerCase().includes(regionSearch.toLowerCase())
      )
    : sortedRegions;

  // Calculate distance between two points (Haversine formula)
  const getDistanceMiles = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  useEffect(() => {
    loadUserData();
    loadNearbyRegions();
  }, []);

  const loadNearbyRegions = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = location.coords;

      // Find regions within 200 miles, sorted by distance
      const nearby: { region: RegionOption; distance: number }[] = [];

      for (const region of REGIONS) {
        if (region.isFallback) continue;

        const distance = getDistanceMiles(
          latitude,
          longitude,
          region.centerPoint.lat,
          region.centerPoint.lon
        );

        if (distance <= 200) {
          nearby.push({
            region: {
              key: region.key,
              name: region.displayName,
              primaryCity: region.primaryCity,
            },
            distance,
          });
        }
      }

      // Sort by distance and take top 5
      nearby.sort((a, b) => a.distance - b.distance);
      setSuggestedRegions(nearby.slice(0, 5).map((n) => n.region));
    } catch (error) {
      console.log("Could not get location for suggestions:", error);
    }
  };

  const loadUserData = async () => {
    if (!currentUser) {
      router.replace("/");
      return;
    }

    try {
      // Get user profile
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUserName(userData.displayName || "");
        setUserEmail(userData.email || currentUser.email || "");
        setContactEmail(userData.email || currentUser.email || "");
        setUserRegionKey(userData.regionKey || null);
        setSelectedRegion(userData.regionKey || null);

        // Check if already approved commissioner
        if (userData.isApprovedCommissioner) {
          setAlreadyApproved(true);
          setLoading(false);
          return;
        }
      }

      // Check for pending application
      const pendingQuery = query(
        collection(db, "league_applications"),
        where("userId", "==", currentUser.uid),
        where("status", "==", "pending")
      );
      const pendingSnapshot = await getDocs(pendingQuery);
      if (!pendingSnapshot.empty) {
        setHasPendingApplication(true);
      }

      setLoading(false);
    } catch (error) {
      console.error("Error loading user data:", error);
      setLoading(false);
    }
  };

  const getRegionName = (key: string | null): string => {
    if (!key) return "Select Region";
    const region = REGIONS.find((r) => r.key === key);
    return region ? region.displayName : key;
  };

  const validateForm = (): boolean => {
    if (!leagueName.trim()) {
      Alert.alert("Missing Information", "Please enter a league name.");
      return false;
    }
    if (!leagueType) {
      Alert.alert("Missing Information", "Please select a league type (Live or Sim).");
      return false;
    }
    if (!format) {
      Alert.alert("Missing Information", "Please select a league format.");
      return false;
    }
    if (!expectedMembers.trim() || isNaN(parseInt(expectedMembers))) {
      Alert.alert("Missing Information", "Please enter the expected number of members.");
      return false;
    }
    if (!selectedRegion) {
      Alert.alert("Missing Information", "Please select a region for your league.");
      return false;
    }
    if (!contactEmail.trim()) {
      Alert.alert("Missing Information", "Please enter a contact email.");
      return false;
    }
    if (!description.trim()) {
      Alert.alert("Missing Information", "Please tell us about your league.");
      return false;
    }
    if (!acknowledgedLimit) {
      Alert.alert(
        "Acknowledgment Required",
        "Please acknowledge that approved commissioners may create one league."
      );
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm() || !currentUser) return;

    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const regionData = REGIONS.find((r) => r.key === selectedRegion);

      await addDoc(collection(db, "league_applications"), {
        userId: currentUser.uid,
        userName,
        userEmail,
        userAvatar: null, // Could fetch from user doc if needed
        contactEmail: contactEmail.trim(),

        leagueName: leagueName.trim(),
        leagueType,
        format,
        expectedMembers: parseInt(expectedMembers),
        regionKey: selectedRegion,
        regionName: regionData?.displayName || selectedRegion,

        description: description.trim(),
        previousExperience: previousExperience.trim() || null,

        status: "pending",
        createdAt: serverTimestamp(),
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(
        "Application Submitted!",
        "Thank you for applying to host a league. We'll review your application and get back to you soon.",
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error) {
      console.error("Error submitting application:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Failed to submit application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================
  // RENDER: Loading
  // ============================================
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0D5C3A" />
      </View>
    );
  }

  // ============================================
  // RENDER: Already Approved
  // ============================================
  if (alreadyApproved) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={["top"]} style={styles.safeTop} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <Image source={require("@/assets/icons/Back.png")} style={styles.headerIcon} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Apply to Host</Text>
          <View style={styles.headerButton} />
        </View>

        <View style={styles.statusContainer}>
          <Ionicons name="checkmark-circle" size={80} color="#0D5C3A" />
          <Text style={styles.statusTitle}>You're Already Approved!</Text>
          <Text style={styles.statusText}>
            You've been approved as a league commissioner. You can now create your league.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push("/leagues/create" as any)}
          >
            <Text style={styles.primaryButtonText}>Create Your League</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============================================
  // RENDER: Pending Application
  // ============================================
  if (hasPendingApplication) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={["top"]} style={styles.safeTop} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <Image source={require("@/assets/icons/Back.png")} style={styles.headerIcon} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Apply to Host</Text>
          <View style={styles.headerButton} />
        </View>

        <View style={styles.statusContainer}>
          <Ionicons name="time" size={80} color="#FF9500" />
          <Text style={styles.statusTitle}>Application Pending</Text>
          <Text style={styles.statusText}>
            You already have a pending application. We'll review it and notify you once a decision
            is made.
          </Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()}>
            <Text style={styles.secondaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ============================================
  // RENDER: Application Form
  // ============================================
  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Image source={require("@/assets/icons/Back.png")} style={styles.headerIcon} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Apply to Host</Text>
        <View style={styles.headerButton} />
      </View>

      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        extraScrollHeight={Platform.OS === "ios" ? 120 : 80}
        enableResetScrollToCoords={false}
      >
          {/* Intro */}
          <View style={styles.introCard}>
            <Image
              source={require("@/assets/icons/LowLeaderTrophy.png")}
              style={styles.introIcon}
            />
            <Text style={styles.introTitle}>Become a League Commissioner</Text>
            <Text style={styles.introText}>
              Run your own golf league on SwingThoughts! Fill out this application and we'll review
              it shortly.
            </Text>
          </View>

          {/* League Name */}
          <View style={styles.formSection}>
            <Text style={styles.label}>League Name</Text>
            <Text style={styles.helperText}>
              This is a working title. You'll finalize the name when creating your league.
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., Sunday Morning Golf League"
              value={leagueName}
              onChangeText={setLeagueName}
              maxLength={50}
            />
          </View>

          {/* League Type */}
          <View style={styles.formSection}>
            <Text style={styles.label}>League Type</Text>
            <Text style={styles.helperText}>Will members play on real courses or simulators?</Text>
            <View style={styles.optionRow}>
              <TouchableOpacity
                style={[styles.optionButton, leagueType === "live" && styles.optionButtonSelected]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setLeagueType("live");
                }}
              >
                <Ionicons
                  name="sunny"
                  size={24}
                  color={leagueType === "live" ? "#FFF" : "#0D5C3A"}
                />
                <Text
                  style={[
                    styles.optionText,
                    leagueType === "live" && styles.optionTextSelected,
                  ]}
                >
                  Live Golf
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.optionButton, leagueType === "sim" && styles.optionButtonSelected]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setLeagueType("sim");
                }}
              >
                <Ionicons
                  name="desktop"
                  size={24}
                  color={leagueType === "sim" ? "#FFF" : "#0D5C3A"}
                />
                <Text
                  style={[styles.optionText, leagueType === "sim" && styles.optionTextSelected]}
                >
                  Simulator
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Format */}
          <View style={styles.formSection}>
            <Text style={styles.label}>League Format</Text>
            <Text style={styles.helperText}>How will competition be structured?</Text>
            <View style={styles.optionRow}>
              <TouchableOpacity
                style={[styles.optionButton, format === "stroke" && styles.optionButtonSelected]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFormat("stroke");
                }}
              >
                <Ionicons
                  name="person"
                  size={24}
                  color={format === "stroke" ? "#FFF" : "#0D5C3A"}
                />
                <Text
                  style={[styles.optionText, format === "stroke" && styles.optionTextSelected]}
                >
                  Stroke Play
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.optionButton, format === "2v2" && styles.optionButtonSelected]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFormat("2v2");
                }}
              >
                <Ionicons
                  name="people"
                  size={24}
                  color={format === "2v2" ? "#FFF" : "#0D5C3A"}
                />
                <Text style={[styles.optionText, format === "2v2" && styles.optionTextSelected]}>
                  2v2 Teams
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Expected Members */}
          <View style={styles.formSection}>
            <Text style={styles.label}>Expected Members</Text>
            <Text style={styles.helperText}>
              How many golfers do you expect to join? (Approximate is fine)
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., 12"
              value={expectedMembers}
              onChangeText={setExpectedMembers}
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>

          {/* Region */}
          <View style={styles.formSection}>
            <Text style={styles.label}>League Region</Text>
            <Text style={styles.helperText}>Where will your league be based?</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setRegionModalVisible(true)}
            >
              <Text
                style={[styles.pickerText, !selectedRegion && styles.pickerTextPlaceholder]}
              >
                {getRegionName(selectedRegion)}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Contact Email */}
          <View style={styles.formSection}>
            <Text style={styles.label}>Contact Email</Text>
            <Text style={styles.helperText}>
              We'll use this to communicate about your application and league.
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="your@email.com"
              value={contactEmail}
              onChangeText={setContactEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Previous Experience */}
          <View style={styles.formSection}>
            <Text style={styles.label}>Previous Experience (Optional)</Text>
            <Text style={styles.helperText}>Have you run a golf league before?</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="e.g., Ran a 16-person league for 3 years at my club..."
              value={previousExperience}
              onChangeText={setPreviousExperience}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Description */}
          <View style={styles.formSection}>
            <Text style={styles.label}>Tell Us About Your League</Text>
            <Text style={styles.helperText}>
              What's your vision? Why do you want to host a league on SwingThoughts?
            </Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Describe your league idea, target audience, and goals..."
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxLength={1000}
            />
            <Text style={styles.charCount}>{description.length}/1000</Text>
          </View>

          {/* Acknowledgment */}
          <TouchableOpacity
            style={styles.acknowledgmentRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setAcknowledgedLimit(!acknowledgedLimit);
            }}
          >
            <View
              style={[styles.checkbox, acknowledgedLimit && styles.checkboxChecked]}
            >
              {acknowledgedLimit && <Ionicons name="checkmark" size={16} color="#FFF" />}
            </View>
            <Text style={styles.acknowledgmentText}>
              I understand that approved commissioners may create one league at this time.
            </Text>
          </TouchableOpacity>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="paper-plane" size={20} color="#FFF" />
                <Text style={styles.submitButtonText}>Submit Application</Text>
              </>
            )}
          </TouchableOpacity>
        </KeyboardAwareScrollView>

      {/* Region Picker Modal */}
      <Modal
        visible={regionModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setRegionModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 20, maxHeight: "90%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Region</Text>
              <TouchableOpacity onPress={() => setRegionModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color="#999" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search regions..."
                value={regionSearch}
                onChangeText={setRegionSearch}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {regionSearch.length > 0 && (
                <TouchableOpacity onPress={() => setRegionSearch("")}>
                  <Ionicons name="close-circle" size={18} color="#999" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView 
              style={styles.regionList}
              keyboardShouldPersistTaps="handled"
            >
              {/* Nearby/Suggested Regions */}
              {!regionSearch.trim() && suggestedRegions.length > 0 && (
                <View style={styles.suggestedSection}>
                  <Text style={styles.suggestedTitle}>
                    <Ionicons name="location" size={14} color="#0D5C3A" /> Nearby Regions
                  </Text>
                  {suggestedRegions.map((region) => (
                    <TouchableOpacity
                      key={region.key}
                      style={[
                        styles.regionItem,
                        selectedRegion === region.key && styles.regionItemSelected,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedRegion(region.key);
                        setRegionModalVisible(false);
                        setRegionSearch("");
                      }}
                    >
                      <View>
                        <Text
                          style={[
                            styles.regionName,
                            selectedRegion === region.key && styles.regionNameSelected,
                          ]}
                        >
                          {region.name}
                        </Text>
                        <Text style={styles.regionCity}>{region.primaryCity}</Text>
                      </View>
                      {selectedRegion === region.key && (
                        <Ionicons name="checkmark" size={20} color="#0D5C3A" />
                      )}
                    </TouchableOpacity>
                  ))}
                  <View style={styles.suggestedDivider}>
                    <Text style={styles.suggestedDividerText}>All Regions</Text>
                  </View>
                </View>
              )}

              {/* All Regions (filtered if searching) */}
              {filteredRegions.map((region) => (
                <TouchableOpacity
                  key={region.key}
                  style={[
                    styles.regionItem,
                    selectedRegion === region.key && styles.regionItemSelected,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedRegion(region.key);
                    setRegionModalVisible(false);
                    setRegionSearch("");
                  }}
                >
                  <View>
                    <Text
                      style={[
                        styles.regionName,
                        selectedRegion === region.key && styles.regionNameSelected,
                      ]}
                    >
                      {region.name}
                    </Text>
                    <Text style={styles.regionCity}>{region.primaryCity}</Text>
                  </View>
                  {selectedRegion === region.key && (
                    <Ionicons name="checkmark" size={20} color="#0D5C3A" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F4EED8",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFF",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },

  // Intro Card
  introCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  introIcon: {
    width: 64,
    height: 64,
    marginBottom: 12,
  },
  introTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
    textAlign: "center",
  },
  introText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },

  // Form Sections
  formSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 4,
  },
  helperText: {
    fontSize: 13,
    color: "#666",
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#333",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 12,
    color: "#999",
    textAlign: "right",
    marginTop: 4,
  },

  // Option Buttons (Type/Format)
  optionRow: {
    flexDirection: "row",
    gap: 12,
  },
  optionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    paddingVertical: 14,
  },
  optionButtonSelected: {
    backgroundColor: "#0D5C3A",
  },
  optionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  optionTextSelected: {
    color: "#FFF",
  },

  // Picker Button
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pickerText: {
    fontSize: 16,
    color: "#333",
  },
  pickerTextPlaceholder: {
    color: "#999",
  },

  // Acknowledgment
  acknowledgmentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: "#0D5C3A",
  },
  acknowledgmentText: {
    flex: 1,
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },

  // Submit Button
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },

  // Status Screens
  statusContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  statusText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
  secondaryButton: {
    backgroundColor: "#E0E0E0",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
  },
  regionList: {
    flex: 1,
    marginBottom: 10,
  },
  regionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  regionItemSelected: {
    backgroundColor: "#F0FFF4",
  },
  regionName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  regionNameSelected: {
    color: "#0D5C3A",
  },
  regionCity: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },

  // Suggested Regions
  suggestedSection: {
    marginBottom: 8,
  },
  suggestedTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D5C3A",
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#F0FFF4",
  },
  suggestedDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
    paddingVertical: 12,
    marginTop: 8,
  },
  suggestedDividerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#999",
    paddingHorizontal: 16,
  },
});