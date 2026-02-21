/**
 * Safely converts any Firestore/JS timestamp format to milliseconds.
 */
export const getTimestampMs = (timestamp: any): number => {
  if (!timestamp) return 0;

  if (timestamp?.toMillis && typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }

  if (timestamp?.seconds !== undefined) {
    return timestamp.seconds * 1000;
  }

  if (typeof timestamp === "number") {
    return timestamp;
  }

  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }

  if (typeof timestamp === "string") {
    return new Date(timestamp).getTime();
  }

  return 0;
};

/**
 * Safely converts any Firestore/JS timestamp format to a Date object.
 */
export const getDateFromTimestamp = (timestamp: any): Date | null => {
  if (!timestamp) return null;

  if (timestamp?.toDate && typeof timestamp.toDate === "function") {
    return timestamp.toDate();
  }

  if (timestamp instanceof Date) {
    return timestamp;
  }

  if (timestamp?.seconds !== undefined) {
    return new Date(timestamp.seconds * 1000);
  }

  if (typeof timestamp === "number") {
    return new Date(timestamp);
  }

  if (typeof timestamp === "string") {
    return new Date(timestamp);
  }

  return null;
};

/**
 * Returns a human-readable relative time string.
 */
export const formatTimeAgo = (timestamp: any): string => {
  const date = getDateFromTimestamp(timestamp);
  if (!date) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};