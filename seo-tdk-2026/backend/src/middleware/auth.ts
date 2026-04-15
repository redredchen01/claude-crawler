/**
 * Authentication Middleware
 *
 * MVP: Requires x-user-id header for all requests
 */

import { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

export async function requireAuth(c: Context, next: Next) {
  const userId = c.req.header("x-user-id");

  if (!userId) {
    throw new HTTPException(401, {
      message: "Authentication required",
    });
  }

  // Store userId in context for downstream handlers
  c.set("userId", userId);

  await next();
}
