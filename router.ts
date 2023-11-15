//router.ts

import { Context, Router, send } from "./deps.ts";
import {
  addComment,
  checkUserLikes,
  createTuner,
  deleteTuner,
  EmptyTuner,
  FilterOptions,
  findTunerByUrl,
  getTuner,
  getTuners,
  searchTuners,
  Tuner,
  updateLike,
  updateTuner,
  deleteComment,
} from "./service.ts";
import { userCanEdit, userCanEditComment } from "./helpers.ts";
import { jwtAuthMiddleware, userLikeMiddleware } from "./authMiddleware.ts";

async function renderTuners(
  ctx: Context,
  tunersArg?: Tuner[],
  countArg?: number,
) {
  let userLikes = ctx.state.userLikes || new Set<string>();
  if (ctx.state.user?.id && !ctx.state.userLikes) {
    userLikes = await checkUserLikes(ctx.state.user.id);
    ctx.state.userLikes = userLikes; 
  }
  const tuners = tunersArg ?? await getTuners();
  const count = countArg ?? tuners.length;
  tuners.sort((a, b) => b.likes - a.likes || Math.random() - 0.5);
  const processedTuners = tuners.map((tuner) => {
    return {
      ...tuner,
      canEdit: userCanEdit(tuner, ctx.state.user),
      liked: userLikes.has(tuner.id),
    };
  });
  ctx.render("tuners.html", {
    tuners: processedTuners,
    count: count,
    user: ctx.state.user || { id: null, isAdmin: false },
  });
}

async function renderHomeHandler(ctx: Context) {
  if (ctx.state.user?.id && !ctx.state.userLikes) {
    const userLikes = await checkUserLikes(ctx.state.user.id);
    ctx.state.userLikes = userLikes; 
  }

  ctx.render("index.html", {    
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
  const searchParams = ctx.request.url.searchParams;
  const filterOptions: FilterOptions = {
    key: searchParams.get("key") ?? undefined,
    size: searchParams.get("size") ?? undefined,
    raw: searchParams.get("raw") === "true" ? true : undefined,
    imgprompt: searchParams.get("imgprompt") === "true" ? true : undefined,
    niji: searchParams.get("niji") === "true" ? true : undefined,
    likedbyme: searchParams.get("likedbyme") === "true" ? true : undefined,
  };
  let userId;
  if (filterOptions.likedbyme) {
    userId = ctx.state.user?.id;
  }
  let { tuners, count } = await searchTuners(filterOptions, userId);
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
    canEdit: userCanEditComment(comment, ctx.state.user)
  }));

  ctx.render("comment-form.html", {
    id: id,
    prompt: tuner.prompt,
    url: tuner.url,
    comments: commentsWithPerms
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
    canEdit: userCanEditComment(comment, ctx.state.user)
  }));

  ctx.render("comment-section.html", { 
    id: tuner.id,
    comments: commentsWithPerms });
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

  ctx.render("comment-form.html", {  id: id,
    prompt: updatedTuner.prompt,
    url: updatedTuner.url,
    comments: updatedTuner.comments,});
 
}

async function deleteCommentHandler(ctx: Context) {
  const { id, commentId } = ctx.params;
  const tuner = await getTuner(id);
  if (!tuner) {
    ctx.response.status = 404;
    ctx.response.body = "Tuner not found";
    return;
  }

  const comment = tuner.comments.find(c => c.commentId === commentId);
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
    comments: updatedTuner.comments,});
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

export async function updateGlobalLikes(
  ctx: Context,
  id: string,
  liked: boolean,
): Promise<void> {
  const tuner = await updateLike(id, liked);
  if (tuner) {
    ctx.response.status = 200;
    const buttonClass = liked ? "selected" : "";
    const hiddenInputValue = liked ? "false" : "true";
    const commentsLength = tuner.comments ? tuner.comments.length : 0;
    ctx.response.body = `     
      <div class="like-wrapper" id="like-wrapper-${tuner.id}">
      <div class="comment-count" id="comment-count-${tuner.id}">
      <em>
          ${commentsLength}
      </em>
  </div>
      <button class="add-comment" hx-get="/comments/${tuner.id}">
                <svg width="24px" height="24px" viewBox="0 -0.5 25 25" fill="none"
                  xmlns="http://www.w3.org/2000/svg">
                  <path fill-rule="evenodd" clip-rule="evenodd"
                    d="M5.5 12.9543C5.51239 14.0398 5.95555 15.076 6.73197 15.8348C7.50838 16.5936 8.55445 17.0128 9.64 17.0003H11.646C12.1915 17.0007 12.7131 17.224 13.09 17.6183L14.159 18.7363C14.3281 18.9076 14.5588 19.004 14.7995 19.004C15.0402 19.004 15.2709 18.9076 15.44 18.7363L17.1 17.0003L17.645 16.3923C17.7454 16.2833 17.8548 16.1829 17.972 16.0923C18.9349 15.3354 19.4979 14.179 19.5 12.9543V8.04428C19.4731 5.7845 17.6198 3.97417 15.36 4.00028H9.64C7.38021 3.97417 5.5269 5.7845 5.5 8.04428V12.9543Z"
                    stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  <path
                    d="M16.1957 12.3245C16.3504 11.9403 16.1644 11.5034 15.7802 11.3486C15.396 11.1939 14.959 11.3799 14.8043 11.7641L16.1957 12.3245ZM14.616 13.2503L15.0898 13.8317L15.0926 13.8294L14.616 13.2503ZM10.364 13.2193L9.87845 13.7909L9.88182 13.7938L10.364 13.2193ZM10.2002 11.7315C10.0517 11.3448 9.61791 11.1517 9.23121 11.3001C8.84451 11.4486 8.65137 11.8824 8.79982 12.2691L10.2002 11.7315ZM10.25 8.00031C10.25 7.58609 9.91421 7.25031 9.5 7.25031C9.08579 7.25031 8.75 7.58609 8.75 8.00031H10.25ZM8.75 9.00031C8.75 9.41452 9.08579 9.75031 9.5 9.75031C9.91421 9.75031 10.25 9.41452 10.25 9.00031H8.75ZM16.25 8.00031C16.25 7.58609 15.9142 7.25031 15.5 7.25031C15.0858 7.25031 14.75 7.58609 14.75 8.00031H16.25ZM14.75 9.00031C14.75 9.41452 15.0858 9.75031 15.5 9.75031C15.9142 9.75031 16.25 9.41452 16.25 9.00031H14.75ZM14.8043 11.7641C14.662 12.1173 14.4334 12.4292 14.1394 12.6712L15.0926 13.8294C15.5804 13.4279 15.9597 12.9105 16.1957 12.3245L14.8043 11.7641ZM14.1422 12.6689C13.1801 13.4528 11.7968 13.4427 10.8462 12.6448L9.88182 13.7938C11.3838 15.0545 13.5696 15.0704 15.0898 13.8317L14.1422 12.6689ZM10.8495 12.6477C10.5597 12.4015 10.3364 12.0865 10.2002 11.7315L8.79982 12.2691C9.02618 12.8587 9.39708 13.382 9.87846 13.7909L10.8495 12.6477ZM8.75 8.00031V9.00031H10.25V8.00031H8.75ZM14.75 8.00031V9.00031H16.25V8.00031H14.75Z"
                    fill="#000000" />
                </svg>
              </button>
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

async function updateLikeHandler(ctx: Context) {
  const { id } = ctx.params;
  const result = ctx.request.body({ type: "form" });
  const formData = await result.value;
  const likedParam = formData.get("liked");
  const liked = likedParam === "true";

  await updateGlobalLikes(ctx, id, liked);

  await userLikeMiddleware(ctx, id, liked);
}

export default new Router()
  .get("/", renderHomeHandler)
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
  .get("/logo.png", imgHandler)


  .get("/comments/:id", jwtAuthMiddleware, commentFormHandler) //initial rendering of comment form
  .post("/comments", jwtAuthMiddleware, createCommentHandler)
  .get("/comments/section/:id", jwtAuthMiddleware, commentsSectionHandler)
  .delete("/comments/:id/:commentId", jwtAuthMiddleware, deleteCommentHandler);

