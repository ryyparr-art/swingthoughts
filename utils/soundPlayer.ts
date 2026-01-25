/**
 * Sound Player Utility - using expo-audio (SDK 55 compatible)
 * 
 * Singleton pattern for playing sound effects throughout the app.
 * Uses createAudioPlayer() instead of hooks since this is used outside React components.
 * 
 * IMPORTANT: Audio mode is only configured ONCE at initialization to prevent
 * conflicts with expo-video's audio session management.
 */

import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

// Sound effect types
type SoundType = 
  | 'click' 
  | 'dart' 
  | 'postThought' 
  | 'achievement' 
  | 'appOpen'
  | 'error';

// Sound file mappings - matches actual file names in assets/sounds/
const SOUND_FILES: Record<SoundType, any> = {
  click: require('@/assets/sounds/Click.mp3'),
  dart: require('@/assets/sounds/Dart.mp3'),
  postThought: require('@/assets/sounds/PostThought.mp3'),
  achievement: require('@/assets/sounds/Achievement.mp3'),
  appOpen: require('@/assets/sounds/AppOpen.mp3'),
  error: require('@/assets/sounds/Error.mp3'),
};

class SoundPlayer {
  private players: Map<SoundType, AudioPlayer | null> = new Map();
  private isInitialized = false;
  private isInitializing = false;
  private enabled = true;
  private audioModeConfigured = false;

  constructor() {
    // Don't initialize in constructor - do it lazily on first play
    // This prevents issues with audio session on app startup
  }

  /**
   * Configure audio mode ONCE - don't call this repeatedly
   * as it conflicts with video player audio sessions
   */
  private async configureAudioMode(): Promise<void> {
    if (this.audioModeConfigured) return;
    
    try {
      await setAudioModeAsync({
        playsInSilentMode: false, // Respect silent mode by default
        shouldRouteThroughEarpiece: false,
      });
      this.audioModeConfigured = true;
      console.log('🔊 Audio mode configured');
    } catch (error) {
      console.warn('⚠️ Failed to configure audio mode:', error);
      // Don't throw - allow sounds to play even if mode config fails
    }
  }

  /**
   * Initialize all sound players
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized || this.isInitializing) return;
    
    this.isInitializing = true;
    
    try {
      // Configure audio mode once at startup
      await this.configureAudioMode();
      
      // Pre-load commonly used sounds
      const preloadSounds: SoundType[] = ['click', 'dart', 'error'];
      
      for (const soundType of preloadSounds) {
        try {
          const player = createAudioPlayer(SOUND_FILES[soundType]);
          this.players.set(soundType, player);
        } catch (error) {
          console.warn(`⚠️ Failed to preload sound: ${soundType}`, error);
          this.players.set(soundType, null);
        }
      }
      
      this.isInitialized = true;
      console.log('🔊 SoundPlayer initialized');
    } catch (error) {
      console.error('❌ SoundPlayer initialization error:', error);
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Get or create a player for a sound type
   */
  private async getPlayer(soundType: SoundType): Promise<AudioPlayer | null> {
    // Initialize if needed
    if (!this.isInitialized && !this.isInitializing) {
      await this.initialize();
    }
    
    // Wait for initialization to complete
    while (this.isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Return existing player if we have one
    if (this.players.has(soundType)) {
      return this.players.get(soundType) || null;
    }
    
    // Create new player for this sound type
    try {
      const player = createAudioPlayer(SOUND_FILES[soundType]);
      this.players.set(soundType, player);
      return player;
    } catch (error) {
      console.warn(`⚠️ Failed to create player for: ${soundType}`, error);
      this.players.set(soundType, null);
      return null;
    }
  }

  /**
   * Play a sound effect
   * 
   * NOTE: This does NOT call setAudioModeAsync every time to prevent
   * conflicts with video player audio sessions.
   */
  async play(soundType: SoundType): Promise<void> {
    if (!this.enabled) return;
    
    try {
      const player = await this.getPlayer(soundType);
      
      if (!player) {
        console.warn(`⚠️ No player available for: ${soundType}`);
        return;
      }
      
      // Reset to beginning before playing (expo-audio doesn't auto-reset)
      // Use try-catch because player might be in a bad state
      try {
        player.seekTo(0);
        player.play();
      } catch (playError) {
        // If playback fails, try recreating the player
        console.warn(`⚠️ Playback failed, recreating player for: ${soundType}`);
        this.players.delete(soundType);
        
        const newPlayer = await this.getPlayer(soundType);
        if (newPlayer) {
          newPlayer.play();
        }
      }
    } catch (error) {
      // Silent fail for sounds - don't interrupt user experience
      console.warn(`⚠️ Sound play error (${soundType}):`, error);
    }
  }

  /**
   * Enable or disable all sounds
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`🔊 Sounds ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if sounds are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Release all sound players
   * Call this when the app is closing or sounds are no longer needed
   */
  async release(): Promise<void> {
    for (const [soundType, player] of this.players) {
      if (player) {
        try {
          player.release();
        } catch (error) {
          console.warn(`⚠️ Failed to release player: ${soundType}`, error);
        }
      }
    }
    
    this.players.clear();
    this.isInitialized = false;
    this.audioModeConfigured = false;
    console.log('🔊 SoundPlayer released');
  }

  /**
   * Temporarily pause audio mode configuration
   * Call this before playing videos to prevent conflicts
   */
  async prepareForVideo(): Promise<void> {
    // Don't reconfigure audio mode while video is playing
    // The video player will manage its own audio session
    console.log('🎬 Preparing for video playback');
  }

  /**
   * Resume audio mode after video playback
   * Call this after video modal closes
   */
  async resumeAfterVideo(): Promise<void> {
    // Reconfigure audio mode after video closes
    // This restores sound effect behavior
    this.audioModeConfigured = false;
    await this.configureAudioMode();
    console.log('🔊 Resumed after video playback');
  }
}

// Export singleton instance
export const soundPlayer = new SoundPlayer();
