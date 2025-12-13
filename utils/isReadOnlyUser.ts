import { canWrite } from "./canWrite";

export function isReadOnlyUser(userData: any): boolean {
  return !canWrite(userData);
}
