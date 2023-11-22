//service.ts
// const DB_URL = Deno.env.get("DB_URL");
const kv = await Deno.openKv();

export type Tuner = {
  id: string;
  authorId: string;
  prompt: string;
  url: string;
  size: string;
  comments: Comment[];
  likes: number;
};

export type SearchTunersResult = {
  tuners: Tuner[];  
  nextCursor?: string;
};

export type Comment = {
  commentId?: string;
  userId: string;
  username: string;
  pfp: string;
  text: string;
  timestamp: Date;
};

export type Pill = {
  param: string;
  value: string;
  selected: boolean;
};

export interface User {
  id: string;
  username: string;
  pfp: string;
  isAdmin?: boolean;
  isAuthenticated?: boolean;
}

export const currentUser: User = {
  id: "user-id",
  username: "default-user",
  pfp: "http://example.com/path-to-profile-picture.png",
  isAdmin: false,
};

export const EmptyTuner: Tuner = {
  id: "",
  authorId: "",
  prompt: "",
  url: "",
  comments: [],
  size: "16",
  likes: 0,
};

export type FilterOptions = {
  key?: string;
  size?: string;
  raw?: boolean;
  imgprompt?: boolean;
  niji?: boolean;
  likedbyme?: boolean;
  likedbyuser?: string[];
  cursor?: string,
  url?: string,
};

export const pills: Pill[] = [
  { param: "size", value: "16", selected: false },
  { param: "size", value: "32", selected: false },
  { param: "size", value: "64", selected: false },
  { param: "size", value: "128", selected: false },
  { param: "size", value: "nonstandard", selected: false },
  { param: "raw", value: "true", selected: false },
  { param: "imgprompt", value: "true", selected: false },
  { param: "niji", value: "true", selected: false },
  { param: "likedbyme", value: "true", selected: false },
];

// export async function searchTuners(
//   options: FilterOptions,
//   cursor: string | undefined,
//   limit: number
// ): Promise<SearchTunersResult> {
//   const tuners: Tuner[] = [];
//   let nextCursor: string | undefined = cursor;

//   const iteratorOptions: Deno.KvListOptions = {
//     limit: limit,
//     cursor: nextCursor,
//   };

//   const iterator = kv.list({ prefix: ['tuners'] }, iteratorOptions);
//   for await (const entry of iterator) {
//     if (entry.value && typeof entry.value === 'object') {
//       const tuner = entry.value as Tuner;
//       if (matchesFilter(tuner, options)) {
//         tuners.push(tuner);
//       }
//     }
//     nextCursor = iterator.cursor;
//   }

//   return {
//     tuners: tuners,
//     hasResults: tuners.length > 0,
//     nextCursor: nextCursor
//   };
// }


export async function getTuner(id: string): Promise<Tuner | undefined> {
  const entry = await kv.get(["tuners", id]);
  return entry ? entry.value as Tuner : undefined; // Safe type assertion with a fallback to undefined.
}


export async function getTuners(
  options: FilterOptions,  
): Promise<SearchTunersResult> {
  const tuners: Tuner[] = [];
  const cursor = options.cursor;
  let nextCursor: string | undefined = cursor;

  while (tuners.length < 10) {
    const iteratorOptions: Deno.KvListOptions = {
      limit: 11, 
      cursor: nextCursor,
    };

    const iterator = kv.list({ prefix: ['tuners'] }, iteratorOptions);
    let entriesProcessed = 0;

    for await (const entry of iterator) {
      entriesProcessed++;
      if (entry.value && typeof entry.value === 'object') {
        const tuner = entry.value as Tuner;
        if (matchesFilter(tuner, options)) {
          tuners.push(tuner);
          if (tuners.length === 10)
          {
            iterator.next();
          } 
        }
      }
      nextCursor = iterator.cursor;
    }

    // Break the while loop if no more entries to process
    if (entriesProcessed < 10) break;
  }

  return { 
    tuners: tuners,    
    nextCursor: nextCursor
  };
}


export async function countTuners(options?: FilterOptions): Promise<number> {
  let count = 0;
  const entries = kv.list({ prefix: ["tuners"] });

  for await (const entry of entries) {
    if (entry && typeof entry.value === "object" && entry.value !== null) {
      const tuner = entry.value as Tuner;

      // If filters are provided, apply them; otherwise, count all entries
      if (!options || matchesFilter(tuner, options)) {
        count++;
      }
    }
  }

  return count;
}


// export async function getTuners(cursor: string | undefined, limit: number): Promise<{ tuners: Tuner[], nextCursor?: string }> {
//   const tuners: Tuner[] = [];
//   let nextCursor: string | undefined = cursor;

//   const options: Deno.KvListOptions = {
//     limit: limit,
//     cursor: nextCursor
//   };

//   const iterator = kv.list({ prefix: ['tuners'] }, options);
//   for await (const entry of iterator) {
//     if (entry.value && typeof entry.value === 'object') {
//       tuners.push(entry.value as Tuner);
//     }
//     nextCursor = iterator.cursor;
//   }
//   return { tuners, nextCursor };
// }

// export async function countFilteredTuners(options: FilterOptions): Promise<number> {
//   let count = 0;
//   const entries = kv.list({ prefix: ["tuners"] });

//   for await (const entry of entries) {
//     if (typeof entry.value === "object" && entry.value !== null) {
//       const tuner = entry.value as Tuner;
//       if (matchesFilter(tuner, options)) {
//         count++;
//       }
//     }
//   }
//   return count;
// }

// export async function getTotalTunerCount(): Promise<number> {
//   let count = 0;
//   const entries = kv.list({ prefix: ["tuners"] });

//   for await (const entry of entries) {
//       if (entry && typeof entry.value === "object" && entry.value !== null) {
//           count++;
//       }
//   }

//   return count;
// }


function matchesFilter(tuner: Tuner, options: FilterOptions): boolean {
  let matches = true;
  if (options.key) {
    const lowerCaseKey = options.key.toLowerCase();
    matches &&= tuner.prompt.toLowerCase().indexOf(lowerCaseKey) > -1;
  }
  if (options.size) matches &&= tuner.size === options.size;
  if (options.raw) matches &&= /--style raw/.test(tuner.prompt);
  if (options.niji) matches &&= /--niji/.test(tuner.prompt);
  if (options.imgprompt) {
    matches &&= /(https:\/\/s\.mj\.run\/|\.png|\.jpeg|\.webp)/.test(
      tuner.prompt,
    );
  }
  if (options.likedbyuser && options.likedbyuser.length > 0) {
    matches &&= options.likedbyuser.includes(tuner.id);
  }
  return matches;
}

export async function addComment(
  tunerId: string,
  comment: Comment,
): Promise<Tuner> {
  comment.commentId = crypto.randomUUID();
  const tuner = await getTuner(tunerId);
  if (!tuner) {
    throw new Error(`Tuner with id ${tunerId} not found.`);
  }
  tuner.comments.push(comment);
  await kv.set(["tuners", tunerId], tuner);
  return tuner;
}

export async function deleteComment(
  tunerId: string,
  commentId: string,
): Promise<Tuner> {
  const tuner = await getTuner(tunerId);
  if (!tuner) {
    throw new Error(`Tuner with id ${tunerId} not found.`);
  }
  const commentIndex = tuner.comments.findIndex((c) =>
    c.commentId === commentId
  );
  if (commentIndex === -1) {
    throw new Error(`Comment with id ${commentId} not found.`);
  }
  tuner.comments.splice(commentIndex, 1);
  await kv.set(["tuners", tunerId], tuner);
  return tuner;
}

// export async function findTunerByUrl(url: string): Promise<Tuner | undefined> {
//   const tuners = await getTuners();
//   return tuners.find(tuner => tuner.url === url);
// }

export async function findTunerByUrl(url: string): Promise<Tuner | undefined> {
  const tunerId = await kv.get(["tuners_by_url", url]);
  if (tunerId && typeof tunerId.value === "string") {
    return await getTuner(tunerId.value);
  }
  return undefined;
}

export async function fetchLikesForUser(userId: string): Promise<string[]> {
  try {
    const result = await kv.get(["user_likes", userId]);
    if (result?.value) {
      const data = JSON.parse(result.value as string);
      if (Array.isArray(data)) {
        return data;
      } else {
        console.error(`Expected array for user likes, received:`, data);
      }
    }
  } catch (error) {
    console.error(`Error fetching likes for user ${userId}:`, error);
  }
  return []; // Return an empty array as the default case
}

export async function recordUserLike(
  userId: string,
  tunerId: string,
  liked: boolean,
) {
  if (liked) {
    await storeLike(userId, tunerId);
  } else {
    await removeLike(userId, tunerId);
  }
}

export async function storeLike(
  userId: string,
  tunerId: string,
): Promise<void> {
  const likesData = await kv.get(["user_likes", userId]);
  const likesSet = new Set(
    likesData?.value ? JSON.parse(likesData.value as string) as string[] : [],
  );
  likesSet.add(tunerId);
  await kv.set(["user_likes", userId], JSON.stringify([...likesSet]));
}

export async function removeLike(
  userId: string,
  tunerId: string,
): Promise<void> {
  const likesData = await kv.get(["user_likes", userId]);
  const likesSet = new Set(
    likesData?.value ? JSON.parse(likesData.value as string) as string[] : [],
  );
  likesSet.delete(tunerId);
  await kv.set(["user_likes", userId], JSON.stringify([...likesSet]));
}

export async function createTuner(tuner: Omit<Tuner, "id">): Promise<void> {
  const id = crypto.randomUUID();
  await kv.set(["tuners", id], { ...tuner, id, comments: [], likes: 0 });
}

export async function updateTuner(
  tunerUpdate: Partial<Tuner> & { id: string },
): Promise<void> {
  const tuner = await getTuner(tunerUpdate.id);
  if (!tuner) {
    throw new Error(`Tuner with id ${tunerUpdate.id} not found.`);
  }
  const urlChanged = tunerUpdate.url && tuner.url !== tunerUpdate.url;
  const updatedTuner: Tuner = {
    ...tuner,
    ...tunerUpdate,
  };
  const transaction = kv.atomic();
  transaction.set(["tuners", tunerUpdate.id], updatedTuner); // Update the primary key
  // Update the secondary index if the URL has changed
  if (urlChanged) {
    transaction
      .delete(["tuners_by_url", tuner.url]) // Delete the old secondary index entry
      .set(["tuners_by_url", updatedTuner.url], tunerUpdate.id); // Create a new secondary index entry
  }
  // Commit the transaction
  const res = await transaction.commit();
  if (!res.ok) {
    throw new Error("Failed to update tuner and/or secondary index");
  }
}

export async function updateLike(
  id: string,
  liked: boolean,
): Promise<Tuner | undefined> {
  const tuner = await getTuner(id);
  if (tuner) {
    tuner.likes = liked ? tuner.likes + 1 : Math.max(0, tuner.likes - 1);
    await kv.set(["tuners", id], tuner);
    return tuner; // Return the updated tuner
  }
  return undefined; // Return undefined if tuner does not exist
}

export async function deleteTuner(id: string, url: string): Promise<void> {
  await kv.delete(["tuners", id]);
  await kv.delete(["tuners_by_url", url]);
}
