/**
 * EquipmentSection
 * 
 * Expanded club editing with:
 * - Woods: Driver (always) + optional fairway woods (3W, 5W, 7W, 9W)
 * - Irons: Set picker (4-AW, 4-PW, 5-AW, 5-PW, Mixed Bag) + individual irons
 * - Wedges: Up to 4 with loft picker + name
 * - Putter & Ball: simple text fields
 */

import { soundPlayer } from "@/utils/soundPlayer";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import {
    ClubsData,
    IRON_SET_OPTIONS,
    MAX_WEDGES,
    MIXED_IRON_OPTIONS,
    WEDGE_LOFT_OPTIONS,
    WOOD_OPTIONS
} from "./types";

/* ================================================================ */
/* PROPS                                                            */
/* ================================================================ */

interface EquipmentSectionProps {
  clubs: ClubsData;
  onUpdate: (clubs: ClubsData) => void;
}

/* ================================================================ */
/* COMPONENT                                                        */
/* ================================================================ */

export default function EquipmentSection({ clubs, onUpdate }: EquipmentSectionProps) {
  const [showWoodPicker, setShowWoodPicker] = useState(false);
  const [showLoftPicker, setShowLoftPicker] = useState<number | null>(null); // index of wedge being edited

  /* ---------------------------------------------------------------- */
  /* HELPERS                                                          */
  /* ---------------------------------------------------------------- */

  const update = (partial: Partial<ClubsData>) => {
    onUpdate({ ...clubs, ...partial });
  };

  const handleClear = (field: "driver" | "putter" | "ball") => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    update({ [field]: "" });
  };

  /* ---------------------------------------------------------------- */
  /* WOODS                                                            */
  /* ---------------------------------------------------------------- */

  const activeWoods = WOOD_OPTIONS.filter((w) => w in clubs.woods);
  const availableWoods = WOOD_OPTIONS.filter((w) => !(w in clubs.woods));

  const addWood = (wood: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newWoods = { ...clubs.woods, [wood]: "" };
    update({ woods: newWoods });
    setShowWoodPicker(false);
  };

  const removeWood = (wood: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newWoods = { ...clubs.woods };
    delete newWoods[wood];
    update({ woods: newWoods });
  };

  const updateWood = (wood: string, name: string) => {
    update({ woods: { ...clubs.woods, [wood]: name } });
  };

  /* ---------------------------------------------------------------- */
  /* IRONS                                                            */
  /* ---------------------------------------------------------------- */

  const selectIronRange = (range: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (range === clubs.ironSet?.range) {
      // Deselect
      update({ ironSet: null, individualIrons: [] });
    } else if (range === "mixed") {
      update({
        ironSet: { range: "mixed", name: "" },
        individualIrons: [],
      });
    } else {
      update({
        ironSet: { range, name: clubs.ironSet?.name || "" },
        individualIrons: clubs.individualIrons,
      });
    }
  };

  const updateIronSetName = (name: string) => {
    if (!clubs.ironSet) return;
    update({ ironSet: { ...clubs.ironSet, name } });
  };

  const toggleMixedIron = (ironNumber: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const exists = clubs.individualIrons.find((i) => i.number === ironNumber);
    if (exists) {
      update({
        individualIrons: clubs.individualIrons.filter((i) => i.number !== ironNumber),
      });
    } else {
      update({
        individualIrons: [...clubs.individualIrons, { number: ironNumber, name: "" }],
      });
    }
  };

  const updateIndividualIronName = (ironNumber: string, name: string) => {
    update({
      individualIrons: clubs.individualIrons.map((i) =>
        i.number === ironNumber ? { ...i, name } : i
      ),
    });
  };

  const addIndividualIron = () => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Add with a placeholder number that user can see
    const usedNumbers = clubs.individualIrons.map((i) => i.number);
    const available = MIXED_IRON_OPTIONS.filter((n) => !usedNumbers.includes(n));
    if (available.length > 0) {
      update({
        individualIrons: [...clubs.individualIrons, { number: available[0], name: "" }],
      });
    }
  };

  const removeIndividualIron = (ironNumber: string) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    update({
      individualIrons: clubs.individualIrons.filter((i) => i.number !== ironNumber),
    });
  };

  /* ---------------------------------------------------------------- */
  /* WEDGES                                                           */
  /* ---------------------------------------------------------------- */

  const addWedge = () => {
    if (clubs.wedgesList.length >= MAX_WEDGES) return;
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    update({ wedgesList: [...clubs.wedgesList, { loft: "", name: "" }] });
  };

  const removeWedge = (index: number) => {
    soundPlayer.play("click");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = clubs.wedgesList.filter((_, i) => i !== index);
    update({ wedgesList: updated });
    if (showLoftPicker === index) setShowLoftPicker(null);
  };

  const updateWedgeLoft = (index: number, loft: string) => {
    soundPlayer.play("click");
    const updated = clubs.wedgesList.map((w, i) =>
      i === index ? { ...w, loft } : w
    );
    update({ wedgesList: updated });
    setShowLoftPicker(null);
  };

  const updateWedgeName = (index: number, name: string) => {
    const updated = clubs.wedgesList.map((w, i) =>
      i === index ? { ...w, name } : w
    );
    update({ wedgesList: updated });
  };

  /* ---------------------------------------------------------------- */
  /* RENDER                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Equipment</Text>
      <Text style={styles.sectionSubtitle}>
        Only filled fields will display in your locker
      </Text>

      {/* ============ WOODS ============ */}
      <View style={styles.subsection}>
        <Text style={styles.subsectionTitle}>🪵 Woods</Text>

        {/* Driver - always shown */}
        <View style={styles.inputGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>DRIVER</Text>
            {clubs.driver !== "" && (
              <TouchableOpacity onPress={() => handleClear("driver")}>
                <Text style={styles.clearButton}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={styles.input}
            placeholder="e.g., TaylorMade Qi10 • 9°"
            placeholderTextColor="#999"
            value={clubs.driver}
            onChangeText={(text) => update({ driver: text })}
          />
        </View>

        {/* Active fairway woods */}
        {activeWoods.map((wood) => (
          <View key={wood} style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{wood}</Text>
              <TouchableOpacity onPress={() => removeWood(wood)}>
                <Ionicons name="close-circle" size={20} color="#DC2626" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              placeholder={`e.g., Titleist TSR2 ${wood}`}
              placeholderTextColor="#999"
              value={clubs.woods[wood] || ""}
              onChangeText={(text) => updateWood(wood, text)}
            />
          </View>
        ))}

        {/* Add fairway wood */}
        {availableWoods.length > 0 && (
          <>
            {showWoodPicker ? (
              <View style={styles.optionRow}>
                {availableWoods.map((wood) => (
                  <TouchableOpacity
                    key={wood}
                    style={styles.optionChip}
                    onPress={() => addWood(wood)}
                  >
                    <Text style={styles.optionChipText}>{wood}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.optionChipCancel}
                  onPress={() => setShowWoodPicker(false)}
                >
                  <Ionicons name="close" size={16} color="#666" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => {
                  soundPlayer.play("click");
                  setShowWoodPicker(true);
                }}
              >
                <Ionicons name="add-circle-outline" size={18} color="#0D5C3A" />
                <Text style={styles.addButtonText}>Add Fairway Wood</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* ============ IRONS ============ */}
      <View style={styles.subsection}>
        <Text style={styles.subsectionTitle}>🏌️ Irons</Text>

        {/* Set range picker */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>IRON SET RANGE</Text>
          <View style={styles.ironRangeRow}>
            {IRON_SET_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.ironRangeChip,
                  clubs.ironSet?.range === opt.value && styles.ironRangeChipActive,
                ]}
                onPress={() => selectIronRange(opt.value)}
              >
                <Text
                  style={[
                    styles.ironRangeText,
                    clubs.ironSet?.range === opt.value && styles.ironRangeTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Iron set name (for non-mixed) */}
        {clubs.ironSet && clubs.ironSet.range !== "mixed" && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>SET NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Titleist T200"
              placeholderTextColor="#999"
              value={clubs.ironSet.name}
              onChangeText={updateIronSetName}
            />
          </View>
        )}

        {/* Mixed bag - individual iron toggles */}
        {clubs.ironSet?.range === "mixed" && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>SELECT YOUR IRONS</Text>
            <View style={styles.mixedIronGrid}>
              {MIXED_IRON_OPTIONS.map((iron) => {
                const isSelected = clubs.individualIrons.some(
                  (i) => i.number === iron
                );
                return (
                  <TouchableOpacity
                    key={iron}
                    style={[
                      styles.mixedIronChip,
                      isSelected && styles.mixedIronChipActive,
                    ]}
                    onPress={() => toggleMixedIron(iron)}
                  >
                    <Text
                      style={[
                        styles.mixedIronText,
                        isSelected && styles.mixedIronTextActive,
                      ]}
                    >
                      {iron}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Name fields for selected mixed irons */}
            {clubs.individualIrons
              .sort((a, b) => {
                const order = MIXED_IRON_OPTIONS as readonly string[];
                return order.indexOf(a.number) - order.indexOf(b.number);
              })
              .map((iron) => (
                <View key={iron.number} style={styles.inlineInputGroup}>
                  <Text style={styles.inlineLabel}>{iron.number}</Text>
                  <TextInput
                    style={styles.inlineInput}
                    placeholder={`Club name for ${iron.number}`}
                    placeholderTextColor="#999"
                    value={iron.name}
                    onChangeText={(text) =>
                      updateIndividualIronName(iron.number, text)
                    }
                  />
                </View>
              ))}
          </View>
        )}

        {/* Add individual iron (for non-mixed sets) */}
        {clubs.ironSet && clubs.ironSet.range !== "mixed" && (
          <>
            {clubs.individualIrons.map((iron) => (
              <View key={iron.number} style={styles.inputGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>{iron.number.toUpperCase()} (EXTRA)</Text>
                  <TouchableOpacity onPress={() => removeIndividualIron(iron.number)}>
                    <Ionicons name="close-circle" size={20} color="#DC2626" />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder={`e.g., Titleist U505 ${iron.number}`}
                  placeholderTextColor="#999"
                  value={iron.name}
                  onChangeText={(text) =>
                    updateIndividualIronName(iron.number, text)
                  }
                />
              </View>
            ))}

            <TouchableOpacity style={styles.addButton} onPress={addIndividualIron}>
              <Ionicons name="add-circle-outline" size={18} color="#0D5C3A" />
              <Text style={styles.addButtonText}>Add Individual Iron</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ============ WEDGES ============ */}
      <View style={styles.subsection}>
        <Text style={styles.subsectionTitle}>⛳ Wedges</Text>

        {clubs.wedgesList.map((wedge, index) => (
          <View key={index} style={styles.wedgeRow}>
            {/* Loft picker */}
            <TouchableOpacity
              style={styles.loftButton}
              onPress={() => {
                soundPlayer.play("click");
                setShowLoftPicker(showLoftPicker === index ? null : index);
              }}
            >
              <Text
                style={[
                  styles.loftButtonText,
                  wedge.loft && styles.loftButtonTextFilled,
                ]}
              >
                {wedge.loft ? `${wedge.loft}°` : "Loft"}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#666" />
            </TouchableOpacity>

            {/* Name */}
            <TextInput
              style={styles.wedgeInput}
              placeholder="e.g., Vokey SM9"
              placeholderTextColor="#999"
              value={wedge.name}
              onChangeText={(text) => updateWedgeName(index, text)}
            />

            {/* Remove */}
            <TouchableOpacity
              style={styles.wedgeRemove}
              onPress={() => removeWedge(index)}
            >
              <Ionicons name="close-circle" size={22} color="#DC2626" />
            </TouchableOpacity>

            {/* Loft dropdown */}
            {showLoftPicker === index && (
              <View style={styles.loftDropdown}>
                {WEDGE_LOFT_OPTIONS.map((loft) => (
                  <TouchableOpacity
                    key={loft}
                    style={[
                      styles.loftOption,
                      wedge.loft === loft && styles.loftOptionActive,
                    ]}
                    onPress={() => updateWedgeLoft(index, loft)}
                  >
                    <Text
                      style={[
                        styles.loftOptionText,
                        wedge.loft === loft && styles.loftOptionTextActive,
                      ]}
                    >
                      {loft}°
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ))}

        {clubs.wedgesList.length < MAX_WEDGES && (
          <TouchableOpacity style={styles.addButton} onPress={addWedge}>
            <Ionicons name="add-circle-outline" size={18} color="#0D5C3A" />
            <Text style={styles.addButtonText}>
              Add Wedge ({clubs.wedgesList.length}/{MAX_WEDGES})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ============ PUTTER ============ */}
      <View style={styles.subsection}>
        <Text style={styles.subsectionTitle}>🎯 Putter</Text>
        <View style={styles.inputGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>PUTTER</Text>
            {clubs.putter !== "" && (
              <TouchableOpacity onPress={() => handleClear("putter")}>
                <Text style={styles.clearButton}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={styles.input}
            placeholder="e.g., Scotty Cameron Newport 2"
            placeholderTextColor="#999"
            value={clubs.putter}
            onChangeText={(text) => update({ putter: text })}
          />
        </View>
      </View>

      {/* ============ BALL ============ */}
      <View style={styles.subsection}>
        <Text style={styles.subsectionTitle}>🟡 Ball</Text>
        <View style={styles.inputGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>BALL</Text>
            {clubs.ball !== "" && (
              <TouchableOpacity onPress={() => handleClear("ball")}>
                <Text style={styles.clearButton}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={styles.input}
            placeholder="e.g., Titleist Pro V1"
            placeholderTextColor="#999"
            value={clubs.ball}
            onChangeText={(text) => update({ ball: text })}
          />
        </View>
      </View>
    </View>
  );
}

/* ================================================================ */
/* STYLES                                                           */
/* ================================================================ */

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0D5C3A",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#666",
    marginBottom: 16,
  },

  // Subsections (Woods, Irons, Wedges, etc.)
  subsection: {
    marginBottom: 24,
    backgroundColor: "#F9F6EC",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E8E2CC",
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0D5C3A",
    marginBottom: 14,
  },

  // Input groups
  inputGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D5C3A",
    letterSpacing: 1,
  },
  clearButton: {
    fontSize: 12,
    fontWeight: "600",
    color: "#DC2626",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#333",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
  },

  // Add button
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#0D5C3A",
    borderStyle: "dashed",
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0D5C3A",
  },

  // Wood picker options
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  optionChip: {
    backgroundColor: "#0D5C3A",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  optionChipText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 14,
  },
  optionChipCancel: {
    padding: 10,
    backgroundColor: "#E0E0E0",
    borderRadius: 10,
  },

  // Iron range picker
  ironRangeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  ironRangeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#CCC",
    backgroundColor: "#FFF",
  },
  ironRangeChipActive: {
    borderColor: "#0D5C3A",
    backgroundColor: "#0D5C3A",
  },
  ironRangeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#666",
  },
  ironRangeTextActive: {
    color: "#FFF",
  },

  // Mixed iron grid
  mixedIronGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  mixedIronChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#CCC",
    backgroundColor: "#FFF",
    minWidth: 48,
    alignItems: "center",
  },
  mixedIronChipActive: {
    borderColor: "#0D5C3A",
    backgroundColor: "#E8F5E9",
  },
  mixedIronText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#999",
  },
  mixedIronTextActive: {
    color: "#0D5C3A",
  },

  // Inline input (for mixed iron names)
  inlineInputGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  inlineLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0D5C3A",
    width: 32,
    textAlign: "center",
  },
  inlineInput: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#333",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
  },

  // Wedge row
  wedgeRow: {
    marginBottom: 12,
    position: "relative",
  },
  loftButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    marginBottom: 6,
    width: 90,
  },
  loftButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#999",
  },
  loftButtonTextFilled: {
    color: "#0D5C3A",
    fontWeight: "800",
  },
  wedgeInput: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#333",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    marginRight: 36,
  },
  wedgeRemove: {
    position: "absolute",
    right: 0,
    top: 38,
    padding: 4,
  },

  // Loft dropdown
  loftDropdown: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: "#FFF",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  loftOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DDD",
    backgroundColor: "#F9F9F9",
  },
  loftOptionActive: {
    borderColor: "#0D5C3A",
    backgroundColor: "#0D5C3A",
  },
  loftOptionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  loftOptionTextActive: {
    color: "#FFF",
  },
});