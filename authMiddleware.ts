import { getPublicKey } from "./clerkUtils.ts";
import { verify } from "https://deno.land/x/djwt@v3.0.1/mod.ts";
import { Context } from "./deps.ts";

export async function jwtAuthMiddleware(
  ctx: Context,
  next: () => Promise<unknown>,
) {
  const sessionToken = await ctx.cookies.get("__session"); // Get the token from the cookie
  if (!sessionToken) {
    ctx.response.status = 401;
    ctx.response.body = "You must be logged in to access this";
    return;
  }

  try {
    const publicKey = await getPublicKey();
    const payload = await verify(sessionToken, publicKey);

    // Attach payload or specific user info to ctx.state
    ctx.state.sessionToken = payload; // Attach the whole payload
    ctx.state.user = { id: payload.sub }; // Attach just the user ID
    await next(); // Proceed with the next middleware/route handler
  } catch (error) {
    // If there's an error, respond with "Invalid session token"
    console.error("JWT Verification Error:", error);
    ctx.response.status = 401;
    ctx.response.body = { message: "Invalid session token" };
  }
}
