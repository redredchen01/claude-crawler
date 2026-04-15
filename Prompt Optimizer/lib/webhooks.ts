import { prisma } from "@/lib/db";
import logger from "@/lib/logger";
import crypto from "crypto";
import { metricsCollector } from "@/lib/metrics";

interface RateLimitWarningPayload {
  userId: string;
  endpoint: "score" | "optimize-full";
  limit: number;
  remaining: number;
  resetAt: string;
  timestamp: string;
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 5000, 30000]; // 1s, 5s, 30s

/**
 * Check if webhook should be triggered based on remaining quota
 */
export function shouldTriggerWebhook(
  limit: number,
  remaining: number,
): boolean {
  return remaining <= Math.ceil(limit * 0.1); // < 10%
}

/**
 * Create HMAC signature for webhook verification
 */
export function createWebhookSignature(
  payload: string,
  secret: string,
): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify incoming webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expectedSignature = createWebhookSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}

/**
 * Queue webhook event for delivery
 */
export async function queueRateLimitWarning(
  userId: string,
  endpoint: "score" | "optimize-full",
  limit: number,
  remaining: number,
  resetAt: Date,
): Promise<void> {
  try {
    // Find active webhooks for this user
    const configs = await prisma.webhookConfig.findMany({
      where: {
        userId,
        active: true,
        OR: [
          { scope: "all" },
          { scope: endpoint === "score" ? "score" : "optimize-full" },
        ],
      },
    });

    if (configs.length === 0) {
      return; // No webhooks configured
    }

    const payload: RateLimitWarningPayload = {
      userId,
      endpoint,
      limit,
      remaining,
      resetAt: resetAt.toISOString(),
      timestamp: new Date().toISOString(),
    };

    // Create webhook events
    await Promise.all(
      configs.map((config) =>
        prisma.webhookEvent.create({
          data: {
            configId: config.id,
            eventType: "rate_limit_warning",
            payload: JSON.stringify(payload),
            attempts: 0,
          },
        }),
      ),
    );

    logger.info({
      userId,
      endpoint,
      webhooksQueued: configs.length,
      remaining,
      limit,
    });
  } catch (err: any) {
    logger.error(
      { userId, endpoint, error: err.message },
      "Failed to queue webhook event",
    );
  }
}

/**
 * Process pending webhook deliveries with transactional updates
 * Uses transactions to ensure all updates succeed or fail together
 * Limits concurrent HTTP requests to 10 to avoid overwhelming external services
 */
export async function processPendingWebhooks(): Promise<{
  sent: number;
  failed: number;
}> {
  try {
    // Get undelivered events
    const events = await prisma.webhookEvent.findMany({
      where: {
        deliveredAt: null,
        attempts: { lt: MAX_RETRY_ATTEMPTS },
      },
      include: {
        config: true,
      },
      take: 100, // Process in batches
    });

    if (events.length === 0) {
      return { sent: 0, failed: 0 };
    }

    // Process all events in parallel with concurrency limit
    const maxConcurrent = 10;
    const results: Array<{
      sent: number;
      failed: number;
      updates: Array<{
        id: string;
        deliveredAt?: Date;
        attempts: number;
        lastError?: string;
      }>;
    }> = [];

    for (let i = 0; i < events.length; i += maxConcurrent) {
      const chunk = events.slice(i, i + maxConcurrent);

      const chunkResults = await Promise.allSettled(
        chunk.map(async (event) => {
          const shouldRetry = event.attempts < MAX_RETRY_ATTEMPTS;
          const delay =
            event.attempts > 0
              ? RETRY_DELAYS_MS[
                  Math.min(event.attempts - 1, RETRY_DELAYS_MS.length - 1)
                ]
              : 0;

          // Check if we should retry (wait for delay)
          const createdTime = event.createdAt.getTime();
          const now = Date.now();
          const elapsedMs = now - createdTime;

          if (elapsedMs < delay) {
            return { sent: 0, failed: 0, updates: [] }; // Not ready to retry yet
          }

          try {
            const signature = createWebhookSignature(
              event.payload,
              event.config.secret,
            );

            const response = await fetch(event.config.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Webhook-Signature": signature,
                "X-Webhook-Event": event.eventType,
              },
              body: event.payload,
              timeout: parseInt(process.env.WEBHOOK_TIMEOUT_MS || "5000", 10),
            });

            if (response.ok) {
              // Success
              metricsCollector.recordWebhookDelivery(true);
              logger.info(
                { eventId: event.id, configId: event.config.id },
                "Webhook delivered",
              );
              return {
                sent: 1,
                failed: 0,
                updates: [
                  {
                    id: event.id,
                    deliveredAt: new Date(),
                    attempts: event.attempts + 1,
                  },
                ],
              };
            } else if (shouldRetry) {
              // Retry on non-2xx
              return {
                sent: 0,
                failed: 0,
                updates: [
                  {
                    id: event.id,
                    attempts: event.attempts + 1,
                    lastError: `HTTP ${response.status}`,
                  },
                ],
              };
            } else {
              // Max retries exceeded
              metricsCollector.recordWebhookDelivery(false);
              logger.warn(
                { eventId: event.id, status: response.status },
                "Webhook delivery failed after retries",
              );
              return {
                sent: 0,
                failed: 1,
                updates: [
                  {
                    id: event.id,
                    attempts: event.attempts + 1,
                    lastError: `HTTP ${response.status} (max retries)`,
                  },
                ],
              };
            }
          } catch (err: any) {
            if (shouldRetry) {
              return {
                sent: 0,
                failed: 0,
                updates: [
                  {
                    id: event.id,
                    attempts: event.attempts + 1,
                    lastError: err.message,
                  },
                ],
              };
            } else {
              metricsCollector.recordWebhookDelivery(false);
              logger.warn(
                { eventId: event.id, error: err.message },
                "Webhook delivery error",
              );
              return {
                sent: 0,
                failed: 1,
                updates: [
                  {
                    id: event.id,
                    attempts: event.attempts + 1,
                    lastError: `${err.message} (max retries)`,
                  },
                ],
              };
            }
          }
        }),
      );

      // Process results and collect updates
      let chunkSent = 0;
      let chunkFailed = 0;
      const updates: Array<{
        id: string;
        deliveredAt?: Date;
        attempts: number;
        lastError?: string;
      }> = [];

      chunkResults.forEach((result) => {
        if (result.status === "fulfilled") {
          chunkSent += result.value.sent;
          chunkFailed += result.value.failed;
          updates.push(...result.value.updates);
        }
      });

      // Apply all updates in a single transaction
      if (updates.length > 0) {
        await prisma.$transaction(
          updates.map((update) =>
            prisma.webhookEvent.update({
              where: { id: update.id },
              data: {
                deliveredAt: update.deliveredAt,
                attempts: update.attempts,
                lastError: update.lastError,
              },
            }),
          ),
        );
      }

      results.push({
        sent: chunkSent,
        failed: chunkFailed,
        updates,
      });
    }

    // Aggregate all results
    const totalSent = results.reduce((acc, r) => acc + r.sent, 0);
    const totalFailed = results.reduce((acc, r) => acc + r.failed, 0);

    return { sent: totalSent, failed: totalFailed };
  } catch (err: any) {
    logger.error({ error: err.message }, "Failed to process webhooks");
    return { sent: 0, failed: 0 };
  }
}

/**
 * Get webhook stats for monitoring
 */
export async function getWebhookStats(userId?: string): Promise<{
  total: number;
  delivered: number;
  pending: number;
  failed: number;
  successRate: number;
}> {
  const where = userId ? { config: { userId } } : {};

  const [total, delivered, pending, failed] = await Promise.all([
    prisma.webhookEvent.count({ where }),
    prisma.webhookEvent.count({
      where: { ...where, deliveredAt: { not: null } },
    }),
    prisma.webhookEvent.count({
      where: {
        ...where,
        deliveredAt: null,
        attempts: { lt: MAX_RETRY_ATTEMPTS },
      },
    }),
    prisma.webhookEvent.count({
      where: {
        ...where,
        deliveredAt: null,
        attempts: { gte: MAX_RETRY_ATTEMPTS },
      },
    }),
  ]);

  const successRate = total > 0 ? (delivered / total) * 100 : 0;

  return {
    total,
    delivered,
    pending,
    failed,
    successRate,
  };
}
