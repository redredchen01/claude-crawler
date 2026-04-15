import { getDatabase } from "../db/client";
import { webhooks, webhookAttempts } from "../db/schema";
import { eq, desc, count, sql, and } from "drizzle-orm";

export class WebhookRepository {
  /**
   * Create webhook
   */
  async createWebhook(data: {
    id: string;
    userId: number;
    url: string;
    events: string;
    filters?: any;
    isActive?: boolean;
  }) {
    const db = getDatabase();
    const result = await db.insert(webhooks).values(data).returning();
    return result[0];
  }

  /**
   * Get webhook by ID
   */
  async getWebhook(webhookId: string) {
    const db = getDatabase();
    const result = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, webhookId))
      .limit(1);
    return result[0] || null;
  }

  /**
   * Get all webhooks for user
   */
  async getUserWebhooks(userId: number) {
    const db = getDatabase();
    const result = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.userId, userId));
    return result;
  }

  /**
   * Get all active webhooks
   */
  async getActiveWebhooks() {
    const db = getDatabase();
    const result = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.isActive, true));
    return result;
  }

  /**
   * Update webhook
   */
  async updateWebhook(webhookId: string, data: Partial<any>) {
    const db = getDatabase();
    const result = await db
      .update(webhooks)
      .set(data)
      .where(eq(webhooks.id, webhookId))
      .returning();
    return result[0];
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(webhookId: string) {
    const db = getDatabase();
    await db.delete(webhooks).where(eq(webhooks.id, webhookId));
    return true;
  }

  /**
   * Record webhook delivery attempt
   */
  async recordAttempt(data: {
    webhookId: string;
    eventName: string;
    status: "success" | "failed";
    statusCode?: number;
    errorMessage?: string;
    attemptNumber: number;
    payload?: any;
  }) {
    const db = getDatabase();
    const result = await db.insert(webhookAttempts).values(data).returning();
    return result[0];
  }

  /**
   * Get webhook attempts
   */
  async getAttempts(webhookId: string, limit: number = 50) {
    const db = getDatabase();
    const result = await db
      .select()
      .from(webhookAttempts)
      .where(eq(webhookAttempts.webhookId, webhookId))
      .orderBy(desc(webhookAttempts.createdAt))
      .limit(limit);
    return result;
  }

  /**
   * Get delivery statistics
   */
  async getStats(webhookId: string) {
    const db = getDatabase();

    // Get total count
    const totalResult = await db
      .select({ total: count() })
      .from(webhookAttempts)
      .where(eq(webhookAttempts.webhookId, webhookId));

    const total = totalResult[0]?.total || 0;

    // Get successful count
    const successResult = await db
      .select({ successful: count() })
      .from(webhookAttempts)
      .where(
        and(
          eq(webhookAttempts.webhookId, webhookId),
          eq(webhookAttempts.status, "success"),
        ),
      );

    const successful = successResult[0]?.successful || 0;

    // Calculate failed and success rate
    const failed = total - successful;
    const successRate = total > 0 ? (successful / total) * 100 : 0;

    return {
      total,
      successful,
      failed,
      successRate,
    };
  }
}

export const webhookRepository = new WebhookRepository();
