import { auth, db, storage } from "@/constants/firebaseConfig";
import { checkAndAwardBadges } from "@/utils/badgeUtils";
import { canPostScores } from "@/utils/canPostScores";
import { createNotification } from "@/utils/notificationHelpers";
import {
  checkRateLimit,
  EMAIL_VERIFICATION_MESSAGE,
  getRateLimitMessage,
  isEmailVerified,
  updateRateLimitTimestamp
} from "@/utils/rateLimitHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
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
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

/* ------------------------------------------------------------------ */

const API_KEY = process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY;
const API_BASE = "https://api.golfcourseapi.com/v1";

const RADIUS_STEPS = [15, 30, 60, 120, 240, 480];
const MAX_CHARACTERS = 280;

/* ------------------------------------------------------------------ */

type TeeChoice = "back" | "forward";
type ScoreType = "18hole" | "holeinone" | null;

type UserLocation = {
  city?: string;
  state?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
};

type Course = {
  id: number;
  course_name: string;
  location: {
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
  };
  tees?: {
    male?: { par_total: number }[];
    female?: { par_total: number }[];
  };
  distance?: number;
};

interface Partner {
  userId: string;
  displayName: string;
  avatar?: string;
}

/* ------------------------------------------------------------------ */

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ------------------------------------------------------------------ */

export default function PostScoreScreen() {
  const router = useRouter();
  const scrollViewRef = React.useRef<ScrollView>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const CloseIcon = require("@/assets/icons/Close.png");
  const LocationIcon = require("@/assets/icons/Location Near Me.png");

  // Step 1: Score type selection
  const [scoreType, setScoreType] = useState<ScoreType>(null);

  const [userData, setUserData] = useState<any>(null);
  const [allPartners, setAllPartners] = useState<Partner[]>([]);
  const canPost = canPostScores(userData);

  const [location, setLocation] = useState<UserLocation | null>(null);
  const [nearbyCourses, setNearbyCourses] = useState<Course[]>([]);
  const [searchResults, setSearchResults] = useState<Course[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [showCourseSelection, setShowCourseSelection] = useState(true);
  const [tee, setTee] = useState<TeeChoice>("back");

  const [par, setPar] = useState<number | null>(null);
  const [grossScore, setGrossScore] = useState("");
  const [netScore, setNetScore] = useState<number | null>(null);
  
  // Hole-in-One tracking
  const [holeNumber, setHoleNumber] = useState("");
  
  // Verifier selection for hole-in-one
  const [selectedVerifier, setSelectedVerifier] = useState<Partner | null>(null);
  const [showVerifierModal, setShowVerifierModal] = useState(false);
  const [verifierSearchQuery, setVerifierSearchQuery] = useState("");
  
  // Description and scorecard image (REQUIRED)
  const [roundDescription, setRoundDescription] = useState("");
  const [scorecardImageUri, setScorecardImageUri] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submittingMessage, setSubmittingMessage] = useState("Submitting...");

  // @ Mention functionality
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteResults, setAutocompleteResults] = useState<any[]>([]);
  const [currentMention, setCurrentMention] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);

  /* ========================= INITIAL TYPE PROMPT ========================= */

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!scoreType) {
        Alert.alert(
          "What are you logging?",
          "",
          [
            {
              text: "⛳ 18 Hole Score",
              onPress: () => {
                soundPlayer.play('click');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setScoreType("18hole");
              },
            },
            {
              text: "🎯 Hole in One",
              onPress: () => {
                soundPlayer.play('click');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setScoreType("holeinone");
              },
            },
          ],
          { cancelable: false }
        );
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [scoreType]);

  /* ========================= LOAD USER ========================= */

  useEffect(() => {
    const loadUser = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) {
        const data = snap.data();
        setUserData(data);
        setLocation(data.location || null);
        
        // Load partners for hole-in-one verification AND @ mentions
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
          
          console.log("✅ Loaded partners for verification & mentions:", partnerList);
          setAllPartners(partnerList);
        }
      }
    };
    loadUser();
  }, []);

  /* ========================= NET SCORE ========================= */

  useEffect(() => {
    if (!grossScore || !par) return setNetScore(null);
    const g = parseInt(grossScore);
    if (!isNaN(g)) setNetScore(g - (userData?.handicap || 0));
  }, [grossScore, par, userData?.handicap]);

  /* ========================= LOCATION ========================= */

  const handleChangeLocation = () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert("Change Location", "", [
      {
        text: "Use GPS",
        onPress: async () => {
          soundPlayer.play('click');
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== "granted") return;

          const pos = await Location.getCurrentPositionAsync({});
          const geo = await Location.reverseGeocodeAsync(pos.coords);
          const city = geo[0]?.city;
          const state = geo[0]?.region;

          if (!city || !state) return;

          const loc = {
            city,
            state,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          };

          await updateDoc(doc(db, "users", auth.currentUser!.uid), {
            location: loc,
          });

          soundPlayer.play('postThought');
          setLocation(loc);
        },
      },
      {
        text: "Enter ZIP",
        onPress: () => {
          soundPlayer.play('click');
          Alert.prompt("ZIP Code", "", async (zip) => {
            if (!zip) return;
            const loc = { zip };
            await updateDoc(doc(db, "users", auth.currentUser!.uid), {
              location: loc,
            });
            soundPlayer.play('postThought');
            setLocation(loc);
          });
        },
      },
      { 
        text: "Cancel", 
        style: "cancel",
        onPress: () => soundPlayer.play('click')
      },
    ]);
  };

  /* ========================= COURSES ========================= */

  useEffect(() => {
    if (!location?.latitude || !location?.longitude) return;
    loadNearbyCourses();
  }, [location]);

  const loadNearbyCourses = async () => {
    const cachedCourses = await loadCoursesFromCache();
    if (cachedCourses.length >= 3) {
      setNearbyCourses(cachedCourses.slice(0, 3));
      return;
    }
    await fetchCoursesFromAPI();
  };

  const loadCoursesFromCache = async (): Promise<Course[]> => {
    try {
      const q = query(
        collection(db, "courses"),
        where("userId", "==", auth.currentUser!.uid)
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as Course);
    } catch (error) {
      console.error("Error loading cached courses:", error);
      return [];
    }
  };

  const fetchCoursesFromAPI = async () => {
    try {
      console.log("Fetching courses for city:", location!.city);
      let res = await fetch(
        `${API_BASE}/search?search_query=${encodeURIComponent(location!.city!)}`,
        { headers: { Authorization: `Key ${API_KEY}` } }
      );
      let data = await res.json();
      let allCourses: Course[] = data.courses || [];
      
      console.log("Total courses from API (city search):", allCourses.length);

      if (allCourses.length < 3 && location?.latitude && location?.longitude) {
        console.log("Less than 3 courses, searching nearby cities using GPS...");
        
        const searchRadii = [10, 20, 30];
        
        for (const radius of searchRadii) {
          const latOffset = radius / 69;
          const lngOffset = radius / (69 * Math.cos(location.latitude * Math.PI / 180));
          
          const nearbyCities = await findNearbyCities(
            location.latitude,
            location.longitude,
            latOffset,
            lngOffset
          );
          
          console.log(`Searching ${nearbyCities.length} cities within ${radius} miles`);
          
          for (const city of nearbyCities) {
            try {
              const cityRes = await fetch(
                `${API_BASE}/search?search_query=${encodeURIComponent(city)}`,
                { headers: { Authorization: `Key ${API_KEY}` } }
              );
              const cityData = await cityRes.json();
              if (cityData.courses && cityData.courses.length > 0) {
                allCourses = [...allCourses, ...cityData.courses];
              }
            } catch (err) {
              console.error(`Error searching city ${city}:`, err);
            }
          }
          
          if (allCourses.length >= 3) break;
        }
      }

      if (allCourses.length > 0 && location?.latitude && location?.longitude) {
        const coursesWithDistance = allCourses.map((c) => ({
          ...c,
          distance: c.location?.latitude && c.location?.longitude
            ? haversine(
                location.latitude!,
                location.longitude!,
                c.location.latitude,
                c.location.longitude
              )
            : 999,
        }));

        coursesWithDistance.sort((a, b) => a.distance - b.distance);
        
        const nearestCourses = coursesWithDistance.slice(0, 3);
        
        for (const course of nearestCourses) {
          await setDoc(doc(db, "courses", String(course.id)), {
            id: course.id,
            course_name: course.course_name,
            location: course.location,
            tees: course.tees,
            userId: auth.currentUser!.uid,
          });
        }
        
        setNearbyCourses(nearestCourses);
      } else {
        setNearbyCourses([]);
      }
    } catch (error) {
      console.error("Error fetching courses:", error);
      setNearbyCourses([]);
    }
  };

  const findNearbyCities = async (
    lat: number,
    lng: number,
    latOffset: number,
    lngOffset: number
  ): Promise<string[]> => {
    const cities = new Set<string>();
    const points = [
      [lat + latOffset, lng],
      [lat - latOffset, lng],
      [lat, lng + lngOffset],
      [lat, lng - lngOffset],
      [lat + latOffset, lng + lngOffset],
      [lat + latOffset, lng - lngOffset],
      [lat - latOffset, lng + lngOffset],
      [lat - latOffset, lng - lngOffset],
    ];

    for (const [pointLat, pointLng] of points) {
      try {
        const geo = await Location.reverseGeocodeAsync({
          latitude: pointLat,
          longitude: pointLng,
        });
        if (geo[0]?.city) cities.add(geo[0].city);
      } catch (err) {
        console.error("Reverse geocode error:", err);
      }
    }

    return Array.from(cities);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    try {
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
            ? haversine(
                location.latitude!,
                location.longitude!,
                c.location.latitude,
                c.location.longitude
              )
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
    setSelectedCourse(course);
    setShowCourseSelection(false);
    setSearchResults([]);
    setSearchQuery("");

    await setDoc(doc(db, "courses", String(course.id)), {
      id: course.id,
      course_name: course.course_name,
      location: course.location,
      tees: course.tees,
      userId: auth.currentUser!.uid,
    });

    const malePar = course.tees?.male?.[0]?.par_total || 72;
    const femalePar = course.tees?.female?.[0]?.par_total || 72;
    setPar(tee === "back" ? malePar : femalePar);
  };

  useEffect(() => {
    if (selectedCourse && selectedCourse.tees) {
      const malePar = selectedCourse.tees?.male?.[0]?.par_total || 72;
      const femalePar = selectedCourse.tees?.female?.[0]?.par_total || 72;
      setPar(tee === "back" ? malePar : femalePar);
    }
  }, [tee, selectedCourse]);

  /* ========================= @ MENTION LOGIC ========================= */

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

    // Clean up selectedMentions
    const cleanedMentions = selectedMentions.filter((mention) => 
      text.includes(mention)
    );
    if (cleanedMentions.length !== selectedMentions.length) {
      setSelectedMentions(cleanedMentions);
    }

    // Detect @ mention
    const lastAtIndex = text.lastIndexOf("@");
    if (lastAtIndex === -1) {
      setShowAutocomplete(false);
      return;
    }

    // Get text after last @
    const afterAt = text.slice(lastAtIndex + 1);
    
    // Close autocomplete if user types double space OR starts a new @ mention
    if (afterAt.endsWith("  ") || (afterAt.includes("@") && afterAt.indexOf("@") > 0)) {
      setShowAutocomplete(false);
      return;
    }
    
    // Check if we've already completed this mention
    const words = text.split(/\s+/);
    const lastWord = words[words.length - 1];
    
    // If the last word doesn't start with @, we're not in a mention
    if (!lastWord.startsWith("@")) {
      setShowAutocomplete(false);
      return;
    }
    
    // Extract the search text (everything after @ in the current word)
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
        setAutocompleteResults(
          partnerResults.map((p) => ({ ...p, type: "partner" }))
        );
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

  /* ========================= CLOSE HANDLER ========================= */

  const handleClose = () => {
    const hasData = 
      scorecardImageUri !== null ||
      selectedCourse !== null ||
      grossScore !== "" ||
      holeNumber !== "" ||
      roundDescription.trim() !== "" ||
      selectedVerifier !== null;

    if (hasData) {
      soundPlayer.play('click');
      Alert.alert(
        "Discard Changes?",
        "Are you sure you want to cancel? Your progress will be lost.",
        [
          { 
            text: "Keep Editing", 
            style: "cancel",
            onPress: () => soundPlayer.play('click')
          },
          { 
            text: "Discard", 
            style: "destructive",
            onPress: () => {
              soundPlayer.play('error');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              router.back();
            }
          },
        ]
      );
    } else {
      soundPlayer.play('click');
      router.back();
    }
  };

  /* ========================= IMAGE PICKER ========================= */

  const pickScorecardImage = async () => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      soundPlayer.play('postThought');
      setScorecardImageUri(result.assets[0].uri);
    }
  };

/* ========================= SUBMIT ========================= */

const handleSubmit = async () => {
    setSubmitting(true);
    setSubmittingMessage("Submitting score...");

    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    console.log("🔐 Auth state:", {
      emailVerified: auth.currentUser?.emailVerified,
      email: auth.currentUser?.email,
      uid: auth.currentUser?.uid,
    });

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

    if (!scorecardImageUri) {
      soundPlayer.play('error');
      setSubmitting(false);
      Alert.alert("Scorecard Required", "Please upload a photo of your scorecard.");
      return;
    }

    if (scoreType === "18hole") {
      if (!grossScore.trim()) {
        soundPlayer.play('error');
        setSubmitting(false);
        Alert.alert("Missing Score", "Please enter your gross score.");
        return;
      }
    } else if (scoreType === "holeinone") {
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
      // Upload scorecard image
      setSubmittingMessage("Uploading scorecard...");
      const response = await fetch(scorecardImageUri);
      const blob = await response.blob();
      const imagePath = `scorecards/${auth.currentUser?.uid}/${Date.now()}.jpg`;
      const imageRef = ref(storage, imagePath);
      await uploadBytes(imageRef, blob);
      const imageUrl = await getDownloadURL(imageRef);

      // Extract @mentions
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

      if (scoreType === "18hole") {
        console.log("📝 Creating 18-hole score...");
        setSubmittingMessage("Saving score...");
        
        const scoreData: any = {
          userId: auth.currentUser?.uid,
          userName: userData?.displayName || "Unknown",
          courseId: selectedCourse.id,
          courseName: selectedCourse.course_name,
          grossScore: parseInt(grossScore),
          netScore,
          par,
          tee,
          hadHoleInOne: false,
          roundDescription: roundDescription.trim(),
          scorecardImageUrl: imageUrl,
          location: selectedCourse.location,
          createdAt: serverTimestamp(),
        };
        
        if (extractedPartners.length > 0) {
          scoreData.taggedPartners = extractedPartners.map((p) => ({
            userId: p.userId,
            displayName: p.displayName,
          }));
        }

        console.log("📝 Score data:", scoreData);

        let scoreRef;
        try {
          scoreRef = await addDoc(collection(db, "scores"), scoreData);
          console.log("✅ Score created with ID:", scoreRef.id);
        } catch (scoreError) {
          console.error("❌ Error creating score:", scoreError);
          throw scoreError;
        }

        try {
          setSubmittingMessage("Updating location...");
          const { checkAndUpdateLocation, incrementLocationScoreCount } = await import("@/utils/locationHelpers");
          
          console.log("📍 Checking location after score submission...");
          await checkAndUpdateLocation(auth.currentUser!.uid, {
            courseCity: selectedCourse.location?.city || "",
            courseState: selectedCourse.location?.state || "",
            courseLatitude: selectedCourse.location?.latitude,
            courseLongitude: selectedCourse.location?.longitude,
            onScoreSubmission: true,
          });
          
          await incrementLocationScoreCount(auth.currentUser!.uid);
          console.log("✅ Location check complete");
        } catch (locationErr) {
          console.error("⚠️ Location check failed (non-critical):", locationErr);
        }

        console.log("🏆 Checking and awarding badges...");
        setSubmittingMessage("Checking achievements...");
        let newBadges = [];
        try {
          newBadges = await checkAndAwardBadges(
            auth.currentUser!.uid,
            selectedCourse.id,
            selectedCourse.course_name,
            parseInt(grossScore),
            false
          );
          console.log("✅ Badges checked/awarded:", newBadges);
        } catch (badgeError) {
          console.error("❌ Error checking/awarding badges:", badgeError);
          setSubmitting(false);
          throw badgeError;
        }

        let postType = "score";
        let achievementType = null;
        
        const earnedLowman = newBadges.some((badge) => badge.type === "lowman");
        if (earnedLowman) {
          postType = "low-leader";
          achievementType = "lowman";
        }

        console.log("📱 Creating clubhouse post...", { postType, achievementType });
        setSubmittingMessage("Creating post...");

        let thoughtRef;
        try {
          thoughtRef = await addDoc(collection(db, "thoughts"), {
            thoughtId: `thought_${Date.now()}`,
            userId: auth.currentUser?.uid,
            userName: userData?.displayName,
            userType: userData?.userType,
            postType: earnedLowman ? "low-leader" : "score",
            achievementType: earnedLowman ? "lowman" : null,
            content: `Shot a ${parseInt(grossScore)} @${selectedCourse.course_name}! ${roundDescription}`,
            scoreId: scoreRef.id,
            imageUrl: imageUrl,
            taggedPartners: extractedPartners.map((p) => ({
              userId: p.userId,
              displayName: p.displayName,
            })),
            taggedCourses: [{
              courseId: selectedCourse.id,
              courseName: selectedCourse.course_name,
            }],
            createdAt: serverTimestamp(),
            likes: 0,
            likedBy: [],
            comments: 0,
          });
          console.log("✅ Clubhouse post created with ID:", thoughtRef.id);
        } catch (thoughtError) {
          console.error("❌ Error creating clubhouse post:", thoughtError);
          throw thoughtError;
        }

        await updateRateLimitTimestamp("score");

        setSubmittingMessage("Sending notifications...");
        const partners = userData?.partners || [];
        if (Array.isArray(partners) && partners.length > 0) {
          for (const partnerId of partners) {
            await createNotification({
              userId: partnerId,
              type: earnedLowman ? "partner_lowman" : "partner_scored",
              actorId: auth.currentUser!.uid,
              scoreId: scoreRef.id,
              courseId: selectedCourse.id,
            });
          }
        }

        for (const partner of extractedPartners) {
          await createNotification({
            userId: partner.userId,
            type: "mention_post",
            actorId: auth.currentUser!.uid,
            postId: thoughtRef.id,
          });
        }

        soundPlayer.play('achievement');
        setSubmitting(false);
        Alert.alert("Score Posted! ⛳", "Your round has been logged.", [
          {
            text: "OK",
            onPress: () => router.push("/clubhouse")
          }
        ]);
      } else if (scoreType === "holeinone") {
        setSubmittingMessage("Saving hole-in-one...");
        const scoreData = {
          userId: auth.currentUser?.uid,
          userName: userData?.displayName || "Unknown",
          courseId: selectedCourse.id,
          courseName: selectedCourse.course_name,
          par,
          hadHoleInOne: true,
          holeNumber: parseInt(holeNumber),
          roundDescription: roundDescription.trim(),
          scorecardImageUrl: imageUrl,
          location: selectedCourse.location,
          createdAt: serverTimestamp(),
          status: "pending",
          verifierId: selectedVerifier.userId,
          verifierName: selectedVerifier.displayName,
          taggedPartners: extractedPartners.map((p) => ({
            userId: p.userId,
            displayName: p.displayName,
          })),
        };

        const scoreRef = await addDoc(collection(db, "scores"), scoreData);

        try {
          setSubmittingMessage("Updating location...");
          const { checkAndUpdateLocation, incrementLocationScoreCount } = await import("@/utils/locationHelpers");
          
          console.log("📍 Checking location after hole-in-one submission...");
          await checkAndUpdateLocation(auth.currentUser!.uid, {
            courseCity: selectedCourse.location?.city || "",
            courseState: selectedCourse.location?.state || "",
            courseLatitude: selectedCourse.location?.latitude,
            courseLongitude: selectedCourse.location?.longitude,
            onScoreSubmission: true,
          });
          
          await incrementLocationScoreCount(auth.currentUser!.uid);
          console.log("✅ Location check complete");
        } catch (locationErr) {
          console.error("⚠️ Location check failed (non-critical):", locationErr);
        }

        await updateRateLimitTimestamp("score");

        setSubmittingMessage("Sending notifications...");
        await createNotification({
          userId: auth.currentUser!.uid,
          type: "holeinone_pending_poster",
          actorId: selectedVerifier.userId,
          scoreId: scoreRef.id,
        });

        await createNotification({
          userId: selectedVerifier.userId,
          type: "holeinone_verification_request",
          actorId: auth.currentUser!.uid,
          scoreId: scoreRef.id,
        });

        soundPlayer.play('achievement');
        setSubmitting(false);
        Alert.alert(
          "Pending Verification 🎯",
          `Your hole-in-one is pending verification from ${selectedVerifier.displayName}.`,
          [
            {
              text: "OK",
              onPress: () => router.push("/clubhouse")
            }
          ]
        );
      }
    } catch (error) {
      console.error("Submit error:", error);
      soundPlayer.play('error');
      setSubmitting(false);
      Alert.alert("Error", "Failed to submit score. Please try again.");
    }
  };

  /* ========================= RENDER ========================= */

  if (!scoreType) {
    return (
      <ImageBackground
        source={require("@/assets/images/PostScoreBackground.png")}
        style={styles.background}
        blurRadius={2}
      >
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose}>
              <Image source={CloseIcon} style={styles.closeIcon} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Post Score</Text>
            <View style={{ width: 32 }} />
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

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
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          {/* HEADER */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose}>
              <Image source={CloseIcon} style={styles.closeIcon} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {scoreType === "18hole" ? "Post 18-Hole Score" : "Post Hole-in-One"}
            </Text>
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
            {/* SCORECARD IMAGE */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Scorecard Photo</Text>
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
                    <Text style={styles.imagePlaceholderText}>Tap to Upload Scorecard</Text>
                    <Text style={styles.imagePlaceholderRequired}>REQUIRED</Text>
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
                  <Text style={styles.removeImageText}>✕ Remove Image</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* COURSE SELECTION */}
            {!selectedCourse && showCourseSelection && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Select Course</Text>

                <View style={styles.locationRow}>
                  <Text style={styles.locationText}>
                    {location?.city && location?.state
                      ? `${location.city}, ${location.state}`
                      : location?.zip || "No location set"}
                  </Text>
                  <TouchableOpacity onPress={handleChangeLocation}>
                    <Image source={LocationIcon} style={styles.locationIcon} />
                  </TouchableOpacity>
                </View>

                <View style={styles.searchContainer}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search for a course..."
                    placeholderTextColor="#999"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onSubmitEditing={handleSearch}
                    returnKeyType="search"
                  />
                </View>

                {searchResults.length > 0 && (
                  <View style={styles.searchResultsContainer}>
                    {searchResults.map((course, index) => (
                      <TouchableOpacity
                        key={`search-${course.id}-${index}`}
                        style={styles.searchRowTouchable}
                        onPress={() => handleCourseSelect(course)}
                      >
                        <View style={styles.searchRow}>
                          <View style={styles.searchRowContent}>
                            <View style={styles.searchRowLeft}>
                              <Text style={styles.searchRowText}>
                                {course.course_name}
                              </Text>
                              <Text style={styles.searchRowLocation}>
                                {course.location.city}, {course.location.state}
                              </Text>
                            </View>
                            {course.distance !== undefined && (
                              <Text style={styles.searchRowDistance}>
                                {course.distance.toFixed(1)} mi
                              </Text>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {searchResults.length === 0 && nearbyCourses.length > 0 && (
                  <View style={styles.searchResultsContainer}>
                    {nearbyCourses.map((course, index) => (
                      <TouchableOpacity
                        key={`nearby-${course.id}-${index}`}
                        style={styles.searchRowTouchable}
                        onPress={() => handleCourseSelect(course)}
                      >
                        <View style={styles.searchRow}>
                          <View style={styles.searchRowContent}>
                            <View style={styles.searchRowLeft}>
                              <Text style={styles.searchRowText}>
                                {course.course_name}
                              </Text>
                              <Text style={styles.searchRowLocation}>
                                {course.location.city}, {course.location.state}
                              </Text>
                            </View>
                            {course.distance !== undefined && (
                              <Text style={styles.searchRowDistance}>
                                {course.distance.toFixed(1)} mi
                              </Text>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* SELECTED COURSE */}
            {selectedCourse && (
              <View style={styles.selectedCourseContainer}>
                <Text style={styles.sectionTitle}>Course</Text>
                <View style={styles.selectedCourseCard}>
                  <Text style={styles.selectedCourseText}>
                    {selectedCourse.course_name}
                  </Text>
                  <Text style={styles.selectedCourseLocation}>
                    {selectedCourse.location.city}, {selectedCourse.location.state}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.changeCourseButton}
                  onPress={() => {
                    soundPlayer.play('click');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowCourseSelection(true);
                    setSelectedCourse(null);
                  }}
                >
                  <Text style={styles.changeCourseText}>Change Course</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* TEE SELECTION */}
            {scoreType === "18hole" && selectedCourse && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Select Tee</Text>
                <View style={styles.toggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.teeButton,
                      tee === "back" && styles.teeButtonActive,
                    ]}
                    onPress={() => {
                      soundPlayer.play('click');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setTee("back");
                    }}
                  >
                    <Text
                      style={[
                        styles.teeText,
                        tee === "back" && styles.teeTextActive,
                      ]}
                    >
                      Back Tees
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.teeButton,
                      tee === "forward" && styles.teeButtonActive,
                    ]}
                    onPress={() => {
                      soundPlayer.play('click');
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setTee("forward");
                    }}
                  >
                    <Text
                      style={[
                        styles.teeText,
                        tee === "forward" && styles.teeTextActive,
                      ]}
                    >
                      Forward Tees
                    </Text>
                  </TouchableOpacity>
                </View>
                {par !== null && <Text style={styles.par}>Par {par}</Text>}
              </View>
            )}

            {/* GROSS SCORE */}
            {scoreType === "18hole" && selectedCourse && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Gross Score</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your gross score"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                  value={grossScore}
                  onChangeText={setGrossScore}
                />
                {netScore !== null && (
                  <Text style={styles.net}>Net Score: {netScore}</Text>
                )}
              </View>
            )}

            {/* HOLE NUMBER */}
            {scoreType === "holeinone" && selectedCourse && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Hole Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Which hole? (1-18)"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                  value={holeNumber}
                  onChangeText={setHoleNumber}
                />
              </View>
            )}

            {/* VERIFIER */}
            {scoreType === "holeinone" && selectedCourse && (
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
            )}

            {/* DESCRIPTION */}
            {selectedCourse && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {scoreType === "18hole" ? "How was your round?" : "Tell us about your ace!"}
                </Text>
                <View style={styles.textInputContainer}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.descriptionInput,
                      roundDescription && styles.textInputWithContent,
                    ]}
                    placeholder={
                      scoreType === "18hole"
                        ? "Share details about your round... (mention partners with @)"
                        : "Describe your hole-in-one... (mention partners with @)"
                    }
                    placeholderTextColor="#999"
                    multiline
                    maxLength={MAX_CHARACTERS}
                    value={roundDescription}
                    onChangeText={handleDescriptionChange}
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

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* VERIFIER MODAL */}
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
                <TouchableOpacity onPress={() => {
                  soundPlayer.play('click');
                  setShowVerifierModal(false);
                }}>
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

        {/* LOADING OVERLAY */}
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

/* ========================= STYLES ========================= */

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: "100%",
    height: "100%",
  },

  container: {
    flex: 1,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(13, 92, 58, 0.95)",
  },

  closeIcon: {
    width: 28,
    height: 28,
    tintColor: "#FFF",
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#FFF",
    flex: 1,
    textAlign: "center",
  },

  submitButton: {
    width: 44,
    height: 44,
    backgroundColor: "#FFD700",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  submitIcon: {
    fontSize: 24,
  },

  scrollView: {
    flex: 1,
  },

  scrollViewContent: {
    paddingBottom: 100,
  },

  section: {
    paddingHorizontal: 16,
    marginTop: 20,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0D5C3A",
    marginBottom: 12,
  },

  locationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.85)",
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },

  locationText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  locationIcon: {
    width: 24,
    height: 24,
    tintColor: "#0D5C3A",
  },

  searchContainer: {
    marginBottom: 12,
  },

  searchInput: {
    padding: 14,
    backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.85)",
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },

  selectedCourseContainer: {
    paddingHorizontal: 16,
    marginTop: 20,
  },

  selectedCourseCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: "#0D5C3A",
    backgroundColor: "rgba(200, 230, 201, 0.85)",
    marginBottom: 12,
  },

  selectedCourseText: {
    fontWeight: "900",
    fontSize: 18,
    marginBottom: 4,
    color: "#0D5C3A",
  },

  selectedCourseLocation: {
    fontSize: 14,
    color: "#0D5C3A",
    fontWeight: "700",
  },

  changeCourseButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#0D5C3A",
    borderRadius: 10,
    alignItems: "center",
  },

  changeCourseText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 15,
  },

  input: {
    padding: 14,
    backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.85)",
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },

  descriptionInput: {
    minHeight: 120,
    textAlignVertical: "top",
  },

  textInputContainer: {
    position: "relative",
  },

  textInputWithContent: {
    color: "transparent",
  },

  textOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    paddingTop: 15,
  },

  overlayText: {
    fontSize: 16,
    color: "#333",
  },

  mentionText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  charCount: {
    fontSize: 12,
    color: "#999",
    textAlign: "right",
    marginTop: 4,
  },

  autocompleteContainer: {
    backgroundColor: "#FFF",
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    maxHeight: 200,
  },

  autocompleteScrollView: {
    maxHeight: 200,
  },

  autocompleteItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },

  autocompleteName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  searchResultsContainer: {
    marginBottom: 12,
  },

  searchRowTouchable: {
    borderRadius: 10,
    overflow: Platform.OS === "ios" ? "hidden" : "visible",
    marginBottom: 8,
  },

  searchRow: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    backgroundColor: "rgba(255, 255, 255, 0.5)",
    overflow: "hidden",
  },

  searchRowContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  searchRowLeft: {
    flex: 1,
  },

  searchRowText: {
    fontWeight: "900",
    fontSize: 16,
    marginBottom: 4,
    color: "#0D5C3A",
  },

  searchRowLocation: {
    fontSize: 13,
    color: "#333",
    fontWeight: "600",
  },

  searchRowDistance: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    marginLeft: 12,
  },

  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 12,
  },

  teeButton: {
    flex: 1,
    padding: 12,
    backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.85)",
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },

  teeButtonActive: {
    backgroundColor: Platform.OS === "ios" ? "rgba(232, 245, 233, 0.9)" : "#E8F5E9",
    borderColor: "#0D5C3A",
    borderWidth: 2,
  },

  teeText: {
    fontSize: 16,
    fontWeight: "600",
  },

  teeTextActive: {
    fontWeight: "900",
  },

  par: { 
    textAlign: "center", 
    marginTop: 12, 
    fontWeight: "800",
    fontSize: 20,
    color: "#0D5C3A",
  },

  net: { 
    textAlign: "center", 
    marginTop: 8,
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },

  verifierButton: {
    padding: 16,
    backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.7)" : "rgba(255, 255, 255, 0.85)",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#0D5C3A",
    alignItems: "center",
  },

  verifierButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  imagePicker: {
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#E8E8E8",
    borderWidth: 2,
    borderColor: "#0D5C3A",
    borderStyle: "dashed",
  },

  scorecardPreview: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  imagePlaceholderIcon: {
    fontSize: 48,
    marginBottom: 8,
  },

  imagePlaceholderText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  imagePlaceholderRequired: {
    fontSize: 12,
    fontWeight: "900",
    color: "#FF3B30",
    marginTop: 4,
  },

  removeImageButton: {
    marginTop: 8,
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#FF3B30",
    borderRadius: 6,
  },

  removeImageText: {
    color: "#FFF",
    fontWeight: "600",
    fontSize: 12,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },

  modalContainer: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingBottom: 40,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0D5C3A",
  },

  modalClose: {
    fontSize: 24,
    color: "#666",
    fontWeight: "600",
  },

  modalSearch: {
    margin: 16,
    padding: 12,
    backgroundColor: "#F5F5F5",
    borderRadius: 10,
    fontSize: 16,
  },

  partnerItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },

  partnerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },

  partnerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  partnerAvatarText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },

  partnerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },

  partnerSelected: {
    fontSize: 20,
    color: "#0D5C3A",
    fontWeight: "900",
  },

  emptyText: {
    textAlign: "center",
    padding: 40,
    color: "#999",
    fontSize: 16,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },

  loadingContainer: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    minWidth: 200,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },
});