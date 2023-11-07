import { Router, Context, send } from "./deps.ts";
import { getTuner, EmptyTuner, getTuners, createTuner, updateTuner, deleteTuner, searchTuners } from "./service.ts";

async function getTunerHandler(ctx: Context) {
  ctx.render("tuners.html", {
    tuners: await getTuners()
  });
}

async function searchTunersHandler(ctx: Context) {
  const key = ctx.request.url.searchParams.get("key");
  ctx.render("tuners.html", {
    tuners: await searchTuners(key ?? "")
  })
}

async function createTunerHandler(ctx: Context) {
  const bodyResult = ctx.request.body({ type: "form-data" });
  const body = await bodyResult.value.read();
  const { id, prompt, url, size, comments } = body.fields;  
  if (id) {
    await updateTuner({id, prompt, url, size, comments});
  } else {
    await createTuner({prompt, url, size, comments});
  }

  ctx.render("tuners.html", {
    tuners: await getTuners()
  });
  ctx.response.redirect('/tuners');
}

async function deleteTunerHandler(ctx: Context) {
  const {id} = ctx.params;
  await deleteTuner(id);
  ctx.render("tuners.html", {
    tuners: await getTuners()
  });
}

async function tunerFormHandler(ctx: Context) {
  const {id} = ctx.params;
  const tuner = id ? await getTuner(id) : EmptyTuner;
  ctx.render("tuner-form.html", tuner);
}

async function cssHandler(ctx: Context) {
  await send(ctx, "/main.css", {
    root: `${Deno.cwd()}/styles`,
    index: "main.css",
  });
}

async function imgHandler(ctx: Context) {
  const imagePath = ctx.request.url.pathname; 
  await send(ctx, imagePath, {
    root: `${Deno.cwd()}/img`,
    index: "index.html", 
  });
}
export default new Router()
  .get("/", ctx => ctx.render("index.html"))
  .get("/search", searchTunersHandler)
  .get("/tuners", getTunerHandler)
  .get("/tuners/form/:id?", tunerFormHandler)

  .post("/tuners", createTunerHandler)
  .delete("/tuners/:id", deleteTunerHandler)
  .get("/atlantis.png", imgHandler)
  .get("/main.css", cssHandler)
  .get("/fish.png", imgHandler);