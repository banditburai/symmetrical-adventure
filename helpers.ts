// helpers.ts

import { Tuner, User } from "./service.ts";


export function userCanEdit(tuner: Tuner, user: User): boolean {
    if (!user || !tuner) {
      return false; // Return false if user or tuner isn't provided
    }
  
    // Check if the user is the author or an admin.
    // Make sure 'isAdmin' is a boolean and 'authorId' is being compared correctly.
    return user.id === tuner.authorId || user.isAdmin === true;
  }
  
