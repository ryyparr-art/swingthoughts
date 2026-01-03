import { soundPlayer } from "@/utils/soundPlayer";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function EtiquetteScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => {
            soundPlayer.play('click');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Image
            source={require("@/assets/icons/Back.png")}
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Community Etiquette</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.titleSection}>
          <Text style={styles.pageTitle}>
            Swing Thoughts Community Etiquette
          </Text>
          <Text style={styles.subtitle}>
            Our commitment to maintaining a respectful and supportive community for all golfers.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            1. Respect the Course — Respect the Community
          </Text>
          <Text style={styles.sectionText}>
            Treat everyone as you would on the first tee.{"\n"}
            • Be courteous, supportive, and respectful.{"\n"}
            • No harassment, bullying, or abusive behavior.{"\n"}
            • Celebrate others' progress and stories.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Play at a Good Pace</Text>
          <Text style={styles.sectionText}>
            • Avoid spamming or disruptive posting.{"\n"}
            • Engage thoughtfully with others.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Mind Your Surroundings</Text>
          <Text style={styles.sectionText}>
            • Do not share private information.{"\n"}
            • Only post content you own.{"\n"}
            • Keep content appropriate for all.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            4. Honor the Integrity of the Game
          </Text>
          <Text style={styles.sectionText}>
            • Share genuine swings & stories.{"\n"}
            • No impersonation or fraud.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Maintain a Clean Scorecard</Text>
          <Text style={styles.sectionText}>
            • No hate speech or explicit content.{"\n"}
            • No harmful or illegal activity.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            6. Play Ready Golf — But Safely
          </Text>
          <Text style={styles.sectionText}>
            • Report inappropriate behavior.{"\n"}
            • Prioritize safety online.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            7. Leave the Course Better Than You Found It
          </Text>
          <Text style={styles.sectionText}>
            • Encourage and uplift others.{"\n"}
            • Support a respectful community.
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Last Updated: January 1, 2025
          </Text>
          <Text style={styles.footerText}>
            Questions? Contact us at community@swingthoughts.com
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* ==================== STYLES ==================== */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },

  safeTop: {
    backgroundColor: "#0D5C3A",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#0D5C3A",
  },

  backIcon: {
    width: 24,
    height: 24,
    tintColor: "#FFF",
  },

  headerTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },

  headerSpacer: {
    width: 24,
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  titleSection: {
    marginBottom: 24,
  },

  pageTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 15,
    color: "#666",
    lineHeight: 22,
  },

  section: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 8,
  },

  sectionText: {
    fontSize: 15,
    color: "#333",
    lineHeight: 22,
  },

  footer: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    alignItems: "center",
  },

  footerText: {
    fontSize: 13,
    color: "#666",
    marginBottom: 4,
  },
});