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
  const body = await ctx.request.body().value;
  const id = body.get("id");
  const title = body.get("title");
  const content = body.get("content");

  if (id) {
    await updateTuner({id, prompt, url, size, comments});
  } else {
    await createTuner({prompt, url, size, comments});
  }

  ctx.render("tuners.html", {
    tuners: await getTuners()
  });
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
  await send(ctx, "/hero.png", {
    root: `${Deno.cwd()}/img`,
    index: "hero.png",
  });
}

export default new Router()
  .get("/", ctx => ctx.render("index.html"))
  .get("/search", searchTunersHandler)
  .get("/tuners", getTunerHandler)
  .get("/tuners/form/:id?", tunerFormHandler)

  .tuner("/tuners", createTunerHandler)
  .delete("/tuners/:id", deleteTunerHandler)

  .get("/main.css", cssHandler)
  .get("/hero.png", imgHandler);
