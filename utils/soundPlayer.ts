/**
 * Sound Player Utility
 *
 * - Respects OS silent / volume settings by default
 * - Optional override to allow sound in silent mode (future setting)
 * - Listener system for Settings UI
 * - Expo SDK–safe (no deprecated constants)
 * - Optimized for instant playback to sync with haptics
 *
 * Sounds live in /assets/sounds/
 */

import { Audio } from "expo-av";

export type SoundName =
  | "dart"          // Like button
  | "achievement"  // New lowman, hole-in-one, badges
  | "error"         // Validation / failed actions
  | "click"         // Button presses, navigation
  | "appOpen"       // App launch
  | "postThought";  // Post thought or score

/**
 * Listener payload for sound settings changes
 */
export type SoundSettingsListener = (settings: {
  isMuted: boolean;
  allowSoundInSilentMode: boolean;
}) => void;

class SoundPlayer {
  private sounds: Record<string, Audio.Sound> = {};
  private isLoaded = false;

  // App-level controls
  private isMuted = false;

  // Future user setting (default: respect OS silent switch)
  private allowSoundInSilentMode = false;

  // Settings listeners
  private listeners = new Set<SoundSettingsListener>();

  /**
   * Emit current settings to all listeners
   */
  private notifyListeners() {
    const snapshot = {
      isMuted: this.isMuted,
      allowSoundInSilentMode: this.allowSoundInSilentMode,
    };

    this.listeners.forEach((listener) => listener(snapshot));
  }

  /**
   * Configure Expo audio mode based on settings
   */
  private async configureAudioMode() {
    await Audio.setAudioModeAsync({
      // iOS: respect silent switch unless user explicitly overrides
      playsInSilentModeIOS: this.allowSoundInSilentMode,

      // Android: respects system volume / DND
      shouldDuckAndroid: true,

      // UI sounds only
      staysActiveInBackground: false,
    });
  }

  /**
   * Subscribe to sound settings changes
   * Returns an unsubscribe function
   */
  addListener(listener: SoundSettingsListener) {
    this.listeners.add(listener);

    // Immediately emit current state
    listener({
      isMuted: this.isMuted,
      allowSoundInSilentMode: this.allowSoundInSilentMode,
    });

    return () => this.removeListener(listener);
  }

  /**
   * Unsubscribe from settings changes
   */
  removeListener(listener: SoundSettingsListener) {
    this.listeners.delete(listener);
  }

  /**
   * Preload all sounds (call once on app start)
   */
  async loadSounds() {
    try {
      await this.configureAudioMode();

      const soundFiles: Record<SoundName, any> = {
        dart: require("@/assets/sounds/Dart.mp3"),
        achievement: require("@/assets/sounds/Achievement.mp3"),
        error: require("@/assets/sounds/Error.mp3"),
        click: require("@/assets/sounds/Click.mp3"),
        appOpen: require("@/assets/sounds/AppOpen.mp3"),
        postThought: require("@/assets/sounds/PostThought.mp3"),
      };

      for (const [key, source] of Object.entries(soundFiles)) {
        const { sound } = await Audio.Sound.createAsync(source, {
          shouldPlay: false,
        });

        this.sounds[key] = sound;
      }

      this.isLoaded = true;
      console.log("✅ Sounds loaded successfully");
    } catch (error) {
      console.error("❌ Error loading sounds:", error);
    }
  }

  /**
   * Play a sound by name
   * Optimized for immediate playback to sync with haptics
   */
  play(soundName: SoundName) {
    if (!this.isLoaded || this.isMuted) return;

    try {
      const sound = this.sounds[soundName];
      if (!sound) return;

      // Fire-and-forget for instant playback
      // Check status and replay from start if already playing
      sound.getStatusAsync().then((status) => {
        if (status.isLoaded && status.isPlaying) {
          // Sound is playing - restart it
          sound.replayAsync().catch((error) => {
            console.error(`❌ Error replaying sound "${soundName}":`, error);
          });
        } else {
          // Sound not playing - just play it
          sound.playAsync().catch((error) => {
            console.error(`❌ Error playing sound "${soundName}":`, error);
          });
        }
      });
    } catch (error) {
      console.error(`❌ Error with sound "${soundName}":`, error);
    }
  }

  /**
   * App-level mute (immediate)
   */
  setMuted(muted: boolean) {
    if (this.isMuted === muted) return;

    this.isMuted = muted;
    this.notifyListeners();
  }

  getMuted() {
    return this.isMuted;
  }

  /**
   * FUTURE USER SETTING
   * Allow sounds even when phone is on silent (iOS only)
   */
  async setAllowSoundInSilentMode(allow: boolean) {
    if (this.allowSoundInSilentMode === allow) return;

    this.allowSoundInSilentMode = allow;
    await this.configureAudioMode();
    this.notifyListeners();
  }

  getAllowSoundInSilentMode() {
    return this.allowSoundInSilentMode;
  }

  /**
   * Cleanup – unload all sounds
   */
  async cleanup() {
    try {
      for (const sound of Object.values(this.sounds)) {
        await sound.unloadAsync();
      }

      this.sounds = {};
      this.isLoaded = false;
      console.log("✅ Sounds cleaned up");
    } catch (error) {
      console.error("❌ Error cleaning up sounds:", error);
    }
  }
}

// Singleton export
export const soundPlayer = new SoundPlayer();

