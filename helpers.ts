import { Tuner, User } from "./service.ts";

// helpers.ts
export function userCanEdit(tuner: Tuner, user: User) {
    return user && (user.id === tuner.authorId || user.isAdmin);
  }
  