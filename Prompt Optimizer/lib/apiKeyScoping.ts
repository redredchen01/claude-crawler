import { prisma } from "@/lib/db";
import logger from "@/lib/logger";
import crypto from "crypto";

export enum ApiKeyScope {
  // Full access
  ALL = "all",

  // Endpoint-specific
  SCORE = "score",
  OPTIMIZE_FULL = "optimize-full",
  ANALYTICS = "analytics",

  // Resource-specific
  TEAM_ADMIN = "team:admin",
  TEAM_MEMBER = "team:member",
  API_KEYS = "api-keys",
  WEBHOOKS = "webhooks",
}

export interface ApiKeyPermission {
  scope: ApiKeyScope;
  endpoints?: string[]; // Specific endpoints this scope allows
  resources?: string[]; // Specific resource IDs (team IDs, etc.)
  readonly: boolean; // If true, only read operations allowed
}

export interface ApiKeyConfig {
  id: string;
  key: string;
  teamId?: string;
  userId: string;
  scopes: ApiKeyScope[];
  ipWhitelist?: string[]; // IP addresses allowed to use this key
  expiresAt?: Date;
  active: boolean;
  rateLimit?: {
    requestsPerHour: number;
    tokensPerHour?: number;
  };
  createdAt: Date;
  lastUsedAt?: Date;
}

/**
 * Generate a new API key
 */
export async function generateApiKey(
  userId: string,
  teamId: string | undefined,
  scopes: ApiKeyScope[],
  options?: {
    ipWhitelist?: string[];
    expiresAt?: Date;
    rateLimit?: { requestsPerHour: number; tokensPerHour?: number };
  },
): Promise<string> {
  // Generate random key
  const keyBuffer = crypto.randomBytes(32);
  const key = keyBuffer.toString("hex");

  // Hash key for storage
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");

  await prisma.apiKey.create({
    data: {
      key: keyHash,
      userId,
      teamId,
      ipWhitelist: options?.ipWhitelist
        ? JSON.stringify(options.ipWhitelist)
        : null,
      endpoints: JSON.stringify(scopes),
      expiresAt: options?.expiresAt,
      readonly: scopes.some(
        (s) => s === ApiKeyScope.SCORE || s === ApiKeyScope.ANALYTICS,
      ),
      active: true,
    },
  });

  logger.info({ userId, teamId, scopes }, "API key generated");

  return key;
}

/**
 * Validate API key and get permissions
 */
export async function validateApiKey(
  key: string,
  ipAddress?: string,
): Promise<ApiKeyConfig | null> {
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");

  const apiKey = await prisma.apiKey.findUnique({
    where: { key: keyHash },
    select: {
      id: true,
      key: true,
      userId: true,
      teamId: true,
      endpoints: true,
      ipWhitelist: true,
      expiresAt: true,
      active: true,
      readonly: true,
      createdAt: true,
      lastUsed: true,
    },
  });

  if (!apiKey) {
    logger.warn({ keyHash }, "API key not found");
    return null;
  }

  if (!apiKey.active) {
    logger.warn({ keyHash }, "API key is inactive");
    return null;
  }

  // Check expiration
  if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
    logger.warn({ keyHash }, "API key expired");
    return null;
  }

  // Check IP whitelist
  if (apiKey.ipWhitelist && ipAddress) {
    const whitelist = JSON.parse(apiKey.ipWhitelist);
    if (!whitelist.includes(ipAddress)) {
      logger.warn({ keyHash, ipAddress }, "IP address not whitelisted");
      return null;
    }
  }

  return {
    id: apiKey.id,
    key: apiKey.key,
    userId: apiKey.userId,
    teamId: apiKey.teamId || undefined,
    scopes: JSON.parse(apiKey.endpoints || "[]"),
    ipWhitelist: apiKey.ipWhitelist
      ? JSON.parse(apiKey.ipWhitelist)
      : undefined,
    expiresAt: apiKey.expiresAt || undefined,
    active: apiKey.active,
    createdAt: apiKey.createdAt,
    lastUsedAt: apiKey.lastUsed || undefined,
  };
}

/**
 * Check if API key has required scope
 */
export function hasScopeAccess(
  config: ApiKeyConfig,
  requiredScope: ApiKeyScope,
): boolean {
  // ALL scope has access to everything
  if (config.scopes.includes(ApiKeyScope.ALL)) {
    return true;
  }

  // Check exact scope match
  if (config.scopes.includes(requiredScope)) {
    return true;
  }

  // Team:admin has access to team:member operations
  if (
    requiredScope === ApiKeyScope.TEAM_MEMBER &&
    config.scopes.includes(ApiKeyScope.TEAM_ADMIN)
  ) {
    return true;
  }

  return false;
}

/**
 * Rotate API key (generate new, invalidate old)
 */
export async function rotateApiKey(
  oldKeyId: string,
  userId: string,
): Promise<string> {
  const oldKey = await prisma.apiKey.findUnique({
    where: { id: oldKeyId },
    select: {
      userId: true,
      teamId: true,
      endpoints: true,
      ipWhitelist: true,
      expiresAt: true,
    },
  });

  if (!oldKey || oldKey.userId !== userId) {
    throw new Error("API key not found or unauthorized");
  }

  // Deactivate old key
  await prisma.apiKey.update({
    where: { id: oldKeyId },
    data: { active: false },
  });

  // Generate new key with same configuration
  const scopes = JSON.parse(oldKey.endpoints || "[]");
  const ipWhitelist = oldKey.ipWhitelist
    ? JSON.parse(oldKey.ipWhitelist)
    : undefined;

  const newKey = await generateApiKey(
    userId,
    oldKey.teamId || undefined,
    scopes,
    {
      ipWhitelist,
      expiresAt: oldKey.expiresAt || undefined,
    },
  );

  logger.info({ oldKeyId, userId }, "API key rotated");

  return newKey;
}

/**
 * Revoke API key
 */
export async function revokeApiKey(
  keyId: string,
  userId: string,
): Promise<void> {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: keyId },
    select: { userId: true },
  });

  if (!apiKey || apiKey.userId !== userId) {
    throw new Error("API key not found or unauthorized");
  }

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { active: false },
  });

  logger.info({ keyId, userId }, "API key revoked");
}

/**
 * Update API key IP whitelist
 */
export async function updateApiKeyIpWhitelist(
  keyId: string,
  userId: string,
  ips: string[],
): Promise<void> {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: keyId },
    select: { userId: true },
  });

  if (!apiKey || apiKey.userId !== userId) {
    throw new Error("API key not found or unauthorized");
  }

  await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      ipWhitelist: JSON.stringify(ips),
    },
  });

  logger.info({ keyId, userId }, "API key IP whitelist updated");
}

/**
 * Update API key record on use for tracking
 */
export async function recordApiKeyUsage(keyId: string): Promise<void> {
  try {
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { lastUsed: new Date() },
    });
  } catch (error) {
    // Ignore errors - this is non-critical for tracking
    logger.debug({ keyId }, "Failed to record API key usage");
  }
}

/**
 * List API keys for user
 */
export async function listApiKeys(
  userId: string,
  teamId?: string,
): Promise<Omit<ApiKeyConfig, "key">[]> {
  const keys = await prisma.apiKey.findMany({
    where: {
      userId,
      ...(teamId && { teamId }),
    },
    select: {
      id: true,
      userId: true,
      teamId: true,
      endpoints: true,
      ipWhitelist: true,
      expiresAt: true,
      active: true,
      readonly: true,
      createdAt: true,
      lastUsed: true,
    },
  });

  return keys.map((k) => ({
    id: k.id,
    key: "", // Don't return actual key
    userId: k.userId,
    teamId: k.teamId || undefined,
    scopes: JSON.parse(k.endpoints || "[]"),
    ipWhitelist: k.ipWhitelist ? JSON.parse(k.ipWhitelist) : undefined,
    expiresAt: k.expiresAt || undefined,
    active: k.active,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsed || undefined,
  }));
}

/**
 * Revoke all API keys for user (account compromise scenario)
 */
export async function revokeAllApiKeys(userId: string): Promise<number> {
  const result = await prisma.apiKey.updateMany({
    where: { userId },
    data: { active: false },
  });

  logger.warn({ userId, revokedCount: result.count }, "All API keys revoked");

  return result.count;
}
