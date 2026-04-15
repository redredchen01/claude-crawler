import { prisma } from "@/lib/db";
import crypto from "crypto";

export interface ApiKeyValidation {
  valid: boolean;
  userId?: string;
  endpoints?: string;
}

/**
 * Generate a new API key
 */
export async function generateApiKey(
  userId: string,
  endpoints: string = "all",
): Promise<string> {
  const key = crypto.randomBytes(32).toString("hex");

  await prisma.apiKey.create({
    data: {
      userId,
      key,
      endpoints: JSON.stringify([endpoints]),
      active: true,
    },
  });

  return key;
}

/**
 * Validate an API key
 */
export async function validateApiKey(
  key: string,
  requiredEndpoint?: "score" | "optimize-full",
): Promise<ApiKeyValidation> {
  const apiKey = await prisma.apiKey.findUnique({
    where: { key },
  });

  if (!apiKey || !apiKey.active) {
    return { valid: false };
  }

  // Check endpoints
  if (requiredEndpoint && apiKey.endpoints) {
    const endpoints = JSON.parse(apiKey.endpoints);
    if (!endpoints.includes("all") && !endpoints.includes(requiredEndpoint)) {
      return { valid: false };
    }
  }

  // Update lastUsed
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsed: new Date() },
  });

  return {
    valid: true,
    userId: apiKey.userId,
    endpoints: apiKey.endpoints || undefined,
  };
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(
  keyId: string,
  userId: string,
): Promise<boolean> {
  const key = await prisma.apiKey.findUnique({
    where: { id: keyId },
  });

  if (!key || key.userId !== userId) {
    return false;
  }

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { active: false },
  });

  return true;
}

/**
 * List user's API keys
 */
export async function listApiKeys(userId: string) {
  return prisma.apiKey.findMany({
    where: { userId },
    select: {
      id: true,
      endpoints: true,
      active: true,
      createdAt: true,
      lastUsed: true,
    },
  });
}
