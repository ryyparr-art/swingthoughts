import { auth, db } from "@/constants/firebaseConfig";
import { checkAndAwardBadges } from "@/utils/badgeUtils";
import { createNotification } from "@/utils/notificationHelpers";
import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ScoreData {
  userId: string;
  userName: string;
  courseId: number;
  courseName: string;
  holeNumber: number;
  roundDescription: string;
  scorecardImageUrl: string;
  status: "pending" | "verified" | "denied";
  verifierId: string;
  verifierName: string;
  taggedPartners?: Array<{ userId: string; displayName: string }>;
  createdAt: any;
}

export default function VerifyHoleInOneScreen() {
  const router = useRouter();
  const { scoreId } = useLocalSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [scoreData, setScoreData] = useState<ScoreData | null>(null);
  const [posterAvatar, setPosterAvatar] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadScore();
  }, [scoreId]);

  const loadScore = async () => {
    if (!scoreId || typeof scoreId !== "string") {
      soundPlayer.play('error');
      Alert.alert("Error", "Invalid score ID");
      router.back();
      return;
    }

    try {
      const scoreDoc = await getDoc(doc(db, "scores", scoreId));
      
      if (!scoreDoc.exists()) {
        soundPlayer.play('error');
        Alert.alert("Error", "Score not found");
        router.back();
        return;
      }

      const data = scoreDoc.data() as ScoreData;
      
      // Check if current user is the verifier
      if (data.verifierId !== auth.currentUser?.uid) {
        soundPlayer.play('error');
        Alert.alert("Error", "You are not authorized to verify this hole-in-one");
        router.back();
        return;
      }

      // Check if already verified or denied
      if (data.status !== "pending") {
        soundPlayer.play('error');
        Alert.alert(
          "Already Processed",
          `This hole-in-one has already been ${data.status}.`
        );
        router.back();
        return;
      }

      setScoreData(data);

      // Load poster's avatar
      const userDoc = await getDoc(doc(db, "users", data.userId));
      if (userDoc.exists()) {
        setPosterAvatar(userDoc.data()?.avatar || null);
      }

      setLoading(false);
    } catch (error) {
      console.error("Error loading score:", error);
      soundPlayer.play('error');
      Alert.alert("Error", "Failed to load hole-in-one details");
      router.back();
    }
  };

  // Render content with @ mention styling
  const renderContentWithMentions = (content: string, taggedPartners: any[] = []) => {
    // Create a map of all mentions for quick lookup
    const mentionMap: { [key: string]: string } = {};
    
    // Add partners to mention map
    taggedPartners.forEach((partner) => {
      mentionMap[`@${partner.displayName}`] = partner.userId;
    });
    
    // Build regex pattern from all valid mentions
    const mentionPatterns = Object.keys(mentionMap)
      .map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length);
    
    if (mentionPatterns.length === 0) {
      return <Text style={styles.descriptionText}>{content}</Text>;
    }
    
    const mentionRegex = new RegExp(`(${mentionPatterns.join('|')})`, 'g');
    const parts = content.split(mentionRegex);
    
    return (
      <Text style={styles.descriptionText}>
        {parts.map((part, index) => {
          const userId = mentionMap[part];
          
          if (userId) {
            return (
              <Text
                key={index}
                style={styles.mention}
                onPress={() => {
                  soundPlayer.play('click');
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/locker/${userId}`);
                }}
              >
                {part}
              </Text>
            );
          }
          
          return <Text key={index}>{part}</Text>;
        })}
      </Text>
    );
  };

  const handleApprove = async () => {
    if (!scoreData || !scoreId || typeof scoreId !== "string") return;

    soundPlayer.play('click');
    
    const confirmed = Platform.OS === "web"
      ? window.confirm("Approve this hole-in-one?")
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Confirm Approval",
            "Are you sure you want to verify this hole-in-one?",
            [
              { 
                text: "Cancel", 
                style: "cancel", 
                onPress: () => {
                  soundPlayer.play('click');
                  resolve(false);
                }
              },
              { 
                text: "Approve", 
                style: "default", 
                onPress: () => {
                  soundPlayer.play('click');
                  resolve(true);
                }
              },
            ]
          );
        });

    if (!confirmed) return;

    setProcessing(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      // 1. Update score status
      await updateDoc(doc(db, "scores", scoreId), {
        status: "verified",
        verifiedAt: serverTimestamp(),
        verifiedBy: auth.currentUser!.uid,
      });

      console.log("✅ Score updated to verified");

      // 2. Award hole-in-one badge
      await checkAndAwardBadges(
        scoreData.userId,
        scoreData.courseId,
        scoreData.courseName,
        0,
        true,
        scoreData.holeNumber
      );

      console.log("🏆 Badge awarded");

      // 3. Create clubhouse post
      const postContent = `${scoreData.roundDescription}\n\n📍 @${scoreData.courseName}\n🎯 Hole ${scoreData.holeNumber} - Hole in One!`;

      const thoughtData = {
        thoughtId: `thought_${Date.now()}`,
        userId: scoreData.userId,
        content: postContent,
        postType: "Hole in 1 Achieved!",
        imageUrl: scoreData.scorecardImageUrl,
        createdAt: serverTimestamp(),
        likes: 0,
        likedBy: [],
        comments: 0,
        scoreId: scoreId,
        taggedPartners: scoreData.taggedPartners || [],
        taggedCourses: [{
          courseId: scoreData.courseId,
          courseName: scoreData.courseName,
        }],
      };

      const thoughtRef = await addDoc(collection(db, "thoughts"), thoughtData);
      console.log("✅ Clubhouse post created:", thoughtRef.id);

      // 3b. Update course_leaders with postId for this hole-in-one
      try {
        const courseLeaderRef = doc(db, "course_leaders", scoreData.courseId.toString());
        const courseLeaderDoc = await getDoc(courseLeaderRef);
        
        if (courseLeaderDoc.exists()) {
          const holeinones = courseLeaderDoc.data()?.holeinones || [];
          
          // Find and update the hole-in-one entry for this user/hole
          const updatedHoleinones = holeinones.map((hio: any) => {
            if (hio.userId === scoreData.userId && hio.hole === scoreData.holeNumber && !hio.postId) {
              return { ...hio, postId: thoughtRef.id };
            }
            return hio;
          });
          
          await updateDoc(courseLeaderRef, {
            holeinones: updatedHoleinones,
          });
          
          console.log("✅ Updated hole-in-one with postId");
        }
      } catch (error) {
        console.error("⚠️ Error updating hole-in-one postId:", error);
      }

      // 4. Send notification to poster
      await createNotification({
        userId: scoreData.userId,
        type: "holeinone_verified",
        actorId: auth.currentUser!.uid,
        postId: thoughtRef.id,
        customMessage: `✅ ${auth.currentUser?.displayName || "Your partner"} verified your hole-in-one!`,
      });

      // 5. Get poster's partners and send notifications (exclude verifier)
      const posterDoc = await getDoc(doc(db, "users", scoreData.userId));
      if (posterDoc.exists()) {
        const partners = posterDoc.data()?.partners || [];
        
        for (const partnerId of partners) {
          if (partnerId !== auth.currentUser!.uid) {
            await createNotification({
              userId: partnerId,
              type: "partner_holeinone",
              actorId: scoreData.userId,
              postId: thoughtRef.id,
              courseId: scoreData.courseId,
              customMessage: `${scoreData.userName} hit a hole in 1 @${scoreData.courseName}!`,
            });
          }
        }
        
        console.log("✅ Partner notifications sent");
      }

      soundPlayer.play('achievement');
      setProcessing(false);

      Alert.alert(
        "✅ Verified!",
        `You've verified ${scoreData.userName}'s hole-in-one!`,
        [{ 
          text: "Great!", 
          onPress: () => {
            soundPlayer.play('click');
            router.back();
          }
        }]
      );
    } catch (error) {
      console.error("Error approving hole-in-one:", error);
      soundPlayer.play('error');
      setProcessing(false);
      Alert.alert("Error", "Failed to verify hole-in-one. Please try again.");
    }
  };

  const handleDeny = async () => {
    if (!scoreData || !scoreId || typeof scoreId !== "string") return;

    soundPlayer.play('click');
    
    const confirmed = Platform.OS === "web"
      ? window.confirm("Deny this hole-in-one? This cannot be undone.")
      : await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Confirm Denial",
            "Are you sure you want to deny this hole-in-one? This cannot be undone.",
            [
              { 
                text: "Cancel", 
                style: "cancel", 
                onPress: () => {
                  soundPlayer.play('click');
                  resolve(false);
                }
              },
              { 
                text: "Deny", 
                style: "destructive", 
                onPress: () => {
                  soundPlayer.play('click');
                  resolve(true);
                }
              },
            ]
          );
        });

    if (!confirmed) return;

    setProcessing(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    try {
      // Update score status
      await updateDoc(doc(db, "scores", scoreId), {
        status: "denied",
        deniedAt: serverTimestamp(),
        deniedBy: auth.currentUser!.uid,
      });

      console.log("❌ Score denied");

      // Send notification to poster
      await createNotification({
        userId: scoreData.userId,
        type: "holeinone_denied",
        actorId: auth.currentUser!.uid,
        scoreId: scoreId,
        customMessage: `❌ ${auth.currentUser?.displayName || "Your partner"} did not verify your hole-in-one submission`,
      });

      soundPlayer.play('error');
      setProcessing(false);

      Alert.alert(
        "Denied",
        "The hole-in-one submission has been denied.",
        [{ 
          text: "OK", 
          onPress: () => {
            soundPlayer.play('click');
            router.back();
          }
        }]
      );
    } catch (error) {
      console.error("Error denying hole-in-one:", error);
      soundPlayer.play('error');
      setProcessing(false);
      Alert.alert("Error", "Failed to deny hole-in-one. Please try again.");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0D5C3A" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!scoreData) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          soundPlayer.play('click');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}>
          <Image
            source={require("@/assets/icons/Back.png")}
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verify Hole-in-One</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* User Info */}
        <View style={styles.userSection}>
          {posterAvatar ? (
            <Image source={{ uri: posterAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {scoreData.userName[0]?.toUpperCase() || "?"}
              </Text>
            </View>
          )}
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{scoreData.userName}</Text>
            <Text style={styles.courseInfo}>
              {scoreData.courseName} • Hole {scoreData.holeNumber}
            </Text>
          </View>
        </View>

        {/* Description */}
        {scoreData.roundDescription && (
          <View style={styles.descriptionSection}>
            <Text style={styles.sectionLabel}>Description</Text>
            {renderContentWithMentions(scoreData.roundDescription, scoreData.taggedPartners || [])}
          </View>
        )}

        {/* Scorecard Image */}
        <View style={styles.imageSection}>
          <Text style={styles.sectionLabel}>Scorecard</Text>
          <TouchableOpacity activeOpacity={0.9}>
            <Image
              source={{ uri: scoreData.scorecardImageUrl }}
              style={styles.scorecardImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <Text style={styles.imageHint}>Tap to view full size</Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton]}
            onPress={handleApprove}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Text style={styles.actionButtonIcon}>✅</Text>
                <Text style={styles.actionButtonText}>Approve</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.denyButton]}
            onPress={handleDeny}
            disabled={processing}
          >
            {processing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Text style={styles.actionButtonIcon}>❌</Text>
                <Text style={styles.actionButtonText}>Deny</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.disclaimerSection}>
          <Text style={styles.disclaimerText}>
            Only approve if you witnessed this hole-in-one in person. Denied submissions cannot be reversed.
          </Text>
        </View>
      </ScrollView>
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
  },

  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#0D5C3A",
  },

  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFF",
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },

  content: {
    flex: 1,
    padding: 20,
  },

  userSection: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    padding: 16,
    backgroundColor: "#FFF",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 16,
  },

  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },

  avatarText: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FFF",
  },

  userInfo: {
    flex: 1,
  },

  userName: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0D5C3A",
    marginBottom: 4,
  },

  courseInfo: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },

  descriptionSection: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: "#FFF",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
    textTransform: "uppercase",
  },

  descriptionText: {
    fontSize: 16,
    lineHeight: 24,
    color: "#333",
  },

  mention: {
    fontWeight: "700",
    color: "#0D5C3A",
  },

  imageSection: {
    marginBottom: 24,
  },

  scorecardImage: {
    width: "100%",
    height: 300,
    borderRadius: 12,
    backgroundColor: "#E8E8E8",
  },

  imageHint: {
    textAlign: "center",
    fontSize: 12,
    color: "#999",
    marginTop: 8,
    fontStyle: "italic",
  },

  actionsSection: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },

  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    borderRadius: 12,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  approveButton: {
    backgroundColor: "#0D5C3A",
  },

  denyButton: {
    backgroundColor: "#FF3B30",
  },

  actionButtonIcon: {
    fontSize: 20,
  },

  actionButtonText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#FFF",
  },

  disclaimerSection: {
    padding: 16,
    backgroundColor: "#FFF3CD",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FFECB5",
    marginBottom: 40,
  },

  disclaimerText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#664D03",
    textAlign: "center",
    fontWeight: "600",
  },
});