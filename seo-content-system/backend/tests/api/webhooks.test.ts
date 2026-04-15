/**
 * Webhook API Tests
 * Phase 8.3: CRUD operations with validation and ownership checks
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { Hono } from "hono";
import { db } from "../../src/db";
import {
  users,
  webhookSubscriptions,
  webhookDeliveryHistory,
} from "../../src/db/schema";
import router from "../../src/api/webhooks";

describe("Webhook API", () => {
  const app = new Hono().route("/api/webhooks", router);

  let testUserId: string;
  let testUserId2: string;
  let testHookId: string;

  beforeEach(async () => {
    // Clean up
    await db.delete(webhookDeliveryHistory).run();
    await db.delete(webhookSubscriptions).run();
    await db.delete(users).run();

    // Create test data
    testUserId = `user-${Date.now()}`;
    testUserId2 = `user2-${Date.now()}`;

    await db.insert(users).values({
      id: testUserId,
      email: `test-${Date.now()}@example.com`,
      hashedPassword: "hashed",
      role: "user",
    });

    await db.insert(users).values({
      id: testUserId2,
      email: `test2-${Date.now()}@example.com`,
      hashedPassword: "hashed",
      role: "user",
    });
  });

  describe("POST /api/webhooks - Registration", () => {
    test("should create valid webhook with https URL", async () => {
      const res = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: ["job.completed"],
          secret: "my-secret",
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBeDefined();
      expect(data.url).toBe("https://example.com/webhooks");
      expect(data.events).toEqual(["job.completed"]);
      expect(data.isActive).toBe(true);
      expect(data.createdAt).toBeDefined();
      expect(data.secret).toBeUndefined();
    });

    test("should reject http:// URLs (not https)", async () => {
      const res = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "http://example.com/webhooks",
          events: ["job.completed"],
          secret: "my-secret",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("INVALID_URL");
    });

    test("should reject unknown event names", async () => {
      const res = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: ["unknown.event"],
          secret: "my-secret",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("INVALID_EVENTS");
    });

    test("should reject empty events array", async () => {
      const res = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: [],
          secret: "my-secret",
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("INVALID_EVENTS");
    });

    test("should reject when max subscriptions (10) exceeded", async () => {
      // Create 10 webhooks
      for (let i = 0; i < 10; i++) {
        await app.request("/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-ID": testUserId,
          },
          body: JSON.stringify({
            url: `https://example${i}.com/webhooks`,
            events: ["job.completed"],
            secret: "my-secret",
          }),
        });
      }

      // 11th should fail
      const res = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example11.com/webhooks",
          events: ["job.completed"],
          secret: "my-secret",
        }),
      });

      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.code).toBe("LIMIT_EXCEEDED");
    });
  });

  describe("GET /api/webhooks - List", () => {
    test("should return empty list for user with no webhooks", async () => {
      const res = await app.request("/", {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual([]);
    });

    test("should return user's webhooks without secret", async () => {
      // Create a webhook
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: ["job.completed", "job.failed"],
          secret: "my-secret",
        }),
      });
      const createdWebhook = await createRes.json();

      // List webhooks
      const listRes = await app.request("/", {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });

      expect(listRes.status).toBe(200);
      const data = await listRes.json();
      expect(data.length).toBe(1);
      expect(data[0].id).toBe(createdWebhook.id);
      expect(data[0].secret).toBeUndefined();
      expect(data[0].url).toBe("https://example.com/webhooks");
    });

    test("should only return webhooks for the authenticated user", async () => {
      // Create webhook for user1
      const res1 = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://user1.com/webhooks",
          events: ["job.completed"],
          secret: "secret1",
        }),
      });

      // Create webhook for user2
      await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId2,
        },
        body: JSON.stringify({
          url: "https://user2.com/webhooks",
          events: ["job.completed"],
          secret: "secret2",
        }),
      });

      // List for user1
      const listRes = await app.request("/", {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });

      expect(listRes.status).toBe(200);
      const data = await listRes.json();
      expect(data.length).toBe(1);
      expect(data[0].url).toBe("https://user1.com/webhooks");
    });
  });

  describe("DELETE /api/webhooks/:id - Delete", () => {
    test("owner can delete their webhook", async () => {
      // Create webhook
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: ["job.completed"],
          secret: "my-secret",
        }),
      });
      const webhook = await createRes.json();

      // Delete webhook
      const deleteRes = await app.request(`/${webhook.id}`, {
        method: "DELETE",
        headers: {
          "X-User-ID": testUserId,
        },
      });

      expect(deleteRes.status).toBe(200);

      // Verify deleted
      const listRes = await app.request("/", {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });
      const data = await listRes.json();
      expect(data.length).toBe(0);
    });

    test("non-owner cannot delete someone else's webhook", async () => {
      // Create webhook for user1
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://user1.com/webhooks",
          events: ["job.completed"],
          secret: "secret1",
        }),
      });
      const webhook = await createRes.json();

      // Try to delete as user2
      const deleteRes = await app.request(`/${webhook.id}`, {
        method: "DELETE",
        headers: {
          "X-User-ID": testUserId2,
        },
      });

      // Should succeed (no effect) per REST conventions
      expect(deleteRes.status).toBe(200);

      // But webhook should still exist for user1
      const listRes = await app.request("/", {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });
      const data = await listRes.json();
      expect(data.length).toBe(1);
    });
  });

  describe("POST /api/webhooks/:id/test - Test", () => {
    test("owner can test their webhook", async () => {
      // Create webhook
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: ["job.completed"],
          secret: "my-secret",
        }),
      });
      const webhook = await createRes.json();

      // Test webhook
      const testRes = await app.request(`/${webhook.id}/test`, {
        method: "POST",
        headers: {
          "X-User-ID": testUserId,
        },
      });

      expect(testRes.status).toBe(200);
      const data = await testRes.json();
      expect(data.success).toBeDefined();
    });

    test("non-owner cannot test someone else's webhook", async () => {
      // Create webhook for user1
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://user1.com/webhooks",
          events: ["job.completed"],
          secret: "secret1",
        }),
      });
      const webhook = await createRes.json();

      // Try to test as user2
      const testRes = await app.request(`/${webhook.id}/test`, {
        method: "POST",
        headers: {
          "X-User-ID": testUserId2,
        },
      });

      expect(testRes.status).toBe(404);
    });
  });

  describe("PATCH /api/webhooks/:id - Update", () => {
    test("owner can update URL", async () => {
      // Create webhook
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: ["job.completed"],
          secret: "my-secret",
        }),
      });
      const webhook = await createRes.json();

      // Update webhook
      const updateRes = await app.request(`/${webhook.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://newurl.com/webhooks",
        }),
      });

      expect(updateRes.status).toBe(200);
      const data = await updateRes.json();
      expect(data.url).toBe("https://newurl.com/webhooks");
    });

    test("owner can toggle isActive", async () => {
      // Create webhook
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: ["job.completed"],
          secret: "my-secret",
        }),
      });
      const webhook = await createRes.json();

      // Disable webhook
      const updateRes = await app.request(`/${webhook.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          isActive: false,
        }),
      });

      expect(updateRes.status).toBe(200);
      const data = await updateRes.json();
      expect(data.isActive).toBe(false);
    });

    test("non-owner cannot update", async () => {
      // Create webhook for user1
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://user1.com/webhooks",
          events: ["job.completed"],
          secret: "secret1",
        }),
      });
      const webhook = await createRes.json();

      // Try to update as user2
      const updateRes = await app.request(`/${webhook.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId2,
        },
        body: JSON.stringify({
          isActive: false,
        }),
      });

      expect(updateRes.status).toBe(404);
    });
  });

  describe("POST /api/webhooks/:id/reactivate - Reactivate", () => {
    test("reactivate disabled webhook", async () => {
      // Create webhook
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: ["job.completed"],
          secret: "my-secret",
        }),
      });
      const webhook = await createRes.json();

      // Manually disable and increment failed count
      const hookId = webhook.id;
      await db
        .update(webhookSubscriptions)
        .set({ isActive: false, failedCount: 5 })
        .where((t: any) => t.id === hookId);

      // Reactivate
      const reactivateRes = await app.request(`/${webhook.id}/reactivate`, {
        method: "POST",
        headers: {
          "X-User-ID": testUserId,
        },
      });

      expect(reactivateRes.status).toBe(200);
      const data = await reactivateRes.json();
      expect(data.isActive).toBe(true);
      expect(data.failedCount).toBe(0);
    });

    test("reactivate is idempotent for already-active webhooks", async () => {
      // Create webhook
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: ["job.completed"],
          secret: "my-secret",
        }),
      });
      const webhook = await createRes.json();

      // Reactivate already-active webhook
      const reactivateRes = await app.request(`/${webhook.id}/reactivate`, {
        method: "POST",
        headers: {
          "X-User-ID": testUserId,
        },
      });

      expect(reactivateRes.status).toBe(200);
    });

    test("non-owner cannot reactivate", async () => {
      // Create webhook for user1
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://user1.com/webhooks",
          events: ["job.completed"],
          secret: "secret1",
        }),
      });
      const webhook = await createRes.json();

      // Try to reactivate as user2
      const reactivateRes = await app.request(`/${webhook.id}/reactivate`, {
        method: "POST",
        headers: {
          "X-User-ID": testUserId2,
        },
      });

      expect(reactivateRes.status).toBe(404);
    });
  });

  describe("GET /api/webhooks/stats - Stats", () => {
    test("should return empty stats for user with no webhooks", async () => {
      const res = await app.request("/stats", {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.totalSubscriptions).toBe(0);
      expect(data.activeSubscriptions).toBe(0);
      expect(data.failedSubscriptions).toBe(0);
      expect(data.deliverySuccessRateLast7Days).toBeNull();
    });

    test("should count active and failed subscriptions", async () => {
      // Create 2 active webhooks
      for (let i = 0; i < 2; i++) {
        await app.request("/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-ID": testUserId,
          },
          body: JSON.stringify({
            url: `https://example${i}.com/webhooks`,
            events: ["job.completed"],
            secret: "secret",
          }),
        });
      }

      // Create 1 inactive webhook
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example2.com/webhooks",
          events: ["job.completed"],
          secret: "secret",
        }),
      });
      const webhook = await createRes.json();

      // Disable it
      await app.request(`/${webhook.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({ isActive: false }),
      });

      // Check stats
      const statsRes = await app.request("/stats", {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });

      const data = await statsRes.json();
      expect(data.totalSubscriptions).toBe(3);
      expect(data.activeSubscriptions).toBe(2);
      expect(data.failedSubscriptions).toBe(1);
    });

    test("should calculate success rate from recent history", async () => {
      // Create a webhook
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: ["job.completed"],
          secret: "secret",
        }),
      });
      const webhook = await createRes.json();

      // Insert 4 history records: 3 success, 1 failure
      const now = Math.floor(Date.now() / 1000);
      for (let i = 0; i < 3; i++) {
        await db.insert(webhookDeliveryHistory).values({
          id: `wdh_${i}`,
          subscriptionId: webhook.id,
          eventType: "job.completed",
          attemptedAt: now,
          statusCode: 200,
          success: true,
          durationMs: 100,
          errorMessage: null,
          attemptNumber: 1,
        });
      }
      await db.insert(webhookDeliveryHistory).values({
        id: "wdh_fail",
        subscriptionId: webhook.id,
        eventType: "job.completed",
        attemptedAt: now,
        statusCode: 500,
        success: false,
        durationMs: 100,
        errorMessage: "Server error",
        attemptNumber: 1,
      });

      // Check stats
      const statsRes = await app.request("/stats", {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });

      const data = await statsRes.json();
      expect(data.deliverySuccessRateLast7Days).toBe(0.75);
    });

    test("should exclude deliveries older than 7 days", async () => {
      // Create a webhook
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: ["job.completed"],
          secret: "secret",
        }),
      });
      const webhook = await createRes.json();

      // Insert 1 old record (8 days ago, success)
      const oldTime = Math.floor(Date.now() / 1000) - 8 * 24 * 3600;
      await db.insert(webhookDeliveryHistory).values({
        id: "wdh_old",
        subscriptionId: webhook.id,
        eventType: "job.completed",
        attemptedAt: oldTime,
        statusCode: 200,
        success: true,
        durationMs: 100,
        errorMessage: null,
        attemptNumber: 1,
      });

      // Insert 1 recent record (failure)
      const now = Math.floor(Date.now() / 1000);
      await db.insert(webhookDeliveryHistory).values({
        id: "wdh_recent",
        subscriptionId: webhook.id,
        eventType: "job.completed",
        attemptedAt: now,
        statusCode: 500,
        success: false,
        durationMs: 100,
        errorMessage: "Server error",
        attemptNumber: 1,
      });

      // Check stats - should only count recent failure (0.0 success rate, not 0.5)
      const statsRes = await app.request("/stats", {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });

      const data = await statsRes.json();
      expect(data.deliverySuccessRateLast7Days).toBe(0.0);
    });

    test("should return 401 without userId", async () => {
      const res = await app.request("/stats", {
        method: "GET",
        headers: {},
      });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/webhooks/:id/history - History", () => {
    test("should return empty array for webhook with no deliveries", async () => {
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: ["job.completed"],
          secret: "secret",
        }),
      });
      const webhook = await createRes.json();

      const historyRes = await app.request(`/${webhook.id}/history`, {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });

      expect(historyRes.status).toBe(200);
      const data = await historyRes.json();
      expect(data).toEqual([]);
    });

    test("should return history records", async () => {
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: ["job.completed"],
          secret: "secret",
        }),
      });
      const webhook = await createRes.json();

      // Insert a history record
      const now = Math.floor(Date.now() / 1000);
      await db.insert(webhookDeliveryHistory).values({
        id: "wdh_test",
        subscriptionId: webhook.id,
        eventType: "job.completed",
        attemptedAt: now,
        statusCode: 200,
        success: true,
        durationMs: 100,
        errorMessage: null,
        attemptNumber: 1,
      });

      const historyRes = await app.request(`/${webhook.id}/history`, {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });

      expect(historyRes.status).toBe(200);
      const data = await historyRes.json();
      expect(data.length).toBe(1);
      expect(data[0].id).toBe("wdh_test");
      expect(data[0].eventType).toBe("job.completed");
      expect(data[0].success).toBe(true);
    });

    test("should return 404 for webhook owned by other user", async () => {
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: ["job.completed"],
          secret: "secret",
        }),
      });
      const webhook = await createRes.json();

      const historyRes = await app.request(`/${webhook.id}/history`, {
        method: "GET",
        headers: {
          "X-User-ID": testUserId2,
        },
      });

      expect(historyRes.status).toBe(404);
    });

    test("should return 404 for non-existent webhook", async () => {
      const historyRes = await app.request("/nonexistent/history", {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });

      expect(historyRes.status).toBe(404);
    });

    test("should limit response to 50 records", async () => {
      const createRes = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example.com/webhooks",
          events: ["job.completed"],
          secret: "secret",
        }),
      });
      const webhook = await createRes.json();

      // Insert 55 records
      const now = Math.floor(Date.now() / 1000);
      for (let i = 0; i < 55; i++) {
        await db.insert(webhookDeliveryHistory).values({
          id: `wdh_${i}`,
          subscriptionId: webhook.id,
          eventType: "job.completed",
          attemptedAt: now - i,
          statusCode: 200,
          success: true,
          durationMs: 100,
          errorMessage: null,
          attemptNumber: 1,
        });
      }

      const historyRes = await app.request(`/${webhook.id}/history`, {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });

      const data = await historyRes.json();
      expect(data.length).toBe(50);
    });
  });

  describe("POST /api/webhooks/bulk - Bulk Management", () => {
    test("should bulk disable webhooks", async () => {
      // Create 2 webhooks
      const ids: string[] = [];
      for (let i = 0; i < 2; i++) {
        const createRes = await app.request("/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-ID": testUserId,
          },
          body: JSON.stringify({
            url: `https://example${i}.com/webhooks`,
            events: ["job.completed"],
            secret: "secret",
          }),
        });
        const webhook = await createRes.json();
        ids.push(webhook.id);
      }

      // Bulk disable
      const bulkRes = await app.request("/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({ ids, action: "disable" }),
      });

      expect(bulkRes.status).toBe(200);
      const data = await bulkRes.json();
      expect(data.processed).toBe(2);
      expect(data.action).toBe("disable");

      // Verify both are now inactive
      const listRes = await app.request("/", {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });
      const webhooks = await listRes.json();
      expect(webhooks.every((w: any) => !w.isActive)).toBe(true);
    });

    test("should bulk enable webhooks", async () => {
      // Create 2 disabled webhooks
      const ids: string[] = [];
      for (let i = 0; i < 2; i++) {
        const createRes = await app.request("/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-ID": testUserId,
          },
          body: JSON.stringify({
            url: `https://example${i}.com/webhooks`,
            events: ["job.completed"],
            secret: "secret",
          }),
        });
        const webhook = await createRes.json();
        ids.push(webhook.id);

        // Disable it
        await app.request(`/${webhook.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-User-ID": testUserId,
          },
          body: JSON.stringify({ isActive: false }),
        });
      }

      // Bulk enable
      const bulkRes = await app.request("/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({ ids, action: "enable" }),
      });

      expect(bulkRes.status).toBe(200);
      expect(bulkRes.json().then((d: any) => d.processed)).toBe(2);

      // Verify both are now active
      const listRes = await app.request("/", {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });
      const webhooks = await listRes.json();
      expect(webhooks.every((w: any) => w.isActive)).toBe(true);
    });

    test("should bulk delete webhooks", async () => {
      // Create 2 webhooks
      const ids: string[] = [];
      for (let i = 0; i < 2; i++) {
        const createRes = await app.request("/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-ID": testUserId,
          },
          body: JSON.stringify({
            url: `https://example${i}.com/webhooks`,
            events: ["job.completed"],
            secret: "secret",
          }),
        });
        const webhook = await createRes.json();
        ids.push(webhook.id);
      }

      // Bulk delete
      const bulkRes = await app.request("/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({ ids, action: "delete" }),
      });

      expect(bulkRes.status).toBe(200);
      const data = await bulkRes.json();
      expect(data.processed).toBe(2);

      // Verify both are deleted
      const listRes = await app.request("/", {
        method: "GET",
        headers: {
          "X-User-ID": testUserId,
        },
      });
      const webhooks = await listRes.json();
      expect(webhooks.length).toBe(0);
    });

    test("should return 403 if any ID belongs to another user", async () => {
      // Create webhook for user1
      const createRes1 = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          url: "https://example1.com/webhooks",
          events: ["job.completed"],
          secret: "secret",
        }),
      });
      const webhook1 = await createRes1.json();

      // Create webhook for user2
      const createRes2 = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId2,
        },
        body: JSON.stringify({
          url: "https://example2.com/webhooks",
          events: ["job.completed"],
          secret: "secret",
        }),
      });
      const webhook2 = await createRes2.json();

      // Try to delete both as user1 (user2's webhook ownership not allowed)
      const bulkRes = await app.request("/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({
          ids: [webhook1.id, webhook2.id],
          action: "delete",
        }),
      });

      expect(bulkRes.status).toBe(403);
    });

    test("should return 400 for empty ids array", async () => {
      const bulkRes = await app.request("/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({ ids: [], action: "disable" }),
      });

      expect(bulkRes.status).toBe(400);
    });

    test("should return 400 for invalid action", async () => {
      const bulkRes = await app.request("/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": testUserId,
        },
        body: JSON.stringify({ ids: ["id1"], action: "invalid" }),
      });

      expect(bulkRes.status).toBe(400);
    });

    test("should return 401 without userId", async () => {
      const bulkRes = await app.request("/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: ["id1"], action: "disable" }),
      });

      expect(bulkRes.status).toBe(401);
    });
  });
});
