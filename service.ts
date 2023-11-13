//service.ts

const kv = await Deno.openKv();

export type Tuner = {
  id: string;
  authorId: string;
  prompt: string;
  url: string;
  size: string;
  comments: string;
  likes: number;
}

export type Pill = {
  param: string;
  value: string;
  selected: boolean;  
};

export interface User{
  id: string;
  isAdmin?: boolean;
}

export const EmptyTuner: Tuner = {
  id: "",
  authorId: "",
  prompt: "",
  url: "",
  size: "16",
  comments: "",
  likes: 0,
}

export type FilterOptions = {
  key?: string;
  size?: string;
  raw?: boolean;
  imgprompt?: boolean;
 
};

export const pills: Pill[] = [
  { param: 'size', value: '16', selected: false },
  { param: 'size', value: '32', selected: false },
  { param: 'size', value: '64', selected: false },
  { param: 'size', value: '128', selected: false },
  { param: 'size', value: 'nonstandard', selected: false },
  { param: 'raw', value: 'true', selected: false },
  { param: 'imgprompt', value: 'true', selected: false },
];

export async function searchTuners(options: FilterOptions): Promise<{tuners: Tuner[], count: number}> {
  const tuners = await getTuners();
  const filteredTuners = tuners.filter(tuner => {
    let matches = true;
    if (options.key) matches = matches && tuner.prompt.indexOf(options.key) > -1;
    if (options.size) matches = matches && tuner.size === options.size;
    if (options.raw) matches = matches && /--style raw/.test(tuner.prompt);
    if (options.imgprompt) matches = matches && /(https:\/\/s\.mj\.run\/|\.png|\.jpeg|\.webp)/.test(tuner.prompt);    
    return matches;
  });

  return { tuners: filteredTuners, count: filteredTuners.length };
}

export async function getNumberOfEntries(): Promise<number> {
  const tuners = await getTuners();
  return tuners.length;
}
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


// Assuming `likes` table structure: { userId: string, tunerId: string }
export async function checkUserLikes(userId: string): Promise<Set<string>> {
  // Fetch all likes for the user and return a set of tuner IDs
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


export async function storeLike(userId: string, tunerId: string): Promise<void> {
  const likesData = await kv.get(["user_likes", userId]);
  const likesSet = new Set(likesData?.value ? JSON.parse(likesData.value as string) as string[] : []);

  // Add the like only if it's not already present
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
  await kv.set(["tuners", id], {...tuner, id, likes: 0});
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