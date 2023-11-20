//router.ts

import { Context, Router, send } from "./deps.ts";
import {
  addComment,
  countTuners,
  createTuner,
  deleteComment,
  deleteTuner,
  EmptyTuner,
  fetchLikesForUser,
  FilterOptions,
  findTunerByUrl,
  getTuner,
  getTuners,
  Tuner,
  updateLike,
  updateTuner,
} from "./service.ts";
import { userCanEdit, userCanEditComment } from "./helpers.ts";
import { ClerkRequireAuth, userLikeMiddleware } from "./authMiddleware.ts";

function lcg(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function renderTuners(
  ctx: Context,
  totalTunersCount: number,
  tuners: Tuner[],
  nextCursor: string,
  isInitialLoad: boolean,
  options: FilterOptions,
) {
  const user = ctx.state.user;
  const seed = 12345;
  const random = lcg(seed);
  tuners.sort((a, b) => b.likes - a.likes || random() - 0.5);
  const processedTuners = tuners.map((tuner) => {
    return {
      ...tuner,
      canEdit: false,
    };
  });
// console.log(processedTuners);
  ctx.render("tuners.html", {
    tuners: processedTuners,
    count: totalTunersCount,
    cursor: nextCursor,
    user: ctx.state.user || { id: null, isAdmin: false },
    isInitialLoad,
    url: options.url,
  });
}

async function fetchTunersHandler(ctx: Context) {
  const requestMethod = ctx.request.method;
  const searchParams = ctx.request.url.searchParams;
  const isInitialLoad = requestMethod === "GET"; 

  const filterOptions = await extractFilterOptions(
    ctx,
    requestMethod,
    searchParams,
  );
  
  const totalTunersCount = await countTuners(filterOptions);
  if (totalTunersCount === 0) {
    ctx.render("no-results.html", {
      message: "No tuners found matching your criteria.",
    });
    return;
  }

  const searchResult = await getTuners(filterOptions);
  const nextCursor = searchResult.nextCursor || "";
  
  const processedTuners = searchResult.tuners.map((tuner) => {
    const sanitizedPrompt = sanitizeImageLinksForHTML(tuner.prompt);
    return {
      ...tuner,
      prompt: sanitizedPrompt,
      canEdit: userCanEdit(tuner, ctx.state.user),
    };
  });

  renderTuners(
    ctx,
    totalTunersCount,
    processedTuners,
    nextCursor,
    isInitialLoad,
    filterOptions,
  );
}

function isValidUrl(url: string) {
  const standardUrlPattern =
    /^https:\/\/tuner\.midjourney\.com\/[A-Za-z0-9]{7}(?:\?answer=[A-Za-z0-9]+)?$/;
  const codeUrlPattern =
    /^https:\/\/tuner\.midjourney\.com\/code\/[A-Za-z0-9]+$/;
  return standardUrlPattern.test(url) || codeUrlPattern.test(url);
}

// async function getTunerHandler(ctx: Context) {
//   const searchParams = ctx.request.url.searchParams;
//   const cursor = searchParams.get("cursor");
//   const isInitialLoad = !cursor;
//   const { limit } = getPageAndLimit(ctx, 5);
//   const tunersResult = await getTuners(cursor, limit);
//   const totalTunersCount = await getTotalTunerCount();
//   await renderTuners(ctx, totalTunersCount, tunersResult.tuners, tunersResult.nextCursor, isInitialLoad);
// }

function sanitizeImageLinksForHTML(text: string) {
  const imageUrlRegex = /https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)(\?\S*)?/gi;
  const mjRunUrlRegex = /https:\/\/s\.mj\.run\/\S+/gi;

  // Replace image URLs with [IMG]
  text = text.replace(imageUrlRegex, "[IMG]");

  // Replace s.mj.run URLs with [IMG]
  text = text.replace(mjRunUrlRegex, "[IMG]");

  return text;
}

async function extractFilterOptions(
  ctx: Context,
  requestMethod: string,
  searchParams: URLSearchParams  
): Promise<FilterOptions> {
  let likedbyuser: string[] = [];
  let cursor: string | undefined = undefined;  
  const headers = ctx.request.headers;
  const currentUrl = headers.get('HX-Current-URL');

  if (requestMethod === "POST") {
    try {
      const bodyResult = ctx.request.body({ type: "form-data" });
      const body = await bodyResult.value.read();

      const rawLikedByUser = body.fields.likedbyuser;
      cursor = body.fields.cursor;      

      if (rawLikedByUser) {
        if (typeof rawLikedByUser === "string") {
          likedbyuser = JSON.parse(rawLikedByUser);
        } else if (Array.isArray(rawLikedByUser)) {
          likedbyuser = rawLikedByUser;
        }        
      }
    } catch (error) {
      console.error("Error parsing JSON likes:", error);
      ctx.response.status = 400; // Bad Request
      return {};
    }
  }
  let queryString="";
  let query = new URLSearchParams();
  if (currentUrl) {
    const url = new URL(currentUrl);
    queryString = url.search;
    query = url.searchParams;
  }


  return {
    key: query.get("key") ?? undefined,
    size: query.get("size") ?? undefined,
    raw: query.get("raw") === "true" ? true : undefined,
    imgprompt: query.get("imgprompt") === "true" ? true : undefined,
    niji: query.get("niji") === "true" ? true : undefined,
    likedbyme: query.get("likedbyme") === "true" ? true : undefined,
    likedbyuser: likedbyuser ?? undefined,
    cursor: cursor ?? undefined,
    url: queryString,    
  };
}

// async function searchTunersHandler(ctx: Context) {
//   let likedbyuser: string[] = [];

//   if (ctx.request.method === "POST") {
//     try {
//       const bodyResult = ctx.request.body({ type: "form-data" });
//       const body = await bodyResult.value.read();
//       const rawLikedByUser = body.fields.likedbyuser;
//       if (typeof rawLikedByUser === "string") {
//         likedbyuser = JSON.parse(rawLikedByUser);
//       } else if (Array.isArray(rawLikedByUser)) {
//         likedbyuser = rawLikedByUser;
//       }
//     } catch (error) {
//       console.error("Error parsing JSON body:", error);
//       ctx.response.status = 400; // Bad Request
//       return;
//     }
//   }
//   const searchParams = ctx.request.url.searchParams;

//   const filterOptions: FilterOptions = {
//     key: searchParams.get("key") ?? undefined,
//     size: searchParams.get("size") ?? undefined,
//     raw: searchParams.get("raw") === "true" ? true : undefined,
//     imgprompt: searchParams.get("imgprompt") === "true" ? true : undefined,
//     niji: searchParams.get("niji") === "true" ? true : undefined,
//     likedbyme: searchParams.get("likedbyme") === "true" ? true : undefined,
//     likedbyuser: likedbyuser,
//   };
//   console.log("FilterOptions: ", filterOptions);
//   const cursor = searchParams.get("cursor");
//   const isInitialLoad = !cursor;
//   const { limit } = getPageAndLimit(ctx);
//   const searchResult = await searchTuners(filterOptions, cursor, limit);
//   if (!searchResult.hasResults) {
//     // Render a specific template for no results
//     ctx.render("no-results.html", {
//       message: "No tuners found matching your criteria.",
//     });
//   } else {
//     const totalTunersCount = await (countFilteredTuners(filterOptions));
//     console.log("totalTunersCount from Search:", totalTunersCount);
//     const tuners = searchResult.tuners.map((tuner) => {
//       const sanitizedPrompt = sanitizeImageLinksForHTML(tuner.prompt);
//       return {
//         ...tuner,
//         prompt: sanitizedPrompt,
//       };
//     });

//     await renderTuners(ctx, totalTunersCount, tuners, searchResult.nextCursor, isInitialLoad);
//   }
// }

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

  // await renderTuners(ctx);
  ctx.response.redirect("/tuners");
}

async function deleteTunerHandler(ctx: Context) {
  const { id } = ctx.params;
  const tuner = await getTuner(id); 
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
  // await renderTuners(ctx);
  ctx.response.redirect("/tuners");
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
  const fileExtension = imagePath.split(".").pop();
  await send(ctx, imagePath, {
    root: `${Deno.cwd()}/img`,
    index: "index.html",
  });
  if (fileExtension === "svg") {
    ctx.response.headers.set("Content-Type", "image/svg+xml");
  }
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
          <img src="/like.svg" alt="Icon to add a like">
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
  .get("/comment-smily.svg", imgHandler)
  .get("/world.svg", imgHandler)
  .get("/twitter.svg", imgHandler)
  .get("/discord.svg", imgHandler)
  .get("/cry.svg", imgHandler)
  .get("/like.svg", imgHandler)
  .get("/like-selected.svg", imgHandler)
  .get("/can-edit.svg", imgHandler)
  .get("/trash.svg", imgHandler)
  .get("/search", fetchTunersHandler)
  .post("/search", fetchTunersHandler)
  .get("/tuners", fetchTunersHandler)
  .get("/cursor/:cursor?", fetchTunersHandler)
  .get("/tuners/form/:id?", ClerkRequireAuth, tunerFormHandler)
  .get("/remove-truncate-class/:id", removeTruncateClassHandler)
  .post("/tuners", ClerkRequireAuth, createTunerHandler)
  .post("/form/url", validateUrlHandler)
  .post("/tuners/like/:id", updateLikeHandler)
  .delete("/tuners/:id", ClerkRequireAuth, deleteTunerHandler)
  .get("/logo.png", imgHandler)
  .get("/comments/:id", ClerkRequireAuth, commentFormHandler) //initial rendering of comment form
  .post("/comments", ClerkRequireAuth, createCommentHandler)
  .get("/comments/section/:id", ClerkRequireAuth, commentsSectionHandler)
  .delete("/comments/:id/:commentId", ClerkRequireAuth, deleteCommentHandler)
  .get("/authUser/likes", ClerkRequireAuth, authInitLikesHandler);
