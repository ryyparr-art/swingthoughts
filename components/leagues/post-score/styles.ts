/**
 * Styles for League Post Score components
 */

import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F0",
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  headerRight: {
    width: 70,
  },
  submitButton: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },

  // Course Selector
  courseSelector: {
    padding: 16,
  },
  courseSelectorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 16,
  },
  courseSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 12,
  },
  courseOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  courseOptionLeft: {
    flex: 1,
  },
  courseOptionName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  courseOptionLocation: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
  },
  courseOptionDistance: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
    marginLeft: 12,
  },

  // Search
  searchContainer: {
    flexDirection: "row",
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    fontSize: 16,
    marginRight: 8,
  },
  searchButton: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  searchResultsContainer: {
    marginBottom: 16,
  },
  searchCourseButton: {
    flexDirection: "row",
    backgroundColor: "#0D5C3A",
    padding: 16,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  searchCourseButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
  backToRecentButton: {
    padding: 16,
    alignItems: "center",
  },
  backToRecentText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  // Tee Selector
  teeSelector: {
    padding: 16,
  },
  teeSelectorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 4,
  },
  teeSelectorSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },
  teeOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  teeOptionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  teeColorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  teeOptionName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  teeOptionDetails: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  teeOptionRight: {
    alignItems: "flex-end",
  },
  teeOptionRating: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  teeOptionRatingLabel: {
    fontSize: 11,
    color: "#999",
  },
  handicapInfo: {
    backgroundColor: "#E8F5E9",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  handicapInfoText: {
    fontSize: 14,
    color: "#0D5C3A",
    fontWeight: "600",
    textAlign: "center",
  },

  // Scorecard Header
  scorecardHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D5C3A",
    padding: 16,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  scorecardLogo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFF",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  scorecardLogoImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  logoText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  scorecardInfo: {
    marginLeft: 16,
    flex: 1,
  },
  leagueName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFF",
  },
  courseName: {
    fontSize: 14,
    color: "#C8E6C9",
    marginTop: 2,
  },
  teeInfo: {
    fontSize: 13,
    color: "#A5D6A7",
    marginTop: 2,
  },
  weekText: {
    fontSize: 12,
    color: "#A5D6A7",
    marginTop: 2,
  },

  // Player Info
  playerInfo: {
    backgroundColor: "#FFF",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  playerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  playerLabel: {
    fontSize: 13,
    color: "#666",
  },
  playerValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  playerValueMuted: {
    fontSize: 13,
    fontWeight: "500",
    fontStyle: "italic",
    color: "#999",
  },

  // Tab Toggle (Front 9 / Back 9)
  tabContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    marginTop: 2,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#F0F0F0",
    marginRight: 8,
  },
  tabActive: {
    backgroundColor: "#0D5C3A",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  tabTextActive: {
    color: "#FFF",
  },
  tabBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginLeft: 6,
  },
  tabBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFF",
  },
  tabTotalPill: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: "auto",
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tabTotalLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0D5C3A",
    marginRight: 4,
  },
  tabTotalValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  // Nine Section
  nineSection: {
    backgroundColor: "#FFF",
    marginTop: 2,
  },

  // Scorecard Table
  scorecardTable: {
    flexDirection: "column",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },

  // Label cell (row header)
  labelCell: {
    width: 50,
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  labelText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#666",
  },
  infoButton: {
    marginLeft: 2,
    padding: 1,
  },

  holeCell: {
    width: 36,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D5C3A",
  },
  holeNumber: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },
  dataCell: {
    width: 36,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  yardageText: {
    fontSize: 11,
    color: "#666",
  },
  parText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  scoreCell: {
    width: 36,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreInput: {
    width: 30,
    height: 30,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    backgroundColor: "#FFFDE7",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  totalCell: {
    width: 44,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F5E9",
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  totalValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
  totalScore: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  grandTotalCell: {
    width: 48,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C8E6C9",
  },
  grandTotalScore: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  // Stroke Index Row
  strokeIndexRow: {
    backgroundColor: "#F0F4F0",
  },
  strokeIndexCell: {
    width: 36,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F4F0",
  },
  strokeIndexText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#888",
  },

  // Adjusted Score Row
  adjScoreRow: {
    backgroundColor: "#F5FBF5",
  },
  adjScoreCell: {
    width: 36,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5FBF5",
  },
  adjScoreValueWrap: {
    alignItems: "center",
  },
  adjScoreValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  adjScorePlaceholder: {
    fontSize: 13,
    color: "#CCC",
  },
  strokeDots: {
    flexDirection: "row",
    marginTop: 1,
    gap: 2,
  },
  strokeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#0D5C3A",
  },
  adjTotalScore: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  adjGrandTotalScore: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  // Stat Rows (FIR / GIR / PNL)
  statRow: {
    backgroundColor: "#FAFAFA",
  },
  lastStatRow: {
    borderBottomWidth: 0,
  },
  statCell: {
    width: 36,
    paddingVertical: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  statCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#CCC",
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  statCheckboxChecked: {
    backgroundColor: "#0D5C3A",
    borderColor: "#0D5C3A",
  },
  statCheckboxUnchecked: {
    backgroundColor: "#FFF",
    borderColor: "#D32F2F",
  },
  statDash: {
    fontSize: 12,
    color: "#CCC",
  },
  statTotal: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },
  pnlInput: {
    width: 24,
    height: 22,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    backgroundColor: "#FFF",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#DDD",
    color: "#D32F2F",
    padding: 0,
  },

  // Score Styles
  scoreEagle: {
    backgroundColor: "#FFF9C4",
    borderColor: "#FFD700",
    borderWidth: 2,
    borderRadius: 15,
  },
  scoreBirdie: {
    borderColor: "#E53935",
    borderWidth: 2,
    borderRadius: 15,
  },
  scoreBogey: {
    borderColor: "#333",
    borderWidth: 2,
    borderRadius: 2,
  },
  scoreDouble: {
    borderColor: "#333",
    borderWidth: 3,
    borderRadius: 2,
  },

  // Total Summary (9 hole)
  totalSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#C8E6C9",
    padding: 16,
  },
  totalSummaryLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  totalSummaryValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  // Summary
  summary: {
    backgroundColor: "#FFF",
    padding: 16,
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  summaryRowNet: {
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    marginTop: 8,
    paddingTop: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#666",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  summaryLabelNet: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  summaryValueNet: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  summaryValueMuted: {
    fontSize: 14,
    fontWeight: "500",
    fontStyle: "italic",
    color: "#999",
  },

  // Stats Summary
  statsSummary: {
    backgroundColor: "#FFF",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  statsSummaryTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statsItem: {
    alignItems: "center",
    minWidth: 80,
  },
  statsItemValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  statsItemPenalty: {
    color: "#D32F2F",
  },
  statsItemLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  statsItemPercent: {
    fontSize: 11,
    fontWeight: "600",
    color: "#999",
    marginTop: 1,
  },

  // Summary bottom radius (for the last section)
  summaryBottom: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },

  // Legend
  legend: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 16,
    padding: 12,
    backgroundColor: "#FFF",
    borderRadius: 12,
  },
  legendItem: {
    alignItems: "center",
  },
  legendSample: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 4,
    marginBottom: 4,
  },
  legendSampleText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#333",
  },
  legendStrokeDot: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  legendText: {
    fontSize: 10,
    color: "#666",
  },

  // Info Modal
  infoModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  infoModalContent: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 340,
  },
  infoModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  infoModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  infoModalDescription: {
    fontSize: 15,
    color: "#555",
    lineHeight: 22,
  },

  // No Course
  noCourseText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginBottom: 16,
  },

  bottomSpacer: {
    height: 40,
  },
});