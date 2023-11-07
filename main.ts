/// <reference lib="deno.unstable" />

import {Application, viewEngine, etaEngine, oakAdapter} from "./deps.ts";
import router from "./router.ts";

const app = new Application();

// Error handling middleware should be the first middleware registered
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error(err); // This will log the error to the console.
    ctx.response.status = err.status || 500; // Use the error's status or default to 500
    ctx.response.body = 'Internal Server Error'; // Provide a generic error message
    // Optionally, you could send back a view with an error page like so:
    // ctx.response.body = await renderView('error-page', { error: err.message });
  }
});

// Then use viewEngine as it might throw errors which the above middleware will catch
app.use(
  viewEngine(oakAdapter, etaEngine, {
    viewRoot: "./views"
  })
);

// Add your router
app.use(router.routes());
app.use(router.allowedMethods()); // It's good practice to also use this middleware

// Start listening for requests
await app.listen({ port: 8000 });

