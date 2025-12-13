export function usePermissions(userData) {
  return {
    canWrite: canWrite(userData),
    canPostScores: canPostScores(userData),
    readOnly: !canWrite(userData),
  };
}
