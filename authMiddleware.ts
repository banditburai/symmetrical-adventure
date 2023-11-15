import { fetchUserDetails, getPublicKey } from "./clerkUtils.ts";
import { verify } from "https://deno.land/x/djwt@v3.0.1/mod.ts";
import { Context } from "./deps.ts";
import { recordUserLike } from "./service.ts";
import { User } from "./service.ts";

async function verifyJWTAndGetUserDetails(
  sessionToken: string,
): Promise<User | null> {
  try {
    const publicKey = await getPublicKey();
    const payload = await verify(sessionToken, publicKey);
    if (payload && payload.sub) {
      const userDetails = await fetchUserDetails(payload.sub);
      return userDetails;
    }
    return null;
  } catch (error) {
    console.error("JWT Verification Error:", error);
    return null;
  }
}

export async function jwtAuthMiddleware(
  ctx: Context,
  next: () => Promise<unknown>,
) {
  const sessionToken = await ctx.cookies.get("__session"); 
  
  if (!sessionToken) {
    ctx.response.status = 401;
    ctx.response.body = "You must be logged in to access this";
    return;
  }

  try {
    const publicKey = await getPublicKey();
    const payload = await verify(sessionToken, publicKey);
    
    let userDetails;
    if (payload && payload.sub) {
      userDetails = await fetchUserDetails(payload.sub);
    }
    ctx.state.user = { ...ctx.state.user, ...userDetails };
    await next();
  } catch (error) {
   
    console.error("JWT Verification Error:", error);
    if (error.message === "Invalid session token") {
      ctx.response.status = 401;
      ctx.response.body = { message: "Invalid session token" };
    } else {
      ctx.response.status = 500;
      ctx.response.body = "Error processing authentication";
    }
  }
}


export async function userLikeMiddleware(
  ctx: Context,
  tunerId: string,
  liked: boolean,
) {
  const sessionToken = await ctx.cookies.get("__session");
  if (sessionToken) {
    const userDetails = await verifyJWTAndGetUserDetails(sessionToken);
    if (userDetails) {
      // Perform actions as an authenticated user
      try {
        await recordUserLike( userDetails.id, tunerId, liked);        
      } catch (error) {
        console.error("Error in userLikeMiddleware:", error);
        throw new Error("Internal server error when updating like");
      }
    }
  }
}
