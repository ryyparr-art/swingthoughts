/**
 * Settings - Shared Styles
 * 
 * Common styles used across all settings section components and modals.
 */

import { StyleSheet } from "react-native";

export const settingsStyles = StyleSheet.create({
  /* SECTION TITLES */
  sectionTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#0D5C3A",
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 12,
  },

  /* SETTING ROWS */
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },

  disabledSetting: {
    backgroundColor: "#F5F5F5",
    opacity: 0.6,
  },

  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },

  settingLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },

  settingLabelDisabled: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
  },

  settingSubtext: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },

  settingHelperText: {
    fontSize: 12,
    color: "#666",
    marginLeft: 48,
    marginTop: -4,
    marginBottom: 8,
    fontStyle: "italic",
  },

  /* TOGGLE */
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#F0F0F0",
    borderRadius: 8,
    padding: 2,
  },

  toggleOption: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },

  toggleOptionActive: {
    backgroundColor: "#0D5C3A",
  },

  toggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },

  toggleTextActive: {
    color: "#FFF",
  },

  /* ACTION BUTTONS */
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },

  actionButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    marginLeft: 12,
  },

  dangerButton: {
    borderWidth: 1,
    borderColor: "#FF3B30",
  },

  dangerButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#FF3B30",
    marginLeft: 12,
  },

  /* MODAL SHARED */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },

  modalContainer: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E5",
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
  },

  modalClose: {
    padding: 4,
  },

  closeIcon: {
    width: 24,
    height: 24,
    tintColor: "#666",
  },

  modalContent: {
    padding: 20,
  },

  modalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
    marginBottom: 8,
    marginTop: 12,
  },

  modalInput: {
    backgroundColor: "#F7F8FA",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#E5E5E5",
    marginBottom: 8,
  },

  modalSubmitButton: {
    backgroundColor: "#0D5C3A",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
  },

  modalSubmitButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },

  /* COMING SOON */
  comingSoonBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
    backgroundColor: "#E5E5E5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
});