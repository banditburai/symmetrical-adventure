//router.ts

import { Context, Router, send } from "./deps.ts";
import {
  addComment,
  createTuner,
  deleteComment,
  deleteTuner,
  EmptyTuner,
  fetchLikesForUser,
  FilterOptions,
  findTunerByUrl,
  getTuner,
  getTuners,
  searchTuners,
  Tuner,
  updateLike,
  updateTuner,
} from "./service.ts";
import { userCanEdit, userCanEditComment } from "./helpers.ts";
import { jwtAuthMiddleware, userLikeMiddleware } from "./authMiddleware.ts";

async function renderTuners(
  ctx: Context,
  tunersArg?: Tuner[],
  countArg?: number,
) {
  const tuners = tunersArg ?? await getTuners();
  const count = countArg ?? tuners.length;
  tuners.sort((a, b) => b.likes - a.likes || Math.random() - 0.5);
  const processedTuners = tuners.map((tuner) => {
    return {
      ...tuner,
      canEdit: userCanEdit(tuner, ctx.state.user),
    };
  });
  ctx.render("tuners.html", {
    tuners: processedTuners,
    count: count,
    user: ctx.state.user || { id: null, isAdmin: false },
  });
}

function isValidUrl(url: string) {
  const standardUrlPattern =
    /^https:\/\/tuner\.midjourney\.com\/[A-Za-z0-9]{7}(?:\?answer=[A-Za-z0-9]+)?$/;
  const codeUrlPattern =
    /^https:\/\/tuner\.midjourney\.com\/code\/[A-Za-z0-9]+$/;
  return standardUrlPattern.test(url) || codeUrlPattern.test(url);
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
  let likedbyuser: string[] = [];

  if (ctx.request.method === "POST") {
    try {
      const bodyResult = ctx.request.body({ type: "form-data" });
      const body = await bodyResult.value.read();
      const rawLikedByUser = body.fields.likedbyuser;
     // Check if the received data is a string and parse it
     if (typeof rawLikedByUser === "string") {
      likedbyuser = JSON.parse(rawLikedByUser);
    } else if (Array.isArray(rawLikedByUser)) {
      likedbyuser = rawLikedByUser;
    }
    } catch (error) {
      // Handle JSON parsing error
      console.error("Error parsing JSON body:", error);
      ctx.response.status = 400; // Bad Request
      return;
    }
  }
  const searchParams = ctx.request.url.searchParams;
  const filterOptions: FilterOptions = {
    key: searchParams.get("key") ?? undefined,
    size: searchParams.get("size") ?? undefined,
    raw: searchParams.get("raw") === "true" ? true : undefined,
    imgprompt: searchParams.get("imgprompt") === "true" ? true : undefined,
    niji: searchParams.get("niji") === "true" ? true : undefined,
    likedbyme: searchParams.get("likedbyme") === "true" ? true : undefined,
  };
  
  let { tuners, count } = await searchTuners(filterOptions, likedbyuser);
  tuners = tuners.map((tuner) => {
    const sanitizedPrompt = sanitizeImageLinksForHTML(tuner.prompt);
    return {
      ...tuner,
      prompt: sanitizedPrompt,
    };
  });

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

  let { id, prompt, url, size } = body.fields;
  const authorId = ctx.state.user.id;
  prompt = prompt || "No prompt provided";
  if (id) {
    await updateTuner({ id, authorId, prompt, url, size });
  } else {
    await createTuner({ prompt, authorId, url, size, comments: [], likes: 0 });
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

  await deleteTuner(id, tuner.url);
  await renderTuners(ctx);
  // ctx.response.redirect("/tuners");
}

async function commentFormHandler(ctx: Context) {
  const { id } = ctx.params;
  const tuner = await getTuner(id);
  if (!tuner) {
    ctx.response.status = 404;
    ctx.response.body = "Tuner not found";
    return;
  }
  const commentsWithPerms = tuner.comments.map((comment) => ({
    ...comment,
    canEdit: userCanEditComment(comment, ctx.state.user),
  }));

  ctx.render("comment-form.html", {
    id: id,
    prompt: tuner.prompt,
    url: tuner.url,
    comments: commentsWithPerms,
  });
}
async function commentsSectionHandler(ctx: Context) {
  const { id } = ctx.params;
  const tuner = await getTuner(id);
  if (!tuner) {
    ctx.response.status = 404;
    ctx.response.body = "Tuner not found";
    return;
  }
  const commentsWithPerms = tuner.comments.map((comment) => ({
    ...comment,
    canEdit: userCanEditComment(comment, ctx.state.user),
  }));

  ctx.render("comment-section.html", {
    id: tuner.id,
    comments: commentsWithPerms,
  });
}

async function createCommentHandler(ctx: Context) {
  const bodyResult = ctx.request.body({ type: "form-data" });
  const body = await bodyResult.value.read();
  const { id, newComment } = body.fields;
  const comment = {
    commentId: "",
    userId: ctx.state.user.id,
    username: ctx.state.user.username,
    pfp: ctx.state.user.pfp,
    text: newComment,
    timestamp: new Date(),
  };
  const updatedTuner = await addComment(id, comment);

  ctx.render("comment-form.html", {
    id: id,
    prompt: updatedTuner.prompt,
    url: updatedTuner.url,
    comments: updatedTuner.comments,
  });
}

async function deleteCommentHandler(ctx: Context) {
  const { id, commentId } = ctx.params;
  const tuner = await getTuner(id);
  if (!tuner) {
    ctx.response.status = 404;
    ctx.response.body = "Tuner not found";
    return;
  }

  const comment = tuner.comments.find((c) => c.commentId === commentId);
  if (!comment) {
    ctx.response.status = 404;
    ctx.response.body = "Comment not found";
    return;
  }

  if (!userCanEditComment(comment, ctx.state.user)) {
    ctx.response.status = 403; // Forbidden
    ctx.response.body = "You are not authorized to delete this comment";
    return;
  }

  const updatedTuner = await deleteComment(id, commentId);
  ctx.render("comment-form.html", {
    id: updatedTuner.id,
    prompt: updatedTuner.prompt,
    url: updatedTuner.url,
    comments: updatedTuner.comments,
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

function setResponse(
  ctx: Context,
  isValid: boolean,
  urlToValidate: string,
  errorMessage?: string,
) {
  const buttonState = isValid ? "" : "disabled";
  const indicatorVisibility = isValid ? "style='visibility:hidden;'" : "";
  const errorDisplay = errorMessage
    ? `<div class='error-message'>${errorMessage}</div>`
    : "";

  ctx.response.body = `
    <div hx-target="this" hx-swap="outerHTML" class="${
    isValid ? "valid" : "error"
  }">
      <input name="url" type="url" id="url-input" hx-select-oob="#submit-button-container" hx-trigger="keyup changed delay:500ms" hx-post="/form/url"
        hx-indicator="#ind"
    placeholder="URL" value="${urlToValidate}"/>
    ${errorDisplay}
      <img id="ind" src="/three-dots.svg" class="htmx-indicator" ${indicatorVisibility} />
    </div>
    <div id="submit-button-container" hx-swap-oob="true">
      <button name="form-submit" class="btn primary" ${buttonState}>Save</button>
    </div>`;
}

async function validateUrlHandler(ctx: Context) {
  try {
    const bodyResult = ctx.request.body({ type: "form-data" });
    const formDataBody = await bodyResult.value.read();
    const urlToValidate = formDataBody.fields.url?.trim() || "";
    if (!isValidUrl(urlToValidate)) {
      setResponse(
        ctx,
        false,
        urlToValidate,
        "Invalid URL. Please check and try again.",
      );
      return;
    }
    const existingTuner = await findTunerByUrl(urlToValidate);

    if (existingTuner) {
      setResponse(
        ctx,
        false,
        urlToValidate,
        "A tuner with this URL already exists. Here's the existing tuner: " +
          existingTuner.prompt,
      );
      return;
    }
    setResponse(ctx, true, urlToValidate);
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

function buttonResponse(ctx: Context, tuner: Tuner, liked: boolean) {
  const buttonClass = liked ? "selected" : "";
  const newCount = tuner.likes;

  ctx.response.body = `
    <form class="like-form" id="like-form-${tuner.id}" hx-target="this" hx-swap="outerHTML" hx-encoding="multipart/form-data" hx-post="/tuners/like/${tuner.id}">    
    <input type="hidden" name="liked" id="liked-state-${tuner.id}" value="${liked}" />
    <input type="hidden" name="id" value="${tuner.id}" />                 
        <div class="like-count" id="like-count-${tuner.id}"><em>${newCount}</em></div>
        <button class="like ${buttonClass}" data-liked="${liked}" data-tuner-id="${tuner.id}"
        id="like-${tuner.id}"
          hx-post="/tuners/like/${tuner.id}"                   
          hx-trigger="click">             
      <svg xmlns="http://www.w3.org/2000/svg" class="icon like-icon"
        width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"
        stroke-linecap="round" stroke-linejoin="round">
        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
        <path
          d="M7 11v8a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1h3a4 4 0 0 0 4 -4v-1a2 2 0 0 1 4 0v5h3a2 2 0 0 1 2 2l-1 5a2 3 0 0 1 -2 2h-7a3 3 0 0 1 -3 -3">
        </path>
      </svg>
    </button>
  </form>`;
}

async function updateLikeHandler(ctx: Context) {
  const bodyResult = ctx.request.body({ type: "form-data" });
  const formDataBody = await bodyResult.value.read();
  const { id, liked } = formDataBody.fields;
  const likedParam = liked === "false";
  const tuner = await updateLike(id, likedParam);

  if (tuner) {
    buttonResponse(ctx, tuner, likedParam);
    await userLikeMiddleware(ctx, id, likedParam);
  } else {
    ctx.response.status = 404;
    return;
  }
}

async function authInitLikesHandler(ctx: Context) {
  if (!ctx.state.user) {
    ctx.response.status = 401; // Unauthorized
    return;
  }
  try {
    const userLikes = await fetchLikesForUser(ctx.state.user.id);
    ctx.response.body = userLikes;
  } catch (error) {
    ctx.response.status = 500; // Internal Server Error
    ctx.response.body = "Failed to fetch user likes: " + error;
  }
}

export default new Router()
  .get("/", (ctx) => ctx.render("index.html"))
  .get("/main.css", cssHandler)
  .get("/fish.png", imgHandler)
  .get("/three-dots.svg", imgHandler)
  .get("/plus-sign.svg", imgHandler)
  .get("/search", searchTunersHandler)
  .post("/search", searchTunersHandler)
  .get("/tuners", getTunerHandler)
  .get("/tuners/form/:id?", jwtAuthMiddleware, tunerFormHandler)
  .get("/remove-truncate-class/:id", removeTruncateClassHandler)
  .post("/tuners", jwtAuthMiddleware, createTunerHandler)
  .post("/form/url", validateUrlHandler)
  .post("/tuners/like/:id", updateLikeHandler)
  .delete("/tuners/:id", jwtAuthMiddleware, deleteTunerHandler)
  .get("/atlantis.png", imgHandler)
  .get("/logo.png", imgHandler)
  .get("/comments/:id", jwtAuthMiddleware, commentFormHandler) //initial rendering of comment form
  .post("/comments", jwtAuthMiddleware, createCommentHandler)
  .get("/comments/section/:id", jwtAuthMiddleware, commentsSectionHandler)
  .delete("/comments/:id/:commentId", jwtAuthMiddleware, deleteCommentHandler)
  .get("/authUser/likes", jwtAuthMiddleware, authInitLikesHandler);
