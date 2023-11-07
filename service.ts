const kv = await Deno.openKv();

type Tuner = {
  id: string;
  prompt: string;
  url: string;
  size: number;
  comments: string;
}

export const EmptyTuner = {
  id: "",
  prompt: "",
  url: "",
  size: 0,
  comments: "",
}

export async function searchTuners(key: string) {
  const tuners = await getTuners()
  return tuners
  .filter(it => it.prompt.indexOf(key) > -1)
}

export async function getTuner(id: string) {
  return (await kv.get(["tuners", id])).value;
}

export async function getTuners() {
  const tuners = [] as Tuner[];

  const entries = kv.list({ prefix: ["tuners"] });
  for await (const entry of entries) {
    tuners.push(entry.value);
  }

  return tuners;
}

export async function createTuner(tuner: Partial<Tuner>) {
  const id = crypto.randomUUID();
  await kv.set(["tuners", id], {...tuner, id});
}

export async function updateTuner(data: Partial<Tuner>) {
  const tuner = await getTuner(data.id!);
  tuner.prompt = data.prompt ?? "";
  tuner.url = data.url ?? "";
  tuner.size = data.size ?? "";
  tuner.comments = data.comments ?? "";
  kv.set(["tuners", data.id!], {...tuner});
}

export async function deleteTuner(id: string) {
  await kv.delete(["tuners", id]);
}
