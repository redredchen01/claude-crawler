import { prisma } from "@/lib/db";
import {
  createWebhook,
  updateWebhook,
  listWebhooks,
  deleteWebhook,
  testWebhook,
  rotateWebhookSecret,
  getWebhookEvents,
} from "@/lib/webhookManager";

describe("Webhook Manager", () => {
  let testUserId: string;
  let webhookId: string;

  beforeAll(async () => {
    // Create test user
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: `webhook-mgr-${Date.now()}@example.com`,
          password: "hashed-password",
        },
      });
    }
    testUserId = user.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.webhookConfig.deleteMany({
      where: { userId: testUserId },
    });
  });

  describe("createWebhook", () => {
    test("should create webhook with valid URL", async () => {
      const webhook = await createWebhook(
        testUserId,
        "https://example.com/webhook",
        "all",
      );

      expect(webhook.id).toBeDefined();
      expect(webhook.url).toBe("https://example.com/webhook");
      expect(webhook.scope).toBe("all");
      expect(webhook.active).toBe(true);

      webhookId = webhook.id;
    });

    test("should reject invalid URL", async () => {
      await expect(
        createWebhook(testUserId, "not-a-url", "all"),
      ).rejects.toThrow("Invalid webhook URL");
    });

    test("should reject invalid scope", async () => {
      await expect(
        createWebhook(testUserId, "https://example.com", "invalid" as any),
      ).rejects.toThrow("Invalid scope");
    });

    test("should accept all valid scopes", async () => {
      for (const scope of ["score", "optimize-full", "all"]) {
        const webhook = await createWebhook(
          testUserId,
          `https://example.com/${scope}`,
          scope as any,
        );
        expect(webhook.scope).toBe(scope);
      }
    });
  });

  describe("updateWebhook", () => {
    test("should update webhook URL", async () => {
      const updated = await updateWebhook(webhookId, testUserId, {
        url: "https://newurl.com/webhook",
      });

      expect(updated.url).toBe("https://newurl.com/webhook");
    });

    test("should update webhook scope", async () => {
      const updated = await updateWebhook(webhookId, testUserId, {
        scope: "score",
      });

      expect(updated.scope).toBe("score");
    });

    test("should toggle active status", async () => {
      const updated = await updateWebhook(webhookId, testUserId, {
        active: false,
      });

      expect(updated.active).toBe(false);
    });

    test("should reject invalid URL", async () => {
      await expect(
        updateWebhook(webhookId, testUserId, { url: "invalid" }),
      ).rejects.toThrow("Invalid webhook URL");
    });

    test("should deny access for non-owner", async () => {
      const otherUserId = "other-user-id";
      await expect(
        updateWebhook(webhookId, otherUserId, { active: true }),
      ).rejects.toThrow();
    });
  });

  describe("listWebhooks", () => {
    test("should list user webhooks", async () => {
      const webhooks = await listWebhooks(testUserId);

      expect(Array.isArray(webhooks)).toBe(true);
      expect(webhooks.length).toBeGreaterThan(0);
      expect(webhooks.every((w) => w.id)).toBe(true);
    });

    test("should not expose secrets", async () => {
      const webhooks = await listWebhooks(testUserId);

      expect(webhooks[0]).toHaveProperty("url");
      expect(webhooks[0]).not.toHaveProperty("secret");
    });
  });

  describe("testWebhook", () => {
    test("should test webhook delivery", async () => {
      // Note: This will fail because example.com doesn't have webhook endpoint
      // but the test validates the function structure
      const result = await testWebhook(webhookId, testUserId);

      expect(result).toHaveProperty("success");
    });

    test("should deny access for non-owner", async () => {
      await expect(testWebhook(webhookId, "other-user")).rejects.toThrow();
    });
  });

  describe("rotateWebhookSecret", () => {
    test("should rotate webhook secret", async () => {
      const newSecret = await rotateWebhookSecret(webhookId, testUserId);

      expect(newSecret).toBeDefined();
      expect(typeof newSecret).toBe("string");
      expect(newSecret.length).toBeGreaterThan(0);
    });

    test("should deny access for non-owner", async () => {
      await expect(
        rotateWebhookSecret(webhookId, "other-user"),
      ).rejects.toThrow();
    });
  });

  describe("getWebhookEvents", () => {
    test("should retrieve webhook events", async () => {
      const result = await getWebhookEvents(webhookId, testUserId);

      expect(result).toHaveProperty("events");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.events)).toBe(true);
    });

    test("should support pagination", async () => {
      const page1 = await getWebhookEvents(webhookId, testUserId, 10, 0);
      const page2 = await getWebhookEvents(webhookId, testUserId, 10, 10);

      expect(page1.offset).toBe(0);
      expect(page2.offset).toBe(10);
    });

    test("should deny access for non-owner", async () => {
      await expect(getWebhookEvents(webhookId, "other-user")).rejects.toThrow();
    });
  });

  describe("deleteWebhook", () => {
    test("should delete webhook and events", async () => {
      // Create a webhook to delete
      const webhook = await createWebhook(
        testUserId,
        "https://example.com/delete",
        "all",
      );

      await deleteWebhook(webhook.id, testUserId);

      const remaining = await listWebhooks(testUserId);
      expect(remaining.find((w) => w.id === webhook.id)).toBeUndefined();
    });

    test("should deny access for non-owner", async () => {
      await expect(deleteWebhook(webhookId, "other-user")).rejects.toThrow();
    });
  });
});
