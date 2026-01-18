/**
 * useTournamentStatus Hook
 * 
 * Checks if there's an active PGA Tour tournament and returns its data.
 * Active = Thu-Sun, 8am-8pm ET, during tournament dates
 */

import { db } from "@/constants/firebaseConfig";
import { collection, getDocs, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import { useEffect, useState } from "react";

export interface ActiveTournament {
  id: string;
  tournId: string;
  name: string;
  courseName?: string;
  location?: {
    city: string;
    state: string;
    country: string;
    latitude?: number;
    longitude?: number;
  };
  regionKey?: string;
  startDate: Date;
  endDate: Date;
  year: number;
}

interface TournamentStatusResult {
  isLive: boolean;
  tournament: ActiveTournament | null;
  participantCount: number;
  loading: boolean;
  error: string | null;
}

/**
 * Get current day of week and hour
 * Uses device local time (since most US golf users will be in a reasonable timezone)
 * 
 * For production, you may want to adjust for true ET, but for MVP this works well
 * since tournament coverage hours (8am-8pm ET) overlap with most US timezones
 */
function getCurrentTimeInfo(): { dayOfWeek: number; hour: number } {
  const now = new Date();
  
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = now.getHours(); // 0-23
  
  // Day names for logging
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  
  console.log("🏌️ Current time info:", {
    localTime: now.toString(),
    dayOfWeek,
    dayName: dayNames[dayOfWeek],
    hour,
  });
  
  return { dayOfWeek, hour };
}

/**
 * Check if current time is within live coverage hours
 * Thu-Sun, 8am-8pm (local time - close enough for US users)
 */
function isWithinLiveHours(): boolean {
  const { dayOfWeek, hour } = getCurrentTimeInfo();
  
  // Day names for logging
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayName = dayNames[dayOfWeek];
  
  // Valid days: Thu (4), Fri (5), Sat (6), Sun (0)
  const validDays = [0, 4, 5, 6]; // Sun, Thu, Fri, Sat
  const isValidDay = validDays.includes(dayOfWeek);
  
  // Valid hours: 8am-8pm (8-19 inclusive, meaning hour < 20)
  const isValidHour = hour >= 8 && hour < 20;
  
  console.log("🏌️ isWithinLiveHours check:", {
    dayOfWeek,
    dayName,
    hour,
    isValidDay,
    isValidHour,
    result: isValidDay && isValidHour,
  });
  
  if (!isValidDay) {
    console.log(`🏌️ ❌ Not a valid day: ${dayName} (need Thu-Sun)`);
    return false;
  }
  
  if (!isValidHour) {
    console.log(`🏌️ ❌ Not within valid hours: ${hour}:00 (need 8am-8pm)`);
    return false;
  }
  
  console.log("🏌️ ✅ Within live hours!");
  return true;
}

/**
 * Check if a date range includes today
 */
function isWithinDateRange(startDate: Date, endDate: Date): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  
  const isWithin = today >= start && today <= end;
  
  console.log("🏌️ Date range check:", {
    today: today.toDateString(),
    start: start.toDateString(),
    end: end.toDateString(),
    isWithin,
  });
  
  return isWithin;
}

export function useTournamentStatus(): TournamentStatusResult {
  const [tournament, setTournament] = useState<ActiveTournament | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    console.log("🏌️ useTournamentStatus hook mounted");
    
    let unsubscribeChat: (() => void) | null = null;
    let intervalId: any = null;

    const checkTournamentStatus = async () => {
      console.log("🏌️ checkTournamentStatus called");
      
      try {
        // First check if we're in valid hours
        const withinHours = isWithinLiveHours();
        
        if (!withinHours) {
          console.log("🏌️ Not within live hours, skipping tournament check");
          setIsLive(false);
          setTournament(null);
          setLoading(false);
          return;
        }

        // Query for tournaments happening today
        const now = new Date();
        const year = now.getFullYear();
        
        console.log("🏌️ Querying tournaments for year:", year);
        
        // Get tournaments for current year where we're within the date range
        const tournamentsRef = collection(db, "tournaments");
        const q = query(
          tournamentsRef,
          where("year", "==", year)
        );
        
        const snapshot = await getDocs(q);
        
        console.log("🏌️ Found", snapshot.docs.length, "tournaments for", year);
        
        // Find a tournament that's currently active
        let activeTournament: ActiveTournament | null = null;
        
        for (const doc of snapshot.docs) {
          const data = doc.data();
          
          // Convert Firestore Timestamps to Dates
          const startDate = data.startDate?.toDate?.() || new Date(data.startDate);
          const endDate = data.endDate?.toDate?.() || new Date(data.endDate);
          
          console.log("🏌️ Checking tournament:", data.name, {
            startDate: startDate.toDateString(),
            endDate: endDate.toDateString(),
          });
          
          if (isWithinDateRange(startDate, endDate)) {
            console.log("🏌️ ✅ Found active tournament:", data.name);
            activeTournament = {
              id: doc.id,
              tournId: data.tournId,
              name: data.name,
              courseName: data.course?.courseName,
              location: data.location,
              regionKey: data.regionKey,
              startDate,
              endDate,
              year: data.year,
            };
            break;
          }
        }

        if (activeTournament) {
          console.log("🏌️ Setting active tournament:", activeTournament.name);
          setTournament(activeTournament);
          setIsLive(true);
          
          // Subscribe to participant count from live chat
          const chatCollectionId = `tournamentChats_${year}_${activeTournament.tournId}_live`;
          const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
          
          console.log("🏌️ Subscribing to chat collection:", chatCollectionId);
          
          try {
            const chatRef = collection(db, chatCollectionId);
            const chatQuery = query(
              chatRef,
              where("createdAt", ">", Timestamp.fromDate(thirtyMinAgo))
            );
            
            unsubscribeChat = onSnapshot(chatQuery, (chatSnap) => {
              // Count unique users in last 30 min
              const uniqueUsers = new Set<string>();
              chatSnap.docs.forEach(doc => {
                const userId = doc.data().userId;
                if (userId) uniqueUsers.add(userId);
              });
              console.log("🏌️ Chat participants:", uniqueUsers.size);
              setParticipantCount(uniqueUsers.size);
            }, (err) => {
              // Collection might not exist yet - that's okay
              console.log("🏌️ Chat collection not yet created:", chatCollectionId);
              setParticipantCount(0);
            });
          } catch (e) {
            // Collection doesn't exist yet
            console.log("🏌️ Error subscribing to chat:", e);
            setParticipantCount(0);
          }
        } else {
          console.log("🏌️ No active tournament found for today");
          setTournament(null);
          setIsLive(false);
        }
        
        setLoading(false);
      } catch (err) {
        console.error("🏌️ Error checking tournament status:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      }
    };

    // Initial check
    checkTournamentStatus();

    // Re-check every minute (for hour boundaries)
    intervalId = setInterval(checkTournamentStatus, 60000);

    return () => {
      console.log("🏌️ useTournamentStatus hook unmounting");
      if (unsubscribeChat) unsubscribeChat();
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  console.log("🏌️ useTournamentStatus returning:", { isLive, tournament: tournament?.name, participantCount, loading, error });

  return {
    isLive,
    tournament,
    participantCount,
    loading,
    error,
  };
}