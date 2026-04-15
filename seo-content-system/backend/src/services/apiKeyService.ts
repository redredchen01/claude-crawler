/**
 * API Key Service
 * Manages API key creation, validation, and revocation
 */

import crypto from "crypto";
import { db } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { eq } from "drizzle-orm";

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: number;
  createdAt: number;
}

export class ApiKeyService {
  /**
   * Create a new API key
   * Returns plaintext key (only shown once) along with metadata
   */
  static async createKey(
    userId: string,
    name: string,
    scopes: string[]
  ): Promise<{ apiKey: string; id: string; prefix: string }> {
    const keyId = `key_${crypto.randomBytes(8).toString("hex")}`;

    // Generate key: sk- + 32 base58-encoded random bytes
    // Using base64url is simpler and equally secure as base58
    const randomBytes = crypto.randomBytes(24);
    const rawKey = `sk-${randomBytes.toString("base64url")}`;

    // Extract prefix: first 12 chars (sk- + 9 more)
    const keyPrefix = rawKey.substring(0, 12);

    // Hash the key with SHA-256
    const keyHash = crypto
      .createHash("sha256")
      .update(rawKey)
      .digest("hex");

    const now = Math.floor(Date.now() / 1000);

    // Insert into database
    await db.insert(apiKeys).values({
      id: keyId,
      userId,
      name,
      keyHash,
      keyPrefix,
      scopes: JSON.stringify(scopes),
      isActive: true,
      createdAt: now,
    });

    return {
      apiKey: rawKey,
      id: keyId,
      prefix: keyPrefix,
    };
  }

  /**
   * Validate an API key
   * Returns userId and scopes if valid, null otherwise
   */
  static async validateKey(
    rawKey: string
  ): Promise<{ userId: string; scopes: string[] } | null> {
    if (!rawKey.startsWith("sk-")) {
      return null;
    }

    // Hash the provided key
    const keyHash = crypto
      .createHash("sha256")
      .update(rawKey)
      .digest("hex");

    // Look up by hash
    const record = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyHash, keyHash),
    });

    if (!record || !record.isActive) {
      return null;
    }

    // Update lastUsedAt
    const now = Math.floor(Date.now() / 1000);
    await db
      .update(apiKeys)
      .set({ lastUsedAt: now })
      .where(eq(apiKeys.id, record.id));

    // Parse scopes
    const scopes = JSON.parse(record.scopes) as string[];

    return {
      userId: record.userId,
      scopes,
    };
  }

  /**
   * List all API keys for a user (excludes keyHash)
   */
  static async listKeys(userId: string): Promise<ApiKeyRecord[]> {
    const records = await db.query.apiKeys.findMany({
      where: eq(apiKeys.userId, userId),
    });

    return records.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      keyPrefix: r.keyPrefix,
      scopes: JSON.parse(r.scopes) as string[],
      isActive: r.isActive,
      lastUsedAt: r.lastUsedAt || undefined,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Revoke an API key
   */
  static async revokeKey(id: string, userId: string): Promise<void> {
    await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(eq(apiKeys.id, id));
  }
}
