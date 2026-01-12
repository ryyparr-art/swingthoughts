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

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <SafeAreaView edges={["top"]} style={styles.safeTop} />

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            soundPlayer.play("click");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Image
            source={require("@/assets/icons/Back.png")}
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lastUpdated}>Effective Date: January 2026</Text>

        <Text style={styles.paragraph}>
          Swing Thoughts (“we”, “our”, or “us”) respects your privacy. This Privacy
          Policy explains how we collect, use, store, and protect your information
          when you use the Swing Thoughts mobile application and related services.
        </Text>

        <Text style={styles.sectionTitle}>1. Information We Collect</Text>
        <Text style={styles.paragraph}>
          The information we collect depends on how you use Swing Thoughts. We may
          collect the following:
        </Text>
        <Text style={styles.bulletPoint}>
          • Account information (email address, display name, profile photo)
        </Text>
        <Text style={styles.bulletPoint}>
          • User-generated content (posts, swing thoughts, scores, comments)
        </Text>
        <Text style={styles.bulletPoint}>
          • Approximate location information (used for regional features, if enabled)
        </Text>
        <Text style={styles.bulletPoint}>
          • Device and app usage information (interactions, crash logs)
        </Text>

        <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
        <Text style={styles.paragraph}>
          We use the information we collect to:
        </Text>
        <Text style={styles.bulletPoint}>
          • Provide, operate, and improve app features
        </Text>
        <Text style={styles.bulletPoint}>
          • Personalize content such as feeds and leaderboards
        </Text>
        <Text style={styles.bulletPoint}>
          • Maintain security and prevent fraud or abuse
        </Text>
        <Text style={styles.bulletPoint}>
          • Monitor performance and fix technical issues
        </Text>
        <Text style={styles.bulletPoint}>
          • Communicate important updates or support responses
        </Text>

        <Text style={styles.sectionTitle}>3. Data Sharing</Text>
        <Text style={styles.paragraph}>
          We do not sell your personal data. We may share information with trusted
          service providers who help operate the app, including Firebase (Google)
          for authentication, database storage, analytics, and crash reporting.
          These providers process data only on our behalf.
        </Text>

        <Text style={styles.sectionTitle}>4. Location Information</Text>
        <Text style={styles.paragraph}>
          Location access is optional. If enabled, approximate location data may be
          used to support regional features such as nearby content or leaderboards.
          You can disable location permissions at any time through your device
          settings.
        </Text>

        <Text style={styles.sectionTitle}>5. Data Retention</Text>
        <Text style={styles.paragraph}>
          We retain personal information only for as long as necessary to provide
          the Service, comply with legal obligations, resolve disputes, and enforce
          our policies. You may request deletion of your account and associated
          data at any time through the app.
        </Text>

        <Text style={styles.sectionTitle}>6. Your Rights and Choices</Text>
        <Text style={styles.paragraph}>
          You may update or correct your profile information within the app,
          control permissions such as location through your device settings, and
          request account deletion. Depending on your location, you may have
          additional privacy rights under applicable laws.
        </Text>

        <Text style={styles.sectionTitle}>7. Children’s Privacy</Text>
        <Text style={styles.paragraph}>
          Swing Thoughts is not intended for children under the age of 13. We do
          not knowingly collect personal information from children.
        </Text>

        <Text style={styles.sectionTitle}>8. Changes to This Policy</Text>
        <Text style={styles.paragraph}>
          We may update this Privacy Policy from time to time. If material changes
          are made, we will notify users through the app or other appropriate
          means.
        </Text>

        <Text style={styles.sectionTitle}>9. Contact Us</Text>
        <Text style={styles.paragraph}>
          If you have questions about this Privacy Policy, please contact us at:
          {"\n"}
          support@swingthoughts.app
        </Text>
      </ScrollView>
    </View>
  );
}

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

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  lastUpdated: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    marginBottom: 20,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
    marginTop: 20,
    marginBottom: 8,
  },

  paragraph: {
    fontSize: 15,
    lineHeight: 24,
    color: "#333",
    marginBottom: 12,
  },

  bulletPoint: {
    fontSize: 15,
    lineHeight: 24,
    color: "#333",
    marginLeft: 8,
    marginBottom: 4,
  },
});
