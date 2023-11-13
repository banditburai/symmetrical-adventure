import { getPublicKey, fetchUserDetails } from "./clerkUtils.ts";
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
    let userDetails;
    if (payload && payload.sub){
        userDetails = await fetchUserDetails(payload.sub); 
    } 
    ctx.state.user = { id: payload.sub, ...userDetails }; 
    await next(); // Proceed with the next middleware/route handler only after all checks are done
  } catch (error) {
    // If there's an error, determine its nature and respond appropriately
    console.error("JWT Verification Error:", error);
    if (error.message === "Invalid session token") {
      ctx.response.status = 401;
      ctx.response.body = { message: "Invalid session token" };
    } else {
      ctx.response.status = 500;
      ctx.response.body = 'Error processing authentication';
    }
  }
}
 
