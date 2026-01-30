/**
 * Shared styles for League Settings components
 */

import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  // Container
  container: {
    flex: 1,
    backgroundColor: "#F4EED8",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
    backgroundColor: "#F4EED8",
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: -8,
  },
  headerCenter: {
    flex: 1,
    marginLeft: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0D5C3A",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: "rgba(13, 92, 58, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusActive: {
    backgroundColor: "rgba(13, 92, 58, 0.2)",
  },
  statusCompleted: {
    backgroundColor: "rgba(0, 0, 0, 0.1)",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  confirmButton: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  confirmButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "700",
  },
  readyBadge: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },

  // Tabs
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 14,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: "#0D5C3A",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#999",
  },
  tabTextActive: {
    color: "#0D5C3A",
  },
  tabBadge: {
    backgroundColor: "#FF6B6B",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  tabBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "700",
  },

  // Content
  tabContent: {
    flex: 1,
  },
  section: {
    marginTop: 20,
    marginHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0D5C3A",
  },
  sectionBadge: {
    backgroundColor: "#FF6B6B",
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  sectionBadgeText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  sectionNote: {
    fontSize: 13,
    color: "#999",
    marginTop: -8,
    marginBottom: 12,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(13, 92, 58, 0.1)",
    borderRadius: 16,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  // Request Card
  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E5E5E5",
  },
  requestInfo: {
    flex: 1,
    marginLeft: 12,
  },
  requestName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  requestMeta: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  requestDetail: {
    fontSize: 12,
    color: "#0D5C3A",
    marginTop: 4,
    fontStyle: "italic",
  },
  requestActions: {
    flexDirection: "row",
    gap: 8,
  },
  approveButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0D5C3A",
    justifyContent: "center",
    alignItems: "center",
  },
  rejectButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF6B6B",
    justifyContent: "center",
    alignItems: "center",
  },

  // Member Card
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  memberName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFF",
  },
  memberMeta: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },

  // Team Card
  teamCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    overflow: "hidden",
  },
  teamHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  teamAvatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#E5E5E5",
  },
  teamInfo: {
    flex: 1,
    marginLeft: 12,
  },
  teamNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  teamName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  myTeamBadge: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  myTeamBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFF",
  },
  freeChangeBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(13, 92, 58, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  teamMeta: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  expandButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  teamRoster: {
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noMembersText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    paddingVertical: 12,
  },
  rosterMember: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  rosterAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E5E5E5",
  },
  rosterName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginLeft: 10,
  },
  rosterRemove: {
    padding: 4,
  },
  teamMemberActions: {
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    paddingTop: 12,
    marginTop: 8,
    gap: 8,
  },
  requestEditButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(13, 92, 58, 0.08)",
    borderRadius: 8,
  },
  requestEditText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  // Unassigned Members
  unassignedCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  unassignedName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    marginLeft: 12,
  },
  assignButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(13, 92, 58, 0.1)",
    borderRadius: 12,
  },
  assignButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  // Empty State
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    marginTop: 12,
  },
  emptyButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#0D5C3A",
    borderRadius: 20,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFF",
  },
  emptyActionSheet: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyActionText: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
  },

  // Settings Row
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  settingRowDisabled: {
    opacity: 0.6,
  },
  settingRowContent: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 13,
    color: "#666",
    marginBottom: 2,
  },
  settingValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  settingValueMultiline: {
    fontSize: 14,
    lineHeight: 20,
  },

  // Danger Section
  dangerSection: {
    marginTop: 32,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 107, 107, 0.3)",
  },
  dangerTitle: {
    color: "#FF6B6B",
  },
  seasonButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#0D5C3A",
    padding: 16,
    borderRadius: 12,
  },
  seasonButtonContent: {
    flex: 1,
  },
  seasonButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },
  seasonButtonSubtext: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 2,
  },
  dangerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.3)",
  },
  dangerButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FF6B6B",
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 24,
    width: "85%",
    maxWidth: 340,
    alignItems: "center",
  },
  modalEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0D5C3A",
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
  },
  modalDate: {
    fontWeight: "700",
    color: "#333",
  },
  modalStats: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
    paddingHorizontal: 16,
  },
  modalStat: {
    alignItems: "center",
    flex: 1,
  },
  modalStatValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0D5C3A",
  },
  modalStatLabel: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  modalStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#E5E5E5",
  },
  modalPrimaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0D5C3A",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
    marginBottom: 12,
  },
  modalPrimaryText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#FFF",
  },
  modalSecondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(13, 92, 58, 0.1)",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
    marginBottom: 12,
  },
  modalSecondaryText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0D5C3A",
  },
  modalCancelButton: {
    paddingVertical: 12,
  },
  modalCancelText: {
    fontSize: 16,
    color: "#999",
    fontWeight: "600",
  },
  modalButtonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    width: "100%",
  },
  modalCancelButtonSmall: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#0D5C3A",
    alignItems: "center",
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFF",
  },

  // Action Sheet
  actionSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    maxHeight: "70%",
  },
  actionSheetHeader: {
    alignItems: "center",
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },
  actionSheetAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 8,
  },
  actionSheetName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  actionSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  actionSheetSubtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  actionItemSelected: {
    backgroundColor: "rgba(13, 92, 58, 0.05)",
  },
  actionItemDanger: {
    borderBottomWidth: 0,
  },
  actionItemText: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
  },
  actionItemTextDanger: {
    color: "#FF6B6B",
  },
  actionItemAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E5E5E5",
  },
  actionCancelButton: {
    alignItems: "center",
    paddingVertical: 16,
    marginTop: 8,
    marginHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#F0F0F0",
  },
  actionCancelText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#666",
  },

  // Request Detail Box
  requestDetailBox: {
    backgroundColor: "#F8F8F8",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 12,
  },
  requestDetailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginTop: 8,
  },
  requestDetailValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginTop: 2,
  },
  requestNewValue: {
    color: "#0D5C3A",
  },
  requestAvatarPreview: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginTop: 8,
  },

  // Inputs
  handicapInput: {
    width: "100%",
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: "#E5E5E5",
    borderRadius: 12,
    marginTop: 16,
  },
  textEditInput: {
    width: "100%",
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: "#E5E5E5",
    borderRadius: 12,
    marginTop: 16,
  },
  textEditInputMultiline: {
    height: 120,
    textAlignVertical: "top",
  },
  inputLabel: {
    alignSelf: "flex-start",
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginTop: 16,
  },

  // Date Picker
  datePickerContainer: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    overflow: "hidden",
    width: "90%",
    maxWidth: 400,
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },
  datePickerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#333",
  },
  datePickerCancel: {
    fontSize: 16,
    color: "#999",
    fontWeight: "600",
  },
  datePickerDone: {
    fontSize: 16,
    color: "#0D5C3A",
    fontWeight: "700",
  },

  // Info Box
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#F0EDE0",
    borderRadius: 10,
    padding: 12,
    gap: 10,
    marginTop: 8,
    marginHorizontal: 16,
  },
  infoBoxText: {
    flex: 1,
    fontSize: 13,
    color: "#666",
    lineHeight: 18,
  },

  // Time Picker Modal
  pickerModalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  pickerModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
  },
  pickerCancelText: {
    fontSize: 16,
    color: "#999",
  },
  pickerDoneText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0D5C3A",
  },
  clearTimeBtn: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 8,
  },
  clearTimeText: {
    fontSize: 15,
    color: "#F44336",
    fontWeight: "500",
  },
});