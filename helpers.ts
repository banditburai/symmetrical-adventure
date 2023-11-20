// helpers.ts
import { Tuner, User, Comment } from "./service.ts";

// Optional User parameter to handle cases where the user might not be logged in.
export function userCanEdit(tuner: Tuner, user?: User): boolean {
  // If no user is logged in or tuner information is not available, return false.
  if (!user || !tuner) {
    return false;
  }
// console.log(user.id, tuner.authorId);
  
  return user.id === tuner.authorId || Boolean(user.isAdmin);
}



export function userCanEditComment(comment: Comment, user?: User): boolean {
  if (!user || !comment) {
    return false;
  }
  return user.id === comment.userId || Boolean(user.isAdmin);
}