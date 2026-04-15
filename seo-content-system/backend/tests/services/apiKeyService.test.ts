/**
 * API Key Service Tests
 * 6 scenarios: create, validate, list, revoke, inactive, hash mismatch
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../../src/db/index.js";
import { apiKeys, users } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";
import { ApiKeyService } from "../../src/services/apiKeyService.js";
import crypto from "crypto";

describe("ApiKeyService", () => {
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
  });

  afterEach(async () => {
    // Clean up
    await db.delete(apiKeys).where(eq(apiKeys.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("Scenario 1: createKey returns plaintext key and prefix", async () => {
    const result = await ApiKeyService.createKey(
      userId,
      "Test Key",
      ["read", "write"]
    );

    expect(result.apiKey).toMatch(/^sk-/);
    expect(result.prefix).toEqual(result.apiKey.substring(0, 12));
    expect(result.id).toMatch(/^key_/);
  });

  it("Scenario 2: validateKey with valid key returns userId and scopes", async () => {
    const { apiKey } = await ApiKeyService.createKey(
      userId,
      "Test Key",
      ["read", "write", "export"]
    );

    const result = await ApiKeyService.validateKey(apiKey);

    expect(result).not.toBeNull();
    expect(result?.userId).toBe(userId);
    expect(result?.scopes).toEqual(["read", "write", "export"]);
  });

  it("Scenario 3: validateKey with invalid key returns null", async () => {
    const result = await ApiKeyService.validateKey("sk-invalid_key_1234567890");

    expect(result).toBeNull();
  });

  it("Scenario 4: validateKey with revoked key returns null", async () => {
    const { apiKey, id } = await ApiKeyService.createKey(
      userId,
      "Test Key",
      ["read"]
    );

    // Revoke the key
    await ApiKeyService.revokeKey(id, userId);

    // Try to validate
    const result = await ApiKeyService.validateKey(apiKey);

    expect(result).toBeNull();
  });

  it("Scenario 5: listKeys response does not contain keyHash", async () => {
    await ApiKeyService.createKey(userId, "Key 1", ["read"]);
    await ApiKeyService.createKey(userId, "Key 2", ["write"]);

    const keys = await ApiKeyService.listKeys(userId);

    expect(keys).toHaveLength(2);
    keys.forEach((key) => {
      expect(key).not.toHaveProperty("keyHash");
      expect(key.keyPrefix).toMatch(/^sk-/);
      expect(key.scopes).toBeInstanceOf(Array);
    });
  });

  it("Scenario 6: SHA-256 hash mismatch fails validation", async () => {
    const { apiKey } = await ApiKeyService.createKey(
      userId,
      "Test Key",
      ["read"]
    );

    // Try to validate with a modified key
    const modifiedKey = apiKey.substring(0, apiKey.length - 1) + "X";
    const result = await ApiKeyService.validateKey(modifiedKey);

    expect(result).toBeNull();
  });

  it("updates lastUsedAt on validation", async () => {
    const { apiKey, id } = await ApiKeyService.createKey(
      userId,
      "Test Key",
      ["read"]
    );

    const before = Math.floor(Date.now() / 1000);
    await ApiKeyService.validateKey(apiKey);
    const after = Math.floor(Date.now() / 1000);

    const keys = await ApiKeyService.listKeys(userId);
    const key = keys.find((k) => k.id === id);

    expect(key?.lastUsedAt).toBeDefined();
    expect(key!.lastUsedAt!).toBeGreaterThanOrEqual(before);
    expect(key!.lastUsedAt!).toBeLessThanOrEqual(after);
  });
});
