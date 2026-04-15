import { prisma } from "@/lib/db";
import { createWebhookSignature } from "@/lib/webhooks";
import logger from "@/lib/logger";
import crypto from "crypto";

export interface WebhookConfig {
  id: string;
  url: string;
  scope: string;
  active: boolean;
  createdAt: Date;
  lastTestAt?: Date;
  testStatus?: "success" | "failure";
}

/**
 * Create a new webhook configuration
 */
export async function createWebhook(
  userId: string,
  url: string,
  scope: "score" | "optimize-full" | "all" = "all",
  teamId?: string,
): Promise<WebhookConfig> {
  // Validate URL
  try {
    new URL(url);
  } catch {
    throw new Error("Invalid webhook URL");
  }

  // Validate scope
  if (!["score", "optimize-full", "all"].includes(scope)) {
    throw new Error("Invalid scope");
  }

  const secret = crypto.randomBytes(32).toString("hex");

  const webhook = await prisma.webhookConfig.create({
    data: {
      userId,
      teamId,
      url,
      scope,
      secret,
      active: true,
    },
    select: {
      id: true,
      url: true,
      scope: true,
      active: true,
      createdAt: true,
    },
  });

  logger.info({ userId, webhookId: webhook.id }, "Webhook created");

  return webhook;
}

/**
 * Update webhook configuration
 */
export async function updateWebhook(
  webhookId: string,
  userId: string,
  updates: {
    url?: string;
    scope?: string;
    active?: boolean;
  },
): Promise<WebhookConfig> {
  const webhook = await prisma.webhookConfig.findUnique({
    where: { id: webhookId },
  });

  if (!webhook || webhook.userId !== userId) {
    throw new Error("Webhook not found or access denied");
  }

  // Validate URL if provided
  if (updates.url) {
    try {
      new URL(updates.url);
    } catch {
      throw new Error("Invalid webhook URL");
    }
  }

  // Validate scope if provided
  if (
    updates.scope &&
    !["score", "optimize-full", "all"].includes(updates.scope)
  ) {
    throw new Error("Invalid scope");
  }

  const updated = await prisma.webhookConfig.update({
    where: { id: webhookId },
    data: updates,
    select: {
      id: true,
      url: true,
      scope: true,
      active: true,
      createdAt: true,
    },
  });

  logger.info({ webhookId, userId }, "Webhook updated");

  return updated;
}

/**
 * Test webhook by sending a test event
 */
export async function testWebhook(
  webhookId: string,
  userId: string,
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const webhook = await prisma.webhookConfig.findUnique({
    where: { id: webhookId },
  });

  if (!webhook || webhook.userId !== userId) {
    throw new Error("Webhook not found or access denied");
  }

  const testPayload = {
    event: "test",
    timestamp: new Date().toISOString(),
    message: "This is a test webhook delivery",
  };

  const payloadStr = JSON.stringify(testPayload);
  const signature = createWebhookSignature(payloadStr, webhook.secret);

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": "test",
      },
      body: payloadStr,
      timeout: 5000,
    });

    const success = response.ok;

    // Record test result
    await prisma.webhookConfig.update({
      where: { id: webhookId },
      data: {
        // Note: lastTestAt and testStatus would need to be added to the schema
      },
    });

    logger.info(
      { webhookId, success, statusCode: response.status },
      "Webhook test completed",
    );

    return {
      success,
      statusCode: response.status,
    };
  } catch (error: any) {
    logger.error({ webhookId, error: error.message }, "Webhook test failed");

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Rotate webhook secret (for security)
 */
export async function rotateWebhookSecret(
  webhookId: string,
  userId: string,
): Promise<string> {
  const webhook = await prisma.webhookConfig.findUnique({
    where: { id: webhookId },
  });

  if (!webhook || webhook.userId !== userId) {
    throw new Error("Webhook not found or access denied");
  }

  const newSecret = crypto.randomBytes(32).toString("hex");

  await prisma.webhookConfig.update({
    where: { id: webhookId },
    data: { secret: newSecret },
  });

  logger.info({ webhookId, userId }, "Webhook secret rotated");

  return newSecret;
}

/**
 * List webhooks for user
 */
export async function listWebhooks(
  userId: string,
  teamId?: string,
): Promise<WebhookConfig[]> {
  const webhooks = await prisma.webhookConfig.findMany({
    where: {
      userId,
      ...(teamId && { teamId }),
    },
    select: {
      id: true,
      url: true,
      scope: true,
      active: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return webhooks;
}

/**
 * Delete webhook
 */
export async function deleteWebhook(
  webhookId: string,
  userId: string,
): Promise<void> {
  const webhook = await prisma.webhookConfig.findUnique({
    where: { id: webhookId },
  });

  if (!webhook || webhook.userId !== userId) {
    throw new Error("Webhook not found or access denied");
  }

  // Delete associated events
  await prisma.webhookEvent.deleteMany({
    where: { configId: webhookId },
  });

  // Delete webhook
  await prisma.webhookConfig.delete({
    where: { id: webhookId },
  });

  logger.info({ webhookId, userId }, "Webhook deleted");
}

/**
 * Get webhook event history
 */
export async function getWebhookEvents(
  webhookId: string,
  userId: string,
  limit: number = 50,
  offset: number = 0,
) {
  const webhook = await prisma.webhookConfig.findUnique({
    where: { id: webhookId },
  });

  if (!webhook || webhook.userId !== userId) {
    throw new Error("Webhook not found or access denied");
  }

  const [events, total] = await Promise.all([
    prisma.webhookEvent.findMany({
      where: { configId: webhookId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.webhookEvent.count({
      where: { configId: webhookId },
    }),
  ]);

  return {
    events,
    total,
    limit,
    offset,
  };
}
