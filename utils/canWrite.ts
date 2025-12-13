/**
 * Determines whether a user can write content
 * (post, comment, like, update profile, locker, etc.)
 */
export function canWrite(user: any): boolean {
  if (!user) return false;

  // Golfers & Juniors: unlocked after accepting terms
  if (user.userType === "Golfer" || user.userType === "Junior") {
    return user.acceptedTerms === true;
  }

  // PGA Professionals & Courses: unlocked only after approval
  if (user.userType === "PGA Professional" || user.userType === "Course") {
    return user.verification?.status === "approved";
  }

  return false;
}

