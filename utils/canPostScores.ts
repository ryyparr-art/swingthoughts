export function canPostScores(userData: any): boolean {
  if (!userData) return false;

  // Golfers & Juniors
  if (
    (userData.userType === "Golfer" ||
      userData.userType === "Junior") &&
    userData.acceptedTerms === true
  ) {
    return true;
  }

  // PGA Professionals only
  if (
    userData.userType === "PGA Professional" &&
    userData.verification?.status === "approved"
  ) {
    return true;
  }

  // Courses can NEVER post scores
  return false;
}
