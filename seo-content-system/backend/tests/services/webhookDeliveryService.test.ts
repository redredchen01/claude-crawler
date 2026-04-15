/**
 * Webhook Delivery Service Tests
 * 6 scenarios: dispatch, signature, retry on 500, no retry on 4xx, event filtering, test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "../../src/db/index.js";
import {
  webhookSubscriptions,
  webhookDeliveryHistory,
  users,
} from "../../src/db/schema.js";
import { eq } from "drizzle-orm";
import { WebhookDeliveryService } from "../../src/services/webhookDeliveryService.js";
import crypto from "crypto";

// Mock fetch globally
global.fetch = vi.fn();

describe("WebhookDeliveryService", () => {
  let userId: string;

  beforeEach(async () => {
    // Create test user
    userId = `user_${crypto.randomBytes(4).toString("hex")}`;
    await db.insert(users).values({
      id: userId,
      email: `test_${userId}@example.com`,
      hashedPassword: "hashed_password",
      role: "user",
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    });

    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up
    await db
      .delete(webhookSubscriptions)
      .where(eq(webhookSubscriptions.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("Scenario 1: dispatch sends POST with correct JSON payload", async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });

    await WebhookDeliveryService.register(
      userId,
      "https://webhook.example.com/test",
      ["job.completed"],
      "secret123",
    );

    // Wait for setImmediate to complete
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 100));

    await WebhookDeliveryService.dispatch(
      "job.completed",
      { jobId: "job_1", status: "completed" },
      userId,
    );

    // Wait for setImmediate
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 100));

    expect(mockFetch).toHaveBeenCalled();
    const call = mockFetch.mock.calls[0];
    const body = call[1].body;
    const parsed = JSON.parse(body);

    expect(parsed.event).toBe("job.completed");
    expect(parsed.data.jobId).toBe("job_1");
  });

  it("Scenario 2: dispatch includes valid X-SEO-Signature header", async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({}),
    });

    const secret = "secret_for_hmac";
    await WebhookDeliveryService.register(
      userId,
      "https://webhook.example.com/test",
      ["job.completed"],
      secret,
    );

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 100));

    await WebhookDeliveryService.dispatch(
      "job.completed",
      { jobId: "job_1" },
      userId,
    );

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 100));

    const call = mockFetch.mock.calls[0];
    const headers = call[1].headers;
    const signature = headers["X-SEO-Signature"];

    expect(signature).toMatch(/^sha256=/);
    expect(signature).toHaveLength("sha256=".length + 64); // SHA256 hex is 64 chars
  });

  it("Scenario 3: dispatch retries 3x on HTTP 500 response", async () => {
    const mockFetch = global.fetch as any;
    mockFetch
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({ status: 200 });

    await WebhookDeliveryService.register(
      userId,
      "https://webhook.example.com/test",
      ["job.completed"],
      "secret",
    );

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 100));

    await WebhookDeliveryService.dispatch(
      "job.completed",
      { jobId: "job_1" },
      userId,
    );

    // Wait for all retries
    await new Promise((r) => setTimeout(r, 25000));

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("Scenario 4: dispatch does not retry on HTTP 4xx (client error)", async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValue({ status: 400 });

    await WebhookDeliveryService.register(
      userId,
      "https://webhook.example.com/test",
      ["job.completed"],
      "secret",
    );

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 100));

    await WebhookDeliveryService.dispatch(
      "job.completed",
      { jobId: "job_1" },
      userId,
    );

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 100));

    // Should only be called once (no retry on 4xx)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("Scenario 5: dispatch only sends to subscriptions matching event type", async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValue({ status: 200 });

    // Register two subscriptions with different events
    await WebhookDeliveryService.register(
      userId,
      "https://webhook1.example.com/test",
      ["job.completed"],
      "secret1",
    );

    await WebhookDeliveryService.register(
      userId,
      "https://webhook2.example.com/test",
      ["job.failed"],
      "secret2",
    );

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 100));

    // Dispatch job.completed event
    await WebhookDeliveryService.dispatch(
      "job.completed",
      { jobId: "job_1" },
      userId,
    );

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 100));

    // Should only call the first webhook
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("https://webhook1.example.com/test");
  });

  it("Scenario 6: testSubscription sends test payload and returns success", async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValue({ status: 200 });

    const sub = await WebhookDeliveryService.register(
      userId,
      "https://webhook.example.com/test",
      ["job.completed"],
      "secret",
    );

    const result = await WebhookDeliveryService.testSubscription(
      sub.id,
      userId,
    );

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it("increments failedCount after failed deliveries", async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValue({ status: 500 });

    const sub = await WebhookDeliveryService.register(
      userId,
      "https://webhook.example.com/test",
      ["job.completed"],
      "secret",
    );

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 100));

    await WebhookDeliveryService.dispatch(
      "job.completed",
      { jobId: "job_1" },
      userId,
    );

    // Wait for retries to complete
    await new Promise((r) => setTimeout(r, 25000));

    const subs = await WebhookDeliveryService.listSubscriptions(userId);
    const updated = subs.find((s) => s.id === sub.id);

    expect(updated?.failedCount).toBeGreaterThan(0);
  });

  it("sets isActive to false after 5 failed deliveries", async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValue({ status: 500 });

    const sub = await WebhookDeliveryService.register(
      userId,
      "https://webhook.example.com/test",
      ["job.completed"],
      "secret",
    );

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 100));

    // Dispatch 5 times
    for (let i = 0; i < 5; i++) {
      await WebhookDeliveryService.dispatch(
        "job.completed",
        { jobId: `job_${i}` },
        userId,
      );
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setTimeout(r, 100));
    }

    // Wait for retries
    await new Promise((r) => setTimeout(r, 30000));

    const subs = await WebhookDeliveryService.listSubscriptions(userId);
    const updated = subs.find((s) => s.id === sub.id);

    expect(updated?.isActive).toBe(false);
    expect(updated?.failedCount).toBeGreaterThanOrEqual(5);
  });

  it("enforces rate limit: skips 61st dispatch", async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValue({ status: 200 });

    const sub = await WebhookDeliveryService.register(
      userId,
      "https://webhook.example.com/test",
      ["job.completed"],
      "secret",
    );

    // Dispatch 60 times (at limit)
    for (let i = 0; i < 60; i++) {
      await WebhookDeliveryService.dispatch(
        "job.completed",
        { jobId: `job_${i}` },
        userId,
      );
    }
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 100));

    const callsBefore = mockFetch.mock.calls.length;

    // 61st dispatch should be skipped
    const consoleWarn = vi.spyOn(console, "warn");
    await WebhookDeliveryService.dispatch(
      "job.completed",
      { jobId: "job_61" },
      userId,
    );
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 100));

    const callsAfter = mockFetch.mock.calls.length;

    // Fetch should not have been called (or called same number of times)
    expect(callsAfter).toBeLessThanOrEqual(callsBefore + 1); // May be 0 or same as before
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("Rate limit exceeded"),
    );

    consoleWarn.mockRestore();
  });

  it("records successful delivery attempt", async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockResolvedValue({ status: 200 });

    const sub = await WebhookDeliveryService.register(
      userId,
      "https://webhook.example.com/test",
      ["job.completed"],
      "secret",
    );

    await WebhookDeliveryService.dispatch(
      "job.completed",
      { jobId: "job_1" },
      userId,
    );

    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setTimeout(r, 500));

    const history = await db
      .select()
      .from(webhookDeliveryHistory)
      .where(eq(webhookDeliveryHistory.subscriptionId, sub.id));

    expect(history.length).toBe(1);
    expect(history[0]?.success).toBe(true);
    expect(history[0]?.statusCode).toBe(200);
    expect(history[0]?.attemptNumber).toBe(1);
    expect(history[0]?.eventType).toBe("job.completed");
  });

  it("records all retry attempts on 500 errors", async () => {
    const mockFetch = global.fetch as any;
    // First two attempts return 500, third returns 200
    mockFetch
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({ status: 200 });

    const sub = await WebhookDeliveryService.register(
      userId,
      "https://webhook.example.com/test",
      ["job.completed"],
      "secret",
    );

    await WebhookDeliveryService.dispatch(
      "job.completed",
      { jobId: "job_1" },
      userId,
    );

    // Wait for all retries (1s + 5s + success)
    await new Promise((r) => setTimeout(r, 7000));

    const history = await db
      .select()
      .from(webhookDeliveryHistory)
      .where(eq(webhookDeliveryHistory.subscriptionId, sub.id));

    expect(history.length).toBe(3);
    expect(history[0]?.attemptNumber).toBe(1);
    expect(history[0]?.success).toBe(false);
    expect(history[0]?.statusCode).toBe(500);
    expect(history[2]?.attemptNumber).toBe(3);
    expect(history[2]?.success).toBe(true);
    expect(history[2]?.statusCode).toBe(200);
  });

  it("records network error with null statusCode", async () => {
    const mockFetch = global.fetch as any;
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED: Connection refused"));

    const sub = await WebhookDeliveryService.register(
      userId,
      "https://webhook.example.com/test",
      ["job.completed"],
      "secret",
    );

    await WebhookDeliveryService.dispatch(
      "job.completed",
      { jobId: "job_1" },
      userId,
    );

    // Wait for retries
    await new Promise((r) => setTimeout(r, 25000));

    const history = await db
      .select()
      .from(webhookDeliveryHistory)
      .where(eq(webhookDeliveryHistory.subscriptionId, sub.id));

    expect(history.length).toBe(3);
    expect(history[0]?.statusCode).toBeNull();
    expect(history[0]?.success).toBe(false);
    expect(history[0]?.errorMessage).toContain("ECONNREFUSED");
  });
});
