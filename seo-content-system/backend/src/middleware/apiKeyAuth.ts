/**
 * API Key Authentication Middleware
 * Supports Authorization: Bearer sk-xxx, x-api-key: sk-xxx, and x-user-id fallback
 */

import { Context, Next } from "hono";
import { ApiKeyService } from "../services/apiKeyService.js";

/**
 * Main auth middleware
 * Checks Authorization header, x-api-key header, then x-user-id fallback
 */
export async function apiKeyAuth(c: Context, next: Next) {
  let userId: string | null = null;
  let scopes: string[] = [];

  // 1. Try Authorization: Bearer sk-xxx
  const authHeader = c.req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const apiKey = authHeader.substring(7); // Remove "Bearer "
    const result = await ApiKeyService.validateKey(apiKey);
    if (result) {
      userId = result.userId;
      scopes = result.scopes;
    } else {
      // Invalid API key
      return c.json({ error: "Invalid API key" }, 401, {
        "WWW-Authenticate": "Bearer",
      });
    }
  }

  // 2. Fall back to x-api-key header
  if (!userId) {
    const apiKeyHeader = c.req.header("x-api-key");
    if (apiKeyHeader) {
      const result = await ApiKeyService.validateKey(apiKeyHeader);
      if (result) {
        userId = result.userId;
        scopes = result.scopes;
      } else {
        // Invalid API key
        return c.json({ error: "Invalid API key" }, 401, {
          "WWW-Authenticate": "Bearer",
        });
      }
    }
  }

  // 3. Fall back to x-user-id for backward compatibility
  if (!userId) {
    const userIdHeader = c.req.header("x-user-id");
    if (userIdHeader) {
      userId = userIdHeader;
      // No scopes for x-user-id fallback
    }
  }

  // Set context values (even if userId is null, routes can check)
  c.set("userId", userId);
  c.set("scopes", scopes);

  await next();
}

/**
 * Factory function to require a specific scope
 * Use as: `app.get("/endpoint", requireScope("write"), handler)`
 */
export function requireScope(requiredScope: string) {
  return async (c: Context, next: Next) => {
    const scopes = c.get("scopes") as string[] | undefined;

    if (!scopes || !scopes.includes(requiredScope)) {
      return c.json(
        { error: `Scope '${requiredScope}' required` },
        403
      );
    }

    await next();
  };
}
