import { Hono, Context } from "hono";
import { TokenService, JwtPayload } from "./tokenService";
import { userRepository } from "../repositories/userRepository";

export interface AuthContext {
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

/**
 * JWT Authentication Middleware
 */
export async function authMiddleware(c: Context, next: Function) {
  const authHeader = c.req.header("Authorization");
  const token = TokenService.extractTokenFromHeader(authHeader);

  if (!token) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const payload = TokenService.verifyToken(token);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  // Attach user info to context
  c.set("user", {
    id: payload.userId,
    username: payload.username,
    role: payload.role,
  });

  await next();
}

/**
 * API Key Authentication Middleware
 */
export async function apiKeyMiddleware(c: Context, next: Function) {
  const apiKey = c.req.header("X-API-Key");

  if (!apiKey) {
    return c.json({ error: "Missing X-API-Key header" }, 401);
  }

  // Hash the provided key and look up in database
  const keyHash = TokenService.hashApiKey(apiKey);
  const storedKey = await userRepository.getApiKeyByHash(keyHash);

  if (!storedKey) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  if (!storedKey.isActive) {
    return c.json({ error: "API key is disabled" }, 401);
  }

  if (storedKey.expiresAt && storedKey.expiresAt < new Date()) {
    return c.json({ error: "API key has expired" }, 401);
  }

  // Update last used time (async, don't wait)
  userRepository.updateApiKeyLastUsed(keyHash).catch((err) => {
    console.error("[Auth] Failed to update API key last_used_at:", err);
  });

  // Get user details
  const user = await userRepository.getUser(storedKey.userId);
  if (!user || !user.isActive) {
    return c.json({ error: "User not found or inactive" }, 401);
  }

  // Attach user info to context
  c.set("user", {
    id: user.id,
    username: user.username,
    role: user.role,
  });

  await next();
}

/**
 * Combined Auth Middleware - Accept either JWT or API Key
 */
export async function flexibleAuthMiddleware(c: Context, next: Function) {
  const authHeader = c.req.header("Authorization");
  const apiKey = c.req.header("X-API-Key");

  if (!authHeader && !apiKey) {
    return c.json({ error: "Missing Authorization header or X-API-Key" }, 401);
  }

  // Try JWT first
  if (authHeader) {
    const token = TokenService.extractTokenFromHeader(authHeader);
    if (token) {
      const payload = TokenService.verifyToken(token);
      if (payload) {
        c.set("user", {
          id: payload.userId,
          username: payload.username,
          role: payload.role,
        });
        await next();
        return;
      }
    }
  }

  // Try API Key
  if (apiKey) {
    const keyHash = TokenService.hashApiKey(apiKey);
    const storedKey = await userRepository.getApiKeyByHash(keyHash);

    if (storedKey && storedKey.isActive) {
      if (!storedKey.expiresAt || storedKey.expiresAt >= new Date()) {
        const user = await userRepository.getUser(storedKey.userId);
        if (user && user.isActive) {
          userRepository.updateApiKeyLastUsed(keyHash).catch((err) => {
            console.error("[Auth] Failed to update API key last_used_at:", err);
          });

          c.set("user", {
            id: user.id,
            username: user.username,
            role: user.role,
          });
          await next();
          return;
        }
      }
    }
  }

  return c.json({ error: "Invalid or expired credentials" }, 401);
}

/**
 * RBAC Middleware - Check user role
 */
export function requireRole(...allowedRoles: string[]) {
  return async (c: Context, next: Function) => {
    const user = c.get("user");

    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!allowedRoles.includes(user.role)) {
      return c.json(
        {
          error: "Forbidden",
          message: `This action requires one of these roles: ${allowedRoles.join(", ")}`,
        },
        403,
      );
    }

    await next();
  };
}

/**
 * Get current user from context
 */
export function getCurrentUser(c: Context) {
  return c.get("user");
}

/**
 * Get current user ID from context
 */
export function getUserId(c: Context): number | null {
  const user = c.get("user");
  return user?.id || null;
}
