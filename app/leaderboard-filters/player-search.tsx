import { db } from "@/constants/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { collection, getDocs } from "firebase/firestore";
import React, { useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
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
  const [playerResults, setPlayerResults] = useState<Player[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const searchPlayers = async (query: string) => {
    try {
      setLoadingPlayers(true);

      const usersRef = collection(db, "users");
      const snapshot = await getDocs(usersRef);

      const players: Player[] = [];
      const searchLower = query.toLowerCase();

      snapshot.forEach((doc) => {
        const data = doc.data();
        const displayName = data.displayName || "";
        
        if (displayName.toLowerCase().includes(searchLower)) {
          players.push({
            userId: doc.id,
            displayName: displayName,
            avatar: data.avatar || null,
          });
        }
      });

      setPlayerResults(players);
      setLoadingPlayers(false);
    } catch (err) {
      console.error("Player search error:", err);
      setLoadingPlayers(false);
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
        setLoadingPlayers(false);
        return;
      }

      if (query.length >= 2) {
        searchPlayers(query);
      }
    }, 300);
  };

  const handleSelectPlayer = (player: Player) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlayer(player);
  };

  const handleApply = () => {
    if (!selectedPlayer) return;
    
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
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Search Player</Text>

        <View style={styles.headerButton} />
      </View>

      <View style={styles.content}>
        <Text style={styles.instructions}>
          Enter a player name to filter leaderboard scores
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
            playerSearch.length >= 2 && !loadingPlayers ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={48} color="#CCC" />
                <Text style={styles.emptyText}>No players found</Text>
              </View>
            ) : null
          }
        />
      </View>

      {selectedPlayer && (
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
            <Text style={styles.applyButtonText}>Apply Filter</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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