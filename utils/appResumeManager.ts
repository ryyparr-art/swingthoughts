/**
 * AppResumeManager
 * 
 * Staggers work on app resume to prevent watchdog kills.
 * Screens register callbacks with priorities, and on resume
 * they fire sequentially with delays instead of all at once.
 */

import { AppState, AppStateStatus } from "react-native";

type ResumeCallback = () => void;
type Priority = "critical" | "high" | "low";

interface RegisteredCallback {
  id: string;
  callback: ResumeCallback;
  priority: Priority;
}

const DELAYS: Record<Priority, number> = {
  critical: 0,      // Immediate (auth, visible screen)
  high: 500,         // 500ms (active tab data)
  low: 2000,         // 2s (background preloads, carousels)
};

let callbacks: RegisteredCallback[] = [];
let appState = AppState.currentState;
let isResuming = false;

// Listen to app state changes
AppState.addEventListener("change", (nextState: AppStateStatus) => {
  if (appState.match(/inactive|background/) && nextState === "active") {
    handleResume();
  }
  appState = nextState;
});

async function handleResume() {
  if (isResuming) return;
  isResuming = true;

  // Group by priority
  const critical = callbacks.filter((c) => c.priority === "critical");
  const high = callbacks.filter((c) => c.priority === "high");
  const low = callbacks.filter((c) => c.priority === "low");

  // Fire critical immediately
  critical.forEach((c) => {
    try { c.callback(); } catch (e) { console.error("Resume critical error:", e); }
  });

  // Fire high after delay
  if (high.length > 0) {
    setTimeout(() => {
      high.forEach((c) => {
        try { c.callback(); } catch (e) { console.error("Resume high error:", e); }
      });
    }, DELAYS.high);
  }

  // Fire low after longer delay
  if (low.length > 0) {
    setTimeout(() => {
      low.forEach((c) => {
        try { c.callback(); } catch (e) { console.error("Resume low error:", e); }
      });
    }, DELAYS.low);
  }

  // Reset after all work scheduled
  setTimeout(() => { isResuming = false; }, DELAYS.low + 500);
}

export function registerResumeCallback(
  id: string,
  callback: ResumeCallback,
  priority: Priority = "high"
) {
  // Remove existing with same id
  callbacks = callbacks.filter((c) => c.id !== id);
  callbacks.push({ id, callback, priority });
}

export function unregisterResumeCallback(id: string) {
  callbacks = callbacks.filter((c) => c.id !== id);
}