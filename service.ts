//service.ts

const kv = await Deno.openKv();

export type Tuner = {
  id: string;
  authorId: string;
  prompt: string;
  url: string;
  size: string;
  comments: Comment[];
  likes: number;
}
export type Comment = {
  commentId?: string;
  userId: string;
  username: string;
  pfp: string; 
  text: string;
  timestamp: Date;
}

export type Pill = {
  param: string;
  value: string;
  selected: boolean;  
};

export interface User{
  id: string;
  username: string;  
  pfp: string;
  isAdmin?: boolean;
}

export const currentUser: User = {
  id: 'user-id',
  username: 'default-user',  
  pfp: 'http://example.com/path-to-profile-picture.png',
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
}

export type FilterOptions = {
  key?: string;
  size?: string;
  raw?: boolean;
  imgprompt?: boolean;
  likedbyme?: boolean;
};

export const pills: Pill[] = [
  { param: 'size', value: '16', selected: false },
  { param: 'size', value: '32', selected: false },
  { param: 'size', value: '64', selected: false },
  { param: 'size', value: '128', selected: false },
  { param: 'size', value: 'nonstandard', selected: false },
  { param: 'raw', value: 'true', selected: false },
  { param: 'imgprompt', value: 'true', selected: false },
  { param: 'likedbyme', value: 'true', selected: false },
];

export async function searchTuners(options: FilterOptions, userId?: string): Promise<{tuners: Tuner[], count: number}> {
  let tuners = await getTuners();
if (options.likedbyme && userId){
  const userLikes = await checkUserLikes(userId);
  tuners =tuners.filter( tuner => userLikes.has(tuner.id));
}

  const filteredTuners = tuners.filter(tuner => {
    let matches = true;
    if (options.key) matches &&= tuner.prompt.indexOf(options.key) > -1;
    if (options.size) matches &&= tuner.size === options.size;
    if (options.raw) matches &&= /--style raw/.test(tuner.prompt);
    if (options.imgprompt) matches &&= /(https:\/\/s\.mj\.run\/|\.png|\.jpeg|\.webp)/.test(tuner.prompt);
    return matches;
  });

  return { tuners: filteredTuners, count: filteredTuners.length };
}

export async function addComment(tunerId: string, comment: Comment): Promise<Tuner> {
  comment.commentId = crypto.randomUUID();
  const tuner = await getTuner(tunerId);
  if (!tuner) {
    throw new Error(`Tuner with id ${tunerId} not found.`);
  }
  tuner.comments.push(comment); 
  await kv.set(["tuners", tunerId], tuner); 
  return tuner; 
}


export async function getNumberOfEntries(): Promise<number> {
  const tuners = await getTuners();
  return tuners.length;
}

export async function findTunerByUrl(url: string): Promise<Tuner | undefined> {
  const tuners = await getTuners(); 
  return tuners.find(tuner => tuner.url === url); 
}

// export async function findTunerByUrl(url: string): Promise<Tuner | undefined> {
//   const tunerId = await kv.get(["tuners_by_url", url]); // Get the tuner ID from the index
//   if (tunerId && typeof tunerId.value === 'string') {
//     return await getTuner(tunerId.value);  
//   }
//   return undefined;
// }

// async function createUrlIndexForAllTuners() {
//   const tuners = await getTuners();
//   for (const tuner of tuners) {
//     const byUrlKey = ["tuners_by_url", tuner.url];
//     await kv.set(byUrlKey, tuner.id); // Create the index entry
//   }
// }


export async function getTuner(id: string): Promise<Tuner | undefined> {
  const entry = await kv.get(["tuners", id]);
  return entry ? entry.value as Tuner : undefined; // Safe type assertion with a fallback to undefined.
}

export async function getTuners(): Promise<Tuner[]> {
  const tuners = [] as Tuner[];

  const entries = kv.list({ prefix: ["tuners"] });
  for await (const entry of entries) {    
    if (typeof entry.value === 'object' && entry.value !== null) {      
      tuners.push(entry.value as Tuner);
    }
  }

  return tuners;
}


export async function checkUserLikes(userId: string): Promise<Set<string>> {
  const likes = await fetchLikesForUser(userId);
  return new Set(likes);
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
        // Handle unexpected data format here, e.g., log it, alert an admin, etc.
      }
    }
  } catch (error) {
    console.error(`Error fetching likes for user ${userId}:`, error);
    // Handle JSON parsing error or other fetch issues
  }
  return []; // Return an empty array as the default case
}

export async function recordUserLike(userId: string, tunerId: string, liked: boolean) {
  if (liked) {
    await storeLike(userId, tunerId);
  } else {
    await removeLike(userId, tunerId);
  }
}

export async function storeLike(userId: string, tunerId: string): Promise<void> {
  const likesData = await kv.get(["user_likes", userId]);
  const likesSet = new Set(likesData?.value ? JSON.parse(likesData.value as string) as string[] : []);
  likesSet.add(tunerId);

  // Convert the Set back to an array for storage
  await kv.set(["user_likes", userId], JSON.stringify([...likesSet]));
}

export async function removeLike(userId: string, tunerId: string): Promise<void> {
  const likesData = await kv.get(["user_likes", userId]);
  const likesSet = new Set(likesData?.value ? JSON.parse(likesData.value as string) as string[] : []);

  // Remove the like if it exists
  likesSet.delete(tunerId);

  // Store the potentially updated set back to the KV store
  await kv.set(["user_likes", userId], JSON.stringify([...likesSet]));
}


export async function createTuner(tuner: Omit<Tuner, 'id'>): Promise<void> {
  const id = crypto.randomUUID();
  await kv.set(["tuners", id], {...tuner, id, comments: [], likes: 0});
}

export async function updateTuner(tunerUpdate: Partial<Tuner> & { id: string }): Promise<void> {
  // Ensure there's an ID to work with and that the object exists before trying to update.
  const tuner = await getTuner(tunerUpdate.id);
  if (!tuner) {
    throw new Error(`Tuner with id ${tunerUpdate.id} not found.`);
  }

  // Now update the tuner object safely after checking for existence.
  const updatedTuner: Tuner = {
    ...tuner,
    ...tunerUpdate, // This approach automatically updates all fields present in tunerUpdate.
  };

  await kv.set(["tuners", tunerUpdate.id], updatedTuner); // Directly store the updated tuner.
}

export async function updateLike(id: string, liked: boolean): Promise<Tuner | undefined> {
  const tuner = await getTuner(id);  
  if (tuner) {    
    tuner.likes = liked ? tuner.likes + 1 : Math.max(0, tuner.likes - 1);
  
    await kv.set(["tuners", id], tuner);
    return tuner; // Return the updated tuner
  }
  return undefined; // Return undefined if tuner does not exist
}


export async function deleteTuner(id: string): Promise<void> {
  await kv.delete(["tuners", id]);
}