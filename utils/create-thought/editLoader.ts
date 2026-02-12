/**
 * Edit Loader for Create Thought
 * 
 * Loads an existing post's data for editing, parsing media,
 * mentions, tournaments, leagues, and polls back into component state.
 */

import { MAX_VIDEO_DURATION } from "@/components/create-thought/types";
import { auth, db } from "@/constants/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

export interface EditPostData {
  // Post fields
  content: string;
  postType: string;

  // Media
  mediaType: "images" | "video" | null;
  imageUris: string[];
  videoUri: string | null;
  videoThumbnailUri: string | null;
  videoDuration: number;
  trimStart: number;
  trimEnd: number;
  showVideoTrimmer: boolean;
  mediaAspectRatio: number | null;

  // Tags
  selectedMentions: string[];
  selectedTournaments: string[];
  selectedLeagues: string[];

  // Poll
  pollData?: { question: string; options: string[] };

  // Original data (preserved for edit)
  originalPostData: any;
}

/* ================================================================ */
/* LOADER                                                           */
/* ================================================================ */

export const loadPostForEdit = async (
  editId: string
): Promise<EditPostData | null> => {
  try {
    const postDoc = await getDoc(doc(db, "thoughts", editId));
    if (!postDoc.exists()) return null;

    const postData = postDoc.data();

    // Verify ownership
    if (postData.userId !== auth.currentUser?.uid) return null;

    // Parse media
    let mediaType: "images" | "video" | null = null;
    let imageUris: string[] = [];
    let videoUri: string | null = null;
    let videoThumbnailUri: string | null = null;
    let videoDuration = 0;
    let trimStart = 0;
    let trimEnd = 30;
    let showVideoTrimmer = false;

    if (postData.imageUrls && postData.imageUrls.length > 0) {
      imageUris = postData.imageUrls;
      mediaType = "images";
    } else if (postData.imageUrl) {
      imageUris = [postData.imageUrl];
      mediaType = "images";
    } else if (postData.videoUrl) {
      videoUri = postData.videoUrl;
      videoThumbnailUri = postData.videoThumbnailUrl || null;
      mediaType = "video";
      if (postData.videoDuration) {
        videoDuration = postData.videoDuration;
        trimStart = postData.videoTrimStart || 0;
        trimEnd = postData.videoTrimEnd || Math.min(postData.videoDuration, MAX_VIDEO_DURATION);
        showVideoTrimmer = true;
      }
    }

    // Parse mentions (partners + courses)
    const selectedMentions: string[] = [];
    if (postData.taggedPartners) {
      postData.taggedPartners.forEach((p: any) => {
        selectedMentions.push(`@${p.displayName}`);
      });
    }
    if (postData.taggedCourses) {
      postData.taggedCourses.forEach((c: any) => {
        selectedMentions.push(`@${c.courseName}`);
      });
    }

    // Parse tournaments
    const selectedTournaments: string[] = [];
    if (postData.taggedTournaments) {
      postData.taggedTournaments.forEach((t: any) => {
        selectedTournaments.push(`#${t.name}`);
      });
    }

    // Parse leagues
    const selectedLeagues: string[] = [];
    if (postData.taggedLeagues) {
      postData.taggedLeagues.forEach((l: any) => {
        selectedLeagues.push(`#${l.name}`);
      });
    }

    // Parse poll
    let pollData: { question: string; options: string[] } | undefined;
    if (postData.poll) {
      pollData = {
        question: postData.poll.question || "",
        options: (postData.poll.options || []).map((o: any) => o.text || ""),
      };
    }

    return {
      content: postData.content || "",
      postType: postData.postType || "swing-thought",
      mediaType,
      imageUris,
      videoUri,
      videoThumbnailUri,
      videoDuration,
      trimStart,
      trimEnd,
      showVideoTrimmer,
      mediaAspectRatio: postData.mediaAspectRatio || null,
      selectedMentions,
      selectedTournaments,
      selectedLeagues,
      pollData,
      originalPostData: { ...postData, id: editId },
    };
  } catch (error) {
    console.error("Error loading post for edit:", error);
    return null;
  }
};