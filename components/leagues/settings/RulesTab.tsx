/**
 * Rules Tab Component
 * 
 * Displays league info and custom rules using LeagueInfoCard.
 * Commissioners can edit custom rules.
 * Uses KeyboardAwareScrollView for proper keyboard handling when editing.
 */

import React from "react";
import {
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

import LeagueInfoCard from "./LeagueInfoCard";
import { League } from "./types";

interface RulesTabProps {
  league: League;
  isCommissioner: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onSaveRules: (rules: string) => Promise<void>;
}

export default function RulesTab({
  league,
  isCommissioner,
  refreshing,
  onRefresh,
  onSaveRules,
}: RulesTabProps) {
  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#0D5C3A"
        />
      }
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      enableAutomaticScroll={true}
      extraScrollHeight={120}
    >
      <LeagueInfoCard
        league={league}
        editable={isCommissioner}
        onSaveRules={onSaveRules}
        showHeader={true}
      />
      
      <View style={styles.bottomSpacer} />
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F0",
  },
  content: {
    padding: 16,
  },
  bottomSpacer: {
    height: 100,
  },
});