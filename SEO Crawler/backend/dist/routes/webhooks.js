/**
 * Webhook 管理 API 路由
 * POST /api/webhooks - 创建 webhook
 * GET /api/webhooks - 列表
 * GET /api/webhooks/:id - 获取单个
 * PATCH /api/webhooks/:id - 更新
 * DELETE /api/webhooks/:id - 删除
 * GET /api/webhooks/:id/attempts - 投递历史
 * GET /api/webhooks/stats - 统计
 */

import { Hono } from "hono";
import webhookService from "../services/webhookService.js";

const router = new Hono();

/**
 * POST /api/webhooks
 * 创建 webhook
 * Body: { url, events: ["job:completed", ...], filters: { minResultCount: 10, ... } }
 */
router.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { url, events, filters } = body;

    // 验证必填字段
    if (!url || typeof url !== "string") {
      return c.json({ error: "Missing or invalid 'url' field" }, 400);
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return c.json({ error: "Missing or invalid 'events' field" }, 400);
    }

    // 创建 webhook
    const webhookId = webhookService.addWebhook(url, events, filters || {});
    const config = webhookService.getWebhook(webhookId);

    return c.json(
      {
        id: config.id,
        url: config.url,
        events: config.events,
        filters: config.filters,
        enabled: config.enabled,
        createdAt: config.createdAt,
      },
      201,
    );
  } catch (err) {
    console.error("[Webhooks API] POST error:", err);
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /api/webhooks
 * 列表所有 webhooks
 */
router.get("/", (c) => {
  try {
    const webhooks = webhookService.listWebhooks().map((w) => ({
      id: w.id,
      url: w.url,
      events: w.events,
      filters: w.filters,
      enabled: w.enabled,
      createdAt: w.createdAt,
    }));

    return c.json({ webhooks });
  } catch (err) {
    console.error("[Webhooks API] GET list error:", err);
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /api/webhooks/:id
 * 获取单个 webhook + 投递计数
 */
router.get("/:id", (c) => {
  try {
    const id = c.req.param("id");
    const webhook = webhookService.getWebhook(id);

    if (!webhook) {
      return c.json({ error: "Webhook not found" }, 404);
    }

    const attempts = webhookService.getAttempts(id);

    return c.json({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      filters: webhook.filters,
      enabled: webhook.enabled,
      createdAt: webhook.createdAt,
      deliveries: attempts.length,
    });
  } catch (err) {
    console.error("[Webhooks API] GET detail error:", err);
    return c.json({ error: err.message }, 500);
  }
});

/**
 * PATCH /api/webhooks/:id
 * 更新 webhook
 */
router.patch("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();

    const webhook = webhookService.getWebhook(id);
    if (!webhook) {
      return c.json({ error: "Webhook not found" }, 404);
    }

    const updated = webhookService.updateWebhook(id, body);

    return c.json({
      id: updated.id,
      url: updated.url,
      events: updated.events,
      filters: updated.filters,
      enabled: updated.enabled,
      createdAt: updated.createdAt,
    });
  } catch (err) {
    console.error("[Webhooks API] PATCH error:", err);
    return c.json({ error: err.message }, 500);
  }
});

/**
 * DELETE /api/webhooks/:id
 * 删除 webhook
 */
router.delete("/:id", (c) => {
  try {
    const id = c.req.param("id");

    const webhook = webhookService.getWebhook(id);
    if (!webhook) {
      return c.json({ error: "Webhook not found" }, 404);
    }

    webhookService.deleteWebhook(id);

    return c.json({ deleted: true, id });
  } catch (err) {
    console.error("[Webhooks API] DELETE error:", err);
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /api/webhooks/:id/attempts
 * 获取投递历史
 */
router.get("/:id/attempts", (c) => {
  try {
    const id = c.req.param("id");

    const webhook = webhookService.getWebhook(id);
    if (!webhook) {
      return c.json({ error: "Webhook not found" }, 404);
    }

    const attempts = webhookService.getAttempts(id);

    return c.json({
      webhookId: id,
      attempts,
    });
  } catch (err) {
    console.error("[Webhooks API] GET attempts error:", err);
    return c.json({ error: err.message }, 500);
  }
});

/**
 * GET /api/webhooks/stats
 * 获取全局统计
 */
router.get("/stats/global", (c) => {
  try {
    const stats = webhookService.getStats();
    return c.json(stats);
  } catch (err) {
    console.error("[Webhooks API] GET stats error:", err);
    return c.json({ error: err.message }, 500);
  }
});

export default router;
//# sourceMappingURL=webhooks.js.map
