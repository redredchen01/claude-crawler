import { Hono } from "hono";
import { TokenService } from "../auth/tokenService";
import {
  authMiddleware,
  apiKeyMiddleware,
  requireRole,
  getUserId,
} from "../auth/middleware";
import { userRepository } from "../repositories/userRepository";
import { loginRateLimit } from "../middleware/rateLimitMiddleware";

const router = new Hono();

// ============== Registration ==============
/**
 * POST /auth/register
 * Create new user account
 */
router.post("/register", async (c) => {
  try {
    const body = await c.req.json();
    const { username, email, password, role } = body;

    // Validate input
    if (!username || !email || !password) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    // Check if user already exists
    const existing = await userRepository.getUserByEmail(email);
    if (existing) {
      return c.json({ error: "Email already registered" }, 409);
    }

    // Create user
    const passwordHash = TokenService.hashPassword(password);
    const user = await userRepository.createUser({
      username,
      email,
      passwordHash,
      role: role || "viewer",
    });

    // Generate token
    const token = TokenService.generateToken(
      user!.id,
      user!.username,
      user!.role,
    );

    return c.json(
      {
        id: user!.id,
        username: user!.username,
        email: user!.email,
        role: user!.role,
        token,
      },
      201,
    );
  } catch (err) {
    console.error("[Auth] Registration error:", err);
    return c.json({ error: "Registration failed" }, 500);
  }
});

// ============== Login ==============
/**
 * POST /auth/login
 * Authenticate user with email and password
 */
router.post("/login", loginRateLimit, async (c) => {
  try {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({ error: "Email and password required" }, 400);
    }

    // Find user
    const user = await userRepository.getUserByEmail(email);
    if (!user) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    if (!user.isActive) {
      return c.json({ error: "User account is disabled" }, 401);
    }

    // Verify password
    if (!TokenService.verifyPassword(password, user.passwordHash)) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    // Generate token
    const token = TokenService.generateToken(user.id, user.username, user.role);

    return c.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      token,
    });
  } catch (err) {
    console.error("[Auth] Login error:", err);
    return c.json({ error: "Login failed" }, 500);
  }
});

// ============== Verify Token ==============
/**
 * GET /auth/verify
 * Verify current JWT token
 */
router.get("/verify", authMiddleware, async (c) => {
  const user = (c.get as any)("user");
  return c.json({ user, valid: true });
});

// ============== API Keys ==============
/**
 * POST /auth/api-keys
 * Generate new API key for current user
 */
router.post("/api-keys", authMiddleware, async (c) => {
  try {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "User not found" }, 401);
    }

    const body = await c.req.json();
    const { name, expiresAt } = body;

    if (!name) {
      return c.json({ error: "API key name required" }, 400);
    }

    // Generate API key
    const apiKey = TokenService.generateApiKey();
    const keyHash = TokenService.hashApiKey(apiKey);

    // Store in database
    const stored = await userRepository.createApiKey({
      userId,
      keyHash,
      name,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    // Return key (only shown once)
    return c.json(
      {
        id: stored!.id,
        key: apiKey, // Only return once!
        name: stored!.name,
        createdAt: stored!.createdAt,
        expiresAt: stored!.expiresAt,
      },
      201,
    );
  } catch (err) {
    console.error("[Auth] API key generation error:", err);
    return c.json({ error: "Failed to generate API key" }, 500);
  }
});

/**
 * GET /auth/api-keys
 * List API keys for current user
 */
router.get("/api-keys", authMiddleware, async (c) => {
  try {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "User not found" }, 401);
    }

    const keys = await userRepository.getUserApiKeys(userId);

    return c.json({
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
        expiresAt: k.expiresAt,
        isActive: k.isActive,
      })),
    });
  } catch (err) {
    console.error("[Auth] Failed to list API keys:", err);
    return c.json({ error: "Failed to list API keys" }, 500);
  }
});

/**
 * DELETE /auth/api-keys/:keyId
 * Revoke API key
 */
router.delete("/api-keys/:keyId", authMiddleware, async (c) => {
  try {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "User not found" }, 401);
    }

    const keyIdStr = c.req.param("keyId");
    if (!keyIdStr) {
      return c.json({ error: "Key ID required" }, 400);
    }

    const keyId = parseInt(keyIdStr);

    // Verify key belongs to user (in production, add this check)
    await userRepository.deleteApiKey(keyId);

    return c.json({ deleted: true });
  } catch (err) {
    console.error("[Auth] API key deletion error:", err);
    return c.json({ error: "Failed to delete API key" }, 500);
  }
});

// ============== User Management ==============
/**
 * GET /auth/me
 * Get current user profile
 */
router.get("/me", authMiddleware, async (c) => {
  try {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "User not found" }, 401);
    }

    const user = await userRepository.getUser(userId);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error("[Auth] Failed to get user profile:", err);
    return c.json({ error: "Failed to get user profile" }, 500);
  }
});

/**
 * PATCH /auth/me
 * Update current user profile
 */
router.patch("/me", authMiddleware, async (c) => {
  try {
    const userId = getUserId(c);
    if (!userId) {
      return c.json({ error: "User not found" }, 401);
    }

    const body = await c.req.json();
    const { email, password } = body;

    const updates: any = {};
    if (email) updates.email = email;
    if (password) updates.passwordHash = TokenService.hashPassword(password);

    if (Object.keys(updates).length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    const updated = await userRepository.updateUser(userId, updates);

    return c.json({
      id: updated!.id,
      username: updated!.username,
      email: updated!.email,
      role: updated!.role,
    });
  } catch (err) {
    console.error("[Auth] Profile update error:", err);
    return c.json({ error: "Failed to update profile" }, 500);
  }
});

export default router;
