// helpers.ts
import { Tuner, User } from "./service.ts";

// Optional User parameter to handle cases where the user might not be logged in.
export function userCanEdit(tuner: Tuner, user?: User): boolean {
  // If no user is logged in or tuner information is not available, return false.
  if (!user || !tuner) {
    return false;
  }

  // Check if the logged-in user is the author of the tuner or an admin.
  // Ensure that 'isAdmin' exists and is true for an admin user.
  return user.id === tuner.authorId || Boolean(user.isAdmin);
}
