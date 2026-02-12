/* -------------------------------- POST TYPES CONFIG -------------------------------- */
// Centralized thought types configuration
// Used across: create screen, filter bottom sheet, and any other thought type displays

export const POST_TYPES = {
  golfer: [
    { id: "swing-thought", label: "Swing Thought" },
    { id: "gear", label: "Gear" },
    { id: "swing-envy", label: "Swing Envy" },
    { id: "meme", label: "Meme" },
    { id: "advice", label: "Advice?" },
    { id: "poll", label: "📊 Poll" },
  ],
  pro: [
    { id: "pro-tip", label: "Pro Tip" },
    { id: "drills", label: "Drills" },
    { id: "swing-thought", label: "Swing Thought" },
    { id: "gear", label: "Gear" },
    { id: "swing-envy", label: "Swing Envy" },
    { id: "meme", label: "Meme" },
    { id: "advice", label: "Advice?" },
    { id: "poll", label: "📊 Poll" },
  ],
  course: [
    { id: "course-announcement", label: "Course Announcement" },
    { id: "swing-thought", label: "Swing Thought" },
    { id: "gear", label: "Gear" },
    { id: "swing-envy", label: "Swing Envy" },
    { id: "meme", label: "Meme" },
    { id: "advice", label: "Advice?" },
    { id: "poll", label: "📊 Poll" },
  ],
};

// Get all unique thought types (for filtering)
export const getAllThoughtTypes = () => {
  const allTypes = new Set<string>();
  
  Object.values(POST_TYPES).forEach((typeArray) => {
    typeArray.forEach((type) => {
      allTypes.add(type.id);
    });
  });
  
  return Array.from(allTypes).map((id) => {
    // Find the label from any of the type arrays
    for (const typeArray of Object.values(POST_TYPES)) {
      const found = typeArray.find((t) => t.id === id);
      if (found) return found;
    }
    return { id, label: id };
  });
};

// Get display label for a post type ID
export const getPostTypeLabel = (postTypeId: string | undefined): string => {
  if (!postTypeId) return "Swing Thought"; // Default
  
  // Search all type arrays for the matching ID
  for (const typeArray of Object.values(POST_TYPES)) {
    const found = typeArray.find((t) => t.id === postTypeId);
    if (found) return found.label;
  }
  
  return postTypeId; // Fallback to ID if not found
};