import { auth, db, storage } from "@/constants/firebaseConfig";
import { canPostScores } from "@/utils/canPostScores";
import {
  checkRateLimit,
  EMAIL_VERIFICATION_MESSAGE,
  getRateLimitMessage,
  isEmailVerified,
  updateRateLimitTimestamp
} from "@/utils/rateLimitHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  ImageBackground,
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
import { SafeAreaView } from "react-native-safe-area-context";

const SCREEN_WIDTH = Dimensions.get('window').width;
const API_KEY = process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY;
const API_BASE = "https://api.golfcourseapi.com/v1";
const MAX_CHARACTERS = 280;

/* ========================= TYPES ========================= */

type HoleCount = 9 | 18;
type HoleInOne = "yes" | "no";

type UserLocation = {
  city?: string;
  state?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
};

type Course = {
  id?: number;
  courseId?: number;
  course_name?: string;
  courseName?: string;
  location?: {
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
  };
  tees?: {
    male?: Array<{ name?: string; tee_name?: string; par_total?: number; par?: number; total_yards?: number; yardage?: number }>;
    female?: Array<{ name?: string; tee_name?: string; par_total?: number; par?: number; total_yards?: number; yardage?: number }>;
  };
  distance?: number;
};

interface Partner {
  userId: string;
  displayName: string;
  avatar?: string;
}

interface TeeOption {
  name: string;
  par: number;
  yardage?: number;
  gender: "male" | "female";
}

/* ========================= HELPERS ========================= */

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function encodeGeohash(latitude: number, longitude: number, precision: number = 5): string {
  const base32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = "";
  let latMin = -90, latMax = 90;
  let lonMin = -180, lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const lonMid = (lonMin + lonMax) / 2;
      if (longitude > lonMid) {
        idx = (idx << 1) + 1;
        lonMin = lonMid;
      } else {
        idx = idx << 1;
        lonMax = lonMid;
      }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (latitude > latMid) {
        idx = (idx << 1) + 1;
        latMin = latMid;
      } else {
        idx = idx << 1;
        latMax = latMid;
      }
    }
    evenBit = !evenBit;

    if (++bit === 5) {
      geohash += base32[idx];
      bit = 0;
      idx = 0;
    }
  }

  return geohash;
}

/* ========================= COMPONENT ========================= */

export default function PostScoreScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const CloseIcon = require("@/assets/icons/Close.png");

  const [userData, setUserData] = useState<any>(null);
  const [userRegionKey, setUserRegionKey] = useState<string | null>(null);
  const [allPartners, setAllPartners] = useState<Partner[]>([]);
  const canPost = canPostScores(userData);

  const [location, setLocation] = useState<UserLocation | null>(null);

  const [cachedCourses, setCachedCourses] = useState<Course[]>([]);
  const [searchResults, setSearchResults] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [showCourseSearch, setShowCourseSearch] = useState(false);

  const [teeOptions, setTeeOptions] = useState<TeeOption[]>([]);
  const [selectedTee, setSelectedTee] = useState<TeeOption | null>(null);
  const [showTeeDropdown, setShowTeeDropdown] = useState(false);

  const [holeCount, setHoleCount] = useState<HoleCount>(18);
  const [hadHoleInOne, setHadHoleInOne] = useState<HoleInOne>("no");
  const [grossScore, setGrossScore] = useState("");
  const [birdies, setBirdies] = useState("");
  const [eagles, setEagles] = useState("");
  const [albatross, setAlbatross] = useState("");
  
  const [holeNumber, setHoleNumber] = useState("");
  const [selectedVerifier, setSelectedVerifier] = useState<Partner | null>(null);
  const [showVerifierModal, setShowVerifierModal] = useState(false);
  const [verifierSearchQuery, setVerifierSearchQuery] = useState("");

  const [roundDescription, setRoundDescription] = useState("");
  const [scorecardImageUri, setScorecardImageUri] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submittingMessage, setSubmittingMessage] = useState("Submitting...");

  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteResults, setAutocompleteResults] = useState<any[]>([]);
  const [currentMention, setCurrentMention] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);

  useEffect(() => {
    const loadUser = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data();
        setUserData(data);
        setLocation(data.location || null);
        setUserRegionKey(data.regionKey || null);

        const partners = data?.partners || [];
        if (Array.isArray(partners) && partners.length > 0) {
          const partnerDocs = await Promise.all(
            partners.map((partnerId: string) => getDoc(doc(db, "users", partnerId)))
          );

          const partnerList = partnerDocs
            .filter((d) => d.exists())
            .map((d) => ({
              userId: d.id,
              displayName: d.data()?.displayName || "Unknown",
              avatar: d.data()?.avatar || undefined,
            }));

          setAllPartners(partnerList);
        }
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    if (!userData) return;
    loadCachedCourses();
  }, [userData]);

  const loadCachedCourses = async () => {
    try {
      const cached = userData?.cachedCourses || [];
      
      if (cached.length > 0) {
        const uniqueCourses = cached.reduce((acc: Course[], current: Course) => {
          const exists = acc.find(c => c.courseId === current.courseId || c.id === current.courseId);
          if (!exists) {
            acc.push(current);
          }
          return acc;
        }, []);
        
        const sorted = [...uniqueCourses].sort((a, b) => (a.distance || 999) - (b.distance || 999));
        setCachedCourses(sorted.slice(0, 3));
      } else {
        setCachedCourses([]);
      }
    } catch (error) {
      console.error("Error loading cached courses:", error);
      setCachedCourses([]);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      soundPlayer.play('click');
      const res = await fetch(
        `${API_BASE}/search?search_query=${encodeURIComponent(searchQuery)}`,
        { headers: { Authorization: `Key ${API_KEY}` } }
      );
      const data = await res.json();
      const courses: Course[] = data.courses || [];

      if (location?.latitude && location?.longitude) {
        const coursesWithDistance = courses.map((c) => ({
          ...c,
          distance: c.location?.latitude && c.location?.longitude
            ? haversine(location.latitude!, location.longitude!, c.location.latitude, c.location.longitude)
            : 999,
        }));

        coursesWithDistance.sort((a, b) => a.distance - b.distance);
        setSearchResults(coursesWithDistance);
      } else {
        setSearchResults(courses);
      }
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    }
  };

  const handleCourseSelect = async (course: Course) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    setShowCourseSearch(false);
    setSearchResults([]);
    setSearchQuery("");

    const courseId = course.id || course.courseId;
    
    if (!course.location || !course.tees) {
      try {
        const courseDocRef = doc(db, "courses", String(courseId));
        const courseSnap = await getDoc(courseDocRef);
        
        if (courseSnap.exists()) {
          const fullCourseData = courseSnap.data();
          
          const completeCourse: Course = {
            id: courseId,
            courseId: courseId,
            course_name: fullCourseData.courseName || course.courseName || course.course_name,
            courseName: fullCourseData.courseName || course.courseName,
            location: fullCourseData.location,
            tees: fullCourseData.tees,
            distance: course.distance,
          };
          
          setSelectedCourse(completeCourse);
          await loadTeesForCourse(completeCourse);
          return;
        }
      } catch (error) {
        console.error("Error loading course from Firestore:", error);
      }
    }
    
    setSelectedCourse(course);
    await loadTeesForCourse(course);
  };

  const loadTeesForCourse = async (course: Course) => {
    try {
      const courseId = course.id || course.courseId;
      const courseDocRef = doc(db, "courses", String(courseId));
      const courseSnap = await getDoc(courseDocRef);

      let tees: TeeOption[] = [];

      if (courseSnap.exists()) {
        const cachedData = courseSnap.data();

        if (cachedData.tees) {
          if (cachedData.tees.female && Array.isArray(cachedData.tees.female)) {
            cachedData.tees.female.forEach((teeArray: any, index: number) => {
              const teeData = Array.isArray(teeArray) ? teeArray[0] : teeArray;
              
              if (teeData && typeof teeData === 'object') {
                tees.push({
                  name: teeData.tee_name || `Women's Tee ${index + 1}`,
                  par: teeData.par_total || teeData.par || 72,
                  yardage: teeData.total_yards || teeData.yardage || undefined,
                  gender: "female",
                });
              }
            });
          }

          if (cachedData.tees.male && Array.isArray(cachedData.tees.male)) {
            cachedData.tees.male.forEach((teeArray: any, index: number) => {
              const teeData = Array.isArray(teeArray) ? teeArray[0] : teeArray;
              
              if (teeData && typeof teeData === 'object') {
                tees.push({
                  name: teeData.tee_name || `Men's Tee ${index + 1}`,
                  par: teeData.par_total || teeData.par || 72,
                  yardage: teeData.total_yards || teeData.yardage || undefined,
                  gender: "male",
                });
              }
            });
          }
        }
      }

      if (tees.length === 0) {
        if (course.tees?.male) {
          course.tees.male.forEach((tee, index) => {
            tees.push({
              name: tee.name || `Men's Tee ${index + 1}`,
              par: tee.par_total || 72,
              gender: "male",
            });
          });
        }

        if (course.tees?.female) {
          course.tees.female.forEach((tee, index) => {
            tees.push({
              name: tee.name || `Women's Tee ${index + 1}`,
              par: tee.par_total || 72,
              gender: "female",
            });
          });
        }

        if (tees.length > 0) {
          await setDoc(courseDocRef, {
            id: courseId,
            courseName: course.course_name || course.courseName,
            location: course.location,
            tees: course.tees,
            userId: auth.currentUser!.uid,
            cachedAt: serverTimestamp(),
          }, { merge: true });
        }
      }

      if (tees.length > 0) {
        setTeeOptions(tees);
        setSelectedTee(tees[0]);
      } else {
        const defaultTee = { name: "Standard", par: 72, gender: "male" as const };
        setTeeOptions([defaultTee]);
        setSelectedTee(defaultTee);
      }
    } catch (error) {
      console.error("Error loading tees:", error);
      const defaultTee = { name: "Standard", par: 72, gender: "male" as const };
      setTeeOptions([defaultTee]);
      setSelectedTee(defaultTee);
    }
  };

  const handleHoleInOneSelect = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    setHadHoleInOne("yes");
    
    Alert.alert(
      "Partner Verification Required",
      "Hole-in-ones require partner verification",
      [{ text: "Got It", style: "default" }]
    );
  };

  const renderDescriptionWithMentions = () => {
    const mentionRegex = /@([\w\s]+?)(?=\s{2,}|$|@|\n)/g;
    const parts: { text: string; isMention: boolean }[] = [];
    let lastIndex = 0;

    let match;
    while ((match = mentionRegex.exec(roundDescription)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: roundDescription.slice(lastIndex, match.index), isMention: false });
      }

      const mentionText = match[0].trim();
      const isValidMention = selectedMentions.includes(mentionText);

      parts.push({ text: match[0], isMention: isValidMention });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < roundDescription.length) {
      parts.push({ text: roundDescription.slice(lastIndex), isMention: false });
    }

    return parts.map((part, index) => {
      if (part.isMention) {
        return (
          <Text key={index} style={styles.mentionText}>
            {part.text}
          </Text>
        );
      }
      return <Text key={index}>{part.text}</Text>;
    });
  };

  const handleDescriptionChange = (text: string) => {
    setRoundDescription(text);

    const cleanedMentions = selectedMentions.filter((mention) => text.includes(mention));
    if (cleanedMentions.length !== selectedMentions.length) {
      setSelectedMentions(cleanedMentions);
    }

    const lastAtIndex = text.lastIndexOf("@");
    if (lastAtIndex === -1) {
      setShowAutocomplete(false);
      return;
    }

    const afterAt = text.slice(lastAtIndex + 1);

    if (afterAt.endsWith("  ") || (afterAt.includes("@") && afterAt.indexOf("@") > 0)) {
      setShowAutocomplete(false);
      return;
    }

    const words = text.split(/\s+/);
    const lastWord = words[words.length - 1];

    if (!lastWord.startsWith("@")) {
      setShowAutocomplete(false);
      return;
    }

    const searchText = lastWord.slice(1);
    setCurrentMention(searchText);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (searchText.length >= 1) {
        searchMentions(searchText);
      } else {
        setShowAutocomplete(false);
      }
    }, 300);
  };

  const searchMentions = async (searchText: string) => {
    try {
      const partnerResults = allPartners.filter((p) =>
        p.displayName.toLowerCase().includes(searchText.toLowerCase())
      );

      if (partnerResults.length > 0) {
        setAutocompleteResults(partnerResults.map((p) => ({ ...p, type: "partner" })));
        setShowAutocomplete(true);
      } else {
        setShowAutocomplete(false);
      }
    } catch (err) {
      console.error("Search error:", err);
    }
  };

  const handleSelectMention = (item: any) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const lastAtIndex = roundDescription.lastIndexOf("@");
    const beforeAt = roundDescription.slice(0, lastAtIndex);
    const afterMention = roundDescription.slice(lastAtIndex + 1 + currentMention.length);

    const mentionText = `@${item.displayName}`;
    setRoundDescription(`${beforeAt}${mentionText} ${afterMention}`);

    if (!selectedMentions.includes(mentionText)) {
      setSelectedMentions([...selectedMentions, mentionText]);
    }

    setShowAutocomplete(false);
  };

  const pickScorecardImage = async () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      soundPlayer.play('postThought');
      setScorecardImageUri(result.assets[0].uri);
    }
  };

  const handleClose = () => {
    const hasData =
      scorecardImageUri !== null ||
      selectedCourse !== null ||
      grossScore !== "" ||
      roundDescription.trim() !== "";

    if (hasData) {
      soundPlayer.play('click');
      Alert.alert(
        "Discard Changes?",
        "Are you sure you want to cancel? Your progress will be lost.",
        [
          {
            text: "Keep Editing",
            style: "cancel",
            onPress: () => soundPlayer.play('click'),
          },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              soundPlayer.play('error');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              router.back();
            },
          },
        ]
      );
    } else {
      soundPlayer.play('click');
      router.back();
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmittingMessage("Submitting score...");

    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    if (!canPost) {
      soundPlayer.play('error');
      setSubmitting(false);
      Alert.alert("Verification Pending", "Posting unlocks once your account is verified.");
      return;
    }

    if (!isEmailVerified()) {
      soundPlayer.play('error');
      setSubmitting(false);
      Alert.alert("Email Not Verified", EMAIL_VERIFICATION_MESSAGE);
      return;
    }

    const { allowed, remainingSeconds } = await checkRateLimit("score");
    if (!allowed) {
      soundPlayer.play('error');
      setSubmitting(false);
      Alert.alert("Please Wait", getRateLimitMessage("score", remainingSeconds));
      return;
    }

    if (!selectedCourse) {
      soundPlayer.play('error');
      setSubmitting(false);
      Alert.alert("Select Course", "Please select a course first.");
      return;
    }

    if (!selectedTee) {
      soundPlayer.play('error');
      setSubmitting(false);
      Alert.alert("Select Tee", "Please select your tee.");
      return;
    }

    if (!grossScore.trim()) {
      soundPlayer.play('error');
      setSubmitting(false);
      Alert.alert("Missing Score", "Please enter your gross score.");
      return;
    }

    if (!scorecardImageUri) {
      soundPlayer.play('error');
      setSubmitting(false);
      Alert.alert("Scorecard Required", "Please upload a photo of your scorecard.");
      return;
    }

    if (hadHoleInOne === "yes") {
      if (!holeNumber.trim()) {
        soundPlayer.play('error');
        setSubmitting(false);
        Alert.alert("Missing Hole Number", "Please enter the hole number.");
        return;
      }
      if (!selectedVerifier) {
        soundPlayer.play('error');
        setSubmitting(false);
        Alert.alert("Select Verifier", "Please select a partner to verify your hole-in-one.");
        return;
      }
    }

    try {
      setSubmittingMessage("Compressing scorecard...");
      
      const compressed = await manipulateAsync(
        scorecardImageUri,
        [{ resize: { width: 1080 } }],
        { compress: 0.7, format: SaveFormat.JPEG }
      );

      setSubmittingMessage("Uploading scorecard...");
      const response = await fetch(compressed.uri);
      const blob = await response.blob();
      const imagePath = `scorecards/${auth.currentUser?.uid}/${Date.now()}.jpg`;
      const imageRef = ref(storage, imagePath);
      await uploadBytes(imageRef, blob);
      const imageUrl = await getDownloadURL(imageRef);

      // Extract tagged partners from description
      const mentionRegex = /@([\w\s]+?)(?=\s{2,}|$|@|\n)/g;
      const mentions = roundDescription.match(mentionRegex) || [];

      const extractedPartners: Partner[] = [];

      for (const mention of mentions) {
        const mentionText = mention.substring(1).trim();
        const matchedPartner = allPartners.find(
          (p) => p.displayName.toLowerCase() === mentionText.toLowerCase()
        );

        if (matchedPartner && !extractedPartners.find((p) => p.userId === matchedPartner.userId)) {
          extractedPartners.push(matchedPartner);
        }
      }

      let regionKey = userRegionKey;
      let geohash = null;

      if (selectedCourse.location?.latitude && selectedCourse.location?.longitude) {
        geohash = encodeGeohash(
          selectedCourse.location.latitude,
          selectedCourse.location.longitude,
          5
        );
      }

      setSubmittingMessage("Saving score...");

      const netScore = parseInt(grossScore) - (userData?.handicap || 0);
      const courseId = selectedCourse.id || selectedCourse.courseId;
      const courseName = selectedCourse.course_name || selectedCourse.courseName;

      // ✅ Score data - Cloud Function will create thought, update leaderboards, award badges
      const scoreData: any = {
        userId: auth.currentUser?.uid,
        userName: userData?.displayName || "Unknown",
        courseId: courseId,
        courseName: courseName,
        holeCount: holeCount,
        grossScore: parseInt(grossScore),
        netScore: netScore,
        par: selectedTee.par,
        tee: selectedTee.name,
        teeYardage: selectedTee.yardage || null,
        birdies: birdies ? parseInt(birdies) : 0,
        eagles: eagles ? parseInt(eagles) : 0,
        albatross: albatross ? parseInt(albatross) : 0,
        hadHoleInOne: hadHoleInOne === "yes",
        roundDescription: roundDescription.trim(),
        scorecardImageUrl: imageUrl,
        location: selectedCourse.location || undefined,
        regionKey: regionKey,
        geohash: geohash,
        createdAt: serverTimestamp(),
        // Include tagged partners for Cloud Function to use
        taggedPartners: extractedPartners.map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
        })),
      };

      if (hadHoleInOne === "yes") {
        scoreData.holeNumber = parseInt(holeNumber);
      }

      const scoreRef = await addDoc(collection(db, "scores"), scoreData);
      console.log("✅ Score created:", scoreRef.id);

      // ✅ Create hole_in_ones document if applicable (triggers onHoleInOneCreated Cloud Function)
      if (hadHoleInOne === "yes" && selectedVerifier) {
        console.log("🏌️ Creating hole-in-one verification document...");
        
        await addDoc(collection(db, "hole_in_ones"), {
          userId: auth.currentUser?.uid,
          userName: userData?.displayName || "Unknown",
          userAvatar: userData?.avatar || null,
          verifierId: selectedVerifier.userId,
          verifierName: selectedVerifier.displayName,
          scoreId: scoreRef.id,
          courseId: courseId,
          courseName: courseName,
          holeNumber: parseInt(holeNumber),
          holeCount: holeCount,
          status: "pending",
          scorecardImageUrl: imageUrl,
          createdAt: serverTimestamp(),
        });
        
        console.log("✅ Hole-in-one document created");
      }

      // ✅ Update user location
      try {
        setSubmittingMessage("Updating location...");
        const { checkAndUpdateLocation, incrementLocationScoreCount } = await import("@/utils/locationHelpers");

        await checkAndUpdateLocation(auth.currentUser!.uid, {
          courseCity: selectedCourse.location?.city || "",
          courseState: selectedCourse.location?.state || "",
          courseLatitude: selectedCourse.location?.latitude,
          courseLongitude: selectedCourse.location?.longitude,
          onScoreSubmission: true,
        });

        await incrementLocationScoreCount(auth.currentUser!.uid);
      } catch (locationErr) {
        console.error("Location update failed:", locationErr);
      }

      // ✅ Update user stats (birdies, eagles, albatross, hole-in-ones)
      setSubmittingMessage("Updating stats...");

      const userUpdates: any = {};

      if (birdies && parseInt(birdies) > 0) {
        userUpdates.totalBirdies = increment(parseInt(birdies));
      }
      if (eagles && parseInt(eagles) > 0) {
        userUpdates.totalEagles = increment(parseInt(eagles));
      }
      if (albatross && parseInt(albatross) > 0) {
        userUpdates.totalAlbatross = increment(parseInt(albatross));
      }
      if (hadHoleInOne === "yes") {
        userUpdates.totalHoleInOnes = increment(1);
      }

      if (Object.keys(userUpdates).length > 0) {
        await updateDoc(doc(db, "users", auth.currentUser!.uid), userUpdates);
      }

      // ✅ Update course stats
      try {
        const courseDocRef = doc(db, "courses", String(courseId));
        const courseUpdates: any = {};

        if (birdies && parseInt(birdies) > 0) {
          courseUpdates[`stats.birdies`] = increment(parseInt(birdies));
        }
        if (eagles && parseInt(eagles) > 0) {
          courseUpdates[`stats.eagles`] = increment(parseInt(eagles));
        }
        if (albatross && parseInt(albatross) > 0) {
          courseUpdates[`stats.albatross`] = increment(parseInt(albatross));
        }

        if (Object.keys(courseUpdates).length > 0) {
          await updateDoc(courseDocRef, courseUpdates);
        }
      } catch (courseErr) {
        console.error("Course stats update failed:", courseErr);
      }

      await updateRateLimitTimestamp("score");

      // ✅ All handled by Cloud Functions:
      // - onScoreCreated → creates thought, leaderboard updates, badges, partner notifications
      // - onHoleInOneCreated → holeinone_pending_poster, holeinone_verification_request
      console.log("📬 Score submitted - Cloud Functions handle post creation, leaderboards, badges, and notifications");

      soundPlayer.play('achievement');
      setSubmitting(false);

      const alertMessage = hadHoleInOne === "yes"
        ? `Your hole-in-one is pending verification from ${selectedVerifier!.displayName}.`
        : "Your round has been logged!";

      Alert.alert(
        hadHoleInOne === "yes" ? "Pending Verification 🎯" : "Score Posted! ⛳",
        alertMessage,
        [
          {
            text: "OK",
            onPress: () => router.push("/clubhouse"),
          },
        ]
      );
    } catch (error) {
      console.error("Submit error:", error);
      soundPlayer.play('error');
      setSubmitting(false);
      Alert.alert("Error", "Failed to submit score. Please try again.");
    }
  };

  const filteredPartners = allPartners.filter((p) =>
    p.displayName.toLowerCase().includes(verifierSearchQuery.toLowerCase())
  );

  return (
    <ImageBackground
      source={require("@/assets/images/PostScoreBackground.png")}
      style={styles.background}
      blurRadius={2}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose}>
              <Image source={CloseIcon} style={styles.closeIcon} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Post Score</Text>
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit}
              disabled={!canPost}
            >
              <Text style={styles.submitIcon}>⛳</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollViewContent}
          >
            {!selectedCourse && !showCourseSearch && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Select Course</Text>
                
                {cachedCourses.length > 0 ? (
                  <>
                    <Text style={styles.subtitle}>Recently Played</Text>
                    {cachedCourses.map((course, index) => (
                      <TouchableOpacity
                        key={`cached-${course.id || course.courseId}-${index}`}
                        style={styles.courseCard}
                        onPress={() => handleCourseSelect(course)}
                      >
                        <View style={styles.courseCardLeft}>
                          <Text style={styles.courseCardName}>
                            {course.course_name || course.courseName || "Unknown Course"}
                          </Text>
                          {course.location && (
                            <Text style={styles.courseCardLocation}>
                              {course.location.city}, {course.location.state}
                            </Text>
                          )}
                        </View>
                        {course.distance !== undefined && (
                          <Text style={styles.courseCardDistance}>
                            {course.distance.toFixed(1)} mi
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </>
                ) : (
                  <Text style={styles.emptyText}>
                    No cached courses. Search below to find a course.
                  </Text>
                )}

                <TouchableOpacity
                  style={styles.searchButton}
                  onPress={() => {
                    soundPlayer.play('click');
                    setShowCourseSearch(true);
                  }}
                >
                  <Text style={styles.searchButtonText}>🔍 Search for Course</Text>
                </TouchableOpacity>
              </View>
            )}

            {showCourseSearch && !selectedCourse && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Search Course</Text>
                
                <View style={styles.searchContainer}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Enter course name or city..."
                    placeholderTextColor="#999"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onSubmitEditing={handleSearch}
                    returnKeyType="search"
                    autoFocus
                  />
                </View>

                {searchResults.length > 0 && (
                  <View style={styles.searchResultsContainer}>
                    {searchResults.map((course, index) => (
                      <TouchableOpacity
                        key={`search-${course.id || course.courseId}-${index}`}
                        style={styles.courseCard}
                        onPress={() => handleCourseSelect(course)}
                      >
                        <View style={styles.courseCardLeft}>
                          <Text style={styles.courseCardName}>{course.course_name}</Text>
                          {course.location && (
                            <Text style={styles.courseCardLocation}>
                              {course.location.city}, {course.location.state}
                            </Text>
                          )}
                        </View>
                        {course.distance !== undefined && (
                          <Text style={styles.courseCardDistance}>
                            {course.distance.toFixed(1)} mi
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => {
                    soundPlayer.play('click');
                    setShowCourseSearch(false);
                    setSearchResults([]);
                    setSearchQuery("");
                  }}
                >
                  <Text style={styles.backButtonText}>← Back</Text>
                </TouchableOpacity>
              </View>
            )}

            {selectedCourse && (
              <View style={styles.selectedCourseContainer}>
                <Text style={styles.sectionTitle}>Course</Text>
                <View style={styles.selectedCourseCard}>
                  <Text style={styles.selectedCourseText}>
                    {selectedCourse.course_name || selectedCourse.courseName || "Unknown Course"}
                  </Text>
                  {selectedCourse.location && (
                    <Text style={styles.selectedCourseLocation}>
                      {selectedCourse.location.city}, {selectedCourse.location.state}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.changeButton}
                  onPress={() => {
                    soundPlayer.play('click');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedCourse(null);
                    setSelectedTee(null);
                    setTeeOptions([]);
                  }}
                >
                  <Text style={styles.changeButtonText}>Change Course</Text>
                </TouchableOpacity>
              </View>
            )}

            {selectedCourse && selectedTee && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Select Tee</Text>
                
                <TouchableOpacity
                  style={styles.dropdownButton}
                  onPress={() => {
                    soundPlayer.play('click');
                    setShowTeeDropdown(!showTeeDropdown);
                  }}
                >
                  <Text style={styles.dropdownButtonText}>
                    {selectedTee.name}
                    {selectedTee.yardage ? ` • ${selectedTee.yardage} yds` : ""} • Par {selectedTee.par}
                  </Text>
                  <Text style={styles.dropdownArrow}>
                    {showTeeDropdown ? "▲" : "▼"}
                  </Text>
                </TouchableOpacity>

                {showTeeDropdown && (
                  <View style={styles.dropdownList}>
                    {teeOptions.map((tee, index) => (
                      <TouchableOpacity
                        key={`tee-${index}`}
                        style={[
                          styles.dropdownItem,
                          selectedTee.name === tee.name && styles.dropdownItemSelected
                        ]}
                        onPress={() => {
                          soundPlayer.play('click');
                          setSelectedTee(tee);
                          setShowTeeDropdown(false);
                        }}
                      >
                        <Text style={[
                          styles.dropdownItemText,
                          selectedTee.name === tee.name && styles.dropdownItemTextSelected
                        ]}>
                          {tee.name}
                          {tee.yardage ? ` • ${tee.yardage} yds` : ""} • Par {tee.par}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {selectedCourse && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Holes Played</Text>
                
                <View style={styles.sliderContainer}>
                  <TouchableOpacity
                    style={[
                      styles.sliderOption,
                      holeCount === 9 && styles.sliderOptionActive
                    ]}
                    onPress={() => {
                      soundPlayer.play('click');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setHoleCount(9);
                    }}
                  >
                    <Text style={[
                      styles.sliderOptionText,
                      holeCount === 9 && styles.sliderOptionTextActive
                    ]}>
                      9 Holes
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.sliderOption,
                      holeCount === 18 && styles.sliderOptionActive
                    ]}
                    onPress={() => {
                      soundPlayer.play('click');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setHoleCount(18);
                    }}
                  >
                    <Text style={[
                      styles.sliderOptionText,
                      holeCount === 18 && styles.sliderOptionTextActive
                    ]}>
                      18 Holes
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {selectedCourse && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Hole-in-One?</Text>
                
                <View style={styles.sliderContainer}>
                  <TouchableOpacity
                    style={[
                      styles.sliderOption,
                      hadHoleInOne === "no" && styles.sliderOptionActive
                    ]}
                    onPress={() => {
                      soundPlayer.play('click');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setHadHoleInOne("no");
                      setHoleNumber("");
                      setSelectedVerifier(null);
                    }}
                  >
                    <Text style={[
                      styles.sliderOptionText,
                      hadHoleInOne === "no" && styles.sliderOptionTextActive
                    ]}>
                      No
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.sliderOption,
                      hadHoleInOne === "yes" && styles.sliderOptionActive
                    ]}
                    onPress={handleHoleInOneSelect}
                  >
                    <Text style={[
                      styles.sliderOptionText,
                      hadHoleInOne === "yes" && styles.sliderOptionTextActive
                    ]}>
                      Yes! 🎯
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {hadHoleInOne === "yes" && (
              <>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Which Hole?</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Hole number (1-18)"
                    placeholderTextColor="#999"
                    keyboardType="number-pad"
                    value={holeNumber}
                    onChangeText={setHoleNumber}
                  />
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Select Verifier</Text>
                  <TouchableOpacity
                    style={styles.verifierButton}
                    onPress={() => {
                      soundPlayer.play('click');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowVerifierModal(true);
                    }}
                  >
                    <Text style={styles.verifierButtonText}>
                      {selectedVerifier
                        ? `Verifier: ${selectedVerifier.displayName}`
                        : "Tap to Select Partner"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {selectedCourse && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Score Details</Text>
                
                <View style={styles.scoreRow}>
                  <View style={styles.scoreInputContainer}>
                    <Text style={styles.scoreLabel}>Gross Score *</Text>
                    <TextInput
                      style={styles.scoreInput}
                      placeholder="Score"
                      placeholderTextColor="#999"
                      keyboardType="number-pad"
                      value={grossScore}
                      onChangeText={setGrossScore}
                      onFocus={() => {
                        setTimeout(() => {
                          scrollViewRef.current?.scrollTo({ y: 600, animated: true });
                        }, 100);
                      }}
                    />
                  </View>
                </View>

                <View style={styles.scoreRow}>
                  <View style={styles.scoreInputContainer}>
                    <Text style={styles.scoreLabel}>Birdies</Text>
                    <TextInput
                      style={styles.scoreInput}
                      placeholder="0"
                      placeholderTextColor="#999"
                      keyboardType="number-pad"
                      value={birdies}
                      onChangeText={setBirdies}
                      onFocus={() => {
                        setTimeout(() => {
                          scrollViewRef.current?.scrollTo({ y: 650, animated: true });
                        }, 100);
                      }}
                    />
                  </View>

                  <View style={styles.scoreInputContainer}>
                    <Text style={styles.scoreLabel}>Eagles</Text>
                    <TextInput
                      style={styles.scoreInput}
                      placeholder="0"
                      placeholderTextColor="#999"
                      keyboardType="number-pad"
                      value={eagles}
                      onChangeText={setEagles}
                      onFocus={() => {
                        setTimeout(() => {
                          scrollViewRef.current?.scrollTo({ y: 650, animated: true });
                        }, 100);
                      }}
                    />
                  </View>

                  <View style={styles.scoreInputContainer}>
                    <Text style={styles.scoreLabel}>Albatross</Text>
                    <TextInput
                      style={styles.scoreInput}
                      placeholder="0"
                      placeholderTextColor="#999"
                      keyboardType="number-pad"
                      value={albatross}
                      onChangeText={setAlbatross}
                      onFocus={() => {
                        setTimeout(() => {
                          scrollViewRef.current?.scrollTo({ y: 650, animated: true });
                        }, 100);
                      }}
                    />
                  </View>
                </View>

                {grossScore && selectedTee && (
                  <Text style={styles.netScoreText}>
                    Net Score: {parseInt(grossScore) - (userData?.handicap || 0)}
                  </Text>
                )}
              </View>
            )}

            {selectedCourse && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>How was your round?</Text>
                
                <View style={styles.textInputContainer}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.descriptionInput,
                      roundDescription && styles.textInputWithContent,
                    ]}
                    placeholder="Share details... (mention partners with @)"
                    placeholderTextColor="#999"
                    multiline
                    maxLength={MAX_CHARACTERS}
                    value={roundDescription}
                    onChangeText={handleDescriptionChange}
                    onFocus={() => {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollTo({ y: 800, animated: true });
                      }, 100);
                    }}
                  />

                  {roundDescription && (
                    <View style={styles.textOverlay} pointerEvents="none">
                      <Text style={styles.overlayText}>
                        {renderDescriptionWithMentions()}
                      </Text>
                    </View>
                  )}
                </View>

                <Text style={styles.charCount}>
                  {roundDescription.length}/{MAX_CHARACTERS}
                </Text>

                {showAutocomplete && autocompleteResults.length > 0 && (
                  <View style={styles.autocompleteContainer}>
                    <ScrollView
                      style={styles.autocompleteScrollView}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                    >
                      {autocompleteResults.map((item, idx) => (
                        <TouchableOpacity
                          key={`${item.userId}-${idx}`}
                          style={styles.autocompleteItem}
                          onPress={() => handleSelectMention(item)}
                        >
                          <Text style={styles.autocompleteName}>
                            @{item.displayName}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {selectedCourse && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Upload Scorecard *</Text>
                
                <TouchableOpacity
                  style={styles.imagePicker}
                  onPress={pickScorecardImage}
                >
                  {scorecardImageUri ? (
                    <Image
                      source={{ uri: scorecardImageUri }}
                      style={styles.scorecardPreview}
                    />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.imagePlaceholderIcon}>📸</Text>
                      <Text style={styles.imagePlaceholderText}>
                        Tap to Upload Scorecard
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {scorecardImageUri && (
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => {
                      soundPlayer.play('click');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setScorecardImageUri(null);
                    }}
                  >
                    <Text style={styles.removeImageText}>✕ Change Photo</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={{ height: 80 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        <Modal
          visible={showVerifierModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowVerifierModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Verifier</Text>
                <TouchableOpacity
                  onPress={() => {
                    soundPlayer.play('click');
                    setShowVerifierModal(false);
                  }}
                >
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.modalSearch}
                placeholder="Search partners..."
                placeholderTextColor="#999"
                value={verifierSearchQuery}
                onChangeText={setVerifierSearchQuery}
              />

              <FlatList
                data={filteredPartners}
                keyExtractor={(item) => item.userId}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.partnerItem}
                    onPress={() => {
                      soundPlayer.play('click');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedVerifier(item);
                      setShowVerifierModal(false);
                    }}
                  >
                    {item.avatar ? (
                      <Image
                        source={{ uri: item.avatar }}
                        style={styles.partnerAvatar}
                      />
                    ) : (
                      <View style={styles.partnerAvatarPlaceholder}>
                        <Text style={styles.partnerAvatarText}>
                          {item.displayName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.partnerName}>{item.displayName}</Text>
                    {selectedVerifier?.userId === item.userId && (
                      <Text style={styles.partnerSelected}>✓</Text>
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>
                    No partners found. Add partners to verify your hole-in-one!
                  </Text>
                }
              />
            </View>
          </View>
        </Modal>

        {submitting && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0D5C3A" />
              <Text style={styles.loadingText}>{submittingMessage}</Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, width: "100%", height: "100%" },
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "rgba(13, 92, 58, 0.95)" },
  closeIcon: { width: 28, height: 28, tintColor: "#FFF" },
  headerTitle: { fontSize: 18, fontWeight: "900", color: "#FFF", flex: 1, textAlign: "center" },
  submitButton: { width: 44, height: 44, backgroundColor: "#FFD700", borderRadius: 22, alignItems: "center", justifyContent: "center" },
  submitIcon: { fontSize: 24 },
  scrollView: { flex: 1 },
  scrollViewContent: { paddingBottom: 100 },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: "#0D5C3A", marginBottom: 12 },
  subtitle: { fontSize: 14, fontWeight: "700", color: "#666", marginBottom: 8 },
  courseCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.85)", borderRadius: 12, borderWidth: 2, borderColor: "#0D5C3A", marginBottom: 8 },
  courseCardLeft: { flex: 1 },
  courseCardName: { fontSize: 16, fontWeight: "900", color: "#0D5C3A", marginBottom: 4 },
  courseCardLocation: { fontSize: 13, fontWeight: "600", color: "#666" },
  courseCardDistance: { fontSize: 14, fontWeight: "700", color: "#0D5C3A", marginLeft: 12 },
  searchButton: { marginTop: 12, padding: 16, backgroundColor: "#0D5C3A", borderRadius: 12, alignItems: "center" },
  searchButtonText: { fontSize: 16, fontWeight: "700", color: "#FFF" },
  backButton: { marginTop: 12, padding: 12, alignItems: "center" },
  backButtonText: { fontSize: 16, fontWeight: "700", color: "#0D5C3A" },
  searchContainer: { marginBottom: 12 },
  searchInput: { padding: 14, backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.85)", borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.5)" },
  searchResultsContainer: { marginBottom: 12 },
  selectedCourseContainer: { paddingHorizontal: 16, marginTop: 20 },
  selectedCourseCard: { padding: 16, borderRadius: 14, borderWidth: 3, borderColor: "#0D5C3A", backgroundColor: "rgba(200, 230, 201, 0.85)", marginBottom: 12 },
  selectedCourseText: { fontWeight: "900", fontSize: 18, marginBottom: 4, color: "#0D5C3A" },
  selectedCourseLocation: { fontSize: 14, color: "#0D5C3A", fontWeight: "700" },
  changeButton: { paddingVertical: 12, paddingHorizontal: 20, backgroundColor: "#0D5C3A", borderRadius: 10, alignItems: "center" },
  changeButtonText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  dropdownButton: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.85)", borderRadius: 12, borderWidth: 2, borderColor: "#0D5C3A" },
  dropdownButtonText: { fontSize: 16, fontWeight: "700", color: "#0D5C3A" },
  dropdownArrow: { fontSize: 16, fontWeight: "700", color: "#0D5C3A" },
  dropdownList: { marginTop: 8, backgroundColor: "#FFF", borderRadius: 12, borderWidth: 1, borderColor: "#E0E0E0", overflow: "hidden" },
  dropdownItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  dropdownItemSelected: { backgroundColor: "#E8F5E9" },
  dropdownItemText: { fontSize: 16, fontWeight: "600", color: "#333" },
  dropdownItemTextSelected: { fontWeight: "900", color: "#0D5C3A" },
  sliderContainer: { flexDirection: "row", gap: 12 },
  sliderOption: { flex: 1, padding: 16, backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.85)", borderRadius: 12, borderWidth: 2, borderColor: "#E0E0E0", alignItems: "center" },
  sliderOptionActive: { borderColor: "#0D5C3A", backgroundColor: "#E8F5E9" },
  sliderOptionText: { fontSize: 16, fontWeight: "700", color: "#666" },
  sliderOptionTextActive: { fontWeight: "900", color: "#0D5C3A" },
  scoreRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  scoreInputContainer: { flex: 1 },
  scoreLabel: { fontSize: 14, fontWeight: "700", color: "#0D5C3A", marginBottom: 6 },
  scoreInput: { padding: 12, backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.85)", borderRadius: 10, fontSize: 16, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.5)", textAlign: "center", fontWeight: "700" },
  netScoreText: { fontSize: 18, fontWeight: "900", color: "#0D5C3A", textAlign: "center", marginTop: 8 },
  input: { padding: 14, backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.85)", borderRadius: 12, fontSize: 16, borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.5)" },
  descriptionInput: { minHeight: 100, textAlignVertical: "top" },
  textInputContainer: { position: "relative" },
  textInputWithContent: { color: "transparent" },
  textOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, padding: 14, paddingTop: 15 },
  overlayText: { fontSize: 16, color: "#333" },
  mentionText: { fontSize: 16, fontWeight: "700", color: "#0D5C3A" },
  charCount: { fontSize: 12, color: "#999", textAlign: "right", marginTop: 4 },
  autocompleteContainer: { backgroundColor: "#FFF", borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: "#E0E0E0", maxHeight: 200 },
  autocompleteScrollView: { maxHeight: 200 },
  autocompleteItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  autocompleteName: { fontSize: 14, fontWeight: "600", color: "#0D5C3A" },
  verifierButton: { padding: 16, backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.85)", borderRadius: 12, borderWidth: 2, borderColor: "#0D5C3A", alignItems: "center" },
  verifierButtonText: { fontSize: 16, fontWeight: "700", color: "#0D5C3A" },
  imagePicker: { height: 200, borderRadius: 12, overflow: "hidden", backgroundColor: "#E8E8E8", borderWidth: 2, borderColor: "#0D5C3A", borderStyle: "dashed" },
  scorecardPreview: { width: "100%", height: "100%", resizeMode: "cover" },
  imagePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  imagePlaceholderIcon: { fontSize: 48, marginBottom: 8 },
  imagePlaceholderText: { fontSize: 16, fontWeight: "700", color: "#0D5C3A" },
  removeImageButton: { marginTop: 8, alignSelf: "center", paddingVertical: 8, paddingHorizontal: 16, backgroundColor: "#0D5C3A", borderRadius: 8 },
  removeImageText: { color: "#FFF", fontWeight: "600", fontSize: 14 },
  emptyText: { textAlign: "center", color: "#999", fontSize: 14, fontStyle: "italic", marginVertical: 12 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)", justifyContent: "flex-end" },
  modalContainer: { backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%", paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#E0E0E0" },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#0D5C3A" },
  modalClose: { fontSize: 24, color: "#666", fontWeight: "600" },
  modalSearch: { margin: 16, padding: 12, backgroundColor: "#F5F5F5", borderRadius: 10, fontSize: 16 },
  partnerItem: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  partnerAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  partnerAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#0D5C3A", alignItems: "center", justifyContent: "center", marginRight: 12 },
  partnerAvatarText: { color: "#FFF", fontSize: 18, fontWeight: "700" },
  partnerName: { flex: 1, fontSize: 16, fontWeight: "600", color: "#333" },
  partnerSelected: { fontSize: 20, color: "#0D5C3A", fontWeight: "900" },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0, 0, 0, 0.7)", justifyContent: "center", alignItems: "center", zIndex: 1000 },
  loadingContainer: { backgroundColor: "#FFF", borderRadius: 16, padding: 24, alignItems: "center", minWidth: 200 },
  loadingText: { marginTop: 12, fontSize: 16, fontWeight: "700", color: "#0D5C3A" },
});