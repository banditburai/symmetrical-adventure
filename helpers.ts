// helpers.ts
import { Tuner, User, Comment } from "./service.ts";

export function userCanEdit(tuner: Tuner, user?: User): boolean {


  if (!user || !user.isAuthenticated || !tuner) {
    return false;
  }

  const canEdit = user.id === tuner.authorId || Boolean(user.isAdmin);
  return canEdit;
}

export function userCanEditComment(comment: Comment, user?: User): boolean {
  if (!user || !user.isAuthenticated || !comment) {
    return false;
  }
  return user.id === comment.userId || Boolean(user.isAdmin);
}
