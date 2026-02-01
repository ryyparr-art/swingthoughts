/**
 * League Creation - Shared Styles
 * 
 * Improved color contrast for better readability
 */

import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  // Layout
  container: { flex: 1, backgroundColor: "#F4EED8" },
  centered: { justifyContent: "center", alignItems: "center" },
  stepContent: { paddingTop: 8 },

  // Input Groups
  inputGroup: { marginBottom: 24 },
  label: { fontSize: 16, fontWeight: "600", color: "#333", marginBottom: 8 },
  required: { color: "#DC2626" },
  optionalTag: { fontSize: 13, fontWeight: "400", color: "#999" },
  
  // Text Inputs
  inputWrapper: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#FFF", 
    borderRadius: 12, 
    borderWidth: 2, 
    borderColor: "#D4D4D4", 
    paddingHorizontal: 16 
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: "#1a1a1a" },
  textArea: { 
    backgroundColor: "#FFF", 
    borderRadius: 12, 
    borderWidth: 2, 
    borderColor: "#D4D4D4", 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    minHeight: 100,
    fontSize: 16,
    color: "#1a1a1a",
  },
  helperText: { fontSize: 13, color: "#666", marginTop: 6 },
  errorText: { fontSize: 13, color: "#DC2626", marginTop: 4 },

  // Display Fields (read-only)
  displayField: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#E8E4D4", 
    borderRadius: 12, 
    paddingHorizontal: 16, 
    paddingVertical: 14, 
    gap: 12 
  },
  displayText: { fontSize: 16, color: "#333", fontWeight: "500" },

  // Option Buttons (two-choice)
  optionRow: { flexDirection: "row", gap: 12 },
  optionButton: { 
    flex: 1, 
    backgroundColor: "#FFF", 
    borderRadius: 12, 
    borderWidth: 2, 
    borderColor: "#D4D4D4", 
    paddingVertical: 16, 
    alignItems: "center", 
    gap: 8 
  },
  optionSelected: { borderColor: "#0D5C3A", backgroundColor: "#E8F5E9" },
  optionEmoji: { fontSize: 28 },
  optionText: { fontSize: 15, fontWeight: "600", color: "#555" },
  optionTextSelected: { color: "#0D5C3A" },
  optionNumber: { fontSize: 32, fontWeight: "700", color: "#555" },
  optionNumberSelected: { color: "#0D5C3A" },

  // Chips (multi-select)
  chipContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { 
    backgroundColor: "#FFF", 
    borderRadius: 20, 
    borderWidth: 2, 
    borderColor: "#D4D4D4", 
    paddingHorizontal: 16, 
    paddingVertical: 8 
  },
  chipSelected: { borderColor: "#0D5C3A", backgroundColor: "#E8F5E9" },
  chipText: { fontSize: 14, fontWeight: "600", color: "#555" },
  chipTextSelected: { color: "#0D5C3A" },

  // Info Cards
  infoCard: { 
    flexDirection: "row", 
    alignItems: "flex-start", 
    backgroundColor: "#E8F5E9", 
    borderRadius: 12, 
    padding: 16, 
    marginTop: 12, 
    gap: 12 
  },
  infoText: { flex: 1, fontSize: 14, color: "#0D5C3A", lineHeight: 20 },
  infoCardLarge: { 
    backgroundColor: "#E8F5E9", 
    borderRadius: 16, 
    padding: 24, 
    alignItems: "center", 
    marginTop: 16 
  },
  infoCardTitle: { fontSize: 18, fontWeight: "700", color: "#0D5C3A", marginTop: 12, marginBottom: 8 },
  infoCardDesc: { fontSize: 15, color: "#444", textAlign: "center", lineHeight: 22 },
  infoBox: { 
    flexDirection: "row", 
    alignItems: "flex-start", 
    backgroundColor: "#E8E4D4", 
    borderRadius: 10, 
    padding: 12, 
    gap: 10, 
    marginTop: 8 
  },
  infoBoxText: { flex: 1, fontSize: 13, color: "#555", lineHeight: 18 },

  // Picker Buttons (date, time, etc.)
  pickerButton: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#FFF", 
    borderRadius: 12, 
    borderWidth: 2, 
    borderColor: "#D4D4D4", 
    paddingHorizontal: 16, 
    paddingVertical: 14, 
    gap: 12 
  },
  pickerText: { flex: 1, fontSize: 16, color: "#777" },
  pickerTextFilled: { color: "#1a1a1a", fontWeight: "500" },
  datePickerDone: { alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 16, marginTop: 8 },
  datePickerDoneText: { fontSize: 16, fontWeight: "600", color: "#0D5C3A" },

  // iOS Date Picker Container (improved contrast)
  datePickerContainer: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    marginTop: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#D4D4D4",
  },

  // Course Selection
  selectedCourse: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    backgroundColor: "#E8F5E9", 
    borderRadius: 10, 
    paddingHorizontal: 14, 
    paddingVertical: 12, 
    marginBottom: 8, 
    borderWidth: 1, 
    borderColor: "#0D5C3A" 
  },
  selectedCourseText: { flex: 1, fontSize: 15, color: "#1a1a1a", marginRight: 12 },
  addCourseButton: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "center", 
    backgroundColor: "#FFF", 
    borderRadius: 12, 
    borderWidth: 2, 
    borderColor: "#0D5C3A", 
    borderStyle: "dashed", 
    paddingVertical: 14, 
    gap: 8 
  },
  addCourseText: { fontSize: 15, fontWeight: "600", color: "#0D5C3A" },

  // Radio Options
  radioOption: { 
    flexDirection: "row", 
    alignItems: "flex-start", 
    backgroundColor: "#FFF", 
    borderRadius: 12, 
    borderWidth: 2, 
    borderColor: "#D4D4D4", 
    padding: 16, 
    marginBottom: 12, 
    gap: 12 
  },
  radioSelected: { borderColor: "#0D5C3A", backgroundColor: "#E8F5E9" },
  radioCircle: { 
    width: 24, 
    height: 24, 
    borderRadius: 12, 
    borderWidth: 2, 
    borderColor: "#AAA", 
    alignItems: "center", 
    justifyContent: "center", 
    marginTop: 2 
  },
  radioCircleSelected: { borderColor: "#0D5C3A" },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#0D5C3A" },
  radioContent: { flex: 1 },
  radioTitle: { fontSize: 16, fontWeight: "600", color: "#1a1a1a", marginBottom: 4 },
  radioDesc: { fontSize: 14, color: "#555", lineHeight: 20 },

  // Stepper (number input)
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24 },
  stepperBtn: { 
    width: 48, 
    height: 48, 
    backgroundColor: "#FFF", 
    borderRadius: 24, 
    borderWidth: 2, 
    borderColor: "#D4D4D4", 
    alignItems: "center", 
    justifyContent: "center" 
  },
  stepperValue: { fontSize: 32, fontWeight: "700", color: "#0D5C3A", minWidth: 80, textAlign: "center" },
  stepperUnit: { fontSize: 16, fontWeight: "500", color: "#666" },

  // Week Chips (elevated events)
  weeksScroll: { marginTop: 8 },
  weeksRow: { flexDirection: "row", gap: 8, paddingRight: 24 },
  weekChip: { 
    width: 44, 
    height: 44, 
    backgroundColor: "#FFF", 
    borderRadius: 22, 
    borderWidth: 2, 
    borderColor: "#D4D4D4", 
    alignItems: "center", 
    justifyContent: "center" 
  },
  weekChipSelected: { borderColor: "#0D5C3A", backgroundColor: "#0D5C3A" },
  weekChipText: { fontSize: 16, fontWeight: "600", color: "#555" },
  weekChipTextSelected: { color: "#FFF" },

  // Review Screen
  reviewHeader: { backgroundColor: "#0D5C3A", borderRadius: 16, padding: 20, marginBottom: 20 },
  reviewName: { fontSize: 24, fontWeight: "700", color: "#FFF", marginBottom: 8 },
  reviewDesc: { fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 22 },
  reviewSection: { backgroundColor: "#FFF", borderRadius: 12, padding: 16, marginBottom: 12 },
  reviewSectionTitle: { fontSize: 12, fontWeight: "600", color: "#888", letterSpacing: 0.5, marginBottom: 12 },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  reviewLabel: { fontSize: 15, color: "#555" },
  reviewValue: { fontSize: 15, fontWeight: "600", color: "#1a1a1a", textAlign: "right", flex: 1, marginLeft: 16 },

  // Divider
  divider: { height: 1, backgroundColor: "#D4D4D4", marginVertical: 20 },

  // Purse Input
  purseInputRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  currencyPrefix: { 
    backgroundColor: "#E8E4D4", 
    paddingHorizontal: 16, 
    paddingVertical: 14, 
    borderRadius: 12, 
    borderWidth: 2, 
    borderColor: "#D4D4D4" 
  },
  currencyText: { fontSize: 16, fontWeight: "600", color: "#333" },
  purseInput: { 
    flex: 1, 
    backgroundColor: "#FFF", 
    borderRadius: 12, 
    borderWidth: 2, 
    borderColor: "#D4D4D4", 
    paddingHorizontal: 16, 
    paddingVertical: 14, 
    fontSize: 18, 
    fontWeight: "600", 
    color: "#1a1a1a" 
  },

  // Course Picker Modal
  modalContainer: { flex: 1, backgroundColor: "#F4EED8" },
  modalHeader: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    paddingHorizontal: 16, 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: "#D4D4D4", 
    backgroundColor: "#FFF" 
  },
  modalCloseBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#0D5C3A" },
  modalSearchContainer: { padding: 16, backgroundColor: "#FFF" },
  modalSearchWrapper: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#F0F0F0", 
    borderRadius: 12, 
    paddingHorizontal: 14, 
    gap: 10 
  },
  modalSearchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: "#1a1a1a" },
  modalLoading: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  modalLoadingText: { fontSize: 16, color: "#555" },
  modalEmpty: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, paddingHorizontal: 40 },
  modalEmptyText: { fontSize: 16, color: "#888", textAlign: "center" },
  modalList: { padding: 16 },
  courseResultItem: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#FFF", 
    borderRadius: 12, 
    padding: 14, 
    marginBottom: 8 
  },
  courseResultItemSelected: { backgroundColor: "#E8F5E9", borderWidth: 1, borderColor: "#0D5C3A" },
  courseResultInfo: { flex: 1, marginRight: 12 },
  courseResultName: { fontSize: 16, fontWeight: "600", color: "#1a1a1a", marginBottom: 2 },
  courseResultLocation: { fontSize: 14, color: "#555" },
  modalFooter: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    paddingHorizontal: 16, 
    paddingTop: 12, 
    borderTopWidth: 1, 
    borderTopColor: "#D4D4D4", 
    backgroundColor: "#FFF" 
  },
  modalFooterText: { fontSize: 15, color: "#555" },
  modalDoneBtn: { backgroundColor: "#0D5C3A", borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10 },
  modalDoneBtnText: { fontSize: 16, fontWeight: "600", color: "#FFF" },
});