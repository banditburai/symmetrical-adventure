// helpers.ts
import { Tuner, User, Comment } from "./service.ts";

export function userCanEdit(tuner: Tuner, user?: User): boolean {
  // Check if user is not authenticated or null, or if tuner information is not available.
  // Also log information for debugging purposes.
  // console.log("User:", user);
  // console.log("Tuner Author ID:", tuner?.authorId);

  if (!user || !user.isAuthenticated || !tuner) {
    // console.log("Can Edit: false (User not authenticated or tuner missing)");
    return false;
  }

  // Check if the user is the author of the tuner or an admin.
  const canEdit = user.id === tuner.authorId || Boolean(user.isAdmin);
  // console.log("Can Edit:", canEdit);
  return canEdit;
}

export function userCanEditComment(comment: Comment, user?: User): boolean {
  // Similar logic for comments
  if (!user || !user.isAuthenticated || !comment) {
    return false;
  }
  return user.id === comment.userId || Boolean(user.isAdmin);
}
