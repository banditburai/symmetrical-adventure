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
  Tuner
} from "./service.ts";
import { userCanEdit } from "./helpers.ts";
import { jwtAuthMiddleware } from "./authMiddleware.ts";

async function renderTuners(
  ctx: Context,
  tunersArg?: Tuner[],
  countArg?: number,
) {
  const tuners = tunersArg ?? await getTuners();
  const count = countArg ?? tuners.length;
console.log(ctx.state.user);
  const processedTuners = tuners.map((tuner) => {
    // Process each tuner, e.g., to add canEdit property
    return {
      ...tuner,
      canEdit: userCanEdit(tuner, ctx.state.user), // Assuming userCanEdit is a helper function
    };
  });
console.log(processedTuners);
  ctx.render("tuners.html", {
    tuners: processedTuners,
    count: count,
    user: ctx.state.user
  });
}

async function getTunerHandler(ctx: Context) {
  await renderTuners(ctx);
  
}

function sanitizeImageLinksForHTML(text: string) {
  const imageUrlRegex = /https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)(\?\S*)?/gi;
  const mjRunUrlRegex = /https:\/\/s\.mj\.run\/\S+/gi;

  // Replace image URLs with [IMG]
  text = text.replace(imageUrlRegex, "[IMG]");

  // Replace s.mj.run URLs with [IMG]
  text = text.replace(mjRunUrlRegex, "[IMG]");

  return text;
}

async function searchTunersHandler(ctx: Context) {
  const searchParams = ctx.request.url.searchParams;
  const filterOptions: FilterOptions = {
    key: searchParams.get("key") ?? undefined,
    size: searchParams.get("size") ?? undefined,
    raw: searchParams.get("raw") === "true" ? true : undefined,
    imgprompt: searchParams.get("imgprompt") === "true" ? true : undefined,
  };

  let { tuners, count } = await searchTuners(filterOptions);
  tuners = tuners.map((tuner) => {
    const sanitizedPrompt = sanitizeImageLinksForHTML(tuner.prompt);
    return {
      ...tuner,
      prompt: sanitizedPrompt,
    };
  });

  console.log("Tuner Data:", tuners);
  await renderTuners(ctx, tuners, count);
}

async function createTunerHandler(ctx: Context) {
  if (!ctx.state.user || !ctx.state.user.id) {
    ctx.response.status = 401; 
    ctx.response.body = "Unauthorized: No user information available.";
    return;
  }
  const bodyResult = ctx.request.body({ type: "form-data" });
  const body = await bodyResult.value.read();
  let { id, prompt, url, size, comments } = body.fields;
  const authorId = ctx.state.user.id;
  prompt = prompt || "No prompt provided";
  if (id) {
    await updateTuner({ id, authorId, prompt, url, size, comments });
  } else {
    await createTuner({ prompt, authorId, url, size, comments, likes: 0 });
  }

  await renderTuners(ctx);
  ctx.response.redirect("/tuners");
}

async function deleteTunerHandler(ctx: Context) {
  const { id } = ctx.params;
  const tuner = await getTuner(id); // Attempt to fetch the tuner by ID
  if (!tuner) {
    ctx.response.status = 404; // Not Found
    ctx.response.body = "Tuner not found";
    return; // Exit if the tuner does not exist
  }
  // Use userCanEdit to check if the user has permission to delete the tuner
  if (!userCanEdit(tuner, ctx.state.user)) {
    ctx.response.status = 403; // Forbidden
    ctx.response.body = "You are not authorized to delete this tuner";
    return; 
  }
  
  await deleteTuner(id);
  await renderTuners(ctx); 
  // ctx.response.redirect("/tuners"); 
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

async function validateUrlHandler(ctx: Context) {
  try {
    const bodyResult = ctx.request.body({ type: "form-data" }); // Change to "form-data" for multipart
    const formDataBody = await bodyResult.value.read(); // This is for "form-data"
    let urlToValidate = formDataBody.fields.url;

    urlToValidate = urlToValidate ? urlToValidate.trim() : "";
    let isValid = false;
    let errorMessage = "";

    // Define URL validation patterns
    const standardUrlPattern =
      /^https:\/\/tuner\.midjourney\.com\/[A-Za-z0-9]{7}(?:\?answer=[A-Za-z0-9]+)?$/;
    const codeUrlPattern =
      /^https:\/\/tuner\.midjourney\.com\/code\/[A-Za-z0-9]+$/;

    // Check if URL is valid
    if (
      urlToValidate &&
      (standardUrlPattern.test(urlToValidate) ||
        codeUrlPattern.test(urlToValidate))
    ) {
      isValid = true;
    } else {
      errorMessage = "Invalid URL. Please check and try again.";
    }
    const submitButtonDisabledAttribute = isValid ? "" : "disabled";
    const submitButtonUpdate = `
    <div id="submit-button-container" hx-swap-oob="true">
    <button name="form-submit" class="btn primary" ${submitButtonDisabledAttribute}>Save</button>
  </div>
`;
    // Build response based on validation
    if (isValid) {
      // For a valid URL
      ctx.response.body = `
  <div hx-target="this" class="valid" hx-swap="outerHTML">
    <input type="url" id="url-input" hx-select-oob="#submit-button-container" form="url-form" hx-trigger="keyup changed delay:500ms" hx-post="/form/url"
    name="url" id="form-url" hx-indicator="#ind"
    placeholder="URL" value="${encodeURI(urlToValidate)}"/>
    <img id="ind" src="/three-dots.svg" class="htmx-indicator" style="visibility:hidden;"/>
  </div>
  ${submitButtonUpdate}
`;
    } else {
      // For an invalid URL
      ctx.response.body = `
<div hx-target="this" hx-swap="outerHTML" class="error">
  <input type="url" id="url-input" hx-select-oob="#submit-button-container" form="url-form" hx-trigger="keyup changed delay:500ms" hx-post="/form/url"
   name="url" id="form-url" hx-indicator="#ind"
  placeholder="URL" value="${urlToValidate}"/>
  <div class='error-message'>${errorMessage}</div>
  <img id="url-ind" src="/three-dots.svg" class="htmx-indicator"/>
</div>
${submitButtonUpdate}
`;
    }
  } catch (error) {
    console.error("Error during URL validation:", error);
    ctx.response.status = 500;
    ctx.response.body = "Internal server error while validating URL";
  }
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
  const result = ctx.request.body({ type: "form" });
  const formData = await result.value;
  const likedParam = formData.get("liked");
  const liked = likedParam === "true";
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
  .get("/three-dots.svg", imgHandler)
  .get("/plus-sign.svg", imgHandler)
  .get("/search", searchTunersHandler)
  .get("/tuners", getTunerHandler)
  .get("/tuners/form/:id?", jwtAuthMiddleware, tunerFormHandler)
  .get("/remove-truncate-class/:id", removeTruncateClassHandler)
  .post("/tuners", jwtAuthMiddleware, createTunerHandler)
  .post("/form/url", validateUrlHandler)
  .post("/tuners/like/:id", updateLikeHandler)
  .delete("/tuners/:id", jwtAuthMiddleware, deleteTunerHandler)
  .get("/atlantis.png", imgHandler)
  .get("/logo.png", imgHandler);
