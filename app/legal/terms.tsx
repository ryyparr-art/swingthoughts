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

export default function TermsOfServiceScreen() {
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
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lastUpdated}>Effective Date: January 2026</Text>

        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.paragraph}>
          By accessing or using Swing Thoughts, you agree to be bound by these
          Terms of Service (“Terms”). If you do not agree to these Terms, you may
          not access or use the app.
        </Text>

        <Text style={styles.sectionTitle}>2. The Service</Text>
        <Text style={styles.paragraph}>
          Swing Thoughts is a golf-focused community platform that allows users
          to share swing thoughts, posts, scores, and interact with other golfers.
          We may update, modify, or discontinue features of the app at any time.
        </Text>

        <Text style={styles.sectionTitle}>3. Eligibility and Accounts</Text>
        <Text style={styles.paragraph}>
          You must be at least 13 years old to use Swing Thoughts. You agree to
          provide accurate information and to keep your account credentials
          secure. You are responsible for all activity that occurs under your
          account.
        </Text>

        <Text style={styles.sectionTitle}>4. User Content</Text>
        <Text style={styles.paragraph}>
          You retain ownership of the content you post on Swing Thoughts,
          including posts, scores, comments, and profile information. By posting
          content, you grant Swing Thoughts a non-exclusive, royalty-free,
          worldwide license to host, display, and distribute your content solely
          for the purpose of operating and improving the app.
        </Text>

        <Text style={styles.sectionTitle}>5. Content and Conduct Rules</Text>
        <Text style={styles.paragraph}>
          You agree not to post or share content that is unlawful, misleading,
          fraudulent, abusive, harassing, discriminatory, infringing, or
          otherwise harmful. We may remove content or restrict accounts that
          violate these rules.
        </Text>

        <Text style={styles.sectionTitle}>
          6. No Selling, Advertising, or Promotion Without Consent
        </Text>
        <Text style={styles.paragraph}>
          Swing Thoughts is not a marketplace. Unless you receive explicit
          written consent from Swing Thoughts, you may not advertise, promote,
          sell, or solicit products or services through the app. This includes,
          but is not limited to, affiliate links, referral codes, sponsorships,
          business promotions, or paid offerings. We reserve the right to remove
          such content and suspend or terminate accounts that violate this
          section.
        </Text>

        <Text style={styles.sectionTitle}>7. Prohibited Use</Text>
        <Text style={styles.paragraph}>
          You may not use the app for unauthorized commercial activity, attempt
          to access systems or data without permission, scrape or collect user
          data, interfere with app functionality, or attempt to reverse engineer
          the Service.
        </Text>

        <Text style={styles.sectionTitle}>8. Termination</Text>
        <Text style={styles.paragraph}>
          We may suspend or terminate your account at any time if you violate
          these Terms or use the app in a way that poses risk to the platform,
          other users, or Swing Thoughts.
        </Text>

        <Text style={styles.sectionTitle}>9. Disclaimers</Text>
        <Text style={styles.paragraph}>
          The app is provided on an “AS IS” and “AS AVAILABLE” basis. We make no
          warranties of any kind, express or implied, including warranties of
          merchantability, fitness for a particular purpose, or non-infringement.
        </Text>

        <Text style={styles.sectionTitle}>10. Limitation of Liability</Text>
        <Text style={styles.paragraph}>
          To the fullest extent permitted by law, Swing Thoughts shall not be
          liable for any indirect, incidental, special, consequential, or
          punitive damages arising from your use of the app. Our total liability
          shall not exceed $100 USD or the amount you paid us in the past 12
          months, whichever is greater.
        </Text>

        <Text style={styles.sectionTitle}>11. Changes to Terms</Text>
        <Text style={styles.paragraph}>
          We may update these Terms from time to time. If material changes are
          made, we will notify users through the app or other reasonable means.
          Continued use of the app constitutes acceptance of the updated Terms.
        </Text>

        <Text style={styles.sectionTitle}>12. Contact Us</Text>
        <Text style={styles.paragraph}>
          If you have questions about these Terms, please contact us at:
          {"\n"}
          salesswingthoughts@gmail.com
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
    marginBottom: 16,
  },
});
