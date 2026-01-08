import { db } from "@/constants/firebaseConfig";
import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Player {
  userId: string;
  displayName: string;
  avatar?: string;
}

export default function PlayerSearchScreen() {
  const router = useRouter();
  const [playerSearch, setPlayerSearch] = useState("");
  const [allPlayers, setAllPlayers] = useState<Player[]>([]); // ✅ Store all players
  const [playerResults, setPlayerResults] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ Load all users on mount
  useEffect(() => {
    loadAllPlayers();
  }, []);

  const loadAllPlayers = async () => {
    try {
      setLoadingPlayers(true);

      const usersRef = collection(db, "users");
      const snapshot = await getDocs(usersRef);

      const players: Player[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        const displayName = data.displayName || "";
        
        // Filter out users without display names and Course accounts
        if (displayName && data.userType !== "Course") {
          players.push({
            userId: doc.id,
            displayName: displayName,
            avatar: data.avatar || null,
          });
        }
      });

      // Sort alphabetically by display name
      players.sort((a, b) => a.displayName.localeCompare(b.displayName));

      setAllPlayers(players);
      setLoadingPlayers(false);
      setInitialLoad(false);
      
      console.log(`✅ Loaded ${players.length} players`);
    } catch (err) {
      console.error("Error loading players:", err);
      soundPlayer.play('error');
      setLoadingPlayers(false);
      setInitialLoad(false);
    }
  };

  const handlePlayerSearchChange = (text: string) => {
    setPlayerSearch(text);
    setSelectedPlayer(null);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const query = text.trim();

      if (!query) {
        setPlayerResults([]);
        return;
      }

      // ✅ Filter from already-loaded players
      const searchLower = query.toLowerCase();
      const filtered = allPlayers.filter((player) =>
        player.displayName.toLowerCase().includes(searchLower)
      );

      setPlayerResults(filtered);
      console.log(`🔍 Found ${filtered.length} players matching "${query}"`);
    }, 200); // Faster debounce since we're filtering locally
  };

  const handleSelectPlayer = (player: Player) => {
    soundPlayer.play('click');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlayer(player);
    Keyboard.dismiss(); // ✅ Hide keyboard when player is selected
  };

  const handleApply = () => {
    if (!selectedPlayer) return;
    
    soundPlayer.play('click');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push({
      pathname: "/leaderboard",
      params: { 
        filterType: "player",
        playerId: selectedPlayer.userId,
        playerName: selectedPlayer.displayName,
      },
    });
  };

  return (
    <View style={styles.wrapper}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />
      <View style={styles.container}>
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

        <Text style={styles.headerTitle}>Search Player</Text>

        <View style={styles.headerButton} />
      </View>

      <View style={styles.content}>
        <Text style={styles.instructions}>
          Search for a player to view their scores across all courses
        </Text>

        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Enter player name..."
            placeholderTextColor="#999"
            value={playerSearch}
            onChangeText={handlePlayerSearchChange}
            autoFocus
          />
          {loadingPlayers && (
            <ActivityIndicator size="small" color="#0D5C3A" style={styles.searchSpinner} />
          )}
        </View>

        {selectedPlayer && (
          <View style={styles.selectedPlayerCard}>
            <View style={styles.selectedPlayerInfo}>
              <Text style={styles.selectedPlayerName}>{selectedPlayer.displayName}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={24} color="#FFD700" />
          </View>
        )}

        {initialLoad && loadingPlayers ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color="#0D5C3A" />
            <Text style={styles.loadingText}>Loading players...</Text>
          </View>
        ) : (
          <FlatList
            data={playerResults}
            keyExtractor={(item) => item.userId}
            style={styles.resultsList}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[
                  styles.playerItem,
                  selectedPlayer?.userId === item.userId && styles.playerItemSelected
                ]} 
                onPress={() => handleSelectPlayer(item)}
              >
                <Text style={styles.playerItemName}>{item.displayName}</Text>
                {selectedPlayer?.userId === item.userId && (
                  <Ionicons name="checkmark-circle" size={20} color="#0D5C3A" />
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              !initialLoad && playerSearch.length >= 1 && !loadingPlayers ? (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={48} color="#CCC" />
                  <Text style={styles.emptyText}>No players found</Text>
                  <Text style={styles.emptyHint}>Try a different name</Text>
                </View>
              ) : !initialLoad && playerSearch.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color="#CCC" />
                  <Text style={styles.emptyText}>Start typing to search</Text>
                  <Text style={styles.emptyHint}>{allPlayers.length} players available</Text>
                </View>
              ) : null
            }
          />
        )}
      </View>

      {selectedPlayer && (
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
            <Text style={styles.applyButtonText}>View Scores</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
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

  content: {
    flex: 1,
    padding: 16,
  },

  instructions: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
    textAlign: "center",
  },

  searchContainer: {
    position: "relative",
    marginBottom: 16,
  },

  searchInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#333",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },

  searchSpinner: {
    position: "absolute",
    right: 16,
    top: 16,
  },

  loadingState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },

  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },

  selectedPlayerCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    marginBottom: 16,
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
  },

  selectedPlayerInfo: {
    flex: 1,
  },

  selectedPlayerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  resultsList: {
    flex: 1,
  },

  playerItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
  },

  playerItemSelected: {
    borderColor: "#0D5C3A",
    backgroundColor: "rgba(13, 92, 58, 0.05)",
  },

  playerItemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },

  emptyState: {
    alignItems: "center",
    paddingTop: 40,
  },

  emptyText: {
    fontSize: 16,
    color: "#999",
    marginTop: 12,
    fontWeight: "600",
  },

  emptyHint: {
    fontSize: 13,
    color: "#BBB",
    marginTop: 4,
  },

  actionButtons: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },

  applyButton: {
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
    justifyContent: "center",
  },

  applyButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});