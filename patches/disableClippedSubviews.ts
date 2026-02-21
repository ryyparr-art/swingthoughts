// patches/disableClippedSubviews.ts
import { Platform } from "react-native";

/**
 * Global patch: disable removeClippedSubviews on iOS to prevent
 * 0x8BADF00D watchdog crashes from recursive geometry calculations
 * during app resume / scene-update.
 */
if (Platform.OS === "ios") {
  try {
    const VirtualizedList = require("react-native/Libraries/Lists/VirtualizedList");
    const originalRender = VirtualizedList.prototype.render;

    if (originalRender) {
      VirtualizedList.prototype.render = function () {
        if (this.props.removeClippedSubviews === undefined) {
          this.props = { ...this.props, removeClippedSubviews: false };
        }
        return originalRender.call(this);
      };
    }
  } catch (e) {
    console.warn("⚠️ Failed to patch VirtualizedList:", e);
  }
}