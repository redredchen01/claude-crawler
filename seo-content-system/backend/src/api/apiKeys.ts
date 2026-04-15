/**
 * API Keys Routes
 * Manage API keys: create, list, revoke
 */

import { Hono } from "hono";
import { ApiKeyService } from "../services/apiKeyService.js";

const router = new Hono();

/**
 * POST /api/keys
 * Create a new API key
 * Body: { name: string, scopes: string[] }
 * Returns: { id, apiKey (plaintext), prefix, name, scopes, createdAt }
 */
router.post("/", async (c) => {
  const userId = c.get("userId") as string | null;
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const { name, scopes } = body;

    if (!name || !Array.isArray(scopes)) {
      return c.json(
        { error: "Invalid request: name and scopes required" },
        400
      );
    }

    const { apiKey, id, prefix } = await ApiKeyService.createKey(
      userId,
      name,
      scopes
    );

    const now = Math.floor(Date.now() / 1000);

    return c.json({
      id,
      apiKey, // Only time it's shown
      prefix,
      name,
      scopes,
      createdAt: now,
    });
  } catch (error) {
    console.error("[ApiKeys] POST error:", error);
    return c.json({ error: "Failed to create API key" }, 500);
  }
});

/**
 * GET /api/keys
 * List all API keys for the current user
 * Returns: [{ id, prefix, name, scopes, isActive, lastUsedAt?, createdAt }]
 */
router.get("/", async (c) => {
  const userId = c.get("userId") as string | null;
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const keys = await ApiKeyService.listKeys(userId);
    return c.json(keys);
  } catch (error) {
    console.error("[ApiKeys] GET error:", error);
    return c.json({ error: "Failed to fetch API keys" }, 500);
  }
});

/**
 * DELETE /api/keys/:id
 * Revoke an API key
 * Returns: { success: true }
 */
router.delete("/:id", async (c) => {
  const userId = c.get("userId") as string | null;
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const id = c.req.param("id");

    // Verify the key belongs to the current user
    const keys = await ApiKeyService.listKeys(userId);
    const key = keys.find((k) => k.id === id);

    if (!key) {
      return c.json({ error: "API key not found" }, 404);
    }

    await ApiKeyService.revokeKey(id, userId);
    return c.json({ success: true });
  } catch (error) {
    console.error("[ApiKeys] DELETE error:", error);
    return c.json({ error: "Failed to revoke API key" }, 500);
  }
});

export default router;
