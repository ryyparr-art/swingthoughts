/**
 * FeedPostContent Component
 * 
 * Renders post content with tappable @mentions and #hashtags.
 * - @partners -> Navigate to profile
 * - @courses -> Navigate to course page
 * - #tournaments -> Open filter search
 * - #leagues -> Navigate to league page
 */

import React, { useCallback, useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { soundPlayer } from "@/utils/soundPlayer";

/* ================================================================ */
/* TYPES                                                            */
/* ================================================================ */

interface FeedPostContentProps {
  content: string;
  taggedPartners?: Array<{ userId: string; displayName: string }>;
  taggedCourses?: Array<{ courseId: number; courseName: string }>;
  taggedTournaments?: Array<{ tournamentId: string; name: string }>;
  taggedLeagues?: Array<{ leagueId: string; name: string }>;
  onHashtagPress?: (name: string, type: "tournament" | "league") => void;
}

/* ================================================================ */
/* COMPONENT                                                        */
/* ================================================================ */

export default function FeedPostContent({
  content,
  taggedPartners = [],
  taggedCourses = [],
  taggedTournaments = [],
  taggedLeagues = [],
  onHashtagPress,
}: FeedPostContentProps) {
  const router = useRouter();

  // Build mention map for @ tags (partners and courses)
  const mentionMap = useMemo(() => {
    const map: { [key: string]: { type: string; id: string | number } } = {};
    
    taggedPartners.forEach((partner) => {
      map[`@${partner.displayName}`] = { type: 'partner', id: partner.userId };
    });
    
    taggedCourses.forEach((course) => {
      map[`@${course.courseName}`] = { type: 'course', id: course.courseId };
    });
    
    return map;
  }, [taggedPartners, taggedCourses]);

  // Build hashtag map for # tags (tournaments and leagues)
  const hashtagMap = useMemo(() => {
    const map: { [key: string]: { type: "tournament" | "league"; id: string; name: string } } = {};
    
    taggedTournaments.forEach((tournament) => {
      map[`#${tournament.name}`] = { type: 'tournament', id: tournament.tournamentId, name: tournament.name };
    });
    
    taggedLeagues.forEach((league) => {
      map[`#${league.name}`] = { type: 'league', id: league.leagueId, name: league.name };
    });
    
    return map;
  }, [taggedTournaments, taggedLeagues]);

  // Handle mention tap
  const handleMentionPress = useCallback((type: string, id: string | number) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (type === 'partner') {
      router.push(`/locker/${id}`);
    } else if (type === 'course') {
      router.push(`/locker/course/${id}`);
    }
  }, [router]);

  // Handle hashtag tap
  const handleHashtagPress = useCallback((type: "tournament" | "league", id: string, name: string) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (type === 'tournament') {
      // Open filter with tournament name
      onHashtagPress?.(name, type);
    } else if (type === 'league') {
      // Navigate to league page
      router.push(`/leagues/${id}`);
    }
  }, [router, onHashtagPress]);

  // Render content with styled tags
  const renderedContent = useMemo(() => {
    // Combine all patterns
    const mentionPatterns = Object.keys(mentionMap)
      .map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    
    const hashtagPatterns = Object.keys(hashtagMap)
      .map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    
    const allPatterns = [...mentionPatterns, ...hashtagPatterns]
      .sort((a, b) => b.length - a.length);
    
    if (allPatterns.length === 0) {
      return <Text style={styles.content}>{content}</Text>;
    }
    
    const combinedRegex = new RegExp(`(${allPatterns.join('|')})`, 'g');
    const parts = content.split(combinedRegex);
    
    return (
      <Text style={styles.content}>
        {parts.map((part, index) => {
          // Check if it's a mention (@)
          const mention = mentionMap[part];
          if (mention) {
            return (
              <Text
                key={index}
                style={styles.mention}
                onPress={() => handleMentionPress(mention.type, mention.id)}
              >
                {part}
              </Text>
            );
          }
          
          // Check if it's a hashtag (#)
          const hashtag = hashtagMap[part];
          if (hashtag) {
            return (
              <Text
                key={index}
                style={hashtag.type === 'league' ? styles.hashtagLeague : styles.hashtag}
                onPress={() => handleHashtagPress(hashtag.type, hashtag.id, hashtag.name)}
              >
                {part}
              </Text>
            );
          }
          
          return <Text key={index}>{part}</Text>;
        })}
      </Text>
    );
  }, [content, mentionMap, hashtagMap, handleMentionPress, handleHashtagPress]);

  return renderedContent;
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  content: {
    fontSize: 16,
    marginBottom: 12,
    color: "#333",
    lineHeight: 22,
  },
  mention: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  hashtag: {
    fontSize: 16,
    fontWeight: "700",
    color: "#B8860B", // Gold for tournaments
  },
  hashtagLeague: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FF6B35", // Orange for leagues
  },
});