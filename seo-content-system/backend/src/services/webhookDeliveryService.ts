/**
 * Webhook Delivery Service
 * Manages webhook subscriptions and delivers events asynchronously
 */

import crypto from "crypto";
import { db } from "../db/index.js";
import { webhookSubscriptions, webhookDeliveryHistory } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

export interface WebhookSubscription {
  id: string;
  userId: string;
  url: string;
  events: string[];
  isActive: boolean;
  failedCount: number;
  lastTriggeredAt?: number;
  createdAt: number;
}

const RETRY_DELAYS = [1000, 5000, 15000]; // ms
const MAX_DISPATCHES_PER_USER_PER_MINUTE = 60;
const DISPATCH_WINDOW_MS = 60_000;

// Module-level Map for rate limiting: userId → array of dispatch timestamps
const dispatchTimestamps = new Map<string, number[]>();

export class WebhookDeliveryService {
  /**
   * Register a new webhook subscription
   */
  static async register(
    userId: string,
    url: string,
    events: string[],
    secret: string,
  ): Promise<WebhookSubscription> {
    const id = `hook_${crypto.randomBytes(8).toString("hex")}`;
    const now = Math.floor(Date.now() / 1000);

    await db.insert(webhookSubscriptions).values({
      id,
      userId,
      url,
      events: JSON.stringify(events),
      secret,
      isActive: true,
      failedCount: 0,
      createdAt: now,
    });

    return {
      id,
      userId,
      url,
      events,
      isActive: true,
      failedCount: 0,
      createdAt: now,
    };
  }

  /**
   * Check and enforce rate limit on webhook dispatches per user per minute
   * Returns false if limit exceeded, true if allowed
   */
  private static checkDispatchRateLimit(userId: string): boolean {
    const now = Date.now();
    const timestamps = dispatchTimestamps.get(userId) ?? [];

    // Filter to timestamps within the window
    const recent = timestamps.filter((t) => now - t < DISPATCH_WINDOW_MS);

    // Check if limit exceeded
    if (recent.length >= MAX_DISPATCHES_PER_USER_PER_MINUTE) {
      return false;
    }

    // Record this dispatch and update the map
    recent.push(now);
    dispatchTimestamps.set(userId, recent);
    return true;
  }

  /**
   * Dispatch an event to all matching subscriptions
   * Fire-and-forget via setImmediate to avoid blocking
   */
  static async dispatch(
    event: string,
    payload: object,
    userId: string,
  ): Promise<void> {
    setImmediate(async () => {
      try {
        // Rate limit check — skip dispatch if limit exceeded
        if (!this.checkDispatchRateLimit(userId)) {
          console.warn(
            `[WebhookDelivery] Rate limit exceeded for userId=${userId}, event=${event}. Skipping dispatch.`,
          );
          return;
        }

        const subs = await db.query.webhookSubscriptions.findMany({
          where: eq(webhookSubscriptions.userId, userId),
        });

        for (const sub of subs) {
          if (!sub.isActive) continue;

          const events = JSON.parse(sub.events) as string[];
          if (!events.includes(event)) continue;

          // Dispatch to this subscription
          this.deliverToSubscription(sub, event, payload);
        }
      } catch (error) {
        console.error("[WebhookDelivery] dispatch error:", error);
      }
    });
  }

  /**
   * Test a subscription by sending a test payload
   */
  static async testSubscription(
    id: string,
    userId: string,
  ): Promise<{ success: boolean; statusCode?: number } | null> {
    const sub = await db.query.webhookSubscriptions.findFirst({
      where: and(
        eq(webhookSubscriptions.id, id),
        eq(webhookSubscriptions.userId, userId),
      ),
    });

    if (!sub) {
      return null;
    }

    const testPayload = {
      event: "test",
      timestamp: Math.floor(Date.now() / 1000),
      data: { message: "Test webhook payload" },
    };

    try {
      const statusCode = await this.sendWithRetry(sub, "test", testPayload);
      return { success: true, statusCode };
    } catch (error) {
      return { success: false };
    }
  }

  /**
   * List all subscriptions for a user
   */
  static async listSubscriptions(
    userId: string,
  ): Promise<WebhookSubscription[]> {
    const records = await db.query.webhookSubscriptions.findMany({
      where: eq(webhookSubscriptions.userId, userId),
    });

    return records.map((r) => ({
      id: r.id,
      userId: r.userId,
      url: r.url,
      events: JSON.parse(r.events) as string[],
      isActive: r.isActive,
      failedCount: r.failedCount,
      lastTriggeredAt: r.lastTriggeredAt || undefined,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Delete a webhook subscription
   */
  static async deleteSubscription(id: string, userId: string): Promise<void> {
    await db
      .delete(webhookSubscriptions)
      .where(
        and(
          eq(webhookSubscriptions.id, id),
          eq(webhookSubscriptions.userId, userId),
        ),
      );
  }

  /**
   * Update a webhook subscription
   */
  static async updateSubscription(
    id: string,
    userId: string,
    updates: {
      url?: string;
      events?: string[];
      secret?: string;
      isActive?: boolean;
    },
  ): Promise<WebhookSubscription | null> {
    const sub = await db.query.webhookSubscriptions.findFirst({
      where: and(
        eq(webhookSubscriptions.id, id),
        eq(webhookSubscriptions.userId, userId),
      ),
    });

    if (!sub) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const updateData: Record<string, any> = { updatedAt: now };

    if (updates.url !== undefined) {
      updateData.url = updates.url;
    }
    if (updates.events !== undefined) {
      updateData.events = JSON.stringify(updates.events);
    }
    if (updates.secret !== undefined) {
      updateData.secret = updates.secret;
    }
    if (updates.isActive !== undefined) {
      updateData.isActive = updates.isActive;
    }

    await db
      .update(webhookSubscriptions)
      .set(updateData)
      .where(
        and(
          eq(webhookSubscriptions.id, id),
          eq(webhookSubscriptions.userId, userId),
        ),
      );

    return this.getSubscription(id, userId);
  }

  /**
   * Reactivate a webhook subscription (reset failedCount, enable)
   */
  static async reactivateSubscription(
    id: string,
    userId: string,
  ): Promise<WebhookSubscription | null> {
    const sub = await db.query.webhookSubscriptions.findFirst({
      where: and(
        eq(webhookSubscriptions.id, id),
        eq(webhookSubscriptions.userId, userId),
      ),
    });

    if (!sub) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    await db
      .update(webhookSubscriptions)
      .set({
        isActive: true,
        failedCount: 0,
        updatedAt: now,
      })
      .where(
        and(
          eq(webhookSubscriptions.id, id),
          eq(webhookSubscriptions.userId, userId),
        ),
      );

    return this.getSubscription(id, userId);
  }

  /**
   * Get a single subscription (with ownership check)
   */
  private static async getSubscription(
    id: string,
    userId: string,
  ): Promise<WebhookSubscription | null> {
    const record = await db.query.webhookSubscriptions.findFirst({
      where: and(
        eq(webhookSubscriptions.id, id),
        eq(webhookSubscriptions.userId, userId),
      ),
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      userId: record.userId,
      url: record.url,
      events: JSON.parse(record.events) as string[],
      isActive: record.isActive,
      failedCount: record.failedCount,
      lastTriggeredAt: record.lastTriggeredAt || undefined,
      createdAt: record.createdAt,
    };
  }

  /**
   * Internal: Deliver to a single subscription with retries
   */
  private static async deliverToSubscription(
    sub: any,
    event: string,
    payload: object,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    const fullPayload = {
      event,
      timestamp: now,
      data: payload,
    };

    try {
      const statusCode = await this.sendWithRetry(sub, event, fullPayload);
      // On success, reset failedCount
      await db
        .update(webhookSubscriptions)
        .set({
          lastTriggeredAt: now,
          failedCount: 0,
        })
        .where(eq(webhookSubscriptions.id, sub.id));
    } catch (error) {
      // Increment failedCount
      const newFailedCount = (sub.failedCount || 0) + 1;

      await db
        .update(webhookSubscriptions)
        .set({
          lastTriggeredAt: now,
          failedCount: newFailedCount,
          isActive: newFailedCount >= 5 ? false : sub.isActive,
        })
        .where(eq(webhookSubscriptions.id, sub.id));

      console.warn(
        `[WebhookDelivery] Failed to deliver to ${sub.url}, failedCount=${newFailedCount}`,
        error,
      );
    }
  }

  /**
   * Record a delivery attempt to history table
   */
  private static async recordAttempt(
    subscriptionId: string,
    event: string,
    attemptNumber: number,
    attemptedAt: number,
    durationMs: number,
    success: boolean,
    statusCode: number | null,
    errorMessage: string | null,
  ): Promise<void> {
    await db.insert(webhookDeliveryHistory).values({
      id: `wdh_${crypto.randomBytes(8).toString("hex")}`,
      subscriptionId,
      eventType: event,
      attemptedAt,
      statusCode,
      success,
      durationMs,
      errorMessage,
      attemptNumber,
    });
  }

  /**
   * Send request with retries
   * Returns HTTP status code on success, throws on all failures
   */
  private static async sendWithRetry(
    sub: any,
    event: string,
    payload: object,
  ): Promise<number> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      const attemptStart = Date.now();
      const attemptedAtSec = Math.floor(attemptStart / 1000);
      let statusCode: number | null = null;
      let errorMessage: string | null = null;
      let attemptSuccess = false;

      try {
        statusCode = await this.sendRequest(sub, event, payload);
        const durationMs = Date.now() - attemptStart;

        // Success on 2xx
        if (statusCode >= 200 && statusCode < 300) {
          await this.recordAttempt(
            sub.id,
            event,
            attempt + 1,
            attemptedAtSec,
            durationMs,
            true,
            statusCode,
            null,
          );
          return statusCode;
        }

        // 4xx: non-retryable, record and throw
        if (statusCode >= 400 && statusCode < 500) {
          errorMessage = `HTTP ${statusCode}: client error`;
          await this.recordAttempt(
            sub.id,
            event,
            attempt + 1,
            attemptedAtSec,
            durationMs,
            false,
            statusCode,
            errorMessage,
          );
          throw new Error(errorMessage);
        }

        // 5xx: record and continue to retry
        errorMessage = `HTTP ${statusCode}: server error`;
        await this.recordAttempt(
          sub.id,
          event,
          attempt + 1,
          attemptedAtSec,
          durationMs,
          false,
          statusCode,
          errorMessage,
        );
        lastError = new Error(errorMessage);
      } catch (error) {
        const durationMs = Date.now() - attemptStart;
        errorMessage = (error as Error).message;

        // Only record if we haven't already (i.e., not from 4xx/5xx handling above)
        if (statusCode === null) {
          await this.recordAttempt(
            sub.id,
            event,
            attempt + 1,
            attemptedAtSec,
            durationMs,
            false,
            null,
            errorMessage,
          );
        }

        lastError = error as Error;
      }

      // Wait before retry
      if (attempt < RETRY_DELAYS.length - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }

    // All retries exhausted
    throw lastError || new Error("Unknown error");
  }

  /**
   * Send a single HTTP request
   */
  private static async sendRequest(
    sub: any,
    event: string,
    payload: object,
  ): Promise<number> {
    const bodyString = JSON.stringify(payload);

    // Create HMAC signature
    const signature = crypto
      .createHmac("sha256", sub.secret)
      .update(bodyString)
      .digest("hex");

    const response = await fetch(sub.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SEO-Event": event,
        "X-SEO-Signature": `sha256=${signature}`,
        "User-Agent": "SEO-Content-System/1.0",
      },
      body: bodyString,
    });

    return response.status;
  }
}

// Cleanup rate limit timestamps every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of dispatchTimestamps.entries()) {
    const recent = timestamps.filter((t) => now - t < DISPATCH_WINDOW_MS);
    if (recent.length === 0) {
      dispatchTimestamps.delete(userId);
    } else {
      dispatchTimestamps.set(userId, recent);
    }
  }
}, 10 * 60_000);
