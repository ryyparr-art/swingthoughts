import { db } from "@/constants/firebaseConfig";
import { collection, getDocs, query, where } from "firebase/firestore";

// ============================================================================
// CHECK DISPLAY NAME UNIQUENESS
// ============================================================================

export async function isDisplayNameAvailable(
  displayName: string,
  excludeUserId?: string
): Promise<{ available: boolean; message?: string }> {
  try {
    // Normalize display name (lowercase, trim)
    const normalizedName = displayName.trim().toLowerCase();

    if (!normalizedName) {
      return {
        available: false,
        message: "Display name cannot be empty",
      };
    }

    if (normalizedName.length < 3) {
      return {
        available: false,
        message: "Display name must be at least 3 characters",
      };
    }

    if (normalizedName.length > 20) {
      return {
        available: false,
        message: "Display name must be 20 characters or less",
      };
    }

    // Check for invalid characters (only allow alphanumeric, spaces, underscores, hyphens)
    const validNameRegex = /^[a-z0-9 _-]+$/;
    if (!validNameRegex.test(normalizedName)) {
      return {
        available: false,
        message: "Display name can only contain letters, numbers, spaces, underscores, and hyphens",
      };
    }

    // Query Firestore for existing users with this normalized name
    const usersQuery = query(
      collection(db, "users"),
      where("displayNameLower", "==", normalizedName)
    );

    const snapshot = await getDocs(usersQuery);

    // If excluding a specific user (e.g., current user updating their profile)
    if (excludeUserId) {
      const matchingUsers = snapshot.docs.filter(
        (doc) => doc.id !== excludeUserId
      );

      if (matchingUsers.length > 0) {
        return {
          available: false,
          message: "This display name is already taken",
        };
      }
    } else {
      if (!snapshot.empty) {
        return {
          available: false,
          message: "This display name is already taken",
        };
      }
    }

    return { available: true };
  } catch (error) {
    console.error("Error checking display name availability:", error);
    return {
      available: false,
      message: "Error checking display name. Please try again.",
    };
  }
}

// ============================================================================
// NORMALIZE DISPLAY NAME
// ============================================================================

export function normalizeDisplayName(displayName: string): string {
  return displayName.trim().toLowerCase();
}

// ============================================================================
// VALIDATE DISPLAY NAME FORMAT
// ============================================================================

export function validateDisplayNameFormat(displayName: string): {
  valid: boolean;
  message?: string;
} {
  const trimmed = displayName.trim();

  if (!trimmed) {
    return { valid: false, message: "Display name cannot be empty" };
  }

  if (trimmed.length < 3) {
    return { valid: false, message: "Display name must be at least 3 characters" };
  }

  if (trimmed.length > 20) {
    return { valid: false, message: "Display name must be 20 characters or less" };
  }

  const validNameRegex = /^[a-zA-Z0-9 _-]+$/;
  if (!validNameRegex.test(trimmed)) {
    return {
      valid: false,
      message: "Display name can only contain letters, numbers, spaces, underscores, and hyphens",
    };
  }

  return { valid: true };
}

// ============================================================================
// RESERVED/BANNED DISPLAY NAMES
// ============================================================================

const RESERVED_NAMES = [
  "admin",
  "administrator",
  "moderator",
  "mod",
  "support",
  "help",
  "official",
  "swingthoughts",
  "swing thoughts",
  "system",
  "root",
  "null",
  "undefined",
];

export function isReservedName(displayName: string): boolean {
  const normalized = displayName.trim().toLowerCase();
  return RESERVED_NAMES.includes(normalized);
}

// ============================================================================
// COMPREHENSIVE CHECK (FORMAT + UNIQUENESS + RESERVED)
// ============================================================================

export async function validateDisplayName(
  displayName: string,
  excludeUserId?: string
): Promise<{ valid: boolean; message?: string }> {
  // Check format first
  const formatCheck = validateDisplayNameFormat(displayName);
  if (!formatCheck.valid) {
    return formatCheck;
  }

  // Check if reserved
  if (isReservedName(displayName)) {
    return {
      valid: false,
      message: "This display name is reserved and cannot be used",
    };
  }

  // Check uniqueness
  const uniquenessCheck = await isDisplayNameAvailable(displayName, excludeUserId);
  if (!uniquenessCheck.available) {
    return { valid: false, message: uniquenessCheck.message };
  }

  return { valid: true };
}

// ============================================================================
// SIMPLE WRAPPER FOR BACKWARD COMPATIBILITY
// ============================================================================

export async function checkDisplayNameAvailability(
  displayName: string,
  currentUserId?: string
): Promise<boolean> {
  const result = await isDisplayNameAvailable(displayName, currentUserId);
  return result.available;
}