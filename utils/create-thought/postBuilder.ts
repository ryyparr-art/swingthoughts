/**
 * Post Builder for Create Thought
 * 
 * Handles media upload, tag extraction from content,
 * building the Firestore post document, and optimistic UI updates.
 */

import { auth, db, storage } from "@/constants/firebaseConfig";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import {
  Course,
  encodeGeohash,
  extractHashtags,
  Partner,
  TaggedLeague,
  TaggedTournament,
} from "@/components/create-thought/types";

/* ================================================================ */
/* MEDIA UPLOAD                                                     */
/* ================================================================ */

export const uploadImages = async (
  imageUris: string[],
  uid: string
): Promise<string[]> => {
  const urls: string[] = [];

  for (let i = 0; i < imageUris.length; i++) {
    const uri = imageUris[i];
    if (uri.startsWith("file://")) {
      const response = await fetch(uri);
      const blob = await response.blob();
      const path = `posts/${uid}/${Date.now()}_${i}.jpg`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob);
      urls.push(await getDownloadURL(storageRef));
    } else {
      urls.push(uri);
    }
  }

  return urls;
};

export const uploadVideo = async (
  videoUri: string,
  thumbnailUri: string | null,
  uid: string
): Promise<{ videoUrl: string; thumbnailUrl: string | null }> => {
  let uploadedVideoUrl = videoUri;
  let uploadedThumbnailUrl = thumbnailUri;

  if (videoUri.startsWith("file://")) {
    const response = await fetch(videoUri);
    const blob = await response.blob();
    const path = `posts/${uid}/${Date.now()}.mp4`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    uploadedVideoUrl = await getDownloadURL(storageRef);

    if (thumbnailUri) {
      try {
        const thumbResponse = await fetch(thumbnailUri);
        const thumbBlob = await thumbResponse.blob();
        const thumbPath = `posts/${uid}/${Date.now()}_thumb.jpg`;
        const thumbRef = ref(storage, thumbPath);
        await uploadBytes(thumbRef, thumbBlob);
        uploadedThumbnailUrl = await getDownloadURL(thumbRef);
      } catch (e) {
        console.error("Thumbnail upload failed:", e);
      }
    }
  }

  return { videoUrl: uploadedVideoUrl, thumbnailUrl: uploadedThumbnailUrl };
};

/* ================================================================ */
/* TAG EXTRACTION FROM CONTENT                                      */
/* ================================================================ */

export const extractMentionsFromContent = async (
  content: string,
  allPartners: Partner[]
): Promise<{ partners: Partner[]; courses: Course[] }> => {
  const mentionRegex = /@([^@#\n]+?)(?=\s{2,}|$|@|#|\n)/g;
  const mentions = content.match(mentionRegex) || [];

  const partners: Partner[] = [];
  const courses: Course[] = [];

  for (const mention of mentions) {
    const mentionText = mention.substring(1).trim();

    // Check partners first
    const matchedPartner = allPartners.find(
      (p) => p.displayName.toLowerCase() === mentionText.toLowerCase()
    );
    if (matchedPartner && !partners.find((p) => p.userId === matchedPartner.userId)) {
      partners.push(matchedPartner);
      continue;
    }

    // Check courses
    try {
      const coursesSnap = await getDocs(collection(db, "courses"));
      let foundCourse = false;

      coursesSnap.forEach((docSnap) => {
        if (foundCourse) return;
        const data = docSnap.data();
        const courseName = data.course_name || data.courseName || "";
        const clubName = data.club_name || data.clubName || "";
        const courseId = data.id || parseInt(docSnap.id) || docSnap.id;

        let displayName = "";
        if (clubName && courseName && clubName !== courseName) {
          displayName = `${clubName} - ${courseName}`;
        } else if (clubName) {
          displayName = clubName;
        } else {
          displayName = courseName;
        }

        const mentionLower = mentionText.toLowerCase();
        if (
          (displayName.toLowerCase() === mentionLower ||
            clubName.toLowerCase() === mentionLower ||
            courseName.toLowerCase() === mentionLower) &&
          !courses.find((c) => c.courseId === courseId)
        ) {
          courses.push({ courseId, courseName: displayName });
          foundCourse = true;
        }
      });
    } catch (err) {
      console.error("Error matching course mentions:", err);
    }
  }

  return { partners, courses };
};

export const extractHashtagsFromContent = async (
  content: string
): Promise<{ tournaments: TaggedTournament[]; leagues: TaggedLeague[] }> => {
  const hashtagRegex = /#([^@#\n]+?)(?=\s{2,}|$|@|#|\n)/g;
  const hashtags = content.match(hashtagRegex) || [];

  const tournaments: TaggedTournament[] = [];
  const leagues: TaggedLeague[] = [];

  for (const hashtag of hashtags) {
    const hashtagText = hashtag.substring(1).trim();

    // Check tournaments
    try {
      const tournamentsSnap = await getDocs(collection(db, "tournaments"));
      let found = false;
      tournamentsSnap.forEach((docSnap) => {
        if (found) return;
        const data = docSnap.data();
        const name = data.name || "";
        if (
          name.toLowerCase() === hashtagText.toLowerCase() &&
          !tournaments.find((t) => t.tournamentId === docSnap.id)
        ) {
          tournaments.push({
            tournamentId: data.tournId || docSnap.id,
            name,
            type: "tournament",
          });
          found = true;
        }
      });
    } catch (err) {
      console.error("Error matching tournament:", err);
    }

    // Check leagues
    try {
      const leaguesSnap = await getDocs(collection(db, "leagues"));
      let found = false;
      leaguesSnap.forEach((docSnap) => {
        if (found) return;
        const data = docSnap.data();
        const name = data.name || "";
        if (
          name.toLowerCase() === hashtagText.toLowerCase() &&
          !leagues.find((l) => l.leagueId === docSnap.id)
        ) {
          leagues.push({ leagueId: docSnap.id, name, type: "league" });
          found = true;
        }
      });
    } catch {
      // Leagues collection may not exist
    }
  }

  return { tournaments, leagues };
};

/* ================================================================ */
/* BUILD POST DATA                                                  */
/* ================================================================ */

interface BuildPostParams {
  content: string;
  selectedType: string;
  mediaType: "images" | "video" | null;
  uploadedImageUrls: string[];
  uploadedVideoUrl: string | null;
  uploadedThumbnailUrl: string | null;
  videoDuration: number;
  trimStart: number;
  trimEnd: number;
  extractedPartners: Partner[];
  extractedCourses: Course[];
  extractedTournaments: TaggedTournament[];
  extractedLeagues: TaggedLeague[];
  mediaAspectRatio?: number;
}

export const buildPostData = async (params: BuildPostParams) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No user");

  const userDoc = await getDoc(doc(db, "users", uid));
  const userData = userDoc.data();
  if (!userData) throw new Error("No user data");

  const userLat = userData.currentLatitude || userData.latitude;
  const userLon = userData.currentLongitude || userData.longitude;
  const userCity = userData.currentCity || userData.city || "";
  const userState = userData.currentState || userData.state || "";
  const geohash = userLat && userLon ? encodeGeohash(userLat, userLon, 5) : "";

  const postData = {
    content: params.content.trim(),
    postType: params.selectedType,

    regionKey: userData.regionKey || "",
    geohash,
    location: {
      city: userCity,
      state: userState,
      latitude: userLat || null,
      longitude: userLon || null,
    },

    userName: userData.displayName || "Unknown",
    displayName: userData.displayName || "Unknown",
    userAvatar: userData.avatar || null,
    avatar: userData.avatar || null,
    handicap: userData.handicap || null,
    userType: userData.userType || "Golfer",
    verified: userData.verified === true || userData.verification?.status === "approved",

    hasMedia: params.uploadedImageUrls.length > 0 || params.uploadedVideoUrl !== null,
    mediaType: params.uploadedImageUrls.length > 0 ? "images" : params.uploadedVideoUrl ? "video" : null,
    imageUrls: params.uploadedImageUrls,
    imageCount: params.uploadedImageUrls.length,
    imageUrl: null,
    videoUrl: params.uploadedVideoUrl,
    videoThumbnailUrl: params.uploadedThumbnailUrl,
    videoDuration: params.uploadedVideoUrl ? params.videoDuration : null,
    videoTrimStart: params.uploadedVideoUrl ? params.trimStart : null,
    videoTrimEnd: params.uploadedVideoUrl ? params.trimEnd : null,
    mediaAspectRatio: params.mediaAspectRatio || null,

    likes: 0,
    likedBy: [] as string[],
    comments: 0,
    engagementScore: 0,
    lastActivityAt: serverTimestamp(),
    viewCount: 0,

    contentLowercase: params.content.trim().toLowerCase(),
    hashtags: extractHashtags(params.content),

    taggedPartners: params.extractedPartners.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
    })),
    taggedCourses: params.extractedCourses.map((c) => ({
      courseId: c.courseId,
      courseName: c.courseName,
    })),
    taggedTournaments: params.extractedTournaments.map((t) => ({
      tournamentId: t.tournamentId,
      name: t.name,
    })),
    taggedLeagues: params.extractedLeagues.map((l) => ({
      leagueId: l.leagueId,
      name: l.name,
    })),

    isReported: false,
    reportCount: 0,
    isHidden: false,
    moderatedAt: null,
    moderatedBy: null,
    createdAtTimestamp: Date.now(),
  };

  return { postData, userData };
};

/* ================================================================ */
/* SUBMIT POST (create or edit)                                     */
/* ================================================================ */

interface SubmitResult {
  postId: string;
  isNew: boolean;
}

export const submitPost = async (
  postData: any,
  editingPostId: string | null
): Promise<SubmitResult> => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No user");

  if (editingPostId) {
    await updateDoc(doc(db, "thoughts", editingPostId), postData);
    return { postId: editingPostId, isNew: false };
  } else {
    const newPostRef = await addDoc(collection(db, "thoughts"), {
      thoughtId: `thought_${Date.now()}`,
      userId: uid,
      ...postData,
      createdAt: new Date(),
    });
    return { postId: newPostRef.id, isNew: true };
  }
};

/* ================================================================ */
/* BUILD OPTIMISTIC POST (for NewPostContext)                       */
/* ================================================================ */

export const buildOptimisticPost = (
  postId: string,
  postData: any,
  userData: any,
  originalPostData?: any
) => {
  const uid = auth.currentUser?.uid || "";

  return {
    id: postId,
    thoughtId: originalPostData?.thoughtId || `thought_${Date.now()}`,
    userId: uid,
    userType: userData.userType || "Golfer",
    content: postData.content,
    postType: postData.postType,

    imageUrls: postData.imageUrls,
    imageCount: postData.imageCount,
    videoUrl: postData.videoUrl,
    videoThumbnailUrl: postData.videoThumbnailUrl,
    videoDuration: postData.videoDuration,
    videoTrimStart: postData.videoTrimStart,
    videoTrimEnd: postData.videoTrimEnd,

    createdAt: originalPostData?.createdAt || new Date(),
    likes: originalPostData?.likes || 0,
    likedBy: originalPostData?.likedBy || [],
    comments: originalPostData?.comments || 0,

    userName: userData.displayName || "Unknown",
    displayName: userData.displayName || "Unknown",
    userAvatar: userData.avatar || null,
    avatarUrl: userData.avatar || null,
    userVerified: userData.verified === true,

    taggedPartners: postData.taggedPartners,
    taggedCourses: postData.taggedCourses,
    taggedTournaments: postData.taggedTournaments,
    taggedLeagues: postData.taggedLeagues,

    regionKey: postData.regionKey,
    geohash: postData.geohash,
    location: postData.location,
    hasMedia: postData.hasMedia,
    mediaType: postData.mediaType,
    mediaAspectRatio: postData.mediaAspectRatio,
  };
};