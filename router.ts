//router.ts

import { Context, Router, send } from "./deps.ts";
import {
  createTuner,
  deleteTuner,
  EmptyTuner,
  FilterOptions,
  getTuner,
  getTuners,
  searchTuners,
  updateLike,
  updateTuner, 
  pills
} from "./service.ts";

async function getTunerHandler(ctx: Context) {
          
  ctx.render("tuners.html", {
    tuners: await getTuners(),
  });
}

async function searchTunersHandler(ctx: Context) {
  const searchParams = ctx.request.url.searchParams;  
  const filterOptions: FilterOptions = {
    key: searchParams.get("key") ?? undefined,
    size: searchParams.get("size") ?? undefined,
    raw: searchParams.get("raw") === "true" ? true : undefined,
    imgprompt: searchParams.get("imgprompt") === "true" ? true : undefined,
  };
  
  const { tuners, count } = await searchTuners(filterOptions); 

  
  const updatedPills = pills.map(pill => ({
    ...pill,
    selected: pill.param === 'size' ? pill.value === filterOptions.size :
              pill.param === 'raw' ? filterOptions.raw :
              pill.param === 'imgprompt' && filterOptions.imgprompt
  }));
  // Check if the request is from HTMX
  const isHtmx = ctx.request.headers.get("HX-Request");
  
  const template = isHtmx ? "tuners.html" : "index.html";
  ctx.render(template, { tuners, count, pills: updatedPills });

  // if (isHtmx) {    
  //   ctx.render("tuners.html", { tuners, count, pills });
  // } else {    
  //   ctx.render("index.html", { tuners, count, pills });
  //   ctx.response.redirect("/tuners");
  // }
}

async function createTunerHandler(ctx: Context) {
  const bodyResult = ctx.request.body({ type: "form-data" });
  const body = await bodyResult.value.read();
  const { id, prompt, url, size, comments } = body.fields;
  if (id) {
    await updateTuner({ id, prompt, url, size, comments });
  } else {
    await createTuner({ prompt, url, size, comments, likes: 0 });
  }

  ctx.render("tuners.html", {
    tuners: await getTuners(),
  });
  ctx.response.redirect("/tuners");
}

async function deleteTunerHandler(ctx: Context) {
  const { id } = ctx.params;
  await deleteTuner(id);
  ctx.render("tuners.html", {
    tuners: await getTuners(),
  });
}

async function tunerFormHandler(ctx: Context) {
  const { id } = ctx.params;
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

async function removeTruncateClassHandler(ctx: Context) {
  const { id } = ctx.params;
  const tuner = await getTuner(id);
  if (!tuner) {
    ctx.response.status = 404;
    return;
  }
  const tunerHtml = `<span class="prompt-summary">${tuner.prompt}</span>`;

  ctx.response.body = tunerHtml;
}

async function updateLikeHandler(ctx: Context) {
  const { id } = ctx.params;
  const result = ctx.request.body({ type: 'form' }); // 'form', not 'form-data'
  const formData = await result.value;
  const likedParam = formData.get('liked'); // Use .get for URL encoded forms
  const liked = likedParam === 'true';  
  const tuner = await updateLike(id, liked);
  if (tuner) {
    ctx.response.status = 200;
    const buttonClass = liked ? "selected" : "";
    const hiddenInputValue = liked ? "false" : "true"; 
    ctx.response.body = `
      <div class="like-wrapper" id="like-wrapper-${tuner.id}">
      <input type="hidden" name="liked" form="like-form-${tuner.id}" id="liked-state-${tuner.id}" value="${hiddenInputValue}" />
        <div class="like-count" id="like-count-${tuner.id}"><em>${tuner.likes}</em></div>
        <button class="like ${buttonClass}"
          hx-post="/tuners/like/${tuner.id}"          
          hx-swap="outerHTML"          
          hx-trigger="click"
          hx-target="#like-wrapper-${tuner.id}"
          hx-include="#liked-state-${tuner.id}">
          
          
      <svg xmlns="http://www.w3.org/2000/svg" class="icon like-icon ${buttonClass}"
        width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"
        stroke-linecap="round" stroke-linejoin="round">

        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>

        <path
          d="M7 11v8a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1h3a4 4 0 0 0 4 -4v-1a2 2 0 0 1 4 0v5h3a2 2 0 0 1 2 2l-1 5a2 3 0 0 1 -2 2h-7a3 3 0 0 1 -3 -3">
        </path>

      </svg>
    </button>
  </div>`;
  } else {
    ctx.response.status = 404;
    ctx.response.body = "Tuner not found";
  }
}

export default new Router()
  .get("/", (ctx) => ctx.render("index.html"))
  .get("/main.css", cssHandler)
  .get("/fish.png", imgHandler)  
  .get("/search", searchTunersHandler)  
  .get("/tuners", getTunerHandler)
  .get("/tuners/form/:id?", tunerFormHandler)
  .get("/remove-truncate-class/:id", removeTruncateClassHandler)
  .post("/tuners", createTunerHandler)
  .post("/tuners/like/:id", updateLikeHandler)
  .delete("/tuners/:id", deleteTunerHandler)
  .get("/atlantis.png", imgHandler)
  .get("/logo.png", imgHandler);  
 
