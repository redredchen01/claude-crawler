/**
 * Webhook Routes
 * Register, list, delete, and test webhooks
 */

import { Hono } from "hono";
import { WebhookDeliveryService } from "../services/webhookDeliveryService.js";
import { db } from "../db/index.js";
import { webhookSubscriptions, webhookDeliveryHistory } from "../db/schema.js";
import { eq, and, gte, inArray, desc } from "drizzle-orm";

export const VALID_WEBHOOK_EVENTS = [
  "job.completed",
  "job.failed",
  "content_plan.generated",
  "content_plan.failed",
  "test",
] as const;

const MAX_SUBSCRIPTIONS_PER_USER = 10;

const router = new Hono();

/**
 * POST /api/webhooks
 * Register a new webhook subscription
 * Body: { url: string, events: string[], secret: string }
 * Returns: { id, url, events, isActive, createdAt }
 */
router.post("/", async (c) => {
  const userId = c.get("userId") as string | null;
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const { url, events, secret } = body;

    // Validate required fields
    if (!url || !Array.isArray(events) || !secret) {
      return c.json(
        { error: "Invalid request: url, events, and secret required" },
        400,
      );
    }

    // Validate URL format (must be https://)
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "https:") {
        return c.json(
          { error: "Invalid URL: must use https://", code: "INVALID_URL" },
          400,
        );
      }
    } catch {
      return c.json({ error: "Invalid URL format", code: "INVALID_URL" }, 400);
    }

    // Validate events array is non-empty
    if (events.length === 0) {
      return c.json(
        {
          error: "Events array must not be empty",
          code: "INVALID_EVENTS",
        },
        400,
      );
    }

    // Validate all events are in allowlist
    const invalidEvents = events.filter(
      (e: string) => !VALID_WEBHOOK_EVENTS.includes(e as any),
    );
    if (invalidEvents.length > 0) {
      return c.json(
        {
          error: `Invalid events: ${invalidEvents.join(", ")}. Valid events are: ${VALID_WEBHOOK_EVENTS.join(", ")}`,
          code: "INVALID_EVENTS",
        },
        400,
      );
    }

    // Check subscription limit
    const existingCount = await db
      .select()
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.userId, userId));

    if (existingCount.length >= MAX_SUBSCRIPTIONS_PER_USER) {
      return c.json(
        {
          error: `Maximum ${MAX_SUBSCRIPTIONS_PER_USER} webhooks per user exceeded`,
          code: "LIMIT_EXCEEDED",
        },
        422,
      );
    }

    const subscription = await WebhookDeliveryService.register(
      userId,
      url,
      events,
      secret,
    );

    // Exclude secret from response
    return c.json({
      id: subscription.id,
      url: subscription.url,
      events: subscription.events,
      isActive: subscription.isActive,
      createdAt: subscription.createdAt,
    });
  } catch (error) {
    console.error("[Webhooks] POST error:", error);
    return c.json({ error: "Failed to register webhook" }, 500);
  }
});

/**
 * GET /api/webhooks
 * List all webhook subscriptions for the current user
 * Returns: [{ id, url, events, isActive, failedCount, lastTriggeredAt?, createdAt }]
 */
router.get("/", async (c) => {
  const userId = c.get("userId") as string | null;
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const subscriptions =
      await WebhookDeliveryService.listSubscriptions(userId);

    // Exclude secret from response
    return c.json(
      subscriptions.map((s) => ({
        id: s.id,
        url: s.url,
        events: s.events,
        isActive: s.isActive,
        failedCount: s.failedCount,
        lastTriggeredAt: s.lastTriggeredAt,
        createdAt: s.createdAt,
      })),
    );
  } catch (error) {
    console.error("[Webhooks] GET error:", error);
    return c.json({ error: "Failed to fetch webhooks" }, 500);
  }
});

/**
 * GET /api/webhooks/stats
 * Get webhook statistics for the current user
 * Returns: { totalSubscriptions, activeSubscriptions, failedSubscriptions, deliverySuccessRateLast7Days }
 */
router.get("/stats", async (c) => {
  const userId = c.get("userId") as string | null;
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const subs = await db
      .select()
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.userId, userId));

    const totalSubscriptions = subs.length;
    const activeSubscriptions = subs.filter((s) => s.isActive).length;
    const failedSubscriptions = subs.filter((s) => !s.isActive).length;

    let deliverySuccessRateLast7Days: number | null = null;

    if (subs.length > 0) {
      const subIds = subs.map((s) => s.id);
      const cutoff = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

      const recentDeliveries = await db
        .select()
        .from(webhookDeliveryHistory)
        .where(
          and(
            inArray(webhookDeliveryHistory.subscriptionId, subIds),
            gte(webhookDeliveryHistory.attemptedAt, cutoff),
          ),
        );

      if (recentDeliveries.length > 0) {
        const successCount = recentDeliveries.filter((d) => d.success).length;
        deliverySuccessRateLast7Days = successCount / recentDeliveries.length;
      }
    }

    return c.json({
      totalSubscriptions,
      activeSubscriptions,
      failedSubscriptions,
      deliverySuccessRateLast7Days,
    });
  } catch (error) {
    console.error("[Webhooks] GET stats error:", error);
    return c.json({ error: "Failed to fetch stats" }, 500);
  }
});

/**
 * GET /api/webhooks/:id/history
 * Get delivery history for a webhook
 * Returns: [{ id, eventType, attemptedAt, statusCode, success, durationMs, errorMessage, attemptNumber }]
 */
router.get("/:id/history", async (c) => {
  const userId = c.get("userId") as string | null;
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const id = c.req.param("id");

    // Ownership check
    const sub = await db
      .select()
      .from(webhookSubscriptions)
      .where(
        and(
          eq(webhookSubscriptions.id, id),
          eq(webhookSubscriptions.userId, userId),
        ),
      )
      .limit(1);

    if (sub.length === 0) {
      return c.json({ error: "Webhook not found" }, 404);
    }

    const history = await db
      .select()
      .from(webhookDeliveryHistory)
      .where(eq(webhookDeliveryHistory.subscriptionId, id))
      .orderBy(desc(webhookDeliveryHistory.attemptedAt))
      .limit(50);

    return c.json(
      history.map((h) => ({
        id: h.id,
        eventType: h.eventType,
        attemptedAt: h.attemptedAt,
        statusCode: h.statusCode,
        success: h.success,
        durationMs: h.durationMs,
        errorMessage: h.errorMessage,
        attemptNumber: h.attemptNumber,
      })),
    );
  } catch (error) {
    console.error("[Webhooks] GET history error:", error);
    return c.json({ error: "Failed to fetch history" }, 500);
  }
});

/**
 * POST /api/webhooks/bulk
 * Bulk manage webhooks (enable, disable, delete)
 * Body: { ids: string[], action: "enable" | "disable" | "delete" }
 * Returns: { processed: number, action: string }
 */
router.post("/bulk", async (c) => {
  const userId = c.get("userId") as string | null;
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await c.req.json();
    const { ids, action } = body as {
      ids?: string[];
      action?: string;
    };

    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({ error: "ids must be a non-empty array" }, 400);
    }

    if (!["enable", "disable", "delete"].includes(action)) {
      return c.json(
        {
          error: 'action must be one of: "enable", "disable", "delete"',
        },
        400,
      );
    }

    // Ownership check: ensure all IDs belong to this user
    const owned = await db
      .select({ id: webhookSubscriptions.id })
      .from(webhookSubscriptions)
      .where(
        and(
          inArray(webhookSubscriptions.id, ids),
          eq(webhookSubscriptions.userId, userId),
        ),
      );

    if (owned.length !== ids.length) {
      return c.json(
        { error: "One or more webhook IDs not found or not owned" },
        403,
      );
    }

    // Execute bulk action
    if (action === "delete") {
      await db
        .delete(webhookSubscriptions)
        .where(inArray(webhookSubscriptions.id, ids));
    } else {
      await db
        .update(webhookSubscriptions)
        .set({
          isActive: action === "enable",
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .where(inArray(webhookSubscriptions.id, ids));
    }

    return c.json({ processed: ids.length, action });
  } catch (error) {
    console.error("[Webhooks] POST bulk error:", error);
    return c.json({ error: "Failed to process bulk action" }, 500);
  }
});

/**
 * DELETE /api/webhooks/:id
 * Unsubscribe from a webhook
 * Returns: { success: true }
 */
router.delete("/:id", async (c) => {
  const userId = c.get("userId") as string | null;
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const id = c.req.param("id");
    await WebhookDeliveryService.deleteSubscription(id, userId);
    return c.json({ success: true });
  } catch (error) {
    console.error("[Webhooks] DELETE error:", error);
    return c.json({ error: "Failed to delete webhook" }, 500);
  }
});

/**
 * POST /api/webhooks/:id/test
 * Send a test payload to a webhook
 * Returns: { success: boolean, statusCode?: number }
 */
router.post("/:id/test", async (c) => {
  const userId = c.get("userId") as string | null;
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const id = c.req.param("id");
    const result = await WebhookDeliveryService.testSubscription(id, userId);
    if (!result) {
      return c.json({ error: "Webhook not found" }, 404);
    }
    return c.json(result);
  } catch (error) {
    console.error("[Webhooks] POST test error:", error);
    return c.json({ error: "Failed to test webhook" }, 500);
  }
});

/**
 * PATCH /api/webhooks/:id
 * Update a webhook subscription
 * Body (all optional): { url?, events?, secret?, isActive? }
 * Returns: { id, url, events, isActive, failedCount, lastTriggeredAt, createdAt }
 */
router.patch("/:id", async (c) => {
  const userId = c.get("userId") as string | null;
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const { url, events, secret, isActive } = body;

    // Validate URL if provided
    if (url !== undefined) {
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== "https:") {
          return c.json(
            {
              error: "Invalid URL: must use https://",
              code: "INVALID_URL",
            },
            400,
          );
        }
      } catch {
        return c.json(
          { error: "Invalid URL format", code: "INVALID_URL" },
          400,
        );
      }
    }

    // Validate events if provided
    if (events !== undefined) {
      if (!Array.isArray(events) || events.length === 0) {
        return c.json(
          {
            error: "Events array must not be empty",
            code: "INVALID_EVENTS",
          },
          400,
        );
      }

      const invalidEvents = events.filter(
        (e: string) => !VALID_WEBHOOK_EVENTS.includes(e as any),
      );
      if (invalidEvents.length > 0) {
        return c.json(
          {
            error: `Invalid events: ${invalidEvents.join(", ")}. Valid events are: ${VALID_WEBHOOK_EVENTS.join(", ")}`,
            code: "INVALID_EVENTS",
          },
          400,
        );
      }
    }

    const subscription = await WebhookDeliveryService.updateSubscription(
      id,
      userId,
      { url, events, secret, isActive },
    );

    if (!subscription) {
      return c.json({ error: "Webhook not found" }, 404);
    }

    // Exclude secret from response
    return c.json({
      id: subscription.id,
      url: subscription.url,
      events: subscription.events,
      isActive: subscription.isActive,
      failedCount: subscription.failedCount,
      lastTriggeredAt: subscription.lastTriggeredAt,
      createdAt: subscription.createdAt,
    });
  } catch (error) {
    console.error("[Webhooks] PATCH error:", error);
    return c.json({ error: "Failed to update webhook" }, 500);
  }
});

/**
 * POST /api/webhooks/:id/reactivate
 * Reactivate a webhook (reset failedCount, enable)
 * Returns: { id, isActive: true, failedCount: 0, ... }
 */
router.post("/:id/reactivate", async (c) => {
  const userId = c.get("userId") as string | null;
  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const id = c.req.param("id");
    const subscription = await WebhookDeliveryService.reactivateSubscription(
      id,
      userId,
    );

    if (!subscription) {
      return c.json({ error: "Webhook not found" }, 404);
    }

    // Exclude secret from response
    return c.json({
      id: subscription.id,
      url: subscription.url,
      events: subscription.events,
      isActive: subscription.isActive,
      failedCount: subscription.failedCount,
      lastTriggeredAt: subscription.lastTriggeredAt,
      createdAt: subscription.createdAt,
    });
  } catch (error) {
    console.error("[Webhooks] POST reactivate error:", error);
    return c.json({ error: "Failed to reactivate webhook" }, 500);
  }
});

export default router;
